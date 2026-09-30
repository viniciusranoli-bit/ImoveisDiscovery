UPDATE properties p
SET
  last_researched_at = latest.analyzed_at,
  updated_at = now()
FROM (
  SELECT property_id, max(analyzed_at) AS analyzed_at
  FROM property_analyses
  GROUP BY property_id
) latest
WHERE latest.property_id = p.id;

UPDATE properties p
SET
  last_researched_at = NULL,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM property_analyses pa
  WHERE pa.property_id = p.id
);

UPDATE search_results sr
SET
  eligible_for_research = NOT EXISTS (
    SELECT 1
    FROM property_analyses pa
    WHERE pa.property_id = sr.property_id
      AND pa.analyzed_at <= sr.seen_at
      AND pa.valid_until > sr.seen_at
  ),
  suppressed_until = (
    SELECT max(pa.valid_until)
    FROM property_analyses pa
    WHERE pa.property_id = sr.property_id
      AND pa.analyzed_at <= sr.seen_at
      AND pa.valid_until > sr.seen_at
  );

UPDATE search_runs run
SET
  eligible_count = totals.eligible_count,
  suppressed_count = totals.suppressed_count
FROM (
  SELECT
    search_run_id,
    count(*) FILTER (WHERE eligible_for_research)::integer AS eligible_count,
    count(*) FILTER (WHERE NOT eligible_for_research)::integer AS suppressed_count
  FROM search_results
  GROUP BY search_run_id
) totals
WHERE totals.search_run_id = run.id;
