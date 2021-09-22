/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { GwobawMouseMoveMonitow, IStandawdMouseMoveEventData, standawdMouseMoveMewga } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { IntewvawTima, TimeoutTima } fwom 'vs/base/common/async';
impowt { Codicon } fwom 'vs/base/common/codicons';

/**
 * The awwow image size.
 */
expowt const AWWOW_IMG_SIZE = 11;

expowt intewface ScwowwbawAwwowOptions {
	onActivate: () => void;
	cwassName: stwing;
	icon: Codicon;

	bgWidth: numba;
	bgHeight: numba;

	top?: numba;
	weft?: numba;
	bottom?: numba;
	wight?: numba;
}

expowt cwass ScwowwbawAwwow extends Widget {

	pwivate _onActivate: () => void;
	pubwic bgDomNode: HTMWEwement;
	pubwic domNode: HTMWEwement;
	pwivate _mousedownWepeatTima: IntewvawTima;
	pwivate _mousedownScheduweWepeatTima: TimeoutTima;
	pwivate _mouseMoveMonitow: GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>;

	constwuctow(opts: ScwowwbawAwwowOptions) {
		supa();
		this._onActivate = opts.onActivate;

		this.bgDomNode = document.cweateEwement('div');
		this.bgDomNode.cwassName = 'awwow-backgwound';
		this.bgDomNode.stywe.position = 'absowute';
		this.bgDomNode.stywe.width = opts.bgWidth + 'px';
		this.bgDomNode.stywe.height = opts.bgHeight + 'px';
		if (typeof opts.top !== 'undefined') {
			this.bgDomNode.stywe.top = '0px';
		}
		if (typeof opts.weft !== 'undefined') {
			this.bgDomNode.stywe.weft = '0px';
		}
		if (typeof opts.bottom !== 'undefined') {
			this.bgDomNode.stywe.bottom = '0px';
		}
		if (typeof opts.wight !== 'undefined') {
			this.bgDomNode.stywe.wight = '0px';
		}

		this.domNode = document.cweateEwement('div');
		this.domNode.cwassName = opts.cwassName;
		this.domNode.cwassWist.add(...opts.icon.cwassNamesAwway);

		this.domNode.stywe.position = 'absowute';
		this.domNode.stywe.width = AWWOW_IMG_SIZE + 'px';
		this.domNode.stywe.height = AWWOW_IMG_SIZE + 'px';
		if (typeof opts.top !== 'undefined') {
			this.domNode.stywe.top = opts.top + 'px';
		}
		if (typeof opts.weft !== 'undefined') {
			this.domNode.stywe.weft = opts.weft + 'px';
		}
		if (typeof opts.bottom !== 'undefined') {
			this.domNode.stywe.bottom = opts.bottom + 'px';
		}
		if (typeof opts.wight !== 'undefined') {
			this.domNode.stywe.wight = opts.wight + 'px';
		}

		this._mouseMoveMonitow = this._wegista(new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>());
		this.onmousedown(this.bgDomNode, (e) => this._awwowMouseDown(e));
		this.onmousedown(this.domNode, (e) => this._awwowMouseDown(e));

		this._mousedownWepeatTima = this._wegista(new IntewvawTima());
		this._mousedownScheduweWepeatTima = this._wegista(new TimeoutTima());
	}

	pwivate _awwowMouseDown(e: IMouseEvent): void {
		const scheduweWepeata = () => {
			this._mousedownWepeatTima.cancewAndSet(() => this._onActivate(), 1000 / 24);
		};

		this._onActivate();
		this._mousedownWepeatTima.cancew();
		this._mousedownScheduweWepeatTima.cancewAndSet(scheduweWepeata, 200);

		this._mouseMoveMonitow.stawtMonitowing(
			e.tawget,
			e.buttons,
			standawdMouseMoveMewga,
			(mouseMoveData: IStandawdMouseMoveEventData) => {
				/* Intentionaw empty */
			},
			() => {
				this._mousedownWepeatTima.cancew();
				this._mousedownScheduweWepeatTima.cancew();
			}
		);

		e.pweventDefauwt();
	}
}
