/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CoreNavigationCommands } from '../../../../editor/browser/coreCommands.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
export class ToggleColumnSelectionAction extends Action2 {
    static { this.ID = 'editor.action.toggleColumnSelection'; }
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
    async run(accessor) {
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
        if (codeEditor.getOption(28 /* EditorOption.columnSelection */)) {
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
        }
        else {
            const columnSelectData = viewModel.getCursorColumnSelectData();
            const fromViewColumn = viewModel.cursorConfig.columnFromVisibleColumn(viewModel, columnSelectData.fromViewLineNumber, columnSelectData.fromViewVisualColumn);
            const fromPosition = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(columnSelectData.fromViewLineNumber, fromViewColumn));
            const toViewColumn = viewModel.cursorConfig.columnFromVisibleColumn(viewModel, columnSelectData.toViewLineNumber, columnSelectData.toViewVisualColumn);
            const toPosition = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(columnSelectData.toViewLineNumber, toViewColumn));
            codeEditor.setSelection(new Selection(fromPosition.lineNumber, fromPosition.column, toPosition.lineNumber, toPosition.column));
        }
    }
    _getCodeEditor(codeEditorService) {
        const codeEditor = codeEditorService.getFocusedCodeEditor();
        if (codeEditor) {
            return codeEditor;
        }
        return codeEditorService.getActiveCodeEditor();
    }
}
registerAction2(ToggleColumnSelectionAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlQ29sdW1uU2VsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9icm93c2VyL3RvZ2dsZUNvbHVtblNlbGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUc5RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBR3hFLE1BQU0sT0FBTywyQkFBNEIsU0FBUSxPQUFPO2FBRXZDLE9BQUUsR0FBRyxxQ0FBcUMsQ0FBQztJQUUzRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwyQkFBMkIsQ0FBQyxFQUFFO1lBQ2xDLEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSw4QkFBOEIsQ0FBQztnQkFDckUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUseUJBQXlCLENBQUM7YUFDcEg7WUFDRCxFQUFFLEVBQUUsSUFB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