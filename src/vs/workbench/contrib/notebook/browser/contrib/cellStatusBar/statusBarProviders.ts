/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CHANGE_CELL_LANGUAGE } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { CellKind, CellStatusbarAlignment, INotebookCellStatusBarItem, INotebookCellStatusBarItemList, INotebookCellStatusBarItemProvider } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class CellStatusBarLanguagePickerProvider implements INotebookCellStatusBarItemProvider {

	readonly viewType = '*';

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@IModeService private readonly _modeService: IModeService,
	) { }

	async provideCellStatusBarItems(uri: URI, index: number, _token: CancellationToken): Promise<INotebookCellStatusBarItemList | undefined> {
		const doc = this._notebookService.getNotebookTextModel(uri);
		const cell = doc?.cells[index];
		if (!cell) {
			return;
		}

		const languageId = cell.cellKind === CellKind.Markup ?
			'markdown' :
			(this._modeService.getModeIdForLanguageName(cell.language) || cell.language);
		const text = this._modeService.getLanguageName(languageId) || this._modeService.getLanguageName('plaintext');
		const item = <INotebookCellStatusBarItem>{
			text,
			command: CHANGE_CELL_LANGUAGE,
			tooltip: localize('notebook.cell.status.language', "Select Cell Language Mode"),
			alignment: CellStatusbarAlignment.Right,
			priority: -Number.MAX_SAFE_INTEGER
		};
		return {
			items: [item]
		};
	}
}

class BuiltinCellStatusBarProviders extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookCellStatusBarService notebookCellStatusBarService: INotebookCellStatusBarService) {
		super();

		const builtinProviders = [
			CellStatusBarLanguagePickerProvider,
		];
		builtinProviders.forEach(p => {
			this._register(notebookCellStatusBarService.registerCellStatusBarItemProvider(instantiationService.createInstance(p)));
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinCellStatusBarProviders, LifecyclePhase.Restored);
