/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IAction, Action } from 'vs/base/common/actions';
import { IOutputService, OUTPUT_PANEL_ID, IOutputChannelRegistry, Extensions as OutputExt, IOutputChannelDescriptor, IFileOutputChannelDescriptor } from 'vs/workbench/contrib/output/common/output';
import { SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { TogglePanelAction } from 'vs/workbench/browser/panel';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { Registry } from 'vs/platform/registry/common/platform';
import { groupBy } from 'vs/base/common/arrays';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LogViewerInput } from 'vs/workbench/contrib/output/browser/logViewer';
import { ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';

export class ToggleOutputAction extends TogglePanelAction {

	public static readonly ID = 'workbench.action.output.toggleOutput';
	public static readonly LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IPanelService panelService: IPanelService,
	) {
		super(id, label, OUTPUT_PANEL_ID, panelService, layoutService);
	}
}

export class ClearOutputAction extends Action {

	public static readonly ID = 'workbench.output.action.clearOutput';
	public static readonly LABEL = nls.localize('clearOutput', "Clear Output");

	constructor(
		id: string, label: string,
		@IOutputService private readonly outputService: IOutputService
	) {
		super(id, label, 'output-action clear-output');
	}

	public run(): Promise<boolean> {
		const activeChannel = this.outputService.getActiveChannel();
		if (activeChannel) {
			activeChannel.clear();
			aria.status(nls.localize('outputCleared', "Output was cleared"));
		}
		return Promise.resolve(true);
	}
}

// this action can be triggered in two ways:
// 1. user clicks the action icon, In which case the action toggles the lock state
// 2. user clicks inside the output panel, which sets the lock, Or unsets it if they click the last line.
export class ToggleOrSetOutputScrollLockAction extends Action {

	public static readonly ID = 'workbench.output.action.toggleOutputScrollLock';
	public static readonly LABEL = nls.localize({ key: 'toggleOutputScrollLock', comment: ['Turn on / off automatic output scrolling'] }, "Toggle Output Scroll Lock");

	constructor(id: string, label: string, @IOutputService private readonly outputService: IOutputService) {
		super(id, label, 'output-action output-scroll-unlock');
		this._register(this.outputService.onActiveOutputChannel(channel => {
			const activeChannel = this.outputService.getActiveChannel();
			if (activeChannel) {
				this.setClassAndLabel(activeChannel.scrollLock);
			}
		}));
	}

	public run(newLockState?: boolean): Promise<boolean> {

		const activeChannel = this.outputService.getActiveChannel();
		if (activeChannel) {
			if (typeof (newLockState) === 'boolean') {
				activeChannel.scrollLock = newLockState;
			}
			else {
				activeChannel.scrollLock = !activeChannel.scrollLock;
			}
			this.setClassAndLabel(activeChannel.scrollLock);
		}

		return Promise.resolve(true);
	}

	private setClassAndLabel(locked: boolean) {
		if (locked) {
			this.class = 'output-action output-scroll-lock';
			this.label = nls.localize('outputScrollOn', "Turn Auto Scrolling On");
		} else {
			this.class = 'output-action output-scroll-unlock';
			this.label = nls.localize('outputScrollOff', "Turn Auto Scrolling Off");
		}
	}
}

export class SwitchOutputAction extends Action {

	public static readonly ID = 'workbench.output.action.switchBetweenOutputs';

	constructor(@IOutputService private readonly outputService: IOutputService) {
		super(SwitchOutputAction.ID, nls.localize('switchToOutput.label', "Switch to Output"));

		this.class = 'output-action switch-to-output';
	}

	public run(channelId: string): Promise<any> {
		return this.outputService.showChannel(channelId);
	}
}

export class SwitchOutputActionViewItem extends SelectActionViewItem {

	private static readonly SEPARATOR = '─────────';

	private outputChannels: IOutputChannelDescriptor[] = [];
	private logChannels: IOutputChannelDescriptor[] = [];

	constructor(
		action: IAction,
		@IOutputService private readonly outputService: IOutputService,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, [], 0, contextViewService, { ariaLabel: nls.localize('outputChannels', 'Output Channels.') });

		let outputChannelRegistry = Registry.as<IOutputChannelRegistry>(OutputExt.OutputChannels);
		this._register(outputChannelRegistry.onDidRegisterChannel(() => this.updateOtions()));
		this._register(outputChannelRegistry.onDidRemoveChannel(() => this.updateOtions()));
		this._register(this.outputService.onActiveOutputChannel(() => this.updateOtions()));
		this._register(attachSelectBoxStyler(this.selectBox, themeService));

		this.updateOtions();
	}

	protected getActionContext(option: string, index: number): string {
		const channel = index < this.outputChannels.length ? this.outputChannels[index] : this.logChannels[index - this.outputChannels.length - 1];
		return channel ? channel.id : option;
	}

	private updateOtions(): void {
		const groups = groupBy(this.outputService.getChannelDescriptors(), (c1: IOutputChannelDescriptor, c2: IOutputChannelDescriptor) => {
			if (!c1.log && c2.log) {
				return -1;
			}
			if (c1.log && !c2.log) {
				return 1;
			}
			return 0;
		});
		this.outputChannels = groups[0] || [];
		this.logChannels = groups[1] || [];
		const showSeparator = this.outputChannels.length && this.logChannels.length;
		const separatorIndex = showSeparator ? this.outputChannels.length : -1;
		const options: string[] = [...this.outputChannels.map(c => c.label), ...(showSeparator ? [SwitchOutputActionViewItem.SEPARATOR] : []), ...this.logChannels.map(c => nls.localize('logChannel', "Log ({0})", c.label))];
		let selected = 0;
		const activeChannel = this.outputService.getActiveChannel();
		if (activeChannel) {
			selected = this.outputChannels.map(c => c.id).indexOf(activeChannel.id);
			if (selected === -1) {
				const logChannelIndex = this.logChannels.map(c => c.id).indexOf(activeChannel.id);
				selected = logChannelIndex !== -1 ? separatorIndex + 1 + logChannelIndex : 0;
			}
		}
		this.setOptions(options.map((label, index) => <ISelectOptionItem>{ text: label, isDisabled: (index === separatorIndex ? true : undefined) }), Math.max(0, selected));
	}
}

export class OpenLogOutputFile extends Action {

	public static readonly ID = 'workbench.output.action.openLogOutputFile';
	public static readonly LABEL = nls.localize('openInLogViewer', "Open Log File");

	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(OpenLogOutputFile.ID, OpenLogOutputFile.LABEL, 'output-action open-log-file');
		this._register(this.outputService.onActiveOutputChannel(this.update, this));
		this.update();
	}

	private update(): void {
		this.enabled = !!this.getLogFileOutputChannelDescriptor();
	}

	public run(): Promise<any> {
		const logFileOutputChannelDescriptor = this.getLogFileOutputChannelDescriptor();
		return logFileOutputChannelDescriptor ? this.editorService.openEditor(this.instantiationService.createInstance(LogViewerInput, logFileOutputChannelDescriptor)).then(() => null) : Promise.resolve(null);
	}

	private getLogFileOutputChannelDescriptor(): IFileOutputChannelDescriptor | null {
		const channel = this.outputService.getActiveChannel();
		if (channel) {
			const descriptor = this.outputService.getChannelDescriptors().filter(c => c.id === channel.id)[0];
			if (descriptor && descriptor.file && descriptor.log) {
				return <IFileOutputChannelDescriptor>descriptor;
			}
		}
		return null;
	}
}

export class ShowLogsOutputChannelAction extends Action {

	static ID = 'workbench.action.showLogs';
	static LABEL = nls.localize('showLogs', "Show Logs...");

	constructor(id: string, label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IOutputService private readonly outputService: IOutputService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const entries: { id: string, label: string }[] = this.outputService.getChannelDescriptors().filter(c => c.file && c.log)
			.map(({ id, label }) => ({ id, label }));

		return this.quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log") })
			.then(entry => {
				if (entry) {
					return this.outputService.showChannel(entry.id);
				}
				return undefined;
			});
	}
}

interface IOutputChannelQuickPickItem extends IQuickPickItem {
	channel: IOutputChannelDescriptor;
}

export class OpenOutputLogFileAction extends Action {

	static ID = 'workbench.action.openLogFile';
	static LABEL = nls.localize('openLogFile', "Open Log File...");

	constructor(id: string, label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IOutputService private readonly outputService: IOutputService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const entries: IOutputChannelQuickPickItem[] = this.outputService.getChannelDescriptors().filter(c => c.file && c.log)
			.map(channel => (<IOutputChannelQuickPickItem>{ id: channel.id, label: channel.label, channel }));

		return this.quickInputService.pick(entries, { placeHolder: nls.localize('selectlogFile', "Select Log file") })
			.then(entry => {
				if (entry) {
					return this.editorService.openEditor(this.instantiationService.createInstance(LogViewerInput, entry.channel)).then(() => undefined);
				}
				return undefined;
			});
	}
}
