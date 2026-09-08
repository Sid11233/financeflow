import { DeadlineLine } from './DeadlineLine';

export function PortalHeader({
  firmName,
  firmLogoUrl,
  periodLabel,
  clientName,
  deadline,
}: {
  firmName: string;
  firmLogoUrl: string | null;
  periodLabel: string;
  clientName: string;
  deadline: string | null;
}) {
  return (
    <div className="px-4 pb-4 pt-6 text-center">
      {firmLogoUrl ? (
        <img src={firmLogoUrl} alt={firmName} className="mx-auto mb-2 h-10 w-auto object-contain" />
      ) : (
        <p className="mb-2 text-sm font-medium text-neutral-500">{firmName}</p>
      )}
      <h1 className="text-xl font-semibold text-neutral-900">{periodLabel} Documents</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {firmName} needs the following from {clientName}.
      </p>
      <DeadlineLine deadline={deadline} />
    </div>
  );
}
