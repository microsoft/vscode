/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { isEqual } from 'vs/base/common/resources';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class NotebookBreakpoints extends Disposable implements IWorkbenchContribution {
	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@INotebookService _notebookService: INotebookService,
	) {
		super();

		this._register(_notebookService.onWillRemoveNotebookDocument(model => {
			this.updateBreakpoints(model);
		}));
	}

	private updateBreakpoints(model: NotebookTextModel): void {
		const bps = this._debugService.getModel().getBreakpoints();
		if (!bps.length || !model.cells.length) {
			return;
		}

		const idxMap = new ResourceMap<number>();
		model.cells.forEach((cell, i) => {
			idxMap.set(cell.uri, i);
		});

		bps.forEach(bp => {
			const idx = idxMap.get(bp.uri);
			if (typeof idx !== 'number') {
				return;
			}

			const notebook = CellUri.parse(bp.uri)?.notebook;
			if (!notebook) {
				return;
			}

			const newUri = CellUri.generate(notebook, idx);
			if (isEqual(newUri, bp.uri)) {
				return;
			}

			this._debugService.removeBreakpoints(bp.getId());
			this._debugService.addBreakpoints(newUri, [
				{
					column: bp.column,
					condition: bp.condition,
					enabled: bp.enabled,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					lineNumber: bp.lineNumber
				}
			]);
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookBreakpoints, LifecyclePhase.Restored);
