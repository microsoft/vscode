/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class NotebookKernelDetection extends Disposable implements IWorkbenchContribution {
	private _detectionMap = new Map<string, IDisposable>();
	constructor(
		@INotebookService _notebookService: INotebookService,
		@INotebookKernelService _notebookKernelService: INotebookKernelService,
		@IExtensionService _extensionService: IExtensionService
	) {
		super();

		this._register(_extensionService.onWillActivateByEvent(e => {
			if (e.event.startsWith('onNotebook:')) {
				if (_extensionService.activationEventIsDone(e.event)) {
					return;
				}

				// parse the event to get the notebook type
				const notebookType = e.event.substring('onNotebook:'.length);

				const task = _notebookKernelService.registerNotebookKernelDetectionTask({
					notebookType: notebookType
				});

				this._detectionMap.set(notebookType, task);
			}
		}));

		this._register(_extensionService.onDidChangeExtensionsStatus(() => {
			for (const [notebookType, task] of this._detectionMap) {
				if (_extensionService.activationEventIsDone(`onNotebook:${notebookType}`)) {
					task.dispose();
				}
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookKernelDetection, LifecyclePhase.Restored);
