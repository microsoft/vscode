/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService, IEnterWorkspaceResult, CrashReporterStartOptions, IURIToOpen, IOpenSettings } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened, IRecent, isRecentWorkspace } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class WindowsService implements IWindowsService {

	_serviceBrand: undefined;

	private channel: IChannel;

	get onWindowOpen(): Event<number> { return this.channel.listen('onWindowOpen'); }
	get onWindowFocus(): Event<number> { return this.channel.listen('onWindowFocus'); }
	get onWindowBlur(): Event<number> { return this.channel.listen('onWindowBlur'); }
	get onWindowMaximize(): Event<number> { return this.channel.listen('onWindowMaximize'); }
	get onWindowUnmaximize(): Event<number> { return this.channel.listen('onWindowUnmaximize'); }
	get onRecentlyOpenedChange(): Event<void> { return this.channel.listen('onRecentlyOpenedChange'); }

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('windows');
	}

	async enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult | undefined> {
		const result: IEnterWorkspaceResult = await this.channel.call('enterWorkspace', [windowId, path]);
		if (result) {
			result.workspace = reviveWorkspaceIdentifier(result.workspace);
		}

		return result;
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

	newWindowTab(): Promise<void> {
		return this.channel.call('newWindowTab');
	}

	showPreviousWindowTab(): Promise<void> {
		return this.channel.call('showPreviousWindowTab');
	}

	showNextWindowTab(): Promise<void> {
		return this.channel.call('showNextWindowTab');
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return this.channel.call('moveWindowTabToNewWindow');
	}

	mergeAllWindowTabs(): Promise<void> {
		return this.channel.call('mergeAllWindowTabs');
	}

	toggleWindowTabsBar(): Promise<void> {
		return this.channel.call('toggleWindowTabsBar');
	}

	focusWindow(windowId: number): Promise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	closeWindow(windowId: number): Promise<void> {
		return this.channel.call('closeWindow', windowId);
	}

	isFocused(windowId: number): Promise<boolean> {
		return this.channel.call('isFocused', windowId);
	}

	isMaximized(windowId: number): Promise<boolean> {
		return this.channel.call('isMaximized', windowId);
	}

	maximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('maximizeWindow', windowId);
	}

	unmaximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('unmaximizeWindow', windowId);
	}

	minimizeWindow(windowId: number): Promise<void> {
		return this.channel.call('minimizeWindow', windowId);
	}

	whenSharedProcessReady(): Promise<void> {
		return this.channel.call('whenSharedProcessReady');
	}

	toggleSharedProcess(): Promise<void> {
		return this.channel.call('toggleSharedProcess');
	}

	openWindow(windowId: number, uris: IURIToOpen[], options: IOpenSettings): Promise<void> {
		return this.channel.call('openWindow', [windowId, uris, options]);
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		return this.channel.call('openExtensionDevelopmentHostWindow', [args, env]);
	}

	async getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		const result = await this.channel.call<{
			id: number;
			workspace?: IWorkspaceIdentifier;
			folderUri?: ISingleFolderWorkspaceIdentifier;
			title: string;
			filename?: string;
		}[]>('getWindows');

		for (const win of result) {
			if (win.folderUri) {
				win.folderUri = URI.revive(win.folderUri);
			}

			if (win.workspace) {
				win.workspace = reviveWorkspaceIdentifier(win.workspace);
			}
		}

		return result;
	}

	getActiveWindowId(): Promise<number | undefined> {
		return this.channel.call('getActiveWindowId');
	}

	startCrashReporter(config: CrashReporterStartOptions): Promise<void> {
		return this.channel.call('startCrashReporter', config);
	}
}
