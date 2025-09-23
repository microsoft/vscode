/*
 * find.ts
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

import { Extension } from '../api/extension';
import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { DecorationSet, Decoration, EditorView } from 'prosemirror-view';

import { mergedTextNodes } from '../api/text';
import { isEffectTransaction, kAddToHistoryTransaction } from '../api/transaction';
import { editingRootNode } from '../api/node';
import zenscroll from 'zenscroll';
import { editorScrollContainer } from '../api/scroll';

const key = new PluginKey<DecorationSet>('find-plugin');

class FindPlugin extends Plugin<DecorationSet> {
  private term = '';
  private options: FindOptions = {};
  private updating = false;

  // The HTML element containing the last known selected search result
  private resultElement: HTMLElement|null = null;

  // A DOM mutation observer that watches for search results to be rendered
  private resultObserver: MutationObserver|null = null;

  // The ID for a timer that ensures the resultObserver completes quickly
  private resultObserverTimer = 0;

  constructor() {
    super({
      key,
      state: {
        init: () => {
          return DecorationSet.empty;
        },
        apply: (tr: Transaction) => {
          if (this.updating || isEffectTransaction(tr)) {
            return this.resultDecorations(tr);
          } else {
            return DecorationSet.empty;
          }
        },
      },
      view: () => ({
        update: (view: EditorView) => {
          // Clear any previous search result observer
          this.clearResultObserver();

          // If there is a search result selected, navigate to it
          if (this.isResultSelected(view.state)) {
            this.scrollToSelectedResult(view, null);
          }
        },
      }),
      props: {
        decorations: (state: EditorState) => {
          return key.getState(state);
        },
      },
    });
  }

  public find(term: string, options: FindOptions) {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      if (dispatch) {
        this.term = !options.regex ? term.replace(/[-/\\^$*+?.()|[\]{}]/g, (escape: string) => {
          return '\\u' + ('0000' + escape.charCodeAt(0).toString(16)).slice(-4);
        }) : term;
        this.options = options;
        this.updateResults(state, dispatch);
      }
      return true;
    };
  }

  public matchCount(state: EditorState) {
    return key.getState(state)!.find().length;
  }

  public selectFirst() {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      const decorations: Decoration[] = key.getState(state)!.find(0);
      if (decorations.length === 0) {
        return false;
      }

      if (dispatch) {
        const tr = state.tr;
        this.selectResult(tr, decorations[0]);
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }

      return true;
    };
  }

  public selectCurrent() {
    return this.selectNext(false);
  }

  public selectNext(afterSelection = true) {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      const searchFrom = afterSelection
        ? this.matchesTerm(selectedText)
          ? state.selection.to + 1
          : state.selection.to
        : state.selection.from;

      const decorationSet = key.getState(state)!;
      let decorations: Decoration[] = decorationSet.find(searchFrom);
      if (decorations.length === 0) {
        // check for wrapping
        if (this.options.wrap) {
          const searchTo = this.matchesTerm(selectedText) ? state.selection.from - 1 : state.selection.from;
          decorations = decorationSet.find(0, searchTo);
          if (decorations.length === 0) {
            return false;
          }
          // no wrapping
        } else {
          return false;
        }
      }

      if (dispatch) {
        const tr = state.tr;
        this.selectResult(tr, decorations[0]);
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }
      return true;
    };
  }

  public selectPrevious() {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      // sort out where we are searching up to
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      const searchTo = this.matchesTerm(selectedText) ? state.selection.from - 1 : state.selection.from;

      // get all decorations up to the current selection
      const decorationSet = key.getState(state)!;
      let decorations: Decoration[] = decorationSet.find(0, searchTo);
      if (decorations.length === 0) {
        // handle wrapping
        if (this.options.wrap) {
          const searchFrom = this.matchesTerm(selectedText) ? state.selection.to + 1 : state.selection.to;
          decorations = decorationSet.find(searchFrom);
          if (decorations.length === 0) {
            return false;
          }
          // no wrapping
        } else {
          return false;
        }
      }

      // find the one closest to the beginning of the current selection
      if (dispatch) {
        // now we need to find the decoration with the largest from value
        const decoration = decorations.reduce((lastDecoration, nextDecoration) => {
          if (nextDecoration.from > lastDecoration.from) {
            return nextDecoration;
          } else {
            return lastDecoration;
          }
        });

        const tr = state.tr;
        this.selectResult(tr, decoration);
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }
      return true;
    };
  }

  public replace(text: string) {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      if (!this.isResultSelected(state)) {
        return false;
      }

      if (dispatch) {
        const tr = state.tr;
        const selectionMarks = tr.selection.$from.marksAcross(tr.selection.$to);
        if (text.length > 0) {
          tr.replaceSelectionWith(state.schema.text(text, selectionMarks), false);
        } else {
          tr.deleteSelection();
        }
       
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }

      return true;
    };
  }

  public replaceAll(text: string) {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      
      let replaced = 0;

      if (!this.hasTerm()) {
        return replaced;
      }

      if (dispatch) {
        const tr = state.tr;

        const decorationSet = key.getState(state)!;

        const decorations: Decoration[] = decorationSet.find(0);
        decorations.forEach(decoration => {
          const from = tr.mapping.map(decoration.from);
          const to = tr.mapping.map(decoration.to);
          tr.insertText(text, from, to);
          replaced += 1;
        });
        this.withResultUpdates(() => {
          dispatch(tr);
        });
      }

      return replaced;
    };
  }

  public clear() {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      if (dispatch) {
        this.term = '';
        this.options = {};
        this.updateResults(state, dispatch);
      }
      return true;
    };
  }

  private updateResults(state: EditorState, dispatch: (tr: Transaction) => void) {
    this.withResultUpdates(() => {
      const tr = state.tr;
      tr.setMeta(kAddToHistoryTransaction, false);
      dispatch(tr);
    });
  }

  private resultDecorations(tr: Transaction): DecorationSet {
    // bail if no search term
    if (!this.hasTerm()) {
      return DecorationSet.empty;
    }

    // decorations to return
    const decorations: Decoration[] = [];

    // merge text nodes
    const textNodes = mergedTextNodes(tr.doc);

    textNodes.forEach(textNode => {
      const search = this.findRegEx();
      if (!search) {
        return;
      }

      let m;
      // tslint:disable-next-line no-conditional-assignment
      while ((m = search.exec(textNode.text))) {
        if (m[0] === '') {
          break;
        }
        const from = textNode.pos + m.index;
        const to = textNode.pos + m.index + m[0].length;
        const classes = ['pm-find-text'];
        if (from === tr.selection.from && to === tr.selection.to) {
          classes.push('pm-selected-text');
        }
        decorations.push(Decoration.inline(from, to, { class: classes.join(' ') }));
      }
    });

    // return as decoration set
    return decorations.length ? DecorationSet.create(tr.doc, decorations) : DecorationSet.empty;
  }

  private withResultUpdates(f: () => void) {
    this.updating = true;
    f();
    this.updating = false;
  }

  private selectResult(tr: Transaction, decoration: Decoration) {
    const selection = new TextSelection(tr.doc.resolve(decoration.from), tr.doc.resolve(decoration.to));
    return tr.setSelection(selection).scrollIntoView();
  }

  private isResultSelected(state: EditorState) {
    if (this.hasTerm()) {
      const selectedText = state.doc.textBetween(state.selection.from, state.selection.to);
      return this.matchesTerm(selectedText);
    } else {
      return false;
    }
  }

  /**
   * Watch for a search result to appear in the DOM. When it does, scroll it
   * into view.
   * 
   * @param view The current EditorView 
   */
  private watchForSelectedResult(view: EditorView) {
    // Clear any previous result observer
    this.clearResultObserver();

    // Create a new result observer to watch for results to be rendered
    this.resultObserver = new MutationObserver((records: MutationRecord[]) => {
      let resultElement:HTMLElement|null = null;

      // Predicate for testing a node to see if it looks like the active search result
      const isResultNode = (node: Node): boolean => {
        if (node.nodeType !== node.ELEMENT_NODE) {
          return false;
        }
        const ele = node as HTMLElement;
        return ele.classList.contains('pm-find-text') && 
               ele.classList.contains('pm-selected-text');
      };

      // Examine each mutation record to see if it's the one we're looking for
      records.forEach((mutation) => {
        switch(mutation.type) {
          case 'childList':
            // Case 1: a new search result node was added to the DOM
            mutation.addedNodes.forEach((node) => {
              if (isResultNode(node)) {
                resultElement = node as HTMLElement;
              }
            });
            break;
          case 'attributes':
            // Case 2: an existing node gained a "class" attribute and is now an
            // active search result
            if (isResultNode(mutation.target)) {
              resultElement = mutation.target as HTMLElement;
            }
            break;
        }
      });

      // If we found a result element, scroll it into view and turn off the DOM
      // observer. (If we didn't find one, it may be an irrelevant DOM mutation,
      // so ignore it.)
      if (resultElement) {
        this.scrollToSelectedResult(view, resultElement);
        this.clearResultObserver();
      }
    });

    const editingRoot = editingRootNode(view.state.selection);
    if (editingRoot) {
      const container = view.nodeDOM(editingRoot.pos) as HTMLElement;

      // Begin observing the editing surface for DOM mutations
      this.resultObserver.observe(container, {
        subtree: true,
        childList: true,
        attributeFilter: ['class']  // Only interested in changes to the "class" attribute
      });

      // The search results should appear quickly (we're really just waiting for
      // a render loop). If the observer runs for longer than 1s, just cancel
      // it, as it consumes resources and anything observed is likely to be
      // spurious.
      this.resultObserverTimer = window.setTimeout(() => {
        this.clearResultObserver();
      }, 1000);
    }
  }

  /**
   * Cleans all state related to the search result DOM observer
   */
  private clearResultObserver() {
    // Disconnect the result observer if running
    if (this.resultObserver !== null) {
      this.resultObserver.disconnect();
      this.resultObserver = null;
    }

    // Remove the result observer timer if running
    if (this.resultObserverTimer !== 0) {
      window.clearTimeout(this.resultObserverTimer);
      this.resultObserverTimer = 0;
    }
  }

  /**
   * Scrolls the selected search result into view.
   * 
   * @param view The EditorView on which to act
   * @param resultElement The HTML element containing the search result, if known
   */
  private scrollToSelectedResult(view: EditorView, resultElement: HTMLElement|null) {
    const editingRoot = editingRootNode(view.state.selection);
    if (editingRoot) {
      const container = view.nodeDOM(editingRoot.pos) as HTMLElement;

      if (resultElement === null) {
        // Attempt to find a result element to scroll to if we weren't given one
        resultElement = container.querySelector(".pm-find-text.pm-selected-text");
      }

      if (resultElement === null || resultElement === this.resultElement) {
        // If we didn't find a result element, or if we found a stale one
        // (hasn't changed), defer scrolling until it has been rendered. This is
        // most common when the search result is inside an Ace editor chunk,
        // which puts the result in the DOM on a deferred render loop.
        this.watchForSelectedResult(view);
        return;
      } 

      this.resultElement = resultElement;

      // Starting offset for scroll position 
      let offset = 100;

      // Zenscroll can only scroll to a direct child element of the scroll
      // container, but the element containing the search result may be deeply
      // nested in the container. Walk up the DOM tree, summing the offsets,
      // until we get to an element that's actually a child of the scroll
      // container. 
      let scrollElement = resultElement;
      while (scrollElement.offsetParent?.parentElement !== container) {
        offset += scrollElement.offsetTop;
        const nextParent = scrollElement.offsetParent;
        if (nextParent === null) {
          break;
        } 
        scrollElement = nextParent as HTMLElement;
      }

      // Perform the scroll to the element's container plus its offset inside
      // the container.
      const scroller = zenscroll.createScroller(editorScrollContainer(container));
      scroller.center(scrollElement, 350, offset);
    }
  }

  private hasTerm() {
    return this.term.length > 0;
  }

  private matchesTerm(text: string) {
    if (this.hasTerm()) {
      const regex = this.findRegEx();
      if (regex) {
        return regex.test(text);
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  private findRegEx() {
    try {
      return new RegExp(this.term, !this.options.caseSensitive ? 'gui' : 'gu');
    } catch {
      return null;
    }
  }
}

const extension: Extension = {
  plugins: () => {
    return [new FindPlugin()];
  },
};

export interface FindOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wrap?: boolean;
}

export function find(view: EditorView, term: string, options: FindOptions): boolean {
  return findPlugin(view).find(term, options)(view.state, view.dispatch);
}

export function matchCount(view: EditorView): number {
  return findPlugin(view).matchCount(view.state);
}

export function selectFirst(view: EditorView): boolean {
  return findPlugin(view).selectFirst()(view.state, view.dispatch);
}

export function selectCurrent(view: EditorView): boolean {
  return findPlugin(view).selectCurrent()(view.state, view.dispatch);
}

export function selectNext(view: EditorView): boolean {
  return findPlugin(view).selectNext()(view.state, view.dispatch);
}

export function selectPrevious(view: EditorView): boolean {
  return findPlugin(view).selectPrevious()(view.state, view.dispatch);
}

export function replace(view: EditorView, text: string): boolean {
  return findPlugin(view).replace(text)(view.state, view.dispatch);
}

export function replaceAll(view: EditorView, text: string) {
  return findPlugin(view).replaceAll(text)(view.state, view.dispatch);
}

export function clear(view: EditorView): boolean {
  return findPlugin(view).clear()(view.state, view.dispatch);
}

export function findPluginState(state: EditorState): DecorationSet | null | undefined {
  return key.getState(state);
}

function findPlugin(view: EditorView): FindPlugin {
  return key.get(view.state) as FindPlugin;
}

export default extension;
