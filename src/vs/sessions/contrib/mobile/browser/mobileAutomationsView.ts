/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { hasAutomationEventTrigger } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { observableShowSharedAutomationsByOthers, SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY } from '../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { AbstractCustomView, ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { AutomationsCustomViewFocusContext } from '../../../common/agentsWindowContextKeys.js';
import { AutomationCommands, refreshAutomations, registerAutomationCatalogueRefresh } from '../../automations/browser/automationCommands.js';
import { AutomationHistorySection, resolveAutomationRunSessions } from '../../automations/browser/automationRunHistory.js';
import { logAutomationViewShown } from '../../automations/browser/automationTelemetry.js';
import { describeAutomationSchedule, getAutomationsViewContent, getPhoneCatalogueMessage, getPhoneHistoryMessage, hasOtherSharedSchedules } from '../../sessions/browser/views/automationCataloguePresentation.js';
import { isLocalAutomationRunStarting } from '../../sessions/browser/views/automationRunProgress.js';
import { readAutomationTemplates } from '../../sessions/browser/views/automationTemplates.js';
import './media/mobileAutomations.css';

const $ = dom.$;

interface IAutomationPick extends IQuickPickItem {
	readonly run: () => Promise<void> | void;
}

export class MobileAutomationsView extends AbstractCustomView {
	readonly title = constObservable(localize('automationsTitle', "Automations"));
	private readonly token = cancelOnDispose(this._store);
	private readonly showDisabled;
	private root?: HTMLElement;
	private history?: AutomationHistorySection;

	constructor(
		@IAutomationService private readonly automations: IAutomationService,
		@ISessionsManagementService private readonly sessions: ISessionsManagementService,
		@IConfigurationService private readonly configuration: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly identity: IUriIdentityService,
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ICommandService private readonly commands: ICommandService,
		@IQuickInputService private readonly quickInput: IQuickInputService,
		@IAgentPluginService private readonly plugins: IAgentPluginService,
		@IContextKeyService private readonly contextKeys: IContextKeyService,
		@ILogService private readonly log: ILogService,
		@INotificationService private readonly notifications: INotificationService,
		@ITelemetryService private readonly telemetry: ITelemetryService,
		@IDialogService private readonly dialogs: IDialogService,
	) {
		super();
		this.showDisabled = observableValue(this, storageService.getBoolean(SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY, StorageScope.PROFILE, true));
	}

	render(container: HTMLElement): void {
		logAutomationViewShown(this.telemetry);
		const root = this.root = dom.append(container, $('.mobile-automations', { tabIndex: -1, role: 'region', 'aria-label': this.title.get() }));
		const focus = AutomationsCustomViewFocusContext.bindTo(this.contextKeys);
		const tracker = this._register(dom.trackFocus(root));
		this._register(tracker.onDidFocus(() => focus.set(true)));
		this._register(tracker.onDidBlur(() => focus.reset()));
		this._register(toDisposable(() => focus.reset()));

		const heading = dom.append(root, $('.mobile-automations-heading'));
		dom.append(heading, $('h2', undefined, localize('schedules', "Schedules")));
		const textButton = { ...unthemedButtonStyles, secondary: true };
		const options = this._register(new Button(heading, textButton));
		const filterLabel = localize('filter', "Filter");
		options.label = filterLabel;
		options.element.setAttribute('aria-haspopup', 'dialog');

		const rows = dom.append(root, $('.mobile-automations-list'));
		const rowElements = new Map<string, { button: HTMLButtonElement; name: HTMLElement; detail: HTMLElement }>();
		this._register(dom.addDisposableListener(rows, dom.EventType.CLICK, event => {
			const button = dom.isHTMLElement(event.target) && event.target.closest('button');
			const item = button && this.automations.getAutomation(button.value);
			if (item) {
				void this.manage(item).catch(error => this.notifications.error(error));
			}
		}));
		const notice = dom.append(root, $('.mobile-automations-notice'));
		const message = dom.append(notice, $('p', { role: 'status' }));
		const hint = dom.append(notice, $('p.mobile-automations-hint', undefined, localize('emptyHint', "Automations run scheduled prompts and save the results as chats.")));
		const retry = this._register(new Button(notice, textButton));
		retry.label = localize('retry', "Retry");
		this._register(retry.onDidClick(() => refreshAutomations(this.automations, this.log, this.notifications)));

		const create = this._register(new Button(root, { ...textButton, supportIcons: true }));
		create.element.classList.add('mobile-automations-create');
		create.element.setAttribute('aria-haspopup', 'dialog');
		create.label = `$(add) ${localize('newAutomation', "New Automation")}`;
		this._register(create.onDidClick(() => this.showCreation().catch(error => this.notifications.error(error))));

		const recent = dom.append(root, $('section.mobile-automations-recent'));
		dom.append(recent, $('h2', undefined, localize('recentRuns', "Recent runs")));
		const historyMessage = dom.append(recent, $('p.mobile-automations-history-message', { role: 'status' }));
		const history = this.history = this._register(this.instantiation.createInstance(AutomationHistorySection, recent, root, observableValue(this, false), { showHeader: false }));
		const showOthers = observableShowSharedAutomationsByOthers(this, this.storageService, this._store);
		const configChanged = observableSignalFromEvent(this, this.configuration.onDidChangeConfiguration);
		const content = derived(this, reader => {
			configChanged.read(reader);
			return getAutomationsViewContent(this.automations.automations.read(reader), this.automations.runs.read(reader), showOthers.read(reader), this.configuration.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true);
		});
		const filterChoices = derived(reader => {
			const choices: IAutomationPick[] = [];
			if (content.read(reader).automations.some(item => !item.enabled)) {
				const show = !this.showDisabled.read(reader);
				choices.push({
					label: show ? localize('showDisabled', "Show Disabled Automations") : localize('hideDisabled', "Hide Disabled Automations"),
					run: () => {
						this.showDisabled.set(show, undefined);
						this.storageService.store(SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY, show, StorageScope.PROFILE, StorageTarget.MACHINE);
					},
				});
			}
			const sendLater = this.configuration.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true;
			if (this.configuration.getValue<boolean>(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING) && hasOtherSharedSchedules(this.automations.automations.read(reader), sendLater)) {
				choices.push({ label: showOthers.read(reader) ? localize('hideShared', "Hide Automations Created by Others") : AutomationCommands.showSharedByOthers.title.value, run: () => this.commands.executeCommand(AutomationCommands.showSharedByOthers.id) });
			}
			return choices;
		});
		this._register(options.onDidClick(() => this.pick(filterLabel, filterChoices.get()).catch(error => this.notifications.error(error))));
		this._register(autorun(reader => {
			const { automations } = content.read(reader);
			const showDisabled = this.showDisabled.read(reader);
			const visible = automations.filter(item => showDisabled || item.enabled);
			const canFilter = filterChoices.read(reader).length > 0;
			const canCreate = this.automations.availableProviders.read(reader).length > 0;
			if ((!canFilter && dom.isActiveElement(options.element)) || (!canCreate && dom.isActiveElement(create.element))) {
				root.focus();
			}
			options.element.hidden = !canFilter;
			heading.hidden = !visible.length && !canFilter;
			create.element.hidden = !canCreate;
			const ids = new Set(visible.map(item => item.id));
			for (const [id, row] of rowElements) {
				if (!ids.has(id)) {
					if (dom.isActiveElement(row.button)) {
						root.focus();
					}
					row.button.remove();
					rowElements.delete(id);
				}
			}
			for (const [index, item] of visible.entries()) {
				let row = rowElements.get(item.id);
				if (!row) {
					const button = $<HTMLButtonElement>('button.mobile-automation-row', { type: 'button', value: item.id, 'aria-haspopup': 'dialog' });
					const copy = dom.append(button, $('.mobile-automation-row-copy'));
					row = { button, name: dom.append(copy, $('span.mobile-automation-name')), detail: dom.append(copy, $('span.mobile-automation-detail')) };
					dom.append(button, renderIcon(Codicon.chevronRight)).setAttribute('aria-hidden', 'true');
					rowElements.set(item.id, row);
				}
				row.name.textContent = item.name;
				const schedule = describeAutomationSchedule(item);
				const ownership = item.ownership === 'repository' ? localize('sharedSchedule', "Shared · {0}", schedule) : schedule;
				row.detail.textContent = item.enabled ? ownership : localize('disabledSchedule', "Disabled · {0}", ownership);
				if (rows.children[index] !== row.button) {
					rows.insertBefore(row.button, rows.children.item(index));
				}
			}
			const state = this.automations.catalogueState.read(reader);
			const runState = this.automations.historyState?.read(reader);
			const catalogueMessage = getPhoneCatalogueMessage(state, this.automations.unavailableProviders.read(reader), visible.length > 0, canFilter);
			const canRetry = state === 'error' || runState === 'error';
			if (!canRetry && dom.isActiveElement(retry.element)) {
				(rowElements.values().next().value?.button ?? root).focus();
			}
			retry.element.hidden = !canRetry;
			const statusText = runState === 'error' && state !== 'error'
				? [catalogueMessage, localize('historyError', "Couldn't refresh recent runs.")].filter(Boolean).join(' ') : catalogueMessage;
			if (message.textContent !== statusText) {
				message.textContent = statusText;
			}
			notice.hidden = !statusText;
			hint.hidden = canFilter || automations.length > 0 || content.read(reader).runs.length > 0 || canRetry || (state !== 'unavailable' && state !== 'ready');
			retry.enabled = !this.automations.isRefreshing?.read(reader);
		}));
		const sessionsChanged = observableSignalFromEvent(this, Event.any(this.sessions.onDidChangeSessions, this.sessions.onDidDeleteSession));
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this.automations.availableProviders.read(reader);
			const runs = content.read(reader).runs;
			const sessions = resolveAutomationRunSessions(runs, this.sessions.getSessions(), this.identity);
			history.render(runs, sessions, reader);
			const state = this.automations.historyState?.read(reader) ?? this.automations.catalogueState.read(reader);
			const hasHistory = runs.some(run => sessions.has(run.id) || run.externalResource || this.automations.getAutomationHistoryState?.(run.automationId) !== undefined);
			const starting = runs.some(run => isLocalAutomationRunStarting(run, () => sessions.has(run.id), resource => !!this.sessions.getSession(resource)));
			const showHistoryStatus = content.read(reader).automations.length > 0 && state === 'unavailable' && this.automations.catalogueState.read(reader) !== 'unavailable';
			historyMessage.textContent = getPhoneHistoryMessage(starting, showHistoryStatus, !hasHistory && runs.length > 0);
			historyMessage.hidden = !historyMessage.textContent;
			recent.hidden = !hasHistory && !historyMessage.textContent;
		}));
		registerAutomationCatalogueRefresh(this._store, this.automations, this.log);
	}

	private async pick(title: string, choices: IAutomationPick[]): Promise<void> {
		const result = await this.quickInput.pick(choices, { title }, this.token);
		if (result && !this.token.isCancellationRequested) {
			await result.run();
		}
	}

	private async manage(item: IAutomationDescriptor): Promise<void> {
		const canEdit = this.automations.canUpdateAutomation(item.id);
		const scheduledChat = item.purpose === 'scheduledChat' && item.schedule.interval === 'once';
		const choices: IAutomationPick[] = [];
		const add = (command: typeof AutomationCommands[keyof typeof AutomationCommands], label = command.title.value) => choices.push({
			label, run: () => this.commands.executeCommand(command.id, item),
		});
		if (!hasAutomationEventTrigger(item.cloudTrigger?.triggers ?? {}) && this.automations.canRunAutomation(item.id)) {
			add(AutomationCommands.run);
		}
		if (canEdit && (!scheduledChat || item.enabled)) {
			if (scheduledChat) {
				add(AutomationCommands.disable, localize('cancelScheduledChat', "Cancel Scheduled Chat…"));
			} else {
				add(item.enabled ? AutomationCommands.disable : AutomationCommands.enable);
			}
		}
		if (item.externalResource) {
			add(AutomationCommands.openOnGitHub);
		}
		if (this.automations.canDeleteAutomation(item.id)) {
			add(AutomationCommands.delete);
		}
		if (canEdit && item.schedule.interval !== 'once') {
			choices.unshift({ label: AutomationCommands.edit.title.value, run: () => this.commands.executeCommand(AutomationCommands.edit.id, item) });
		} else {
			const details = () => this.dialogs.info(item.name, [item.readOnlyReason, describeAutomationSchedule(item), item.prompt, ...(item.request?.attachments?.map(attachment => attachment.label) ?? [])].filter(Boolean).join('\n\n'));
			if (!choices.length) {
				await details();
				return;
			}
			choices.unshift({ label: localize('viewDetails', "View Details"), run: details });
		}
		await this.pick(item.name, choices);
	}

	private async showCreation(): Promise<void> {
		const choices: IAutomationPick[] = [
			{ label: AutomationCommands.createManually.title.value, run: () => this.commands.executeCommand(AutomationCommands.createManually.id) },
		];
		if (this.contextKeys.contextMatchesRules(ChatContextKeys.enabled)) {
			choices.push({ label: AutomationCommands.createWithAgent.title.value, run: () => this.commands.executeCommand(AutomationCommands.createWithAgent.id, { skipIntroduction: true }) });
		}
		choices.push({ label: localize('fromTemplate', "Choose a Template"), run: () => this.showTemplates() });
		await this.pick(localize('newAutomation', "New Automation"), choices);
	}

	private showTemplates(): Promise<void> {
		const templates = readAutomationTemplates(this.plugins.plugins.get()).map(({ name, description, prompt, schedule, enabled, disableConditions }): IAutomationPick => ({
			label: name,
			description,
			run: () => this.commands.executeCommand(AutomationCommands.createManually.id, { initialValues: { name, prompt, schedule, enabled, disableConditions } }),
		}));
		return this.pick(localize('templates', "Templates"), templates);
	}

	layout(): void { this.history?.layout(); }
	override focus(): void {
		this.root?.focus();
	}
}

export class MobileAutomationsContribution extends Disposable {
	constructor(
		@ICustomViewService views: ICustomViewService,
		@IContextKeyService context: IContextKeyService,
	) {
		super();
		const enabled = () => context.contextMatchesRules(ChatAutomationsEnabledContext);
		this._register(views.registerCustomView({ id: AUTOMATIONS_CUSTOM_VIEW_ID, ctor: new SyncDescriptor(MobileAutomationsView) }, { restore: enabled() }));
		this._register(context.onDidChangeContext(event => {
			if (event.affectsSome(new Set([ChatAutomationsEnabledContext.key])) && !enabled() && views.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
				views.hideCustomView();
			}
		}));
	}
}
