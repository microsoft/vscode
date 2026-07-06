/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AutomationsAccessibilityHelp } from '../../../../workbench/contrib/chat/browser/aiCustomization/automationsAccessibilityHelp.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IAutomationSessionTypeProvider } from '../../../../workbench/contrib/chat/common/automations/automationSessionTypes.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING, DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AutomationDialogService } from './automationDialogService.js';
import { AutomationRunner } from './automationRunner.js';
import { AutomationScheduler } from './automationScheduler.js';
import { AutomationService } from './automationService.js';
import { AutomationSessionTypeProvider } from './automationSessionTypeProvider.js';

registerSingleton(IAutomationService, AutomationService, InstantiationType.Delayed);
registerSingleton(IAutomationRunner, AutomationRunner, InstantiationType.Delayed);
registerSingleton(IAutomationSessionTypeProvider, AutomationSessionTypeProvider, InstantiationType.Delayed);
registerSingleton(IAutomationDialogService, AutomationDialogService, InstantiationType.Delayed);

registerWorkbenchContribution2(AutomationScheduler.ID, AutomationScheduler, WorkbenchPhase.Eventually);

AccessibleViewRegistry.register(new AutomationsAccessibilityHelp());

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[CHAT_AUTOMATIONS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.MACHINE,
			tags: ['experimental', 'advanced'],
			description: localize('chat.automations.enabled', "Enables the Automations feature: scheduling agent sessions to run on a cadence. When disabled, the Automations entry in the Customizations sidebar, the Automations section in the Customizations editor, and the Automation option in the new-session composer are hidden, and scheduled automations are not dispatched."),
			included: product.quality !== 'stable',
			experiment: { mode: 'auto' },
		},
		[CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING]: {
			type: 'number',
			default: DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES,
			minimum: 1,
			scope: ConfigurationScope.MACHINE,
			tags: ['experimental', 'advanced'],
			description: localize('chat.automations.runTimeoutMinutes', "Maximum number of minutes a scheduled automation run is allowed to take before the scheduler cancels it and marks it failed. Prevents a single hung run from permanently blocking subsequent scheduled runs."),
			included: product.quality !== 'stable',
		},
	},
});

// Mirrors the setting into a context key for menu `when` clauses.
class ChatAutomationsEnabledContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatAutomationsEnabledContext';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const key = ChatAutomationsEnabledContext.bindTo(contextKeyService);
		const update = () => key.set(configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true);
		update();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
				update();
			}
		}));
	}
}

registerWorkbenchContribution2(ChatAutomationsEnabledContextContribution.ID, ChatAutomationsEnabledContextContribution, WorkbenchPhase.BlockStartup);
