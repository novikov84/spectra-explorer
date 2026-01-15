
import zipfile
import re
import io
import struct
import numpy as np
from typing import Dict, List, Optional, Tuple, Union
import logging


# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SpectrumType = str  # 'CW', 'T1', etc.

class Spectrum1D:
    def __init__(self, filename: str, type: SpectrumType, x_label: str, y_label: str, 
                 x_data: List[float], real_data: List[float], imag_data: List[float], parsed_params: dict = None):
        self.filename = filename
        self.type = type
        self.x_label = x_label
        self.y_label = y_label
        self.x_data = x_data
        self.real_data = real_data
        self.imag_data = imag_data
        self.parsed_params = parsed_params or {}

class Spectrum2D:
    def __init__(self, filename: str, type: SpectrumType, x_label: str, y_label: str,
                 x_data: List[float], y_data: List[float], z_data: List[List[float]], parsed_params: dict = None):
        self.filename = filename
        self.type = type
        self.x_label = x_label
        self.y_label = y_label
        self.x_data = x_data
        self.y_data = y_data
        self.z_data = z_data
        self.parsed_params = parsed_params or {}


def parse_dsc_text(text: str) -> Dict[str, str]:
    meta = {}
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith('*'):
            continue
        
        # "=" separated
        if '=' in trimmed:
            key, val = trimmed.split('=', 1)
            meta[key.strip().upper()] = val.strip()
            continue
            
        # Whitespace separated (tab or spaces)
        parts = re.split(r'\s+', trimmed, maxsplit=1)
        if len(parts) == 2:
            key, val = parts
            meta[key.strip().upper()] = val.strip()
            
    return meta

def get_int(meta: Dict[str, str], key: str, fallback=0) -> int:
    try:
        return int(float(meta.get(key.upper(), fallback)))
    except (ValueError, TypeError):
        return fallback

def get_float(meta: Dict[str, str], key: str, fallback=0.0) -> float:
    try:
        return float(meta.get(key.upper(), fallback))
    except (ValueError, TypeError):
        return fallback

def get_str(meta: Dict[str, str], key: str, fallback="") -> str:
    return meta.get(key.upper(), fallback)

def parse_params_from_name(raw_name: str) -> dict:
    base = re.sub(r'\.[^.]+$', '', raw_name)
    tokens = [t for t in base.split('_') if t]
    sample_name = tokens[0] if tokens else base
    
    params = {
        'sampleName': sample_name,
        'tokens': tokens,
        'temperatureK': None,
        'fieldG': None,
        'amplifierDb': None,
        'pulseWidth': None
    }
    
    for tok in tokens:
        lower = tok.lower()
        if m := re.match(r'(\d+(?:[p\.]\d+)?)k', lower):
            params['temperatureK'] = float(m.group(1).replace('p', '.'))
        if m := re.match(r'(\d+(?:[p\.]\d+)?)g', lower):
            params['fieldG'] = float(m.group(1).replace('p', '.'))
        if m := re.match(r'(?:hpa)?(\d+(?:[p\.]\d+)?)db', lower):
            params['amplifierDb'] = float(m.group(1).replace('p', '.'))
        elif m := re.match(r'hpa(\d+(?:[p\.]\d+)?)', lower):
            params['amplifierDb'] = float(m.group(1).replace('p', '.'))
        if m := re.match(r'p(\d+(?:[p\.]\d+)?)', lower):
            params['pulseWidth'] = float(m.group(1).replace('p', '.'))
        if m := re.match(r'sw(\d+(?:[p\.]\d+)?)', lower):
            params['spectralWidth'] = float(m.group(1).replace('p', '.'))
            
    return params

def infer_spectrum_type(name: str, meta: Dict[str, str], is_2d: bool) -> str:
    lower_name = name.lower()
    
    base_type = 'Unknown'
    if 'edfs' in lower_name: base_type = 'EDFS'
    elif 'rabi' in lower_name: base_type = 'Rabi'
    elif 't1' in lower_name: base_type = 'T1'
    elif 't2' in lower_name: base_type = 'T2'
    elif 'hyscore' in lower_name: base_type = 'HYSCORE'
    elif '2d' in lower_name: base_type = '2D'
    elif 'cw' in lower_name: base_type = 'CW'
    else:
        family = get_str(meta, 'EXPT', '')
        if 'CW' in family: base_type = 'CW'
        elif 'PULSED' in family: base_type = 'T1' # Default pulsed is T1-ish
    
    # Refine based on is_2d
    if is_2d:
        if base_type in ['T1', 'T2']:
             # "2D T1"
            return f"2D {base_type}"
        if base_type == 'Unknown':
            return '2D'
        if base_type == '2D':
            return '2D'
            
        # HYSCORE is intrinsically 2D.
        if base_type not in ['2D', 'HYSCORE']: 
             return f"2D {base_type}"
    else:
        # User uploaded a 1D slice (ypts=1) but named it "...2D..."
        # We must NOT return '2D' type or frontend crashes looking for zData
        if base_type == '2D':
            return 'CW' # Fallback to standard 1D view
        if '2D' in base_type:
             # Strip 2D prefix if present?
             return base_type.replace('2D', '').strip() or 'CW'

    return base_type

def axis_vector(meta: Dict[str, str], axis: str, points: int) -> List[float]:
    min_val = get_float(meta, f'{axis}MIN', None)
    width = get_float(meta, f'{axis}WID', None)
    
    if min_val is not None and width is not None:
        if points <= 1: return [min_val]
        step = width / (points - 1)
        return [min_val + i * step for i in range(points)]
        
    start = get_float(meta, f'{axis}STRT', None)
    stop = get_float(meta, f'{axis}STOP', None)
    
    if start is not None and stop is not None:
        if points <= 1: return [start]
        step = (stop - start) / (points - 1)
        return [start + i * step for i in range(points)]
        
    return list(range(points))

def normalize_x_for_time_type(x: List[float], type: str, label: str) -> List[float]:
    # Logic to zero-correct time axes if needed
    time_types = ['T1', 'T2', 'Rabi']
    is_time = any(u in label.lower() for u in ['time', 'tau', ' s', 'ms', 'us', 'ns'])
    
    # EDFS is Field Sweep, never normalize even if label says 'us' (common Bruker metadata issue)
    if type == 'EDFS':
        return x

    if type in time_types or is_time:
        if not x: return x
        min_val = min(x)
        if min_val != 0:
            return [v - min_val for v in x]
    return x

def parse_zip_archive(content: bytes) -> Tuple[str, List[Union[Spectrum1D, Spectrum2D]], int]:
    zf = zipfile.ZipFile(io.BytesIO(content))
    spectra = []
    sample_name = "Uploaded Sample"
    
    # 1. Look for metadata.json files (Simulated/Processed export format)
    # For now, sticking to BES3T logic as that's the core request, 
    # but the frontend also handled metadata.json. Let's prioritize .DSC for now
    # as the user requested "move all processing to backend" implying the raw data parsing.
    
    dsc_files = [f for f in zf.namelist() if f.lower().endswith('.dsc')]
    
    for dsc_path in dsc_files:
        try:
            # Read DSC
            dsc_content = zf.read(dsc_path).decode('utf-8', errors='ignore')
            meta = parse_dsc_text(dsc_content)
            
            # Find matching DTA
            base_name = dsc_path[:-4] # strip .dsc
            dta_path = None
            
            # Try exact replacement
            candidates = [f'{base_name}.DTA', f'{base_name}.dta']
            for c in candidates:
                if c in zf.namelist():
                    dta_path = c
                    break
            
            if not dta_path:
                # Fallback: search in same folder
                folder = '/'.join(dsc_path.split('/')[:-1])
                filename = dsc_path.split('/')[-1][:-4]
                for f in zf.namelist():
                    if f.lower().endswith('.dta') and filename.lower() in f.lower():
                        # Simple check, might be too loose
                        dta_path = f
                        break
            
            if not dta_path:
                logger.warning(f"No DTA found for {dsc_path}")
                continue
                
            # Parse Binary Data
            dta_bytes = zf.read(dta_path)
            
            xpts = get_int(meta, 'XPTS')
            ypts = get_int(meta, 'YPTS', 1)
            total_points_per_input = xpts * ypts
            
            # Metadata descriptors can be comma-separated lists for multiple datasets (channels)
            ikkf_list = get_str(meta, 'IKKF', 'CPLX').split(',')
            irfmt_list = get_str(meta, 'IRFMT', 'F').split(',')
            
            # Normalize list lengths
            num_datasets = max(len(ikkf_list), len(irfmt_list))
            if len(ikkf_list) < num_datasets: ikkf_list += [ikkf_list[-1]] * (num_datasets - len(ikkf_list))
            if len(irfmt_list) < num_datasets: irfmt_list += [irfmt_list[-1]] * (num_datasets - len(irfmt_list))
            
            # 1. Determine Structure and Total Expected Size
            dataset_configs = []
            total_bytes_expected = 0
            
            bseq = get_str(meta, 'BSEQ', 'BIG')
            endian = '>' if 'BIG' in bseq else '<'
            
            for i in range(num_datasets):
                is_cplx = 'CPLX' in ikkf_list[i] or 'IIFMT' in meta
                fmt_char = irfmt_list[i]
                
                if 'D' in fmt_char:
                    dtype = np.float64
                    item_size = 8
                elif 'I' in fmt_char:
                    dtype = np.int32
                    item_size = 4
                else:
                    dtype = np.float32 # 'F'
                    item_size = 4
                    
                points = total_points_per_input
                components = 2 if is_cplx else 1
                size_bytes = points * components * item_size
                
                dataset_configs.append({
                    'is_complex': is_cplx,
                    'dtype': dtype,
                    'endian': endian,
                    'size_bytes': size_bytes,
                    'shape': points * components
                })
                total_bytes_expected += size_bytes

            if len(dta_bytes) != total_bytes_expected:
                # Fallback: sometimes XPTS/YPTS are wrong, or extra padding?
                # But strict check prevents garbage.
                # Special check: if only 1 dataset expected but size is double, assume implicit 2nd channel?
                # (User Case handled by proper IKKF parsing hopefully)
                logger.warning(f"Size mismatch {dsc_path}: got {len(dta_bytes)}, expected {total_bytes_expected}")
                continue
                
            # 2. Extract Data
            current_offset = 0
            x_axis_label_base = f"{get_str(meta, 'XNAM')} ({get_str(meta, 'XUNI')})"
            
            # Common axes
            x_vector = axis_vector(meta, 'X', xpts)
            # Apply corrections once
            # Note: We need infer_spectrum_type first.
            spectrum_type = infer_spectrum_type(base_name, meta, ypts > 1)
            parsed_params = parse_params_from_name(base_name.split('/')[-1])
            x_vector = normalize_x_for_time_type(x_vector, spectrum_type, x_axis_label_base)
            
            # EDFS Correction Logic (Duplicated from original, but clean)
            x_lower = x_axis_label_base.lower()
            is_mag_field = 'gauss' in x_lower or 'field' in x_lower or 'G' in x_axis_label_base or spectrum_type == 'EDFS'
            if is_mag_field and x_vector:
                 max_val = max(x_vector)
                 if '(T)' in x_axis_label_base or '(Tesla)' in x_axis_label_base:
                     x_vector = [v * 10000 for v in x_vector]
                     x_axis_label_base = "Magnetic Field (G)"
                 elif '(mT)' in x_axis_label_base:
                     x_vector = [v * 10 for v in x_vector]
                     x_axis_label_base = "Magnetic Field (G)"
                 elif '(kG)' in x_axis_label_base or '(kg)' in x_lower:
                     x_vector = [v * 1000 for v in x_vector]
                     x_axis_label_base = "Magnetic Field (G)"
                 elif spectrum_type == 'EDFS' and max_val <= 20: 
                     x_vector = [v * 1000 for v in x_vector]
                     x_axis_label_base = "Magnetic Field (G)"
                     logger.info(f"Applied EDFS Correction for {base_name}")

            
            # Match CSV layout: [R1, I1, R2, I2] (Stride 4)
            # R1 (Index 0) = Real Signal (Matches CSV Col 2)
            # R2 (Index 2) = Imag Signal (Matches CSV Col 4)
            total_points_per_input = xpts * ypts
            expected_total_doubles = total_points_per_input * 4
            
            # Helper to check complexity roughly (though we should check IKKF per dataset)
            # Typically for CW like this, IKKF is CPLX,CPLX
            is_complex_global = 'CPLX' in get_str(meta, 'IKKF', 'REAL')
            
            # Check size match for Quad-Interleave
            is_quad_interleaved = (len(dta_bytes) // 8 == expected_total_doubles)
            
            parsed_quad = False
            
            if is_quad_interleaved and is_complex_global:
                logger.info(f"Detected Quad-Interleaved Data (4 vals/point). Parsing as single merged spectrum.")
                try:
                    # We assume Big Endian Double as verified by CSV match
                    # Parse ALL values as one flat array
                    all_vals = struct.unpack(f">{total_points_per_input*4}d", dta_bytes)
                    all_vals = np.array(all_vals)
                    
                    real_data = all_vals[0::4] # Index 0
                    imag_data = all_vals[2::4] # Index 2
                    
                    filename_only = base_name.split('/')[-1]
                    y_axis_label = f"{get_str(meta, 'YNAM')} ({get_str(meta, 'YUNI')})"
                    
                    if ypts > 1:
                        # 2D Spectrum
                        y_vector = axis_vector(meta, 'Y', ypts)
                        z_data = []
                        # Reshape flat real_data into rows (Standard raster order)
                        for k in range(ypts):
                            start = k * xpts
                            end = start + xpts
                            z_data.append(real_data[start:end].tolist())
                        
                        spec = Spectrum2D(
                            filename=filename_only,
                            type=spectrum_type,
                            x_label=x_axis_label_base,
                            y_label=y_axis_label,
                            x_data=x_vector,
                            y_data=y_vector,
                            z_data=z_data,
                            parsed_params=parsed_params
                        )
                    else:
                        spec = Spectrum1D(
                            filename=filename_only,
                            type=spectrum_type,
                            x_label=x_axis_label_base,
                            y_label=y_axis_label,
                            x_data=x_vector,
                            real_data=real_data.tolist(),
                            imag_data=imag_data.tolist(),
                            parsed_params=parsed_params
                        )
                    spectra.append(spec)
                    parsed_quad = True
                    
                except Exception as e:
                    logger.error(f"Quad-Interleave parse failed: {e}. Falling back to standard loop.")
                    parsed_quad = False

            if not parsed_quad:
                # --- Standard Loop (Legacy) ---
                for idx, config in enumerate(dataset_configs):
                    # Slice Buffer
                    chunk = dta_bytes[current_offset : current_offset + config['size_bytes']]
                    current_offset += config['size_bytes']
                    
                    # Numpy frombuffer implies Native byte order usually, so we must enforce explicit endian
                    dt = np.dtype(config['dtype'])
                    original_endian = config['endian']
                    dt = dt.newbyteorder(original_endian)
                    
                    data_array = np.frombuffer(chunk, dtype=dt)
                    
                    # 1. Endianness Heuristic (Magnitude)
                    if len(data_array) > 0:
                        max_val = np.max(np.abs(data_array))
                        # If values are insanely huge, swap endian
                        if not np.isfinite(max_val) or max_val > 1e20:
                             logger.warning(f"Detected suspicious values (max={max_val:.2e}). Swapping endian.")
                             other_endian = '<' if original_endian == '>' else '>'
                             dt_swapped = np.dtype(config['dtype']).newbyteorder(other_endian)
                             data_array = np.frombuffer(chunk, dtype=dt_swapped)

                    # 2. Structure: Interleaved vs Block (Smoothness Heuristic)
                    real_data = []
                    imag_data = []
                    
                    if config['is_complex'] and len(data_array) >= (xpts * 2):
                        # Interleaved (R, I, R, I...)
                        r_int = data_array[0::2]
                        i_int = data_array[1::2]
                        
                        # Block (R... I...)
                        mid = len(data_array) // 2
                        r_blk = data_array[:mid]
                        i_blk = data_array[mid:]
                        
                        # Simple smoothness check
                        def _smooth(arr):
                             if len(arr) < 2: return 0
                             return np.mean(np.abs(np.diff(arr))) / (np.ptp(arr) or 1.0)
                        
                        score_int = _smooth(r_int[:1000]) if len(r_int) > 0 else 1
                        score_blk = _smooth(r_blk[:1000]) if len(r_blk) > 0 else 1
                        
                        logger.info(f"Ch{idx}: Smoothness Int={score_int:.4f}, Blk={score_blk:.4f}")
                        
                        if score_blk < score_int:
                            real_data, imag_data = r_blk, i_blk
                        else:
                            real_data, imag_data = r_int, i_int
                    else:
                        real_data = data_array 
                        imag_data = np.zeros_like(real_data)
                    
                    # Truncate to expected size
                    if len(real_data) > total_points_per_input:
                        real_data = real_data[:total_points_per_input]
                        imag_data = imag_data[:total_points_per_input]
                        
                    # 3. Smart Cleaning (Legacy)
                    # If Real Clean & Imag Noisy -> Zero Imag
                    # If Real Noisy -> Mark for drop
                    s_r = _smooth(real_data[:1000]) if len(real_data)>0 else 1
                    s_i = _smooth(imag_data[:1000]) if len(imag_data)>0 else 1
                    
                    if s_r < 0.05 and s_i > 0.15:
                        imag_data = np.zeros_like(real_data)
                    
                    suffix = f"_ch{idx+1}" if len(dataset_configs) > 1 else ""
                    filename_only = base_name.split('/')[-1] + suffix
                    y_axis_label = f"{get_str(meta, 'YNAM')} ({get_str(meta, 'YUNI')})"

                    if ypts > 1:
                        # 2D Spectrum (Standard Loop)
                        y_vector = axis_vector(meta, 'Y', ypts)
                        z_data = []
                        # Reshape flat real_data into rows
                        for k in range(ypts):
                            start = k * xpts
                            end = start + xpts
                            z_data.append(real_data[start:end].tolist())
                            
                        # Standard loop: create Spectrum2D
                        spec = Spectrum2D(
                            filename=filename_only,
                            type=spectrum_type,
                            x_label=x_axis_label_base,
                            y_label=y_axis_label,
                            x_data=x_vector,
                            y_data=y_vector,
                            z_data=z_data,
                            parsed_params=parsed_params
                        )
                    else:
                        spec = Spectrum1D(
                            filename=filename_only,
                            type=spectrum_type,
                            x_label=x_axis_label_base,
                            y_label=y_axis_label, # "Intensity (a.u.)"
                            x_data=x_vector,
                            real_data=real_data.tolist(),
                            imag_data=imag_data.tolist(),
                            parsed_params=parsed_params
                        )
                    spec._quality_score_real = s_r
                    spectra.append(spec)
                
                # Filter noisy spectra if we have multiple
                if len(spectra) > 1:
                     clean_spectra = [s for s in spectra if getattr(s, '_quality_score_real', 1.0) < 0.15]
                     if clean_spectra and len(clean_spectra) < len(spectra):
                         logger.info(f"Smart Filtering: Dropped {len(spectra) - len(clean_spectra)} noisy channels.")
                         spectra = clean_spectra

        except Exception as e:
            logger.error(f"Failed to parse {dsc_path}: {e}")
            continue
            
    # Heuristic for sample name
    if spectra:
        sample_name = spectra[0].parsed_params.get('sampleName', sample_name)
        
    return sample_name, spectra, len(spectra)
