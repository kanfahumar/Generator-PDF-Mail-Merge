/**
 * Alur kerja utama aplikasi web.
 */

import { bacaCsv, GalatCsv } from './csv.js';
import { muatTemplate, buatPdfUndangan, GalatPdf } from './pdf.js';
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
      if (panel.kotak.length === 0) {
        panel.tambahKotak('nama');
        if (panel.selectKolom.querySelector('option[value="alamat"]')) {
          const k2 = panel.tambahKotak('alamat');
          k2.y = k2.y + k2.tinggi + 30;
        }
        panel.terpilih = 0;
        panel.refresh();
      }
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

function periksaSiapBuat() {
  const siap = template && fontBytes && daftarTamu.length > 0 && panel?.kotak.length > 0;
  el('tombol-buat').disabled = !siap;
}

async function buatUndangan() {
  if (!template || !fontBytes || !daftarTamu.length || !panel) return;
  const kotak = panel.getKotak();
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
  const total = daftarTamu.length;

  try {
    for (let i = 0; i < daftarTamu.length; i++) {
      const t = daftarTamu[i];
      const nilai = { ...t.nilai };
      const stem = ambilNama.ambil(t.nama, t.nomor);
      const pdfBytes = await buatPdfUndangan(template, kotak, fontBytes, nilai);
      const namaBerkas = pakaiNamaTamu ? `${stem}.pdf` : `undangan-${t.nomor}.pdf`;
      berkasZip.push({ nama: namaBerkas, data: pdfBytes });
      berhasil += 1;
      const persen = Math.round((berhasil / total) * 100);
      batang.style.width = `${persen}%`;
      teksKemajuan.textContent = `Memproses ${berhasil}/${total} tamu… (${persen}%)`;
    }
    const zipBytes = buatZip(berkasZip);
    const namaZip = namaZipUntuk('undangan');
    unduh(zipBytes, namaZip);
    hasil.hidden = false;
    hasil.innerHTML = `Berhasil! <strong>${berhasil}</strong> undangan dikemas ke <code>${namaZip}</code> dan diunduh ke folder Downloads.`;
    kemajuan.hidden = true;
    el('tombol-buat').disabled = false;
  } catch (err) {
    tampilPesan(aturBahasaError(err));
    kemajuan.hidden = true;
    el('tombol-buat').disabled = false;
  }
}

init();
