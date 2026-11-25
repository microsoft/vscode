/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../base/common/async.js';
import { Event, Emitter } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { OperatingSystem } from '../../base/common/platform.js';
import { localize } from '../../nls.js';
import { IDialogArgs, IDialogHandler, IDialogResult } from '../../platform/dialogs/common/dialogs.js';
import { getRemoteName } from '../../platform/remote/common/remoteHosts.js';
import { IRemoteAgentService } from '../services/remote/common/remoteAgentService.js';

export async function showAboutDialog(handler: IDialogHandler, about: { title: string; details: string; detailsToCopy: string }, remoteAgentService: IRemoteAgentService): Promise<void> {
	const connection = remoteAgentService.getConnection();
	if (!connection) {
		return handler.about(about.title, about.details, about.detailsToCopy);
	}

	const remoteName = getRemoteName(connection.remoteAuthority);
	const connectionType = new Map([
		['ssh-remote', localize('aboutRemoteConnectionSSH', "SSH")],
		['wsl', localize('aboutRemoteConnectionWSL', "WSL")],
		['dev-container', localize('aboutRemoteConnectionDevContainer', "Dev Container")],
		['attached-container', localize('aboutRemoteConnectionAttachedContainer', "Attached Container")],
		['tunnel', localize('aboutRemoteConnectionTunnel', "Tunnel")],
		['codespaces', localize('aboutRemoteConnectionCodespaces', "Codespaces")],
	]).get(remoteName ?? '') ?? localize('aboutRemoteConnectionOther', "Other");

	const env = connection.isConnected ? await raceTimeout(remoteAgentService.getEnvironment(), 500) : undefined;
	const os = env && new Map([
		[OperatingSystem.Windows, 'Windows'],
		[OperatingSystem.Macintosh, 'macOS'],
		[OperatingSystem.Linux, 'Linux'],
	]).get(env.os);

	if (!os || !env) {
		const connectionLine = localize('aboutRemoteConnectionType', "Remote connection: {0}", connectionType);
		return handler.about(about.title, `${about.details}\n${connectionLine}`, `${about.detailsToCopy}\n${connectionLine}`);
	}

	// About is commonly pasted into public issues. Only include known architecture labels.
	const platform = ['arm', 'arm64', 'ia32', 'x64'].includes(env.arch) ? `${os} ${env.arch}` : os;
	const connectionLine = localize('aboutRemoteConnectionType', "Remote connection: {0}", connectionType);
	const line = localize('aboutRemoteOS', "Remote OS: {0}", platform);
	return handler.about(about.title, `${about.details}\n${connectionLine}\n${line}`, `${about.detailsToCopy}\n${connectionLine}\n${line}`);
}

export interface IDialogViewItem {
	readonly args: IDialogArgs;

	close(result?: IDialogResult | Error): void;
}

export interface IDialogHandle {
	readonly item: IDialogViewItem;
	readonly result: Promise<IDialogResult | undefined>;
}

export interface IDialogsModel {

	readonly onWillShowDialog: Event<void>;
	readonly onDidShowDialog: Event<void>;

	readonly dialogs: IDialogViewItem[];

	show(dialog: IDialogArgs): IDialogHandle;
}

export class DialogsModel extends Disposable implements IDialogsModel {

	readonly dialogs: IDialogViewItem[] = [];

	private readonly _onWillShowDialog = this._register(new Emitter<void>());
	readonly onWillShowDialog = this._onWillShowDialog.event;

	private readonly _onDidShowDialog = this._register(new Emitter<void>());
	readonly onDidShowDialog = this._onDidShowDialog.event;

	show(dialog: IDialogArgs): IDialogHandle {
		const promise = new DeferredPromise<IDialogResult | undefined>();

		const item: IDialogViewItem = {
			args: dialog,
			close: result => {
				this.dialogs.splice(0, 1);
				if (result instanceof Error) {
					promise.error(result);
				} else {
					promise.complete(result);
				}
				this._onDidShowDialog.fire();
			}
		};

		this.dialogs.push(item);
		this._onWillShowDialog.fire();

		return {
			item,
			result: promise.p
		};
	}
}
