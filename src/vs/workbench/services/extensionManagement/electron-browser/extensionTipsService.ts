/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionTipsService, IExecutableBasedExtensionTip, IWorkspaceTips } from 'vs/platform/extensionManagement/common/extensionManagement';

class NativeExtensionTipsService implements IExtensionTipsService {

	_serviceBrand: any;

	private readonly channel: IChannel;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		this.channel = sharedProcessService.getChannel('extensionTipsService');
	}

	getImportantExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return this.channel.call<IExecutableBasedExtensionTip[]>('getImportantExecutableBasedTips');
	}

	getOtherExecutableBasedTips(): Promise<IExecutableBasedExtensionTip[]> {
		return this.channel.call<IExecutableBasedExtensionTip[]>('getOtherExecutableBasedTips');
	}

	getAllWorkspacesTips(): Promise<IWorkspaceTips[]> {
		return this.channel.call<IWorkspaceTips[]>('getAllWorkspacesTips');
	}

}

registerSingleton(IExtensionTipsService, NativeExtensionTipsService);
