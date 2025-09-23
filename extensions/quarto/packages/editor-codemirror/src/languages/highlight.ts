/*
 * highlight.ts
 *
 * Copyright (C) 2022 by Emergence Engineering (ISC License)
 * https://gitlab.com/emergence-engineering/prosemirror-codemirror-block
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

import { highlightTree, Highlighter } from "@lezer/highlight";
import { Language, defaultHighlightStyle } from '@codemirror/language';

import { languageMode } from ".";
import { lines } from "core";

export type HighlightCallback = (text: string, style: string | null, from: number, to: number) => void;

export function highlightCode(
  code: string, 
  language: Language, 
  style: Highlighter,
  callback: HighlightCallback)
{
  const tree = language.parser.parse(code);
  let pos = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlightTree(tree as any, style, (from, to, classes) => {
    from > pos && callback(code.slice(pos, from), null, pos, from);
    callback(code.slice(from, to), classes, from, to);
    pos = to;
  });
  pos != tree.length && callback(code.slice(pos, tree.length), null, pos, tree.length);
}


// we explored creating lightweight standins for codemirror (with the idea that
// you'd instantiate an actual editor on demand) however load time and memory
// usage weren't substantially improved by this. leaving the code here for 
// possible future use
export function simulatedCodeMirrorEditor(lang: string, textContent: string) {

  const cmEditor = document.createElement("div");
  cmEditor.classList.add('cm-editor', 'ͼ1', 'ͼ2',  'ͼ4' , 'ͼo');
  
  const cmScroller = document.createElement("div");
  cmScroller.classList.add('cm-scroller');
  cmEditor.appendChild(cmScroller);
  
  const cmContent = document.createElement("div");
  cmContent.classList.add('cm-content');
  cmContent.spellcheck = false;
  cmContent.autocapitalize = "off";
  cmContent.translate = false;
  cmContent.style.tabSize = "4";
  cmContent.role = "textbox";
  cmContent.ariaMultiLine = "true";
  cmScroller.appendChild(cmContent);
  
  const mode = languageMode(lang);
  cmContent.innerHTML = '';
  lines(textContent).forEach(line => {
    const cmLine = document.createElement("div");
    cmLine.classList.add("cm-line");
    if (mode) {

      highlightCode(line, mode, defaultHighlightStyle, (text, style) => {
        const span = document.createElement('span');
        if (style) {
          span.classList.add(...style.split(' '));
        }
        span.innerText = text;
        cmLine.appendChild(span);
      });
    } else {
      const plainSpan = document.createElement("span");
      plainSpan.textContent = line;
      cmLine.appendChild(plainSpan);
    }
    cmContent.appendChild(cmLine)
  });
  cmContent.setAttribute("data-language", lang);

  return cmEditor;
};

   
