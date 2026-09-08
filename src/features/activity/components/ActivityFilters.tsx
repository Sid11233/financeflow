import { useQuery } from '@tanstack/react-query';
import { Field, Input, Select } from '@/components/ui';
import { ACTIVITY_EVENT_TYPES } from '@/lib/activity';
import { listClientOptions } from '../api/activityApi';
import type { ActivityFilterState } from '../types';

function formatEventTypeLabel(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

export function ActivityFilters({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: ActivityFilterState;
  onChange: (value: ActivityFilterState) => void;
}) {
  const clientsQuery = useQuery({
    queryKey: ['activity-filter-clients', organizationId],
    queryFn: () => listClientOptions(organizationId),
  });

  function update(patch: Partial<ActivityFilterState>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Client" htmlFor="activity-filter-client">
        <Select
          id="activity-filter-client"
          value={value.clientId}
          onChange={(event) => update({ clientId: event.target.value })}
        >
          <option value="">All clients</option>
          {(clientsQuery.data ?? []).map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Event type" htmlFor="activity-filter-event-type">
        <Select
          id="activity-filter-event-type"
          value={value.eventType}
          onChange={(event) => update({ eventType: event.target.value })}
        >
          <option value="">All event types</option>
          {ACTIVITY_EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {formatEventTypeLabel(eventType)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="From" htmlFor="activity-filter-date-from">
        <Input
          id="activity-filter-date-from"
          type="date"
          value={value.dateFrom}
          onChange={(event) => update({ dateFrom: event.target.value })}
        />
      </Field>

      <Field label="To" htmlFor="activity-filter-date-to">
        <Input
          id="activity-filter-date-to"
          type="date"
          value={value.dateTo}
          onChange={(event) => update({ dateTo: event.target.value })}
        />
      </Field>
    </div>
  );
}
