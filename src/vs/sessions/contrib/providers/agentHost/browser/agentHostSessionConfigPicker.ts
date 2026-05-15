/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostSessionConfigPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import Severity from '../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import type { SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { isWellKnownAutoApproveSchema, isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';

export interface IConfigPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
}

export function getConfigIcon(property: string, value: unknown | undefined): ThemeIcon | undefined {
	if (property === SessionConfigKey.Isolation) {
		if (value === 'folder') {
			return Codicon.folder;
		}
		if (value === 'worktree') {
			return Codicon.worktree;
		}
	}
	if (property === SessionConfigKey.Branch) {
		return Codicon.gitBranch;
	}
	if (property === SessionConfigKey.AutoApprove) {
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

function toActionItems(property: string, items: readonly IConfigPickerItem[], currentValue: unknown | undefined, policyRestricted?: boolean): IActionListItem<IConfigPickerItem>[] {
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
		disposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				onOpen();
			}));
		}
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
	if (property !== SessionConfigKey.AutoApprove) {
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
				markdown: new MarkdownString(
					localize(
						'agentHostAutoApprove.warning.detailWithDefaultSetting',
						"{0}\n\nTo make this the starting permission level for new chat sessions, change the [{1}](command:workbench.action.openSettings?%5B%22{1}%22%5D) setting.",
						isAutopilot
							? localize('agentHostAutoApprove.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")
							: localize('agentHostAutoApprove.bypass.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls."),
						ChatConfiguration.DefaultPermissionLevel,
					),
					{ isTrusted: { enabledCommands: ['workbench.action.openSettings'] } },
				),
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
function applyAutoApproveTriggerStyles(trigger: HTMLElement, property: string | undefined, value: unknown | undefined): void {
	if (property === SessionConfigKey.AutoApprove) {
		trigger.classList.toggle('warning', value === 'autopilot');
		trigger.classList.toggle('info', value === 'autoApprove');
	}
}

export class AgentHostSessionConfigPicker extends Disposable {

	protected readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	protected readonly _filterDelayer = this._register(new Delayer<readonly IActionListItem<IConfigPickerItem>[]>(200));
	private _container: HTMLElement | undefined;

	constructor(
		@IActionWidgetService protected readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@IDialogService protected readonly _dialogService: IDialogService,
		@ISessionsManagementService protected readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService protected readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IWorkbenchLayoutService protected readonly _layoutService: IWorkbenchLayoutService,
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

		// In the running-session flow only `sessionMutable` properties can
		// actually be changed (non-mutable ones would no-op in
		// `setSessionConfigValue`). In the new-session flow any property is
		// changeable because changes trigger a full config re-resolve — so
		// non-mutable properties like `isolation` must remain visible and
		// interactive there.
		const isNewSession = provider.getCreateSessionConfig(session.sessionId) !== undefined;

		const properties = this._orderProperties(Object.entries(resolvedConfig.schema.properties));

		for (const [property, schema] of properties) {
			// Only render pickers for properties we know how to present. Today
			// that's string properties with either a static `enum` or a
			// dynamic enum sourced via `getSessionConfigCompletions`.
			// Anything else (objects, arrays, free-form strings, numbers,
			// booleans) has no enumerable choice set and is edited through
			// the JSONC settings editor instead.
			const hasStaticEnum = !!schema.enum && schema.enum.length > 0;
			const hasDynamicEnum = !!schema.enumDynamic;
			if (schema.type !== 'string' || (!hasStaticEnum && !hasDynamicEnum)) {
				continue;
			}
			if (!this._shouldRenderProperty(property, schema, isNewSession)) {
				continue;
			}
			// When the autoApprove property uses the well-known schema, the
			// workbench `PermissionPickerActionItem` (registered separately for
			// `Menus.NewSessionControl`) handles it — skip it here to avoid
			// double-rendering. Non-conforming schemas still fall through to
			// the generic per-property picker below.
			if (property === SessionConfigKey.AutoApprove && isWellKnownAutoApproveSchema(schema)) {
				continue;
			}
			// When the mode property uses the well-known schema, the dedicated
			// {@link AgentHostModePicker} (registered separately for
			// `Menus.NewSessionConfig`) handles it. Non-conforming schemas
			// still fall through to the generic per-property picker below.
			if (property === SessionConfigKey.Mode && isWellKnownModeSchema(schema)) {
				continue;
			}
			const value = resolvedConfig.values[property] ?? schema.default;
			const isReadOnly = this._isReadOnlyChip(property, schema, isNewSession);
			const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot'));
			const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
			this._renderTrigger(trigger, property, schema, value, isReadOnly);
		}
	}

	/**
	 * Order the schema properties for rendering. The base implementation
	 * enforces a stable visual sequence for well-known properties:
	 * Isolation (worktree/folder) first, then Branch. Any other properties
	 * keep their original schema order after these two. Subclasses can
	 * override to impose a different deterministic visual sequence
	 * (e.g. the mobile chip row groups Approvals | Branch | Worktree).
	 */
	protected _orderProperties(properties: ReadonlyArray<[string, SessionConfigPropertySchema]>): ReadonlyArray<[string, SessionConfigPropertySchema]> {
		const order = new Map<string, number>([
			[SessionConfigKey.Isolation, 0],
			[SessionConfigKey.Branch, 1],
		]);
		return properties
			.map(([key, schema], index) => ({ key, schema, index }))
			.sort((a, b) => {
				const aRank = order.get(a.key) ?? Number.MAX_SAFE_INTEGER;
				const bRank = order.get(b.key) ?? Number.MAX_SAFE_INTEGER;
				return aRank - bRank || a.index - b.index;
			})
			.map(({ key, schema }) => [key, schema] as [string, SessionConfigPropertySchema]);
	}

	/**
	 * Decide whether a property's chip should be rendered for the current
	 * session. The base implementation hides non-mutable properties in
	 * running sessions (they would render as dead pills). Subclasses can
	 * override to keep specific properties visible as readonly chips —
	 * see {@link _isReadOnlyChip}.
	 */
	protected _shouldRenderProperty(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		return isNewSession || !!schema.sessionMutable;
	}

	/**
	 * Decide whether a property's trigger should render as readonly
	 * (no chevron, no popup). The base implementation defers to the
	 * schema's `readOnly` flag. Subclasses that opt in to rendering
	 * non-mutable chips via {@link _shouldRenderProperty} should
	 * override this to also mark them readonly at runtime.
	 */
	protected _isReadOnlyChip(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		return !!schema.readOnly;
	}

	protected _renderTrigger(trigger: HTMLElement, property: string, schema: SessionConfigPropertySchema, value: unknown | undefined, isReadOnly: boolean): void {
		dom.clearNode(trigger);

		const icon = getConfigIcon(property, value);
		if (icon) {
			dom.append(trigger, renderIcon(icon));
		}
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		const label = this._getLabel(schema, value);
		labelSpan.textContent = label;
		trigger.setAttribute('aria-label', isReadOnly
			? localize('agentHostSessionConfig.triggerAriaReadOnly', "{0}: {1}, Read-Only", schema.title, label)
			: localize('agentHostSessionConfig.triggerAria', "{0}: {1}", schema.title, label));
		if (!isReadOnly) {
			dom.append(trigger, renderIcon(Codicon.chevronDown));
		}
		applyAutoApproveTriggerStyles(trigger, property, value);
	}

	protected async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: SessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (schema.readOnly || this._actionWidgetService.isVisible) {
			return;
		}


		const rawItems = await this._getItems(provider, sessionId, property, schema);
		const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
		if (items.length === 0) {
			return;
		}

		const isAutoApproveProperty = property === SessionConfigKey.AutoApprove;
		const currentValue = provider.getSessionConfig(sessionId)?.values[property];
		const currentItem = items.find(i => i.value === currentValue);
		const actionItems = toActionItems(property, items, currentValue, policyRestricted);

		const delegate: IActionListDelegate<IConfigPickerItem> = {
			onSelect: async item => {
				this._actionWidgetService.hide();

				reportNewChatPickerClosed(this._telemetryService, {
					id: 'NewChatAgentHostSessionConfigPicker',
					name: `NewChatAgentHostSessionConfigPicker.${property}`,
					optionIdBefore: typeof currentValue === 'string' ? currentValue : undefined,
					optionIdAfter: item.value,
					optionLabelBefore: currentItem?.label,
					optionLabelAfter: item.label,
					isPII: !!schema.enumDynamic,
				});

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

	protected async _getItems(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: SessionConfigPropertySchema, query?: string): Promise<readonly IConfigPickerItem[]> {
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

	private _fromCompletionItem(item: SessionConfigValueItem): IConfigPickerItem {
		return {
			value: item.value,
			label: item.label,
			description: item.description,
		};
	}

	private _getLabel(schema: SessionConfigPropertySchema, value: unknown | undefined): string {
		if (typeof value === 'string') {
			const index = schema.enum?.indexOf(value) ?? -1;
			return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
		}
		return schema.title;
	}

	protected _getProvider(providerId: string): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && isAgentHostProvider(provider) ? provider : undefined;
	}
}

