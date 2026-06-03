/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import * as touch from '../../../../base/browser/touch.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';

/**
 * The kinds of "thing" the new-chat composer can produce when the user
 * activates the send button.
 */
export const enum NewSessionKind {
	Session = 'session',
	Automation = 'automation',
}

/**
 * Inline dropdown that lives next to the workspace/session-type pickers in
 * the new-chat composer header ("New <kind> in <workspace> with <type>").
 * Toggling between `Session` and `Automation` switches what the composer's
 * send button does: send a chat (default) versus register the prompt as a
 * new scheduled automation.
 *
 * Visually mirrors the workspace and session-type pickers — a small
 * inline anchor styled as `.action-label` with a chevron — so the row
 * reads as one continuous sentence.
 */
export class NewSessionKindPicker extends Disposable {

	private readonly _onDidChangeKind = this._register(new Emitter<NewSessionKind>());
	readonly onDidChangeKind: Event<NewSessionKind> = this._onDidChangeKind.event;

	private _kind: NewSessionKind = NewSessionKind.Session;
	private _labelText: HTMLElement | undefined;
	private _trigger: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();
	}

	get kind(): NewSessionKind { return this._kind; }

	setKind(kind: NewSessionKind): void {
		if (kind === this._kind) {
			return;
		}
		this._kind = kind;
		this._updateLabel();
		this._onDidChangeKind.fire(kind);
	}

	/**
	 * Renders the inline picker into `container`. Returns the picker's
	 * slot element so callers can lay it out alongside sibling pickers.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-kind-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'menu');
		trigger.setAttribute('aria-expanded', 'false');
		this._trigger = trigger;

		this._labelText = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		dom.append(trigger, dom.$(ThemeIcon.asCSSSelector(Codicon.chevronDown) + '.sessions-chat-dropdown-chevron'));
		this._updateLabel();

		this._renderDisposables.add(touch.Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, touch.EventType.Tap] as const) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showMenu(e);
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showMenu(e);
			}
		}));

		return slot;
	}

	private _updateLabel(): void {
		if (!this._labelText || !this._trigger) {
			return;
		}
		this._labelText.textContent = this._kind === NewSessionKind.Automation
			? localize('newSessionKind.automation', "automation")
			: localize('newSessionKind.session', "session");
		this._trigger.setAttribute('aria-label', this._kind === NewSessionKind.Automation
			? localize('newSessionKind.automation.aria', "Kind: Automation. Click to change.")
			: localize('newSessionKind.session.aria', "Kind: Session. Click to change."));
	}

	private _showMenu(e: UIEvent): void {
		if (!this._trigger) {
			return;
		}
		const trigger = this._trigger;
		const anchor = dom.isMouseEvent(e)
			? new StandardMouseEvent(dom.getWindow(trigger), e)
			: trigger;

		const actions: IAction[] = [
			new Action(
				'newSessionKind.session',
				localize('newSessionKind.action.session', "Session"),
				this._kind === NewSessionKind.Session ? 'codicon codicon-check' : undefined,
				true,
				async () => this.setKind(NewSessionKind.Session),
			),
			new Action(
				'newSessionKind.automation',
				localize('newSessionKind.action.automation', "Automation"),
				this._kind === NewSessionKind.Automation ? 'codicon codicon-check' : undefined,
				true,
				async () => this.setKind(NewSessionKind.Automation),
			),
		];

		trigger.setAttribute('aria-expanded', 'true');
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			domForShadowRoot: trigger,
			onHide: () => trigger.setAttribute('aria-expanded', 'false'),
		});
	}
}
