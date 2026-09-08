import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { NewRequestDialog } from './NewRequestDialog';

export function RequestsPage() {
  const navigate = useNavigate();
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Requests</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/requests/new-bulk')}>
            Bulk create
          </Button>
          <Button onClick={() => setIsNewRequestOpen(true)}>+ New Request</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            A full requests list lives on the dashboard for now — this page will get its own view later.
          </p>
        </CardContent>
      </Card>

      <NewRequestDialog open={isNewRequestOpen} onClose={() => setIsNewRequestOpen(false)} />
    </div>
  );
}
