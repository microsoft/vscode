/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./emptyView';
import nls = require('vs/nls');
import Lifecycle = require('vs/base/common/lifecycle');
import EventEmitter = require('vs/base/common/eventEmitter');
import DOM = require('vs/base/browser/dom');
import { Button } from 'vs/base/browser/ui/button/button';
import WinJS = require('vs/base/common/winjs.base');
import Builder = require('vs/base/browser/builder');
import Actions = require('vs/base/common/actions');
import InputBox = require('vs/base/browser/ui/inputbox/inputBox');
import GitView = require('vs/workbench/parts/git/browser/views/view');
import GitActions = require('vs/workbench/parts/git/browser/gitActions');
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IGitService } from 'vs/workbench/parts/git/common/git';

var $ = Builder.$;

export class EmptyView extends EventEmitter.EventEmitter implements GitView.IView {

	public ID = 'empty';

	private static EMPTY_MESSAGE = nls.localize('noGit', "This workspace isn't yet under git source control.");

	private gitService: IGitService;
	private instantiationService: IInstantiationService;
	private messageService: IMessageService;
	private fileService: IFileService;

	private actionRunner: Actions.IActionRunner;
	private refreshAction: Actions.IAction;
	private isVisible: boolean;
	private needsRender: boolean;
	private $el: Builder.Builder;
	private urlInputBox: InputBox.InputBox;
	private cloneButton: Button;
	private initButton: Button;
	private controller: GitView.IController;
	private toDispose: Lifecycle.IDisposable[];

	constructor(controller: GitView.IController, actionRunner: Actions.IActionRunner,
		@IGitService gitService: IGitService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@IFileService fileService: IFileService
	) {
		super();

		this.gitService = gitService;
		this.instantiationService = instantiationService;
		this.messageService = messageService;
		this.fileService = fileService;

		this.actionRunner = actionRunner;
		this.isVisible = false;
		this.needsRender = false;
		this.controller = controller;
		this.toDispose = [];
	}

	// Properties

	private _initAction: GitActions.InitAction;
	private get initAction(): GitActions.InitAction {
		if (!this._initAction) {
			this._initAction = this.instantiationService.createInstance(GitActions.InitAction);
		}

		return this._initAction;
	}

	// IView

	public get element(): HTMLElement {
		this.render();
		return this.$el.getHTMLElement();
	}

	private render(): void {
		if (this.$el) {
			return;
		}

		this.$el = $('.empty-view');

		$('p').appendTo(this.$el).text(EmptyView.EMPTY_MESSAGE);

		var initSection = $('.section').appendTo(this.$el);
		this.initButton = new Button(initSection);
		this.initButton.label = nls.localize('gitinit', 'Initialize Git Repository');
		this.initButton.addListener2('click', (e) => {
			DOM.EventHelper.stop(e);

			this.disableUI();
			this.actionRunner.run(this.initAction).done(() => this.enableUI());
		});
	}

	private disableUI(): void {
		if (this.urlInputBox) {
			this.urlInputBox.disable();
		}

		if (this.cloneButton) {
			this.cloneButton.enabled = false;
		}

		this.initButton.enabled = false;
	}

	private enableUI(): void {
		if (this.gitService.getRunningOperations().length > 0) {
			return;
		}

		if (this.urlInputBox) {
			this.urlInputBox.enable();
			this.urlInputBox.validate();
		}

		this.initButton.enabled = true;
	}

	public focus(): void {
		this.initButton.focus();
	}

	public layout(dimension: Builder.Dimension): void {
		// no-op
	}

	public setVisible(visible: boolean): WinJS.TPromise<void> {
		this.isVisible = visible;

		return WinJS.TPromise.as(null);
	}

	public getControl(): EventEmitter.IEventEmitter {
		return null;
	}

	public getActions(): Actions.IAction[] {
		return this.refreshAction ? [this.refreshAction] : [];
	}

	public getSecondaryActions(): Actions.IAction[] {
		return [];
	}

	// Events

	public dispose(): void {
		if (this.$el) {
			this.$el.dispose();
			this.$el = null;
		}

		this.toDispose = Lifecycle.dispose(this.toDispose);

		super.dispose();
	}
}
