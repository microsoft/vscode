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

import { Selection, EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { EditorView, DecorationSet } from 'prosemirror-view';

import { canInsertNode } from './node';
import { EditorUI } from './ui-types';
import { kInsertCompletionTransaction } from './transaction';

export const kCompletionDefaultItemHeight = 22;
export const kCompletionDefaultMaxVisible = 10;
export const kCompletionDefaultWidth = 180;

export interface CompletionContext {
  isPaste: boolean;
}

export interface CompletionsStream<T = unknown> {
  items: T[];
  stream: () => T[] | null;
}

export type Completions<T> = T[] | CompletionsStream<T>;

export interface CompletionResult<T = unknown> {
  pos: number;
  offset?: number;
  token: string;
  completions: (state: EditorState, context: CompletionContext) => Promise<Completions<T>>;
  decorations?: DecorationSet;
}

export interface CompletionHeaderProps {
  ui: EditorUI;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CompletionHandler<T = any> {
  // unique id
  id: string;

  // An optional scope for this completion handler. Completions
  // triggered by a transaction will filter completion handlers
  // that share a scope with the completion handler that originated
  // a transaction.
  scope?: string;

  // filter for determing whether we can call this handler from a given context (default is to
  // never offer completions if a mark with noInputRules is active). set to null to
  // allow completion anywhere
  enabled?: ((context: EditorState | Transaction) => boolean) | null;

  // return a set of completions for the given context. text is the text before
  // before the cursor in the current node (but no more than 500 characters)
  completions(text: string, context: EditorState | Transaction): CompletionResult<T> | null;

  // filter a previously returned set of completions
  filter?: (completions: T[], state: EditorState, token: string, prevToken?: string) => T[] | null;

  // provide a completion replacement as a string or node (can be passed null if the popup was dismissed)
  replacement?(schema: Schema, completion: T | null): string | ProsemirrorNode | null;

  // lower level replacement handler (can be passed null if the popup was dismissed)
  replace?(view: EditorView, pos: number, completion: T | null): Promise<unknown>;

  // prevent focus after insertion (good for e.g. omni-insert)
  noFocus?: (completion: T) => boolean ;

  // completion view
  view: {
    // optional header component (will go inside a <th>)
    header?: () =>
      | {
          component: React.FC<CompletionHeaderProps> | React.ComponentClass<CompletionHeaderProps>;
          height: number;
          message?: string;
        }
      | undefined;

    // react compontent type for viewing the item
    component: React.FC<T> | React.ComponentClass<T>;

    key: (completion: T) => unknown;

    // width of completion item (defaults to 180).
    width?: number;

    // height of completion item (defaults to 22px)
    height?: number;

    // use horizontal orientation (defaults to false)
    // (optionally provide a set of item widths)
    horizontal?: boolean;
    horizontalItemWidths?: number[];

    // maximum number of visible items (defaults to 10). note that
    // this only applies to completion poupups w/ vertical orientation
    // (scrolling is not supported for horizontal orientation)
    maxVisible?: number;

    // hide 'no results' (default false)
    hideNoResults?: boolean;
  };
}

export function selectionAllowsCompletions(selection: Selection) {
  const schema = selection.$head.parent.type.schema;

  // non empty selections don't have completions
  if (!selection.empty) {
    return false;
  }

  // must be able to insert text
  if (!canInsertNode(selection, schema.nodes.text)) {
    return false;
  }

  // must not be in a code mark
  if (schema.marks.code && !!schema.marks.code.isInSet(selection.$from.marks())) {
    return false;
  }

  // must not be in a code node
  if (selection.$head.parent.type.spec.code) {
    return false;
  }

  return true;
}

// Determine whether two completionHandlers share the same scope. By default
// completion handlers will share scope only if they share an id, but handlers
// can provide a scope if they'd like to coordinate.
export function completionsShareScope(handler: CompletionHandler, prevHandler?: CompletionHandler) {
  // There is no previous handler, not shared
  if (!prevHandler) {
    return false;
  }

  // Previous handler with the same scope as the current handler
  if (prevHandler.scope && prevHandler.scope === handler.scope) {
    return true;
  } else {
    // Previous handler has the same id as the current handler
    return prevHandler.id === handler.id;
  }
}

export function performCompletionReplacement(tr: Transaction, pos: number, replacement: ProsemirrorNode | string) {
  // set selection to area we will be replacing
  tr.setSelection(new TextSelection(tr.doc.resolve(pos), tr.selection.$head));

  // ensure we have a node
  if (replacement instanceof ProsemirrorNode) {
    // combine it's marks w/ whatever is active at the selection
    const marks = tr.selection.$head.marks();

    // set selection and replace it
    tr.replaceSelectionWith(replacement, false);

    // propapate marks
    marks.forEach(mark => tr.addMark(pos, tr.selection.to, mark));
  } else {
    tr.insertText(replacement);
  }

  // mark the transaction as an completion insertion
  tr.setMeta(kInsertCompletionTransaction, true);
}
