/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import * as errors from 'vs/base/common/errors';
import env = require('vs/base/common/platform');
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { Button } from 'vs/base/browser/ui/button/button';
import { $, Builder } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IViewletViewOptions, IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenFolderAction, OpenFileFolderAction, AddRootFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class EmptyView extends ViewsViewletPanel {

	public static readonly ID: string = 'workbench.explorer.emptyView';
	public static readonly NAME = nls.localize('noWorkspace', "No Folder Opened");

	private button: Button;
	private messageDiv: Builder;
	private titleDiv: Builder;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService);
		this.contextService.onDidChangeWorkbenchState(() => this.setLabels());
	}

	public renderHeader(container: HTMLElement): void {
		this.titleDiv = $('span').text(name).appendTo($('div.title').appendTo(container));
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'explorer-empty-view');

		this.messageDiv = $('p').appendTo($('div.section').appendTo(container));

		let section = $('div.section').appendTo(container);

		this.button = new Button(section);
		attachButtonStyler(this.button, this.themeService);

		this.disposables.push(this.button.onDidClick(() => {
			const actionClass = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? AddRootFolderAction : env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).done(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		}));
		this.setLabels();
	}

	private setLabels(): void {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.messageDiv.text(nls.localize('noWorkspaceHelp', "You have not yet added a folder to the workspace."));
			if (this.button) {
				this.button.label = nls.localize('addFolder', "Add Folder");
			}
			this.titleDiv.text(this.contextService.getWorkspace().name);
		} else {
			this.messageDiv.text(nls.localize('noFolderHelp', "You have not yet opened a folder."));
			if (this.button) {
				this.button.label = nls.localize('openFolder', "Open Folder");
			}
			this.titleDiv.text(this.name);
		}
	}

	layoutBody(size: number): void {
		// no-op
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public focusBody(): void {
		if (this.button) {
			this.button.element.focus();
		}
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return TPromise.as(null);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
		// Subclass to implement
	}
}