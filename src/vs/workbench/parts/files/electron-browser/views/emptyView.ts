/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import * as env from 'vs/base/common/platform';
import * as DOM from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { Button } from 'vs/base/browser/ui/button/button';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenFolderAction, OpenFileFolderAction, AddRootFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ResourcesDropHandler, DragAndDropObserver } from 'vs/workbench/browser/dnd';
import { listDropBackground } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';

export class EmptyView extends ViewletPanel {

	static readonly ID: string = 'workbench.explorer.emptyView';
	static readonly NAME = nls.localize('noWorkspace', "No Folder Opened");

	private button: Button;
	private messageElement: HTMLElement;
	private titleElement: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService);
		this.contextService.onDidChangeWorkbenchState(() => this.setLabels());
	}

	renderHeader(container: HTMLElement): void {
		const titleContainer = document.createElement('div');
		DOM.addClass(titleContainer, 'title');
		container.appendChild(titleContainer);

		this.titleElement = document.createElement('span');
		this.titleElement.textContent = name;
		titleContainer.appendChild(this.titleElement);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'explorer-empty-view');
		container.tabIndex = 0;

		const messageContainer = document.createElement('div');
		DOM.addClass(messageContainer, 'section');
		container.appendChild(messageContainer);

		this.messageElement = document.createElement('p');
		messageContainer.appendChild(this.messageElement);

		this.button = new Button(messageContainer);
		attachButtonStyler(this.button, this.themeService);

		this.disposables.push(this.button.onDidClick(() => {
			const actionClass = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? AddRootFolderAction : env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).then(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		}));

		this.disposables.push(new DragAndDropObserver(container, {
			onDrop: e => {
				container.style.backgroundColor = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND).toString();
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: true });
				dropHandler.handleDrop(e, () => undefined, targetGroup => undefined);
			},
			onDragEnter: (e) => {
				container.style.backgroundColor = this.themeService.getTheme().getColor(listDropBackground).toString();
			},
			onDragEnd: () => {
				container.style.backgroundColor = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND).toString();
			},
			onDragLeave: () => {
				container.style.backgroundColor = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND).toString();
			},
			onDragOver: e => {
				e.dataTransfer.dropEffect = 'copy';
			}
		}));

		this.setLabels();
	}

	private setLabels(): void {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.messageElement.textContent = nls.localize('noWorkspaceHelp', "You have not yet added a folder to the workspace.");
			if (this.button) {
				this.button.label = nls.localize('addFolder', "Add Folder");
			}
			this.titleElement.textContent = EmptyView.NAME;
		} else {
			this.messageElement.textContent = nls.localize('noFolderHelp', "You have not yet opened a folder.");
			if (this.button) {
				this.button.label = nls.localize('openFolder', "Open Folder");
			}
			this.titleElement.textContent = this.title;
		}
	}

	layoutBody(size: number): void {
		// no-op
	}

	focusBody(): void {
		if (this.button) {
			this.button.element.focus();
		}
	}
}
