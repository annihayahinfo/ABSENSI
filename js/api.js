// ============================================================================
//  api.js — satu fungsi untuk memanggil backend GAS (fetch POST, text/plain)
// ============================================================================
const TOKEN_KEY = 'absen_token';
const ambilToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
const simpanToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const hapusToken = () => sessionStorage.removeItem(TOKEN_KEY);

/**
 * Memanggil satu aksi di backend.
 * Content-Type text/plain sengaja dipakai agar peramban tidak mengirim preflight CORS.
 */
async function panggil(aksi, p = {}) {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('GANTI') >= 0) {
    throw new Error('URL backend belum diisi di js/config.js.');
  }
  let res;
  try {
    res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ aksi: aksi, token: ambilToken(), p: p })
    });
  } catch (e) {
    throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
  }
  let json;
  try { json = await res.json(); }
  catch (e) { throw new Error('Respons server tidak valid.'); }
  if (!json.success) {
    if (/Sesi berakhir/i.test(json.message || '')) window.dispatchEvent(new Event('sesi-berakhir'));
    throw new Error(json.message || 'Terjadi kesalahan pada server.');
  }
  return json;
}
