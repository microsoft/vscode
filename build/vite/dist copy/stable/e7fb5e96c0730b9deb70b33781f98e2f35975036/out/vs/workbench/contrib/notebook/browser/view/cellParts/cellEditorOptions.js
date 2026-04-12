/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ActiveEditorContext } from '../../../../../common/contextkeys.js';
import { NotebookMultiCellAction, NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { NOTEBOOK_CELL_LINE_NUMBERS, NOTEBOOK_EDITOR_FOCUSED } from '../../../common/notebookContextKeys.js';
import { CellContentPart } from '../cellPart.js';
import { NOTEBOOK_EDITOR_ID } from '../../../common/notebookCommon.js';
//todo@Yoyokrazy implenets is needed or not?
export class CellEditorOptions extends CellContentPart {
    set tabSize(value) {
        if (this._tabSize !== value) {
            this._tabSize = value;
            this._onDidChange.fire();
        }
    }
    get tabSize() {
        return this._tabSize;
    }
    set indentSize(value) {
        if (this._indentSize !== value) {
            this._indentSize = value;
            this._onDidChange.fire();
        }
    }
    get indentSize() {
        return this._indentSize;
    }
    set insertSpaces(value) {
        if (this._insertSpaces !== value) {
            this._insertSpaces = value;
            this._onDidChange.fire();
        }
    }
    get insertSpaces() {
        return this._insertSpaces;
    }
    constructor(base, notebookOptions, configurationService) {
        super();
        this.base = base;
        this.notebookOptions = notebookOptions;
        this.configurationService = configurationService;
        this._lineNumbers = 'inherit';
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(base.onDidChange(() => {
            this._recomputeOptions();
        }));
        this._value = this._computeEditorOptions();
    }
    updateState(element, e) {
        if (e.cellLineNumberChanged) {
            this.setLineNumbers(element.lineNumbers);
        }
    }
    _recomputeOptions() {
        this._value = this._computeEditorOptions();
        this._onDidChange.fire();
    }
    _computeEditorOptions() {
        const value = this.base.value; // base IEditorOptions
        // TODO @Yoyokrazy find a different way to get the editor overrides, this is not the right way
        const cellEditorOverridesRaw = this.notebookOptions.getDisplayOptions().editorOptionsCustomizations;
        const indentSize = cellEditorOverridesRaw?.['editor.indentSize'];
        if (indentSize !== undefined) {
            this.indentSize = indentSize;
        }
        const insertSpaces = cellEditorOverridesRaw?.['editor.insertSpaces'];
        if (insertSpaces !== undefined) {
            this.insertSpaces = insertSpaces;
        }
        const tabSize = cellEditorOverridesRaw?.['editor.tabSize'];
        if (tabSize !== undefined) {
            this.tabSize = tabSize;
        }
        let cellRenderLineNumber = value.lineNumbers;
        switch (this._lineNumbers) {
            case 'inherit':
                // inherit from the notebook setting
                if (this.configurationService.getValue('notebook.lineNumbers') === 'on') {
                    if (value.lineNumbers === 'off') {
                        cellRenderLineNumber = 'on';
                    } // otherwise just use the editor setting
                }
                else {
                    cellRenderLineNumber = 'off';
                }
                break;
            case 'on':
                // should turn on, ignore the editor line numbers off options
                if (value.lineNumbers === 'off') {
                    cellRenderLineNumber = 'on';
                } // otherwise just use the editor setting
                break;
            case 'off':
                cellRenderLineNumber = 'off';
                break;
        }
        const overrides = {};
        if (value.lineNumbers !== cellRenderLineNumber) {
            overrides.lineNumbers = cellRenderLineNumber;
        }
        if (this.notebookOptions.getLayoutConfiguration().disableRulers) {
            overrides.rulers = [];
        }
        return {
            ...value,
            ...overrides,
        };
    }
    getUpdatedValue(internalMetadata, cellUri) {
        const options = this.getValue(internalMetadata, cellUri);
        delete options.hover; // This is toggled by a debug editor contribution
        return options;
    }
    getValue(internalMetadata, cellUri) {
        return {
            ...this._value,
            ...{
                padding: this.notebookOptions.computeEditorPadding(internalMetadata, cellUri)
            }
        };
    }
    getDefaultValue() {
        return {
            ...this._value,
            ...{
                padding: { top: 12, bottom: 12 }
            }
        };
    }
    setLineNumbers(lineNumbers) {
        this._lineNumbers = lineNumbers;
        this._recomputeOptions();
    }
}
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'notebook',
    order: 100,
    type: 'object',
    'properties': {
        'notebook.lineNumbers': {
            type: 'string',
            enum: ['off', 'on'],
            default: 'off',
            markdownDescription: localize('notebook.lineNumbers', "Controls the display of line numbers in the cell editor.")
        }
    }
});
registerAction2(class ToggleLineNumberAction extends Action2 {
    constructor() {
        super({
            id: 'notebook.toggleLineNumbers',
            title: localize2('notebook.toggleLineNumbers', 'Toggle Notebook Line Numbers'),
            shortTitle: localize2('notebook.toggleLineNumbers.short', 'Line Numbers'),
            precondition: NOTEBOOK_EDITOR_FOCUSED,
            menu: [
                {
                    id: MenuId.NotebookToolbar,
                    group: 'notebookLayout',
                    order: 2,
                    when: ContextKeyExpr.equals('config.notebook.globalToolbar', true)
                }
            ],
            category: NOTEBOOK_ACTIONS_CATEGORY,
            f1: true,
            toggled: {
                condition: ContextKeyExpr.notEquals('config.notebook.lineNumbers', 'off'),
                title: localize('notebook.showLineNumbers', "Line Numbers"),
            }
        });
    }
    async run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const renderLiNumbers = configurationService.getValue('notebook.lineNumbers') === 'on';
        if (renderLiNumbers) {
            configurationService.updateValue('notebook.lineNumbers', 'off');
        }
        else {
            configurationService.updateValue('notebook.lineNumbers', 'on');
        }
    }
});
registerAction2(class ToggleActiveLineNumberAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: 'notebook.cell.toggleLineNumbers',
            title: localize('notebook.cell.toggleLineNumbers.title', "Show Cell Line Numbers"),
            precondition: ActiveEditorContext.isEqualTo(NOTEBOOK_EDITOR_ID),
            menu: [{
                    id: MenuId.NotebookCellTitle,
                    group: 'View',
                    order: 1
                }],
            toggled: ContextKeyExpr.or(NOTEBOOK_CELL_LINE_NUMBERS.isEqualTo('on'), ContextKeyExpr.and(NOTEBOOK_CELL_LINE_NUMBERS.isEqualTo('inherit'), ContextKeyExpr.equals('config.notebook.lineNumbers', 'on')))
        });
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            this.updateCell(accessor.get(IConfigurationService), context.cell);
        }
        else {
            const configurationService = accessor.get(IConfigurationService);
            context.selectedCells.forEach(cell => {
                this.updateCell(configurationService, cell);
            });
        }
    }
    updateCell(configurationService, cell) {
        const renderLineNumbers = configurationService.getValue('notebook.lineNumbers') === 'on';
        const cellLineNumbers = cell.lineNumbers;
        // 'on', 'inherit' 	-> 'on'
        // 'on', 'off'		-> 'off'
        // 'on', 'on'		-> 'on'
        // 'off', 'inherit'	-> 'off'
        // 'off', 'off'		-> 'off'
        // 'off', 'on'		-> 'on'
        const currentLineNumberIsOn = cellLineNumbers === 'on' || (cellLineNumbers === 'inherit' && renderLineNumbers);
        if (currentLineNumberIsOn) {
            cell.lineNumbers = 'off';
        }
        else {
            cell.lineNumbers = 'on';
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbEVkaXRvck9wdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2NlbGxFZGl0b3JPcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUd4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQTBCLE1BQU0sMEVBQTBFLENBQUM7QUFDekosT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTVGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRSxPQUFPLEVBQThELHVCQUF1QixFQUFFLHlCQUF5QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFakssT0FBTyxFQUFFLDBCQUEwQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDN0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pELE9BQU8sRUFBZ0Msa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUtyRyw0Q0FBNEM7QUFDNUMsTUFBTSxPQUFPLGlCQUFrQixTQUFRLGVBQWU7SUFNckQsSUFBSSxPQUFPLENBQUMsS0FBeUI7UUFDcEMsSUFB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