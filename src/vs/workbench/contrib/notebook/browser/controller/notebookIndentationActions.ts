/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor, } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ChangeTabDisplaySize, IndentUsingSpaces, IndentUsingTabs, IndentationToSpacesAction, IndentationToSpacesCommand, IndentationToTabsAction, IndentationToTabsCommand } from 'vs/editor/contrib/indentation/browser/indentation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { isNotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IModelService } from 'vs/editor/common/services/model';
import * as nls from 'vs/nls';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
// import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';

export function registerNotebookIndentationActions() {
	IndentationToSpacesAction.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => {
		const editorService = accessor.get(IEditorService);
		const configurationService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);
		const textModelService = accessor.get(ITextModelService);
		const notebookEditorService = accessor.get(INotebookEditorService);

		// keep this check here to pop on non-notebook actions
		const activeInput = editorService.activeEditorPane?.input;
		const isNotebook = isNotebookEditorInput(activeInput);
		if (!isNotebook) {
			return false;
		}

		// get notebook editor to access all codeEditors
		const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value;
		if (!notebookEditor) {
			return false;
		}

		const disposable = new DisposableStore();
		try {
			Promise.all(notebookEditor.codeEditors.map(async cell => {
				const ref = await textModelService.createModelReference(cell[0].uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;
				if (!model) {
					return false;
				}
				const modelOpts = model.getOptions();

				const cellEditor = cell[1];
				const selection = cellEditor.getSelection();
				if (!selection) {
					return false;
				}

				const command = new IndentationToSpacesCommand(selection, modelOpts.tabSize);

				cellEditor.pushUndoStop();
				cellEditor.executeCommands(IndentationToSpacesAction.id, [command]);
				cellEditor.pushUndoStop();

				model.updateOptions({
					insertSpaces: true
				});

				return true;
			})).then(() => {
				// store the initial values of the configuration
				const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as any;
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
					'editor.insertSpaces': true
				});

				disposable.dispose();
				return true;
			});
		} catch {
			logService.error('Failed to convert indentation to spaces for notebook cells.');
			disposable.dispose();
			return false;
		}
		return true;
	});

	IndentationToTabsAction.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => {
		const editorService = accessor.get(IEditorService);
		const configurationService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);
		const textModelService = accessor.get(ITextModelService);
		const notebookEditorService = accessor.get(INotebookEditorService);

		// keep this check here to pop on non-notebook actions
		const activeInput = editorService.activeEditorPane?.input;
		const isNotebook = isNotebookEditorInput(activeInput);
		if (!isNotebook) {
			return false;
		}

		// get notebook editor to access all codeEditors
		const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value;
		if (!notebookEditor) {
			return false;
		}

		const disposable = new DisposableStore();
		try {
			Promise.all(notebookEditor.codeEditors.map(async cell => {
				const ref = await textModelService.createModelReference(cell[0].uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;
				if (!model) {
					return false;
				}
				const modelOpts = model.getOptions();

				const cellEditor = cell[1];
				const selection = cellEditor.getSelection();
				if (!selection) {
					return false;
				}

				const command = new IndentationToTabsCommand(selection, modelOpts.tabSize);

				cellEditor.pushUndoStop();
				cellEditor.executeCommands(IndentationToTabsAction.id, [command]);
				cellEditor.pushUndoStop();

				model.updateOptions({
					insertSpaces: false
				});

				return true;
			})).then(() => {
				// store the initial values of the configuration
				const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as any;
				const initialTabSize = initialConfig['editor.tabSize'];
				const initialIndentSize = initialConfig['editor.indentSize'];
				// remove the initial values from the configuration
				delete initialConfig['editor.indentSize'];
				delete initialConfig['editor.tabSize'];
				delete initialConfig['editor.insertSpaces'];

				configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
					...initialConfig,
					'editor.tabSize': initialTabSize,
					'editor.indentSize': initialIndentSize,
					'editor.insertSpaces': false
				});
				return true;
			});
		} catch {
			logService.error('Failed to convert indentation to spaces for notebook cells.');
			disposable.dispose();
			return false;
		}
		return true;
	});

	IndentUsingTabs.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, false, false));
	IndentUsingSpaces.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, true, false));
	ChangeTabDisplaySize.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, true, true));
}

function changeNotebookIndentation(accessor: ServicesAccessor, editor: ICodeEditor, insertSpaces: boolean, displaySizeOnly: boolean) {
	const editorService = accessor.get(IEditorService);
	const activeInput = editorService.activeEditorPane?.input;
	const isNotebook = isNotebookEditorInput(activeInput);
	if (!isNotebook) {
		return false;
	}

	const configurationService = accessor.get(IConfigurationService);
	const quickInputService = accessor.get(IQuickInputService);
	const modelService = accessor.get(IModelService);

	const model = editor.getModel();
	if (!model) {
		return false;
	}

	const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
	const modelOpts = model.getOptions();
	const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
		id: n.toString(),
		label: n.toString(),
		// add description for tabSize value set in the configuration
		description: (
			n === creationOpts.tabSize && n === modelOpts.tabSize
				? nls.localize('configuredTabSize', "Configured Tab Size")
				: n === creationOpts.tabSize
					? nls.localize('defaultTabSize', "Default Tab Size")
					: n === modelOpts.tabSize
						? nls.localize('currentTabSize', "Current Tab Size")
						: undefined
		)
	}));

	// auto focus the tabSize set for the current editor
	const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);

	// store the initial values of the configuration
	const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as any;
	const initialInsertSpaces = initialConfig['editor.insertSpaces'];
	// remove the initial values from the configuration
	delete initialConfig['editor.indentSize'];
	delete initialConfig['editor.tabSize'];
	delete initialConfig['editor.insertSpaces'];

	quickInputService.pick(picks, { placeHolder: nls.localize({ key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File"), activeItem: picks[autoFocusIndex] }).then(pick => {
		if (pick) {
			if (model && !model.isDisposed()) {
				const pickedVal = parseInt(pick.label, 10);
				if (displaySizeOnly) {
					model.updateOptions({
						tabSize: pickedVal
					});
					configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
						...initialConfig,
						'editor.tabSize': pickedVal,
						'editor.indentSize': pickedVal,
						'editor.insertSpaces': initialInsertSpaces
					});
				} else {
					model.updateOptions({
						tabSize: pickedVal,
						indentSize: pickedVal,
						insertSpaces: insertSpaces
					});
					configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
						...initialConfig,
						'editor.tabSize': pickedVal,
						'editor.indentSize': pickedVal,
						'editor.insertSpaces': insertSpaces
					});
				}
			}
		}
	});
	return true;
}
