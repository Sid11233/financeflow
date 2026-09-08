import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ProgressBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getStatusBucket, statusBadgeConfig } from '@/lib/requestStatus';
import { NewRequestDialog } from '@/features/requests/components/NewRequestDialog';
import { ActivityFeed } from '@/features/activity/components/ActivityFeed';
import { useClient } from '../hooks/useClient';
import { useClientRequestHistory } from '../hooks/useClientRequestHistory';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientQuery = useClient(id);
  const historyQuery = useClientRequestHistory(id);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);

  if (clientQuery.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (clientQuery.isError || !clientQuery.data) {
    return <p className="text-sm text-red-600">Could not load this client.</p>;
  }

  const { client } = clientQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">
          {client.name}
          {client.is_archived && (
            <Badge variant="neutral" className="ml-2">
              Archived
            </Badge>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsNewRequestOpen(true)}>+ New Request</Button>
          <Button variant="outline" onClick={() => navigate(`/clients/${id}/edit`)}>
            Edit
          </Button>
        </div>
      </div>

      <NewRequestDialog
        open={isNewRequestOpen}
        onClose={() => setIsNewRequestOpen(false)}
        prefilledClientId={id}
      />

      <Card>
        <CardHeader>
          <CardTitle>Contact info</CardTitle>
        </CardHeader>
        {client.email_bounced_at && (
          <div className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {client.email_bounce_type === 'complained'
              ? 'This client marked a recent email as spam. Emails may not be reaching them.'
              : "Emails to this address have been bouncing — check that it's correct."}
          </div>
        )}
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Email</p>
            <p className="text-sm text-neutral-900">{client.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Phone</p>
            <p className="text-sm text-neutral-900">{client.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Notes</p>
            <p className="text-sm text-neutral-900">{client.notes ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead>Completed on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyQuery.isPending ? (
                Array.from({ length: 3 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 4 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : historyQuery.data?.length ? (
                historyQuery.data.map((request) => {
                  const badge = statusBadgeConfig[getStatusBucket(request.status)];
                  return (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/requests/${request.id}`)}
                    >
                      <TableCell>{request.period_label}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={request.completion_percentage} className="w-24" />
                          <span className="text-xs text-neutral-500">{request.completion_percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.completed_at ? new Date(request.completed_at).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-neutral-400">
                    No requests yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityFeed organizationId={client.organization_id} clientId={client.id} clientName={client.name} />
        </CardContent>
      </Card>
    </div>
  );
}
