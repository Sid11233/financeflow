export interface ActivityFilterState {
  clientId: string;
  eventType: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = {
  clientId: '',
  eventType: '',
  dateFrom: '',
  dateTo: '',
};
