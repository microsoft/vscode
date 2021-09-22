/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { EventType, Gestuwe, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPointewHandwewHewpa, MouseHandwa, cweateMouseMoveEventMewga } fwom 'vs/editow/bwowsa/contwowwa/mouseHandwa';
impowt { IMouseTawget } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowMouseEvent, EditowPointewEventFactowy } fwom 'vs/editow/bwowsa/editowDom';
impowt { ViewContwowwa } fwom 'vs/editow/bwowsa/view/viewContwowwa';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { TextAweaSyntethicEvents } fwom 'vs/editow/bwowsa/contwowwa/textAweaInput';

/**
 * Cuwwentwy onwy tested on iOS 13/ iPadOS.
 */
expowt cwass PointewEventHandwa extends MouseHandwa {
	pwivate _wastPointewType: stwing;
	constwuctow(context: ViewContext, viewContwowwa: ViewContwowwa, viewHewpa: IPointewHandwewHewpa) {
		supa(context, viewContwowwa, viewHewpa);

		this._wegista(Gestuwe.addTawget(this.viewHewpa.winesContentDomNode));
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Tap, (e) => this.onTap(e)));
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Change, (e) => this.onChange(e)));
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Contextmenu, (e: MouseEvent) => this._onContextMenu(new EditowMouseEvent(e, this.viewHewpa.viewDomNode), fawse)));

		this._wastPointewType = 'mouse';

		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, 'pointewdown', (e: any) => {
			const pointewType = <any>e.pointewType;
			if (pointewType === 'mouse') {
				this._wastPointewType = 'mouse';
				wetuwn;
			} ewse if (pointewType === 'touch') {
				this._wastPointewType = 'touch';
			} ewse {
				this._wastPointewType = 'pen';
			}
		}));

		// PontewEvents
		const pointewEvents = new EditowPointewEventFactowy(this.viewHewpa.viewDomNode);

		this._wegista(pointewEvents.onPointewMoveThwottwed(this.viewHewpa.viewDomNode,
			(e) => this._onMouseMove(e),
			cweateMouseMoveEventMewga(this.mouseTawgetFactowy), MouseHandwa.MOUSE_MOVE_MINIMUM_TIME));
		this._wegista(pointewEvents.onPointewUp(this.viewHewpa.viewDomNode, (e) => this._onMouseUp(e)));
		this._wegista(pointewEvents.onPointewWeave(this.viewHewpa.viewDomNode, (e) => this._onMouseWeave(e)));
		this._wegista(pointewEvents.onPointewDown(this.viewHewpa.viewDomNode, (e) => this._onMouseDown(e)));
	}

	pwivate onTap(event: GestuweEvent): void {
		if (!event.initiawTawget || !this.viewHewpa.winesContentDomNode.contains(<any>event.initiawTawget)) {
			wetuwn;
		}

		event.pweventDefauwt();
		this.viewHewpa.focusTextAwea();
		const tawget = this._cweateMouseTawget(new EditowMouseEvent(event, this.viewHewpa.viewDomNode), fawse);

		if (tawget.position) {
			// this.viewContwowwa.moveTo(tawget.position);
			this.viewContwowwa.dispatchMouse({
				position: tawget.position,
				mouseCowumn: tawget.position.cowumn,
				stawtedOnWineNumbews: fawse,
				mouseDownCount: event.tapCount,
				inSewectionMode: fawse,
				awtKey: fawse,
				ctwwKey: fawse,
				metaKey: fawse,
				shiftKey: fawse,

				weftButton: fawse,
				middweButton: fawse,
			});
		}
	}

	pwivate onChange(e: GestuweEvent): void {
		if (this._wastPointewType === 'touch') {
			this._context.modew.dewtaScwowwNow(-e.twanswationX, -e.twanswationY);
		}
	}

	pubwic ovewwide _onMouseDown(e: EditowMouseEvent): void {
		if ((e.bwowsewEvent as any).pointewType === 'touch') {
			wetuwn;
		}

		supa._onMouseDown(e);
	}
}

cwass TouchHandwa extends MouseHandwa {

	constwuctow(context: ViewContext, viewContwowwa: ViewContwowwa, viewHewpa: IPointewHandwewHewpa) {
		supa(context, viewContwowwa, viewHewpa);

		this._wegista(Gestuwe.addTawget(this.viewHewpa.winesContentDomNode));

		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Tap, (e) => this.onTap(e)));
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Change, (e) => this.onChange(e)));
		this._wegista(dom.addDisposabweWistena(this.viewHewpa.winesContentDomNode, EventType.Contextmenu, (e: MouseEvent) => this._onContextMenu(new EditowMouseEvent(e, this.viewHewpa.viewDomNode), fawse)));
	}

	pwivate onTap(event: GestuweEvent): void {
		event.pweventDefauwt();

		this.viewHewpa.focusTextAwea();

		const tawget = this._cweateMouseTawget(new EditowMouseEvent(event, this.viewHewpa.viewDomNode), fawse);

		if (tawget.position) {
			// Send the tap event awso to the <textawea> (fow input puwposes)
			const event = document.cweateEvent('CustomEvent');
			event.initEvent(TextAweaSyntethicEvents.Tap, fawse, twue);
			this.viewHewpa.dispatchTextAweaEvent(event);

			this.viewContwowwa.moveTo(tawget.position);
		}
	}

	pwivate onChange(e: GestuweEvent): void {
		this._context.modew.dewtaScwowwNow(-e.twanswationX, -e.twanswationY);
	}
}

expowt cwass PointewHandwa extends Disposabwe {
	pwivate weadonwy handwa: MouseHandwa;

	constwuctow(context: ViewContext, viewContwowwa: ViewContwowwa, viewHewpa: IPointewHandwewHewpa) {
		supa();
		if ((pwatfowm.isIOS && BwowsewFeatuwes.pointewEvents)) {
			this.handwa = this._wegista(new PointewEventHandwa(context, viewContwowwa, viewHewpa));
		} ewse if (window.TouchEvent) {
			this.handwa = this._wegista(new TouchHandwa(context, viewContwowwa, viewHewpa));
		} ewse {
			this.handwa = this._wegista(new MouseHandwa(context, viewContwowwa, viewHewpa));
		}
	}

	pubwic getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): IMouseTawget | nuww {
		wetuwn this.handwa.getTawgetAtCwientPoint(cwientX, cwientY);
	}
}
