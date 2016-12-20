/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./noworkspaceView';
import nls = require('vs/nls');
import * as errors from 'vs/base/common/errors';
import winjs = require('vs/base/common/winjs.base');
import ee = require('vs/base/common/eventEmitter');
import env = require('vs/base/common/platform');
import view = require('vs/workbench/parts/git/browser/views/view');
import builder = require('vs/base/browser/builder');
import { Button } from 'vs/base/browser/ui/button/button';
import { IActionRunner, IAction } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenFolderAction, OpenFileFolderAction } from 'vs/workbench/browser/actions/fileActions';
const $ = builder.$;

export class NoWorkspaceView
	extends ee.EventEmitter
	implements view.IView {
	public ID = 'noworkspace';
	private _element: HTMLElement;
	private _openFolderButton: Button;

	constructor(
		private actionRunner: IActionRunner,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();
	}

	public get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		this._element = $([
			'<div class="noworkspace-view">',
			'<p>', nls.localize('noWorkspaceHelp', "You have not yet opened a folder."), '</p>',
			'<p>', nls.localize('pleaseRestart', "Open a folder with a Git repository in order to access Git features."), '</p>',
			'</div>'
		].join('')).getHTMLElement();

		this._openFolderButton = new Button(this._element);
		this._openFolderButton.label = nls.localize('openFolder', "Open Folder");
		this._openFolderButton.addListener2('click', () => {
			const actionClass = env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).done(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		});
	}

	public focus(): void {
		if (this._openFolderButton) {
			this._openFolderButton.getElement().focus();
		}
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

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}
}