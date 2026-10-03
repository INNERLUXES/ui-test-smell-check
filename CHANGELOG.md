# Changes

## 1.0.1

- The time limits of the hostile-input tests are four times wider when the tests run with coverage, which slows every line of the tool; a plain test run keeps the tight limits. The tool itself is unchanged.

## 1.0.0

First release.

- Reads UI test files written for Playwright, Cypress and Selenium WebDriver, in JavaScript and TypeScript (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`), Python (`.py`) and Java (`.java`), and lists the patterns that make UI tests flaky or brittle, each with its file, line, column, rule id, severity, a one-line reason and the sentences of the documentation it rests on.
- Rules: `fixed-wait`, `mixed-waits`, `position-selector`, `nth-locator`, `styling-selector`, `force-action`, `only-left`, `skipped-test`, `order-dependence`, `shared-state` and `absolute-url`. Each one is described with exactly what it reports, and what it does not, in docs/method.md.
- The files are lexed, never run, imported or evaluated: comments, strings, template literals (with the code inside `${...}` read as code), regular expression literals, the elements of JSX, Python strings with their prefixes and Java text blocks are read as what they are, so a rule never fires inside a comment or a string, and a selector is always the value of a string.
- A configuration file in strict JSON turns rules off, sets their severity and their numbers (`minMs` of `fixed-wait`, `hashMinLength` of `styling-selector`), leaves files out with glob patterns, sets the fail level and the limits of the input. A key the tool does not know, and a key named twice, are refused with their line.
- Ignore comments turn a rule off for one line, and only with a reason: `ui-test-smell-check-ignore <rule> -- <reason>`. A comment with no reason, or with a rule the tool does not have, is not applied, and a note says why.
- Reports as text, Markdown and JSON. `--explain` shows the line of code and the sentences each finding rests on. `--fail-on` sets the fail level. Exit code `0` for no finding at the fail level, `1` for such a finding and `2` for a usage or input error.
- Safe input: no symbolic link inside a folder is followed; limits on files, folders, depth, bytes, tokens, comments and nesting; binary and UTF-16 files are not read and are named in a note; control, direction and line separator characters are removed from every text shown.
- Every quoted sentence comes from the Playwright, Cypress and Selenium documentation and RFC 8259, saved in `research/sources`; a test compares `src/data.js` and the documents with the saved text.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
