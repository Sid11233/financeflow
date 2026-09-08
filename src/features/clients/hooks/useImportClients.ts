import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkImportClients } from '../api/importApi';
import type { ImportRowInput } from '../api/importApi';
import { toast } from '@/lib/toast';

export function useImportClients() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { organizationId: string; createdBy: string; rows: ImportRowInput[] }) =>
      bulkImportClients(input.organizationId, input.createdBy, input.rows),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (result.insertedCount > 0) {
        toast.success(`Imported ${result.insertedCount} client${result.insertedCount === 1 ? '' : 's'}.`);
      }
      if (result.duplicateEmails.length > 0) {
        toast.error(
          `${result.duplicateEmails.length} email${result.duplicateEmails.length === 1 ? ' was' : 's were'} already in use and skipped.`,
        );
      }
    },
    onError: () => {
      toast.error('Import failed. Please try again.');
    },
  });
}
