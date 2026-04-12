/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IDebugService } from '../common/debug.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { ADD_CONFIGURATION_ID, DEBUG_QUICK_ACCESS_PREFIX } from './debugCommands.js';
import { debugConfigure, debugRemoveConfig } from './debugIcons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
let StartDebugQuickAccessProvider = class StartDebugQuickAccessProvider extends PickerQuickAccessProvider {
    constructor(debugService, contextService, commandService, notificationService) {
        super(DEBUG_QUICK_ACCESS_PREFIX, {
            noResultsPick: {
                label: localize('noDebugResults', "No matching launch configurations")
            }
        });
        this.debugService = debugService;
        this.contextService = contextService;
        this.commandService = commandService;
        this.notificationService = notificationService;
    }
    async _getPicks(filter) {
        const picks = [];
        if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
            return [];
        }
        picks.push({ type: 'separator', label: 'launch.json' });
        const configManager = this.debugService.getConfigurationManager();
        const selectedConfiguration = configManager.selectedConfiguration;
        // Entries: configs
        let lastGroup;
        for (const config of configManager.getAllConfigurations()) {
            const highlights = matchesFuzzy(filter, config.name, true);
            if (highlights) {
                const pick = {
                    label: config.name,
                    description: this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ? config.launch.name : '',
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
                        }
                        catch (error) {
                            this.notificationService.error(error);
                        }
                    }
                };
                // Most recently used configuration
                if (selectedConfiguration.name === config.name && selectedConfiguration.launch === config.launch) {
                    const separator = { type: 'separator', label: localize('mostRecent', 'Most Recent') };
                    picks.unshift(separator, pick);
                    continue;
                }
                // Separator
                if (lastGroup !== config.presentation?.group) {
                    picks.push({ type: 'separator' });
                    lastGroup = config.presentation?.group;
                }
                // Launch entry
                picks.push(pick);
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
                        }
                        catch (error) {
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
            const label = this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ?
                localize("addConfigTo", "Add Config ({0})...", launch.name) :
                localize('addConfiguration', "Add Configuration...");
            // Add Config entry
            picks.push({
                label,
                description: this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ ? launch.name : '',
                highlights: { label: matchesFuzzy(filter, label, true) ?? undefined },
                accept: () => this.commandService.executeCommand(ADD_CONFIGURATION_ID, launch.uri.toString())
            });
        }
        return picks;
    }
};
StartDebugQuickAccessProvider = __decorate([
    __param(0, IDebugService),
    __param(1, IWorkspaceContextService),
    __param(2, ICommandService),
    __param(3, INotificationService)
], StartDebugQuickAccessProvider);
export { StartDebugQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUseUJBQXlCLEVBQTBCLGFBQWEsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2hKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUxRCxJQUFNLDZCQUE2QixHQUFuQyxNQUFNLDZCQUE4QixTQUFRLHlCQUFpRDtJQUVuRyxZQUNpQyxZQUEyQixFQUNoQixjQUF3QyxFQUNqRCxjQUErQixFQUMxQixtQkFBeUM7UUFFaEYsS0FBSyxDQUFDLHlCQUF5QixFQUFFO1lBQ2hDLGFBQWEsRUFBRTtnQkFDZCxLQUFLLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLG1DQUFtQyxDQUFDO2FBQ3RFO1NBQ0QsQ0FBQyxD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