import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, languageOf, lex } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-testing/automation';
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;

// Every file of a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'ui-test-smell-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/ui-test-smell-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['ui-test-smell-check'], 'bin/ui-test-smell-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.ok((await read('bin/ui-test-smell-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the automation testing page, in the closing Background section, with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[Automation Testing Services](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests > 100);
});

test('README: what it finds, how to run it with npx or node, the options, the example output, the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## What it finds', '## The configuration file', '## Formats', '## Exit codes', '## Limits']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/ui-test-smell-check/);
  assert.match(readme, /node bin\/ui-test-smell-check\.js examples\/shop --config examples\/config\.json/);
  for (const option of ['--config', '--format', '--fail-on', '--explain', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const r of RULES) assert.ok(readme.includes(`| \`${r.id}\` | ${r.severity} |`), `README: ${r.id}`);
});

test('README and documents: no date and no calendar year anywhere', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
  }
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"ui-test-smell-check security"/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|hours|within a (?:day|week)|\bdays\b|we will|guarantee/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems and two Node versions, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('release workflow: a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/ui-test-smell-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/shop\/\*\* -text$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /release-gate-check|junit-flaky-check|ui-markup-a11y-check|design-token-check|requirements-check/i, file);
  }
});

test('docs: every rule is described in docs/method.md, and the documents of the set are there and linked', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(`### \`${r.id}\` (${r.severity})`), `docs/method.md: ${r.id}`);
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md']) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/decisions/0001-lex-the-files-never-run-or-import-them.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  const limits = await read('docs/limits.md');
  for (const t of [/Values in variables/, /Other files/, /Frameworks it does not know/, /Shared state/, /Lexing JavaScript without parsing it/]) assert.match(limits, t);
  assert.match(await read('docs/secure-defaults.md'), /NIST SP 800-218/);
  const threats = await read('docs/threat-model.md');
  for (const t of ['never run', 'link loop', 'not closed', 'nested', '__proto__', 'Markdown table']) assert.match(threats, new RegExp(t, 'i'), t);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src reads only what it is given: the only imports of the file system are in src/files.js and the version in src/cli.js', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') {
      assert.match(text, /from 'node:fs\/promises'/);
      assert.match(text, /lstat\(child\)/, 'entries inside a folder are looked at without following links');
      assert.doesNotMatch(text, /realpath|readlink/, 'a link is never resolved');
    } else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('tests: a test file that makes a link or names a device guards it with process.platform, and a guarded test asserts no line or column', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link or a device`);
      guarded += 1;
    }
    for (const block of text.split(/\ntest\(/).filter((b) => /if \(process\.platform/.test(b))) {
      assert.doesNotMatch(block, /\.line\b|\.column\b|where\(|:\d+:\d+/, `${f}: a test guarded by the system asserts a line or a column`);
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/\bt\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('research/sources: the saved pages are plain text files with LF line ends', async () => {
  const files = await readdir(resolve(root, 'research/sources'));
  assert.equal(files.length, 19);
  for (const f of files) {
    const text = await read(`research/sources/${f}`);
    assert.ok(!text.includes('\r'), f);
    assert.ok(text.startsWith('Source: https://'), f);
    assert.ok(text.endsWith('\n'), f);
  }
});

test('the examples are made up: no real address, no token-shaped string, no number that reads like a year, ASCII, LF line ends', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}`);
  const files = await filesOf('examples');
  assert.ok(files.length >= 15);
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, tokenShape, f);
    assert.doesNotMatch(text, YEAR, f);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    if (!f.startsWith('examples/output/')) {
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.match(m[1], /^(?:localhost|[a-z0-9-]+\.example\.test)$/, `${f}: ${m[0]}`);
      assert.doesNotMatch(text, /[A-Za-z0-9._-]@[a-z0-9-]+\.[a-z]{2,}/i, f);
      assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
});

test('the example shop: every test file lexes, and holds tests of each framework in each language', async () => {
  const files = (await filesOf('examples/shop')).filter((f) => languageOf(f));
  assert.ok(files.length >= 10);
  const languages = new Set();
  for (const f of files) {
    const language = languageOf(f);
    languages.add(language);
    assert.ok(lex(await read(f), language).tokens.length > 5, f);
  }
  assert.deepEqual([...languages].sort(), ['java', 'javascript', 'python', 'typescript']);
  assert.deepEqual(JSON.parse(await read('examples/config.json')).ignore, ['examples/shop/playwright/legacy/**']);
});
