/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatScheduledRequests.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatScheduledRequest, IChatScheduledRequestEditing } from '../../../common/model/chatViewModel.js';

const LIST_WIDTH = 440;
const CLOCK_GAP = 4;

function firstLine(text: string): string {
	return text.trim().split(/\r?\n/)[0] ?? '';
}

function summary(requests: readonly IChatScheduledRequest[]): string {
	const next = requests[0]?.description ?? '';
	return requests.length === 1
		? localize('chatScheduledRequests.summaryOne', "1 scheduled message, {0}", next)
		: localize('chatScheduledRequests.summary', "{0} scheduled messages, next {1}", requests.length, next);
}

/** Runs a button's command on click, Enter and Space, the way action items do. */
function onActivate(element: HTMLElement, store: DisposableStore, run: (e: UIEvent) => void): void {
	store.add(dom.addDisposableListener(element, dom.EventType.CLICK, e => {
		dom.EventHelper.stop(e, true);
		run(e);
	}));
	store.add(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, e => {
		const event = new StandardKeyboardEvent(e);
		if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
			dom.EventHelper.stop(e, true);
			run(e);
		}
	}));
}

/**
 * A clock and the count of the chat's scheduled messages, beside the context window usage, shown only while there
 * are any. It lists them above the input: choose one to edit it there, or send it now, reschedule it or cancel it from
 * its row.
 */
export class ChatScheduledRequestsWidget extends Disposable {

	readonly domNode: HTMLElement;
	private readonly countNode: HTMLElement;
	private requests: readonly IChatScheduledRequest[] = [];
	private listVisible = false;
	/** A press on the clock while its list is open only closes the list; the click that follows must not reopen it. */
	private closedByPress = false;
	private readonly listStore = this._register(new MutableDisposable<DisposableStore>());

	/** Fires when the clock shows, hides, or its count gains or loses a digit. */
	private readonly _onDidChangeSize = this._register(new Emitter<void>());
	readonly onDidChangeSize: Event<void> = this._onDidChangeSize.event;

	constructor(
		private readonly getInputBox: () => HTMLElement | undefined,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.domNode = dom.$('.chat-scheduled-requests-widget', { role: 'button', tabindex: '0', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
		dom.append(this.domNode, dom.$(`span.chat-scheduled-requests-icon${ThemeIcon.asCSSSelector(Codicon.clock)}`, { 'aria-hidden': 'true' }));
		this.countNode = dom.append(this.domNode, dom.$('span.chat-scheduled-requests-count', { 'aria-hidden': 'true' }));
		dom.hide(this.domNode);

		const store = this._register(new DisposableStore());
		onActivate(this.domNode, store, () => {
			if (this.closedByPress) {
				this.closedByPress = false;
				return;
			}
			if (this.listVisible) {
				this.actionWidgetService.hide(true);
			} else {
				this.showList();
			}
		});
		this._register(dom.addDisposableListener(dom.getWindow(this.domNode), dom.EventType.POINTER_DOWN, e => {
			this.closedByPress = this.listVisible && dom.isHTMLElement(e.target) && this.domNode.contains(e.target);
		}, true));
		this._register(hoverService.setupDelayedHover(this.domNode, () => ({
			content: summary(this.requests),
			style: HoverStyle.Pointer,
		})));
	}

	get visible(): boolean {
		return this.requests.length > 0;
	}

	/** The width the clock takes beside the context window usage, with the gap between them. */
	get width(): number {
		return this.visible ? dom.getTotalWidth(this.domNode) + CLOCK_GAP : 0;
	}

	update(requests: readonly IChatScheduledRequest[]): void {
		const previousCount = this.requests.length;
		this.requests = requests;
		this.countNode.textContent = String(requests.length);
		this.domNode.setAttribute('aria-label', this.visible ? summary(requests) : '');
		dom.setVisibility(this.visible, this.domNode);
		if (this.listVisible) {
			if (this.visible) {
				this.actionWidgetService.updateItems(this.listItems(), undefined, { preserveScrollPosition: true });
			} else {
				this.actionWidgetService.hide(true);
			}
		}
		if (String(previousCount).length !== String(requests.length).length || !previousCount !== !requests.length) {
			this._onDidChangeSize.fire();
		}
	}

	private showList(): void {
		if (!this.visible) {
			return;
		}
		// Above the input box and flush with its right edge, so the list never covers what is being typed.
		const clock = this.domNode.getBoundingClientRect();
		const inputBox = this.getInputBox()?.getBoundingClientRect();
		const top = Math.min(clock.top, inputBox?.top ?? clock.top);
		const right = Math.max(clock.right, inputBox?.right ?? clock.right);
		const width = Math.min(LIST_WIDTH, right);
		this.listStore.value = new DisposableStore();
		this.listVisible = true;
		this.domNode.setAttribute('aria-expanded', 'true');
		this.domNode.classList.add('open');
		this.actionWidgetService.show<IChatScheduledRequest>(
			'chatScheduledRequests',
			false,
			this.listItems(),
			{
				onSelect: request => {
					this.actionWidgetService.hide();
					if (request.editAction?.enabled) {
						this.run(request.editAction);
					}
				},
				onHide: didCancel => {
					this.listVisible = false;
					this.listStore.clear();
					this.domNode.setAttribute('aria-expanded', 'false');
					this.domNode.classList.remove('open');
					if (didCancel && this.domNode.isConnected && this.visible) {
						this.domNode.focus();
					}
				},
			},
			{ x: right - width, y: top, width, height: clock.bottom - top },
			this.layoutService.getContainer(dom.getWindow(this.domNode)),
			[],
			{
				getAriaLabel: item => item.item
					? localize('chatScheduledRequests.itemAria', "{0}, {1}", firstLine(item.item.text), item.item.editing ? localize('chatScheduledRequests.editing', "Editing") : item.item.description)
					: item.label ?? null,
				getWidgetAriaLabel: () => localize('chatScheduledRequests.listAria', "Scheduled Messages"),
			},
			{ minWidth: width, maxWidth: width, preferredAnchorPosition: AnchorPosition.ABOVE },
		);
	}

	private listItems(): IActionListItem<IChatScheduledRequest>[] {
		const title = localize('chatScheduledRequests.title', "Scheduled");
		const items: IActionListItem<IChatScheduledRequest>[] = [{ kind: ActionListItemKind.Header, label: title, group: { title } }];
		for (const request of this.requests) {
			items.push({
				kind: ActionListItemKind.Action,
				item: request,
				label: firstLine(request.text) || localize('chatScheduledRequests.attachmentsOnly', "Attachments"),
				// The message being edited is already open in the input below.
				description: request.editing ? localize('chatScheduledRequests.editing', "Editing") : request.description,
				group: { title: '', icon: Codicon.clock },
				hideIcon: false,
				disabled: !!request.editing,
				toolbarActions: request.editing ? [] : request.actions.filter(action => action !== request.editAction).map(action => toAction({
					id: action.id,
					label: action.label,
					tooltip: action.tooltip,
					class: action.class,
					enabled: action.enabled,
					run: () => {
						this.actionWidgetService.hide();
						this.run(action);
					},
				})),
			});
		}
		return items;
	}

	/** Runs one of a message's actions; a picker it opens (Reschedule...) comes up from the clock. */
	private run(action: IAction): void {
		Promise.resolve(action.run(this.domNode)).catch(error => {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		});
	}

	override dispose(): void {
		if (this.listVisible) {
			this.actionWidgetService.hide(true);
		}
		super.dispose();
	}
}

/**
 * Cancel and a Save split button, in place of Send while a scheduled message is open in the input. Save says when the
 * message will send; its chevron changes that time.
 */
export class ChatScheduledRequestEditToolbar extends Disposable {

	readonly element: HTMLElement;
	private readonly saveLabel: HTMLElement;
	private readonly changeTime: HTMLElement;
	private editing: IChatScheduledRequestEditing | undefined;
	private readonly editingStore = this._register(new DisposableStore());

	constructor(
		container: HTMLElement,
		private readonly save: () => Promise<unknown>,
		private readonly focusInput: () => void,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = dom.append(container, dom.$('.chat-scheduled-edit-toolbar', { role: 'toolbar', 'aria-label': localize('chatScheduledEdit.toolbar', "Scheduled Message") }));
		const cancel = dom.append(this.element, dom.$('a.chat-scheduled-edit-cancel', { role: 'button', tabindex: '0' }, localize('chatScheduledEdit.cancel', "Cancel")));
		const split = dom.append(this.element, dom.$('.chat-scheduled-edit-save'));
		this.saveLabel = dom.append(split, dom.$('a.chat-scheduled-edit-save-label', { role: 'button', tabindex: '0' }));
		dom.append(split, dom.$('span.chat-scheduled-edit-save-separator', { 'aria-hidden': 'true' }));
		this.changeTime = dom.append(split, dom.$(`a.chat-scheduled-edit-change-time${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`, { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' }));

		const store = this._register(new DisposableStore());
		onActivate(cancel, store, () => this.editing?.cancel());
		onActivate(this.saveLabel, store, () => this.run(this.save()));
		// Typing continues in the message once the time is chosen.
		onActivate(this.changeTime, store, () => this.run(Promise.resolve(this.editing?.selectTime.run(this.changeTime)).then(() => this.focusInput())));
	}

	update(editing: IChatScheduledRequestEditing | undefined): void {
		if (editing !== this.editing) {
			this.editing = editing;
			this.editingStore.clear();
			if (editing) {
				this.editingStore.add(autorun(reader => this.element.classList.toggle('saving', !!editing.isSaving?.read(reader))));
			}
		}
		if (!editing) {
			return;
		}
		const saveFor = localize('chatScheduledEdit.saveFor', "Save for {0}", editing.description);
		this.saveLabel.textContent = saveFor;
		this.saveLabel.setAttribute('aria-label', saveFor);
		this.changeTime.setAttribute('aria-label', localize('chatScheduledEdit.changeTime', "Change Send Time, {0}", editing.description));
	}

	private run(promise: Promise<unknown> | unknown): void {
		Promise.resolve(promise).catch(error => {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		});
	}
}
