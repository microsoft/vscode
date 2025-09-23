/*
 * omni_insert.tsx
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

import { EditorState, Selection, Transaction } from 'prosemirror-state';
import { EditorView, DecorationSet } from 'prosemirror-view';

import { setTextSelection } from 'prosemirror-utils';

import React from 'react';
import { firstBy } from 'thenby';

import { OmniInserter, omniInsertGroupCompare, omniInsertPriorityCompare } from '../../api/omni_insert';
import { CompletionHandler, CompletionResult } from '../../api/completion';

import { EditorUI } from '../../api/ui-types';
import { placeholderDecoration } from '../../api/placeholder';
import { kAddToHistoryTransaction } from '../../api/transaction';

import './omni_insert-completion.css';

export function omniInsertCompletionHandler(
  omniInserters: OmniInserter[],
  ui: EditorUI,
): CompletionHandler<OmniInserter> {
  return {
    id: 'E305158D-20D6-474D-84E6-06607CA58578',

    completions: omniInsertCompletions(omniInserters, ui),

    noFocus: (completion: OmniInserter) => {
      return completion.noFocus === true;
    },

    filter: (completions: OmniInserter[], state: EditorState, token: string) => {
      // match contents of name or keywords (and verify the command is enabled)
      return completions
        .filter(inserter => {
          return (
            token.length === 0 ||
            inserter.name.toLowerCase().indexOf(token) !== -1 ||
            inserter.keywords?.some(keyword => keyword.indexOf(token) !== -1)
          );
        })
        .filter(inserter => {
          return inserter.command(state);
        })
        .sort(
          firstBy(omniInsertGroupCompare)
            .thenBy(omniInsertPriorityCompare, { direction: 'desc' })
            .thenBy('name'),
        );
    },

    replace(view: EditorView, pos: number, completion: OmniInserter | null) {
      // helper to remove command text
      const removeCommandText = () => {
        const tr = view.state.tr;
        tr.deleteRange(pos, view.state.selection.head);
        tr.setMeta(kAddToHistoryTransaction, false);
        view.dispatch(tr);
      };

      // execute command if provided
      if (completion) {
        // remove existing text
        removeCommandText();

        // execute the command
        completion.command(view.state, view.dispatch, view);

        // perform any requested selection offset
        if (completion.selectionOffset) {
          const tr = view.state.tr;
          setTextSelection(tr.selection.from + completion.selectionOffset)(tr);
          tr.setMeta(kAddToHistoryTransaction, false);
          view.dispatch(tr);
        }

      // the activation of omni_insert wasn't part of 'natural' typing
      // in the document so remove it
      } else {
        removeCommandText();
      }
      return Promise.resolve();
    },

    view: {
      component: OmniInserterView,
      key: command => command.id,
      width: 320,
      height: 46,
      maxVisible: 6,
    },
  };
}

const kOmniInsertRegex = /\/([\w]*)$/;

function omniInsertCompletions(omniInserters: OmniInserter[], ui: EditorUI) {
  return (text: string, context: EditorState | Transaction): CompletionResult<OmniInserter> | null => {
    const match = text.match(kOmniInsertRegex);
    if (match) {
      // we need to either be at the beginning of our parent, OR the omni_insert mark needs
      // to be active (that indicates that we entered omni insert mode via a user command)
      if (match.index !== 0 && !isOmniInsertCommandActive(context.selection)) {
        return null;
      }

      // capture query (note that no query returns all).
      const query = match[1].toLowerCase();

      // include a decoration if the query is empty
      const decorations =
        query.length === 0
          ? DecorationSet.create(context.doc, [
              placeholderDecoration(context.selection.head, ui.context.translateText(' type to search...')),
            ])
          : undefined;

      // return the completion result
      return {
        // match at the /
        pos: context.selection.head - match[0].length,

        // unique identifier for this request
        token: query,

        // return all omniInserters (will refine via filter)
        completions: () => {
          return Promise.resolve(omniInserters);
        },

        // search placehodler decorator if there is no query
        decorations,
      };
    } else {
      return null;
    }
  };
}

const OmniInserterView: React.FC<OmniInserter> = inserter => {
  return (
    <table className={'pm-omni-insert-completion'}>
      <tbody>
        <tr>
          <td className={'pm-omni-insert-icon'}>
            <img className={'pm-block-border-color'} src={inserter.image()} alt=""  draggable="false"/>
          </td>
          <td>
            <div className={'pm-omni-insert-name pm-completion-list-item-text'}>{inserter.name}</div>
            <div className={'pm-omni-insert-description pm-completion-list-item-text'}>{inserter.description}</div>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

function isOmniInsertCommandActive(selection: Selection) {
  const schema = selection.$head.parent.type.schema;
  return schema.marks.omni_insert.isInSet(selection.$head.marks());
}
