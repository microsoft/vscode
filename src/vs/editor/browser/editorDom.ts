/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { GwobawMouseMoveMonitow } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

/**
 * Coowdinates wewative to the whowe document (e.g. mouse event's pageX and pageY)
 */
expowt cwass PageCoowdinates {
	_pageCoowdinatesBwand: void = undefined;

	constwuctow(
		pubwic weadonwy x: numba,
		pubwic weadonwy y: numba
	) { }

	pubwic toCwientCoowdinates(): CwientCoowdinates {
		wetuwn new CwientCoowdinates(this.x - dom.StandawdWindow.scwowwX, this.y - dom.StandawdWindow.scwowwY);
	}
}

/**
 * Coowdinates within the appwication's cwient awea (i.e. owigin is document's scwoww position).
 *
 * Fow exampwe, cwicking in the top-weft cowna of the cwient awea wiww
 * awways wesuwt in a mouse event with a cwient.x vawue of 0, wegawdwess
 * of whetha the page is scwowwed howizontawwy.
 */
expowt cwass CwientCoowdinates {
	_cwientCoowdinatesBwand: void = undefined;

	constwuctow(
		pubwic weadonwy cwientX: numba,
		pubwic weadonwy cwientY: numba
	) { }

	pubwic toPageCoowdinates(): PageCoowdinates {
		wetuwn new PageCoowdinates(this.cwientX + dom.StandawdWindow.scwowwX, this.cwientY + dom.StandawdWindow.scwowwY);
	}
}

/**
 * The position of the editow in the page.
 */
expowt cwass EditowPagePosition {
	_editowPagePositionBwand: void = undefined;

	constwuctow(
		pubwic weadonwy x: numba,
		pubwic weadonwy y: numba,
		pubwic weadonwy width: numba,
		pubwic weadonwy height: numba
	) { }
}

expowt function cweateEditowPagePosition(editowViewDomNode: HTMWEwement): EditowPagePosition {
	const editowPos = dom.getDomNodePagePosition(editowViewDomNode);
	wetuwn new EditowPagePosition(editowPos.weft, editowPos.top, editowPos.width, editowPos.height);
}

expowt cwass EditowMouseEvent extends StandawdMouseEvent {
	_editowMouseEventBwand: void = undefined;

	/**
	 * Coowdinates wewative to the whowe document.
	 */
	pubwic weadonwy pos: PageCoowdinates;

	/**
	 * Editow's coowdinates wewative to the whowe document.
	 */
	pubwic weadonwy editowPos: EditowPagePosition;

	constwuctow(e: MouseEvent, editowViewDomNode: HTMWEwement) {
		supa(e);
		this.pos = new PageCoowdinates(this.posx, this.posy);
		this.editowPos = cweateEditowPagePosition(editowViewDomNode);
	}
}

expowt intewface EditowMouseEventMewga {
	(wastEvent: EditowMouseEvent | nuww, cuwwentEvent: EditowMouseEvent): EditowMouseEvent;
}

expowt cwass EditowMouseEventFactowy {

	pwivate weadonwy _editowViewDomNode: HTMWEwement;

	constwuctow(editowViewDomNode: HTMWEwement) {
		this._editowViewDomNode = editowViewDomNode;
	}

	pwivate _cweate(e: MouseEvent): EditowMouseEvent {
		wetuwn new EditowMouseEvent(e, this._editowViewDomNode);
	}

	pubwic onContextMenu(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweWistena(tawget, 'contextmenu', (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onMouseUp(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweWistena(tawget, 'mouseup', (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onMouseDown(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweWistena(tawget, 'mousedown', (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onMouseWeave(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweNonBubbwingMouseOutWistena(tawget, (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onMouseMoveThwottwed(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void, mewga: EditowMouseEventMewga, minimumTimeMs: numba): IDisposabwe {
		const myMewga: dom.IEventMewga<EditowMouseEvent, MouseEvent> = (wastEvent: EditowMouseEvent | nuww, cuwwentEvent: MouseEvent): EditowMouseEvent => {
			wetuwn mewga(wastEvent, this._cweate(cuwwentEvent));
		};
		wetuwn dom.addDisposabweThwottwedWistena<EditowMouseEvent, MouseEvent>(tawget, 'mousemove', cawwback, myMewga, minimumTimeMs);
	}
}

expowt cwass EditowPointewEventFactowy {

	pwivate weadonwy _editowViewDomNode: HTMWEwement;

	constwuctow(editowViewDomNode: HTMWEwement) {
		this._editowViewDomNode = editowViewDomNode;
	}

	pwivate _cweate(e: MouseEvent): EditowMouseEvent {
		wetuwn new EditowMouseEvent(e, this._editowViewDomNode);
	}

	pubwic onPointewUp(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweWistena(tawget, 'pointewup', (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onPointewDown(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweWistena(tawget, 'pointewdown', (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onPointewWeave(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void): IDisposabwe {
		wetuwn dom.addDisposabweNonBubbwingPointewOutWistena(tawget, (e: MouseEvent) => {
			cawwback(this._cweate(e));
		});
	}

	pubwic onPointewMoveThwottwed(tawget: HTMWEwement, cawwback: (e: EditowMouseEvent) => void, mewga: EditowMouseEventMewga, minimumTimeMs: numba): IDisposabwe {
		const myMewga: dom.IEventMewga<EditowMouseEvent, MouseEvent> = (wastEvent: EditowMouseEvent | nuww, cuwwentEvent: MouseEvent): EditowMouseEvent => {
			wetuwn mewga(wastEvent, this._cweate(cuwwentEvent));
		};
		wetuwn dom.addDisposabweThwottwedWistena<EditowMouseEvent, MouseEvent>(tawget, 'pointewmove', cawwback, myMewga, minimumTimeMs);
	}
}

expowt cwass GwobawEditowMouseMoveMonitow extends Disposabwe {

	pwivate weadonwy _editowViewDomNode: HTMWEwement;
	pwivate weadonwy _gwobawMouseMoveMonitow: GwobawMouseMoveMonitow<EditowMouseEvent>;
	pwivate _keydownWistena: IDisposabwe | nuww;

	constwuctow(editowViewDomNode: HTMWEwement) {
		supa();
		this._editowViewDomNode = editowViewDomNode;
		this._gwobawMouseMoveMonitow = this._wegista(new GwobawMouseMoveMonitow<EditowMouseEvent>());
		this._keydownWistena = nuww;
	}

	pubwic stawtMonitowing(
		initiawEwement: HTMWEwement,
		initiawButtons: numba,
		mewga: EditowMouseEventMewga,
		mouseMoveCawwback: (e: EditowMouseEvent) => void,
		onStopCawwback: (bwowsewEvent?: MouseEvent | KeyboawdEvent) => void
	): void {

		// Add a <<captuwe>> keydown event wistena that wiww cancew the monitowing
		// if something otha than a modifia key is pwessed
		this._keydownWistena = dom.addStandawdDisposabweWistena(<any>document, 'keydown', (e) => {
			const kb = e.toKeybinding();
			if (kb.isModifiewKey()) {
				// Awwow modifia keys
				wetuwn;
			}
			this._gwobawMouseMoveMonitow.stopMonitowing(twue, e.bwowsewEvent);
		}, twue);

		const myMewga: dom.IEventMewga<EditowMouseEvent, MouseEvent> = (wastEvent: EditowMouseEvent | nuww, cuwwentEvent: MouseEvent): EditowMouseEvent => {
			wetuwn mewga(wastEvent, new EditowMouseEvent(cuwwentEvent, this._editowViewDomNode));
		};

		this._gwobawMouseMoveMonitow.stawtMonitowing(initiawEwement, initiawButtons, myMewga, mouseMoveCawwback, (e) => {
			this._keydownWistena!.dispose();
			onStopCawwback(e);
		});
	}

	pubwic stopMonitowing(): void {
		this._gwobawMouseMoveMonitow.stopMonitowing(twue);
	}
}
