---
name: demo-builder
description: Generate PNG mockups of Pipefy screens from a plain-language intent. Use when the user types /demo-builder "<intent>" [template...] [desktop|tablet|mobile], or asks for a Pipefy map, board, card, portal, dashboard or interface screenshot, mockup, or PNG for a slide. Reads the available models from a Demo Builder server and builds all of them when the user names none, writes the template data itself, shows a short summary to confirm or correct, renders it and shoots a PNG with headless Chrome. A build that includes the card shoots it once per phase of the board, as the studio does.
---

# Demo Builder

Turn an intent into PNGs of Pipefy screens. You write the template data, a Demo Builder server renders it, headless Chrome shoots it.

## Arguments

`/demo-builder "<intent>" [template ...] [device]`

- **intent** (required): what the screens are about, e.g. `"empresa de blindagem de veículos"`.
- **template**: zero, one or several ids. Step 1 lists whatever the server offers, so trust
  that over any list written here. At the time of writing the server serves `map`, `kanban`,
  `card`, `portal`, `dashboards`, `interfaces` and `agents`.

  **When the user names no template, build EVERY model the server returned** (step 2). An
  intent on its own, `/demo-builder "esteira de crédito"`, is the whole process: the map, the
  portal, the board, the card walked phase by phase, the dashboards, the interfaces and the
  agent. Do not ask which ones and do not curate a subset. Step 4 is where the user corrects
  it, with something concrete in front of them.

  **`card` is a walkthrough, not one screen.** Whenever the build includes the card, which is
  what "um pipe e o card" means, it is shot once per phase of the board that has cards, one PNG
  each, exactly as a build does in the studio. A five-phase board is five card PNGs, and a
  process that also has the map is six. See "The card walks the board" below.

  **`agents` is three screens too**, the steps of one agent's setup: General, Knowledge,
  Behaviors. One entry in the file, three PNGs, and six when it also carries the audit log.
  See "The agent has three steps" below.

  **`interfaces` is four screens**, one published page drawn four ways: with its cover, without
  it, with the assistant open over it, and the builder's canvas it is assembled in. One entry in
  the file, four PNGs. See "The interface has four layouts" below.
- **device**: `desktop` (default, 1440x960), `tablet` (834x1112), `mobile` (390x844).

Anything unparsed in the arguments is the intent. Do not ask anything before writing the data:
pick sensible values for whatever the arguments leave open. The one question comes later, in
step 4, once there is something concrete to react to.

## Requirements

- **An account on the Demo Builder server**, connected once per machine. The script carries a
  token; without one the server answers 401 and nothing renders. Connecting is one command,
  and the run does it by itself when the machine has no token yet:

  ```bash
  node <this skill's folder>/demo-builder.mjs login
  ```

  It opens the studio in the browser, where the person is already signed in, and takes the
  token back from a page they authorize. `whoami` says which account is connected, `logout`
  forgets it. The token lives in `~/.config/demo-builder/credentials.json`, one per server,
  and lasts 90 days. `DEMO_BUILDER_TOKEN` overrides the file, for a machine with no browser.

  **The login opens a browser, so it cannot happen silently.** When step 1 finds no
  credential, say so in one line and run it, before writing any data: `essa máquina ainda não
  está conectada, vou abrir o login`. A run that discovers this after nine PNGs is a run that
  wasted them.
- **A Demo Builder server.** Defaults to the published studio,
  `https://pipe-screen-studio.vercel.app`, so this needs no checkout of the repo and nothing
  running locally. Override with the `DEMO_BUILDER_BASE` env var or `--base URL`: point it at
  `http://localhost:3838` when you are working on the studio itself and want the templates as
  they are on disk.
- **Node 18+** and **Chrome, Chromium, or Edge** installed locally. The script has no
  dependencies of its own: it imports only Node's own modules, so there is nothing to install
  beside it.
- **macOS, Windows or Linux.** The browser is looked up per platform (the usual Applications,
  Program Files and /usr/bin locations), and `CHROME=/path/to/binary` is the answer when it
  lives somewhere else. PNGs land in `Demo Builder` on the Desktop, which macOS and Windows
  both have; a machine without a Desktop, like a container, gets it in the home directory
  instead. `DEMO_BUILDER_OUT` overrides that everywhere.
- The commands in these steps are written for a POSIX shell. On Windows that means git-bash or
  WSL, which is what Claude Code runs there anyway; from PowerShell, set `DEMO_BUILDER_BASE` in
  the environment instead of writing `${DEMO_BUILDER_BASE:-...}` inline.

## Steps

1. **Check Node, the credential and the server**, and read the models from the server:

   ```bash
   node -v && node <this skill's folder>/demo-builder.mjs whoami
   curl -sf "${DEMO_BUILDER_BASE:-https://pipe-screen-studio.vercel.app}/api/templates"
   ```

   All three, in that order, and BEFORE writing anything. The shot is the last step, so a
   machine with no Node fails after the data is written and approved, which is the most
   expensive moment to find out and the easiest to prevent. The credential is the same kind of
   problem with the same answer.

   `whoami` printing `not connected` means this machine has no token yet. Say one line and run
   `demo-builder.mjs login`, which opens the browser; when it comes back, carry on. Do not
   write the data first: the login needs a person, and asking for one nine PNGs later is worse
   than asking now.

   `node -v` printing nothing but `command not found` means Node is not installed. **Say so and
   stop**, in two lines: this skill needs Node 18+ (nodejs.org, or `brew install node`,
   `winget install OpenJS.NodeJS`), and until then the studio itself does the same job in the
   browser, at `https://pipe-screen-studio.vercel.app`, with no install at all. Do not write the
   data anyway, and do not offer to hand over a JSON file for later: the file is worth nothing
   without the script that renders it.

   The `curl` returns every template's `label`, `hint`, `dataContract` (the exact TypeScript
   shape of `data`) and `promptGuide` (palette, badge rules, how many cards per phase). Read the
   guide for your template before writing data: it is the source of truth, not this file.

   If the server does not answer: when it is a local one, start it from the checkout
   (`npm run dev`) and poll until `/api/templates` responds. When it is the published studio,
   say so and stop. There is nothing to render against, and inventing a screen without the
   templates defeats the point.

2. **Take the whole process**, when the arguments named no template. Say it in one line, naming
   the models the server just returned and the count they come to, and go straight on to the
   data:

   ```
   Processo completo: map, kanban, card, portal, dashboards, interfaces e agents.
   Cerca de 16 views num arquivo só.
   ```

   **The whole process is EVERY model the server returned.** Not a curated subset, and not the
   three or four that a demo usually opens with: whatever came back from `/api/templates` goes
   into the file, all of it, each one written with the same care as if it had been asked for
   alone. Do not narrow the set while writing the data. On seven models and a five-phase board
   that is around 16 PNGs, counted from the models the server listed and the phases of the
   board you are about to write.

   **Do not ask which models to build.** The question costs the user a decision they have no
   basis for making yet, and the answer they would give is the whole process anyway. Step 4
   shows the summary and takes the correction, which is a better moment to drop a screen: by
   then there is something to react to. A user who does name templates in the arguments gets
   exactly those.

3. **Write ONE file for everything the prompt asked for**, e.g. `demo-<slug>.json`. Every screen
   goes under `screens`, keyed by name, and a screen that embeds another one references it with
   `"@<key>"` instead of repeating it:

   ```json
   { "name": "Esteira de crédito", "device": "desktop",
     "screens": {
       "map":    { ... },
       "kanban": { ... },
       "card":   { "board": "@kanban", "at": { "column": 2, "card": 0 },
                   "startForm": [ ... ], "phaseFields": [ ... ] } } }
   ```

   The reference is not a convenience: writing the board out twice was about 40% of
   everything a run had to write, and it was 40% that had to agree with itself by hand. Never
   inline a copy of the board into the card.

   **One prompt is one file, and one run.** Unless the user asks for separate files, everything
   asked for in a single prompt goes into that one file, however many screens it turns out to be:
   one run, one slug, one file in the library with all the frames side by side.
   A prompt that asks for three personas is not three runs; splitting it hands the user three
   links to reconcile and a set of screens that no longer reads as one demo.

   A key is a screen's NAME, and by default also its template. When one prompt asks for several
   views of the same template, which is what personas, before-and-after, or a desktop next to a
   mobile are, give each its own key and say which template it is. `label` names that view inside
   the library file:

   ```json
   { "name": "Esteira de crédito", "device": "desktop",
     "screens": {
       "kanban-analista": { "template": "kanban", "label": "Analista", ... },
       "card-analista":   { "template": "card", "label": "Analista",
                            "board": "@kanban-analista", "at": { "column": 1, "card": 0 } },
       "kanban-diretor":  { "template": "kanban", "label": "Diretor", ... } } }
   ```

   The personas are views of ONE pipe, so the phases, the fields and a card that appears in two
   of them carry the same values: what changes is which cards each person sees. A card whose
   phase or amount moves between two personas' boards is the error a reader catches first.

   **"O processo, para o diretor e o analista" is the whole process, and only some of it repeats
   per persona.** Everything the prompt implies goes in the file, which is the same set step 2
   builds from an intent alone: the map, the portal, the interface builder, the
   interfaces, the board, the dashboards, the agent's three steps and the card walked phase by
   phase. Then:

   - **Per persona**: `kanban` (the cards that person sees), `card` (which card they open and
     what the detail annotates for them) and `dashboards` (the numbers that job title reads).
     These are what a persona actually changes.
   - **Once, shared**: `map`, `portal`, `interfaces` and `agents`. The
     portal is the requester's page, the interface is the outside audience's, the map is the
     account, and the agent is set up once for the pipe and not per job title. Per persona they
     would be the same frame twice under two names, which reads as a mockup padded out rather
     than a demo.

   So a sales process for a diretor and an analista is about 23 screens in one file: 9 shared,
   and 7 each on a five-phase board (a board, a dashboard, and the card opened on each phase).
   Say that count out loud before shooting (see "Say which view you are on").

   One rule is left for you, since nothing can derive it:

   - The map's `pipe`, `icon` and `iconTone` match the kanban's, and one of its nodes is the
     kanban itself, marked `here: true`. The others are what that pipe connects to.

   Write the card ONCE PER BOARD, with `at` on a middle phase, so the modal has somewhere to move
   both forward and back. One entry is the whole walkthrough: it names ONE card and gives that
   card's values in each phase, under `walkthrough`, and the script shoots it phase by phase. A
   second card entry over the same board would be those phases shot twice. Two personas have two
   boards, so they have two card entries, each pointing at its own board. See "The card walks the
   board" below, which is where the walkthrough is written out.

   A single screen can also be written as one file per screen, the full `/api/render` body
   (`{ template, device, name, data }`), which is what the pair form in step 5 takes. That form
   does not walk the board: it shoots the one phase in `at`.

4. **Show what you are about to build, SHORT, and wait for a go-ahead.** This is a summary to
   react to, not the data printed out: a header line, one line per phase, one line per other
   screen. Aim for about fifteen lines for one board, and never more than thirty however big
   the process is. No tables.

   ```
   Esteira de crédito · t-money · desktop · 8 views

   Pipe   1 Proposta recebida (4)   nº da proposta, cliente, valor solicitado
          2 Análise documental (3)  CNPJ, balanço, situação cadastral, analista
          3 Análise de risco (2)    score, rating interno
          4 Comitê de crédito (3)   valor aprovado, alçada, relator, parecer
          5 Formalização (2)        instrumento, assinatura prevista

   Card   Construtora Marfim, recebíveis performados, nas 5 fases
          solicitado R$ 980.000 → aprovado R$ 900.000 → liberado R$ 900.000
          start form: proposta 48235, Marfim Construções, Vanessa Corrêa

   Map    6 objetos, o pipe no centro; Cadastro de clientes e Análise de fraude entram nele
   Dash   5 KPIs, funil das 5 fases, split por modalidade
   ```

   What goes on a line, and what does not:

   - **A phase line is its name, its card count and the FIELDS it asks**, not the cards' values.
     Which companies are on the board is what the screenshot is for. Wrong fields on a phase is
     the mistake worth catching here, and it is visible in five words.
   - **The card is the exception**: give the anchor's name and the thread of values that has to
     agree across the phases, in one line, since that is the one contradiction a screenshot
     hides (approved, signed and released being three different amounts). Then the start form in
     one line.
   - **The other screens get one line each**: what the map's shape is, what the dashboard counts,
     what the portal offers. Enough to say "that is not my process", not enough to check field
     by field.
   - Say the optional parts only where they carry meaning: which card is late, which one has the
     connection. Never list every label and timer.

   **Offer the detail instead of printing it.** End with one line saying it is there: `posso
   abrir os cards de qualquer fase, ou o card completo`. Print a table only when the user asks
   for one, and only for what they asked about.

   Then ask, with `AskUserQuestion`, whether to shoot it or change something. Dropping a screen
   is one of the changes: the header line says how many views the process came to, so a user who
   only wanted the board says so here and the rest never gets shot. Apply whatever the user asks
   for and shoot: show the summary again only when the change was broad enough that it is a
   different process.

5. **Shoot it** with the script that sits next to this file. A process file takes one slug,
   and the PNGs come out as `<slug>-<key>.png`, the key being the screen's name in the file, so
   `vendas-kanban-diretor.png` sorts next to `vendas-card-diretor-1-....png`:

   ```bash
   node <this skill's folder>/demo-builder.mjs demo-<slug>.json <slug>
   ```

   PNGs go to `~/Desktop/Demo Builder` (override with `DEMO_BUILDER_OUT`), and the folder is
   created if missing. Name the slug after the intent, e.g. `automacao-vendas`. Pass a path
   with a slash only when the user asks for a specific location.

   The card's PNGs are numbered by phase, `<slug>-<key>-<n>-<fase>.png`, so the walkthrough
   keeps its order in a file listing and in a deck. `--one-card` shoots only the phase in `at`,
   for when one screen of the detail is all the user wants.

   The screens are shot three at a time, so a process costs about as long as its slowest
   screen rather than the sum: measured, three went from 11s to 4s.

   The pair form still works for a screen written as a full render body, and several pairs
   still land in one library file:

   ```bash
   node <this skill's folder>/demo-builder.mjs board.json <slug>-kanban.png --name "<process name>"
   ```

   Flags: `--scale 1` for a 1x PNG (default 2x, better for slides), `--keep-html` to also keep
   the rendered HTML, `--base URL` for a non-default server, `--no-save` to skip the library
   file below.

   Besides the PNGs, the script files the screens in the user's library and prints where:

   ```
   saved https://pipe-screen-studio.vercel.app/f/2f1c8a9e
         3 screens in your library
   ```

   One file, the frames side by side, under the account this machine is connected to. Pass the
   link along with the PNG paths. A `save skipped` line is not a failure of the run: the PNGs
   are already done, and only the library copy is missing.

   One file holds 48 screens, which is a whole process walked phase by phase for two or three
   personas. The script says so before it starts shooting (`note  52 views, and one library
   file holds 48`); when it does, the PNGs are all there and the library copy is not, and that
   is what to report. Do not split the run in two to get under it: one prompt is one file.

6. **Show it**: `Read` the PNG so it renders in the conversation, then give the user the path
   the script printed, plus the library link when there is one. If the data does not fit the
   contract, the script prints the server's validation error: fix the JSON and re-run.

## The card walks the board

A card open on one phase shows the form of that phase and says nothing about the others. So the
card comes back once per phase: a build is the process AND every question it asks along the way.

**It is ONE card, followed through the process.** Same title, same start form, same people in
every shot; what changes is the phase chip and the fields that phase asks for. Reading the seven
PNGs in order is reading one request go from intake to money out. Seven different cards with
seven different titles is not a walkthrough, it is seven screenshots, and the start form under
them says the same client on all seven, which is the contradiction a reader spots first.

The card in `at` is the anchor. The script moves it: for each phase it lifts the anchor out of
its own column and puts it at the top of the phase being shot, so the board behind agrees with
the modal. What you write is the anchor's values in each phase, one entry per phase, by index or
by name:

```json
"card": {
  "board": "@kanban",
  "at": { "column": 1, "card": 0 },
  "startForm": [ ... ],
  "phaseFields": [ ... ],
  "walkthrough": [
    { "phase": "Proposta recebida",  "values": ["48213", "Aurora Indústria Ltda", "R$ 850.000,00"] },
    { "phase": "Análise de risco",   "values": ["742", "B+"] },
    { "phase": "Comitê de crédito",  "values": ["R$ 820.000,00", "Diego Salgado", "Garantia real em R$ 2,1 mi."] }
  ]
}
```

The rest:

- **One entry per phase of the board, in the phase's field order**, one value per field. The
  phase in `at` needs none: its values are the anchor card's own, already on the board. A phase
  you leave out is drawn with its fields empty, and the run says so (`note  no walkthrough
  values for ...`), which is right for a phase the card has not reached and wrong for one it
  already passed.
- **Write every phase anyway, including the ones ahead of `at`.** The walkthrough is the card's
  whole life, not the part that already happened, so a card sitting in Análise still gets its
  Formalização and Liberação values. What was decided later is a plausible future, and the run
  reads as a process rather than as a card that stops halfway.
- **The values are one card's**, so they agree across phases: the amount approved in the comitê
  is the amount signed in the formalização is the amount released at the end, give or take what
  the process itself changes, and the analyst who signed the analysis is the analyst named there.
- **The annotations do not travel.** `phaseFields` was written about the phase in `at`, so the
  other phases are shot without it. A note about "Documentos" landing on a phase that never asks
  for documents is an invented field.
- **The start form is the anchor's**, which is now simply true: same request, same id, same
  client, on all of them.
- The anchor's own chips travel with it (labels, assignees, counts), since it is the same card.
  An `sla` is the one to think twice about: late in every phase reads as a broken board.
- A board of one phase is one card PNG. `--one-card` shoots only the phase in `at`.

## The agent has three steps

An agent is set up in three pages, and the model draws all three from ONE set of data: who it is
(General), what it knows (Knowledge), what it does (Behaviors). So the file holds one entry and
the run comes back with three PNGs, `<slug>-agents-1-general.png` and its two siblings.

```json
"agents": { "process": "Esteira de crédito", "name": "Analista de Crédito",
            "role": "Você é o agente ..., com experiência em ...\n\nSua responsabilidade principal é ...\n\nSuas responsabilidades incluem:\n- ...\n- ...",
            "knowledge": [ ... ], "pipeKnowledge": [ ... ], "behaviors": [ ... ] }
```

- **`role` is the agent's whole instruction, and it is the field the screen is about.** Write it
  in three blocks, separated by blank lines: what the agent is, in one sentence with its
  expertise named; what it is for, in one sentence; then "Suas responsabilidades incluem:" and 5
  to 8 lines opened by "- ", each a real task of this operation, including the one thing it must
  never decide alone. Aim for 12 to 18 lines.

  Two sentences leave the box two thirds empty, which reads as an agent nobody finished setting
  up. The field is 256px tall and CUTS what does not fit, and that is right: a real prompt runs
  past the bottom of the box. Name the artefacts, the thresholds and the people of the case, and
  keep them agreeing with the knowledge sources and the behaviors, since the three screens are
  one agent.
- Do not write the entry three times, and do not set `screen` yourself. Write it once; the
  script asks the server for each page. `"screen": "a" | "b" | "c"` in the entry is the way to
  ask for ONE of them, e.g. only the behaviors on a slide about automation.
- The three pages are one agent, so `knowledge` is what it already has and `pipeKnowledge` is
  what the pipe still offers, with nothing in both lists: the second page shows them one under
  the other, and a source in both reads as a bug.
- The first behavior is the one the page opens with its instruction showing; the others are
  collapsed to their names. Put the case in the first one.
- **A behavior's `lines` are 4 to 6, not 2.** The instruction box is the biggest thing on that
  screen, and a two-line rule leaves it half empty and says nothing about what happens when the
  answer is no. Write: what to read and against what, what to check with the threshold spelled
  out, what to do when it passes, what to do when it does not, and what to write back on the
  card. Use 3 to 6 chips across it, each one a THING (`Renda comprovada`, `Mover para Análise
  de risco`), never a whole sentence, and name only fields and phases that exist on the board
  in the same file.
- With the pipe in the same file, the agent belongs to it: same `process` as the kanban's name,
  same icon, and its triggers name phases that exist on that board.
- **`audit` turns one entry into six PNGs**, and it is only for a demo about governance: the
  log of what the agents have done, and one of those runs opened on Summary and on Tracing.
  Leave it out for a demo about setting an agent up, or the run comes back with three screens
  of invented history nobody asked to check. Written, it holds the period, 6 to 10 rows naming
  the OTHER agents on the pipe as well as this one, and a `detail` pointing at the row worth
  opening, with 4 to 8 tracing steps of which only the first carries its reasoning.

## The interface has four layouts

A published interface is one page drawn four ways, and the model draws all four from ONE set of
data: with the cover photograph (A), without it so the whole table fits (B), with the assistant
open over it mid-answer (C), and the builder's canvas where it is assembled (D). So the file
holds one entry and the run comes back with four PNGs, `<slug>-interfaces-1-a.png` and its
three siblings.

```json
"interfaces": { "tabs": [ ... ], "cover": "blue-arcs", "title": "Portal do fornecedor Aurora",
                "subtitle": "...", "greeting": "Olá, Renata Cordeiro!", "steps": [ ... ],
                "columns": [ ... ], "rows": [ ... ], "docs": [ ... ],
                "ask": "...", "answer": [ ... ],
                "builder": { "sectionTitle": "...", "forms": ["Cadastro da transportadora", ""] } }
```

- Do not write the entry four times, and do not set `variant` yourself. Write it once; the
  script asks the server for each layout. `"variant": "a" | "b" | "c" | "d"` in the entry is the
  way to ask for ONE of them.
- Write every field, including the ones a given layout does not show. `ask` and `answer` are the
  assistant's conversation, and without them the C layout is skipped rather than shot with an
  empty panel. `builder` is the section the canvas shows, with one form placed and one slot left
  empty, which is what says the page is not finished.
- The four are one page, so nothing in the data describes a layout: no sentence that only makes
  sense with the cover, none that only makes sense without it.
- The tabs are also the pages down the builder's left. A tab marked `"unpublished": true` is
  drawn only there, which is how an account with a page not yet live reads.

## Say which view you are on

The user cannot see which screens are in flight, so a one-view run reads exactly like a
three-view run unless you say otherwise. Name the scope out loud, in singular when it is
singular:

- Before step 3, one line: `Gerando 1 view: kanban` or `Gerando 3 views do mesmo processo:
  map, kanban, card`. Never announce more views than are being built.
- Count the card's phases in that line, since one entry in the file is several PNGs: `Gerando 6
  views: map e o card aberto nas 5 fases`. The number of phases is yours to know, you wrote the
  board. The agent counts the same way: one entry is `3 views: o agente nas 3 etapas`.
- With personas, say what repeats and what does not, since the count is otherwise a surprise:
  `Gerando 20 views num arquivo só: map, portal, builder e as 3 interfaces uma vez, e board,
  dashboards e o card nas 5 fases para o diretor e para o analista`.
- On an edit, name the view being edited and say what is not being touched: `Editando só o
  card, o map e o kanban ficam como estão`. Re-shoot only that view, and remember that editing
  the card is editing all of its phases: a change to the board changes every one of them.
- One exception, and state it when it applies: the library file carries whatever the run
  shoots, so keeping a three-frame file after editing one view means re-shooting all three.
  Say it in the same line: `Reshooting os 3 frames para o arquivo seguir um processo, só o
  card mudou`. Do not do this silently.
- The script echoes each view as it starts (`view  2/3  kanban`), and prints one `done` line
  with the total when there is more than one. That output is the scope of the run: do not
  describe more screens than it lists.

## If the user interrupts

Esc means stop, not pause. If the user interrupts at any point while screens are being
generated, drop the whole thing:

- Do not shoot, re-shoot, or finish a partial run. Do not file anything in the library and do
  not print a library link.
- Do not ask whether to continue, and do not offer to pick up where it stopped. Wait for the
  next instruction.
- Say in one line what was aborted, and name any PNG that already landed on disk so the user
  knows it is a leftover from a cancelled run.

An interruption during step 4 (the summary waiting for a go-ahead) is the same thing: the data
is discarded, not held for a later go-ahead.

## Writing good data

The template's own `promptGuide` (step 1) governs. Beyond it:

- Use the intent's language for all content, with specific plausible names, companies,
  amounts and dates. Never lorem ipsum, never `Card 1`.
- **Vary the number of cards per phase, at random**, within the range the `promptGuide`
  gives. Do not settle into a uniform count: roll per column so adjacent phases differ. When
  the intent asks for a volume ("fase cheia", "poucos cards"), follow the intent instead.
- Cards that run past the bottom of the viewport get cut off, which reads like a board
  mid-scroll and is fine. Do not shrink the data to avoid it.
- **Kanban on desktop: 5 columns.** The board is a fixed-size viewport, so columns 6 and 7
  fall off the right edge. On mobile the board stacks vertically, so more columns are fine.
- **Map: the shape carries the meaning.** A straight chain is a poor map. Give a node that
  feeds two others, or two that converge on one, and put parallel branches in different rows
  of the same column. Keep columns 0 to 5 and rows 0 to 4, which is what a 1440x960 frame
  holds.
- **Map: one link per pair.** Two edges between the same two objects land on the same curve
  and read as one, so a cycle (a blocked task going back into execution) does not show. Say
  it with one edge, or move one of the two objects to another column.
- **One process across the views.** Whatever set is being built, the screens are views of the
  same operation: the same pipe name, the same people, the same cards where they overlap. A
  dashboard whose numbers contradict the board next to it is the one error a reader always
  catches.

## Notes

- No `OPENAI_API_KEY` needed: you are the generator. The key is only for the studio UI's
  Generate button and `/api/generate`.
- To preview in a browser instead of a PNG, POST the same body to `/api/render`, or open
  `/api/example?model=kanban&device=mobile` for the built-in samples.
- To install: copy this folder to `~/.claude/skills/demo-builder/`, and `/demo-builder` works
  in every project on that machine. The one thing to configure is the account:
  `node ~/.claude/skills/demo-builder/demo-builder.mjs login`, once per machine, and the first
  build does it by itself anyway. No API key is involved.
- The token is per server, so a person working on the studio locally logs in twice: once
  against `http://localhost:3838` and once against the published one. `whoami` reports the
  server it was asked about.
- This skill replaced `/pipeshoot`. `PIPESHOOT_BASE` and `PIPESHOOT_OUT` still work as
  fallbacks for the two env vars above, so an existing setup keeps working.
