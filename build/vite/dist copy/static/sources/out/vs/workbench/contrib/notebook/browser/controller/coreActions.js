/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { getNotebookEditorFromEditorPane, cellRangeToViewCells } from '../notebookBrowser.js';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, REPL_NOTEBOOK_IS_ACTIVE_EDITOR } from '../../common/notebookContextKeys.js';
import { isICellRange } from '../../common/notebookRange.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isEditorCommandsContext } from '../../../../common/editor.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { isEqual } from '../../../../../base/common/resources.js';
// Kernel Command
export const SELECT_KERNEL_ID = '_notebook.selectKernel';
export const NOTEBOOK_ACTIONS_CATEGORY = localize2('notebookActions.category', 'Notebook');
export const CELL_TITLE_CELL_GROUP_ID = 'inline/cell';
export const CELL_TITLE_OUTPUT_GROUP_ID = 'inline/output';
export const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = 100 /* KeybindingWeight.EditorContrib */; // smaller than Suggest Widget, etc
export const NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT = 200 /* KeybindingWeight.WorkbenchContrib */ + 1; // higher than Workbench contribution (such as Notebook List View), etc
export var CellToolbarOrder;
(function (CellToolbarOrder) {
    CellToolbarOrder[CellToolbarOrder["RunSection"] = 0] = "RunSection";
    CellToolbarOrder[CellToolbarOrder["EditCell"] = 1] = "EditCell";
    CellToolbarOrder[CellToolbarOrder["ExecuteAboveCells"] = 2] = "ExecuteAboveCells";
    CellToolbarOrder[CellToolbarOrder["ExecuteCellAndBelow"] = 3] = "ExecuteCellAndBelow";
    CellToolbarOrder[CellToolbarOrder["SaveCell"] = 4] = "SaveCell";
    CellToolbarOrder[CellToolbarOrder["SplitCell"] = 5] = "SplitCell";
    CellToolbarOrder[CellToolbarOrder["ClearCellOutput"] = 6] = "ClearCellOutput";
})(CellToolbarOrder || (CellToolbarOrder = {}));
export var CellOverflowToolbarGroups;
(function (CellOverflowToolbarGroups) {
    CellOverflowToolbarGroups["Copy"] = "1_copy";
    CellOverflowToolbarGroups["Insert"] = "2_insert";
    CellOverflowToolbarGroups["Edit"] = "3_edit";
    CellOverflowToolbarGroups["Share"] = "4_share";
})(CellOverflowToolbarGroups || (CellOverflowToolbarGroups = {}));
export function getContextFromActiveEditor(editorService) {
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor || !editor.hasModel()) {
        return;
    }
    const activeCell = editor.getActiveCell();
    const selectedCells = editor.getSelectionViewModels();
    return {
        cell: activeCell,
        selectedCells,
        notebookEditor: editor
    };
}
function getWidgetFromUri(accessor, uri) {
    const notebookEditorService = accessor.get(INotebookEditorService);
    const widget = notebookEditorService.listNotebookEditors().find(widget => widget.hasModel() && widget.textModel.uri.toString() === uri.toString());
    if (widget && widget.hasModel()) {
        return widget;
    }
    return undefined;
}
export function getContextFromUri(accessor, context) {
    const uri = URI.revive(context);
    if (uri) {
        const widget = getWidgetFromUri(accessor, uri);
        if (widget) {
            return {
                notebookEditor: widget,
            };
        }
    }
    return undefined;
}
export function findTargetCellEditor(context, targetCell) {
    let foundEditor = undefined;
    for (const [, codeEditor] of context.notebookEditor.codeEditors) {
        if (isEqual(codeEditor.getModel()?.uri, targetCell.uri)) {
            foundEditor = codeEditor;
            break;
        }
    }
    return foundEditor;
}
export class NotebookAction extends Action2 {
    constructor(desc) {
        if (desc.f1 !== false) {
            desc.f1 = false;
            const f1Menu = {
                id: MenuId.CommandPalette,
                when: ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, REPL_NOTEBOOK_IS_ACTIVE_EDITOR)
            };
            if (!desc.menu) {
                desc.menu = [];
            }
            else if (!Array.isArray(desc.menu)) {
                desc.menu = [desc.menu];
            }
            desc.menu = [
                ...desc.menu,
                f1Menu
            ];
        }
        desc.category = NOTEBOOK_ACTIONS_CATEGORY;
        super(desc);
    }
    async run(accessor, context, ...additionalArgs) {
        sendEntryTelemetry(accessor, this.desc.id, context);
        if (!this.isNotebookActionContext(context)) {
            context = this.getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs);
            if (!context) {
                return;
            }
        }
        return this.runWithContext(accessor, context);
    }
    isNotebookActionContext(context) {
        return !!context && !!context.notebookEditor;
    }
    getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs) {
        return getContextFromActiveEditor(accessor.get(IEditorService));
    }
}
// todo@rebornix, replace NotebookAction with this
export class NotebookMultiCellAction extends Action2 {
    constructor(desc) {
        if (desc.f1 !== false) {
            desc.f1 = false;
            const f1Menu = {
                id: MenuId.CommandPalette,
                when: NOTEBOOK_IS_ACTIVE_EDITOR
            };
            if (!desc.menu) {
                desc.menu = [];
            }
            else if (!Array.isArray(desc.menu)) {
                desc.menu = [desc.menu];
            }
            desc.menu = [
                ...desc.menu,
                f1Menu
            ];
        }
        desc.category = NOTEBOOK_ACTIONS_CATEGORY;
        super(desc);
    }
    parseArgs(accessor, ...args) {
        return undefined;
    }
    /**
     * The action/command args are resolved in following order
     * `run(accessor, cellToolbarContext)` from cell toolbar
     * `run(accessor, ...args)` from command service with arguments
     * `run(accessor, undefined)` from keyboard shortcuts, command palatte, etc
     */
    async run(accessor, ...additionalArgs) {
        const context = additionalArgs[0];
        sendEntryTelemetry(accessor, this.desc.id, context);
        const isFromCellToolbar = isCellToolbarContext(context);
        if (isFromCellToolbar) {
            return this.runWithContext(accessor, context);
        }
        // handle parsed args
        const parsedArgs = this.parseArgs(accessor, ...additionalArgs);
        if (parsedArgs) {
            return this.runWithContext(accessor, parsedArgs);
        }
        // no parsed args, try handle active editor
        const editor = getEditorFromArgsOrActivePane(accessor);
        if (editor) {
            const selectedCellRange = editor.getSelections().length === 0 ? [editor.getFocus()] : editor.getSelections();
            return this.runWithContext(accessor, {
                ui: false,
                notebookEditor: editor,
                selectedCells: cellRangeToViewCells(editor, selectedCellRange)
            });
        }
    }
}
export class NotebookCellAction extends NotebookAction {
    isCellActionContext(context) {
        return !!context && !!context.notebookEditor && !!context.cell;
    }
    getCellContextFromArgs(accessor, context, ...additionalArgs) {
        return undefined;
    }
    async run(accessor, context, ...additionalArgs) {
        sendEntryTelemetry(accessor, this.desc.id, context);
        if (this.isCellActionContext(context)) {
            return this.runWithContext(accessor, context);
        }
        const contextFromArgs = this.getCellContextFromArgs(accessor, context, ...additionalArgs);
        if (contextFromArgs) {
            return this.runWithContext(accessor, contextFromArgs);
        }
        const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
        if (this.isCellActionContext(activeEditorContext)) {
            return this.runWithContext(accessor, activeEditorContext);
        }
    }
}
export const executeNotebookCondition = ContextKeyExpr.or(ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0), ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0));
function sendEntryTelemetry(accessor, id, context) {
    if (context) {
        const telemetryService = accessor.get(ITelemetryService);
        if (context.source) {
            telemetryService.publicLog2('workbenchActionExecuted', { id: id, from: context.source });
        }
        else if (URI.isUri(context)) {
            telemetryService.publicLog2('workbenchActionExecuted', { id: id, from: 'cellEditorContextMenu' });
        }
        else if (context && 'from' in context && context.from === 'cellContainer') {
            telemetryService.publicLog2('workbenchActionExecuted', { id: id, from: 'cellContainer' });
        }
        else {
            const from = isCellToolbarContext(context) ? 'cellToolbar' : (isEditorCommandsContext(context) ? 'editorToolbar' : 'other');
            telemetryService.publicLog2('workbenchActionExecuted', { id: id, from: from });
        }
    }
}
function isCellToolbarContext(context) {
    return !!context && !!context.notebookEditor && context.$mid === 13 /* MarshalledId.NotebookCellActionContext */;
}
function isMultiCellArgs(arg) {
    if (arg === undefined) {
        return false;
    }
    const ranges = arg.ranges;
    if (!ranges) {
        return false;
    }
    if (!Array.isArray(ranges) || ranges.some(range => !isICellRange(range))) {
        return false;
    }
    if (arg.document) {
        const uri = URI.revive(arg.document);
        if (!uri) {
            return false;
        }
    }
    return true;
}
export function getEditorFromArgsOrActivePane(accessor, context) {
    const editorFromUri = getContextFromUri(accessor, context)?.notebookEditor;
    if (editorFromUri) {
        return editorFromUri;
    }
    const editor = getNotebookEditorFromEditorPane(accessor.get(IEditorService).activeEditorPane);
    if (!editor || !editor.hasModel()) {
        return;
    }
    return editor;
}
export function parseMultiCellExecutionArgs(accessor, ...args) {
    const firstArg = args[0];
    if (isMultiCellArgs(firstArg)) {
        const editor = getEditorFromArgsOrActivePane(accessor, firstArg.document);
        if (!editor) {
            return;
        }
        const ranges = firstArg.ranges;
        const selectedCells = ranges.map(range => editor.getCellsInRange(range).slice(0)).flat();
        const autoReveal = firstArg.autoReveal;
        return {
            ui: false,
            notebookEditor: editor,
            selectedCells,
            autoReveal
        };
    }
    // handle legacy arguments
    if (isICellRange(firstArg)) {
        // cellRange, document
        const secondArg = args[1];
        const editor = getEditorFromArgsOrActivePane(accessor, secondArg);
        if (!editor) {
            return;
        }
        return {
            ui: false,
            notebookEditor: editor,
            selectedCells: editor.getCellsInRange(firstArg)
        };
    }
    // let's just execute the active cell
    const context = getContextFromActiveEditor(accessor.get(IEditorService));
    return context ? {
        ui: false,
        notebookEditor: context.notebookEditor,
        selectedCells: context.selectedCells ?? [],
        cell: context.cell
    } : undefined;
}
export const cellExecutionArgs = [
    {
        isOptional: true,
        name: 'options',
        description: 'The cell range options',
        schema: {
            'type': 'object',
            'required': ['ranges'],
            'properties': {
                'ranges': {
                    'type': 'array',
                    items: [
                        {
                            'type': 'object',
                            'required': ['start', 'end'],
                            'properties': {
                                'start': {
                                    'type': 'number'
                                },
                                'end': {
                                    'type': 'number'
                                }
                            }
                        }
                    ]
                },
                'document': {
                    'type': 'object',
                    'description': 'The document uri',
                },
                'autoReveal': {
                    'type': 'boolean',
                    'description': 'Whether the cell should be revealed into view automatically'
                }
            }
        }
    }
];
MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
    submenu: MenuId.NotebookCellInsert,
    title: localize('notebookMenu.insertCell', "Insert Cell"),
    group: "2_insert" /* CellOverflowToolbarGroups.Insert */,
    when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    submenu: MenuId.NotebookCellTitle,
    title: localize('notebookMenu.cellTitle', "Notebook Cell"),
    group: "2_insert" /* CellOverflowToolbarGroups.Insert */,
    when: NOTEBOOK_EDITOR_FOCUSED
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
    title: localize('miShare', "Share"),
    submenu: MenuId.EditorContextShare,
    group: "4_share" /* CellOverflowToolbarGroups.Share */
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29yZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQW1CLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFHekYsT0FBTyxFQUFFLCtCQUErQixFQUF5QyxvQkFBb0IsRUFBd0IsTUFBTSx1QkFBdUIsQ0FBQztBQUMzSixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUscUJBQXFCLEVBQUUsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3UCxPQUFPLEVBQWMsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBTTFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVsRSxpQkFBaUI7QUFDakIsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsd0JB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