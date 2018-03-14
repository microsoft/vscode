/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { IAction, Action } from 'vs/base/common/actions';
import { IOutputService, OUTPUT_PANEL_ID, IOutputChannelRegistry, Extensions as OutputExt, IOutputChannelIdentifier } from 'vs/workbench/parts/output/common/output';
import { SelectActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { Registry } from 'vs/platform/registry/common/platform';
import { groupBy } from 'vs/base/common/arrays';

export class ToggleOutputAction extends TogglePanelAction {

	public static readonly ID = 'workbench.action.output.toggleOutput';
	public static readonly LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IPartService partService: IPartService,
		@IPanelService panelService: IPanelService,
	) {
		super(id, label, OUTPUT_PANEL_ID, panelService, partService);
	}
}

export class ClearOutputAction extends Action {

	public static readonly ID = 'workbench.output.action.clearOutput';
	public static readonly LABEL = nls.localize('clearOutput', "Clear Output");

	constructor(
		id: string, label: string,
		@IOutputService private outputService: IOutputService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'output-action clear-output');
	}

	public run(): TPromise<boolean> {
		this.outputService.getActiveChannel().clear();
		this.panelService.getActivePanel().focus();

		return TPromise.as(true);
	}
}

export class ToggleOutputScrollLockAction extends Action {

	public static readonly ID = 'workbench.output.action.toggleOutputScrollLock';
	public static readonly LABEL = nls.localize({ key: 'toggleOutputScrollLock', comment: ['Turn on / off automatic output scrolling'] }, "Toggle Output Scroll Lock");

	private toDispose: IDisposable[] = [];

	constructor(id: string, label: string,
		@IOutputService private outputService: IOutputService) {
		super(id, label, 'output-action output-scroll-unlock');
		this.toDispose.push(this.outputService.onActiveOutputChannel(channel => this.setClass(this.outputService.getActiveChannel().scrollLock)));
	}

	public run(): TPromise<boolean> {
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

	public static readonly ID = 'workbench.output.action.switchBetweenOutputs';

	constructor(@IOutputService private outputService: IOutputService) {
		super(SwitchOutputAction.ID, nls.localize('switchToOutput.label', "Switch to Output"));

		this.class = 'output-action switch-to-output';
	}

	public run(channelId?: string): TPromise<any> {
		return this.outputService.showChannel(channelId);
	}
}

export class SwitchOutputActionItem extends SelectActionItem {

	private static readonly SEPARATOR = '─────────';

	constructor(
		action: IAction,
		@IOutputService private outputService: IOutputService,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, [], 0, contextViewService);

		let outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
		this.toDispose.push(outputChannelRegistry.onDidRegisterChannel(() => this.updateOtions(this.outputService.getActiveChannel().id)));
		this.toDispose.push(outputChannelRegistry.onDidRemoveChannel(() => this.updateOtions(this.outputService.getActiveChannel().id)));
		this.toDispose.push(this.outputService.onActiveOutputChannel(activeChannelId => this.updateOtions(activeChannelId)));
		this.toDispose.push(attachSelectBoxStyler(this.selectBox, themeService));

		this.updateOtions(this.outputService.getActiveChannel().id);
	}

	protected getActionContext(option: string): string {
		const channel = this.outputService.getChannels().filter(channelData => channelData.label === option).pop();
		return channel ? channel.id : option;
	}

	private updateOtions(selectedChannel: string): void {
		const groups = groupBy(this.outputService.getChannels(), (c1: IOutputChannelIdentifier, c2: IOutputChannelIdentifier) => {
			if (!c1.file && c2.file) {
				return -1;
			}
			if (c1.file && !c2.file) {
				return 1;
			}
			return 0;
		});
		const channels = groups[0] || [];
		const fileChannels = groups[1] || [];
		const showSeparator = channels.length && fileChannels.length;
		const separatorIndex = showSeparator ? channels.length : -1;
		const options: string[] = [...channels.map(c => c.label), ...(showSeparator ? [SwitchOutputActionItem.SEPARATOR] : []), ...fileChannels.map(c => c.label)];
		let selected = 0;
		if (selectedChannel) {
			selected = channels.map(c => c.id).indexOf(selectedChannel);
			if (selected === -1) {
				selected = separatorIndex + 1 + fileChannels.map(c => c.id).indexOf(selectedChannel);
			}
		}
		this.setOptions(options, Math.max(0, selected), separatorIndex !== -1 ? separatorIndex : void 0);
	}
}
