/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor, } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ChangeTabDisplaySize, IndentUsingSpaces, IndentUsingTabs, IndentationToSpacesAction, IndentationToSpacesCommand, IndentationToTabsAction, IndentationToTabsCommand } from 'vs/editor/contrib/indentation/browser/indentation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { isCompositeNotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IModelService } from 'vs/editor/common/services/model';
import * as nls from 'vs/nls';

export function registerNotebookIndentationActions() {
	IndentationToSpacesAction.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => {
		if (!isCompositeNotebookEditorInput(editor)) {
			return false;
		}

		const configurationService = accessor.get(IConfigurationService);

		const model = editor.getModel();
		if (!model) {
			return false;
		}
		const modelOpts = model.getOptions();
		const selection = editor.getSelection();
		if (!selection) {
			return false;
		}
		const command = new IndentationToSpacesCommand(selection, modelOpts.tabSize);

		editor.pushUndoStop();
		editor.executeCommands(IndentationToSpacesAction.id, [command]);
		editor.pushUndoStop();

		model.updateOptions({
			insertSpaces: true
		});

		// store the initial values of the configuration
		const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as any;
		const initialIndentSize = initialConfig['editor.indentSize'] ?? modelOpts.indentSize;
		const initialTabSize = initialConfig['editor.tabSize'] ?? modelOpts.tabSize;
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
		return true;
	});

	IndentationToTabsAction.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => {
		if (!isCompositeNotebookEditorInput(editor)) {
			return false;
		}
		const configurationService = accessor.get(IConfigurationService);

		const model = editor.getModel();
		if (!model) {
			return false;
		}
		const modelOpts = model.getOptions();
		const selection = editor.getSelection();
		if (!selection) {
			return false;
		}
		const command = new IndentationToTabsCommand(selection, modelOpts.tabSize);

		editor.pushUndoStop();
		editor.executeCommands(IndentationToTabsAction.id, [command]);
		editor.pushUndoStop();

		model.updateOptions({
			insertSpaces: false
		});

		// store the initial values of the configuration
		const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) as any;
		const initialTabSize = initialConfig['editor.tabSize'] ?? modelOpts.tabSize;
		const initialIndentSize = initialConfig['editor.indentSize'] ?? modelOpts.indentSize;
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

	IndentUsingTabs.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, false, false));
	IndentUsingSpaces.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, true, false));
	ChangeTabDisplaySize.addImplementation(100, (accessor: ServicesAccessor, editor: ICodeEditor): boolean | Promise<void> => changeNotebookIndentation(accessor, editor, true, true));
}

function changeNotebookIndentation(accessor: ServicesAccessor, editor: ICodeEditor, insertSpaces: boolean, displaySizeOnly: boolean) {
	if (!isCompositeNotebookEditorInput(editor)) {
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
