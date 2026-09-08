import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useDocumentTypes } from '@/features/clients/hooks/useDocumentTypes';
import { useClientOptions } from '../hooks/useClientOptions';
import { useClientDefaultChecklist } from '../hooks/useClientDefaultChecklist';
import { useCreateRequest } from '../hooks/useCreateRequest';
import { requestStep1Schema, type RequestStep1Values } from '../schemas';
import { buildInitialChecklist, computeDefaultDeadline, defaultMessageBody, getPreviousPeriod } from '../utils';
import type { ChecklistItem } from '../types';
import { StepClientPeriod } from './wizard/StepClientPeriod';
import { StepChecklist } from './wizard/StepChecklist';
import { StepReview } from './wizard/StepReview';

export function NewRequestDialog({
  open,
  onClose,
  prefilledClientId,
}: {
  open: boolean;
  onClose: () => void;
  prefilledClientId?: string;
}) {
  const { organization } = useAuth();
  const organizationId = organization?.id;
  const defaultDeadlineDay = organization?.default_deadline_day ?? 15;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const clientsQuery = useClientOptions(organizationId);
  const documentTypesQuery = useDocumentTypes(organizationId);
  const createMutation = useCreateRequest();

  const form = useForm<RequestStep1Values>({
    resolver: zodResolver(requestStep1Schema),
    defaultValues: buildDefaults(prefilledClientId, defaultDeadlineDay),
  });

  // Reset the whole wizard every time it's freshly opened.
  useEffect(() => {
    if (!open) return;
    form.reset(buildDefaults(prefilledClientId, defaultDeadlineDay));
    setStep(1);
    setChecklist([]);
    setMessageBody('');
    setDeadlineTouched(false);
    setConflictMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clientId = form.watch('clientId');
  const periodStart = form.watch('periodStart');
  const clientDefaultsQuery = useClientDefaultChecklist(clientId || undefined);

  // Recompute the deadline default whenever the period changes, unless the
  // user has already edited the deadline manually.
  useEffect(() => {
    if (deadlineTouched || !organizationId) return;
    form.setValue('deadline', computeDefaultDeadline(periodStart, defaultDeadlineDay));
  }, [periodStart, organizationId, defaultDeadlineDay, deadlineTouched, form]);

  // Seed the checklist from the selected client's saved defaults once both
  // the client and the org's document types are known.
  useEffect(() => {
    if (!documentTypesQuery.data) return;
    setChecklist(buildInitialChecklist(documentTypesQuery.data, clientDefaultsQuery.data ?? []));
  }, [documentTypesQuery.data, clientDefaultsQuery.data]);

  function handleStep1Continue(values: RequestStep1Values) {
    if (!messageBody) {
      setMessageBody(defaultMessageBody(values.periodLabel, values.deadline));
    }
    setStep(2);
  }

  async function submit(status: 'draft' | 'sent') {
    setConflictMessage(null);
    const values = form.getValues();
    try {
      await createMutation.mutateAsync({
        clientId: values.clientId,
        periodStart: values.periodStart,
        periodLabel: values.periodLabel,
        deadline: values.deadline,
        status,
        checklist,
        messageBody,
      });
      onClose();
    } catch (error) {
      setConflictMessage(error instanceof Error ? error.message : 'Could not create this request.');
    }
  }

  const selectedClient = clientsQuery.data?.find((client) => client.id === clientId) ?? null;

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {step === 1 && 'New request — client & period'}
          {step === 2 && 'New request — checklist'}
          {step === 3 && 'New request — review & send'}
        </DialogTitle>
      </DialogHeader>

      {conflictMessage && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{conflictMessage}</p>
      )}

      <FormProvider {...form}>
        {step === 1 && (
          <StepClientPeriod
            clients={clientsQuery.data ?? []}
            clientLocked={Boolean(prefilledClientId)}
            onDeadlineTouched={() => setDeadlineTouched(true)}
            onContinue={handleStep1Continue}
          />
        )}
      </FormProvider>

      {step === 2 && (
        <StepChecklist
          items={checklist}
          onChange={setChecklist}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepReview
          client={selectedClient}
          periodLabel={form.watch('periodLabel')}
          deadline={form.watch('deadline')}
          checklist={checklist}
          messageBody={messageBody}
          onMessageBodyChange={setMessageBody}
          onBack={() => setStep(2)}
          onSaveDraft={() => submit('draft')}
          onSend={() => submit('sent')}
          isSubmitting={createMutation.isPending}
        />
      )}
    </Dialog>
  );
}

function buildDefaults(prefilledClientId: string | undefined, defaultDeadlineDay: number): RequestStep1Values {
  const period = getPreviousPeriod();
  return {
    clientId: prefilledClientId ?? '',
    periodStart: period.periodStart,
    periodLabel: period.periodLabel,
    deadline: computeDefaultDeadline(period.periodStart, defaultDeadlineDay),
  };
}
