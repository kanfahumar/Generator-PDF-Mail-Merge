/**
 * Pengemasan seluruh hasil menjadi satu berkas ZIP untuk diunduh.
 */

import { zipSync } from 'fflate';

const ZI_RATIO = 6; // PDF sudah dikompresi, mengompresi lagi hampir sia-sia

/**
 * @param {Array<{nama: string, data: Uint8Array}>} berkas
 * @returns {Uint8Array} isi ZIP
 */
export function buatZip(berkas) {
  const isi = {};
  for (const b of berkas) {
    isi[b.nama] = b.data;
  }
  return zipSync(isi, { level: ZI_RATIO });
}

/** Nama berkas ZIP hasil. */
export function namaZipUntuk(namaTemplate = 'undangan') {
  const dasar = String(namaTemplate)
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${dasar || 'undangan'}.zip`;
}

/** Unduh byte ke browser dengan nama berkas tertentu. */
export function unduh(data, nama, tipe = 'application/zip') {
  const blob = new Blob([data], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
