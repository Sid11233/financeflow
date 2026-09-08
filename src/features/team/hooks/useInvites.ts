import { useQuery } from '@tanstack/react-query';
import { listInvites } from '../api/teamApi';

export function useInvites() {
  return useQuery({
    queryKey: ['invites'],
    queryFn: listInvites,
  });
}
