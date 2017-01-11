/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { window, Disposable, StatusBarItem, StatusBarAlignment } from 'vscode';
import { RefType } from './git';
import { Model } from './model';

export class CheckoutStatusBar {

	private raw: StatusBarItem;
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.raw = window.createStatusBarItem(StatusBarAlignment.Left);
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

export class SyncStatusBar {

	private raw: StatusBarItem;
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.raw = window.createStatusBarItem(StatusBarAlignment.Left);


		this.disposables.push(this.raw);
		model.onDidChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		if (this.model.remotes.length === 0) {
			this.raw.hide();
			return;
		}

		const HEAD = this.model.HEAD;
		let icon = '$(sync)';
		let text = '';

		if (HEAD && HEAD.name && HEAD.commit) {
			this.raw.color = '';

			if (HEAD.upstream) {
				if (HEAD.ahead || HEAD.behind) {
					text += `'${HEAD.behind}↓ ${HEAD.ahead}↑'`;
				}
				this.raw.command = 'git.sync';
			} else {
				icon = '$(cloud-upload)';
				this.raw.command = 'git.publish';
			}
		} else {
			this.raw.color = 'rgba(255,255,255,0.7)';
			this.raw.command = '';
		}

		this.raw.text = `${icon}${text}`;
		this.raw.show();
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}