import { supabase } from '@/lib/supabase';

// Every analytics_* view self-filters to nothing for a non-staff caller
// (see 0041_pilot_analytics.sql) — no additional filtering needed here.
// PostgREST's default max_rows (1000, see supabase/config.toml) caps a
// single fetch; fine for a pilot's data volume, worth revisiting if this
// ever needs to scale past that.

export async function listAnalyticsRequests() {
  const { data, error } = await supabase.from('analytics_requests').select('*');
  if (error) throw error;
  return data;
}

export async function listClassificationOutcomes() {
  const { data, error } = await supabase.from('analytics_classification_outcomes').select('*');
  if (error) throw error;
  return data;
}

export async function listReassignments() {
  const { data, error } = await supabase.from('analytics_reassignments').select('*');
  if (error) throw error;
  return data;
}

export async function listReviewActions() {
  const { data, error } = await supabase.from('analytics_review_actions').select('*');
  if (error) throw error;
  return data;
}
