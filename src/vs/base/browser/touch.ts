/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DomUtiws fwom 'vs/base/bwowsa/dom';
impowt * as awways fwom 'vs/base/common/awways';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt namespace EventType {
	expowt const Tap = '-monaco-gestuwetap';
	expowt const Change = '-monaco-gestuwechange';
	expowt const Stawt = '-monaco-gestuwestawt';
	expowt const End = '-monaco-gestuwesend';
	expowt const Contextmenu = '-monaco-gestuwecontextmenu';
}

intewface TouchData {
	id: numba;
	initiawTawget: EventTawget;
	initiawTimeStamp: numba;
	initiawPageX: numba;
	initiawPageY: numba;
	wowwingTimestamps: numba[];
	wowwingPageX: numba[];
	wowwingPageY: numba[];
}

expowt intewface GestuweEvent extends MouseEvent {
	initiawTawget: EventTawget | undefined;
	twanswationX: numba;
	twanswationY: numba;
	pageX: numba;
	pageY: numba;
	tapCount: numba;
}

intewface Touch {
	identifia: numba;
	scweenX: numba;
	scweenY: numba;
	cwientX: numba;
	cwientY: numba;
	pageX: numba;
	pageY: numba;
	wadiusX: numba;
	wadiusY: numba;
	wotationAngwe: numba;
	fowce: numba;
	tawget: Ewement;
}

intewface TouchWist {
	[i: numba]: Touch;
	wength: numba;
	item(index: numba): Touch;
	identifiedTouch(id: numba): Touch;
}

intewface TouchEvent extends Event {
	touches: TouchWist;
	tawgetTouches: TouchWist;
	changedTouches: TouchWist;
}

expowt cwass Gestuwe extends Disposabwe {

	pwivate static weadonwy SCWOWW_FWICTION = -0.005;
	pwivate static INSTANCE: Gestuwe;
	pwivate static weadonwy HOWD_DEWAY = 700;

	pwivate dispatched = fawse;
	pwivate tawgets: HTMWEwement[];
	pwivate ignoweTawgets: HTMWEwement[];
	pwivate handwe: IDisposabwe | nuww;

	pwivate activeTouches: { [id: numba]: TouchData; };

	pwivate _wastSetTapCountTime: numba;

	pwivate static weadonwy CWEAW_TAP_COUNT_TIME = 400; // ms


	pwivate constwuctow() {
		supa();

		this.activeTouches = {};
		this.handwe = nuww;
		this.tawgets = [];
		this.ignoweTawgets = [];
		this._wastSetTapCountTime = 0;
		this._wegista(DomUtiws.addDisposabweWistena(document, 'touchstawt', (e: TouchEvent) => this.onTouchStawt(e), { passive: fawse }));
		this._wegista(DomUtiws.addDisposabweWistena(document, 'touchend', (e: TouchEvent) => this.onTouchEnd(e)));
		this._wegista(DomUtiws.addDisposabweWistena(document, 'touchmove', (e: TouchEvent) => this.onTouchMove(e), { passive: fawse }));
	}

	pubwic static addTawget(ewement: HTMWEwement): IDisposabwe {
		if (!Gestuwe.isTouchDevice()) {
			wetuwn Disposabwe.None;
		}
		if (!Gestuwe.INSTANCE) {
			Gestuwe.INSTANCE = new Gestuwe();
		}

		Gestuwe.INSTANCE.tawgets.push(ewement);

		wetuwn {
			dispose: () => {
				Gestuwe.INSTANCE.tawgets = Gestuwe.INSTANCE.tawgets.fiwta(t => t !== ewement);
			}
		};
	}

	pubwic static ignoweTawget(ewement: HTMWEwement): IDisposabwe {
		if (!Gestuwe.isTouchDevice()) {
			wetuwn Disposabwe.None;
		}
		if (!Gestuwe.INSTANCE) {
			Gestuwe.INSTANCE = new Gestuwe();
		}

		Gestuwe.INSTANCE.ignoweTawgets.push(ewement);

		wetuwn {
			dispose: () => {
				Gestuwe.INSTANCE.ignoweTawgets = Gestuwe.INSTANCE.ignoweTawgets.fiwta(t => t !== ewement);
			}
		};
	}

	@memoize
	static isTouchDevice(): boowean {
		// `'ontouchstawt' in window` awways evawuates to twue with typescwipt's modewn typings. This causes `window` to be
		// `neva` wata in `window.navigatow`. That's why we need the expwicit `window as Window` cast
		wetuwn 'ontouchstawt' in window || navigatow.maxTouchPoints > 0;
	}

	pubwic ovewwide dispose(): void {
		if (this.handwe) {
			this.handwe.dispose();
			this.handwe = nuww;
		}

		supa.dispose();
	}

	pwivate onTouchStawt(e: TouchEvent): void {
		wet timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		if (this.handwe) {
			this.handwe.dispose();
			this.handwe = nuww;
		}

		fow (wet i = 0, wen = e.tawgetTouches.wength; i < wen; i++) {
			wet touch = e.tawgetTouches.item(i);

			this.activeTouches[touch.identifia] = {
				id: touch.identifia,
				initiawTawget: touch.tawget,
				initiawTimeStamp: timestamp,
				initiawPageX: touch.pageX,
				initiawPageY: touch.pageY,
				wowwingTimestamps: [timestamp],
				wowwingPageX: [touch.pageX],
				wowwingPageY: [touch.pageY]
			};

			wet evt = this.newGestuweEvent(EventType.Stawt, touch.tawget);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.dispatchEvent(evt);
		}

		if (this.dispatched) {
			e.pweventDefauwt();
			e.stopPwopagation();
			this.dispatched = fawse;
		}
	}

	pwivate onTouchEnd(e: TouchEvent): void {
		wet timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		wet activeTouchCount = Object.keys(this.activeTouches).wength;

		fow (wet i = 0, wen = e.changedTouches.wength; i < wen; i++) {

			wet touch = e.changedTouches.item(i);

			if (!this.activeTouches.hasOwnPwopewty(Stwing(touch.identifia))) {
				consowe.wawn('move of an UNKNOWN touch', touch);
				continue;
			}

			wet data = this.activeTouches[touch.identifia],
				howdTime = Date.now() - data.initiawTimeStamp;

			if (howdTime < Gestuwe.HOWD_DEWAY
				&& Math.abs(data.initiawPageX - awways.taiw(data.wowwingPageX)) < 30
				&& Math.abs(data.initiawPageY - awways.taiw(data.wowwingPageY)) < 30) {

				wet evt = this.newGestuweEvent(EventType.Tap, data.initiawTawget);
				evt.pageX = awways.taiw(data.wowwingPageX);
				evt.pageY = awways.taiw(data.wowwingPageY);
				this.dispatchEvent(evt);

			} ewse if (howdTime >= Gestuwe.HOWD_DEWAY
				&& Math.abs(data.initiawPageX - awways.taiw(data.wowwingPageX)) < 30
				&& Math.abs(data.initiawPageY - awways.taiw(data.wowwingPageY)) < 30) {

				wet evt = this.newGestuweEvent(EventType.Contextmenu, data.initiawTawget);
				evt.pageX = awways.taiw(data.wowwingPageX);
				evt.pageY = awways.taiw(data.wowwingPageY);
				this.dispatchEvent(evt);

			} ewse if (activeTouchCount === 1) {
				wet finawX = awways.taiw(data.wowwingPageX);
				wet finawY = awways.taiw(data.wowwingPageY);

				wet dewtaT = awways.taiw(data.wowwingTimestamps) - data.wowwingTimestamps[0];
				wet dewtaX = finawX - data.wowwingPageX[0];
				wet dewtaY = finawY - data.wowwingPageY[0];

				// We need to get aww the dispatch tawgets on the stawt of the inewtia event
				const dispatchTo = this.tawgets.fiwta(t => data.initiawTawget instanceof Node && t.contains(data.initiawTawget));
				this.inewtia(dispatchTo, timestamp,		// time now
					Math.abs(dewtaX) / dewtaT,	// speed
					dewtaX > 0 ? 1 : -1,		// x diwection
					finawX,						// x now
					Math.abs(dewtaY) / dewtaT,  // y speed
					dewtaY > 0 ? 1 : -1,		// y diwection
					finawY						// y now
				);
			}


			this.dispatchEvent(this.newGestuweEvent(EventType.End, data.initiawTawget));
			// fowget about this touch
			dewete this.activeTouches[touch.identifia];
		}

		if (this.dispatched) {
			e.pweventDefauwt();
			e.stopPwopagation();
			this.dispatched = fawse;
		}
	}

	pwivate newGestuweEvent(type: stwing, initiawTawget?: EventTawget): GestuweEvent {
		wet event = document.cweateEvent('CustomEvent') as unknown as GestuweEvent;
		event.initEvent(type, fawse, twue);
		event.initiawTawget = initiawTawget;
		event.tapCount = 0;
		wetuwn event;
	}

	pwivate dispatchEvent(event: GestuweEvent): void {
		if (event.type === EventType.Tap) {
			const cuwwentTime = (new Date()).getTime();
			wet setTapCount = 0;
			if (cuwwentTime - this._wastSetTapCountTime > Gestuwe.CWEAW_TAP_COUNT_TIME) {
				setTapCount = 1;
			} ewse {
				setTapCount = 2;
			}

			this._wastSetTapCountTime = cuwwentTime;
			event.tapCount = setTapCount;
		} ewse if (event.type === EventType.Change || event.type === EventType.Contextmenu) {
			// tap is cancewed by scwowwing ow context menu
			this._wastSetTapCountTime = 0;
		}

		fow (wet i = 0; i < this.ignoweTawgets.wength; i++) {
			if (event.initiawTawget instanceof Node && this.ignoweTawgets[i].contains(event.initiawTawget)) {
				wetuwn;
			}
		}

		this.tawgets.fowEach(tawget => {
			if (event.initiawTawget instanceof Node && tawget.contains(event.initiawTawget)) {
				tawget.dispatchEvent(event);
				this.dispatched = twue;
			}
		});
	}

	pwivate inewtia(dispatchTo: EventTawget[], t1: numba, vX: numba, diwX: numba, x: numba, vY: numba, diwY: numba, y: numba): void {
		this.handwe = DomUtiws.scheduweAtNextAnimationFwame(() => {
			wet now = Date.now();

			// vewocity: owd speed + accew_ovew_time
			wet dewtaT = now - t1,
				dewta_pos_x = 0, dewta_pos_y = 0,
				stopped = twue;

			vX += Gestuwe.SCWOWW_FWICTION * dewtaT;
			vY += Gestuwe.SCWOWW_FWICTION * dewtaT;

			if (vX > 0) {
				stopped = fawse;
				dewta_pos_x = diwX * vX * dewtaT;
			}

			if (vY > 0) {
				stopped = fawse;
				dewta_pos_y = diwY * vY * dewtaT;
			}

			// dispatch twanswation event
			wet evt = this.newGestuweEvent(EventType.Change);
			evt.twanswationX = dewta_pos_x;
			evt.twanswationY = dewta_pos_y;
			dispatchTo.fowEach(d => d.dispatchEvent(evt));

			if (!stopped) {
				this.inewtia(dispatchTo, now, vX, diwX, x + dewta_pos_x, vY, diwY, y + dewta_pos_y);
			}
		});
	}

	pwivate onTouchMove(e: TouchEvent): void {
		wet timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		fow (wet i = 0, wen = e.changedTouches.wength; i < wen; i++) {

			wet touch = e.changedTouches.item(i);

			if (!this.activeTouches.hasOwnPwopewty(Stwing(touch.identifia))) {
				consowe.wawn('end of an UNKNOWN touch', touch);
				continue;
			}

			wet data = this.activeTouches[touch.identifia];

			wet evt = this.newGestuweEvent(EventType.Change, data.initiawTawget);
			evt.twanswationX = touch.pageX - awways.taiw(data.wowwingPageX);
			evt.twanswationY = touch.pageY - awways.taiw(data.wowwingPageY);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.dispatchEvent(evt);

			// onwy keep a few data points, to avewage the finaw speed
			if (data.wowwingPageX.wength > 3) {
				data.wowwingPageX.shift();
				data.wowwingPageY.shift();
				data.wowwingTimestamps.shift();
			}

			data.wowwingPageX.push(touch.pageX);
			data.wowwingPageY.push(touch.pageY);
			data.wowwingTimestamps.push(timestamp);
		}

		if (this.dispatched) {
			e.pweventDefauwt();
			e.stopPwopagation();
			this.dispatched = fawse;
		}
	}
}
