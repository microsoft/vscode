/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { type ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { ChatPetAchievementIds, didExplicitlyEnableChatPetAutopilot } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { getAgentHostModeIcon } from './agentHostModeIcon.js';
import { AgentHostPermissionPickerDelegate, isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';
import { PermissionPicker } from '../../copilotChatSessions/browser/permissionPicker.js';
import { AGENT_HOST_PERMISSIONS_SETTINGS_QUERY, createModePickerPermissionsItem, getModePermissionsPickerOptions, getModePickerAriaLabel, IModePickerTrigger, renderModePickerTrigger } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';

export interface IAgentHostSessionEnumPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
	readonly checked?: boolean;
}

/**
 * Shared active-session picker for well-known string-enum session config.
 * Concrete subclasses provide the property key, schema guard, icon policy,
 * and labels while this class owns the provider subscription and picker UI.
 */
export abstract class AgentHostSessionEnumPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _triggerGesture = this._register(new MutableDisposable());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _containerElement: HTMLElement | undefined;
	private _slotElement: HTMLElement | undefined;
	protected _triggerElement: HTMLElement | undefined;
	private _pickerVisible = false;

	protected abstract readonly _property: string;
	protected abstract readonly _pickerId: string;
	protected abstract readonly _telemetryId: string;

	constructor(
		protected readonly _session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this._register(autorun(reader => {
			this._session.read(reader);
			this._updateTrigger();
		}));

		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerListeners.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._updateTrigger();
		}));
		this._watchProviders(this._sessionsProvidersService.getProviders());
		this._register(toDisposable(() => this._hidePicker()));
	}

	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();
		this._triggerGesture.clear();
		this._containerElement = container;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

		const trigger = this._createTrigger(slot);
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.ariaHasPopup = 'listbox';
		trigger.ariaExpanded = 'false';
		this._triggerElement = trigger;
		this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, () => ({ content: this._getTriggerTooltip(this._getActiveContext()?.tooltip ?? '') })));

		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		this._updateTrigger();
		return trigger;
	}

	focus(): void {
		this._triggerElement?.focus();
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
				continue;
			}
			this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._updateTrigger()));
		}
	}

	protected abstract _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean;
	protected abstract _getTriggerIcon(value: string | undefined): ThemeIcon | undefined;
	protected abstract _getActionItemIcon(item: IAgentHostSessionEnumPickerItem, currentValue: string): ThemeIcon | undefined;
	protected abstract _getTriggerAriaLabel(label: string): string;
	protected abstract _getWidgetAriaLabel(): string;
	protected _createTrigger(slot: HTMLElement): HTMLElement { return dom.append(slot, dom.$('a.action-label')); }
	protected _getTriggerTooltip(tooltip: string): string { return tooltip; }
	protected _getFooterActionItems(): readonly IActionListItem<IAgentHostSessionEnumPickerItem>[] { return []; }
	protected _handleFooterActionItem(_item: IAgentHostSessionEnumPickerItem): boolean { return false; }
	protected _onDidSelectValue(_previousValue: string, _selectedValue: string): void { }

	/**
	 * Optional list-widget options for the picker popup. Subclasses whose
	 * option descriptions are long (e.g. the Codex approvals presets) return a
	 * bounded `maxWidth` plus a `className`/`detailItemHeight` so the detail text
	 * wraps within a compact box instead of stretching the popup horizontally.
	 */
	protected _getListOptions(): IActionListOptions | undefined { return undefined; }

	/**
	 * `true` while the active session's provider is resolving its config.
	 * Subclasses gate picker-open paths on this; the desktop chip is
	 * rendered visually disabled in {@link _updateTrigger}.
	 */
	protected _isCurrentlyResolvingConfig(): boolean {
		const session = this._session.get();
		if (!session) {
			return false;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return false;
		}
		return provider.isSessionConfigResolving(session.sessionId).get();
	}

	showPicker(anchor: HTMLElement, onHide?: () => void): boolean {
		return this._showPicker(anchor, onHide);
	}

	private _getActiveContext(): { provider: IAgentHostSessionsProvider; sessionId: string; currentValue: string; items: readonly IAgentHostSessionEnumPickerItem[]; tooltip: string } | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const rawProvider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!rawProvider || !isAgentHostProvider(rawProvider)) {
			return undefined;
		}
		const config = rawProvider.getSessionConfig(session.sessionId);
		const schema = config?.schema.properties[this._property];
		if (!schema || !this._isWellKnownSchema(schema)) {
			return undefined;
		}
		const enumValues = (schema.enum ?? []).map(value => String(value));
		const enumLabels = schema.enumLabels ?? [];
		const enumDescriptions = schema.enumDescriptions ?? [];
		const items: IAgentHostSessionEnumPickerItem[] = enumValues.map((value, index) => ({
			value,
			label: enumLabels[index] ?? value,
			description: enumDescriptions[index],
		}));
		const rawCurrent = config?.values[this._property] ?? schema.default;
		const currentValue = typeof rawCurrent === 'string' && enumValues.includes(rawCurrent) ? rawCurrent : enumValues[0] ?? '';
		return { provider: rawProvider, sessionId: session.sessionId, currentValue, items, tooltip: schema.description ?? schema.title ?? '' };
	}

	protected _updateTrigger(): void {
		if (!this._triggerElement || !this._slotElement || !this._containerElement) {
			return;
		}

		const ctx = this._getActiveContext();
		// Also collapse the wrapping `.action-item` that
		// `MenuWorkbenchToolBar` created for this picker — hiding only
		// the inner slot leaves the wrapper occupying its `min-width`
		// floor and produces a visible empty gap in the chip row when
		// the active session's schema doesn't expose this property
		// (e.g. Claude agent host has no `mode`).
		if (!ctx) {
			this._slotElement.style.display = 'none';
			this._containerElement.style.display = 'none';
			return;
		}
		this._slotElement.style.display = '';
		this._containerElement.style.display = '';

		const item = ctx.items.find(i => i.value === ctx.currentValue);
		const label = item?.label ?? ctx.currentValue;
		const icon = this._getTriggerIcon(ctx.currentValue);

		// Reflect the resolving state without changing the chip's visual weight.
		const isResolving = ctx.provider.isSessionConfigResolving(ctx.sessionId).get();
		this._slotElement.classList.toggle('resolving', isResolving);
		this._triggerElement.setAttribute('aria-disabled', isResolving ? 'true' : 'false');
		this._renderTriggerLabel(this._triggerElement, label, icon);
		this._triggerElement.ariaLabel = this._getTriggerAriaLabel(label);
		if (this._triggerElement.role === 'group') {
			this._triggerGesture.clear();
		} else if (!this._triggerGesture.value) {
			this._triggerGesture.value = Gesture.addTarget(this._triggerElement);
		}
	}

	protected _renderTriggerLabel(trigger: HTMLElement, label: string, icon: ThemeIcon | undefined): void {
		dom.clearNode(trigger);
		if (icon) {
			dom.append(trigger, renderIcon(icon)).ariaHidden = 'true';
		}
		dom.append(trigger, dom.$('span.sessions-chat-dropdown-label', undefined, label));
	}

	protected _hidePicker(): void {
		if (this._pickerVisible) {
			this._actionWidgetService.hide();
		}
	}

	protected _showPicker(anchor = this._triggerElement, onHide?: () => void, listOptions = this._getListOptions()): boolean {
		if (!anchor || this._actionWidgetService.isVisible) {
			return false;
		}
		const ctx = this._getActiveContext();
		if (!ctx) {
			return false;
		}
		// Defensive against stale keyboard activation on a disabled chip.
		if (this._isCurrentlyResolvingConfig()) {
			return false;
		}

		const actionItems: IActionListItem<IAgentHostSessionEnumPickerItem>[] = ctx.items.map(item => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			detail: item.description,
			group: { title: '', icon: this._getActionItemIcon(item, ctx.currentValue) },
			item: { ...item, checked: item.value === ctx.currentValue },
		}));
		actionItems.push(...this._getFooterActionItems());
		const ariaTarget = this._triggerElement?.contains(anchor) ? anchor : this._triggerElement;

		const delegate: IActionListDelegate<IAgentHostSessionEnumPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				if (this._handleFooterActionItem(item)) {
					return;
				}
				if (!ctx.items.some(candidate => candidate.value === item.value)) {
					return;
				}
				const previousItem = ctx.items.find(i => i.value === ctx.currentValue);
				reportNewChatPickerClosed(this._telemetryService, {
					id: this._telemetryId,
					optionIdBefore: ctx.currentValue,
					optionIdAfter: item.value,
					optionLabelBefore: previousItem?.label ?? ctx.currentValue,
					optionLabelAfter: item.label,
					isPII: false,
				});
				ctx.provider.setSessionConfigValue(ctx.sessionId, this._property, item.value)
					.then(() => this._onDidSelectValue(ctx.currentValue, item.value))
					.catch(() => { /* best-effort */ });
			},
			onHide: () => {
				this._pickerVisible = false;
				ariaTarget?.setAttribute('aria-expanded', 'false');
				anchor.focus();
				onHide?.();
			},
		};

		this._pickerVisible = true;
		ariaTarget?.setAttribute('aria-expanded', 'true');
		this._actionWidgetService.show<IAgentHostSessionEnumPickerItem>(
			this._pickerId,
			false,
			actionItems,
			delegate,
			anchor,
			undefined,
			[],
			{
				getWidgetAriaLabel: () => this._getWidgetAriaLabel(),
			},
			listOptions,
		);
		return true;
	}
}

/**
 * Picker widget for the agent-host `mode` session-config property
 * (`interactive` / `plan` / `autopilot`).
 */
export class AgentHostModePicker extends AgentHostSessionEnumPicker {

	private readonly _splitTrigger = this._register(new MutableDisposable<IModePickerTrigger>());
	private readonly _permissionDelegate: AgentHostPermissionPickerDelegate;
	private readonly _permissionPicker: PermissionPicker;
	protected readonly _property = SessionConfigKey.Mode;
	protected readonly _pickerId = 'agentHostModePicker';
	protected readonly _telemetryId = 'NewChatAgentHostModePicker';

	constructor(
		session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IChatPetService protected readonly _chatPetService: IChatPetService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
	) {
		super(session, actionWidgetService, sessionsProvidersService, telemetryService, hoverService);
		this._permissionDelegate = this._register(instantiationService.createInstance(AgentHostPermissionPickerDelegate, session));
		this._permissionPicker = this._register(instantiationService.createInstance(PermissionPicker, this._permissionDelegate));
		this._register(autorun(reader => {
			session.read(reader);
			this._permissionDelegate.isModePickerCombined.read(reader);
			this._permissionDelegate.currentPermissionLevel.read(reader);
			this._permissionDelegate.isResolving.read(reader);
			this._permissionDelegate.managedSandboxEnforced.read(reader);
			this._permissionDelegate.managedSandboxAllowsBypass.read(reader);
			this._hidePicker();
			this._updateTrigger();
		}));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove) || e.affectsConfiguration(ChatConfiguration.AssistedPermissionsEnabled)) {
				this._hidePicker();
			}
			if (e.affectsConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled)
				|| this._permissionDelegate.sandboxToggleConfigurationKeys.some(key => e.affectsConfiguration(key))) {
				this._updateTrigger();
			}
		}));
	}

	protected override _renderTriggerLabel(trigger: HTMLElement, label: string, icon: ThemeIcon | undefined): void {
		const previous = this._splitTrigger.value;
		this._splitTrigger.clear();
		if (this._permissionDelegate.isModePickerCombined.get()) {
			this._splitTrigger.value = renderModePickerTrigger(trigger, { label, icon, labelClassName: 'sessions-chat-dropdown-label' }, this._permissionPicker.presentation, (anchor, openPermissions) => {
				this._showPicker(anchor, undefined, getModePermissionsPickerOptions(openPermissions));
			}, previous);
		} else {
			trigger.classList.remove('agent-host-mode-permissions-trigger');
			trigger.role = 'button';
			trigger.tabIndex = 0;
			trigger.ariaHasPopup = 'listbox';
			super._renderTriggerLabel(trigger, label, icon);
		}
	}

	protected override _createTrigger(slot: HTMLElement): HTMLElement {
		return dom.append(slot, dom.$('div.action-label'));
	}

	override focus(): void {
		(this._splitTrigger.value?.modeButton ?? this._triggerElement)?.focus();
	}

	protected override _showPicker(anchor = this._triggerElement, onHide?: () => void, listOptions = this._getListOptions()): boolean {
		return super._showPicker(anchor === this._triggerElement ? this._splitTrigger.value?.modeButton ?? anchor : anchor, onHide, listOptions);
	}

	protected override _getTriggerTooltip(tooltip: string): string {
		return this._permissionDelegate.isModePickerCombined.get() ? this._triggerElement?.ariaLabel ?? tooltip : tooltip;
	}

	protected override _getFooterActionItems(): readonly IActionListItem<IAgentHostSessionEnumPickerItem>[] {
		const session = this._session.get();
		return this._permissionDelegate.isModePickerCombined.get() ? [
			{ kind: ActionListItemKind.Separator },
			createModePickerPermissionsItem(this._permissionPicker.presentation, this._permissionPicker.getSubmenuItems(() => this._session.get() === session), async () => {
				this._hidePicker();
				await this._preferencesService.openSettings({ jsonEditor: false, query: AGENT_HOST_PERMISSIONS_SETTINGS_QUERY });
			}),
		] : [];
	}

	protected override _onDidSelectValue(previousValue: string, selectedValue: string): void {
		if (didExplicitlyEnableChatPetAutopilot(previousValue, selectedValue)) {
			this._chatPetService.unlockAchievement(ChatPetAchievementIds.AutopilotEnabled);
		}
	}

	protected override _getListOptions(): IActionListOptions {
		return this._permissionDelegate.isModePickerCombined.get() ? getModePermissionsPickerOptions() : { minWidth: 260 };
	}

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownModeSchema(schema);
	}

	protected _getTriggerIcon(value: string | undefined): ThemeIcon | undefined {
		return getAgentHostModeIcon(value);
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem): ThemeIcon | undefined {
		return getAgentHostModeIcon(item.value);
	}

	protected _getTriggerAriaLabel(label: string): string {
		return this._permissionDelegate.isModePickerCombined.get()
			? getModePickerAriaLabel(label, this._permissionPicker.presentation)
			: localize('agentHostModePicker.triggerAriaLabel', "Pick Agent Mode, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return this._permissionDelegate.isModePickerCombined.get()
			? localize('agentHostModePicker.combinedAriaLabel', "Mode and Permissions Picker")
			: localize('agentHostModePicker.ariaLabel', "Agent Mode Picker");
	}
}
