import { useQuery } from '@tanstack/react-query';
import { resolvePortalToken } from '../api/portalApi';

export function usePortalResolve(token: string) {
  return useQuery({
    queryKey: ['portal-resolve', token],
    queryFn: () => resolvePortalToken(token),
    retry: false,
    enabled: Boolean(token),
  });
}
