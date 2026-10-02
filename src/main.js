/**
 * Alur kerja utama aplikasi web.
 */

import { bacaCsv, GalatCsv } from './csv.js';
import { muatTemplate, gambarUndangan, GalatPdf } from './pdf.js';
import { PengambilNama } from './namaBerkas.js';
import { buatZip, namaZipUntuk, unduh } from './zip.js';
import { PanelKotak } from './ui.js';

const TAMBAHAN_CONTOH = {
  nama: 'Budi Santoso Wibowo Prakoso',
  alamat: 'Jl. Merdeka No. 123, Kota Baru',
};

let template = null;
let fontBytes = null;
let daftarTamu = [];
let panel = null;

function el(id) {
  return document.getElementById(id);
}

function tampilPesan(teks, timeout = 4000) {
  const p = el('pesan');
  p.hidden = false;
  p.textContent = teks;
  setTimeout(() => {
    p.hidden = true;
  }, timeout);
}

function aturBahasaError(err) {
  const msg = err?.message ?? String(err);
  if (err instanceof GalatCsv || err instanceof GalatPdf) return msg;
  return `Terjadi kesalahan: ${msg}`;
}

async function bacaBerkas(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function init() {
  panel = new PanelKotak({
    kanvas: el('kanvas'),
    kontainer: el('kontainer-kotak'),
    selectKolom: el('pilih-kolom'),
    inputUkuran: el('input-ukuran'),
    inputMinUkuran: el('input-min-ukuran'),
    inputWarna: el('input-warna'),
    inputJarakBaris: el('input-jarak-baris'),
    barisProperti: el('baris-properti'),
  });

  el('input-pdf').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      template = await muatTemplate(file);
      el('label-pdf').textContent = 'Ganti file PDF';
      el('info-pdf').textContent = `${file.name} — ${template.jumlahHalaman} halaman`;
      panel.setTemplate(template);
      await panel.renderHalaman();
      panel.perbaikiKotakNol();
      buatKotakDefault();
      periksaSiapBuat();
    } catch (err) {
      tampilPesan(aturBahasaError(err));
    }
  });

  el('input-csv').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      daftarTamu = await bacaCsv(file);
      el('label-csv').textContent = 'Ganti file CSV';
      el('info-csv').textContent = `${file.name}`;
      const ringkasan = el('ringkasan-csv');
      ringkasan.hidden = false;
      ringkasan.innerHTML = `<strong>${daftarTamu.length}</strong> tamu ditemukan.`;
      panel.setKolom(Object.keys(daftarTamu[0]?.nilai ?? { nama: 'nama', alamat: 'alamat' }));
      periksaSiapBuat();
    } catch (err) {
      tampilPesan(aturBahasaError(err));
    }
  });

  el('input-font').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      fontBytes = await bacaBerkas(file);
      el('label-font').textContent = 'Ganti file font (.ttf)';
      el('info-font').textContent = `${file.name}`;
      periksaSiapBuat();
    } catch (err) {
      tampilPesan(aturBahasaError(err));
    }
  });

  el('tombol-tambah').addEventListener('click', () => {
    if (!panel) return;
    panel.tambahKotak();
  });

  el('tombol-hapus').addEventListener('click', () => {
    if (!panel) return;
    panel.hapusTerpilih();
  });

  el('tombol-contoh').addEventListener('click', () => {
    if (!panel || !daftarTamu[0]) return;
    // berikan contoh
    const nilai = { ...daftarTamu[0].nilai, ...TAMBAHAN_CONTOH };
    panel.kotak.forEach((k) => {
      k.teksContoh = nilai[k.kunci] ?? TAMBAHAN_CONTOH[k.kunci] ?? '';
    });
    tampilPesan('Contoh nama terpanjang ditampilkan sementara. Klik Buat Undangan untuk menghasilkan PDF sebenarnya.');
  });

  el('tombol-buat').addEventListener('click', buatUndangan);
}

/** Buat satu kotak untuk setiap kolom yang ada di CSV, bila belum ada kotak. */
function buatKotakDefault() {
  if (!panel || !template) return;
  if (panel.kotak.length > 0) return;
  const kolom = panel.selectKolom.querySelectorAll('option');
  let i = 0;
  for (const opt of kolom) {
    const k = panel.tambahKotak(opt.value);
    if (!k) continue;
    k.y = panel.tinggiHalamanPt * 0.4 + i * 90;
    i += 1;
  }
  panel.refresh();
}

function periksaSiapBuat() {
  const siap = template && fontBytes && daftarTamu.length > 0 && panel?.kotak.length > 0;
  el('tombol-buat').disabled = !siap;
}

async function buatUndangan() {
  if (!template || !fontBytes || !daftarTamu.length || !panel) return;
  const kotak = panel.getKotak();
  if (kotak.length === 0) {
    tampilPesan(
      'Belum ada kotak tulisan. Klik-tarik di atas kertas untuk membuat kotak, lalu pilih kolom yang mau dipakai.',
      9000
    );
    return;
  }
  const ambilNama = new PengambilNama();
  const berkasZip = [];
  const kemajuan = el('kemajuan');
  const batang = el('batang-isi');
  const teksKemajuan = el('teks-kemajuan');
  const hasil = el('hasil');
  const pakaiNamaTamu = el('input-nama-berkas').checked;

  kemajuan.hidden = false;
  hasil.hidden = true;
  el('tombol-buat').disabled = true;
  let berhasil = 0;
  let tanpaTeks = 0;
  const semuaPeringatan = new Set();
  const total = daftarTamu.length;

  try {
    for (let i = 0; i < daftarTamu.length; i++) {
      const t = daftarTamu[i];
      const nilai = { ...t.nilai };
      const stem = ambilNama.ambil(t.nama, t.nomor);
      const { doc, teksTercetak, peringatan } = await gambarUndangan(
        template,
        kotak,
        fontBytes,
        nilai
      );
      for (const w of peringatan) semuaPeringatan.add(w);
      // Tamu yang tidak punya teks sama sekali = hasil tidak berguna.
      if (teksTercetak.length === 0) tanpaTeks += 1;
      const pdfBytes = await doc.save({ useObjectStreams: false });
      const namaBerkas = pakaiNamaTamu ? `${stem}.pdf` : `undangan-${t.nomor}.pdf`;
      berkasZip.push({ nama: namaBerkas, data: pdfBytes });
      berhasil += 1;
      const persen = Math.round((berhasil / total) * 100);
      batang.style.width = `${persen}%`;
      teksKemajuan.textContent = `Memproses ${berhasil}/${total} tamu… (${persen}%)`;
      // Beri jeda supaya peramban sempat melukis bilah kemajuan.
      await new Promise((r) => setTimeout(r, 0));
    }

    // Jangan sekali-kali mengunduh ZIP yang isinya PDF kosong tanpa penjelasan.
    if (tanpaTeks === berhasil && berhasil > 0) {
      hasil.hidden = false;
      hasil.className = 'hasil salah';
      hasil.innerHTML =
        `<strong>Tidak ada teks yang berhasil ditulis.</strong> Periksa:<br>` +
        (semuaPeringatan.size > 0
          ? [...semuaPeringatan].map((w) => `• ${w}`).join('<br>') +
            '<br><br>Perbaiki lalu tekan <em>Buat Undangan</em> lagi. Berkas ZIP sengaja tidak diunduh agar Anda tidak mengunduhundos yang salah.'
          : '• Pastikan setiap kotak sudah diisi dengan kolom yang benar.<br>• Pastikan ukuran kotak tidak nol (klik-tarik untuk membuat ulang kotak).');
      kemajuan.hidden = true;
      el('tombol-buat').disabled = false;
      return;
    }

    const zipBytes = buatZip(berkasZip);
    const namaZip = namaZipUntuk('undangan');
    unduh(zipBytes, namaZip);
    hasil.hidden = false;
    hasil.className = 'hasil';
    hasil.innerHTML =
      `Berhasil! <strong>${berhasil}</strong> undangan dikemas ke <code>${namaZip}</code> dan diunduh ke folder Downloads.`;
    if (semuaPeringatan.size > 0) {
      hasil.innerHTML +=
        `<br><br><strong>Perhatian:</strong><br>` +
        [...semuaPeringatan].map((w) => `• ${w}`).join('<br>');
    }
    kemajuan.hidden = true;
    el('tombol-buat').disabled = false;
  } catch (err) {
    tampilPesan(aturBahasaError(err));
    kemajuan.hidden = true;
    el('tombol-buat').disabled = false;
  }
}

init();
