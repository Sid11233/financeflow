import type { Database } from '@/lib/database.types';

export type ClientOverviewRow = Database['public']['Views']['client_overview']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];

export interface ClientsPage {
  rows: ClientOverviewRow[];
  total: number;
  pageSize: number;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  name: string;
  email: string;
  phone: string;
}

export interface ImportRowResult {
  rowIndex: number;
  name: string;
  email: string;
  phone: string;
  errors: string[];
}

export interface ImportResult {
  insertedCount: number;
  duplicateEmails: string[];
}
