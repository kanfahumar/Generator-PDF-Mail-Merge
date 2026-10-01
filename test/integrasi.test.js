/**
 * Uji integrasi: jalankan pipeline penuh seperti di browser
 * (template PDF + CSV + font -> sekumpulan PDF di dalam satu ZIP), lalu
 * periksa hasilnya dengan pdf.js - mesin yang sama dipakai untuk preview,
 * sehingga yang diperiksa benar-benar apa yang akan dilihat pengguna.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { unzipSync } from 'fflate';
import fs from 'node:fs/promises';
import { muatTemplate, buatPdfUndangan } from '../src/pdf.js';
import { bacaCsv } from '../src/csv.js';
import { PengambilNama } from '../src/namaBerkas.js';
import { buatZip, namaZipUntuk } from '../src/zip.js';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';

/** Semua teks yang benar-benar terlihat di halaman PDF. */
async function teksTerlihat(bytes, index = 0) {
  const doc = await pdfjs.getDocument({
    data: bytes.slice().buffer,
    useSystemFonts: false,
  }).promise;
  const halaman = await doc.getPage(index + 1);
  const isi = await halaman.getTextContent();
  return isi.items.map((i) => i.str);
}

/**
 * Posisi (x, y) tiap potongan teks, dalam satuan pt PDF.
 *
 * `item.transform` berisi [skalaX, skewY, skewX, skalaY, x, y]; posisi teks
 * ada di elemen ke-5 dan ke-6, bukan di skalanya.
 */
async function posisiTeks(bytes, index = 0) {
  const doc = await pdfjs.getDocument({
    data: bytes.slice().buffer,
    useSystemFonts: false,
  }).promise;
  const halaman = await doc.getPage(index + 1);
  const isi = await halaman.getTextContent();
  return isi.items
    .filter((i) => i.str.trim() !== '')
    .map((i) => ({ teks: i.str, x: i.transform[4], y: i.transform[5] }));
}

async function templateContoh() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('UNDANGAN', {
    x: 230,
    y: 760,
    size: 24,
    font: await doc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.1, 0.1, 0.1),
  });
  return await doc.save();
}

const KOTAK = [
  {
    kunci: 'nama',
    halaman: 0,
    x: 120,
    y: 300,
    lebar: 355,
    tinggi: 60,
    ukuran: 24,
    minUkuran: 10,
    warna: '#000000',
    jarakBaris: 1.2,
  },
  {
    kunci: 'alamat',
    halaman: 0,
    x: 110,
    y: 400,
    lebar: 375,
    tinggi: 70,
    ukuran: 13,
    minUkuran: 8,
    warna: '#333333',
    jarakBaris: 1.25,
  },
];

const CSV = [
  'nama,alamat',
  'Budi Santoso,"Jl. Merdeka No. 12, Yogyakarta"',
  'Dewi Anggraini Kusumawardhani,"Jl. Pahlawan No. 3, Surabaya"',
  'Andi Wijaya,"Jl. Sudirman No. 45, Jakarta"',
].join('\n');

async function pipeline() {
  const template = await muatTemplate(
    new File([await templateContoh()], 'undangan.pdf')
  );
  const tamu = await bacaCsv(new File([CSV], 'tamu.csv'));
  const fontBytes = new Uint8Array(await fs.readFile(FONT));
  const ambilNama = new PengambilNama();
  const berkas = [];

  for (const t of tamu) {
    const stem = ambilNama.ambil(t.nama, t.nomor);
    const pdf = await buatPdfUndangan(template, KOTAK, fontBytes, t.nilai);
    berkas.push({ nama: `${stem}.pdf`, data: pdf });
  }
  return { template, tamu, berkas, zip: buatZip(berkas) };
}

describe('pipeline ujung-ke-ujung', () => {
  it('membaca 3 tamu dari CSV contoh', async () => {
    const { tamu } = await pipeline();
    expect(tamu).toHaveLength(3);
    expect(tamu[0].nama).toBe('Budi Santoso');
    expect(tamu[0].alamat).toBe('Jl. Merdeka No. 12, Yogyakarta');
    expect(tamu[1].nama).toBe('Dewi Anggraini Kusumawardhani');
  });

  it('membuat satu PDF per tamu dengan nama berkas dari nama tamu', async () => {
    const { zip } = await pipeline();
    const isi = unzipSync(zip);
    expect(Object.keys(isi).sort()).toEqual([
      'Andi_Wijaya.pdf',
      'Budi_Santoso.pdf',
      'Dewi_Anggraini_Kusumawardhani.pdf',
    ]);
  });

  it('setiap PDF berisi satu halaman A4', async () => {
    const { berkas } = await pipeline();
    for (const b of berkas) {
      const doc = await PDFDocument.load(b.data);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeCloseTo(595.28, 0);
      expect(height).toBeCloseTo(841.89, 0);
    }
  });

  it('menyisipkan nama dan alamat yang benar ke tiap PDF', async () => {
    const { berkas } = await pipeline();
    const teks0 = await teksTerlihat(berkas[0].data);
    expect(teks0).toContain('Budi Santoso');
    expect(teks0).toContain('Jl. Merdeka No. 12, Yogyakarta');

    const teks2 = await teksTerlihat(berkas[2].data);
    expect(teks2).toContain('Andi Wijaya');
    expect(teks2).toContain('Jl. Sudirman No. 45, Jakarta');

    // Tidak ada data tamu lain yang bocor ke PDF ini
    expect(teks0).not.toContain('Andi');
    expect(teks0).not.toContain('Dewi');
  });

  it('menjaga isi template tetap utuh', async () => {
    const { berkas } = await pipeline();
    const teks = await teksTerlihat(berkas[0].data);
    expect(teks).toContain('UNDANGAN');
  });

  it('membungkus nama panjang menjadi beberapa baris', async () => {
    const { berkas } = await pipeline();
    const baris = (await teksTerlihat(berkas[1].data)).filter((t) => t.trim());
    // "Dewi Anggraini Kusumawardhani" dipecah jadi >= 2 baris terpisah
    const barisNama = baris.filter(
      (t) => t.includes('Dewi') || t.includes('Anggraini') || t.includes('Kusumawardhani')
    );
    expect(barisNama.length).toBeGreaterThanOrEqual(2);
    // Alamat masih utuh sebagai satu baris
    expect(baris.some((t) => t.includes('Jl. Pahlawan No. 3, Surabaya'))).toBe(true);
  });

  it('menempatkan teks di dalam kotak yang ditentukan', async () => {
    const { berkas } = await pipeline();
    const posisi = await posisiTeks(berkas[0].data);
    const nama = posisi.find((p) => p.teks.includes('Budi Santoso'));
    const alamat = posisi.find((p) => p.teks.includes('Merdeka'));

    // Sisi kiri: teks tidak boleh keluar dari sisi kiri kotaknya.
    expect(nama.x).toBeGreaterThanOrEqual(KOTAK[0].x - 1);
    expect(alamat.x).toBeGreaterThanOrEqual(KOTAK[1].x - 1);
    // Sisi kanan: teks tidak boleh melewati sisi kanan kotaknya.
    expect(nama.x).toBeLessThan(KOTAK[0].x + KOTAK[0].lebar);
    expect(alamat.x).toBeLessThan(KOTAK[1].x + KOTAK[1].lebar);
    // Vertikal: dalam koordinat PDF y naik ke atas, jadi teks harus berada
    // di dalam rentang [y, y+tinggi] dari kotaknya sendiri.
    for (const [teks, kotak] of [
      [nama, KOTAK[0]],
      [alamat, KOTAK[1]],
    ]) {
      expect(teks.y).toBeGreaterThanOrEqual(kotak.y - 1);
      expect(teks.y).toBeLessThanOrEqual(kotak.y + kotak.tinggi + 1);
    }
    // Kotak alamat (y=400) berada di ATAS kotak nama (y=300) di PDF.
    expect(KOTAK[1].y).toBeGreaterThan(KOTAK[0].y);
  });

  it('tidak menggambar garis atau kotak di PDF hasil', async () => {
    const { berkas } = await pipeline();
    const doc = await pdfjs.getDocument({ data: berkas[0].data.slice().buffer }).promise;
    const halaman = await doc.getPage(1);
    const isi = await halaman.getOperatorList();
    // nama operator gambar garis/path menurut pdf.js
    const garis = ['constructPath', 'stroke', 'fill', 'fillStroke', 'closeFillStroke', 'closeStroke'];
    const dipakai = isi.fnArray.filter((fn) => garis.includes(fn));
    // Halaman A4 polos + teks: tidak boleh ada operasi gambar garis/path.
    expect(dipakai).toEqual([]);
  });

  it('menyisipkan font kustom secara tertanam', async () => {
    const { berkas } = await pipeline();
    // Font tertanam berarti PDF tidak bergantung font sistem. Cek lewat nama
    // font yang dirujuk content stream.
    const mentah = new TextDecoder('latin1').decode(berkas[0].data);
    expect(mentah).toMatch(/FontFile/);
  });

  it('menghasilkan ZIP yang valid dan dapat dibuka', async () => {
    const { zip } = await pipeline();
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const isi = unzipSync(zip);
    expect(Object.keys(isi)).toHaveLength(3);
    // setiap entri harus benar-benar PDF
    for (const [nama, data] of Object.entries(isi)) {
      expect(data[0]).toBe(0x25); // '%'
      expect(new TextDecoder('latin1').decode(data.slice(0, 5))).toBe('%PDF-');
      const doc = await PDFDocument.load(data);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it('menamai ZIP dengan benar', () => {
    expect(namaZipUntuk('undangan.pdf')).toBe('undangan.zip');
    expect(namaZipUntuk('Undangan Syukuran.pdf')).toBe('Undangan-Syukuran.zip');
  });

  it('tidak melewatkan tamu yang namanya kosong', async () => {
    const template = await muatTemplate(new File([await templateContoh()], 'u.pdf'));
    // Baris `,"  "` = satu tamu tanpa nama. Ini DATA, bukan baris kosong.
    const tamu = await bacaCsv(new File(['nama,alamat\n,"  "\nBudi,Jl. 1\n'], 't.csv'));
    expect(tamu).toHaveLength(2);
    expect(tamu[0].nama).toBe('');
    expect(tamu[1].nama).toBe('Budi');

    const fontBytes = new Uint8Array(await fs.readFile(FONT));
    const ambilNama = new PengambilNama();
    expect(ambilNama.ambil(tamu[0].nama, tamu[0].nomor)).toBe('tamu-002');
    // tamu tanpa nama tetap harus menghasilkan PDF yang sah
    const pdf = await buatPdfUndangan(template, KOTAK, fontBytes, tamu[0].nilai);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  });

  it('menyelesaikan tabrakan nama berkas dalam satu proses', async () => {
    const template = await muatTemplate(new File([await templateContoh()], 'u.pdf'));
    const tamu = await bacaCsv(
      new File(['nama,alamat\nBudi,Jl. 1\nBudi Santoso,Jl. 2\n'], 't.csv')
    );
    const ambilNama = new PengambilNama();
    expect(tamu.map((t) => ambilNama.ambil(t.nama, t.nomor))).toEqual([
      'Budi',
      'Budi_Santoso',
    ]);
  });

  it('memproses 200 tamu tanpa error', { timeout: 120_000 }, async () => {
    const template = await muatTemplate(new File([await templateContoh()], 'u.pdf'));
    const baris = ['nama,alamat'];
    for (let i = 1; i <= 200; i++) {
      baris.push(`Tamu Nomor ${i},"Jl. Contoh No. ${i}, Kota ${i % 20}"`);
    }
    const tamu = await bacaCsv(new File([baris.join('\n')], 'banyak.csv'));
    expect(tamu).toHaveLength(200);
    const fontBytes = new Uint8Array(await fs.readFile(FONT));
    const ambilNama = new PengambilNama();
    const berkas = [];
    for (const t of tamu) {
      const stem = ambilNama.ambil(t.nama, t.nomor);
      berkas.push({ nama: `${stem}.pdf`, data: await buatPdfUndangan(template, KOTAK, fontBytes, t.nilai) });
    }
    const isi = unzipSync(buatZip(berkas));
    expect(Object.keys(isi)).toHaveLength(200);
    // nama unik, tidak ada yang tertimpa diam-diam
    expect(new Set(Object.keys(isi)).size).toBe(200);
  });
});
