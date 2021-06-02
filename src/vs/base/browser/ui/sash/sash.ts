/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./sash';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import { EventType, Gesture, GestureEvent } from 'vs/base/browser/touch';
import { Event, Emitter } from 'vs/base/common/event';
import { getElementsByTagName, EventHelper, createStyleSheet, append, $, EventLike } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { Delayer } from 'vs/base/common/async';
import { memoize } from 'vs/base/common/decorators';

let DEBUG = false;
// DEBUG = Boolean("true"); // done "weirdly" so that a lint warning prevents you from pushing this

export interface ISashLayoutProvider { }

export interface IVerticalSashLayoutProvider extends ISashLayoutProvider {
	getVerticalSashLeft(sash: Sash): number;
	getVerticalSashTop?(sash: Sash): number;
	getVerticalSashHeight?(sash: Sash): number;
}

export interface IHorizontalSashLayoutProvider extends ISashLayoutProvider {
	getHorizontalSashTop(sash: Sash): number;
	getHorizontalSashLeft?(sash: Sash): number;
	getHorizontalSashWidth?(sash: Sash): number;
}

export interface ISashEvent {
	startX: number;
	currentX: number;
	startY: number;
	currentY: number;
	altKey: boolean;
}

export enum OrthogonalEdge {
	North = 'north',
	South = 'south',
	East = 'east',
	West = 'west'
}

export interface ISashOptions {
	readonly orientation: Orientation;
	readonly orthogonalStartSash?: Sash;
	readonly orthogonalEndSash?: Sash;
	readonly size?: number;
	readonly orthogonalEdge?: OrthogonalEdge;
}

export interface IVerticalSashOptions extends ISashOptions {
	readonly orientation: Orientation.VERTICAL;
}

export interface IHorizontalSashOptions extends ISashOptions {
	readonly orientation: Orientation.HORIZONTAL;
}

export const enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export const enum SashState {
	Disabled,
	Minimum,
	Maximum,
	Enabled
}

let globalSize = 4;
const onDidChangeGlobalSize = new Emitter<number>();
export function setGlobalSashSize(size: number): void {
	globalSize = size;
	onDidChangeGlobalSize.fire(size);
}

let globalHoverDelay = 300;
const onDidChangeHoverDelay = new Emitter<number>();
export function setGlobalHoverDelay(size: number): void {
	globalHoverDelay = size;
	onDidChangeHoverDelay.fire(size);
}

interface PointerEvent extends EventLike {
	readonly pageX: number;
	readonly pageY: number;
	readonly altKey: boolean;
	readonly target: EventTarget | null;
}

interface IPointerEventFactory {
	readonly onPointerMove: Event<PointerEvent>;
	readonly onPointerUp: Event<PointerEvent>;
	dispose(): void;
}

class MouseEventFactory implements IPointerEventFactory {

	private disposables = new DisposableStore();

	@memoize
	get onPointerMove(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(window, 'mousemove')).event;
	}

	@memoize
	get onPointerUp(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(window, 'mouseup')).event;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

class GestureEventFactory implements IPointerEventFactory {

	private disposables = new DisposableStore();

	@memoize
	get onPointerMove(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(this.el, EventType.Change)).event;
	}

	@memoize
	get onPointerUp(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(this.el, EventType.End)).event;
	}

	constructor(private el: HTMLElement) { }

	dispose(): void {
		this.disposables.dispose();
	}
}

class OrthogonalPointerEventFactory implements IPointerEventFactory {

	@memoize
	get onPointerMove(): Event<PointerEvent> {
		return this.factory.onPointerMove;
	}

	@memoize
	get onPointerUp(): Event<PointerEvent> {
		return this.factory.onPointerUp;
	}

	constructor(private factory: IPointerEventFactory) { }

	dispose(): void {
		// noop
	}
}

export class Sash extends Disposable {

	private el: HTMLElement;
	private layoutProvider: ISashLayoutProvider;
	private hidden: boolean;
	private orientation!: Orientation;
	private size: number;
	private hoverDelay = globalHoverDelay;
	private hoverDelayer = this._register(new Delayer(this.hoverDelay));

	private _state: SashState = SashState.Enabled;
	get state(): SashState { return this._state; }
	set state(state: SashState) {
		if (this._state === state) {
			return;
		}

		this.el.classList.toggle('disabled', state === SashState.Disabled);
		this.el.classList.toggle('minimum', state === SashState.Minimum);
		this.el.classList.toggle('maximum', state === SashState.Maximum);

		this._state = state;
		this._onDidEnablementChange.fire(state);
	}

	private readonly _onDidEnablementChange = this._register(new Emitter<SashState>());
	readonly onDidEnablementChange: Event<SashState> = this._onDidEnablementChange.event;

	private readonly _onDidStart = this._register(new Emitter<ISashEvent>());
	readonly onDidStart: Event<ISashEvent> = this._onDidStart.event;

	private readonly _onDidChange = this._register(new Emitter<ISashEvent>());
	readonly onDidChange: Event<ISashEvent> = this._onDidChange.event;

	private readonly _onDidReset = this._register(new Emitter<void>());
	readonly onDidReset: Event<void> = this._onDidReset.event;

	private readonly _onDidEnd = this._register(new Emitter<void>());
	readonly onDidEnd: Event<void> = this._onDidEnd.event;

	linkedSash: Sash | undefined = undefined;

	private readonly orthogonalStartSashDisposables = this._register(new DisposableStore());
	private _orthogonalStartSash: Sash | undefined;
	private readonly orthogonalStartDragHandleDisposables = this._register(new DisposableStore());
	private _orthogonalStartDragHandle: HTMLElement | undefined;
	get orthogonalStartSash(): Sash | undefined { return this._orthogonalStartSash; }
	set orthogonalStartSash(sash: Sash | undefined) {
		this.orthogonalStartDragHandleDisposables.clear();
		this.orthogonalStartSashDisposables.clear();

		if (sash) {
			const onChange = (state: SashState) => {
				this.orthogonalStartDragHandleDisposables.clear();

				if (state !== SashState.Disabled) {
					this._orthogonalStartDragHandle = append(this.el, $('.orthogonal-drag-handle.start'));
					this.orthogonalStartDragHandleDisposables.add(toDisposable(() => this._orthogonalStartDragHandle!.remove()));
					this.orthogonalEndDragHandleDisposables.add(new DomEmitter(this._orthogonalStartDragHandle, 'mouseenter')).event
						(() => Sash.onMouseEnter(sash), undefined, this.orthogonalStartDragHandleDisposables);
					this.orthogonalEndDragHandleDisposables.add(new DomEmitter(this._orthogonalStartDragHandle, 'mouseleave')).event
						(() => Sash.onMouseLeave(sash), undefined, this.orthogonalStartDragHandleDisposables);
				}
			};

			this.orthogonalStartSashDisposables.add(sash.onDidEnablementChange(onChange, this));
			onChange(sash.state);
		}

		this._orthogonalStartSash = sash;
	}

	private readonly orthogonalEndSashDisposables = this._register(new DisposableStore());
	private _orthogonalEndSash: Sash | undefined;
	private readonly orthogonalEndDragHandleDisposables = this._register(new DisposableStore());
	private _orthogonalEndDragHandle: HTMLElement | undefined;
	get orthogonalEndSash(): Sash | undefined { return this._orthogonalEndSash; }
	set orthogonalEndSash(sash: Sash | undefined) {
		this.orthogonalEndDragHandleDisposables.clear();
		this.orthogonalEndSashDisposables.clear();

		if (sash) {
			const onChange = (state: SashState) => {
				this.orthogonalEndDragHandleDisposables.clear();

				if (state !== SashState.Disabled) {
					this._orthogonalEndDragHandle = append(this.el, $('.orthogonal-drag-handle.end'));
					this.orthogonalEndDragHandleDisposables.add(toDisposable(() => this._orthogonalEndDragHandle!.remove()));
					this.orthogonalEndDragHandleDisposables.add(new DomEmitter(this._orthogonalEndDragHandle, 'mouseenter')).event
						(() => Sash.onMouseEnter(sash), undefined, this.orthogonalEndDragHandleDisposables);
					this.orthogonalEndDragHandleDisposables.add(new DomEmitter(this._orthogonalEndDragHandle, 'mouseleave')).event
						(() => Sash.onMouseLeave(sash), undefined, this.orthogonalEndDragHandleDisposables);
				}
			};

			this.orthogonalEndSashDisposables.add(sash.onDidEnablementChange(onChange, this));
			onChange(sash.state);
		}

		this._orthogonalEndSash = sash;
	}

	constructor(container: HTMLElement, layoutProvider: IVerticalSashLayoutProvider, options: ISashOptions);
	constructor(container: HTMLElement, layoutProvider: IHorizontalSashLayoutProvider, options: ISashOptions);
	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions) {
		super();

		this.el = append(container, $('.monaco-sash'));

		if (options.orthogonalEdge) {
			this.el.classList.add(`orthogonal-edge-${options.orthogonalEdge}`);
		}

		if (isMacintosh) {
			this.el.classList.add('mac');
		}

		const onMouseDown = this._register(new DomEmitter(this.el, 'mousedown')).event;
		this._register(onMouseDown(e => this.onPointerStart(e, new MouseEventFactory()), this));
		const onMouseDoubleClick = this._register(new DomEmitter(this.el, 'dblclick')).event;
		this._register(onMouseDoubleClick(this.onPointerDoublePress, this));
		const onMouseEnter = this._register(new DomEmitter(this.el, 'mouseenter')).event;
		this._register(onMouseEnter(() => Sash.onMouseEnter(this)));
		const onMouseLeave = this._register(new DomEmitter(this.el, 'mouseleave')).event;
		this._register(onMouseLeave(() => Sash.onMouseLeave(this)));

		this._register(Gesture.addTarget(this.el));

		const onTouchStart = Event.map(this._register(new DomEmitter(this.el, EventType.Start)).event, e => ({ ...e, target: e.initialTarget ?? null }));
		this._register(onTouchStart(e => this.onPointerStart(e, new GestureEventFactory(this.el)), this));
		const onTap = this._register(new DomEmitter(this.el, EventType.Tap)).event;
		const onDoubleTap = Event.map(
			Event.filter(
				Event.debounce<GestureEvent, { event: GestureEvent, count: number }>(onTap, (res, event) => ({ event, count: (res?.count ?? 0) + 1 }), 250),
				({ count }) => count === 2
			),
			({ event }) => ({ ...event, target: event.initialTarget ?? null })
		);
		this._register(onDoubleTap(this.onPointerDoublePress, this));

		if (typeof options.size === 'number') {
			this.size = options.size;

			if (options.orientation === Orientation.VERTICAL) {
				this.el.style.width = `${this.size}px`;
			} else {
				this.el.style.height = `${this.size}px`;
			}
		} else {
			this.size = globalSize;
			this._register(onDidChangeGlobalSize.event(size => {
				this.size = size;
				this.layout();
			}));
		}

		this._register(onDidChangeHoverDelay.event(delay => this.hoverDelay = delay));

		this.hidden = false;
		this.layoutProvider = layoutProvider;

		this.orthogonalStartSash = options.orthogonalStartSash;
		this.orthogonalEndSash = options.orthogonalEndSash;

		this.orientation = options.orientation || Orientation.VERTICAL;

		if (this.orientation === Orientation.HORIZONTAL) {
			this.el.classList.add('horizontal');
			this.el.classList.remove('vertical');
		} else {
			this.el.classList.remove('horizontal');
			this.el.classList.add('vertical');
		}

		this.el.classList.toggle('debug', DEBUG);

		this.layout();
	}

	private onPointerStart(event: PointerEvent, pointerEventFactory: IPointerEventFactory): void {
		EventHelper.stop(event);

		let isMultisashResize = false;

		if (!(event as any).__orthogonalSashEvent) {
			const orthogonalSash = this.getOrthogonalSash(event);

			if (orthogonalSash) {
				isMultisashResize = true;
				(event as any).__orthogonalSashEvent = true;
				orthogonalSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
			}
		}

		if (this.linkedSash && !(event as any).__linkedSashEvent) {
			(event as any).__linkedSashEvent = true;
			this.linkedSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
		}

		if (!this.state) {
			return;
		}

		// Select both iframes and webviews; internally Electron nests an iframe
		// in its <webview> component, but this isn't queryable.
		const iframes = [
			...getElementsByTagName('iframe'),
			...getElementsByTagName('webview'),
		];

		for (const iframe of iframes) {
			iframe.style.pointerEvents = 'none'; // disable mouse events on iframes as long as we drag the sash
		}

		const startX = event.pageX;
		const startY = event.pageY;
		const altKey = event.altKey;
		const startEvent: ISashEvent = { startX, currentX: startX, startY, currentY: startY, altKey };

		this.el.classList.add('active');
		this._onDidStart.fire(startEvent);

		// fix https://github.com/microsoft/vscode/issues/21675
		const style = createStyleSheet(this.el);
		const updateStyle = () => {
			let cursor = '';

			if (isMultisashResize) {
				cursor = 'all-scroll';
			} else if (this.orientation === Orientation.HORIZONTAL) {
				if (this.state === SashState.Minimum) {
					cursor = 's-resize';
				} else if (this.state === SashState.Maximum) {
					cursor = 'n-resize';
				} else {
					cursor = isMacintosh ? 'row-resize' : 'ns-resize';
				}
			} else {
				if (this.state === SashState.Minimum) {
					cursor = 'e-resize';
				} else if (this.state === SashState.Maximum) {
					cursor = 'w-resize';
				} else {
					cursor = isMacintosh ? 'col-resize' : 'ew-resize';
				}
			}

			style.textContent = `* { cursor: ${cursor} !important; }`;
		};

		const disposables = new DisposableStore();

		updateStyle();

		if (!isMultisashResize) {
			this.onDidEnablementChange(updateStyle, null, disposables);
		}

		const onPointerMove = (e: PointerEvent) => {
			EventHelper.stop(e, false);
			const event: ISashEvent = { startX, currentX: e.pageX, startY, currentY: e.pageY, altKey };

			this._onDidChange.fire(event);
		};

		const onPointerUp = (e: PointerEvent) => {
			EventHelper.stop(e, false);

			this.el.removeChild(style);

			this.el.classList.remove('active');
			this._onDidEnd.fire();

			disposables.dispose();

			for (const iframe of iframes) {
				iframe.style.pointerEvents = 'auto';
			}
		};

		pointerEventFactory.onPointerMove(onPointerMove, null, disposables);
		pointerEventFactory.onPointerUp(onPointerUp, null, disposables);
		disposables.add(pointerEventFactory);
	}

	private onPointerDoublePress(e: MouseEvent): void {
		const orthogonalSash = this.getOrthogonalSash(e);

		if (orthogonalSash) {
			orthogonalSash._onDidReset.fire();
		}

		if (this.linkedSash) {
			this.linkedSash._onDidReset.fire();
		}

		this._onDidReset.fire();
	}

	private static onMouseEnter(sash: Sash, fromLinkedSash: boolean = false): void {
		if (sash.el.classList.contains('active')) {
			sash.hoverDelayer.cancel();
			sash.el.classList.add('hover');
		} else {
			sash.hoverDelayer.trigger(() => sash.el.classList.add('hover'), sash.hoverDelay).then(undefined, () => { });
		}

		if (!fromLinkedSash && sash.linkedSash) {
			Sash.onMouseEnter(sash.linkedSash, true);
		}
	}

	private static onMouseLeave(sash: Sash, fromLinkedSash: boolean = false): void {
		sash.hoverDelayer.cancel();
		sash.el.classList.remove('hover');

		if (!fromLinkedSash && sash.linkedSash) {
			Sash.onMouseLeave(sash.linkedSash, true);
		}
	}

	clearSashHoverState(): void {
		Sash.onMouseLeave(this);
	}

	layout(): void {
		if (this.orientation === Orientation.VERTICAL) {
			const verticalProvider = (<IVerticalSashLayoutProvider>this.layoutProvider);
			this.el.style.left = verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px';

			if (verticalProvider.getVerticalSashTop) {
				this.el.style.top = verticalProvider.getVerticalSashTop(this) + 'px';
			}

			if (verticalProvider.getVerticalSashHeight) {
				this.el.style.height = verticalProvider.getVerticalSashHeight(this) + 'px';
			}
		} else {
			const horizontalProvider = (<IHorizontalSashLayoutProvider>this.layoutProvider);
			this.el.style.top = horizontalProvider.getHorizontalSashTop(this) - (this.size / 2) + 'px';

			if (horizontalProvider.getHorizontalSashLeft) {
				this.el.style.left = horizontalProvider.getHorizontalSashLeft(this) + 'px';
			}

			if (horizontalProvider.getHorizontalSashWidth) {
				this.el.style.width = horizontalProvider.getHorizontalSashWidth(this) + 'px';
			}
		}
	}

	show(): void {
		this.hidden = false;
		this.el.style.removeProperty('display');
		this.el.setAttribute('aria-hidden', 'false');
	}

	hide(): void {
		this.hidden = true;
		this.el.style.display = 'none';
		this.el.setAttribute('aria-hidden', 'true');
	}

	isHidden(): boolean {
		return this.hidden;
	}

	private getOrthogonalSash(e: PointerEvent): Sash | undefined {
		if (!e.target || !(e.target instanceof HTMLElement)) {
			return undefined;
		}

		if (e.target.classList.contains('orthogonal-drag-handle')) {
			return e.target.classList.contains('start') ? this.orthogonalStartSash : this.orthogonalEndSash;
		}

		return undefined;
	}

	override dispose(): void {
		super.dispose();
		this.el.remove();
	}
}
