// ============================================================================
//  app.js — logika halaman: login, pemindai, dan daftar absensi hari ini
// ============================================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PERAN = { admin: 'Admin', kepsek: 'Kepala Sekolah', guru: 'Guru', bendahara: 'Bendahara' };

  let boot = null, user = null, tabAktif = 'pindai', kategoriAktif = 'Hadir';

  function toast(pesan, ok) {
    const t = $('#toast');
    t.textContent = pesan;
    t.className = 'toast ' + (ok === false ? 'err' : 'ok');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  function bicara(teks) {
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(teks);
      u.lang = 'id-ID'; u.rate = 0.95; u.pitch = 1.1;
      const v = (s.getVoices() || []).find((x) => /^id/i.test(x.lang));
      if (v) u.voice = v;
      s.speak(u);
    } catch (e) { /* suara hanya pelengkap */ }
  }

  // ---- Tampilan dasar ----
  function tampilkanLogin() {
    Pemindai.berhenti();
    $('#view-login').classList.remove('hidden');
    ['#tabs', '#tab-pindai', '#tab-hari', '#btn-keluar'].forEach((s) => $(s).classList.add('hidden'));
    $('#info-user').textContent = '';
  }

  function tampilkanApp() {
    $('#view-login').classList.add('hidden');
    $('#tabs').classList.remove('hidden');
    $('#btn-keluar').classList.remove('hidden');
    pilihTab(tabAktif);
  }

  function pilihTab(nama) {
    tabAktif = nama;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === nama));
    $('#tab-pindai').classList.toggle('hidden', nama !== 'pindai');
    $('#tab-hari').classList.toggle('hidden', nama !== 'hari');
    if (nama === 'pindai') { aturPemindai(); Pemindai.mulai($('#video')); }
    else { Pemindai.berhenti(); muatHariIni(); }
  }

  // ---- Sesi ----
  async function muatBoot() {
    const res = await panggil('boot');
    boot = res.data;
    user = boot.user;
    $('#nama-sekolah').textContent = boot.namaSekolah;
    $('#info-user').textContent = user.n + ' · ' + (PERAN[user.r] || user.r);
    const admin = user.r === 'admin' || user.r === 'kepsek';
    $('#btn-alpha').classList.toggle('hidden', !admin);
  }

  function keluar() {
    hapusToken();
    boot = null; user = null;
    tampilkanLogin();
  }

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-login');
    btn.disabled = true;
    $('#login-galat').textContent = '';
    try {
      const res = await panggil('login', { username: $('#user').value.trim(), password: $('#pass').value });
      simpanToken(res.data.token);
      await muatBoot();
      tampilkanApp();
    } catch (err) {
      $('#login-galat').textContent = err.message;
    } finally { btn.disabled = false; }
  });

  $('#btn-keluar').addEventListener('click', keluar);
  window.addEventListener('sesi-berakhir', () => { keluar(); toast('Sesi berakhir, silakan masuk kembali.', false); });

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => pilihTab(b.dataset.tab)));

  // ---- Pemindai ----
  function aturPemindai() {
    Pemindai.setMode(kategoriAktif, $('#jenis').value, boot ? boot.kedipWajib : true);
  }

  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    kategoriAktif = c.dataset.kat;
    document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
    $('#box-surat').classList.toggle('hidden', kategoriAktif === 'Hadir');
    $('#surat').value = ''; $('#surat-info').textContent = '';
    Pemindai.hapusLampiran();
    aturPemindai();
    $('#status').textContent = kategoriAktif === 'Hadir'
      ? 'Arahkan kartu QR ke kamera'
      : 'Pilih surat, lalu arahkan kartu QR ke kamera';
  }));

  $('#jenis').addEventListener('change', aturPemindai);

  $('#surat').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await Pemindai.siapkanLampiran(f);
      $('#surat-info').textContent = 'Surat siap: ' + f.name + '. Sekarang tunjukkan kartu QR.';
    } catch (err) {
      toast(err.message, false);
      e.target.value = '';
    }
  });

  $('#coba-kamera').addEventListener('click', () => { $('#kamera-galat').classList.add('hidden'); Pemindai.mulai($('#video')); });

  Pemindai.init({
    hasil(ok, pesan, data) {
      $('#status').textContent = pesan;
      toast(pesan, ok);
      if (ok && data) {
        const li = document.createElement('li');
        li.innerHTML = '<span>' + esc(data.nama) + '</span><span>' + esc(data.kategori) + ' · ' + esc(data.jam) + '</span>';
        const daftar = $('#terakhir');
        daftar.insertBefore(li, daftar.firstChild);
        while (daftar.children.length > 6) daftar.removeChild(daftar.lastChild);
      }
    },
    sapa(teks) { $('#sapaan').textContent = teks; bicara(teks); },
    progres(n) {
      if (n < 0) { $('#status').textContent = 'Arahkan kartu QR ke kamera'; return; }
      if (n > 0) $('#status').textContent = 'Gerakkan kepalamu… ' + n + ' / 4';
    },
    sibuk() {},
    galatKamera(pesan) {
      $('#kamera-galat').classList.toggle('hidden', !pesan);
      $('#kamera-galat-teks').textContent = pesan || '';
    },
    lampiranUlang() { $('#surat').value = ''; $('#surat-info').textContent = ''; }
  });

  // ---- Hari Ini ----
  const KOSONG = (t) => '<div class="kosong">' + t + '</div>';

  async function muatHariIni() {
    $('#tabel-siswa').innerHTML = KOSONG('Memuat…');
    $('#tabel-guru').innerHTML = '';
    try {
      const res = await panggil('listHariIni');
      const d = res.data;
      $('#tgl').textContent = d.tanggal;
      $('#tabel-siswa').innerHTML = d.siswa.length
        ? '<table><tr><th>Jam</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Metode</th></tr>' +
          d.siswa.map((r) => '<tr><td>' + esc(r.jam) + '</td><td>' + esc(r.nama) + '</td><td>' + esc(r.kelas) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.metode) + '</td></tr>').join('') + '</table>'
        : KOSONG('Belum ada catatan siswa hari ini.');
      if (user && user.r === 'guru') {
        $('#tabel-guru').innerHTML = '';
        return;
      }
      $('#tabel-guru').innerHTML = d.guru.length
        ? '<table><tr><th>Guru</th><th>Status</th><th>Masuk</th><th>Pulang</th></tr>' +
          d.guru.map((r) => '<tr><td>' + esc(r.guru) + '</td><td>' + esc(r.statusHari) + '</td><td>' + esc(r.jamMasuk) + ' ' + esc(r.statusMasuk) + '</td><td>' + esc(r.jamPulang) + ' ' + esc(r.statusPulang) + '</td></tr>').join('') + '</table>'
        : KOSONG('Belum ada catatan guru hari ini.');
    } catch (err) {
      $('#tabel-siswa').innerHTML = KOSONG(esc(err.message));
    }
  }

  $('#btn-muat').addEventListener('click', muatHariIni);

  $('#btn-alpha').addEventListener('click', async () => {
    if (!confirm('Tandai Alpha untuk siswa dan guru yang belum absen hari ini?')) return;
    try {
      const res = await panggil('tandaiAlfa', { jenis: 'semua' });
      toast(res.message, true);
      muatHariIni();
    } catch (err) { toast(err.message, false); }
  });

  // ---- Mulai ----
  (async function init() {
    if (!ambilToken()) {
      tampilkanLogin();
      if (CONFIG.GAS_URL.indexOf('GANTI') >= 0) $('#login-galat').textContent = 'URL backend belum diisi di js/config.js.';
      return;
    }
    try {
      await muatBoot();
      tampilkanApp();
    } catch (err) {
      hapusToken();
      tampilkanLogin();
      if (!/Sesi berakhir/i.test(err.message)) $('#login-galat').textContent = err.message;
    }
  })();
})();
