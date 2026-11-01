/** Upload context; the public link can be read without the upload key. */
export async function uploadPoint(context, options, attachments = {}) {
  if (!options?.endpoint) throw new TypeError('A point upload endpoint is required.');
  const url = new URL(options.endpoint, globalThis.location?.href);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('Point uploads require HTTPS (or localhost).');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = {'Content-Type':'application/json'};
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    const response = await fetch(url, {
      method:'POST', headers, redirect:'error', credentials:options.credentials || 'omit', signal:controller.signal,
      body:JSON.stringify({context, ...(attachments.image ? {image:attachments.image} : {}), ...(options.expiresIn === undefined ? {} : {expires_in:options.expiresIn})})
    });
    if (!response.ok) {
      let error;try {error=(await response.json()).error;} catch {}
      throw new Error(error || `Point upload failed (HTTP ${response.status}).`);
    }
    const receipt = await response.json();
    const link = new URL(receipt.url);
    if (typeof receipt.id !== 'string' || link.origin !== url.origin || !link.pathname.startsWith('/points/')) throw new Error('The point server returned an invalid link.');
    return receipt;
  } finally {clearTimeout(timeout);}
}
