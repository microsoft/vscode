/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { InsertSpaces, normalizeIndentation } from '../../../../../editor/common/core/misc/indentation.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';
import { NotebookSetting } from '../../common/notebookCommon.js';
import { isNotebookEditorInput } from '../../common/notebookEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

export class NotebookIndentUsingTabs extends Action2 {
	public static readonly ID = 'notebook.action.indentUsingTabs';

	constructor() {
		super({
			id: NotebookIndentUsingTabs.ID,
			title: nls.localize('indentUsingTabs', "Indent Using Tabs"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		changeNotebookIndentation(accessor, InsertSpaces.Tabs, false);
	}
}

export class NotebookIndentUsingSpaces extends Action2 {
	public static readonly ID = 'notebook.action.indentUsingSpaces';

	constructor() {
		super({
			id: NotebookIndentUsingSpaces.ID,
			title: nls.localize('indentUsingSpaces', "Indent Using Spaces"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		changeNotebookIndentation(accessor, InsertSpaces.Spaces, false);
	}
}

export class NotebookIndentUsingMixed extends Action2 {
	public static readonly ID = 'notebook.action.indentUsingMixed';

	constructor() {
		super({
			id: NotebookIndentUsingMixed.ID,
			title: nls.localize('indentUsingMixed', "Indent Using Tabs and Spaces"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		changeNotebookIndentation(accessor, InsertSpaces.Mixed, false);
	}
}

export class NotebookChangeTabDisplaySize extends Action2 {
	public static readonly ID = 'notebook.action.changeTabDisplaySize';

	constructor() {
		super({
			id: NotebookChangeTabDisplaySize.ID,
			title: nls.localize('changeTabDisplaySize', "Change Tab Display Size"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		changeNotebookIndentation(accessor, InsertSpaces.Spaces, true);
	}
}

export class NotebookIndentationToSpacesAction extends Action2 {
	public static readonly ID = 'notebook.action.convertIndentationToSpaces';

	constructor() {
		super({
			id: NotebookIndentationToSpacesAction.ID,
			title: nls.localize('convertIndentationToSpaces', "Convert Indentation to Spaces"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		return convertNotebookIndentation(accessor, InsertSpaces.Spaces);
	}
}

export class NotebookIndentationToTabsAction extends Action2 {
	public static readonly ID = 'notebook.action.convertIndentationToTabs';

	constructor() {
		super({
			id: NotebookIndentationToTabsAction.ID,
			title: nls.localize('convertIndentationToTabs', "Convert Indentation to Tabs"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		return convertNotebookIndentation(accessor, InsertSpaces.Tabs);
	}
}

export class NotebookIndentationToMixedAction extends Action2 {
	public static readonly ID = 'notebook.action.convertIndentationToMixed';

	constructor() {
		super({
			id: NotebookIndentationToMixedAction.ID,
			title: nls.localize('convertIndentationToMixed', "Convert Indentation to Tabs and Spaces"),
			precondition: undefined,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		return convertNotebookIndentation(accessor, InsertSpaces.Mixed);
	}
}

function changeNotebookIndentation(accessor: ServicesAccessor, insertSpaces: InsertSpaces, displaySizeOnly: boolean) {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);
	const notebookEditorService = accessor.get(INotebookEditorService);
	const quickInputService = accessor.get(IQuickInputService);

	// keep this check here to pop on non-notebook actions
	const activeInput = editorService.activeEditorPane?.input;
	const isNotebook = isNotebookEditorInput(activeInput);
	if (!isNotebook) {
		return;
	}

	// get notebook editor to access all codeEditors
	const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value;
	if (!notebookEditor) {
		return;
	}

	const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
		id: n.toString(),
		label: n.toString(),
	}));

	// store the initial values of the configuration
	const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as Record<string, unknown>;
	const initialIndentSize = initialConfig['editor.indentSize'];
	const initialTabSize = initialConfig['editor.tabSize'];
	const initialInsertSpaces = initialConfig['editor.insertSpaces'];
	// remove the initial values from the configuration
	delete initialConfig['editor.indentSize'];
	delete initialConfig['editor.tabSize'];
	delete initialConfig['editor.insertSpaces'];

	setTimeout(() => {
		const placeHolder = insertSpaces === InsertSpaces.Mixed
			? nls.localize('selectIndentWidth', "Select Indentation Size for Current File")
			: nls.localize({ key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File");
		quickInputService.pick(picks, { placeHolder }).then(pick => {
			if (pick) {
				const pickedVal = parseInt(pick.label, 10);
				if (displaySizeOnly) {
					configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
						...initialConfig,
						'editor.tabSize': pickedVal,
						'editor.indentSize': initialIndentSize,
						'editor.insertSpaces': initialInsertSpaces
					});
				} else if (insertSpaces === InsertSpaces.Mixed) {
					configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
						...initialConfig,
						'editor.tabSize': initialTabSize,
						'editor.indentSize': pickedVal,
						'editor.insertSpaces': insertSpaces
					});
				} else {
					configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
						...initialConfig,
						'editor.tabSize': pickedVal,
						'editor.indentSize': pickedVal,
						'editor.insertSpaces': insertSpaces
					});
				}

			}
		});
	}, 50/* quick input is sensitive to being opened so soon after another */);
}

async function convertNotebookIndentation(accessor: ServicesAccessor, insertSpaces: InsertSpaces): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);
	const logService = accessor.get(ILogService);
	const textModelService = accessor.get(ITextModelService);
	const notebookEditorService = accessor.get(INotebookEditorService);
	const bulkEditService = accessor.get(IBulkEditService);

	// keep this check here to pop on non-notebook
	const activeInput = editorService.activeEditorPane?.input;
	const isNotebook = isNotebookEditorInput(activeInput);
	if (!isNotebook) {
		return;
	}

	// get notebook editor to access all codeEditors
	const notebookTextModel = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value?.textModel;
	if (!notebookTextModel) {
		return;
	}

	const disposable = new DisposableStore();
	try {
		Promise.all(notebookTextModel.cells.map(async cell => {
			const ref = await textModelService.createModelReference(cell.uri);
			disposable.add(ref);
			const textEditorModel = ref.object.textEditorModel;

			const modelOpts = cell.textModel?.getOptions();
			if (!modelOpts) {
				return;
			}

			const edits = getIndentationEditOperations(textEditorModel, modelOpts.tabSize, insertSpaces);

			bulkEditService.apply(edits, { label: nls.localize('convertIndentation', "Convert Indentation"), code: 'undoredo.convertIndentation', });

		})).then(() => {
			// store the initial values of the configuration
			const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as Record<string, unknown>;
			const initialIndentSize = initialConfig['editor.indentSize'];
			const initialTabSize = initialConfig['editor.tabSize'];
			// remove the initial values from the configuration
			delete initialConfig['editor.indentSize'];
			delete initialConfig['editor.tabSize'];
			delete initialConfig['editor.insertSpaces'];

			configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
				...initialConfig,
				'editor.tabSize': initialTabSize,
				'editor.indentSize': initialIndentSize,
				'editor.insertSpaces': insertSpaces
			});
			disposable.dispose();
		});
	} catch {
		logService.error('Failed to convert indentation to spaces for notebook cells.');
	}
}

function getIndentationEditOperations(model: ITextModel, tabSize: number, insertSpaces: InsertSpaces): ResourceTextEdit[] {
	if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
		// Model is empty
		return [];
	}

	const spaces = ' '.repeat(tabSize);
	const spacesRegExp = new RegExp(spaces, 'gi');

	const edits: ResourceTextEdit[] = [];
	for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		if (lastIndentationColumn === 0) {
			lastIndentationColumn = model.getLineMaxColumn(lineNumber);
		}

		if (lastIndentationColumn === 1) {
			continue;
		}

		const originalIndentationRange = new Range(lineNumber, 1, lineNumber, lastIndentationColumn);
		const originalIndentation = model.getValueInRange(originalIndentationRange);
		const newIndentation = (insertSpaces === InsertSpaces.Mixed
			? normalizeIndentation(originalIndentation, tabSize, insertSpaces, tabSize)
			: insertSpaces === InsertSpaces.Spaces
				? originalIndentation.replace(/\t/ig, spaces)
				: originalIndentation.replace(spacesRegExp, '\t')
		);
		edits.push(new ResourceTextEdit(model.uri, { range: originalIndentationRange, text: newIndentation }));
	}
	return edits;
}

registerAction2(NotebookIndentUsingSpaces);
registerAction2(NotebookIndentUsingTabs);
registerAction2(NotebookIndentUsingMixed);
registerAction2(NotebookChangeTabDisplaySize);
registerAction2(NotebookIndentationToSpacesAction);
registerAction2(NotebookIndentationToTabsAction);
registerAction2(NotebookIndentationToMixedAction);
