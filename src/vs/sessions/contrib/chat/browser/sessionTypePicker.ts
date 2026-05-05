/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ISession, ISessionType } from '../../../services/sessions/common/session.js';
import { Emitter } from '../../../../base/common/event.js';

export class SessionTypePicker extends Disposable {

	protected _sessionType: string | undefined;
	protected readonly _onDidSelectSessionType = this._register(new Emitter<string | undefined>());
	readonly onDidSelectSessionType = this._onDidSelectSessionType.event;

	protected _supportedSessionTypes: ISessionType[] = [];
	protected _allProviderSessionTypes: ISessionType[] = [];

	private readonly _renderDisposables = this._register(new DisposableStore());
	protected _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		const refresh = (session: ISession | undefined) => {
			if (session) {
				const provider = this.sessionsProvidersService.getProvider(session.providerId);
				this._supportedSessionTypes = provider?.getSessionTypes(session.resource) ?? [];
				const providerTypes = provider ? [...provider.sessionTypes] : [];
				const providerTypeIds = new Set(providerTypes.map(t => t.id));
				this._allProviderSessionTypes = [
					...providerTypes,
					...this._supportedSessionTypes.filter(t => !providerTypeIds.has(t.id)),
				];
				this._sessionType = session.sessionType;
			} else {
				this._supportedSessionTypes = [];
				this._allProviderSessionTypes = [];
				this._sessionType = undefined;
			}
			this._updateTriggerLabel();
		};

		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			refresh(session);
		}));
		// Re-read when a provider advertises/removes session types at runtime
		// (e.g. a remote agent host discovers a new agent).
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
			refresh(this.sessionsManagementService.activeSession.get());
		}));
	}

	get selectedType(): string | undefined {
		return this._sessionType;
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	/**
	 * Override hook for mobile subclasses. Receives the trigger element so
	 * the override can decide where to anchor (or that it doesn't need
	 * anchoring at all, e.g. for a bottom sheet).
	 */
	protected _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		if (this._allProviderSessionTypes.length <= 1) {
			return;
		}

		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}

		const supportedTypeIds = new Set(this._supportedSessionTypes.map(t => t.id));

		const items: IActionListItem<ISessionType>[] = this._allProviderSessionTypes.map(type => ({
			kind: ActionListItemKind.Action,
			label: type.label,
			group: { title: '', icon: type.icon },
			disabled: !supportedTypeIds.has(type.id),
			item: type.id === this._sessionType ? { ...type, checked: true } : type,
		}));

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<ISessionType> = {
			onSelect: (type) => {
				this.actionWidgetService.hide();
				if (type.id !== this._sessionType) {
					this._onDidSelectSessionType.fire(type.id);
				}
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<ISessionType>(
			'sessionTypePicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('sessionTypePicker.ariaLabel', "Session Type"),
			},
		);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		if (this._allProviderSessionTypes.length === 0) {
			this._triggerElement.classList.add('hidden');
			return;
		}

		this._triggerElement.classList.remove('hidden');
		const currentType = this._allProviderSessionTypes.find(t => t.id === this._sessionType);
		const modeIcon = currentType?.icon ?? Codicon.terminal;
		const modeLabel = currentType?.label ?? this._sessionType ?? '';

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;

		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('sessionTypePicker.triggerAriaLabel', "Pick Session Type, {0}", modeLabel);
	}
}
