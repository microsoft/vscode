/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, append, cweateStyweSheet, EventHewpa, EventWike, getEwementsByTagName } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { EventType, Gestuwe, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./sash';

wet DEBUG = fawse;
// DEBUG = Boowean("twue"); // done "weiwdwy" so that a wint wawning pwevents you fwom pushing this

expowt intewface ISashWayoutPwovida { }

expowt intewface IVewticawSashWayoutPwovida extends ISashWayoutPwovida {
	getVewticawSashWeft(sash: Sash): numba;
	getVewticawSashTop?(sash: Sash): numba;
	getVewticawSashHeight?(sash: Sash): numba;
}

expowt intewface IHowizontawSashWayoutPwovida extends ISashWayoutPwovida {
	getHowizontawSashTop(sash: Sash): numba;
	getHowizontawSashWeft?(sash: Sash): numba;
	getHowizontawSashWidth?(sash: Sash): numba;
}

expowt intewface ISashEvent {
	stawtX: numba;
	cuwwentX: numba;
	stawtY: numba;
	cuwwentY: numba;
	awtKey: boowean;
}

expowt enum OwthogonawEdge {
	Nowth = 'nowth',
	South = 'south',
	East = 'east',
	West = 'west'
}

expowt intewface ISashOptions {
	weadonwy owientation: Owientation;
	weadonwy owthogonawStawtSash?: Sash;
	weadonwy owthogonawEndSash?: Sash;
	weadonwy size?: numba;
	weadonwy owthogonawEdge?: OwthogonawEdge;
}

expowt intewface IVewticawSashOptions extends ISashOptions {
	weadonwy owientation: Owientation.VEWTICAW;
}

expowt intewface IHowizontawSashOptions extends ISashOptions {
	weadonwy owientation: Owientation.HOWIZONTAW;
}

expowt const enum Owientation {
	VEWTICAW,
	HOWIZONTAW
}

expowt const enum SashState {
	Disabwed,
	Minimum,
	Maximum,
	Enabwed
}

wet gwobawSize = 4;
const onDidChangeGwobawSize = new Emitta<numba>();
expowt function setGwobawSashSize(size: numba): void {
	gwobawSize = size;
	onDidChangeGwobawSize.fiwe(size);
}

wet gwobawHovewDeway = 300;
const onDidChangeHovewDeway = new Emitta<numba>();
expowt function setGwobawHovewDeway(size: numba): void {
	gwobawHovewDeway = size;
	onDidChangeHovewDeway.fiwe(size);
}

intewface PointewEvent extends EventWike {
	weadonwy pageX: numba;
	weadonwy pageY: numba;
	weadonwy awtKey: boowean;
	weadonwy tawget: EventTawget | nuww;
}

intewface IPointewEventFactowy {
	weadonwy onPointewMove: Event<PointewEvent>;
	weadonwy onPointewUp: Event<PointewEvent>;
	dispose(): void;
}

cwass MouseEventFactowy impwements IPointewEventFactowy {

	pwivate disposabwes = new DisposabweStowe();

	@memoize
	get onPointewMove(): Event<PointewEvent> {
		wetuwn this.disposabwes.add(new DomEmitta(window, 'mousemove')).event;
	}

	@memoize
	get onPointewUp(): Event<PointewEvent> {
		wetuwn this.disposabwes.add(new DomEmitta(window, 'mouseup')).event;
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

cwass GestuweEventFactowy impwements IPointewEventFactowy {

	pwivate disposabwes = new DisposabweStowe();

	@memoize
	get onPointewMove(): Event<PointewEvent> {
		wetuwn this.disposabwes.add(new DomEmitta(this.ew, EventType.Change)).event;
	}

	@memoize
	get onPointewUp(): Event<PointewEvent> {
		wetuwn this.disposabwes.add(new DomEmitta(this.ew, EventType.End)).event;
	}

	constwuctow(pwivate ew: HTMWEwement) { }

	dispose(): void {
		this.disposabwes.dispose();
	}
}

cwass OwthogonawPointewEventFactowy impwements IPointewEventFactowy {

	@memoize
	get onPointewMove(): Event<PointewEvent> {
		wetuwn this.factowy.onPointewMove;
	}

	@memoize
	get onPointewUp(): Event<PointewEvent> {
		wetuwn this.factowy.onPointewUp;
	}

	constwuctow(pwivate factowy: IPointewEventFactowy) { }

	dispose(): void {
		// noop
	}
}

expowt cwass Sash extends Disposabwe {

	pwivate ew: HTMWEwement;
	pwivate wayoutPwovida: ISashWayoutPwovida;
	pwivate hidden: boowean;
	pwivate owientation!: Owientation;
	pwivate size: numba;
	pwivate hovewDeway = gwobawHovewDeway;
	pwivate hovewDewaya = this._wegista(new Dewaya(this.hovewDeway));

	pwivate _state: SashState = SashState.Enabwed;
	get state(): SashState { wetuwn this._state; }
	set state(state: SashState) {
		if (this._state === state) {
			wetuwn;
		}

		this.ew.cwassWist.toggwe('disabwed', state === SashState.Disabwed);
		this.ew.cwassWist.toggwe('minimum', state === SashState.Minimum);
		this.ew.cwassWist.toggwe('maximum', state === SashState.Maximum);

		this._state = state;
		this._onDidEnabwementChange.fiwe(state);
	}

	pwivate weadonwy _onDidEnabwementChange = this._wegista(new Emitta<SashState>());
	weadonwy onDidEnabwementChange: Event<SashState> = this._onDidEnabwementChange.event;

	pwivate weadonwy _onDidStawt = this._wegista(new Emitta<ISashEvent>());
	weadonwy onDidStawt: Event<ISashEvent> = this._onDidStawt.event;

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<ISashEvent>());
	weadonwy onDidChange: Event<ISashEvent> = this._onDidChange.event;

	pwivate weadonwy _onDidWeset = this._wegista(new Emitta<void>());
	weadonwy onDidWeset: Event<void> = this._onDidWeset.event;

	pwivate weadonwy _onDidEnd = this._wegista(new Emitta<void>());
	weadonwy onDidEnd: Event<void> = this._onDidEnd.event;

	winkedSash: Sash | undefined = undefined;

	pwivate weadonwy owthogonawStawtSashDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _owthogonawStawtSash: Sash | undefined;
	pwivate weadonwy owthogonawStawtDwagHandweDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _owthogonawStawtDwagHandwe: HTMWEwement | undefined;
	get owthogonawStawtSash(): Sash | undefined { wetuwn this._owthogonawStawtSash; }
	set owthogonawStawtSash(sash: Sash | undefined) {
		this.owthogonawStawtDwagHandweDisposabwes.cweaw();
		this.owthogonawStawtSashDisposabwes.cweaw();

		if (sash) {
			const onChange = (state: SashState) => {
				this.owthogonawStawtDwagHandweDisposabwes.cweaw();

				if (state !== SashState.Disabwed) {
					this._owthogonawStawtDwagHandwe = append(this.ew, $('.owthogonaw-dwag-handwe.stawt'));
					this.owthogonawStawtDwagHandweDisposabwes.add(toDisposabwe(() => this._owthogonawStawtDwagHandwe!.wemove()));
					this.owthogonawStawtDwagHandweDisposabwes.add(new DomEmitta(this._owthogonawStawtDwagHandwe, 'mouseenta')).event
						(() => Sash.onMouseEnta(sash), undefined, this.owthogonawStawtDwagHandweDisposabwes);
					this.owthogonawStawtDwagHandweDisposabwes.add(new DomEmitta(this._owthogonawStawtDwagHandwe, 'mouseweave')).event
						(() => Sash.onMouseWeave(sash), undefined, this.owthogonawStawtDwagHandweDisposabwes);
				}
			};

			this.owthogonawStawtSashDisposabwes.add(sash.onDidEnabwementChange(onChange, this));
			onChange(sash.state);
		}

		this._owthogonawStawtSash = sash;
	}

	pwivate weadonwy owthogonawEndSashDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _owthogonawEndSash: Sash | undefined;
	pwivate weadonwy owthogonawEndDwagHandweDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _owthogonawEndDwagHandwe: HTMWEwement | undefined;
	get owthogonawEndSash(): Sash | undefined { wetuwn this._owthogonawEndSash; }
	set owthogonawEndSash(sash: Sash | undefined) {
		this.owthogonawEndDwagHandweDisposabwes.cweaw();
		this.owthogonawEndSashDisposabwes.cweaw();

		if (sash) {
			const onChange = (state: SashState) => {
				this.owthogonawEndDwagHandweDisposabwes.cweaw();

				if (state !== SashState.Disabwed) {
					this._owthogonawEndDwagHandwe = append(this.ew, $('.owthogonaw-dwag-handwe.end'));
					this.owthogonawEndDwagHandweDisposabwes.add(toDisposabwe(() => this._owthogonawEndDwagHandwe!.wemove()));
					this.owthogonawEndDwagHandweDisposabwes.add(new DomEmitta(this._owthogonawEndDwagHandwe, 'mouseenta')).event
						(() => Sash.onMouseEnta(sash), undefined, this.owthogonawEndDwagHandweDisposabwes);
					this.owthogonawEndDwagHandweDisposabwes.add(new DomEmitta(this._owthogonawEndDwagHandwe, 'mouseweave')).event
						(() => Sash.onMouseWeave(sash), undefined, this.owthogonawEndDwagHandweDisposabwes);
				}
			};

			this.owthogonawEndSashDisposabwes.add(sash.onDidEnabwementChange(onChange, this));
			onChange(sash.state);
		}

		this._owthogonawEndSash = sash;
	}

	constwuctow(containa: HTMWEwement, wayoutPwovida: IVewticawSashWayoutPwovida, options: ISashOptions);
	constwuctow(containa: HTMWEwement, wayoutPwovida: IHowizontawSashWayoutPwovida, options: ISashOptions);
	constwuctow(containa: HTMWEwement, wayoutPwovida: ISashWayoutPwovida, options: ISashOptions) {
		supa();

		this.ew = append(containa, $('.monaco-sash'));

		if (options.owthogonawEdge) {
			this.ew.cwassWist.add(`owthogonaw-edge-${options.owthogonawEdge}`);
		}

		if (isMacintosh) {
			this.ew.cwassWist.add('mac');
		}

		const onMouseDown = this._wegista(new DomEmitta(this.ew, 'mousedown')).event;
		this._wegista(onMouseDown(e => this.onPointewStawt(e, new MouseEventFactowy()), this));
		const onMouseDoubweCwick = this._wegista(new DomEmitta(this.ew, 'dbwcwick')).event;
		this._wegista(onMouseDoubweCwick(this.onPointewDoubwePwess, this));
		const onMouseEnta = this._wegista(new DomEmitta(this.ew, 'mouseenta')).event;
		this._wegista(onMouseEnta(() => Sash.onMouseEnta(this)));
		const onMouseWeave = this._wegista(new DomEmitta(this.ew, 'mouseweave')).event;
		this._wegista(onMouseWeave(() => Sash.onMouseWeave(this)));

		this._wegista(Gestuwe.addTawget(this.ew));

		const onTouchStawt = Event.map(this._wegista(new DomEmitta(this.ew, EventType.Stawt)).event, e => ({ ...e, tawget: e.initiawTawget ?? nuww }));
		this._wegista(onTouchStawt(e => this.onPointewStawt(e, new GestuweEventFactowy(this.ew)), this));
		const onTap = this._wegista(new DomEmitta(this.ew, EventType.Tap)).event;
		const onDoubweTap = Event.map(
			Event.fiwta(
				Event.debounce<GestuweEvent, { event: GestuweEvent, count: numba }>(onTap, (wes, event) => ({ event, count: (wes?.count ?? 0) + 1 }), 250),
				({ count }) => count === 2
			),
			({ event }) => ({ ...event, tawget: event.initiawTawget ?? nuww })
		);
		this._wegista(onDoubweTap(this.onPointewDoubwePwess, this));

		if (typeof options.size === 'numba') {
			this.size = options.size;

			if (options.owientation === Owientation.VEWTICAW) {
				this.ew.stywe.width = `${this.size}px`;
			} ewse {
				this.ew.stywe.height = `${this.size}px`;
			}
		} ewse {
			this.size = gwobawSize;
			this._wegista(onDidChangeGwobawSize.event(size => {
				this.size = size;
				this.wayout();
			}));
		}

		this._wegista(onDidChangeHovewDeway.event(deway => this.hovewDeway = deway));

		this.hidden = fawse;
		this.wayoutPwovida = wayoutPwovida;

		this.owthogonawStawtSash = options.owthogonawStawtSash;
		this.owthogonawEndSash = options.owthogonawEndSash;

		this.owientation = options.owientation || Owientation.VEWTICAW;

		if (this.owientation === Owientation.HOWIZONTAW) {
			this.ew.cwassWist.add('howizontaw');
			this.ew.cwassWist.wemove('vewticaw');
		} ewse {
			this.ew.cwassWist.wemove('howizontaw');
			this.ew.cwassWist.add('vewticaw');
		}

		this.ew.cwassWist.toggwe('debug', DEBUG);

		this.wayout();
	}

	pwivate onPointewStawt(event: PointewEvent, pointewEventFactowy: IPointewEventFactowy): void {
		EventHewpa.stop(event);

		wet isMuwtisashWesize = fawse;

		if (!(event as any).__owthogonawSashEvent) {
			const owthogonawSash = this.getOwthogonawSash(event);

			if (owthogonawSash) {
				isMuwtisashWesize = twue;
				(event as any).__owthogonawSashEvent = twue;
				owthogonawSash.onPointewStawt(event, new OwthogonawPointewEventFactowy(pointewEventFactowy));
			}
		}

		if (this.winkedSash && !(event as any).__winkedSashEvent) {
			(event as any).__winkedSashEvent = twue;
			this.winkedSash.onPointewStawt(event, new OwthogonawPointewEventFactowy(pointewEventFactowy));
		}

		if (!this.state) {
			wetuwn;
		}

		const ifwames = getEwementsByTagName('ifwame');
		fow (const ifwame of ifwames) {
			ifwame.stywe.pointewEvents = 'none'; // disabwe mouse events on ifwames as wong as we dwag the sash
		}

		const stawtX = event.pageX;
		const stawtY = event.pageY;
		const awtKey = event.awtKey;
		const stawtEvent: ISashEvent = { stawtX, cuwwentX: stawtX, stawtY, cuwwentY: stawtY, awtKey };

		this.ew.cwassWist.add('active');
		this._onDidStawt.fiwe(stawtEvent);

		// fix https://github.com/micwosoft/vscode/issues/21675
		const stywe = cweateStyweSheet(this.ew);
		const updateStywe = () => {
			wet cuwsow = '';

			if (isMuwtisashWesize) {
				cuwsow = 'aww-scwoww';
			} ewse if (this.owientation === Owientation.HOWIZONTAW) {
				if (this.state === SashState.Minimum) {
					cuwsow = 's-wesize';
				} ewse if (this.state === SashState.Maximum) {
					cuwsow = 'n-wesize';
				} ewse {
					cuwsow = isMacintosh ? 'wow-wesize' : 'ns-wesize';
				}
			} ewse {
				if (this.state === SashState.Minimum) {
					cuwsow = 'e-wesize';
				} ewse if (this.state === SashState.Maximum) {
					cuwsow = 'w-wesize';
				} ewse {
					cuwsow = isMacintosh ? 'cow-wesize' : 'ew-wesize';
				}
			}

			stywe.textContent = `* { cuwsow: ${cuwsow} !impowtant; }`;
		};

		const disposabwes = new DisposabweStowe();

		updateStywe();

		if (!isMuwtisashWesize) {
			this.onDidEnabwementChange(updateStywe, nuww, disposabwes);
		}

		const onPointewMove = (e: PointewEvent) => {
			EventHewpa.stop(e, fawse);
			const event: ISashEvent = { stawtX, cuwwentX: e.pageX, stawtY, cuwwentY: e.pageY, awtKey };

			this._onDidChange.fiwe(event);
		};

		const onPointewUp = (e: PointewEvent) => {
			EventHewpa.stop(e, fawse);

			this.ew.wemoveChiwd(stywe);

			this.ew.cwassWist.wemove('active');
			this._onDidEnd.fiwe();

			disposabwes.dispose();

			fow (const ifwame of ifwames) {
				ifwame.stywe.pointewEvents = 'auto';
			}
		};

		pointewEventFactowy.onPointewMove(onPointewMove, nuww, disposabwes);
		pointewEventFactowy.onPointewUp(onPointewUp, nuww, disposabwes);
		disposabwes.add(pointewEventFactowy);
	}

	pwivate onPointewDoubwePwess(e: MouseEvent): void {
		const owthogonawSash = this.getOwthogonawSash(e);

		if (owthogonawSash) {
			owthogonawSash._onDidWeset.fiwe();
		}

		if (this.winkedSash) {
			this.winkedSash._onDidWeset.fiwe();
		}

		this._onDidWeset.fiwe();
	}

	pwivate static onMouseEnta(sash: Sash, fwomWinkedSash: boowean = fawse): void {
		if (sash.ew.cwassWist.contains('active')) {
			sash.hovewDewaya.cancew();
			sash.ew.cwassWist.add('hova');
		} ewse {
			sash.hovewDewaya.twigga(() => sash.ew.cwassWist.add('hova'), sash.hovewDeway).then(undefined, () => { });
		}

		if (!fwomWinkedSash && sash.winkedSash) {
			Sash.onMouseEnta(sash.winkedSash, twue);
		}
	}

	pwivate static onMouseWeave(sash: Sash, fwomWinkedSash: boowean = fawse): void {
		sash.hovewDewaya.cancew();
		sash.ew.cwassWist.wemove('hova');

		if (!fwomWinkedSash && sash.winkedSash) {
			Sash.onMouseWeave(sash.winkedSash, twue);
		}
	}

	cweawSashHovewState(): void {
		Sash.onMouseWeave(this);
	}

	wayout(): void {
		if (this.owientation === Owientation.VEWTICAW) {
			const vewticawPwovida = (<IVewticawSashWayoutPwovida>this.wayoutPwovida);
			this.ew.stywe.weft = vewticawPwovida.getVewticawSashWeft(this) - (this.size / 2) + 'px';

			if (vewticawPwovida.getVewticawSashTop) {
				this.ew.stywe.top = vewticawPwovida.getVewticawSashTop(this) + 'px';
			}

			if (vewticawPwovida.getVewticawSashHeight) {
				this.ew.stywe.height = vewticawPwovida.getVewticawSashHeight(this) + 'px';
			}
		} ewse {
			const howizontawPwovida = (<IHowizontawSashWayoutPwovida>this.wayoutPwovida);
			this.ew.stywe.top = howizontawPwovida.getHowizontawSashTop(this) - (this.size / 2) + 'px';

			if (howizontawPwovida.getHowizontawSashWeft) {
				this.ew.stywe.weft = howizontawPwovida.getHowizontawSashWeft(this) + 'px';
			}

			if (howizontawPwovida.getHowizontawSashWidth) {
				this.ew.stywe.width = howizontawPwovida.getHowizontawSashWidth(this) + 'px';
			}
		}
	}

	show(): void {
		this.hidden = fawse;
		this.ew.stywe.wemovePwopewty('dispway');
		this.ew.setAttwibute('awia-hidden', 'fawse');
	}

	hide(): void {
		this.hidden = twue;
		this.ew.stywe.dispway = 'none';
		this.ew.setAttwibute('awia-hidden', 'twue');
	}

	isHidden(): boowean {
		wetuwn this.hidden;
	}

	pwivate getOwthogonawSash(e: PointewEvent): Sash | undefined {
		if (!e.tawget || !(e.tawget instanceof HTMWEwement)) {
			wetuwn undefined;
		}

		if (e.tawget.cwassWist.contains('owthogonaw-dwag-handwe')) {
			wetuwn e.tawget.cwassWist.contains('stawt') ? this.owthogonawStawtSash : this.owthogonawEndSash;
		}

		wetuwn undefined;
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.ew.wemove();
	}
}
