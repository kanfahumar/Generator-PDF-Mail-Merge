/**
 * UI: render preview PDF, klik-tarik kotak, dan kontrol properti kotak.
 */

import { pxKePt, ptKePx, ptKeMm, buatKotakDariTarik, kotakKePx } from './geometry.js';

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';
let pdfjsLib = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const mod = await import(/* @vite-ignore */ PDFJS_CDN);
  pdfjsLib = mod;
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

export class PanelKotak {
  constructor({ kanvas, kontainer, selectKolom, inputUkuran, inputMinUkuran, inputWarna, inputJarakBaris, barisProperti }) {
    this.kanvas = kanvas;
    this.kontainer = kontainer;
    this.selectKolom = selectKolom;
    this.inputUkuran = inputUkuran;
    this.inputMinUkuran = inputMinUkuran;
    this.inputWarna = inputWarna;
    this.inputJarakBaris = inputJarakBaris;
    this.barisProperti = barisProperti;

    this.template = null;
    this.halamanAktif = 0;
    this.lebarHalamanPt = 0;
    this.tinggiHalamanPt = 0;
    this.skalaLayar = 1;
    this.pdfRender = null;
    this.kotak = [];
    this.terpilih = -1;
    this.drag = null;

    this.kontainer.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => (this.drag = null));
    this.selectKolom.addEventListener('change', () => this.syncProperti());
    this.inputUkuran.addEventListener('input', () => this.syncPropertiDariInput());
    this.inputMinUkuran.addEventListener('change', () => this.syncPropertiDariInput());
    this.inputWarna.addEventListener('change', () => this.syncPropertiDariInput());
    this.inputJarakBaris.addEventListener('change', () => this.syncPropertiDariInput());
  }

  setTemplate(template) {
    this.template = template;
    this.lebarHalamanPt = template.lebar;
    this.tinggiHalamanPt = template.tinggi;
    this.halamanAktif = 0;
  }

  async renderHalaman() {
    if (!this.template) return;
    const pdfjs = await loadPdfjs();
    const buf = this.template.bytes.buffer.slice(0);
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const page = await doc.getPage(this.halamanAktif + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    this.skalaLayar = viewport.width / this.lebarHalamanPt;
    const v2 = page.getViewport({ scale: (this.skalaLayar * 96) / 96 });
    const ctx = this.kanvas.getContext('2d');
    this.kanvas.width = Math.round(v2.width);
    this.kanvas.height = Math.round(v2.height);
    await page.render({ canvasContext: ctx, viewport: v2 }).promise;
    this.refresh();
  }

  setKolom(daftar) {
    this.selectKolom.innerHTML = '';
    daftar.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      this.selectKolom.appendChild(opt);
    });
    if (daftar.includes('nama') && !this.selectKolom.value) {
      this.selectKolom.value = 'nama';
    }
  }

  tambahKotak(kunci = this.selectKolom.value || 'nama') {
    const w = Math.min(355, this.lebarHalamanPt * 0.6);
    const h = 60;
    const x = (this.lebarHalamanPt - w) / 2;
    const y = this.tinggiHalamanPt * 0.4;
    const kotak = {
      kunci,
      halaman: this.halamanAktif,
      x,
      y,
      lebar: w,
      tinggi: h,
      ukuran: 24,
      minUkuran: 10,
      warna: '#000000',
      jarakBaris: 1.2,
    };
    this.kotak.push(kotak);
    this.terpilih = this.kotak.length - 1;
    this.refresh();
    return kotak;
  }

  hapusTerpilih() {
    if (this.terpilih < 0) return;
    this.kotak.splice(this.terpilih, 1);
    this.terpilih = this.kotak.length > 0 ? 0 : -1;
    this.refresh();
  }

  pilih(index) {
    this.terpilih = index;
    this.refresh();
  }

  getKotak() {
    return this.kotak.map((k) => ({ ...k }));
  }

  setKotak(list) {
    this.kotak = list.map((k) => ({ ...k }));
    this.terpilih = this.kotak.length > 0 ? 0 : -1;
    this.refresh();
  }

  onPointerDown(e) {
    const el = e.target;
    if (el.classList.contains('handle')) {
      const idx = Number(el.dataset.index);
      this.drag = { mode: 'resize', index: idx, startX: e.clientX, startY: e.clientY, k: { ...this.kotak[idx] } };
      e.preventDefault();
      return;
    }
    if (el.classList.contains('kotak')) {
      const idx = Number(el.dataset.index);
      this.terpilih = idx;
      this.drag = { mode: 'move', index: idx, startX: e.clientX, startY: e.clientY, k: { ...this.kotak[idx] } };
      this.refresh();
      e.preventDefault();
      return;
    }
    const rect = this.kanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.drag = { mode: 'new', x0: x, y0: y, x1: x, y1: y };
    this.terpilih = -1;
    this.refresh();
    e.preventDefault();
  }

  onPointerMove(e) {
    if (!this.drag) return;
    if (this.drag.mode === 'new') {
      this.drag.x1 = e.clientX - this.kanvas.getBoundingClientRect().left;
      this.drag.y1 = e.clientY - this.kanvas.getBoundingClientRect().top;
      this.refresh();
      return;
    }
    if (this.drag.mode === 'move') {
      const dx = (e.clientX - this.drag.startX) / this.skalaLayar;
      const dy = (e.clientY - this.drag.startY) / this.skalaLayar;
      const k = this.kotak[this.drag.index];
      k.x = Math.max(0, Math.min(this.lebarHalamanPt - k.lebar, this.drag.k.x + dx));
      k.y = Math.max(0, Math.min(this.tinggiHalamanPt - k.tinggi, this.drag.k.y + dy));
      this.refresh();
      return;
    }
    if (this.drag.mode === 'resize') {
      const dx = (e.clientX - this.drag.startX) / this.skalaLayar;
      const dy = (e.clientY - this.drag.startY) / this.skalaLayar;
      const k = this.kotak[this.drag.index];
      k.lebar = Math.max(20, this.drag.k.lebar + dx);
      k.tinggi = Math.max(10, this.drag.k.tinggi + dy);
      if (k.x + k.lebar > this.lebarHalamanPt) k.lebar = this.lebarHalamanPt - k.x;
      if (k.y + k.tinggi > this.tinggiHalamanPt) k.tinggi = this.tinggiHalamanPt - k.y;
      this.refresh();
    }
  }

  syncProperti() {
    if (this.terpilih < 0 || !this.kotak[this.terpilih]) {
      this.barisProperti.hidden = true;
      return;
    }
    this.barisProperti.hidden = false;
    const k = this.kotak[this.terpilih];
    this.inputUkuran.value = String(k.ukuran);
    this.inputMinUkuran.value = String(k.minUkuran ?? 6);
    this.inputWarna.value = k.warna ?? '#000000';
    this.inputJarakBaris.value = String(k.jarakBaris ?? 1.2);
    this.selectKolom.value = k.kunci;
  }

  syncPropertiDariInput() {
    if (this.terpilih < 0 || !this.kotak[this.terpilih]) return;
    const k = this.kotak[this.terpilih];
    k.ukuran = parseFloat(this.inputUkuran.value) || k.ukuran;
    k.minUkuran = parseFloat(this.inputMinUkuran.value) || k.minUkuran;
    k.warna = this.inputWarna.value;
    k.jarakBaris = parseFloat(this.inputJarakBaris.value) || k.jarakBaris;
    k.kunci = this.selectKolom.value;
    this.refresh();
  }

  refresh() {
    this.kontainer.innerHTML = '';
    if (this.drag && this.drag.mode === 'new') {
      const r = { ...buatKotakDariTarik(this.drag), halaman: this.halamanAktif };
      const el = this.buatElKotak(r, this.kotak.length, true);
      this.kontainer.appendChild(el);
    }
    this.kotak.forEach((k, i) => {
      const el = this.buatElKotak(k, i, i === this.terpilih);
      this.kontainer.appendChild(el);
    });
    this.syncProperti();
  }

  buatElKotak(k, index, terpilih) {
    const p = kotakKePx(k);
    const el = document.createElement('div');
    el.className = 'kotak' + (terpilih ? ' terpilih' : '');
    el.dataset.index = String(index);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    el.style.width = `${p.width}px`;
    el.style.height = `${p.height}px`;
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.dataset.index = String(index);
    el.appendChild(handle);
    return el;
  }
}
