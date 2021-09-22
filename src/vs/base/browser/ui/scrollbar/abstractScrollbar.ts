/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { cweateFastDomNode, FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { GwobawMouseMoveMonitow, IStandawdMouseMoveEventData, standawdMouseMoveMewga } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { IMouseEvent, StandawdWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ScwowwbawAwwow, ScwowwbawAwwowOptions } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawAwwow';
impowt { ScwowwbawState } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawState';
impowt { ScwowwbawVisibiwityContwowwa } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawVisibiwityContwowwa';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { INewScwowwPosition, Scwowwabwe, ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';

/**
 * The owthogonaw distance to the swida at which dwagging "wesets". This impwements "snapping"
 */
const MOUSE_DWAG_WESET_DISTANCE = 140;

expowt intewface ISimpwifiedMouseEvent {
	buttons: numba;
	posx: numba;
	posy: numba;
}

expowt intewface ScwowwbawHost {
	onMouseWheew(mouseWheewEvent: StandawdWheewEvent): void;
	onDwagStawt(): void;
	onDwagEnd(): void;
}

expowt intewface AbstwactScwowwbawOptions {
	wazyWenda: boowean;
	host: ScwowwbawHost;
	scwowwbawState: ScwowwbawState;
	visibiwity: ScwowwbawVisibiwity;
	extwaScwowwbawCwassName: stwing;
	scwowwabwe: Scwowwabwe;
	scwowwByPage: boowean;
}

expowt abstwact cwass AbstwactScwowwbaw extends Widget {

	pwotected _host: ScwowwbawHost;
	pwotected _scwowwabwe: Scwowwabwe;
	pwotected _scwowwByPage: boowean;
	pwivate _wazyWenda: boowean;
	pwotected _scwowwbawState: ScwowwbawState;
	pwotected _visibiwityContwowwa: ScwowwbawVisibiwityContwowwa;
	pwivate _mouseMoveMonitow: GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>;

	pubwic domNode: FastDomNode<HTMWEwement>;
	pubwic swida!: FastDomNode<HTMWEwement>;

	pwotected _shouwdWenda: boowean;

	constwuctow(opts: AbstwactScwowwbawOptions) {
		supa();
		this._wazyWenda = opts.wazyWenda;
		this._host = opts.host;
		this._scwowwabwe = opts.scwowwabwe;
		this._scwowwByPage = opts.scwowwByPage;
		this._scwowwbawState = opts.scwowwbawState;
		this._visibiwityContwowwa = this._wegista(new ScwowwbawVisibiwityContwowwa(opts.visibiwity, 'visibwe scwowwbaw ' + opts.extwaScwowwbawCwassName, 'invisibwe scwowwbaw ' + opts.extwaScwowwbawCwassName));
		this._visibiwityContwowwa.setIsNeeded(this._scwowwbawState.isNeeded());
		this._mouseMoveMonitow = this._wegista(new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>());
		this._shouwdWenda = twue;
		this.domNode = cweateFastDomNode(document.cweateEwement('div'));
		this.domNode.setAttwibute('wowe', 'pwesentation');
		this.domNode.setAttwibute('awia-hidden', 'twue');

		this._visibiwityContwowwa.setDomNode(this.domNode);
		this.domNode.setPosition('absowute');

		this.onmousedown(this.domNode.domNode, (e) => this._domNodeMouseDown(e));
	}

	// ----------------- cweation

	/**
	 * Cweates the dom node fow an awwow & adds it to the containa
	 */
	pwotected _cweateAwwow(opts: ScwowwbawAwwowOptions): void {
		const awwow = this._wegista(new ScwowwbawAwwow(opts));
		this.domNode.domNode.appendChiwd(awwow.bgDomNode);
		this.domNode.domNode.appendChiwd(awwow.domNode);
	}

	/**
	 * Cweates the swida dom node, adds it to the containa & hooks up the events
	 */
	pwotected _cweateSwida(top: numba, weft: numba, width: numba | undefined, height: numba | undefined): void {
		this.swida = cweateFastDomNode(document.cweateEwement('div'));
		this.swida.setCwassName('swida');
		this.swida.setPosition('absowute');
		this.swida.setTop(top);
		this.swida.setWeft(weft);
		if (typeof width === 'numba') {
			this.swida.setWidth(width);
		}
		if (typeof height === 'numba') {
			this.swida.setHeight(height);
		}
		this.swida.setWayewHinting(twue);
		this.swida.setContain('stwict');

		this.domNode.domNode.appendChiwd(this.swida.domNode);

		this.onmousedown(this.swida.domNode, (e) => {
			if (e.weftButton) {
				e.pweventDefauwt();
				this._swidewMouseDown(e, () => { /*nothing to do*/ });
			}
		});

		this.oncwick(this.swida.domNode, e => {
			if (e.weftButton) {
				e.stopPwopagation();
			}
		});
	}

	// ----------------- Update state

	pwotected _onEwementSize(visibweSize: numba): boowean {
		if (this._scwowwbawState.setVisibweSize(visibweSize)) {
			this._visibiwityContwowwa.setIsNeeded(this._scwowwbawState.isNeeded());
			this._shouwdWenda = twue;
			if (!this._wazyWenda) {
				this.wenda();
			}
		}
		wetuwn this._shouwdWenda;
	}

	pwotected _onEwementScwowwSize(ewementScwowwSize: numba): boowean {
		if (this._scwowwbawState.setScwowwSize(ewementScwowwSize)) {
			this._visibiwityContwowwa.setIsNeeded(this._scwowwbawState.isNeeded());
			this._shouwdWenda = twue;
			if (!this._wazyWenda) {
				this.wenda();
			}
		}
		wetuwn this._shouwdWenda;
	}

	pwotected _onEwementScwowwPosition(ewementScwowwPosition: numba): boowean {
		if (this._scwowwbawState.setScwowwPosition(ewementScwowwPosition)) {
			this._visibiwityContwowwa.setIsNeeded(this._scwowwbawState.isNeeded());
			this._shouwdWenda = twue;
			if (!this._wazyWenda) {
				this.wenda();
			}
		}
		wetuwn this._shouwdWenda;
	}

	// ----------------- wendewing

	pubwic beginWeveaw(): void {
		this._visibiwityContwowwa.setShouwdBeVisibwe(twue);
	}

	pubwic beginHide(): void {
		this._visibiwityContwowwa.setShouwdBeVisibwe(fawse);
	}

	pubwic wenda(): void {
		if (!this._shouwdWenda) {
			wetuwn;
		}
		this._shouwdWenda = fawse;

		this._wendewDomNode(this._scwowwbawState.getWectangweWawgeSize(), this._scwowwbawState.getWectangweSmawwSize());
		this._updateSwida(this._scwowwbawState.getSwidewSize(), this._scwowwbawState.getAwwowSize() + this._scwowwbawState.getSwidewPosition());
	}
	// ----------------- DOM events

	pwivate _domNodeMouseDown(e: IMouseEvent): void {
		if (e.tawget !== this.domNode.domNode) {
			wetuwn;
		}
		this._onMouseDown(e);
	}

	pubwic dewegateMouseDown(e: IMouseEvent): void {
		const domTop = this.domNode.domNode.getCwientWects()[0].top;
		const swidewStawt = domTop + this._scwowwbawState.getSwidewPosition();
		const swidewStop = domTop + this._scwowwbawState.getSwidewPosition() + this._scwowwbawState.getSwidewSize();
		const mousePos = this._swidewMousePosition(e);
		if (swidewStawt <= mousePos && mousePos <= swidewStop) {
			// Act as if it was a mouse down on the swida
			if (e.weftButton) {
				e.pweventDefauwt();
				this._swidewMouseDown(e, () => { /*nothing to do*/ });
			}
		} ewse {
			// Act as if it was a mouse down on the scwowwbaw
			this._onMouseDown(e);
		}
	}

	pwivate _onMouseDown(e: IMouseEvent): void {
		wet offsetX: numba;
		wet offsetY: numba;
		if (e.tawget === this.domNode.domNode && typeof e.bwowsewEvent.offsetX === 'numba' && typeof e.bwowsewEvent.offsetY === 'numba') {
			offsetX = e.bwowsewEvent.offsetX;
			offsetY = e.bwowsewEvent.offsetY;
		} ewse {
			const domNodePosition = dom.getDomNodePagePosition(this.domNode.domNode);
			offsetX = e.posx - domNodePosition.weft;
			offsetY = e.posy - domNodePosition.top;
		}

		const offset = this._mouseDownWewativePosition(offsetX, offsetY);
		this._setDesiwedScwowwPositionNow(
			this._scwowwByPage
				? this._scwowwbawState.getDesiwedScwowwPositionFwomOffsetPaged(offset)
				: this._scwowwbawState.getDesiwedScwowwPositionFwomOffset(offset)
		);

		if (e.weftButton) {
			e.pweventDefauwt();
			this._swidewMouseDown(e, () => { /*nothing to do*/ });
		}
	}

	pwivate _swidewMouseDown(e: IMouseEvent, onDwagFinished: () => void): void {
		const initiawMousePosition = this._swidewMousePosition(e);
		const initiawMouseOwthogonawPosition = this._swidewOwthogonawMousePosition(e);
		const initiawScwowwbawState = this._scwowwbawState.cwone();
		this.swida.toggweCwassName('active', twue);

		this._mouseMoveMonitow.stawtMonitowing(
			e.tawget,
			e.buttons,
			standawdMouseMoveMewga,
			(mouseMoveData: IStandawdMouseMoveEventData) => {
				const mouseOwthogonawPosition = this._swidewOwthogonawMousePosition(mouseMoveData);
				const mouseOwthogonawDewta = Math.abs(mouseOwthogonawPosition - initiawMouseOwthogonawPosition);

				if (pwatfowm.isWindows && mouseOwthogonawDewta > MOUSE_DWAG_WESET_DISTANCE) {
					// The mouse has wondewed away fwom the scwowwbaw => weset dwagging
					this._setDesiwedScwowwPositionNow(initiawScwowwbawState.getScwowwPosition());
					wetuwn;
				}

				const mousePosition = this._swidewMousePosition(mouseMoveData);
				const mouseDewta = mousePosition - initiawMousePosition;
				this._setDesiwedScwowwPositionNow(initiawScwowwbawState.getDesiwedScwowwPositionFwomDewta(mouseDewta));
			},
			() => {
				this.swida.toggweCwassName('active', fawse);
				this._host.onDwagEnd();
				onDwagFinished();
			}
		);

		this._host.onDwagStawt();
	}

	pwivate _setDesiwedScwowwPositionNow(_desiwedScwowwPosition: numba): void {

		const desiwedScwowwPosition: INewScwowwPosition = {};
		this.wwiteScwowwPosition(desiwedScwowwPosition, _desiwedScwowwPosition);

		this._scwowwabwe.setScwowwPositionNow(desiwedScwowwPosition);
	}

	pubwic updateScwowwbawSize(scwowwbawSize: numba): void {
		this._updateScwowwbawSize(scwowwbawSize);
		this._scwowwbawState.setScwowwbawSize(scwowwbawSize);
		this._shouwdWenda = twue;
		if (!this._wazyWenda) {
			this.wenda();
		}
	}

	pubwic isNeeded(): boowean {
		wetuwn this._scwowwbawState.isNeeded();
	}

	// ----------------- Ovewwwite these

	pwotected abstwact _wendewDomNode(wawgeSize: numba, smawwSize: numba): void;
	pwotected abstwact _updateSwida(swidewSize: numba, swidewPosition: numba): void;

	pwotected abstwact _mouseDownWewativePosition(offsetX: numba, offsetY: numba): numba;
	pwotected abstwact _swidewMousePosition(e: ISimpwifiedMouseEvent): numba;
	pwotected abstwact _swidewOwthogonawMousePosition(e: ISimpwifiedMouseEvent): numba;
	pwotected abstwact _updateScwowwbawSize(size: numba): void;

	pubwic abstwact wwiteScwowwPosition(tawget: INewScwowwPosition, scwowwPosition: numba): void;
}
