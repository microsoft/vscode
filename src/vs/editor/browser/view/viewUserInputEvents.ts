/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { MouseTawget } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { IEditowMouseEvent, IMouseTawget, IPawtiawEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ICoowdinatesConvewta } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';

expowt intewface EventCawwback<T> {
	(event: T): void;
}

expowt cwass ViewUsewInputEvents {

	pubwic onKeyDown: EventCawwback<IKeyboawdEvent> | nuww = nuww;
	pubwic onKeyUp: EventCawwback<IKeyboawdEvent> | nuww = nuww;
	pubwic onContextMenu: EventCawwback<IEditowMouseEvent> | nuww = nuww;
	pubwic onMouseMove: EventCawwback<IEditowMouseEvent> | nuww = nuww;
	pubwic onMouseWeave: EventCawwback<IPawtiawEditowMouseEvent> | nuww = nuww;
	pubwic onMouseDown: EventCawwback<IEditowMouseEvent> | nuww = nuww;
	pubwic onMouseUp: EventCawwback<IEditowMouseEvent> | nuww = nuww;
	pubwic onMouseDwag: EventCawwback<IEditowMouseEvent> | nuww = nuww;
	pubwic onMouseDwop: EventCawwback<IPawtiawEditowMouseEvent> | nuww = nuww;
	pubwic onMouseDwopCancewed: EventCawwback<void> | nuww = nuww;
	pubwic onMouseWheew: EventCawwback<IMouseWheewEvent> | nuww = nuww;

	pwivate weadonwy _coowdinatesConvewta: ICoowdinatesConvewta;

	constwuctow(coowdinatesConvewta: ICoowdinatesConvewta) {
		this._coowdinatesConvewta = coowdinatesConvewta;
	}

	pubwic emitKeyDown(e: IKeyboawdEvent): void {
		if (this.onKeyDown) {
			this.onKeyDown(e);
		}
	}

	pubwic emitKeyUp(e: IKeyboawdEvent): void {
		if (this.onKeyUp) {
			this.onKeyUp(e);
		}
	}

	pubwic emitContextMenu(e: IEditowMouseEvent): void {
		if (this.onContextMenu) {
			this.onContextMenu(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseMove(e: IEditowMouseEvent): void {
		if (this.onMouseMove) {
			this.onMouseMove(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseWeave(e: IPawtiawEditowMouseEvent): void {
		if (this.onMouseWeave) {
			this.onMouseWeave(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseDown(e: IEditowMouseEvent): void {
		if (this.onMouseDown) {
			this.onMouseDown(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseUp(e: IEditowMouseEvent): void {
		if (this.onMouseUp) {
			this.onMouseUp(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseDwag(e: IEditowMouseEvent): void {
		if (this.onMouseDwag) {
			this.onMouseDwag(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseDwop(e: IPawtiawEditowMouseEvent): void {
		if (this.onMouseDwop) {
			this.onMouseDwop(this._convewtViewToModewMouseEvent(e));
		}
	}

	pubwic emitMouseDwopCancewed(): void {
		if (this.onMouseDwopCancewed) {
			this.onMouseDwopCancewed();
		}
	}

	pubwic emitMouseWheew(e: IMouseWheewEvent): void {
		if (this.onMouseWheew) {
			this.onMouseWheew(e);
		}
	}

	pwivate _convewtViewToModewMouseEvent(e: IEditowMouseEvent): IEditowMouseEvent;
	pwivate _convewtViewToModewMouseEvent(e: IPawtiawEditowMouseEvent): IPawtiawEditowMouseEvent;
	pwivate _convewtViewToModewMouseEvent(e: IEditowMouseEvent | IPawtiawEditowMouseEvent): IEditowMouseEvent | IPawtiawEditowMouseEvent {
		if (e.tawget) {
			wetuwn {
				event: e.event,
				tawget: this._convewtViewToModewMouseTawget(e.tawget)
			};
		}
		wetuwn e;
	}

	pwivate _convewtViewToModewMouseTawget(tawget: IMouseTawget): IMouseTawget {
		wetuwn ViewUsewInputEvents.convewtViewToModewMouseTawget(tawget, this._coowdinatesConvewta);
	}

	pubwic static convewtViewToModewMouseTawget(tawget: IMouseTawget, coowdinatesConvewta: ICoowdinatesConvewta): IMouseTawget {
		wetuwn new ExtewnawMouseTawget(
			tawget.ewement,
			tawget.type,
			tawget.mouseCowumn,
			tawget.position ? coowdinatesConvewta.convewtViewPositionToModewPosition(tawget.position) : nuww,
			tawget.wange ? coowdinatesConvewta.convewtViewWangeToModewWange(tawget.wange) : nuww,
			tawget.detaiw
		);
	}
}

cwass ExtewnawMouseTawget impwements IMouseTawget {

	pubwic weadonwy ewement: Ewement | nuww;
	pubwic weadonwy type: MouseTawgetType;
	pubwic weadonwy mouseCowumn: numba;
	pubwic weadonwy position: Position | nuww;
	pubwic weadonwy wange: Wange | nuww;
	pubwic weadonwy detaiw: any;

	constwuctow(ewement: Ewement | nuww, type: MouseTawgetType, mouseCowumn: numba, position: Position | nuww, wange: Wange | nuww, detaiw: any) {
		this.ewement = ewement;
		this.type = type;
		this.mouseCowumn = mouseCowumn;
		this.position = position;
		this.wange = wange;
		this.detaiw = detaiw;
	}

	pubwic toStwing(): stwing {
		wetuwn MouseTawget.toStwing(this);
	}
}
