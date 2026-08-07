# Demo Builder

Skill do Claude Code que transforma uma intenção em PNGs de telas do Pipefy. Você descreve o
processo em uma frase, o Claude escreve os dados do template, o servidor do Demo Builder
renderiza e o Chrome headless tira o screenshot.

Este repositório distribui apenas o skill. O studio que renderiza as telas vive em outro lugar
e já está publicado em https://pipe-screen-studio.vercel.app, então não há nada para rodar
localmente.

## Instalação

```
/plugin marketplace add pipefy-design/demo-builder
/plugin install demo-builder
```

Na primeira vez que rodar, o skill abre o navegador para conectar a máquina à sua conta do
studio. O token fica em `~/.config/demo-builder/credentials.json` e vale 90 dias.

## Uso

```
/demo-builder "<intenção>" [template ...] [desktop|tablet|mobile]
```

A intenção é o assunto das telas, em uma frase. Sem template nomeado, o skill pergunta quais
construir, em vez de chutar um conjunto. O dispositivo é `desktop` por padrão, 1440x960, com
`tablet` em 834x1112 e `mobile` em 390x844.

Antes de renderizar, o skill mostra um resumo do que escreveu para você confirmar ou corrigir.
Os PNGs saem em `Demo Builder`, na sua Área de Trabalho.

## Templates

| Template | Tela | Screenshots |
| --- | --- | --- |
| `map` | Os pipes e bancos de dados da conta, e como se conectam | 1 |
| `kanban` | O board do pipe, com suas fases e cards | 1 |
| `card` | Um card aberto sobre o board | 1 por fase que tem card |
| `portal` | A página onde o solicitante cai: o catálogo de serviços que ele pode pedir | 1 |
| `dashboards` | O pipe lido em vez de trabalhado: cinco números, uma tendência, um funil e uma quebra | 1 |
| `interfaces` | Uma interface publicada, a página que um público externo acessa | 4 |
| `agents` | Um agente de IA sendo configurado | 3, ou 6 com o log de auditoria |

Três deles valem mais de um screenshot, porque a tela sozinha não conta a história:

- **`card` percorre o board.** O skill tira um screenshot por fase que tem card, como uma
  build faz no studio: o processo e cada pergunta que ele faz no caminho. Um board de cinco
  fases são cinco PNGs.
- **`interfaces` são quatro layouts** da mesma página: com a foto de capa, sem ela para a tabela
  inteira caber, com o assistente aberto por cima, e o canvas do builder onde ela é montada.
- **`agents` são os três passos** da configuração de um agente: quem ele é (General), o que ele
  sabe (Knowledge), o que ele faz (Behaviors).

Os modelos disponíveis vêm do servidor, não desta página. Se esta tabela e o `/demo-builder`
discordarem, o servidor está certo.

### Exemplos

```
/demo-builder "empresa de blindagem de veículos"
```
Pergunta quais telas você quer e monta o processo de blindagem em cima delas.

```
/demo-builder "esteira de crédito" map kanban card
```
O mapa da conta, o board da esteira e o card em cada fase dela. É o conjunto que conta um
processo de ponta a ponta em um slide.

```
/demo-builder "requisição de RH" portal mobile
```
Só o catálogo de serviços, na largura do celular.

```
/demo-builder "gestão de obras" dashboards
```
Uma tela, o pipe visto por quem cobra o resultado e não trabalha nele.

```
/demo-builder "onboarding de fornecedor" interfaces agents
```
Sete PNGs de uma vez: os quatro layouts da interface publicada e os três passos do agente que
atende nela.

## Requisitos

- Node 18 ou mais novo.
- Chrome, Chromium ou Edge instalado. Se estiver fora do lugar de sempre,
  `CHROME=/caminho/do/binario`.
- Uma conta no studio.

O script não tem dependências: importa só os módulos do próprio Node.
