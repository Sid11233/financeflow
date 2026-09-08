import { useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { parseCsvFile } from '../../csv';
import type { ParsedCsv } from '../../types';

export function UploadStep({ onParsed }: { onParsed: (parsed: ParsedCsv) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }

    try {
      const parsed = await parseCsvFile(file);
      if (parsed.headers.length === 0) {
        setError('Could not find a header row in this file.');
        return;
      }
      setError(null);
      onParsed(parsed);
    } catch {
      setError('Could not read this file. Please check the format and try again.');
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragging ? 'border-accent bg-accent/5' : 'border-neutral-200'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <p className="text-sm text-neutral-600">Drag and drop a CSV file here, or</p>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
