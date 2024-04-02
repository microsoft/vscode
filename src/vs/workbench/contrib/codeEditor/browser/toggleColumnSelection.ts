/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CoreNavigationCommands } from 'vs/editor/browser/coreCommands';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class ToggleColumnSelectionAction extends Action2 {

	static readonly ID = 'editor.action.toggleColumnSelection';

	constructor() {
		super({
			id: ToggleColumnSelectionAction.ID,
			title: {
				...localize2('toggleColumnSelection', "Toggle Column Selection Mode"),
				mnemonicTitle: localize({ key: 'miColumnSelection', comment: ['&& denotes a mnemonic'] }, "Column &&Selection Mode"),
			},
			f1: true,
			toggled: ContextKeyExpr.equals('config.editor.columnSelection', true),
			menu: {
				id: MenuId.MenubarSelectionMenu,
				group: '4_config',
				order: 2
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const codeEditorService = accessor.get(ICodeEditorService);

		const oldValue = configurationService.getValue('editor.columnSelection');
		const codeEditor = this._getCodeEditor(codeEditorService);
		await configurationService.updateValue('editor.columnSelection', !oldValue);
		const newValue = configurationService.getValue('editor.columnSelection');
		if (!codeEditor || codeEditor !== this._getCodeEditor(codeEditorService) || oldValue === newValue || !codeEditor.hasModel() || typeof oldValue !== 'boolean' || typeof newValue !== 'boolean') {
			return;
		}
		const viewModel = codeEditor._getViewModel();
		if (codeEditor.getOption(EditorOption.columnSelection)) {
			const selection = codeEditor.getSelection();
			const modelSelectionStart = new Position(selection.selectionStartLineNumber, selection.selectionStartColumn);
			const viewSelectionStart = viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelSelectionStart);
			const modelPosition = new Position(selection.positionLineNumber, selection.positionColumn);
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);

			CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, {
				position: modelSelectionStart,
				viewPosition: viewSelectionStart
			});
			const visibleColumn = viewModel.cursorConfig.visibleColumnFromColumn(viewModel, viewPosition);
			CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
				position: modelPosition,
				viewPosition: viewPosition,
				doColumnSelect: true,
				mouseColumn: visibleColumn + 1
			});
		} else {
			const columnSelectData = viewModel.getCursorColumnSelectData();
			const fromViewColumn = viewModel.cursorConfig.columnFromVisibleColumn(viewModel, columnSelectData.fromViewLineNumber, columnSelectData.fromViewVisualColumn);
			const fromPosition = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(columnSelectData.fromViewLineNumber, fromViewColumn));
			const toViewColumn = viewModel.cursorConfig.columnFromVisibleColumn(viewModel, columnSelectData.toViewLineNumber, columnSelectData.toViewVisualColumn);
			const toPosition = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(columnSelectData.toViewLineNumber, toViewColumn));

			codeEditor.setSelection(new Selection(fromPosition.lineNumber, fromPosition.column, toPosition.lineNumber, toPosition.column));
		}
	}

	private _getCodeEditor(codeEditorService: ICodeEditorService): ICodeEditor | null {
		const codeEditor = codeEditorService.getFocusedCodeEditor();
		if (codeEditor) {
			return codeEditor;
		}
		return codeEditorService.getActiveCodeEditor();
	}
}

registerAction2(ToggleColumnSelectionAction);
