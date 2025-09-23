/*
 * command.ts
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

import { lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { Attrs, MarkType, Node as ProsemirrorNode, NodeType } from 'prosemirror-model';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import { EditorState, Transaction } from 'prosemirror-state';
import { findParentNode, findParentNodeOfType, setTextSelection } from 'prosemirror-utils';
import { EditorView } from 'prosemirror-view';

import { markIsActive, getMarkRange } from './mark';
import { canInsertNode, nodeIsActive } from './node';
import { pandocAttrInSpec, pandocAttrAvailable, pandocAttrFrom } from './pandoc_attr';
import { isList } from './list';
import { OmniInsert } from './omni_insert';
import { EditorUIPrefs, kListSpacingTight } from './ui-types';
import { selectionIsWithinRange, selectionHasRange } from './selection';
import { requiresTrailingP, insertTrailingP } from './trailing_p';

import { EditorCommandId, EditorCommand } from './command-types';

export { EditorCommandId };
export type { EditorCommand }

export class ProsemirrorCommand {
  public readonly id: EditorCommandId;
  public readonly keymap: readonly string[];
  public readonly execute: CommandFn;
  public readonly omniInsert?: OmniInsert;
  public readonly keepFocus: boolean;

  constructor(
    id: EditorCommandId,
    keymap: readonly string[],
    execute: CommandFn,
    omniInsert?: OmniInsert,
    keepFocus?: boolean,
  ) {
    this.id = id;
    this.keymap = keymap;
    this.execute = execute;
    this.omniInsert = omniInsert;
    this.keepFocus = !(keepFocus === false);
  }

  public isEnabled(state: EditorState): boolean {
    return this.execute(state);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public isActive(_state: EditorState): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public plural(_state: EditorState): number {
    return 1;
  }
}

export class MarkCommand extends ProsemirrorCommand {
  public readonly markType: MarkType;
  public readonly attrs: object;

  constructor(id: EditorCommandId, keymap: string[], markType: MarkType, attrs = {}) {
    super(id, keymap, toggleMarkType(markType, attrs) as CommandFn);
    this.markType = markType;
    this.attrs = attrs;
  }

  public isActive(state: EditorState) {
    return markIsActive(state, this.markType);
  }
}

export class NodeCommand extends ProsemirrorCommand {
  public readonly nodeType: NodeType;
  public readonly attrs: object;

  constructor(
    id: EditorCommandId,
    keymap: string[],
    nodeType: NodeType,
    attrs: object,
    execute: CommandFn,
    omniInsert?: OmniInsert,
  ) {
    super(id, keymap, execute, omniInsert);
    this.nodeType = nodeType;
    this.attrs = attrs;
  }

  public isActive(state: EditorState) {
    return nodeIsActive(state, this.nodeType, this.attrs);
  }
}

export class BlockCommand extends NodeCommand {
  constructor(
    id: EditorCommandId,
    keymap: string[],
    blockType: NodeType,
    toggleType: NodeType,
    attrs = {},
    omniInsert?: OmniInsert,
  ) {
    super(id, keymap, blockType, attrs, toggleBlockType(blockType, toggleType, attrs), omniInsert);
  }
}

export class WrapCommand extends NodeCommand {
  constructor(id: EditorCommandId, keymap: string[], wrapType: NodeType, attrs = {}, omniInsert?: OmniInsert) {
    super(id, keymap, wrapType, attrs, toggleWrap(wrapType, attrs), omniInsert);
  }
}

export class InsertCharacterCommand extends ProsemirrorCommand {
  constructor(id: EditorCommandId, ch: string, keymap: string[]) {
    super(id, keymap, (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      // enable/disable command
      const schema = state.schema;
      if (!canInsertNode(state, schema.nodes.text)) {
        return false;
      }
      if (dispatch) {
        const tr = state.tr;
        tr.replaceSelectionWith(schema.text(ch), true).scrollIntoView();
        dispatch(tr);
      }

      return true;
    });
  }
}

export type CommandFn = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean;

export function toggleMarkType(markType: MarkType, attrs?: Attrs) {
  const defaultToggleMark = toggleMark(markType, attrs);

  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // disallow non-code marks when the selection is contained within a code mark
    // (this is a pandoc constraint). note that we can allow them if the selection
    // contains the code mark range entirely (as in that case the code mark will
    // nest within the other mark)
    if (markType !== state.schema.marks.code) {
      if (markIsActive(state, state.schema.marks.code)) {
        const codeRange = getMarkRange(state.selection.$anchor, state.schema.marks.code);
        if (
          codeRange &&
          selectionIsWithinRange(state.selection, codeRange) &&
          !selectionHasRange(state.selection, codeRange)
        ) {
          return false;
        }
      }
    }

    // default implementation
    return defaultToggleMark(state, dispatch);
  };
}

export function toggleList(listType: NodeType, itemType: NodeType, prefs: EditorUIPrefs): CommandFn {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const { selection } = state;
    const { $from, $to } = selection;
    const range = $from.blockRange($to);

    if (!range) {
      return false;
    }

    const parentList = findParentNode(isList)(selection);

    if (range.depth >= 1 && parentList && range.depth - parentList.depth <= 1) {
      if (isList(parentList.node) && listType.validContent(parentList.node.content)) {
        if (parentList.node.type !== listType) {
          if (dispatch) {
            const tr: Transaction = state.tr;
            const attrs: { tight?: boolean } = {};
            if (parentList.node.attrs.tight) {
              attrs.tight = true;
            }
            tr.setNodeMarkup(parentList.pos, listType, attrs);
            dispatch(tr);
          }
          return true;
        } else {
          return liftListItem(itemType)(state, dispatch);
        }
      }
    }

    // if we are in a heading then this isn't valid
    if (findParentNodeOfType(state.schema.nodes.heading)(state.selection)) {
      return false;
    }

    // reflect tight preference
    const tight = prefs.listSpacing() === kListSpacingTight;

    return wrapInList(listType, { tight })(state, dispatch);
  };
}

export function toggleBlockType(type: NodeType, toggletype: NodeType, attrs = {}): CommandFn {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!dispatch) {
      return type === toggletype || setBlockType(type, { ...attrs })(state, dispatch);
    }

    // if the type has pandoc attrs then see if we can transfer from the existing node
    let pandocAttr: Attrs = {};
    if (pandocAttrInSpec(type.spec)) {
      const parentNode = state.selection.$anchor.node();
      if (parentNode && pandocAttrAvailable(parentNode.attrs)) {
        pandocAttr = pandocAttrFrom(parentNode.attrs);
      }
    }

    return setBlockType(type, { ...attrs, ...pandocAttr })(state, dispatch);
  };
}

export function toggleWrap(type: NodeType, attrs?: Attrs): CommandFn {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const isActive = nodeIsActive(state, type, attrs);

    if (isActive) {
      return lift(state, dispatch);
    }

    return wrapIn(type, attrs)(state, dispatch);
  };
}

export function insertNode(nodeType: NodeType, attrs = {}, selectAfter = false): CommandFn {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!canInsertNode(state, nodeType)) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;
      tr.replaceSelectionWith(nodeType.create(attrs));
      if (selectAfter) {
        if (requiresTrailingP(tr.selection)) {
          insertTrailingP(tr);
          setTextSelection(tr.selection.to + 1, 1)(tr);
        }
      }
      dispatch(tr);
    }

    return true;
  };
}

export function exitNode(
  nodeType: NodeType,
  depth: number,
  allowKey: boolean,
  filter: (node: ProsemirrorNode) => boolean = () => true,
) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    // must be within the node type and pass the filter
    const { $head, $anchor } = state.selection;
    if ($head.parent.type !== nodeType || !filter($head.parent)) {
      return false;
    }

    // must be empty and entirely contained by the node
    if (!$head.sameParent($anchor) || !state.selection.empty) {
      return !allowKey;
    }

    // must be at the end of the node
    const node = findParentNodeOfType(nodeType)(state.selection)!;
    const endCaptionPos = node.pos + node.node.nodeSize - 1;
    if (state.selection.from !== endCaptionPos) {
      return !allowKey;
    }

    // insert must be valid in container above
    const above = $head.node(depth);
    const after = $head.indexAfter(depth);
    const type = above.contentMatchAt(after).defaultType!;
    if (!above.canReplaceWith(after, after, type)) {
      return !allowKey;
    }

    // perform insert
    if (dispatch) {
      const tr = state.tr;
      const pos = node.pos + node.node.nodeSize + (Math.abs(depth) - 1);
      tr.insert(pos, type.create());
      setTextSelection(pos, 1)(tr);
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}
