/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./watermark';
import { $ } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';
import { KeybindingsReferenceAction } from 'vs/workbench/electron-browser/actions';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';

interface WatermarkEntry {
	text: string;
	ids: string[];
	mac?: boolean;
}

const showCommands: WatermarkEntry = {
	text: nls.localize('watermark.showCommands', "Show All Commands"),
	ids: ['workbench.action.showCommands']
};
const quickOpen: WatermarkEntry = {
	text: nls.localize('watermark.quickOpen', "Go to File"),
	ids: ['workbench.action.quickOpen']
};
const openFileNonMacOnly: WatermarkEntry = {
	text: nls.localize('watermark.openFile', "Open File"),
	ids: ['workbench.action.files.openFile'],
	mac: false
};
const openFolderNonMacOnly: WatermarkEntry = {
	text: nls.localize('watermark.openFolder', "Open Folder"),
	ids: ['workbench.action.files.openFolder'],
	mac: false
};
const openFileOrFolderMacOnly: WatermarkEntry = {
	text: nls.localize('watermark.openFileFolder', "Open File or Folder"),
	ids: ['workbench.action.files.openFileFolder'],
	mac: true
};
const openRecent: WatermarkEntry = {
	text: nls.localize('watermark.openRecent', "Open Recent"),
	ids: ['workbench.action.openRecent']
};
const newUntitledFile: WatermarkEntry = {
	text: nls.localize('watermark.newUntitledFile', "New Untitled File"),
	ids: ['workbench.action.files.newUntitledFile']
};
const newUntitledFileMacOnly: WatermarkEntry = assign({ mac: true }, newUntitledFile);
const toggleTerminal: WatermarkEntry = {
	text: nls.localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"),
	ids: ['workbench.action.terminal.toggleTerminal']
};

const findInFiles: WatermarkEntry = {
	text: nls.localize('watermark.findInFiles', "Find in Files"),
	ids: ['workbench.action.findInFiles']
};
const startDebugging: WatermarkEntry = {
	text: nls.localize('watermark.startDebugging', "Start Debugging"),
	ids: ['workbench.action.debug.start']
};

// TODO: default keybinding
const selectTheme: WatermarkEntry = {
	text: nls.localize('watermark.selectTheme', "Change Color Theme"),
	ids: ['workbench.action.selectTheme']
};
// TODO: requires #15159
const selectKeymap: WatermarkEntry = {
	text: nls.localize('watermark.selectKeymap', "Change Keymap"),
	ids: ['workbench.action.openGlobalKeybindings']
};
// TODO: default keybinding
const keybindingsReference: WatermarkEntry = {
	text: nls.localize('watermark.keybindingsReference', "Keyboard Reference"),
	ids: ['workbench.action.keybindingsReference']
};
// TODO: default keybinding
const openGlobalKeybindings: WatermarkEntry = {
	text: nls.localize('watermark.openGlobalKeybindings', "Keyboard Shortcuts"),
	ids: ['workbench.action.openGlobalKeybindings']
};

const firstSessionEntries = [
	showCommands,
	selectTheme,
	selectKeymap,
	openFolderNonMacOnly,
	openFileOrFolderMacOnly,
	KeybindingsReferenceAction.AVAILABLE ? keybindingsReference : openGlobalKeybindings
];

const noFolderEntries = [
	showCommands,
	openFileNonMacOnly,
	openFolderNonMacOnly,
	openFileOrFolderMacOnly,
	openRecent,
	newUntitledFileMacOnly,
	toggleTerminal
];

const folderEntries = [
	showCommands,
	quickOpen,
	findInFiles,
	startDebugging,
	toggleTerminal
];

const firstSession = false; // TODO: fix above TODOs first

const UNBOUND = nls.localize('watermark.unboundCommand', "unbound");

export class WatermarkContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[] = [];

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IPartService private partService: IPartService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		if (telemetryService.getExperiments().showCommandsWatermark) {
			lifecycleService.onShutdown(this.dispose, this);
			this.partService.joinCreation().then(() => {
				this.create();
			});
		}
	}

	public getId() {
		return 'vs.watermark';
	}

	private create(): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);
		$(container).addClass('has-watermark');
		const watermark = $()
			.div({ 'class': 'watermark' });
		const box = $(watermark)
			.div({ 'class': 'watermark-box' });
		const folder = !!this.contextService.getWorkspace();
		const selected = (folder ? folderEntries : firstSession ? firstSessionEntries : noFolderEntries)
			.filter(entry => !('mac' in entry) || entry.mac === isMacintosh);
		const update = () => {
			const builder = $(box);
			builder.clearChildren();
			selected.map(entry => {
				builder.element('dl', {}, dl => {
					dl.element('dt', {}, dt => dt.text(entry.text));
					dl.element('dd', {}, dd => dd.innerHtml(
						entry.ids
							.map(id => this.keybindingService.lookupKeybindings(id).slice(0, 1)
								.map(k => `<span class="shortcuts">${this.keybindingService.getLabelFor(k)}</span>`)
								.join('') || UNBOUND)
							.join(' / ')
					));
				});
			});
		};
		update();
		watermark.build(container, 0);
		this.toDispose.push(this.keybindingService.onDidUpdateKeybindings(update));
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WatermarkContribution);
