/**
 * Modul pembuatan PDF: membaca template, menempelkan teks di atasnya, dan
 * menulis berkas PDF.
 *
 * Prinsip penting: kotak teks TIDAK PERNAH digambar. Tidak ada drawRectangle,
 * tidak ada garis. Yang dicetak hanya teksnya.
 */

import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  jenisHanyaSpasi,
  hurufTakDidukung,
  posisiXCenter,
  posisiYCenter,
  tinggiTeks,
  ukurFont,
} from './teks.js';

const DPI_PREVIEW = 96;
const PT_PER_INCH = 72;

export class GalatPdf extends Error {
  constructor(pesan) {
    super(pesan);
    this.name = 'GalatPdf';
  }
}

/**
 * Baca file PDF template.
 * @returns {{ bytes: Uint8Array, jumlahHalaman: number, lebar: number, tinggi: number }}
 */
export async function muatTemplate(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new GalatPdf(`File "${file.name ?? 'template.pdf'}" kosong.`);
  }
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const halaman = doc.getPage(0);
    const { width, height } = halaman.getSize();
    return {
      bytes,
      jumlahHalaman: doc.getPageCount(),
      lebar: width,
      tinggi: height,
    };
  } catch (err) {
    throw new GalatPdf(
      `File "${file.name ?? 'template.pdf'}" tidak bisa dibaca sebagai PDF. ` +
        `Pastikan berkas itu PDF yang benar dan tidak diproteksi kata sandi. ` +
        `Detail: ${err.message}`
    );
  }
}

/** Ukuran halaman tertentu dalam point. */
export function ukuranHalamanPt(template, index = 0) {
  if (index >= template.jumlahHalaman) {
    throw new GalatPdf(
      `Halaman ${index + 1} tidak ada. File PDF Anda hanya punya ${template.jumlahHalaman} halaman.`
    );
  }
  return { lebar: template.lebar, tinggi: template.tinggi };
}

/** "#RRGGBB" -> objek warna rgb() milik pdf-lib (nilai 0..1). */
export function warnaKeRgb(warna) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(warna ?? '').trim());
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Kotak yang meleset dari batas halaman dilangkan ke dalam halaman. */
function jepitKotak(k, lebarHalaman, tinggiHalaman) {
  const lebar = Math.max(1, Math.min(k.lebar, lebarHalaman));
  const tinggi = Math.max(1, Math.min(k.tinggi, tinggiHalaman));
  const x = Math.max(0, Math.min(k.x, lebarHalaman - lebar));
  const y = Math.max(0, Math.min(k.y, tinggiHalaman - tinggi));
  return { ...k, x, y, lebar, tinggi };
}

/**
 * Tempelkan teks ke dalam dokumen (tidak menulis berkas).
 *
 * @returns {{ doc: PDFDocument, teksTercetak: string[], peringatan: string[] }}
 */
export async function gambarUndangan(template, kotak, fontBytes, data) {
  const doc = await PDFDocument.load(template.bytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  // PDFFont milik pdf-lib tidak membuka fontkit-nya, jadi buat salinan
  // terpisah hanya untuk memeriksa glyph yang hilang.
  let cekGlyph = null;
  try {
    cekGlyph = fontkit.create(fontBytes);
  } catch {
    cekGlyph = null;
  }

  const teksTercetak = [];
  const peringatan = [];

  for (const kotakRaw of kotak) {
    const k = kotakRaw;
    if (!Object.prototype.hasOwnProperty.call(data, k.kunci)) continue;

    const teks = String(data[k.kunci] ?? '');
    if (jenisHanyaSpasi(teks)) continue;

    if (k.halaman >= template.jumlahHalaman) {
      peringatan.push(
        `Kotak "${k.kunci}" menunjuk halaman ${k.halaman + 1}, tapi PDF hanya punya ${template.jumlahHalaman} halaman.`
      );
      continue;
    }

    const halaman = doc.getPage(k.halaman);
    const { width: lw, height: lh } = halaman.getSize();
    const j = jepitKotak(k, lw, lh);

    const hasil = ukurFont(
      teks,
      font,
      j.lebar,
      j.tinggi,
      j.ukuran,
      j.minUkuran ?? 6,
      j.jarakBaris ?? 1.2
    );

    if (!hasil.muat) {
      peringatan.push(
        `Tamu "${k.kunci}" teksnya terlalu panjang untuk kotaknya sehingga mungkin terpotong. Perbesar kotak "${k.kunci}" atau kecilkan ukuran hurufnya.`
      );
    }

    const tanpa = cekGlyph ? hurufTakDidukung(teks, cekGlyph) : [];
    if (tanpa.length > 0) {
      peringatan.push(
        `Font yang dipilih tidak punya huruf: ${tanpa.join(' ')}. Teks "${kunciRingkas(teks)}" mungkin tidak terbaca sempurna.`
      );
    }

    const yAwal = posisiYCenter(
      hasil.baris,
      j.y,
      j.tinggi,
      hasil.ukuran,
      j.jarakBaris ?? 1.2
    );
    const warna = warnaKeRgb(j.warna);

    hasil.baris.forEach((baris, i) => {
      if (baris.trim() === '') return;
      const x = posisiXCenter(baris, font, j.x, j.lebar, hasil.ukuran);
      const y = yAwal + i * hasil.ukuran * (j.jarakBaris ?? 1.2);
      halaman.drawText(baris, {
        x,
        y,
        size: hasil.ukuran,
        font,
        color: warna,
      });
      teksTercetak.push(baris);
    });
  }

  return { doc, teksTercetak, peringatan };
}

function kunciRingkas(teks) {
  const t = String(teks ?? '').trim();
  return t.length > 30 ? `${t.slice(0, 30)}...` : t;
}

/** Buat satu berkas PDF undangan. Mengembalikan Uint8Array. */
export async function buatPdfUndangan(template, kotak, fontBytes, data) {
  const { doc } = await gambarUndangan(template, kotak, fontBytes, data);
  return doc.save({ useObjectStreams: false });
}

/**
 * Pratinjau: kembalikan Data URL PNG halaman pertama setelah teks ditempel,
 * supaya panel bisa menampilkan hasil yang sama persis dengan PDF akhir.
 */
export async function pratinjauTamu(template, kotak, fontBytes, data) {
  const { doc, teksTercetak, peringatan } = await gambarUndangan(
    template,
    kotak,
    fontBytes,
    data
  );
  const halaman = doc.getPage(kotak[0]?.halaman ?? 0);
  const png = await renderPng(doc, halaman);
  return { pngUrl: `data:image/png;base64,${png}`, teksTercetak, peringatan };
}

/** Render satu halaman ke PNG base64 (tanpa prefix data URL). */
export async function renderPng(doc, halaman) {
  if (!halaman) throw new GalatPdf('Halaman tidak ditemukan untuk pratinjau.');
  const bytes = await doc.save({ useObjectStreams: false });
  let biner = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    biner += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(biner);
}

export { PT_PER_INCH, DPI_PREVIEW, degrees };
