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
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import type { SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatConfiguration, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { maybeConfirmElevatedPermissionLevel } from '../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { type IChatInputPickerOptions } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionProviderIdContext, IsPhoneLayoutContext, IsQuickChatSessionContext } from '../../../../common/contextkeys.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import type { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { PermissionPicker } from '../../copilotChatSessions/browser/permissionPicker.js';
import { MobilePermissionPicker } from '../../copilotChatSessions/browser/mobilePermissionPicker.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { showMobilePickerSheet, IMobilePickerSheetItem, IMobilePickerSheetSearchSource } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { AgentHostModePicker } from './agentHostModePicker.js';
import { MobileAgentHostModePicker } from './mobile/mobileAgentHostModePicker.js';
import { AgentHostPermissionPickerActionItem } from './agentHostPermissionPickerActionItem.js';
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownCodexApprovalsSchema, isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { AgentHostClaudePermissionModePicker } from './agentHostClaudePermissionModePicker.js';
import { ClaudeSessionConfigKey } from '../../../../../platform/agentHost/common/claudeSessionConfigKeys.js';
import { AgentHostCodexApprovalsPicker } from './agentHostCodexApprovalsPicker.js';
import { isAutoApproveValuePolicyRestricted } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { CodexSessionConfigKey } from '../../../../../platform/agentHost/common/codexSessionConfigKeys.js';

const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(SessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(SessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID);

function showActiveSessionModePicker(accessor: ServicesAccessor): void {
	const activeElement = dom.getActiveElement();
	const anchor = dom.isHTMLElement(activeElement) ? activeElement : dom.getActiveDocument().body;
	const picker = accessor.get(IInstantiationService).createInstance(
		isPhoneLayout(accessor.get(IWorkbenchLayoutService)) ? MobileAgentHostModePicker : AgentHostModePicker,
		accessor.get(ISessionsService).activeSession,
	);
	if (!picker.showPicker(anchor, () => picker.dispose())) {
		picker.dispose();
	}
}

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
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
					IsQuickChatSessionContext.negate(),
				),
			}],
		});
	}

	override async run(): Promise<void> { }
});

export interface IConfigPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
	readonly checked?: boolean;
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
		if (value === 'assisted') {
			return Codicon.sparkle;
		}
		return Codicon.shield;
	}
	return undefined;
}

function toActionItems(property: string, items: readonly IConfigPickerItem[], currentValue: unknown | undefined, policyRestricted?: boolean): IActionListItem<IConfigPickerItem>[] {
	return items.map(item => {
		const disabled = property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(item.value, policyRestricted === true);
		return {
			kind: ActionListItemKind.Action,
			label: item.label,
			detail: disabled
				? localize('agentHostSessionConfig.policyDisabled', "Disabled by your organization. Contact your administrator.")
				: item.description,
			group: { title: '', icon: getConfigIcon(property, item.value) },
			disabled,
			item: { ...item, checked: isSelectedValue(currentValue, item.value) },
		};
	});
}

function isSelectedValue(currentValue: unknown | undefined, itemValue: string): boolean {
	if (typeof currentValue === 'boolean') {
		return currentValue === (itemValue === 'true');
	}
	return itemValue === currentValue;
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
/**
 * Marks bypass/autopilot as disabled if enterprise policy restricts
 * auto-approval. Returns the items and policy state.
 */
function applyAutoApproveFiltering(
	items: readonly IConfigPickerItem[],
	property: string,
	configurationService: IConfigurationService,
): { readonly items: readonly IConfigPickerItem[]; readonly policyRestricted: boolean } {
	if (property !== SessionConfigKey.AutoApprove) {
		return { items, policyRestricted: false };
	}
	const policyRestricted = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
	return { items, policyRestricted };
}

/**
 * Shows a confirmation dialog for elevated auto-approve levels (Bypass
 * or legacy Autopilot). Delegates to the shared
 * {@link maybeConfirmElevatedPermissionLevel} so the copy, icons, and
 * "Don't show again" persistence stay consistent across every permission
 * picker. Returns `true` when confirmed (or not elevated), `false` when the
 * user cancels.
 */
async function confirmAutoApproveLevel(value: string, label: string, dialogService: IDialogService, storageService: IStorageService): Promise<boolean> {
	if (!isChatPermissionLevel(value)) {
		return true;
	}
	return maybeConfirmElevatedPermissionLevel(value, dialogService, storageService, { defaultSettingKey: ChatConfiguration.DefaultConfiguration, levelLabel: label });
}

/**
 * Applies warning/info CSS classes to a trigger element for auto-approve levels.
 */
function applyAutoApproveTriggerStyles(trigger: HTMLElement, property: string | undefined, value: unknown | undefined): void {
	if (property === SessionConfigKey.AutoApprove) {
		trigger.classList.toggle('warning', value === 'autopilot' || value === 'assisted');
		trigger.classList.toggle('info', value === 'autoApprove');
	}
}

export class AgentHostSessionConfigPicker extends Disposable {

	protected readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	protected readonly _filterDelayer = this._register(new Delayer<readonly IActionListItem<IConfigPickerItem>[]>(200));
	private _container: HTMLElement | undefined;

	constructor(
		protected readonly _session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService protected readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@IDialogService protected readonly _dialogService: IDialogService,
		@IHoverService protected readonly _hoverService: IHoverService,
		@ISessionsProvidersService protected readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IWorkbenchLayoutService protected readonly _layoutService: IWorkbenchLayoutService,
		@IStorageService protected readonly _storageService: IStorageService,
	) {
		super();

		this._register(autorun(reader => {
			this._session.read(reader);
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

		// Re-render when the layout crosses the phone breakpoint so the
		// isolation control swaps between the desktop checkbox and the
		// phone chip (which routes to the unified repository sheet).
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([IsPhoneLayoutContext.key]))) {
				this._renderConfigPickers();
			}
		}));
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

		const session = this._session.get();
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
			if (!this._isPickable(schema)) {
				continue;
			}
			if (property === SessionConfigKey.Isolation && !schema.enum?.includes('worktree')) {
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
			// `Menus.NewSessionControl`) handles it. Non-conforming schemas
			// still fall through to the generic per-property picker below.
			if (property === SessionConfigKey.Mode && isWellKnownModeSchema(schema)) {
				continue;
			}
			// Claude's permissionMode has a dedicated Claude-native picker so
			// it doesn't render as a generic enum chip.
			if (property === ClaudeSessionConfigKey.PermissionMode && isWellKnownClaudePermissionModeSchema(schema)) {
				continue;
			}
			// Codex's permissions preset has a dedicated Codex-native picker
			// (a single "Approvals" chip) so it doesn't render as a generic
			// enum chip.
			if (property === CodexSessionConfigKey.PermissionsPreset && isWellKnownCodexApprovalsSchema(schema)) {
				continue;
			}
			const value = resolvedConfig.values[property] ?? schema.default;
			const isReadOnly = this._isReadOnlyChip(property, schema, isNewSession);
			const slot = dom.append(this._container, dom.$('.sessions-chat-picker-slot'));
			if (property === SessionConfigKey.Isolation) {
				this._renderDisposables.add(markOnboardingTarget(slot, 'sessions.newSession.isolation'));
			}
			// Isolation renders as a Worktree checkbox on desktop; the phone layout keeps the chip for the unified repo sheet.
			if (property === SessionConfigKey.Isolation && this._shouldRenderIsolationAsCheckbox(schema)) {
				this._renderIsolationCheckbox(slot, provider, session.sessionId, schema, value, isReadOnly, !isReadOnly && isLoading);
				continue;
			}
			// `renderPickerTrigger`'s `disabled` flag means "read-only"
			// (renders a `<span>` with `aria-readonly`). The resolving
			// state is transient and uses `.disabled` on the slot (see
			// CSS in `chatWidget.css`) + `aria-disabled` on the trigger,
			// keeping it focusable and using correct ARIA semantics. The
			// click handler bails when resolving in `_showPicker`.
			const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
			// The read-only Branch chip skips the hover: it just mirrors the
			// current/default branch name (already visible as the label),
			// and the schema description reads awkwardly as a hover for a
			// fixed value. The editable Branch chip (worktree isolation)
			// keeps its description, which is useful context there.
			const tooltip = (property === SessionConfigKey.Branch && isReadOnly) ? undefined : (schema.description ?? schema.title);
			if (tooltip) {
				this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, { content: tooltip }));
			}
			if (!isReadOnly && isLoading) {
				slot.classList.add('disabled');
				trigger.setAttribute('aria-disabled', 'true');
			}
			this._renderTrigger(trigger, property, schema, value, isReadOnly);
		}
	}

	private _isPickable(schema: SessionConfigPropertySchema): boolean {
		if (schema.type === 'boolean') {
			return true;
		}
		if (schema.type !== 'string') {
			return false;
		}
		return !!schema.enumDynamic || (Array.isArray(schema.enum) && schema.enum.length > 0);
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
		applyAutoApproveTriggerStyles(trigger, property, value);
	}

	/**
	 * Whether the isolation property should render as a checkbox
	 * (Worktree on/off) rather than a dropdown. Only on non-phone
	 * layouts and only when the schema offers both folder and worktree.
	 */
	protected _shouldRenderIsolationAsCheckbox(schema: SessionConfigPropertySchema): boolean {
		return !isPhoneLayout(this._layoutService)
			&& Array.isArray(schema.enum)
			&& schema.enum.includes('worktree')
			&& schema.enum.includes('folder');
	}

	private _renderIsolationCheckbox(slot: HTMLElement, provider: IAgentHostSessionsProvider, sessionId: string, schema: SessionConfigPropertySchema, value: unknown | undefined, isReadOnly: boolean, isLoading: boolean): void {
		const disabled = isReadOnly || isLoading;
		const label = localize('agentHostSessionConfig.isolation.worktree', "New Worktree");
		slot.classList.add('sessions-chat-isolation-checkbox');
		slot.classList.toggle('disabled', disabled);

		const row = dom.append(slot, dom.$('.action-label'));
		const checkbox = this._renderDisposables.add(new Checkbox(label, value === 'worktree', { ...defaultCheckboxStyles, size: 14 }));
		if (disabled) {
			checkbox.disable();
		}
		dom.append(row, checkbox.domNode);
		const labelSpan = dom.append(row, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		// Reuse the schema's own `worktree` enum description (e.g. "Create a
		// Git worktree for isolation") since it already explains what
		// checking the box does. Fall back to the schema's description/title
		// if the enum shape is unexpected.
		const worktreeIndex = schema.enum?.indexOf('worktree') ?? -1;
		const tooltip = (worktreeIndex >= 0 ? schema.enumDescriptions?.[worktreeIndex] : undefined) ?? schema.description ?? schema.title;
		if (tooltip) {
			this._renderDisposables.add(this._hoverService.setupDelayedHover(row, { content: tooltip }));
		}

		const applyValue = (checked: boolean) => {
			const before = provider.getSessionConfig(sessionId)?.values[SessionConfigKey.Isolation] ?? schema.default;
			const nextValue = checked ? 'worktree' : 'folder';
			reportNewChatPickerClosed(this._telemetryService, {
				id: 'NewChatAgentHostSessionConfigPicker',
				name: `NewChatAgentHostSessionConfigPicker.${SessionConfigKey.Isolation}`,
				optionIdBefore: typeof before === 'string' ? before : undefined,
				optionIdAfter: nextValue,
				optionLabelBefore: typeof before === 'string' ? this._getLabel(schema, before) : undefined,
				optionLabelAfter: this._getLabel(schema, nextValue),
				isPII: false,
			});
			provider.setSessionConfigValue(sessionId, SessionConfigKey.Isolation, nextValue).catch(() => { /* best-effort */ });
		};

		this._renderDisposables.add(checkbox.onChange(() => applyValue(checkbox.checked)));
		if (!disabled) {
			// Toggle from anywhere on the row so the visible hit target
			// (padding + checkbox/label gap) matches the interactive one.
			// The checkbox stops its own click from bubbling here.
			this._renderDisposables.add(Gesture.addTarget(row));
			for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
				this._renderDisposables.add(dom.addDisposableListener(row, eventType, e => {
					dom.EventHelper.stop(e, true);
					checkbox.checked = !checkbox.checked;
					applyValue(checkbox.checked);
				}));
			}
		}
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
		const currentValue = provider.getSessionConfig(sessionId)?.values[property] ?? schema.default;
		const currentItem = items.find(i => isSelectedValue(currentValue, i.value));
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

				if (isAutoApproveProperty && item.value !== 'default') {
					const confirmed = await confirmAutoApproveLevel(item.value, item.label, this._dialogService, this._storageService);
					if (!confirmed) {
						return;
					}
				}

				const nextValue = schema.type === 'boolean' ? item.value === 'true' : item.value;
				provider.setSessionConfigValue(sessionId, property, nextValue).catch(() => { /* best-effort */ });
			},
			onFilter: schema.enumDynamic
				? query => this._filterDelayer.trigger(async () => {
					const filteredRawItems = await this._getItems(provider, sessionId, property, schema, query);
					const { items: filteredItems, policyRestricted: filteredPolicyRestricted } = applyAutoApproveFiltering(filteredRawItems, property, this._configurationService);
					return toActionItems(property, filteredItems, provider.getSessionConfig(sessionId)?.values[property] ?? schema.default, filteredPolicyRestricted);
				})
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
			actionItems.length > 10
				? { showFilter: true, filterPlaceholder: localize('agentHostSessionConfig.filter', "Filter options..."), minWidth: 255 }
				: { minWidth: 255 },
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
			value: String(value),
			label: schema.enumLabels?.[index] ?? String(value),
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

		// Mirror the base `_showPicker` guard (the repo-sheet path below bypasses
		// it): bail while resolving so injected disabled chips don't open a sheet.
		if (provider.isSessionConfigResolving(sessionId).get()) {
			return;
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
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(MobileAgentHostSessionConfigPicker, session));
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_MODE_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(
					isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
					session,
				));
			},
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_MODE_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(
					isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
					session,
				));
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_APPROVE_PICKER_ID,
			(_action, _options, scopedInstantiationService) => this._createNewSessionPermissionPicker(scopedInstantiationService),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_PERMISSION_MODE_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
			},
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
			},
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_CONFIG_PICKER_ID,
			this._createRunningSessionPermissionPickerFactory(),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
			},
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInputSecondary,
			RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
			},
		));
	}

	/**
	 * On the new-chat page (left of the toolbar), use the sessions
	 * {@link PermissionPicker} so the styling matches the surrounding sessions
	 * pickers (font size, padding, icon size).
	 */
	private _createNewSessionPermissionPicker(instantiationService: IInstantiationService): PickerActionViewItem {
		const { session } = instantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
		const delegate = instantiationService.createInstance(AgentHostPermissionPickerDelegate, session);
		const picker = instantiationService.createInstance(MobilePermissionPicker, delegate);
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
			const { session } = instantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
			const pickerOptions: IChatInputPickerOptions = {
				compact: constObservable(true),
				listOptions: { minWidth: 255 },
			};
			return instantiationService.createInstance(
				AgentHostPermissionPickerActionItem,
				action,
				pickerOptions,
				session,
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

const NEW_SESSION_PERMISSION_MODE_PICKER_ID = 'sessions.agentHost.newSessionPermissionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_PERMISSION_MODE_PICKER_ID,
			title: localize2('agentHostNewSessionPermissionModePicker', "Approvals"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});

// ---- New session Codex approvals picker (NewSessionControl) ----
// Codex-specific "Approvals" chip. Shares the NewSessionControl navigation
// group with the Claude permission-mode picker (order 2); the two are
// mutually exclusive because each hides itself when the active session's
// schema doesn't expose its backing property.

const NEW_SESSION_CODEX_APPROVALS_PICKER_ID = 'sessions.agentHost.newSessionCodexApprovalsPicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
			title: localize2('agentHostNewSessionCodexApprovalsPicker', "Approvals"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});

// ---- New session mode picker (NewSessionControl) ----

const NEW_SESSION_MODE_PICKER_ID = 'sessions.agentHost.newSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostNewSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
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

// ---- Running session Codex approvals picker (ChatInputSecondary) ----
// Codex-specific "Approvals" chip for a running session. Mutually exclusive
// with the Claude permission-mode picker (order 11) — each hides when its
// backing property is absent from the active session's schema.

const RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID = 'sessions.agentHost.runningSessionCodexApprovalsPicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
			title: localize2('agentHostRunningSessionCodexApprovalsPicker', "Approvals"),
			f1: false,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 12,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}

	override async run(): Promise<void> { }
});


// ---- Running session mode picker (ChatInputSecondary, before approvals) ----

const RUNNING_SESSION_MODE_PICKER_ID = 'sessions.agentHost.runningSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostRunningSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 9,
				// Hide the agent mode picker while a delegation (continue in) target is pending.
				when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, ChatContextKeys.hasPendingDelegationTarget.negate()),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		showActiveSessionModePicker(accessor);
	}
});


registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
