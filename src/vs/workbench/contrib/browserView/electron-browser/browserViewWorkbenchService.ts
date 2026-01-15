/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewService, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel, BrowserViewModel, IRecentUrl } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

const RECENT_URLS_STORAGE_KEY = 'browserView.recentUrls';
const MAX_RECENT_URLS = 10;

export class BrowserViewWorkbenchService extends Disposable implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	private readonly _browserViewService: IBrowserViewService;
	private readonly _models = new Map<string, IBrowserViewModel>();

	private readonly _onDidChangeRecentUrls = this._register(new Emitter<void>());
	readonly onDidChangeRecentUrls: Event<void> = this._onDidChangeRecentUrls.event;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this._browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
	}

	isRecentUrlHistoryEnabled(): boolean {
		return this.configurationService.getValue<boolean>('workbench.browser.rememberRecentUrls') ?? true;
	}

	async getOrCreateBrowserViewModel(id: string): Promise<IBrowserViewModel> {
		let model = this._models.get(id);
		if (model) {
			return model;
		}

		model = this.instantiationService.createInstance(BrowserViewModel, id, this._browserViewService);
		this._models.set(id, model);

		// Initialize the model with current state
		await model.initialize();

		// Clean up model when disposed
		Event.once(model.onWillDispose)(() => {
			this._models.delete(id);
		});

		return model;
	}

	async clearGlobalStorage(): Promise<void> {
		return this._browserViewService.clearGlobalStorage();
	}

	async clearWorkspaceStorage(): Promise<void> {
		const workspaceId = this.workspaceContextService.getWorkspace().id;
		return this._browserViewService.clearWorkspaceStorage(workspaceId);
	}

	addRecentUrl(url: string): void {
		if (!this.isRecentUrlHistoryEnabled()) {
			return;
		}

		const recentUrls = this.getRecentUrls();

		// Remove existing entry if present (to update timestamp)
		const existingIndex = recentUrls.findIndex(entry => entry.url === url);
		if (existingIndex !== -1) {
			recentUrls.splice(existingIndex, 1);
		}

		// Add to the beginning of the list
		recentUrls.unshift({
			url,
			timestamp: Date.now()
		});

		// Limit the list size
		if (recentUrls.length > MAX_RECENT_URLS) {
			recentUrls.length = MAX_RECENT_URLS;
		}

		this.saveRecentUrls(recentUrls);
		this._onDidChangeRecentUrls.fire();
	}

	getRecentUrls(): IRecentUrl[] {
		const stored = this.storageService.get(RECENT_URLS_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!stored) {
			return [];
		}

		try {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is IRecentUrl =>
						typeof entry === 'object' &&
						entry !== null &&
						typeof entry.url === 'string' &&
						typeof entry.timestamp === 'number'
				);
			}
		} catch {
			// Invalid JSON, return empty array
		}

		return [];
	}

	removeRecentUrl(url: string): void {
		const recentUrls = this.getRecentUrls();
		const index = recentUrls.findIndex(entry => entry.url === url);
		if (index !== -1) {
			recentUrls.splice(index, 1);
			this.saveRecentUrls(recentUrls);
			this._onDidChangeRecentUrls.fire();
		}
	}

	clearRecentUrls(): void {
		this.storageService.remove(RECENT_URLS_STORAGE_KEY, StorageScope.WORKSPACE);
		this._onDidChangeRecentUrls.fire();
	}

	private saveRecentUrls(recentUrls: IRecentUrl[]): void {
		this.storageService.store(RECENT_URLS_STORAGE_KEY, JSON.stringify(recentUrls), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
