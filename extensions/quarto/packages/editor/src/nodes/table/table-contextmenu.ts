/*
 * table-contextmenu.ts
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

import { ResolvedPos } from 'prosemirror-model';
import { isInTable } from 'prosemirror-tables';

import { EditorUI } from '../../api/ui-types';
import { EditorCommandId } from '../../api/command';
import { findParentNodeOfTypeClosestToPos } from 'prosemirror-utils';
import { ContextMenuSource } from '../../api/menu';
import { EditorView } from 'prosemirror-view';


export function tableContextMenuHandler(ui: EditorUI) {
  
  return (view: EditorView, $pos: ResolvedPos) : (ContextMenuSource | null)  => {

    if (!findParentNodeOfTypeClosestToPos($pos, view.state.schema.nodes.table)) {
      return null;
    }

    const items = [
      { command: EditorCommandId.TableAddRowBefore },
      { command: EditorCommandId.TableAddRowAfter },
      { separator: true },
      { command: EditorCommandId.TableAddColumnBefore },
      { command: EditorCommandId.TableAddColumnAfter },
      { separator: true },
      { command: EditorCommandId.TableDeleteRow },
      { command: EditorCommandId.TableDeleteColumn },
      { separator: true },
      { command: EditorCommandId.TableDeleteTable },
      { separator: true },
      {
        text: ui.context.translateText('Align Column'),
        subMenu: {
          items: [
            { command: EditorCommandId.TableAlignColumnLeft },
            { command: EditorCommandId.TableAlignColumnCenter },
            { command: EditorCommandId.TableAlignColumnRight },
            { separator: true },
            { command: EditorCommandId.TableAlignColumnDefault },
          ],
        },
      },
      { separator: true },
      { command: EditorCommandId.TableToggleHeader },
      { command: EditorCommandId.TableToggleCaption },
    ];

    return { items: async () => items, preventSelectionChange: isInTable };
  };
 
}
