export const vivaRealApartmentCandidate = {
  href:
    "https://www.vivareal.com.br/imovel/apartamento-2-quartos-botafogo-rio-de-janeiro-com-garagem-70m2-venda-RS775000-id-1234567890/",
  text:
    "Apartamento para comprar com 70 m², 2 quartos, 2 banheiros, 1 vaga em Botafogo, Rio de Janeiro R$ 775.000",
};

export const genericPenthouseCandidate = {
  href: "https://example.com/propriedade/cobertura-botafogo-987",
  text: JSON.stringify({
    "@type": "Apartment",
    name: "Cobertura em Botafogo",
    numberOfRooms: 3,
    floorSize: "160 m²",
    description: "Cobertura com 2 vagas de garagem",
    offers: { price: 2_000_000, priceCurrency: "BRL" },
  }),
};
