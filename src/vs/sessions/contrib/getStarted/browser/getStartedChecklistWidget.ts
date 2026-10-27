/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/getStartedChecklist.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, descriptionForeground, toolbarHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { GetStartedItemId, IGetStartedItemState } from '../common/getStartedChecklist.js';

export const SessionsGetStartedFocused = new RawContextKey<boolean>('sessionsGetStartedFocused', false, localize('sessionsGetStartedFocused', "Whether the Get Started checklist in the Sessions view has keyboard focus."));

/** State and actions the checklist card renders, so fixtures can drive it with plain data. */
export interface IGetStartedChecklistViewModel {
	readonly items: IObservable<readonly IGetStartedItemState[]>;
	readonly collapsed: IObservable<boolean>;
	/** Shows the all-done confirmation instead of the items. */
	readonly finished: IObservable<boolean>;
	setCollapsed(collapsed: boolean): void;
	/** Runs the item's Show Me tour, and resolves when it ends. */
	showMe(item: GetStartedItemId): Promise<void>;
	hide(): void;
	dismiss(): void;
}

export interface IGetStartedChecklistWidgetOptions {
	readonly focusSessionsList: () => void;
	/** Fixtures pass `false` to render without completion animations. */
	readonly animate?: boolean;
}

export interface IGetStartedItemCopy {
	readonly title: string;
	readonly description: string;
}

export function getGetStartedItemCopy(item: GetStartedItemId): IGetStartedItemCopy {
	switch (item) {
		case GetStartedItemId.StartSession:
			return {
				title: localize('getStarted.item.startSession', "Start a session"),
				description: localize('getStarted.item.startSession.description', "Like Chat in the editor, but the agent works on its own while you do something else."),
			};
		case GetStartedItemId.RunInParallel:
			return {
				title: localize('getStarted.item.runInParallel', "Run two agents at once"),
				description: localize('getStarted.item.runInParallel.description', "Agents keep working while you start the next task."),
			};
		case GetStartedItemId.SecondProject:
			return {
				title: localize('getStarted.item.secondProject', "Work in a second project"),
				description: localize('getStarted.item.secondProject.description', "One window holds the sessions of all your projects, instead of one window per folder."),
			};
		case GetStartedItemId.KeepChanges:
			return {
				title: localize('getStarted.item.keepChanges', "Review and keep changes"),
				description: localize('getStarted.item.keepChanges.description', "See what an agent changed, then merge, commit or open a pull request."),
			};
		case GetStartedItemId.Automation:
			return {
				title: localize('getStarted.item.automation', "Set up an automation"),
				description: localize('getStarted.item.automation.description', "Run an agent on a schedule, like a daily look at new issues."),
			};
	}
}

/** How long a just-completed item keeps its quiet highlight. */
const JUST_COMPLETED_MS = 1_600;

let lastFocusedWidget: GetStartedChecklistWidget | undefined;

/** The checklist widget that last had focus, for the accessibility help. */
export function getFocusedGetStartedChecklistWidget(): GetStartedChecklistWidget | undefined {
	return lastFocusedWidget;
}

/** A compact, keyboard-accessible "Get started" checklist card. */
export class GetStartedChecklistWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _toggle: HTMLElement;
	private readonly _chevron: HTMLElement;
	private readonly _progress: HTMLElement;
	private readonly _body: HTMLElement;
	private readonly _render = this._register(new MutableDisposable<DisposableStore>());
	private readonly _justCompleted = new Set<GetStartedItemId>();
	private readonly _justCompletedTimers = this._register(new DisposableStore());

	/**
	 * The item the user expanded to show its explanation and Show Me action, `null` when the user
	 * collapsed it, or `undefined` to expand the next open item.
	 */
	private readonly _activeItem = observableValue<GetStartedItemId | null | undefined>(this, undefined);
	/** Roving keyboard focus within the item list. */
	private _focusedItemIndex = 0;
	private _previousDone: ReadonlySet<GetStartedItemId> | undefined;
	private readonly _rerender = observableSignal(this);
	/** The rendered item headers and Show Me action, where focus returns after a tour. */
	private _itemHeaders: readonly HTMLElement[] = [];
	private _showMeElement: HTMLElement | undefined;

	constructor(
		private readonly _viewModel: IGetStartedChecklistViewModel,
		private readonly _options: IGetStartedChecklistWidgetOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this.domNode = DOM.$('.agent-sessions-get-started', { role: 'region' });
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		SessionsGetStartedFocused.bindTo(scopedContextKeyService).set(true);

		const header = DOM.append(this.domNode, DOM.$('.get-started-header'));
		const bodyId = `get-started-body-${generateUuid()}`;
		this._toggle = DOM.append(header, DOM.$('.get-started-toggle', { role: 'button', tabIndex: 0, 'aria-controls': bodyId }));
		this._chevron = DOM.append(this._toggle, DOM.$('span.get-started-chevron', { 'aria-hidden': 'true' }));
		DOM.append(this._toggle, DOM.$('span.get-started-title')).textContent = localize('getStarted.title', "Get started");
		this._progress = DOM.append(this._toggle, DOM.$('span.get-started-progress'));
		this._register(DOM.addDisposableListener(this._toggle, DOM.EventType.CLICK, () => this._viewModel.setCollapsed(!this._viewModel.collapsed.get())));
		this._register(DOM.addDisposableListener(this._toggle, DOM.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				this._viewModel.setCollapsed(!this._viewModel.collapsed.get());
			}
		}));
		if (this._configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsGetStarted)) {
			const keybinding = this._keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			if (keybinding) {
				this._toggle.setAttribute('aria-description', localize('getStarted.helpHint', "Press {0} for accessibility help.", keybinding));
			}
		}

		const actions = this._register(new ActionBar(DOM.append(header, DOM.$('.get-started-actions'))));
		const hideLabel = localize('getStarted.hide', "Hide");
		actions.push(this._register(new Action('sessions.getStarted.hide', hideLabel, ThemeIcon.asClassName(Codicon.close), true, () => this._hide())), { icon: true, label: false });

		this._body = DOM.append(this.domNode, DOM.$('.get-started-body', { id: bodyId }));

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				DOM.EventHelper.stop(event, true);
				this._options.focusSessionsList();
			}
		}));
		const focusTracker = this._register(DOM.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => { lastFocusedWidget = this; }));
		this._register(toDisposable(() => {
			if (lastFocusedWidget === this) {
				lastFocusedWidget = undefined;
			}
		}));

		this._register(autorun(reader => {
			const items = this._viewModel.items.read(reader);
			const collapsed = this._viewModel.collapsed.read(reader);
			const finished = this._viewModel.finished.read(reader);
			const activeItem = this._activeItem.read(reader);
			this._rerender.read(reader);
			this._renderState(items, collapsed, finished, activeItem);
		}));
	}

	focus(): void {
		this._toggle.focus();
	}

	/** Creates the accessibility help for the checklist, which returns focus to where it was. */
	createAccessibilityHelpProvider(): AccessibleContentProvider {
		const previousFocus = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsGetStarted,
			{ type: AccessibleViewType.Help },
			() => this._getAccessibilityHelpContent(),
			() => {
				if (DOM.isHTMLElement(previousFocus) && previousFocus.isConnected && this.domNode.contains(previousFocus)) {
					previousFocus.focus();
				} else {
					this.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionsGetStarted,
		);
	}

	private _getAccessibilityHelpContent(): string {
		const items = this._viewModel.items.get();
		const done = items.filter(item => item.done).length;
		return [
			localize('getStarted.help.overview', "You are in the Get Started checklist in the Sessions view. It shows what the Agents window can do and ticks off each item when you do it. {0} of {1} items are done.", done, items.length),
			...items.map(item => {
				const copy = getGetStartedItemCopy(item.id);
				return item.done
					? localize('getStarted.help.itemDone', "- {0}, done: {1}", copy.title, copy.description)
					: localize('getStarted.help.itemTodo', "- {0}, not done: {1}", copy.title, copy.description);
			}),
			localize('getStarted.help.toggle', "Press Enter or Space on the Get started heading to collapse or expand the checklist."),
			localize('getStarted.help.items', "In the list, use Up Arrow and Down Arrow to move between items, and Enter or Space to show or hide an item's explanation. Then press Tab to reach Show Me, which walks you through the item step by step."),
			localize('getStarted.help.hide', "Hide removes the checklist until the Agents window starts again. Don't Show Again removes it for good. Run the Show Getting Started Checklist command to bring it back."),
			localize('getStarted.help.escape', "Press Escape to return to the sessions list."),
		].join('\n');
	}

	private _hide(): void {
		this._options.focusSessionsList();
		this._viewModel.hide();
	}

	private _renderState(items: readonly IGetStartedItemState[], collapsed: boolean, finished: boolean, selectedItem: GetStartedItemId | null | undefined): void {
		let activeItem = selectedItem;
		const doneCount = items.filter(item => item.done).length;
		const done = new Set(items.filter(item => item.done).map(item => item.id));
		const newlyDone = this._previousDone ? items.filter(item => item.done && !this._previousDone!.has(item.id)) : [];
		this._previousDone = done;
		for (const item of newlyDone) {
			this._markJustCompleted(item.id);
		}
		if (activeItem && newlyDone.some(item => item.id === activeItem)) {
			// Move on to the next open item once the selected one is done.
			activeItem = undefined;
			this._activeItem.set(undefined, undefined);
		}

		const restoreFocus = DOM.isAncestorOfActiveElement(this._body);
		const progressLabel = localize('getStarted.progress', "{0} of {1}", doneCount, items.length);
		this._progress.textContent = progressLabel;
		this.domNode.classList.toggle('collapsed', collapsed);
		this.domNode.classList.toggle('finished', finished);
		this.domNode.setAttribute('aria-label', localize('getStarted.regionLabel', "Get started, {0} of {1} done", doneCount, items.length));
		this._toggle.setAttribute('aria-expanded', String(!collapsed));
		this._toggle.setAttribute('aria-label', localize('getStarted.toggleLabel', "Get started, {0} of {1} done", doneCount, items.length));
		DOM.reset(this._chevron, renderIcon(collapsed ? Codicon.chevronRightCompact : Codicon.chevronDownCompact));

		const store = new DisposableStore();
		this._render.value = store;
		DOM.clearNode(this._body);
		this._itemHeaders = [];
		this._showMeElement = undefined;

		if (finished) {
			const message = DOM.append(this._body, DOM.$('.get-started-finished'));
			DOM.append(message, DOM.$('span.get-started-finished-icon', { 'aria-hidden': 'true' }, renderIcon(Codicon.passFilled)));
			DOM.append(message, DOM.$('span')).textContent = localize('getStarted.finished', "You're all set. You've tried everything the Agents window can do.");
		} else if (!collapsed) {
			this._renderItems(store, items, activeItem === null ? undefined : activeItem ?? items.find(item => !item.done)?.id, restoreFocus);
		}

		if (newlyDone.length > 0) {
			const last = newlyDone[newlyDone.length - 1];
			status(finished
				? localize('getStarted.announceFinished', "Get started checklist complete.")
				: localize('getStarted.announceDone', "{0} done. {1} of {2} completed.", getGetStartedItemCopy(last.id).title, doneCount, items.length));
		}
		this._onDidChangeHeight.fire();
	}

	private _renderItems(store: DisposableStore, items: readonly IGetStartedItemState[], activeItem: GetStartedItemId | undefined, restoreFocus: boolean): void {
		const list = DOM.append(this._body, DOM.$('ul.get-started-items', { role: 'list', 'aria-label': localize('getStarted.listLabel', "Get started steps") }));
		const headers: HTMLElement[] = [];
		// Tab enters the list at the expanded item, unless the user is moving through it.
		const activeIndex = items.findIndex(item => item.id === activeItem);
		this._focusedItemIndex = !restoreFocus && activeIndex >= 0 ? activeIndex : Math.min(this._focusedItemIndex, items.length - 1);

		items.forEach((item, index) => {
			const copy = getGetStartedItemCopy(item.id);
			const active = item.id === activeItem;
			const row = DOM.append(list, DOM.$('li.get-started-item', { role: 'listitem', 'aria-setsize': String(items.length), 'aria-posinset': String(index + 1) }));
			row.classList.toggle('done', item.done);
			row.classList.toggle('active', active);
			row.classList.toggle('just-completed', this._justCompleted.has(item.id));

			const detailsId = `${this._body.id}-${item.id}`;
			const header = DOM.append(row, DOM.$('.get-started-item-header', {
				role: 'button',
				tabIndex: index === this._focusedItemIndex ? 0 : -1,
				'aria-expanded': String(active),
				'aria-controls': active ? detailsId : undefined,
				'aria-label': item.done
					? localize('getStarted.itemDoneLabel', "{0}, done", copy.title)
					: localize('getStarted.itemTodoLabel', "{0}, not done", copy.title),
			}));
			headers.push(header);
			DOM.append(header, DOM.$('span.get-started-item-status', { 'aria-hidden': 'true' }, renderIcon(item.done ? Codicon.passFilled : Codicon.circleLargeOutline)));
			const title = DOM.append(header, DOM.$('span.get-started-item-title'));
			title.textContent = copy.title;
			store.add(this._hoverService.setupDelayedHover(title, { content: copy.title }));

			// Expands the item, collapsing the one before; selecting the expanded item collapses it.
			const activate = () => {
				this._focusedItemIndex = index;
				this._activeItem.set(active ? null : item.id, undefined);
			};
			store.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, activate));
			// Keyboard focus returns to this row when a re-render happens while focus is inside it.
			store.add(DOM.addDisposableListener(row, DOM.EventType.FOCUS_IN, () => { this._focusedItemIndex = index; }));
			store.add(DOM.addDisposableListener(header, DOM.EventType.FOCUS, () => {
				this._focusedItemIndex = index;
				for (const [i, other] of headers.entries()) {
					other.tabIndex = i === index ? 0 : -1;
				}
			}));
			store.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				let next: number | undefined;
				if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
					DOM.EventHelper.stop(event, true);
					activate();
					return;
				} else if (keyboardEvent.equals(KeyCode.DownArrow)) {
					next = Math.min(index + 1, headers.length - 1);
				} else if (keyboardEvent.equals(KeyCode.UpArrow)) {
					next = Math.max(index - 1, 0);
				} else if (keyboardEvent.equals(KeyCode.Home)) {
					next = 0;
				} else if (keyboardEvent.equals(KeyCode.End)) {
					next = headers.length - 1;
				}
				if (next !== undefined) {
					DOM.EventHelper.stop(event, true);
					headers[next].focus();
				}
			}));

			if (active) {
				const details = DOM.append(row, DOM.$('.get-started-item-details', { id: detailsId }));
				DOM.append(details, DOM.$('.get-started-item-description')).textContent = copy.description;
				const showMe = store.add(new Button(details, { ...defaultButtonStyles, secondary: true, small: true }));
				showMe.label = localize('getStarted.showMe', "Show Me");
				showMe.setAriaLabel(localize('getStarted.showMeLabel', "Show Me: {0}", copy.title));
				showMe.element.classList.add('get-started-show-me');
				store.add(showMe.onDidClick(() => this._showMe(item.id)));
				// Buttons handle Escape themselves, so they return to the sessions list like the rest of the card.
				store.add(showMe.onDidEscape(() => this._options.focusSessionsList()));
				this._showMeElement = showMe.element;
			}
		});

		this._itemHeaders = headers;

		const footer = DOM.append(this._body, DOM.$('.get-started-footer'));
		// Quiet at rest: reads as a link until hovered.
		const dismiss = store.add(new Button(footer, {
			...defaultButtonStyles,
			buttonSecondaryBackground: undefined,
			buttonSecondaryBorder: undefined,
			buttonSecondaryForeground: asCssVariable(descriptionForeground),
			buttonSecondaryHoverBackground: asCssVariable(toolbarHoverBackground),
			secondary: true,
			small: true,
		}));
		dismiss.label = localize('getStarted.dontShowAgain', "Don't Show Again");
		dismiss.element.classList.add('get-started-dismiss');
		store.add(dismiss.onDidClick(() => {
			this._options.focusSessionsList();
			this._viewModel.dismiss();
		}));
		store.add(dismiss.onDidEscape(() => this._options.focusSessionsList()));

		if (restoreFocus) {
			headers[this._focusedItemIndex]?.focus();
		}
	}

	private async _showMe(item: GetStartedItemId): Promise<void> {
		try {
			await this._viewModel.showMe(item);
		} catch (error) {
			onUnexpectedError(error);
		}
		// A tour leaves focus on what it showed. When that went away, return to the checklist.
		const activeElement = DOM.getActiveElement();
		if (!this._store.isDisposed && this.domNode.isConnected && (!activeElement || activeElement === this.domNode.ownerDocument.body)) {
			(this._showMeElement ?? this._itemHeaders[this._focusedItemIndex] ?? this._toggle).focus();
		}
	}

	private _markJustCompleted(item: GetStartedItemId): void {
		if (this._options.animate === false) {
			return;
		}
		this._justCompleted.add(item);
		this._justCompletedTimers.add(disposableTimeout(() => {
			this._justCompleted.delete(item);
			this._rerender.trigger(undefined);
		}, JUST_COMPLETED_MS));
	}
}
