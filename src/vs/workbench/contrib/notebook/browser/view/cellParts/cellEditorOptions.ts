/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ActiveEditorContext } from '../../../../../common/contextkeys.js';
import { INotebookCellToolbarActionContext, INotebookCommandContext, NotebookMultiCellAction, NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { IBaseCellEditorOptions, ICellViewModel } from '../../notebookBrowser.js';
import { NOTEBOOK_CELL_LINE_NUMBERS, NOTEBOOK_EDITOR_FOCUSED } from '../../../common/notebookContextKeys.js';
import { CellContentPart } from '../cellPart.js';
import { NotebookCellInternalMetadata, NOTEBOOK_EDITOR_ID } from '../../../common/notebookCommon.js';
import { NotebookOptions } from '../../notebookOptions.js';
import { CellViewModelStateChangeEvent } from '../../notebookViewEvents.js';
import { ITextModelUpdateOptions } from '../../../../../../editor/common/model.js';

//todo@Yoyokrazy implenets is needed or not?
export class CellEditorOptions extends CellContentPart implements ITextModelUpdateOptions {
	private _lineNumbers: 'on' | 'off' | 'inherit' = 'inherit';
	private _tabSize?: number;
	private _indentSize?: number | 'tabSize';
	private _insertSpaces?: boolean;

	set tabSize(value: number | undefined) {
		if (this._tabSize !== value) {
			this._tabSize = value;
			this._onDidChange.fire();
		}
	}

	get tabSize() {
		return this._tabSize;
	}

	set indentSize(value: number | 'tabSize' | undefined) {
		if (this._indentSize !== value) {
			this._indentSize = value;
			this._onDidChange.fire();
		}
	}

	get indentSize() {
		return this._indentSize;
	}

	set insertSpaces(value: boolean | undefined) {
		if (this._insertSpaces !== value) {
			this._insertSpaces = value;
			this._onDidChange.fire();
		}
	}

	get insertSpaces() {
		return this._insertSpaces;
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;
	private _value: IEditorOptions;

	constructor(
		private readonly base: IBaseCellEditorOptions,
		readonly notebookOptions: NotebookOptions,
		readonly configurationService: IConfigurationService) {
		super();

		this._register(base.onDidChange(() => {
			this._recomputeOptions();
		}));

		this._value = this._computeEditorOptions();
	}

	override updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent) {
		if (e.cellLineNumberChanged) {
			this.setLineNumbers(element.lineNumbers);
		}
	}

	private _recomputeOptions(): void {
		this._value = this._computeEditorOptions();
		this._onDidChange.fire();
	}

	private _computeEditorOptions() {
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
				if (this.configurationService.getValue<'on' | 'off'>('notebook.lineNumbers') === 'on') {
					if (value.lineNumbers === 'off') {
						cellRenderLineNumber = 'on';
					} // otherwise just use the editor setting
				} else {
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

		if (value.lineNumbers !== cellRenderLineNumber) {
			return {
				...value,
				...{ lineNumbers: cellRenderLineNumber }
			};
		} else {
			return Object.assign({}, value);
		}
	}

	getUpdatedValue(internalMetadata: NotebookCellInternalMetadata, cellUri: URI): IEditorOptions {
		const options = this.getValue(internalMetadata, cellUri);
		delete options.hover; // This is toggled by a debug editor contribution

		return options;
	}

	getValue(internalMetadata: NotebookCellInternalMetadata, cellUri: URI): IEditorOptions {
		return {
			...this._value,
			...{
				padding: this.notebookOptions.computeEditorPadding(internalMetadata, cellUri)
			}
		};
	}

	getDefaultValue(): IEditorOptions {
		return {
			...this._value,
			...{
				padding: { top: 12, bottom: 12 }
			}
		};
	}

	setLineNumbers(lineNumbers: 'on' | 'off' | 'inherit'): void {
		this._lineNumbers = lineNumbers;
		this._recomputeOptions();
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
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
			precondition: NOTEBOOK_EDITOR_FOCUSED,
			menu: [
				{
					id: MenuId.NotebookToolbar,
					group: 'notebookLayout',
					order: 2,
					when: ContextKeyExpr.equals('config.notebook.globalToolbar', true)
				}],
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.notEquals('config.notebook.lineNumbers', 'off'),
				title: localize('notebook.showLineNumbers', "Notebook Line Numbers"),
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const renderLiNumbers = configurationService.getValue<'on' | 'off'>('notebook.lineNumbers') === 'on';

		if (renderLiNumbers) {
			configurationService.updateValue('notebook.lineNumbers', 'off');
		} else {
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
			toggled: ContextKeyExpr.or(
				NOTEBOOK_CELL_LINE_NUMBERS.isEqualTo('on'),
				ContextKeyExpr.and(NOTEBOOK_CELL_LINE_NUMBERS.isEqualTo('inherit'), ContextKeyExpr.equals('config.notebook.lineNumbers', 'on'))
			)
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			this.updateCell(accessor.get(IConfigurationService), context.cell);
		} else {
			const configurationService = accessor.get(IConfigurationService);
			context.selectedCells.forEach(cell => {
				this.updateCell(configurationService, cell);
			});
		}
	}

	private updateCell(configurationService: IConfigurationService, cell: ICellViewModel) {
		const renderLineNumbers = configurationService.getValue<'on' | 'off'>('notebook.lineNumbers') === 'on';
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
		} else {
			cell.lineNumbers = 'on';
		}

	}
});
