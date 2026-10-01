import { describe, it, expect } from 'vitest';
import {
  PT_PER_PX,
  pxKePt,
  ptKePx,
  ptKeMm,
  buatKotakDariTarik,
  kotakKePx,
  pxKePt,
  uprightKotak,
} from '../src/geometry.js';

describe('konversi satuan', () => {
  it('1 px PDF = 0.75 pt', () => {
    expect(PT_PER_PX).toBeCloseTo(0.75, 6);
  });

  it('mengubah px ke pt', () => {
    expect(pxKePt(100)).toBeCloseTo(75);
    expect(pxKePt(0)).toBe(0);
  });

  it('mengubah pt ke px', () => {
    expect(ptKePx(75)).toBeCloseTo(100);
  });

  it('bolak-balik konsisten', () => {
    for (const v of [1, 37, 210, 595.28, 841.89]) {
      expect(ptKePx(pxKePt(v))).toBeCloseTo(v, 6);
    }
  });

  it('mengubah pt ke mm', () => {
    expect(ptKeMm(72)).toBeCloseTo(25.4, 6);
    expect(ptKeMm(595.28)).toBeCloseTo(210, 0);
  });
});

describe('uprightKotak', () => {
  it('menormalkan kotak yang ditarik ke arah sebaliknya', () => {
    expect(uprightKotak(100, 50, 40, 80)).toEqual({ x: 40, y: 50, lebar: 60, tinggi: 30 });
  });

  it('membiarkan kotak yang sudah benar', () => {
    expect(uprightKotak(40, 50, 100, 80)).toEqual({ x: 40, y: 50, lebar: 60, tinggi: 30 });
  });
});

describe('buatKotakDariTarik', () => {
  it('mengubah tarikan di layar menjadi kotak dalam point', () => {
    // tarik dari (100px, 200px) ke (300px, 260px) -> 200px x 60px = 150pt x 45pt
    const k = buatKotakDariTarik({ x0: 100, y0: 200, x1: 300, y1: 260 }, 1123);
    expect(k.lebar).toBeCloseTo(150);
    expect(k.tinggi).toBeCloseTo(45);
  });

  it('menormalkan arah tarikan terbalik', () => {
    const k = buatKotakDariTarik({ x0: 300, y0: 260, x1: 100, y1: 200 }, 1123);
    expect(k.lebar).toBeCloseTo(150);
    expect(k.tinggi).toBeCloseTo(45);
  });

  it('memberi lebar minimum agar tidak nol', () => {
    const k = buatKotakDariTarik({ x0: 100, y0: 100, x1: 100, y1: 100 }, 1123);
    expect(k.lebar).toBeGreaterThan(0);
    expect(k.tinggi).toBeGreaterThan(0);
  });

  it('membatasi ukuran minimum dalam point', () => {
    const k = buatKotakDariTarik({ x0: 0, y0: 0, x1: 2, y1: 2 }, 1123);
    expect(k.lebar).toBeGreaterThanOrEqual(20);
  });
});

describe('kotakKePx', () => {
  it('mengubah kotak point menjadi posisi piksel', () => {
    const p = kotakKePx({ x: 75, y: 150, lebar: 150, tinggi: 45 }, 1123);
    // y=150pt dari bawah -> top = 1123px - (150+45)pt dalam px
    const tinggiPt = (1123 * 72) / 96;
    expect(p).toEqual({
      left: 100,
      top: (tinggiPt - 150 - 45) / (72 / 96),
      width: 200,
      height: 60,
    });
  });
});

describe('konvensi sumbu y (PDF: dari bawah, layar: dari atas)', () => {
  const TINGGI = 1123; // A4 dalam px pada 96 DPI

  it('kotak yang ditarik di bagian ATAS layar punya y PDF besar', () => {
    const k = buatKotakDariTarik({ x0: 100, y0: 100, x1: 300, y1: 160 }, TINGGI);
    // di layar: top=100px dari atas -> di PDF y harus besar (dekat dasar)
    expect(k.y).toBeGreaterThan(pxKePt(TINGGI - 200));
  });

  it('kotak yang ditarik di bagian BAWAH layar punya y PDF kecil', () => {
    const k = buatKotakDariTarik({ x0: 100, y0: 900, x1: 300, y1: 960 }, TINGGI);
    expect(k.y).toBeLessThan(pxKePt(TINGGI * 0.25));
  });

  it('kotakKePx mengembalikan kotak ke posisi layar yang sama', () => {
    const asli = { x0: 100, y0: 200, x1: 340, y1: 280 };
    const k = buatKotakDariTarik(asli, TINGGI);
    const p = kotakKePx(k, TINGGI);
    expect(p.left).toBeCloseTo(asli.x0, 0);
    expect(p.top).toBeCloseTo(asli.y0, 0);
    expect(p.width).toBeCloseTo(asli.x1 - asli.x0, 0);
    expect(p.height).toBeCloseTo(asli.y1 - asli.y0, 0);
  });

  it('kotak tepat di dasar halaman muncul di paling bawah layar', () => {
    const k = buatKotakDariTarik({ x0: 100, y0: 1063, x1: 300, y1: 1123 }, TINGGI);
    expect(k.y).toBeCloseTo(0, 0);
    const p = kotakKePx(k, TINGGI);
    expect(p.top).toBeCloseTo(1063, 0);
  });
});
