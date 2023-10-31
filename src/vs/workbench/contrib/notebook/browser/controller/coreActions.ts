/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getNotebookEditorFromEditorPane, IActiveNotebookEditor, ICellViewModel, cellRangeToViewCells, ICellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { ICellRange, isICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorCommandsContext } from 'vs/workbench/common/editor';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { TypeConstraint } from 'vs/base/common/types';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { isEqual } from 'vs/base/common/resources';

// Kernel Command
export const SELECT_KERNEL_ID = '_notebook.selectKernel';
export const NOTEBOOK_ACTIONS_CATEGORY = { value: localize('notebookActions.category', "Notebook"), original: 'Notebook' };

export const CELL_TITLE_CELL_GROUP_ID = 'inline/cell';
export const CELL_TITLE_OUTPUT_GROUP_ID = 'inline/output';

export const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc

export const enum CellToolbarOrder {
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
				when: ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR)
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
		const isFromUI = !!context;
		const from = isFromUI ? (this.isNotebookActionContext(context) ? 'notebookToolbar' : 'editorToolbar') : undefined;
		if (!this.isNotebookActionContext(context)) {
			context = this.getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs);
			if (!context) {
				return;
			}
		}

		if (from !== undefined) {
			const telemetryService = accessor.get(ITelemetryService);
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
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

	parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return undefined;
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void>;

	private isCellToolbarContext(context?: unknown): context is INotebookCellToolbarActionContext {
		return !!context && !!(context as INotebookActionContext).notebookEditor && (context as any).$mid === MarshalledId.NotebookCellActionContext;
	}
	private isEditorContext(context?: unknown): boolean {
		return !!context && (context as IEditorCommandsContext).groupId !== undefined;
	}

	/**
	 * The action/command args are resolved in following order
	 * `run(accessor, cellToolbarContext)` from cell toolbar
	 * `run(accessor, ...args)` from command service with arguments
	 * `run(accessor, undefined)` from keyboard shortcuts, command palatte, etc
	 */
	async run(accessor: ServicesAccessor, ...additionalArgs: any[]): Promise<void> {
		const context = additionalArgs[0];
		const isFromCellToolbar = this.isCellToolbarContext(context);
		const isFromEditorToolbar = this.isEditorContext(context);
		const from = isFromCellToolbar ? 'cellToolbar' : (isFromEditorToolbar ? 'editorToolbar' : 'other');
		const telemetryService = accessor.get(ITelemetryService);

		if (isFromCellToolbar) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
			return this.runWithContext(accessor, context);
		}

		// handle parsed args

		const parsedArgs = this.parseArgs(accessor, ...additionalArgs);
		if (parsedArgs) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
			return this.runWithContext(accessor, parsedArgs);
		}

		// no parsed args, try handle active editor
		const editor = getEditorFromArgsOrActivePane(accessor);
		if (editor) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });

			return this.runWithContext(accessor, {
				ui: false,
				notebookEditor: editor,
				selectedCells: cellRangeToViewCells(editor, editor.getSelections())
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
		if (this.isCellActionContext(context)) {
			const telemetryService = accessor.get(ITelemetryService);
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: 'cellToolbar' });

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
		selectedCells: context.selectedCells ?? []
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
