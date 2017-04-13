/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { IAction, Action } from 'vs/base/common/actions';
import { IOutputService, OUTPUT_PANEL_ID } from 'vs/workbench/parts/output/common/output';
import { SelectActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { attachSelectBoxStyler } from "vs/platform/theme/common/styler";
import { IThemeService } from "vs/platform/theme/common/themeService";

export class ToggleOutputAction extends TogglePanelAction {

	public static ID = 'workbench.action.output.toggleOutput';
	public static LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService,
	) {
		super(id, label, OUTPUT_PANEL_ID, panelService, partService);
	}
}

export class ClearOutputAction extends Action {

	public static ID = 'workbench.output.action.clearOutput';
	public static LABEL = nls.localize('clearOutput', "Clear Output");

	constructor(
		id: string, label: string,
		@IOutputService private outputService: IOutputService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'output-action clear-output');
	}

	public run(): TPromise<any> {
		this.outputService.getActiveChannel().clear();
		this.panelService.getActivePanel().focus();

		return TPromise.as(true);
	}
}

export class ToggleOutputScrollLockAction extends Action {

	public static ID = 'workbench.output.action.toggleOutputScrollLock';
	public static LABEL = nls.localize({ key: 'toggleOutputScrollLock', comment: ['Turn on / off automatic output scrolling'] }, "Toggle Output Scroll Lock");

	private toDispose: IDisposable[] = [];

	constructor(id: string, label: string,
		@IOutputService private outputService: IOutputService) {
		super(id, label, 'output-action output-scroll-unlock');
		this.toDispose.push(this.outputService.onActiveOutputChannel(channel => this.setClass(this.outputService.getActiveChannel().scrollLock)));
	}

	public run(): TPromise<any> {
		const activeChannel = this.outputService.getActiveChannel();
		if (activeChannel) {
			activeChannel.scrollLock = !activeChannel.scrollLock;
			this.setClass(activeChannel.scrollLock);
		}

		return TPromise.as(true);
	}

	private setClass(locked: boolean) {
		if (locked) {
			this.class = 'output-action output-scroll-lock';
		} else {
			this.class = 'output-action output-scroll-unlock';
		}
	}

	public dispose() {
		super.dispose();
		this.toDispose = dispose(this.toDispose);
	}
}

export class SwitchOutputAction extends Action {

	public static ID = 'workbench.output.action.switchBetweenOutputs';

	constructor( @IOutputService private outputService: IOutputService) {
		super(SwitchOutputAction.ID, nls.localize('switchToOutput.label', "Switch to Output"));

		this.class = 'output-action switch-to-output';
	}

	public run(channelId?: string): TPromise<any> {
		return this.outputService.getChannel(channelId).show();
	}
}

export class SwitchOutputActionItem extends SelectActionItem {

	constructor(
		action: IAction,
		@IOutputService private outputService: IOutputService,
		@IThemeService themeService: IThemeService
	) {
		super(null, action, [], 0);

		this.toDispose.push(this.outputService.onOutputChannel(() => this.setOptions(this.getOptions(), this.getSelected(undefined))));
		this.toDispose.push(this.outputService.onActiveOutputChannel(activeChannelId => this.setOptions(this.getOptions(), this.getSelected(activeChannelId))));
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService));

		this.setOptions(this.getOptions(), this.getSelected(this.outputService.getActiveChannel().id));
	}

	protected getActionContext(option: string): string {
		const channel = this.outputService.getChannels().filter(channelData => channelData.label === option).pop();

		return channel ? channel.id : option;
	}

	private getOptions(): string[] {
		return this.outputService.getChannels().map(c => c.label);
	}

	private getSelected(outputId: string): number {
		if (!outputId) {
			return undefined;
		}

		return Math.max(0, this.outputService.getChannels().map(c => c.id).indexOf(outputId));
	}
}
