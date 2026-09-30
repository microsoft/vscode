/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionCollections.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IAction, Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { ISessionCollection, ISessionCollectionsService } from '../../../services/sessions/browser/sessionCollectionsService.js';
import { sessionPaletteColorIds } from '../../../services/sessions/common/sessionColors.js';

export const SESSION_COLLECTIONS_CONTROLLER_ID = 'workbench.contrib.sessions.sessionCollections';

export const enum SessionCollectionAttention {
	None = 'none',
	Unread = 'unread',
	NeedsInput = 'needs-input',
}

export interface ISessionCollectionsSwitcherDelegate {
	switchToCollection(collectionId: string): void;
	showNewCollectionEditor(anchor: HTMLElement): void;
	showEditCollectionEditor(collectionId: string, anchor: HTMLElement): void;
	showCollectionMenu(anchor: HTMLElement): void;
	getCollectionAttention(collectionId: string, reader?: IReader): SessionCollectionAttention;
	getCollectionKeybindingLabel(index: number): string | undefined;
	getCollectionKeybindingAriaLabel(index: number): string | undefined;
	registerCollectionAnchor(collectionId: string, element: HTMLElement): IDisposable;
	hasDraggedCollectionItems(): boolean;
	moveDraggedItemsToCollection(collectionId: string): boolean;
}

export interface ISessionCollectionTitleButtonOptions {
	readonly shouldShow: (reader: IReader) => boolean;
}

export function renderSessionCollectionIcon(container: HTMLElement, icon: string): HTMLElement {
	DOM.clearNode(container);
	return DOM.append(container, DOM.$(`span${ThemeIcon.asCSSSelector(ThemeIcon.fromId(icon))}`));
}

function collectionAccent(collection: ISessionCollection): string {
	return asCssVariable(sessionPaletteColorIds[collection.color]);
}

function attentionLabel(attention: SessionCollectionAttention): string | undefined {
	switch (attention) {
		case SessionCollectionAttention.NeedsInput:
			return localize('collectionNeedsInput', "needs input");
		case SessionCollectionAttention.Unread:
			return localize('collectionUnread', "unread");
		case SessionCollectionAttention.None:
			return undefined;
	}
}

function collectionAriaLabel(collection: ISessionCollection, attention: SessionCollectionAttention): string {
	const state = attentionLabel(attention);
	return state
		? localize('collectionAriaWithState', "{0} collection, {1}", collection.name, state)
		: localize('collectionAria', "{0} collection", collection.name);
}

abstract class SessionCollectionsSwitcherBase extends Disposable {

	protected readonly renderStore = this._register(new DisposableStore());
	private readonly keybindingUpdate: IObservable<void>;
	private readonly buttonsByCollectionId = new Map<string, HTMLElement>();

	constructor(
		protected readonly container: HTMLElement,
		protected readonly delegate: ISessionCollectionsSwitcherDelegate,
		@ISessionCollectionsService protected readonly collectionsService: ISessionCollectionsService,
		@IHoverService protected readonly hoverService: IHoverService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
	) {
		super();
		this.keybindingUpdate = observableSignalFromEvent(this, this.keybindingService.onDidUpdateKeybindings);
		this.container.setAttribute('role', 'tablist');
		this.container.setAttribute('aria-label', localize('collections', "Collections"));
		this._register(autorun(reader => {
			this.keybindingUpdate.read(reader);
			this.render(reader);
		}));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.DRAG_LEAVE, event => {
			if (!DOM.isHTMLElement(event.relatedTarget) || !this.container.contains(event.relatedTarget)) {
				this.container.classList.remove('session-collections-dragging');
			}
		}));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.DRAG_END, () => this.container.classList.remove('session-collections-dragging')));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.DROP, () => this.container.classList.remove('session-collections-dragging')));
	}

	protected abstract get buttonClass(): string;
	protected abstract renderButtonContent(button: HTMLElement, collection: ISessionCollection): void;
	protected abstract renderAddButton(): void;

	protected render(reader: IReader): void {
		this.renderStore.clear();
		this.buttonsByCollectionId.clear();
		DOM.clearNode(this.container);
		const collections = this.collectionsService.collections.read(reader);
		const active = this.collectionsService.activeCollectionId.read(reader);
		for (const [index, collection] of collections.entries()) {
			const activeCollection = collection.id === active;
			const button = DOM.append(this.container, DOM.$(`button.${this.buttonClass}`, {
				type: 'button',
				role: 'tab',
				'aria-selected': String(activeCollection),
				'aria-label': collectionAriaLabel(collection, SessionCollectionAttention.None),
				'data-collection-id': collection.id,
			}));
			this.buttonsByCollectionId.set(collection.id, button);
			button.classList.toggle('active', activeCollection);
			button.tabIndex = activeCollection ? 0 : -1;
			button.style.setProperty('--session-collection-accent', collectionAccent(collection));
			this.renderButtonContent(button, collection);
			if (!activeCollection) {
				// Attention changes with every session update; update it in place so the tabs keep focus.
				const badge = DOM.append(button, DOM.$('span.session-collection-attention'));
				this.renderStore.add(autorun(attentionReader => {
					const attention = this.delegate.getCollectionAttention(collection.id, attentionReader);
					badge.className = `session-collection-attention ${attention}`;
					badge.style.display = attention === SessionCollectionAttention.None ? 'none' : '';
					button.setAttribute('aria-label', collectionAriaLabel(collection, attention));
				}));
			}
			this.renderStore.add(this.delegate.registerCollectionAnchor(collection.id, button));
			this.renderStore.add(this.hoverService.setupDelayedHover(button, () => ({
				content: this.getCollectionHover(collection, index),
				appearance: { compact: true },
			})));
			this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.delegate.switchToCollection(collection.id)));
			this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.DBLCLICK, () => this.delegate.showEditCollectionEditor(collection.id, button)));
			this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.CONTEXT_MENU, event => {
				DOM.EventHelper.stop(event, true);
				this.contextMenuService.showContextMenu({
					getAnchor: () => button,
					getActions: () => this.getCollectionContextActions(collection, button),
				});
			}));
			this.registerDropTarget(button, collection.id, activeCollection);
		}
		this.renderAddButton();
	}

	protected createAddButton(className: string): HTMLElement {
		const button = DOM.append(this.container, DOM.$(`button.${className}.session-collections-add`, {
			type: 'button',
			'aria-label': localize('newCollection', "New Collection"),
		}));
		DOM.append(button, DOM.$(`span${ThemeIcon.asCSSSelector(Codicon.add)}`));
		this.renderStore.add(this.hoverService.setupDelayedHover(button, {
			content: localize('newCollectionHover', "New Collection..."),
			appearance: { compact: true },
		}));
		this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.delegate.showNewCollectionEditor(button)));
		return button;
	}

	private getCollectionHover(collection: ISessionCollection, index: number): string {
		const keybinding = this.delegate.getCollectionKeybindingLabel(index);
		return keybinding
			? localize('collectionHoverWithKeybinding', "{0} ({1})", collection.name, keybinding)
			: collection.name;
	}

	private getCollectionContextActions(collection: ISessionCollection, anchor: HTMLElement): IAction[] {
		return [
			new Action('sessions.collections.edit.context', localize('editCollection', "Edit Collection..."), undefined, true, () => {
				this.delegate.showEditCollectionEditor(collection.id, anchor);
			}),
			new Action('sessions.collections.new.context', localize('newCollectionContext', "New Collection..."), undefined, true, () => {
				this.delegate.showNewCollectionEditor(anchor);
			}),
		];
	}

	private registerDropTarget(button: HTMLElement, collectionId: string, activeCollection: boolean): void {
		const canDrop = () => !activeCollection && this.delegate.hasDraggedCollectionItems();
		this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.DRAG_OVER, event => {
			if (!canDrop()) {
				return;
			}
			event.preventDefault();
			this.container.classList.add('session-collections-dragging');
			button.classList.add('session-collections-drop-target');
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
		}));
		this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.DRAG_LEAVE, () => {
			button.classList.remove('session-collections-drop-target');
		}));
		this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.DROP, event => {
			button.classList.remove('session-collections-drop-target');
			this.container.classList.remove('session-collections-dragging');
			if (!canDrop()) {
				return;
			}
			if (this.delegate.moveDraggedItemsToCollection(collectionId)) {
				event.preventDefault();
			}
		}));
	}

	private onKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		const collections = this.collectionsService.collections.get();
		if (collections.length === 0) {
			return;
		}

		let nextIndex: number | undefined;
		const activeElement = DOM.getActiveElement();
		const activeCollectionId = DOM.isHTMLElement(activeElement) ? activeElement.dataset.collectionId : undefined;
		const currentIndex = Math.max(0, collections.findIndex(collection => collection.id === activeCollectionId || collection.id === this.collectionsService.activeCollectionId.get()));
		if (keyboardEvent.equals(KeyCode.LeftArrow)) {
			nextIndex = (currentIndex + collections.length - 1) % collections.length;
		} else if (keyboardEvent.equals(KeyCode.RightArrow)) {
			nextIndex = (currentIndex + 1) % collections.length;
		} else if (keyboardEvent.equals(KeyCode.Home)) {
			nextIndex = 0;
		} else if (keyboardEvent.equals(KeyCode.End)) {
			nextIndex = collections.length - 1;
		}

		if (nextIndex === undefined) {
			return;
		}
		DOM.EventHelper.stop(event, true);
		const collection = collections[nextIndex];
		this.delegate.switchToCollection(collection.id);
		this.buttonsByCollectionId.get(collection.id)?.focus();
	}
}

export class SessionCollectionsIconStrip extends SessionCollectionsSwitcherBase {

	protected override get buttonClass(): string {
		return 'session-collections-strip-button';
	}

	constructor(
		container: HTMLElement,
		delegate: ISessionCollectionsSwitcherDelegate,
		@ISessionCollectionsService collectionsService: ISessionCollectionsService,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(container, delegate, collectionsService, hoverService, contextMenuService, keybindingService);
		this.container.classList.add('session-collections-strip');
	}

	protected override renderButtonContent(button: HTMLElement, collection: ISessionCollection): void {
		const icon = DOM.append(button, DOM.$('span.session-collections-switcher-icon'));
		renderSessionCollectionIcon(icon, collection.icon);
	}

	protected override renderAddButton(): void {
		this.createAddButton('session-collections-strip-button');
	}
}

export class SessionCollectionsTabs extends SessionCollectionsSwitcherBase {

	protected override get buttonClass(): string {
		return 'session-collections-tab';
	}

	constructor(
		container: HTMLElement,
		delegate: ISessionCollectionsSwitcherDelegate,
		@ISessionCollectionsService collectionsService: ISessionCollectionsService,
		@IHoverService hoverService: IHoverService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super(container, delegate, collectionsService, hoverService, contextMenuService, keybindingService);
		this.container.classList.add('session-collections-tabs');
	}

	protected override renderButtonContent(button: HTMLElement, collection: ISessionCollection): void {
		const icon = DOM.append(button, DOM.$('span.session-collections-switcher-icon'));
		renderSessionCollectionIcon(icon, collection.icon);
		DOM.append(button, DOM.$('span.session-collections-tab-label', undefined, collection.name));
	}

	protected override renderAddButton(): void {
		this.createAddButton('session-collections-tab');
	}
}

export class SessionCollectionTitleButton extends Disposable {

	private readonly renderStore = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		private readonly options: ISessionCollectionTitleButtonOptions,
		private readonly delegate: ISessionCollectionsSwitcherDelegate,
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this._register(autorun(reader => this.render(reader)));
	}

	private render(reader: IReader): void {
		this.renderStore.clear();
		DOM.clearNode(this.container);
		if (!this.options.shouldShow(reader)) {
			this.container.textContent = localize('sessionsHeader', "Sessions");
			return;
		}

		const collections = this.collectionsService.collections.read(reader);
		const activeCollectionId = this.collectionsService.activeCollectionId.read(reader);
		const collection = collections.find(collection => collection.id === activeCollectionId);
		if (!collection) {
			this.container.textContent = localize('sessionsHeader', "Sessions");
			return;
		}

		const button = DOM.append(this.container, DOM.$('button.session-collections-title-button', {
			type: 'button',
			'aria-haspopup': 'menu',
			'aria-label': localize('switchCollectionAria', "Collection: {0}. Switch Collection", collection.name),
			'data-collection-id': collection.id,
		}));
		button.style.setProperty('--session-collection-accent', collectionAccent(collection));
		const icon = DOM.append(button, DOM.$('span.session-collections-title-icon'));
		renderSessionCollectionIcon(icon, collection.icon);
		DOM.append(button, DOM.$('span.session-collections-title-label', undefined, collection.name));
		DOM.append(button, DOM.$(`span.session-collections-title-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		this.renderStore.add(this.delegate.registerCollectionAnchor(collection.id, button));
		this.renderStore.add(this.hoverService.setupDelayedHover(button, { content: collection.name, appearance: { compact: true } }));
		this.renderStore.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.delegate.showCollectionMenu(button)));
	}
}

export function shouldShowCollectionsInSidebar(
	collectionsEnabled: IObservable<boolean>,
	collectionSwitcher: IObservable<string>,
	expectedSwitcher: string,
	collectionsService: ISessionCollectionsService,
	reader: IReader,
): boolean {
	return collectionsEnabled.read(reader) && collectionSwitcher.read(reader) === expectedSwitcher && collectionsService.collections.read(reader).length > 1;
}
