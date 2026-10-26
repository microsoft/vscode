/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromPromise } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AutomationDialogService } from './automationDialogService.js';
import { AutomationRunner } from './automationRunner.js';
import { ProviderAutomationService } from './providerAutomationService.js';
import { AutomationToolsContribution } from './automationTools.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY } from '../../../../platform/agentHost/common/automationConfig.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

const initialProvidersSettled = observableFromPromise(
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).whenRestored.then(() => true)
).map(result => result.value === true);

registerSingleton(IAutomationService, new SyncDescriptor(ProviderAutomationService, [initialProvidersSettled], true));
registerSingleton(IAutomationRunner, AutomationRunner, InstantiationType.Delayed);
registerSingleton(IAutomationDialogService, AutomationDialogService, InstantiationType.Delayed);

registerWorkbenchContribution2(AutomationToolsContribution.ID, AutomationToolsContribution, WorkbenchPhase.Eventually);

registerAction2(class RunAutomationAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.runAutomation',
			title: localize2('runAutomation', "Run Automation..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationService = accessor.get(IAutomationService);
		const automationRunner = accessor.get(IAutomationRunner);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const labelService = accessor.get(ILabelService);
		const logService = accessor.get(ILogService);
		const providersService = accessor.get(ISessionsProvidersService);
		const notificationService = accessor.get(INotificationService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
			&& !configurationService.getValue<boolean>(ChatAIDisabledSettingId);
		if (!isEnabled()) {
			return;
		}

		const loadPicks = async (): Promise<IQuickPickItem[]> => {
			try {
				await automationService.refresh?.();
			} catch (error) {
				logService.warn('[RunAutomationAction] Failed to refresh automations', error);
			}
			const picks = automationService.automations.get()
				.filter(automation => automationService.canRunAutomation(automation.id))
				.map(automation => ({
					id: automation.id,
					label: automation.name,
					description: [
						automation.target.providerId ? providersService.getProvider(automation.target.providerId)?.label : undefined,
						automation.target.kind === 'workspace' ? labelService.getUriLabel(automation.target.folderUri, { relative: true }) : undefined,
					].filter(Boolean).join(' · '),
					detail: automation.prompt,
				}));
			return picks.length ? picks : [{ label: localize('noRunnableAutomations', "No automations are currently available to run."), pickable: false }];
		};
		const pick = await quickInputService.pick(loadPicks(), {
			title: localize('runAutomationTitle', "Run Automation"),
			placeHolder: localize('selectAutomationToRun', "Select an automation to run"),
			matchOnDescription: true,
			matchOnDetail: true,
		});
		const automation = pick?.id ? automationService.getAutomation(pick.id) : undefined;
		if (!automation || !isEnabled() || !automationService.canRunAutomation(automation.id)) {
			return;
		}
		const dispatch = await automationRunner.runOnce(automation).whenDispatched;
		if (dispatch.kind === 'accepted' || dispatch.kind === 'started') {
			notificationService.info(localize('automationRunRequested', "Run requested for automation '{0}'. Check Automations for run history.", automation.name));
		} else if (dispatch.kind === 'alreadyRunning') {
			notificationService.info(localize('automationAlreadyRunning', "Automation '{0}' is already running.", automation.name));
		}
	}
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.MACHINE,
			description: localize('chat.automations.cloud.enabled', "Enables managing Only me and Repository cloud automations in known GitHub repositories that support automation management. Disabling this setting does not stop schedules already running on GitHub."),
			tags: ['preview'],
			experiment: { mode: 'auto' },
		},
		[CHAT_AUTOMATIONS_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.MACHINE,
			description: localize('chat.automations.enabled', "Enables the Automations feature: scheduling agent sessions to run on a cadence. When disabled, the Automations entry in the Customizations sidebar, the Automations section in the Customizations editor, and the Automation option in the new-session composer are hidden, and scheduled automations are not dispatched."),
			experiment: { mode: 'auto' },
			agentHost: { key: AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY },
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
