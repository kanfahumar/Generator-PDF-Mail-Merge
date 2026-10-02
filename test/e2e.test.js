/**
 * Pengujian end-to-end di browser sungguhan (Brave).
 *
 * Menjalankan aplikasi lewat Vite seperti yang dilakukan pengguna, lalu:
 *   1. mengunggah PDF template, CSV tamu, dan file font
 *   2. memastikan kotak tulisan benar-benar terbentuk
 *   3. klik-tarik untuk membuat kotak seperti pengguna
 *   4. menekan tombol "Buat Undangan" dan menangkap berkas ZIP
 *   5. MEMBUKA PDF di dalam ZIP lalu memastikan nama & alamat benar-benar
 *      tercetak (dibaca dengan pdf.js, sama seperti yang dilakukan pengguna)
 *
 * Jalankan: npx playwright-core ad-hoc lewat test/e2e.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright-core';
import { unzipSync } from 'fflate';
import fs from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173/';
const BRAVE = '/opt/brave.com/brave/brave';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const CSV_TAMU = [
  'nama,alamat',
  'Budi Santoso Wibowo,"Jl. Merdeka No. 12, RT 03 RW 05, Yogyakarta"',
  'Dewi Anggraini Kusumawardhani,"Jl. Pahlawan No. 3, Surabaya"',
  'Andi Wijaya,"Jl. Sudirman No. 45, Jakarta"',
].join('\n');

/** Template A4 dengan penanda kotak, mirip berkas contoh. */
async function templateContoh() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('UNDANGAN', { x: 230, y: 760, size: 24, font: f, color: rgb(0.1, 0.1, 0.1) });
  return doc.save();
}

/** Teks yang benar-benar terlihat di PDF (persis yang dilihat pengguna). */
async function teksTerlihat(bytes) {
  const doc = await pdfjs.getDocument({
    data: bytes.slice().buffer,
    useSystemFonts: false,
  }).promise;
  const isi = await (await doc.getPage(1)).getTextContent();
  return isi.items.map((i) => i.str).filter((s) => s.trim());
}

let browser;
let errors = [];

beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: BRAVE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('end-to-end di Brave', () => {
  it('pengguna bisa membuat undangan berisi nama & alamat dan mengunduh ZIP', async () => {
    // Berkas sementara
    const tmp = await fs.mkdtemp('/tmp/opencode/e2e-');
    const pdfPath = `${tmp}/undangan.pdf`;
    const csvPath = `${tmp}/tamu.csv`;
    await fs.writeFile(pdfPath, await templateContoh());
    await fs.writeFile(csvPath, CSV_TAMU);

    const konteks = await browser.newContext({ acceptDownloads: true });
    const page = await konteks.newPage();

    // Semua pesan error browser harus tercatat; ini bagian yang sering
    // menjadi penyebab bug tidak terlihat.
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    // Catat URL yang gagal agar 404 bisa ditelusuri, bukan sekadar "Not Found".
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(BASE, { waitUntil: 'networkidle' });

    // --- Langkah 1-3: pilih tiga berkas -----------------------------------
    await page.setInputFiles('#input-pdf', pdfPath);
    await page.waitForFunction(
      () => document.getElementById('tombol-buat')?.dataset.pdf === 'siap' ||
            document.getElementById('info-pdf')?.textContent?.includes('halaman'),
      null,
      { timeout: 30_000 }
    );

    await page.setInputFiles('#input-csv', csvPath);
    await page.setInputFiles('#input-font', FONT);

    // Tunggu tombol aktif
    await page.waitForFunction(
      () => !document.getElementById('tombol-buat').disabled,
      null,
      { timeout: 30_000 }
    );

    // --- Kotak otomatis harus terbentuk ----------------------------------
    // Setelah PDF DAN CSV terpasang, aplikasi harus membuat kotak sendiri.
    // Tanpa ini tombol "Buat Undangan" tidak pernah aktif dan app tak terpakai.
    const jumlahKotakOtomatis = await page.locator('#kontainer-kotak .kotak').count();
    expect(
      jumlahKotakOtomatis,
      'tidak ada kotak otomatis dibuat setelah PDF + CSV dipilih'
    ).toBeGreaterThanOrEqual(2);

    // Setiap kolom CSV harus punya kotak
    const jumlahKolom = await page.locator('#pilih-kolom option').count();
    expect(jumlahKotakOtomatis).toBeGreaterThanOrEqual(jumlahKolom);

    // Preview PDF harus benar-benar tergambar (bukan kanvas kosong)
    const kanvasBerisi = await page.evaluate(() => {
      const k = document.getElementById('kanvas');
      if (!k || !k.width || !k.height) return { ok: false, w: 0, h: 0 };
      const ctx = k.getContext('2d');
      const data = ctx.getImageData(0, 0, k.width, k.height).data;
      let nonPutih = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonPutih++;
      }
      return { ok: nonPutih > 500, w: k.width, h: k.height, nonPutih };
    });
    expect(kanvasBerisi.ok, `kanvas preview kosong: ${JSON.stringify(kanvasBerisi)}`).toBe(true);

    // --- Klik-tarik untuk membuat kotak baru (yang dulu tidak tersimpan) ---
    await page.locator('#kanvas').scrollIntoViewIfNeeded();
    const kertas = await page.locator('#kanvas').boundingBox();
    // Pastikan titik-titik drag benar-benar berada di dalam viewport.
    const vp = page.viewportSize();
    if (kertas.y + kertas.height > vp.height) {
      await page.mouse.wheel(0, kertas.y + kertas.height - vp.height + 20);
      await page.waitForTimeout(300);
    }
    const kertas2 = await page.locator('#kanvas').boundingBox();
    expect(kertas2.y, 'kanvas di luar viewport').toBeGreaterThanOrEqual(0);
    expect(kertas2.y + kertas2.height, 'kanvas exceed viewport').toBeLessThanOrEqual(vp.height + 1);
    await page.mouse.move(kertas2.x + 120, kertas2.y + 120);
    await page.mouse.down();
    await page.mouse.move(kertas2.x + 520, kertas2.y + 170, { steps: 12 });
    await page.mouse.up();

    const jumlahKotakSetelahTarik = await page.locator('#kontainer-kotak .kotak').count();
    expect(
      jumlahKotakSetelahTarik,
      'kotak hasil klik-tarang hilang setelah mouse dilepas'
    ).toBe(jumlahKotakOtomatis + 1);

    // --- Tekan tombol dan tangkap unduhan ---------------------------------
    const [unduhan] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      page.click('#tombol-buat'),
    ]);

    const zipPath = `${tmp}/hasil.zip`;
    await unduhan.saveAs(zipPath);
    expect(unduhan.suggestedFilename()).toMatch(/\.zip$/);

    // --- Periksa isi ZIP: PDF-nya benar-benar berisi nama & alamat -------
    const isiZip = unzipSync(new Uint8Array(await fs.readFile(zipPath)));
    const namaBerkas = Object.keys(isiZip).sort();
    expect(namaBerkas).toEqual([
      'Andi_Wijaya.pdf',
      'Budi_Santoso_Wibowo.pdf',
      'Dewi_Anggraini_Kusumawardhani.pdf',
    ]);

    for (const [nama, data] of Object.entries(isiZip)) {
      const teks = await teksTerlihat(data);
      const gabung = teks.join(' ');
      expect(gabung, `${nama} tidak memuat template`).toContain('UNDANGAN');
      expect(gabung, `${nama} tidak memuat nama tamu`).toMatch(/Budi Santoso|Dewi Anggraini|Andi Wijaya/);
      expect(gabung, `${nama} tidak memuat alamat`).toMatch(/Merdeka No|Pahlawan No|Sudirman No/);
    }

    // Tidak boleh ada pesan error browser
    expect(errors, `error di konsol browser: ${errors.join(' | ')}`).toEqual([]);

    await fs.rm(tmp, { recursive: true, force: true });
    await konteks.close();
  }, 300_000);

  it('membuat kotak otomatis walau PDF selesai dimuat sebelum CSV dipilih', async () => {
    // Race condition: kotak hanya pernah dibuat kalau CSV kebetulan sudah
    // dimuat saat preview PDF selesai dirender. Urutan di sini sudah
    // dipastikan: PDF selesai total dulu, baru CSV.
    const tmp = await fs.mkdtemp('/tmp/opencode/e2e2-');
    const pdfPath = `${tmp}/undangan.pdf`;
    const csvPath = `${tmp}/tamu.csv`;
    await fs.writeFile(pdfPath, await templateContoh());
    await fs.writeFile(csvPath, CSV_TAMU);

    const konteks = await browser.newContext({ acceptDownloads: true });
    const page = await konteks.newPage();

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.setInputFiles('#input-pdf', pdfPath);
    // Tunggu preview benar-benar selesai: kanvas tergambar dan tidak ada kotak
    await page.waitForFunction(
      () => document.getElementById('kanvas').width > 0,
      null,
      { timeout: 30_000 }
    );
    await page.waitForTimeout(2500);

    await page.setInputFiles('#input-csv', csvPath);
    await page.waitForTimeout(2500);

    const jumlah = await page.locator('#kontainer-kotak .kotak').count();
    const jumlahKolom = await page.locator('#pilih-kolom option').count();
    expect(
      jumlah,
      `PDF selesai dulu lalu CSV dipilih -> hanya ${jumlah} kotak untuk ${jumlahKolom} kolom`
    ).toBeGreaterThanOrEqual(jumlahKolom);

    await page.setInputFiles('#input-font', FONT);
    await page.waitForFunction(
      () => !document.getElementById('tombol-buat').disabled,
      null,
      { timeout: 20_000 }
    );

    await fs.rm(tmp, { recursive: true, force: true });
    await konteks.close();
  }, 120_000);
});
