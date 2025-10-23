/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IAction2Options, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { getNotebookEditorFromEditorPane, IActiveNotebookEditor, ICellViewModel, cellRangeToViewCells, ICellOutputViewModel } from '../notebookBrowser.js';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, REPL_NOTEBOOK_IS_ACTIVE_EDITOR } from '../../common/notebookContextKeys.js';
import { ICellRange, isICellRange } from '../../common/notebookRange.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isEditorCommandsContext } from '../../../../common/editor.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { TypeConstraint } from '../../../../../base/common/types.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { isEqual } from '../../../../../base/common/resources.js';

// Kernel Command
export const SELECT_KERNEL_ID = '_notebook.selectKernel';
export const NOTEBOOK_ACTIONS_CATEGORY = localize2('notebookActions.category', 'Notebook');

export const CELL_TITLE_CELL_GROUP_ID = 'inline/cell';
export const CELL_TITLE_OUTPUT_GROUP_ID = 'inline/output';

export const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc
export const NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT = KeybindingWeight.WorkbenchContrib + 1; // higher than Workbench contribution (such as Notebook List View), etc

export const enum CellToolbarOrder {
	RunSection,
	EditCell,
	ExecuteAboveCells,
	ExecuteCellAndBelow,
	SaveCell,
	SplitCell,
	ClearCellOutput
}

export const enum CellOverflowToolbarGroups {
	Copy = '1_copy',
	Insert = '2_insert',
	Edit = '3_edit',
	Share = '4_share'
}

export interface INotebookActionContext {
	readonly cell?: ICellViewModel;
	readonly notebookEditor: IActiveNotebookEditor;
	readonly ui?: boolean;
	readonly selectedCells?: readonly ICellViewModel[];
	readonly autoReveal?: boolean;
}

export interface INotebookCellToolbarActionContext extends INotebookActionContext {
	readonly ui: true;
	readonly cell: ICellViewModel;
}

export interface INotebookCommandContext extends INotebookActionContext {
	readonly ui: false;
	readonly selectedCells: readonly ICellViewModel[];
}

export interface INotebookCellActionContext extends INotebookActionContext {
	cell: ICellViewModel;
}

export interface INotebookOutputActionContext extends INotebookCellActionContext {
	outputViewModel: ICellOutputViewModel;
}

export function getContextFromActiveEditor(editorService: IEditorService): INotebookActionContext | undefined {
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

function getWidgetFromUri(accessor: ServicesAccessor, uri: URI) {
	const notebookEditorService = accessor.get(INotebookEditorService);
	const widget = notebookEditorService.listNotebookEditors().find(widget => widget.hasModel() && widget.textModel.uri.toString() === uri.toString());

	if (widget && widget.hasModel()) {
		return widget;
	}

	return undefined;
}

export function getContextFromUri(accessor: ServicesAccessor, context?: any) {
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

export function findTargetCellEditor(context: INotebookCellActionContext, targetCell: ICellViewModel) {
	let foundEditor: ICodeEditor | undefined = undefined;
	for (const [, codeEditor] of context.notebookEditor.codeEditors) {
		if (isEqual(codeEditor.getModel()?.uri, targetCell.uri)) {
			foundEditor = codeEditor;
			break;
		}
	}

	return foundEditor;
}

export abstract class NotebookAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, REPL_NOTEBOOK_IS_ACTIVE_EDITOR)
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
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

	async run(accessor: ServicesAccessor, context?: any, ...additionalArgs: any[]): Promise<void> {
		sendEntryTelemetry(accessor, this.desc.id, context);

		if (!this.isNotebookActionContext(context)) {
			context = this.getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs);
			if (!context) {
				return;
			}
		}

		return this.runWithContext(accessor, context);
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void>;

	private isNotebookActionContext(context?: unknown): context is INotebookActionContext {
		return !!context && !!(context as INotebookActionContext).notebookEditor;
	}

	getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: any, ...additionalArgs: any[]): INotebookActionContext | undefined {
		return getContextFromActiveEditor(accessor.get(IEditorService));
	}
}

// todo@rebornix, replace NotebookAction with this
export abstract class NotebookMultiCellAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: NOTEBOOK_IS_ACTIVE_EDITOR
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
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

	parseArgs(accessor: ServicesAccessor, ...args: unknown[]): INotebookCommandContext | undefined {
		return undefined;
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void>;

	/**
	 * The action/command args are resolved in following order
	 * `run(accessor, cellToolbarContext)` from cell toolbar
	 * `run(accessor, ...args)` from command service with arguments
	 * `run(accessor, undefined)` from keyboard shortcuts, command palatte, etc
	 */
	async run(accessor: ServicesAccessor, ...additionalArgs: any[]): Promise<void> {
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
			const selectedCellRange: ICellRange[] = editor.getSelections().length === 0 ? [editor.getFocus()] : editor.getSelections();


			return this.runWithContext(accessor, {
				ui: false,
				notebookEditor: editor,
				selectedCells: cellRangeToViewCells(editor, selectedCellRange)
			});
		}
	}
}

export abstract class NotebookCellAction<T = INotebookCellActionContext> extends NotebookAction {
	protected isCellActionContext(context?: unknown): context is INotebookCellActionContext {
		return !!context && !!(context as INotebookCellActionContext).notebookEditor && !!(context as INotebookCellActionContext).cell;
	}

	protected getCellContextFromArgs(accessor: ServicesAccessor, context?: T, ...additionalArgs: any[]): INotebookCellActionContext | undefined {
		return undefined;
	}

	override async run(accessor: ServicesAccessor, context?: INotebookCellActionContext, ...additionalArgs: any[]): Promise<void> {
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

	abstract override runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void>;
}

export const executeNotebookCondition = ContextKeyExpr.or(ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0), ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0));

interface IMultiCellArgs {
	ranges: ICellRange[];
	document?: URI;
	autoReveal?: boolean;
}

function sendEntryTelemetry(accessor: ServicesAccessor, id: string, context?: any) {
	if (context) {
		const telemetryService = accessor.get(ITelemetryService);
		if (context.source) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: id, from: context.source });
		} else if (URI.isUri(context)) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: id, from: 'cellEditorContextMenu' });
		} else if (context && 'from' in context && context.from === 'cellContainer') {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: id, from: 'cellContainer' });
		} else {
			const from = isCellToolbarContext(context) ? 'cellToolbar' : (isEditorCommandsContext(context) ? 'editorToolbar' : 'other');
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: id, from: from });
		}
	}
}

function isCellToolbarContext(context?: unknown): context is INotebookCellToolbarActionContext {
	// eslint-disable-next-line local/code-no-any-casts
	return !!context && !!(context as INotebookActionContext).notebookEditor && (context as any).$mid === MarshalledId.NotebookCellActionContext;
}

function isMultiCellArgs(arg: unknown): arg is IMultiCellArgs {
	if (arg === undefined) {
		return false;
	}
	const ranges = (arg as IMultiCellArgs).ranges;
	if (!ranges) {
		return false;
	}

	if (!Array.isArray(ranges) || ranges.some(range => !isICellRange(range))) {
		return false;
	}

	if ((arg as IMultiCellArgs).document) {
		const uri = URI.revive((arg as IMultiCellArgs).document);

		if (!uri) {
			return false;
		}
	}

	return true;
}

export function getEditorFromArgsOrActivePane(accessor: ServicesAccessor, context?: UriComponents): IActiveNotebookEditor | undefined {
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

export function parseMultiCellExecutionArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
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

export const cellExecutionArgs: ReadonlyArray<{
	readonly name: string;
	readonly isOptional?: boolean;
	readonly description?: string;
	readonly constraint?: TypeConstraint;
	readonly schema?: IJSONSchema;
}> = [
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
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	submenu: MenuId.NotebookCellTitle,
	title: localize('notebookMenu.cellTitle', "Notebook Cell"),
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_FOCUSED
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
	title: localize('miShare', "Share"),
	submenu: MenuId.EditorContextShare,
	group: CellOverflowToolbarGroups.Share
});
