// The shared part of the three lexers. A lexer reads the text of one file once, from left to right, and returns its
// tokens and its comments. Strings, template literals, regular expression literals and comments are read as what they
// are, so a rule that looks at the tokens never fires inside a comment or a string, and a selector is always read from
// the value of a string. Nothing is run, imported or evaluated: the file is text.

import { lexJs } from './lexjs.js';
import { lexPython } from './lexpy.js';
import { lexJava } from './lexjava.js';
import { LexError, LEX_LIMITS } from './lexbase.js';

export { LexError, LEX_LIMITS };

// The tokens and comments of one file in its language. Throws LexError with the offset of the problem.
export function lex(text, language, { jsx = false, limits = LEX_LIMITS } = {}) {
  const lim = { ...LEX_LIMITS, ...limits };
  if (language === 'javascript' || language === 'typescript') return lexJs(text, { jsx, limits: lim });
  if (language === 'python') return lexPython(text, { limits: lim });
  if (language === 'java') return lexJava(text, { limits: lim });
  throw new LexError(`the language ${String(language).slice(0, 20)} is not read`, 0);
}
