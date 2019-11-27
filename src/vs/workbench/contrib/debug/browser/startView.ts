/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewletPane, IViewletPaneOptions } from 'vs/workbench/browser/parts/views/paneViewlet';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StartAction, RunAction, ConfigureAction } from 'vs/workbench/contrib/debug/browser/debugActions';
const $ = dom.$;


export class StartView extends ViewletPane {

	static ID = 'workbench.debug.startView';
	static LABEL = localize('start', "Start");

	private debugButton!: Button;
	private runButton!: Button;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private readonly themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super({ ...(options as IViewletPaneOptions), ariaHeaderLabel: localize('debugStart', "Debug Start Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
	}

	protected renderBody(container: HTMLElement): void {
		this.debugButton = new Button(container);
		this.debugButton.label = localize('debug', "Debug");
		this._register(this.debugButton.onDidClick(() => {
			this.commandService.executeCommand(StartAction.ID);
		}));
		attachButtonStyler(this.debugButton, this.themeService);

		this.runButton = new Button(container);
		this.runButton.label = localize('run', "Run");

		dom.addClass(container, 'debug-start-view');
		this._register(this.runButton.onDidClick(() => {
			this.commandService.executeCommand(RunAction.ID);
		}));
		attachButtonStyler(this.runButton, this.themeService);

		const messageContainer = $('.section');
		container.appendChild(messageContainer);
		const messageElement = $('span');
		messageContainer.appendChild(messageElement);
		messageElement.textContent = localize('noLaunchConfiguration', "To specify how to run and debug your code, ");
		const clickElement = $('span.configure');
		clickElement.textContent = localize('configure', " create a launch.json file.");
		clickElement.onclick = () => this.commandService.executeCommand(ConfigureAction.ID);
		messageContainer.appendChild(clickElement);
	}

	protected layoutBody(_: number, __: number): void {
		// no-op
	}

	focus(): void {
		this.runButton.focus();
	}
}
