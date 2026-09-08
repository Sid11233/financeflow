import { useNavigate } from 'react-router-dom';
import {
  Badge,
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
import type { RequestOverviewRow } from '../types';
import { formatLastReminder, formatRelativeDeadline } from '../utils';

const columns = ['Client', 'Status', 'Progress', 'Missing', 'Deadline', 'Last reminder'];

export function RequestsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column) => (
              <TableCell key={column}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RequestsTable({ requests }: { requests: RequestOverviewRow[] }) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const badge = statusBadgeConfig[getStatusBucket(request.status)];

          return (
            <TableRow
              key={request.id}
              className="cursor-pointer"
              onClick={() => navigate(`/requests/${request.id}`)}
            >
              <TableCell className="font-medium text-neutral-900">{request.client_name}</TableCell>
              <TableCell>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <ProgressBar value={request.completion_percentage} className="w-24" />
                  <span className="text-xs text-neutral-500">{request.completion_percentage}%</span>
                </div>
              </TableCell>
              <TableCell>{request.missing_document_count}</TableCell>
              <TableCell>{formatRelativeDeadline(request.deadline)}</TableCell>
              <TableCell>{formatLastReminder(request.last_reminder_sent_at)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
