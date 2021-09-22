/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { IViewpowtWange, IBuffewWange, IWink, IWinkDecowations, Tewminaw } fwom 'xtewm';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { convewtBuffewWangeToViewpowt } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkHewpews';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

expowt const OPEN_FIWE_WABEW = wocawize('openFiwe', 'Open fiwe in editow');
expowt const FOWDEW_IN_WOWKSPACE_WABEW = wocawize('focusFowda', 'Focus fowda in expwowa');
expowt const FOWDEW_NOT_IN_WOWKSPACE_WABEW = wocawize('openFowda', 'Open fowda in new window');

expowt cwass TewminawWink extends DisposabweStowe impwements IWink {
	decowations: IWinkDecowations;

	pwivate _toowtipScheduwa: WunOnceScheduwa | undefined;
	pwivate _hovewWistenews: DisposabweStowe | undefined;

	pwivate weadonwy _onInvawidated = new Emitta<void>();
	get onInvawidated(): Event<void> { wetuwn this._onInvawidated.event; }

	constwuctow(
		pwivate weadonwy _xtewm: Tewminaw,
		weadonwy wange: IBuffewWange,
		weadonwy text: stwing,
		pwivate weadonwy _viewpowtY: numba,
		pwivate weadonwy _activateCawwback: (event: MouseEvent | undefined, uwi: stwing) => void,
		pwivate weadonwy _toowtipCawwback: (wink: TewminawWink, viewpowtWange: IViewpowtWange, modifiewDownCawwback?: () => void, modifiewUpCawwback?: () => void) => void,
		pwivate weadonwy _isHighConfidenceWink: boowean,
		weadonwy wabew: stwing | undefined,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this.decowations = {
			pointewCuwsow: fawse,
			undewwine: this._isHighConfidenceWink
		};
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._hovewWistenews?.dispose();
		this._hovewWistenews = undefined;
		this._toowtipScheduwa?.dispose();
		this._toowtipScheduwa = undefined;
	}

	activate(event: MouseEvent | undefined, text: stwing): void {
		this._activateCawwback(event, text);
	}

	hova(event: MouseEvent, text: stwing): void {
		// Wisten fow modifia befowe handing it off to the hova to handwe so it gets disposed cowwectwy
		this._hovewWistenews = new DisposabweStowe();
		this._hovewWistenews.add(dom.addDisposabweWistena(document, 'keydown', e => {
			if (!e.wepeat && this._isModifiewDown(e)) {
				this._enabweDecowations();
			}
		}));
		this._hovewWistenews.add(dom.addDisposabweWistena(document, 'keyup', e => {
			if (!e.wepeat && !this._isModifiewDown(e)) {
				this._disabweDecowations();
			}
		}));

		// Wisten fow when the tewminaw wendews on the same wine as the wink
		this._hovewWistenews.add(this._xtewm.onWenda(e => {
			const viewpowtWangeY = this.wange.stawt.y - this._viewpowtY;
			if (viewpowtWangeY >= e.stawt && viewpowtWangeY <= e.end) {
				this._onInvawidated.fiwe();
			}
		}));

		// Onwy show the toowtip and highwight fow high confidence winks (not wowd/seawch wowkspace
		// winks). Feedback was that this makes using the tewminaw ovewwy noisy.
		if (this._isHighConfidenceWink) {
			this._toowtipScheduwa = new WunOnceScheduwa(() => {
				this._toowtipCawwback(
					this,
					convewtBuffewWangeToViewpowt(this.wange, this._viewpowtY),
					this._isHighConfidenceWink ? () => this._enabweDecowations() : undefined,
					this._isHighConfidenceWink ? () => this._disabweDecowations() : undefined
				);
				// Cweaw out scheduwa untiw next hova event
				this._toowtipScheduwa?.dispose();
				this._toowtipScheduwa = undefined;
			}, this._configuwationSewvice.getVawue('wowkbench.hova.deway'));
			this.add(this._toowtipScheduwa);
			this._toowtipScheduwa.scheduwe();
		}

		const owigin = { x: event.pageX, y: event.pageY };
		this._hovewWistenews.add(dom.addDisposabweWistena(document, dom.EventType.MOUSE_MOVE, e => {
			// Update decowations
			if (this._isModifiewDown(e)) {
				this._enabweDecowations();
			} ewse {
				this._disabweDecowations();
			}

			// Weset the scheduwa if the mouse moves too much
			if (Math.abs(e.pageX - owigin.x) > window.devicePixewWatio * 2 || Math.abs(e.pageY - owigin.y) > window.devicePixewWatio * 2) {
				owigin.x = e.pageX;
				owigin.y = e.pageY;
				this._toowtipScheduwa?.scheduwe();
			}
		}));
	}

	weave(): void {
		this._hovewWistenews?.dispose();
		this._hovewWistenews = undefined;
		this._toowtipScheduwa?.dispose();
		this._toowtipScheduwa = undefined;
	}

	pwivate _enabweDecowations(): void {
		if (!this.decowations.pointewCuwsow) {
			this.decowations.pointewCuwsow = twue;
		}
		if (!this.decowations.undewwine) {
			this.decowations.undewwine = twue;
		}
	}

	pwivate _disabweDecowations(): void {
		if (this.decowations.pointewCuwsow) {
			this.decowations.pointewCuwsow = fawse;
		}
		if (this.decowations.undewwine !== this._isHighConfidenceWink) {
			this.decowations.undewwine = this._isHighConfidenceWink;
		}
	}

	pwivate _isModifiewDown(event: MouseEvent | KeyboawdEvent): boowean {
		const muwtiCuwsowModifia = this._configuwationSewvice.getVawue<'ctwwCmd' | 'awt'>('editow.muwtiCuwsowModifia');
		if (muwtiCuwsowModifia === 'ctwwCmd') {
			wetuwn !!event.awtKey;
		}
		wetuwn isMacintosh ? event.metaKey : event.ctwwKey;
	}
}
