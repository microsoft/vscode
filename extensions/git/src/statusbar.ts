/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Command, EventEmitter, Event, workspace, Uri } from 'vscode';
import { Repository, Operation } from './repository';
import { anyEvent, dispose } from './util';
import * as nls from 'vscode-nls';
import { Branch } from './api/git';

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
		const title = `$(git-branch) ${this.repository.headLabel}${rebasing ? ` (${localize('rebasing', 'Rebasing')})` : ''}`;

		return {
			command: 'git.checkout',
			tooltip: localize('checkout', 'Checkout...'),
			title,
			arguments: [this.repository.sourceControl]
		};
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

interface SyncStatusBarState {
	isSyncRunning: boolean;
	hasRemotes: boolean;
	HEAD: Branch | undefined;
}

class SyncStatusBar {

	private static StartState: SyncStatusBarState = {
		isSyncRunning: false,
		hasRemotes: false,
		HEAD: undefined
	};

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	private _state: SyncStatusBarState = SyncStatusBar.StartState;
	private get state() { return this._state; }
	private set state(state: SyncStatusBarState) {
		this._state = state;
		this._onDidChange.fire();
	}

	constructor(private repository: Repository) {
		repository.onDidRunGitStatus(this.onModelChange, this, this.disposables);
		repository.onDidChangeOperations(this.onOperationsChange, this, this.disposables);
		this._onDidChange.fire();
	}

	private onOperationsChange(): void {
		const isSyncRunning = this.repository.operations.isRunning(Operation.Sync) ||
			this.repository.operations.isRunning(Operation.Push) ||
			this.repository.operations.isRunning(Operation.Pull);

		this.state = { ...this.state, isSyncRunning };
	}

	private onModelChange(): void {
		this.state = {
			...this.state,
			hasRemotes: this.repository.remotes.length > 0,
			HEAD: this.repository.HEAD
		};
	}

	get command(): Command | undefined {
		if (!this.state.hasRemotes) {
			return undefined;
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
				tooltip = localize('sync changes', "Synchronize Changes");
			} else {
				icon = '$(cloud-upload)';
				command = 'git.publish';
				tooltip = localize('publish changes', "Publish Changes");
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

	private syncStatusBar: SyncStatusBar;
	private checkoutStatusBar: CheckoutStatusBar;
	private disposables: Disposable[] = [];

	constructor(repository: Repository) {
		this.syncStatusBar = new SyncStatusBar(repository);
		this.checkoutStatusBar = new CheckoutStatusBar(repository);
	}

	get onDidChange(): Event<void> {
		return anyEvent(
			this.syncStatusBar.onDidChange,
			this.checkoutStatusBar.onDidChange
		);
	}

	get commands(): Command[] {
		const result: Command[] = [];

		const checkout = this.checkoutStatusBar.command;

		if (checkout) {
			result.push(checkout);
		}

		const sync = this.syncStatusBar.command;

		if (sync) {
			result.push(sync);
		}

		return result;
	}

	dispose(): void {
		this.syncStatusBar.dispose();
		this.checkoutStatusBar.dispose();
		this.disposables = dispose(this.disposables);
	}
}
