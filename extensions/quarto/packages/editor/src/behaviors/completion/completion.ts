/*
 * completion.ts
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

// TODO: it may be that we need to not do full re-requests from the filter
// when we have streamed results (as they can cause reset of the allCompletions)

import { Plugin, PluginKey, Transaction, Selection, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { PromiseQueue } from 'core';

import {
  CompletionHandler,
  selectionAllowsCompletions,
  kCompletionDefaultMaxVisible,
  completionsShareScope,
  performCompletionReplacement,
  CompletionResult,
  CompletionsStream,
} from '../../api/completion';
import { EditorEvents, ScrollEvent } from '../../api/event-types';

import { createCompletionPopup, renderCompletionPopup, destroyCompletionPopup, CompletionPopup } from './completion-popup';
import { EditorUI } from '../../api/ui-types';
import { MarkInputRuleFilter } from '../../api/input_rule';
import { kInsertCompletionTransaction, kPasteTransaction } from '../../api/transaction';

interface CompletionState {
  handler?: CompletionHandler;
  result?: CompletionResult;
  prevToken?: string;
  isPaste?: boolean;
}

export function completionExtension(
  handlers: readonly CompletionHandler[],
  inputRuleFilter: MarkInputRuleFilter,
  ui: EditorUI,
  events: EditorEvents,
) {
  return {
    plugins: () => [new CompletionPlugin(handlers, inputRuleFilter, ui, events)],
  };
}

const key = new PluginKey<CompletionState>('completion');

class CompletionPlugin extends Plugin<CompletionState> {
  // editor ui
  private readonly ui: EditorUI;

  // editor view
  private view: EditorView | null = null;

  // popup elemeent
  private completionPopup: CompletionPopup | null = null;

  // currently selected index and last set of completions are held as transient
  // state because they can't be derived from the document state (selectedIndex
  // is derived from out of band user keyboard gestures and completions may
  // have required fulfilling an external promise). also use a version counter
  // used to invalidate async completion requests that are fulfilled after
  // an update has occurred
  private version = 0;
  private allCompletions: unknown[] = [];
  private completions: unknown[] = [];
  private horizontal = false;
  private selectedIndex = 0;

  // serialize async completion requests
  private completionQueue = new PromiseQueue();

  // events we need to unsubscribe from
  private readonly scrollUnsubscribe: VoidFunction;

  constructor(
    handlers: readonly CompletionHandler[],
    inputRuleFilter: MarkInputRuleFilter,
    ui: EditorUI,
    events: EditorEvents,
  ) {
    super({
      key,
      state: {
        init: () => ({}),
        apply: (tr: Transaction, prevState: CompletionState) => {
          // if we don't have a view then bail
          if (!this.view) {
            return {};
          }

          // selection only changes dismiss any active completion
          if (!tr.docChanged && !tr.storedMarksSet && tr.selectionSet) {
            return {};
          }

          // check whether completions are valid here
          if (!selectionAllowsCompletions(tr.selection)) {
            return {};
          }

          // calculate text before cursor
          const textBefore = completionTextBeforeCursor(tr.selection);

          // if there is no text then don't handle it
          if (textBefore.length === 0) {
            return {};
          }

          const isPaste = tr.getMeta(kPasteTransaction) === true;

          // check for a handler that can provide completions at the current selection
          for (const handler of handlers) {
            // first check if the handler is enabled (null means use inputRuleFilter)
            if (handler.enabled === null || (handler.enabled ? handler.enabled(tr) : inputRuleFilter(tr))) {
              const result = handler.completions(textBefore, tr);
              if (result) {
                // check if the previous state had a completion from the same handler
                let prevToken: string | undefined;

                // if we are using the same handler at the same position, and it has
                // a completions filter, then forward the token
                if (handler.id === prevState.handler?.id &&
                    result.pos === prevState.result?.pos &&
                    handler.filter) {
                  prevToken = prevState.result.token;
                
                // bypass if this was an insert with the same scope
                } else if (tr.getMeta(kInsertCompletionTransaction) && 
                           completionsShareScope(handler, prevState.handler)) {
                  continue;
                }

                // return state
                return { handler, result, prevToken, isPaste };
              }
            }
          }

          // no handler found
          return {};
        },
      },

      view: () => ({
        update: (view: EditorView) => {
          // increment version
          this.version++;

          // set view
          this.view = view;

          // update completions
          this.updateCompletions(view, true);
        },

        destroy: () => {
          // unsubscribe from events
          this.scrollUnsubscribe();
          window.document.removeEventListener('focusin', this.clearCompletions);

          // tear down the popup
          this.clearCompletions();
        },
      }),

      props: {
        decorations: (state: EditorState) => {
          const pluginState = key.getState(state);
          return pluginState?.result?.decorations;
        },

        handleDOMEvents: {
          keydown: (view: EditorView, event: Event) => {
            const kbEvent = event as KeyboardEvent;

            let handled = false;

            // determine meaning of keys based on orientation
            const forwardKey = this.horizontal ? 'ArrowRight' : 'ArrowDown';
            const backwardKey = this.horizontal ? 'ArrowLeft' : 'ArrowUp';

            if (this.completionsActive()) {
              switch (kbEvent.key) {
                case 'Escape':
                  this.dismissCompletions();
                  handled = true;
                  break;
                case 'Enter':
                case 'Tab':
                  this.insertCompletion(view, this.selectedIndex);
                  handled = true;
                  break;
                case backwardKey:
                  this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                  this.renderCompletions(view);
                  handled = true;
                  break;
                case forwardKey:
                  this.selectedIndex = Math.min(this.selectedIndex + 1, this.completions.length - 1);
                  this.renderCompletions(view);
                  handled = true;
                  break;
                case 'PageUp':
                  this.selectedIndex = Math.max(this.selectedIndex - this.completionPageSize(), 0);
                  this.renderCompletions(view);
                  handled = true;
                  break;
                case 'PageDown':
                  this.selectedIndex = Math.min(
                    this.selectedIndex + this.completionPageSize(),
                    this.completions.length - 1,
                  );
                  this.renderCompletions(view);
                  handled = true;
                  break;
                case 'End':
                  this.selectedIndex = this.completions.length - 1;
                  this.renderCompletions(view);
                  handled = true;
                  break;
                case 'Home':
                  this.selectedIndex = 0;
                  this.renderCompletions(view);
                  handled = true;
                  break;
              }
            }

            // suppress event if we handled it
            if (handled) {
              event.preventDefault();
              event.stopPropagation();
            }

            // return status
            return handled;
          },
        },
      },
    });

    // capture reference to ui
    this.ui = ui;

    // hide completions when we scroll or the focus changes
    this.clearCompletions = this.clearCompletions.bind(this);
    this.scrollUnsubscribe = events.subscribe(ScrollEvent, this.clearCompletions);
    window.document.addEventListener('focusin', this.clearCompletions);
  }

  private updateCompletions(view: EditorView, resetSelection: boolean) {
    const state = key.getState(view.state);

    if (state?.handler && state?.result) {
      // track the request version to invalidate the result if an
      // update happens after it goes into flight
      const requestVersion = this.version;

      // make an async request for the completions, update allCompletions,
      // and then apply any filter we have (allows the completer to just return
      // everything from the aysnc query and fall back to the filter for refinement)
      const requestAllCompletions = async () => {
        // fetch completions
        const completions = await state.result!.completions(view.state, { isPaste: state.isPaste === true });

        // if we don't have a handler or result then return
        if (!state.handler || !state.result) {
          return;
        }

        // function to update completions
        const updateCompletions = (updatedCompletions: unknown[]) => {
          // save completions
          this.setAllCompletions(updatedCompletions, !!state.handler?.view.horizontal, resetSelection);

          // display if the request still maps to the current state
          if (state.handler && state.result && this.version === requestVersion) {
            // if there is a filter then call it and update displayed completions
            const displayedCompletions = state.handler.filter
              ? state.handler.filter(this.allCompletions, view.state, state.result.token)
              : null;
            if (displayedCompletions) {
              this.setDisplayedCompletions(displayedCompletions, !!state.handler.view.horizontal, resetSelection);
            }

            this.renderCompletions(view);
          }
        };

        // if we got an array, just set it. if we got a stream then poll it for it's update
        if (Array.isArray(completions)) {
          updateCompletions(completions);
        } else {
          const completionStream = completions as CompletionsStream;
          updateCompletions(completionStream.items);
          const pollingInterval = window.setInterval(() => {
            // if the document has been updated then invalidate
            if (this.version !== requestVersion) {
              clearInterval(pollingInterval);
            } else {
              // otherwise check the stream
              const result = completionStream.stream();
              if (result) {
                clearInterval(pollingInterval);
                updateCompletions(result);
              }
            }
          }, 300);
        }
      };

      // first see if we can do this exclusively via filter
      if (state.prevToken && state.handler.filter) {
        this.completionQueue.enqueue(async () => {
          // display if the request still maps to the current state
          if (state.handler && state.result && this.version === requestVersion) {
            const filteredCompletions = state.handler.filter!(
              this.allCompletions,
              view.state,
              state.result.token,
              state.prevToken,
            );

            // got a hit from the filter!
            if (filteredCompletions) {
              this.setDisplayedCompletions(filteredCompletions, !!state.handler.view.horizontal, resetSelection);
              this.renderCompletions(view);

              // couldn't use the filter, do a full request for all completions (so long as we aren't
              // already waiting on a strea,)
            } else {
              await requestAllCompletions();
            }
          }
        });
      } else {
        // no prevToken or no filter for this handler, request everything
        this.completionQueue.enqueue(requestAllCompletions);
      }
    } else {
      // no handler/result for this document state
      this.clearCompletions();
    }
  }

  private renderCompletions(view: EditorView) {
    const state = key.getState(view.state);

    if (state && state.handler && (this.completions.length > 0 || !state.handler.view.hideNoResults)) {
      const props = {
        handler: state.handler!,
        pos: state.result!.pos + (state.result!.offset || 0),
        completions: this.completions,
        selectedIndex: this.selectedIndex,
        noResults: this.ui.context.translateText('No Results'),
        onClick: (index: number) => {
          this.insertCompletion(view, index);
        },
        onHover: (index: number) => {
          this.selectedIndex = index;
          this.renderCompletions(view);
        },
        ui: this.ui,
      };

      // create the completion popup if we need to
      if (this.completionPopup === null) {
        this.completionPopup = createCompletionPopup();
      }

      // render
      renderCompletionPopup(view, props, this.completionPopup);
    } else {
      // hide
      this.hideCompletionPopup();
    }
  }

  private async insertCompletion(view: EditorView, index: number) {
    // default index if not specified
    index = index || this.selectedIndex;
    const completion = this.completions[index];

    const state = key.getState(view.state);
    if (state && state.handler) {
      // perform replacement
      const result = state.result!;

      // check low level handler first
      if (state.handler.replace) {
        // execute replace
        await state.handler.replace(view, result.pos, this.completions[index]);

        // use higher level handler
      } else if (state.handler.replacement) {
        // get replacement from handler
        const replacement = state.handler.replacement(view.state.schema, this.completions[index]);
        if (replacement) {
          const tr = view.state.tr;
          performCompletionReplacement(tr, result.pos, replacement);
          view.dispatch(tr);
        }
      }
      // set focus
      if (!state.handler.noFocus || !state.handler.noFocus(completion)) {
        view.focus()
      }
    }
    this.clearCompletions();
  }

  // explicit user dismiss of completion (e.g. Esc key)
  private async dismissCompletions() {
    // call lower-level replace on any active handler (w/ null). this gives
    // them a chance to dismiss any artifacts that were explicitly inserted
    // to trigger the handler (e.g. a cmd+/ for omni-insert)
    if (this.view) {
      const state = key.getState(this.view.state);
      if (state?.result && state.handler) {
        if (state.handler.replace) {
          await state.handler.replace(this.view, state.result.pos, null);
        } else if (state.handler.replacement) {
          state.handler.replacement(this.view.state.schema, null);
        }
      }
    }

    this.clearCompletions();
  }

  private clearCompletions() {
    this.setAllCompletions([], false, true);
    this.hideCompletionPopup();
  }

  private hideCompletionPopup() {
    if (this.completionPopup) {
      destroyCompletionPopup(this.completionPopup);
      this.completionPopup = null;
    }
  }

  private completionsActive() {
    return !!this.completionPopup;
  }

  private setAllCompletions(completions: unknown[], horizontal: boolean, resetSelection: boolean) {
    this.allCompletions = completions;
    this.setDisplayedCompletions(completions, horizontal, resetSelection);
  }

  private setDisplayedCompletions(completions: unknown[], horizontal: boolean, resetSelection: boolean) {
    this.completions = completions;
    this.horizontal = !!horizontal;

    // reset selection if requested or if the current index exceeds the # of completions
    if (resetSelection || this.selectedIndex > this.completions.length - 1) {
      this.selectedIndex = 0;
    }
  }

  private completionPageSize() {
    if (this.view) {
      const state = key.getState(this.view.state);
      return state?.handler?.view.maxVisible || kCompletionDefaultMaxVisible;
    } else {
      return kCompletionDefaultMaxVisible;
    }
  }
}

// extract the text before the cursor, dealing with block separators and
// non-text leaf characters (this is based on code in prosemirror-inputrules)
function completionTextBeforeCursor(selection: Selection, maxLength = 500) {
  const { $head } = selection;
  return $head.parent.textBetween(
    Math.max(0, $head.parentOffset - maxLength), // start
    $head.parentOffset, // end
    undefined, // block separator
    '\ufffc', // leaf char
  );
}
