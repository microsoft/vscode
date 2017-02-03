/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { window, Disposable, StatusBarItem, StatusBarAlignment } from 'vscode';
import { RefType, IBranch } from './git';
import { Model, Operation } from './model';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class CheckoutStatusBar {

	private raw: StatusBarItem;
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.raw = window.createStatusBarItem(StatusBarAlignment.Left, Number.MAX_VALUE - 1);
		this.raw.show();

		this.disposables.push(this.raw);
		model.onDidChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		const HEAD = this.model.HEAD;

		if (!HEAD) {
			this.raw.command = '';
			this.raw.color = 'rgb(100, 100, 100)';
			this.raw.text = 'unknown';
			return;
		}

		const tag = this.model.refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = HEAD.name || tagName || (HEAD.commit || '').substr(0, 8);

		this.raw.command = 'git.checkout';
		this.raw.color = 'rgb(255, 255, 255)';
		this.raw.tooltip = localize('checkout', 'Checkout...');
		this.raw.text = '$(git-branch) ' +
			head +
			(this.model.workingTreeGroup.resources.length > 0 ? '*' : '') +
			(this.model.indexGroup.resources.length > 0 ? '+' : '') +
			(this.model.mergeGroup.resources.length > 0 ? '!' : '');
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

interface SyncStatusBarState {
	isSyncRunning: boolean;
	hasRemotes: boolean;
	HEAD: IBranch | undefined;
}

export class SyncStatusBar {

	private static StartState: SyncStatusBarState = {
		isSyncRunning: false,
		hasRemotes: false,
		HEAD: undefined
	};

	private raw: StatusBarItem;
	private disposables: Disposable[] = [];

	private _state: SyncStatusBarState = SyncStatusBar.StartState;
	private get state() { return this._state; }
	private set state(state: SyncStatusBarState) {
		this._state = state;
		this.render();
	}

	constructor(private model: Model) {
		this.raw = window.createStatusBarItem(StatusBarAlignment.Left, Number.MAX_VALUE);
		this.disposables.push(this.raw);
		model.onDidChange(this.onModelChange, this, this.disposables);
		model.onDidChangeOperations(this.onOperationsChange, this, this.disposables);
		this.render();
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

	private render(): void {
		if (!this.state.hasRemotes) {
			this.raw.hide();
			return;
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

		this.raw.text = [icon, text].join(' ').trim();
		this.raw.command = command;
		this.raw.tooltip = tooltip;

		if (command) {
			this.raw.color = '';
		} else {
			this.raw.color = 'rgba(255,255,255,0.7)';
		}

		this.raw.show();
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}