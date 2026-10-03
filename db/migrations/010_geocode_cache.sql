-- Cache de coordenadas para endereços divulgados nos anúncios (mapa).

CREATE TABLE tb_geocode_cache (
  address_key text PRIMARY KEY,
  query_text text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tb_geocode_cache IS 'Coordenadas obtidas por geocodificação de endereços publicados; evita repetir consultas externas.';
