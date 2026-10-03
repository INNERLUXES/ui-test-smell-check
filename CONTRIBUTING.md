# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!` for a breaking change.

## Changing a rule

1. Describe the change in docs/method.md first: exactly what the rule reports, for which framework and language, what it does not report, the severity and why, the options, and the sentence of a saved page it rests on. Where the tool makes its own choice (a severity, a pattern of hashed class names, what counts as a test body), say so and say why.
2. A rule reads tokens, never the raw text of a file. Nothing in a comment or a string may be reported as code, and a selector is always read from the value of a string, never from the source text around it.
3. Every number a rule uses has a default that is written in docs/method.md, and can be changed in the configuration file under the rule, with a range in `OPTION_RANGES` in src/config.js.
4. Add tests with the code written inline: a case that must be reported, with its line and column, and a near miss on each side that must not be: the same call in a comment and in a string, the same name on another receiver, the same call in a file of another framework. A new framework or language needs a test for every rule it adds to.
5. Text from the input goes through `safeText` before it reaches a finding, a note or an error message, so control characters are removed and the length is capped.
6. A rule id, once released, keeps its meaning: pipelines, configuration files and ignore comments name it.

## Changing a lexer

1. The tool reads; it never runs. A lexer must not import, require, evaluate or run any part of a file, and must not look anything up that a file names.
2. Keep the work linear: one pass over the text, no pattern with nested repetition, no loop over all tokens inside a loop over all tokens. Nesting of template literals and JSX is capped; the number of tokens and comments is capped. Add a hostile test with a long input and a time check.
3. A text the lexer cannot read stops the reading of that file with the line and column of the problem; the file is named in a note and never passed over in silence.
4. Files written with LF and with CRLF line ends must give the same findings with the same lines and columns. A test reads the examples both ways.

## Changing the configuration file

1. A new key is added to src/config.js, documented in docs/inputs.md, and tested with a good value and a bad one. Every key the tool does not know stays an error, and an object that names a key twice stays refused.
2. A number is a whole number checked for its range.

## Changing the quoted sentences

The sentences in `src/data.js` come from the pages saved in `research/sources`: nine pages of the Playwright documentation, four of the Cypress documentation, five of the Selenium documentation, and RFC 8259. When a page changes, save the new text in `research/sources` (the address on the first line, plain ASCII, no date or year), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every quoted sentence with the saved text, so changing one without the other fails.

Never add a rule or a quoted sentence from memory or from a blog post. A new rule needs the page, opened and saved, and the words of the page that it rests on.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It opens no network connection and runs no program.
- Paths are opened with `path.resolve`, never `path.join`, so an absolute path works on every system. Paths shown in a report are relative, with forward slashes.
- A test that depends on the operating system (a symbolic link, a device, a name with a control character) is guarded with `process.platform`, and asserts no line or column of its own: a line or column is asserted in a test that runs on every system, where it is computed the same way. Every other test builds its paths with `resolve()` from names with forward slashes.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0) are fine.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
