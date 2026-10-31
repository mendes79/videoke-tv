# Evolução v1.2 do Videokê Mobile SPA — Alta Visibilidade (40+ Conforto Visual)

* **Author:** mendes
* **Date:** 2026-10-31

## Overview

Esta evolução (v1.2) redesenha a escala tipográfica, o contraste e a ergonomia dos controles do **Videokê Mobile Web SPA** (`videoke-mobile/`) para oferecer leitura confortável sem óculos para usuários 40+ (presbiopia), mantendo o layout escuro com acento neon (`#ff2a85`). Além do aumento generalizado de fontes e áreas de toque, a tela inicial remove as sugestões ilustrativas pré-carregadas para focar exclusivamente nos campos de identificação e busca, e os cards de resultados substituem o botão largo de texto `"Enviar para fila"` por um botão compacto de ícone (`48x54px`) com uma seta vertical para o alto (`↑`), liberando largura horizontal para os títulos das músicas.

## Analysis

A revisão paralela pelas 6 lentes especializadas (*Goldfish*) validou a implementação da v1.2 e apontou três refinamentos técnicos de interface:

1. **Persistência do Estado `✓` no Botão `.send-btn` após Re-renderização SSE (`egm-codebase-details` & `egm-design`)**:
   - Quando o usuário toca no botão `↑` (`&#8593;`), `enqueueSong()` altera o ícone para `✓` (`&#10003;`) após o `POST` no Firebase. Contudo, o stream SSE (`EventSource`) e o fallback de polling disparam `_recalculateQuotaAndStatus()` logo em seguida (~150 ms), que re-executa `_renderResults()` e recria os botões do zero como `↑`.
   - **Mitigação**: Em `_renderResults()`, verificar se `song.video_id` já consta em `this.activeUserSongs`. Caso positivo, renderizar o botão com a classe `.send-btn.sent`, ícone `✓` (`&#10003;`) em verde (`--success`) e atributo `disabled`, preservando o feedback visual e impedindo envios duplicados da mesma música.
2. **Feedback Visual para Busca sem Resultados (`egm-comprehension`)**:
   - Com a remoção do catálogo curado inicial (`CURATED_CATALOG`), `#results-section` inicia oculta (`.hidden`). Quando uma busca retorna 0 vídeos da API do YouTube, `_renderResults([], true)` deve exibir uma mensagem de alto contraste (`"Nenhum vídeo encontrado para esta busca."`) dentro de `#results-list` em vez de deixar a seção vazia.
3. **Proteção de Layout em Telas Compactas (`<= 360px`) (`egm-implementation-readiness` & `egm-structural`)**:
   - O aumento do título `"Videokê TV"` para `26px` ao lado do botão `"Fila"` (`16px`) e engrenagem (`46x46px`) pode causar quebra de linha indesejada no cabeçalho em aparelhos com largura de viewport `<= 360px`.
   - **Mitigação**: Aplicar `white-space: nowrap` em `.brand-title h1` e `.queue-nav-btn` e adicionar media query `@media (max-width: 360px)` ajustando proporcionalmente o título (`22px`) e paddings.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Elevar a escala tipográfica em todo o app mobile: `body` (`18px`), título `"Videokê TV"` (`26px`) com ícone de microfone (`36px`), rótulos de seção (`16px–17px`), inputs de nome e busca (`20px` com rolagem horizontal nativa na mesma linha), títulos de resultados (`18px`) e status da TV (`18px`).
  * Elevar o contraste de textos secundários (`--text-muted: #d0d8f0` e placeholders `#7c88ab`).
  * Manter o campo de busca, o botão de microfone (voz) e o botão `"Buscar"` alinhados na mesma linha horizontal (`flex: 1; min-width: 0`).
  * Substituir o botão textual `"Enviar para fila"` por um botão estreito (`48x54px`) contendo apenas a seta para cima (`↑` / `&#8593;`), alternando para `✓` (`&#10003;`) verde quando a música estiver ativa na fila do usuário.
  * Remover as sugestões ilustrativas iniciais (`CURATED_CATALOG`) para que `#results-section` apareça apenas após uma pesquisa real.
* **Out-of-Scope Non-Goals:**
  * Alterar o layout da aplicação da TV (`videoke-app`), que já opera em escala 10-foot UI Full HD.
  * Exibir sugestões pré-carregadas antes da primeira busca do usuário.

## Alternatives Weighed

* **Quebrar o botão `"Buscar"` para uma linha abaixo do input de pesquisa vs. Manter na mesma linha com deslocamento horizontal do texto**:
  * *Decisão*: Mantido na mesma linha conforme especificação do usuário; textos longos digitados no input de `20px` deslocam-se nativamente para a esquerda dentro da caixa de texto sem empurrar o botão `"Buscar"`.
* **Botão textual `"Enviar para fila"` embaixo do card vs. Botão estreito lateral apenas com ícone `↑`**:
  * *Decisão*: O botão estreito (`48x54px`) com seta `↑` (`26px`) na lateral direita mantém cada resultado compacto verticalmente e libera espaço horizontal para que o título da música (`18px`) exiba até 2 linhas legíveis.

## Key Decisions & Staging for Next Steps

1. **Refinamentos Pós-Goldfish Aplicados**: Estado persistente `.send-btn.sent` (`✓`), mensagem para busca com 0 resultados e `@media (max-width: 360px)` aplicados em [videoke-mobile/js/app.js](file:///c:/Users/mende/Projetos/tv/videoke-mobile/js/app.js) e [videoke-mobile/css/mobile.css](file:///c:/Users/mende/Projetos/tv/videoke-mobile/css/mobile.css).
2. **Deploy**: Publicado no Firebase Hosting (`https://videoke-tv.web.app`).

