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
import { $ } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenFolderAction, OpenFileFolderAction, AddRootFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

export class EmptyView extends ViewsViewletPanel {

	public static ID: string = 'workbench.explorer.emptyView';
	public static NAME = nls.localize('noWorkspace', "No Folder Opened");

	private button: Button;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService);
		this.contextService.onDidChangeWorkbenchState(() => this.setButtonLabel());
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		const name = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.contextService.getWorkspace().name : this.name;
		$('span').text(name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'explorer-empty-view');

		let titleDiv = $('div.section').appendTo(container);
		$('p').text(nls.localize('noWorkspaceHelp', "You have not yet opened a folder.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);

		this.button = new Button(section);
		attachButtonStyler(this.button, this.themeService);
		this.button.addListener('click', () => {
			const actionClass = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? AddRootFolderAction : env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).done(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		});
		this.setButtonLabel();
	}

	private setButtonLabel(): void {
		if (this.button) {
			this.button.label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? nls.localize('addFolder', "Add Folder") : nls.localize('openFolder', "Open Folder");
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
			this.button.getElement().focus();
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