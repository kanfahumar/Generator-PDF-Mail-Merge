import { describe, it, expect } from 'vitest';
import { bacaCsv, normalkanNilai, parseCsv, GalatCsv } from '../src/csv.js';

describe('normalkanNilai', () => {
  it('memangkas spasi di awal dan akhir', () => {
    expect(normalkanNilai('  Budi Santoso  ')).toBe('Budi Santoso');
  });

  it('menggabungkan spasi ganda menjadi satu', () => {
    expect(normalkanNilai('Jl.   Merdeka\tNo  1')).toBe('Jl. Merdeka No 1');
  });

  it('mengganti non-breaking space dari copy-paste Word', () => {
    expect(normalkanNilai('Jl.\u00a0Merdeka\u00a01')).toBe('Jl. Merdeka 1');
  });

  it('mengganti baris baru menjadi satu spasi', () => {
    expect(normalkanNilai('Jl. Merdeka 1\nRT 02')).toBe('Jl. Merdeka 1 RT 02');
  });

  it('mengubah spasi saja menjadi string kosong', () => {
    expect(normalkanNilai('   ')).toBe('');
  });

  it('membiarkan teks tanpa spasi apa pun utuh', () => {
    expect(normalkanNilai('Budi')).toBe('Budi');
  });
});

describe('parseCsv', () => {
  it('membaca header dan baris sederhana', () => {
    const hasil = parseCsv('nama,alamat\nBudi,Jl. 1\nAndi,Jl. 2\n');
    expect(hasil).toEqual([
      ['nama', 'alamat'],
      ['Budi', 'Jl. 1'],
      ['Andi', 'Jl. 2'],
    ]);
  });

  it('membaca nilai yang mengandung koma di dalam kutip', () => {
    const hasil = parseCsv('nama,alamat\nBudi,"Jl. Merdeka 1, Yogyakarta"\n');
    expect(hasil[1][1]).toBe('Jl. Merdeka 1, Yogyakarta');
  });

  it('membaca nilai yang mengandung tanda kutip ganda di dalam kutip', () => {
    const hasil = parseCsv('nama,alamat\nBudi,"Jl. ""Merdeka"" 1"\n');
    expect(hasil[1][1]).toBe('Jl. "Merdeka" 1');
  });

  it('membaca nilai yang mengandung baris baru di dalam kutip', () => {
    const hasil = parseCsv('nama,alamat\nBudi,"Jl. 1\nRT 02"\n');
    expect(hasil[1][1]).toBe('Jl. 1\nRT 02');
  });

  it('melewati baris kosong sepenuhnya', () => {
    const hasil = parseCsv('nama,alamat\n\nBudi,Jl. 1\n\n');
    expect(hasil).toHaveLength(2);
  });

  it('membaca baris terakhir tanpa baris baru di akhir', () => {
    const hasil = parseCsv('nama,alamat\nBudi,Jl. 1');
    expect(hasil[1][0]).toBe('Budi');
  });

  it('mengembalikan daftar kosong untuk teks kosong', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('bacaCsv', () => {
  it('membaca tamu dari file objects', async () => {
    const file = new File(['nama,alamat\nBudi Santoso,Jl. 1\n'], 'tamu.csv');
    const tamu = await bacaCsv(file);
    expect(tamu).toHaveLength(1);
    expect(tamu[0].nama).toBe('Budi Santoso');
    expect(tamu[0].alamat).toBe('Jl. 1');
    expect(tamu[0].nomor).toBe(2);
  });

  it('menelan BOM dari ekspor Excel', async () => {
    const isi = '\uFEFFnama,alamat\nBudi,Jl. 1\n';
    const tamu = await bacaCsv(new File([isi], 'tamu.csv'));
    expect(tamu).toHaveLength(1);
    expect(tamu[0].nama).toBe('Budi');
  });

  it('menerima kolom tambahan dan mengabaikannya', async () => {
    const file = new File(['no,nama,alamat\n1,Budi,Jl. 1\n'], 'tamu.csv');
    const tamu = await bacaCsv(file);
    expect(tamu[0].nama).toBe('Budi');
  });

  it('menolak file yang tidak punya kolom nama', async () => {
    const file = new File(['kota,alamat\nYogya,Jl. 1\n'], 'tamu.csv');
    await expect(bacaCsv(file)).rejects.toThrow(GalatCsv);
    await expect(bacaCsv(file)).rejects.toThrow(/nama/);
  });

  it('menolak file yang tidak punya kolom alamat', async () => {
    const file = new File(['nama,kota\nBudi,Yogya\n'], 'tamu.csv');
    await expect(bacaCsv(file)).rejects.toThrow(/alamat/);
  });

  it('menyebutkan kolom yang ditemukan saat gagal', async () => {
    const file = new File(['kota\nYogya\n'], 'tamu.csv');
    await expect(bacaCsv(file)).rejects.toThrow(/kota/);
  });

  it('menolak file yang hanya berisi judul kolom', async () => {
    const file = new File(['nama,alamat\n'], 'tamu.csv');
    await expect(bacaCsv(file)).rejects.toThrow(/data/i);
  });

  it('menolak file kosong', async () => {
    await expect(bacaCsv(new File([], 'tamu.csv'))).rejects.toThrow(GalatCsv);
  });

  it('menormalkan nilai dengan baris baru dan spasi berlebih', async () => {
    const isi = 'nama,alamat\nBudi,"  Jl. Merdeka 1\nRT  02 "\n';
    const tamu = await bacaCsv(new File([isi], 'tamu.csv'));
    expect(tamu[0].alamat).toBe('Jl. Merdeka 1 RT 02');
  });

  it('membaca file berkode cp1252 yang bukan UTF-8', async () => {
    // "é" = 0xE9 di cp1252; di UTF-8 byte itu tidak valid
    const byte = new Uint8Array([
      0x6e, 0x61, 0x6d, 0x61, 0x2c, 0x61, 0x6c, 0x61, 0x6d, 0x61, 0x74, 0x0a,
      0x41, 0x6e, 0x64, 0x69, 0x2c, 0x4a, 0x6c, 0x20, 0xe9, 0x20, 0x31, 0x0a,
    ]);
    const file = new File([byte], 'tamu.csv');
    const tamu = await bacaCsv(file);
    expect(tamu[0].nama).toBe('Andi');
    expect(tamu[0].alamat).toBe('Jl \u00e9 1');
  });

  it('memberi nomor baris yang benar untuk data kedua', async () => {
    const file = new File(['nama,alamat\nBudi,Jl. 1\nAndi,Jl. 2\n'], 'tamu.csv');
    const tamu = await bacaCsv(file);
    expect(tamu[0].nomor).toBe(2);
    expect(tamu[1].nomor).toBe(3);
  });
});
