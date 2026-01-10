
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
        if m := re.match(r'(\d+(?:\.\d+)?)k', lower):
            params['temperatureK'] = float(m.group(1))
        if m := re.match(r'(\d+(?:\.\d+)?)g', lower):
            params['fieldG'] = float(m.group(1))
        if m := re.match(r'hpa(\d+(?:\.\d+)?)db', lower):
            params['amplifierDb'] = float(m.group(1))
        if m := re.match(r'p(\d+(?:\.\d+)?)', lower):
            params['pulseWidth'] = float(m.group(1))
            
    return params

def infer_spectrum_type(name: str, meta: Dict[str, str], is_2d: bool) -> str:
    lower_name = name.lower()
    if 'edfs' in lower_name: return 'EDFS'
    if 'rabi' in lower_name: return 'Rabi'
    if 't1' in lower_name: return 'T1'
    if 't2' in lower_name: return 'T2'
    if 'hyscore' in lower_name: return 'HYSCORE'
    if '2d' in lower_name: return '2D'
    if 'cw' in lower_name: return 'CW'
    
    family = get_str(meta, 'EXPT', '')
    if 'CW' in family: return '2D' if is_2d else 'CW'
    if 'PULSED' in family: return '2D' if is_2d else 'T1'
    
    return '2D' if is_2d else 'Unknown'

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
    time_types = ['T1', 'T2', 'Rabi', 'EDFS']
    is_time = any(u in label.lower() for u in ['time', 'tau', ' s', 'ms', 'us', 'ns'])
    
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
            
            is_complex = 'CPLX' in get_str(meta, 'IKKF', '') or 'IIFMT' in meta
            
            # Format
            irfmt = get_str(meta, 'IRFMT', 'F')
            if 'D' in irfmt:
                dtype = np.float64
                sample_size = 8
            elif 'I' in irfmt:
                dtype = np.int32
                sample_size = 4
            else:
                dtype = np.float32 # typical 'F'
                sample_size = 4
                
            bseq = get_str(meta, 'BSEQ', 'BIG')
            endian = '>' if 'BIG' in bseq else '<'
            
            total_points = xpts * ypts
            expected_floats = total_points * (2 if is_complex else 1)
            
            # Numpy fromfs is faster
            # Correct endian if needed
            dt = np.dtype(dtype)
            dt = dt.newbyteorder(endian)
            
            data_array = np.frombuffer(dta_bytes, dtype=dt)
            
            if len(data_array) != expected_floats:
                logger.warning(f"Size mismatch {dsc_path}: got {len(data_array)}, expected {expected_floats}")
                continue
                
            real_data = []
            imag_data = []
            
            if is_complex:
                # Interleaved Real, Imag
                real_data = data_array[0::2]
                imag_data = data_array[1::2]
            else:
                real_data = data_array
                imag_data = np.zeros_like(real_data)
                
            # Axes
            x_axis_label = f"{get_str(meta, 'XNAM')} ({get_str(meta, 'XUNI')})"
            y_axis_label = f"{get_str(meta, 'YNAM')} ({get_str(meta, 'YUNI')})"
            
            x_vector = axis_vector(meta, 'X', xpts)
            
            
            spectrum_type = infer_spectrum_type(base_name, meta, ypts > 1)
            parsed_params = parse_params_from_name(base_name.split('/')[-1])
            
            x_vector = normalize_x_for_time_type(x_vector, spectrum_type, x_axis_label)

            filename_only = base_name.split('/')[-1]

            if ypts > 1:
                # 2D Spectrum
                y_vector = axis_vector(meta, 'Y', ypts)
                
                # Reshape Z data
                # Z data is typically row by row
                z_data = []
                for i in range(ypts):
                    start = i * xpts
                    end = start + xpts
                    z_data.append(real_data[start:end].tolist())
                    
                spec = Spectrum2D(
                    filename=filename_only,
                    type=spectrum_type,
                    x_label=x_axis_label,
                    y_label=y_axis_label,
                    x_data=x_vector,
                    y_data=y_vector,
                    z_data=z_data,
                    parsed_params=parsed_params
                )
                spectra.append(spec)
                
            else:
                # 1D Spectrum
                spec = Spectrum1D(
                    filename=filename_only,
                    type=spectrum_type,
                    x_label=x_axis_label,
                    y_label='Intensity (a.u.)',
                    x_data=x_vector,
                    real_data=real_data.tolist(),
                    imag_data=imag_data.tolist(),
                    parsed_params=parsed_params
                )
                spectra.append(spec)
                
        except Exception as e:
            logger.error(f"Failed to parse {dsc_path}: {e}")
            continue
            
    # Heuristic for sample name
    if spectra:
        sample_name = spectra[0].parsed_params.get('sampleName', sample_name)
        
    return sample_name, spectra, len(spectra)
