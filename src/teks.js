/**
 * Logika penempatan teks: pemenggalan baris, pengecilan font otomatis,
 * dan pemusatan di dalam kotak. Semua fungsi di sini murni - tidak menyentuh
 * DOM maupun PDF - supaya bisa diuji tanpa browser.
 *
 * `pengukur` adalah objek PDFFont dari pdf-lib (atau apa pun yang punya
 * getWidthOfTextAtSize).
 */

/** True bila teks kosong atau hanya whitespace. */
export function jenisHanyaSpasi(teks) {
  return String(teks ?? '').trim() === '';
}

/**
 * Lebar teks dalam point. String kosong lebarnya 0.
 * pdf-lib memberi PDFFont dengan method widthOfTextAtSize; pengukur uji
 * memakai getWidthOfTextAtSize. Keduanya didukung.
 */
export function lebarTeks(teks, pengukur, ukuran) {
  if (jenisHanyaSpasi(teks)) return 0;
  if (typeof pengukur.widthOfTextAtSize === 'function') {
    return pengukur.widthOfTextAtSize(teks, ukuran);
  }
  return pengukur.getWidthOfTextAtSize(teks, ukuran);
}

/**
 * Fontkit font di balik pengukur, atau null bila tidak tersedia.
 * Menerima: objek fontkit langsung, PDFFont pdf-lib (getFont()), atau
 * pengukur uji yang menyimpan font di properti `font`.
 */
function fontkitFont(pengukur) {
  const punyaMetode =
    typeof pengukur.hasGlyphForCodePoint === 'function' ||
    typeof pengukur.glyphIndicesForString === 'function';
  if (punyaMetode) return pengukur;

  if (typeof pengukur.getFont === 'function') {
    try {
      const f = pengukur.getFont();
      if (f) return f;
    } catch {
      /* lanjut */
    }
  }
  return pengukur.font ?? null;
}

/** Tinggi blok teks dalam point. */
export function tinggiTeks(baris, ukuran, jarakBaris) {
  return baris.length * ukuran * jarakBaris;
}

/**
 * Pecah teks menjadi baris-baris yang muat dalam `lebar`.
 * Memotong pada spasi; kata yang lebih lebar dari `lebar` dipotong per karakter.
 */
export function pecahBaris(teks, pengukur, ukuran, lebar) {
  const bersih = String(teks ?? '')
    .replace(/[\s\u00a0\u2007\u202f]+/g, ' ')
    .trim();

  if (bersih === '') return [''];

  const muat = (s) => lebarTeks(s, pengukur, ukuran) <= lebar + 0.01;
  const hasil = [];
  let sekarang = '';

  const flush = () => {
    if (sekarang !== '') hasil.push(sekarang);
    sekarang = '';
  };

  for (const kata of bersih.split(' ')) {
    if (!muat(kata)) {
      flush();
      let sisa = kata;
      while (!muat(sisa)) {
        let potong = '';
        for (const c of sisa) {
          if (!muat(potong + c)) break;
          potong += c;
        }
        if (potong === '') {
          // Satu karakter pun tidak muat - ambil satu agar loop terminated
          hasil.push(sisa[0]);
          sisa = sisa.slice(1);
          continue;
        }
        hasil.push(potong);
        sisa = sisa.slice(potong.length);
      }
      if (sisa !== '') sekarang = sisa;
      continue;
    }

    const kandidat = sekarang === '' ? kata : `${sekarang} ${kata}`;
    if (muat(kandidat)) {
      sekarang = kandidat;
    } else {
      flush();
      sekarang = kata;
    }
  }
  flush();

  return hasil.length > 0 ? hasil : [''];
}

export class HasilUkuran {
  constructor(ukuran, baris, muat) {
    this.ukuran = ukuran;
    this.baris = baris;
    this.muat = muat;
  }
}

/**
 * Cari ukuran font terbesar yang masih muat di (lebar x tinggi).
 * Turun dari `ukuran` ke `minUkuran` langkah 1.0 pt.
 * Selesai mengukur tinggi dengan teks pada ukuran itu. Kalau tidak ada yang
 * muat, tetap tulis pada minUkuran dengan muat=false supaya pemanggil bisa
 * memberi tahu pengguna.
 */
export function ukurFont(teks, pengukur, lebar, tinggi, ukuran, minUkuran, jarakBaris) {
  const atas = Math.max(ukuran, minUkuran);
  const bawah = Math.min(minUkuran, ukuran);

  const coba = (s) => {
    const baris = pecahBaris(teks, pengukur, s, lebar);
    const muat =
      tinggiTeks(baris, s, jarakBaris) <= tinggi + 0.01 &&
      baris.every((b) => lebarTeks(b, pengukur, s) <= lebar + 0.01);
    return { baris, muat };
  };

  for (let s = atas; s > bawah; s -= 1) {
    const { baris, muat } = coba(s);
    if (muat) return new HasilUkuran(s, baris, true);
  }

  const { baris, muat } = coba(bawah);
  return new HasilUkuran(bawah, baris, muat);
}

/** Posisi kiri agar baris terpusat di dalam kotak. */
export function posisiXCenter(baris, pengukur, xKotak, lebarKotak, ukuran) {
  const w = lebarTeks(baris, pengukur, ukuran);
  return xKotak + (lebarKotak - w) / 2;
}

/**
 * Baseline (y) untuk baris PERTAMA - yang paling atas - dari blok teks yang
 * diletakkan di tengah kotak secara vertikal.
 *
 * PDF mengukur y dari bawah halaman dan makin ke atas. Jadi untuk membuat teks
 * mengalir ke bawah (seperti di layar), baris berikutnya harus memakai y yang
 * BERKURANG. Mengembalikan baris pertama (tertinggi) sebagai titik awal.
 */
export function posisiYBarisPertama(baris, yKotak, tinggiKotak, ukuran, jarakBaris) {
  const tinggiBlok = tinggiTeks(baris, ukuran, jarakBaris);
  const atasBlok = yKotak + (tinggiKotak - tinggiBlok) / 2;
  return atasBlok + tinggiBlok - ukuran * 0.8;
}

/**
 * Karakter unik yang tidak punya glyph di font. Spasi diabaikan.
 * Mengembalikan [] bila font tidak bisa diperiksa - pemeriksaan glyph tidak
 * boleh menggagalkan pembuatan undangan.
 */
export function hurufTakDidukung(teks, pengukur) {
  const font = fontkitFont(pengukur);
  if (!font) return [];

  const unik = [
    ...new Set([...(String(teks ?? '').normalize('NFC'))]),
  ].filter((c) => !/[\s\u00a0\u2007\u202f]/.test(c));
  if (unik.length === 0) return [];

  try {
    if (typeof font.hasGlyphForCodePoint === 'function') {
      return unik.filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)));
    }
    if (typeof font.glyphIndicesForString === 'function') {
      return unik.filter((c) => (font.glyphIndicesForString(c)[0] ?? 0) === 0);
    }
  } catch {
    /* pemeriksaan glyph tidak boleh menggagalkan pembuatan */
  }
  return [];
}
