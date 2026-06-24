/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { type ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';

export interface IAgentHostSessionEnumPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
	readonly checked?: boolean;
}

function getModeIcon(value: string | undefined): ThemeIcon | undefined {
	switch (value) {
		case 'plan': return Codicon.checklist;
		case 'autopilot': return Codicon.rocket;
		case 'interactive': return Codicon.comment;
		default: return undefined;
	}
}

/**
 * Shared active-session picker for well-known string-enum session config.
 * Concrete subclasses provide the property key, schema guard, icon policy,
 * and labels while this class owns the provider subscription and picker UI.
 */
export abstract class AgentHostSessionEnumPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _containerElement: HTMLElement | undefined;
	private _slotElement: HTMLElement | undefined;
	protected _triggerElement: HTMLElement | undefined;

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
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();
		this._containerElement = container;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, () => ({ content: this._getActiveContext()?.tooltip ?? '' })));

		this._renderDisposables.add(Gesture.addTarget(trigger));
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
	protected _getFooterActionItems(): readonly IActionListItem<IAgentHostSessionEnumPickerItem>[] { return []; }
	protected _handleFooterActionItem(_item: IAgentHostSessionEnumPickerItem): boolean { return false; }

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

	private _updateTrigger(): void {
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

		dom.clearNode(this._triggerElement);

		const item = ctx.items.find(i => i.value === ctx.currentValue);
		const label = item?.label ?? ctx.currentValue;

		const icon = this._getTriggerIcon(ctx.currentValue);
		if (icon) {
			dom.append(this._triggerElement, renderIcon(icon));
		}

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		this._triggerElement.ariaLabel = this._getTriggerAriaLabel(label);

		// Reflect the resolving state. Schema is preserved across the
		// round-trip so the chip keeps its label; toggling `.disabled`
		// on the slot blocks pointer events (see chatWidget.css).
		const isResolving = ctx.provider.isSessionConfigResolving(ctx.sessionId).get();
		this._slotElement.classList.toggle('disabled', isResolving);
		this._triggerElement.setAttribute('aria-disabled', isResolving ? 'true' : 'false');
	}

	protected _showPicker(): void {
		if (!this._triggerElement || this._actionWidgetService.isVisible) {
			return;
		}
		const ctx = this._getActiveContext();
		if (!ctx) {
			return;
		}
		// Defensive against stale keyboard activation on a disabled chip.
		if (this._isCurrentlyResolvingConfig()) {
			return;
		}

		const triggerElement = this._triggerElement;
		const actionItems: IActionListItem<IAgentHostSessionEnumPickerItem>[] = ctx.items.map(item => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			detail: item.description,
			group: { title: '', icon: this._getActionItemIcon(item, ctx.currentValue) },
			item: { ...item, checked: item.value === ctx.currentValue },
		}));
		actionItems.push(...this._getFooterActionItems());

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
					.catch(() => { /* best-effort */ });
			},
			onHide: () => triggerElement.focus(),
		};

		this._actionWidgetService.show<IAgentHostSessionEnumPickerItem>(
			this._pickerId,
			false,
			actionItems,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: i => i.label ?? '',
				getWidgetAriaLabel: () => this._getWidgetAriaLabel(),
			},
		);
	}
}

/**
 * Picker widget for the agent-host `mode` session-config property
 * (`interactive` / `plan` / `autopilot`).
 */
export class AgentHostModePicker extends AgentHostSessionEnumPicker {

	protected readonly _property = SessionConfigKey.Mode;
	protected readonly _pickerId = 'agentHostModePicker';
	protected readonly _telemetryId = 'NewChatAgentHostModePicker';

	protected _isWellKnownSchema(schema: SessionConfigPropertySchema): boolean {
		return isWellKnownModeSchema(schema);
	}

	protected _getTriggerIcon(value: string | undefined): ThemeIcon | undefined {
		return getModeIcon(value);
	}

	protected _getActionItemIcon(item: IAgentHostSessionEnumPickerItem): ThemeIcon | undefined {
		return getModeIcon(item.value);
	}

	protected _getTriggerAriaLabel(label: string): string {
		return localize('agentHostModePicker.triggerAriaLabel', "Pick Agent Mode, {0}", label);
	}

	protected _getWidgetAriaLabel(): string {
		return localize('agentHostModePicker.ariaLabel', "Agent Mode Picker");
	}
}
