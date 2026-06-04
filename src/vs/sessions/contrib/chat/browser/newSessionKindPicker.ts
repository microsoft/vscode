/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';

/**
 * The kinds of "thing" the new-chat composer can produce when the user
 * activates the send button.
 */
export const enum NewSessionKind {
	Session = 'session',
	Automation = 'automation',
}

interface IKindPickerItem {
	readonly kind: NewSessionKind;
	readonly label: string;
	readonly checked?: boolean;
}

interface IKindOption {
	readonly kind: NewSessionKind;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
}

const KIND_OPTIONS: readonly IKindOption[] = [
	{
		kind: NewSessionKind.Session,
		label: localize('newSessionKind.action.session', "Session"),
		description: localize('newSessionKind.session.desc', "Start a new chat session."),
		icon: Codicon.commentDiscussion,
	},
	{
		kind: NewSessionKind.Automation,
		label: localize('newSessionKind.action.automation', "Automation"),
		description: localize('newSessionKind.automation.desc', "Schedule the prompt to run on a cadence."),
		icon: Codicon.watch,
	},
];

function getKindOption(kind: NewSessionKind): IKindOption {
	return KIND_OPTIONS.find(o => o.kind === kind) ?? KIND_OPTIONS[0];
}

/**
 * Inline dropdown that lives next to the workspace/session-type pickers in
 * the new-chat composer header ("New <kind> in <workspace> with <type>").
 * Toggling between `Session` and `Automation` switches what the composer's
 * send button does: send a chat (default) versus register the prompt as a
 * new scheduled automation.
 *
 * Visually mirrors the workspace and session-type pickers — a small
 * inline anchor styled as `.action-label` with an icon, label, and
 * chevron — and uses the same {@link IActionWidgetService} popup so the
 * dropdown sits above adjacent inputs and shares the platform's styling,
 * keyboard handling, and focus tracking.
 */
export class NewSessionKindPicker extends Disposable {

	private readonly _onDidChangeKind = this._register(new Emitter<NewSessionKind>());
	readonly onDidChangeKind: Event<NewSessionKind> = this._onDidChangeKind.event;

	private _kind: NewSessionKind = NewSessionKind.Session;
	private _triggerElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	get kind(): NewSessionKind { return this._kind; }

	private _isAutomationsEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private _availableKindOptions(): readonly IKindOption[] {
		return this._isAutomationsEnabled()
			? KIND_OPTIONS
			: KIND_OPTIONS.filter(o => o.kind !== NewSessionKind.Automation);
	}

	setKind(kind: NewSessionKind): void {
		if (kind === this._kind) {
			return;
		}
		this._kind = kind;
		this._updateTriggerLabel();
		this._onDidChangeKind.fire(kind);
	}

	/**
	 * Renders the inline picker into `container`. Returns the picker's
	 * slot element so callers can lay it out alongside sibling pickers.
	 * Subscribes to the chat.automations.enabled setting so the trigger
	 * collapses to a static label when only one kind option is available.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-kind-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				if (!this._isInteractive()) {
					return;
				}
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (!this._isInteractive()) {
				return;
			}
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		// Re-render the trigger when the automations setting flips so the
		// dropdown affordance and "automation" option appear/disappear in
		// real time without re-mounting the composer.
		this._renderDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
				if (!this._availableKindOptions().some(o => o.kind === this._kind)) {
					this.setKind(NewSessionKind.Session);
				} else {
					this._updateTriggerLabel();
				}
			}
		}));

		return slot;
	}

	private _isInteractive(): boolean {
		return this._availableKindOptions().length > 1;
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const option = getKindOption(this._kind);
		const interactive = this._isInteractive();

		dom.append(this._triggerElement, renderIcon(option.icon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = option.label.toLowerCase();

		if (interactive) {
			const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
			chevron.classList.add('sessions-chat-dropdown-chevron');
			this._triggerElement.role = 'button';
			this._triggerElement.setAttribute('aria-haspopup', 'listbox');
			this._triggerElement.setAttribute('aria-expanded', 'false');
			this._triggerElement.ariaLabel = localize('newSessionKind.triggerAriaLabel', "Kind: {0}. Click to change.", option.label);
			this._triggerElement.classList.remove('disabled');
		} else {
			this._triggerElement.removeAttribute('role');
			this._triggerElement.removeAttribute('aria-haspopup');
			this._triggerElement.removeAttribute('aria-expanded');
			this._triggerElement.ariaLabel = option.label;
			this._triggerElement.classList.add('disabled');
		}
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}
		const triggerElement = this._triggerElement;

		const options = this._availableKindOptions();
		// If automations are disabled and the current kind is Automation,
		// fall back to Session so the trigger label and downstream behavior
		// match the available options.
		if (!options.some(o => o.kind === this._kind)) {
			this.setKind(NewSessionKind.Session);
		}

		const items: IActionListItem<IKindPickerItem>[] = options.map(option => ({
			kind: ActionListItemKind.Action,
			label: option.label,
			description: option.description,
			group: { title: '', icon: option.icon },
			item: {
				kind: option.kind,
				label: option.label,
				checked: this._kind === option.kind,
			},
		}));

		const delegate: IActionListDelegate<IKindPickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				this.setKind(item.kind);
			},
			onHide: () => {
				triggerElement.setAttribute('aria-expanded', 'false');
				triggerElement.focus();
			},
		};

		triggerElement.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show<IKindPickerItem>(
			'newSessionKindPicker',
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('newSessionKindPicker.ariaLabel', "Kind"),
			},
		);
	}
}
