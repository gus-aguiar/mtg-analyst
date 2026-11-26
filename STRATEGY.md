# mtg-analyst Strategy

## Vision

<!-- vision: draft 2026-11-26 - vereditos recomendados pelo agente (orq-mtg-analyst), aguardando aprovação do Gustavo -->

`mtg-analyst` existe para que o Gustavo entenda um deck de Commander com números e imagens antes de trocar uma carta.
Ele serve quem pilota o deck, começando pelo Isshin Mardu do próprio Gustavo (decklist.txt, commit `5eeefc7`).
Ele transforma uma lista de texto colada em dois tipos de resposta: como o deck se comporta sozinho na mesa (simulador goldfish) e o que existe dentro dele (combos, sinergias, saúde e sugestões no analisador visual).
Ele é dono de exatamente uma coisa: a análise de uma única lista de deck.

### A lista de texto é a entrada

Toda análise começa de uma decklist em texto, no formato que o jogador já tem: `1 Nome`, `1x Nome`, exports do Moxfield e do Archidekt, seções `COMMANDER:` e `SIDEBOARD:` (`parse_decklist` em simulator.py, parser do PR #1).
Nenhuma análise exige cadastro, conta, coleção ou importação por login.
Formatos novos de lista são bem-vindos quando o parser continua tolerante e nunca quebra por uma linha estranha.

### Aproximado, e dizendo que é

O simulador é heurístico por desenho: sem interação do oponente, sem bloqueadores, com atalhos declarados no código (docstring de simulator.py, `5eeefc7`).
Toda limitação do modelo aparece no próprio relatório, não só no código (rodapé do PDF, `b619752`).
Os números saem com distribuição, não só média: mediana, IQR, histograma de turno de kill e taxa de flood e screw (`5eeefc7`).
A métrica é "lethal no goldfish até o turno N", nunca "chance de vitória".
O motor de sinergia é regra legível (tags por regex e matriz de afinidade em data.js, PR #1), e cada par sugerido vem com o motivo em português.

### Resposta visual, em um lugar só

O resultado é para ser olhado: gráficos, imagens das cartas e um único PDF que junta texto e gráficos (`b619752`).
O analisador mostra curva, pips, tipos, combos e grid do deck com imagem da Scryfall (PR #1).
A interface e as explicações são em PT-BR.

### Sem infraestrutura

O analisador é HTML, CSS e JS puros, sem build, aberto direto do arquivo ou de um `http.server` (PR #1).
O simulador é um script Python com duas dependências, matplotlib e numpy (requirements.txt).
Dados de carta e combos vêm sob demanda da Scryfall e do Commander Spellbook, chamados pelo navegador, com timeout e degradação quando a API cai (PR #1).
O conhecimento curado mora em arquivos versionados e legíveis: cards_db.py feito à mão e a base de temas em data.js.
Não há servidor, banco, chave de API nem serviço pago; é isso que permite outro projeto portar o analisador como está (mtgNoPapel `ac704ee`).

### Prova antes de entrar

O analisador tem teste Playwright com as duas APIs mockadas, em tema claro, escuro e com o Spellbook fora do ar (PR #1).
Teste nunca depende de rede real.
Toda mudança chega por branch e PR; o merge na branch padrão é sempre do Gustavo.

### Escopo

O mtg-analyst não é um deckbuilder, não é gerenciador de coleção, não mostra preço nem lista de compra e não é motor de regras.
Ele não simula partida contra oponentes reais nem joga online.
Ele não é a mesa: contador de vida, histórico e ranking pertencem ao mtgNoPapel, que consome o analisador daqui.
O foco é Commander; outros formatos só entram se couberem no mesmo parser e nas mesmas métricas.

Uma mudança se alinha quando deixa a leitura de uma lista mais precisa, mais visual ou mais honesta sobre os próprios limites, sem acrescentar infraestrutura.
Uma mudança deve ser resistida quando pede conta, servidor, chave ou serviço pago, quando esconde a incerteza do modelo atrás de um número único, ou quando puxa o projeto para coleção, compra ou a mesa de jogo.

## Hipotéticos (stress-test)

Vereditos e motivos recomendados pelo agente; o Gustavo não respondeu.
Servem de registro desta rodada e podem sair do arquivo quando ele aprovar a seção acima.

**H-1 - Interação do oponente no simulador.**
Proposta: modelar remoção e bloqueadores para que o "turno de kill" fique realista.
Testa: "O simulador é heurístico por desenho: sem interação do oponente".
Veredito: **sim, limitado**: um parâmetro opcional simples (ex.: chance de remoção por turno), com o goldfish puro continuando como padrão.
Motivo: o goldfish puro superestima a velocidade e isso já engana; um modelo completo de oponente vira motor de regras, então só cabe um imposto parametrizado e declarado no relatório.

**H-2 - Gerar o banco de cartas do simulador pela Scryfall.**
Proposta: trocar o cards_db.py feito à mão por leitura automática do oracle text, para simular qualquer deck.
Testa: "O conhecimento curado mora em arquivos versionados e legíveis".
Veredito: **sim para esqueleto, não para automático**: um script gera o rascunho do cards_db a partir da Scryfall e o humano revisa os campos de comportamento.
Motivo: custo, tipo e cor são dados; "dobra gatilho de ataque" é julgamento, e o banco errado em silêncio é pior que nenhum.

**H-3 - Portar o simulador para JS e juntar tudo no analisador web.**
Proposta: uma ferramenta só no navegador, sem Python.
Testa: "Sem infraestrutura" e "Resposta visual, em um lugar só".
Veredito: **não agora**; os dois compartilham o formato de lista, não o código.
Motivo: reescrever 800 linhas de motor testado por estética custa mais do que entrega; reavaliar só se o simulador ficar genérico (H-2).

**H-4 - Preço e orçamento nas sugestões.**
Proposta: mostrar preço (LigaMagic, TCGplayer) e filtrar sugestões por orçamento.
Testa: "não mostra preço nem lista de compra".
Veredito: **não**.
Motivo: preço muda o projeto de "entender o deck" para "comprar cartas" e traz APIs de terceiros instáveis ou pagas.

**H-5 - Comparar versões do deck.**
Proposta: guardar análises anteriores no navegador e mostrar o antes e depois de uma troca.
Testa: "antes de trocar uma carta" e "Nenhuma análise exige cadastro".
Veredito: **sim**, só em localStorage ou colando duas listas, sem servidor.
Motivo: é exatamente a pergunta que o projeto existe para responder, e cabe sem infraestrutura.

**H-6 - Proxy próprio para o Commander Spellbook.**
Proposta: subir um backend fino para contornar CORS e instabilidade, como o mtgNoPapel fez (`f593c50`).
Testa: "Não há servidor".
Veredito: **não aqui**; quem hospeda põe o proxy, o mtg-analyst segue estático e degrada com aviso.
Motivo: o valor de portar "como está" depende de não ter backend; o mtgNoPapel já resolve o caso hospedado.

**H-7 - Explicações de sinergia geradas por LLM.**
Proposta: trocar a matriz de afinidade por um modelo que explica cada par em linguagem natural.
Testa: "O motor de sinergia é regra legível".
Veredito: **não no app**.
Motivo: exige chave e custo, não é determinístico e não dá para testar com mock; regra legível erra de um jeito que dá para corrigir.

**H-8 - Chamar a métrica de "chance de vitória".**
Proposta: renomear "lethal até T10" para algo mais atraente no relatório.
Testa: "A métrica é 'lethal no goldfish até o turno N', nunca 'chance de vitória'".
Veredito: **não**.
Motivo: sem oponente não existe vitória; o nome honesto é o que impede o número de ser lido errado.

**H-9 - Analisar o deck do oponente e o confronto.**
Proposta: colar a lista de um amigo e receber um plano de jogo contra ela.
Testa: "Ele é dono de exatamente uma coisa: a análise de uma única lista de deck".
Veredito: **sim para analisar a lista de qualquer pessoa**; **não para análise de confronto**.
Motivo: o analisador já serve qualquer lista; cruzar dois decks pede simular interação, que o projeto recusa (H-1).

**H-10 - Interface bilíngue.**
Proposta: i18n PT-BR e EN para alcançar a comunidade.
Testa: "A interface e as explicações são em PT-BR".
Veredito: **não**.
Motivo: o público é o Gustavo e a mesa dele; as explicações em português são parte do valor, e manter duas línguas dobra o custo de cada regra nova.

**H-11 - Fundir o mtg-analyst no mtgNoPapel e arquivar este repo.**
Proposta: o analisador já mora no mtgNoPapel; manter um lugar só.
Testa: "Ele não é a mesa ... pertencem ao mtgNoPapel, que consome o analisador daqui".
Veredito: **não**; o mtg-analyst é a fonte e o laboratório, o mtgNoPapel é um consumidor.
Motivo: o simulador Python não cabe na mesa, e evoluir a análise num repo sem build é mais rápido; o mtgNoPapel puxa versões quando quiser.

**H-12 - Publicar o analisador como site próprio.**
Proposta: subir a página estática num subdomínio, com a vitrine apontando para ela.
Testa: "Não há servidor, banco, chave de API nem serviço pago".
Veredito: **sim, só estático** (nginx servindo arquivos, sem backend).
Motivo: servir arquivos não muda a natureza do projeto e dá um link para mostrar; qualquer necessidade de backend reabre H-6.
