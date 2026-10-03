# Agente de monitoramento de imóveis — Botafogo e metrô

Este documento define as regras de negócio. O desenho técnico e o fluxo de dados estão em [ARCHITECTURE.md](./ARCHITECTURE.md).
O roadmap de implementação fica no TODO.md na raiz do projeto.


## Missão

Monitorar continuamente apartamentos residenciais para aluguel e compra no Rio de Janeiro. Identificar oportunidades cedo, eliminar anúncios incompatíveis e reportar somente opções com dados verificáveis.

## Perfil de busca

### Requisitos obrigatórios

- Finalidade: aluguel ou compra residencial, identificada sem ambiguidade.
- Mínimo de 2 quartos.
- Pelo menos 1 vaga de garagem efetivamente vinculada ou disponível para o imóvel.
- Localização: Botafogo ou imóvel próximo a uma estação de metrô.
- Para aluguel: custo mensal total de até **R$ 12.000**, incluindo aluguel, condomínio e IPTU.
- Para compra: aplicar o teto de preço quando ele for definido; até lá, informar o valor sem excluir pelo preço.

O tipo da vaga — fixa, rotativa, coberta ou descoberta — deve ser registrado quando disponível, mas tem baixa influência no ranking. A existência da vaga permanece obrigatória.

### Características de alta relevância

- Ser uma cobertura.
- Ter direito privativo de uso da laje ou possibilidade de construção/expansão formalmente documentada.

Não tratar menções informais como confirmação jurídica do direito à laje. Registrar a evidência divulgada e manter como pendência a verificação na matrícula, convenção de condomínio ou documentação equivalente.

### Características adicionais

- Churrasqueira na varanda: atribuir pontos adicionais.
- Varanda, área externa privativa e terraço: atribuir pontos adicionais.
- Mobiliado, pet, andar, elevador, portaria e estado do imóvel: registrar quando informados, sem presumir requisitos não definidos.

### Preferência geográfica

Ordem de prioridade:

1. Próximo à Praia de Botafogo, 501 — Botafogo, Rio de Janeiro/RJ, com possibilidade realista de ir caminhando ao trabalho.
2. Botafogo, especialmente a parte próxima à Praia de Botafogo, Voluntários da Pátria, São Clemente, Nelson Mandela e Rua da Passagem.
3. Outros bairros da Zona Sul com acesso prático ao metrô, dando preferência a imóveis a até 10 minutos a pé de uma estação.

### Regras de distância

- **Prioridade alta:** até 20 minutos de caminhada da Praia de Botafogo, 501.
- **Prioridade média:** entre 21 e 35 minutos de caminhada da Praia de Botafogo, 501, ou até 10 minutos a pé de metrô.
- **Prioridade baixa:** demais imóveis próximos ao metrô, desde que atendam aos requisitos obrigatórios.

Quando possível, usar rota a pé, e não distância em linha reta. Informar a estimativa, a fonte e eventuais limitações da medição.


## Ações e caracteristicas:

Os dois tipos de imoveis tem diferentes maneiras de classificar e buscar informações

- Cobertura - quando for cobertura, deverá ter o botáo de favorito (quando marcado deverá aparecer no favorito) e um botão para descartar (quando escolhido, deverá entrar no historico do tipo do imovel e náo aparecer no resultado de novo, mesmo que aparece na nova pesquisa). A IA náo poderá rodar nessa caso.

- Apartamento - quando for apartamento, deverá ter o botáo de favorito (quando marcado deverá aparecer no favorito), um botão para descartar (quando escolhido, deverá entrar no historico do tipo do imovel e náo aparecer no resultado de novo, mesmo que aparece na nova pesquisa), e o botáo de IA para levantar as informações extras.



## Fontes a monitorar

Priorizar anúncios recentes em plataformas imobiliárias confiáveis, como QuintoAndar, Viva Real, ZAP Imóveis, OLX Imóveis, Imovelweb, Loft e imobiliárias locais. Incluir links diretos.

Preferir APIs oficiais, feeds e integrações autorizadas. Usar automação de navegador somente quando compatível com os termos da fonte. Não assumir que um anúncio ainda está disponível: validar data, disponibilidade e coerência antes de alertar. Nunca inventar dados ausentes.

## Dados a coletar por anúncio

- Finalidade: aluguel ou compra.
- Link direto, plataforma, identificador externo e data/hora da consulta.
- Data de publicação ou atualização, quando disponível.
- Endereço ou localização aproximada, respeitando o que o anúncio divulga.
- Bairro.
- Preço de venda ou valor do aluguel, conforme a finalidade.
- Condomínio, IPTU e demais taxas divulgadas.
- Para aluguel: custo mensal total estimado.
- Para compra: preço por m² e custos recorrentes; não misturar preço de aquisição com despesas mensais.
- Área, quartos, banheiros e vagas.
- Existência da vaga e, secundariamente, seu tipo e condição.
- Cobertura, terraço, área externa e direito à laje, incluindo a evidência textual e o estado de confirmação.
- Mobiliado ou não, se informado.
- Distância e tempo a pé até Praia de Botafogo, 501 e até a estação de metrô mais próxima.
- Pontos de atenção: taxa extra, documentação, ocupação, laudêmio, foro, estado do imóvel, anúncio duplicado, contradição ou possível golpe.

## Processo

1. Pesquisar e consolidar anúncios de aluguel e compra das fontes definidas.
2. Normalizar os dados sem completar campos ausentes por inferência.
3. Remover duplicidades usando identificador, endereço aproximado, metragem, fotos, preço e descrição como evidências.
4. Excluir imóveis sem 2 quartos, sem confirmação de 1 vaga ou incompatíveis com a localização.
5. Aplicar os limites financeiros próprios de cada finalidade.
6. Classificar a prioridade geográfica e calcular o ranking de características separadamente.
7. Dar peso alto a cobertura e direito à laje; dar peso baixo ao tipo da vaga.
8. Comparar com o histórico e alertar somente anúncios novos ou mudanças relevantes, como queda de preço, disponibilidade ou correção de dados.
9. Manter histórico de versões e alertas para evitar repetição.
10. Após a conclusão de uma análise por IA, não tratar o mesmo imóvel como novo nem repetir a análise por seis meses. Pesquisas sem análise de IA não iniciam o prazo. Registrar reaparições posteriores à análise no histórico sem estender a janela.

## Formato do alerta

Enviar primeiro um resumo curto com:

- Quantidade de novos imóveis elegíveis, separada entre aluguel e compra.
- Quantidade de oportunidades de prioridade alta.
- Quantidade de coberturas ou imóveis com possível direito à laje.
- Melhor oportunidade do período e o principal risco dela.

Depois, apresentar uma tabela com uma linha por anúncio:

| Finalidade | Prioridade | Imóvel/localização | Preço | Condomínio + IPTU | Total mensal¹ | Quartos | Vaga | Cobertura/laje | Trabalho | Metrô | Link | Alertas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

¹ Aplicável ao aluguel; para compra, exibir os custos recorrentes separadamente.

Ao fim, incluir:

- **Melhores opções:** no máximo 3, explicando objetivamente cada escolha.
- **Pendências para confirmar:** informações que exigem documentação ou contato autorizado com corretor/anunciante.
- **Descartados relevantes:** somente quando um imóvel parecer promissor, mas falhar em quarto, vaga, localização ou limite financeiro aplicável.

## Qualidade e segurança

- Não recomendar imóvel sem confirmar os requisitos obrigatórios no anúncio ou com a imobiliária.
- Separar claramente fatos divulgados, dados calculados e inferências da IA.
- Sinalizar preço muito abaixo do mercado, pagamento antecipado, comunicação fora da plataforma ou divergências como possível golpe.
- Para compra, não afirmar a existência de direito à laje sem evidência documental.
- Não compartilhar dados pessoais do usuário com imobiliárias.
- Não realizar contato, proposta, agendamento ou pagamento sem autorização explícita.

## Calibração pendente

Antes do primeiro monitoramento, perguntar objetivamente:

1. Qual é o teto de preço para compra e há condições de entrada ou financiamento?
2. Quais bairros devem ser priorizados ou excluídos? Solicitar feedback em tela para aprendizado e histórico.
3. Há requisitos adicionais, como metragem mínima, pet, andar, elevador ou portaria?
4. Qual frequência de monitoramento e qual canal deve receber os alertas?
