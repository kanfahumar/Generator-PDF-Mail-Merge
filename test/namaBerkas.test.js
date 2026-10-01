import { describe, it, expect } from 'vitest';
import { namaStem, PengambilNama } from '../src/namaBerkas.js';

describe('namaStem', () => {
  it('mengganti spasi dengan garis bawah', () => {
    expect(namaStem('Budi Santoso')).toBe('Budi_Santoso');
  });

  it('mengganti karakter yang tidak aman', () => {
    expect(namaStem('Budi/Santoso: 2026')).toBe('Budi_Santoso_2026');
  });

  it('menggabungkan garis bawah beruntun dan memangkas di ujung', () => {
    expect(namaStem('  Budi  //  Santoso  ')).toBe('Budi_Santoso');
  });

  it('menjaga tanda hubung dan angka', () => {
    expect(namaStem('Budi-2 2026')).toBe('Budi-2_2026');
  });

  it('memotong nama yang sangat panjang', () => {
    expect(namaStem('A'.repeat(300)).length).toBeLessThanOrEqual(120);
  });

  it('menghasilkan nama cadangan untuk nama kosong', () => {
    expect(namaStem('')).toBe('');
  });
});

describe('PengambilNama', () => {
  it('mengembalikan nama dasar untuk tamu pertama', () => {
    expect(new PengambilNama().ambil('Budi Santoso', 2)).toBe('Budi_Santoso');
  });

  it('memberi akhiran berurutan untuk nama kembar', () => {
    const p = new PengambilNama();
    expect(p.ambil('Budi Santoso', 2)).toBe('Budi_Santoso');
    expect(p.ambil('Budi Santoso', 3)).toBe('Budi_Santoso-2');
    expect(p.ambil('Budi Santoso', 4)).toBe('Budi_Santoso-3');
  });

  it('menyelesaikan tabrakan setelah normalisasi', () => {
    const p = new PengambilNama();
    expect(p.ambil('Budi  Santoso', 2)).toBe('Budi_Santoso');
    expect(p.ambil('Budi Santoso', 3)).toBe('Budi_Santoso-2');
  });

  it('menggunakan nomor baris untuk tamu tanpa nama', () => {
    expect(new PengambilNama().ambil('', 7)).toBe('tamu-007');
    expect(new PengambilNama().ambil('   ', 3)).toBe('tamu-003');
  });

  it('menyelesaikan tabrakan nama cadangan', () => {
    const p = new PengambilNama();
    expect(p.ambil('', 2)).toBe('tamu-002');
    expect(p.ambil('', 3)).toBe('tamu-003');
  });
});
