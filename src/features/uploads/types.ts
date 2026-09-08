export type ChecklistItemStatus = 'pending' | 'received' | 'needs_review' | 'accepted' | 'rejected';

export interface UploadedFile {
  id: string;
  filename: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  isOptional: boolean;
  status: ChecklistItemStatus;
  filesReceived: number;
  files: UploadedFile[];
}

export interface PortalData {
  firmName: string;
  firmLogoUrl: string | null;
  clientName: string;
  periodLabel: string;
  deadline: string | null;
  checklist: ChecklistItem[];
}

export interface UploadTask {
  id: string;
  requiredDocumentId: string;
  file: File;
  displayName: string;
  status: 'processing' | 'uploading' | 'confirming' | 'error';
  progress: number;
  errorMessage?: string;
}
