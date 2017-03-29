/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { RunOnceScheduler, wireCancellationToken } from 'vs/base/common/async';
import { IModelService } from 'vs/editor/common/services/modelService';
import { LinkProviderRegistry, ILink } from 'vs/editor/common/modes';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { OUTPUT_MODE_ID } from 'vs/workbench/parts/output/common/output';
import { MonacoWebWorker, createWebWorker } from 'vs/editor/common/services/webWorker';
import { ICreateData, OutputLinkComputer } from 'vs/workbench/parts/output/common/outputLinkComputer';

export class OutputLinkProvider {

	private static DISPOSE_WORKER_TIME = 3 * 60 * 1000; // dispose worker after 3 minutes of inactivity

	private _modelService: IModelService;
	private _workspaceResource: URI;

	private _worker: MonacoWebWorker<OutputLinkComputer>;
	private _disposeWorker: RunOnceScheduler;

	constructor(
		contextService: IWorkspaceContextService,
		modelService: IModelService
	) {
		let workspace = contextService.getWorkspace();

		// Does not do anything unless there is a workspace...
		if (workspace) {
			this._modelService = modelService;

			this._workspaceResource = workspace.resource;

			LinkProviderRegistry.register({ language: OUTPUT_MODE_ID, scheme: '*' }, {
				provideLinks: (model, token): Thenable<ILink[]> => {
					return wireCancellationToken(token, this._provideLinks(model.uri));
				}
			});

			this._worker = null;
			this._disposeWorker = new RunOnceScheduler(() => {
				if (this._worker) {
					this._worker.dispose();
					this._worker = null;
				}
			}, OutputLinkProvider.DISPOSE_WORKER_TIME);
		}
	}

	private _getOrCreateWorker(): MonacoWebWorker<OutputLinkComputer> {
		this._disposeWorker.schedule();
		if (!this._worker) {
			let createData: ICreateData = {
				workspaceResourceUri: this._workspaceResource.toString()
			};
			this._worker = createWebWorker<OutputLinkComputer>(this._modelService, {
				moduleId: 'vs/workbench/parts/output/common/outputLinkComputer',
				createData: createData,
				label: 'outputLinkComputer'
			});
		}
		return this._worker;
	}

	private _provideLinks(modelUri: URI): TPromise<ILink[]> {
		return this._getOrCreateWorker().withSyncedResources([modelUri]).then((linkComputer) => {
			return linkComputer.computeLinks(modelUri.toString());
		});
	}
}
