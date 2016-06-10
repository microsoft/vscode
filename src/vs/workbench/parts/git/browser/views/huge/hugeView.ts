/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./hugeView';
import nls = require('vs/nls');
import winjs = require('vs/base/common/winjs.base');
import ee = require('vs/base/common/eventEmitter');
import view = require('vs/workbench/parts/git/browser/views/view');
import builder = require('vs/base/browser/builder');
import actions = require('vs/base/common/actions');
import * as dom from 'vs/base/browser/dom';
import { IGitService } from 'vs/workbench/parts/git/common/git';
import { onUnexpectedError } from 'vs/base/common/errors';
import {Button} from 'vs/base/browser/ui/button/button';

const $ = dom.emmet;

export class HugeView extends ee.EventEmitter implements view.IView {

	ID = 'huge';
	private _element: HTMLElement;

	constructor(@IGitService private gitService: IGitService) {
		super();
	}

	get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		this._element = $('.huge-view');

		dom.append(this._element, $('p')).textContent = nls.localize('huge', "Your repository appears to have many active changes.\nThis can cause Code to become very slow.");

		const settingP = dom.append(this._element, $('p'));
		dom.append(settingP, document.createTextNode(nls.localize('setting', "You can permanently disable this warning with the following setting:")));
		dom.append(settingP, document.createTextNode(' '));
		const pre = dom.append(settingP, $('pre'));
		pre.style.display = 'inline';
		pre.textContent = 'git.allowLargeRepositories';

		const button = new Button(this._element);
		button.label = nls.localize('allo', "Allow large repositories");
		button.addListener2('click', (e) => {
			dom.EventHelper.stop(e);
			this.gitService.allowHugeRepositories = true;
			this.gitService.status().done(null, onUnexpectedError);
		});
	}

	focus(): void {
		return;
	}

	layout(dimension: builder.Dimension): void {
		return;
	}

	setVisible(visible:boolean): winjs.TPromise<void> {
		return winjs.TPromise.as(null);
	}

	getControl(): ee.IEventEmitter {
		return null;
	}

	getActions(): actions.IAction[] {
		return [];
	}

	getSecondaryActions(): actions.IAction[] {
		return [];
	}
}