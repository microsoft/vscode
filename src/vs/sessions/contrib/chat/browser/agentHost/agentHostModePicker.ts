/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { type IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { type ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { isWellKnownModeSchema } from './agentHostPermissionPickerDelegate.js';

interface IModePickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
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
 * Self-contained picker widget for the agent-host `mode` session-config
 * property (`interactive` / `plan` / `autopilot`).
 *
 * Mirrors the existing default-Copilot mode picker UX but is backed by the
 * active agent-host session's resolved config via
 * {@link IAgentHostSessionsProvider}. Renders nothing when the active
 * session does not advertise a {@link isWellKnownModeSchema well-known}
 * mode schema, so the generic per-property
 * {@link AgentHostSessionConfigPicker} can take over for non-conforming
 * agents.
 */
export class AgentHostModePicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string>());
	private _slotElement: HTMLElement | undefined;
	protected _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(autorun(reader => {
			this._sessionsManagementService.activeSession.read(reader);
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

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

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

	private _getActiveContext(): { provider: IAgentHostSessionsProvider; sessionId: string; currentValue: string; items: readonly IModePickerItem[] } | undefined {
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			return undefined;
		}
		const rawProvider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!rawProvider || !isAgentHostProvider(rawProvider)) {
			return undefined;
		}
		const config = rawProvider.getSessionConfig(session.sessionId);
		const schema = config?.schema.properties[SessionConfigKey.Mode];
		if (!schema || !isWellKnownModeSchema(schema)) {
			return undefined;
		}
		const enumValues = schema.enum ?? [];
		const enumLabels = schema.enumLabels ?? [];
		const enumDescriptions = schema.enumDescriptions ?? [];
		const items: IModePickerItem[] = enumValues.map((value, index) => ({
			value,
			label: enumLabels[index] ?? value,
			description: enumDescriptions[index],
		}));
		const rawCurrent = config?.values[SessionConfigKey.Mode] ?? schema.default;
		const currentValue = typeof rawCurrent === 'string' && enumValues.includes(rawCurrent) ? rawCurrent : enumValues[0] ?? '';
		return { provider: rawProvider, sessionId: session.sessionId, currentValue, items };
	}

	private _updateTrigger(): void {
		if (!this._triggerElement || !this._slotElement) {
			return;
		}

		const ctx = this._getActiveContext();
		if (!ctx) {
			this._slotElement.style.display = 'none';
			return;
		}
		this._slotElement.style.display = '';

		dom.clearNode(this._triggerElement);

		const item = ctx.items.find(i => i.value === ctx.currentValue);
		const label = item?.label ?? ctx.currentValue;

		const icon = getModeIcon(ctx.currentValue);
		if (icon) {
			dom.append(this._triggerElement, renderIcon(icon));
		}

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('agentHostModePicker.triggerAriaLabel', "Pick Agent Mode, {0}", label);
	}

	protected _showPicker(): void {
		if (!this._triggerElement || this._actionWidgetService.isVisible) {
			return;
		}
		const ctx = this._getActiveContext();
		if (!ctx) {
			return;
		}

		const triggerElement = this._triggerElement;
		const actionItems: IActionListItem<IModePickerItem>[] = ctx.items.map(item => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			description: item.description,
			group: { title: '', icon: item.value === ctx.currentValue ? Codicon.check : Codicon.blank },
			item,
		}));

		const delegate: IActionListDelegate<IModePickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				ctx.provider.setSessionConfigValue(ctx.sessionId, SessionConfigKey.Mode, item.value)
					.catch(() => { /* best-effort */ });
			},
			onHide: () => triggerElement.focus(),
		};

		this._actionWidgetService.show<IModePickerItem>(
			'agentHostModePicker',
			false,
			actionItems,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: i => i.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostModePicker.ariaLabel', "Agent Mode Picker"),
			},
		);
	}
}
