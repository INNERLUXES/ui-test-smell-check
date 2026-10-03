# Threat model

## What the tool touches

- It reads the files named on the command line, the files of the languages it reads inside the folders named there, and the configuration file named with `--config`. Nothing outside those paths is opened.
- Inside a folder it follows no symbolic link and no junction. A path named on the command line may itself be a link, because the person who runs the tool named it.
- It does not open anything a test file names: not a module it imports, a page object it requires, a fixture path, or an address in a string. An address in a file is text.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, runs no program, and never runs, imports or evaluates the code it reads.

## What the input may hold

Test files often come from somewhere else: a pull request from a fork, a branch nobody has reviewed, or a generator of tests that a team does not control. A file under the control of an attacker can hold anything, and some tools that check test code load it to find its tests, which runs its top-level code. This tool treats every file as possibly hostile text.

A file can try to exhaust the lexer: a huge file, a string, a comment, a template literal, a text block or a regular expression that is never closed, template literals or elements of JSX nested thousands deep, brackets nested very deep, millions of tokens, a long run of `<` in a `.tsx` file so that each one starts an attempt at reading JSX, or a very long selector with nested parentheses and brackets. A folder can hold symbolic links that point outside it, at a device, or back at a parent folder in a link loop, millions of files, folders nested thousands deep, or a binary file with a test file's ending. Tens of thousands of findings of one kind can make a report huge.

A file name, a selector, a comment or a line of code can hold control and direction characters, hold markup that a Markdown table would render, or be `__proto__`. A configuration file can name a key twice, hold a key the tool does not know, or hold a glob pattern meant to make matching slow.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A test file runs when it is checked: its top-level code, an import with side effects, a postinstall script | Nothing is imported, required or evaluated; the file is lexed as text. A test puts code that would write a file at the top of a test file and checks that no file appears |
| A module or a path named in a file is opened | Imports are tokens; the tool reads only the paths it was given. A test names a secret file in an import and checks that its content is in no report |
| A symbolic link leads the tool to files outside the folder, such as a home folder | Every entry is looked at with `lstat`; a link is listed by name and never followed. A test links to a folder outside with a smelly test in it, and checks that it is not read |
| A link loop, or a link to a parent, makes the walk run for ever | Links are not followed, so there is no loop. The walk keeps its own list of folders and needs no recursion |
| Folders nested thousands deep, millions of files or thousands of paths exhaust the stack, the memory or the time | The walk is a loop with a list, and more than 32 levels, 100,000 entries, 20,000 files or 1,000 paths refuse the input with exit code `2` |
| A huge file, or many large files, exhaust memory | Only files of the languages read are opened; one over 2 MB is not read and is named; all files read may hold at most 256 MB. Other files are never opened |
| A pipe or a device named like a test file makes the tool hang | The type is looked at with `lstat` before a file is opened, and again on the open file; anything that is not a regular file is never read |
| A binary or UTF-16 file with a test file's ending is read as text | A null byte in the first 8,000 bytes, or the byte order mark of UTF-16, marks the file as not readable; it is named in a note |
| A string, a comment or a template literal that is not closed makes the lexer scan again and again | Each lexer reads once and never goes back; each search for an end runs once from where it is, and a file that ends inside one stops with the place |
| Template literals or JSX nested thousands deep overflow the stack | Nesting past 128 levels stops the reading of the file with a note |
| A long run of `<` in a `.tsx` file makes each one start an attempt at reading JSX that scans to the end | Failed attempts share a budget of four times the length of the file; past it, a `<` is only a punctuator. A test checks the time |
| Millions of tokens or comments exhaust memory | At most 1,000,000 tokens and 200,000 comments a file; past either the file is not read |
| Brackets nested very deep make a rule look at the same tokens again and again | The brackets of a file are matched once with an explicit stack, and the commas of each call are listed once, so finding the arguments of a call never scans the tokens again |
| A very long selector, or a crafted near miss, makes a pattern run for a very long time | A selector longer than 10,000 characters is not read; the selector readers walk it once, and every pattern is anchored or has bounded repeats, with no nested repetition. Tests run long near misses and check the time |
| A glob pattern in the configuration makes matching slow | The glob has no regular expression; the work of one match is at most the parts of the pattern times the parts of the path, and patterns are capped in number and length |
| A configuration names a key twice, so a rule depends on which one a reader keeps | The strict JSON reader refuses a repeated key with its line |
| A typo in the configuration leaves a rule on or off by mistake | Every unknown key is an error, with the nearest known key named |
| An ignore comment hides a finding with no explanation | A comment with no reason is not applied; the finding stays and a note says why. Every ignored finding is listed with its reason |
| Thousands of findings of one kind make the report huge | A rule lists its first 1,000 findings in file order, counts the rest in the totals and the gate, and says so in a note |
| A key or a name such as `__proto__` or `constructor` changes how objects behave | Settings are built from a fixed list, the JSON reader defines own properties, and tokens are kept in arrays; a test checks that no prototype changes |
| A name, a selector or a line of code rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators, the byte order mark and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| A selector or a line of code breaks the Markdown table in the job summary, makes a link, or hides text as an HTML tag | Pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks, `<`, `>` and `&` are escaped in every table cell |
| The argument names a URL, so the tool becomes a fetcher | Arguments that look like addresses are refused; reading from standard input is refused |

## Out of scope

Whether a finding is worth a fix, and the patterns the tool does not look for ([limits.md](limits.md)). The safety of the test runner, the browsers and the job that runs them. The correctness of the pages the tool quotes.
