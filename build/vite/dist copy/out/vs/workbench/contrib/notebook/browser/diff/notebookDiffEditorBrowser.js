/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../nls.js';
export var DiffSide;
(function (DiffSide) {
    DiffSide[DiffSide["Original"] = 0] = "Original";
    DiffSide[DiffSide["Modified"] = 1] = "Modified";
})(DiffSide || (DiffSide = {}));
export const DIFF_CELL_MARGIN = 16;
export const NOTEBOOK_DIFF_CELL_INPUT = new RawContextKey('notebook.diffEditor.cell.inputChanged', false);
export const NOTEBOOK_DIFF_METADATA = new RawContextKey('notebook.diffEditor.metadataChanged', false);
export const NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY = 'notebook.diffEditor.cell.ignoreWhitespace';
export const NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE = new RawContextKey(NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, false);
export const NOTEBOOK_DIFF_CELL_PROPERTY = new RawContextKey('notebook.diffEditor.cell.property.changed', false);
export const NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED = new RawContextKey('notebook.diffEditor.cell.property.expanded', false);
export const NOTEBOOK_DIFF_CELLS_COLLAPSED = new RawContextKey('notebook.diffEditor.allCollapsed', undefined, localize('notebook.diffEditor.allCollapsed', "Whether all cells in notebook diff editor are collapsed"));
export const NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS = new RawContextKey('notebook.diffEditor.hasUnchangedCells', undefined, localize('notebook.diffEditor.hasUnchangedCells', "Whether there are unchanged cells in the notebook diff editor"));
export const NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN = new RawContextKey('notebook.diffEditor.unchangedCellsAreHidden', undefined, localize('notebook.diffEditor.unchangedCellsAreHidden', "Whether the unchanged cells in the notebook diff editor are hidden"));
export const NOTEBOOK_DIFF_ITEM_KIND = new RawContextKey('notebook.diffEditor.item.kind', undefined, localize('notebook.diffEditor.item.kind', "The kind of item in the notebook diff editor, Cell, Metadata or Output"));
export const NOTEBOOK_DIFF_ITEM_DIFF_STATE = new RawContextKey('notebook.diffEditor.item.state', undefined, localize('notebook.diffEditor.item.state', "The diff state of item in the notebook diff editor, delete, insert, modified or unchanged"));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tEaWZmRWRpdG9yQnJvd3Nlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZFZGl0b3JCcm93c2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBVWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQU14RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHakQsTUFBTSxDQUFOLElBQVksUUFHWDtBQUhELFdBQVksUUFBUTtJQUNuQiwrQ0FBWSxDQUFBO0lBQ1osK0NBQVksQ0FBQTtBQUNiLENBQUMsRUFIVyxRQUFRLEtBQVIsUUFBUSxRQUduQjtBQXlJRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLENBQUM7QUFDbkMsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxhQUFhLENBQVUsdUNBQXVDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbkgsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxhQUFhLENBQVUscUNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDL0csTUFBTSxDQUFDLE1BQU0sd0NBQXdDLEdBQUcsMkNBQTJDLENBQUM7QUFDcEcsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsSUFBSSxhQUFhLENBQVUsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDaEksTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxhQUFhLENBQVUsMkNBQTJDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDMUgsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsSUFBSSxhQUFhLENBQVUsNENBQTRDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDcEksTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxhQUFhLENBQVUsa0NBQWtDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSx5REFBeUQsQ0FBQyxDQUFDLENBQUM7QUFDaE8sTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsSUFBSSxhQUFhLENBQVUsdUNBQXVDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSwrREFBK0QsQ0FBQyxDQUFDLENBQUM7QUFDcFAsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsSUFBSSxhQUFhLENBQVUsNkNBQTZDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyw2Q0FBNkMsRUFBRSxvRUFBb0UsQ0FBQyxDQUFDLENBQUM7QUFDeFEsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxhQUFhLENBQVUsK0JBQStCLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSx3RUFBd0UsQ0FBQyxDQUFDLENBQUM7QUFDbk8sTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxhQUFhLENBQVUsZ0NBQWdDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSwyRkFBMkYsQ0FBQyxDQUFDLENBQUMifQ==