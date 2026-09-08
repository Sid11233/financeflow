// mupdf's WASM build works in Deno's Edge Runtime with no native
// compilation step — verified directly against this exact npm specifier
// before writing this file (loading an existing PDF from raw bytes, page
// count, page trimming via graftPage, and rasterizing to JPEG all behave
// as expected).
import * as mupdf from 'npm:mupdf@1.3.5';

export interface PdfProcessingResult {
  // Either a (possibly page-trimmed) PDF to send as a document block...
  pdfBytes?: Uint8Array;
  // ...or, if that's still too large, rasterized pages to send as image
  // blocks instead. Never both.
  images?: { bytes: Uint8Array; mimeType: string }[];
  totalPageCount: number;
}

const RASTER_DPI = 150;
const JPEG_QUALITY = 82;

// Trims to the first `pageLimit` pages; if the result is still larger than
// `maxPdfBytes`, rasterizes those same pages to JPEG instead. mupdf objects
// hold native WASM memory and are explicitly destroyed in `finally` blocks
// throughout — this function runs once per job, but an Edge Function
// instance can be reused across many invocations, so leaking here would
// accumulate.
export function trimAndMaybeRasterizePdf(
  fileBytes: Uint8Array,
  pageLimit: number,
  maxPdfBytes: number,
): PdfProcessingResult {
  const source = mupdf.Document.openDocument(fileBytes, 'application/pdf') as InstanceType<
    typeof mupdf.PDFDocument
  >;

  try {
    const totalPageCount = source.countPages();
    const pagesToKeep = Math.min(pageLimit, totalPageCount);

    const trimmed = new mupdf.PDFDocument();
    try {
      for (let i = 0; i < pagesToKeep; i++) {
        trimmed.graftPage(-1, source, i);
      }

      const trimmedBytes = trimmed.saveToBuffer('').asUint8Array();

      if (trimmedBytes.length <= maxPdfBytes) {
        return { pdfBytes: trimmedBytes, totalPageCount };
      }

      const images: { bytes: Uint8Array; mimeType: string }[] = [];
      const matrix = mupdf.Matrix.scale(RASTER_DPI / 72, RASTER_DPI / 72);

      for (let i = 0; i < pagesToKeep; i++) {
        const page = trimmed.loadPage(i);
        try {
          const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
          try {
            images.push({ bytes: pixmap.asJPEG(JPEG_QUALITY, false), mimeType: 'image/jpeg' });
          } finally {
            pixmap.destroy();
          }
        } finally {
          page.destroy();
        }
      }

      return { images, totalPageCount };
    } finally {
      trimmed.destroy();
    }
  } finally {
    source.destroy();
  }
}
