/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import * as DOM from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { Button } from 'vs/base/browser/ui/button/button';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OpenFolderAction, AddRootFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
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
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILabelService } from 'vs/platform/label/common/label';
import { Schemas } from 'vs/base/common/network';
import { isWeb } from 'vs/base/common/platform';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class EmptyView extends ViewletPanel {

	static readonly ID: string = 'workbench.explorer.emptyView';
	static readonly NAME = nls.localize('noWorkspace', "No Folder Opened");

	private button!: Button;
	private messageElement!: HTMLElement;
	private titleElement!: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@ILabelService private labelService: ILabelService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.setLabels()));
		this._register(this.labelService.onDidChangeFormatters(() => this.setLabels()));
	}

	renderHeader(container: HTMLElement): void {
		const titleContainer = document.createElement('div');
		DOM.addClass(titleContainer, 'title');
		container.appendChild(titleContainer);

		this.titleElement = document.createElement('span');
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

		this._register(this.button.onDidClick(() => {
			if (!this.actionRunner) {
				return;
			}
			const actionClass = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? AddRootFolderAction : OpenFolderAction;
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).then(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		}));

		this._register(new DragAndDropObserver(container, {
			onDrop: e => {
				const color = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND);
				container.style.backgroundColor = color ? color.toString() : '';
				const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: true });
				dropHandler.handleDrop(e, () => undefined, targetGroup => undefined);
			},
			onDragEnter: (e) => {
				const color = this.themeService.getTheme().getColor(listDropBackground);
				container.style.backgroundColor = color ? color.toString() : '';
			},
			onDragEnd: () => {
				const color = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND);
				container.style.backgroundColor = color ? color.toString() : '';
			},
			onDragLeave: () => {
				const color = this.themeService.getTheme().getColor(SIDE_BAR_BACKGROUND);
				container.style.backgroundColor = color ? color.toString() : '';
			},
			onDragOver: e => {
				e.dataTransfer!.dropEffect = 'copy';
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
			if (this.environmentService.configuration.remoteAuthority && !isWeb) {
				const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.configuration.remoteAuthority);
				this.messageElement.textContent = hostLabel ? nls.localize('remoteNoFolderHelp', "Connected to {0}", hostLabel) : nls.localize('connecting', "Connecting...");
			} else {
				this.messageElement.textContent = nls.localize('noFolderHelp', "You have not yet opened a folder.");
			}
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
