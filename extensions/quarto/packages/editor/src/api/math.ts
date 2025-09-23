/*
 * math.ts
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

import { EditorState } from 'prosemirror-state';

import { EditorMath, EditorUIMath } from './ui-types';
import { PandocToken } from './pandoc';
import { markIsActive, getMarkAttrs } from './mark';

export const kMathType = 0;
export const kMathContent = 1;

// additional field we stick into the AST for quarto crossref ids
export const kMathId = 2;

export enum MathType {
  Inline = 'InlineMath',
  Display = 'DisplayMath',
}

export function editorMath(uiMath: EditorUIMath): EditorMath {
  // return a promise that will typeset this node's math (including retrying as long as is
  // required if the element is not yet connected to the DOM)
  return {
    typeset: (el: HTMLElement, math: string, priority: boolean): Promise<boolean> => {
      return new Promise(resolve => {
        // regular typeset if we are already connected
        if (el.isConnected) {
          uiMath.typeset(el, math, priority).then(resolve);
        } else {
          // otherwise wait 100ms then retry
          const timerId = window.setInterval(() => {
            if (el.isConnected) {
              clearInterval(timerId);
              uiMath.typeset(el, math, priority).then(resolve);
            }
          }, 100);
        }
      });
    },
  };
}

export function delimiterForType(type: string) {
  if (type === MathType.Inline) {
    return '$';
  } else {
    return '$$';
  }
}

export function stringifyMath(tok: PandocToken) {
  const delimter = delimiterForType(tok.c[kMathType].t);
  return delimter + tok.c[kMathContent] + delimter;
}

export function mathTypeIsActive(state: EditorState, type: MathType) {
  const schema = state.schema;
  return (
    markIsActive(state, schema.marks.math) &&
    getMarkAttrs(state.doc, state.selection, schema.marks.math).type === type
  );
}

