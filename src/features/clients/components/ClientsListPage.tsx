import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { MailWarning } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuItem,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { NewRequestDialog } from '@/features/requests/components/NewRequestDialog';
import { useClients } from '../hooks/useClients';
import { useArchiveClient } from '../hooks/useArchiveClient';
import { useUnarchiveClient } from '../hooks/useUnarchiveClient';

const columns = ['Name', 'Contact email', 'Contact phone', 'Active requests', 'Last request', ''];

export function ClientsListPage() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const organizationId = organization?.id;

  const [searchParams, setSearchParams] = useSearchParams();
  const bouncedOnly = searchParams.get('bounced') === '1';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [newRequestClientId, setNewRequestClientId] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, showArchived, bouncedOnly]);

  const clientsQuery = useClients(organizationId, { search: debouncedSearch, showArchived, page, bouncedOnly });
  const archiveMutation = useArchiveClient();
  const unarchiveMutation = useUnarchiveClient();

  const rows = clientsQuery.data?.rows ?? [];
  const total = clientsQuery.data?.total ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-neutral-900">Clients</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/clients/import')}>
            Import CSV
          </Button>
          <Button onClick={() => navigate('/clients/new')}>+ New Client</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <Checkbox checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Show archived
        </label>
      </div>

      {bouncedOnly && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <MailWarning className="h-4 w-4" aria-hidden="true" />
          <span>Showing clients with a bounced or complained email.</span>
          <button
            type="button"
            className="ml-auto font-medium underline"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Clear filter
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsQuery.isPending ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-neutral-400">
                    {bouncedOnly
                      ? 'No clients with a bounced or complained email.'
                      : debouncedSearch
                        ? 'No clients match your search.'
                        : 'No clients yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell
                      className="cursor-pointer font-medium text-neutral-900"
                      onClick={() => navigate(`/clients/${client.id}`)}
                    >
                      {client.name}
                      {client.is_archived && (
                        <Badge variant="neutral" className="ml-2">
                          Archived
                        </Badge>
                      )}
                      {client.email_bounced_at && (
                        <MailWarning
                          className="ml-2 inline h-3.5 w-3.5 text-amber-600"
                          aria-label="Email bounced or complained"
                        />
                      )}
                    </TableCell>
                    <TableCell>{client.email ?? '—'}</TableCell>
                    <TableCell>{client.phone ?? '—'}</TableCell>
                    <TableCell>{client.active_request_count}</TableCell>
                    <TableCell className="capitalize">{client.last_request_status ?? '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu trigger={<span className="px-2 text-neutral-500">⋯</span>}>
                        <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}/edit`)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setNewRequestClientId(client.id)}>
                          New Request
                        </DropdownMenuItem>
                        {client.is_archived ? (
                          <DropdownMenuItem onClick={() => unarchiveMutation.mutate(client.id)}>
                            Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem destructive onClick={() => archiveMutation.mutate(client.id)}>
                            Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <NewRequestDialog
        open={newRequestClientId !== null}
        onClose={() => setNewRequestClientId(null)}
        prefilledClientId={newRequestClientId ?? undefined}
      />

      {/* /clients/new and /clients/:id/edit render ClientFormDialog here as an overlay */}
      <Outlet />
    </div>
  );
}
