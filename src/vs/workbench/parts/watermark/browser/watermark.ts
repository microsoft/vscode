/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./watermark';
import { $ } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as nls from 'vs/nls';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';

const entries = [
	{
		text: nls.localize('watermark.showCommands', "Command Palette"),
		ids: ['workbench.action.showCommands']
	},
	{
		text: nls.localize('watermark.quickOpen', "Go to File"),
		ids: ['workbench.action.quickOpen']
	},
	{
		text: nls.localize('watermark.moveLines', "Move Lines Up/Down"),
		ids: ['editor.action.moveLinesUpAction', 'editor.action.moveLinesDownAction']
	},
	{
		text: nls.localize('watermark.addCursor', "Add Cursors Above/Below"),
		ids: ['editor.action.insertCursorAbove', 'editor.action.insertCursorBelow']
	},
	{
		text: nls.localize('watermark.toggleTerminal', "Toggle Terminal"),
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
		const watermark = $()
			.div({ 'class': 'watermark' });
		const box = $(watermark)
			.div({ 'class': 'watermark-box' });
		const update = () => {
			const builder = $(box);
			builder.clearChildren();
			entries.map(entry => {
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
