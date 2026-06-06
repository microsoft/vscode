/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AutomationsAccessibilityHelp } from '../aiCustomization/automationsAccessibilityHelp.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { IAutomationSessionTypeProvider, PlaceholderAutomationSessionTypeProvider } from '../../common/automations/automationSessionTypes.js';
import { publishAutomationToggled } from '../../common/automations/automationTelemetry.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING, DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES } from '../../common/automations/automationsEnabled.js';
import { PlaceholderAutomationRunner } from './automationRunner.js';
import { AutomationScheduler } from './automationScheduler.js';
import { AutomationService } from './automationService.js';

registerSingleton(IAutomationService, AutomationService, InstantiationType.Delayed);
registerSingleton(IAutomationRunner, PlaceholderAutomationRunner, InstantiationType.Delayed);
registerSingleton(IAutomationSessionTypeProvider, PlaceholderAutomationSessionTypeProvider, InstantiationType.Delayed);

registerWorkbenchContribution2(AutomationScheduler.ID, AutomationScheduler, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new AutomationsAccessibilityHelp());

// --- Setting + context key + toggle command --- //

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[CHAT_AUTOMATIONS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['preview'],
			description: localize('chat.automations.enabled', "Enables the Automations feature: scheduling agent sessions to run on a cadence. When disabled, the Automations entry in the Customizations sidebar, the Automations section in the Customizations editor, and the Automation option in the new-session composer are hidden, and scheduled automations are not dispatched."),
		},
		[CHAT_AUTOMATIONS_RUN_TIMEOUT_MINUTES_SETTING]: {
			type: 'number',
			default: DEFAULT_AUTOMATIONS_RUN_TIMEOUT_MINUTES,
			minimum: 1,
			tags: ['preview'],
			description: localize('chat.automations.runTimeoutMinutes', "Maximum number of minutes a scheduled automation run is allowed to take before the scheduler cancels it and marks it failed. Prevents a single hung run from permanently blocking subsequent scheduled runs."),
		},
	},
});

/**
 * Mirrors {@link CHAT_AUTOMATIONS_ENABLED_SETTING} into the
 * {@link ChatAutomationsEnabledContext} context key so menu `when`
 * clauses can react to it without subscribing to configuration directly.
 */
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

registerAction2(class ToggleChatAutomationsAction extends Action2 {
	static readonly ID = 'chat.automations.toggleEnabled';

	constructor() {
		super({
			id: ToggleChatAutomationsAction.ID,
			title: localize2('toggleChatAutomations', "Toggle Automations"),
			category: localize2('chatCategory', "Chat"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const telemetryService = accessor.get(ITelemetryService);
		const current = configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		const next = !current;
		await configurationService.updateValue(CHAT_AUTOMATIONS_ENABLED_SETTING, next, ConfigurationTarget.USER);
		publishAutomationToggled(telemetryService, next);
	}
});
