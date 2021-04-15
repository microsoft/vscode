/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { CellStatusbarAlignment, INotebookCellStatusBarItem, INotebookCellStatusBarItemList, INotebookCellStatusBarItemProvider, INotebookDocumentFilter } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class CellStatusBarPlaceholderProvider implements INotebookCellStatusBarItemProvider {
	readonly selector: INotebookDocumentFilter = {
		filenamePattern: '**/*'
	};

	constructor(@INotebookService private readonly _notebookService: INotebookService) { }

	onDidChangeStatusBarItems?: Event<void> | undefined;

	async provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken): Promise<INotebookCellStatusBarItemList> {
		const doc = this._notebookService.getNotebookTextModel(uri);
		const cell = doc?.cells[index];
		if (typeof cell?.metadata.runState !== 'undefined') {
			return { items: [] };
		}

		const text = isWindows ? 'Ctrl + Alt + Enter to run' : 'Ctrl + Enter to run';
		const item = <INotebookCellStatusBarItem>{
			text,
			tooltip: text,
			alignment: CellStatusbarAlignment.Left,
			opacity: '0.7',
			onlyShowWhenActive: true
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
		this._register(notebookCellStatusBarService.registerCellStatusBarItemProvider(instantiationService.createInstance(CellStatusBarPlaceholderProvider)));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinCellStatusBarProviders, LifecyclePhase.Restored);
