/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { IPlanningModeService, PlanningModeSettings } from '../common/planningMode.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { localize } from '../../../../nls.js';

export class PlanningModeStatusBarController extends Disposable {

	private statusBarDisposable: any = undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IPlanningModeService private readonly planningModeService: IPlanningModeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Update status bar when planning mode changes
		this._register(this.planningModeService.onDidChange(() => {
			this._updateStatusBar();
		}));

		// Update status bar when configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PlanningModeSettings.SHOW_STATUS_BAR)) {
				this._updateStatusBar();
			}
		}));

		// Initialize status bar
		this._updateStatusBar();
	}

	private _updateStatusBar(): void {
		const showStatusBar = this.configurationService.getValue<boolean>(PlanningModeSettings.SHOW_STATUS_BAR) ?? true;

		if (!showStatusBar || !this.planningModeService.isActive) {
			// Remove status bar entry
			if (this.statusBarDisposable) {
				this.statusBarDisposable.dispose();
				this.statusBarDisposable = undefined;
			}
			return;
		}

		// Get conversation stats
		const entryCount = this.planningModeService.conversationEntries.length;
		const toolCalls = this.planningModeService.conversationEntries.filter(e => e.type === 'tool-call').length;

		const text = localize('planningMode.statusBar', "Planning Mode");
		const tooltip = localize('planningMode.statusBarTooltip',
			"Planning Mode is active - File editing is restricted\n{0} conversation entries, {1} tool calls\nClick to toggle or export conversation",
			entryCount,
			toolCalls
		);

		const statusBarEntry: IStatusbarEntry = {
			name: localize('planningMode.statusBarName', "Planning Mode"),
			text: `$(target) ${text}`,
			tooltip,
			ariaLabel: text,
			command: 'workbench.action.togglePlanningMode',
			backgroundColor: {
				id: 'statusBarItem.prominentBackground'
			},
			color: {
				id: 'statusBarItem.prominentForeground'
			}
		};

		// Add or update status bar entry
		if (this.statusBarDisposable) {
			this.statusBarDisposable.dispose();
		}

		this.statusBarDisposable = this.statusbarService.addEntry(
			statusBarEntry,
			'planningMode.status',
			StatusbarAlignment.LEFT,
			100 // High priority to appear prominently
		);
	}

	override dispose(): void {
		super.dispose();
		if (this.statusBarDisposable) {
			this.statusBarDisposable.dispose();
		}
	}
}
