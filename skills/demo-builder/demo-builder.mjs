#!/usr/bin/env node
/**
 * Turn template data into a PNG.
 *
 *   node demo-builder.mjs process.json <slug> [flags]              one file, every screen
 *   node demo-builder.mjs data.json out.png [more.json more.png]   one file per screen
 *
 * A process file holds the whole set and never repeats a screen inside another:
 *
 *   { "name": "Esteira de crédito", "device": "desktop",
 *     "screens": {
 *       "map":    { ... },
 *       "kanban": { ... },
 *       "card":   { "board": "@kanban", "at": { "column": 2, "card": 0 }, ... } } }
 *
 * "@kanban" is a reference: any string of that form is replaced by that screen's data before
 * the render. The card embeds the whole board, so writing it out twice was about 40% of
 * everything a run had to write, and it was 40% that had to agree with itself by hand.
 *
 * The key names the screen, and by default it is also the template. A key that is not a
 * template says which one it is, which is how one process holds several views of the same
 * template (a board per persona, a mobile board next to the desktop one) and still comes out
 * as ONE run and ONE library file:
 *
 *   "kanban-analista": { "template": "kanban", "label": "Analista", ... }
 *   "card-analista":   { "template": "card", "label": "Analista", "board": "@kanban-analista", ... }
 *
 * "label" names that view inside the library file, next to the process name. "template",
 * "device" and "label" are about the screen, not about its data, so they never reach the
 * server as part of it.
 *
 * The card is then shot ONCE PER PHASE that has cards, which is what a build does in the
 * studio: the process and every question it asks along the way, as
 * <slug>-card-<n>-<phase>.png. Use --one-card to shoot only the phase in `at`.
 *
 * The agent is the same idea at a different scale: one entry is the three steps of its setup
 * (General, Knowledge, Behaviors), as <slug>-agents-<n>-<step>.png. An entry that names its own
 * `screen` ("a", "b" or "c") is asking for that page alone and gets one PNG.
 *
 * The interface is one entry and four layouts (with cover, without, with the assistant, and the
 * builder's canvas), as <slug>-interfaces-<n>-<layout>.png. An entry that names its own
 * `variant` gets that one.
 *
 * The pair form still works, one data.json per screen, each a full /api/render body:
 * { template, device, data }. Either way the server renders (so sizes and layout rules stay
 * in one place) and headless Chrome shoots the result at the size the server reports.
 *
 * Screens are shot a few at a time rather than one after another: three took 11s in series
 * and 4s together, and the cost is a Chrome per screen, so the count is capped.
 *
 * A bare filename (no separator) lands in ~/Desktop/Demo Builder, or in $DEMO_BUILDER_OUT.
 * Missing directories are created.
 *
 * macOS, Windows and Linux: nothing to install beyond Node 18+ and a Chrome, Chromium or Edge,
 * which the script finds per platform, and $CHROME when it lives somewhere else.
 *
 * It also files the screens in your Demo Builder library, as one file with the frames side
 * by side, and prints the link to it. Use --no-save to skip that and --name to name the file.
 *
 * The server knows who you are because this script carries a token:
 *
 *   node demo-builder.mjs login     connect this machine to your account, once
 *   node demo-builder.mjs whoami    say which account it is connected to
 *   node demo-builder.mjs logout    forget the token on this machine
 *
 * `login` opens the studio in your browser, where you are already signed in, and the page
 * hands the token back to a small server this script runs on 127.0.0.1 for the length of the
 * handshake. Nothing to copy and paste. A build with no credential runs `login` by itself and
 * carries on, so most people never type any of the three.
 */
import { readFile, writeFile, unlink, mkdir, chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, hostname } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Where a browser lives, per platform. $CHROME wins everywhere, and is the answer for a
 * machine that keeps its browser somewhere else.
 */
const CHROME_BY_PLATFORM = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  win32: [
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.PROGRAMFILES ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.PROGRAMFILES ?? "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
  ],
};

const CHROME_CANDIDATES = [
  process.env.CHROME,
  ...(CHROME_BY_PLATFORM[process.platform] ?? CHROME_BY_PLATFORM.linux),
].filter(Boolean);

function die(message) {
  console.error(message);
  process.exit(1);
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** Flags carry a value, so drop both the flag and what follows it. */
const FLAGS_WITH_VALUE = new Set(["--base", "--scale", "--name"]);
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    if (FLAGS_WITH_VALUE.has(argv[i])) i += 1;
    continue;
  }
  positional.push(argv[i]);
}

/**
 * The published studio, so this works on a machine with no checkout of the repo. Point
 * DEMO_BUILDER_BASE at http://localhost:3838 when you are working on the studio itself and
 * want the templates as they are on disk. PIPESHOOT_BASE is the old name, still honored.
 */
const base = (
  arg("--base", process.env.DEMO_BUILDER_BASE || process.env.PIPESHOOT_BASE) ||
  "https://pipe-screen-studio.vercel.app"
).replace(/\/$/, "");

/*
 * ----------------------------------------------------------------- credentials
 *
 * A token per server, because a token issued by a studio running on localhost is not a token
 * the published one has ever heard of, and somebody working on the studio has both.
 *
 * The file is 600 and lives beside the other config in the home directory, not next to this
 * script: the script travels with the skill folder and could be copied anywhere, and a
 * credential that travels with it is a credential in a git repository sooner or later.
 */
const CREDENTIALS = path.join(homedir(), ".config", "demo-builder", "credentials.json");

async function readCredentials() {
  try {
    return JSON.parse(await readFile(CREDENTIALS, "utf8"));
  } catch {
    return {};
  }
}

async function writeCredentials(all) {
  await mkdir(path.dirname(CREDENTIALS), { recursive: true });
  await writeFile(CREDENTIALS, JSON.stringify(all, null, 2), { encoding: "utf8", mode: 0o600 });
  // A file that already existed keeps its old mode through writeFile, so say it again.
  await chmod(CREDENTIALS, 0o600).catch(() => {});
}

/** The token for this server: the environment first, so CI and a container need no browser. */
async function tokenFor(server) {
  if (process.env.DEMO_BUILDER_TOKEN) return process.env.DEMO_BUILDER_TOKEN;
  const all = await readCredentials();
  return all[server]?.token ?? null;
}

async function saveToken(server, token) {
  const all = await readCredentials();
  all[server] = { token, savedAt: new Date().toISOString(), label: hostname() };
  await writeCredentials(all);
}

/** Open a URL in whatever the machine calls a browser. Quiet when there is none. */
async function openInBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? // The empty string is the window title: without it, cmd reads the URL as one.
          ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    await run(cmd, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect this machine to an account, and come back with a token.
 *
 * The handshake: a server on a random loopback port, a nonce, the studio's page in the
 * browser, and a redirect back to that port carrying the token. The browser is where the
 * session already is, so nothing here ever sees a password, and the token never leaves the
 * loopback interface on its way in.
 *
 * The nonce is what makes the callback ours. Without it, any page open in that browser could
 * hit the port with a token of its own choosing and this script would believe it.
 */
async function login(server) {
  const state = randomBytes(16).toString("hex");
  const label = hostname();

  const waited = new Promise((resolve, reject) => {
    const http = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const token = url.searchParams.get("token");
      const echoed = url.searchParams.get("state");
      const ok = token && echoed === state;

      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        ok
          ? "<!doctype html><meta charset=utf-8><title>Connected</title>" +
              "<body style='font:15px/1.6 ui-sans-serif,system-ui;padding:48px;color:#16181A'>" +
              "<h1 style='font-size:19px'>This machine is connected.</h1>" +
              "<p>You can close this tab and go back to the terminal.</p>"
          : "<!doctype html><meta charset=utf-8><title>Not this one</title>" +
              "<body style='font:15px/1.6 ui-sans-serif,system-ui;padding:48px'>" +
              "<p>That did not match the login this machine started. Nothing was saved.</p>",
      );

      if (!ok) return;
      http.close();
      resolve(token);
    });

    http.on("error", reject);
    // Port 0 is "any free one", and 127.0.0.1 rather than 0.0.0.0: the only client this
    // server ever has is a browser on this same machine.
    http.listen(0, "127.0.0.1", () => {
      const { port } = http.address();
      const url =
        `${server}/auth/cli?port=${port}&state=${state}&label=${encodeURIComponent(label)}`;
      console.log(`login  waiting for the browser`);
      console.log(`       ${url}`);
      openInBrowser(url).then((opened) => {
        if (!opened) console.log("       (open that link yourself: no browser command found)");
      });
    });

    setTimeout(() => {
      http.close();
      reject(new Error("timed out after 2 minutes"));
    }, 120_000).unref();
  });

  let token;
  try {
    token = await waited;
  } catch (e) {
    die(
      `Could not connect this machine (${e.message}).\n` +
        `  Try again, or set DEMO_BUILDER_TOKEN if this machine has no browser.`,
    );
  }
  await saveToken(server, token);
  return token;
}

/** Whose token this is, straight from the server. Null when it does not answer for one. */
async function whoami(server, token) {
  if (!token) return null;
  try {
    const res = await fetch(`${server}/api/skill/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/*
 * The three commands about the credential itself. They take no file and no slug, so they are
 * handled before the usage check below has an opinion about how many arguments there are.
 */
if (positional[0] === "login") {
  const existing = await whoami(base, await tokenFor(base));
  if (existing) console.log(`login  already connected as ${existing.email ?? existing.name}`);
  const token = await login(base);
  const who = await whoami(base, token);
  console.log(`ok     connected as ${who?.email ?? "this account"} on ${base}`);
  process.exit(0);
}

if (positional[0] === "logout") {
  const all = await readCredentials();
  if (!all[base]) console.log(`logout this machine was not connected to ${base}`);
  delete all[base];
  await writeCredentials(all);
  console.log(`ok     forgot the token for ${base}`);
  console.log(`       the token still exists on the server; revoke it there to be sure`);
  process.exit(0);
}

if (positional[0] === "whoami") {
  const who = await whoami(base, await tokenFor(base));
  if (!who) {
    console.log(`whoami not connected to ${base}. Run: node demo-builder.mjs login`);
    process.exit(1);
  }
  const expires = who.expiresAt ? new Date(who.expiresAt).toISOString().slice(0, 10) : "?";
  console.log(`whoami ${who.email ?? who.name} on ${base}`);
  console.log(`       machine "${who.label}", token good until ${expires}`);
  process.exit(0);
}

if (!positional.length || positional.length % 2 !== 0) {
  die(
    "Usage: node demo-builder.mjs <process.json> <slug>\n" +
      "       node demo-builder.mjs <data.json> <out.png> [more.json more.png ...]\n" +
      "       node demo-builder.mjs login | whoami | logout\n" +
      "       [--base URL] [--scale N] [--name FILE] [--one-card] [--no-save] [--keep-html]",
  );
}

/**
 * The credential this run carries, connecting the machine first if it has none.
 *
 * Doing it here, before any data is read or any Chrome is started, is the same rule the skill
 * follows for Node itself: find out what is missing before the expensive part, not after nine
 * PNGs have been shot.
 */
const token = (await tokenFor(base)) ?? (await login(base));

/** One id for this invocation, so the screens of one prompt group back together on the server. */
const runId = randomUUID();

/**
 * Where PNGs go by default: a "Demo Builder" folder on the Desktop, which macOS and Windows
 * both have. A server or a container often has no Desktop, and creating one there would be
 * inventing a folder the machine never had, so it falls back to the home directory.
 *
 * PIPESHOOT_OUT is still read, since this skill used to be called pipeshoot and a machine
 * that set it does not have to learn a new name to keep the same folder.
 */
const DESKTOP = path.join(homedir(), "Desktop");
const OUT_DIR =
  process.env.DEMO_BUILDER_OUT ||
  process.env.PIPESHOOT_OUT ||
  path.join(existsSync(DESKTOP) ? DESKTOP : homedir(), "Demo Builder");

/**
 * A name that carries a separator is a path and is respected as given; a bare name lands in
 * OUT_DIR. Windows accepts both slashes, so both count there, and only there: on macOS and
 * Linux a backslash is a legal character in a file name and not a separator at all.
 */
const SEPARATORS = process.platform === "win32" ? ["\\", "/"] : ["/"];
const outFor = (name) =>
  SEPARATORS.some((sep) => name.includes(sep)) ? name : path.join(OUT_DIR, name);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    die(`Could not read ${file}: ${e.message}`);
  }
}

/**
 * What a screen entry says about ITSELF rather than about its data. No template's data has a
 * field by these names, so dropping them is safe, and it keeps a referenced board from
 * arriving at the server with a "template" of its own inside the card's data.
 */
const SCREEN_META = ["template", "device", "label"];
function dataOf(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const data = { ...raw };
  for (const key of SCREEN_META) delete data[key];
  return data;
}

/**
 * Resolve "@screen" references against the set. Only whole strings count, so a value that
 * merely starts with an @ is left alone, and a reference to a screen that is not in the file
 * is a mistake worth stopping for rather than rendering half a screen.
 */
function resolveRefs(value, screens, where) {
  if (typeof value === "string") {
    if (!value.startsWith("@")) return value;
    const key = value.slice(1);
    if (!(key in screens)) die(`${where} refers to "@${key}", which is not in this file.`);
    return dataOf(structuredClone(screens[key]));
  }
  if (Array.isArray(value)) return value.map((v, i) => resolveRefs(v, screens, `${where}[${i}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveRefs(v, screens, `${where}.${k}`)]),
    );
  }
  return value;
}

/** A phase name as a file name: no accents, no punctuation, words joined by dashes. */
const slugify = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "fase";

/**
 * The card, shot once per phase of the board: ONE card, followed through the process, which is
 * what a build shows in the studio.
 *
 * The card in `at` is the anchor, and it is the same card in every shot: same title, same start
 * form, same people. What changes is the phase it sits in and the fields that phase asks for.
 * So the anchor MOVES: it is lifted out of its own column and put at the top of the phase being
 * shot, because a modal saying "Comitê de crédito" over a board where that card is still in
 * "Análise" is two screens fighting.
 *
 * Its values in each phase come from `walkthrough`, one entry per phase (by index or by name).
 * A phase with no entry draws its fields empty, which is what a phase the card has not reached
 * yet looks like, and the run says which phases those were rather than leaving it to be noticed.
 *
 * The annotations do NOT travel. `phaseFields` was written about the phase in `at`, and a note
 * about "Documentos" landing on a phase that never asks for documents is an invented field.
 */
function cardPhases(data) {
  const columns = data?.board?.columns;
  if (!Array.isArray(columns) || !columns.length) return null;
  const atColumn = data.at?.column ?? 0;
  const anchor = columns[atColumn]?.cards?.[data.at?.card ?? 0];
  if (!anchor) return null;

  // walkthrough entries by phase index, named either by index or by the phase's own name.
  const steps = new Map();
  for (const step of Array.isArray(data.walkthrough) ? data.walkthrough : []) {
    const index =
      typeof step?.phase === "number"
        ? step.phase
        : columns.findIndex((c) => c?.name === step?.phase);
    if (index >= 0 && index < columns.length) steps.set(index, step);
  }

  const blank = [];
  const parts = columns.map((column, index) => {
    const fields = column?.fields ?? [];
    const step = steps.get(index);
    const values = index === atColumn ? anchor.values : (step?.values ?? []);
    if (index !== atColumn && !step && fields.length) blank.push(column?.name ?? `#${index + 1}`);

    // One value per field of THIS phase, so a short list leaves fields empty rather than
    // sliding every value up a row.
    const card = { ...anchor, values: fields.map((_, i) => values[i] ?? "") };
    const board = {
      ...data.board,
      columns: columns.map((c, i) => {
        const rest = (c?.cards ?? []).filter((one) => one !== anchor);
        return { ...c, cards: i === index ? [card, ...rest] : rest };
      }),
    };

    return {
      name: column?.name ?? `Fase ${index + 1}`,
      index,
      data: {
        ...data,
        board,
        at: { column: index, card: 0 },
        walkthrough: undefined,
        ...(index === atColumn ? {} : { phaseFields: [] }),
      },
    };
  });

  if (blank.length) {
    console.log(
      `note  no walkthrough values for ${blank.join(", ")}, so the card is drawn there with empty fields.`,
    );
  }
  return parts;
}

/**
 * The agent, shot once per step of its setup.
 *
 * One agent is three screens of one flow, the way the studio fans it out: who it is, what it
 * knows, what it does. They are the same data seen at three moments, so the file holds one
 * entry and the server is asked for it three times with a different `screen`.
 *
 * An entry that names its own `screen` is asking for that one page, and is left alone.
 */
const AGENT_STEPS = [
  { screen: "a", name: "General" },
  { screen: "b", name: "Knowledge" },
  { screen: "c", name: "Behaviors" },
];

/*
 * The audit log, which is the same agent seen from the pipe: what it has actually done. Three
 * more screens, and only for an entry that carries an `audit` block, because a demo about
 * setting an agent up does not want three screens of invented history. The last two are the
 * drawer over that log, so they need the run it is open on.
 */
const AUDIT_STEPS = [
  { screen: "d", name: "Audit Log", detail: false },
  { screen: "e", name: "Audit Summary", detail: true },
  { screen: "f", name: "Audit Tracing", detail: true },
];

const agentSteps = (data) => [
  ...AGENT_STEPS.map(({ screen, name }) => ({ name, data: { ...data, screen } })),
  ...(data.audit
    ? AUDIT_STEPS.filter((s) => !s.detail || data.audit.detail).map(({ screen, name }) => ({
        name,
        data: { ...data, screen },
      }))
    : []),
];

/**
 * The interface, shot once per layout.
 *
 * One published page is four screens the way the studio fans it out: with the cover, without
 * it, with the assistant open over it, and the builder's canvas it is assembled in. They are
 * the same data drawn four ways, so the file holds ONE entry and the server is asked for it
 * four times with a different `variant`.
 *
 * C is skipped when there is no answer to show: a panel with an empty thread is not the
 * variant, it is a bug wearing its frame. An entry that names its own `variant` is asking for
 * that one page and is left alone.
 */
const INTERFACE_VIEWS = [
  { variant: "a", name: "A" },
  { variant: "b", name: "B" },
  { variant: "c", name: "C" },
  { variant: "d", name: "Builder" },
];
const interfaceViews = (data) =>
  INTERFACE_VIEWS.filter(
    ({ variant }) => variant !== "c" || (Array.isArray(data.answer) && data.answer.length),
  ).map(({ variant, name }) => ({ name, data: { ...data, variant } }));

/**
 * What to shoot: a render body plus where the PNG goes. Either from a process file, which
 * names its screens, or from one data.json per PNG.
 */
const jobs = [];
const first = await readJson(positional[0]);

if (first.screens && typeof first.screens === "object") {
  if (positional.length !== 2) {
    die("A process file takes one slug: node demo-builder.mjs process.json <slug>");
  }
  const slug = positional[1].replace(/\.png$/i, "");
  const device = first.device ?? "desktop";
  const onePhase = process.argv.includes("--one-card");
  for (const [key, raw] of Object.entries(first.screens)) {
    // The key names the screen and, unless the entry says otherwise, is also the template.
    const template = raw?.template ?? key;
    const data = resolveRefs(dataOf(raw), first.screens, key);
    // A view of its own gets its name in the library file, so three boards are not three
    // frames all called "Esteira de crédito".
    const viewName = raw?.label ? `${first.name} · ${raw.label}` : first.name;
    const body = { template, device: raw?.device ?? device, name: viewName, data };

    // A screen that is really several: the card walked phase by phase, the agent step by step.
    // Numbered, so the order survives a file listing and a deck.
    const parts =
      template === "card" && !onePhase
        ? cardPhases(data)
        : template === "agents" && !data.screen
          ? agentSteps(data)
          : template === "interfaces" && !data.variant
            ? interfaceViews(data)
            : null;
    if (parts && parts.length > 1) {
      for (const [i, part] of parts.entries()) {
        jobs.push({
          body: { ...body, data: part.data, name: `${viewName} · ${part.name}` },
          label: `${key} · ${part.name}`,
          outPath: outFor(`${slug}-${key}-${i + 1}-${slugify(part.name)}.png`),
        });
      }
      continue;
    }

    jobs.push({ body, label: key, outPath: outFor(`${slug}-${key}.png`) });
  }
  if (!jobs.length) die(`${positional[0]} has a "screens" object with nothing in it.`);
} else {
  jobs.push({ body: first, outPath: outFor(positional[1]) });
  for (let i = 2; i < positional.length; i += 2) {
    jobs.push({ body: await readJson(positional[i]), outPath: outFor(positional[i + 1]) });
  }
}

const scale = Number(arg("--scale", "2")) || 2;

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  die(
    `No Chrome found. Set CHROME=/path/to/chrome. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`,
  );
}

/**
 * Renders one screen through the server and shoots it with Chrome.
 *
 * It announces the view before rendering it, and counts it against the total, so a run of
 * one view never reads like a run of three.
 */
async function shoot({ body, outPath, label: given }, index, total) {
  const label = given ?? body.template ?? body.feature ?? path.basename(outPath);
  const counter = total > 1 ? `${index + 1}/${total}  ` : "";
  console.log(`view  ${counter}${label}  ->  ${path.basename(outPath)}`);

  let payload;
  try {
    const res = await fetch(`${base}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, format: "json", run: runId }),
    });
    const text = await res.text();
    // A credential that died between the check at startup and here: revoked from the admin
    // panel, or expired on the hour. Say what to run rather than what the server said.
    if (res.status === 401) {
      die(
        `This machine is no longer connected to ${base}.\n` +
          `  Run: node demo-builder.mjs login`,
      );
    }
    if (!res.ok) die(`Render failed for ${label} (HTTP ${res.status}): ${text.slice(0, 400)}`);
    payload = JSON.parse(text);
  } catch (e) {
    die(
      `Could not reach ${base}.\n` +
        `  If that is a local studio, start it with npm run dev in the Demo Builder checkout.\n` +
        `  Otherwise check the URL, or set DEMO_BUILDER_BASE to another server.\n  ${e.message}`,
    );
  }

  const { html, size, template } = payload;
  const out = path.resolve(outPath);
  await mkdir(path.dirname(out), { recursive: true });
  const htmlPath = out.replace(/\.png$/i, "") + ".html";
  await writeFile(htmlPath, html, "utf8");

  try {
    await run(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${size.width},${size.height}`,
      // gives the webfont a moment to land before the shot
      "--virtual-time-budget=4000",
      `--screenshot=${out}`,
      // Not "file://" + the path: on Windows that is file://C:\Users\..., which is a host
      // called C and a browser that opens nothing. pathToFileURL escapes and roots it right.
      pathToFileURL(htmlPath).href,
    ]);
  } catch (e) {
    die(`Chrome failed to screenshot: ${e.stderr || e.message}`);
  }

  if (!existsSync(out)) die("Chrome exited without writing the PNG.");
  if (process.argv.includes("--keep-html")) {
    console.log(`html  ${htmlPath}`);
  } else {
    await unlink(htmlPath).catch(() => {});
  }

  console.log(`png   ${out}`);
  console.log(`size  ${size.width}x${size.height} @${scale}x  (${template})`);

  return {
    template: body.template ?? body.feature,
    device: body.device,
    data: body.data,
    name: body.name ?? path.basename(out).replace(/\.png$/i, "").replace(/-/g, " "),
    intent: body.intent,
  };
}

/*
 * A few at a time. Each screen is a Chrome of its own, so in series three took 11s and
 * together 4s, but "together" without a ceiling means one browser per screen and a machine
 * doing nothing else. Three at a time is the whole gain for a process and stays polite.
 *
 * The results keep the order of the jobs, whatever order they finish in: it is the order the
 * frames are laid out in the library file.
 */
const CONCURRENCY = 3;
const screens = new Array(jobs.length);
const queue = jobs.map((job, index) => ({ job, index }));
/*
 * One run is one library file, and the server takes at most this many screens in one. Say so
 * before the shots rather than after: the PNGs all land either way, and a run that quietly
 * loses its file reads as a run that worked.
 */
const FILE_MAX = 48;
if (jobs.length > FILE_MAX) {
  console.log(
    `note  ${jobs.length} views, and one library file holds ${FILE_MAX}. The PNGs are all shot; the file will be skipped.`,
  );
}
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      screens[next.index] = await shoot(next.job, next.index, jobs.length);
    }
  }),
);
if (jobs.length > 1) {
  // The labels, not the templates: a card walked through five phases is five views, and
  // "card, card, card, card, card" describes none of them.
  const names = jobs.map((job, i) => job.label ?? screens[i]?.template ?? "?");
  console.log(`done  ${jobs.length} views: ${names.join(", ")}`);
}

// File them under the account this machine is connected to. One file, however many screens:
// they are views of one process and belong side by side.
// A failure here is not a failure of the shots, so it warns and leaves the PNGs alone.
if (!process.argv.includes("--no-save")) {
  try {
    const res = await fetch(`${base}/api/skill/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      // The file is named after the PROCESS, not after the first screen: with the card walked
      // through its phases, the first screen's own name is a phase's.
      body: JSON.stringify({
        name: arg("--name", first.name ?? screens[0].name),
        run: runId,
        screens,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`save  skipped (HTTP ${res.status}): ${text.slice(0, 200)}`);
    } else {
      const { url, screens: n } = JSON.parse(text);
      const what = n === 1 ? "1 screen" : `${n} screens`;
      console.log(`saved ${url}`);
      console.log(`      ${what} in your library`);
    }
  } catch (e) {
    console.log(`save  skipped: ${e.message}`);
  }
}
