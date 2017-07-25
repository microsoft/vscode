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
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class OutputLinkProvider {

	private static DISPOSE_WORKER_TIME = 3 * 60 * 1000; // dispose worker after 3 minutes of inactivity

	private worker: MonacoWebWorker<OutputLinkComputer>;
	private disposeWorkerScheduler: RunOnceScheduler;
	private linkProviderRegistration: IDisposable;
	private workspacesCount: number;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IModelService private modelService: IModelService
	) {
		this.workspacesCount = 0;
		this.disposeWorkerScheduler = new RunOnceScheduler(() => this.disposeWorker(), OutputLinkProvider.DISPOSE_WORKER_TIME);

		this.registerListeners();
		this.updateLinkProviderWorker();
	}

	private registerListeners(): void {
		this.contextService.onDidChangeWorkspaceRoots(() => this.updateLinkProviderWorker());
	}

	private updateLinkProviderWorker(): void {

		// We have a workspace
		if (this.contextService.hasWorkspace()) {

			// Register link provider unless done already
			if (!this.linkProviderRegistration) {
				this.linkProviderRegistration = LinkProviderRegistry.register({ language: OUTPUT_MODE_ID, scheme: '*' }, {
					provideLinks: (model, token): Thenable<ILink[]> => {
						return wireCancellationToken(token, this.provideLinks(model.uri));
					}
				});
			}

			// Update link provider worker if workspace roots changed
			const newWorkspacesCount = this.contextService.getWorkspace().roots.length;
			if (this.workspacesCount !== newWorkspacesCount) {
				this.workspacesCount = newWorkspacesCount;

				// Next computer will trigger recompute
				this.disposeWorker();
				this.disposeWorkerScheduler.cancel();
			}
		}

		// Dispose link provider when no longer having a workspace
		else if (this.linkProviderRegistration) {
			this.workspacesCount = 0;
			dispose(this.linkProviderRegistration);
			this.linkProviderRegistration = void 0;
			this.disposeWorker();
			this.disposeWorkerScheduler.cancel();
		}
	}

	private getOrCreateWorker(): MonacoWebWorker<OutputLinkComputer> {
		this.disposeWorkerScheduler.schedule();

		if (!this.worker) {
			const createData: ICreateData = {
				workspaceFolders: this.contextService.getWorkspace().roots.map(root => root.toString())
			};

			this.worker = createWebWorker<OutputLinkComputer>(this.modelService, {
				moduleId: 'vs/workbench/parts/output/common/outputLinkComputer',
				createData,
				label: 'outputLinkComputer'
			});
		}

		return this.worker;
	}

	private provideLinks(modelUri: URI): TPromise<ILink[]> {
		return this.getOrCreateWorker().withSyncedResources([modelUri]).then(linkComputer => {
			return linkComputer.computeLinks(modelUri.toString());
		});
	}

	private disposeWorker(): void {
		if (this.worker) {
			this.worker.dispose();
			this.worker = null;
		}
	}
}
