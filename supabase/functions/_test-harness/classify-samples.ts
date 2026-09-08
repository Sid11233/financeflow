// Local accuracy-testing tool for the classification pipeline — measure
// expected-vs-predicted type and period on a folder of real sample
// documents BEFORE trusting auto-accept against live client uploads.
//
// Not deployed: this folder is prefixed with an underscore, the same
// convention `_shared` uses, which `supabase functions deploy` skips.
//
// Reuses the exact same prepareClassificationSource() and classifyDocument()
// that classify-document itself calls — not a reimplementation — so the
// accuracy number this prints is the accuracy the real pipeline will get,
// not an approximation of it.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... deno run --allow-read --allow-net --allow-env \
//     supabase/functions/_test-harness/classify-samples.ts ./samples
//
// Expects ./samples/manifest.json:
//   [
//     { "file": "bank-statement-sept.pdf", "expectedType": "bank_statement", "expectedPeriodLabel": "September 2026" },
//     { "file": "random-receipt.jpg", "expectedType": "expense_receipt" }
//   ]
// expectedPeriodLabel is optional — omit it for documents where period
// doesn't apply, or where you just want type accuracy for now.
import { prepareClassificationSource } from '../_shared/prepareSource.ts';
import { classifyDocument } from '../_shared/classifier.ts';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_PDF_PAGE_LIMIT = 5;
const DEFAULT_MAX_PDF_BYTES = 4 * 1024 * 1024;

interface ManifestEntry {
  file: string;
  expectedType: string;
  expectedPeriodLabel?: string;
}

interface ResultRow {
  file: string;
  expectedType: string;
  predictedType: string;
  typeMatch: string;
  expectedPeriod: string;
  predictedPeriod: string;
  periodMatch: string;
  confidence: string;
}

async function main() {
  const folder = Deno.args[0] ?? './samples';
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('CLASSIFY_MODEL') ?? DEFAULT_MODEL;

  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY before running this script.');
    Deno.exit(1);
  }

  const manifestPath = `${folder}/manifest.json`;
  let manifest: ManifestEntry[];
  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  } catch {
    console.error(`Could not read ${manifestPath} — see the header of this file for the expected format.`);
    Deno.exit(1);
  }

  const rows: ResultRow[] = [];

  for (const entry of manifest) {
    console.log(`Classifying ${entry.file}...`);
    rows.push(await classifyOne(folder, entry, apiKey, model));
  }

  console.table(rows);

  const typeCorrect = rows.filter((row) => row.typeMatch === '✓').length;
  const periodComparable = rows.filter((row) => row.periodMatch !== 'n/a');
  const periodCorrect = periodComparable.filter((row) => row.periodMatch === '✓').length;

  console.log(`\nType accuracy:   ${typeCorrect}/${rows.length} (${percent(typeCorrect, rows.length)})`);
  if (periodComparable.length > 0) {
    console.log(
      `Period accuracy: ${periodCorrect}/${periodComparable.length} (${percent(periodCorrect, periodComparable.length)})`,
    );
  }
}

async function classifyOne(
  folder: string,
  entry: ManifestEntry,
  apiKey: string,
  model: string,
): Promise<ResultRow> {
  try {
    const filePath = `${folder}/${entry.file}`;
    const fileBytes = await Deno.readFile(filePath);
    const mimeType = guessMimeType(entry.file);

    const source = await prepareClassificationSource(
      fileBytes,
      mimeType,
      DEFAULT_PDF_PAGE_LIMIT,
      DEFAULT_MAX_PDF_BYTES,
    );
    const result = await classifyDocument(apiKey, model, source);

    if (!result.classification) {
      return {
        file: entry.file,
        expectedType: entry.expectedType,
        predictedType: '(unparseable response)',
        typeMatch: '✗',
        expectedPeriod: entry.expectedPeriodLabel ?? '',
        predictedPeriod: '',
        periodMatch: 'n/a',
        confidence: '',
      };
    }

    const predicted = result.classification;
    const hasExpectedPeriod = Boolean(entry.expectedPeriodLabel);

    return {
      file: entry.file,
      expectedType: entry.expectedType,
      predictedType: predicted.document_type,
      typeMatch: predicted.document_type === entry.expectedType ? '✓' : '✗',
      expectedPeriod: entry.expectedPeriodLabel ?? '',
      predictedPeriod: predicted.period.label ?? '(none)',
      periodMatch: hasExpectedPeriod ? (predicted.period.label === entry.expectedPeriodLabel ? '✓' : '✗') : 'n/a',
      confidence: predicted.confidence.toFixed(2),
    };
  } catch (error) {
    return {
      file: entry.file,
      expectedType: entry.expectedType,
      predictedType: `(error: ${error instanceof Error ? error.message : 'unknown'})`,
      typeMatch: '✗',
      expectedPeriod: entry.expectedPeriodLabel ?? '',
      predictedPeriod: '',
      periodMatch: 'n/a',
      confidence: '',
    };
  }
}

function guessMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}

function percent(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

await main();
