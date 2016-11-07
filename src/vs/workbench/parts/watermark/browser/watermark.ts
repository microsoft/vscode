/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./watermark';
import { $ } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';

interface WatermarkEntry {
	text: string;
	ids: string[];
	folder?: boolean;
}

const entries: WatermarkEntry[] = [
	{
		text: nls.localize('watermark.showCommands', "Show All Commands"),
		ids: ['workbench.action.showCommands']
	},
	{
		text: nls.localize('watermark.quickOpen', "Go to File"),
		ids: ['workbench.action.quickOpen'],
		folder: true
	},
	isMacintosh ?
		{
			text: nls.localize('watermark.openFileFolder', "Open File or Folder"),
			ids: ['workbench.action.files.openFileFolder'],
			folder: false
		}
		:
		{
			text: nls.localize('watermark.openFile', "Open File"),
			ids: ['workbench.action.files.openFile'],
			folder: false
		}
	,
	{
		text: nls.localize('watermark.moveLines', "Move Lines Up/Down"),
		ids: ['editor.action.moveLinesUpAction', 'editor.action.moveLinesDownAction']
	},
	{
		text: nls.localize('watermark.addCursor', "Add Cursors Above/Below"),
		ids: ['editor.action.insertCursorAbove', 'editor.action.insertCursorBelow']
	},
	{
		text: nls.localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"),
		ids: ['workbench.action.terminal.toggleTerminal']
	},
];

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
		const selected = entries.filter(entry => !('folder' in entry) || entry.folder === folder);
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
