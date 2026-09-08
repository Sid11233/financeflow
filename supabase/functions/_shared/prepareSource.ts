import { trimAndMaybeRasterizePdf } from './pdfProcessing.ts';
import { prepareImageForClassification } from './imageProcessing.ts';

export interface ClassificationSource {
  pdfBytes?: Uint8Array;
  images?: { bytes: Uint8Array; mimeType: string }[];
}

// Shared by classify-document (production) and the local test harness
// (_test-harness/classify-samples.ts) so a measured accuracy number
// actually reflects what the deployed pipeline does — a harness that
// reimplemented this separately could quietly drift from production.
export async function prepareClassificationSource(
  fileBytes: Uint8Array,
  mimeType: string,
  pdfPageLimit: number,
  maxPdfBytesBeforeRasterize: number,
): Promise<ClassificationSource> {
  if (mimeType === 'application/pdf') {
    const result = trimAndMaybeRasterizePdf(fileBytes, pdfPageLimit, maxPdfBytesBeforeRasterize);
    return result.pdfBytes ? { pdfBytes: result.pdfBytes } : { images: result.images };
  }

  const prepared = await prepareImageForClassification(fileBytes, mimeType);
  return { images: [prepared] };
}
