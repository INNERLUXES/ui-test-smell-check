# Limits

## Tokens only

The tool lexes test files and matches the tokens against the patterns in [method.md](method.md). It never runs a test, never opens a browser, never imports a file, and never follows a value from where it is set to where it is used. A clean report means that none of the patterns below were found in the files it read; it does not mean that the tests are stable or good. [decisions/0001-lex-the-files-never-run-or-import-them.md](decisions/0001-lex-the-files-never-run-or-import-them.md) says why it lexes and does not parse or run.

## What the rules cannot see

- **Values in variables.** A selector, a wait time or an address held in a variable, built by a function, or read from a page object of another file is not read. `const sel = '.btn'; cy.get(sel)` is not reported; `cy.get('.btn')` is. `cy.wait(delay)` is not reported, because the tool cannot tell a number from an alias.
- **Other files.** Each file is read on its own. An implicit wait set in a fixture of another file, a helper that sleeps, a base URL set in a configuration, or a variable shared through a module are not seen. A wait inside a helper (`await pause(500)`) is reported only when the helper's own file is read and the sleep in it matches a pattern.
- **Frameworks it does not know.** WebdriverIO, TestCafe, Puppeteer, Nightwatch, Robot Framework, Ruby, C# and Kotlin are not read. Playwright for Java and .NET is not read. A JavaScript file that uses Playwright without importing it (a global setup that receives `page`) is not checked, and a note names it.
- **Whether a finding is right for your suite.** A position can be the only way to tell identical rows apart, a forced click can be the right call for a hover menu, a class can be a stable contract that a team keeps on purpose, and a serial group can be a deliberate flow. The tool cannot see the page or the intent; use an ignore comment with the reason, or change the rule in the configuration.
- **Names.** A rule that names a receiver (`page`, `frame`, `cy`, `By`, `Thread`, `time`) relies on the usual name. A page object called `p` makes `p.click('.btn')` a call the tool does not read as a selector. `test`, `it` and `describe` under other names are not seen.
- **Shared state.** `shared-state` sees a top-level `let` or `var` assigned inside a test, and a Python `global` in a test. It does not see a shared object changed through a property (`state.cart = ...`), a class field, a Java field, a database or a file, and it does not check whether another test reads the value.
- **Hashed class names.** The patterns of [method.md](method.md#styling-selector-warning) cover common CSS-in-JS, CSS Modules and JSS names. A build that uses short random class names with no prefix cannot be told from a name a person wrote, and is reported only when the selector picks its element by classes.
- **Lexing JavaScript without parsing it.** The tool decides whether a `/` starts a regular expression from the token before it, and whether a `<` opens JSX in the same way. [inputs.md](inputs.md) names the rare code where that is wrong. The code inside the braces of a Python f-string is not read.
- **Runtime behavior.** Timing, retries, the speed of the machine and the state of the application are not seen. A suite with no finding can still be flaky.

A finding is a review item, and a clean report is a good start, not a proof.

## Size and counts

- An input with more than 1,000 paths, more than 100,000 files and folders, folders nested more than 32 deep, or more than 20,000 files to read is refused with exit code `2`.
- A file over 2 MB is not read and is named in a note; together the files read may hold at most 256 MB, or the input is refused.
- A file that is UTF-16, or has a null byte in its first 8,000 bytes, is not read.
- A file with more than 1,000,000 tokens or 200,000 comments, or with template literals and JSX nested more than 128 levels, is not read, and a note says so with the place.
- A selector longer than 10,000 characters is not read as a selector.
- A rule that finds more than 1,000 things lists the first 1,000 in file order, counts the rest in the totals and the gate, and says so in a note.
- Text from the input shown in a report is cut to a fixed length: 120 characters for a selector, 200 for a line of code, 300 for a message and a reason.

Every limit is reported, as a note or a refusal with exit code `2`, so a cut is never silent.
