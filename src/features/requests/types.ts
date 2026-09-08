export interface ChecklistItem {
  key: string;
  documentTypeId: string | null;
  customName: string | null;
  label: string;
  isOptional: boolean;
  isChecked: boolean;
}

export interface ClientOption {
  id: string;
  name: string;
  email: string | null;
}

export interface AiPeriod {
  start: string | null;
  end: string | null;
  label: string | null;
}

export interface AiClassification {
  document_type: string;
  document_type_label: string;
  period: AiPeriod;
  company_name: string | null;
  counterparty_name: string | null;
  currency: string | null;
  total_amount: number | null;
  confidence: number;
  reasoning: string;
}

export interface ChecklistRequiredDocument {
  id: string;
  document_type_id: string | null;
  custom_name: string | null;
  label: string;
  status: 'pending' | 'received' | 'needs_review' | 'accepted' | 'rejected' | 'waived';
  is_optional: boolean;
  sort_order: number;
  waived_reason: string | null;
  waived_at: string | null;
}

export interface ChecklistDocument {
  id: string;
  request_id: string;
  required_document_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploader_ip: string | null;
  ai_classification: AiClassification | null;
  ai_confidence: number | null;
  review_status: 'unreviewed' | 'auto_accepted' | 'confirmed' | 'reassigned' | 'rejected';
  review_reason: string | null;
}

export interface RequestDetail {
  id: string;
  organization_id: string;
  client_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  period_start: string;
  period_label: string;
  status: 'draft' | 'sent' | 'partial' | 'complete' | 'overdue' | 'cancelled';
  deadline: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  reminders_paused_at: string | null;
  completion_percentage: number;
  required_count: number;
  resolved_count: number;
  waived_count: number;
  needs_review_count: number;
  days_until_deadline: number | null;
}

export interface ReminderRow {
  id: string;
  channel: string;
  type: 'scheduled' | 'manual';
  scheduled_for: string;
  sent_at: string | null;
  skipped_at: string | null;
}

