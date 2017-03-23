/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gitlessView';
import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import winjs = require('vs/base/common/winjs.base');
import ee = require('vs/base/common/eventEmitter');
import view = require('vs/workbench/parts/git/browser/views/view');
import builder = require('vs/base/browser/builder');
import actions = require('vs/base/common/actions');

var $ = builder.$;

export class GitlessView
	extends ee.EventEmitter
	implements view.IView {
	public ID = 'gitless';
	private _element: HTMLElement;

	constructor() {
		super();
	}

	public get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		var instructions: string;

		if (platform.isMacintosh) {
			instructions = nls.localize('macInstallWith',
				"You can either install it with {0}, download it from {1} or install the {2} command line developer tools, by simply typing {3} on a Terminal prompt.",
				'<a href="http://brew.sh/" tabindex="0" target="_blank">Homebrew</a>',
				'<a href="http://git-scm.com/download/mac" tabindex="0" target="_blank">git-scm.com</a>',
				'<a href="https://developer.apple.com/xcode/" tabindex="0" target="_blank">XCode</a>',
				'<code>git</code>'
			);
		} else if (platform.isWindows) {
			instructions = nls.localize('winInstallWith',
				"You can either install it with {0} or download it from {1}.",
				'<a href="https://chocolatey.org/packages/git" tabindex="0" target="_blank">Chocolatey</a>',
				'<a href="http://git-scm.com/download/win" tabindex="0" target="_blank">git-scm.com</a>'
			);
		} else if (platform.isLinux) {
			instructions = nls.localize('linuxDownloadFrom',
				"You can download it from {0}.",
				'<a href="http://git-scm.com/download/linux" tabindex="0" target="_blank">git-scm.com</a>'
			);
		} else {
			instructions = nls.localize('downloadFrom',
				"You can download it from {0}.",
				'<a href="http://git-scm.com/download" tabindex="0" target="_blank">git-scm.com</a>'
			);
		}

		this._element = $([
			'<div class="gitless-view">',
			'<p>', nls.localize('looksLike', "It looks like git is not installed on your system."), '</p>',
			'<p>', instructions, '</p>',
			'<p>', nls.localize('pleaseRestart', "Once git is installed, please restart VSCode."), '</p>',
			'</div>'
		].join('')).getHTMLElement();
	}

	public focus(): void {
		return;
	}

	public layout(dimension: builder.Dimension): void {
		return;
	}

	public setVisible(visible: boolean): winjs.TPromise<void> {
		return winjs.TPromise.as(null);
	}

	public getControl(): ee.IEventEmitter {
		return null;
	}

	public getActions(): actions.IAction[] {
		return [];
	}

	public getSecondaryActions(): actions.IAction[] {
		return [];
	}
}