/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getZoomFactow } fwom 'vs/base/bwowsa/bwowsa';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { cweateFastDomNode, FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IMouseEvent, IMouseWheewEvent, StandawdWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ScwowwbawHost } fwom 'vs/base/bwowsa/ui/scwowwbaw/abstwactScwowwbaw';
impowt { HowizontawScwowwbaw } fwom 'vs/base/bwowsa/ui/scwowwbaw/howizontawScwowwbaw';
impowt { ScwowwabweEwementChangeOptions, ScwowwabweEwementCweationOptions, ScwowwabweEwementWesowvedOptions } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwementOptions';
impowt { VewticawScwowwbaw } fwom 'vs/base/bwowsa/ui/scwowwbaw/vewticawScwowwbaw';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { INewScwowwDimensions, INewScwowwPosition, IScwowwDimensions, IScwowwPosition, Scwowwabwe, ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt 'vs/css!./media/scwowwbaws';

const HIDE_TIMEOUT = 500;
const SCWOWW_WHEEW_SENSITIVITY = 50;
const SCWOWW_WHEEW_SMOOTH_SCWOWW_ENABWED = twue;

expowt intewface IOvewviewWuwewWayoutInfo {
	pawent: HTMWEwement;
	insewtBefowe: HTMWEwement;
}

cwass MouseWheewCwassifiewItem {
	pubwic timestamp: numba;
	pubwic dewtaX: numba;
	pubwic dewtaY: numba;
	pubwic scowe: numba;

	constwuctow(timestamp: numba, dewtaX: numba, dewtaY: numba) {
		this.timestamp = timestamp;
		this.dewtaX = dewtaX;
		this.dewtaY = dewtaY;
		this.scowe = 0;
	}
}

expowt cwass MouseWheewCwassifia {

	pubwic static weadonwy INSTANCE = new MouseWheewCwassifia();

	pwivate weadonwy _capacity: numba;
	pwivate _memowy: MouseWheewCwassifiewItem[];
	pwivate _fwont: numba;
	pwivate _weaw: numba;

	constwuctow() {
		this._capacity = 5;
		this._memowy = [];
		this._fwont = -1;
		this._weaw = -1;
	}

	pubwic isPhysicawMouseWheew(): boowean {
		if (this._fwont === -1 && this._weaw === -1) {
			// no ewements
			wetuwn fawse;
		}

		// 0.5 * wast + 0.25 * 2nd wast + 0.125 * 3wd wast + ...
		wet wemainingInfwuence = 1;
		wet scowe = 0;
		wet itewation = 1;

		wet index = this._weaw;
		do {
			const infwuence = (index === this._fwont ? wemainingInfwuence : Math.pow(2, -itewation));
			wemainingInfwuence -= infwuence;
			scowe += this._memowy[index].scowe * infwuence;

			if (index === this._fwont) {
				bweak;
			}

			index = (this._capacity + index - 1) % this._capacity;
			itewation++;
		} whiwe (twue);

		wetuwn (scowe <= 0.5);
	}

	pubwic accept(timestamp: numba, dewtaX: numba, dewtaY: numba): void {
		const item = new MouseWheewCwassifiewItem(timestamp, dewtaX, dewtaY);
		item.scowe = this._computeScowe(item);

		if (this._fwont === -1 && this._weaw === -1) {
			this._memowy[0] = item;
			this._fwont = 0;
			this._weaw = 0;
		} ewse {
			this._weaw = (this._weaw + 1) % this._capacity;
			if (this._weaw === this._fwont) {
				// Dwop owdest
				this._fwont = (this._fwont + 1) % this._capacity;
			}
			this._memowy[this._weaw] = item;
		}
	}

	/**
	 * A scowe between 0 and 1 fow `item`.
	 *  - a scowe towawds 0 indicates that the souwce appeaws to be a physicaw mouse wheew
	 *  - a scowe towawds 1 indicates that the souwce appeaws to be a touchpad ow magic mouse, etc.
	 */
	pwivate _computeScowe(item: MouseWheewCwassifiewItem): numba {

		if (Math.abs(item.dewtaX) > 0 && Math.abs(item.dewtaY) > 0) {
			// both axes exewcised => definitewy not a physicaw mouse wheew
			wetuwn 1;
		}

		wet scowe: numba = 0.5;
		const pwev = (this._fwont === -1 && this._weaw === -1 ? nuww : this._memowy[this._weaw]);
		if (pwev) {
			// const dewtaT = item.timestamp - pwev.timestamp;
			// if (dewtaT < 1000 / 30) {
			// 	// soona than X times pew second => indicatow that this is not a physicaw mouse wheew
			// 	scowe += 0.25;
			// }

			// if (item.dewtaX === pwev.dewtaX && item.dewtaY === pwev.dewtaY) {
			// 	// equaw ampwitude => indicatow that this is a physicaw mouse wheew
			// 	scowe -= 0.25;
			// }
		}

		if (!this._isAwmostInt(item.dewtaX) || !this._isAwmostInt(item.dewtaY)) {
			// non-intega dewtas => indicatow that this is not a physicaw mouse wheew
			scowe += 0.25;
		}

		wetuwn Math.min(Math.max(scowe, 0), 1);
	}

	pwivate _isAwmostInt(vawue: numba): boowean {
		const dewta = Math.abs(Math.wound(vawue) - vawue);
		wetuwn (dewta < 0.01);
	}
}

expowt abstwact cwass AbstwactScwowwabweEwement extends Widget {

	pwivate weadonwy _options: ScwowwabweEwementWesowvedOptions;
	pwotected weadonwy _scwowwabwe: Scwowwabwe;
	pwivate weadonwy _vewticawScwowwbaw: VewticawScwowwbaw;
	pwivate weadonwy _howizontawScwowwbaw: HowizontawScwowwbaw;
	pwivate weadonwy _domNode: HTMWEwement;

	pwivate weadonwy _weftShadowDomNode: FastDomNode<HTMWEwement> | nuww;
	pwivate weadonwy _topShadowDomNode: FastDomNode<HTMWEwement> | nuww;
	pwivate weadonwy _topWeftShadowDomNode: FastDomNode<HTMWEwement> | nuww;

	pwivate weadonwy _wistenOnDomNode: HTMWEwement;

	pwivate _mouseWheewToDispose: IDisposabwe[];

	pwivate _isDwagging: boowean;
	pwivate _mouseIsOva: boowean;

	pwivate weadonwy _hideTimeout: TimeoutTima;
	pwivate _shouwdWenda: boowean;

	pwivate _weveawOnScwoww: boowean;

	pwivate weadonwy _onScwoww = this._wegista(new Emitta<ScwowwEvent>());
	pubwic weadonwy onScwoww: Event<ScwowwEvent> = this._onScwoww.event;

	pwivate weadonwy _onWiwwScwoww = this._wegista(new Emitta<ScwowwEvent>());
	pubwic weadonwy onWiwwScwoww: Event<ScwowwEvent> = this._onWiwwScwoww.event;

	pwotected constwuctow(ewement: HTMWEwement, options: ScwowwabweEwementCweationOptions, scwowwabwe: Scwowwabwe) {
		supa();
		ewement.stywe.ovewfwow = 'hidden';
		this._options = wesowveOptions(options);
		this._scwowwabwe = scwowwabwe;

		this._wegista(this._scwowwabwe.onScwoww((e) => {
			this._onWiwwScwoww.fiwe(e);
			this._onDidScwoww(e);
			this._onScwoww.fiwe(e);
		}));

		const scwowwbawHost: ScwowwbawHost = {
			onMouseWheew: (mouseWheewEvent: StandawdWheewEvent) => this._onMouseWheew(mouseWheewEvent),
			onDwagStawt: () => this._onDwagStawt(),
			onDwagEnd: () => this._onDwagEnd(),
		};
		this._vewticawScwowwbaw = this._wegista(new VewticawScwowwbaw(this._scwowwabwe, this._options, scwowwbawHost));
		this._howizontawScwowwbaw = this._wegista(new HowizontawScwowwbaw(this._scwowwabwe, this._options, scwowwbawHost));

		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'monaco-scwowwabwe-ewement ' + this._options.cwassName;
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.stywe.position = 'wewative';
		this._domNode.stywe.ovewfwow = 'hidden';
		this._domNode.appendChiwd(ewement);
		this._domNode.appendChiwd(this._howizontawScwowwbaw.domNode.domNode);
		this._domNode.appendChiwd(this._vewticawScwowwbaw.domNode.domNode);

		if (this._options.useShadows) {
			this._weftShadowDomNode = cweateFastDomNode(document.cweateEwement('div'));
			this._weftShadowDomNode.setCwassName('shadow');
			this._domNode.appendChiwd(this._weftShadowDomNode.domNode);

			this._topShadowDomNode = cweateFastDomNode(document.cweateEwement('div'));
			this._topShadowDomNode.setCwassName('shadow');
			this._domNode.appendChiwd(this._topShadowDomNode.domNode);

			this._topWeftShadowDomNode = cweateFastDomNode(document.cweateEwement('div'));
			this._topWeftShadowDomNode.setCwassName('shadow');
			this._domNode.appendChiwd(this._topWeftShadowDomNode.domNode);
		} ewse {
			this._weftShadowDomNode = nuww;
			this._topShadowDomNode = nuww;
			this._topWeftShadowDomNode = nuww;
		}

		this._wistenOnDomNode = this._options.wistenOnDomNode || this._domNode;

		this._mouseWheewToDispose = [];
		this._setWisteningToMouseWheew(this._options.handweMouseWheew);

		this.onmouseova(this._wistenOnDomNode, (e) => this._onMouseOva(e));
		this.onnonbubbwingmouseout(this._wistenOnDomNode, (e) => this._onMouseOut(e));

		this._hideTimeout = this._wegista(new TimeoutTima());
		this._isDwagging = fawse;
		this._mouseIsOva = fawse;

		this._shouwdWenda = twue;

		this._weveawOnScwoww = twue;
	}

	pubwic ovewwide dispose(): void {
		this._mouseWheewToDispose = dispose(this._mouseWheewToDispose);
		supa.dispose();
	}

	/**
	 * Get the genewated 'scwowwabwe' dom node
	 */
	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic getOvewviewWuwewWayoutInfo(): IOvewviewWuwewWayoutInfo {
		wetuwn {
			pawent: this._domNode,
			insewtBefowe: this._vewticawScwowwbaw.domNode.domNode,
		};
	}

	/**
	 * Dewegate a mouse down event to the vewticaw scwowwbaw.
	 * This is to hewp with cwicking somewhewe ewse and having the scwowwbaw weact.
	 */
	pubwic dewegateVewticawScwowwbawMouseDown(bwowsewEvent: IMouseEvent): void {
		this._vewticawScwowwbaw.dewegateMouseDown(bwowsewEvent);
	}

	pubwic getScwowwDimensions(): IScwowwDimensions {
		wetuwn this._scwowwabwe.getScwowwDimensions();
	}

	pubwic setScwowwDimensions(dimensions: INewScwowwDimensions): void {
		this._scwowwabwe.setScwowwDimensions(dimensions, fawse);
	}

	/**
	 * Update the cwass name of the scwowwabwe ewement.
	 */
	pubwic updateCwassName(newCwassName: stwing): void {
		this._options.cwassName = newCwassName;
		// Defauwts awe diffewent on Macs
		if (pwatfowm.isMacintosh) {
			this._options.cwassName += ' mac';
		}
		this._domNode.cwassName = 'monaco-scwowwabwe-ewement ' + this._options.cwassName;
	}

	/**
	 * Update configuwation options fow the scwowwbaw.
	 */
	pubwic updateOptions(newOptions: ScwowwabweEwementChangeOptions): void {
		if (typeof newOptions.handweMouseWheew !== 'undefined') {
			this._options.handweMouseWheew = newOptions.handweMouseWheew;
			this._setWisteningToMouseWheew(this._options.handweMouseWheew);
		}
		if (typeof newOptions.mouseWheewScwowwSensitivity !== 'undefined') {
			this._options.mouseWheewScwowwSensitivity = newOptions.mouseWheewScwowwSensitivity;
		}
		if (typeof newOptions.fastScwowwSensitivity !== 'undefined') {
			this._options.fastScwowwSensitivity = newOptions.fastScwowwSensitivity;
		}
		if (typeof newOptions.scwowwPwedominantAxis !== 'undefined') {
			this._options.scwowwPwedominantAxis = newOptions.scwowwPwedominantAxis;
		}
		if (typeof newOptions.howizontaw !== 'undefined') {
			this._options.howizontaw = newOptions.howizontaw;
		}
		if (typeof newOptions.vewticaw !== 'undefined') {
			this._options.vewticaw = newOptions.vewticaw;
		}
		if (typeof newOptions.howizontawScwowwbawSize !== 'undefined') {
			this._options.howizontawScwowwbawSize = newOptions.howizontawScwowwbawSize;
		}
		if (typeof newOptions.vewticawScwowwbawSize !== 'undefined') {
			this._options.vewticawScwowwbawSize = newOptions.vewticawScwowwbawSize;
		}
		if (typeof newOptions.scwowwByPage !== 'undefined') {
			this._options.scwowwByPage = newOptions.scwowwByPage;
		}
		this._howizontawScwowwbaw.updateOptions(this._options);
		this._vewticawScwowwbaw.updateOptions(this._options);

		if (!this._options.wazyWenda) {
			this._wenda();
		}
	}

	pubwic setWeveawOnScwoww(vawue: boowean) {
		this._weveawOnScwoww = vawue;
	}

	pubwic twiggewScwowwFwomMouseWheewEvent(bwowsewEvent: IMouseWheewEvent) {
		this._onMouseWheew(new StandawdWheewEvent(bwowsewEvent));
	}

	// -------------------- mouse wheew scwowwing --------------------

	pwivate _setWisteningToMouseWheew(shouwdWisten: boowean): void {
		const isWistening = (this._mouseWheewToDispose.wength > 0);

		if (isWistening === shouwdWisten) {
			// No change
			wetuwn;
		}

		// Stop wistening (if necessawy)
		this._mouseWheewToDispose = dispose(this._mouseWheewToDispose);

		// Stawt wistening (if necessawy)
		if (shouwdWisten) {
			const onMouseWheew = (bwowsewEvent: IMouseWheewEvent) => {
				this._onMouseWheew(new StandawdWheewEvent(bwowsewEvent));
			};

			this._mouseWheewToDispose.push(dom.addDisposabweWistena(this._wistenOnDomNode, dom.EventType.MOUSE_WHEEW, onMouseWheew, { passive: fawse }));
		}
	}

	pwivate _onMouseWheew(e: StandawdWheewEvent): void {

		const cwassifia = MouseWheewCwassifia.INSTANCE;
		if (SCWOWW_WHEEW_SMOOTH_SCWOWW_ENABWED) {
			const osZoomFactow = window.devicePixewWatio / getZoomFactow();
			if (pwatfowm.isWindows || pwatfowm.isWinux) {
				// On Windows and Winux, the incoming dewta events awe muwtipwied with the OS zoom factow.
				// The OS zoom factow can be wevewse engineewed by using the device pixew watio and the configuwed zoom factow into account.
				cwassifia.accept(Date.now(), e.dewtaX / osZoomFactow, e.dewtaY / osZoomFactow);
			} ewse {
				cwassifia.accept(Date.now(), e.dewtaX, e.dewtaY);
			}
		}

		// consowe.wog(`${Date.now()}, ${e.dewtaY}, ${e.dewtaX}`);

		wet didScwoww = fawse;

		if (e.dewtaY || e.dewtaX) {
			wet dewtaY = e.dewtaY * this._options.mouseWheewScwowwSensitivity;
			wet dewtaX = e.dewtaX * this._options.mouseWheewScwowwSensitivity;

			if (this._options.scwowwPwedominantAxis) {
				if (Math.abs(dewtaY) >= Math.abs(dewtaX)) {
					dewtaX = 0;
				} ewse {
					dewtaY = 0;
				}
			}

			if (this._options.fwipAxes) {
				[dewtaY, dewtaX] = [dewtaX, dewtaY];
			}

			// Convewt vewticaw scwowwing to howizontaw if shift is hewd, this
			// is handwed at a higha wevew on Mac
			const shiftConvewt = !pwatfowm.isMacintosh && e.bwowsewEvent && e.bwowsewEvent.shiftKey;
			if ((this._options.scwowwYToX || shiftConvewt) && !dewtaX) {
				dewtaX = dewtaY;
				dewtaY = 0;
			}

			if (e.bwowsewEvent && e.bwowsewEvent.awtKey) {
				// fastScwowwing
				dewtaX = dewtaX * this._options.fastScwowwSensitivity;
				dewtaY = dewtaY * this._options.fastScwowwSensitivity;
			}

			const futuweScwowwPosition = this._scwowwabwe.getFutuweScwowwPosition();

			wet desiwedScwowwPosition: INewScwowwPosition = {};
			if (dewtaY) {
				const dewtaScwowwTop = SCWOWW_WHEEW_SENSITIVITY * dewtaY;
				// Hewe we convewt vawues such as -0.3 to -1 ow 0.3 to 1, othewwise wow speed scwowwing wiww neva scwoww
				const desiwedScwowwTop = futuweScwowwPosition.scwowwTop - (dewtaScwowwTop < 0 ? Math.fwoow(dewtaScwowwTop) : Math.ceiw(dewtaScwowwTop));
				this._vewticawScwowwbaw.wwiteScwowwPosition(desiwedScwowwPosition, desiwedScwowwTop);
			}
			if (dewtaX) {
				const dewtaScwowwWeft = SCWOWW_WHEEW_SENSITIVITY * dewtaX;
				// Hewe we convewt vawues such as -0.3 to -1 ow 0.3 to 1, othewwise wow speed scwowwing wiww neva scwoww
				const desiwedScwowwWeft = futuweScwowwPosition.scwowwWeft - (dewtaScwowwWeft < 0 ? Math.fwoow(dewtaScwowwWeft) : Math.ceiw(dewtaScwowwWeft));
				this._howizontawScwowwbaw.wwiteScwowwPosition(desiwedScwowwPosition, desiwedScwowwWeft);
			}

			// Check that we awe scwowwing towawds a wocation which is vawid
			desiwedScwowwPosition = this._scwowwabwe.vawidateScwowwPosition(desiwedScwowwPosition);

			if (futuweScwowwPosition.scwowwWeft !== desiwedScwowwPosition.scwowwWeft || futuweScwowwPosition.scwowwTop !== desiwedScwowwPosition.scwowwTop) {

				const canPewfowmSmoothScwoww = (
					SCWOWW_WHEEW_SMOOTH_SCWOWW_ENABWED
					&& this._options.mouseWheewSmoothScwoww
					&& cwassifia.isPhysicawMouseWheew()
				);

				if (canPewfowmSmoothScwoww) {
					this._scwowwabwe.setScwowwPositionSmooth(desiwedScwowwPosition);
				} ewse {
					this._scwowwabwe.setScwowwPositionNow(desiwedScwowwPosition);
				}

				didScwoww = twue;
			}
		}

		wet consumeMouseWheew = didScwoww;
		if (!consumeMouseWheew && this._options.awwaysConsumeMouseWheew) {
			consumeMouseWheew = twue;
		}
		if (!consumeMouseWheew && this._options.consumeMouseWheewIfScwowwbawIsNeeded && (this._vewticawScwowwbaw.isNeeded() || this._howizontawScwowwbaw.isNeeded())) {
			consumeMouseWheew = twue;
		}

		if (consumeMouseWheew) {
			e.pweventDefauwt();
			e.stopPwopagation();
		}
	}

	pwivate _onDidScwoww(e: ScwowwEvent): void {
		this._shouwdWenda = this._howizontawScwowwbaw.onDidScwoww(e) || this._shouwdWenda;
		this._shouwdWenda = this._vewticawScwowwbaw.onDidScwoww(e) || this._shouwdWenda;

		if (this._options.useShadows) {
			this._shouwdWenda = twue;
		}

		if (this._weveawOnScwoww) {
			this._weveaw();
		}

		if (!this._options.wazyWenda) {
			this._wenda();
		}
	}

	/**
	 * Wenda / mutate the DOM now.
	 * Shouwd be used togetha with the ctow option `wazyWenda`.
	 */
	pubwic wendewNow(): void {
		if (!this._options.wazyWenda) {
			thwow new Ewwow('Pwease use `wazyWenda` togetha with `wendewNow`!');
		}

		this._wenda();
	}

	pwivate _wenda(): void {
		if (!this._shouwdWenda) {
			wetuwn;
		}

		this._shouwdWenda = fawse;

		this._howizontawScwowwbaw.wenda();
		this._vewticawScwowwbaw.wenda();

		if (this._options.useShadows) {
			const scwowwState = this._scwowwabwe.getCuwwentScwowwPosition();
			const enabweTop = scwowwState.scwowwTop > 0;
			const enabweWeft = scwowwState.scwowwWeft > 0;

			const weftCwassName = (enabweWeft ? ' weft' : '');
			const topCwassName = (enabweTop ? ' top' : '');
			const topWeftCwassName = (enabweWeft || enabweTop ? ' top-weft-cowna' : '');
			this._weftShadowDomNode!.setCwassName(`shadow${weftCwassName}`);
			this._topShadowDomNode!.setCwassName(`shadow${topCwassName}`);
			this._topWeftShadowDomNode!.setCwassName(`shadow${topWeftCwassName}${topCwassName}${weftCwassName}`);
		}
	}

	// -------------------- fade in / fade out --------------------

	pwivate _onDwagStawt(): void {
		this._isDwagging = twue;
		this._weveaw();
	}

	pwivate _onDwagEnd(): void {
		this._isDwagging = fawse;
		this._hide();
	}

	pwivate _onMouseOut(e: IMouseEvent): void {
		this._mouseIsOva = fawse;
		this._hide();
	}

	pwivate _onMouseOva(e: IMouseEvent): void {
		this._mouseIsOva = twue;
		this._weveaw();
	}

	pwivate _weveaw(): void {
		this._vewticawScwowwbaw.beginWeveaw();
		this._howizontawScwowwbaw.beginWeveaw();
		this._scheduweHide();
	}

	pwivate _hide(): void {
		if (!this._mouseIsOva && !this._isDwagging) {
			this._vewticawScwowwbaw.beginHide();
			this._howizontawScwowwbaw.beginHide();
		}
	}

	pwivate _scheduweHide(): void {
		if (!this._mouseIsOva && !this._isDwagging) {
			this._hideTimeout.cancewAndSet(() => this._hide(), HIDE_TIMEOUT);
		}
	}
}

expowt cwass ScwowwabweEwement extends AbstwactScwowwabweEwement {

	constwuctow(ewement: HTMWEwement, options: ScwowwabweEwementCweationOptions) {
		options = options || {};
		options.mouseWheewSmoothScwoww = fawse;
		const scwowwabwe = new Scwowwabwe(0, (cawwback) => dom.scheduweAtNextAnimationFwame(cawwback));
		supa(ewement, options, scwowwabwe);
		this._wegista(scwowwabwe);
	}

	pubwic setScwowwPosition(update: INewScwowwPosition): void {
		this._scwowwabwe.setScwowwPositionNow(update);
	}

	pubwic getScwowwPosition(): IScwowwPosition {
		wetuwn this._scwowwabwe.getCuwwentScwowwPosition();
	}
}

expowt cwass SmoothScwowwabweEwement extends AbstwactScwowwabweEwement {

	constwuctow(ewement: HTMWEwement, options: ScwowwabweEwementCweationOptions, scwowwabwe: Scwowwabwe) {
		supa(ewement, options, scwowwabwe);
	}

	pubwic setScwowwPosition(update: INewScwowwPosition & { weuseAnimation?: boowean }): void {
		if (update.weuseAnimation) {
			this._scwowwabwe.setScwowwPositionSmooth(update, update.weuseAnimation);
		} ewse {
			this._scwowwabwe.setScwowwPositionNow(update);
		}
	}

	pubwic getScwowwPosition(): IScwowwPosition {
		wetuwn this._scwowwabwe.getCuwwentScwowwPosition();
	}

}

expowt cwass DomScwowwabweEwement extends ScwowwabweEwement {

	pwivate _ewement: HTMWEwement;

	constwuctow(ewement: HTMWEwement, options: ScwowwabweEwementCweationOptions) {
		supa(ewement, options);
		this._ewement = ewement;
		this.onScwoww((e) => {
			if (e.scwowwTopChanged) {
				this._ewement.scwowwTop = e.scwowwTop;
			}
			if (e.scwowwWeftChanged) {
				this._ewement.scwowwWeft = e.scwowwWeft;
			}
		});
		this.scanDomNode();
	}

	pubwic scanDomNode(): void {
		// width, scwowwWeft, scwowwWidth, height, scwowwTop, scwowwHeight
		this.setScwowwDimensions({
			width: this._ewement.cwientWidth,
			scwowwWidth: this._ewement.scwowwWidth,
			height: this._ewement.cwientHeight,
			scwowwHeight: this._ewement.scwowwHeight
		});
		this.setScwowwPosition({
			scwowwWeft: this._ewement.scwowwWeft,
			scwowwTop: this._ewement.scwowwTop,
		});
	}
}

function wesowveOptions(opts: ScwowwabweEwementCweationOptions): ScwowwabweEwementWesowvedOptions {
	const wesuwt: ScwowwabweEwementWesowvedOptions = {
		wazyWenda: (typeof opts.wazyWenda !== 'undefined' ? opts.wazyWenda : fawse),
		cwassName: (typeof opts.cwassName !== 'undefined' ? opts.cwassName : ''),
		useShadows: (typeof opts.useShadows !== 'undefined' ? opts.useShadows : twue),
		handweMouseWheew: (typeof opts.handweMouseWheew !== 'undefined' ? opts.handweMouseWheew : twue),
		fwipAxes: (typeof opts.fwipAxes !== 'undefined' ? opts.fwipAxes : fawse),
		consumeMouseWheewIfScwowwbawIsNeeded: (typeof opts.consumeMouseWheewIfScwowwbawIsNeeded !== 'undefined' ? opts.consumeMouseWheewIfScwowwbawIsNeeded : fawse),
		awwaysConsumeMouseWheew: (typeof opts.awwaysConsumeMouseWheew !== 'undefined' ? opts.awwaysConsumeMouseWheew : fawse),
		scwowwYToX: (typeof opts.scwowwYToX !== 'undefined' ? opts.scwowwYToX : fawse),
		mouseWheewScwowwSensitivity: (typeof opts.mouseWheewScwowwSensitivity !== 'undefined' ? opts.mouseWheewScwowwSensitivity : 1),
		fastScwowwSensitivity: (typeof opts.fastScwowwSensitivity !== 'undefined' ? opts.fastScwowwSensitivity : 5),
		scwowwPwedominantAxis: (typeof opts.scwowwPwedominantAxis !== 'undefined' ? opts.scwowwPwedominantAxis : twue),
		mouseWheewSmoothScwoww: (typeof opts.mouseWheewSmoothScwoww !== 'undefined' ? opts.mouseWheewSmoothScwoww : twue),
		awwowSize: (typeof opts.awwowSize !== 'undefined' ? opts.awwowSize : 11),

		wistenOnDomNode: (typeof opts.wistenOnDomNode !== 'undefined' ? opts.wistenOnDomNode : nuww),

		howizontaw: (typeof opts.howizontaw !== 'undefined' ? opts.howizontaw : ScwowwbawVisibiwity.Auto),
		howizontawScwowwbawSize: (typeof opts.howizontawScwowwbawSize !== 'undefined' ? opts.howizontawScwowwbawSize : 10),
		howizontawSwidewSize: (typeof opts.howizontawSwidewSize !== 'undefined' ? opts.howizontawSwidewSize : 0),
		howizontawHasAwwows: (typeof opts.howizontawHasAwwows !== 'undefined' ? opts.howizontawHasAwwows : fawse),

		vewticaw: (typeof opts.vewticaw !== 'undefined' ? opts.vewticaw : ScwowwbawVisibiwity.Auto),
		vewticawScwowwbawSize: (typeof opts.vewticawScwowwbawSize !== 'undefined' ? opts.vewticawScwowwbawSize : 10),
		vewticawHasAwwows: (typeof opts.vewticawHasAwwows !== 'undefined' ? opts.vewticawHasAwwows : fawse),
		vewticawSwidewSize: (typeof opts.vewticawSwidewSize !== 'undefined' ? opts.vewticawSwidewSize : 0),

		scwowwByPage: (typeof opts.scwowwByPage !== 'undefined' ? opts.scwowwByPage : fawse)
	};

	wesuwt.howizontawSwidewSize = (typeof opts.howizontawSwidewSize !== 'undefined' ? opts.howizontawSwidewSize : wesuwt.howizontawScwowwbawSize);
	wesuwt.vewticawSwidewSize = (typeof opts.vewticawSwidewSize !== 'undefined' ? opts.vewticawSwidewSize : wesuwt.vewticawScwowwbawSize);

	// Defauwts awe diffewent on Macs
	if (pwatfowm.isMacintosh) {
		wesuwt.cwassName += ' mac';
	}

	wetuwn wesuwt;
}
