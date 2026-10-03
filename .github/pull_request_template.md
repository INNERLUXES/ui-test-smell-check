## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a rule, a lexer or the selector reader is described in docs/method.md or docs/inputs.md, says exactly what is reported and what is not, and has a test with the code written inline, a case that must be reported and a near miss that must not
- [ ] A rule still reads tokens, never the raw text: nothing in a comment or a string is reported as code, and a selector is read from the value of a string
- [ ] A change to a quoted sentence follows the saved page: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] Every number a rule uses has a documented default and can be changed in the configuration file, and the configuration still refuses an unknown key and a repeated key
- [ ] Text from the input goes through `safeText` before it reaches a finding, a note or an error message
- [ ] The tool still runs, imports and evaluates nothing it reads, follows no symbolic link inside a folder, and opens no connection
- [ ] Work stays linear in the size of the input: no pattern with nested repetition, no loop over all tokens inside a loop over all tokens, and a hostile test with a time check
- [ ] A test that depends on the operating system (a link, a device, a file name) is guarded with `process.platform`, asserts no line or column number of its own, and builds its paths with `resolve()` from forward-slash names
- [ ] No real person, company, address or key in fixtures or examples, no date, and no number that reads like a year anywhere
- [ ] The commit messages of this pull request follow Conventional Commits
