/**
 * Konversi koordinat antara satuan PDF (point), piksel layar, dan milimeter.
 *
 * Pdf.js merender halaman pada 96 DPI sehingga 1 piksel PDF = 0.75 point.
 * Semua kotak di aplikasi ini disimpan dalam POINT - satuan yang sama dengan
 * PDF - supaya tidak ada pembulatan yang menumpuk.
 */

/** 96 DPI: 1 px = 72/96 pt = 0.75 pt */
export const PT_PER_PX = 72 / 96;

export function pxKePt(px) {
  return px * PT_PER_PX;
}

export function ptKePx(pt) {
  return pt / PT_PER_PX;
}

export function ptKeMm(pt) {
  return (pt / 72) * 25.4;
}

export function mmKePt(mm) {
  return (mm / 25.4) * 72;
}

/** Ubah (x0,y0)-(x1,y1) menjadi kotak dengan x<lebar dan y<tinggi. */
export function uprightKotak(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    lebar: Math.abs(x1 - x0),
    tinggi: Math.abs(y1 - y0),
  };
}

/**
 * Kotak dari tarikan mouse (piksel layar) -> kotak dalam point PDF.
 *
 * Perhatikan pembalikan sumbu y. Mouse diukur dari ATAS layar, sedangkan PDF
 * mengukur y dari BAWAH halaman. Tanpa pembalikan ini, kotak yang digambar di
 * bagian atas kertas akan muncul di bagian bawah dokumen.
 *
 * @param {{x0:number,y0:number,x1:number,y1:number}} tarik posisi piksel
 * @param {number} tinggiHalamanPx tinggi halaman dalam piksel
 */
export function buatKotakDariTarik({ x0, y0, x1, y1 }, tinggiHalamanPx) {
  const kasar = uprightKotak(x0, y0, x1, y1);
  return {
    x: pxKePt(kasar.x),
    y: pxKePt(tinggiHalamanPx - kasar.y - kasar.tinggi),
    lebar: Math.max(pxKePt(kasar.lebar), 20),
    tinggi: Math.max(pxKePt(kasar.tinggi), 10),
  };
}

/**
 * Kotak dalam point PDF -> gaya CSS untuk overlay di layar (y dibalik kembali).
 *
 * @param {{x:number,y:number,lebar:number,tinggi:number}} kotak
 * @param {number} tinggiHalamanPx tinggi halaman dalam piksel
 */
export function kotakKePx(kotak, tinggiHalamanPx) {
  return {
    left: ptKePx(kotak.x),
    top: ptKePx(pxKePt(tinggiHalamanPx) - kotak.y - kotak.tinggi),
    width: ptKePx(kotak.lebar),
    height: ptKePx(kotak.tinggi),
  };
}
