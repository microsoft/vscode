/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewEventHandler } from './viewEventHandler.js';
import { ViewEvent } from './viewEvents.js';
import { IContentSizeChangedEvent } from './editorCommon.js';
import { Emitter } from '../../base/common/event.js';
import { Selection } from './core/selection.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { CursorChangeReason } from './cursorEvents.js';
import { ModelLineHeightChangedEvent as OriginalModelLineHeightChangedEvent, ModelFontChangedEvent as OriginalModelFontChangedEvent, IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelOptionsChangedEvent, IModelTokensChangedEvent } from './textModelEvents.js';

export class ViewModelEventDispatcher extends Disposable {

	private readonly _onEvent = this._register(new Emitter<OutgoingViewModelEvent>());
	public readonly onEvent = this._onEvent.event;

	private readonly _eventHandlers: ViewEventHandler[];
	private _viewEventQueue: ViewEvent[] | null;
	private _isConsumingViewEventQueue: boolean;
	private _collector: ViewModelEventsCollector | null;
	private _collectorCnt: number;
	private _outgoingEvents: OutgoingViewModelEvent[];

	constructor() {
		super();
		this._eventHandlers = [];
		this._viewEventQueue = null;
		this._isConsumingViewEventQueue = false;
		this._collector = null;
		this._collectorCnt = 0;
		this._outgoingEvents = [];
	}

	public emitOutgoingEvent(e: OutgoingViewModelEvent): void {
		this._addOutgoingEvent(e);
		this._emitOutgoingEvents();
	}

	private _addOutgoingEvent(e: OutgoingViewModelEvent): void {
		for (let i = 0, len = this._outgoingEvents.length; i < len; i++) {
			const mergeResult = (this._outgoingEvents[i].kind === e.kind ? this._outgoingEvents[i].attemptToMerge(e) : null);
			if (mergeResult) {
				this._outgoingEvents[i] = mergeResult;
				return;
			}
		}
		// not merged
		this._outgoingEvents.push(e);
	}

	private _emitOutgoingEvents(): void {
		while (this._outgoingEvents.length > 0) {
			if (this._collector || this._isConsumingViewEventQueue) {
				// right now collecting or emitting view events, so let's postpone emitting
				return;
			}
			const event = this._outgoingEvents.shift()!;
			if (event.isNoOp()) {
				continue;
			}
			this._onEvent.fire(event);
		}
	}

	public addViewEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0, len = this._eventHandlers.length; i < len; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				console.warn('Detected duplicate listener in ViewEventDispatcher', eventHandler);
			}
		}
		this._eventHandlers.push(eventHandler);
	}

	public removeViewEventHandler(eventHandler: ViewEventHandler): void {
		for (let i = 0; i < this._eventHandlers.length; i++) {
			if (this._eventHandlers[i] === eventHandler) {
				this._eventHandlers.splice(i, 1);
				break;
			}
		}
	}

	public beginEmitViewEvents(): ViewModelEventsCollector {
		this._collectorCnt++;
		if (this._collectorCnt === 1) {
			this._collector = new ViewModelEventsCollector();
		}
		return this._collector!;
	}

	public endEmitViewEvents(): void {
		this._collectorCnt--;
		if (this._collectorCnt === 0) {
			const outgoingEvents = this._collector!.outgoingEvents;
			const viewEvents = this._collector!.viewEvents;
			this._collector = null;

			for (const outgoingEvent of outgoingEvents) {
				this._addOutgoingEvent(outgoingEvent);
			}

			if (viewEvents.length > 0) {
				this._emitMany(viewEvents);
			}
		}
		this._emitOutgoingEvents();
	}

	public emitSingleViewEvent(event: ViewEvent): void {
		try {
			const eventsCollector = this.beginEmitViewEvents();
			eventsCollector.emitViewEvent(event);
		} finally {
			this.endEmitViewEvents();
		}
	}

	private _emitMany(events: ViewEvent[]): void {
		if (this._viewEventQueue) {
			this._viewEventQueue = this._viewEventQueue.concat(events);
		} else {
			this._viewEventQueue = events;
		}

		if (!this._isConsumingViewEventQueue) {
			this._consumeViewEventQueue();
		}
	}

	private _consumeViewEventQueue(): void {
		try {
			this._isConsumingViewEventQueue = true;
			this._doConsumeQueue();
		} finally {
			this._isConsumingViewEventQueue = false;
		}
	}

	private _doConsumeQueue(): void {
		while (this._viewEventQueue) {
			// Empty event queue, as events might come in while sending these off
			const events = this._viewEventQueue;
			this._viewEventQueue = null;

			// Use a clone of the event handlers list, as they might remove themselves
			const eventHandlers = this._eventHandlers.slice(0);
			for (const eventHandler of eventHandlers) {
				eventHandler.handleEvents(events);
			}
		}
	}
}

export class ViewModelEventsCollector {

	public readonly viewEvents: ViewEvent[];
	public readonly outgoingEvents: OutgoingViewModelEvent[];

	constructor() {
		this.viewEvents = [];
		this.outgoingEvents = [];
	}

	public emitViewEvent(event: ViewEvent) {
		this.viewEvents.push(event);
	}

	public emitOutgoingEvent(e: OutgoingViewModelEvent): void {
		this.outgoingEvents.push(e);
	}
}

export type OutgoingViewModelEvent = (
	ContentSizeChangedEvent
	| FocusChangedEvent
	| WidgetFocusChangedEvent
	| ScrollChangedEvent
	| ViewZonesChangedEvent
	| HiddenAreasChangedEvent
	| ReadOnlyEditAttemptEvent
	| CursorStateChangedEvent
	| ModelDecorationsChangedEvent
	| ModelLanguageChangedEvent
	| ModelLanguageConfigurationChangedEvent
	| ModelContentChangedEvent
	| ModelOptionsChangedEvent
	| ModelTokensChangedEvent
	| ModelLineHeightChangedEvent
	| ModelFontChangedEvent
);

export const enum OutgoingViewModelEventKind {
	ContentSizeChanged,
	FocusChanged,
	WidgetFocusChanged,
	ScrollChanged,
	ViewZonesChanged,
	HiddenAreasChanged,
	ReadOnlyEditAttempt,
	CursorStateChanged,
	ModelDecorationsChanged,
	ModelLanguageChanged,
	ModelLanguageConfigurationChanged,
	ModelContentChanged,
	ModelOptionsChanged,
	ModelTokensChanged,
	ModelLineHeightChanged,
	ModelFontChangedEvent
}

export class ContentSizeChangedEvent implements IContentSizeChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.ContentSizeChanged;

	private readonly _oldContentWidth: number;
	private readonly _oldContentHeight: number;

	readonly contentWidth: number;
	readonly contentHeight: number;
	readonly contentWidthChanged: boolean;
	readonly contentHeightChanged: boolean;

	constructor(oldContentWidth: number, oldContentHeight: number, contentWidth: number, contentHeight: number) {
		this._oldContentWidth = oldContentWidth;
		this._oldContentHeight = oldContentHeight;
		this.contentWidth = contentWidth;
		this.contentHeight = contentHeight;
		this.contentWidthChanged = (this._oldContentWidth !== this.contentWidth);
		this.contentHeightChanged = (this._oldContentHeight !== this.contentHeight);
	}

	public isNoOp(): boolean {
		return (!this.contentWidthChanged && !this.contentHeightChanged);
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return new ContentSizeChangedEvent(this._oldContentWidth, this._oldContentHeight, other.contentWidth, other.contentHeight);
	}
}

export class FocusChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.FocusChanged;

	readonly oldHasFocus: boolean;
	readonly hasFocus: boolean;

	constructor(oldHasFocus: boolean, hasFocus: boolean) {
		this.oldHasFocus = oldHasFocus;
		this.hasFocus = hasFocus;
	}

	public isNoOp(): boolean {
		return (this.oldHasFocus === this.hasFocus);
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return new FocusChangedEvent(this.oldHasFocus, other.hasFocus);
	}
}

export class WidgetFocusChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.WidgetFocusChanged;

	readonly oldHasFocus: boolean;
	readonly hasFocus: boolean;

	constructor(oldHasFocus: boolean, hasFocus: boolean) {
		this.oldHasFocus = oldHasFocus;
		this.hasFocus = hasFocus;
	}

	public isNoOp(): boolean {
		return (this.oldHasFocus === this.hasFocus);
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return new FocusChangedEvent(this.oldHasFocus, other.hasFocus);
	}
}

export class ScrollChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.ScrollChanged;

	private readonly _oldScrollWidth: number;
	private readonly _oldScrollLeft: number;
	private readonly _oldScrollHeight: number;
	private readonly _oldScrollTop: number;

	public readonly scrollWidth: number;
	public readonly scrollLeft: number;
	public readonly scrollHeight: number;
	public readonly scrollTop: number;

	public readonly scrollWidthChanged: boolean;
	public readonly scrollLeftChanged: boolean;
	public readonly scrollHeightChanged: boolean;
	public readonly scrollTopChanged: boolean;

	constructor(
		oldScrollWidth: number, oldScrollLeft: number, oldScrollHeight: number, oldScrollTop: number,
		scrollWidth: number, scrollLeft: number, scrollHeight: number, scrollTop: number,
	) {
		this._oldScrollWidth = oldScrollWidth;
		this._oldScrollLeft = oldScrollLeft;
		this._oldScrollHeight = oldScrollHeight;
		this._oldScrollTop = oldScrollTop;

		this.scrollWidth = scrollWidth;
		this.scrollLeft = scrollLeft;
		this.scrollHeight = scrollHeight;
		this.scrollTop = scrollTop;

		this.scrollWidthChanged = (this._oldScrollWidth !== this.scrollWidth);
		this.scrollLeftChanged = (this._oldScrollLeft !== this.scrollLeft);
		this.scrollHeightChanged = (this._oldScrollHeight !== this.scrollHeight);
		this.scrollTopChanged = (this._oldScrollTop !== this.scrollTop);
	}

	public isNoOp(): boolean {
		return (!this.scrollWidthChanged && !this.scrollLeftChanged && !this.scrollHeightChanged && !this.scrollTopChanged);
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return new ScrollChangedEvent(
			this._oldScrollWidth, this._oldScrollLeft, this._oldScrollHeight, this._oldScrollTop,
			other.scrollWidth, other.scrollLeft, other.scrollHeight, other.scrollTop
		);
	}
}

export class ViewZonesChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.ViewZonesChanged;

	constructor() {
	}

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return this;
	}
}

export class HiddenAreasChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.HiddenAreasChanged;

	constructor() {
	}

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return this;
	}
}

export class CursorStateChangedEvent {

	public readonly kind = OutgoingViewModelEventKind.CursorStateChanged;

	public readonly oldSelections: Selection[] | null;
	public readonly selections: Selection[];
	public readonly oldModelVersionId: number;
	public readonly modelVersionId: number;
	public readonly source: string;
	public readonly reason: CursorChangeReason;
	public readonly reachedMaxCursorCount: boolean;

	constructor(oldSelections: Selection[] | null, selections: Selection[], oldModelVersionId: number, modelVersionId: number, source: string, reason: CursorChangeReason, reachedMaxCursorCount: boolean) {
		this.oldSelections = oldSelections;
		this.selections = selections;
		this.oldModelVersionId = oldModelVersionId;
		this.modelVersionId = modelVersionId;
		this.source = source;
		this.reason = reason;
		this.reachedMaxCursorCount = reachedMaxCursorCount;
	}

	private static _selectionsAreEqual(a: Selection[] | null, b: Selection[] | null): boolean {
		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		const aLen = a.length;
		const bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			if (!a[i].equalsSelection(b[i])) {
				return false;
			}
		}
		return true;
	}

	public isNoOp(): boolean {
		return (
			CursorStateChangedEvent._selectionsAreEqual(this.oldSelections, this.selections)
			&& this.oldModelVersionId === this.modelVersionId
		);
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return new CursorStateChangedEvent(
			this.oldSelections, other.selections, this.oldModelVersionId, other.modelVersionId, other.source, other.reason, this.reachedMaxCursorCount || other.reachedMaxCursorCount
		);
	}
}

export class ReadOnlyEditAttemptEvent {

	public readonly kind = OutgoingViewModelEventKind.ReadOnlyEditAttempt;

	constructor() {
	}

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		if (other.kind !== this.kind) {
			return null;
		}
		return this;
	}
}

export class ModelDecorationsChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelDecorationsChanged;

	constructor(
		public readonly event: IModelDecorationsChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelLanguageChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelLanguageChanged;

	constructor(
		public readonly event: IModelLanguageChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelLanguageConfigurationChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelLanguageConfigurationChanged;

	constructor(
		public readonly event: IModelLanguageConfigurationChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelContentChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelContentChanged;

	constructor(
		public readonly event: IModelContentChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelOptionsChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelOptionsChanged;

	constructor(
		public readonly event: IModelOptionsChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelTokensChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelTokensChanged;

	constructor(
		public readonly event: IModelTokensChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelLineHeightChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelLineHeightChanged;

	constructor(
		public readonly event: OriginalModelLineHeightChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}

export class ModelFontChangedEvent {
	public readonly kind = OutgoingViewModelEventKind.ModelFontChangedEvent;

	constructor(
		public readonly event: OriginalModelFontChangedEvent
	) { }

	public isNoOp(): boolean {
		return false;
	}

	public attemptToMerge(other: OutgoingViewModelEvent): OutgoingViewModelEvent | null {
		return null;
	}
}
