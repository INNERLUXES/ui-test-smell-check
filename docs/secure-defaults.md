# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **Never runs, imports or evaluates a file.** The tool reads test files as text with its own lexers. It never runs a test, a browser, a build or a script, never imports or requires a file it reads, never evaluates any part of one, and never puts a name, a path or a selector on a command line. Test code can be checked before anyone trusts the branch that wrote it.
- **No network.** The tool reads the files it is given and sends nothing anywhere. It never fetches an address named in a file, does not check for updates, and refuses an argument that looks like an address. It can run in a locked-down job with no outbound access at all.
- **No dependencies.** Node 22 or newer and nothing else, so a check does not add a supply chain of its own. There is no parser library and no `node_modules` to install before it runs.
- **Never follows a link.** Inside a folder, every entry is looked at with `lstat`. A symbolic link or a junction is listed and never followed, so it cannot lead the tool to files outside the folder or round in a loop.
- **Reads only what it needs.** Only files with the endings of the languages it reads are opened; other files are counted and never opened. The folders of packages and tools are not entered. A path or an address written in a test file is text; it is never opened.
- **Regular files only, bounded.** Each file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over 2 MB is not read. The number of paths, entries, folder levels and files, and the total bytes read, are capped, and past a cap the input is refused.
- **Bounded lexers.** Each lexer reads the text once, from left to right. Every pattern is anchored or bounded, with no nested repetition. Tokens, comments and the nesting of template literals and JSX are capped, and past a cap the file is not read, with a note, rather than read in part. A failed attempt at reading JSX has a budget, so a file of stray `<` cannot make the lexer look at the text again and again.
- **A strict configuration.** The configuration is read with a strict JSON reader that refuses a key named twice, and every key the tool does not know is an error, so a typo cannot quietly turn a rule on or off.
- **No silent ignore.** An ignore comment works only with a reason, which the report shows next to the finding it ignored. A comment with no reason is not applied, and a note says so.
- **Nothing is guessed.** A file not read, a file with no framework, a link not followed, a folder not entered, a file left out by a pattern and a limit reached are named in a note.
- **Clean output.** Text from the input has control characters, line separators and direction controls removed and its length capped before it reaches a report or an error message, so a hostile file name, selector or comment cannot rewrite the terminal or reorder what a reader sees. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`.
- **No prototype tricks.** Settings are built from a fixed list of rules, the JSON reader defines every key as an own property, and tokens are kept in arrays, so a key or a name such as `__proto__` is just data.
- **The gate is on.** Without any option, an error (a fixed wait, a focused test) makes the run exit with `1`.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Running it safely on code you do not know

1. A test file is data, and the tool treats it as data. Still, run it as a user with read access to the tests and nothing else; it needs no account, no key and no network.
2. Read the notes: they say what was not read and why, so a clean report is not taken for more than it is.
3. A report quotes lines of code and selectors. A line of code can hold a test account name or an internal address; keep that in mind before you post a report in a public place.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline, with `ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS, with hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
