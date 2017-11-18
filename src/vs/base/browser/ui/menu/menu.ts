/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import { IDisposable } from 'vs/base/common/lifecycle';
import { $ } from 'vs/base/browser/builder';
import { IActionRunner, IAction } from 'vs/base/common/actions';
import { ActionBar, IActionItemProvider, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import Event from 'vs/base/common/event';

export interface IMenuOptions {
	context?: any;
	actionItemProvider?: IActionItemProvider;
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding;
}

export class Menu {

	private actionBar: ActionBar;
	private listener: IDisposable;

	constructor(container: HTMLElement, actions: IAction[], options: IMenuOptions = {}) {
		$(container).addClass('monaco-menu-container');

		let $menu = $('.monaco-menu').appendTo(container);

		this.actionBar = new ActionBar($menu, {
			orientation: ActionsOrientation.VERTICAL,
			actionItemProvider: options.actionItemProvider,
			context: options.context,
			actionRunner: options.actionRunner,
			isMenu: true
		});

		this.actionBar.push(actions, { icon: true, label: true });
	}

	public get onDidCancel(): Event<void> {
		return this.actionBar.onDidCancel;
	}

	public get onDidBlur(): Event<void> {
		return this.actionBar.onDidBlur;
	}

	public focus() {
		this.actionBar.focus(true);
	}

	public dispose() {
		if (this.actionBar) {
			this.actionBar.dispose();
			this.actionBar = null;
		}

		if (this.listener) {
			this.listener.dispose();
			this.listener = null;
		}
	}
}