/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { CDPEvent, CDPRequest, CDPResponse } from '../../../../platform/browserView/common/cdp/types.js';
import { IBrowserViewGroupService, ipcBrowserViewGroupChannelName } from '../../../../platform/browserView/common/browserViewGroup.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IBrowserViewCDPService } from '../common/browserView.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';

export class BrowserViewCDPService extends Disposable implements IBrowserViewCDPService {
	declare readonly _serviceBrand: undefined;

	private readonly _groupService: IBrowserViewGroupService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();
		const channel = mainProcessService.getChannel(ipcBrowserViewGroupChannelName);
		this._groupService = ProxyChannel.toService<IBrowserViewGroupService>(channel);
	}

	async createSessionGroup(browserId: string): Promise<string> {
		return this._groupService.createGroup(
			{ browserIds: [browserId] },
			{
				hostWindowId: mainWindow.vscodeWindowId,
				owner: { type: 'user' },
				session: { scope: BrowserViewStorageScope.Ephemeral }
			}
		);
	}

	async destroySessionGroup(groupId: string): Promise<void> {
		await this._groupService.destroyGroup(groupId);
	}

	async sendCDPMessage(groupId: string, message: CDPRequest): Promise<void> {
		await this._groupService.sendCDPMessage(groupId, message);
	}

	onCDPMessage(groupId: string): Event<CDPResponse | CDPEvent> {
		return this._groupService.onDynamicCDPMessage(groupId);
	}

	onDidDestroy(groupId: string): Event<void> {
		return this._groupService.onDynamicDidDestroy(groupId);
	}
}
