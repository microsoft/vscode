/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetInteractions.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IChatPetMove } from './chatPetMoves.js';
import { IChatPetReaction } from './chatPetReactions.js';
import { ChatPetVariant, IChatPetService } from './chatPetService.js';
import { ChatPetPicture, clearChatPetPicture, getChatPetPictureCellSize, renderChatPetPicture, renderChatPetStage, revealChatPetElement } from './chatPetSpriteUi.js';

/** The pages of the pet's modal: its achievements, the sprites it can show, and what makes it show them. */
export type ChatPetPage = 'achievements' | 'sprites' | 'interactions';

/** What a page can ask of the modal around it. */
export interface IChatPetPageHost {
	/** Shows another page, selecting the row with `selection` on it. */
	showPage(page: ChatPetPage, selection?: string): void;
	/** Shows the Interactions page, where sprites are assigned, with the form for a new interaction that plays the sprite `play`. */
	newInteraction(play: string): void;
	close(): void;
}

/** What the pet knows, read once per render. */
export interface IChatPetPageState {
	readonly moves: readonly IChatPetMove[];
	readonly reactions: readonly IChatPetReaction[];
	readonly disabledBuiltIns: readonly string[];
	readonly variant: ChatPetVariant;
	/** Whether previews animate; they stand still for reduced motion. */
	readonly animate: boolean;
}

/** A section header in the list: shown, not selected. */
export interface IChatPetListHeader {
	readonly kind: 'header';
	readonly id: string;
	readonly label: string;
	readonly count: number | undefined;
}

/** A row of the list: a still of what it shows, its name, and a line on where it stands. */
export interface IChatPetListRow {
	readonly kind: 'row';
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly picture: ChatPetPicture | undefined;
	/** Dimmed: the thing is turned off. */
	readonly off: boolean;
	/** An empty section's stand-in, in italics, whose detail says how to fill the section. */
	readonly placeholder: boolean;
	readonly ariaLabel: string;
}

export type ChatPetListItem<TRow extends IChatPetListRow = IChatPetListRow> = IChatPetListHeader | TRow;

const CHAT_PET_LIST_HEADER_HEIGHT = 28;
const CHAT_PET_LIST_ROW_HEIGHT = 60;
/** Row thumbnails fit a box this wide and tall, in their 48 px square; wide sprites use its width. */
const CHAT_PET_THUMB_WIDTH = 48;
const CHAT_PET_THUMB_HEIGHT = 40;

interface IHeaderTemplate {
	readonly label: HTMLElement;
	readonly count: HTMLElement;
}

interface IRowTemplate {
	readonly container: HTMLElement;
	readonly row: HTMLElement;
	readonly thumb: HTMLElement;
	readonly title: HTMLElement;
	readonly summary: HTMLElement;
	readonly picture: MutableDisposable<IDisposable>;
}

/** Finds the row nearest to `index`, looking `direction` first, then the other way. */
function findNearestRow<TRow extends IChatPetListRow>(items: readonly ChatPetListItem<TRow>[], index: number, direction: 1 | -1): number | undefined {
	for (let i = index; i >= 0 && i < items.length; i += direction) {
		if (items[i].kind === 'row') {
			return i;
		}
	}
	for (let i = index - direction; i >= 0 && i < items.length; i -= direction) {
		if (items[i].kind === 'row') {
			return i;
		}
	}
	return undefined;
}

/**
 * A page of the pet's modal with a list on the left and the selected row's detail on the right:
 * the Sprites page and the Interactions page. Renders again whenever what the pet knows changes,
 * keeping the selection and the focus where they were.
 */
export abstract class ChatPetListPage<TRow extends IChatPetListRow> extends Disposable {

	protected readonly container: HTMLElement;
	protected readonly toolbar: HTMLElement;
	private readonly notice: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly detailContainer: HTMLElement;
	protected readonly detailContent: HTMLElement;
	private readonly detailScrollable: DomScrollableElement;
	private readonly list: WorkbenchList<ChatPetListItem<TRow>>;
	/** Cleared before each render of the detail pane. */
	protected readonly detailStore = this._register(new DisposableStore());
	private readonly toolbarStore = this._register(new DisposableStore());
	private items: ChatPetListItem<TRow>[] = [];
	private selectedId: string | undefined;
	/** A row was selected while the list had no size to scroll it into view; the next layout does. */
	private revealPending = false;
	private updatingList = false;
	private visible = false;
	private state: IChatPetPageState | undefined;
	/** The focusable controls of the detail pane by a stable id, so focus survives a render. */
	private readonly focusables = new Map<string, { readonly element: HTMLElement; readonly focus: () => void }>();

	constructor(
		parent: HTMLElement,
		className: string,
		title: string,
		intro: string,
		listAriaLabel: string,
		protected readonly host: IChatPetPageHost,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IChatPetService protected readonly chatPetService: IChatPetService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this.container = DOM.append(parent, DOM.$(`.chat-pet-interactions.${className}`));
		const header = DOM.append(this.container, DOM.$('.chat-pet-interactions-header'));
		DOM.append(header, DOM.$('h1')).textContent = title;
		DOM.append(header, DOM.$('p.chat-pet-interactions-intro')).textContent = intro;
		this.toolbar = DOM.append(header, DOM.$('.chat-pet-interactions-toolbar'));
		this.notice = DOM.append(header, DOM.$('p.chat-pet-interactions-notice.hidden'));
		this.notice.setAttribute('role', 'alert');

		const body = DOM.append(this.container, DOM.$('.chat-pet-interactions-body'));
		this.listContainer = DOM.append(body, DOM.$('.chat-pet-interactions-list'));
		this.detailContainer = DOM.append(body, DOM.$('.chat-pet-interactions-detail'));
		this.detailContent = DOM.$('.chat-pet-interaction-detail-content');
		this.detailScrollable = this._register(new DomScrollableElement(this.detailContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));
		this.detailContainer.appendChild(this.detailScrollable.getDomNode());
		// The panes fill what the header leaves them, which changes as a notice shows or text reflows.
		const resizeObserver = new (DOM.getWindow(parent).ResizeObserver)(() => this.layoutPanes());
		resizeObserver.observe(this.listContainer);
		resizeObserver.observe(this.detailContainer);
		this._register(toDisposable(() => resizeObserver.disconnect()));

		const delegate: IListVirtualDelegate<ChatPetListItem<TRow>> = {
			getHeight: item => item.kind === 'header' ? CHAT_PET_LIST_HEADER_HEIGHT : CHAT_PET_LIST_ROW_HEIGHT,
			getTemplateId: item => item.kind,
		};
		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<ChatPetListItem<TRow>>,
			`ChatPet${className}`,
			this.listContainer,
			delegate,
			[this.createHeaderRenderer(), this.createRowRenderer()],
			{
				identityProvider: { getId: item => item.id },
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: item => item.kind === 'row' ? item.ariaLabel : null,
					getWidgetAriaLabel: () => listAriaLabel,
					getWidgetRole: () => 'listbox',
					getRole: item => item.kind === 'row' ? 'option' : 'presentation',
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: item => item.kind === 'row' ? item.title : undefined,
				},
			},
		));
		this._register(this.list.onDidChangeSelection(e => {
			const item = e.elements[0];
			if (this.updatingList || !item || item.kind !== 'row' || item.id === this.selectedId) {
				return;
			}
			this.selectedId = item.id;
			this.notify(undefined);
			this.onDidSelect(item);
			this.renderDetail();
		}));
		// Moving through the list selects: the detail follows the keyboard. Headers are passed over.
		this._register(this.list.onDidChangeFocus(e => {
			const index = e.indexes[0];
			if (index === undefined || this.updatingList) {
				return;
			}
			if (this.items[index]?.kind === 'row') {
				if (this.items[index].id !== this.selectedId) {
					this.list.setSelection([index]);
				}
				return;
			}
			const selected = this.getSelectedIndex();
			const next = findNearestRow(this.items, index, selected === undefined || index >= selected ? 1 : -1);
			if (next !== undefined) {
				this.list.setFocus([next]);
				this.list.setSelection([next]);
				this.list.reveal(next);
			}
		}));
		// Escape leaves the modal, as it does on the Achievements page; the reaction form catches its own.
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).keyCode === KeyCode.Escape) {
				DOM.EventHelper.stop(e, true);
				this.host.close();
			}
		}));

		const themeChanged = observableSignalFromEvent(this, themeService.onDidColorThemeChange);
		const motionChanged = observableSignalFromEvent(this, this.accessibilityService.onDidChangeReducedMotion);
		this._register(autorun(reader => {
			themeChanged.read(reader);
			motionChanged.read(reader);
			this.state = {
				moves: this.chatPetService.moves.read(reader),
				reactions: this.chatPetService.reactions.read(reader),
				disabledBuiltIns: this.chatPetService.disabledBuiltInReactions.read(reader),
				variant: this.chatPetService.variant.read(reader),
				animate: !this.accessibilityService.isMotionReduced(),
			};
			if (this.visible) {
				this.render();
			}
		}));
	}

	/** The rows and headers to list for what the pet knows. */
	protected abstract getItems(state: IChatPetPageState): ChatPetListItem<TRow>[];

	/** Fills the detail pane for the selected row, or for none, into `detailContent` with `detailStore`. */
	protected abstract renderDetailContent(row: TRow | undefined, state: IChatPetPageState): void;

	/** The buttons above the list, into `toolbar` with `store`. */
	protected abstract renderToolbar(store: DisposableStore, state: IChatPetPageState): void;

	/** The row the user picked, before its detail renders; pages drop what they kept for another row. */
	protected onDidSelect(row: TRow): void { }

	/** The current state, for actions; defined once the page has rendered. */
	protected get currentState(): IChatPetPageState | undefined {
		return this.state;
	}

	get selection(): string | undefined {
		return this.selectedId;
	}

	/** Renders the page again for a change of its own state, such as a form opening. */
	protected rerender(): void {
		if (this.visible) {
			this.render();
		}
	}

	/** Selects a row by id, when it exists, and scrolls to it; the selection is kept for when it appears. */
	select(id: string): void {
		this.selectedId = id;
		if (this.visible) {
			this.render();
		}
		// The list is sized to its container first: it measured itself before the header was filled, and reveals against its size.
		this.revealPending = true;
		this.layoutPanes();
	}

	/** Scrolls the list to the selected row; a list not yet sized waits for its layout. */
	private revealSelection(): void {
		const index = this.getSelectedIndex();
		if (index === undefined || this.list.renderHeight === 0) {
			return;
		}
		this.revealPending = false;
		this.list.reveal(index);
	}

	/** Hidden pages don't render or animate; shown again, they catch up. */
	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			this.render();
		} else {
			this.detailStore.clear();
		}
	}

	layout(dimension: DOM.Dimension): void {
		this.container.style.width = `${dimension.width}px`;
		this.container.style.height = `${dimension.height}px`;
		this.container.classList.toggle('narrow', dimension.width < 560);
		this.layoutPanes();
	}

	/** Sizes the list and the detail pane to their containers, and finishes a reveal that waited for a size. */
	private layoutPanes(): void {
		this.list.layout(this.listContainer.clientHeight, this.listContainer.clientWidth);
		const scrollableNode = this.detailScrollable.getDomNode();
		scrollableNode.style.width = `${this.detailContainer.clientWidth}px`;
		scrollableNode.style.height = `${this.detailContainer.clientHeight}px`;
		// The content is what scrolls: sized to the pane, it clips and takes a scrollTop, and the scrollable measures its overflow.
		this.detailContent.style.width = `${this.detailContainer.clientWidth}px`;
		this.detailContent.style.height = `${this.detailContainer.clientHeight}px`;
		this.detailScrollable.scanDomNode();
		if (this.revealPending) {
			this.revealSelection();
		}
	}

	focus(): void {
		const index = this.getSelectedIndex() ?? findNearestRow(this.items, 0, 1);
		if (index !== undefined) {
			this.list.setFocus([index]);
		}
		this.list.domFocus();
	}

	/** Shows a message under the toolbar, or clears it; an error stands out. */
	protected notify(message: string | undefined, kind: 'info' | 'error' = 'info'): void {
		this.notice.textContent = message ?? '';
		this.notice.classList.toggle('hidden', !message);
		this.notice.classList.toggle('error', kind === 'error');
	}

	/** Tells screen readers what just happened, when the page already shows it. */
	protected announce(message: string): void {
		status(message);
	}

	/**
	 * Keeps a control's focus across renders: a control registered under the same id gets it back,
	 * through `focus`, which a control of several parts uses to focus the right one.
	 */
	protected registerFocusable(id: string, element: HTMLElement, focus: () => void = () => element.focus()): void {
		this.focusables.set(id, { element, focus });
	}

	/** Scrolls the detail pane so `element` shows. */
	protected revealInDetail(element: HTMLElement): void {
		this.detailScrollable.scanDomNode();
		revealChatPetElement(this.detailScrollable.getDomNode(), () => this.detailScrollable.getScrollPosition().scrollTop, scrollTop => this.detailScrollable.setScrollPosition({ scrollTop }), element);
	}

	/**
	 * The stage at the top of the detail pane, showing `picture`. Returns how to show another one
	 * there, as a form's sprite choice changes.
	 */
	protected renderStage(picture: ChatPetPicture | undefined, state: IChatPetPageState): (picture: ChatPetPicture | undefined) => void {
		const host = DOM.append(this.detailContent, DOM.$('.chat-pet-interaction-stage-host'));
		const playing = this.detailStore.add(new MutableDisposable());
		const show = (picture: ChatPetPicture | undefined) => {
			playing.clear();
			DOM.clearNode(host);
			playing.value = renderChatPetStage(host, picture, state.variant, state.animate);
		};
		show(picture);
		return show;
	}

	/** A button in the toolbar. */
	protected addToolbarButton(store: DisposableStore, label: string, title: string, secondary: boolean, onClick: () => void): Button {
		const button = store.add(new Button(this.toolbar, { ...defaultButtonStyles, secondary, title }));
		button.label = label;
		store.add(button.onDidClick(onClick));
		return button;
	}

	/** A link in the detail pane that goes somewhere in the modal. */
	protected addDetailLink(container: HTMLElement, label: string, title: string, open: () => void): Link {
		return this.detailStore.add(this.instantiationService.createInstance(Link, container, { label, href: `chat-pet:${label}`, title }, { opener: open }));
	}

	private getSelectedIndex(): number | undefined {
		const index = this.items.findIndex(item => item.kind === 'row' && item.id === this.selectedId);
		return index >= 0 ? index : undefined;
	}

	private getSelectedRow(): TRow | undefined {
		const index = this.getSelectedIndex();
		const item = index === undefined ? undefined : this.items[index];
		return item?.kind === 'row' ? item : undefined;
	}

	private render(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		this.toolbarStore.clear();
		DOM.clearNode(this.toolbar);
		this.renderToolbar(this.toolbarStore, state);
		this.setItems(this.getItems(state));
		this.renderDetail();
	}

	private setItems(items: ChatPetListItem<TRow>[]): void {
		const previousIndex = this.getSelectedIndex();
		this.items = items;
		let index = this.getSelectedIndex();
		if (index === undefined) {
			// The selected row is gone: its neighbour stands in, or the first row.
			index = findNearestRow(items, Math.min(previousIndex ?? 0, Math.max(0, items.length - 1)), 1);
			this.selectedId = index === undefined ? undefined : items[index].id;
		}
		this.updatingList = true;
		try {
			this.list.splice(0, this.list.length, items);
			this.list.setSelection(index === undefined ? [] : [index]);
			this.list.setFocus(index === undefined ? [] : [index]);
		} finally {
			this.updatingList = false;
		}
	}

	private renderDetail(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const activeElement = DOM.getActiveElement();
		let focusedId: string | undefined;
		for (const [id, { element }] of this.focusables) {
			if (element === activeElement || (DOM.isHTMLElement(activeElement) && element.contains(activeElement))) {
				focusedId = id;
			}
		}
		this.detailStore.clear();
		this.focusables.clear();
		DOM.clearNode(this.detailContent);
		this.renderDetailContent(this.getSelectedRow(), state);
		this.detailScrollable.scanDomNode();
		if (focusedId !== undefined) {
			this.focusables.get(focusedId)?.focus();
		}
	}

	private createHeaderRenderer(): IListRenderer<ChatPetListItem<TRow>, IHeaderTemplate> {
		return {
			templateId: 'header',
			renderTemplate: container => {
				// The whole row stands aside: clicks fall through and nothing selects it.
				container.classList.add('chat-pet-list-header-row');
				const header = DOM.append(container, DOM.$('.chat-pet-interaction-header'));
				return { label: DOM.append(header, DOM.$('span')), count: DOM.append(header, DOM.$('span.chat-pet-interaction-header-count')) };
			},
			renderElement: (item, _index, template) => {
				if (item.kind === 'header') {
					template.label.textContent = item.label;
					template.count.textContent = item.count === undefined ? '' : String(item.count);
				}
			},
			disposeTemplate: () => { },
		};
	}

	private createRowRenderer(): IListRenderer<ChatPetListItem<TRow>, IRowTemplate> {
		return {
			templateId: 'row',
			renderTemplate: container => {
				const row = DOM.append(container, DOM.$('.chat-pet-interaction-row'));
				const thumb = DOM.append(row, DOM.$('.chat-pet-interaction-thumb'));
				const text = DOM.append(row, DOM.$('.chat-pet-interaction-row-text'));
				const title = DOM.append(DOM.append(text, DOM.$('.chat-pet-interaction-row-title')), DOM.$('span.chat-pet-interaction-name'));
				const summary = DOM.append(text, DOM.$('.chat-pet-interaction-row-summary'));
				return { container, row, thumb, title, summary, picture: new MutableDisposable() };
			},
			renderElement: (item, _index, template) => {
				if (item.kind !== 'row') {
					return;
				}
				const state = this.state;
				template.row.classList.toggle('off', item.off);
				template.row.classList.toggle('placeholder', item.placeholder);
				template.title.textContent = item.title;
				template.summary.textContent = item.summary;
				template.picture.clear();
				clearChatPetPicture(template.thumb);
				if (item.picture && state) {
					template.picture.value = renderChatPetPicture(template.thumb, item.picture, state.variant, getChatPetPictureCellSize(item.picture, state.variant, CHAT_PET_THUMB_WIDTH, CHAT_PET_THUMB_HEIGHT));
				}
			},
			disposeElement: (_item, _index, template) => {
				template.picture.clear();
				clearChatPetPicture(template.thumb);
			},
			disposeTemplate: template => {
				template.picture.dispose();
				clearChatPetPicture(template.thumb);
			},
		};
	}
}

/** The heading of a detail pane: a name, and a badge for what kind of thing it is. */
export function renderChatPetDetailHeading(container: HTMLElement, title: string, badge: { readonly label: string; readonly custom: boolean } | undefined): HTMLElement {
	const heading = DOM.append(container, DOM.$('.chat-pet-interaction-heading'));
	const h2 = DOM.append(heading, DOM.$('h2'));
	h2.textContent = title;
	if (badge) {
		const element = DOM.append(heading, DOM.$('span.chat-pet-interaction-badge'));
		element.classList.toggle('custom', badge.custom);
		element.textContent = badge.label;
	}
	return heading;
}

/** The heading of a part of the detail pane, such as what a sprite is used by; returns the part, to fill. */
export function renderChatPetDetailSectionHeading(container: HTMLElement, title: string): HTMLElement {
	const section = DOM.append(container, DOM.$('.chat-pet-interaction-pool'));
	DOM.append(section, DOM.$('h3')).textContent = title;
	return section;
}

/** A part of the detail pane with a list of entries, such as what a click plays. */
export function renderChatPetDetailSection(container: HTMLElement, title: string): { readonly section: HTMLElement; readonly list: HTMLElement } {
	const section = renderChatPetDetailSectionHeading(container, title);
	return { section, list: DOM.append(section, DOM.$('ul')) };
}

/** The label for an empty list inside the detail pane. */
export function renderChatPetDetailEmpty(container: HTMLElement, text: string): void {
	DOM.append(container, DOM.$('p.chat-pet-interaction-pool-empty')).textContent = text;
}
