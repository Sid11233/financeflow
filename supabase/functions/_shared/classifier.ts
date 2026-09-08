import { z } from 'npm:zod@3.23.8';
import { Buffer } from 'node:buffer';

export const AI_DOCUMENT_TYPES = [
  'bank_statement',
  'sales_invoice',
  'purchase_invoice',
  'payroll_report',
  'expense_receipt',
  'credit_card_statement',
  'tax_return',
  'other',
  'unreadable',
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const classificationSchema = z.object({
  document_type: z.enum(AI_DOCUMENT_TYPES),
  document_type_label: z.string(),
  period: z.object({
    start: isoDate,
    end: isoDate,
    label: z.string().nullable(),
  }),
  company_name: z.string().nullable(),
  counterparty_name: z.string().nullable(),
  currency: z.string().nullable(),
  total_amount: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFICATION_SYSTEM_PROMPT = `You are a document classifier for an accounting firm. You will be shown a
financial document. Identify what it is. Respond with JSON only, no prose,
no markdown fences.

Schema:
{
  "document_type": one of ["bank_statement","sales_invoice","purchase_invoice",
    "payroll_report","expense_receipt","credit_card_statement","tax_return",
    "other","unreadable"],
  "document_type_label": short human label,
  "period": { "start": "YYYY-MM-DD" or null, "end": "YYYY-MM-DD" or null,
              "label": e.g. "September 2026" or null },
  "company_name": string or null,
  "counterparty_name": string or null,
  "currency": ISO code or null,
  "total_amount": number or null,
  "confidence": 0.0 to 1.0,
  "reasoning": one short sentence
}

Rules: if the document covers a date range, report that range, not the issue
date. If you cannot read it, return "unreadable" with confidence 0. Never
guess a period you cannot see evidence for; use null. Do not invent a company
name.`;

const STRICT_REMINDER =
  '\n\nIMPORTANT: Your previous response could not be parsed as valid JSON matching the schema. Respond with ONLY the raw JSON object — no prose, no markdown code fences, nothing before or after it.';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;

export interface ClassificationSource {
  pdfBytes?: Uint8Array;
  images?: { bytes: Uint8Array; mimeType: string }[];
}

export interface ClassificationCallResult {
  classification: Classification | null;
  rawResponseText: string;
  parseFailed: boolean;
}

export async function classifyDocument(
  apiKey: string,
  model: string,
  source: ClassificationSource,
): Promise<ClassificationCallResult> {
  const contentBlocks = buildContentBlocks(source);

  const firstResponseText = await callAnthropic(apiKey, model, contentBlocks, CLASSIFICATION_SYSTEM_PROMPT);
  const firstParsed = tryParseClassification(firstResponseText);

  if (firstParsed) {
    return { classification: firstParsed, rawResponseText: firstResponseText, parseFailed: false };
  }

  // One retry, same content, a stricter system-prompt reminder — a fresh
  // single-turn call rather than a multi-turn "that wasn't right, retry"
  // conversation, since the goal is just a better-formatted answer, not a
  // discussion.
  const secondResponseText = await callAnthropic(
    apiKey,
    model,
    contentBlocks,
    `${CLASSIFICATION_SYSTEM_PROMPT}${STRICT_REMINDER}`,
  );
  const secondParsed = tryParseClassification(secondResponseText);

  return {
    classification: secondParsed,
    rawResponseText: secondParsed ? secondResponseText : `${firstResponseText}\n---RETRY---\n${secondResponseText}`,
    parseFailed: !secondParsed,
  };
}

function buildContentBlocks(source: ClassificationSource): unknown[] {
  const blocks: unknown[] = [];

  if (source.pdfBytes) {
    blocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(source.pdfBytes) },
    });
  }

  for (const image of source.images ?? []) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: encodeBase64(image.bytes) },
    });
  }

  blocks.push({ type: 'text', text: 'Classify this document.' });
  return blocks;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  contentBlocks: unknown[],
  systemPrompt: string,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const textBlock = (data.content ?? []).find((block: { type: string }) => block.type === 'text');
  return textBlock?.text ?? '';
}

function tryParseClassification(rawText: string): Classification | null {
  // Defensive only — the prompt explicitly forbids markdown fences, but
  // stripping them if present costs nothing and saves a retry round trip
  // for an otherwise-good response.
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const result = classificationSchema.safeParse(json);
  return result.success ? result.data : null;
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
