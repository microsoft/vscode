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

	private static readonly DISPOSE_WORKER_TIME = 3 * 60 * 1000; // dispose worker after 3 minutes of inactivity

	private worker: MonacoWebWorker<OutputLinkComputer>;
	private disposeWorkerScheduler: RunOnceScheduler;
	private linkProviderRegistration: IDisposable;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IModelService private modelService: IModelService
	) {
		this.disposeWorkerScheduler = new RunOnceScheduler(() => this.disposeWorker(), OutputLinkProvider.DISPOSE_WORKER_TIME);

		this.registerListeners();
		this.updateLinkProviderWorker();
	}

	private registerListeners(): void {
		this.contextService.onDidChangeWorkspaceFolders(() => this.updateLinkProviderWorker());
	}

	private updateLinkProviderWorker(): void {

		// Setup link provider depending on folders being opened or not
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length > 0) {
			if (!this.linkProviderRegistration) {
				this.linkProviderRegistration = LinkProviderRegistry.register({ language: OUTPUT_MODE_ID, scheme: '*' }, {
					provideLinks: (model, token): Thenable<ILink[]> => {
						return wireCancellationToken(token, this.provideLinks(model.uri));
					}
				});
			}
		} else {
			this.linkProviderRegistration = dispose(this.linkProviderRegistration);
		}

		// Dispose worker to recreate with folders on next provideLinks request
		this.disposeWorker();
		this.disposeWorkerScheduler.cancel();
	}

	private getOrCreateWorker(): MonacoWebWorker<OutputLinkComputer> {
		this.disposeWorkerScheduler.schedule();

		if (!this.worker) {
			const createData: ICreateData = {
				workspaceFolders: this.contextService.getWorkspace().folders.map(folder => folder.uri.toString())
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
