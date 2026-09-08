import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { applyColumnMapping, guessColumn } from '../../csv';
import { useImportClients } from '../../hooks/useImportClients';
import type { ColumnMapping, ImportResult, ImportRowResult, ParsedCsv } from '../../types';
import { UploadStep } from './UploadStep';
import { MappingStep } from './MappingStep';
import { PreviewStep } from './PreviewStep';
import { ResultStep } from './ResultStep';

type Step = 'upload' | 'mapping' | 'preview' | 'result';

const EMPTY_MAPPING: ColumnMapping = { name: '', email: '', phone: '' };

export function ImportClientsPage() {
  const navigate = useNavigate();
  const { organization, profile } = useAuth();
  const importMutation = useImportClients();

  const [step, setStep] = useState<Step>('upload');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function handleParsed(parsed: ParsedCsv) {
    setCsv(parsed);
    setMapping({
      name: guessColumn(parsed.headers, ['name', 'full name', 'client', 'client name']),
      email: guessColumn(parsed.headers, ['email', 'e-mail', 'contact email']),
      phone: guessColumn(parsed.headers, ['phone', 'contact phone', 'mobile', 'phone number']),
    });
    setStep('mapping');
  }

  function handleMappingContinue() {
    if (!csv) return;
    setResults(applyColumnMapping(csv.rows, mapping));
    setStep('preview');
  }

  async function handleConfirm() {
    if (!organization || !profile) return;

    const validRows = results.filter((row) => row.errors.length === 0);
    const result = await importMutation.mutateAsync({
      organizationId: organization.id,
      createdBy: profile.id,
      rows: validRows.map(({ name, email, phone }) => ({ name, email, phone })),
    });
    setImportResult(result);
    setStep('result');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Import clients</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            {step === 'upload' && 'Upload a CSV file'}
            {step === 'mapping' && 'Map your columns'}
            {step === 'preview' && 'Review before importing'}
            {step === 'result' && 'Import complete'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'upload' && <UploadStep onParsed={handleParsed} />}

          {step === 'mapping' && csv && (
            <MappingStep
              headers={csv.headers}
              mapping={mapping}
              onChange={setMapping}
              onBack={() => setStep('upload')}
              onContinue={handleMappingContinue}
            />
          )}

          {step === 'preview' && (
            <PreviewStep
              results={results}
              isSubmitting={importMutation.isPending}
              onBack={() => setStep('mapping')}
              onConfirm={handleConfirm}
            />
          )}

          {step === 'result' && importResult && (
            <ResultStep result={importResult} totalRows={results.length} onDone={() => navigate('/clients')} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
