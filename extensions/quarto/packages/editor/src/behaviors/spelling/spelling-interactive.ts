/*
 * spelling-doc.ts
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

import { EditorView, DecorationSet, Decoration } from 'prosemirror-view';
import { TextSelection, Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';

import { setTextSelection } from 'prosemirror-utils';

import { wordBreaker } from 'core';

import { PandocMark } from '../../api/mark';
import {
  EditorWordRange,
  EditorSpellingDoc,
  EditorWordSource,
  EditorAnchor,
  EditorRect,
} from '../../api/spelling';
import { scrollIntoView } from '../../api/scroll';

import { excludedMarks, getWords, spellcheckerWord } from './spelling';

// get the document interface required by interactive spellchecking

export function getSpellingDoc(
  view: EditorView,
  marks: readonly PandocMark[]
): EditorSpellingDoc {
  // alias schema
  const schema = view.state.schema;

  // initialize marks we don't want to check
  const excluded = excludedMarks(schema, marks);

  // create word breaker
  const wb = wordBreaker();

  // check begin
  spellingDocPlugin(view.state).onCheckBegin();

  return {
    getWords: (start: number, end: number): EditorWordSource => {
      return getWords(view.state, start, end, wb, excluded);
    },

    createAnchor: (pos: number): EditorAnchor => {
      return spellingDocPlugin(view.state).createAnchor(pos);
    },

    shouldCheck: (): boolean => {
      return true;
    },

    setSelection: (wordRange: EditorWordRange) => {
      const tr = view.state.tr;
      tr.setSelection(TextSelection.create(tr.doc, wordRange.start, wordRange.end));
      view.dispatch(tr);
    },

    getText: (wordRange: EditorWordRange): string => {
      const word = view.state.doc.textBetween(wordRange.start, wordRange.end);
      return spellcheckerWord(word);
    },

    replaceSelection: (text: string) => {
      const tr = view.state.tr;
      const selectionMarks = tr.selection.$from.marks();
      tr.replaceSelectionWith(view.state.schema.text(text, selectionMarks), false);
      view.dispatch(tr);
    },

    getCursorPosition: (): number => {
      return view.state.selection.to;
    },

    getSelectionStart: (): number => {
      return view.state.selection.from;
    },

    getSelectionEnd: (): number => {
      return view.state.selection.to;
    },

    getCursorBounds: (): EditorRect => {
      const fromCoords = view.coordsAtPos(view.state.selection.from);
      const toCoords = view.coordsAtPos(view.state.selection.to);

      return {
        x: Math.min(fromCoords.left, toCoords.left),
        y: fromCoords.top,
        width: Math.abs(fromCoords.left - toCoords.left),
        height: toCoords.bottom - fromCoords.top,
      };
    },

    moveCursorNearTop: () => {
      scrollIntoView(view, view.state.selection.from, false, undefined, 100);
    },

    dispose: () => {
      spellingDocPlugin(view.state).onCheckEnd(view);
    },
  };
}

// companion plugin for SpellingDoc provided above (shows 'fake' selection during
// interactive spell check dialog and maintains anchor position(s) across
// transactions that occur while the dialog/doc is active)

const spellingDocKey = new PluginKey<DecorationSet>('spelling-doc-plugin');

function spellingDocPlugin(state: EditorState) {
  return spellingDocKey.get(state) as SpellingDocPlugin;
}

export class SpellingDocPlugin extends Plugin<DecorationSet> {
  private checking = false;
  private anchors: SpellingAnchor[] = [];

  constructor() {
    super({
      key: spellingDocKey,
      state: {
        init: () => {
          return DecorationSet.empty;
        },
        apply: (tr: Transaction) => {
          if (this.checking) {
            // map anchors
            this.anchors.forEach(anchor => {
              anchor.setPosition(tr.mapping.map(anchor.getPosition()));
            });

            // show selection
            if (!tr.selection.empty) {
              return DecorationSet.create(tr.doc, [
                Decoration.inline(tr.selection.from, tr.selection.to, { class: 'pm-selected-text' }),
              ]);
            }
          }

          return DecorationSet.empty;
        },
      },
      props: {
        decorations: (state: EditorState) => {
          return spellingDocKey.getState(state);
        },
      },
    });
  }

  public createAnchor(pos: number) {
    const anchor = new SpellingAnchor(pos);
    this.anchors.push(anchor);
    return anchor;
  }

  public onCheckBegin() {
    this.checking = true;
  }

  public onCheckEnd(view: EditorView) {
    this.checking = false;
    this.anchors = [];

    if (!view.state.selection.empty) {
      const tr = view.state.tr;
      setTextSelection(tr.selection.to)(tr);
      view.dispatch(tr);
    }
  }
}

class SpellingAnchor implements EditorAnchor {
  private pos = 0;
  constructor(pos: number) {
    this.pos = pos;
  }
  public getPosition() {
    return this.pos;
  }
  public setPosition(pos: number) {
    this.pos = pos;
  }
}

const extension = () => {
  return {
    plugins: () => {
      return [new SpellingDocPlugin()];
    },
  };
};

export default extension;
