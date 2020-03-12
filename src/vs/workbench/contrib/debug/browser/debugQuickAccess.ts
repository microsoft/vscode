/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { PickerQuickAccessProvider, IPickerQuickAccessItem, TriggerAction } from 'vs/platform/quickinput/common/quickAccess';
import { localize } from 'vs/nls';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { matchesFuzzy } from 'vs/base/common/filters';
import { StartAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { withNullAsUndefined } from 'vs/base/common/types';

export class StartDebugQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'debug ';

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(StartDebugQuickAccessProvider.PREFIX);
	}

	protected getPicks(filter: string): (IQuickPickSeparator | IPickerQuickAccessItem)[] {
		const picks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		const configManager = this.debugService.getConfigurationManager();

		// Entries: configs
		let lastGroup: string | undefined;
		for (let config of configManager.getAllConfigurations()) {
			const highlights = matchesFuzzy(filter, config.name, true);
			if (highlights) {

				// Separator
				if (lastGroup !== config.presentation?.group) {
					picks.push({ type: 'separator' });
					lastGroup = config.presentation?.group;
				}

				// Launch entry
				picks.push({
					label: config.name,
					ariaLabel: localize('entryAriaLabel', "{0}, debug picker", config.name),
					description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? config.launch.name : '',
					highlights: { label: highlights },
					buttons: [{
						iconClass: 'codicon-gear',
						tooltip: localize('customizeTask', "Configure Launch Configuration")
					}],
					trigger: () => {
						config.launch.openConfigFile(false, false);

						return TriggerAction.CLOSE_PICKER;
					},
					accept: async () => {
						if (StartAction.isEnabled(this.debugService)) {
							this.debugService.getConfigurationManager().selectConfiguration(config.launch, config.name);
							try {
								await this.debugService.startDebugging(config.launch);
							} catch (error) {
								this.notificationService.error(error);
							}
						}
					}
				});
			}
		}

		// Entries: launches
		const visibleLaunches = configManager.getLaunches().filter(launch => !launch.hidden);

		// Separator
		if (visibleLaunches.length > 0) {
			picks.push({ type: 'separator' });
		}

		for (const launch of visibleLaunches) {
			const label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ?
				localize("addConfigTo", "Add Config ({0})...", launch.name) :
				localize('addConfiguration', "Add Configuration...");

			// Add Config entry
			picks.push({
				label,
				ariaLabel: localize('entryAriaLabel', "{0}, debug picker", label),
				description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? launch.name : '',
				highlights: { label: withNullAsUndefined(matchesFuzzy(filter, label, true)) },
				accept: () => this.commandService.executeCommand('debug.addConfiguration', launch.uri.toString())
			});
		}

		return picks;
	}
}
