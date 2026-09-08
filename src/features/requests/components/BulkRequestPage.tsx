import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useDocumentTypes } from '@/features/clients/hooks/useDocumentTypes';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useClientOptions } from '../hooks/useClientOptions';
import { useBulkClientDefaults } from '../hooks/useBulkClientDefaults';
import { useClientsWithExistingRequest } from '../hooks/useClientsWithExistingRequest';
import { sendRequest } from '../api/sendRequestApi';
import { PeriodPicker } from './wizard/PeriodPicker';
import { ChecklistEditor } from './wizard/ChecklistEditor';
import { buildInitialChecklist, computeDefaultDeadline, getPreviousPeriod } from '../utils';
import { runInBatches } from '../lib/batch';
import type { ChecklistItem, ClientOption } from '../types';
import { useTrackEvent } from '@/features/analytics/hooks/useTrackEvent';

interface RowResult {
  clientId: string;
  clientName: string;
  success: boolean;
  message: string;
}

type Step = 'setup' | 'confirm' | 'processing' | 'results';

const BATCH_SIZE = 3;

export function BulkRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const track = useTrackEvent();
  const { organization } = useAuth();
  const organizationId = organization?.id;

  const initialPeriod = useMemo(() => getPreviousPeriod(), []);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodLabel, setPeriodLabel] = useState(initialPeriod.periodLabel);
  const [deadline, setDeadline] = useState(
    computeDefaultDeadline(initialPeriod.periodStart, organization?.default_deadline_day ?? 15),
  );
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);

  useEffect(() => {
    if (deadlineTouched || !organization) return;
    setDeadline(computeDefaultDeadline(periodStart, organization.default_deadline_day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart, organization?.default_deadline_day]);

  const clientsQuery = useClientOptions(organizationId);
  const documentTypesQuery = useDocumentTypes(organizationId);
  const defaultsQuery = useBulkClientDefaults(organizationId);
  const existingQuery = useClientsWithExistingRequest(organizationId, periodStart);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  // (Re)seed per-client checklists and the default selection once every
  // piece of reference data is loaded, or when the period changes (a new
  // period has a different "already has a request" set).
  useEffect(() => {
    if (!clientsQuery.data || !documentTypesQuery.data || !defaultsQuery.data || !existingQuery.data) return;

    const nextChecklists: Record<string, ChecklistItem[]> = {};
    const nextSelected = new Set<string>();

    for (const client of clientsQuery.data) {
      nextChecklists[client.id] = buildInitialChecklist(documentTypesQuery.data, defaultsQuery.data[client.id] ?? []);
      if (!skipExisting || !existingQuery.data.has(client.id)) {
        nextSelected.add(client.id);
      }
    }

    setChecklists(nextChecklists);
    setSelected(nextSelected);
  }, [clientsQuery.data, documentTypesQuery.data, defaultsQuery.data, existingQuery.data, skipExisting]);

  const [step, setStep] = useState<Step>('setup');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RowResult[]>([]);

  function toggleSelected(clientId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  const selectedClients: ClientOption[] = (clientsQuery.data ?? []).filter((client) => selected.has(client.id));

  async function handleConfirmSend() {
    setStep('processing');
    setProgress({ done: 0, total: selectedClients.length });
    setResults([]);

    const finalResults = await runInBatches(
      selectedClients,
      BATCH_SIZE,
      async (client): Promise<RowResult> => {
        try {
          const result = await sendRequest({
            clientId: client.id,
            periodStart,
            periodLabel,
            deadline,
            status: 'sent',
            checklist: checklists[client.id] ?? [],
          });
          return {
            clientId: client.id,
            clientName: client.name,
            success: true,
            message: result.emailSent === false ? 'Created, but the email failed to send.' : 'Sent',
          };
        } catch (error) {
          return {
            clientId: client.id,
            clientName: client.name,
            success: false,
            message: error instanceof Error ? error.message : 'Failed',
          };
        }
      },
      (soFar) => {
        setProgress({ done: soFar.length, total: selectedClients.length });
        setResults(soFar);
      },
    );

    setResults(finalResults);
    setStep('results');
    queryClient.invalidateQueries({ queryKey: ['request-overview'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    const succeeded = finalResults.filter((row) => row.success).length;
    const failed = finalResults.length - succeeded;
    track('bulk_request_created', { succeeded, failed, total: finalResults.length });
    if (succeeded > 0) toast.success(`Sent ${succeeded} request${succeeded === 1 ? '' : 's'}.`);
    if (failed > 0) toast.error(`${failed} request${failed === 1 ? '' : 's'} failed.`);
  }

  if (step === 'processing') {
    const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900">Sending requests…</h1>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-neutral-500">
          {progress.done} of {progress.total} processed
        </p>
      </div>
    );
  }

  if (step === 'results') {
    const succeeded = results.filter((row) => row.success).length;
    const failed = results.length - succeeded;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900">Bulk request results</h1>
        <p className="text-sm text-neutral-600">
          {succeeded} succeeded, {failed} failed.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell>{row.clientName}</TableCell>
                <TableCell className={row.success ? 'text-emerald-600' : 'text-red-600'}>{row.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button onClick={() => navigate('/requests')}>Done</Button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900">Confirm bulk send</h1>
        <p className="text-sm text-neutral-600">
          You are about to send {selectedClients.length} request{selectedClients.length === 1 ? '' : 's'} for{' '}
          {periodLabel}, due {deadline}.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setStep('setup')}>
            Back
          </Button>
          <Button onClick={handleConfirmSend}>
            Send {selectedClients.length} request{selectedClients.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Bulk create requests</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <Field label="Period" htmlFor="bulk-period">
            <PeriodPicker
              periodStart={periodStart}
              onChange={(newStart, newLabel) => {
                setPeriodStart(newStart);
                setPeriodLabel(newLabel);
              }}
            />
          </Field>
          <Field label="Deadline" htmlFor="bulk-deadline">
            <Input
              id="bulk-deadline"
              type="date"
              value={deadline}
              onChange={(event) => {
                setDeadlineTouched(true);
                setDeadline(event.target.value);
              }}
            />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm text-neutral-600">
            <Checkbox checked={skipExisting} onChange={(event) => setSkipExisting(event.target.checked)} />
            Skip clients who already have a request for this period
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>&nbsp;</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead>&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clientsQuery.data ?? []).map((client) => {
                const alreadyHasRequest = existingQuery.data?.has(client.id) ?? false;
                const checklist = checklists[client.id] ?? [];
                const checkedCount = checklist.filter((item) => item.isChecked).length;

                return (
                  <TableRow key={client.id} className={alreadyHasRequest ? 'opacity-60' : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(client.id)} onChange={() => toggleSelected(client.id)} />
                    </TableCell>
                    <TableCell>
                      {client.name}
                      {alreadyHasRequest && (
                        <span className="ml-2 text-xs text-neutral-400">(already has a request)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-600">
                      {checkedCount} of {checklist.length} item{checklist.length === 1 ? '' : 's'}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-sm text-accent underline"
                        onClick={() => setEditingClientId(client.id)}
                      >
                        Edit
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={selected.size === 0} onClick={() => setStep('confirm')}>
          Continue with {selected.size} client{selected.size === 1 ? '' : 's'}
        </Button>
      </div>

      <Dialog open={editingClientId !== null} onClose={() => setEditingClientId(null)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit checklist</DialogTitle>
        </DialogHeader>
        {editingClientId && (
          <ChecklistEditor
            items={checklists[editingClientId] ?? []}
            onChange={(items) => setChecklists((prev) => ({ ...prev, [editingClientId]: items }))}
          />
        )}
        <DialogFooter>
          <Button onClick={() => setEditingClientId(null)}>Done</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
