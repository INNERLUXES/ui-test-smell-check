# Inputs

The tool takes files and folders of UI tests, and optionally a configuration file. It reads the files as text with its own lexers. It never runs a test, never imports, requires or evaluates a file, never fetches anything a file names, and never reads from standard input. A path named on the command line may itself be a symbolic link, because the person who runs the tool named it; inside a folder, no link is followed.

## The files

- A folder is walked with its subfolders. Every file whose ending names a language the tool reads is read: `.js`, `.mjs`, `.cjs`, `.jsx` (JavaScript), `.ts`, `.mts`, `.cts`, `.tsx` (TypeScript), `.py` (Python) and `.java` (Java), in any case. Other files are counted and never opened.
- A file named on the command line must have one of those endings; any other is refused with exit code `2`.
- Folders of tools and packages are not entered: `.git`, `.hg`, `.svn`, `node_modules` and `.cache`. A note names the ones it met.
- Every entry inside a folder is looked at with `lstat`. A symbolic link (or a Windows junction) is listed by its name and never followed, whether it points to a file, a folder, a device or back to a parent; a note lists every link. An entry that is neither a file, a folder nor a link is listed in a note and never opened.
- At most 1,000 paths, 100,000 files and folders in all, folders nested at most 32 deep, and 20,000 files to read. Past any limit the input is refused with exit code `2`, rather than read in part. `limits.maxFiles` and `limits.maxDepth` in the configuration change two of them.
- Each file is opened once, and its type and size are taken from the open file. A file over 2 MB (`limits.maxFileBytes`) is not read and is named in a note; all files read together may hold at most 256 MB, or the input is refused.
- A file that starts with the byte order mark of UTF-16 is not read, and neither is a file whose first 8,000 bytes hold a null byte; a note names them. Text is read as UTF-8, and a leading byte order mark is dropped.
- Paths in the report are relative to the folder the command runs in, with forward slashes on every system; a path outside that folder is shown in full.

A file the tool reads but whose imports show no Playwright, Cypress or Selenium is read and not checked, and a note names it. docs/method.md says how the frameworks are found.

## The lexers

A lexer reads the text of one file once, from left to right, and turns it into tokens and comments. The rules look at the tokens only.

### JavaScript and TypeScript

- Comments: `//` to the end of the line, `/* ... */`, and a `#!` line at the very start.
- Strings in single and double quotes, with their escapes read: `\n`, `\t`, `\xHH`, `\uHHHH`, `\u{H...}`, a backslash before a line end, and any other character for itself. A string that is not closed before the end of its line stops the reading of the file.
- Template literals: the static parts are read as strings with their escapes, and the code inside each `${...}` is read as code, as deep as it is nested (at most 128 levels of template literals and JSX). So `${page.waitForTimeout(500)}` in a template is a call, and the text around it is not.
- Regular expression literals, with their classes and escapes, so a quote or a `//` inside `/['"]/` or `/https?:\/\//` is part of the expression. Whether a `/` starts a regular expression or is a division is decided by the token before it, as most tools that read JavaScript without parsing it do: after a name that is not a keyword such as `return` or `typeof`, a number, a string, a template literal, a regular expression, a `)`, a `]`, `++` or `--`, it is a division; anywhere else, including after `}`, it starts a regular expression. That rule is wrong in two rare cases: an object literal divided by something (`{} / 2`) and a regular expression right after the `)` of an `if (...)` or a `while (...)` with no braces. Then a line may be read wrongly, or the file may stop with a reason.
- In `.jsx` and `.tsx` files, the elements of JSX: a `<` where an expression starts, followed by a name or `>`, opens an element, whose text is not code and whose `{...}` are read as code. When the text there is not an element after all (a generic arrow function such as `<T,>(x: T) => x`), the `<` is read as a punctuator. Failed attempts at reading an element may look at most four times the length of the file in all; past that, a `<` is only a punctuator.
- Numbers (decimal, hexadecimal, octal, binary, with `_` and the `n` of a big integer), names (any Unicode letter, `$` and `_`, and `#private` names) and punctuators.

### Python

- Comments: `#` to the end of the line.
- Strings in single, double and triple quotes, with the prefixes `r`, `b`, `u`, `f`, `t` and their pairs in any case. Escapes are read unless the string is raw; an unknown escape keeps its backslash, as Python does. The code inside the braces of an f-string is not read as code: an f-string is one string.
- A backslash at the end of a line joins the lines. The indentation of a line is the column of its first token; the rules use it to find the function a `global` statement is in.
- Numbers (with `_` and the `j` of a complex number), names and punctuators.

### Java

- Comments: `//` and `/* ... */`.
- Text blocks (`"""`), strings and character literals with their escapes.
- Numbers with their suffixes (`L`, `F`, `D`) and `_`, names, annotations (an `@` and a name) and punctuators.

### When a file cannot be lexed

A string, a comment, a template literal, a text block or a regular expression that is not closed, a character the language does not allow outside a string, more than 1,000,000 tokens, more than 200,000 comments, or nesting past 128 levels stops the reading of that file. The file is named in a note with the line and column of the problem, and its findings are not reported. It does not fail the run by itself.

LF, CRLF and a lone CR all end a line, so a file written on Windows and the same file written on Linux give the same findings with the same lines and columns.

## The configuration file

`--config <file>` names a JSON file. It is read with the tool's own strict JSON reader: no comments, no trailing comma, and an object that names a key twice is refused, because RFC 8259 says "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." Every key the tool does not know is an error with its line, and a near miss is named ("did you mean fixed-wait?"). A configuration with an error stops the run with exit code `2`. The file is at most 1 MB.

```json
{
  "failOn": "error",
  "rules": {
    "nth-locator": "warning",
    "absolute-url": "off",
    "fixed-wait": { "severity": "error", "minMs": 100 },
    "styling-selector": { "hashMinLength": 6 }
  },
  "ignore": ["tests/legacy/**", "**/*.fixtures.ts"],
  "limits": { "maxFileBytes": 4194304, "maxFiles": 50000, "maxDepth": 40 }
}
```

| Key | Value | Default |
| --- | --- | --- |
| `failOn` | `error`, `warning` or `info`: the lowest severity that fails the run; `--fail-on` wins over it | `error` |
| `rules.<id>` | `off`, a severity, or an object with `severity` (a severity or `off`) and the options of the rule | every rule on, at its own severity |
| `rules.fixed-wait.minMs` | a whole number of milliseconds from 0 to 86,400,000: a wait shorter than this is not reported | `0` |
| `rules.styling-selector.hashMinLength` | a whole number from 3 to 64: the shortest hash in a class name that counts as made by a build tool | `5` |
| `ignore` | up to 100 file patterns; a file whose shown path matches one is not read, and a note counts them | none |
| `limits.maxFileBytes` | a whole number from 1,024 to 67,108,864 | 2,097,152 (2 MB) |
| `limits.maxFiles` | a whole number from 1 to 1,000,000 | 20,000 |
| `limits.maxDepth` | a whole number from 1 to 256: how deep folders may be nested | 32 |

The patterns of `ignore` are matched against the path of a file as the report shows it, relative to the folder the command runs in, with forward slashes. They have three wildcards: `*` is any run of characters inside one part of the path, `?` is one character, and a part that is exactly `**` is any number of parts. A pattern is at most 200 characters with at most 16 parts, has no backslash and does not start with a slash.

## Ignore comments

A comment turns one or more rules off for one line, and only with a reason:

```ts
// ui-test-smell-check-ignore fixed-wait -- the panel slides in with a CSS transition that fires no event
await page.waitForTimeout(300);

await page.locator('.legacy-grid').click(); // ui-test-smell-check-ignore styling-selector, nth-locator -- vendor grid with no test ids
```

```python
time.sleep(1)  # ui-test-smell-check-ignore fixed-wait -- the mail stub polls once a second
```

- The comment starts with `ui-test-smell-check-ignore`, then the rule ids separated by commas, then ` -- ` and the reason. The reason must hold at least one letter.
- A comment alone on its line applies to the next line with code; a comment after code applies to that line. A block comment works the same way.
- A finding on that line of one of those rules is not counted. It is listed apart with the reason, in every format.
- A comment with no rule, a rule the tool does not have, or no reason is not applied, and a note says why; the finding stays. A comment that ignored nothing is named in a note.
