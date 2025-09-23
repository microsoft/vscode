/*
 * spelling-realtime.ts
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

import { Schema, MarkType, ResolvedPos } from 'prosemirror-model';
import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { DecorationSet, EditorView, Decoration, DecorationAttrs } from 'prosemirror-view';
import { AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { ChangeSet } from 'prosemirror-changeset';

import { setTextSelection } from 'prosemirror-utils';

import { EditorMenuItem, EditorUISpelling } from 'editor-types';

import { FocusEvent } from '../../api/event-types';
import { PandocMark } from '../../api/mark';
import {
  EditorWordRange,
} from '../../api/spelling';
import { EditorEvents } from '../../api/event-types';
import { kAddToHistoryTransaction } from '../../api/transaction';
import { EditorUIPrefs } from '../../api/ui-types';

import { excludedMarks, getWords, spellcheckerWord, findBeginWord, findEndWord, charAt } from './spelling';
import { WordBreaker, kCharClassWord, wordBreaker } from 'core';
import { ContextMenuSource } from '../../api/menu';

const kUpdateSpellingTransaction = 'updateSpelling';
const kInvalidateSpellingWordTransaction = 'invalidateSpellingWord';
const kSpellingErrorClass = 'pm-spelling-error';

const realtimeSpellingKey = new PluginKey<DecorationSet>('spelling-realtime-plugin');

export function realtimeSpellingPlugin(
  schema: Schema,
  marks: readonly PandocMark[],
  spelling: EditorUISpelling,
  prefs: EditorUIPrefs,
  events: EditorEvents,
) {
  return new RealtimeSpellingPlugin(excludedMarks(schema, marks), spelling, prefs, events);
}

export function invalidateAllWords(view: EditorView) {
  updateSpelling(view);
}

export function invalidateWord(view: EditorView, word: string) {
  const tr = view.state.tr;
  tr.setMeta(kInvalidateSpellingWordTransaction, word);
  tr.setMeta(kAddToHistoryTransaction, false);
  view.dispatch(tr);
}

class RealtimeSpellingPlugin extends Plugin<DecorationSet> {
  // track whether we've ever had the focus (don't do any spelling operations until then)
  private hasBeenFocused = true;

  private view: EditorView | null = null;
  private readonly prefs: EditorUIPrefs;
  public static readonly wb = wordBreaker();

  constructor(excluded: MarkType[], spelling: EditorUISpelling, prefs: EditorUIPrefs, events: EditorEvents) {    
    super({
      key: realtimeSpellingKey,
      view: (view: EditorView) => {
        this.view = view;
        return {};
      },
      state: {
        init: () => {
          return DecorationSet.empty;
        },
        apply: (tr: Transaction, old: DecorationSet, oldState: EditorState, newState: EditorState) => {
          // if we somehow manage to get focus w/o our FocusEvent (below) being called then also
          // flip the hasBeenFocused bit here
          if (this.view?.hasFocus()) {
            this.hasBeenFocused = true;
          }

          // don't continue if either realtime spelling is disabled or we have never been focused
          if (!this.prefs.realtimeSpelling() || !this.hasBeenFocused) {
            return DecorationSet.empty;
          }

          // alias wordbreaker
          const wb = RealtimeSpellingPlugin.wb;

          if (tr.getMeta(kUpdateSpellingTransaction)) {
            // explicit update request invalidates any existing decorations (this can happen when
            // we get focus for the very first time or when the main or secondary dictionaries change)
            return DecorationSet.create(newState.doc, spellingDecorations(newState, wb, spelling, excluded));
          } else if (tr.getMeta(kInvalidateSpellingWordTransaction)) {
            // for word invalidations we search through the decorations and remove words that match
            const word = tr.getMeta(kInvalidateSpellingWordTransaction) as string;

            // find decorations that have this word and remove them
            const wordDecos = old.find(undefined, undefined, spec => spec.word === word);

            // return decorators w/ those words removed
            return old.remove(wordDecos);
          } else if (tr.docChanged) {
            // perform an incremental update of spelling decorations (invalidate and re-scan
            // for decorations in changed ranges)

            // start w/ previous state
            let decos = old;

            // create change set from transaction
            let changeSet = ChangeSet.create(oldState.doc);
            changeSet = changeSet.addSteps(newState.doc, tr.mapping.maps, {});

            // collect ranges that had mark changes
            const markRanges: Array<{ from: number; to: number }> = [];
            for (const step of tr.steps) {
              if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
                markRanges.push({ from: step.from, to: step.to });
              }
            }

            // remove ranges = mark ranges + deleted ranges
            const removeRanges = markRanges.concat(
              changeSet.changes.map(change => ({ from: change.fromA, to: change.toA })),
            );

            // remove decorations from deleted ranges (expanding ranges to word boundaries)
            for (const range of removeRanges) {
              const fromPos = findBeginWord(oldState, range.from, wb.classifyCharacter);
              const toPos = findEndWord(oldState, range.to, wb.classifyCharacter);
              decos = decos.remove(decos.find(fromPos, toPos));
            }

            // map decoration positions to new document
            decos = decos.map(tr.mapping, tr.doc);

            // add ranges = mark ranges + inserted ranges
            const addRanges = markRanges.concat(
              changeSet.changes.map(change => ({ from: change.fromB, to: change.toB })),
            );

            // scan inserted ranges for spelling decorations (don't need to find word boundaries
            // b/c spellingDecorations already does that)
            for (const range of addRanges) {
              decos = decos.add(
                tr.doc,
                // As part of rstudio moving away from typo this line of code was changed to the following:
                //
                // spellingDecorations(newState, wb, ui.spelling, excluded, false, range.from - 1, range.to)
                //
                // Relevant commits are here:
                //  - https://github.com/rstudio/rstudio/commit/cee6c3e8181d3020b5a2eed8d1e1562caad9e8c5
                //  - https://github.com/rstudio/rstudio/pull/9161
                // 
                // I am not sure why the range.from - 1 was changed, and the flipping of true -> false
                // for excludeCursor makes truly realtime implementations show the currently edited
                // word as misspelled (rstudio evades this by doing async checks). I had to revert to the
                // previous behavior in order to get the library running against Typo in the browser
                // to work correctly.
                // 
                spellingDecorations(newState, wb, spelling, excluded, true, range.from, range.to)
              );
            }

            // return decorators
            return decos;
          } else if (tr.selectionSet) {
            // if we had previously suppressed a decoration due to typing at the cursor, restore it
            // whenever the selection changes w/o the doc changing

            // start with previous state
            let decos = old;

            // find any special 'at cursor' errors
            const cursorDecos = decos.find(undefined, undefined, spec => !!spec.cursor);
            if (cursorDecos.length) {
              // there will only be one cursor, capture it's position then remove it
              const word = cursorDecos[0].spec.word as string;
              const { from, to } = cursorDecos[0];
              decos = decos.remove(cursorDecos);

              // add it back in as a real spelling error
              decos = decos.add(tr.doc, [Decoration.inline(from, to, { class: kSpellingErrorClass }, { word })]);
            }

            // return decorators
            return decos;
          } else {
            // no content or selection change, return old w/o mapping
            return old;
          }
        },
      },
      props: {
        decorations: (state: EditorState) => {
          return realtimeSpellingKey.getState(state);
        }
      },
    });

    // save reference to prefs
    this.prefs = prefs;

    // trigger update on first focus
    const focusUnsubscribe = events.subscribe(FocusEvent, () => {
      if (this.view) {
        focusUnsubscribe();
        this.hasBeenFocused = true;

        // delayed update callback (checks for still connected)
        const v = this.view;
        const doUpdate = () => {
          if (v.dom?.isConnected) {
            updateSpelling(v);
          }
        };

        // update (bounced out of focus event tick so that it doesn't
        // interfere with normal editor focus management)
        setTimeout(doUpdate, 100);

        // call a second time as no words will be cached initially, this simplifies the
        // need for threading a callback through the entire plugin system
        setTimeout(doUpdate, 5000);
      }
    });
  }
}

function spellingDecorations(
  state: EditorState,
  wb: WordBreaker,
  spelling: EditorUISpelling,
  excluded: MarkType[],
  excludeCursor = false,
  from = -1,
  to = -1,
): Decoration[] {

  // a map of wordText -> [wordRange...]
  const rangeMap = new Map<string, EditorWordRange[]>();

  // break words
  const words = getWords(state, from, to, wb, excluded);

  // spell check and return decorations for misspellings
  const decorations: Decoration[] = [];

  // words to pass to the spellchecker
  const wordsToCheck: string[] = [];

  while (words.hasNext()) {
    const word = words.next()!;
    const wordText = state.doc.textBetween(word.start, word.end);

    const ranges = rangeMap.get(wordText) || [];
    ranges.push(word);
    rangeMap.set(wordText, ranges);

    wordsToCheck.push(spellcheckerWord(wordText));
  }

  const incorrectWords: string[] = spelling.checkWords(wordsToCheck);

  for (const incorrectWord of incorrectWords) {
    const ranges: EditorWordRange[] | undefined = rangeMap.get(incorrectWord);

    if (ranges) {
      for (const range of ranges) {
        const attrs: DecorationAttrs = {};
        const spec: Record<string,unknown> = {
          word: incorrectWord,
        };
        if (excludeCursor && state.selection.head > range.start && state.selection.head <= range.end) {
          spec.cursor = true;
        } else {
          attrs.class = kSpellingErrorClass;
        }
        decorations.push(Decoration.inline(range.start, range.end, attrs, spec));
      }
    }
  }

  return decorations;
}


export function spellingContextMenuHandler(spelling: EditorUISpelling, t: (text: string) => string) {
  
  return (view: EditorView, $pos: ResolvedPos) : (ContextMenuSource | null)  => {

    // word breaker
    const wb = RealtimeSpellingPlugin.wb;

    // helper to create a menu action
    const menuAction = (text: string, action: VoidFunction) => {
      return {
        text,
        exec: () => {
          action();
          view.focus();
        },
      };
    };

    // alias schema
    const schema = view.state.schema;

    // find the spelling decoration at this position (if any)
    const deco = realtimeSpellingKey.getState(view.state)!.find($pos.pos, $pos.pos);
    if (deco.length) {
      return { items: () => new Promise<EditorMenuItem[]>(resolve => {

        const { from, to } = deco[0];
        const word = spellcheckerWord(view.state.doc.textBetween(from, to));
        const kMaxSuggetions = 5;
        const menuItems: EditorMenuItem[] = [];
        spelling.suggestionList(word, (suggestions: string[]): void => {
          // create menu w/ suggestions
          menuItems.push(...suggestions.slice(0, kMaxSuggetions).map(suggestion => {
            return {
              text: suggestion,
              exec: () => {
                const tr = view.state.tr;
                tr.setSelection(TextSelection.create(tr.doc, from, to));
                const marks = tr.selection.$from.marks();
                tr.replaceSelectionWith(schema.text(suggestion, marks), false);
                setTextSelection(from + suggestion.length)(tr);
                view.dispatch(tr);
                view.focus();
              },
            };
          }));
          if (menuItems.length) {
            menuItems.push({ separator: true });
          }
  
          menuItems.push(menuAction(t('Ignore All'), () => spelling.ignoreWord(word)));
          menuItems.push({ separator: true });
          menuItems.push(
            menuAction(t('Add to Dictionary'), () => spelling.addToDictionary(word)),
          );

          resolve(menuItems);
        });
      })};
    } 

    // find the word at this position and see if it's ignored. if so provide an unignore context menu
    const classify = wb.classifyCharacter;
    const ch = charAt(view.state.doc, $pos.pos);
    if (classify(ch) === kCharClassWord) {
      const from = findBeginWord(view.state, $pos.pos, classify);
      const to = findEndWord(view.state, $pos.pos, classify);
      const word = spellcheckerWord(view.state.doc.textBetween(from, to));
      if (spelling.isWordIgnored(word)) {
        return { items: async () => [
          menuAction(`${t('Unignore')} '${word}'`, () => spelling.unignoreWord(word)),
        ]};
      }
    }

    return null;
  }
}


function updateSpelling(view: EditorView) {
  const tr = view.state.tr;
  tr.setMeta(kUpdateSpellingTransaction, true);
  tr.setMeta(kAddToHistoryTransaction, false);
  view.dispatch(tr);
}
