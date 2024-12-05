/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { PickerQuickAccessProvider, IPickerQuickAccessItem, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IDebugService } from '../common/debug.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { ADD_CONFIGURATION_ID, DEBUG_QUICK_ACCESS_PREFIX } from './debugCommands.js';
import { debugConfigure, debugRemoveConfig } from './debugIcons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export class StartDebugQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(DEBUG_QUICK_ACCESS_PREFIX, {
			noResultsPick: {
				label: localize('noDebugResults', "No matching launch configurations")
			}
		});
	}

	protected async _getPicks(filter: string): Promise<(IQuickPickSeparator | IPickerQuickAccessItem)[]> {
		const picks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
			return [];
		}

		picks.push({ type: 'separator', label: 'launch.json' });

		const configManager = this.debugService.getConfigurationManager();

		// Entries: configs
		let lastGroup: string | undefined;
		for (const config of configManager.getAllConfigurations()) {
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
					description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? config.launch.name : '',
					highlights: { label: highlights },
					buttons: [{
						iconClass: ThemeIcon.asClassName(debugConfigure),
						tooltip: localize('customizeLaunchConfig', "Configure Launch Configuration")
					}],
					trigger: () => {
						config.launch.openConfigFile({ preserveFocus: false });

						return TriggerAction.CLOSE_PICKER;
					},
					accept: async () => {
						await configManager.selectConfiguration(config.launch, config.name);
						try {
							await this.debugService.startDebugging(config.launch, undefined, { startedByUser: true });
						} catch (error) {
							this.notificationService.error(error);
						}
					}
				});
			}
		}

		// Entries detected configurations
		const dynamicProviders = await configManager.getDynamicProviders();
		if (dynamicProviders.length > 0) {
			picks.push({
				type: 'separator', label: localize({
					key: 'contributed',
					comment: ['contributed is lower case because it looks better like that in UI. Nothing preceeds it. It is a name of the grouping of debug configurations.']
				}, "contributed")
			});
		}

		configManager.getRecentDynamicConfigurations().forEach(({ name, type }) => {
			const highlights = matchesFuzzy(filter, name, true);
			if (highlights) {
				picks.push({
					label: name,
					highlights: { label: highlights },
					buttons: [{
						iconClass: ThemeIcon.asClassName(debugRemoveConfig),
						tooltip: localize('removeLaunchConfig', "Remove Launch Configuration")
					}],
					trigger: () => {
						configManager.removeRecentDynamicConfigurations(name, type);
						return TriggerAction.CLOSE_PICKER;
					},
					accept: async () => {
						await configManager.selectConfiguration(undefined, name, undefined, { type });
						try {
							const { launch, getConfig } = configManager.selectedConfiguration;
							const config = await getConfig();
							await this.debugService.startDebugging(launch, config, { startedByUser: true });
						} catch (error) {
							this.notificationService.error(error);
						}
					}
				});
			}
		});

		dynamicProviders.forEach(provider => {
			picks.push({
				label: `$(folder) ${provider.label}...`,
				ariaLabel: localize({ key: 'providerAriaLabel', comment: ['Placeholder stands for the provider label. For example "NodeJS".'] }, "{0} contributed configurations", provider.label),
				accept: async () => {
					const pick = await provider.pick();
					if (pick) {
						// Use the type of the provider, not of the config since config sometimes have subtypes (for example "node-terminal")
						await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
						this.debugService.startDebugging(pick.launch, pick.config, { startedByUser: true });
					}
				}
			});
		});


		// Entries: launches
		const visibleLaunches = configManager.getLaunches().filter(launch => !launch.hidden);

		// Separator
		if (visibleLaunches.length > 0) {
			picks.push({ type: 'separator', label: localize('configure', "configure") });
		}

		for (const launch of visibleLaunches) {
			const label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ?
				localize("addConfigTo", "Add Config ({0})...", launch.name) :
				localize('addConfiguration', "Add Configuration...");

			// Add Config entry
			picks.push({
				label,
				description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? launch.name : '',
				highlights: { label: matchesFuzzy(filter, label, true) ?? undefined },
				accept: () => this.commandService.executeCommand(ADD_CONFIGURATION_ID, launch.uri.toString())
			});
		}

		return picks;
	}
}
