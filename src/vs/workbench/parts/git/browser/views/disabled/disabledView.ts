/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./disabledView';
import * as nls from 'vs/nls';
import * as git from 'vs/workbench/parts/git/common/git';
import * as platform from 'vs/base/common/platform';
import * as winjs from 'vs/base/common/winjs.base';
import * as ee from 'vs/base/common/eventEmitter';
import * as view from 'vs/workbench/parts/git/browser/views/view';
import * as builder from 'vs/base/browser/builder';
import * as actions from 'vs/base/common/actions';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ISelection, Selection} from 'vs/platform/selection/common/selection';

var $ = builder.$;

export class DisabledView
	extends ee.EventEmitter
	implements view.IView
{
	public ID = 'disabled';
	private _element: HTMLElement;

	public get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		this._element = $([
			'<div class="disabled-view">',
			'<p>', nls.localize('disabled', "Git is disabled in the settings."), '</p>',
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