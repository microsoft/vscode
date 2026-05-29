/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostSessionConfigPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../../base/common/observable.js';
import Severity from '../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import type { SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatContextKeyExprs } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { type IChatInputPickerOptions } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { Menus } from '../../../../browser/menus.js';
import { ActiveSessionProviderIdContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { PermissionPicker } from '../../copilotChatSessions/browser/permissionPicker.js';
import { MobilePermissionPicker } from '../../copilotChatSessions/browser/mobilePermissionPicker.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { showMobilePickerSheet, IMobilePickerSheetItem, IMobilePickerSheetSearchSource } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { AgentHostModePicker } from './agentHostModePicker.js';
import { MobileAgentHostModePicker } from './mobile/mobileAgentHostModePicker.js';
import { AgentHostPermissionPickerActionItem } from './agentHostPermissionPickerActionItem.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { AgentHostClaudePermissionModePicker } from './agentHostClaudePermissionModePicker.js';

const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID);

const CHIP_ORDER = new Map<string, number>([
	[SessionConfigKey.Isolation, 0],
	[SessionConfigKey.Branch, 1],
	['codex.sandboxMode', 2],
	['codex.approvalPolicy', 3],
	['codex.webSearchMode', 4],
	['codex.additionalDirectories', 5],
	['codex.networkAccessEnabled', 6],
]);

const MODEL_PICKER_CONFIG_PROPERTIES = new Set<string>([
	'codex.modelReasoningEffort',
]);

const MIN_SHRUNK_CHIP_WIDTH = 96;
const OVERFLOW_BUTTON_FALLBACK_WIDTH = 24;

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
	private _overflowButton: HTMLElement | undefined;
	private _overflowProperties: readonly string[] = [];
	private readonly _slotByProperty = new Map<string, HTMLElement>();
	private readonly _resizeObserverDisposables = this._register(new DisposableStore());
	private readonly _overflowLayoutHandle = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IActionWidgetService protected readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@IContextMenuService protected readonly _contextMenuService: IContextMenuService,
		@IDialogService protected readonly _dialogService: IDialogService,
		@ISessionsManagementService protected readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService protected readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IWorkbenchLayoutService protected readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		this._register(autorun(reader => {
			this._sessionsManagementService.activeSession.read(reader);
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
		this._resizeObserverDisposables.clear();
		const observer = new ResizeObserver(() => this._scheduleOverflowLayout());
		observer.observe(this._container);
		if (this._container.parentElement) {
			observer.observe(this._container.parentElement);
		}
		this._resizeObserverDisposables.add({ dispose: () => observer.disconnect() });
		this._renderConfigPickers();
	}

	private _renderConfigPickers(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);
		this._slotByProperty.clear();
		this._overflowButton = undefined;
		this._overflowProperties = [];

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
		// Disable interactions while a resolve is in flight. Schema is
		// preserved so chips stay visible. Not `session.loading` —
		// that also covers the required-values-missing state where
		// chips must remain interactive.
		const isLoading = provider.isSessionConfigResolving(session.sessionId).get();

		const properties = this._orderProperties(Object.entries(resolvedConfig.schema.properties));

		for (const [property, schema] of properties) {
			if (MODEL_PICKER_CONFIG_PROPERTIES.has(property)) {
				continue;
			}
			if (!this._isPickable(schema) || this._isHiddenByDependency(resolvedConfig.values, property)) {
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
			// `renderPickerTrigger`'s `disabled` flag means "read-only"
			// (renders a `<span>` with `aria-readonly`). The resolving
			// state is transient and uses `.disabled` on the slot (see
			// CSS in `chatWidget.css`) + `aria-disabled` on the trigger,
			// keeping it focusable and using correct ARIA semantics. The
			// click handler bails when resolving in `_showPicker`.
			const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
			if (!isReadOnly && isLoading) {
				slot.classList.add('disabled');
				trigger.setAttribute('aria-disabled', 'true');
			}
			this._renderTrigger(trigger, property, schema, value, isReadOnly);
			this._slotByProperty.set(property, slot);
		}
		this._ensureOverflowButton();
		this._scheduleOverflowLayout();
	}

	private _ensureOverflowButton(): void {
		if (!this._container || this._slotByProperty.size === 0) {
			return;
		}
		const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot.sessions-chat-config-overflow-slot'));
		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.role = 'button';
		trigger.tabIndex = 0;
		trigger.setAttribute('aria-haspopup', 'menu');
		trigger.setAttribute('aria-expanded', 'false');
		trigger.setAttribute('aria-label', localize('agentHostSessionConfig.more', "More Session Configuration..."));
		dom.append(trigger, renderIcon(Codicon.toolBarMore));

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				void this._showOverflowMenu(trigger);
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				void this._showOverflowMenu(trigger);
			}
		}));
		this._overflowButton = slot;
	}

	private _scheduleOverflowLayout(): void {
		if (!this._container) {
			return;
		}
		this._overflowLayoutHandle.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this._container), () => {
			this._overflowLayoutHandle.clear();
			this._layoutOverflow();
		});
	}

	private _layoutOverflow(): void {
		const container = this._container;
		const overflowButton = this._overflowButton;
		if (!container || !overflowButton) {
			return;
		}

		const visibleSlots = [...this._slotByProperty.entries()]
			.filter(([, slot]) => slot.parentElement === container && slot.style.display !== 'none');
		for (const [, slot] of visibleSlots) {
			slot.classList.remove('sessions-chat-config-chip-overflow-hidden');
			slot.classList.remove('sessions-chat-config-chip-overflow-shrunk');
			slot.style.maxWidth = '';
		}
		overflowButton.classList.remove('visible');
		container.classList.remove('has-overflow');

		const availableWidth = container.clientWidth;
		if (visibleSlots.length === 0) {
			this._overflowProperties = [];
			return;
		}
		if (availableWidth <= 0) {
			this._overflowProperties = visibleSlots.map(([property]) => property);
			for (const [, slot] of visibleSlots) {
				slot.classList.add('sessions-chat-config-chip-overflow-hidden');
			}
			overflowButton.classList.add('visible');
			container.classList.add('has-overflow');
			return;
		}

		const gap = parseFloat(dom.getWindow(container).getComputedStyle(container).columnGap) || 0;
		const slotWidths = visibleSlots.map(([property, slot]) => ({ property, slot, width: slot.getBoundingClientRect().width }));
		const widthFor = (entries: readonly { readonly width: number }[]) => entries.reduce((sum, entry, index) => sum + entry.width + (index === 0 ? 0 : gap), 0);
		const shrinkEntry = (entry: { readonly slot: HTMLElement; readonly width: number }, width: number) => {
			entry.slot.classList.add('sessions-chat-config-chip-overflow-shrunk');
			entry.slot.style.maxWidth = `${Math.max(0, width)}px`;
		};

		const totalWidth = widthFor(slotWidths);
		if (totalWidth <= availableWidth) {
			this._overflowProperties = [];
			return;
		}

		const rightmost = slotWidths[slotWidths.length - 1];
		const rightmostMinWidth = Math.min(rightmost.width, MIN_SHRUNK_CHIP_WIDTH);
		const rightmostShrinkCapacity = rightmost.width - rightmostMinWidth;
		const initialOverflow = totalWidth - availableWidth;
		if (rightmostShrinkCapacity >= initialOverflow) {
			shrinkEntry(rightmost, rightmost.width - initialOverflow);
			this._overflowProperties = [];
			return;
		}

		overflowButton.classList.add('visible');
		container.classList.add('has-overflow');
		const overflowWidth = overflowButton.getBoundingClientRect().width || OVERFLOW_BUTTON_FALLBACK_WIDTH;
		const visibleEntries = slotWidths.slice();
		let visibleWidth = widthFor(visibleEntries) + (visibleEntries.length > 0 ? gap : 0) + overflowWidth;
		const hidden: string[] = [];
		while (visibleEntries.length > 0 && visibleWidth > availableWidth) {
			const entry = visibleEntries[visibleEntries.length - 1];
			const minWidth = Math.min(entry.width, MIN_SHRUNK_CHIP_WIDTH);
			const shrinkCapacity = entry.width - minWidth;
			const overflow = visibleWidth - availableWidth;
			if (shrinkCapacity >= overflow) {
				shrinkEntry(entry, entry.width - overflow);
				break;
			}
			entry.slot.classList.add('sessions-chat-config-chip-overflow-hidden');
			hidden.unshift(entry.property);
			visibleEntries.pop();
			visibleWidth = widthFor(visibleEntries) + (visibleEntries.length > 0 ? gap : 0) + overflowWidth;
		}
		this._overflowProperties = hidden;
	}

	private async _showOverflowMenu(trigger: HTMLElement): Promise<void> {
		if (this._overflowProperties.length === 0) {
			return;
		}
		const session = this._sessionsManagementService.activeSession.get();
		const provider = session ? this._getProvider(session.providerId) : undefined;
		const config = session && provider?.getSessionConfig(session.sessionId);
		if (!session || !provider || !config || provider.isSessionConfigResolving(session.sessionId).get()) {
			return;
		}

		const actions: IAction[] = [];
		for (const property of this._overflowProperties) {
			const schema = config.schema.properties[property];
			if (!schema || schema.readOnly) {
				continue;
			}
			const currentValue = config.values[property] ?? schema.default;
			const rawItems = await this._getItems(provider, session.sessionId, property, schema);
			const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
			if (items.length === 0) {
				continue;
			}
			const currentItem = items.find(item => item.value === currentValue);
			const submenuActions = items.map(item => toAction({
				id: `sessions.agentHost.sessionConfigPicker.overflow.${property}.${item.value}`,
				label: item.label,
				enabled: !(policyRestricted && (item.value === 'autoApprove' || item.value === 'autopilot')),
				checked: this._isSelected(schema, currentValue, item.value),
				run: async () => {
					if (property === SessionConfigKey.AutoApprove && (item.value === 'autoApprove' || item.value === 'autopilot')) {
						const confirmed = await confirmAutoApproveLevel(item.value, this._dialogService);
						if (!confirmed) {
							return;
						}
					}

					reportNewChatPickerClosed(this._telemetryService, {
						id: 'NewChatAgentHostSessionConfigPicker',
						name: `NewChatAgentHostSessionConfigPicker.${property}`,
						optionIdBefore: typeof currentValue === 'string' ? currentValue : undefined,
						optionIdAfter: item.value,
						optionLabelBefore: currentItem?.label,
						optionLabelAfter: item.label,
						isPII: !!schema.enumDynamic,
					});

					const nextValue: unknown = schema.type === 'boolean'
						? item.value === 'true'
						: schema.type === 'array'
							? [...(Array.isArray(currentValue) ? currentValue.filter((entry): entry is string => typeof entry === 'string') : []), item.value]
							: item.value;
					provider.setSessionConfigValue(session.sessionId, property, nextValue).catch(() => { /* best-effort */ });
				},
			}));
			actions.push(new SubmenuAction(
				`sessions.agentHost.sessionConfigPicker.overflow.${property}`,
				schema.title,
				submenuActions,
			));
		}

		if (actions.length === 0) {
			return;
		}

		trigger.setAttribute('aria-expanded', 'true');
		this._contextMenuService.showContextMenu({
			getAnchor: () => trigger,
			getActions: () => actions,
			getCheckedActionsRepresentation: () => 'radio',
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				trigger.focus();
			},
		});
	}

	private _isSelected(schema: SessionConfigPropertySchema, currentValue: unknown | undefined, itemValue: string): boolean {
		if (schema.type === 'boolean') {
			return (currentValue === true) === (itemValue === 'true');
		}
		if (schema.type === 'array') {
			return Array.isArray(currentValue) && currentValue.includes(itemValue);
		}
		return currentValue === itemValue;
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
		return properties
			.map(([key, schema], index) => ({ key, schema, index }))
			.sort((a, b) => {
				const aRank = CHIP_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER;
				const bRank = CHIP_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER;
				return aRank - bRank || a.index - b.index;
			})
			.map(({ key, schema }) => [key, schema] as [string, SessionConfigPropertySchema]);
	}

	private _isPickable(schema: SessionConfigPropertySchema): boolean {
		if (schema.type === 'boolean') {
			return true;
		}
		if (schema.type === 'array') {
			return !!schema.enumDynamic && schema.items?.type === 'string';
		}
		if (schema.type !== 'string') {
			return false;
		}
		return !!schema.enumDynamic || (Array.isArray(schema.enum) && schema.enum.length > 0);
	}

	private _isHiddenByDependency(values: Record<string, unknown>, property: string): boolean {
		if (property !== 'codex.additionalDirectories' && property !== 'codex.networkAccessEnabled') {
			return false;
		}
		const sandbox = values['codex.sandboxMode'];
		return sandbox !== undefined && sandbox !== 'workspace-write';
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
		applyAutoApproveTriggerStyles(trigger, property, value);
	}

	protected async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: SessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (schema.readOnly || this._actionWidgetService.isVisible) {
			return;
		}
		// Mobile bottom-sheet override dispatches through this entry
		// point, so guard here for both invocation paths.
		if (provider.isSessionConfigResolving(sessionId).get()) {
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

				const nextValue: unknown = schema.type === 'boolean'
					? item.value === 'true'
					: schema.type === 'array'
						? [...(Array.isArray(currentValue) ? currentValue.filter((entry): entry is string => typeof entry === 'string') : []), item.value]
						: item.value;
				provider.setSessionConfigValue(sessionId, property, nextValue).catch(() => { /* best-effort */ });
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
		if (schema.type === 'boolean') {
			return [
				{ value: 'true', label: localize('agentHostSessionConfig.boolean.true', "On") },
				{ value: 'false', label: localize('agentHostSessionConfig.boolean.false', "Off") },
			];
		}
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
		if (schema.type === 'boolean') {
			return value === true
				? localize('agentHostSessionConfig.boolean.onLabel', "On")
				: localize('agentHostSessionConfig.boolean.offLabel', "Off");
		}
		if (schema.type === 'array') {
			const count = Array.isArray(value) ? value.length : 0;
			return count === 0
				? localize('agentHostSessionConfig.array.none', "None")
				: localize('agentHostSessionConfig.array.count', "{0} Selected", count);
		}
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

/**
 * Phone variant of {@link AgentHostSessionConfigPicker} that routes the
 * Isolation and Branch pickers through a unified bottom sheet rather
 * than the desktop action-widget popup.
 *
 * On desktop viewports the inherited `_showPicker` falls through to the
 * base implementation, so this class is safe to keep through
 * viewport-class transitions.
 *
 * Defined in the same file as the base class to avoid a circular ESM
 * dependency (the `extends` clause runs at class-definition time, which
 * is during module evaluation — a separate file that imported the base
 * would hit "Cannot access before initialization").
 */
class MobileAgentHostSessionConfigPicker extends AgentHostSessionConfigPicker {

	/**
	 * On phone the chip lane has a fixed visual sequence — Default
	 * Approvals (rendered by a separate left-side picker), then Branch,
	 * then Worktree. Sort the known repo-config properties to that
	 * order; unknown properties fall through to schema-declared order
	 * after the known ones.
	 *
	 * On desktop viewports this subclass is also instantiated (see the
	 * factory in `AgentHostSessionConfigPickersContribution` — it always
	 * picks the mobile-aware subclass so `_showPicker` can route to the
	 * bottom sheet on phones), so we must defer to the base ordering
	 * (Isolation first, Branch second) when not on a phone layout.
	 */
	protected override _orderProperties(properties: ReadonlyArray<[string, SessionConfigPropertySchema]>): ReadonlyArray<[string, SessionConfigPropertySchema]> {
		if (!isPhoneLayout(this._layoutService)) {
			return super._orderProperties(properties);
		}
		const order = new Map<string, number>([
			[SessionConfigKey.Branch, 0],
			[SessionConfigKey.Isolation, 1],
		]);
		return properties.slice().sort(([aKey], [bKey]) => {
			const a = order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
			const b = order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
			return a - b;
		});
	}

	/**
	 * Keep Branch and Isolation visible in running sessions even when
	 * the schema marks them non-mutable. Their value is informational
	 * — the user wants to see what the running session is using —
	 * and the chip renders as readonly via {@link _isReadOnlyChip}.
	 * All other properties defer to the base behavior (hide if
	 * non-mutable in a running session).
	 */
	protected override _shouldRenderProperty(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		const isUnifiedRepoProperty = property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch;
		return isUnifiedRepoProperty || super._shouldRenderProperty(property, schema, isNewSession);
	}

	/**
	 * Mark non-mutable properties as readonly chips in running sessions
	 * so taps don't try to open a picker (which would no-op at the
	 * provider boundary). The schema's own `readOnly` flag still wins.
	 */
	protected override _isReadOnlyChip(property: string, schema: SessionConfigPropertySchema, isNewSession: boolean): boolean {
		return super._isReadOnlyChip(property, schema, isNewSession) || (!isNewSession && !schema.sessionMutable);
	}

	protected override async _showPicker(provider: IAgentHostSessionsProvider, sessionId: string, property: string, schema: SessionConfigPropertySchema, trigger: HTMLElement): Promise<void> {
		if (!isPhoneLayout(this._layoutService)) {
			return super._showPicker(provider, sessionId, property, schema, trigger);
		}

		if (property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch) {
			await this._showUnifiedRepoSheet(provider, sessionId, trigger);
			return;
		}

		return super._showPicker(provider, sessionId, property, schema, trigger);
	}

	private async _showUnifiedRepoSheet(provider: IAgentHostSessionsProvider, sessionId: string, trigger: HTMLElement): Promise<void> {
		const config = provider.getSessionConfig(sessionId);
		if (!config) {
			return;
		}

		const isolationSchema = config.schema.properties[SessionConfigKey.Isolation];
		const branchSchema = config.schema.properties[SessionConfigKey.Branch];

		const [isolationItems, branchItems] = await Promise.all([
			isolationSchema && !isolationSchema.readOnly
				? this._getItems(provider, sessionId, SessionConfigKey.Isolation, isolationSchema)
				: Promise.resolve([] as readonly IConfigPickerItem[]),
			branchSchema && !branchSchema.readOnly
				? this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema)
				: Promise.resolve([] as readonly IConfigPickerItem[]),
		]);

		const isolationValue = config.values[SessionConfigKey.Isolation];
		const branchValue = config.values[SessionConfigKey.Branch];
		const sheetItems: IMobilePickerSheetItem[] = [];

		const idToConfig = new Map<string, { property: string; value: string; label: string; isPII: boolean }>();
		const registerId = (property: string, value: string, label: string, isPII: boolean): string => {
			const id = `repo-row-${idToConfig.size}`;
			idToConfig.set(id, { property, value, label, isPII });
			return id;
		};

		isolationItems.forEach((item, index) => {
			sheetItems.push({
				id: registerId(SessionConfigKey.Isolation, item.value, item.label, !!isolationSchema?.enumDynamic),
				label: item.label,
				description: item.description,
				icon: getConfigIcon(SessionConfigKey.Isolation, item.value),
				checked: item.value === isolationValue,
				sectionTitle: index === 0 ? (isolationSchema?.title ?? localize('mobileAgentHostSessionConfig.repoSheet.isolationSection', "Isolation")) : undefined,
			});
		});

		const branchSectionTitle = branchSchema?.title ?? localize('mobileAgentHostSessionConfig.repoSheet.branchSection', "Base Branch");
		if (!branchSchema?.enumDynamic) {
			branchItems.forEach((item, index) => {
				sheetItems.push({
					id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema?.enumDynamic),
					label: item.label,
					description: item.description,
					icon: getConfigIcon(SessionConfigKey.Branch, item.value),
					checked: item.value === branchValue,
					sectionTitle: index === 0 ? branchSectionTitle : undefined,
				});
			});
		}

		if (sheetItems.length === 0 && !branchSchema?.enumDynamic) {
			return;
		}

		let search: IMobilePickerSheetSearchSource | undefined;
		if (branchSchema?.enumDynamic && !branchSchema.readOnly) {
			search = {
				placeholder: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchPlaceholder', "Search branches"),
				ariaLabel: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchAria', "Search base branches"),
				resultsSectionTitle: branchSectionTitle,
				emptyMessage: localize('mobileAgentHostSessionConfig.repoSheet.branchSearchEmpty', "No matching branches."),
				loadItems: async (query, token) => {
					const items = query
						? await this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema, query)
						: branchItems;
					if (token.isCancellationRequested) {
						return [];
					}
					return items.map(item => ({
						id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema.enumDynamic),
						label: item.label,
						description: item.description,
						icon: getConfigIcon(SessionConfigKey.Branch, item.value),
						checked: item.value === branchValue,
					}));
				},
			};
		}

		trigger.setAttribute('aria-expanded', 'true');
		await showMobilePickerSheet(
			this._layoutService.mainContainer,
			localize('mobileAgentHostSessionConfig.repoSheet.title', "Worktree"),
			sheetItems,
			{
				search,
				// Keep the sheet open on row taps so the user can adjust
				// both isolation mode and branch without reopening. Each
				// tap writes through immediately; Done just dismisses.
				stayOpenOnSelect: true,
				onDidSelect: (id) => {
					const selection = idToConfig.get(id);
					if (selection) {
						const beforeValue = provider.getSessionConfig(sessionId)?.values[selection.property];
						reportNewChatPickerClosed(this._telemetryService, {
							id: 'NewChatAgentHostSessionConfigPicker',
							name: `NewChatAgentHostSessionConfigPicker.${selection.property}`,
							optionIdBefore: typeof beforeValue === 'string' ? beforeValue : undefined,
							optionIdAfter: selection.value,
							optionLabelBefore: undefined,
							optionLabelAfter: selection.label,
							isPII: selection.isPII,
						});
						provider.setSessionConfigValue(sessionId, selection.property, selection.value).catch(() => { /* best-effort */ });
					}
				},
			},
		);
		trigger.setAttribute('aria-expanded', 'false');
		trigger.focus();
	}
}

interface IConfigPickerWidget extends IDisposable {
	render(container: HTMLElement): void;
}

export class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly _picker: IConfigPickerWidget, disposable?: IDisposable) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
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
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();
		// The mode-picker factories below pick the mobile subclass at
		// view-item construction time when the viewport is phone, and
		// the desktop class otherwise. The session-config picker
		// always uses the mobile-aware subclass because its
		// `_showPicker` override falls back to `super._showPicker()`
		// on desktop. The static import of `MobileAgentHostModePicker`
		// / `MobileAgentHostSessionConfigPicker` creates a circular
		// dependency (mobile → base → mobile), but ESM handles it
		// because the classes are only accessed inside these factory
		// callbacks, which run at `AfterRestored` — well after both
		// modules have finished evaluating.
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig,
			'sessions.agentHost.sessionConfigPicker',
			() => new PickerActionViewItem(this._instantiationService.createInstance(MobileAgentHostSessionConfigPicker)),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig,
			NEW_SESSION_MODE_PICKER_ID,
			() => new PickerActionViewItem(this._instantiationService.createInstance(
				isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
			)),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInput,
			RUNNING_SESSION_MODE_PICKER_ID,
			() => new PickerActionViewItem(this._instantiationService.createInstance(
				isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
			)),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_APPROVE_PICKER_ID,
			() => this._createNewSessionPermissionPicker(),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_CONFIG_PICKER_ID,
			this._createRunningSessionPermissionPickerFactory(),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
			() => new PickerActionViewItem(this._instantiationService.createInstance(AgentHostClaudePermissionModePicker)),
		));
	}

	/**
	 * On the new-chat page (left of the toolbar), use the sessions
	 * {@link PermissionPicker} so the styling matches the surrounding sessions
	 * pickers (font size, padding, icon size).
	 */
	private _createNewSessionPermissionPicker(): PickerActionViewItem {
		const delegate = this._instantiationService.createInstance(AgentHostPermissionPickerDelegate);
		const picker = this._instantiationService.createInstance(MobilePermissionPicker, delegate);
		return new PickerActionViewItem(picker, delegate);
	}

	/**
	 * Inside a running chat widget (`ChatInputSecondary`), use the workbench
	 * {@link PermissionPickerActionItem} so it matches the rest of the
	 * chat-input secondary toolbar (which is what the extension-host CLI
	 * already uses).
	 */
	private _createRunningSessionPermissionPickerFactory(): IActionViewItemFactory {
		return (action, _options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			const pickerOptions: IChatInputPickerOptions = {
				compact: constObservable(true),
			};
			return instantiationService.createInstance(
				AgentHostPermissionPickerActionItem,
				action,
				pickerOptions,
			);
		};
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

// ---- New session mode picker (NewSessionConfig) ----

const NEW_SESSION_MODE_PICKER_ID = 'sessions.agentHost.newSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostNewSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				// On phone the {@link MobileChatInputConfigPicker} replaces
				// this picker with a unified mode + model bottom sheet, so
				// gate this desktop-only Action out of phone layouts.
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
					IsPhoneLayoutContext.negate(),
				),
			}],
		});
	}

	override async run(): Promise<void> { }
});


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

const RUNNING_SESSION_PERMISSION_MODE_PICKER_ID = 'sessions.agentHost.runningSessionPermissionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
			title: localize2('agentHostRunningSessionPermissionModePicker', "Approvals"),
			f1: false,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 11,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}

	override async run(): Promise<void> { }
});


// ---- Running session mode picker (ChatInput, beside the model picker) ----

const RUNNING_SESSION_MODE_PICKER_ID = 'sessions.agentHost.runningSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostRunningSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: MenuId.ChatInput,
				group: 'navigation',
				// `OpenModelPickerAction` (the "Auto" model picker) is at order 3
				// in the same menu — sit just before it so the mode pill renders
				// to the left of "Pick Model".
				order: 2,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}

	override async run(): Promise<void> { }
});


registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
