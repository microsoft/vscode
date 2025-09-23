/*
 * tex.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

// Get the length of valid tex content for the passed text. return values include:
//  -1: Invalid tex content (starts with \ but doesn't close braces/brackets properly)
//   0: Not tex content
//  >1: Length of valid tex string
export function texLength(text: string) {

  // if tex includes newlines it's auto-valid (could be math)
  if (text.includes('\n')) {
    return text.length;
  }
  

  let braceLevel = 0;
  let bracketLevel = 0;

  let i;
  for (i = 0; i < text.length; i++) {
    // next character
    const ch = text[i];

    // must start with \{ltr}
    if (i === 0 && ch !== '\\') {
      return 0;
    }
    if (i === 1 && !isLetter(ch)) {
      return 0;
    }

    // only letters, backslashes, and open brace/bracket allowed (unless we are in braces or brackets)
    const inBraces = braceLevel >= 1;
    const inBrackets = bracketLevel >= 1;
    if (i > 0 && ch === ' ' && text[i+1] === '\\') {
      i++; // skip the \
      continue;
    } if (i > 0 && !isLetter(ch) && ch !== '\\' && ch !== '{' && ch !== '[' && !inBraces && !inBrackets) {
      return i;
    }

    // manage brace and bracket levels
    if (ch === '{') {
      braceLevel++;
    } else if (ch === '}') {
      braceLevel--;
    } else if (ch === '[') {
      bracketLevel++;
    } else if (ch === ']') {
      bracketLevel--;
    }
  }

  if (braceLevel === 0 && bracketLevel === 0) {
    return i;
  } else {
    return -1; // invalid tex
  }
}


const LetterRegex = /[A-Za-z]/;
function isLetter(ch: string) {
  return LetterRegex.test(ch);
}
