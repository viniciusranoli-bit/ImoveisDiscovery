INSERT INTO tb_dismissed_listings (
  user_id,
  property_id,
  canonical_url,
  purpose,
  property_type,
  listing_snapshot,
  dismissed_by_ai
)
SELECT
  analysis.user_id,
  analysis.property_id,
  analysis.description_source,
  'sale',
  'apartment',
  COALESCE(
    snapshot.listing_snapshot,
    jsonb_build_object(
      'id', analysis.property_id::text,
      'title', 'Apartamento analisado',
      'purpose', 'sale',
      'propertyType', 'apartment',
      'neighborhood', property.neighborhood,
      'location', property.location,
      'link', analysis.description_source,
      'source', 'Análise IA',
      'sources', jsonb_build_array('Análise IA'),
      'sourceSearchUrl', analysis.description_source,
      'collectedAt', analysis.analyzed_at,
      'evidence', jsonb_build_array()
    )
  ),
  true
FROM tb_property_analyses analysis
JOIN tb_properties property ON property.id = analysis.property_id
LEFT JOIN LATERAL (
  SELECT result.listing_snapshot
  FROM tb_search_results result
  WHERE result.property_id = analysis.property_id
    AND result.listing_snapshot->>'link' = analysis.description_source
  ORDER BY result.seen_at DESC
  LIMIT 1
) snapshot ON true
WHERE analysis.user_id IS NOT NULL
  AND analysis.purpose = 'sale'
  AND analysis.valid_until > now()
  AND property.property_type = 'apartment'
  AND analysis.result->>'slabRights' = 'not_mentioned'
  AND analysis.result->>'balconyBarbecue' = 'not_mentioned'
ON CONFLICT (user_id, property_id, canonical_url) DO UPDATE
SET listing_snapshot = EXCLUDED.listing_snapshot,
    dismissed_by_ai = true,
    dismissed_at = now();
