/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ISessionType } from '../../sessions/browser/sessionsProvider.js';

export class SessionTypePicker extends Disposable {

	private _sessionType: string | undefined;
	private _sessionTypes: ISessionType[] = [];

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			if (session) {
				this._sessionTypes = this.sessionsManagementService.getSessionTypes(session);
				this._sessionType = session.sessionType;
			} else {
				this._sessionTypes = [];
				this._sessionType = undefined;
			}
			this._updateTriggerLabel();
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		if (this._sessionTypes.length <= 1) {
			return;
		}

		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}

		const items: IActionListItem<ISessionType>[] = this._sessionTypes.map(type => ({
			kind: ActionListItemKind.Action,
			label: type.label,
			group: { title: '', icon: type.icon },
			item: type.id === this._sessionType ? { ...type, checked: true } : type,
		}));

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<ISessionType> = {
			onSelect: (type) => {
				this.actionWidgetService.hide();
				this.sessionsManagementService.setSessionType(session, type);
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

		const currentType = this._sessionTypes.find(t => t.id === this._sessionType);
		const modeIcon = currentType?.icon ?? Codicon.terminal;
		const modeLabel = currentType?.label ?? this._sessionType ?? '';

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;

		const hasMultipleTypes = this._sessionTypes.length > 1;
		this._slotElement?.classList.toggle('disabled', !hasMultipleTypes);
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
	}
}
