/*
 * link-command.ts
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

import { MarkType } from 'prosemirror-model';
import { EditorUI } from '../../api/ui-types';
import { LinkEditorFn, LinkProps } from 'editor-types';
import { EditorState, Transaction, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { findChildren } from 'prosemirror-utils';

import { markIsActive, getMarkAttrs, getSelectionMarkRange, getMarkRange } from '../../api/mark';

import { linkTargets, LinkCapabilities, LinkType } from '../../api/link';
import { OmniInsertGroup } from '../../api/omni_insert';
import { equalsIgnoreCase } from 'core';

export function linkCommand(markType: MarkType, onEditLink: LinkEditorFn, capabilities: LinkCapabilities) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    // if the current node doesn't allow this mark return false
    if (!state.selection.$from.node().type.allowsMarkType(markType)) {
      return false;
    }

    async function asyncEditLink() {
      if (dispatch) {
        // collect link targets
        const targets = await linkTargets(state.doc);

        // get the range of the mark
        const range = getSelectionMarkRange(state.selection, markType);

        // get link attributes if we have them
        let link: { type?: LinkType, text?: string, href?: string, heading?: string } = {};

        // only get text if this is a text selection
        if (state.selection instanceof TextSelection) {
          link.text = state.doc.textBetween(range.from, range.to);
          capabilities.text = true;
        } else {
          capabilities.text = false;
        }

        // get other attributes
        if (markIsActive(state, markType)) {
          link = {
            ...link,
            ...getMarkAttrs(state.doc, range, markType),
          };
        } else {
          // if the link text is a URL then make it the default
          if (link.text && link.text.match(/^https?:\/\/.*$/)) {
            link.href = link.text;
          }
        }

        // determine type
        if (link.heading) {
          link.type = LinkType.Heading;
        } else if (link.href && link.href.startsWith('#')) {
          link.type = LinkType.ID;
        } else {
          link.type = LinkType.URL;
        }

        // ensure text and url are not undefined
        link.text = link.text || "";
        link.href = link.href || "";

        // show edit ui
        const result = await onEditLink({ ...link } as LinkProps, targets, capabilities);
        if (result) {
          const tr = state.tr;
          tr.removeMark(range.from, range.to, markType);
          if (result.action === 'edit') {
            // create the mark
            const mark = markType.create(result.link);

            // if the content changed then replace the range, otherwise
            if (capabilities.text && link.text !== result.link.text) {
              const node = markType.schema.text(result.link.text, [mark]);
              // if we are editing an existing link then replace it, otherwise replace the selection
              if (link.href) {
                tr.replaceRangeWith(range.from, range.to, node);
              } else {
                tr.replaceSelectionWith(node, false);
              }
            } else {
              tr.addMark(range.from, range.to, mark);
            }

            // if it's a heading link then update heading to indicate it has an associated link
            if (result.link.type === LinkType.Heading) {
              const heading = findChildren(
                tr.doc,
                node =>
                  node.type === state.schema.nodes.heading &&
                  equalsIgnoreCase(node.textContent, result.link.heading || ''),
              );
              if (heading.length > 0) {
                tr.setNodeMarkup(heading[0].pos, state.schema.nodes.heading, {
                  ...heading[0].node.attrs,
                  link: result.link.heading,
                });
              }
            }
          }
          dispatch(tr);
        }
        if (view) {
          view.focus();
        }
      }
    }
    asyncEditLink();

    return true;
  };
}

export function linkOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Link...'),
    description: ui.context.translateText('Link to another location'),
    group: OmniInsertGroup.Content,
    priority: 8,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.link_dark : ui.images.omni_insert.link),
  };
}

export function removeLinkCommand(markType: MarkType) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const range = getMarkRange(state.selection.$from, markType);
    if (!range) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;
      tr.removeMark(range.from, range.to, markType);
      dispatch(tr);
    }

    return true;
  };
}
