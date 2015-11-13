/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import Lifecycle = require('vs/base/common/lifecycle');
import Builder = require('vs/base/browser/builder');
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import EventEmitter = require('vs/base/common/eventEmitter');

var $ = Builder.$;

export interface IMenuOptions {
	context?:any;
	actionItemProvider?:ActionBar.IActionItemProvider;
	actionRunner?:Actions.IActionRunner;
}

export class Menu extends EventEmitter.EventEmitter {

	private actionBar: ActionBar.ActionBar;
	private listener: Lifecycle.IDisposable;

	constructor (container:HTMLElement, actions:Actions.IAction[], options:IMenuOptions = {}) {
		super();

		$(container).addClass('monaco-menu-container');

		var $menu = $('.monaco-menu').appendTo(container);

		this.actionBar = new ActionBar.ActionBar($menu, {
			orientation: ActionBar.ActionsOrientation.VERTICAL,
			actionItemProvider: options.actionItemProvider,
			context: options.context,
			actionRunner: options.actionRunner
		});

		this.listener = this.addEmitter2(this.actionBar);

		this.actionBar.push(actions, { icon: true, label: true });
	}

	public focus() {
		this.actionBar.focus();
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