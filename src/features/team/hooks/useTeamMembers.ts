import { useQuery } from '@tanstack/react-query';
import { listTeamMembers } from '../api/teamApi';

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: listTeamMembers,
  });
}
