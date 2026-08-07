# Demo Builder

Skill do Claude Code que transforma uma intenção em PNGs de telas do Pipefy. Você descreve o
processo em uma frase, o Claude escreve os dados do template, o servidor do Demo Builder
renderiza e o Chrome headless fotografa.

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
/demo-builder "empresa de blindagem de veículos"
/demo-builder "esteira de crédito" map kanban card
/demo-builder "requisição de RH" portal mobile
```

Sem template nomeado, o skill pergunta quais construir. Os modelos disponíveis vêm do servidor,
não desta página: hoje são `map`, `kanban`, `card`, `portal`, `dashboards`, `interfaces` e
`agents`. Alguns valem mais de uma tela, o `card` é fotografado uma vez por fase do board e o
`agents` traz os três passos da configuração.

Os PNGs saem em `Demo Builder`, na sua Área de Trabalho.

## Requisitos

- Node 18 ou mais novo.
- Chrome, Chromium ou Edge instalado. Se estiver fora do lugar de sempre,
  `CHROME=/caminho/do/binario`.
- Uma conta no studio.

O script não tem dependências: importa só os módulos do próprio Node.

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `DEMO_BUILDER_BASE` | Aponta para outro servidor, por exemplo `http://localhost:3838` ao mexer no studio. |
| `DEMO_BUILDER_TOKEN` | Substitui o arquivo de credencial, para máquina sem navegador. |
| `DEMO_BUILDER_OUT` | Muda a pasta onde os PNGs caem. |
| `CHROME` | Caminho do binário do navegador. |

## Comandos do script

O skill chama tudo sozinho, mas os comandos existem para depurar:

```bash
node skills/demo-builder/demo-builder.mjs login     # conecta a máquina
node skills/demo-builder/demo-builder.mjs whoami    # diz qual conta está conectada
node skills/demo-builder/demo-builder.mjs logout    # esquece o token
node skills/demo-builder/demo-builder.mjs processo.json meu-slug
```
