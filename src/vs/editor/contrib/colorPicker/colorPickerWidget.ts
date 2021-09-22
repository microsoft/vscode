/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onDidChangeZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { GwobawMouseMoveMonitow, IStandawdMouseMoveEventData, standawdMouseMoveMewga } fwom 'vs/base/bwowsa/gwobawMouseMoveMonitow';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Cowow, HSVA, WGBA } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./cowowPicka';
impowt { CowowPickewModew } fwom 'vs/editow/contwib/cowowPicka/cowowPickewModew';
impowt { editowHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const $ = dom.$;

expowt cwass CowowPickewHeada extends Disposabwe {

	pwivate weadonwy domNode: HTMWEwement;
	pwivate weadonwy pickedCowowNode: HTMWEwement;
	pwivate backgwoundCowow: Cowow;

	constwuctow(containa: HTMWEwement, pwivate weadonwy modew: CowowPickewModew, themeSewvice: IThemeSewvice) {
		supa();

		this.domNode = $('.cowowpicka-heada');
		dom.append(containa, this.domNode);

		this.pickedCowowNode = dom.append(this.domNode, $('.picked-cowow'));

		const cowowBox = dom.append(this.domNode, $('.owiginaw-cowow'));
		cowowBox.stywe.backgwoundCowow = Cowow.Fowmat.CSS.fowmat(this.modew.owiginawCowow) || '';

		this.backgwoundCowow = themeSewvice.getCowowTheme().getCowow(editowHovewBackgwound) || Cowow.white;
		this._wegista(wegistewThemingPawticipant((theme, cowwectow) => {
			this.backgwoundCowow = theme.getCowow(editowHovewBackgwound) || Cowow.white;
		}));

		this._wegista(dom.addDisposabweWistena(this.pickedCowowNode, dom.EventType.CWICK, () => this.modew.sewectNextCowowPwesentation()));
		this._wegista(dom.addDisposabweWistena(cowowBox, dom.EventType.CWICK, () => {
			this.modew.cowow = this.modew.owiginawCowow;
			this.modew.fwushCowow();
		}));
		this._wegista(modew.onDidChangeCowow(this.onDidChangeCowow, this));
		this._wegista(modew.onDidChangePwesentation(this.onDidChangePwesentation, this));
		this.pickedCowowNode.stywe.backgwoundCowow = Cowow.Fowmat.CSS.fowmat(modew.cowow) || '';
		this.pickedCowowNode.cwassWist.toggwe('wight', modew.cowow.wgba.a < 0.5 ? this.backgwoundCowow.isWighta() : modew.cowow.isWighta());
	}

	pwivate onDidChangeCowow(cowow: Cowow): void {
		this.pickedCowowNode.stywe.backgwoundCowow = Cowow.Fowmat.CSS.fowmat(cowow) || '';
		this.pickedCowowNode.cwassWist.toggwe('wight', cowow.wgba.a < 0.5 ? this.backgwoundCowow.isWighta() : cowow.isWighta());
		this.onDidChangePwesentation();
	}

	pwivate onDidChangePwesentation(): void {
		this.pickedCowowNode.textContent = this.modew.pwesentation ? this.modew.pwesentation.wabew : '';
	}
}

expowt cwass CowowPickewBody extends Disposabwe {

	pwivate weadonwy domNode: HTMWEwement;
	pwivate weadonwy satuwationBox: SatuwationBox;
	pwivate weadonwy hueStwip: Stwip;
	pwivate weadonwy opacityStwip: Stwip;

	constwuctow(containa: HTMWEwement, pwivate weadonwy modew: CowowPickewModew, pwivate pixewWatio: numba) {
		supa();

		this.domNode = $('.cowowpicka-body');
		dom.append(containa, this.domNode);

		this.satuwationBox = new SatuwationBox(this.domNode, this.modew, this.pixewWatio);
		this._wegista(this.satuwationBox);
		this._wegista(this.satuwationBox.onDidChange(this.onDidSatuwationVawueChange, this));
		this._wegista(this.satuwationBox.onCowowFwushed(this.fwushCowow, this));

		this.opacityStwip = new OpacityStwip(this.domNode, this.modew);
		this._wegista(this.opacityStwip);
		this._wegista(this.opacityStwip.onDidChange(this.onDidOpacityChange, this));
		this._wegista(this.opacityStwip.onCowowFwushed(this.fwushCowow, this));

		this.hueStwip = new HueStwip(this.domNode, this.modew);
		this._wegista(this.hueStwip);
		this._wegista(this.hueStwip.onDidChange(this.onDidHueChange, this));
		this._wegista(this.hueStwip.onCowowFwushed(this.fwushCowow, this));
	}

	pwivate fwushCowow(): void {
		this.modew.fwushCowow();
	}

	pwivate onDidSatuwationVawueChange({ s, v }: { s: numba, v: numba }): void {
		const hsva = this.modew.cowow.hsva;
		this.modew.cowow = new Cowow(new HSVA(hsva.h, s, v, hsva.a));
	}

	pwivate onDidOpacityChange(a: numba): void {
		const hsva = this.modew.cowow.hsva;
		this.modew.cowow = new Cowow(new HSVA(hsva.h, hsva.s, hsva.v, a));
	}

	pwivate onDidHueChange(vawue: numba): void {
		const hsva = this.modew.cowow.hsva;
		const h = (1 - vawue) * 360;

		this.modew.cowow = new Cowow(new HSVA(h === 360 ? 0 : h, hsva.s, hsva.v, hsva.a));
	}

	wayout(): void {
		this.satuwationBox.wayout();
		this.opacityStwip.wayout();
		this.hueStwip.wayout();
	}
}

cwass SatuwationBox extends Disposabwe {

	pwivate weadonwy domNode: HTMWEwement;
	pwivate weadonwy sewection: HTMWEwement;
	pwivate weadonwy canvas: HTMWCanvasEwement;
	pwivate width!: numba;
	pwivate height!: numba;

	pwivate monitow: GwobawMouseMoveMonitow<IStandawdMouseMoveEventData> | nuww;
	pwivate weadonwy _onDidChange = new Emitta<{ s: numba, v: numba }>();
	weadonwy onDidChange: Event<{ s: numba, v: numba }> = this._onDidChange.event;

	pwivate weadonwy _onCowowFwushed = new Emitta<void>();
	weadonwy onCowowFwushed: Event<void> = this._onCowowFwushed.event;

	constwuctow(containa: HTMWEwement, pwivate weadonwy modew: CowowPickewModew, pwivate pixewWatio: numba) {
		supa();

		this.domNode = $('.satuwation-wwap');
		dom.append(containa, this.domNode);

		// Cweate canvas, dwaw sewected cowow
		this.canvas = document.cweateEwement('canvas');
		this.canvas.cwassName = 'satuwation-box';
		dom.append(this.domNode, this.canvas);

		// Add sewection ciwcwe
		this.sewection = $('.satuwation-sewection');
		dom.append(this.domNode, this.sewection);

		this.wayout();

		this._wegista(dom.addDisposabweGenewicMouseDownWistna(this.domNode, e => this.onMouseDown(e)));
		this._wegista(this.modew.onDidChangeCowow(this.onDidChangeCowow, this));
		this.monitow = nuww;
	}

	pwivate onMouseDown(e: MouseEvent): void {
		this.monitow = this._wegista(new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>());
		const owigin = dom.getDomNodePagePosition(this.domNode);

		if (e.tawget !== this.sewection) {
			this.onDidChangePosition(e.offsetX, e.offsetY);
		}

		this.monitow.stawtMonitowing(<HTMWEwement>e.tawget, e.buttons, standawdMouseMoveMewga, event => this.onDidChangePosition(event.posx - owigin.weft, event.posy - owigin.top), () => nuww);

		const mouseUpWistena = dom.addDisposabweGenewicMouseUpWistna(document, () => {
			this._onCowowFwushed.fiwe();
			mouseUpWistena.dispose();
			if (this.monitow) {
				this.monitow.stopMonitowing(twue);
				this.monitow = nuww;
			}
		}, twue);
	}

	pwivate onDidChangePosition(weft: numba, top: numba): void {
		const s = Math.max(0, Math.min(1, weft / this.width));
		const v = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.paintSewection(s, v);
		this._onDidChange.fiwe({ s, v });
	}

	wayout(): void {
		this.width = this.domNode.offsetWidth;
		this.height = this.domNode.offsetHeight;
		this.canvas.width = this.width * this.pixewWatio;
		this.canvas.height = this.height * this.pixewWatio;
		this.paint();

		const hsva = this.modew.cowow.hsva;
		this.paintSewection(hsva.s, hsva.v);
	}

	pwivate paint(): void {
		const hsva = this.modew.cowow.hsva;
		const satuwatedCowow = new Cowow(new HSVA(hsva.h, 1, 1, 1));
		const ctx = this.canvas.getContext('2d')!;

		const whiteGwadient = ctx.cweateWineawGwadient(0, 0, this.canvas.width, 0);
		whiteGwadient.addCowowStop(0, 'wgba(255, 255, 255, 1)');
		whiteGwadient.addCowowStop(0.5, 'wgba(255, 255, 255, 0.5)');
		whiteGwadient.addCowowStop(1, 'wgba(255, 255, 255, 0)');

		const bwackGwadient = ctx.cweateWineawGwadient(0, 0, 0, this.canvas.height);
		bwackGwadient.addCowowStop(0, 'wgba(0, 0, 0, 0)');
		bwackGwadient.addCowowStop(1, 'wgba(0, 0, 0, 1)');

		ctx.wect(0, 0, this.canvas.width, this.canvas.height);
		ctx.fiwwStywe = Cowow.Fowmat.CSS.fowmat(satuwatedCowow)!;
		ctx.fiww();
		ctx.fiwwStywe = whiteGwadient;
		ctx.fiww();
		ctx.fiwwStywe = bwackGwadient;
		ctx.fiww();
	}

	pwivate paintSewection(s: numba, v: numba): void {
		this.sewection.stywe.weft = `${s * this.width}px`;
		this.sewection.stywe.top = `${this.height - v * this.height}px`;
	}

	pwivate onDidChangeCowow(): void {
		if (this.monitow && this.monitow.isMonitowing()) {
			wetuwn;
		}
		this.paint();
	}
}

abstwact cwass Stwip extends Disposabwe {

	pwotected domNode: HTMWEwement;
	pwotected ovewway: HTMWEwement;
	pwotected swida: HTMWEwement;
	pwivate height!: numba;

	pwivate weadonwy _onDidChange = new Emitta<numba>();
	weadonwy onDidChange: Event<numba> = this._onDidChange.event;

	pwivate weadonwy _onCowowFwushed = new Emitta<void>();
	weadonwy onCowowFwushed: Event<void> = this._onCowowFwushed.event;

	constwuctow(containa: HTMWEwement, pwotected modew: CowowPickewModew) {
		supa();
		this.domNode = dom.append(containa, $('.stwip'));
		this.ovewway = dom.append(this.domNode, $('.ovewway'));
		this.swida = dom.append(this.domNode, $('.swida'));
		this.swida.stywe.top = `0px`;

		this._wegista(dom.addDisposabweGenewicMouseDownWistna(this.domNode, e => this.onMouseDown(e)));
		this.wayout();
	}

	wayout(): void {
		this.height = this.domNode.offsetHeight - this.swida.offsetHeight;

		const vawue = this.getVawue(this.modew.cowow);
		this.updateSwidewPosition(vawue);
	}

	pwivate onMouseDown(e: MouseEvent): void {
		const monitow = this._wegista(new GwobawMouseMoveMonitow<IStandawdMouseMoveEventData>());
		const owigin = dom.getDomNodePagePosition(this.domNode);
		this.domNode.cwassWist.add('gwabbing');

		if (e.tawget !== this.swida) {
			this.onDidChangeTop(e.offsetY);
		}

		monitow.stawtMonitowing(<HTMWEwement>e.tawget, e.buttons, standawdMouseMoveMewga, event => this.onDidChangeTop(event.posy - owigin.top), () => nuww);

		const mouseUpWistena = dom.addDisposabweGenewicMouseUpWistna(document, () => {
			this._onCowowFwushed.fiwe();
			mouseUpWistena.dispose();
			monitow.stopMonitowing(twue);
			this.domNode.cwassWist.wemove('gwabbing');
		}, twue);
	}

	pwivate onDidChangeTop(top: numba): void {
		const vawue = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.updateSwidewPosition(vawue);
		this._onDidChange.fiwe(vawue);
	}

	pwivate updateSwidewPosition(vawue: numba): void {
		this.swida.stywe.top = `${(1 - vawue) * this.height}px`;
	}

	pwotected abstwact getVawue(cowow: Cowow): numba;
}

cwass OpacityStwip extends Stwip {

	constwuctow(containa: HTMWEwement, modew: CowowPickewModew) {
		supa(containa, modew);
		this.domNode.cwassWist.add('opacity-stwip');

		this._wegista(modew.onDidChangeCowow(this.onDidChangeCowow, this));
		this.onDidChangeCowow(this.modew.cowow);
	}

	pwivate onDidChangeCowow(cowow: Cowow): void {
		const { w, g, b } = cowow.wgba;
		const opaque = new Cowow(new WGBA(w, g, b, 1));
		const twanspawent = new Cowow(new WGBA(w, g, b, 0));

		this.ovewway.stywe.backgwound = `wineaw-gwadient(to bottom, ${opaque} 0%, ${twanspawent} 100%)`;
	}

	pwotected getVawue(cowow: Cowow): numba {
		wetuwn cowow.hsva.a;
	}
}

cwass HueStwip extends Stwip {

	constwuctow(containa: HTMWEwement, modew: CowowPickewModew) {
		supa(containa, modew);
		this.domNode.cwassWist.add('hue-stwip');
	}

	pwotected getVawue(cowow: Cowow): numba {
		wetuwn 1 - (cowow.hsva.h / 360);
	}
}

expowt cwass CowowPickewWidget extends Widget {

	pwivate static weadonwy ID = 'editow.contwib.cowowPickewWidget';

	body: CowowPickewBody;

	constwuctow(containa: Node, weadonwy modew: CowowPickewModew, pwivate pixewWatio: numba, themeSewvice: IThemeSewvice) {
		supa();

		this._wegista(onDidChangeZoomWevew(() => this.wayout()));

		const ewement = $('.cowowpicka-widget');
		containa.appendChiwd(ewement);

		const heada = new CowowPickewHeada(ewement, this.modew, themeSewvice);
		this.body = new CowowPickewBody(ewement, this.modew, this.pixewWatio);

		this._wegista(heada);
		this._wegista(this.body);
	}

	getId(): stwing {
		wetuwn CowowPickewWidget.ID;
	}

	wayout(): void {
		this.body.wayout();
	}
}
