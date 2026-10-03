// Shared test helpers: test files built inline, checked in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line and column a test expects are found with where(), which counts lines the way the tool does, so a
// test never holds a line number worked out by hand for one system only.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { analyseText, defaultSettings, lineStarts, main, positionOf } from '../src/index.js';

// The words of a focused test, built from pieces so that the repository check for a focused test left in this
// repository's own tests does not fire on a fixture.
export const ONLY = ['on', 'ly'].join('');

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'ui-test-smell-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The language of a file name, as the tool reads it.
const LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java' };

// Checks one file in memory. settings: an object of rule id -> partial setting, merged into the defaults.
export function analyse(code, file = 'a.spec.ts', settings = {}) {
  const all = defaultSettings();
  for (const [id, s] of Object.entries(settings)) all[id] = { ...all[id], ...s, options: { ...all[id].options, ...(s.options ?? {}) } };
  const language = LANG[file.split('.').pop()];
  return analyseText(code, { file, language, settings: all });
}

export const ids = (result) => result.findings.map((f) => f.rule);
export const find = (result, rule) => result.findings.filter((f) => f.rule === rule);

// The line and column (both from 1) of the n-th place where needle starts in code.
export function where(code, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = code.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the code ${n} times`);
  }
  return positionOf(lineStarts(code), at);
}

// Common headers of a test file for each framework.
export const PW = "import { test, expect } from '@playwright/test';\n";
export const CY = '';
export const SE_JS = "import { Builder, By, until } from 'selenium-webdriver';\n";
export const SE_PY = 'from selenium.webdriver.common.by import By\n';
export const PW_PY = 'from playwright.sync_api import Page, expect\n';
export const SE_JAVA = 'import org.openqa.selenium.By;\n';

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}
