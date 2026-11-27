// ============================================================================
//  scanner.js — pemindai QR + verifikasi gerakan kepala.
//  Semua pemeriksaan berjalan di peramban. Tidak ada foto/video wajah yang
//  dikirim; server hanya menerima isi QR dan penanda "gerak terdeteksi".
// ============================================================================
const Pemindai = (() => {
  const cb = { hasil() {}, sapa() {}, progres() {}, sibuk() {}, galatKamera() {}, lampiranUlang() {} };
  const st = { video: null, stream: null, aktif: false, fase: '', gerak: 0, prev: null,
               mulaiGerak: 0, batas: 0, kodeAktif: '', kedipWajib: true, memulai: false, sesi: 0 };
  const cool = {};
  let kategori = 'Hadir', jenis = 'masuk', lampiran = null;
  let arah = 'environment';                 // 'environment' = kamera belakang, 'user' = kamera depan
  const POLA_QR = /^SIM\|[SG]\|/;
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

  const kanvas = document.createElement('canvas');
  const g = kanvas.getContext('2d', { willReadFrequently: true });
  const mini = document.createElement('canvas');
  mini.width = 48; mini.height = 36;
  const gm = mini.getContext('2d', { willReadFrequently: true });

  let detektor;
  const getDetektor = () => {
    if (detektor === undefined) {
      try { detektor = typeof window.BarcodeDetector === 'function' ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null; }
      catch (e) { detektor = null; }
    }
    return detektor;
  };

  // Membaca satu bingkai: BarcodeDetector bawaan peramban dulu, lalu jsQR sebagai cadangan
  async function bacaFrame() {
    const v = st.video;
    if (!v || !v.videoWidth || v.readyState < 2) return null;
    const d = getDetektor();
    if (d) {
      try { const h = await d.detect(v); if (h && h.length && h[0].rawValue) return h[0].rawValue; }
      catch (e) { /* lanjut ke jsQR */ }
    }
    if (!window.jsQR) return null;
    const s = Math.min(1, 960 / v.videoWidth);
    kanvas.width = Math.round(v.videoWidth * s);
    kanvas.height = Math.round(v.videoHeight * s);
    g.drawImage(v, 0, 0, kanvas.width, kanvas.height);
    const px = g.getImageData(0, 0, kanvas.width, kanvas.height);
    const q = window.jsQR(px.data, px.width, px.height, { inversionAttempts: 'attemptBoth' });
    return q ? q.data : null;
  }

  // ---- Kamera ----
  async function bukaKamera() {
    const dasar = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const coba = [{ ...dasar, facingMode: { ideal: arah } }, { facingMode: { ideal: arah } }, true];
    let galat = null;
    for (const video of coba) {
      try { return await navigator.mediaDevices.getUserMedia({ video: video, audio: false }); }
      catch (e) {
        galat = e;
        if (/NotAllowed|Security|PermissionDenied/i.test(String(e && e.name))) break;
      }
    }
    throw galat;
  }

  function pesanGalat(e) {
    const n = String((e && e.name) || '');
    if (/NotAllowed|PermissionDenied|Security/i.test(n)) return 'Izin kamera ditolak. Izinkan Kamera lewat ikon gembok di bilah alamat, lalu tekan Coba Lagi.';
    if (/NotFound|DevicesNotFound/i.test(n)) return 'Perangkat ini tidak memiliki kamera yang dapat dipakai.';
    if (/NotReadable|TrackStart|Abort/i.test(n)) return 'Kamera sedang dipakai aplikasi atau tab lain. Tutup yang lain, lalu tekan Coba Lagi.';
    return 'Kamera tidak dapat dinyalakan. Pastikan halaman dibuka lewat HTTPS.';
  }

  async function mulai(videoEl) {
    if (st.aktif || st.memulai) return;
    st.memulai = true;
    st.video = videoEl;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cb.galatKamera('Peramban ini tidak mendukung kamera. Gunakan Chrome atau Safari terbaru.');
        return;
      }
      st.stream = await bukaKamera();
      videoEl.srcObject = st.stream;
      try { await videoEl.play(); } catch (e) { /* diputar otomatis */ }
      st.aktif = true;
      cb.galatKamera('');
      loop(++st.sesi);
    } catch (e) {
      cb.galatKamera(pesanGalat(e));
    } finally { st.memulai = false; }
  }

  function berhenti() {
    st.aktif = false;
    st.fase = '';
    if (st.stream) { st.stream.getTracks().forEach((t) => t.stop()); st.stream = null; }
    if (st.video) st.video.srcObject = null;
  }

  // ---- Putaran utama ----
  async function loop(id) {
    while (st.aktif && id === st.sesi) {
      try {
        if (st.fase === 'gerak') {
          await langkahGerak();
        } else if (st.fase === '') {
          const teks = await bacaFrame();
          if (teks && POLA_QR.test(teks) && !(cool[teks] > Date.now())) await tanganiKode(teks);
          await tidur(kategori === 'Hadir' ? 120 : 160);
        } else {
          await tidur(100);
        }
      } catch (e) { await tidur(200); }
    }
  }

  // Setelah kartu terbaca, sistem menghitung perubahan gambar kecil di perangkat (gerakan kepala)
  async function langkahGerak() {
    const v = st.video;
    if (v && v.videoWidth && v.readyState >= 2) {
      gm.drawImage(v, 0, 0, 48, 36);
      const d = gm.getImageData(0, 0, 48, 36).data;
      if (st.prev && Date.now() >= st.mulaiGerak) {
        let s = 0, n = 0;
        for (let k = 0; k < d.length; k += 16) {
          s += Math.abs(d[k] - st.prev[k]) + Math.abs(d[k + 1] - st.prev[k + 1]) + Math.abs(d[k + 2] - st.prev[k + 2]);
          n += 3;
        }
        if (s / n > 6) st.gerak++;
      }
      st.prev = d;
    }
    cb.progres(Math.min(4, st.gerak));
    if (st.gerak >= 4) {
      await kirim({ kode: st.kodeAktif, kategori: 'Hadir', gerak: true });
    } else if (Date.now() > st.batas) {
      cool[st.kodeAktif] = Date.now() + 3000;
      st.fase = ''; st.prev = null;
      cb.sapa('Waktu habis, tunjukkan kartumu lagi');
      cb.progres(-1);
    }
    await tidur(90);
  }

  async function tanganiKode(kode) {
    cool[kode] = Date.now() + 20000;
    st.fase = 'cek';
    cb.sibuk(true);
    try {
      const cek = await panggil('cekQR', { kode: kode });
      const nama = (cek.data && cek.data.nama) || 'teman';
      if (kategori !== 'Hadir') {
        if (!lampiran) throw new Error('Pilih foto atau PDF surat dulu, lalu tunjukkan kartu.');
        await kirim({ kode: kode, kategori: kategori, base64: lampiran.base64, mime: lampiran.mime });
        lampiran = null;
        cb.lampiranUlang();
        return;
      }
      if (!st.kedipWajib) {
        await kirim({ kode: kode, kategori: 'Hadir', gerak: false });
        return;
      }
      cb.sapa('Hai, ' + nama + ', gerakkan kepalamu');
      st.gerak = 0; st.prev = null;
      st.mulaiGerak = Date.now() + 2600;
      st.batas = Date.now() + 15000;
      st.kodeAktif = kode;
      st.fase = 'gerak';
      cb.progres(0);
    } catch (e) {
      cool[kode] = Date.now() + 4000;
      st.fase = '';
      cb.hasil(false, e.message);
      cb.sapa('Maaf, kartu tidak dapat dipakai');
    } finally {
      if (st.fase !== 'gerak') cb.sibuk(false);
    }
  }

  async function kirim(p) {
    st.fase = 'kirim';
    const kode = p.kode;
    try {
      const res = await panggil('absenQR', { ...p, jenis: jenis });
      cool[kode] = Date.now() + 12000;
      cb.hasil(true, res.message, res.data);
      cb.sapa(p.kategori === 'Hadir' ? 'Terima kasih sudah hadir' : 'Tercatat, terima kasih');
    } catch (e) {
      cool[kode] = Date.now() + 4000;
      cb.hasil(false, e.message);
      cb.sapa('Maaf, absensi belum berhasil');
    } finally {
      st.fase = ''; st.prev = null; st.gerak = 0;
      cb.progres(-1);
      cb.sibuk(false);
    }
  }

  // ---- Surat sakit/izin: foto dikecilkan dulu di peramban ----
  const bacaBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Gagal membaca berkas.'));
    r.readAsDataURL(blob);
  });
  const kecilkan = (file, sisiMaks = 900) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const skala = Math.min(1, sisiMaks / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Berkas bukan gambar yang valid.')); };
    img.src = url;
  });

  async function siapkanLampiran(file) {
    let blob = file, mime = file.type;
    if (mime.indexOf('image/') === 0) { blob = await kecilkan(file); mime = 'image/jpeg'; }
    else if (mime !== 'application/pdf') throw new Error('Gunakan foto (JPG/PNG/WEBP) atau PDF.');
    if (blob.size > 5 * 1024 * 1024) throw new Error('Berkas lebih dari 5 MB.');
    lampiran = { base64: await bacaBase64(blob), mime: mime };
    return lampiran;
  }
  function hapusLampiran() { lampiran = null; }

  return {
    init(callbacks) { Object.assign(cb, callbacks); },
    setMode(k, j, kedipWajib) {
      if (k !== kategori) lampiran = null;
      kategori = k; jenis = j; st.kedipWajib = kedipWajib !== false;
    },
    mulai, berhenti, siapkanLampiran, hapusLampiran,
    /** Bergantian antara kamera belakang dan depan. Mengembalikan arah baru. */
    async gantiKamera(videoEl) {
      berhenti();
      arah = arah === 'environment' ? 'user' : 'environment';
      await mulai(videoEl);
      return arah;
    },
    arahSaatIni() { return arah; }
  };
})();
