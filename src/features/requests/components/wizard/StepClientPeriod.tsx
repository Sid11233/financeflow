import { Controller, useFormContext } from 'react-hook-form';
import { Button, Field, Input } from '@/components/ui';
import { ClientCombobox } from './ClientCombobox';
import { PeriodPicker } from './PeriodPicker';
import type { RequestStep1Values } from '../../schemas';
import type { ClientOption } from '../../types';

export function StepClientPeriod({
  clients,
  clientLocked,
  onDeadlineTouched,
  onContinue,
}: {
  clients: ClientOption[];
  clientLocked: boolean;
  onDeadlineTouched: () => void;
  onContinue: (values: RequestStep1Values) => void;
}) {
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<RequestStep1Values>();

  const periodStart = watch('periodStart');

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onContinue)} noValidate>
      <Field label="Client" htmlFor="client" error={errors.clientId?.message}>
        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <ClientCombobox
              clients={clients}
              value={field.value}
              onChange={field.onChange}
              disabled={clientLocked}
            />
          )}
        />
      </Field>

      <Field label="Period" htmlFor="period" error={errors.periodStart?.message}>
        <PeriodPicker
          periodStart={periodStart}
          onChange={(newPeriodStart, newPeriodLabel) => {
            setValue('periodStart', newPeriodStart, { shouldValidate: true });
            setValue('periodLabel', newPeriodLabel);
          }}
        />
      </Field>

      <Field label="Deadline" htmlFor="deadline" error={errors.deadline?.message}>
        <Controller
          control={control}
          name="deadline"
          render={({ field }) => (
            <Input
              id="deadline"
              type="date"
              value={field.value}
              onChange={(event) => {
                onDeadlineTouched();
                field.onChange(event.target.value);
              }}
            />
          )}
        />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
