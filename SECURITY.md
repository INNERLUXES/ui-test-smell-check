# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "ui-test-smell-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up input that shows the problem, what you expected and what happened. Use made-up test names, selectors and paths, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- a test file that makes the tool run it, import it, load a module it names, evaluate any part of it, or run a program
- a folder that makes the tool follow a symbolic link or a junction inside it, or read a file outside the paths it was given
- a configuration file that makes the tool read a file outside the paths it was given, or accept a key it does not know or a key named twice
- an input that makes the tool hang, take very long, or use unbounded memory, such as a very large file, very many files or folders, deep folders, a string, a comment, a template literal or a regular expression that is never closed, template literals or elements of JSX nested very deep, brackets nested very deep, a very long selector, or a glob pattern that makes matching slow
- text from a file name, a test, a selector, a comment or a configuration value that breaks a Markdown table, rewrites the terminal through control or direction characters, or is shown unescaped in a report
- a name such as `__proto__` in a test file or in the configuration that changes how objects behave inside the tool
- a file the tool fails to read and passes over without a note
- a finding reported inside a comment or a string, or a pattern a rule documents that it reports and does not
- an ignore comment with no reason that turns a finding off
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: whether a finding is worth a fix in a given suite (docs/limits.md lists what the tool cannot see), the patterns the tool does not look for, the safety of the test runner and the browsers, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
