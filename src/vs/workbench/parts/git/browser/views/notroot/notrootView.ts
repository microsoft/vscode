/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./notrootView';
import * as nls from 'vs/nls';
import * as winjs from 'vs/base/common/winjs.base';
import * as ee from 'vs/base/common/eventEmitter';
import * as view from 'vs/workbench/parts/git/browser/views/view';
import * as builder from 'vs/base/browser/builder';
import * as actions from 'vs/base/common/actions';
import {ISelection, Selection} from 'vs/platform/selection/common/selection';
var $ = builder.$;

export class NotRootView
	extends ee.EventEmitter
	implements view.IView
{
	public ID = 'notroot';
	private _element: HTMLElement;

	public get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		this._element = $([
			'<div class="notroot-view">',
			'<p>', nls.localize('wrongRoot', "This directory seems to be contained in a git repository."), '</p>',
			'<p>', nls.localize('pleaseRestart', "Open the repository's root directory in order to access Git features."), '</p>',
			'</div>'
		].join('')).getHTMLElement();
	}

	public focus(): void {
		return;
	}

	public layout(dimension: builder.Dimension): void {
		return;
	}

	public setVisible(visible:boolean): winjs.TPromise<void> {
		return winjs.Promise.as(null);
	}

	public getSelection(): ISelection {
		return Selection.EMPTY;
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