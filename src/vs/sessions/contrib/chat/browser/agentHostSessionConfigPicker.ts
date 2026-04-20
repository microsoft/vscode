/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostSessionConfigPicker.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Delayer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentHostSessionConfigBranchNameHintKey } from '../../../../platform/agentHost/common/agentService.js';
import type { ISessionConfigPropertySchema, ISessionConfigValueItem } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatContextKeyExprs } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { ActiveSessionProviderIdContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';

const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, /^agenthost-/);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, 'local-agent-host');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.sessionConfigPicker',
			title: localize2('agentHostSessionConfigPicker', "Session Configuration"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});

interface IConfigPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
}

function getConfigIcon(property: string, value: string | undefined): ThemeIcon | undefined {
	if (property === 'isolation') {
		if (value === 'folder') {
			return Codicon.folder;
		}
		if (value === 'worktree') {
			return Codicon.worktree;
		}
	}
	if (property === 'branch') {
		return Codicon.gitBranch;
	}
	if (property === 'autoApprove') {
		if (value === 'autopilot') {
			return Codicon.rocket;
		}
		if (value === 'autoApprove') {
			return Codicon.warning;
		}
		return Codicon.shield;
	}
	return undefined;
}

function toActionItems(property: string, items: readonly IConfigPickerItem[], currentValue: string | undefined, policyRestricted?: boolean): IActionListItem<IConfigPickerItem>[] {
	return items.map(item => ({
		kind: ActionListItemKind.Action,
		label: item.label,
		description: item.description,
		group: { title: '', icon: getConfigIcon(property, item.value) },
		disabled: policyRestricted && (item.value === 'autoApprove' || item.value === 'autopilot'),
		item: { ...item, label: item.value === currentValue ? `${item.label} ${localize('selected', "(Selected)")}` : item.label },
	}));
}

function renderPickerTrigger(slot: HTMLElement, disabled: boolean, disposables: DisposableStore, onOpen: () => void): HTMLElement {
	const trigger = dom.append(slot, disabled ? dom.$('span.action-label') : dom.$('a.action-label'));
	if (disabled) {
		trigger.setAttribute('aria-readonly', 'true');
	} else {
		trigger.role = 'button';
		trigger.tabIndex = 0;
		trigger.setAttribute('aria-haspopup', 'listbox');
		disposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			onOpen();
		}));
		disposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				onOpen();
			}
		}));
	}
	slot.classList.toggle('disabled', disabled);

	return trigger;
}

/**
 * Special-cased property name for auto-approve session config.
 * Used to apply confirmation dialogs and policy enforcement.
 */
const AUTO_APPROVE_PROPERTY = 'autoApprove';

// Track whether auto-approve warnings have been shown this VS Code session
const shownAutoApproveWarnings = new Set<string /* enum value */>();

function hasShownAutoApproveWarning(value: string): boolean {
	if (shownAutoApproveWarnings.has(value)) {
		return true;
	}
	// Confirming Autopilot implies the user accepted the Bypass risks too
	if (value === 'autoApprove' && shownAutoApproveWarnings.has('autopilot')) {
		return true;
	}
	return false;
}

/**
 * Filters out autopilot if disabled, and marks bypass/autopilot as disabled
 * if enterprise policy restricts auto-approval. Returns the filtered items
 * and policy state.
 */
function applyAutoApproveFiltering(
	items: readonly IConfigPickerItem[],
	property: string,
	configurationService: IConfigurationService,
): { readonly items: readonly IConfigPickerItem[]; readonly policyRestricted: boolean } {
	if (property !== AUTO_APPROVE_PROPERTY) {
		return { items, policyRestricted: false };
	}
	const isAutopilotEnabled = configurationService.getValue<boolean>(ChatConfiguration.AutopilotEnabled) !== false;
	const policyRestricted = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
	const filtered = isAutopilotEnabled ? items : items.filter(item => item.value !== 'autopilot');
	return { items: filtered, policyRestricted };
}

/**
 * Shows a confirmation dialog for elevated auto-approve levels.
 * Returns true if confirmed or if the warning was already shown this session.
 */
async function confirmAutoApproveLevel(value: string, dialogService: IDialogService): Promise<boolean> {
	if (hasShownAutoApproveWarning(value)) {
		return true;
	}

	const isAutopilot = value === 'autopilot';
	const result = await dialogService.prompt({
		type: Severity.Warning,
		message: isAutopilot
			? localize('agentHostAutoApprove.autopilot.warning.title', "Enable Autopilot?")
			: localize('agentHostAutoApprove.bypass.warning.title', "Enable Bypass Approvals?"),
		buttons: [
			{
				label: localize('agentHostAutoApprove.warning.confirm', "Enable"),
				run: () => true,
			},
			{
				label: localize('agentHostAutoApprove.warning.cancel', "Cancel"),
				run: () => false,
			},
		],
		custom: {
			icon: isAutopilot ? Codicon.rocket : Codicon.warning,
			markdownDetails: [{
				markdown: new MarkdownString(isAutopilot
					? localize('agentHostAutoApprove.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")
					: localize('agentHostAutoApprove.bypass.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls.")),
			}],
		},
	});

	if (result.result !== true) {
		return false;
	}

	shownAutoApproveWarnings.add(value);
	return true;
}

/**
 * Applies warning/info CSS classes to a trigger element for auto-approve levels.
 */
function applyAutoApproveTriggerStyles(trigger: HTMLElement, property: string | undefined, value: string | undefined): void {
	if (property === AUTO_APPROVE_PROPERTY) {
		trigger.classList.toggle('warning', value === 'autopilot');
		trigger.classList.toggle('info', value === 'autoApprove');
	}
}

class AgentHostSessionConfigPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private readonly _filterDelayer = this._register(new Delayer<readonly IActionListItem<IConfigPickerItem>[]>(200));
	private _container: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (session) {
				session.loading.read(reader);
			}
			this._renderConfigPickers();
		}));

		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerListeners.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._renderConfigPickers();
		}));
		this._watchProviders(this._sessionsProvidersService.getProviders());
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
				continue;
			}
			this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._renderConfigPickers()));
		}
	}

	render(container: HTMLElement): void {
		this._container = dom.append(container, dom.$('.sessions-chat-agent-host-config'));
		this._renderConfigPickers();
	}

	private _renderConfigPickers(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		const session = this._sessionsManagementService.activeSession.get();
		const provider = session ? this._getProvider(session.providerId) : undefined;
		const resolvedConfig = session && provider?.getSessionConfig(session.sessionId);
		if (!session || !provider || !resolvedConfig) {
			return;
		}

		for (const [property, schema] of Object.entries(resolvedConfig.schema.properties)) {
			if (property === AgentHostSessionConfigBranchNameHintKey || property === AUTO_APPROVE_PROPERTY) {
				continue;
			}
			const value = resolvedConfig.values[property] ?? schema.default;
			const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot'));
			const trigger = renderPickerTrigger(slot, !!schema.readOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
			this._renderTrigger(trigger, property, schema, value);
		}
	}

	private _renderTrigger(trigger: HTMLElement, property: string, schema: ISessionConfigPropertySchema, value: string | undefined): void {
		dom.clearNode(trigger);
		const icon = getConfigIcon(property, value);
		if (icon) {
			dom.append(trigger, renderIcon(icon));
		}
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		const label = this._getLabel(schema, value);
		labelSpan.textContent = label;
		trigger.setAttribute('aria-label', schema.readOnly
			? localize('agentHostSessionConfig.triggerAriaReadOnly', "{0}: {1}, Read-Only", schema.title, label)
			: localize('agentHostSessionConfig.triggerAria', "{0}: {1}", schema.title, label));
		if (!schema.readOnly) {
			dom.append(trigger, renderIcon(Codicon.chevronDown));
		}
		applyAutoApproveTriggerStyles(trigger, property, value);
	}

	private async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: ISessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (schema.readOnly || this._actionWidgetService.isVisible) {
			return;
		}
		const rawItems = await this._getItems(provider, sessionId, property, schema);
		const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
		if (items.length === 0) {
			return;
		}

		const isAutoApproveProperty = property === AUTO_APPROVE_PROPERTY;
		const currentValue = provider.getSessionConfig(sessionId)?.values[property];
		const actionItems = toActionItems(property, items, currentValue, policyRestricted);

		const delegate: IActionListDelegate<IConfigPickerItem> = {
			onSelect: async item => {
				this._actionWidgetService.hide();

				if (isAutoApproveProperty && (item.value === 'autoApprove' || item.value === 'autopilot')) {
					const confirmed = await confirmAutoApproveLevel(item.value, this._dialogService);
					if (!confirmed) {
						return;
					}
				}

				provider.setSessionConfigValue(sessionId, property, item.value).catch(() => { /* best-effort */ });
			},
			onFilter: schema.enumDynamic
				? query => this._filterDelayer.trigger(async () => toActionItems(property, await this._getItems(provider, sessionId, property, schema, query), provider.getSessionConfig(sessionId)?.values[property]))
				: undefined,
			onHide: () => trigger.focus(),
		};

		this._actionWidgetService.show<IConfigPickerItem>(
			`agentHostSessionConfig.${property}`,
			false,
			actionItems,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostSessionConfig.ariaLabel', "{0} Picker", schema.title),
			},
			actionItems.length > 10 ? { showFilter: true, filterPlaceholder: localize('agentHostSessionConfig.filter', "Filter options...") } : undefined,
		);
	}

	private async _getItems(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: ISessionConfigPropertySchema, query?: string): Promise<readonly IConfigPickerItem[]> {
		const dynamicItems = schema.enumDynamic
			? await provider.getSessionConfigCompletions(sessionId, property, query)
			: undefined;
		if (dynamicItems?.length) {
			return dynamicItems.map(item => this._fromCompletionItem(item));
		}

		return (schema.enum ?? []).map((value, index) => ({
			value,
			label: schema.enumLabels?.[index] ?? value,
			description: schema.enumDescriptions?.[index],
		}));
	}

	private _fromCompletionItem(item: ISessionConfigValueItem): IConfigPickerItem {
		return {
			value: item.value,
			label: item.label,
			description: item.description,
		};
	}

	private _getLabel(schema: ISessionConfigPropertySchema, value: string | undefined): string {
		if (typeof value === 'string') {
			const index = schema.enum?.indexOf(value) ?? -1;
			return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
		}
		return schema.title;
	}

	private _getProvider(providerId: string): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && isAgentHostProvider(provider) ? provider : undefined;
	}
}

interface IConfigPickerWidget extends IDisposable {
	render(container: HTMLElement): void;
}

class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly _picker: IConfigPickerWidget) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this._picker.render(container);
	}

	override dispose(): void {
		this._picker.dispose();
		super.dispose();
	}
}

class AgentHostSessionConfigPickerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.agentHostSessionConfigPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig,
			'sessions.agentHost.sessionConfigPicker',
			() => new PickerActionViewItem(instantiationService.createInstance(AgentHostSessionConfigPicker)),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_APPROVE_PICKER_ID,
			() => new PickerActionViewItem(instantiationService.createInstance(AgentHostNewSessionApprovePicker)),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_CONFIG_PICKER_ID,
			() => new PickerActionViewItem(instantiationService.createInstance(AgentHostRunningSessionConfigPicker)),
		));
	}
}

// ---- New session auto-approve picker (left side, NewSessionControl) ----

const NEW_SESSION_APPROVE_PICKER_ID = 'sessions.agentHost.newSessionApprovePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_APPROVE_PICKER_ID,
			title: localize2('agentHostNewSessionApprovePicker', "Session Approvals"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});

/**
 * Renders the auto-approve picker in the new session welcome view (left side).
 * Only renders the autoApprove property from the session config.
 */
class AgentHostNewSessionApprovePicker extends Disposable {
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _container: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (session) {
				session.loading.read(reader);
			}
			this._render();
		}));

		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerListeners.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._render();
		}));
		this._watchProviders(this._sessionsProvidersService.getProviders());
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
				continue;
			}
			this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._render()));
		}
	}

	render(container: HTMLElement): void {
		this._container = dom.append(container, dom.$('.sessions-chat-agent-host-config'));
		this._render();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		const session = this._sessionsManagementService.activeSession.get();
		const rawProvider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		const provider = rawProvider && isAgentHostProvider(rawProvider) ? rawProvider : undefined;
		const config = session && provider?.getSessionConfig(session.sessionId);
		// `getSessionConfig` may return undefined for sessions whose config
		// hasn't been seeded yet (e.g. opened from list, no in-window create).
		// The provider lazily acquires a session-state subscription and will fire
		// `onDidChangeSessionConfig` once the snapshot arrives, re-rendering us.
		if (!session || !provider || !config) {
			return;
		}

		const schema = config.schema.properties[AUTO_APPROVE_PROPERTY];
		if (!schema) {
			return;
		}

		const value = config.values[AUTO_APPROVE_PROPERTY] ?? schema.default;
		const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot'));
		const trigger = renderPickerTrigger(slot, false, this._renderDisposables, () => this._showPicker(provider, session.sessionId, schema, trigger));
		this._renderTrigger(trigger, schema, value);
	}

	private _renderTrigger(trigger: HTMLElement, schema: ISessionConfigPropertySchema, value: string | undefined): void {
		dom.clearNode(trigger);
		const icon = getConfigIcon(AUTO_APPROVE_PROPERTY, value);
		if (icon) {
			dom.append(trigger, renderIcon(icon));
		}
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		const label = this._getLabel(schema, value);
		labelSpan.textContent = label;
		trigger.setAttribute('aria-label', localize('agentHostNewSessionApprove.triggerAria', "{0}: {1}", schema.title, label));
		dom.append(trigger, renderIcon(Codicon.chevronDown));
		applyAutoApproveTriggerStyles(trigger, AUTO_APPROVE_PROPERTY, value);
	}

	private async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, schema: ISessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (this._actionWidgetService.isVisible) {
			return;
		}

		const rawItems = (schema.enum ?? []).map((value, index) => ({
			value,
			label: schema.enumLabels?.[index] ?? value,
			description: schema.enumDescriptions?.[index],
		}));

		const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, AUTO_APPROVE_PROPERTY, this._configurationService);

		if (items.length === 0) {
			return;
		}

		const currentValue = provider.getSessionConfig(sessionId)?.values[AUTO_APPROVE_PROPERTY];
		const actionItems = toActionItems(AUTO_APPROVE_PROPERTY, items, currentValue, policyRestricted);

		const delegate: IActionListDelegate<IConfigPickerItem> = {
			onSelect: async item => {
				this._actionWidgetService.hide();

				if (item.value === 'autoApprove' || item.value === 'autopilot') {
					const confirmed = await confirmAutoApproveLevel(item.value, this._dialogService);
					if (!confirmed) {
						return;
					}
				}

				provider.setSessionConfigValue(sessionId, AUTO_APPROVE_PROPERTY, item.value).catch(() => { /* best-effort */ });
			},
			onHide: () => trigger.focus(),
		};

		this._actionWidgetService.show<IConfigPickerItem>(
			`agentHostNewSessionConfig.${AUTO_APPROVE_PROPERTY}`,
			false,
			actionItems,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostNewSessionApprove.ariaLabel', "{0} Picker", schema.title),
			},
		);
	}

	private _getLabel(schema: ISessionConfigPropertySchema, value: string | undefined): string {
		if (typeof value === 'string') {
			const index = schema.enum?.indexOf(value) ?? -1;
			return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
		}
		return schema.title;
	}
}

// ---- Running session config picker (ChatInputSecondary) ----

const RUNNING_SESSION_CONFIG_PICKER_ID = 'sessions.agentHost.runningSessionConfigPicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_CONFIG_PICKER_ID,
			title: localize2('agentHostRunningSessionConfigPicker', "Session Approvals"),
			f1: false,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 10,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}

	override async run(): Promise<void> { }
});

/**
 * Renders a single picker trigger in the titlebar for the auto-approve session
 * config property during a running agent host session.
 */
class AgentHostRunningSessionConfigPicker extends Disposable {
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _container: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (session) {
				session.loading.read(reader);
			}
			this._render();
		}));

		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerListeners.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._render();
		}));
		this._watchProviders(this._sessionsProvidersService.getProviders());
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
				continue;
			}
			this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._render()));
		}
	}

	render(container: HTMLElement): void {
		this._container = dom.append(container, dom.$('.sessions-chat-agent-host-config'));
		this._render();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		const session = this._sessionsManagementService.activeSession.get();
		const rawProvider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
		const provider = rawProvider && isAgentHostProvider(rawProvider) ? rawProvider : undefined;
		const config = session && provider?.getSessionConfig(session.sessionId);
		// See note in `AgentHostNewSessionApprovePicker._render`: `config` may be
		// undefined until the lazy session-state subscription hydrates and the
		// provider fires `onDidChangeSessionConfig`.
		if (!session || !provider || !config) {
			return;
		}

		// Only render session-mutable properties (i.e., autoApprove)
		for (const [property, schema] of Object.entries(config.schema.properties)) {
			if (!schema.sessionMutable) {
				continue;
			}
			const value = config.values[property] ?? schema.default;
			const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot'));
			const trigger = renderPickerTrigger(slot, false, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
			this._renderTrigger(trigger, schema, value, property);
		}
	}

	private _renderTrigger(trigger: HTMLElement, schema: ISessionConfigPropertySchema, value: string | undefined, property: string): void {
		dom.clearNode(trigger);
		const icon = getConfigIcon(property, value);
		if (icon) {
			dom.append(trigger, renderIcon(icon));
		}
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		const label = this._getLabel(schema, value);
		labelSpan.textContent = label;
		trigger.setAttribute('aria-label', localize('agentHostRunningSessionConfig.triggerAria', "{0}: {1}", schema.title, label));
		dom.append(trigger, renderIcon(Codicon.chevronDown));
		applyAutoApproveTriggerStyles(trigger, property, value);
	}

	private async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: ISessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (this._actionWidgetService.isVisible) {
			return;
		}

		const rawItems = (schema.enum ?? []).map((value, index) => ({
			value,
			label: schema.enumLabels?.[index] ?? value,
			description: schema.enumDescriptions?.[index],
		}));

		const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
		const isAutoApproveProperty = property === AUTO_APPROVE_PROPERTY;

		if (items.length === 0) {
			return;
		}

		const currentValue = provider.getSessionConfig(sessionId)?.values[property];
		const actionItems = toActionItems(property, items, currentValue, policyRestricted);

		const delegate: IActionListDelegate<IConfigPickerItem> = {
			onSelect: async item => {
				this._actionWidgetService.hide();

				if (isAutoApproveProperty && (item.value === 'autoApprove' || item.value === 'autopilot')) {
					const confirmed = await confirmAutoApproveLevel(item.value, this._dialogService);
					if (!confirmed) {
						return;
					}
				}

				provider.setSessionConfigValue(sessionId, property, item.value).catch(() => { /* best-effort */ });
			},
			onHide: () => trigger.focus(),
		};

		this._actionWidgetService.show<IConfigPickerItem>(
			`agentHostRunningSessionConfig.${property}`,
			false,
			actionItems,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostRunningSessionConfig.ariaLabel', "{0} Picker", schema.title),
			},
		);
	}

	private _getLabel(schema: ISessionConfigPropertySchema, value: string | undefined): string {
		if (typeof value === 'string') {
			const index = schema.enum?.indexOf(value) ?? -1;
			return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
		}
		return schema.title;
	}
}

registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
