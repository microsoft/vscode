/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Command, EventEmitter, Event, workspace, Uri } from 'vscode';
import { Repository, Operation } from './repository';
import { anyEvent, dispose, filterEvent } from './util';
import * as nls from 'vscode-nls';
import { Branch, RemoteSourcePublisher } from './api/git';
import { IRemoteSourcePublisherRegistry } from './remotePublisher';

const localize = nls.loadMessageBundle();

class CheckoutStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	constructor(private repository: Repository) {
		repository.onDidRunGitStatus(this._onDidChange.fire, this._onDidChange, this.disposables);
	}

	get command(): Command | undefined {
		const rebasing = !!this.repository.rebaseCommit;
		const isBranchProtected = this.repository.isBranchProtected();
		const title = `$(git-branch) ${this.repository.headLabel}${rebasing ? ` (${localize('rebasing', 'Rebasing')})` : ''}${isBranchProtected ? ' $(lock-small)' : ''}`;

		return {
			command: 'git.checkout',
			tooltip: localize('checkout', "Checkout branch/tag..."),
			title,
			arguments: [this.repository.sourceControl]
		};
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

interface SyncStatusBarState {
	readonly enabled: boolean;
	readonly isSyncRunning: boolean;
	readonly hasRemotes: boolean;
	readonly HEAD: Branch | undefined;
	readonly remoteSourcePublishers: RemoteSourcePublisher[];
}

class SyncStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	private _state: SyncStatusBarState;
	private get state() { return this._state; }
	private set state(state: SyncStatusBarState) {
		this._state = state;
		this._onDidChange.fire();
	}

	constructor(private repository: Repository, private remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry) {
		this._state = {
			enabled: true,
			isSyncRunning: false,
			hasRemotes: false,
			HEAD: undefined,
			remoteSourcePublishers: remoteSourcePublisherRegistry.getRemoteSourcePublishers()
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		anyEvent(remoteSourcePublisherRegistry.onDidAddRemoteSourcePublisher, remoteSourcePublisherRegistry.onDidRemoveRemoteSourcePublisher)
			(this.onDidChangeRemoteSourcePublishers, this, this.disposables);

		const onEnablementChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.enableStatusBarSync'));
		onEnablementChange(this.updateEnablement, this, this.disposables);
		this.updateEnablement();
	}

	private updateEnablement(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const enabled = config.get<boolean>('enableStatusBarSync', true);

		this.state = { ... this.state, enabled };
	}

	private onDidChangeOperations(): void {
		const isSyncRunning = this.repository.operations.isRunning(Operation.Sync) ||
			this.repository.operations.isRunning(Operation.Push) ||
			this.repository.operations.isRunning(Operation.Pull);

		this.state = { ...this.state, isSyncRunning };
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			hasRemotes: this.repository.remotes.length > 0,
			HEAD: this.repository.HEAD
		};
	}

	private onDidChangeRemoteSourcePublishers(): void {
		this.state = {
			...this.state,
			remoteSourcePublishers: this.remoteSourcePublisherRegistry.getRemoteSourcePublishers()
		};
	}

	get command(): Command | undefined {
		if (!this.state.enabled) {
			return;
		}

		if (!this.state.hasRemotes) {
			if (this.state.remoteSourcePublishers.length === 0) {
				return;
			}

			const tooltip = this.state.remoteSourcePublishers.length === 1
				? localize('publish to', "Publish to {0}", this.state.remoteSourcePublishers[0].name)
				: localize('publish to...', "Publish to...");

			return {
				command: 'git.publish',
				title: `$(cloud-upload)`,
				tooltip,
				arguments: [this.repository.sourceControl]
			};
		}

		const HEAD = this.state.HEAD;
		let icon = '$(sync)';
		let text = '';
		let command = '';
		let tooltip = '';

		if (HEAD && HEAD.name && HEAD.commit) {
			if (HEAD.upstream) {
				if (HEAD.ahead || HEAD.behind) {
					text += this.repository.syncLabel;
				}

				const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
				const rebaseWhenSync = config.get<string>('rebaseWhenSync');

				command = rebaseWhenSync ? 'git.syncRebase' : 'git.sync';
				tooltip = this.repository.syncTooltip;
			} else {
				icon = '$(cloud-upload)';
				command = 'git.publish';
				tooltip = localize('publish branch', "Publish Branch");
			}
		} else {
			command = '';
			tooltip = '';
		}

		if (this.state.isSyncRunning) {
			icon = '$(sync~spin)';
			command = '';
			tooltip = localize('syncing changes', "Synchronizing Changes...");
		}

		return {
			command,
			title: [icon, text].join(' ').trim(),
			tooltip,
			arguments: [this.repository.sourceControl]
		};
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export class StatusBarCommands {

	readonly onDidChange: Event<void>;

	private syncStatusBar: SyncStatusBar;
	private checkoutStatusBar: CheckoutStatusBar;
	private disposables: Disposable[] = [];

	constructor(repository: Repository, remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry) {
		this.syncStatusBar = new SyncStatusBar(repository, remoteSourcePublisherRegistry);
		this.checkoutStatusBar = new CheckoutStatusBar(repository);
		this.onDidChange = anyEvent(this.syncStatusBar.onDidChange, this.checkoutStatusBar.onDidChange);
	}

	get commands(): Command[] {
		return [this.checkoutStatusBar.command, this.syncStatusBar.command]
			.filter((c): c is Command => !!c);
	}

	dispose(): void {
		this.syncStatusBar.dispose();
		this.checkoutStatusBar.dispose();
		this.disposables = dispose(this.disposables);
	}
}
