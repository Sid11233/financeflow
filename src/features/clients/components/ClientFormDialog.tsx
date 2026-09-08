import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle, Field, Input, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useClient } from '../hooks/useClient';
import { useDocumentTypes } from '../hooks/useDocumentTypes';
import { useCreateClient } from '../hooks/useCreateClient';
import { useUpdateClient } from '../hooks/useUpdateClient';
import { clientFormSchema, type ClientFormValues } from '../schemas';
import { DocumentChecklistSelect } from './DocumentChecklistSelect';

export function ClientFormDialog({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { organization, profile } = useAuth();

  const clientQuery = useClient(mode === 'edit' ? id : undefined);
  const documentTypesQuery = useDocumentTypes(organization?.id);
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: '', email: '', phone: '', notes: '', defaultDocumentTypeIds: [] },
  });

  useEffect(() => {
    if (mode === 'edit' && clientQuery.data) {
      reset({
        name: clientQuery.data.client.name,
        email: clientQuery.data.client.email ?? '',
        phone: clientQuery.data.client.phone ?? '',
        notes: clientQuery.data.client.notes ?? '',
        defaultDocumentTypeIds: clientQuery.data.defaultDocumentTypeIds,
      });
    }
  }, [mode, clientQuery.data, reset]);

  function handleClose() {
    navigate('/clients');
  }

  const onSubmit = async (values: ClientFormValues) => {
    if (!organization || !profile) return;

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({
          organizationId: organization.id,
          createdBy: profile.id,
          ...values,
        });
      } else {
        await updateMutation.mutateAsync({
          id: id!,
          organizationId: organization.id,
          createdBy: profile.id,
          ...values,
        });
      }
      handleClose();
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Could not save this client.',
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoadingClient = mode === 'edit' && clientQuery.isPending;

  return (
    <Dialog open onClose={handleClose} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'New client' : 'Edit client'}</DialogTitle>
      </DialogHeader>

      {isLoadingClient ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label="Contact email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
          <Field label="Contact phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" placeholder="+230 5712 3456" {...register('phone')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>

          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Default document checklist</p>
            <Controller
              control={control}
              name="defaultDocumentTypeIds"
              render={({ field }) => (
                <DocumentChecklistSelect
                  documentTypes={documentTypesQuery.data ?? []}
                  selectedIds={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create client' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
