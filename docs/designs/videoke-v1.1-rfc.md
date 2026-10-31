# Evolução v1.1 do Videoke Tizen Web App e Mobile SPA

* **Author:** mendes
* **Date:** 2026-10-31

## Overview

Esta evolução (v1.1) aprimora a experiência de operação e visualização do sistema de Videokê na Smart TV Samsung (Tizen 6.5) e nos smartphones dos convidados. Na TV, a tela de contagem regressiva de 15 segundos passa a ser dividida em duas colunas — exibindo à esquerda o cantor e a música que vão entrar no palco e à direita a lista numerada das próximas músicas agendadas na fila — sobre um fundo sorteado aleatoriamente entre 13 wallpapers otimizados em Full HD. O controle de reprodução é unificado em um único botão dinâmico (`Play` / `Pausa`) que recebe foco automático ao iniciar a contagem regressiva, e o estado de pausa passa a contar com um timeout automático de 60 segundos (com aviso visual e bip sonoro nos últimos 10 segundos) para evitar que a fila fique travada em festas.

No banco de dados (Firebase Realtime Database) e no Web App Mobile, o ciclo de vida das músicas passa a operar com limpeza contínua: assim que uma música entra na contagem regressiva de 15 segundos na TV, seu status muda imediatamente para `playing` (impedindo exclusão tardia pelo celular), e ao terminar ou ser pulada ela é removida definitivamente (`DELETE`) da fila. Nos smartphones, o nome do cantor é limitado a 25 caracteres, cada participante pode cancelar suas próprias músicas enquanto estiverem com status `pending`, e uma nova tela dedicada ("Ver Fila") exibe todas as músicas agendadas com destaque para as escolhas do usuário e botão para voltar à busca.

## Analysis

A revisão paralela pelas 6 lentes especializadas (*Goldfish*) identificou os seguintes pontos técnicos e salvaguardas de implementação:

1. **Prevenção de Música Órfã no Firebase ao Pressionar `Parar` (`egm-design` & `egm-zoom-out`)**:
   - Como a música recebe `status: "playing"` já na entrada da contagem regressiva de 15 segundos, ela deixa de fazer parte da lista filtrada por `status === "pending"`. Se o anfitrião pressionar o botão **Parar** (`stop()`) durante a contagem ou durante o vídeo sem remover o registro atual do Firebase, esse item ficaria preso no banco com `status: "playing"`, consumindo 1 vaga da cota do cantor permanentemente.
   - **Mitigação**: O método `stop()` na TV também deve executar `FirebaseSync.removeSong(currentSong.key)` (`DELETE`) antes de retornar ao estado `IDLE`, garantindo que nenhuma faixa interrompida fique órfã no banco.
2. **Atualização Otimista Local na Transição de Fila (`egm-codebase-details`)**:
   - Entre o momento em que a TV envia o `PATCH` (`status: "playing"`) ou `DELETE` para o Firebase e o recebimento da confirmação pelo stream SSE (`EventSource`), existe uma janela de ~150–300 ms.
   - **Mitigação**: Atualizar otimisticamente o status local (`song.status = "playing"`) ao iniciar o countdown e remover a chave de `itemsMap` localmente em `FirebaseSync.removeSong(key)` antes mesmo do retorno de rede. Assim, a coluna direita da tela de contagem regressiva nunca exibirá a música atual duplicada no topo da fila seguinte.
3. **Gerenciamento de `AudioContext` e Cancelamento do Timer de 60s de Pausa (`egm-implementation-readiness`)**:
   - No motor Chromium 85 do Tizen 6.5, instanciar um novo `AudioContext` a cada segundo nos 10 bips finais pode esgotar o limite de contextos de áudio de hardware (6 instâncias). Além disso, qualquer saída do estado `PAUSED` (retomar `Play`, `Anterior`, `Próxima`, `Parar`, `Reset Fila`) precisa cancelar imediatamente o timer de 60 segundos para evitar que um timer antigo pule a música seguinte.
   - **Mitigação**: Reutilizar uma única instância singleton de `AudioContext` com oscilador senoidal curto (`880 Hz`, `120 ms`, ganho suave `0.08`) e centralizar a limpeza em `_clearPauseTimer()` chamado em todas as transições de estado.
4. **Capacidade Sem Rolagem na Coluna Direita da Contagem e Reatividade SSE (`egm-comprehension`)**:
   - Em 1920x1080 (descontando os 86px da barra de rodapé fixa), a coluna direita comporta com legibilidade a distância até **7 itens** (`1` a `7`) sem barra de rolagem (`overflow: hidden`). Caso a fila tenha mais de 7 itens aguardando após a música atual, o rodapé do card exibirá um indicador discreto (`+N músicas na fila`). Sempre que um convidado adicionar ou cancelar uma música pelo celular durante os 15s da contagem, o evento SSE atualizará a coluna direita da TV em tempo real.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Marcar a música como `status: "playing"` ao iniciar os 15s de contagem regressiva e excluir (`DELETE`) o registro de `/rooms/<roomId>/queue/<key>.json` ao concluir, pular ou parar a música.
  * Limitar `singer_name` a 25 caracteres no mobile (HTML `maxlength="25"` e validação em JS) para preservar o alinhamento das listas.
  * Permitir que o participante exclua pelo celular apenas suas próprias músicas cujo status seja estritamente `pending`.
  * Adicionar botão e tela "Ver Fila" no app mobile listando a fila completa em tempo real, destacando as músicas do próprio usuário e oferecendo botão "Voltar" para a tela de busca.
  * Unificar a ação do botão `#btn-play-pause` na TV: exibir `▶ Play` com foco automático ao abrir o `COUNTDOWN` (permitindo início imediato com a tecla `OK`), alternar para `❚❚ Pausa` durante `PLAYING` e voltar para `▶ Play` em `PAUSED`.
  * Implementar timer de 60s no estado `PAUSED`, exibindo banner de contagem regressiva e bip sonoro (Web Audio API) nos últimos 10 segundos, avançando para a próxima música ou voltando para `IDLE` ao zerar.
  * Dividir `#countdown-screen` verticalmente em 2 colunas (esquerda: cantor/música atual + contador de 15s; direita: fila seguinte numerada `1, 2, 3...` sem barra de rolagem).
  * Padronizar e otimizar as 13 imagens de `logos/videoke/videoke_wallpaper_01..13.jpg` em Full HD (`1920x1080`, JPEG leve ~150–200 KB cada) dentro de `videoke-app/img/wallpapers/` e sortear uma imagem aleatória (sem repetição consecutiva) a cada abertura da contagem regressiva.
* **Out-of-Scope Non-Goals:**
  * Permitir que um celular exclua ou reordene músicas de outros participantes ou exclua a música que já entrou em `playing` (contagem regressiva ou vídeo ativo).
  * Adicionar barra de rolagem ou navegação por setas na lista da coluna direita da tela de contagem regressiva na TV.

## Alternatives Weighed

* **Manter registros `completed` e `skipped` no Firebase vs. Exclusão Imediata (`DELETE`)**:
  * *Rejeitado*: Manter histórico acumulado na árvore `/queue` aumenta o payload inicial do evento `put` no SSE ao longo do tempo e exige filtros adicionais na TV e nos celulares. A exclusão imediata via `DELETE` após a música tocar ou ser pulada mantém o banco enxuto e libera a cota do cantor instantaneamente.
* **Criar um segundo botão físico `Play` separado do botão `Pausa` no rodapé da TV vs. Botão Único Alternável (`Play` / `Pausa`)**:
  * *Rejeitado*: Dois botões separados aumentam a quantidade de passos de navegação horizontal no controle remoto e deixam um botão inativo em cada estado. Um único botão que alterna dinamicamente entre `▶ Play` (no `COUNTDOWN` e no `PAUSED`, com foco automático no início da contagem) e `❚❚ Pausa` (em `PLAYING`) reduz cliques e mantém a barra enxuta.
* **Incluir os 13 wallpapers originais sem compressão (~34,6 MB) no pacote `.wgt`**:
  * *Rejeitado*: Imagens de até 6,7 MB cada aumentam em mais de 10x o tamanho do pacote `.wgt`, tornam o envio via SDB lento e causam picos de decodificação de imagem na GPU/RAM da TV Tizen. A padronização para 1920x1080 otimizado (~2 MB no total) preserva a nitidez na TV com carregamento instantâneo.

## Key Decisions & Staging for Next Steps

1. **Salvaguarda no `stop()`**: Quando o botão `Parar` for acionado na TV, a música atual em `COUNTDOWN` ou `PLAYING` também será removida (`DELETE`) do Firebase para não travar a cota do participante.
2. **Processamento dos Wallpapers**: Redimensionar e comprimir `logos/videoke/videoke_wallpaper_01..13.jpg` para `videoke-app/img/wallpapers/wp_01..13.jpg` (1920x1080).
3. **Atualização do Design Doc e Implementação**: Atualizar [docs/designs/videoke-tizen-app.md](file:///c:/Users/mende/Projetos/tv/docs/designs/videoke-tizen-app.md) e aplicar as alterações em `videoke-app/` e `videoke-mobile/`.

