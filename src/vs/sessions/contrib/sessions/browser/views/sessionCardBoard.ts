/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionCardBoard.css';
import { $, addDisposableListener, AnimationFrameScheduler, DragAndDropObserver, EventType, getActiveElement, getWindow, isAncestorOfActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Orientation, OrthogonalEdge, Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { Action } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import type { SessionView } from '../../../../browser/parts/sessionView.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { SessionsBoardFocusContext } from '../../../../common/contextkeys.js';
import { ISessionsBoardView } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionCardBoardSize, ISessionCardBoardState, SESSION_CARD_MAX_HEIGHT } from '../../../../services/sessions/common/sessionCardLayout.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionCardLayout, ISessionCardPlacement, layoutSessionCards, moveSessionCard, SESSION_CARD_GAP, sessionCardDropIndex, sessionCardSpanForWidth, visibleSessionCards } from '../../common/sessionCardLayout.js';
import { ISessionWorkCardData, SESSION_WORK_CARD_HEIGHT, SessionWorkCard } from './sessionWorkCard.js';

export type { ISessionCardBoardSize, ISessionCardBoardState } from '../../../../services/sessions/common/sessionCardLayout.js';

export interface ISessionCardBoardOptions {
	readonly initialState?: ISessionCardBoardState;
	readonly scrollBy?: (delta: number) => void;
	readonly getViewport?: () => { readonly top: number; readonly height: number };
	readonly getActions?: (data: ISessionWorkCardData, layoutActions: readonly Action[]) => readonly Action[];
	/** Reuse actions while their availability and labels have the same key. */
	readonly getActionsKey?: (data: ISessionWorkCardData) => string;
	readonly onOpen?: (data: ISessionWorkCardData) => void;
	readonly selectable?: boolean;
	readonly externalDrop?: {
		canDrop(event: DragEvent): boolean;
		drop(event: DragEvent): void;
	};
}

interface ICardRecord {
	readonly slot: HTMLElement;
	readonly card: SessionWorkCard;
	readonly east: Sash;
	readonly south: Sash;
	readonly store: DisposableStore;
	readonly updateActions: () => void;
	placement: ISessionCardPlacement;
}

interface ICardGesture {
	readonly kind: 'resize' | 'reorder';
	readonly id: string;
	readonly original: ISessionCardBoardState;
	readonly layout: ISessionCardLayout;
	readonly axes: Set<'width' | 'height'>;
	readonly focus: HTMLElement | undefined;
	preview: ISessionCardBoardState;
	cancelled: boolean;
}

/** A shared card layout and gesture owner, independent of the session catalog and scroll host. */
export class SessionCardBoard extends Disposable implements ISessionsBoardView {
	readonly element = $('.session-card-board');
	private readonly cardsElement = $('.session-card-board-items');
	private readonly placeholder = $('.session-card-board-placeholder', { 'aria-hidden': 'true' });
	private readonly emptyDrop = $('.session-card-board-empty');
	private hasRendered = false;
	private readonly records = new Map<string, ICardRecord>();
	private readonly measurements = new Map<string, number>();
	private readonly gestureStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly dragImage = this._register(new MutableDisposable<DisposableStore>());
	private readonly transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	private readonly instantiation: IInstantiationService;
	private readonly renderScheduler = this._register(new AnimationFrameScheduler(this.element, () => this.renderLayout()));
	private readonly _onDidChangeHeight = this._register(new Emitter<number>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly _onDidChangeLayout = this._register(new Emitter<ISessionCardBoardState>());
	readonly onDidChangeLayout = this._onDidChangeLayout.event;
	private readonly _onDidChangeSelection = this._register(new Emitter<readonly string[]>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidFocusSession = this._register(new Emitter<string>());
	readonly onDidFocusSession = this._onDidFocusSession.event;
	private readonly _onDidChangeFocus = this._register(new Emitter<boolean>());
	readonly onDidChangeFocus = this._onDidChangeFocus.event;
	private selected = new Set<string>();
	private suspended = false;
	private data = new Map<string, ISessionWorkCardData>();
	private state: ISessionCardBoardState;
	private gesture: ICardGesture | undefined;
	private width = 0;
	private viewport = { top: 0, height: 0 };
	private focusedId: string | undefined;
	private draggedId: string | undefined;
	private currentLayout: ISessionCardLayout = layoutSessionCards([], 0);

	get sessions(): readonly ISession[] { return this.state.order.flatMap(id => this.data.get(id)?.session ?? []); }
	get layoutInfo(): ISessionCardLayout { return this.currentLayout; }
	get layoutState(): ISessionCardBoardState { return this.state; }
	get hasFocus(): boolean { return isAncestorOfActiveElement(this.element); }
	get focusedSessionId(): string | undefined { return this.focusedId; }
	get isInteracting(): boolean { return !!this.gesture || this.hasFocus; }

	constructor(
		entries: readonly ISessionWorkCardData[],
		private readonly options: ISessionCardBoardOptions,
		@IInstantiationService instantiation: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.state = options.initialState ?? { order: [], sizes: [] };
		this.emptyDrop.textContent = localize('sessionCardBoard.emptyCollection', "Drop sessions here to add them to this collection.");
		this.emptyDrop.hidden = true;
		this.element.append(this.cardsElement, this.placeholder, this.emptyDrop);
		this.cardsElement.setAttribute('role', 'list');
		this.cardsElement.setAttribute('aria-label', localize('sessionCardBoard.label', "Session cards"));
		this.placeholder.hidden = true;
		const context = this._register(contextKeyService.createScoped(this.element));
		SessionsBoardFocusContext.bindTo(context).set(true);
		this.instantiation = this._register(instantiation.createChild(new ServiceCollection([IContextKeyService, context])));
		this._register(new DragAndDropObserver(this.element, {
			onDragOver: event => {
				if (this.gesture?.kind !== 'reorder' || this.gesture.cancelled) {
					const accepted = this.options.externalDrop?.canDrop(event) ?? false;
					this.element.classList.toggle('collection-drop-target', accepted);
					if (event.dataTransfer) { event.dataTransfer.dropEffect = accepted ? 'move' : 'none'; }
					if (accepted) {
						event.preventDefault();
					}
					return;
				}
				event.preventDefault();
				if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }
				const bounds = this.element.getBoundingClientRect();
				const y = event.clientY - bounds.top;
				this.previewReorder(event.clientX - bounds.left, y);
				const edge = y - this.viewport.top;
				if (edge < 32) { this.options.scrollBy?.(-12); }
				else if (edge > this.viewport.height - 32) { this.options.scrollBy?.(12); }
			},
			onDrop: event => {
				this.element.classList.remove('collection-drop-target');
				if (this.gesture?.kind !== 'reorder') {
					if (this.options.externalDrop?.canDrop(event)) {
						event.preventDefault();
						event.stopPropagation();
						this.options.externalDrop.drop(event);
					}
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.commitGesture();
			},
			onDragLeave: () => this.element.classList.remove('collection-drop-target'),
		}));
		this.setItems(entries);
	}

	setItems(entries: readonly ISessionWorkCardData[]): void {
		if (new Set(entries.map(entry => entry.session.sessionId)).size !== entries.length) { throw new Error('Duplicate session card identity'); }
		if (this.hasRendered && equals([...this.data.values()], entries)) { return; }
		const previous = this.data;
		this.data = new Map(entries.map(entry => [entry.session.sessionId, entry]));
		if (this.gesture && !this.data.has(this.gesture.id)) {
			this.cancelGesture(false);
			this.commitGesture();
			status(localize('sessionCardBoard.removed', "The card is no longer available. The layout change was cancelled."));
		}
		this.state = this.withCurrentItems(this.state);
		for (const [id, record] of this.records) {
			const data = this.data.get(id);
			if (data && previous.get(id) !== data) { record.card.update(data); }
		}
		this.renderLayout();
	}

	layout(width: number, height: number): void {
		const viewport = this.options.getViewport?.() ?? { top: this.viewport.top, height };
		if (width === this.width && viewport.top === this.viewport.top && viewport.height === this.viewport.height) { return; }
		if (width !== this.width && this.gesture) { this.cancelGesture(false); this.commitGesture(); }
		this.width = width;
		this.viewport = viewport;
		this.renderLayout();
	}

	setViewport(top: number, height: number): void {
		if (top === this.viewport.top && height === this.viewport.height) { return; }
		this.viewport = { top, height };
		this.renderLayout();
	}

	setLayoutState(state: ISessionCardBoardState): void {
		if (this.gesture || state === this.state) { return; }
		const next = this.withCurrentItems(state);
		if (!this.layoutChanged(this.state, next)) { this.state = next; return; }
		this.state = next;
		this.renderLayout();
	}

	setSuspended(suspended: boolean): void {
		if (this.suspended === suspended) { return; }
		this.suspended = suspended;
		this.renderLayout();
	}

	setSelection(ids: readonly string[]): void {
		this.selected = new Set(ids.filter(id => this.data.has(id)));
		for (const [id, record] of this.records) {
			record.card.setSelectionState(this.options.selectable ? this.selected.has(id) : undefined);
		}
	}

	private compute(state: ISessionCardBoardState): ISessionCardLayout {
		const sizes = new Map(state.sizes.map(size => [size.id, size]));
		return layoutSessionCards(state.order.filter(id => this.data.has(id)).map(id => {
			const size = sizes.get(id);
			const original = this.gesture?.layout.cards.find(card => card.id === id);
			const originalSize = this.gesture?.original.sizes.find(size => size.id === id);
			const naturalHeight = this.measurements.get(id) ?? (this.data.get(id)?.summary.attention === 'input' ? 240 : SESSION_WORK_CARD_HEIGHT);
			return { id, columnSpan: size?.columnSpan ?? 1, height: size?.height ?? (originalSize?.height === undefined ? original?.height : undefined) ?? naturalHeight };
		}), this.width);
	}

	private renderLayout(): void {
		if (this._store.isDisposed) { return; }
		this.hasRendered = true;
		const state = this.gesture && !this.gesture.cancelled ? this.gesture.preview : this.state;
		const layout = this.compute(state);
		const previousHeight = this.currentLayout.height;
		this.currentLayout = layout;
		this.element.style.height = `${Math.max(layout.height, this.options.externalDrop && !layout.cards.length ? 112 : 0)}px`;
		this.element.classList.toggle('empty-drop-target', !!this.options.externalDrop && !layout.cards.length);
		this.emptyDrop.hidden = !this.options.externalDrop || layout.cards.length > 0;
		if (this.options.getViewport) { this.viewport = this.options.getViewport(); }
		const visible = new Set(visibleSessionCards(layout, this.viewport.top, this.viewport.height));
		const mounted = new Set(visibleSessionCards(layout, this.viewport.top, this.viewport.height, SESSION_WORK_CARD_HEIGHT));
		if (this.focusedId && this.data.has(this.focusedId)) { mounted.add(this.focusedId); }
		for (const [id, record] of this.records) {
			if (this.data.has(id) && (record.card.hasFocus || this.gesture?.id === id)) { mounted.add(id); }
			if (!mounted.has(id)) {
				record.store.dispose();
				record.slot.remove();
				this.records.delete(id);
			}
		}
		for (const placement of layout.cards) {
			if (!mounted.has(placement.id)) { continue; }
			let record = this.records.get(placement.id);
			if (!record) { record = this.createCard(placement); this.records.set(placement.id, record); }
			record.placement = placement;
			record.slot.style.transform = `translate(${placement.left}px, ${placement.top}px)`;
			record.slot.style.width = `${placement.width}px`;
			record.slot.style.height = `${placement.height}px`;
			record.slot.setAttribute('aria-posinset', String(state.order.indexOf(placement.id) + 1));
			record.slot.setAttribute('aria-setsize', String(state.order.length));
			const size = state.sizes.find(size => size.id === placement.id);
			record.card.layout(this.width, { width: placement.width, height: placement.height, expanded: size?.height !== undefined });
			record.card.setVisible(!this.suspended && (visible.has(placement.id) || record.card.hasFocus || this.gesture?.id === placement.id));
			record.card.setSelectionState(this.options.selectable ? this.selected.has(placement.id) : undefined);
			record.east.layout();
			record.south.layout();
			record.updateActions();
			record.slot.classList.toggle('drag-source', this.gesture?.kind === 'reorder' && !this.gesture.cancelled && this.gesture.id === placement.id);
		}
		if (!this.gesture) {
			let index = 0;
			for (const id of state.order) {
				const slot = this.records.get(id)?.slot;
				if (slot && this.cardsElement.children[index] !== slot) { this.cardsElement.insertBefore(slot, this.cardsElement.children[index] ?? null); }
				if (slot) { index++; }
			}
		}
		const preview = this.gesture && !this.gesture.cancelled ? layout.cards.find(card => card.id === this.gesture!.id) : undefined;
		this.placeholder.hidden = !preview;
		if (preview) {
			this.placeholder.style.transform = `translate(${preview.left}px, ${preview.top}px)`;
			this.placeholder.style.width = `${preview.width}px`;
			this.placeholder.style.height = `${preview.height}px`;
			this.placeholder.textContent = this.gesture?.kind === 'reorder' ? localize('sessionCardBoard.dropHere', "Move Here") : '';
		}
		this.element.classList.toggle('gesturing', !!this.gesture && !this.gesture.cancelled);
		this.element.classList.toggle('resizing', this.gesture?.kind === 'resize' && !this.gesture.cancelled);
		if (previousHeight !== layout.height) { this._onDidChangeHeight.fire(layout.height); }
	}

	private createCard(placement: ISessionCardPlacement): ICardRecord {
		const store = new DisposableStore();
		const slot = $('.session-card-board-slot', { role: 'listitem', 'data-card-id': placement.id });
		const card = store.add(this.instantiation.createInstance(SessionWorkCard));
		card.setLayoutControlled(true);
		slot.appendChild(card.element);
		this.cardsElement.appendChild(slot);
		const geometry = { placement };
		const east = store.add(new Sash(slot, { getVerticalSashLeft: () => geometry.placement.width }, { orientation: Orientation.VERTICAL }));
		const south = store.add(new Sash(slot, { getHorizontalSashTop: () => geometry.placement.height }, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.South }));
		east.orthogonalEndSash = south;
		south.orthogonalEndSash = east;
		const actionStore = store.add(new DisposableStore());
		let actionData: ISessionWorkCardData | undefined;
		let actionKey: string | undefined;
		let currentActions: readonly Action[] = [];
		const record: ICardRecord = {
			slot, card, store, east, south,
			get placement() { return geometry.placement; },
			set placement(value: ISessionCardPlacement) { geometry.placement = value; },
			updateActions: () => {
				const index = this.state.order.indexOf(placement.id);
				const expanded = this.state.sizes.some(size => size.id === placement.id && size.height !== undefined);
				actions[0].label = expanded ? localize('sessionCardBoard.collapse', "Collapse Conversation") : localize('sessionCardBoard.expand', "Expand Conversation");
				actions[0].class = ThemeIcon.asClassName(expanded ? Codicon.chevronUp : Codicon.chevronDown);
				actions[1].enabled = index > 0;
				actions[2].enabled = index < this.state.order.length - 1;
				const data = this.data.get(placement.id);
				if (!data || actionData === data) { return; }
				const nextKey = this.options.getActionsKey?.(data);
				const actionsUnchanged = actionData !== undefined && nextKey !== undefined && actionKey === nextKey;
				actionData = data;
				actionKey = nextKey;
				if (actionsUnchanged) { return; }
				const next = this.options.getActions?.(data, actions) ?? actions;
				if (currentActions.length === next.length && currentActions.every((action, index) => action.id === next[index].id)) {
					for (let index = 0; index < next.length; index++) {
						const current = currentActions[index], incoming = next[index];
						if (current !== incoming) {
							current.label = incoming.label;
							current.tooltip = incoming.tooltip;
							current.class = incoming.class;
							current.enabled = incoming.enabled;
							current.checked = incoming.checked;
							if (!actions.includes(incoming)) { incoming.dispose(); }
						}
					}
				} else {
					actionStore.clear();
					for (const action of next) { if (!actions.includes(action)) { actionStore.add(action); } }
					currentActions = next;
					card.setActions(next);
				}
			},
		};
		for (const [axis, sash] of [['width', east], ['height', south]] as const) {
			store.add(sash.onDidStart(() => { this.beginResize(placement.id); this.gesture?.axes.add(axis); }));
			store.add(sash.onDidChange(event => {
				if (this.gesture?.kind !== 'resize' || this.gesture.cancelled) { return; }
				const original = this.gesture.layout.cards.find(item => item.id === placement.id)!;
				this.previewResize(axis === 'width' ? original.width + event.currentX - event.startX : undefined,
					axis === 'height' ? original.height + event.currentY - event.startY : undefined);
			}));
			store.add(sash.onDidEnd(() => {
				this.gesture?.axes.delete(axis);
				if (!this.gesture?.axes.size) { this.commitGesture(); }
			}));
			store.add(sash.onDidReset(() => this.updateSize(placement.id, axis === 'width' ? { columnSpan: 1 } : { height: undefined })));
		}
		store.add(card.onDidChangePreferredHeight(height => {
			if (!this.state.sizes.find(size => size.id === placement.id)?.height) {
				this.measurements.set(placement.id, height);
				if (!this.gesture) { this.renderScheduler.schedule(); }
			}
		}));
		store.add(card.onDidChangeFocus(focused => {
			if (focused) { this.focusedId = placement.id; this._onDidFocusSession.fire(placement.id); }
			this._onDidChangeFocus.fire(focused);
			this.renderScheduler.schedule();
		}));
		store.add(card.onDidRequestOpen(() => this.openCard(placement.id)));
		store.add(card.onDidChangeSelection(selected => {
			if (selected) { this.selected.add(placement.id); } else { this.selected.delete(placement.id); }
			this.setSelection([...this.selected]);
			this._onDidChangeSelection.fire([...this.selected]);
		}));
		const data = this.data.get(placement.id)!;
		card.update(data);
		const actions = [
			new Action('sessionCardBoard.expand', localize('sessionCardBoard.expand', "Expand Conversation"), ThemeIcon.asClassName(Codicon.chevronDown), true, () => { this.toggleMaximizeSession(placement.id); }),
			new Action('sessionCardBoard.earlier', localize('sessionCardBoard.earlier', "Move Earlier"), ThemeIcon.asClassName(Codicon.arrowLeft), true, () => this.moveCard(placement.id, -1)),
			new Action('sessionCardBoard.later', localize('sessionCardBoard.later', "Move Later"), ThemeIcon.asClassName(Codicon.arrowRight), true, () => this.moveCard(placement.id, 1)),
			new Action('sessionCardBoard.reset', localize('sessionCardBoard.resetCard', "Reset Card Size"), ThemeIcon.asClassName(Codicon.discard), true, () => this.updateSize(placement.id, { columnSpan: 1, height: undefined })),
		];
		for (const action of actions) { store.add(action); }
		let canDrag = true;
		card.dragHandle.draggable = true;
		store.add(addDisposableListener(card.dragHandle, EventType.POINTER_DOWN, event => { canDrag = card.isDragHandle(event.target); }, true));
		store.add(new DragAndDropObserver(card.dragHandle, {
			onDragStart: event => {
				if (!canDrag || !event.dataTransfer) { event.preventDefault(); return; }
				this.beginReorder(placement.id);
				const session = this.data.get(placement.id)!.session;
				this.draggedId = placement.id;
				this.transfer.setData([new DraggedSessionIdentifier(session.sessionId, session.resource)], DraggedSessionIdentifier.prototype);
				event.dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() }));
				event.dataTransfer.effectAllowed = 'move';
				const imageStore = new DisposableStore();
				this.dragImage.value = imageStore;
				const ghost = $('.monaco-drag-image.session-card-board-drag-image');
				ghost.textContent = session.title.get();
				this.element.appendChild(ghost);
				imageStore.add({ dispose: () => ghost.remove() });
				event.dataTransfer.setDragImage(ghost, 16, 16);
			},
			onDragEnd: () => {
				if (this.gesture?.kind === 'reorder') { this.cancelGesture(); this.commitGesture(); }
				this.clearDragTransfer();
				this.dragImage.clear();
			},
		}));
		store.add(addDisposableListener(card.dragHandle, EventType.KEY_DOWN, event => {
			if (event.target !== card.dragHandle || event.ctrlKey || event.metaKey) { return; }
			if (!event.altKey && !event.shiftKey && event.key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();
				this.openCard(placement.id);
				return;
			}
			if (!event.altKey && !event.shiftKey && event.key === ' ' && this.options.selectable) {
				event.preventDefault();
				event.stopPropagation();
				if (this.selected.has(placement.id)) { this.selected.delete(placement.id); } else { this.selected.add(placement.id); }
				this.setSelection([...this.selected]);
				this._onDidChangeSelection.fire([...this.selected]);
				return;
			}
			if (event.altKey && event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
				event.preventDefault();
				event.stopPropagation();
				this.resizeCard(placement.id, event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0,
					event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40 : 0);
				return;
			}
			if (event.shiftKey) { return; }
			const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
			if (!direction) { return; }
			event.preventDefault();
			event.stopPropagation();
			if (event.altKey) { this.moveCard(placement.id, direction); }
			else {
				const next = this.state.order[this.state.order.indexOf(placement.id) + direction];
				if (next) { this.focusSession(next); }
			}
		}));
		return record;
	}

	private openCard(id: string): void {
		const data = this.data.get(id);
		if (!data) { return; }
		if (this.options.onOpen) { this.options.onOpen(data); }
		else { this.toggleMaximizeSession(id); }
	}

	private beginGesture(id: string, kind: ICardGesture['kind']): void {
		if (this.gesture) { return; }
		if (!this.data.has(id)) { throw new Error('The session card is no longer available'); }
		const store = new DisposableStore();
		this.gestureStore.value = store;
		const active = getActiveElement();
		const focus = isHTMLElement(active) && this.records.get(id)?.card.element.contains(active) ? active : undefined;
		this.gesture = { kind, id, original: this.state, preview: this.state, layout: this.currentLayout, axes: new Set(), focus, cancelled: false };
		store.add(addDisposableListener(getWindow(this.element), EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				this.cancelGesture();
			}
		}, true));
		this.renderLayout();
	}

	beginReorder(id: string): void { this.beginGesture(id, 'reorder'); }
	beginResize(id: string): void { this.beginGesture(id, 'resize'); }

	previewReorder(x: number, y: number): void {
		const gesture = this.gesture;
		if (!gesture || gesture.kind !== 'reorder' || gesture.cancelled) { return; }
		const index = sessionCardDropIndex(gesture.layout, gesture.id, x, y);
		gesture.preview = { ...gesture.original, order: moveSessionCard(gesture.original.order, gesture.id, index) };
		this.renderLayout();
	}

	previewResize(width?: number, height?: number): void {
		const gesture = this.gesture;
		if (!gesture || gesture.kind !== 'resize' || gesture.cancelled) { return; }
		if (height !== undefined && !Number.isFinite(height)) { throw new Error('Invalid session card height'); }
		const current = gesture.preview.sizes.find(size => size.id === gesture.id) ?? { id: gesture.id, columnSpan: 1 };
		const size: ISessionCardBoardSize = {
			...current,
			...(width === undefined ? {} : { columnSpan: sessionCardSpanForWidth(width, gesture.layout) }),
			...(height === undefined ? {} : { height: height < SESSION_WORK_CARD_HEIGHT + 40 ? undefined : Math.min(SESSION_CARD_MAX_HEIGHT, Math.max(SESSION_WORK_CARD_HEIGHT + 40, Math.round(height / 8) * 8)) }),
		};
		gesture.preview = { ...gesture.preview, sizes: [...gesture.preview.sizes.filter(size => size.id !== gesture.id), size] };
		this.renderLayout();
	}

	cancelGesture(announce = true): void {
		const gesture = this.gesture;
		if (!gesture || gesture.cancelled) { return; }
		gesture.cancelled = true;
		this.state = gesture.original;
		this.gestureStore.clear();
		this.renderLayout();
		if (announce) { status(localize('sessionCardBoard.cancelled', "Card layout change cancelled.")); }
		if (this.gesture === gesture && !gesture.axes.size && !this.draggedId) { this.commitGesture(); }
	}

	commitGesture(): void {
		const gesture = this.gesture;
		if (!gesture) { return; }
		const changed = !gesture.cancelled && this.layoutChanged(gesture.original, gesture.preview);
		this.state = this.withCurrentItems(changed ? gesture.preview : gesture.original);
		this.gesture = undefined;
		this.gestureStore.clear();
		this.renderLayout();
		if (changed) {
			this._onDidChangeLayout.fire(this.state);
			status(localize('sessionCardBoard.changed', "Card layout updated."));
		}
		if (gesture.kind === 'resize' && gesture.focus?.isConnected && gesture.focus.getClientRects().length) {
			gesture.focus.focus({ preventScroll: true });
		} else {
			this.focusSession(gesture.id);
		}
	}

	private withCurrentItems(state: ISessionCardBoardState): ISessionCardBoardState {
		const previousIds = new Set(state.order);
		const order = [...state.order.filter(id => this.data.has(id)), ...[...this.data.keys()].filter(id => !previousIds.has(id))];
		const sizes = state.sizes.filter(size => this.data.has(size.id));
		return equals(order, state.order) && equals(sizes, state.sizes) ? state : { order, sizes };
	}

	private layoutChanged(before: ISessionCardBoardState, after: ISessionCardBoardState): boolean {
		if (!equals(before.order, after.order)) { return true; }
		const previousSizes = new Map(before.sizes.map(size => [size.id, size]));
		const nextSizes = new Map(after.sizes.map(size => [size.id, size]));
		return before.order.some(id => {
			const previous = previousSizes.get(id);
			const next = nextSizes.get(id);
			return (previous?.columnSpan ?? 1) !== (next?.columnSpan ?? 1) || previous?.height !== next?.height;
		});
	}

	private updateSize(id: string, update: Partial<Omit<ISessionCardBoardSize, 'id'>>): void {
		const previous = this.state.sizes.find(size => size.id === id) ?? { id, columnSpan: 1 };
		this.state = { ...this.state, sizes: [...this.state.sizes.filter(size => size.id !== id), { ...previous, ...update }] };
		this.renderLayout();
		this._onDidChangeLayout.fire(this.state);
	}

	moveCard(id: string, direction: number): void {
		const index = this.state.order.indexOf(id);
		if (index < 0) { throw new Error('The session card is no longer available'); }
		const nextIndex = Math.max(0, Math.min(this.state.order.length - 1, index + direction));
		if (nextIndex === index) {
			status(direction < 0 ? localize('sessionCardBoard.first', "The card is already first.") : localize('sessionCardBoard.last', "The card is already last."));
			return;
		}
		this.state = { ...this.state, order: moveSessionCard(this.state.order, id, nextIndex) };
		this.renderLayout();
		this._onDidChangeLayout.fire(this.state);
		this.focusSession(id);
		status(localize('sessionCardBoard.moved', "Moved card to position {0} of {1}.", this.state.order.indexOf(id) + 1, this.state.order.length));
	}

	focusSession(id = this.focusedId ?? this.state.order[0]): void {
		const placement = this.currentLayout.cards.find(card => card.id === id);
		if (!placement) { return; }
		if (placement.top < this.viewport.top) { this.options.scrollBy?.(placement.top - this.viewport.top); }
		else if (placement.top + placement.height > this.viewport.top + this.viewport.height) { this.options.scrollBy?.(placement.top + placement.height - this.viewport.top - this.viewport.height); }
		this.focusedId = id;
		this.renderLayout();
		this.records.get(id)?.card.dragHandle.focus();
	}

	resizeCard(id: string | undefined, widthChange: number, heightChange: number): void {
		id ??= this.focusedId;
		const placement = this.currentLayout.cards.find(card => card.id === id);
		if (!id || !placement) { return; }
		this.beginResize(id);
		this.previewResize(widthChange ? placement.width + Math.sign(widthChange) * (this.currentLayout.columnWidth + SESSION_CARD_GAP) : undefined,
			heightChange ? placement.height + heightChange : undefined);
		this.commitGesture();
	}

	toggleMaximizeSession(id: string | undefined): boolean | undefined {
		id ??= this.focusedId;
		if (!id || !this.data.has(id)) { return undefined; }
		const expanded = this.state.sizes.find(size => size.id === id)?.height === undefined;
		this.updateSize(id, { height: expanded ? 360 : undefined });
		return expanded;
	}

	resetLayout(): void {
		if (this.gesture) { this.cancelGesture(false); this.commitGesture(); }
		this.state = { order: [...this.data.keys()], sizes: [] };
		this.renderLayout();
		this._onDidChangeLayout.fire(this.state);
	}

	getSessionView(_id: string | undefined): SessionView | undefined { return undefined; }
	getFocusedSessionView(): SessionView | undefined { return undefined; }
	getAccessibilityHelp(): string {
		return localize('sessionCardBoard.help', "Cards wrap into columns. Drag a card header to reorder it, or use its Move Earlier and Move Later actions. The placeholder shows the exact destination; Escape cancels. Drag the right or bottom edge to resize, or the corner to change both dimensions. Width snaps to columns. Double-click an edge to reset that dimension. With the header focused, Left and Right Arrow move focus; Alt+Left and Alt+Right move the card. Alt+Shift+Arrow keys resize it. The input stays below expanded conversation content. Only visible pending cards load question or approval controls automatically.");
	}
	getAccessibleContent(): string {
		return this.state.order.map((id, index) => {
			const card = this.records.get(id)?.card;
			const data = this.data.get(id)!;
			return localize('sessionCardBoard.accessibleCard', "Card {0} of {1}\n{2}", index + 1, this.state.order.length,
				card?.getAccessibleContent() ?? `${data.session.title.get()}\n${data.description}`);
		}).join('\n\n');
	}

	override dispose(): void {
		for (const record of this.records.values()) { record.store.dispose(); }
		this.records.clear();
		this.element.remove();
		this.clearDragTransfer();
		super.dispose();
	}

	private clearDragTransfer(): void {
		if (this.draggedId && this.transfer.getData(DraggedSessionIdentifier.prototype)?.[0]?.sessionId === this.draggedId) {
			this.transfer.clearData(DraggedSessionIdentifier.prototype);
		}
		this.draggedId = undefined;
	}
}
