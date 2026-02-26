/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewService, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { IBrowserViewWorkbenchService, IBrowserViewModel, BrowserViewModel } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Event } from '../../../../base/common/event.js';

export class BrowserViewWorkbenchService implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	private readonly _browserViewService: IBrowserViewService;
	private readonly _models = new Map<string, IBrowserViewModel>();

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
		this._browserViewService = ProxyChannel.toService<IBrowserViewService>(channel);
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
}
