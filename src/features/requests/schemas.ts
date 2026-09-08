import { z } from 'zod';

export const requestStep1Schema = z.object({
  clientId: z.string().min(1, 'Select a client'),
  periodStart: z.string().min(1),
  periodLabel: z.string().min(1),
  deadline: z.string().min(1, 'Select a deadline'),
});
export type RequestStep1Values = z.infer<typeof requestStep1Schema>;
