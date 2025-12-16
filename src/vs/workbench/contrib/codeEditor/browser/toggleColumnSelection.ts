/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { CoreNavigationCommands } from '../../../../editor/browser/coreCommands.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

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
