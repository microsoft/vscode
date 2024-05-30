/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, createStyleSheet, EventHelper, EventLike, getWindow, isHTMLElement } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { EventType, Gesture } from 'vs/base/browser/touch';
import { Delayer } from 'vs/base/common/async';
import { memoize } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import 'vs/css!./sash';

/**
 * Allow the sashes to be visible at runtime.
 * @remark Use for development purposes only.
 */
const DEBUG = false;
// DEBUG = Boolean("true"); // done "weirdly" so that a lint warning prevents you from pushing this

/**
 * A vertical sash layout provider provides position and height for a sash.
 */
export interface IVerticalSashLayoutProvider {
	getVerticalSashLeft(sash: Sash): number;
	getVerticalSashTop?(sash: Sash): number;
	getVerticalSashHeight?(sash: Sash): number;
}

/**
 * A vertical sash layout provider provides position and width for a sash.
 */
export interface IHorizontalSashLayoutProvider {
	getHorizontalSashTop(sash: Sash): number;
	getHorizontalSashLeft?(sash: Sash): number;
	getHorizontalSashWidth?(sash: Sash): number;
}

type ISashLayoutProvider = IVerticalSashLayoutProvider | IHorizontalSashLayoutProvider;

export interface ISashEvent {
	readonly startX: number;
	readonly currentX: number;
	readonly startY: number;
	readonly currentY: number;
	readonly altKey: boolean;
}

export enum OrthogonalEdge {
	North = 'north',
	South = 'south',
	East = 'east',
	West = 'west'
}

export interface IBoundarySashes {
	readonly top?: Sash;
	readonly right?: Sash;
	readonly bottom?: Sash;
	readonly left?: Sash;
}

export interface ISashOptions {

	/**
	 * Whether a sash is horizontal or vertical.
	 */
	readonly orientation: Orientation;

	/**
	 * The width or height of a vertical or horizontal sash, respectively.
	 */
	readonly size?: number;

	/**
	 * A reference to another sash, perpendicular to this one, which
	 * aligns at the start of this one. A corner sash will be created
	 * automatically at that location.
	 *
	 * The start of a horizontal sash is its left-most position.
	 * The start of a vertical sash is its top-most position.
	 */
	readonly orthogonalStartSash?: Sash;

	/**
	 * A reference to another sash, perpendicular to this one, which
	 * aligns at the end of this one. A corner sash will be created
	 * automatically at that location.
	 *
	 * The end of a horizontal sash is its right-most position.
	 * The end of a vertical sash is its bottom-most position.
	 */
	readonly orthogonalEndSash?: Sash;

	/**
	 * Provides a hint as to what mouse cursor to use whenever the user
	 * hovers over a corner sash provided by this and an orthogonal sash.
	 */
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

	/**
	 * Disable any UI interaction.
	 */
	Disabled,

	/**
	 * Allow dragging down or to the right, depending on the sash orientation.
	 *
	 * Some OSs allow customizing the mouse cursor differently whenever
	 * some resizable component can't be any smaller, but can be larger.
	 */
	AtMinimum,

	/**
	 * Allow dragging up or to the left, depending on the sash orientation.
	 *
	 * Some OSs allow customizing the mouse cursor differently whenever
	 * some resizable component can't be any larger, but can be smaller.
	 */
	AtMaximum,

	/**
	 * Enable dragging.
	 */
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
	readonly initialTarget?: EventTarget | undefined;
}

interface IPointerEventFactory {
	readonly onPointerMove: Event<PointerEvent>;
	readonly onPointerUp: Event<PointerEvent>;
	dispose(): void;
}

class MouseEventFactory implements IPointerEventFactory {

	private readonly disposables = new DisposableStore();

	constructor(private el: HTMLElement) { }

	@memoize
	get onPointerMove(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(getWindow(this.el), 'mousemove')).event;
	}

	@memoize
	get onPointerUp(): Event<PointerEvent> {
		return this.disposables.add(new DomEmitter(getWindow(this.el), 'mouseup')).event;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

class GestureEventFactory implements IPointerEventFactory {

	private readonly disposables = new DisposableStore();

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

const PointerEventsDisabledCssClass = 'pointer-events-disabled';

/**
 * The {@link Sash} is the UI component which allows the user to resize other
 * components. It's usually an invisible horizontal or vertical line which, when
 * hovered, becomes highlighted and can be dragged along the perpendicular dimension
 * to its direction.
 *
 * Features:
 * - Touch event handling
 * - Corner sash support
 * - Hover with different mouse cursor support
 * - Configurable hover size
 * - Linked sash support, for 2x2 corner sashes
 */
export class Sash extends Disposable {

	private el: HTMLElement;
	private layoutProvider: ISashLayoutProvider;
	private orientation: Orientation;
	private size: number;
	private hoverDelay = globalHoverDelay;
	private hoverDelayer = this._register(new Delayer(this.hoverDelay));

	private _state: SashState = SashState.Enabled;
	private readonly onDidEnablementChange = this._register(new Emitter<SashState>());
	private readonly _onDidStart = this._register(new Emitter<ISashEvent>());
	private readonly _onDidChange = this._register(new Emitter<ISashEvent>());
	private readonly _onDidReset = this._register(new Emitter<void>());
	private readonly _onDidEnd = this._register(new Emitter<void>());
	private readonly orthogonalStartSashDisposables = this._register(new DisposableStore());
	private _orthogonalStartSash: Sash | undefined;
	private readonly orthogonalStartDragHandleDisposables = this._register(new DisposableStore());
	private _orthogonalStartDragHandle: HTMLElement | undefined;
	private readonly orthogonalEndSashDisposables = this._register(new DisposableStore());
	private _orthogonalEndSash: Sash | undefined;
	private readonly orthogonalEndDragHandleDisposables = this._register(new DisposableStore());
	private _orthogonalEndDragHandle: HTMLElement | undefined;

	get state(): SashState { return this._state; }
	get orthogonalStartSash(): Sash | undefined { return this._orthogonalStartSash; }
	get orthogonalEndSash(): Sash | undefined { return this._orthogonalEndSash; }

	/**
	 * The state of a sash defines whether it can be interacted with by the user
	 * as well as what mouse cursor to use, when hovered.
	 */
	set state(state: SashState) {
		if (this._state === state) {
			return;
		}

		this.el.classList.toggle('disabled', state === SashState.Disabled);
		this.el.classList.toggle('minimum', state === SashState.AtMinimum);
		this.el.classList.toggle('maximum', state === SashState.AtMaximum);

		this._state = state;
		this.onDidEnablementChange.fire(state);
	}

	/**
	 * An event which fires whenever the user starts dragging this sash.
	 */
	readonly onDidStart: Event<ISashEvent> = this._onDidStart.event;

	/**
	 * An event which fires whenever the user moves the mouse while
	 * dragging this sash.
	 */
	readonly onDidChange: Event<ISashEvent> = this._onDidChange.event;

	/**
	 * An event which fires whenever the user double clicks this sash.
	 */
	readonly onDidReset: Event<void> = this._onDidReset.event;

	/**
	 * An event which fires whenever the user stops dragging this sash.
	 */
	readonly onDidEnd: Event<void> = this._onDidEnd.event;

	/**
	 * A linked sash will be forwarded the same user interactions and events
	 * so it moves exactly the same way as this sash.
	 *
	 * Useful in 2x2 grids. Not meant for widespread usage.
	 */
	linkedSash: Sash | undefined = undefined;

	/**
	 * A reference to another sash, perpendicular to this one, which
	 * aligns at the start of this one. A corner sash will be created
	 * automatically at that location.
	 *
	 * The start of a horizontal sash is its left-most position.
	 * The start of a vertical sash is its top-most position.
	 */
	set orthogonalStartSash(sash: Sash | undefined) {
		if (this._orthogonalStartSash === sash) {
			return;
		}

		this.orthogonalStartDragHandleDisposables.clear();
		this.orthogonalStartSashDisposables.clear();

		if (sash) {
			const onChange = (state: SashState) => {
				this.orthogonalStartDragHandleDisposables.clear();

				if (state !== SashState.Disabled) {
					this._orthogonalStartDragHandle = append(this.el, $('.orthogonal-drag-handle.start'));
					this.orthogonalStartDragHandleDisposables.add(toDisposable(() => this._orthogonalStartDragHandle!.remove()));
					this.orthogonalStartDragHandleDisposables.add(new DomEmitter(this._orthogonalStartDragHandle, 'mouseenter')).event
						(() => Sash.onMouseEnter(sash), undefined, this.orthogonalStartDragHandleDisposables);
					this.orthogonalStartDragHandleDisposables.add(new DomEmitter(this._orthogonalStartDragHandle, 'mouseleave')).event
						(() => Sash.onMouseLeave(sash), undefined, this.orthogonalStartDragHandleDisposables);
				}
			};

			this.orthogonalStartSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
			onChange(sash.state);
		}

		this._orthogonalStartSash = sash;
	}

	/**
	 * A reference to another sash, perpendicular to this one, which
	 * aligns at the end of this one. A corner sash will be created
	 * automatically at that location.
	 *
	 * The end of a horizontal sash is its right-most position.
	 * The end of a vertical sash is its bottom-most position.
	 */

	set orthogonalEndSash(sash: Sash | undefined) {
		if (this._orthogonalEndSash === sash) {
			return;
		}

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

			this.orthogonalEndSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
			onChange(sash.state);
		}

		this._orthogonalEndSash = sash;
	}

	/**
	 * Create a new vertical sash.
	 *
	 * @param container A DOM node to append the sash to.
	 * @param verticalLayoutProvider A vertical layout provider.
	 * @param options The options.
	 */
	constructor(container: HTMLElement, verticalLayoutProvider: IVerticalSashLayoutProvider, options: IVerticalSashOptions);

	/**
	 * Create a new horizontal sash.
	 *
	 * @param container A DOM node to append the sash to.
	 * @param horizontalLayoutProvider A horizontal layout provider.
	 * @param options The options.
	 */
	constructor(container: HTMLElement, horizontalLayoutProvider: IHorizontalSashLayoutProvider, options: IHorizontalSashOptions);
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
		this._register(onMouseDown(e => this.onPointerStart(e, new MouseEventFactory(container)), this));
		const onMouseDoubleClick = this._register(new DomEmitter(this.el, 'dblclick')).event;
		this._register(onMouseDoubleClick(this.onPointerDoublePress, this));
		const onMouseEnter = this._register(new DomEmitter(this.el, 'mouseenter')).event;
		this._register(onMouseEnter(() => Sash.onMouseEnter(this)));
		const onMouseLeave = this._register(new DomEmitter(this.el, 'mouseleave')).event;
		this._register(onMouseLeave(() => Sash.onMouseLeave(this)));

		this._register(Gesture.addTarget(this.el));

		const onTouchStart = this._register(new DomEmitter(this.el, EventType.Start)).event;
		this._register(onTouchStart(e => this.onPointerStart(e, new GestureEventFactory(this.el)), this));
		const onTap = this._register(new DomEmitter(this.el, EventType.Tap)).event;

		let doubleTapTimeout: any = undefined;
		this._register(onTap(event => {
			if (doubleTapTimeout) {
				clearTimeout(doubleTapTimeout);
				doubleTapTimeout = undefined;
				this.onPointerDoublePress(event);
				return;
			}

			clearTimeout(doubleTapTimeout);
			doubleTapTimeout = setTimeout(() => doubleTapTimeout = undefined, 250);
		}, this));

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

		const iframes = this.el.ownerDocument.getElementsByTagName('iframe');
		for (const iframe of iframes) {
			iframe.classList.add(PointerEventsDisabledCssClass); // disable mouse events on iframes as long as we drag the sash
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
				if (this.state === SashState.AtMinimum) {
					cursor = 's-resize';
				} else if (this.state === SashState.AtMaximum) {
					cursor = 'n-resize';
				} else {
					cursor = isMacintosh ? 'row-resize' : 'ns-resize';
				}
			} else {
				if (this.state === SashState.AtMinimum) {
					cursor = 'e-resize';
				} else if (this.state === SashState.AtMaximum) {
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
			this.onDidEnablementChange.event(updateStyle, null, disposables);
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
				iframe.classList.remove(PointerEventsDisabledCssClass);
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

	/**
	 * Forcefully stop any user interactions with this sash.
	 * Useful when hiding a parent component, while the user is still
	 * interacting with the sash.
	 */
	clearSashHoverState(): void {
		Sash.onMouseLeave(this);
	}

	/**
	 * Layout the sash. The sash will size and position itself
	 * based on its provided {@link ISashLayoutProvider layout provider}.
	 */
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

	private getOrthogonalSash(e: PointerEvent): Sash | undefined {
		const target = e.initialTarget ?? e.target;

		if (!target || !(isHTMLElement(target))) {
			return undefined;
		}

		if (target.classList.contains('orthogonal-drag-handle')) {
			return target.classList.contains('start') ? this.orthogonalStartSash : this.orthogonalEndSash;
		}

		return undefined;
	}

	override dispose(): void {
		super.dispose();
		this.el.remove();
	}
}
