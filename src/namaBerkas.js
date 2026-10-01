/**
 * Pembuatan nama berkas PDF yang aman untuk semua sistem operasi.
 * Menyelesaikan tabrakan nama (dua tamu dengan nama sama) dengan akhiran -2, -3.
 */

/**
 * Normalisasi nama menjadi stem yang aman.
 * Hanya A-Z, a-z, 0-9, _ dan - yang dipertahankan; sisanya menjadi _.
 * Garis bawah beruntun digabung, garis bawah di ujung dibuang, maksimal 120 char.
 */
export function namaStem(nama) {
  const bersih = String(nama ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
    .replace(/_+$/g, '');
  return bersih;
}

/** Menyimpan nama yang sudah dipakai dan menyelesaikan tabrakan. */
export class PengambilNama {
  constructor() {
    this.dipakai = new Set();
  }

  /**
   * @returns nama stem tanpa ekstensi, unik dalam satu proses
   */
  ambil(nama, nomorBaris) {
    let dasar = namaStem(nama);
    if (dasar === '') dasar = `tamu-${String(nomorBaris).padStart(3, '0')}`;

    if (!this.dipakai.has(dasar)) {
      this.dipakai.add(dasar);
      return dasar;
    }

    let n = 2;
    let kandidat = `${dasar}-${n}`;
    while (this.dipakai.has(kandidat)) {
      n += 1;
      kandidat = `${dasar}-${n}`;
    }
    this.dipakai.add(kandidat);
    return kandidat;
  }
}
