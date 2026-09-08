import { Button, Field, Select } from '@/components/ui';
import type { ColumnMapping } from '../../types';

export function MappingStep({
  headers,
  mapping,
  onChange,
  onBack,
  onContinue,
}: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const canContinue = Boolean(mapping.name && mapping.email);

  return (
    <div className="space-y-4">
      <Field label="Name column" htmlFor="map-name">
        <Select
          id="map-name"
          value={mapping.name}
          onChange={(event) => onChange({ ...mapping, name: event.target.value })}
        >
          <option value="">— Select —</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Email column" htmlFor="map-email">
        <Select
          id="map-email"
          value={mapping.email}
          onChange={(event) => onChange({ ...mapping, email: event.target.value })}
        >
          <option value="">— Select —</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Phone column (optional)" htmlFor="map-phone">
        <Select
          id="map-phone"
          value={mapping.phone}
          onChange={(event) => onChange({ ...mapping, phone: event.target.value })}
        >
          <option value="">— None —</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
