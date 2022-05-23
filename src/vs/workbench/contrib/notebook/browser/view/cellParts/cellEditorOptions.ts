/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IEditorOptions, LineNumbersType } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { INotebookCellToolbarActionContext, INotebookCommandContext, NotebookMultiCellAction, NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { IBaseCellEditorOptions, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NOTEBOOK_CELL_LINE_NUMBERS, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { NotebookCellInternalMetadata, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/common/notebookOptions';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';

export class CellEditorOptions extends CellPart {
	private _lineNumbers: 'on' | 'off' | 'inherit' = 'inherit';
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;
	private _value: IEditorOptions;

	constructor(private readonly base: IBaseCellEditorOptions, readonly notebookOptions: NotebookOptions, readonly configurationService: IConfigurationService) {
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
		const renderLineNumbers = this.configurationService.getValue<'on' | 'off'>('notebook.lineNumbers') === 'on';
		const lineNumbers: LineNumbersType = renderLineNumbers ? 'on' : 'off';

		const value = this.base.value;

		if (value.lineNumbers !== lineNumbers) {
			return {
				...value,
				...{ lineNumbers }
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
		if (this._lineNumbers === 'inherit') {
			const renderLiNumbers = this.configurationService.getValue<'on' | 'off'>('notebook.lineNumbers') === 'on';
			const lineNumbers: LineNumbersType = renderLiNumbers ? 'on' : 'off';
			this._value.lineNumbers = lineNumbers;
		} else {
			this._value.lineNumbers = lineNumbers as LineNumbersType;
		}
		this._onDidChange.fire();
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
			title: { value: localize('notebook.toggleLineNumbers', "Toggle Notebook Line Numbers"), original: 'Toggle Notebook Line Numbers' },
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
				title: { value: localize('notebook.showLineNumbers', "Show Notebook Line Numbers"), original: 'Show Notebook Line Numbers' },
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
