import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs/promises';
import {
  muatTemplate,
  gambarUndangan,
  buatPdfUndangan,
  pratinjauTamu,
  ukuranHalamanPt,
} from '../src/pdf.js';

const FONT = process.env.FONT_TTF ?? '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';

async function templateA4() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('UNDANGAN', {
    x: 240,
    y: 750,
    size: 24,
    font: await doc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.1, 0.1, 0.1),
  });
  return doc.save();
}

function kotakAwal(nama = 'Budi Santoso') {
  return {
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
    teks: nama,
  };
}

describe('muatTemplate', () => {
  it('membaca berkas dan mengembalikan ukuran halaman', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    expect(tpl.jumlahHalaman).toBe(1);
    expect(tpl.lebar).toBeCloseTo(595.28, 1);
    expect(tpl.tinggi).toBeCloseTo(841.89, 1);
  });

  it('menolak berkas yang bukan PDF', async () => {
    await expect(muatTemplate(new File(['bukan pdf'], 'x.pdf'))).rejects.toThrow(
      /PDF/i
    );
  });
});

describe('gambarUndangan', () => {
  it('menulis teks ke dalam halaman', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await gambarUndangan(tpl, [kotakAwal()], fontBytes, {
      nama: 'Budi Santoso',
    });
    const isi = hasil.teksTercetak.join(' ');
    expect(isi).toContain('Budi Santoso');
  });

  it('menyimpan peringatan ketika teks tidak muat', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const k = { ...kotakAwal('Budi Santoso Wibowo Prakoso'), lebar: 40, tinggi: 12, minUkuran: 18 };
    const hasil = await gambarUndangan(tpl, [k], fontBytes, {
      nama: 'Budi Santoso Wibowo Prakoso',
    });
    expect(hasil.peringatan.length).toBeGreaterThan(0);
  });

  it('melewati kotak yang kuncinya tidak ada di data', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await gambarUndangan(tpl, [kotakAwal()], fontBytes, { alamat: 'Jl. 1' });
    expect(hasil.teksTercetak).toEqual([]);
    expect(hasil.peringatan).toEqual([]);
  });

  it('memberi peringatan untuk huruf yang tidak didukung font', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await gambarUndangan(tpl, [kotakAwal()], fontBytes, {
      nama: 'Budi ☃',
    });
    expect(hasil.peringatan.join(' ')).toMatch(/☃|tidak punya huruf/i);
  });

  it('menjaga isi template tetap utuh', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await gambarUndangan(tpl, [kotakAwal()], fontBytes, {
      nama: 'Budi',
    });
    // template harus tetap utuh: halaman minimal masih ada
    const doc = await PDFDocument.load(await hasil.doc.save());
    expect(doc.getPageCount()).toBe(1);
    expect(hasil.teksTercetak.join(' ')).toContain('Budi');
  });
});

describe('buatPdfUndangan', () => {
  it('menghasilkan PDF dengan jumlah halaman sama seperti template', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await buatPdfUndangan(tpl, [kotakAwal()], fontBytes, {
      nama: 'Budi',
    });
    const doc = await PDFDocument.load(hasil);
    expect(doc.getPageCount()).toBe(1);
  });

  it('tidak menggambar garis atau kotak', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await buatPdfUndangan(tpl, [kotakAwal()], fontBytes, {
      nama: 'Budi Santoso',
    });
    const doc = await PDFDocument.load(hasil);
    const stream = doc.getPage(0).getContentStream().toString();
    // Kotak/garis memakai operator re (rectangle) di content stream
    expect(stream).not.toMatch(/\bre\b[\s\n]/);
  });
});

describe('ukuranHalamanPt', () => {
  it('mengembalikan ukuran halaman pertama', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const ukuran = ukuranHalamanPt(tpl, 0);
    expect(ukuran.lebar).toBeCloseTo(595.28, 1);
    expect(ukuran.tinggi).toBeCloseTo(841.89, 1);
  });
});

describe('pratinjauTamu', () => {
  it('mengembalikan kotak dengan teks contoh terisi', async () => {
    const bytes = await templateA4();
    const tpl = await muatTemplate(new File([bytes], 'undangan.pdf'));
    const fontBytes = await fs.readFile(FONT);
    const hasil = await pratinjauTamu(
      tpl,
      [kotakAwal()],
      fontBytes,
      { nama: 'Budi Santoso Wibowo Prakoso' },
      { nama: 'Budi Santoso Wibowo Prakoso' }
    );
    expect(hasil.teksTercetak.join(' ')).toContain('Budi Santoso Wibowo Prakoso');
  });
});
