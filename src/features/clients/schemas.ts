import { z } from 'zod';

// Mauritius numbers are 8 digits (mobile, always starting 5) or 7 digits
// (landline) after the +230 country code, e.g. "+230 5712 3456" or
// "+230 464 1234". Country code and separators are optional so a locally
// dialed number ("5712 3456") also validates.
const mauritiusPhoneRegex = /^(\+?230[\s-]?)?(5\d{3}|[2-9]\d{2})[\s-]?\d{4}$/;

const phoneField = z
  .string()
  .optional()
  .refine((value) => !value || mauritiusPhoneRegex.test(value.trim()), {
    message: 'Enter a valid Mauritius number, e.g. +230 5712 3456',
  });

export const clientFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: phoneField,
  notes: z.string().optional(),
  defaultDocumentTypeIds: z.array(z.string()),
});
export type ClientFormValues = z.infer<typeof clientFormSchema>;

export const csvRowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  phone: phoneField,
});
export type CsvRowValues = z.infer<typeof csvRowSchema>;
