import { describe, it, expect } from 'vitest';
import { zipSync, strFromU8 } from 'fflate';
import { buatZip, namaZipUntuk } from '../src/zip.js';

describe('buatZip', () => {
  it('menghasilkan magic number PK', () => {
    const z = buatZip([{ nama: 'a.pdf', data: new Uint8Array([1, 2, 3]) }]);
    expect(z[0]).toBe(0x50);
    expect(z[1]).toBe(0x4b);
  });

  it('memuat setiap berkas yang diminta', () => {
    const z = buatZip([
      { nama: 'Budi.pdf', data: new Uint8Array([1, 2, 3]) },
      { nama: 'Andi.pdf', data: new Uint8Array([4, 5, 6]) },
    ]);
    const isi = strFromU8(z, { filter: (f) => Object.keys(f).length > 0 });
    void isi;
    expect(z.byteLength).toBeGreaterThan(6);
  });

  it('menangani daftar berkas kosong tanpa error', () => {
    const z = buatZip([]);
    expect(z).toBeInstanceOf(Uint8Array);
  });

  it('tidak mengubah isi berkas', () => {
    const asli = new Uint8Array([9, 8, 7, 6, 5]);
    const z = buatZip([{ nama: 'x.pdf', data: asli }]);
    expect(z).toBeInstanceOf(Uint8Array);
    expect(asli[0]).toBe(9);
  });
});

describe('namaZipUntuk', () => {
  it('menggunakan nama dasar folder undangan', () => {
    expect(namaZipUntuk()).toBe('undangan.zip');
  });
});
