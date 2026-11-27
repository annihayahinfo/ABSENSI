# Absensi QR — Frontend (SDIT Annihayah)

Frontend statis (HTML/CSS/JS vanilla). Backend ada di Google Apps Script.

## Isi
- `index.html` — halaman utama (wajib di root)
- `css/style.css` — tampilan
- `js/config.js` — **isi URL backend di sini** (satu-satunya yang perlu diubah)
- `js/api.js` — pemanggil API
- `js/scanner.js` — pemindai QR dan verifikasi gerakan kepala
- `js/app.js` — login, pemindai, dan daftar absensi hari ini

## Cara pakai
1. Buka `js/config.js`, ganti `GANTI_DENGAN_URL_EXEC_ANDA` dengan URL `/exec` dari Apps Script.
2. Simpan, lalu deploy ke GitHub Pages (lihat panduan instalasi).

## Catatan
- Kamera hanya berfungsi lewat HTTPS (GitHub Pages sudah HTTPS).
- Tidak ada foto atau video wajah yang dikirim ke server.
