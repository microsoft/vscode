/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IModelService } from 'vs/editor/common/services/model';
import { ILink } from 'vs/editor/common/languages';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { OUTPUT_MODE_ID, LOG_MODE_ID } from 'vs/workbench/services/output/common/output';
import { OutputLinkComputer } from 'vs/workbench/contrib/output/common/outputLinkComputer';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { createWebWorker } from 'vs/base/browser/defaultWorkerFactory';
import { IWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { WorkerTextModelSyncClient } from 'vs/editor/common/services/textModelSync/textModelSync.impl';

export class OutputLinkProvider extends Disposable {

	private static readonly DISPOSE_WORKER_TIME = 3 * 60 * 1000; // dispose worker after 3 minutes of inactivity

	private worker?: OutputLinkWorkerClient;
	private disposeWorkerScheduler: RunOnceScheduler;
	private linkProviderRegistration: IDisposable | undefined;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this.disposeWorkerScheduler = new RunOnceScheduler(() => this.disposeWorker(), OutputLinkProvider.DISPOSE_WORKER_TIME);

		this.registerListeners();
		this.updateLinkProviderWorker();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateLinkProviderWorker()));
	}

	private updateLinkProviderWorker(): void {

		// Setup link provider depending on folders being opened or not
		const folders = this.contextService.getWorkspace().folders;
		if (folders.length > 0) {
			if (!this.linkProviderRegistration) {
				this.linkProviderRegistration = this.languageFeaturesService.linkProvider.register([{ language: OUTPUT_MODE_ID, scheme: '*' }, { language: LOG_MODE_ID, scheme: '*' }], {
					provideLinks: async model => {
						const links = await this.provideLinks(model.uri);

						return links && { links };
					}
				});
			}
		} else {
			dispose(this.linkProviderRegistration);
			this.linkProviderRegistration = undefined;
		}

		// Dispose worker to recreate with folders on next provideLinks request
		this.disposeWorker();
		this.disposeWorkerScheduler.cancel();
	}

	private getOrCreateWorker(): OutputLinkWorkerClient {
		this.disposeWorkerScheduler.schedule();

		if (!this.worker) {
			this.worker = new OutputLinkWorkerClient(this.contextService, this.modelService);
		}

		return this.worker;
	}

	private async provideLinks(modelUri: URI): Promise<ILink[]> {
		return this.getOrCreateWorker().provideLinks(modelUri);
	}

	private disposeWorker(): void {
		if (this.worker) {
			this.worker.dispose();
			this.worker = undefined;
		}
	}
}

class OutputLinkWorkerClient extends Disposable {
	private readonly _workerClient: IWorkerClient<OutputLinkComputer>;
	private readonly _workerTextModelSyncClient: WorkerTextModelSyncClient;
	private readonly _initializeBarrier: Promise<void>;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IModelService modelService: IModelService,
	) {
		super();
		this._workerClient = this._register(createWebWorker<OutputLinkComputer>(
			'vs/workbench/contrib/output/common/outputLinkComputer',
			'OutputLinkDetectionWorker'
		));
		this._workerTextModelSyncClient = WorkerTextModelSyncClient.create(this._workerClient, modelService);
		this._initializeBarrier = this._ensureWorkspaceFolders();
	}

	private async _ensureWorkspaceFolders(): Promise<void> {
		await this._workerClient.proxy.$setWorkspaceFolders(this.contextService.getWorkspace().folders.map(folder => folder.uri.toString()));
	}

	public async provideLinks(modelUri: URI): Promise<ILink[]> {
		await this._initializeBarrier;
		await this._workerTextModelSyncClient.ensureSyncedResources([modelUri]);
		return this._workerClient.proxy.$computeLinks(modelUri.toString());
	}
}
