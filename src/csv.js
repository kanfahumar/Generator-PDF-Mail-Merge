/**
 * Pembacaan file CSV daftar tamu.
 *
 * Menangani hal-hal yang sering merusak CSV di dunia nyata:
 * BOM dari ekspor Excel, nilai berisi koma, tanda kutip, baris baru,
 * non-breaking space dari copy-paste Word, dan berkas berenkode cp1252.
 */

export class GalatCsv extends Error {
  constructor(pesan) {
    super(pesan);
    this.name = 'GalatCsv';
  }
}

/**
 * Rtrim + collapse semua whitespace (termasuk \u00a0 dan \n) menjadi satu spasi.
 */
export function normalkanNilai(nilai) {
  return String(nilai ?? '')
    .replace(/[\s\u00a0\u2007\u202f]+/g, ' ')
    .trim();
}

/**
 * Parser RFC 4180 sederhana. Mengembalikan array of array of string mentah.
 * Baris kosong sepenuhnya dilewati.
 */
export function parseCsv(teks) {
  const isi = String(teks ?? '').replace(/^\uFEFF/, '');
  if (isi.trim() === '') return [];

  const baris = [];
  let sel = '';
  let diKutip = false;
  let mulaiBaris = [];

  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];

    if (diKutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') {
          sel += '"';
          i++;
        } else {
          diKutip = false;
        }
      } else {
        sel += c;
      }
      continue;
    }

    if (c === '"') {
      diKutip = true;
    } else if (c === ',') {
      mulaiBaris.push(sel);
      sel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && isi[i + 1] === '\n') i++;
      mulaiBaris.push(sel);
      sel = '';
      if (mulaiBaris.some((s) => normalkanNilai(s) !== '')) {
        baris.push(mulaiBaris);
      }
      mulaiBaris = [];
    } else {
      sel += c;
    }
  }

  mulaiBaris.push(sel);
  if (mulaiBaris.some((s) => normalkanNilai(s) !== '')) {
    baris.push(mulaiBaris);
  }

  return baris;
}

/**
 * Decode byte menjadi teks. Coba UTF-8 dulu (denganDetection tidak selalu
 * ada), lalu cp1252 sebagai cadangan.
 */
function decode(bytes) {
  try {
    const teks = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return teks;
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch {
      return new TextDecoder('latin1').decode(bytes);
    }
  }
}

// Selalu decode sendiri dari byte. File.text()/Blob.text() selalu "berhasil"
// dengan fatally:false, sehingga byte cp1252 berubah jadi U+FFFD dan isi
// rusak tidak pernah terdeteksi sebagai rusak.
async function ambilTeks(file) {
  if (typeof file.arrayBuffer === 'function') {
    return decode(new Uint8Array(await file.arrayBuffer()));
  }
  return decode(new Uint8Array(await file.bytes()));
}

/**
 * Baca file CSV -> array of { nomor, nama, alamat, nilai }.
 * `nilai` menyimpan seluruh kolom agar kotak dengan kunci lain bisa dipakai.
 */
export function bacaCsv(file) {
  return ambilTeks(file)
    .then((teks) => parseCsv(teks))
    .then((baris) => {
      if (baris.length === 0) {
        throw new GalatCsv(
          `File CSV "${file.name ?? 'tamu.csv'}" kosong. Isi dengan judul kolom lalu minimal satu baris data.`
        );
      }

      const judul = baris[0].map(normalkanNilai);
      const idxNama = judul.indexOf('nama');
      const idxAlamat = judul.indexOf('alamat');

      const kurang = [];
      if (idxNama === -1) kurang.push('nama');
      if (idxAlamat === -1) kurang.push('alamat');
      if (kurang.length > 0) {
        throw new GalatCsv(
          `Kolom "${kurang.join('" dan "')}" tidak ditemukan di file CSV. ` +
            `Kolom yang ditemukan: ${judul.join(', ')}. ` +
            `Baris pertama file harus tertulis persis: nama,alamat`
        );
      }

      if (baris.length < 2) {
        throw new GalatCsv(
          `File CSV "${file.name ?? 'tamu.csv'}" belum berisi data tamu. ` +
            `Tambahkan minimal satu baris di bawah judul kolom.`
        );
      }

      return baris.slice(1).map((sel, i) => {
        const nilai = {};
        judul.forEach((kunci, j) => {
          if (kunci) nilai[kunci] = normalkanNilai(sel[j]);
        });
        return {
          nomor: i + 2,
          nama: normalkanNilai(sel[idxNama] ?? ''),
          alamat: normalkanNilai(sel[idxAlamat] ?? ''),
          nilai,
        };
      });
    });
}
