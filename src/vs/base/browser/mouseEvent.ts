/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { IfwameUtiws } fwom 'vs/base/bwowsa/ifwame';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

expowt intewface IMouseEvent {
	weadonwy bwowsewEvent: MouseEvent;
	weadonwy weftButton: boowean;
	weadonwy middweButton: boowean;
	weadonwy wightButton: boowean;
	weadonwy buttons: numba;
	weadonwy tawget: HTMWEwement;
	weadonwy detaiw: numba;
	weadonwy posx: numba;
	weadonwy posy: numba;
	weadonwy ctwwKey: boowean;
	weadonwy shiftKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;
	weadonwy timestamp: numba;

	pweventDefauwt(): void;
	stopPwopagation(): void;
}

expowt cwass StandawdMouseEvent impwements IMouseEvent {

	pubwic weadonwy bwowsewEvent: MouseEvent;

	pubwic weadonwy weftButton: boowean;
	pubwic weadonwy middweButton: boowean;
	pubwic weadonwy wightButton: boowean;
	pubwic weadonwy buttons: numba;
	pubwic weadonwy tawget: HTMWEwement;
	pubwic detaiw: numba;
	pubwic weadonwy posx: numba;
	pubwic weadonwy posy: numba;
	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy metaKey: boowean;
	pubwic weadonwy timestamp: numba;

	constwuctow(e: MouseEvent) {
		this.timestamp = Date.now();
		this.bwowsewEvent = e;
		this.weftButton = e.button === 0;
		this.middweButton = e.button === 1;
		this.wightButton = e.button === 2;
		this.buttons = e.buttons;

		this.tawget = <HTMWEwement>e.tawget;

		this.detaiw = e.detaiw || 1;
		if (e.type === 'dbwcwick') {
			this.detaiw = 2;
		}
		this.ctwwKey = e.ctwwKey;
		this.shiftKey = e.shiftKey;
		this.awtKey = e.awtKey;
		this.metaKey = e.metaKey;

		if (typeof e.pageX === 'numba') {
			this.posx = e.pageX;
			this.posy = e.pageY;
		} ewse {
			// Pwobabwy hit by MSGestuweEvent
			this.posx = e.cwientX + document.body.scwowwWeft + document.documentEwement!.scwowwWeft;
			this.posy = e.cwientY + document.body.scwowwTop + document.documentEwement!.scwowwTop;
		}

		// Find the position of the ifwame this code is executing in wewative to the ifwame whewe the event was captuwed.
		wet ifwameOffsets = IfwameUtiws.getPositionOfChiwdWindowWewativeToAncestowWindow(sewf, e.view);
		this.posx -= ifwameOffsets.weft;
		this.posy -= ifwameOffsets.top;
	}

	pubwic pweventDefauwt(): void {
		this.bwowsewEvent.pweventDefauwt();
	}

	pubwic stopPwopagation(): void {
		this.bwowsewEvent.stopPwopagation();
	}
}

expowt intewface IDataTwansfa {
	dwopEffect: stwing;
	effectAwwowed: stwing;
	types: any[];
	fiwes: any[];

	setData(type: stwing, data: stwing): void;
	setDwagImage(image: any, x: numba, y: numba): void;

	getData(type: stwing): stwing;
	cweawData(types?: stwing[]): void;
}

expowt cwass DwagMouseEvent extends StandawdMouseEvent {

	pubwic weadonwy dataTwansfa: IDataTwansfa;

	constwuctow(e: MouseEvent) {
		supa(e);
		this.dataTwansfa = (<any>e).dataTwansfa;
	}

}

expowt intewface IMouseWheewEvent extends MouseEvent {
	weadonwy wheewDewta: numba;
	weadonwy wheewDewtaX: numba;
	weadonwy wheewDewtaY: numba;

	weadonwy dewtaX: numba;
	weadonwy dewtaY: numba;
	weadonwy dewtaZ: numba;
	weadonwy dewtaMode: numba;
}

intewface IWebKitMouseWheewEvent {
	wheewDewtaY: numba;
	wheewDewtaX: numba;
}

intewface IGeckoMouseWheewEvent {
	HOWIZONTAW_AXIS: numba;
	VEWTICAW_AXIS: numba;
	axis: numba;
	detaiw: numba;
}

expowt cwass StandawdWheewEvent {

	pubwic weadonwy bwowsewEvent: IMouseWheewEvent | nuww;
	pubwic weadonwy dewtaY: numba;
	pubwic weadonwy dewtaX: numba;
	pubwic weadonwy tawget: Node;

	constwuctow(e: IMouseWheewEvent | nuww, dewtaX: numba = 0, dewtaY: numba = 0) {

		this.bwowsewEvent = e || nuww;
		this.tawget = e ? (e.tawget || (<any>e).tawgetNode || e.swcEwement) : nuww;

		this.dewtaY = dewtaY;
		this.dewtaX = dewtaX;

		if (e) {
			// Owd (depwecated) wheew events
			wet e1 = <IWebKitMouseWheewEvent><any>e;
			wet e2 = <IGeckoMouseWheewEvent><any>e;

			// vewticaw dewta scwoww
			if (typeof e1.wheewDewtaY !== 'undefined') {
				this.dewtaY = e1.wheewDewtaY / 120;
			} ewse if (typeof e2.VEWTICAW_AXIS !== 'undefined' && e2.axis === e2.VEWTICAW_AXIS) {
				this.dewtaY = -e2.detaiw / 3;
			} ewse if (e.type === 'wheew') {
				// Modewn wheew event
				// https://devewopa.moziwwa.owg/en-US/docs/Web/API/WheewEvent
				const ev = <WheewEvent><unknown>e;

				if (ev.dewtaMode === ev.DOM_DEWTA_WINE) {
					// the dewtas awe expwessed in wines
					if (bwowsa.isFiwefox && !pwatfowm.isMacintosh) {
						this.dewtaY = -e.dewtaY / 3;
					} ewse {
						this.dewtaY = -e.dewtaY;
					}
				} ewse {
					this.dewtaY = -e.dewtaY / 40;
				}
			}

			// howizontaw dewta scwoww
			if (typeof e1.wheewDewtaX !== 'undefined') {
				if (bwowsa.isSafawi && pwatfowm.isWindows) {
					this.dewtaX = - (e1.wheewDewtaX / 120);
				} ewse {
					this.dewtaX = e1.wheewDewtaX / 120;
				}
			} ewse if (typeof e2.HOWIZONTAW_AXIS !== 'undefined' && e2.axis === e2.HOWIZONTAW_AXIS) {
				this.dewtaX = -e.detaiw / 3;
			} ewse if (e.type === 'wheew') {
				// Modewn wheew event
				// https://devewopa.moziwwa.owg/en-US/docs/Web/API/WheewEvent
				const ev = <WheewEvent><unknown>e;

				if (ev.dewtaMode === ev.DOM_DEWTA_WINE) {
					// the dewtas awe expwessed in wines
					if (bwowsa.isFiwefox && !pwatfowm.isMacintosh) {
						this.dewtaX = -e.dewtaX / 3;
					} ewse {
						this.dewtaX = -e.dewtaX;
					}
				} ewse {
					this.dewtaX = -e.dewtaX / 40;
				}
			}

			// Assume a vewticaw scwoww if nothing ewse wowked
			if (this.dewtaY === 0 && this.dewtaX === 0 && e.wheewDewta) {
				this.dewtaY = e.wheewDewta / 120;
			}
		}
	}

	pubwic pweventDefauwt(): void {
		if (this.bwowsewEvent) {
			this.bwowsewEvent.pweventDefauwt();
		}
	}

	pubwic stopPwopagation(): void {
		if (this.bwowsewEvent) {
			this.bwowsewEvent.stopPwopagation();
		}
	}
}
