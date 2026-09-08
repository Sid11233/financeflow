// Raw XHR rather than supabase-js's uploadToSignedUrl() convenience method:
// XHR's upload.onprogress is the only portable way to get real upload
// progress events, which fetch does not expose for request bodies.
export function uploadFileWithProgress(
  signedUrl: string,
  uploadToken: string,
  file: File,
  mimeType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const url = signedUrl.includes('token=')
    ? signedUrl
    : `${signedUrl}${signedUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(uploadToken)}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Storage's actual error body (e.g. "The object exceeds the maximum
      // allowed size", an expired/invalid signing token, etc.) — surfaced
      // directly rather than just the status code, since the status alone
      // hasn't been enough to diagnose failures reported in the field.
      let detail = '';
      try {
        const body = JSON.parse(xhr.responseText);
        detail = body?.message || body?.error || '';
      } catch {
        detail = xhr.responseText?.slice(0, 200) ?? '';
      }
      reject(new Error(detail ? `Upload failed (${xhr.status}): ${detail}` : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));

    xhr.send(file);
  });
}
