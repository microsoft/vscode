/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromPromise, observableValue } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
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
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { AutomationRemindersContribution, AutomationRemindersService, IAutomationRemindersService } from './automationReminders.js';
import { AUTOMATION_REMINDERS_ENABLED_SETTING, AutomationRemindersEnabledContext, CREATE_REMINDER_COMMAND, CREATE_REMINDER_DRAFT_COMMAND, DISMISS_REMINDER_COMMAND, EDIT_REMINDER_COMMAND, isAutomationRemindersEnabled, OPEN_REMINDER_COMMAND, OPEN_REMINDER_SOURCE_COMMAND, OPEN_REMINDERS_COMMAND, POSTPONE_REMINDER_COMMAND, ReminderHasSourceContext, RemindersCanCreateContext, ReminderStatusContext, SESSIONS_SHOW_REMINDERS_SETTING, UNDO_REMINDER_COMMAND } from '../../../../workbench/contrib/chat/common/automations/automationReminders.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';

const initialProvidersSettled = observableFromPromise(
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).whenRestored.then(() => true)
).map(result => result.value === true);

registerSingleton(IAutomationService, new SyncDescriptor(ProviderAutomationService, [initialProvidersSettled], true));
registerSingleton(IAutomationRunner, AutomationRunner, InstantiationType.Delayed);
registerSingleton(IAutomationDialogService, AutomationDialogService, InstantiationType.Delayed);
registerSingleton(IAutomationRemindersService, AutomationRemindersService, InstantiationType.Delayed);
registerWorkbenchContribution2(AutomationRemindersContribution.ID, AutomationRemindersContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[AUTOMATION_REMINDERS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('reminders.enabled', "Enable experimental one-time reminders in Automations and Inbox. Reminders notify you without running an agent. Requires Automations and a local Agent Host with reminder support."),
		},
		[SESSIONS_SHOW_REMINDERS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('reminders.outsideInbox', "Show the Reminders section in other Sessions list groupings when reminders are enabled. This does not change reminder delivery."),
		},
	},
});

const reminderRow = ContextKeyExpr.equals(SessionSectionTypeContext.key, 'reminder');
const reminderActions: {
	id: string; title: ReturnType<typeof localize2>; kind: Parameters<IAutomationRemindersService['execute']>[0];
	icon?: ThemeIcon; when?: ContextKeyExpression; group?: string; order?: number; inline?: boolean;
}[] = [
		{ id: CREATE_REMINDER_COMMAND, title: localize2('reminder.create', "New Reminder..."), kind: 'create', icon: Codicon.add, when: ContextKeyExpr.and(ContextKeyExpr.equals(SessionSectionTypeContext.key, 'reminders'), RemindersCanCreateContext), group: 'navigation', order: 0, inline: true },
		{ id: OPEN_REMINDER_COMMAND, title: localize2('reminder.open', "Open Reminder"), kind: 'open', when: reminderRow, group: 'navigation', order: 0 },
		{ id: CREATE_REMINDER_DRAFT_COMMAND, title: localize2('reminder.draft', "Create Draft Session"), kind: 'draft', icon: Codicon.commentDiscussion, when: ContextKeyExpr.and(reminderRow, ReminderStatusContext.isEqualTo('due')), group: 'navigation', order: 1, inline: true },
		{ id: OPEN_REMINDER_SOURCE_COMMAND, title: localize2('reminder.source', "Open Original Session"), kind: 'source', when: ContextKeyExpr.and(reminderRow, ReminderHasSourceContext), group: 'navigation', order: 2 },
		{ id: POSTPONE_REMINDER_COMMAND, title: localize2('reminder.postpone', "Postpone..."), kind: 'postpone', icon: Codicon.clock, when: reminderRow, group: '1_state', order: 3, inline: true },
		{ id: EDIT_REMINDER_COMMAND, title: localize2('reminder.edit', "Edit Reminder..."), kind: 'edit', when: reminderRow, group: '4_manage', order: 4 },
		{ id: DISMISS_REMINDER_COMMAND, title: localize2('reminder.dismiss', "Dismiss"), kind: 'dismiss', icon: Codicon.check, when: reminderRow, group: '4_manage', order: 5, inline: true },
		{ id: UNDO_REMINDER_COMMAND, title: localize2('reminder.undo', "Undo Reminder"), kind: 'undo' },
	];
for (const action of reminderActions) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: action.id, title: action.title, icon: action.icon, category: CHAT_CATEGORY, f1: false,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, AutomationRemindersEnabledContext, IsWebContext.negate()),
				menu: action.group ? [
					{ id: Menus.SessionSectionContext, group: action.group, order: action.order, when: action.when },
					{ id: SessionSectionToolbarMenuId, group: action.inline ? 'navigation' : '4_manage', order: action.order, when: action.when },
				] : undefined,
			});
		}
		override async run(accessor: ServicesAccessor, context?: string | { readonly reminder?: IAutomationDescriptor }, revision?: string): Promise<void> {
			const id = typeof context === 'string' ? context : context?.reminder?.id;
			await accessor.get(IAutomationRemindersService).execute(action.kind, id, revision);
		}
	});
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_REMINDERS_COMMAND, title: localize2('reminders.view', "Manage Reminders..."), category: CHAT_CATEGORY, f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, AutomationRemindersEnabledContext, IsWebContext.negate()),
			menu: [{ id: Menus.SessionSectionContext, group: '4_manage', when: ContextKeyExpr.equals(SessionSectionTypeContext.key, 'reminders') }],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		if (!isAutomationRemindersEnabled(accessor.get(IConfigurationService))) {
			return;
		}
		accessor.get(ICustomViewService).showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	}
});

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
		const sessionsService = accessor.get(ISessionsService);
		const customViewService = accessor.get(ICustomViewService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
			&& !configurationService.getValue<boolean>(ChatAIDisabledSettingId);
		if (!isEnabled()) {
			return;
		}

		const shouldRefresh = automationService.catalogueState.get() !== 'ready' && automationService.automations.get().length === 0;
		const refreshing = observableValue(this, shouldRefresh);
		const pickerDisposables = new DisposableStore();
		let pick: IQuickPickItem | undefined;
		try {
			const picker = pickerDisposables.add(quickInputService.createQuickPick<IQuickPickItem>());
			picker.title = localize('runAutomationTitle', "Run Automation");
			picker.placeholder = localize('selectAutomationToRun', "Select an automation to run");
			picker.matchOnDescription = true;
			picker.matchOnDetail = true;
			picker.keepScrollPosition = true;
			pick = await new Promise<IQuickPickItem | undefined>(resolve => {
				pickerDisposables.add(picker.onDidAccept(() => {
					const selected = picker.selectedItems[0];
					if (selected?.id && selected.pickable !== false) {
						resolve(selected);
						picker.hide();
					}
				}));
				pickerDisposables.add(picker.onDidHide(() => resolve(undefined)));
				pickerDisposables.add(autorun(reader => {
					const loading = automationService.catalogueState.read(reader) === 'loading';
					picker.busy = refreshing.read(reader) || automationService.isRefreshing?.read(reader) === true || loading;
					const picks = automationService.automations.read(reader)
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
					const activeId = picker.activeItems[0]?.id;
					picker.items = picks.length ? picks : [{
						label: loading ? localize('loadingAutomations', "Loading automations...") : localize('noRunnableAutomations', "No automations are currently available to run."),
						pickable: false,
					}];
					const activeItem = activeId ? picks.find(item => item.id === activeId) : undefined;
					if (activeItem) {
						picker.activeItems = [activeItem];
					}
				}));
				picker.show();
				if (shouldRefresh) {
					void (async () => {
						try {
							await automationService.refresh?.();
						} catch (error) {
							logService.warn('[RunAutomationAction] Failed to refresh automations', error);
						} finally {
							refreshing.set(false, undefined);
						}
					})();
				}
			});
		} finally {
			pickerDisposables.dispose();
		}
		const automation = pick?.id ? automationService.getAutomation(pick.id) : undefined;
		if (!automation || !isEnabled() || !automationService.canRunAutomation(automation.id)) {
			return;
		}
		const dispatch = await automationRunner.runOnce(automation).whenDispatched;
		if (dispatch.kind !== 'accepted' && dispatch.kind !== 'started' && dispatch.kind !== 'alreadyRunning') {
			return;
		}
		const sessionResource = dispatch.kind === 'started' ? dispatch.sessionResource
			: dispatch.kind === 'alreadyRunning' ? dispatch.activeRun.sessionResource : undefined;
		const notification = notificationService.prompt(Severity.Info,
			dispatch.kind === 'alreadyRunning'
				? localize('automationAlreadyRunning', "Automation '{0}' is already running.", automation.name)
				: localize('automationRunRequested', "Run requested for automation '{0}'.", automation.name),
			[{
				label: sessionResource ? localize('openAutomationRun', "Open Run") : localize('showAutomations', "Show Automations"),
				run: async () => {
					if (!isEnabled()) {
						return;
					}
					try {
						if (sessionResource) {
							await sessionsService.openSession(sessionResource, { preserveFocus: false, source: 'automation' });
						} else {
							customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
						}
					} catch (error) {
						logService.error('[RunAutomationAction] Failed to open automation run', error);
						notificationService.error(localize('automationRunOpenFailed', "Failed to open automation run: {0}", getErrorMessage(error)));
					}
				},
			}]);
		const disposables = new DisposableStore();
		disposables.add(Event.once(notification.onDidClose)(() => disposables.dispose()));
		disposableTimeout(() => {
			disposables.dispose();
			notification.close();
		}, 10_000, disposables);
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
