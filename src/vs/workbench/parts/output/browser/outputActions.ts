/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {IAction, Action} from 'vs/base/common/actions';
import {IOutputChannelRegistry, Extensions, IOutputService, OUTPUT_PANEL_ID} from 'vs/workbench/parts/output/common/output';
import {SelectActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

export class ToggleOutputAction extends Action {

	public static ID = 'workbench.action.output.toggleOutput';
	public static LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService,
		@IOutputService private outputService: IOutputService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.outputService.getActiveChannel().show();
	}
}

export class ClearOutputAction extends Action {

	constructor(
		@IOutputService private outputService: IOutputService,
		@IPanelService private panelService: IPanelService
	) {
		super('workbench.output.action.clearOutput', nls.localize('clearOutput', "Clear Output"), 'output-action clear-output');
	}

	public run(): TPromise<any> {
		this.outputService.getActiveChannel().clear();
		this.panelService.getActivePanel().focus();

		return TPromise.as(true);
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
		@IOutputService private outputService: IOutputService
	) {
		super(null, action, SwitchOutputActionItem.getChannelLabels(outputService), Math.max(0, SwitchOutputActionItem.getChannelLabels(outputService).indexOf(outputService.getActiveChannel().label)));
		this.toDispose.push(this.outputService.onOutputChannel(this.onOutputChannel, this));
		this.toDispose.push(this.outputService.onActiveOutputChannel(this.onOutputChannel, this));
	}

	protected getActionContext(option: string): string {
		const channel = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels().filter(channelData => channelData.label === option).pop();

		return channel ? channel.id : option;
	}

	private onOutputChannel(): void {
		let channels = SwitchOutputActionItem.getChannelLabels(this.outputService);
		let selected = Math.max(0, channels.indexOf(this.outputService.getActiveChannel().label));

		this.setOptions(channels, selected);
	}

	private static getChannelLabels(outputService: IOutputService): string[] {
		const contributedChannels = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).getChannels().map(channelData => channelData.label);
		return contributedChannels.sort(); // sort by name
	}
}
