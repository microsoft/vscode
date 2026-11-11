/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, NotificationsFilter, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { serializeChatDraft } from '../../../../workbench/contrib/chat/common/attachments/chatDraft.js';
import { IChatRequestVariableEntry, isImplicitVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { EDIT_REMINDER_COMMAND, OPEN_REMINDERS_COMMAND, reminderDescription, UNDO_REMINDER_COMMAND } from '../../../../workbench/contrib/chat/common/automations/automationReminders.js';
import { IAutomationService, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IParsedReminder, parseReminder, parseReminderTime } from '../../../../workbench/contrib/chat/common/automations/reminderParser.js';
import { ChatAgentLocation, ChatConfiguration, ChatNotificationMode } from '../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IChatSlashCommandService } from '../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';

export const IAutomationRemindersService = createDecorator<IAutomationRemindersService>('automationRemindersService');

export interface IAutomationRemindersService {
	readonly _serviceBrand: undefined;
	execute(action: 'create' | 'open' | 'edit' | 'undo', id?: string, revision?: string): Promise<void>;
}

/** UI for host-owned reminders. There is deliberately no scheduling timer or second store here. */
export class AutomationRemindersService extends Disposable implements IAutomationRemindersService {
	declare readonly _serviceBrand: undefined;
	private readonly notification = this._register(new MutableDisposable());
	private readonly osNotification = this._register(new MutableDisposable());
	private readonly delivered = new Set<string>();

	constructor(
		@IAutomationService private readonly automations: IAutomationService,
		@IQuickInputService private readonly quickInput: IQuickInputService,
		@INotificationService private readonly notifications: INotificationService,
		@IChatInputNotificationService private readonly inputNotifications: IChatInputNotificationService,
		@IChatSlashCommandService slashCommands: IChatSlashCommandService,
		@ICommandService private readonly commands: ICommandService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@ISessionsService private readonly sessions: ISessionsService,
		@ISessionsPartService private readonly sessionsPart: ISessionsPartService,
		@ISessionsManagementService sessionsManagement: ISessionsManagementService,
		@IModelService private readonly models: IModelService,
		@ILogService private readonly logService: ILogService,
		@IAccessibilitySignalService private readonly signals: IAccessibilitySignalService,
		@IHostService private readonly host: IHostService,
	) {
		super();
		if (isWeb) {
			return;
		}
		this._register(slashCommands.registerSlashCommand({
			command: 'remind',
			detail: localize('reminder.slashDetail', "Remind me in one hour to review a pull request"),
			executeLocally: true,
			executeDuringRequest: true,
			silent: true,
			locations: [ChatAgentLocation.Chat],
			when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
		}, async (input, _progress, _history, _location, _resource, token, options, context) => {
			try {
				const created = await this.create(input, options?.attachedContext, token);
				if (created && context?.inputUri) {
					this.inputNotifications.setNotification({
						id: `reminder.receipt.${context.inputUri}`,
						inputUri: context.inputUri,
						severity: ChatInputNotificationSeverity.Info,
						icon: Codicon.bell,
						message: localize('reminder.receipt', "I'll remind you: {0}", created.prompt),
						description: reminderDescription(created),
						actions: [
							{ kind: ChatInputNotificationActionKind.Command, label: localize('reminder.edit', "Edit"), commandId: EDIT_REMINDER_COMMAND, commandArgs: [created.id] },
							{ kind: ChatInputNotificationActionKind.Command, label: localize('reminder.undo', "Undo"), commandId: UNDO_REMINDER_COMMAND, commandArgs: [created.id, created.updatedAt] },
							{ kind: ChatInputNotificationActionKind.Command, label: localize('reminder.view', "View"), commandId: OPEN_REMINDERS_COMMAND },
						],
						dismissible: true,
						autoDismissOnMessage: true,
					});
				}
				return { followUp: [], preserveInput: !created };
			} catch (error) {
				this.reportError(error);
				return { followUp: [], preserveInput: true };
			}
		}));
		const configurationChanged = observableSignalFromEvent(this, this.configuration.onDidChangeConfiguration);
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			const due = this.automations.automations.read(reader).filter(item => item.reminder?.status === 'due');
			if (!this.isEnabled() || !due.length) {
				this.notification.clear();
				this.osNotification.clear();
				return;
			}
			const newlyDue = due.filter(item => !this.delivered.has(`${item.id}:${item.schedule.at}`));
			if (!newlyDue.length) {
				return;
			}
			for (const item of newlyDue) {
				this.delivered.add(`${item.id}:${item.schedule.at}`);
			}
			if (this.notifications.getFilter() === NotificationsFilter.OFF) {
				void this.signals.playSignal(AccessibilitySignal.chatUserActionRequired, { modality: 'sound' });
			}
			const message = newlyDue.length === 1 ? localize('reminder.notification', "Reminder: {0}", newlyDue[0].prompt) : localize('reminder.notifications', "{0} reminders are due.", newlyDue.length);
			const handle = this.notifications.prompt(Severity.Info, message,
				newlyDue.length === 1 ? [
					{ label: localize('reminder.send', "Send to Session"), run: () => this.run(() => this.send(this.requireReminder(newlyDue[0].id))) },
					{ label: localize('reminder.postpone', "Postpone"), run: () => this.run(() => this.postpone(this.requireReminder(newlyDue[0].id))) },
					{ label: localize('reminder.dismiss', "Dismiss"), run: () => this.run(() => this.dismiss(this.requireReminder(newlyDue[0].id))) },
				] : [{ label: localize('reminder.viewAll', "View Reminders"), run: () => this.commands.executeCommand(OPEN_REMINDERS_COMMAND) }],
			);
			this.notification.value = toDisposable(() => handle.close());
			void this.notifyOS(message, newlyDue.map(item => `${item.id}:${item.schedule.at}`).join(','));
		}));
		this._register(sessionsManagement.onDidSendRequest(event => {
			if (!event.options.handoffId) {
				return;
			}
			const reminder = this.automations.automations.get().find(item => item.reminder?.handoffId === event.options.handoffId && item.reminder?.status === 'due');
			if (reminder) {
				void this.markSent(reminder, event.session.resource);
			}
		}));
	}

	private async notifyOS(message: string, dedupeKey: string): Promise<void> {
		if (mainWindow.document.hasFocus() || this.notifications.getFilter() !== NotificationsFilter.OFF
			|| this.configuration.getValue<ChatNotificationMode>(ChatConfiguration.NotifyWindowOnConfirmation) === ChatNotificationMode.Off) {
			return;
		}
		const cancellation = new CancellationTokenSource();
		const lifetime = toDisposable(() => cancellation.dispose(true));
		this.osNotification.value = lifetime;
		try {
			const result = await this.host.showToast({
				title: localize('reminder.osTitle', "Reminders"),
				body: message,
				dedupeKey: `reminders:${dedupeKey}`,
				actions: [localize('reminder.viewAll', "View Reminders")],
			}, cancellation.token);
			if (!cancellation.token.isCancellationRequested && this.isEnabled() && (result.clicked || result.actionIndex === 0)) {
				await this.host.focus(mainWindow);
				await this.commands.executeCommand(OPEN_REMINDERS_COMMAND);
			}
		} catch (error) {
			this.logService.warn('[Reminders] OS notification failed; the reminder remains available in Inbox', error);
		} finally {
			if (this.osNotification.value === lifetime) {
				this.osNotification.clear();
			}
		}
	}

	async execute(action: 'create' | 'open' | 'edit' | 'undo', id?: string, revision?: string): Promise<void> {
		await this.run(async () => {
			this.assertEnabled();
			if (action === 'create') {
				await this.create();
				return;
			}
			const item = this.requireReminder(id);
			if (action === 'undo') {
				if (item.updatedAt !== revision) {
					throw new Error(localize('reminder.undoConflict', "This reminder has changed. Open it to review the latest version."));
				}
				await this.automations.deleteAutomation(item.id, () => {
					this.assertEnabled();
					if (this.automations.getAutomation(item.id)?.updatedAt !== revision) {
						throw new Error(localize('reminder.undoConflict', "This reminder has changed. Open it to review the latest version."));
					}
				});
			} else if (action === 'edit') {
				await this.edit(item);
			} else {
				await this.show(item);
			}
		});
	}

	private isEnabled(): boolean {
		return !isWeb && this.configuration.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true && !this.configuration.getValue<boolean>(ChatAIDisabledSettingId);
	}

	private assertEnabled(): void {
		if (!this.isEnabled()) {
			throw new Error(localize('reminder.disabled', "Enable Automations to use reminders."));
		}
	}

	private requireReminder(id: string | undefined): IAutomationDescriptor {
		this.assertEnabled();
		const item = id ? this.automations.getAutomation(id) : undefined;
		if (!item?.reminder) {
			throw new Error(localize('reminder.missing', "This reminder is no longer available."));
		}
		return item;
	}

	private async create(input?: string, attachments: readonly IChatRequestVariableEntry[] = [], token = CancellationToken.None): Promise<IAutomationDescriptor | undefined> {
		this.assertEnabled();
		const provider = this.automations.availableProviders.get().find(provider => provider.supportsReminders);
		if (!provider) {
			throw new Error(localize('reminder.unavailable', "Connect to the local Agent Host with reminder support before creating a reminder."));
		}
		const parsed = input ? parseReminder(input, new Date()) : undefined;
		const reminder = parsed ?? await this.prompt(input?.trim());
		if (!reminder || token.isCancellationRequested) {
			return undefined;
		}
		const draft = serializeChatDraft({
			inputText: reminder.text,
			attachments: attachments.filter(attachment => !isImplicitVariableEntry(attachment)),
		}, resource => this.models.getModel(resource));
		const created = await this.automations.createAutomation({
			name: reminder.text,
			prompt: reminder.text,
			target: { kind: 'reminder', providerId: provider.id },
			schedule: { interval: 'once', at: reminder.at, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			reminder: { status: 'scheduled', draft },
		}, () => {
			this.assertEnabled();
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
		});
		if (!input) {
			this.notifications.info(localize('reminder.created', "Reminder saved: {0}. {1}", created.prompt, reminderDescription(created)));
		}
		return created;
	}

	private async prompt(text?: string): Promise<IParsedReminder | undefined> {
		const reminderText = await this.quickInput.input({
			title: localize('reminder.createTitle', "Remind Me"),
			prompt: localize('reminder.textPrompt', "What would you like to be reminded about? No agent runs when a reminder is due."),
			value: text,
			validateInput: async value => value.trim() ? undefined : localize('reminder.textRequired', "Enter reminder text."),
		});
		if (reminderText === undefined) {
			return undefined;
		}
		const at = await this.pickTime();
		return at ? { text: reminderText.trim(), at } : undefined;
	}

	private async pickTime(): Promise<string | undefined> {
		const value = await this.quickInput.input({
			title: localize('reminder.when', "When Should I Remind You?"),
			prompt: localize('reminder.timePrompt', "Use English, for example: in one hour, tomorrow at 9am, or 2027-01-15 at 14:30. Times are local. Recurring and ambiguous times are not supported."),
			value: 'in one hour',
			validateInput: async value => {
				const time = parseReminderTime(value, new Date());
				return time ? { content: localize('reminder.exactTime', "Reminder: {0}", time.toLocaleString()), severity: Severity.Info }
					: localize('reminder.invalidTime', "Choose a future, unambiguous date and time, for example tomorrow at 9am.");
			},
		});
		if (value === undefined) {
			return undefined;
		}
		const time = parseReminderTime(value, new Date());
		if (!time) {
			throw new Error(localize('reminder.timeExpired', "That time is no longer in the future. Choose another time."));
		}
		return time.toISOString();
	}

	private async show(item: IAutomationDescriptor): Promise<void> {
		const active = item.reminder?.status === 'due' || item.reminder?.status === 'scheduled';
		const choices: (IQuickPickItem & { run: () => Promise<void> })[] = [];
		if (item.reminder?.status === 'due') {
			choices.push({ label: localize('reminder.send', "Send to Session"), description: localize('reminder.sendDescription', "Open an editable draft; nothing is sent yet"), run: () => this.send(item) });
		}
		if (active) {
			choices.push(
				{ label: localize('reminder.postpone', "Postpone"), run: () => this.postpone(item) },
				{ label: localize('reminder.dismiss', "Dismiss"), run: () => this.dismiss(item) },
				{ label: localize('reminder.edit', "Edit"), run: () => this.edit(item) },
			);
		}
		const sent = item.reminder;
		if (sent?.status === 'sent') {
			choices.push({ label: localize('reminder.openSession', "Open Session"), run: () => this.sessions.openSession(sent.sessionResource) });
		}
		choices.push({ label: localize('reminder.viewAll', "View Reminders"), run: async () => { await this.commands.executeCommand(OPEN_REMINDERS_COMMAND); } });
		const choice = await this.quickInput.pick(choices, { title: item.prompt, placeHolder: reminderDescription(item) });
		if (choice) {
			await choice.run();
		}
	}

	private async update(item: IAutomationDescriptor, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		const result = await this.automations.updateAutomationIfUnchanged(item.id, patch, item, () => this.assertEnabled());
		if (result.kind === 'conflict') {
			throw new Error(localize('reminder.changed', "This reminder changed in another window. Open it again to review the latest version."));
		}
		return result.automation;
	}

	private async edit(item: IAutomationDescriptor): Promise<void> {
		const edited = await this.prompt(item.prompt);
		if (edited && item.reminder) {
			await this.update(item, {
				name: edited.text, prompt: edited.text,
				schedule: { ...item.schedule, at: edited.at },
				reminder: { status: 'scheduled', draft: item.reminder.draft },
			});
		}
	}

	private async postpone(item: IAutomationDescriptor): Promise<void> {
		const choice = await this.quickInput.pick([
			{ id: 'hour', label: localize('reminder.oneHour', "In One Hour") },
			{ id: 'tomorrow', label: localize('reminder.tomorrow', "Tomorrow at 9 AM") },
			{ id: 'custom', label: localize('reminder.chooseTime', "Choose Date and Time...") },
		], { title: localize('reminder.postponeTitle', "Postpone Reminder") });
		if (!choice || !item.reminder) {
			return;
		}
		const at = choice.id === 'custom' ? await this.pickTime() : parseReminderTime(choice.id === 'hour' ? 'in one hour' : 'tomorrow at 9am', new Date())?.toISOString();
		if (at) {
			await this.update(item, { schedule: { ...item.schedule, at }, reminder: { status: 'scheduled', draft: item.reminder.draft } });
		}
	}

	private async dismiss(item: IAutomationDescriptor): Promise<void> {
		await this.update(item, { reminder: { status: 'dismissed', draft: item.reminder?.draft } });
	}

	private async send(item: IAutomationDescriptor): Promise<void> {
		if (item.reminder?.status !== 'due') {
			throw new Error(localize('reminder.notDue', "This reminder is no longer due."));
		}
		const handoffId = item.reminder.handoffId ?? generateUuid();
		const updated = await this.update(item, { reminder: { ...item.reminder, handoffId } });
		const { session } = await this.sessions.openNewSession({ cancelRestore: true });
		const result = await this.sessionsPart.getSessionView(session)?.applyDraft({
			inputText: updated.prompt,
			attachments: updated.reminder?.draft?.attachments ?? '[]',
			handoffId,
		}, undefined, {}, CancellationToken.None);
		if (result === 'preserved') {
			this.notifications.info(localize('reminder.draftPreserved', "Your existing draft was kept. Finish or clear it, then use Send to Session again. The reminder is still due."));
			return;
		}
		if (result !== 'applied') {
			throw new Error(localize('reminder.draftNotReady', "The new-session composer is not ready yet. Try Send to Session again. The reminder is still due."));
		}
	}

	private async markSent(item: IAutomationDescriptor, sessionResource: URI): Promise<void> {
		try {
			await this.update(item, { reminder: { status: 'sent', sessionResource, draft: item.reminder?.draft } });
		} catch (error) {
			this.logService.error('[Reminders] Could not record successful handoff', error);
			this.notifications.prompt(Severity.Error, localize('reminder.saveHandoffFailed', "Your session started, but its reminder could not be updated: {0}. Do not send it again.", getErrorMessage(error)), [
				{ label: localize('reminder.openSession', "Open Session"), run: () => this.sessions.openSession(sessionResource) },
				{ label: localize('reminder.retrySave', "Retry Saving"), run: () => this.markSent(item, sessionResource) },
			]);
		}
	}

	private async run(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error) {
			this.reportError(error);
		}
	}

	private reportError(error: unknown): void {
		this.logService.error('[Reminders]', error);
		this.notifications.error(localize('reminder.failed', "Could not update the reminder: {0}", getErrorMessage(error)));
	}
}

export class AutomationRemindersContribution {
	static readonly ID = 'workbench.contrib.automationReminders';
	constructor(@IAutomationRemindersService _reminders: IAutomationRemindersService) { }
}
