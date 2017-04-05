/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable, Command, EventEmitter, Event } from 'vscode';
import { RefType, Branch } from './git';
import { Model, Operation } from './model';
import { anyEvent, dispose } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class CheckoutStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		model.onDidChange(this._onDidChange.fire, this._onDidChange, this.disposables);
	}

	get command(): Command | undefined {
		const HEAD = this.model.HEAD;

		if (!HEAD) {
			return undefined;
		}

		const tag = this.model.refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = HEAD.name || tagName || (HEAD.commit || '').substr(0, 8);
		const title = '$(git-branch) '
			+ head
			+ (this.model.workingTreeGroup.resources.length > 0 ? '*' : '')
			+ (this.model.indexGroup.resources.length > 0 ? '+' : '')
			+ (this.model.mergeGroup.resources.length > 0 ? '!' : '');

		return {
			command: 'git.checkout',
			tooltip: localize('checkout', 'Checkout...'),
			title
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

	constructor(private model: Model) {
		model.onDidChange(this.onModelChange, this, this.disposables);
		model.onDidChangeOperations(this.onOperationsChange, this, this.disposables);
		this._onDidChange.fire();
	}

	private onOperationsChange(): void {
		this.state = {
			...this.state,
			isSyncRunning: this.model.operations.isRunning(Operation.Sync)
		};
	}

	private onModelChange(): void {
		this.state = {
			...this.state,
			hasRemotes: this.model.remotes.length > 0,
			HEAD: this.model.HEAD
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
				tooltip = localize('sync changes', "Synchronize changes");
			} else {
				icon = '$(cloud-upload)';
				command = 'git.publish';
				tooltip = localize('publish changes', "Publish changes");
			}
		} else {
			command = '';
			tooltip = '';
		}

		if (this.state.isSyncRunning) {
			text = '';
			command = '';
			tooltip = localize('syncing changes', "Synchronizing changes...");
		}

		return {
			command,
			title: [icon, text].join(' ').trim(),
			tooltip
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

	constructor(model: Model) {
		this.syncStatusBar = new SyncStatusBar(model);
		this.checkoutStatusBar = new CheckoutStatusBar(model);
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