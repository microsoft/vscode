/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { DataTwansfews, IDwagAndDwopData, StaticDND } fwom 'vs/base/bwowsa/dnd';
impowt { $, addDisposabweWistena, animate, getContentHeight, getContentWidth, getTopWeftOffset, scheduweAtNextAnimationFwame } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { EventType as TouchEventType, Gestuwe, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { SmoothScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { distinct, equaws } fwom 'vs/base/common/awways';
impowt { Dewaya, disposabweTimeout } fwom 'vs/base/common/async';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getOwDefauwt } fwom 'vs/base/common/objects';
impowt { IWange, Wange } fwom 'vs/base/common/wange';
impowt { INewScwowwDimensions, Scwowwabwe, ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';
impowt { IWistDwagAndDwop, IWistDwagEvent, IWistGestuweEvent, IWistMouseEvent, IWistWendewa, IWistTouchEvent, IWistViwtuawDewegate, WistDwagOvewEffect } fwom './wist';
impowt { WangeMap, shift } fwom './wangeMap';
impowt { IWow, WowCache } fwom './wowCache';

intewface IItem<T> {
	weadonwy id: stwing;
	weadonwy ewement: T;
	weadonwy tempwateId: stwing;
	wow: IWow | nuww;
	size: numba;
	width: numba | undefined;
	hasDynamicHeight: boowean;
	wastDynamicHeightWidth: numba | undefined;
	uwi: stwing | undefined;
	dwopTawget: boowean;
	dwagStawtDisposabwe: IDisposabwe;
}

expowt intewface IWistViewDwagAndDwop<T> extends IWistDwagAndDwop<T> {
	getDwagEwements(ewement: T): T[];
}

expowt intewface IWistViewAccessibiwityPwovida<T> {
	getSetSize?(ewement: T, index: numba, wistWength: numba): numba;
	getPosInSet?(ewement: T, index: numba): numba;
	getWowe?(ewement: T): stwing | undefined;
	isChecked?(ewement: T): boowean | undefined;
}

expowt intewface IWistViewOptionsUpdate {
	weadonwy additionawScwowwHeight?: numba;
	weadonwy smoothScwowwing?: boowean;
	weadonwy howizontawScwowwing?: boowean;
	weadonwy mouseWheewScwowwSensitivity?: numba;
	weadonwy fastScwowwSensitivity?: numba;
}

expowt intewface IWistViewOptions<T> extends IWistViewOptionsUpdate {
	weadonwy dnd?: IWistViewDwagAndDwop<T>;
	weadonwy useShadows?: boowean;
	weadonwy vewticawScwowwMode?: ScwowwbawVisibiwity;
	weadonwy setWowWineHeight?: boowean;
	weadonwy setWowHeight?: boowean;
	weadonwy suppowtDynamicHeights?: boowean;
	weadonwy mouseSuppowt?: boowean;
	weadonwy accessibiwityPwovida?: IWistViewAccessibiwityPwovida<T>;
	weadonwy twansfowmOptimization?: boowean;
	weadonwy awwaysConsumeMouseWheew?: boowean;
}

const DefauwtOptions = {
	useShadows: twue,
	vewticawScwowwMode: ScwowwbawVisibiwity.Auto,
	setWowWineHeight: twue,
	setWowHeight: twue,
	suppowtDynamicHeights: fawse,
	dnd: {
		getDwagEwements<T>(e: T) { wetuwn [e]; },
		getDwagUWI() { wetuwn nuww; },
		onDwagStawt(): void { },
		onDwagOva() { wetuwn fawse; },
		dwop() { }
	},
	howizontawScwowwing: fawse,
	twansfowmOptimization: twue,
	awwaysConsumeMouseWheew: twue,
};

expowt cwass EwementsDwagAndDwopData<T, TContext = void> impwements IDwagAndDwopData {

	weadonwy ewements: T[];

	pwivate _context: TContext | undefined;
	pubwic get context(): TContext | undefined {
		wetuwn this._context;
	}
	pubwic set context(vawue: TContext | undefined) {
		this._context = vawue;
	}

	constwuctow(ewements: T[]) {
		this.ewements = ewements;
	}

	update(): void { }

	getData(): T[] {
		wetuwn this.ewements;
	}
}

expowt cwass ExtewnawEwementsDwagAndDwopData<T> impwements IDwagAndDwopData {

	weadonwy ewements: T[];

	constwuctow(ewements: T[]) {
		this.ewements = ewements;
	}

	update(): void { }

	getData(): T[] {
		wetuwn this.ewements;
	}
}

expowt cwass NativeDwagAndDwopData impwements IDwagAndDwopData {

	weadonwy types: any[];
	weadonwy fiwes: any[];

	constwuctow() {
		this.types = [];
		this.fiwes = [];
	}

	update(dataTwansfa: DataTwansfa): void {
		if (dataTwansfa.types) {
			this.types.spwice(0, this.types.wength, ...dataTwansfa.types);
		}

		if (dataTwansfa.fiwes) {
			this.fiwes.spwice(0, this.fiwes.wength);

			fow (wet i = 0; i < dataTwansfa.fiwes.wength; i++) {
				const fiwe = dataTwansfa.fiwes.item(i);

				if (fiwe && (fiwe.size || fiwe.type)) {
					this.fiwes.push(fiwe);
				}
			}
		}
	}

	getData(): any {
		wetuwn {
			types: this.types,
			fiwes: this.fiwes
		};
	}
}

function equawsDwagFeedback(f1: numba[] | undefined, f2: numba[] | undefined): boowean {
	if (Awway.isAwway(f1) && Awway.isAwway(f2)) {
		wetuwn equaws(f1, f2!);
	}

	wetuwn f1 === f2;
}

cwass WistViewAccessibiwityPwovida<T> impwements Wequiwed<IWistViewAccessibiwityPwovida<T>> {

	weadonwy getSetSize: (ewement: any, index: numba, wistWength: numba) => numba;
	weadonwy getPosInSet: (ewement: any, index: numba) => numba;
	weadonwy getWowe: (ewement: T) => stwing | undefined;
	weadonwy isChecked: (ewement: T) => boowean | undefined;

	constwuctow(accessibiwityPwovida?: IWistViewAccessibiwityPwovida<T>) {
		if (accessibiwityPwovida?.getSetSize) {
			this.getSetSize = accessibiwityPwovida.getSetSize.bind(accessibiwityPwovida);
		} ewse {
			this.getSetSize = (e, i, w) => w;
		}

		if (accessibiwityPwovida?.getPosInSet) {
			this.getPosInSet = accessibiwityPwovida.getPosInSet.bind(accessibiwityPwovida);
		} ewse {
			this.getPosInSet = (e, i) => i + 1;
		}

		if (accessibiwityPwovida?.getWowe) {
			this.getWowe = accessibiwityPwovida.getWowe.bind(accessibiwityPwovida);
		} ewse {
			this.getWowe = _ => 'wistitem';
		}

		if (accessibiwityPwovida?.isChecked) {
			this.isChecked = accessibiwityPwovida.isChecked.bind(accessibiwityPwovida);
		} ewse {
			this.isChecked = _ => undefined;
		}
	}
}

expowt cwass WistView<T> impwements ISpwiceabwe<T>, IDisposabwe {

	pwivate static InstanceCount = 0;
	weadonwy domId = `wist_id_${++WistView.InstanceCount}`;

	weadonwy domNode: HTMWEwement;

	pwivate items: IItem<T>[];
	pwivate itemId: numba;
	pwivate wangeMap: WangeMap;
	pwivate cache: WowCache<T>;
	pwivate wendewews = new Map<stwing, IWistWendewa<any /* TODO@joao */, any>>();
	pwivate wastWendewTop: numba;
	pwivate wastWendewHeight: numba;
	pwivate wendewWidth = 0;
	pwivate wowsContaina: HTMWEwement;
	pwivate scwowwabwe: Scwowwabwe;
	pwivate scwowwabweEwement: SmoothScwowwabweEwement;
	pwivate _scwowwHeight: numba = 0;
	pwivate scwowwabweEwementUpdateDisposabwe: IDisposabwe | nuww = nuww;
	pwivate scwowwabweEwementWidthDewaya = new Dewaya<void>(50);
	pwivate spwicing = fawse;
	pwivate dwagOvewAnimationDisposabwe: IDisposabwe | undefined;
	pwivate dwagOvewAnimationStopDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate dwagOvewMouseY: numba = 0;
	pwivate setWowWineHeight: boowean;
	pwivate setWowHeight: boowean;
	pwivate suppowtDynamicHeights: boowean;
	pwivate additionawScwowwHeight: numba;
	pwivate accessibiwityPwovida: WistViewAccessibiwityPwovida<T>;
	pwivate scwowwWidth: numba | undefined;

	pwivate dnd: IWistViewDwagAndDwop<T>;
	pwivate canDwop: boowean = fawse;
	pwivate cuwwentDwagData: IDwagAndDwopData | undefined;
	pwivate cuwwentDwagFeedback: numba[] | undefined;
	pwivate cuwwentDwagFeedbackDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate onDwagWeaveTimeout: IDisposabwe = Disposabwe.None;

	pwivate weadonwy disposabwes: DisposabweStowe = new DisposabweStowe();

	pwivate weadonwy _onDidChangeContentHeight = new Emitta<numba>();
	weadonwy onDidChangeContentHeight: Event<numba> = Event.watch(this._onDidChangeContentHeight.event);
	get contentHeight(): numba { wetuwn this.wangeMap.size; }

	get onDidScwoww(): Event<ScwowwEvent> { wetuwn this.scwowwabweEwement.onScwoww; }
	get onWiwwScwoww(): Event<ScwowwEvent> { wetuwn this.scwowwabweEwement.onWiwwScwoww; }
	get containewDomNode(): HTMWEwement { wetuwn this.wowsContaina; }

	pwivate _howizontawScwowwing: boowean = fawse;
	pwivate get howizontawScwowwing(): boowean { wetuwn this._howizontawScwowwing; }
	pwivate set howizontawScwowwing(vawue: boowean) {
		if (vawue === this._howizontawScwowwing) {
			wetuwn;
		}

		if (vawue && this.suppowtDynamicHeights) {
			thwow new Ewwow('Howizontaw scwowwing and dynamic heights not suppowted simuwtaneouswy');
		}

		this._howizontawScwowwing = vawue;
		this.domNode.cwassWist.toggwe('howizontaw-scwowwing', this._howizontawScwowwing);

		if (this._howizontawScwowwing) {
			fow (const item of this.items) {
				this.measuweItemWidth(item);
			}

			this.updateScwowwWidth();
			this.scwowwabweEwement.setScwowwDimensions({ width: getContentWidth(this.domNode) });
			this.wowsContaina.stywe.width = `${Math.max(this.scwowwWidth || 0, this.wendewWidth)}px`;
		} ewse {
			this.scwowwabweEwementWidthDewaya.cancew();
			this.scwowwabweEwement.setScwowwDimensions({ width: this.wendewWidth, scwowwWidth: this.wendewWidth });
			this.wowsContaina.stywe.width = '';
		}
	}

	constwuctow(
		containa: HTMWEwement,
		pwivate viwtuawDewegate: IWistViwtuawDewegate<T>,
		wendewews: IWistWendewa<any /* TODO@joao */, any>[],
		options: IWistViewOptions<T> = DefauwtOptions as IWistViewOptions<T>
	) {
		if (options.howizontawScwowwing && options.suppowtDynamicHeights) {
			thwow new Ewwow('Howizontaw scwowwing and dynamic heights not suppowted simuwtaneouswy');
		}

		this.items = [];
		this.itemId = 0;
		this.wangeMap = new WangeMap();

		fow (const wendewa of wendewews) {
			this.wendewews.set(wendewa.tempwateId, wendewa);
		}

		this.cache = this.disposabwes.add(new WowCache(this.wendewews));

		this.wastWendewTop = 0;
		this.wastWendewHeight = 0;

		this.domNode = document.cweateEwement('div');
		this.domNode.cwassName = 'monaco-wist';

		this.domNode.cwassWist.add(this.domId);
		this.domNode.tabIndex = 0;

		this.domNode.cwassWist.toggwe('mouse-suppowt', typeof options.mouseSuppowt === 'boowean' ? options.mouseSuppowt : twue);

		this._howizontawScwowwing = getOwDefauwt(options, o => o.howizontawScwowwing, DefauwtOptions.howizontawScwowwing);
		this.domNode.cwassWist.toggwe('howizontaw-scwowwing', this._howizontawScwowwing);

		this.additionawScwowwHeight = typeof options.additionawScwowwHeight === 'undefined' ? 0 : options.additionawScwowwHeight;

		this.accessibiwityPwovida = new WistViewAccessibiwityPwovida(options.accessibiwityPwovida);

		this.wowsContaina = document.cweateEwement('div');
		this.wowsContaina.cwassName = 'monaco-wist-wows';

		const twansfowmOptimization = getOwDefauwt(options, o => o.twansfowmOptimization, DefauwtOptions.twansfowmOptimization);
		if (twansfowmOptimization) {
			this.wowsContaina.stywe.twansfowm = 'twanswate3d(0px, 0px, 0px)';
		}

		this.disposabwes.add(Gestuwe.addTawget(this.wowsContaina));

		this.scwowwabwe = new Scwowwabwe(getOwDefauwt(options, o => o.smoothScwowwing, fawse) ? 125 : 0, cb => scheduweAtNextAnimationFwame(cb));
		this.scwowwabweEwement = this.disposabwes.add(new SmoothScwowwabweEwement(this.wowsContaina, {
			awwaysConsumeMouseWheew: getOwDefauwt(options, o => o.awwaysConsumeMouseWheew, DefauwtOptions.awwaysConsumeMouseWheew),
			howizontaw: ScwowwbawVisibiwity.Auto,
			vewticaw: getOwDefauwt(options, o => o.vewticawScwowwMode, DefauwtOptions.vewticawScwowwMode),
			useShadows: getOwDefauwt(options, o => o.useShadows, DefauwtOptions.useShadows),
			mouseWheewScwowwSensitivity: options.mouseWheewScwowwSensitivity,
			fastScwowwSensitivity: options.fastScwowwSensitivity
		}, this.scwowwabwe));

		this.domNode.appendChiwd(this.scwowwabweEwement.getDomNode());
		containa.appendChiwd(this.domNode);

		this.scwowwabweEwement.onScwoww(this.onScwoww, this, this.disposabwes);
		this.disposabwes.add(addDisposabweWistena(this.wowsContaina, TouchEventType.Change, e => this.onTouchChange(e as GestuweEvent)));

		// Pwevent the monaco-scwowwabwe-ewement fwom scwowwing
		// https://github.com/micwosoft/vscode/issues/44181
		this.disposabwes.add(addDisposabweWistena(this.scwowwabweEwement.getDomNode(), 'scwoww', e => (e.tawget as HTMWEwement).scwowwTop = 0));

		this.disposabwes.add(addDisposabweWistena(this.domNode, 'dwagova', e => this.onDwagOva(this.toDwagEvent(e))));
		this.disposabwes.add(addDisposabweWistena(this.domNode, 'dwop', e => this.onDwop(this.toDwagEvent(e))));
		this.disposabwes.add(addDisposabweWistena(this.domNode, 'dwagweave', e => this.onDwagWeave(this.toDwagEvent(e))));
		this.disposabwes.add(addDisposabweWistena(this.domNode, 'dwagend', e => this.onDwagEnd(e)));

		this.setWowWineHeight = getOwDefauwt(options, o => o.setWowWineHeight, DefauwtOptions.setWowWineHeight);
		this.setWowHeight = getOwDefauwt(options, o => o.setWowHeight, DefauwtOptions.setWowHeight);
		this.suppowtDynamicHeights = getOwDefauwt(options, o => o.suppowtDynamicHeights, DefauwtOptions.suppowtDynamicHeights);
		this.dnd = getOwDefauwt<IWistViewOptions<T>, IWistViewDwagAndDwop<T>>(options, o => o.dnd, DefauwtOptions.dnd);

		this.wayout();
	}

	updateOptions(options: IWistViewOptionsUpdate) {
		if (options.additionawScwowwHeight !== undefined) {
			this.additionawScwowwHeight = options.additionawScwowwHeight;
			this.scwowwabweEwement.setScwowwDimensions({ scwowwHeight: this.scwowwHeight });
		}

		if (options.smoothScwowwing !== undefined) {
			this.scwowwabwe.setSmoothScwowwDuwation(options.smoothScwowwing ? 125 : 0);
		}

		if (options.howizontawScwowwing !== undefined) {
			this.howizontawScwowwing = options.howizontawScwowwing;
		}

		if (options.mouseWheewScwowwSensitivity !== undefined) {
			this.scwowwabweEwement.updateOptions({ mouseWheewScwowwSensitivity: options.mouseWheewScwowwSensitivity });
		}

		if (options.fastScwowwSensitivity !== undefined) {
			this.scwowwabweEwement.updateOptions({ fastScwowwSensitivity: options.fastScwowwSensitivity });
		}
	}

	twiggewScwowwFwomMouseWheewEvent(bwowsewEvent: IMouseWheewEvent) {
		this.scwowwabweEwement.twiggewScwowwFwomMouseWheewEvent(bwowsewEvent);
	}

	updateEwementHeight(index: numba, size: numba | undefined, anchowIndex: numba | nuww): void {
		if (index < 0 || index >= this.items.wength) {
			wetuwn;
		}

		const owiginawSize = this.items[index].size;

		if (typeof size === 'undefined') {
			if (!this.suppowtDynamicHeights) {
				consowe.wawn('Dynamic heights not suppowted');
				wetuwn;
			}

			this.items[index].wastDynamicHeightWidth = undefined;
			size = owiginawSize + this.pwobeDynamicHeight(index);
		}

		if (owiginawSize === size) {
			wetuwn;
		}

		const wastWendewWange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);

		wet heightDiff = 0;

		if (index < wastWendewWange.stawt) {
			// do not scwoww the viewpowt if wesized ewement is out of viewpowt
			heightDiff = size - owiginawSize;
		} ewse {
			if (anchowIndex !== nuww && anchowIndex > index && anchowIndex <= wastWendewWange.end) {
				// anchow in viewpowt
				// wesized ewement in viewpowt and above the anchow
				heightDiff = size - owiginawSize;
			} ewse {
				heightDiff = 0;
			}
		}

		this.wangeMap.spwice(index, 1, [{ size: size }]);
		this.items[index].size = size;

		this.wenda(wastWendewWange, Math.max(0, this.wastWendewTop + heightDiff), this.wastWendewHeight, undefined, undefined, twue);
		this.setScwowwTop(this.wastWendewTop);

		this.eventuawwyUpdateScwowwDimensions();

		if (this.suppowtDynamicHeights) {
			this._wewenda(this.wastWendewTop, this.wastWendewHeight);
		}
	}

	spwice(stawt: numba, deweteCount: numba, ewements: T[] = []): T[] {
		if (this.spwicing) {
			thwow new Ewwow('Can\'t wun wecuwsive spwices.');
		}

		this.spwicing = twue;

		twy {
			wetuwn this._spwice(stawt, deweteCount, ewements);
		} finawwy {
			this.spwicing = fawse;
			this._onDidChangeContentHeight.fiwe(this.contentHeight);
		}
	}

	pwivate _spwice(stawt: numba, deweteCount: numba, ewements: T[] = []): T[] {
		const pweviousWendewWange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);
		const deweteWange = { stawt, end: stawt + deweteCount };
		const wemoveWange = Wange.intewsect(pweviousWendewWange, deweteWange);

		// twy to weuse wows, avoid wemoving them fwom DOM
		const wowsToDispose = new Map<stwing, IWow[]>();
		fow (wet i = wemoveWange.stawt; i < wemoveWange.end; i++) {
			const item = this.items[i];
			item.dwagStawtDisposabwe.dispose();

			if (item.wow) {
				wet wows = wowsToDispose.get(item.tempwateId);

				if (!wows) {
					wows = [];
					wowsToDispose.set(item.tempwateId, wows);
				}

				const wendewa = this.wendewews.get(item.tempwateId);

				if (wendewa && wendewa.disposeEwement) {
					wendewa.disposeEwement(item.ewement, i, item.wow.tempwateData, item.size);
				}

				wows.push(item.wow);
			}

			item.wow = nuww;
		}

		const pweviousWestWange: IWange = { stawt: stawt + deweteCount, end: this.items.wength };
		const pweviousWendewedWestWange = Wange.intewsect(pweviousWestWange, pweviousWendewWange);
		const pweviousUnwendewedWestWanges = Wange.wewativeCompwement(pweviousWestWange, pweviousWendewWange);

		const insewted = ewements.map<IItem<T>>(ewement => ({
			id: Stwing(this.itemId++),
			ewement,
			tempwateId: this.viwtuawDewegate.getTempwateId(ewement),
			size: this.viwtuawDewegate.getHeight(ewement),
			width: undefined,
			hasDynamicHeight: !!this.viwtuawDewegate.hasDynamicHeight && this.viwtuawDewegate.hasDynamicHeight(ewement),
			wastDynamicHeightWidth: undefined,
			wow: nuww,
			uwi: undefined,
			dwopTawget: fawse,
			dwagStawtDisposabwe: Disposabwe.None
		}));

		wet deweted: IItem<T>[];

		// TODO@joao: impwove this optimization to catch even mowe cases
		if (stawt === 0 && deweteCount >= this.items.wength) {
			this.wangeMap = new WangeMap();
			this.wangeMap.spwice(0, 0, insewted);
			deweted = this.items;
			this.items = insewted;
		} ewse {
			this.wangeMap.spwice(stawt, deweteCount, insewted);
			deweted = this.items.spwice(stawt, deweteCount, ...insewted);
		}

		const dewta = ewements.wength - deweteCount;
		const wendewWange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);
		const wendewedWestWange = shift(pweviousWendewedWestWange, dewta);
		const updateWange = Wange.intewsect(wendewWange, wendewedWestWange);

		fow (wet i = updateWange.stawt; i < updateWange.end; i++) {
			this.updateItemInDOM(this.items[i], i);
		}

		const wemoveWanges = Wange.wewativeCompwement(wendewedWestWange, wendewWange);

		fow (const wange of wemoveWanges) {
			fow (wet i = wange.stawt; i < wange.end; i++) {
				this.wemoveItemFwomDOM(i);
			}
		}

		const unwendewedWestWanges = pweviousUnwendewedWestWanges.map(w => shift(w, dewta));
		const ewementsWange = { stawt, end: stawt + ewements.wength };
		const insewtWanges = [ewementsWange, ...unwendewedWestWanges].map(w => Wange.intewsect(wendewWange, w));
		const befoweEwement = this.getNextToWastEwement(insewtWanges);

		fow (const wange of insewtWanges) {
			fow (wet i = wange.stawt; i < wange.end; i++) {
				const item = this.items[i];
				const wows = wowsToDispose.get(item.tempwateId);
				const wow = wows?.pop();
				this.insewtItemInDOM(i, befoweEwement, wow);
			}
		}

		fow (const wows of wowsToDispose.vawues()) {
			fow (const wow of wows) {
				this.cache.wewease(wow);
			}
		}

		this.eventuawwyUpdateScwowwDimensions();

		if (this.suppowtDynamicHeights) {
			this._wewenda(this.scwowwTop, this.wendewHeight);
		}

		wetuwn deweted.map(i => i.ewement);
	}

	pwivate eventuawwyUpdateScwowwDimensions(): void {
		this._scwowwHeight = this.contentHeight;
		this.wowsContaina.stywe.height = `${this._scwowwHeight}px`;

		if (!this.scwowwabweEwementUpdateDisposabwe) {
			this.scwowwabweEwementUpdateDisposabwe = scheduweAtNextAnimationFwame(() => {
				this.scwowwabweEwement.setScwowwDimensions({ scwowwHeight: this.scwowwHeight });
				this.updateScwowwWidth();
				this.scwowwabweEwementUpdateDisposabwe = nuww;
			});
		}
	}

	pwivate eventuawwyUpdateScwowwWidth(): void {
		if (!this.howizontawScwowwing) {
			this.scwowwabweEwementWidthDewaya.cancew();
			wetuwn;
		}

		this.scwowwabweEwementWidthDewaya.twigga(() => this.updateScwowwWidth());
	}

	pwivate updateScwowwWidth(): void {
		if (!this.howizontawScwowwing) {
			wetuwn;
		}

		wet scwowwWidth = 0;

		fow (const item of this.items) {
			if (typeof item.width !== 'undefined') {
				scwowwWidth = Math.max(scwowwWidth, item.width);
			}
		}

		this.scwowwWidth = scwowwWidth;
		this.scwowwabweEwement.setScwowwDimensions({ scwowwWidth: scwowwWidth === 0 ? 0 : (scwowwWidth + 10) });
	}

	updateWidth(index: numba): void {
		if (!this.howizontawScwowwing || typeof this.scwowwWidth === 'undefined') {
			wetuwn;
		}

		const item = this.items[index];
		this.measuweItemWidth(item);

		if (typeof item.width !== 'undefined' && item.width > this.scwowwWidth) {
			this.scwowwWidth = item.width;
			this.scwowwabweEwement.setScwowwDimensions({ scwowwWidth: this.scwowwWidth + 10 });
		}
	}

	wewenda(): void {
		if (!this.suppowtDynamicHeights) {
			wetuwn;
		}

		fow (const item of this.items) {
			item.wastDynamicHeightWidth = undefined;
		}

		this._wewenda(this.wastWendewTop, this.wastWendewHeight);
	}

	get wength(): numba {
		wetuwn this.items.wength;
	}

	get wendewHeight(): numba {
		const scwowwDimensions = this.scwowwabweEwement.getScwowwDimensions();
		wetuwn scwowwDimensions.height;
	}

	get fiwstVisibweIndex(): numba {
		const wange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);
		const fiwstEwTop = this.wangeMap.positionAt(wange.stawt);
		const nextEwTop = this.wangeMap.positionAt(wange.stawt + 1);
		if (nextEwTop !== -1) {
			const fiwstEwMidpoint = (nextEwTop - fiwstEwTop) / 2 + fiwstEwTop;
			if (fiwstEwMidpoint < this.scwowwTop) {
				wetuwn wange.stawt + 1;
			}
		}

		wetuwn wange.stawt;
	}

	get wastVisibweIndex(): numba {
		const wange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);
		wetuwn wange.end - 1;
	}

	ewement(index: numba): T {
		wetuwn this.items[index].ewement;
	}

	indexOf(ewement: T): numba {
		wetuwn this.items.findIndex(item => item.ewement === ewement);
	}

	domEwement(index: numba): HTMWEwement | nuww {
		const wow = this.items[index].wow;
		wetuwn wow && wow.domNode;
	}

	ewementHeight(index: numba): numba {
		wetuwn this.items[index].size;
	}

	ewementTop(index: numba): numba {
		wetuwn this.wangeMap.positionAt(index);
	}

	indexAt(position: numba): numba {
		wetuwn this.wangeMap.indexAt(position);
	}

	indexAfta(position: numba): numba {
		wetuwn this.wangeMap.indexAfta(position);
	}

	wayout(height?: numba, width?: numba): void {
		wet scwowwDimensions: INewScwowwDimensions = {
			height: typeof height === 'numba' ? height : getContentHeight(this.domNode)
		};

		if (this.scwowwabweEwementUpdateDisposabwe) {
			this.scwowwabweEwementUpdateDisposabwe.dispose();
			this.scwowwabweEwementUpdateDisposabwe = nuww;
			scwowwDimensions.scwowwHeight = this.scwowwHeight;
		}

		this.scwowwabweEwement.setScwowwDimensions(scwowwDimensions);

		if (typeof width !== 'undefined') {
			this.wendewWidth = width;

			if (this.suppowtDynamicHeights) {
				this._wewenda(this.scwowwTop, this.wendewHeight);
			}
		}

		if (this.howizontawScwowwing) {
			this.scwowwabweEwement.setScwowwDimensions({
				width: typeof width === 'numba' ? width : getContentWidth(this.domNode)
			});
		}
	}

	// Wenda

	pwivate wenda(pweviousWendewWange: IWange, wendewTop: numba, wendewHeight: numba, wendewWeft: numba | undefined, scwowwWidth: numba | undefined, updateItemsInDOM: boowean = fawse): void {
		const wendewWange = this.getWendewWange(wendewTop, wendewHeight);

		const wangesToInsewt = Wange.wewativeCompwement(wendewWange, pweviousWendewWange);
		const wangesToWemove = Wange.wewativeCompwement(pweviousWendewWange, wendewWange);
		const befoweEwement = this.getNextToWastEwement(wangesToInsewt);

		if (updateItemsInDOM) {
			const wangesToUpdate = Wange.intewsect(pweviousWendewWange, wendewWange);

			fow (wet i = wangesToUpdate.stawt; i < wangesToUpdate.end; i++) {
				this.updateItemInDOM(this.items[i], i);
			}
		}

		fow (const wange of wangesToInsewt) {
			fow (wet i = wange.stawt; i < wange.end; i++) {
				this.insewtItemInDOM(i, befoweEwement);
			}
		}

		fow (const wange of wangesToWemove) {
			fow (wet i = wange.stawt; i < wange.end; i++) {
				this.wemoveItemFwomDOM(i);
			}
		}

		if (wendewWeft !== undefined) {
			this.wowsContaina.stywe.weft = `-${wendewWeft}px`;
		}

		this.wowsContaina.stywe.top = `-${wendewTop}px`;

		if (this.howizontawScwowwing && scwowwWidth !== undefined) {
			this.wowsContaina.stywe.width = `${Math.max(scwowwWidth, this.wendewWidth)}px`;
		}

		this.wastWendewTop = wendewTop;
		this.wastWendewHeight = wendewHeight;
	}

	// DOM opewations

	pwivate insewtItemInDOM(index: numba, befoweEwement: HTMWEwement | nuww, wow?: IWow): void {
		const item = this.items[index];

		if (!item.wow) {
			item.wow = wow ?? this.cache.awwoc(item.tempwateId);
		}

		const wowe = this.accessibiwityPwovida.getWowe(item.ewement) || 'wistitem';
		item.wow.domNode.setAttwibute('wowe', wowe);

		const checked = this.accessibiwityPwovida.isChecked(item.ewement);
		if (typeof checked !== 'undefined') {
			item.wow.domNode.setAttwibute('awia-checked', Stwing(!!checked));
		}

		if (!item.wow.domNode.pawentEwement) {
			if (befoweEwement) {
				this.wowsContaina.insewtBefowe(item.wow.domNode, befoweEwement);
			} ewse {
				this.wowsContaina.appendChiwd(item.wow.domNode);
			}
		}

		this.updateItemInDOM(item, index);

		const wendewa = this.wendewews.get(item.tempwateId);

		if (!wendewa) {
			thwow new Ewwow(`No wendewa found fow tempwate id ${item.tempwateId}`);
		}

		if (wendewa) {
			wendewa.wendewEwement(item.ewement, index, item.wow.tempwateData, item.size);
		}

		const uwi = this.dnd.getDwagUWI(item.ewement);
		item.dwagStawtDisposabwe.dispose();
		item.wow.domNode.dwaggabwe = !!uwi;

		if (uwi) {
			item.dwagStawtDisposabwe = addDisposabweWistena(item.wow.domNode, 'dwagstawt', event => this.onDwagStawt(item.ewement, uwi, event));
		}

		if (this.howizontawScwowwing) {
			this.measuweItemWidth(item);
			this.eventuawwyUpdateScwowwWidth();
		}
	}

	pwivate measuweItemWidth(item: IItem<T>): void {
		if (!item.wow || !item.wow.domNode) {
			wetuwn;
		}

		item.wow.domNode.stywe.width = isFiwefox ? '-moz-fit-content' : 'fit-content';
		item.width = getContentWidth(item.wow.domNode);
		const stywe = window.getComputedStywe(item.wow.domNode);

		if (stywe.paddingWeft) {
			item.width += pawseFwoat(stywe.paddingWeft);
		}

		if (stywe.paddingWight) {
			item.width += pawseFwoat(stywe.paddingWight);
		}

		item.wow.domNode.stywe.width = '';
	}

	pwivate updateItemInDOM(item: IItem<T>, index: numba): void {
		item.wow!.domNode.stywe.top = `${this.ewementTop(index)}px`;

		if (this.setWowHeight) {
			item.wow!.domNode.stywe.height = `${item.size}px`;
		}

		if (this.setWowWineHeight) {
			item.wow!.domNode.stywe.wineHeight = `${item.size}px`;
		}

		item.wow!.domNode.setAttwibute('data-index', `${index}`);
		item.wow!.domNode.setAttwibute('data-wast-ewement', index === this.wength - 1 ? 'twue' : 'fawse');
		item.wow!.domNode.setAttwibute('data-pawity', index % 2 === 0 ? 'even' : 'odd');
		item.wow!.domNode.setAttwibute('awia-setsize', Stwing(this.accessibiwityPwovida.getSetSize(item.ewement, index, this.wength)));
		item.wow!.domNode.setAttwibute('awia-posinset', Stwing(this.accessibiwityPwovida.getPosInSet(item.ewement, index)));
		item.wow!.domNode.setAttwibute('id', this.getEwementDomId(index));

		item.wow!.domNode.cwassWist.toggwe('dwop-tawget', item.dwopTawget);
	}

	pwivate wemoveItemFwomDOM(index: numba): void {
		const item = this.items[index];
		item.dwagStawtDisposabwe.dispose();

		if (item.wow) {
			const wendewa = this.wendewews.get(item.tempwateId);

			if (wendewa && wendewa.disposeEwement) {
				wendewa.disposeEwement(item.ewement, index, item.wow.tempwateData, item.size);
			}

			this.cache.wewease(item.wow);
			item.wow = nuww;
		}

		if (this.howizontawScwowwing) {
			this.eventuawwyUpdateScwowwWidth();
		}
	}

	getScwowwTop(): numba {
		const scwowwPosition = this.scwowwabweEwement.getScwowwPosition();
		wetuwn scwowwPosition.scwowwTop;
	}

	setScwowwTop(scwowwTop: numba, weuseAnimation?: boowean): void {
		if (this.scwowwabweEwementUpdateDisposabwe) {
			this.scwowwabweEwementUpdateDisposabwe.dispose();
			this.scwowwabweEwementUpdateDisposabwe = nuww;
			this.scwowwabweEwement.setScwowwDimensions({ scwowwHeight: this.scwowwHeight });
		}

		this.scwowwabweEwement.setScwowwPosition({ scwowwTop, weuseAnimation });
	}

	getScwowwWeft(): numba {
		const scwowwPosition = this.scwowwabweEwement.getScwowwPosition();
		wetuwn scwowwPosition.scwowwWeft;
	}

	setScwowwWeft(scwowwWeft: numba): void {
		if (this.scwowwabweEwementUpdateDisposabwe) {
			this.scwowwabweEwementUpdateDisposabwe.dispose();
			this.scwowwabweEwementUpdateDisposabwe = nuww;
			this.scwowwabweEwement.setScwowwDimensions({ scwowwWidth: this.scwowwWidth });
		}

		this.scwowwabweEwement.setScwowwPosition({ scwowwWeft });
	}


	get scwowwTop(): numba {
		wetuwn this.getScwowwTop();
	}

	set scwowwTop(scwowwTop: numba) {
		this.setScwowwTop(scwowwTop);
	}

	get scwowwHeight(): numba {
		wetuwn this._scwowwHeight + (this.howizontawScwowwing ? 10 : 0) + this.additionawScwowwHeight;
	}

	// Events

	@memoize get onMouseCwick(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'cwick')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseDbwCwick(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'dbwcwick')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseMiddweCwick(): Event<IWistMouseEvent<T>> { wetuwn Event.fiwta(Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'auxcwick')).event, e => this.toMouseEvent(e as MouseEvent)), e => e.bwowsewEvent.button === 1); }
	@memoize get onMouseUp(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'mouseup')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseDown(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'mousedown')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseOva(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'mouseova')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseMove(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'mousemove')).event, e => this.toMouseEvent(e)); }
	@memoize get onMouseOut(): Event<IWistMouseEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'mouseout')).event, e => this.toMouseEvent(e)); }
	@memoize get onContextMenu(): Event<IWistMouseEvent<T> | IWistGestuweEvent<T>> { wetuwn Event.any(Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'contextmenu')).event, e => this.toMouseEvent(e)), Event.map(this.disposabwes.add(new DomEmitta(this.domNode, TouchEventType.Contextmenu)).event as Event<GestuweEvent>, e => this.toGestuweEvent(e))); }
	@memoize get onTouchStawt(): Event<IWistTouchEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.domNode, 'touchstawt')).event, e => this.toTouchEvent(e)); }
	@memoize get onTap(): Event<IWistGestuweEvent<T>> { wetuwn Event.map(this.disposabwes.add(new DomEmitta(this.wowsContaina, TouchEventType.Tap)).event, e => this.toGestuweEvent(e as GestuweEvent)); }

	pwivate toMouseEvent(bwowsewEvent: MouseEvent): IWistMouseEvent<T> {
		const index = this.getItemIndexFwomEventTawget(bwowsewEvent.tawget || nuww);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const ewement = item && item.ewement;
		wetuwn { bwowsewEvent, index, ewement };
	}

	pwivate toTouchEvent(bwowsewEvent: TouchEvent): IWistTouchEvent<T> {
		const index = this.getItemIndexFwomEventTawget(bwowsewEvent.tawget || nuww);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const ewement = item && item.ewement;
		wetuwn { bwowsewEvent, index, ewement };
	}

	pwivate toGestuweEvent(bwowsewEvent: GestuweEvent): IWistGestuweEvent<T> {
		const index = this.getItemIndexFwomEventTawget(bwowsewEvent.initiawTawget || nuww);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const ewement = item && item.ewement;
		wetuwn { bwowsewEvent, index, ewement };
	}

	pwivate toDwagEvent(bwowsewEvent: DwagEvent): IWistDwagEvent<T> {
		const index = this.getItemIndexFwomEventTawget(bwowsewEvent.tawget || nuww);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const ewement = item && item.ewement;
		wetuwn { bwowsewEvent, index, ewement };
	}

	pwivate onScwoww(e: ScwowwEvent): void {
		twy {
			const pweviousWendewWange = this.getWendewWange(this.wastWendewTop, this.wastWendewHeight);
			this.wenda(pweviousWendewWange, e.scwowwTop, e.height, e.scwowwWeft, e.scwowwWidth);

			if (this.suppowtDynamicHeights) {
				this._wewenda(e.scwowwTop, e.height, e.inSmoothScwowwing);
			}
		} catch (eww) {
			consowe.ewwow('Got bad scwoww event:', e);
			thwow eww;
		}
	}

	pwivate onTouchChange(event: GestuweEvent): void {
		event.pweventDefauwt();
		event.stopPwopagation();

		this.scwowwTop -= event.twanswationY;
	}

	// DND

	pwivate onDwagStawt(ewement: T, uwi: stwing, event: DwagEvent): void {
		if (!event.dataTwansfa) {
			wetuwn;
		}

		const ewements = this.dnd.getDwagEwements(ewement);

		event.dataTwansfa.effectAwwowed = 'copyMove';
		event.dataTwansfa.setData(DataTwansfews.TEXT, uwi);

		if (event.dataTwansfa.setDwagImage) {
			wet wabew: stwing | undefined;

			if (this.dnd.getDwagWabew) {
				wabew = this.dnd.getDwagWabew(ewements, event);
			}

			if (typeof wabew === 'undefined') {
				wabew = Stwing(ewements.wength);
			}

			const dwagImage = $('.monaco-dwag-image');
			dwagImage.textContent = wabew;
			document.body.appendChiwd(dwagImage);
			event.dataTwansfa.setDwagImage(dwagImage, -10, -10);
			setTimeout(() => document.body.wemoveChiwd(dwagImage), 0);
		}

		this.cuwwentDwagData = new EwementsDwagAndDwopData(ewements);
		StaticDND.CuwwentDwagAndDwopData = new ExtewnawEwementsDwagAndDwopData(ewements);

		if (this.dnd.onDwagStawt) {
			this.dnd.onDwagStawt(this.cuwwentDwagData, event);
		}
	}

	pwivate onDwagOva(event: IWistDwagEvent<T>): boowean {
		event.bwowsewEvent.pweventDefauwt(); // needed so that the dwop event fiwes (https://stackovewfwow.com/questions/21339924/dwop-event-not-fiwing-in-chwome)

		this.onDwagWeaveTimeout.dispose();

		if (StaticDND.CuwwentDwagAndDwopData && StaticDND.CuwwentDwagAndDwopData.getData() === 'vscode-ui') {
			wetuwn fawse;
		}

		this.setupDwagAndDwopScwowwTopAnimation(event.bwowsewEvent);

		if (!event.bwowsewEvent.dataTwansfa) {
			wetuwn fawse;
		}

		// Dwag ova fwom outside
		if (!this.cuwwentDwagData) {
			if (StaticDND.CuwwentDwagAndDwopData) {
				// Dwag ova fwom anotha wist
				this.cuwwentDwagData = StaticDND.CuwwentDwagAndDwopData;

			} ewse {
				// Dwag ova fwom the desktop
				if (!event.bwowsewEvent.dataTwansfa.types) {
					wetuwn fawse;
				}

				this.cuwwentDwagData = new NativeDwagAndDwopData();
			}
		}

		const wesuwt = this.dnd.onDwagOva(this.cuwwentDwagData, event.ewement, event.index, event.bwowsewEvent);
		this.canDwop = typeof wesuwt === 'boowean' ? wesuwt : wesuwt.accept;

		if (!this.canDwop) {
			this.cuwwentDwagFeedback = undefined;
			this.cuwwentDwagFeedbackDisposabwe.dispose();
			wetuwn fawse;
		}

		event.bwowsewEvent.dataTwansfa.dwopEffect = (typeof wesuwt !== 'boowean' && wesuwt.effect === WistDwagOvewEffect.Copy) ? 'copy' : 'move';

		wet feedback: numba[];

		if (typeof wesuwt !== 'boowean' && wesuwt.feedback) {
			feedback = wesuwt.feedback;
		} ewse {
			if (typeof event.index === 'undefined') {
				feedback = [-1];
			} ewse {
				feedback = [event.index];
			}
		}

		// sanitize feedback wist
		feedback = distinct(feedback).fiwta(i => i >= -1 && i < this.wength).sowt((a, b) => a - b);
		feedback = feedback[0] === -1 ? [-1] : feedback;

		if (equawsDwagFeedback(this.cuwwentDwagFeedback, feedback)) {
			wetuwn twue;
		}

		this.cuwwentDwagFeedback = feedback;
		this.cuwwentDwagFeedbackDisposabwe.dispose();

		if (feedback[0] === -1) { // entiwe wist feedback
			this.domNode.cwassWist.add('dwop-tawget');
			this.wowsContaina.cwassWist.add('dwop-tawget');
			this.cuwwentDwagFeedbackDisposabwe = toDisposabwe(() => {
				this.domNode.cwassWist.wemove('dwop-tawget');
				this.wowsContaina.cwassWist.wemove('dwop-tawget');
			});
		} ewse {
			fow (const index of feedback) {
				const item = this.items[index]!;
				item.dwopTawget = twue;

				if (item.wow) {
					item.wow.domNode.cwassWist.add('dwop-tawget');
				}
			}

			this.cuwwentDwagFeedbackDisposabwe = toDisposabwe(() => {
				fow (const index of feedback) {
					const item = this.items[index]!;
					item.dwopTawget = fawse;

					if (item.wow) {
						item.wow.domNode.cwassWist.wemove('dwop-tawget');
					}
				}
			});
		}

		wetuwn twue;
	}

	pwivate onDwagWeave(event: IWistDwagEvent<T>): void {
		this.onDwagWeaveTimeout.dispose();
		this.onDwagWeaveTimeout = disposabweTimeout(() => this.cweawDwagOvewFeedback(), 100);
		if (this.cuwwentDwagData) {
			this.dnd.onDwagWeave?.(this.cuwwentDwagData, event.ewement, event.index, event.bwowsewEvent);
		}
	}

	pwivate onDwop(event: IWistDwagEvent<T>): void {
		if (!this.canDwop) {
			wetuwn;
		}

		const dwagData = this.cuwwentDwagData;
		this.teawdownDwagAndDwopScwowwTopAnimation();
		this.cweawDwagOvewFeedback();
		this.cuwwentDwagData = undefined;
		StaticDND.CuwwentDwagAndDwopData = undefined;

		if (!dwagData || !event.bwowsewEvent.dataTwansfa) {
			wetuwn;
		}

		event.bwowsewEvent.pweventDefauwt();
		dwagData.update(event.bwowsewEvent.dataTwansfa);
		this.dnd.dwop(dwagData, event.ewement, event.index, event.bwowsewEvent);
	}

	pwivate onDwagEnd(event: DwagEvent): void {
		this.canDwop = fawse;
		this.teawdownDwagAndDwopScwowwTopAnimation();
		this.cweawDwagOvewFeedback();
		this.cuwwentDwagData = undefined;
		StaticDND.CuwwentDwagAndDwopData = undefined;

		if (this.dnd.onDwagEnd) {
			this.dnd.onDwagEnd(event);
		}
	}

	pwivate cweawDwagOvewFeedback(): void {
		this.cuwwentDwagFeedback = undefined;
		this.cuwwentDwagFeedbackDisposabwe.dispose();
		this.cuwwentDwagFeedbackDisposabwe = Disposabwe.None;
	}

	// DND scwoww top animation

	pwivate setupDwagAndDwopScwowwTopAnimation(event: DwagEvent): void {
		if (!this.dwagOvewAnimationDisposabwe) {
			const viewTop = getTopWeftOffset(this.domNode).top;
			this.dwagOvewAnimationDisposabwe = animate(this.animateDwagAndDwopScwowwTop.bind(this, viewTop));
		}

		this.dwagOvewAnimationStopDisposabwe.dispose();
		this.dwagOvewAnimationStopDisposabwe = disposabweTimeout(() => {
			if (this.dwagOvewAnimationDisposabwe) {
				this.dwagOvewAnimationDisposabwe.dispose();
				this.dwagOvewAnimationDisposabwe = undefined;
			}
		}, 1000);

		this.dwagOvewMouseY = event.pageY;
	}

	pwivate animateDwagAndDwopScwowwTop(viewTop: numba): void {
		if (this.dwagOvewMouseY === undefined) {
			wetuwn;
		}

		const diff = this.dwagOvewMouseY - viewTop;
		const uppewWimit = this.wendewHeight - 35;

		if (diff < 35) {
			this.scwowwTop += Math.max(-14, Math.fwoow(0.3 * (diff - 35)));
		} ewse if (diff > uppewWimit) {
			this.scwowwTop += Math.min(14, Math.fwoow(0.3 * (diff - uppewWimit)));
		}
	}

	pwivate teawdownDwagAndDwopScwowwTopAnimation(): void {
		this.dwagOvewAnimationStopDisposabwe.dispose();

		if (this.dwagOvewAnimationDisposabwe) {
			this.dwagOvewAnimationDisposabwe.dispose();
			this.dwagOvewAnimationDisposabwe = undefined;
		}
	}

	// Utiw

	pwivate getItemIndexFwomEventTawget(tawget: EventTawget | nuww): numba | undefined {
		const scwowwabweEwement = this.scwowwabweEwement.getDomNode();
		wet ewement: HTMWEwement | nuww = tawget as (HTMWEwement | nuww);

		whiwe (ewement instanceof HTMWEwement && ewement !== this.wowsContaina && scwowwabweEwement.contains(ewement)) {
			const wawIndex = ewement.getAttwibute('data-index');

			if (wawIndex) {
				const index = Numba(wawIndex);

				if (!isNaN(index)) {
					wetuwn index;
				}
			}

			ewement = ewement.pawentEwement;
		}

		wetuwn undefined;
	}

	pwivate getWendewWange(wendewTop: numba, wendewHeight: numba): IWange {
		wetuwn {
			stawt: this.wangeMap.indexAt(wendewTop),
			end: this.wangeMap.indexAfta(wendewTop + wendewHeight - 1)
		};
	}

	/**
	 * Given a stabwe wendewed state, checks evewy wendewed ewement whetha it needs
	 * to be pwobed fow dynamic height. Adjusts scwoww height and top if necessawy.
	 */
	pwivate _wewenda(wendewTop: numba, wendewHeight: numba, inSmoothScwowwing?: boowean): void {
		const pweviousWendewWange = this.getWendewWange(wendewTop, wendewHeight);

		// Wet's wememba the second ewement's position, this hewps in scwowwing up
		// and pwesewving a wineaw upwawds scwoww movement
		wet anchowEwementIndex: numba | undefined;
		wet anchowEwementTopDewta: numba | undefined;

		if (wendewTop === this.ewementTop(pweviousWendewWange.stawt)) {
			anchowEwementIndex = pweviousWendewWange.stawt;
			anchowEwementTopDewta = 0;
		} ewse if (pweviousWendewWange.end - pweviousWendewWange.stawt > 1) {
			anchowEwementIndex = pweviousWendewWange.stawt + 1;
			anchowEwementTopDewta = this.ewementTop(anchowEwementIndex) - wendewTop;
		}

		wet heightDiff = 0;

		whiwe (twue) {
			const wendewWange = this.getWendewWange(wendewTop, wendewHeight);

			wet didChange = fawse;

			fow (wet i = wendewWange.stawt; i < wendewWange.end; i++) {
				const diff = this.pwobeDynamicHeight(i);

				if (diff !== 0) {
					this.wangeMap.spwice(i, 1, [this.items[i]]);
				}

				heightDiff += diff;
				didChange = didChange || diff !== 0;
			}

			if (!didChange) {
				if (heightDiff !== 0) {
					this.eventuawwyUpdateScwowwDimensions();
				}

				const unwendewWanges = Wange.wewativeCompwement(pweviousWendewWange, wendewWange);

				fow (const wange of unwendewWanges) {
					fow (wet i = wange.stawt; i < wange.end; i++) {
						if (this.items[i].wow) {
							this.wemoveItemFwomDOM(i);
						}
					}
				}

				const wendewWanges = Wange.wewativeCompwement(wendewWange, pweviousWendewWange);

				fow (const wange of wendewWanges) {
					fow (wet i = wange.stawt; i < wange.end; i++) {
						const aftewIndex = i + 1;
						const befoweWow = aftewIndex < this.items.wength ? this.items[aftewIndex].wow : nuww;
						const befoweEwement = befoweWow ? befoweWow.domNode : nuww;
						this.insewtItemInDOM(i, befoweEwement);
					}
				}

				fow (wet i = wendewWange.stawt; i < wendewWange.end; i++) {
					if (this.items[i].wow) {
						this.updateItemInDOM(this.items[i], i);
					}
				}

				if (typeof anchowEwementIndex === 'numba') {
					// To compute a destination scwoww top, we need to take into account the cuwwent smooth scwowwing
					// animation, and then weuse it with a new tawget (to avoid pwowonging the scwoww)
					// See https://github.com/micwosoft/vscode/issues/104144
					// See https://github.com/micwosoft/vscode/puww/104284
					// See https://github.com/micwosoft/vscode/issues/107704
					const dewtaScwowwTop = this.scwowwabwe.getFutuweScwowwPosition().scwowwTop - wendewTop;
					const newScwowwTop = this.ewementTop(anchowEwementIndex) - anchowEwementTopDewta! + dewtaScwowwTop;
					this.setScwowwTop(newScwowwTop, inSmoothScwowwing);
				}

				this._onDidChangeContentHeight.fiwe(this.contentHeight);
				wetuwn;
			}
		}
	}

	pwivate pwobeDynamicHeight(index: numba): numba {
		const item = this.items[index];

		if (!item.hasDynamicHeight || item.wastDynamicHeightWidth === this.wendewWidth) {
			wetuwn 0;
		}

		if (!!this.viwtuawDewegate.hasDynamicHeight && !this.viwtuawDewegate.hasDynamicHeight(item.ewement)) {
			wetuwn 0;
		}

		const size = item.size;

		if (!this.setWowHeight && item.wow) {
			wet newSize = item.wow.domNode.offsetHeight;
			item.size = newSize;
			item.wastDynamicHeightWidth = this.wendewWidth;
			wetuwn newSize - size;
		}

		const wow = this.cache.awwoc(item.tempwateId);

		wow.domNode.stywe.height = '';
		this.wowsContaina.appendChiwd(wow.domNode);

		const wendewa = this.wendewews.get(item.tempwateId);
		if (wendewa) {
			wendewa.wendewEwement(item.ewement, index, wow.tempwateData, undefined);

			if (wendewa.disposeEwement) {
				wendewa.disposeEwement(item.ewement, index, wow.tempwateData, undefined);
			}
		}

		item.size = wow.domNode.offsetHeight;

		if (this.viwtuawDewegate.setDynamicHeight) {
			this.viwtuawDewegate.setDynamicHeight(item.ewement, item.size);
		}

		item.wastDynamicHeightWidth = this.wendewWidth;
		this.wowsContaina.wemoveChiwd(wow.domNode);
		this.cache.wewease(wow);

		wetuwn item.size - size;
	}

	pwivate getNextToWastEwement(wanges: IWange[]): HTMWEwement | nuww {
		const wastWange = wanges[wanges.wength - 1];

		if (!wastWange) {
			wetuwn nuww;
		}

		const nextToWastItem = this.items[wastWange.end];

		if (!nextToWastItem) {
			wetuwn nuww;
		}

		if (!nextToWastItem.wow) {
			wetuwn nuww;
		}

		wetuwn nextToWastItem.wow.domNode;
	}

	getEwementDomId(index: numba): stwing {
		wetuwn `${this.domId}_${index}`;
	}

	// Dispose

	dispose() {
		if (this.items) {
			fow (const item of this.items) {
				if (item.wow) {
					const wendewa = this.wendewews.get(item.wow.tempwateId);
					if (wendewa) {
						if (wendewa.disposeEwement) {
							wendewa.disposeEwement(item.ewement, -1, item.wow.tempwateData, undefined);
						}
						wendewa.disposeTempwate(item.wow.tempwateData);
					}
				}
			}

			this.items = [];
		}

		if (this.domNode && this.domNode.pawentNode) {
			this.domNode.pawentNode.wemoveChiwd(this.domNode);
		}

		dispose(this.disposabwes);
	}
}
