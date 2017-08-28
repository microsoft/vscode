/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable, Command, EventEmitter, Event } from 'vscode';
import { RefType, Branch } from './git';
import { Repository, Operation } from './repository';
import { anyEvent, dispose } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class CheckoutStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	constructor(private repository: Repository) {
		repository.onDidChangeStatus(this._onDidChange.fire, this._onDidChange, this.disposables);
	}

	get command(): Command | undefined {
		const HEAD = this.repository.HEAD;

		if (!HEAD) {
			return undefined;
		}

		const tag = this.repository.refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = HEAD.name || tagName || (HEAD.commit || '').substr(0, 8);
		const title = '$(git-branch) '
			+ head
			+ (this.repository.workingTreeGroup.resourceStates.length > 0 ? '*' : '')
			+ (this.repository.indexGroup.resourceStates.length > 0 ? '+' : '')
			+ (this.repository.mergeGroup.resourceStates.length > 0 ? '!' : '');

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
		repository.onDidChangeStatus(this.onModelChange, this, this.disposables);
		repository.onDidChangeOperations(this.onOperationsChange, this, this.disposables);
		this._onDidChange.fire();
	}

	private onOperationsChange(): void {
		this.state = {
			...this.state,
			isSyncRunning: this.repository.operations.isRunning(Operation.Sync)
		};
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
					text += `${HEAD.behind}↓ ${HEAD.ahead}↑`;
				}
				command = 'git.sync';
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