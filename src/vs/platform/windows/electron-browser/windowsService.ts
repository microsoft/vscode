/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened, IRecent, isRecentWorkspace } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class WindowsService implements IWindowsService {

	_serviceBrand: undefined;

	private channel: IChannel;

	get onRecentlyOpenedChange(): Event<void> { return this.channel.listen('onRecentlyOpenedChange'); }

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('windows');
	}

	addRecentlyOpened(recent: IRecent[]): Promise<void> {
		return this.channel.call('addRecentlyOpened', recent);
	}

	removeFromRecentlyOpened(paths: Array<URI>): Promise<void> {
		return this.channel.call('removeFromRecentlyOpened', paths);
	}

	clearRecentlyOpened(): Promise<void> {
		return this.channel.call('clearRecentlyOpened');
	}

	async getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		const recentlyOpened: IRecentlyOpened = await this.channel.call('getRecentlyOpened', windowId);
		recentlyOpened.workspaces.forEach(recent => isRecentWorkspace(recent) ? recent.workspace = reviveWorkspaceIdentifier(recent.workspace) : recent.folderUri = URI.revive(recent.folderUri));
		recentlyOpened.files.forEach(recent => recent.fileUri = URI.revive(recent.fileUri));

		return recentlyOpened;
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		return this.channel.call('openExtensionDevelopmentHostWindow', [args, env]);
	}
}
