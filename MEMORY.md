# Memória do agente — busca de aluguel

## Objetivo desta memória

Manter preferências confirmadas, decisões e aprendizados do usuário para melhorar as pesquisas futuras de imóveis. Consultar este arquivo antes de cada monitoramento e atualizá-lo após respostas relevantes do usuário.

Esta memória complementa o `AGENTES.md`; em caso de conflito, a instrução mais recente e explícita do usuário prevalece.

## Regras de aprendizado

- Registrar apenas informações explicitamente fornecidas, confirmadas ou corrigidas pelo usuário.
- Distinguir fato confirmado, preferência e hipótese. Nunca transformar uma hipótese em requisito.
- Incluir data de registro e, quando aplicável, a fonte: “usuário”, “anúncio” ou “corretor”.
- Ao receber mudança de preferência, substituir a regra antiga e mover a anterior para o histórico.
- Não registrar senhas, documentos, dados bancários, credenciais ou dados pessoais desnecessários.
- Não inferir renda, orçamento, disponibilidade de visita ou intenção de fechar negócio.
- Quando uma informação estiver ausente e for material para a pesquisa, perguntar ao usuário; não preencher por suposição.

## Perfil atual confirmado

| Campo | Valor | Status | Registrado em |
| --- | --- | --- | --- |
| Finalidade | Aluguel residencial | Confirmado | 2026-08-23 |
| Local de trabalho | Praia de Botafogo, 501 — Botafogo, Rio de Janeiro/RJ | Confirmado | 2026-08-23 |
| Quartos mínimos | 2 | Confirmado | 2026-08-23 |
| Vagas mínimas | 1 | Confirmado | 2026-08-23 |
| Região prioritária | Botafogo e proximidades caminháveis do trabalho | Confirmado | 2026-08-23 |
| Alternativa geográfica | Imóveis próximos ao metrô | Confirmado | 2026-08-23 |

## Preferências e pesos de decisão

| Critério | Preferência atual | Peso | Status | Observação |
| --- | --- | --- | --- | --- |
| Caminhada até o trabalho | Quanto menor, melhor | Alto | Confirmado | Priorizar rota a pé, não distância em linha reta |
| Proximidade ao metrô | Preferencial fora da área caminhável | Alto | Confirmado | Informar tempo caminhando até a estação |
| Custo mensal total | Até R$ 12.000, incluindo aluguel, condomínio e IPTU | Alto | Confirmado | Não recomendar acima do teto sem sinalizar |
| Varanda/churrasqueira | Churrasqueira na varanda recebe pontos adicionais | Médio | Confirmado | Preferência, não requisito eliminatório |
| Cobertura | Ainda não informado | A definir | Pendente | Perguntar antes de filtrar |
| Aceita pets | Ainda não informado | A definir | Pendente | Perguntar antes de filtrar |
| Mobiliado | Ainda não informado | A definir | Pendente | Perguntar antes de filtrar |

## Regras aprendidas para busca

- Não apresentar imóvel com menos de dois quartos ou sem pelo menos uma vaga confirmada.
- Tratar vaga “rotativa” como condição diferente de vaga fixa; destacar no alerta e não assumir equivalência.
- Priorizar imóveis em que o deslocamento a pé à Praia de Botafogo, 501 seja viável.
- Para opções fora de Botafogo, priorizar acesso prático a estação de metrô.
- Informar sempre o custo mensal total quando houver dados suficientes; não estimar itens não divulgados.
- Alertar sobre anúncios duplicados, dados contraditórios, taxa relevante não informada e sinais de golpe.

## Preferências aprendidas a partir de feedback

Registrar apenas conclusões explicitamente declaradas no feedback. Ações rápidas sem comentário permanecem como contexto do anúncio, sem se tornarem regra geral.

| Data | Origem | Preferência confirmada | Aplicação | Confiança |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Registro de feedback sobre anúncios

Preencher após cada avaliação do usuário. O objetivo é converter feedback em regra apenas quando for recorrente ou explicitamente declarado como preferência.

| Data | Anúncio/link | Feedback do usuário | Aprendizado | Ação para próximas buscas | Confiança |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |
| 2026-08-25 | Imovelweb | https://www.imovelweb.com.br/apartamentos-aluguel-botafogo-rio-de-janeiro.html | Reportado | 2026-08-25 | Primeira consulta registrada |
| 2026-08-25 | Chaves na Mão | https://www.chavesnamao.com.br/imoveis-para-alugar/rj-rio-de-janeiro/botafogo | Reportado | 2026-08-25 | Primeira consulta registrada |
| 2026-08-25 | Diluane Negócios Imobiliários | https://www.diluanenegociosimobiliarios.com/imoveis/aluguel/apartamento/rj/rio-de-janeiro/botafogo | Reportado | 2026-08-25 | Primeira consulta registrada |
| 2026-08-25 | Casa Mineira | https://www.casamineira.com.br/aluguel/imovel/botafogo_rio-de-janeiro_rj | Reportado | 2026-08-25 | Primeira consulta registrada |
| 2026-08-25 | Nestoria | https://www.nestoria.com.br/botafogo/imoveis/aluguel | Reportado | 2026-08-25 | Primeira consulta registrada |

| 2026-08-24 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/imoveis/rj+rio-de-janeiro+zona-sul+botafogo | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | QuintoAndar | https://www.quintoandar.com.br/alugar/imovel/botafogo-rio-de-janeiro-rj-brasil | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Viva Real | https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro/zona-sul/botafogo | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | OLX | https://www.olx.com.br/imoveis/aluguel/estado-rj/rio-de-janeiro-e-regiao/zona-sul/botafogo | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Imovelweb | https://www.imovelweb.com.br/imoveis-aluguel-botafogo-rio-de-janeiro.html | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Buske.ai | https://buske.ai/imoveis/rj/rio-de-janeiro/botafogo/alugar | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Imovelweb | https://www.imovelweb.com.br/imoveis-aluguel-botafogo-rio-de-janeiro-areac-proximo-ao-metro.html | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Rentola | https://rentola.com.br/alugar/rio-de-janeiro-botafogo | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Lopes | https://www.lopes.com.br/busca/aluguel/br/rj/rio-de-janeiro/botafogo | Reportado | 2026-08-24 | Primeira consulta registrada |

| 2026-08-24 | QuintoAndar | https://www.quintoandar.com.br/alugar/imovel/rio-de-janeiro-rj-brasil | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | OLX | https://www.olx.com.br/imoveis/aluguel/estado-rj | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/imoveis/rj+rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Viva Real | https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Chaves na Mão | https://www.chavesnamao.com.br/imoveis-para-alugar/rj-rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Imovelweb | https://www.imovelweb.com.br/apartamentos-aluguel-rio-de-janeiro-rj.html | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Loft | https://loft.com.br/aluguel/imoveis/rj/rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Lopes | https://www.lopes.com.br/busca/aluguel/br/rj/rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/cobertura/rj+rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Viva Real | https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro/cobertura_residencial | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | OLX | https://www.olx.com.br/imoveis/aluguel/cobertura/estado-rj | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | QuintoAndar | https://www.quintoandar.com.br/alugar/imovel/rio-de-janeiro-rj-brasil/apartamento/apartamento-cobertura | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Imovelweb | https://www.imovelweb.com.br/apartamentos-cobertura-aluguel-rio-de-janeiro-rj.html | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Block Imóveis | https://www.blockimoveis.com.br/aluguel/cobertura | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Chaves na Mão | https://www.chavesnamao.com.br/coberturas-para-alugar/rj-rio-de-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | Trovit | https://imoveis.trovit.com.br/aluguel-cobertura-rio-janeiro | Reportado | 2026-08-24 | Primeira consulta registrada |
| 2026-08-24 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/cobertura/rj | Reportado | 2026-08-24 | Primeira consulta registrada |

| 2026-08-23 | Wimóveis | https://www.wimoveis.com.br/aluguel/apartamentos/padrao/rj/rio-de-janeiro/botafogo/2-quartos | Reportado | 2026-08-23 | Primeira consulta registrada |

| 2026-08-23 | Wimóveis | https://www.wimoveis.com.br/aluguel/apartamentos/rj/rio-de-janeiro/botafogo/2-quartos | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | Chaves na Mão | https://www.chavesnamao.com.br/apartamentos-para-alugar/rj-rio-de-janeiro/botafogo/2-quartos | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/imoveis/rj+rio-de-janeiro+zona-sul+botafogo/2-quartos | Reportado | 2026-08-23 | Primeira consulta registrada |

| 2026-08-23 | https://www.wimoveis.com.br/aluguel/apartamentos/padrao/rj/rio-de-janeiro/botafogo | Muito caro | Preço percebido como alto; considerar o comentário antes de alterar o teto. | Aplicar como contexto em futuras buscas | Explícita |

| 2026-08-23 | Wimóveis | https://www.wimoveis.com.br/aluguel/apartamentos/padrao/rj/rio-de-janeiro/botafogo | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | Bevalle | https://www.bevalle.com.br/buscar?availability= | Reportado | 2026-08-23 | Primeira consulta registrada |

| 2026-08-23 | ZAP Imóveis | https://www.zapimoveis.com.br/aluguel/apartamentos/rj+rio-de-janeiro+zona-sul+botafogo/2-quartos | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | OLX Imóveis | https://www.olx.com.br/imoveis/aluguel/apartamentos/2-quartos/estado-rj/rio-de-janeiro-e-regiao/zona-sul/botafogo | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | Viva Real | https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro/zona-sul/botafogo/apartamento_residencial | Reportado | 2026-08-23 | Primeira consulta registrada |
| 2026-08-23 | Chaves na Mão | https://www.chavesnamao.com.br/apartamentos-para-alugar/rj-rio-de-janeiro/botafogo | Reportado | 2026-08-23 | Primeira consulta registrada |


### Como interpretar o feedback

- “Gostei”: registrar quais características motivaram a avaliação positiva.
- “Não gostei”: registrar o motivo específico, sem generalizar além do que foi dito.
- “Muito caro”: perguntar ou atualizar o teto de custo mensal total.
- “Muito longe”: registrar se o problema foi distância ao trabalho, distância ao metrô ou ambos.
- “Quero visitar”: marcar como candidato ativo; não realizar agendamento sem autorização explícita.
- “Não mostrar mais”: excluir o anúncio e registrar a causa objetiva.

## Anúncios e fontes já vistos

Usar esta seção para evitar repetição e monitorar mudanças. Não guardar informação sensível.

| Primeiro visto | Plataforma | Link/identificador | Status | Última verificação | Alteração relevante |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

## Histórico de preferências substituídas

| Data | Campo | Valor anterior | Novo valor | Motivo/fonte |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Pendências para próxima conversa

- Confirmar teto de custo mensal total, incluindo ou não condomínio e IPTU. O teto é tudo.
- Confirmar bairros aceitos, priorizados e excluídos fora de Botafogo. Pode trazer bairros de fora de Botafogo, mas desde que seja próximo ao metrô.
- Definir frequência de monitoramento e como os alertas devem ser recebidos.
