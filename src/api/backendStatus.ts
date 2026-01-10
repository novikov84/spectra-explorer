export async function isBackendAvailable(baseUrl?: string): Promise<boolean> {
  const url =
    (baseUrl || (typeof import.meta !== 'undefined' ? import.meta.env.VITE_API_BASE_URL : undefined)) ||
    (typeof process !== 'undefined' ? process.env.VITE_API_BASE_URL : undefined);
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
