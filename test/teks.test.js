import { describe, it, expect } from 'vitest';
import {
  jenisHanyaSpasi,
  lebarTeks,
  tinggiTeks,
  pecahBaris,
  ukurFont,
  posisiXCenter,
  posisiYCenter,
  hurufTakDidukung,
  HasilUkuran,
} from '../src/teks.js';

class PengukurTetap {
  constructor(skala = 0.5) {
    this.skala = skala;
  }
  getWidthOfTextAtSize(teks, ukuran) {
    return teks.length * this.skala * ukuran;
  }
  getFont() {}
}

describe('jenisHanyaSpasi', () => {
  it('mendeteksi string kosong dan spasi', () => {
    expect(jenisHanyaSpasi('')).toBe(true);
    expect(jenisHanyaSpasi('   ')).toBe(true);
    expect(jenisHanyaSpasi('\n\t')).toBe(true);
    expect(jenisHanyaSpasi('Budi')).toBe(false);
  });
});

describe('lebarTeks', () => {
  it('mengembalikan 0 untuk string kosong', () => {
    expect(lebarTeks('', new PengukurTetap(), 12)).toBe(0);
  });

  it('menghitung lebar berdasarkan pengukur font', () => {
    expect(lebarTeks('ABCD', new PengukurTetap(0.5), 20)).toBeCloseTo(40);
  });
});

describe('tinggiTeks', () => {
  it('menghitung tinggi blok teks', () => {
    expect(tinggiTeks(['a', 'b', 'c'], 10, 1.2)).toBeCloseTo(36);
  });
});

describe('pecahBaris', () => {
  it('membungkus pada spasi', () => {
    const hasil = pecahBaris('Budi Santoso Wibowo', new PengukurTetap(0.5), 10, 60);
    expect(hasil).toEqual(['Budi Santoso', 'Wibowo']);
  });

  it('memotong kata panjang per karakter agar tidak keluar kotak', () => {
    const hasil = pecahBaris('ABCDEFGHIJKLM', new PengukurTetap(0.5), 10, 30);
    expect(hasil.every((b) => lebarTeks(b, new PengukurTetap(0.5), 10) <= 30 + 0.0001)).toBe(true);
  });

  it('menangani non-breaking space', () => {
    const hasil = pecahBaris('Budi\u00a0Santoso', new PengukurTetap(0.5), 12, 500);
    expect(hasil).toEqual(['Budi Santoso']);
  });

  it('mengembalikan array dengan string kosong untuk teks kosong', () => {
    expect(pecahBaris('', new PengukurTetap(), 10, 100)).toEqual(['']);
  });

  it('menangani baris baru di dalam teks', () => {
    const hasil = pecahBaris('Budi\nSantoso', new PengukurTetap(0.5), 10, 500);
    expect(hasil).toEqual(['Budi Santoso']);
  });
});

describe('ukurFont', () => {
  it('memakai ukuran penuh bila muat', () => {
    const h = ukurFont('Budi Santoso', new PengukurTetap(0.5), 300, 80, 24, 10, 1.2);
    expect(h).toBeInstanceOf(HasilUkuran);
    expect(h.ukuran).toBe(24);
    expect(h.muat).toBe(true);
    expect(h.baris).toEqual(['Budi Santoso']);
  });

  it('mengecilkan font agar muat dalam kotak', () => {
    const h = ukurFont('Budi Santoso Wibowo Prakoso', new PengukurTetap(0.5), 150, 60, 24, 10, 1.2);
    expect(h.ukuran < 24).toBe(true);
    expect(h.muat).toBe(true);
  });

  it('tidak pernah di bawah min_ukuran', () => {
    const h = ukurFont('Budi Santoso Wibowo Prakoso', new PengukurTetap(0.5), 20, 10, 24, 10, 1.2);
    expect(h.ukuran).toBe(10);
    expect(h.muat).toBe(false);
  });

  it('menganggap teks kosong selalu muat', () => {
    const h = ukurFont('', new PengukurTetap(), 200, 50, 18, 9, 1.25);
    expect(h.muat).toBe(true);
    expect(h.baris).toEqual(['']);
  });
});

describe('posisiXCenter', () => {
  it('memposisikan baris di tengah kotak', () => {
    // "Budi" = 4 char * 0.5 * 10 = 20pt -> 100 + (200 - 20) / 2 = 190
    const x = posisiXCenter('Budi', new PengukurTetap(0.5), 100, 200, 10);
    expect(x).toBeCloseTo(190);
  });

  it('mengembalikan tepi kiri untuk baris kosong', () => {
    const x = posisiXCenter('', new PengukurTetap(), 100, 200, 10);
    expect(x).toBeCloseTo(200);
  });
});

describe('posisiYCenter', () => {
  it('memposisikan blok teks di tengah secara optis', () => {
    const y1 = posisiYCenter(['Budi'], 300, 100, 24, 1.2);
    const y2 = posisiYCenter(['Budi', 'Santoso'], 300, 100, 24, 1.2);
    expect(y2).toBeLessThan(y1);
  });
});

describe('hurufTakDidukung', () => {
  it('mengembalikan karakter unik yang tidak ada glyph-nya', () => {
    const pengukur = {
      getFont() {
        return {
          glyphIndicesForString: (s) => s.replace(/Budi/g, 'abc').split('').map((ch) => (ch === '€' ? 0 : 1)),
        };
      },
    };
    const hasil = hurufTakDidukung('Budi €', pengukur);
    expect(hasil).toContain('€');
  });

  it('mengabaikan spasi', () => {
    const pengukur = {
      getFont() {
        return {
          glyphIndicesForString: () => [1, 1],
        };
      },
    };
    expect(hurufTakDidukung('a b', pengukur)).toEqual([]);
  });
});
