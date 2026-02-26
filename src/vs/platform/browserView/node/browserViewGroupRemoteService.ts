/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { IBrowserViewGroup, IBrowserViewGroupService, IBrowserViewGroupViewEvent, ipcBrowserViewGroupChannelName } from '../common/browserViewGroup.js';

export const IBrowserViewGroupRemoteService = createDecorator<IBrowserViewGroupRemoteService>('browserViewGroupRemoteService');

/**
 * Remote-process service for managing browser view groups.
 *
 * Connects to the main-process {@link BrowserViewGroupMainService} via
 * IPC and provides {@link IBrowserViewGroup} instances for
 * interacting with groups.
 *
 * Usable from the shared process.
 */
export interface IBrowserViewGroupRemoteService {
	readonly _serviceBrand: undefined;

	/**
	 * Create a new browser view group.
	 */
	createGroup(): Promise<IBrowserViewGroup>;
}

/**
 * Remote proxy for a browser view group living in the main process.
 */
class RemoteBrowserViewGroup extends Disposable implements IBrowserViewGroup {
	constructor(
		readonly id: string,
		private readonly groupService: IBrowserViewGroupService,
	) {
		super();

		this._register(groupService.onDynamicDidDestroy(this.id)(() => {
			// Avoid loops
			this.dispose(true);
		}));
	}

	get onDidAddView(): Event<IBrowserViewGroupViewEvent> {
		return this.groupService.onDynamicDidAddView(this.id);
	}

	get onDidRemoveView(): Event<IBrowserViewGroupViewEvent> {
		return this.groupService.onDynamicDidRemoveView(this.id);
	}

	get onDidDestroy(): Event<void> {
		return this.groupService.onDynamicDidDestroy(this.id);
	}

	async addView(viewId: string): Promise<void> {
		return this.groupService.addViewToGroup(this.id, viewId);
	}

	async removeView(viewId: string): Promise<void> {
		return this.groupService.removeViewFromGroup(this.id, viewId);
	}

	async getDebugWebSocketEndpoint(): Promise<string> {
		return this.groupService.getDebugWebSocketEndpoint(this.id);
	}

	override dispose(fromService = false): void {
		if (!fromService) {
			this.groupService.destroyGroup(this.id);
		}
		super.dispose();
	}
}

export class BrowserViewGroupRemoteService implements IBrowserViewGroupRemoteService {
	declare readonly _serviceBrand: undefined;

	private readonly _groupService: IBrowserViewGroupService;
	private readonly _groups = new Map<string, IBrowserViewGroup>();

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		const channel = mainProcessService.getChannel(ipcBrowserViewGroupChannelName);
		this._groupService = ProxyChannel.toService<IBrowserViewGroupService>(channel);
	}

	async createGroup(): Promise<IBrowserViewGroup> {
		const id = await this._groupService.createGroup();
		return this._wrap(id);
	}

	private _wrap(id: string): IBrowserViewGroup {
		const group = new RemoteBrowserViewGroup(id, this._groupService);
		this._groups.set(id, group);

		Event.once(group.onDidDestroy)(() => {
			this._groups.delete(id);
		});

		return group;
	}
}
