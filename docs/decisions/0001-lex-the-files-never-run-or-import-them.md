# 1. Lex the files, never run or import them

## Context

The tool has to say where a UI test file holds a pattern that makes tests flaky or brittle: a fixed wait, a selector tied to the position of an element or to the classes that style it, a forced action, a focused test left in, tests that depend on their order. The documentation of the three frameworks names these patterns. Playwright says of a fixed wait: "Tests that wait for time are inherently flaky." Cypress calls brittle selectors an anti-pattern: "Anti-Pattern: Using highly brittle selectors that are subject to change." Selenium says of a sleep statement: "Because the code can't know exactly how long it needs to wait, this can fail when it doesn't sleep long enough."

There are three ways to find them. A search with regular expressions over the raw text is quick, but it fires inside comments and strings, misses a selector that is split over lines, and cannot tell a call from the same words in a log message. A full parser of JavaScript, TypeScript, JSX, Python and Java is exact, but it is a large dependency or a large amount of code, and each new version of a language can break it. Loading the files, as a test runner does to list the tests, runs their top-level code, which is not safe on a branch nobody has reviewed.

## Decision

The tool lexes each file with a small lexer of its own for its language, and the rules match patterns in the tokens. A lexer knows exactly what a comment, a string, a template literal, a regular expression literal, an element of JSX, a Python string with its prefix and a Java text block are, so nothing inside a comment or a string is taken for code, and a selector is read from the value of a string after its escapes, never from the source text. The rules look at short runs of tokens: a call by its name and its receiver, its arguments split at the commas of its own brackets, an object literal argument and its properties. Where a rule needs to know more (the body of a test, the function a Python `global` is in), it uses the brackets and the indentation, and docs/method.md says exactly how.

Nothing is run, imported, required or evaluated. The tool needs no dependency, no build, no browser and no network. It follows no link inside a folder.

Every rule rests on sentences of the framework documentation, saved with their address in research/sources: nine Playwright pages, four Cypress pages and five Selenium pages. A test compares the code and the documents with the saved text. Where the tool makes its own choice (a severity, a pattern of hashed class names, what counts as a test body), the documents say so.

Every number a rule uses has a documented default and can be changed in a strict configuration file, and an ignore comment needs a reason, so a team can say why a finding does not apply, in the file, next to the code.

## Consequences

The check runs in a second on Linux, macOS or Windows with only Node, and no test file can make it run code. It points at the file, the line and the column, quotes the line of code, and says which page the advice comes from.

The cost is that it sees tokens, not meaning. It cannot follow a value through a variable or into another file, it relies on the usual names (`page`, `cy`, `By`, `test`), and a lexer that does not parse can misread a `/` or a `<` in rare code; docs/limits.md and docs/inputs.md list these. A file with no finding can still hold a flaky test. The tool is a step that finds the patterns the documentation warns about, early and on every change, before a review and before the reruns that find the rest.
