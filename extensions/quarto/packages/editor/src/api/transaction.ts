/*
 * transaction.ts
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

import { Transaction, EditorState, Plugin, PluginKey, Selection } from 'prosemirror-state';
import { Node as ProsemirrorNode, Mark, MarkType, Slice } from 'prosemirror-model';
import { ChangeSet } from 'prosemirror-changeset';
import { ReplaceStep, Step, Transform } from 'prosemirror-transform';

import { sliceContentLength } from './slice';

export const kPasteTransaction = 'paste';
export const kSetMarkdownTransaction = 'setMarkdown';
export const kNoUpdateTransaction = 'noUpdateTransaction';
export const kAddToHistoryTransaction = 'addToHistory';
export const kFixupTransaction = 'docFixup';
export const kRestoreLocationTransaction = 'restoreLocation';
export const kNavigationTransaction = 'navigationTransaction';
export const kInsertSymbolTransaction = 'insertSymbol';
export const kInsertCompletionTransaction = 'insertCompletion';
export const kThemeChangedTransaction = 'themeChnaged';

export type TransactionsFilter = (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => boolean;

export type TransactionNodeFilter = (
  node: ProsemirrorNode,
  pos: number,
  parent: ProsemirrorNode | null,
  index: number,
) => boolean;

export interface AppendTransactionHandler {
  name: string;
  filter?: TransactionsFilter;
  nodeFilter?: TransactionNodeFilter;
  append: (tr: Transaction, transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => void;
}

// wrapper for transaction that is guaranteed not to modify the position of any
// nodes in the document (useful for grouping many disparate handlers that arne't
// aware of each other's actions onto the same trasaction)
export class MarkTransaction {
  private tr: Transaction;

  constructor(tr: Transaction) {
    this.tr = tr;
  }
  get doc(): ProsemirrorNode {
    return this.tr.doc;
  }
  get selection(): Selection {
    return this.tr.selection;
  }
  public addMark(from: number, to: number, mark: Mark): this {
    this.tr.addMark(from, to, mark);
    return this;
  }
  public removeMark(from: number, to: number, mark?: Mark | MarkType): this {
    this.tr.removeMark(from, to, mark);
    return this;
  }
  public removeStoredMark(mark: Mark | MarkType): this {
    this.tr.removeStoredMark(mark);
    return this;
  }
  public insertText(text: string, from: number): this {
    this.tr.insertText(text, from, from + text.length);
    return this;
  }
}

export interface AppendMarkTransactionHandler {
  name: string;
  filter: (node: ProsemirrorNode, transactions: readonly Transaction[]) => boolean;
  append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number, state: EditorState) => void;
}

export function appendMarkTransactionsPlugin(handlers: readonly AppendMarkTransactionHandler[]): Plugin {
  return new Plugin({
    key: new PluginKey('appendMarkTransactions'),

    appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
      // skip for selection-only changes
      if (!transactionsDocChanged(transactions)) {
        return;
      }

      // create transaction
      const tr = newState.tr;

      // create markTransaction wrapper
      const markTr = new MarkTransaction(tr);

      forChangedNodes(
        oldState,
        newState,
        () => true,
        (node: ProsemirrorNode, pos: number) => {
          for (const handler of handlers) {
            // get a fresh view of the node
            node = tr.doc.nodeAt(pos)!;

            // call the handler
            if (handler.filter(node, transactions)) {
              handler.append(markTr, node, pos, newState);
            }
          }
        },
      );

      // return transaction
      if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) {
        return tr;
      } else {
        return undefined;
      }
    },
  });
}

export function appendTransactionsPlugin(handlers: readonly AppendTransactionHandler[]): Plugin {
  return new Plugin({
    key: new PluginKey('appendTransactions'),

    appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
      // skip for selection-only changes
      if (!transactionsDocChanged(transactions)) {
        return;
      }

      // create transaction
      const tr = newState.tr;

      // compute the changeSet
      if (transactionsAreTypingChange(transactions)) {
        const changeSet = transactionsChangeSet(transactions, oldState, newState);

        // call each handler
        for (const handler of handlers) {
          // track whether there is a change
          let haveChange = false;

          // call filters if we have them
          if (handler.filter || handler.nodeFilter) {
            // first the low-level transaction filter
            if (handler.filter) {
              haveChange = handler.filter(transactions, oldState, newState);
            }

            // if that doesn't detect a change then try the nodeFilter if we have one
            if (!haveChange && handler.nodeFilter) {
              const checkForChange = (
                node: ProsemirrorNode,
                pos: number,
                parent: ProsemirrorNode | null,
                index: number,
              ) => {
                if (handler.nodeFilter!(node, pos, parent, index)) {
                  haveChange = true;
                  return false;
                } else {
                  return true;
                }
              };

              for (const change of changeSet.changes) {
                oldState.doc.nodesBetween(change.fromA, change.toA, checkForChange);
                newState.doc.nodesBetween(change.fromB, change.toB, checkForChange);
              }
            }

            // no filters means we should always run (force haveChange to true)
          } else {
            haveChange = true;
          }

          // run the handler if applicable
          if (haveChange) {
            handler.append(tr, transactions, oldState, newState);
          }
        }

        // run them all if this is a larger change
      } else {
        handlers.forEach(handler => handler.append(tr, transactions, oldState, newState));
      }

      // return transaction
      if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) {
        return tr;
      } else {
        return undefined;
      }
    },
  });
}

export function transactionsDocChanged(transactions: readonly Transaction[]) {
  return transactions.some(transaction => transaction.docChanged);
}

export function transactionsChangeSet(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) {
  let changeSet = ChangeSet.create(oldState.doc);
  for (const transaction of transactions) {
    changeSet = changeSet.addSteps(newState.doc, transaction.mapping.maps, {});
  }
  return changeSet;
}

export function trTransform(tr: Transaction, f: (transform: Transform) => void): Transaction {
  // create a new transform so we can do position mapping relative
  // to the actions taken here (b/c the transaction might already
  // have other steps so we can't do tr.mapping.map)
  const newActions = new Transform(tr.doc);

  // call the function (passing it a mapping function that uses our newActions)
  f(newActions);

  // copy the contents of newActions to the actual transaction
  for (const step of newActions.steps) {
    tr.step(step);
  }

  // return the transaction for chaining
  return tr;
}

export function transactionsHaveChange(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
  predicate: (node: ProsemirrorNode, pos: number, parent: ProsemirrorNode | null, index: number) => boolean,
) {
  // screen out transactions with no doc changes
  if (!transactionsDocChanged(transactions)) {
    return false;
  }

  // function to check for whether we have a change and set a flag if we do
  let haveChange = false;
  const checkForChange = (node: ProsemirrorNode, pos: number, parent: ProsemirrorNode | null, index: number) => {
    if (predicate(node, pos, parent, index)) {
      haveChange = true;
      return false;
    } else {
      return true;
    }
  };

  // for each change in each transaction, check for a node that matches the predicate in either the old or new doc
  const changeSet = transactionsChangeSet(transactions, oldState, newState);

  for (const change of changeSet.changes) {
    oldState.doc.nodesBetween(change.fromA, change.toA, checkForChange);
    newState.doc.nodesBetween(change.fromB, change.toB, checkForChange);
    if (haveChange) {
      break;
    }
  }

  return haveChange;
}

export function forChangedNodes(
  oldState: EditorState | null,
  newState: EditorState,
  predicate: (node: ProsemirrorNode) => boolean,
  f: (node: ProsemirrorNode, pos: number) => boolean | void,
) {
  let complete = false;
  const handler = (node: ProsemirrorNode, pos: number) => {
    if (complete) {
      return;
    }

    if (!predicate || predicate(node)) {
      if (f(node, pos) === false) {
        complete = true;
      }
    }
  };

  if (!oldState) {
    newState.doc.descendants(handler);
  } else if (oldState.doc !== newState.doc) {
    changedDescendants(oldState.doc, newState.doc, 0, handler);
  }
}

// Helper for iterating through the nodes in a document that changed
// compared to the given previous document. Useful for avoiding
// duplicate work on each transaction.
// from: https://github.com/ProseMirror/prosemirror-tables/blob/master/src/fixtables.js
function changedDescendants(
  old: ProsemirrorNode,
  cur: ProsemirrorNode,
  offset: number,
  f: (node: ProsemirrorNode, pos: number) => void,
) {
  const oldSize = old.childCount;
  const curSize = cur.childCount;
  outer: for (let i = 0, j = 0; i < curSize; i++) {
    const child = cur.child(i);
    for (let scan = j, e = Math.min(oldSize, i + 3); scan < e; scan++) {
      if (old.child(scan) === child) {
        j = scan + 1;
        offset += child.nodeSize;
        continue outer;
      }
    }
    f(child, offset);
    if (j < oldSize && old.child(j).sameMarkup(child)) {
      changedDescendants(old.child(j), child, offset + 1, f);
    } else {
      child.nodesBetween(0, child.content.size, f, offset + 1);
    }
    offset += child.nodeSize;
  }
}

// effect transactions are applied for their side effect of updating decorations
// (e.g. spelling and find decorators)
export function isEffectTransaction(tr: Transaction) {
  return !tr.docChanged && !tr.selectionSet && !tr.storedMarksSet;
}

export function transactionsAreTypingChange(transactions: readonly Transaction[]) {
  if (
    transactions.length === 1 &&
    transactions[0].steps.length === 1 &&
    transactions[0].steps[0] instanceof ReplaceStep
  ) {
    // step to examine
    const step: SliceStep = transactions[0].steps[0];

    // insert single chraracter or new empty slice (e.g. from enter after a paragraph)
    if (step.from === step.to && sliceContentLength(step.slice) <= 1) {
      return true;
    }

    // remove single character
    if (Math.abs(step.from - step.to) === 1 && step.slice.content.size === 0) {
      return true;
    }
  }

  return false;
}

export interface RangeStep extends Step {
  from: number;
  to: number;
}

export interface SliceStep extends RangeStep {
  slice: Slice;
}
