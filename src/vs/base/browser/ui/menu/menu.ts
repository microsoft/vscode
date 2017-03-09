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
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export interface IMenuOptions {
	context?: any;
	actionItemProvider?: IActionItemProvider;
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding;
}

export class Menu extends EventEmitter {

	private actionBar: ActionBar;
	private listener: IDisposable;

	constructor(container: HTMLElement, actions: IAction[], options: IMenuOptions = {}) {
		super();

		$(container).addClass('monaco-menu-container');

		let $menu = $('.monaco-menu').appendTo(container);

		this.actionBar = new ActionBar($menu, {
			orientation: ActionsOrientation.VERTICAL,
			actionItemProvider: options.actionItemProvider,
			context: options.context,
			actionRunner: options.actionRunner
		});

		this.listener = this.addEmitter2(this.actionBar);

		this.actionBar.push(actions, { icon: true, label: true });
	}

	public focus() {
		this.actionBar.focus(true);
	}

	public dispose() {
		super.dispose();

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