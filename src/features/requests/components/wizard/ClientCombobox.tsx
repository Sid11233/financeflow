import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import type { ClientOption } from '../../types';

export function ClientCombobox({
  clients,
  value,
  onChange,
  disabled,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  disabled?: boolean;
}) {
  const selected = clients.find((client) => client.id === value) ?? null;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.name ?? '');
    // Only re-sync from the selected client when the *value* changes
    // (e.g. prefilled, or picked from the list) — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const isSearching = query.trim().length > 0 && query !== selected?.name;
  const filtered = isSearching
    ? clients.filter((client) => client.name.toLowerCase().includes(query.trim().toLowerCase()))
    : clients;

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        disabled={disabled}
        placeholder="Search clients…"
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
      />
      {isOpen && !disabled && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-md">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-neutral-400">No clients found.</p>
          ) : (
            filtered.map((client) => (
              <button
                key={client.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  onChange(client.id);
                  setQuery(client.name);
                  setIsOpen(false);
                }}
              >
                {client.name}
                {client.email && <span className="ml-1 text-neutral-400">({client.email})</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
