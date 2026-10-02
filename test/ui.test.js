/**
 * Uji lapisan UI: PanelKotak memakai DOM sungguhan (happy-dom) supaya alur
 * yang dipakai browser - pilih kolom, tambah kotak, klik-tarik - bisa diuji
 * tanpa browser.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Window } from 'happy-dom';
import fs from 'node:fs/promises';
import { muatTemplate, gambarUndangan } from '../src/pdf.js';
import { bacaCsv } from '../src/csv.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// pdf.js butuh DOM saat diimpor, jadi happy-dom harus dipasang lebih dulu.
const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLCanvasElement = win.HTMLCanvasElement;
globalThis.HTMLSelectElement = win.HTMLSelectElement;
globalThis.Node = win.Node;
globalThis.Event = win.Event;

const { PanelKotak } = await import('../src/ui.js');

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

function buatPanel() {
  document.body.innerHTML = `
    <canvas id="kanvas"></canvas>
    <div id="kontainer-kotak"></div>
    <select id="pilih-kolom"></select>
    <div id="baris-properti" hidden>
      <input id="input-ukuran" type="range" value="24" />
      <input id="input-min-ukuran" type="number" value="10" />
      <input id="input-warna" type="color" value="#000000" />
      <input id="input-jarak-baris" type="number" value="1.2" />
    </div>`;
  const p = new PanelKotak({
    kanvas: document.getElementById('kanvas'),
    kontainer: document.getElementById('kontainer-kotak'),
    selectKolom: document.getElementById('pilih-kolom'),
    inputUkuran: document.getElementById('input-ukuran'),
    inputMinUkuran: document.getElementById('input-min-ukuran'),
    inputWarna: document.getElementById('input-warna'),
    inputJarakBaris: document.getElementById('input-jarak-baris'),
    barisProperti: document.getElementById('baris-properti'),
  });
  // Kanvas tidak punya konteks 2D di happy-dom; beri yang palsu.
  document.getElementById('kanvas').getContext = () => ({
    setTransform() {}, save() {}, restore() {}, scale() {}, rotate() {},
    translate() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    stroke() {}, fill() {}, fillRect() {}, clearRect() {}, setLineDash() {},
    drawImage() {}, save() {}, rect() {}, clip() {}, fillText() {},
  });
  return p;
}

let template;
let tamu;
let fontBytes;

/** Template A4 dibuat sendiri supaya test tidak bergantung berkas luar repo. */
async function templateA4() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('UNDANGAN', { x: 230, y: 760, size: 24, font: f, color: rgb(0.1, 0.1, 0.1) });
  return doc.save();
}

const CSV_CONTOH = [
  'nama,alamat',
  'Budi Santoso Wibowo,"Jl. Merdeka No. 12, RT 03 RW 05, Yogyakarta"',
  'Dewi Anggraini Kusumawardhani,"Jl. Pahlawan No. 3, Surabaya"',
  'Andi Wijaya,"Jl. Sudirman No. 45, Jakarta"',
].join('\n');

beforeAll(async () => {
  template = await muatTemplate(new File([await templateA4()], 'undangan.pdf'));
  tamu = await bacaCsv(new File([CSV_CONTOH], 'tamu.csv'));
  fontBytes = new Uint8Array(await fs.readFile(FONT));
});

describe('PanelKotak', () => {
  it('menyimpan ukuran halaman template', () => {
    const p = buatPanel();
    p.setTemplate(template);
    expect(p.lebarHalamanPt).toBe(595.28);
    expect(p.tinggiHalamanPt).toBe(841.89);
  });

  it('membuat kotak default di dalam halaman saat kunci valid', () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    const k = p.tambahKotak('nama');
    expect(k.kunci).toBe('nama');
    expect(k.lebar).toBeGreaterThan(100);
    expect(k.tinggi).toBeGreaterThan(10);
    // kotak harus berada di dalam halaman
    expect(k.x).toBeGreaterThanOrEqual(0);
    expect(k.x + k.lebar).toBeLessThanOrEqual(595.28);
    expect(k.y).toBeGreaterThanOrEqual(0);
    expect(k.y + k.tinggi).toBeLessThanOrEqual(841.89);
  });

  it('getKotak mengembalikan kunci yang bisa dipakai pdf.js', async () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    p.tambahKotak('nama');
    p.tambahKotak('alamat');

    const kotak = p.getKotak();
    expect(kotak).toHaveLength(2);
    expect(kotak[0].kunci).toBe('nama');
    expect(kotak[1].kunci).toBe('alamat');

    const { teksTercetak, peringatan } = await gambarUndangan(
      template,
      kotak,
      fontBytes,
      tamu[0].nilai
    );
    expect(teksTercetak.join(' ')).toContain('Budi Santoso Wibowo');
    expect(teksTercetak.join(' ')).toContain('Merdeka');
    expect(peringatan).toEqual([]);
  });

  it('kotak hasil klik-tarik menghasilkan teks (bug yang dilaporkan user)', async () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    p.tinggiHalamanPx = (841.89 * 96) / 72;
    p.lebarHalamanPx = (595.28 * 96) / 72;
    p.skalaLayar = 96 / 72;

    // Simulasikan klik-tarik di tengah kertas
    p.onPointerDown({ clientX: 130, clientY: 300, target: p.kontainer, preventDefault() {} });
    p.onPointerMove({ clientX: 700, clientY: 380 });
    p.selesaiDrag();

    const kotak = p.getKotak();
    expect(kotak).toHaveLength(1);
    expect(kotak[0].kunci).toBe('nama');
    expect(kotak[0].lebar).toBeGreaterThan(20);
    expect(kotak[0].tinggi).toBeGreaterThan(10);

    const { teksTercetak } = await gambarUndangan(template, kotak, fontBytes, tamu[0].nilai);
    expect(teksTercetak.join(' ')).toContain('Budi Santoso Wibowo');
  });

  it('menyetel kolom dari daftar kolom CSV', () => {
    const p = buatPanel();
    p.setKolom(Object.keys(tamu[0].nilai));
    const opsi = [...p.selectKolom.querySelectorAll('option')].map((o) => o.value);
    expect(opsi).toEqual(['nama', 'alamat']);
    expect(p.selectKolom.value).toBe('nama');
  });

  it('kotak baru memakai kolom yang sedang dipilih', () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    p.selectKolom.value = 'alamat';
    const k = p.tambahKotak();
    expect(k.kunci).toBe('alamat');
  });

  it('menghapus kotak terpilih', () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    p.tambahKotak('nama');
    p.tambahKotak('alamat');
    expect(p.getKotak()).toHaveLength(2);
    p.hapusTerpilih();
    expect(p.getKotak()).toHaveLength(1);
    expect(p.getKotak()[0].kunci).toBe('nama');
  });
});
describe('alur lengkap seperti di main.js', () => {
  it('kotak otomatis dari pilihan CSV menghasilkan teks di PDF', async () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.tinggiHalamanPx = (841.89 * 96) / 72;
    p.lebarHalamanPx = (595.28 * 96) / 72;
    p.skalaLayar = 96 / 72;

    // Replikasi persis main.js saat CSV dipilih
    p.setKolom(Object.keys(tamu[0]?.nilai ?? { nama: 'nama', alamat: 'alamat' }));
    if (p.kotak.length === 0) {
      p.tambahKotak('nama');
      if (p.selectKolom.querySelector('option[value="alamat"]')) {
        const k2 = p.tambahKotak('alamat');
        k2.y = k2.y + k2.tinggi + 30;
      }
      p.terpilih = 0;
      p.refresh();
    }

    const kotak = p.getKotak();
    console.log('kotak otomatis:', JSON.stringify(kotak, null, 2));

    const { teksTercetak, peringatan } = await gambarUndangan(template, kotak, fontBytes, tamu[0].nilai);
    console.log('tercetak:', JSON.stringify(teksTercetak));
    console.log('peringatan:', JSON.stringify(peringatan));
    expect(teksTercetak.length).toBeGreaterThan(0);
    expect(teksTercetak.join(' ')).toContain('Budi');
  });

  it('klik-tarik menambah kotak permanen', () => {
    const p = buatPanel();
    p.setTemplate(template);
    p.setKolom(['nama', 'alamat']);
    p.tinggiHalamanPx = (841.89 * 96) / 72;
    p.lebarHalamanPx = (595.28 * 96) / 72;
    p.skalaLayar = 96 / 72;

    const sebelum = p.kotak.length;
    p.onPointerDown({ clientX: 130, clientY: 300, target: p.kontainer, preventDefault() {} });
    expect(p.drag).not.toBeNull();
    p.onPointerMove({ clientX: 700, clientY: 380 });
    // kotak bayangan memang muncul di DOM saat drag
    p.selesaiDrag();

    expect(p.kotak.length).toBe(sebelum + 1);
    const k = p.kotak.at(-1);
    expect(k.kunci).toBe('nama');
    expect(k.lebar).toBeGreaterThan(20);
    expect(k.tinggi).toBeGreaterThan(10);
  });
});

describe('ketergantungan urutan (bug ke-2)', () => {
  it('tidak membuat kotak sebelum template dimuat', () => {
    const p = buatPanel();            // template BELUM dimuat
    p.setKolom(['nama', 'alamat']);
    const k = p.tambahKotak('nama');
    expect(k).toBeNull();
    expect(p.getKotak()).toHaveLength(0);
  });

  it('kotak yang terlanjur berukuran nol diperbaiki setelah template dimuat', () => {
    const p = buatPanel();
    p.setKolom(['nama', 'alamat']);
    // paksa kondisi rusak: lebar halaman 0
    p.lebarHalamanPt = 0;
    p.tinggiHalamanPt = 0;
    p.kotak.push({ kunci: 'nama', halaman: 0, x: 0, y: 0, lebar: 0, tinggi: 60, ukuran: 24, minUkuran: 10, warna: '#000000', jarakBaris: 1.2 });
    p.kotak.push({ kunci: 'alamat', halaman: 0, x: 0, y: 90, lebar: 0, tinggi: 60, ukuran: 24, minUkuran: 10, warna: '#000000', jarakBaris: 1.2 });

    p.setTemplate(template);
    p.perbaikiKotakNol();
    expect(p.getKotak().every((k) => k.lebar > 20 && k.tinggi > 10)).toBe(true);
  });

  it('kotak berukuran nol menghasilkan teks yang bisa dibaca', async () => {
    const p = buatPanel();
    p.lebarHalamanPt = 0;
    p.tinggiHalamanPt = 0;
    p.kotak.push({ kunci: 'nama', halaman: 0, x: 0, y: 0, lebar: 0, tinggi: 60, ukuran: 24, minUkuran: 10, warna: '#000000', jarakBaris: 1.2 });
    p.setTemplate(template);
    p.perbaikiKotakNol();
    const { teksTercetak } = await gambarUndangan(template, p.getKotak(), fontBytes, tamu[0].nilai);
    expect(teksTercetak.join(' ')).toContain('Budi Santoso Wibowo');
  });
});

describe('sumbu Y harus mengikuti gerakan mouse (laporan bug)', () => {
  const TINGGI = 841.89;

  function panelSiap() {
    const p = buatPanel();
    p.setTemplate(template);
    p.tinggiHalamanPx = (TINGGI * 96) / 72;
    p.lebarHalamanPx = (595.28 * 96) / 72;
    p.skalaLayar = 96 / 72;
    p.setKolom(['nama', 'alamat']);
    return p;
  }

  it('menggeser kotak ke BAWAH layar menurunkan nilai y PDF', () => {
    const p = panelSiap();
    const k = p.tambahKotak('nama');
    const yAwal = k.y;

    // Tahan kotak lalu geser 60px ke bawah
    p.onPointerDown({ clientX: 0, clientY: 0, target: p.kontainer, preventDefault() {} });
    p.kotak[0].el = null;
    // Simulasikan mulai drag pada kotak yang sudah ada
    p.terpilih = 0;
    const idx = 0;
    p.drag = { mode: 'move', index: idx, startX: 100, startY: 100, k: { ...p.kotak[idx] } };
    p.onPointerMove({ clientX: 100, clientY: 160 }); // 60px ke bawah

    expect(p.kotak[0].y).toBeLessThan(yAwal);
    // 60px / (96/72) = 45pt ke bawah
    expect(yAwal - p.kotak[0].y).toBeCloseTo(45, 0);
  });

  it('menggeser kotak ke ATAS layar menaikkan nilai y PDF', () => {
    const p = panelSiap();
    p.tambahKotak('nama');
    const yAwal = p.kotak[0].y;
    p.drag = { mode: 'move', index: 0, startX: 100, startY: 100, k: { ...p.kotak[0] } };
    p.onPointerMove({ clientX: 100, clientY: 40 }); // 60px ke atas
    expect(p.kotak[0].y).toBeGreaterThan(yAwal);
  });

  it('kotak yang digeser tetap berada di dalam halaman', () => {
    const p = panelSiap();
    p.tambahKotak('nama');
    p.drag = { mode: 'move', index: 0, startX: 100, startY: 100, k: { ...p.kotak[0] } };
    p.onPointerMove({ clientX: 100, clientY: 99999 });
    expect(p.kotak[0].y).toBeGreaterThanOrEqual(0);
    p.drag = { mode: 'move', index: 0, startX: 100, startY: 100, k: { ...p.kotak[0] } };
    p.onPointerMove({ clientX: 100, clientY: -99999 });
    expect(p.kotak[0].y + p.kotak[0].tinggi).toBeLessThanOrEqual(TINGGI + 0.01);
  });

  it('menyeret handle bawah ke bawah justru memperbesar kotak ke bawah', () => {
    const p = panelSiap();
    p.tambahKotak('nama');
    const sebelum = { y: p.kotak[0].y, tinggi: p.kotak[0].tinggi };
    p.drag = { mode: 'resize', index: 0, startX: 100, startY: 100, k: { ...p.kotak[0] } };
    p.onPointerMove({ clientX: 100, clientY: 160 }); // 60px ke bawah

    // Sisi atas kotak tidak boleh bergeser
    const atasSebelum = sebelum.y + sebelum.tinggi;
    const atasSesudah = p.kotak[0].y + p.kotak[0].tinggi;
    expect(atasSesudah).toBeCloseTo(atasSebelum, 1);
    // Sisi bawah turun, jadi tinggi bertambah
    expect(p.kotak[0].tinggi).toBeGreaterThan(sebelum.tinggi);
  });

  it('kotak otomatis tersusun ke BAWAH pada layar, bukan ke atas', () => {
    // Di PDF, y besar = letak tinggi di halaman. Kotak pertama (nama) harus
    // muncul di ATAS kotak kedua (alamat) => y(nama) > y(alamat).
    const p = panelSiap();
    const kolom = p.selectKolom.querySelectorAll('option');
    let i = 0;
    for (const opt of kolom) {
      const k = p.tambahKotak(opt.value);
      k.y = Math.max(0, p.tinggiHalamanPt * 0.4 - i * 90);
      i += 1;
    }
    const [nama, alamat] = p.getKotak();
    expect(nama.kunci).toBe('nama');
    expect(alamat.kunci).toBe('alamat');
    expect(nama.y).toBeGreaterThan(alamat.y);
  });
});
