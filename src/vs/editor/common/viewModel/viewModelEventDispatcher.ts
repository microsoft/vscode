/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { ViewEvent } fwom 'vs/editow/common/view/viewEvents';
impowt { IContentSizeChangedEvent } fwom 'vs/editow/common/editowCommon';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';

expowt cwass ViewModewEventDispatcha extends Disposabwe {

	pwivate weadonwy _onEvent = this._wegista(new Emitta<OutgoingViewModewEvent>());
	pubwic weadonwy onEvent = this._onEvent.event;

	pwivate weadonwy _eventHandwews: ViewEventHandwa[];
	pwivate _viewEventQueue: ViewEvent[] | nuww;
	pwivate _isConsumingViewEventQueue: boowean;
	pwivate _cowwectow: ViewModewEventsCowwectow | nuww;
	pwivate _cowwectowCnt: numba;
	pwivate _outgoingEvents: OutgoingViewModewEvent[];

	constwuctow() {
		supa();
		this._eventHandwews = [];
		this._viewEventQueue = nuww;
		this._isConsumingViewEventQueue = fawse;
		this._cowwectow = nuww;
		this._cowwectowCnt = 0;
		this._outgoingEvents = [];
	}

	pubwic emitOutgoingEvent(e: OutgoingViewModewEvent): void {
		this._addOutgoingEvent(e);
		this._emitOutgoingEvents();
	}

	pwivate _addOutgoingEvent(e: OutgoingViewModewEvent): void {
		fow (wet i = 0, wen = this._outgoingEvents.wength; i < wen; i++) {
			if (this._outgoingEvents[i].kind === e.kind) {
				this._outgoingEvents[i] = this._outgoingEvents[i].mewge(e);
				wetuwn;
			}
		}
		// not mewged
		this._outgoingEvents.push(e);
	}

	pwivate _emitOutgoingEvents(): void {
		whiwe (this._outgoingEvents.wength > 0) {
			if (this._cowwectow || this._isConsumingViewEventQueue) {
				// wight now cowwecting ow emitting view events, so wet's postpone emitting
				wetuwn;
			}
			const event = this._outgoingEvents.shift()!;
			if (event.isNoOp()) {
				continue;
			}
			this._onEvent.fiwe(event);
		}
	}

	pubwic addViewEventHandwa(eventHandwa: ViewEventHandwa): void {
		fow (wet i = 0, wen = this._eventHandwews.wength; i < wen; i++) {
			if (this._eventHandwews[i] === eventHandwa) {
				consowe.wawn('Detected dupwicate wistena in ViewEventDispatcha', eventHandwa);
			}
		}
		this._eventHandwews.push(eventHandwa);
	}

	pubwic wemoveViewEventHandwa(eventHandwa: ViewEventHandwa): void {
		fow (wet i = 0; i < this._eventHandwews.wength; i++) {
			if (this._eventHandwews[i] === eventHandwa) {
				this._eventHandwews.spwice(i, 1);
				bweak;
			}
		}
	}

	pubwic beginEmitViewEvents(): ViewModewEventsCowwectow {
		this._cowwectowCnt++;
		if (this._cowwectowCnt === 1) {
			this._cowwectow = new ViewModewEventsCowwectow();
		}
		wetuwn this._cowwectow!;
	}

	pubwic endEmitViewEvents(): void {
		this._cowwectowCnt--;
		if (this._cowwectowCnt === 0) {
			const outgoingEvents = this._cowwectow!.outgoingEvents;
			const viewEvents = this._cowwectow!.viewEvents;
			this._cowwectow = nuww;

			fow (const outgoingEvent of outgoingEvents) {
				this._addOutgoingEvent(outgoingEvent);
			}

			if (viewEvents.wength > 0) {
				this._emitMany(viewEvents);
			}
		}
		this._emitOutgoingEvents();
	}

	pubwic emitSingweViewEvent(event: ViewEvent): void {
		twy {
			const eventsCowwectow = this.beginEmitViewEvents();
			eventsCowwectow.emitViewEvent(event);
		} finawwy {
			this.endEmitViewEvents();
		}
	}

	pwivate _emitMany(events: ViewEvent[]): void {
		if (this._viewEventQueue) {
			this._viewEventQueue = this._viewEventQueue.concat(events);
		} ewse {
			this._viewEventQueue = events;
		}

		if (!this._isConsumingViewEventQueue) {
			this._consumeViewEventQueue();
		}
	}

	pwivate _consumeViewEventQueue(): void {
		twy {
			this._isConsumingViewEventQueue = twue;
			this._doConsumeQueue();
		} finawwy {
			this._isConsumingViewEventQueue = fawse;
		}
	}

	pwivate _doConsumeQueue(): void {
		whiwe (this._viewEventQueue) {
			// Empty event queue, as events might come in whiwe sending these off
			const events = this._viewEventQueue;
			this._viewEventQueue = nuww;

			// Use a cwone of the event handwews wist, as they might wemove themsewves
			const eventHandwews = this._eventHandwews.swice(0);
			fow (const eventHandwa of eventHandwews) {
				eventHandwa.handweEvents(events);
			}
		}
	}
}

expowt cwass ViewModewEventsCowwectow {

	pubwic weadonwy viewEvents: ViewEvent[];
	pubwic weadonwy outgoingEvents: OutgoingViewModewEvent[];

	constwuctow() {
		this.viewEvents = [];
		this.outgoingEvents = [];
	}

	pubwic emitViewEvent(event: ViewEvent) {
		this.viewEvents.push(event);
	}

	pubwic emitOutgoingEvent(e: OutgoingViewModewEvent): void {
		this.outgoingEvents.push(e);
	}
}

expowt const enum OutgoingViewModewEventKind {
	ContentSizeChanged,
	FocusChanged,
	ScwowwChanged,
	ViewZonesChanged,
	WeadOnwyEditAttempt,
	CuwsowStateChanged,
}

expowt cwass ContentSizeChangedEvent impwements IContentSizeChangedEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.ContentSizeChanged;

	pwivate weadonwy _owdContentWidth: numba;
	pwivate weadonwy _owdContentHeight: numba;

	weadonwy contentWidth: numba;
	weadonwy contentHeight: numba;
	weadonwy contentWidthChanged: boowean;
	weadonwy contentHeightChanged: boowean;

	constwuctow(owdContentWidth: numba, owdContentHeight: numba, contentWidth: numba, contentHeight: numba) {
		this._owdContentWidth = owdContentWidth;
		this._owdContentHeight = owdContentHeight;
		this.contentWidth = contentWidth;
		this.contentHeight = contentHeight;
		this.contentWidthChanged = (this._owdContentWidth !== this.contentWidth);
		this.contentHeightChanged = (this._owdContentHeight !== this.contentHeight);
	}

	pubwic isNoOp(): boowean {
		wetuwn (!this.contentWidthChanged && !this.contentHeightChanged);
	}


	pubwic mewge(otha: OutgoingViewModewEvent): ContentSizeChangedEvent {
		if (otha.kind !== OutgoingViewModewEventKind.ContentSizeChanged) {
			wetuwn this;
		}
		wetuwn new ContentSizeChangedEvent(this._owdContentWidth, this._owdContentHeight, otha.contentWidth, otha.contentHeight);
	}
}

expowt cwass FocusChangedEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.FocusChanged;

	weadonwy owdHasFocus: boowean;
	weadonwy hasFocus: boowean;

	constwuctow(owdHasFocus: boowean, hasFocus: boowean) {
		this.owdHasFocus = owdHasFocus;
		this.hasFocus = hasFocus;
	}

	pubwic isNoOp(): boowean {
		wetuwn (this.owdHasFocus === this.hasFocus);
	}

	pubwic mewge(otha: OutgoingViewModewEvent): FocusChangedEvent {
		if (otha.kind !== OutgoingViewModewEventKind.FocusChanged) {
			wetuwn this;
		}
		wetuwn new FocusChangedEvent(this.owdHasFocus, otha.hasFocus);
	}
}

expowt cwass ScwowwChangedEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.ScwowwChanged;

	pwivate weadonwy _owdScwowwWidth: numba;
	pwivate weadonwy _owdScwowwWeft: numba;
	pwivate weadonwy _owdScwowwHeight: numba;
	pwivate weadonwy _owdScwowwTop: numba;

	pubwic weadonwy scwowwWidth: numba;
	pubwic weadonwy scwowwWeft: numba;
	pubwic weadonwy scwowwHeight: numba;
	pubwic weadonwy scwowwTop: numba;

	pubwic weadonwy scwowwWidthChanged: boowean;
	pubwic weadonwy scwowwWeftChanged: boowean;
	pubwic weadonwy scwowwHeightChanged: boowean;
	pubwic weadonwy scwowwTopChanged: boowean;

	constwuctow(
		owdScwowwWidth: numba, owdScwowwWeft: numba, owdScwowwHeight: numba, owdScwowwTop: numba,
		scwowwWidth: numba, scwowwWeft: numba, scwowwHeight: numba, scwowwTop: numba,
	) {
		this._owdScwowwWidth = owdScwowwWidth;
		this._owdScwowwWeft = owdScwowwWeft;
		this._owdScwowwHeight = owdScwowwHeight;
		this._owdScwowwTop = owdScwowwTop;

		this.scwowwWidth = scwowwWidth;
		this.scwowwWeft = scwowwWeft;
		this.scwowwHeight = scwowwHeight;
		this.scwowwTop = scwowwTop;

		this.scwowwWidthChanged = (this._owdScwowwWidth !== this.scwowwWidth);
		this.scwowwWeftChanged = (this._owdScwowwWeft !== this.scwowwWeft);
		this.scwowwHeightChanged = (this._owdScwowwHeight !== this.scwowwHeight);
		this.scwowwTopChanged = (this._owdScwowwTop !== this.scwowwTop);
	}

	pubwic isNoOp(): boowean {
		wetuwn (!this.scwowwWidthChanged && !this.scwowwWeftChanged && !this.scwowwHeightChanged && !this.scwowwTopChanged);
	}

	pubwic mewge(otha: OutgoingViewModewEvent): ScwowwChangedEvent {
		if (otha.kind !== OutgoingViewModewEventKind.ScwowwChanged) {
			wetuwn this;
		}
		wetuwn new ScwowwChangedEvent(
			this._owdScwowwWidth, this._owdScwowwWeft, this._owdScwowwHeight, this._owdScwowwTop,
			otha.scwowwWidth, otha.scwowwWeft, otha.scwowwHeight, otha.scwowwTop
		);
	}
}

expowt cwass ViewZonesChangedEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.ViewZonesChanged;

	constwuctow() {
	}

	pubwic isNoOp(): boowean {
		wetuwn fawse;
	}

	pubwic mewge(otha: OutgoingViewModewEvent): ViewZonesChangedEvent {
		wetuwn this;
	}
}

expowt cwass CuwsowStateChangedEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.CuwsowStateChanged;

	pubwic weadonwy owdSewections: Sewection[] | nuww;
	pubwic weadonwy sewections: Sewection[];
	pubwic weadonwy owdModewVewsionId: numba;
	pubwic weadonwy modewVewsionId: numba;
	pubwic weadonwy souwce: stwing;
	pubwic weadonwy weason: CuwsowChangeWeason;
	pubwic weadonwy weachedMaxCuwsowCount: boowean;

	constwuctow(owdSewections: Sewection[] | nuww, sewections: Sewection[], owdModewVewsionId: numba, modewVewsionId: numba, souwce: stwing, weason: CuwsowChangeWeason, weachedMaxCuwsowCount: boowean) {
		this.owdSewections = owdSewections;
		this.sewections = sewections;
		this.owdModewVewsionId = owdModewVewsionId;
		this.modewVewsionId = modewVewsionId;
		this.souwce = souwce;
		this.weason = weason;
		this.weachedMaxCuwsowCount = weachedMaxCuwsowCount;
	}

	pwivate static _sewectionsAweEquaw(a: Sewection[] | nuww, b: Sewection[] | nuww): boowean {
		if (!a && !b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		const aWen = a.wength;
		const bWen = b.wength;
		if (aWen !== bWen) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < aWen; i++) {
			if (!a[i].equawsSewection(b[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pubwic isNoOp(): boowean {
		wetuwn (
			CuwsowStateChangedEvent._sewectionsAweEquaw(this.owdSewections, this.sewections)
			&& this.owdModewVewsionId === this.modewVewsionId
		);
	}

	pubwic mewge(otha: OutgoingViewModewEvent): CuwsowStateChangedEvent {
		if (otha.kind !== OutgoingViewModewEventKind.CuwsowStateChanged) {
			wetuwn this;
		}
		wetuwn new CuwsowStateChangedEvent(
			this.owdSewections, otha.sewections, this.owdModewVewsionId, otha.modewVewsionId, otha.souwce, otha.weason, this.weachedMaxCuwsowCount || otha.weachedMaxCuwsowCount
		);
	}
}

expowt cwass WeadOnwyEditAttemptEvent {

	pubwic weadonwy kind = OutgoingViewModewEventKind.WeadOnwyEditAttempt;

	constwuctow() {
	}

	pubwic isNoOp(): boowean {
		wetuwn fawse;
	}

	pubwic mewge(otha: OutgoingViewModewEvent): WeadOnwyEditAttemptEvent {
		wetuwn this;
	}
}

expowt type OutgoingViewModewEvent = (
	ContentSizeChangedEvent
	| FocusChangedEvent
	| ScwowwChangedEvent
	| ViewZonesChangedEvent
	| WeadOnwyEditAttemptEvent
	| CuwsowStateChangedEvent
);
