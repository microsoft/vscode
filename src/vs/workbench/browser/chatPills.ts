/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, DisposableResizeObserver, EventHelper, EventType, isHTMLElement, reset } from '../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../base/browser/keyboardEvent.js';
import { mainWindow, type CodeWindow } from '../../base/browser/window.js';
import { IActionViewItem } from '../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../base/browser/ui/scrollbar/scrollableElement.js';
import { ToolBar } from '../../base/browser/ui/toolbar/toolbar.js';
import { IAction, IActionRunner } from '../../base/common/actions.js';
import { disposableTimeout } from '../../base/common/async.js';
import { Emitter, Event } from '../../base/common/event.js';
import { MarkdownString } from '../../base/common/htmlContent.js';
import { KeyCode } from '../../base/common/keyCodes.js';
import { isMacintosh } from '../../base/common/platform.js';
import { Disposable, MutableDisposable } from '../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../base/common/observable.js';
import { ScrollbarVisibility } from '../../base/common/scrollable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import type { IActionListItemHover } from '../../platform/actionWidget/browser/actionList.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { asCssVariable, asCssVariableWithDefault, buttonSecondaryBackground } from '../../platform/theme/common/colorRegistry.js';
import { defaultButtonStyles } from '../../platform/theme/browser/defaultStyles.js';
import './media/chatPills.css';

/**
 * A pill rendered by {@link ChatPillsWidget}. The caller owns the action and any
 * state captured by the optional view-item factory.
 */
export interface IChatPill {
	readonly action: IAction;
	readonly createActionViewItem?: (options: IActionViewItemOptions) => IActionViewItem | undefined;
}

/** Observable data consumed by {@link ChatPillsWidget}. */
export interface IChatPillsModel {
	readonly pills: IObservable<readonly IChatPill[]>;
	readonly context?: IObservable<unknown>;
}

/** One entry a pill stands for. */
export interface IChatPillEntry {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	/** Renders the entry with its resource's themed file icon. */
	readonly resource?: URI;
	/** Actions shown at the trailing edge of the entry's dropdown row. */
	readonly toolbarActions?: readonly IAction[];
	/** Accessible name used when this entry is rendered as the pill itself. */
	readonly ariaLabel?: string;
	/** Plain-text description of the content shown beside the dropdown entry. */
	readonly ariaDescription?: string;
	/** Content shown beside the entry while it is focused or hovered. */
	readonly hover?: IActionListItemHover;
	/** Tooltip for the pill when this is the only entry. */
	readonly tooltip?: string;
	open(): void;
}

/** A titled group of entries, rendered as a dropdown section. */
export interface IChatPillSection {
	readonly title: string;
	readonly entries: readonly IChatPillEntry[];
}

/** Describes a pill entry's target while keeping its accessible name action-oriented. */
export function getChatPillResourceLocation(uri: URI, label: string, ariaLabel = localize('chatPills.open', "Open {0}", label)): Pick<IChatPillEntry, 'ariaDescription' | 'ariaLabel' | 'hover' | 'tooltip'> {
	const value = uri.toString(true);
	return {
		ariaDescription: value,
		ariaLabel,
		hover: { content: new MarkdownString().appendText(value) },
		tooltip: value,
	};
}

export function getChatPillEntries(sections: readonly IChatPillSection[]): readonly IChatPillEntry[] {
	return sections.flatMap(section => section.entries);
}

export interface IChatPillsWidgetOptions {
	readonly ariaLabel?: string;
	readonly actionRunner?: IActionRunner;
	/**
	 * Lets `contextmenu` bubble out of the pills. The toolbar otherwise swallows
	 * it per item, which would hide the pills from a surrounding context menu.
	 */
	readonly allowContextMenu?: boolean;
}

/**
 * The floating row's rendered height: 2px/4px vertical padding around a 22px
 * small button. Hosts reserve this much transcript space while the row is shown.
 */
export const CHAT_INPUT_PILLS_ROW_HEIGHT = 28;

export type ChatPillsCompactMode = boolean | 'auto';

export interface IChatPillsRowOptions {
	/** Collapses pills to their icons and uses tighter spacing while preserving full accessible labels and tooltips. */
	readonly compact?: ChatPillsCompactMode;
	/** Window that owns the row. Required when rendering in an auxiliary window. */
	readonly targetWindow?: CodeWindow;
}

/** Shared horizontally scrollable row for pills mounted above a chat input. */
export class ChatPillsRow extends Disposable {

	readonly element: HTMLElement;
	readonly content: HTMLElement;

	private readonly _scrollable: DomScrollableElement;
	private readonly _resizeObserver: DisposableResizeObserver;
	private readonly _mutationObserver: MutationObserver | undefined;
	private _isLayouting = false;
	private readonly _onDidChangeLayout = this._register(new Emitter<void>());
	readonly onDidChangeLayout: Event<void> = this._onDidChangeLayout.event;
	private readonly _onDidRequestContextMenu = this._register(new Emitter<HTMLElement>());
	readonly onDidRequestContextMenu: Event<HTMLElement> = this._onDidRequestContextMenu.event;
	private readonly _pendingFocus = this._register(new MutableDisposable());

	constructor(debugName: string, options?: IChatPillsRowOptions) {
		super();

		const targetWindow = options?.targetWindow ?? mainWindow;
		this.content = targetWindow.document.createElement('div');
		this.content.className = 'chat-pills-row-content';
		this._scrollable = this._register(new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 6,
			scrollYToX: true,
			vertical: ScrollbarVisibility.Hidden,
		}));
		this.element = this._scrollable.getDomNode();
		this.element.classList.add('chat-pills-row');
		const compactMode = options?.compact ?? false;
		this.element.classList.toggle('compact', compactMode === true);

		this._resizeObserver = this._register(new DisposableResizeObserver(debugName, () => this.layout(), targetWindow));
		this._register(this._resizeObserver.observe(this.content));
		if (compactMode === 'auto') {
			this._mutationObserver = new targetWindow.MutationObserver(() => this.layout());
			this._observeMutations();
			this._register({ dispose: () => this._mutationObserver?.disconnect() });
		} else {
			this._mutationObserver = undefined;
		}
		this._register(this._scrollable.onScroll(event => {
			if (event.scrollLeftChanged) {
				this._onDidChangeLayout.fire();
			}
		}));
		this._register(addDisposableListener(this.content, EventType.FOCUS_IN, () => this.scanDomNode()));
		this._register(addDisposableListener(this.content, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			const target = isHTMLElement(event.target) ? event.target : this.content;
			const activatesEmptyRow = target === this.content && (keyboardEvent.keyCode === KeyCode.Enter || keyboardEvent.keyCode === KeyCode.Space);
			if (activatesEmptyRow
				|| keyboardEvent.keyCode === KeyCode.ContextMenu
				|| (keyboardEvent.shiftKey && keyboardEvent.keyCode === KeyCode.F10)) {
				EventHelper.stop(event, true);
				this._onDidRequestContextMenu.fire(target);
			}
		}));
	}

	observe(element: HTMLElement): void {
		this._register(this._resizeObserver.observe(element));
		this.layout();
	}

	layout(): void {
		if (this._isLayouting || !this.element.isConnected) {
			return;
		}

		this._isLayouting = true;
		this._mutationObserver?.disconnect();
		try {
			if (this._mutationObserver) {
				this.element.classList.remove('compact');
				const availableWidth = this.element.getBoundingClientRect().width;
				this.element.classList.toggle('compact', availableWidth > 0 && this.content.scrollWidth > availableWidth + 1);
			}
			this.scanDomNode();
			this._onDidChangeLayout.fire();
		} finally {
			this._observeMutations();
			this._isLayouting = false;
		}
	}

	scanDomNode(): void {
		this._scrollable.scanDomNode();
	}

	private _observeMutations(): void {
		this._mutationObserver?.observe(this.content, {
			attributes: true,
			attributeFilter: ['class', 'hidden', 'style'],
			characterData: true,
			childList: true,
			subtree: true,
		});
	}

	setEmpty(empty: boolean, ariaLabel: string): void {
		this.element.classList.toggle('empty', empty);
		if (empty) {
			this.content.tabIndex = 0;
			this.content.setAttribute('role', 'button');
			this.content.setAttribute('aria-label', ariaLabel);
		} else {
			this.content.removeAttribute('tabindex');
			this.content.removeAttribute('role');
			this.content.removeAttribute('aria-label');
		}
	}

	restoreFocus(getPillElements: () => readonly HTMLElement[]): void {
		this._pendingFocus.value = disposableTimeout(() => {
			const pill = getPillElements().at(0);
			if (pill) {
				pill.focus();
			} else if (this.element.classList.contains('empty')) {
				this.content.focus();
			}
		});
	}
}

/**
 * A reusable horizontal toolbar whose pill set and action context are observable.
 */
export class ChatPillsWidget extends Disposable {

	readonly element: HTMLElement;
	readonly isVisible: IObservable<boolean>;
	private readonly _onDidChangePills = this._register(new Emitter<void>());
	readonly onDidChangePills: Event<void> = this._onDidChangePills.event;

	private readonly _toolbar: ToolBar;
	private _pillByAction = new Map<IAction, IChatPill>();
	private _pills: readonly IChatPill[] = [];
	private _pillViewItems: ChatPillActionViewItemBase[] = [];

	constructor(
		model: IChatPillsModel,
		options: IChatPillsWidgetOptions | undefined,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super();

		this.element = $('.chat-pills.hidden');
		this._toolbar = this._register(new ToolBar(this.element, contextMenuService, {
			ariaLabel: options?.ariaLabel ?? localize('chatPills.ariaLabel', "Chat status"),
			actionRunner: options?.actionRunner,
			allowContextMenu: options?.allowContextMenu,
			actionViewItemProvider: (action, viewItemOptions) => {
				const viewItem = this._pillByAction.get(action)?.createActionViewItem?.(viewItemOptions) ?? new ChatPillActionViewItem(undefined, action, viewItemOptions);
				if (viewItem instanceof ChatPillActionViewItemBase) {
					this._pillViewItems.push(viewItem);
				}
				return viewItem;
			},
		}));

		this.isVisible = derived(this, reader => model.pills.read(reader).length > 0);
		this._register(autorun(reader => {
			const pills = model.pills.read(reader);
			this._pillByAction = new Map(pills.map(pill => [pill.action, pill]));
			this._toolbar.context = model.context?.read(reader);
			const pillsChanged = pills.length !== this._pills.length || pills.some((pill, index) => pill !== this._pills[index]);
			if (pillsChanged) {
				this._pills = pills;
				this._pillViewItems = [];
				this._toolbar.setActions(pills.map(pill => pill.action));
			}
			this.element.classList.toggle('hidden', pills.length === 0);
			if (pillsChanged) {
				this._onDidChangePills.fire();
			}
		}));
	}

	/** Returns the rendered button for each pill. */
	getPillElements(): readonly HTMLElement[] {
		return this._pillViewItems.flatMap(viewItem => viewItem.buttonElement ? [viewItem.buttonElement] : []);
	}

	/**
	 * The pill whose rendered item contains `target`, if any. Toolbar items are
	 * rendered in pill order, so their position identifies them without each
	 * pill having to tag its own DOM.
	 */
	getPill(target: HTMLElement | null | undefined): IChatPill | undefined {
		const item = target?.closest('.action-item');
		if (!item?.parentElement) {
			return undefined;
		}
		return this._pills[[...item.parentElement.children].indexOf(item)];
	}
}

/** Opaque base so a pill never shows the content it floats over; `chatPills.css` tints it. */
const chatPillBackground = asCssVariableWithDefault('chat.list.background', asCssVariable(buttonSecondaryBackground));

/**
 * Shared plumbing for every chat pill: the button, click routing, enabled
 * state, and the roving-focus hooks the toolbar drives. Subclasses own only
 * what goes inside the button.
 */
export abstract class ChatPillActionViewItemBase extends BaseActionViewItem {

	protected button: Button | undefined;

	/** The rendered button owned by this pill. */
	get buttonElement(): HTMLElement | undefined {
		return this.button?.element;
	}

	/**
	 * Per-pill modifier classes added alongside the shared `chat-pill-item` and
	 * `chat-pill-button`. A single class each, since these are applied with
	 * `classList.add`, which rejects space-separated values.
	 */
	protected get itemModifierClass(): string | undefined { return undefined; }
	protected get buttonModifierClass(): string | undefined { return undefined; }
	protected get buttonOptions(): { readonly supportIcons?: boolean } { return {}; }

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-pill-item');
		if (this.itemModifierClass) {
			container.classList.add(this.itemModifierClass);
		}

		// Hover uses the same opaque base; CSS layers the hover tint on top.
		const button = this.button = this._register(new Button(container, {
			secondary: true,
			small: true,
			...this.buttonOptions,
			...defaultButtonStyles,
			buttonSecondaryBackground: chatPillBackground,
			buttonSecondaryHoverBackground: chatPillBackground,
		}));
		button.element.classList.add('monaco-text-button', 'chat-pill-button');
		if (this.buttonModifierClass) {
			button.element.classList.add(this.buttonModifierClass);
		}
		// A click that dismisses this pill's own dropdown must not also re-open it.
		this._register(addDisposableListener(button.element.ownerDocument.body, EventType.MOUSE_DOWN, event => {
			if (event.button === 0 && (!isMacintosh || !event.ctrlKey) && this.hasOpenDropdown() && button.element.contains(event.target as Node | null)) {
				event.stopPropagation();
			}
		}));
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.onDidClickButton();
			}
		}));

		this.renderContent(button);
		this.updateEnabled();
		this.updateTooltip();
	}

	/** Fills the button. Called once, after the button exists. */
	protected abstract renderContent(button: Button): void;

	protected hasOpenDropdown(): boolean {
		return false;
	}

	protected onDidClickButton(): void {
		this.actionRunner.run(this._action, this._context);
	}

	override focus(): void {
		if (this.button) {
			// Arrow navigation blurs the previous item, which drops it out of the
			// tab order; the newly focused item has to take its place or the row
			// ends up with no tab stop at all.
			this.button.element.tabIndex = 0;
			this.button.focus();
		}
	}

	override blur(): void {
		if (this.button) {
			this.button.element.tabIndex = -1;
			this.button.element.blur();
		}
	}

	override setFocusable(focusable: boolean): void {
		if (this.button) {
			this.button.element.tabIndex = focusable ? 0 : -1;
		}
	}

	override isFocused(): boolean {
		return !!this.button?.hasFocus();
	}

	protected override updateEnabled(): void {
		if (this.button) {
			this.button.enabled = this._action.enabled;
		}
	}

	protected override updateAriaLabel(): void {
		const ariaLabel = this.getAriaLabel();
		if (ariaLabel) {
			this.button?.element.setAttribute('aria-label', ariaLabel);
		} else {
			this.button?.element.removeAttribute('aria-label');
		}
	}

	protected getAriaLabel(): string | undefined {
		return this.getTooltip();
	}

	protected override getTooltip(): string | undefined {
		return this._action.tooltip || this._action.label || undefined;
	}
}

/** The default `icon + label` rendering for chat pill actions. */
export class ChatPillActionViewItem extends ChatPillActionViewItemBase {

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);
	}

	protected override renderContent(): void {
		this.updateLabel();
	}

	protected override updateClass(): void {
		this.updateLabel();
	}

	protected override updateLabel(): void {
		if (this.button) {
			reset(this.button.element, ...this.getLabelContent());
		}
	}

	private getLabelContent(): Array<HTMLElement | string> {
		const content: Array<HTMLElement | string> = [];
		const iconElement = this.getIconElement();
		if (iconElement) {
			content.push(iconElement);
		}

		const labelText = this.getLabelText();
		if (labelText) {
			content.push($('span.chat-pill-label', undefined, labelText));
		}

		content.push(...this.getAdditionalLabelContent());
		return content;
	}

	protected getIconElement(): HTMLElement | undefined {
		const iconClasses = this._action.class?.split(' ').filter(cssClass => !!cssClass);
		if (!iconClasses?.length) {
			return undefined;
		}
		return $(`span.chat-pill-icon${iconClasses.map(cssClass => `.${cssClass}`).join('')}`, { 'aria-hidden': 'true' });
	}

	protected getLabelText(): string {
		return this._action.label;
	}

	protected getAdditionalLabelContent(): Array<HTMLElement | string> {
		return [];
	}
}
