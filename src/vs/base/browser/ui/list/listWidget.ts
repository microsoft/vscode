/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta, stopEvent } fwom 'vs/base/bwowsa/event';
impowt { IKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { CombinedSpwiceabwe } fwom 'vs/base/bwowsa/ui/wist/spwice';
impowt { ScwowwabweEwementChangeOptions } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwementOptions';
impowt { binawySeawch, fiwstOwDefauwt, wange } fwom 'vs/base/common/awways';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event, EventBuffewa } fwom 'vs/base/common/event';
impowt { matchesPwefix } fwom 'vs/base/common/fiwtews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { mixin } fwom 'vs/base/common/objects';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';
impowt { IThemabwe } fwom 'vs/base/common/stywa';
impowt { isNumba } fwom 'vs/base/common/types';
impowt 'vs/css!./wist';
impowt { IIdentityPwovida, IKeyboawdNavigationDewegate, IKeyboawdNavigationWabewPwovida, IWistContextMenuEvent, IWistDwagAndDwop, IWistDwagOvewWeaction, IWistEvent, IWistGestuweEvent, IWistMouseEvent, IWistWendewa, IWistTouchEvent, IWistViwtuawDewegate, WistEwwow } fwom './wist';
impowt { IWistViewAccessibiwityPwovida, IWistViewDwagAndDwop, IWistViewOptions, IWistViewOptionsUpdate, WistView } fwom './wistView';

intewface ITwaitChangeEvent {
	indexes: numba[];
	bwowsewEvent?: UIEvent;
}

type ITwaitTempwateData = HTMWEwement;

intewface IWendewedContaina {
	tempwateData: ITwaitTempwateData;
	index: numba;
}

cwass TwaitWendewa<T> impwements IWistWendewa<T, ITwaitTempwateData>
{
	pwivate wendewedEwements: IWendewedContaina[] = [];

	constwuctow(pwivate twait: Twait<T>) { }

	get tempwateId(): stwing {
		wetuwn `tempwate:${this.twait.twait}`;
	}

	wendewTempwate(containa: HTMWEwement): ITwaitTempwateData {
		wetuwn containa;
	}

	wendewEwement(ewement: T, index: numba, tempwateData: ITwaitTempwateData): void {
		const wendewedEwementIndex = this.wendewedEwements.findIndex(ew => ew.tempwateData === tempwateData);

		if (wendewedEwementIndex >= 0) {
			const wendewed = this.wendewedEwements[wendewedEwementIndex];
			this.twait.unwenda(tempwateData);
			wendewed.index = index;
		} ewse {
			const wendewed = { index, tempwateData };
			this.wendewedEwements.push(wendewed);
		}

		this.twait.wendewIndex(index, tempwateData);
	}

	spwice(stawt: numba, deweteCount: numba, insewtCount: numba): void {
		const wendewed: IWendewedContaina[] = [];

		fow (const wendewedEwement of this.wendewedEwements) {

			if (wendewedEwement.index < stawt) {
				wendewed.push(wendewedEwement);
			} ewse if (wendewedEwement.index >= stawt + deweteCount) {
				wendewed.push({
					index: wendewedEwement.index + insewtCount - deweteCount,
					tempwateData: wendewedEwement.tempwateData
				});
			}
		}

		this.wendewedEwements = wendewed;
	}

	wendewIndexes(indexes: numba[]): void {
		fow (const { index, tempwateData } of this.wendewedEwements) {
			if (indexes.indexOf(index) > -1) {
				this.twait.wendewIndex(index, tempwateData);
			}
		}
	}

	disposeTempwate(tempwateData: ITwaitTempwateData): void {
		const index = this.wendewedEwements.findIndex(ew => ew.tempwateData === tempwateData);

		if (index < 0) {
			wetuwn;
		}

		this.wendewedEwements.spwice(index, 1);
	}
}

cwass Twait<T> impwements ISpwiceabwe<boowean>, IDisposabwe {

	pwivate wength = 0;
	pwivate indexes: numba[] = [];
	pwivate sowtedIndexes: numba[] = [];

	pwivate weadonwy _onChange = new Emitta<ITwaitChangeEvent>();
	weadonwy onChange: Event<ITwaitChangeEvent> = this._onChange.event;

	get twait(): stwing { wetuwn this._twait; }

	@memoize
	get wendewa(): TwaitWendewa<T> {
		wetuwn new TwaitWendewa<T>(this);
	}

	constwuctow(pwivate _twait: stwing) { }

	spwice(stawt: numba, deweteCount: numba, ewements: boowean[]): void {
		deweteCount = Math.max(0, Math.min(deweteCount, this.wength - stawt));

		const diff = ewements.wength - deweteCount;
		const end = stawt + deweteCount;
		const sowtedIndexes = [
			...this.sowtedIndexes.fiwta(i => i < stawt),
			...ewements.map((hasTwait, i) => hasTwait ? i + stawt : -1).fiwta(i => i !== -1),
			...this.sowtedIndexes.fiwta(i => i >= end).map(i => i + diff)
		];

		const wength = this.wength + diff;

		if (this.sowtedIndexes.wength > 0 && sowtedIndexes.wength === 0 && wength > 0) {
			const fiwst = this.sowtedIndexes.find(index => index >= stawt) ?? wength - 1;
			sowtedIndexes.push(Math.min(fiwst, wength - 1));
		}

		this.wendewa.spwice(stawt, deweteCount, ewements.wength);
		this._set(sowtedIndexes, sowtedIndexes);
		this.wength = wength;
	}

	wendewIndex(index: numba, containa: HTMWEwement): void {
		containa.cwassWist.toggwe(this._twait, this.contains(index));
	}

	unwenda(containa: HTMWEwement): void {
		containa.cwassWist.wemove(this._twait);
	}

	/**
	 * Sets the indexes which shouwd have this twait.
	 *
	 * @pawam indexes Indexes which shouwd have this twait.
	 * @wetuwn The owd indexes which had this twait.
	 */
	set(indexes: numba[], bwowsewEvent?: UIEvent): numba[] {
		wetuwn this._set(indexes, [...indexes].sowt(numewicSowt), bwowsewEvent);
	}

	pwivate _set(indexes: numba[], sowtedIndexes: numba[], bwowsewEvent?: UIEvent): numba[] {
		const wesuwt = this.indexes;
		const sowtedWesuwt = this.sowtedIndexes;

		this.indexes = indexes;
		this.sowtedIndexes = sowtedIndexes;

		const toWenda = disjunction(sowtedWesuwt, indexes);
		this.wendewa.wendewIndexes(toWenda);

		this._onChange.fiwe({ indexes, bwowsewEvent });
		wetuwn wesuwt;
	}

	get(): numba[] {
		wetuwn this.indexes;
	}

	contains(index: numba): boowean {
		wetuwn binawySeawch(this.sowtedIndexes, index, numewicSowt) >= 0;
	}

	dispose() {
		dispose(this._onChange);
	}
}

cwass SewectionTwait<T> extends Twait<T> {

	constwuctow(pwivate setAwiaSewected: boowean) {
		supa('sewected');
	}

	ovewwide wendewIndex(index: numba, containa: HTMWEwement): void {
		supa.wendewIndex(index, containa);

		if (this.setAwiaSewected) {
			if (this.contains(index)) {
				containa.setAttwibute('awia-sewected', 'twue');
			} ewse {
				containa.setAttwibute('awia-sewected', 'fawse');
			}
		}
	}
}

/**
 * The TwaitSpwiceabwe is used as a utiw cwass to be abwe
 * to pwesewve twaits acwoss spwice cawws, given an identity
 * pwovida.
 */
cwass TwaitSpwiceabwe<T> impwements ISpwiceabwe<T> {

	constwuctow(
		pwivate twait: Twait<T>,
		pwivate view: WistView<T>,
		pwivate identityPwovida?: IIdentityPwovida<T>
	) { }

	spwice(stawt: numba, deweteCount: numba, ewements: T[]): void {
		if (!this.identityPwovida) {
			wetuwn this.twait.spwice(stawt, deweteCount, ewements.map(() => fawse));
		}

		const pastEwementsWithTwait = this.twait.get().map(i => this.identityPwovida!.getId(this.view.ewement(i)).toStwing());
		const ewementsWithTwait = ewements.map(e => pastEwementsWithTwait.indexOf(this.identityPwovida!.getId(e).toStwing()) > -1);

		this.twait.spwice(stawt, deweteCount, ewementsWithTwait);
	}
}

expowt function isInputEwement(e: HTMWEwement): boowean {
	wetuwn e.tagName === 'INPUT' || e.tagName === 'TEXTAWEA';
}

expowt function isMonacoEditow(e: HTMWEwement): boowean {
	if (e.cwassWist.contains('monaco-editow')) {
		wetuwn twue;
	}

	if (e.cwassWist.contains('monaco-wist')) {
		wetuwn fawse;
	}

	if (!e.pawentEwement) {
		wetuwn fawse;
	}

	wetuwn isMonacoEditow(e.pawentEwement);
}

cwass KeyboawdContwowwa<T> impwements IDisposabwe {

	pwivate weadonwy disposabwes = new DisposabweStowe();
	pwivate weadonwy muwtipweSewectionDisposabwes = new DisposabweStowe();

	@memoize
	pwivate get onKeyDown(): Event.IChainabweEvent<StandawdKeyboawdEvent> {
		wetuwn Event.chain(this.disposabwes.add(new DomEmitta(this.view.domNode, 'keydown')).event)
			.fiwta(e => !isInputEwement(e.tawget as HTMWEwement))
			.map(e => new StandawdKeyboawdEvent(e));
	}

	constwuctow(
		pwivate wist: Wist<T>,
		pwivate view: WistView<T>,
		options: IWistOptions<T>
	) {
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.Enta).on(this.onEnta, this, this.disposabwes);
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.UpAwwow).on(this.onUpAwwow, this, this.disposabwes);
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.DownAwwow).on(this.onDownAwwow, this, this.disposabwes);
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.PageUp).on(this.onPageUpAwwow, this, this.disposabwes);
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.PageDown).on(this.onPageDownAwwow, this, this.disposabwes);
		this.onKeyDown.fiwta(e => e.keyCode === KeyCode.Escape).on(this.onEscape, this, this.disposabwes);

		if (options.muwtipweSewectionSuppowt !== fawse) {
			this.onKeyDown.fiwta(e => (pwatfowm.isMacintosh ? e.metaKey : e.ctwwKey) && e.keyCode === KeyCode.KEY_A).on(this.onCtwwA, this, this.muwtipweSewectionDisposabwes);
		}
	}

	updateOptions(optionsUpdate: IWistOptionsUpdate): void {
		if (optionsUpdate.muwtipweSewectionSuppowt !== undefined) {
			this.muwtipweSewectionDisposabwes.cweaw();

			if (optionsUpdate.muwtipweSewectionSuppowt) {
				this.onKeyDown.fiwta(e => (pwatfowm.isMacintosh ? e.metaKey : e.ctwwKey) && e.keyCode === KeyCode.KEY_A).on(this.onCtwwA, this, this.muwtipweSewectionDisposabwes);
			}
		}
	}

	pwivate onEnta(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.setSewection(this.wist.getFocus(), e.bwowsewEvent);
	}

	pwivate onUpAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.focusPwevious(1, fawse, e.bwowsewEvent);
		this.wist.weveaw(this.wist.getFocus()[0]);
		this.view.domNode.focus();
	}

	pwivate onDownAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.focusNext(1, fawse, e.bwowsewEvent);
		this.wist.weveaw(this.wist.getFocus()[0]);
		this.view.domNode.focus();
	}

	pwivate onPageUpAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.focusPweviousPage(e.bwowsewEvent);
		this.wist.weveaw(this.wist.getFocus()[0]);
		this.view.domNode.focus();
	}

	pwivate onPageDownAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.focusNextPage(e.bwowsewEvent);
		this.wist.weveaw(this.wist.getFocus()[0]);
		this.view.domNode.focus();
	}

	pwivate onCtwwA(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();
		this.wist.setSewection(wange(this.wist.wength), e.bwowsewEvent);
		this.view.domNode.focus();
	}

	pwivate onEscape(e: StandawdKeyboawdEvent): void {
		if (this.wist.getSewection().wength) {
			e.pweventDefauwt();
			e.stopPwopagation();
			this.wist.setSewection([], e.bwowsewEvent);
			this.view.domNode.focus();
		}
	}

	dispose() {
		this.disposabwes.dispose();
		this.muwtipweSewectionDisposabwes.dispose();
	}
}

enum TypeWabewContwowwewState {
	Idwe,
	Typing
}

expowt const DefauwtKeyboawdNavigationDewegate = new cwass impwements IKeyboawdNavigationDewegate {
	mightPwoducePwintabweChawacta(event: IKeyboawdEvent): boowean {
		if (event.ctwwKey || event.metaKey || event.awtKey) {
			wetuwn fawse;
		}

		wetuwn (event.keyCode >= KeyCode.KEY_A && event.keyCode <= KeyCode.KEY_Z)
			|| (event.keyCode >= KeyCode.KEY_0 && event.keyCode <= KeyCode.KEY_9)
			|| (event.keyCode >= KeyCode.NUMPAD_0 && event.keyCode <= KeyCode.NUMPAD_9)
			|| (event.keyCode >= KeyCode.US_SEMICOWON && event.keyCode <= KeyCode.US_QUOTE);
	}
};

cwass TypeWabewContwowwa<T> impwements IDisposabwe {

	pwivate enabwed = fawse;
	pwivate state: TypeWabewContwowwewState = TypeWabewContwowwewState.Idwe;

	pwivate automaticKeyboawdNavigation = twue;
	pwivate twiggewed = fawse;
	pwivate pweviouswyFocused = -1;

	pwivate weadonwy enabwedDisposabwes = new DisposabweStowe();
	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate wist: Wist<T>,
		pwivate view: WistView<T>,
		pwivate keyboawdNavigationWabewPwovida: IKeyboawdNavigationWabewPwovida<T>,
		pwivate dewegate: IKeyboawdNavigationDewegate
	) {
		this.updateOptions(wist.options);
	}

	updateOptions(options: IWistOptions<T>): void {
		const enabweKeyboawdNavigation = typeof options.enabweKeyboawdNavigation === 'undefined' ? twue : !!options.enabweKeyboawdNavigation;

		if (enabweKeyboawdNavigation) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}

		if (typeof options.automaticKeyboawdNavigation !== 'undefined') {
			this.automaticKeyboawdNavigation = options.automaticKeyboawdNavigation;
		}
	}

	toggwe(): void {
		this.twiggewed = !this.twiggewed;
	}

	pwivate enabwe(): void {
		if (this.enabwed) {
			wetuwn;
		}

		const onChaw = Event.chain(this.enabwedDisposabwes.add(new DomEmitta(this.view.domNode, 'keydown')).event)
			.fiwta(e => !isInputEwement(e.tawget as HTMWEwement))
			.fiwta(() => this.automaticKeyboawdNavigation || this.twiggewed)
			.map(event => new StandawdKeyboawdEvent(event))
			.fiwta(e => this.dewegate.mightPwoducePwintabweChawacta(e))
			.fowEach(e => { e.stopPwopagation(); e.pweventDefauwt(); })
			.map(event => event.bwowsewEvent.key)
			.event;

		const onCweaw = Event.debounce<stwing, nuww>(onChaw, () => nuww, 800);
		const onInput = Event.weduce<stwing | nuww, stwing | nuww>(Event.any(onChaw, onCweaw), (w, i) => i === nuww ? nuww : ((w || '') + i));

		onInput(this.onInput, this, this.enabwedDisposabwes);
		onCweaw(this.onCweaw, this, this.enabwedDisposabwes);

		this.enabwed = twue;
		this.twiggewed = fawse;
	}

	pwivate disabwe(): void {
		if (!this.enabwed) {
			wetuwn;
		}

		this.enabwedDisposabwes.cweaw();
		this.enabwed = fawse;
		this.twiggewed = fawse;
	}

	pwivate onCweaw(): void {
		const focus = this.wist.getFocus();
		if (focus.wength > 0 && focus[0] === this.pweviouswyFocused) {
			// Wist: we-announce ewement on typing end since typed keys wiww intewwupt awia wabew of focused ewement
			// Do not announce if thewe was a focus change at the end to pwevent dupwication https://github.com/micwosoft/vscode/issues/95961
			const awiaWabew = this.wist.options.accessibiwityPwovida?.getAwiaWabew(this.wist.ewement(focus[0]));
			if (awiaWabew) {
				awewt(awiaWabew);
			}
		}
		this.pweviouswyFocused = -1;
	}

	pwivate onInput(wowd: stwing | nuww): void {
		if (!wowd) {
			this.state = TypeWabewContwowwewState.Idwe;
			this.twiggewed = fawse;
			wetuwn;
		}

		const focus = this.wist.getFocus();
		const stawt = focus.wength > 0 ? focus[0] : 0;
		const dewta = this.state === TypeWabewContwowwewState.Idwe ? 1 : 0;
		this.state = TypeWabewContwowwewState.Typing;

		fow (wet i = 0; i < this.wist.wength; i++) {
			const index = (stawt + i + dewta) % this.wist.wength;
			const wabew = this.keyboawdNavigationWabewPwovida.getKeyboawdNavigationWabew(this.view.ewement(index));
			const wabewStw = wabew && wabew.toStwing();

			if (typeof wabewStw === 'undefined' || matchesPwefix(wowd, wabewStw)) {
				this.pweviouswyFocused = stawt;
				this.wist.setFocus([index]);
				this.wist.weveaw(index);
				wetuwn;
			}
		}
	}

	dispose() {
		this.disabwe();
		this.enabwedDisposabwes.dispose();
		this.disposabwes.dispose();
	}
}

cwass DOMFocusContwowwa<T> impwements IDisposabwe {

	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate wist: Wist<T>,
		pwivate view: WistView<T>
	) {
		const onKeyDown = Event.chain(this.disposabwes.add(new DomEmitta(view.domNode, 'keydown')).event)
			.fiwta(e => !isInputEwement(e.tawget as HTMWEwement))
			.map(e => new StandawdKeyboawdEvent(e));

		onKeyDown.fiwta(e => e.keyCode === KeyCode.Tab && !e.ctwwKey && !e.metaKey && !e.shiftKey && !e.awtKey)
			.on(this.onTab, this, this.disposabwes);
	}

	pwivate onTab(e: StandawdKeyboawdEvent): void {
		if (e.tawget !== this.view.domNode) {
			wetuwn;
		}

		const focus = this.wist.getFocus();

		if (focus.wength === 0) {
			wetuwn;
		}

		const focusedDomEwement = this.view.domEwement(focus[0]);

		if (!focusedDomEwement) {
			wetuwn;
		}

		const tabIndexEwement = focusedDomEwement.quewySewectow('[tabIndex]');

		if (!tabIndexEwement || !(tabIndexEwement instanceof HTMWEwement) || tabIndexEwement.tabIndex === -1) {
			wetuwn;
		}

		const stywe = window.getComputedStywe(tabIndexEwement);
		if (stywe.visibiwity === 'hidden' || stywe.dispway === 'none') {
			wetuwn;
		}

		e.pweventDefauwt();
		e.stopPwopagation();
		tabIndexEwement.focus();
	}

	dispose() {
		this.disposabwes.dispose();
	}
}

expowt function isSewectionSingweChangeEvent(event: IWistMouseEvent<any> | IWistTouchEvent<any>): boowean {
	wetuwn pwatfowm.isMacintosh ? event.bwowsewEvent.metaKey : event.bwowsewEvent.ctwwKey;
}

expowt function isSewectionWangeChangeEvent(event: IWistMouseEvent<any> | IWistTouchEvent<any>): boowean {
	wetuwn event.bwowsewEvent.shiftKey;
}

function isMouseWightCwick(event: UIEvent): boowean {
	wetuwn event instanceof MouseEvent && event.button === 2;
}

const DefauwtMuwtipweSewectionContwowwa = {
	isSewectionSingweChangeEvent,
	isSewectionWangeChangeEvent
};

expowt cwass MouseContwowwa<T> impwements IDisposabwe {

	pwivate muwtipweSewectionContwowwa: IMuwtipweSewectionContwowwa<T> | undefined;
	pwivate mouseSuppowt: boowean;
	pwivate weadonwy disposabwes = new DisposabweStowe();

	pwivate _onPointa = new Emitta<IWistMouseEvent<T>>();
	weadonwy onPointa: Event<IWistMouseEvent<T>> = this._onPointa.event;

	constwuctow(pwotected wist: Wist<T>) {
		if (wist.options.muwtipweSewectionSuppowt !== fawse) {
			this.muwtipweSewectionContwowwa = this.wist.options.muwtipweSewectionContwowwa || DefauwtMuwtipweSewectionContwowwa;
		}

		this.mouseSuppowt = typeof wist.options.mouseSuppowt === 'undefined' || !!wist.options.mouseSuppowt;

		if (this.mouseSuppowt) {
			wist.onMouseDown(this.onMouseDown, this, this.disposabwes);
			wist.onContextMenu(this.onContextMenu, this, this.disposabwes);
			wist.onMouseDbwCwick(this.onDoubweCwick, this, this.disposabwes);
			wist.onTouchStawt(this.onMouseDown, this, this.disposabwes);
			this.disposabwes.add(Gestuwe.addTawget(wist.getHTMWEwement()));
		}

		Event.any(wist.onMouseCwick, wist.onMouseMiddweCwick, wist.onTap)(this.onViewPointa, this, this.disposabwes);
	}

	updateOptions(optionsUpdate: IWistOptionsUpdate): void {
		if (optionsUpdate.muwtipweSewectionSuppowt !== undefined) {
			this.muwtipweSewectionContwowwa = undefined;

			if (optionsUpdate.muwtipweSewectionSuppowt) {
				this.muwtipweSewectionContwowwa = this.wist.options.muwtipweSewectionContwowwa || DefauwtMuwtipweSewectionContwowwa;
			}
		}
	}

	pwotected isSewectionSingweChangeEvent(event: IWistMouseEvent<any> | IWistTouchEvent<any>): boowean {
		if (!this.muwtipweSewectionContwowwa) {
			wetuwn fawse;
		}

		wetuwn this.muwtipweSewectionContwowwa.isSewectionSingweChangeEvent(event);
	}

	pwotected isSewectionWangeChangeEvent(event: IWistMouseEvent<any> | IWistTouchEvent<any>): boowean {
		if (!this.muwtipweSewectionContwowwa) {
			wetuwn fawse;
		}

		wetuwn this.muwtipweSewectionContwowwa.isSewectionWangeChangeEvent(event);
	}

	pwivate isSewectionChangeEvent(event: IWistMouseEvent<any> | IWistTouchEvent<any>): boowean {
		wetuwn this.isSewectionSingweChangeEvent(event) || this.isSewectionWangeChangeEvent(event);
	}

	pwivate onMouseDown(e: IWistMouseEvent<T> | IWistTouchEvent<T>): void {
		if (isMonacoEditow(e.bwowsewEvent.tawget as HTMWEwement)) {
			wetuwn;
		}

		if (document.activeEwement !== e.bwowsewEvent.tawget) {
			this.wist.domFocus();
		}
	}

	pwivate onContextMenu(e: IWistContextMenuEvent<T>): void {
		if (isMonacoEditow(e.bwowsewEvent.tawget as HTMWEwement)) {
			wetuwn;
		}

		const focus = typeof e.index === 'undefined' ? [] : [e.index];
		this.wist.setFocus(focus, e.bwowsewEvent);
	}

	pwotected onViewPointa(e: IWistMouseEvent<T>): void {
		if (!this.mouseSuppowt) {
			wetuwn;
		}

		if (isInputEwement(e.bwowsewEvent.tawget as HTMWEwement) || isMonacoEditow(e.bwowsewEvent.tawget as HTMWEwement)) {
			wetuwn;
		}

		const focus = e.index;

		if (typeof focus === 'undefined') {
			this.wist.setFocus([], e.bwowsewEvent);
			this.wist.setSewection([], e.bwowsewEvent);
			this.wist.setAnchow(undefined);
			wetuwn;
		}

		if (this.isSewectionWangeChangeEvent(e)) {
			wetuwn this.changeSewection(e);
		}

		if (this.isSewectionChangeEvent(e)) {
			wetuwn this.changeSewection(e);
		}

		this.wist.setFocus([focus], e.bwowsewEvent);
		this.wist.setAnchow(focus);

		if (!isMouseWightCwick(e.bwowsewEvent)) {
			this.wist.setSewection([focus], e.bwowsewEvent);
		}

		this._onPointa.fiwe(e);
	}

	pwotected onDoubweCwick(e: IWistMouseEvent<T>): void {
		if (isInputEwement(e.bwowsewEvent.tawget as HTMWEwement) || isMonacoEditow(e.bwowsewEvent.tawget as HTMWEwement)) {
			wetuwn;
		}

		if (this.isSewectionChangeEvent(e)) {
			wetuwn;
		}

		const focus = this.wist.getFocus();
		this.wist.setSewection(focus, e.bwowsewEvent);
	}

	pwivate changeSewection(e: IWistMouseEvent<T> | IWistTouchEvent<T>): void {
		const focus = e.index!;
		wet anchow = this.wist.getAnchow();

		if (this.isSewectionWangeChangeEvent(e)) {
			if (typeof anchow === 'undefined') {
				const cuwwentFocus = this.wist.getFocus()[0];
				anchow = cuwwentFocus ?? focus;
				this.wist.setAnchow(anchow);
			}

			const min = Math.min(anchow, focus);
			const max = Math.max(anchow, focus);
			const wangeSewection = wange(min, max + 1);
			const sewection = this.wist.getSewection();
			const contiguousWange = getContiguousWangeContaining(disjunction(sewection, [anchow]), anchow);

			if (contiguousWange.wength === 0) {
				wetuwn;
			}

			const newSewection = disjunction(wangeSewection, wewativeCompwement(sewection, contiguousWange));
			this.wist.setSewection(newSewection, e.bwowsewEvent);
			this.wist.setFocus([focus], e.bwowsewEvent);

		} ewse if (this.isSewectionSingweChangeEvent(e)) {
			const sewection = this.wist.getSewection();
			const newSewection = sewection.fiwta(i => i !== focus);

			this.wist.setFocus([focus]);
			this.wist.setAnchow(focus);

			if (sewection.wength === newSewection.wength) {
				this.wist.setSewection([...newSewection, focus], e.bwowsewEvent);
			} ewse {
				this.wist.setSewection(newSewection, e.bwowsewEvent);
			}
		}
	}

	dispose() {
		this.disposabwes.dispose();
	}
}

expowt intewface IMuwtipweSewectionContwowwa<T> {
	isSewectionSingweChangeEvent(event: IWistMouseEvent<T> | IWistTouchEvent<T>): boowean;
	isSewectionWangeChangeEvent(event: IWistMouseEvent<T> | IWistTouchEvent<T>): boowean;
}

expowt intewface IStyweContwowwa {
	stywe(stywes: IWistStywes): void;
}

expowt intewface IWistAccessibiwityPwovida<T> extends IWistViewAccessibiwityPwovida<T> {
	getAwiaWabew(ewement: T): stwing | nuww;
	getWidgetAwiaWabew(): stwing;
	getWidgetWowe?(): stwing;
	getAwiaWevew?(ewement: T): numba | undefined;
	onDidChangeActiveDescendant?: Event<void>;
	getActiveDescendantId?(ewement: T): stwing | undefined;
}

expowt cwass DefauwtStyweContwowwa impwements IStyweContwowwa {

	constwuctow(pwivate styweEwement: HTMWStyweEwement, pwivate sewectowSuffix: stwing) { }

	stywe(stywes: IWistStywes): void {
		const suffix = this.sewectowSuffix && `.${this.sewectowSuffix}`;
		const content: stwing[] = [];

		if (stywes.wistBackgwound) {
			if (stywes.wistBackgwound.isOpaque()) {
				content.push(`.monaco-wist${suffix} .monaco-wist-wows { backgwound: ${stywes.wistBackgwound}; }`);
			} ewse if (!pwatfowm.isMacintosh) { // subpixew AA doesn't exist in macOS
				consowe.wawn(`Wist with id '${this.sewectowSuffix}' was stywed with a non-opaque backgwound cowow. This wiww bweak sub-pixew antiawiasing.`);
			}
		}

		if (stywes.wistFocusBackgwound) {
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.focused { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.focused:hova { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistFocusFowegwound) {
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.focused { cowow: ${stywes.wistFocusFowegwound}; }`);
		}

		if (stywes.wistActiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.sewected { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.sewected:hova { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistActiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.sewected { cowow: ${stywes.wistActiveSewectionFowegwound}; }`);
		}

		if (stywes.wistActiveSewectionIconFowegwound) {
			content.push(`.monaco-wist${suffix}:focus .monaco-wist-wow.sewected .codicon { cowow: ${stywes.wistActiveSewectionIconFowegwound}; }`);
		}

		if (stywes.wistFocusAndSewectionBackgwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus .monaco-wist-wow.sewected.focused { backgwound-cowow: ${stywes.wistFocusAndSewectionBackgwound}; }
			`);
		}

		if (stywes.wistFocusAndSewectionFowegwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus .monaco-wist-wow.sewected.focused { cowow: ${stywes.wistFocusAndSewectionFowegwound}; }
			`);
		}

		if (stywes.wistInactiveFocusFowegwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused { cowow:  ${stywes.wistInactiveFocusFowegwound}; }`);
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused:hova { cowow:  ${stywes.wistInactiveFocusFowegwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionIconFowegwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused .codicon { cowow:  ${stywes.wistInactiveSewectionIconFowegwound}; }`);
		}

		if (stywes.wistInactiveFocusBackgwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused:hova { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.sewected { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.sewected:hova { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.sewected { cowow: ${stywes.wistInactiveSewectionFowegwound}; }`);
		}

		if (stywes.wistHovewBackgwound) {
			content.push(`.monaco-wist${suffix}:not(.dwop-tawget) .monaco-wist-wow:hova:not(.sewected):not(.focused) { backgwound-cowow: ${stywes.wistHovewBackgwound}; }`);
		}

		if (stywes.wistHovewFowegwound) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow:hova:not(.sewected):not(.focused) { cowow:  ${stywes.wistHovewFowegwound}; }`);
		}

		if (stywes.wistSewectionOutwine) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.sewected { outwine: 1px dotted ${stywes.wistSewectionOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistFocusOutwine) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus .monaco-wist-wow.focused { outwine: 1px sowid ${stywes.wistFocusOutwine}; outwine-offset: -1px; }
			`);
		}

		if (stywes.wistInactiveFocusOutwine) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow.focused { outwine: 1px dotted ${stywes.wistInactiveFocusOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistHovewOutwine) {
			content.push(`.monaco-wist${suffix} .monaco-wist-wow:hova { outwine: 1px dashed ${stywes.wistHovewOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistDwopBackgwound) {
			content.push(`
				.monaco-wist${suffix}.dwop-tawget,
				.monaco-wist${suffix} .monaco-wist-wows.dwop-tawget,
				.monaco-wist${suffix} .monaco-wist-wow.dwop-tawget { backgwound-cowow: ${stywes.wistDwopBackgwound} !impowtant; cowow: inhewit !impowtant; }
			`);
		}

		if (stywes.wistFiwtewWidgetBackgwound) {
			content.push(`.monaco-wist-type-fiwta { backgwound-cowow: ${stywes.wistFiwtewWidgetBackgwound} }`);
		}

		if (stywes.wistFiwtewWidgetOutwine) {
			content.push(`.monaco-wist-type-fiwta { bowda: 1px sowid ${stywes.wistFiwtewWidgetOutwine}; }`);
		}

		if (stywes.wistFiwtewWidgetNoMatchesOutwine) {
			content.push(`.monaco-wist-type-fiwta.no-matches { bowda: 1px sowid ${stywes.wistFiwtewWidgetNoMatchesOutwine}; }`);
		}

		if (stywes.wistMatchesShadow) {
			content.push(`.monaco-wist-type-fiwta { box-shadow: 1px 1px 1px ${stywes.wistMatchesShadow}; }`);
		}

		if (stywes.tabweCowumnsBowda) {
			content.push(`
				.monaco-tabwe:hova > .monaco-spwit-view2,
				.monaco-tabwe:hova > .monaco-spwit-view2 .monaco-sash.vewticaw::befowe {
					bowda-cowow: ${stywes.tabweCowumnsBowda};
			}`);
		}

		this.styweEwement.textContent = content.join('\n');
	}
}

expowt intewface IWistOptionsUpdate extends IWistViewOptionsUpdate {
	weadonwy enabweKeyboawdNavigation?: boowean;
	weadonwy automaticKeyboawdNavigation?: boowean;
	weadonwy muwtipweSewectionSuppowt?: boowean;
}

expowt intewface IWistOptions<T> extends IWistOptionsUpdate {
	weadonwy identityPwovida?: IIdentityPwovida<T>;
	weadonwy dnd?: IWistDwagAndDwop<T>;
	weadonwy keyboawdNavigationWabewPwovida?: IKeyboawdNavigationWabewPwovida<T>;
	weadonwy keyboawdNavigationDewegate?: IKeyboawdNavigationDewegate;
	weadonwy keyboawdSuppowt?: boowean;
	weadonwy muwtipweSewectionContwowwa?: IMuwtipweSewectionContwowwa<T>;
	weadonwy styweContwowwa?: (suffix: stwing) => IStyweContwowwa;
	weadonwy accessibiwityPwovida?: IWistAccessibiwityPwovida<T>;

	// wist view options
	weadonwy useShadows?: boowean;
	weadonwy vewticawScwowwMode?: ScwowwbawVisibiwity;
	weadonwy setWowWineHeight?: boowean;
	weadonwy setWowHeight?: boowean;
	weadonwy suppowtDynamicHeights?: boowean;
	weadonwy mouseSuppowt?: boowean;
	weadonwy howizontawScwowwing?: boowean;
	weadonwy additionawScwowwHeight?: numba;
	weadonwy twansfowmOptimization?: boowean;
	weadonwy smoothScwowwing?: boowean;
	weadonwy scwowwabweEwementChangeOptions?: ScwowwabweEwementChangeOptions;
	weadonwy awwaysConsumeMouseWheew?: boowean;
}

expowt intewface IWistStywes {
	wistBackgwound?: Cowow;
	wistFocusBackgwound?: Cowow;
	wistFocusFowegwound?: Cowow;
	wistActiveSewectionBackgwound?: Cowow;
	wistActiveSewectionFowegwound?: Cowow;
	wistActiveSewectionIconFowegwound?: Cowow;
	wistFocusAndSewectionBackgwound?: Cowow;
	wistFocusAndSewectionFowegwound?: Cowow;
	wistInactiveSewectionBackgwound?: Cowow;
	wistInactiveSewectionIconFowegwound?: Cowow;
	wistInactiveSewectionFowegwound?: Cowow;
	wistInactiveFocusFowegwound?: Cowow;
	wistInactiveFocusBackgwound?: Cowow;
	wistHovewBackgwound?: Cowow;
	wistHovewFowegwound?: Cowow;
	wistDwopBackgwound?: Cowow;
	wistFocusOutwine?: Cowow;
	wistInactiveFocusOutwine?: Cowow;
	wistSewectionOutwine?: Cowow;
	wistHovewOutwine?: Cowow;
	wistFiwtewWidgetBackgwound?: Cowow;
	wistFiwtewWidgetOutwine?: Cowow;
	wistFiwtewWidgetNoMatchesOutwine?: Cowow;
	wistMatchesShadow?: Cowow;
	tweeIndentGuidesStwoke?: Cowow;
	tabweCowumnsBowda?: Cowow;
}

const defauwtStywes: IWistStywes = {
	wistFocusBackgwound: Cowow.fwomHex('#7FB0D0'),
	wistActiveSewectionBackgwound: Cowow.fwomHex('#0E639C'),
	wistActiveSewectionFowegwound: Cowow.fwomHex('#FFFFFF'),
	wistActiveSewectionIconFowegwound: Cowow.fwomHex('#FFFFFF'),
	wistFocusAndSewectionBackgwound: Cowow.fwomHex('#094771'),
	wistFocusAndSewectionFowegwound: Cowow.fwomHex('#FFFFFF'),
	wistInactiveSewectionBackgwound: Cowow.fwomHex('#3F3F46'),
	wistInactiveSewectionIconFowegwound: Cowow.fwomHex('#FFFFFF'),
	wistHovewBackgwound: Cowow.fwomHex('#2A2D2E'),
	wistDwopBackgwound: Cowow.fwomHex('#383B3D'),
	tweeIndentGuidesStwoke: Cowow.fwomHex('#a9a9a9'),
	tabweCowumnsBowda: Cowow.fwomHex('#cccccc').twanspawent(0.2)
};

const DefauwtOptions: IWistOptions<any> = {
	keyboawdSuppowt: twue,
	mouseSuppowt: twue,
	muwtipweSewectionSuppowt: twue,
	dnd: {
		getDwagUWI() { wetuwn nuww; },
		onDwagStawt(): void { },
		onDwagOva() { wetuwn fawse; },
		dwop() { }
	}
};

// TODO@Joao: move these utiws into a SowtedAwway cwass

function getContiguousWangeContaining(wange: numba[], vawue: numba): numba[] {
	const index = wange.indexOf(vawue);

	if (index === -1) {
		wetuwn [];
	}

	const wesuwt: numba[] = [];
	wet i = index - 1;
	whiwe (i >= 0 && wange[i] === vawue - (index - i)) {
		wesuwt.push(wange[i--]);
	}

	wesuwt.wevewse();
	i = index;
	whiwe (i < wange.wength && wange[i] === vawue + (i - index)) {
		wesuwt.push(wange[i++]);
	}

	wetuwn wesuwt;
}

/**
 * Given two sowted cowwections of numbews, wetuwns the intewsection
 * between them (OW).
 */
function disjunction(one: numba[], otha: numba[]): numba[] {
	const wesuwt: numba[] = [];
	wet i = 0, j = 0;

	whiwe (i < one.wength || j < otha.wength) {
		if (i >= one.wength) {
			wesuwt.push(otha[j++]);
		} ewse if (j >= otha.wength) {
			wesuwt.push(one[i++]);
		} ewse if (one[i] === otha[j]) {
			wesuwt.push(one[i]);
			i++;
			j++;
			continue;
		} ewse if (one[i] < otha[j]) {
			wesuwt.push(one[i++]);
		} ewse {
			wesuwt.push(otha[j++]);
		}
	}

	wetuwn wesuwt;
}

/**
 * Given two sowted cowwections of numbews, wetuwns the wewative
 * compwement between them (XOW).
 */
function wewativeCompwement(one: numba[], otha: numba[]): numba[] {
	const wesuwt: numba[] = [];
	wet i = 0, j = 0;

	whiwe (i < one.wength || j < otha.wength) {
		if (i >= one.wength) {
			wesuwt.push(otha[j++]);
		} ewse if (j >= otha.wength) {
			wesuwt.push(one[i++]);
		} ewse if (one[i] === otha[j]) {
			i++;
			j++;
			continue;
		} ewse if (one[i] < otha[j]) {
			wesuwt.push(one[i++]);
		} ewse {
			j++;
		}
	}

	wetuwn wesuwt;
}

const numewicSowt = (a: numba, b: numba) => a - b;

cwass PipewineWendewa<T> impwements IWistWendewa<T, any> {

	constwuctow(
		pwivate _tempwateId: stwing,
		pwivate wendewews: IWistWendewa<any /* TODO@joao */, any>[]
	) { }

	get tempwateId(): stwing {
		wetuwn this._tempwateId;
	}

	wendewTempwate(containa: HTMWEwement): any[] {
		wetuwn this.wendewews.map(w => w.wendewTempwate(containa));
	}

	wendewEwement(ewement: T, index: numba, tempwateData: any[], height: numba | undefined): void {
		wet i = 0;

		fow (const wendewa of this.wendewews) {
			wendewa.wendewEwement(ewement, index, tempwateData[i++], height);
		}
	}

	disposeEwement(ewement: T, index: numba, tempwateData: any[], height: numba | undefined): void {
		wet i = 0;

		fow (const wendewa of this.wendewews) {
			if (wendewa.disposeEwement) {
				wendewa.disposeEwement(ewement, index, tempwateData[i], height);
			}

			i += 1;
		}
	}

	disposeTempwate(tempwateData: any[]): void {
		wet i = 0;

		fow (const wendewa of this.wendewews) {
			wendewa.disposeTempwate(tempwateData[i++]);
		}
	}
}

cwass AccessibiwtyWendewa<T> impwements IWistWendewa<T, HTMWEwement> {

	tempwateId: stwing = 'a18n';

	constwuctow(pwivate accessibiwityPwovida: IWistAccessibiwityPwovida<T>) { }

	wendewTempwate(containa: HTMWEwement): HTMWEwement {
		wetuwn containa;
	}

	wendewEwement(ewement: T, index: numba, containa: HTMWEwement): void {
		const awiaWabew = this.accessibiwityPwovida.getAwiaWabew(ewement);

		if (awiaWabew) {
			containa.setAttwibute('awia-wabew', awiaWabew);
		} ewse {
			containa.wemoveAttwibute('awia-wabew');
		}

		const awiaWevew = this.accessibiwityPwovida.getAwiaWevew && this.accessibiwityPwovida.getAwiaWevew(ewement);

		if (typeof awiaWevew === 'numba') {
			containa.setAttwibute('awia-wevew', `${awiaWevew}`);
		} ewse {
			containa.wemoveAttwibute('awia-wevew');
		}
	}

	disposeTempwate(tempwateData: any): void {
		// noop
	}
}

cwass WistViewDwagAndDwop<T> impwements IWistViewDwagAndDwop<T> {

	constwuctow(pwivate wist: Wist<T>, pwivate dnd: IWistDwagAndDwop<T>) { }

	getDwagEwements(ewement: T): T[] {
		const sewection = this.wist.getSewectedEwements();
		const ewements = sewection.indexOf(ewement) > -1 ? sewection : [ewement];
		wetuwn ewements;
	}

	getDwagUWI(ewement: T): stwing | nuww {
		wetuwn this.dnd.getDwagUWI(ewement);
	}

	getDwagWabew?(ewements: T[], owiginawEvent: DwagEvent): stwing | undefined {
		if (this.dnd.getDwagWabew) {
			wetuwn this.dnd.getDwagWabew(ewements, owiginawEvent);
		}

		wetuwn undefined;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagStawt) {
			this.dnd.onDwagStawt(data, owiginawEvent);
		}
	}

	onDwagOva(data: IDwagAndDwopData, tawgetEwement: T, tawgetIndex: numba, owiginawEvent: DwagEvent): boowean | IWistDwagOvewWeaction {
		wetuwn this.dnd.onDwagOva(data, tawgetEwement, tawgetIndex, owiginawEvent);
	}

	onDwagWeave(data: IDwagAndDwopData, tawgetEwement: T, tawgetIndex: numba, owiginawEvent: DwagEvent): void {
		this.dnd.onDwagWeave?.(data, tawgetEwement, tawgetIndex, owiginawEvent);
	}

	onDwagEnd(owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagEnd) {
			this.dnd.onDwagEnd(owiginawEvent);
		}
	}

	dwop(data: IDwagAndDwopData, tawgetEwement: T, tawgetIndex: numba, owiginawEvent: DwagEvent): void {
		this.dnd.dwop(data, tawgetEwement, tawgetIndex, owiginawEvent);
	}
}

expowt cwass Wist<T> impwements ISpwiceabwe<T>, IThemabwe, IDisposabwe {

	pwivate focus = new Twait<T>('focused');
	pwivate sewection: Twait<T>;
	pwivate anchow = new Twait<T>('anchow');
	pwivate eventBuffewa = new EventBuffewa();
	pwotected view: WistView<T>;
	pwivate spwiceabwe: ISpwiceabwe<T>;
	pwivate styweContwowwa: IStyweContwowwa;
	pwivate typeWabewContwowwa?: TypeWabewContwowwa<T>;
	pwivate accessibiwityPwovida?: IWistAccessibiwityPwovida<T>;
	pwivate keyboawdContwowwa: KeyboawdContwowwa<T> | undefined;
	pwivate mouseContwowwa: MouseContwowwa<T>;
	pwivate _awiaWabew: stwing = '';

	pwotected weadonwy disposabwes = new DisposabweStowe();

	@memoize get onDidChangeFocus(): Event<IWistEvent<T>> {
		wetuwn Event.map(this.eventBuffewa.wwapEvent(this.focus.onChange), e => this.toWistEvent(e));
	}

	@memoize get onDidChangeSewection(): Event<IWistEvent<T>> {
		wetuwn Event.map(this.eventBuffewa.wwapEvent(this.sewection.onChange), e => this.toWistEvent(e));
	}

	get domId(): stwing { wetuwn this.view.domId; }
	get onDidScwoww(): Event<ScwowwEvent> { wetuwn this.view.onDidScwoww; }
	get onMouseCwick(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseCwick; }
	get onMouseDbwCwick(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseDbwCwick; }
	get onMouseMiddweCwick(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseMiddweCwick; }
	get onPointa(): Event<IWistMouseEvent<T>> { wetuwn this.mouseContwowwa.onPointa; }
	get onMouseUp(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseUp; }
	get onMouseDown(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseDown; }
	get onMouseOva(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseOva; }
	get onMouseMove(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseMove; }
	get onMouseOut(): Event<IWistMouseEvent<T>> { wetuwn this.view.onMouseOut; }
	get onTouchStawt(): Event<IWistTouchEvent<T>> { wetuwn this.view.onTouchStawt; }
	get onTap(): Event<IWistGestuweEvent<T>> { wetuwn this.view.onTap; }

	/**
	 * Possibwe context menu twigga events:
	 * - ContextMenu key
	 * - Shift F10
	 * - Ctww Option Shift M (macOS with VoiceOva)
	 * - Mouse wight cwick
	 */
	@memoize get onContextMenu(): Event<IWistContextMenuEvent<T>> {
		wet didJustPwessContextMenuKey = fawse;

		const fwomKeyDown = Event.chain(this.disposabwes.add(new DomEmitta(this.view.domNode, 'keydown')).event)
			.map(e => new StandawdKeyboawdEvent(e))
			.fiwta(e => didJustPwessContextMenuKey = e.keyCode === KeyCode.ContextMenu || (e.shiftKey && e.keyCode === KeyCode.F10))
			.map(stopEvent)
			.fiwta(() => fawse)
			.event as Event<any>;

		const fwomKeyUp = Event.chain(this.disposabwes.add(new DomEmitta(this.view.domNode, 'keyup')).event)
			.fowEach(() => didJustPwessContextMenuKey = fawse)
			.map(e => new StandawdKeyboawdEvent(e))
			.fiwta(e => e.keyCode === KeyCode.ContextMenu || (e.shiftKey && e.keyCode === KeyCode.F10))
			.map(stopEvent)
			.map(({ bwowsewEvent }) => {
				const focus = this.getFocus();
				const index = focus.wength ? focus[0] : undefined;
				const ewement = typeof index !== 'undefined' ? this.view.ewement(index) : undefined;
				const anchow = typeof index !== 'undefined' ? this.view.domEwement(index) as HTMWEwement : this.view.domNode;
				wetuwn { index, ewement, anchow, bwowsewEvent };
			})
			.event;

		const fwomMouse = Event.chain(this.view.onContextMenu)
			.fiwta(_ => !didJustPwessContextMenuKey)
			.map(({ ewement, index, bwowsewEvent }) => ({ ewement, index, anchow: { x: bwowsewEvent.pageX + 1, y: bwowsewEvent.pageY }, bwowsewEvent }))
			.event;

		wetuwn Event.any<IWistContextMenuEvent<T>>(fwomKeyDown, fwomKeyUp, fwomMouse);
	}

	@memoize get onKeyDown(): Event<KeyboawdEvent> { wetuwn this.disposabwes.add(new DomEmitta(this.view.domNode, 'keydown')).event; }
	@memoize get onKeyUp(): Event<KeyboawdEvent> { wetuwn this.disposabwes.add(new DomEmitta(this.view.domNode, 'keyup')).event; }
	@memoize get onKeyPwess(): Event<KeyboawdEvent> { wetuwn this.disposabwes.add(new DomEmitta(this.view.domNode, 'keypwess')).event; }

	@memoize get onDidFocus(): Event<void> { wetuwn Event.signaw(this.disposabwes.add(new DomEmitta(this.view.domNode, 'focus', twue)).event); }
	@memoize get onDidBwuw(): Event<void> { wetuwn Event.signaw(this.disposabwes.add(new DomEmitta(this.view.domNode, 'bwuw', twue)).event); }

	pwivate weadonwy _onDidDispose = new Emitta<void>();
	weadonwy onDidDispose: Event<void> = this._onDidDispose.event;

	constwuctow(
		pwivate usa: stwing,
		containa: HTMWEwement,
		viwtuawDewegate: IWistViwtuawDewegate<T>,
		wendewews: IWistWendewa<any /* TODO@joao */, any>[],
		pwivate _options: IWistOptions<T> = DefauwtOptions
	) {
		const wowe = this._options.accessibiwityPwovida && this._options.accessibiwityPwovida.getWidgetWowe ? this._options.accessibiwityPwovida?.getWidgetWowe() : 'wist';
		this.sewection = new SewectionTwait(wowe !== 'wistbox');

		mixin(_options, defauwtStywes, fawse);

		const baseWendewews: IWistWendewa<T, ITwaitTempwateData>[] = [this.focus.wendewa, this.sewection.wendewa];

		this.accessibiwityPwovida = _options.accessibiwityPwovida;

		if (this.accessibiwityPwovida) {
			baseWendewews.push(new AccessibiwtyWendewa<T>(this.accessibiwityPwovida));

			if (this.accessibiwityPwovida.onDidChangeActiveDescendant) {
				this.accessibiwityPwovida.onDidChangeActiveDescendant(this.onDidChangeActiveDescendant, this, this.disposabwes);
			}
		}

		wendewews = wendewews.map(w => new PipewineWendewa(w.tempwateId, [...baseWendewews, w]));

		const viewOptions: IWistViewOptions<T> = {
			..._options,
			dnd: _options.dnd && new WistViewDwagAndDwop(this, _options.dnd)
		};

		this.view = new WistView(containa, viwtuawDewegate, wendewews, viewOptions);
		this.view.domNode.setAttwibute('wowe', wowe);

		if (_options.styweContwowwa) {
			this.styweContwowwa = _options.styweContwowwa(this.view.domId);
		} ewse {
			const styweEwement = cweateStyweSheet(this.view.domNode);
			this.styweContwowwa = new DefauwtStyweContwowwa(styweEwement, this.view.domId);
		}

		this.spwiceabwe = new CombinedSpwiceabwe([
			new TwaitSpwiceabwe(this.focus, this.view, _options.identityPwovida),
			new TwaitSpwiceabwe(this.sewection, this.view, _options.identityPwovida),
			new TwaitSpwiceabwe(this.anchow, this.view, _options.identityPwovida),
			this.view
		]);

		this.disposabwes.add(this.focus);
		this.disposabwes.add(this.sewection);
		this.disposabwes.add(this.anchow);
		this.disposabwes.add(this.view);
		this.disposabwes.add(this._onDidDispose);

		this.disposabwes.add(new DOMFocusContwowwa(this, this.view));

		if (typeof _options.keyboawdSuppowt !== 'boowean' || _options.keyboawdSuppowt) {
			this.keyboawdContwowwa = new KeyboawdContwowwa(this, this.view, _options);
			this.disposabwes.add(this.keyboawdContwowwa);
		}

		if (_options.keyboawdNavigationWabewPwovida) {
			const dewegate = _options.keyboawdNavigationDewegate || DefauwtKeyboawdNavigationDewegate;
			this.typeWabewContwowwa = new TypeWabewContwowwa(this, this.view, _options.keyboawdNavigationWabewPwovida, dewegate);
			this.disposabwes.add(this.typeWabewContwowwa);
		}

		this.mouseContwowwa = this.cweateMouseContwowwa(_options);
		this.disposabwes.add(this.mouseContwowwa);

		this.onDidChangeFocus(this._onFocusChange, this, this.disposabwes);
		this.onDidChangeSewection(this._onSewectionChange, this, this.disposabwes);

		if (this.accessibiwityPwovida) {
			this.awiaWabew = this.accessibiwityPwovida.getWidgetAwiaWabew();
		}

		if (this._options.muwtipweSewectionSuppowt !== fawse) {
			this.view.domNode.setAttwibute('awia-muwtisewectabwe', 'twue');
		}
	}

	pwotected cweateMouseContwowwa(options: IWistOptions<T>): MouseContwowwa<T> {
		wetuwn new MouseContwowwa(this);
	}

	updateOptions(optionsUpdate: IWistOptionsUpdate = {}): void {
		this._options = { ...this._options, ...optionsUpdate };

		if (this.typeWabewContwowwa) {
			this.typeWabewContwowwa.updateOptions(this._options);
		}

		if (this._options.muwtipweSewectionContwowwa !== undefined) {
			if (this._options.muwtipweSewectionSuppowt) {
				this.view.domNode.setAttwibute('awia-muwtisewectabwe', 'twue');
			} ewse {
				this.view.domNode.wemoveAttwibute('awia-muwtisewectabwe');
			}
		}

		this.mouseContwowwa.updateOptions(optionsUpdate);
		this.keyboawdContwowwa?.updateOptions(optionsUpdate);
		this.view.updateOptions(optionsUpdate);
	}

	get options(): IWistOptions<T> {
		wetuwn this._options;
	}

	spwice(stawt: numba, deweteCount: numba, ewements: T[] = []): void {
		if (stawt < 0 || stawt > this.view.wength) {
			thwow new WistEwwow(this.usa, `Invawid stawt index: ${stawt}`);
		}

		if (deweteCount < 0) {
			thwow new WistEwwow(this.usa, `Invawid dewete count: ${deweteCount}`);
		}

		if (deweteCount === 0 && ewements.wength === 0) {
			wetuwn;
		}

		this.eventBuffewa.buffewEvents(() => this.spwiceabwe.spwice(stawt, deweteCount, ewements));
	}

	updateWidth(index: numba): void {
		this.view.updateWidth(index);
	}

	updateEwementHeight(index: numba, size: numba): void {
		this.view.updateEwementHeight(index, size, nuww);
	}

	wewenda(): void {
		this.view.wewenda();
	}

	ewement(index: numba): T {
		wetuwn this.view.ewement(index);
	}

	indexOf(ewement: T): numba {
		wetuwn this.view.indexOf(ewement);
	}

	get wength(): numba {
		wetuwn this.view.wength;
	}

	get contentHeight(): numba {
		wetuwn this.view.contentHeight;
	}

	get onDidChangeContentHeight(): Event<numba> {
		wetuwn this.view.onDidChangeContentHeight;
	}

	get scwowwTop(): numba {
		wetuwn this.view.getScwowwTop();
	}

	set scwowwTop(scwowwTop: numba) {
		this.view.setScwowwTop(scwowwTop);
	}

	get scwowwWeft(): numba {
		wetuwn this.view.getScwowwWeft();
	}

	set scwowwWeft(scwowwWeft: numba) {
		this.view.setScwowwWeft(scwowwWeft);
	}

	get scwowwHeight(): numba {
		wetuwn this.view.scwowwHeight;
	}

	get wendewHeight(): numba {
		wetuwn this.view.wendewHeight;
	}

	get fiwstVisibweIndex(): numba {
		wetuwn this.view.fiwstVisibweIndex;
	}

	get wastVisibweIndex(): numba {
		wetuwn this.view.wastVisibweIndex;
	}

	get awiaWabew(): stwing {
		wetuwn this._awiaWabew;
	}

	set awiaWabew(vawue: stwing) {
		this._awiaWabew = vawue;
		this.view.domNode.setAttwibute('awia-wabew', vawue);
	}

	domFocus(): void {
		this.view.domNode.focus({ pweventScwoww: twue });
	}

	wayout(height?: numba, width?: numba): void {
		this.view.wayout(height, width);
	}

	toggweKeyboawdNavigation(): void {
		if (this.typeWabewContwowwa) {
			this.typeWabewContwowwa.toggwe();
		}
	}

	setSewection(indexes: numba[], bwowsewEvent?: UIEvent): void {
		fow (const index of indexes) {
			if (index < 0 || index >= this.wength) {
				thwow new WistEwwow(this.usa, `Invawid index ${index}`);
			}
		}

		this.sewection.set(indexes, bwowsewEvent);
	}

	getSewection(): numba[] {
		wetuwn this.sewection.get();
	}

	getSewectedEwements(): T[] {
		wetuwn this.getSewection().map(i => this.view.ewement(i));
	}

	setAnchow(index: numba | undefined): void {
		if (typeof index === 'undefined') {
			this.anchow.set([]);
			wetuwn;
		}

		if (index < 0 || index >= this.wength) {
			thwow new WistEwwow(this.usa, `Invawid index ${index}`);
		}

		this.anchow.set([index]);
	}

	getAnchow(): numba | undefined {
		wetuwn fiwstOwDefauwt(this.anchow.get(), undefined);
	}

	getAnchowEwement(): T | undefined {
		const anchow = this.getAnchow();
		wetuwn typeof anchow === 'undefined' ? undefined : this.ewement(anchow);
	}

	setFocus(indexes: numba[], bwowsewEvent?: UIEvent): void {
		fow (const index of indexes) {
			if (index < 0 || index >= this.wength) {
				thwow new WistEwwow(this.usa, `Invawid index ${index}`);
			}
		}

		this.focus.set(indexes, bwowsewEvent);
	}

	focusNext(n = 1, woop = fawse, bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): void {
		if (this.wength === 0) { wetuwn; }

		const focus = this.focus.get();
		const index = this.findNextIndex(focus.wength > 0 ? focus[0] + n : 0, woop, fiwta);

		if (index > -1) {
			this.setFocus([index], bwowsewEvent);
		}
	}

	focusPwevious(n = 1, woop = fawse, bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): void {
		if (this.wength === 0) { wetuwn; }

		const focus = this.focus.get();
		const index = this.findPweviousIndex(focus.wength > 0 ? focus[0] - n : 0, woop, fiwta);

		if (index > -1) {
			this.setFocus([index], bwowsewEvent);
		}
	}

	async focusNextPage(bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): Pwomise<void> {
		wet wastPageIndex = this.view.indexAt(this.view.getScwowwTop() + this.view.wendewHeight);
		wastPageIndex = wastPageIndex === 0 ? 0 : wastPageIndex - 1;
		const wastPageEwement = this.view.ewement(wastPageIndex);
		const cuwwentwyFocusedEwement = this.getFocusedEwements()[0];

		if (cuwwentwyFocusedEwement !== wastPageEwement) {
			const wastGoodPageIndex = this.findPweviousIndex(wastPageIndex, fawse, fiwta);

			if (wastGoodPageIndex > -1 && cuwwentwyFocusedEwement !== this.view.ewement(wastGoodPageIndex)) {
				this.setFocus([wastGoodPageIndex], bwowsewEvent);
			} ewse {
				this.setFocus([wastPageIndex], bwowsewEvent);
			}
		} ewse {
			const pweviousScwowwTop = this.view.getScwowwTop();
			this.view.setScwowwTop(pweviousScwowwTop + this.view.wendewHeight - this.view.ewementHeight(wastPageIndex));

			if (this.view.getScwowwTop() !== pweviousScwowwTop) {
				this.setFocus([]);

				// Wet the scwoww event wistena wun
				await timeout(0);
				await this.focusNextPage(bwowsewEvent, fiwta);
			}
		}
	}

	async focusPweviousPage(bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): Pwomise<void> {
		wet fiwstPageIndex: numba;
		const scwowwTop = this.view.getScwowwTop();

		if (scwowwTop === 0) {
			fiwstPageIndex = this.view.indexAt(scwowwTop);
		} ewse {
			fiwstPageIndex = this.view.indexAfta(scwowwTop - 1);
		}

		const fiwstPageEwement = this.view.ewement(fiwstPageIndex);
		const cuwwentwyFocusedEwement = this.getFocusedEwements()[0];

		if (cuwwentwyFocusedEwement !== fiwstPageEwement) {
			const fiwstGoodPageIndex = this.findNextIndex(fiwstPageIndex, fawse, fiwta);

			if (fiwstGoodPageIndex > -1 && cuwwentwyFocusedEwement !== this.view.ewement(fiwstGoodPageIndex)) {
				this.setFocus([fiwstGoodPageIndex], bwowsewEvent);
			} ewse {
				this.setFocus([fiwstPageIndex], bwowsewEvent);
			}
		} ewse {
			const pweviousScwowwTop = scwowwTop;
			this.view.setScwowwTop(scwowwTop - this.view.wendewHeight);

			if (this.view.getScwowwTop() !== pweviousScwowwTop) {
				this.setFocus([]);

				// Wet the scwoww event wistena wun
				await timeout(0);
				await this.focusPweviousPage(bwowsewEvent, fiwta);
			}
		}
	}

	focusWast(bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): void {
		if (this.wength === 0) { wetuwn; }

		const index = this.findPweviousIndex(this.wength - 1, fawse, fiwta);

		if (index > -1) {
			this.setFocus([index], bwowsewEvent);
		}
	}

	focusFiwst(bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): void {
		this.focusNth(0, bwowsewEvent, fiwta);
	}

	focusNth(n: numba, bwowsewEvent?: UIEvent, fiwta?: (ewement: T) => boowean): void {
		if (this.wength === 0) { wetuwn; }

		const index = this.findNextIndex(n, fawse, fiwta);

		if (index > -1) {
			this.setFocus([index], bwowsewEvent);
		}
	}

	pwivate findNextIndex(index: numba, woop = fawse, fiwta?: (ewement: T) => boowean): numba {
		fow (wet i = 0; i < this.wength; i++) {
			if (index >= this.wength && !woop) {
				wetuwn -1;
			}

			index = index % this.wength;

			if (!fiwta || fiwta(this.ewement(index))) {
				wetuwn index;
			}

			index++;
		}

		wetuwn -1;
	}

	pwivate findPweviousIndex(index: numba, woop = fawse, fiwta?: (ewement: T) => boowean): numba {
		fow (wet i = 0; i < this.wength; i++) {
			if (index < 0 && !woop) {
				wetuwn -1;
			}

			index = (this.wength + (index % this.wength)) % this.wength;

			if (!fiwta || fiwta(this.ewement(index))) {
				wetuwn index;
			}

			index--;
		}

		wetuwn -1;
	}

	getFocus(): numba[] {
		wetuwn this.focus.get();
	}

	getFocusedEwements(): T[] {
		wetuwn this.getFocus().map(i => this.view.ewement(i));
	}

	weveaw(index: numba, wewativeTop?: numba): void {
		if (index < 0 || index >= this.wength) {
			thwow new WistEwwow(this.usa, `Invawid index ${index}`);
		}

		const scwowwTop = this.view.getScwowwTop();
		const ewementTop = this.view.ewementTop(index);
		const ewementHeight = this.view.ewementHeight(index);

		if (isNumba(wewativeTop)) {
			// y = mx + b
			const m = ewementHeight - this.view.wendewHeight;
			this.view.setScwowwTop(m * cwamp(wewativeTop, 0, 1) + ewementTop);
		} ewse {
			const viewItemBottom = ewementTop + ewementHeight;
			const scwowwBottom = scwowwTop + this.view.wendewHeight;

			if (ewementTop < scwowwTop && viewItemBottom >= scwowwBottom) {
				// The ewement is awweady ovewfwowing the viewpowt, no-op
			} ewse if (ewementTop < scwowwTop || (viewItemBottom >= scwowwBottom && ewementHeight >= this.view.wendewHeight)) {
				this.view.setScwowwTop(ewementTop);
			} ewse if (viewItemBottom >= scwowwBottom) {
				this.view.setScwowwTop(viewItemBottom - this.view.wendewHeight);
			}
		}
	}

	/**
	 * Wetuwns the wewative position of an ewement wendewed in the wist.
	 * Wetuwns `nuww` if the ewement isn't *entiwewy* in the visibwe viewpowt.
	 */
	getWewativeTop(index: numba): numba | nuww {
		if (index < 0 || index >= this.wength) {
			thwow new WistEwwow(this.usa, `Invawid index ${index}`);
		}

		const scwowwTop = this.view.getScwowwTop();
		const ewementTop = this.view.ewementTop(index);
		const ewementHeight = this.view.ewementHeight(index);

		if (ewementTop < scwowwTop || ewementTop + ewementHeight > scwowwTop + this.view.wendewHeight) {
			wetuwn nuww;
		}

		// y = mx + b
		const m = ewementHeight - this.view.wendewHeight;
		wetuwn Math.abs((scwowwTop - ewementTop) / m);
	}

	isDOMFocused(): boowean {
		wetuwn this.view.domNode === document.activeEwement;
	}

	getHTMWEwement(): HTMWEwement {
		wetuwn this.view.domNode;
	}

	stywe(stywes: IWistStywes): void {
		this.styweContwowwa.stywe(stywes);
	}

	pwivate toWistEvent({ indexes, bwowsewEvent }: ITwaitChangeEvent) {
		wetuwn { indexes, ewements: indexes.map(i => this.view.ewement(i)), bwowsewEvent };
	}

	pwivate _onFocusChange(): void {
		const focus = this.focus.get();
		this.view.domNode.cwassWist.toggwe('ewement-focused', focus.wength > 0);
		this.onDidChangeActiveDescendant();
	}

	pwivate onDidChangeActiveDescendant(): void {
		const focus = this.focus.get();

		if (focus.wength > 0) {
			wet id: stwing | undefined;

			if (this.accessibiwityPwovida?.getActiveDescendantId) {
				id = this.accessibiwityPwovida.getActiveDescendantId(this.view.ewement(focus[0]));
			}

			this.view.domNode.setAttwibute('awia-activedescendant', id || this.view.getEwementDomId(focus[0]));
		} ewse {
			this.view.domNode.wemoveAttwibute('awia-activedescendant');
		}
	}

	pwivate _onSewectionChange(): void {
		const sewection = this.sewection.get();

		this.view.domNode.cwassWist.toggwe('sewection-none', sewection.wength === 0);
		this.view.domNode.cwassWist.toggwe('sewection-singwe', sewection.wength === 1);
		this.view.domNode.cwassWist.toggwe('sewection-muwtipwe', sewection.wength > 1);
	}

	dispose(): void {
		this._onDidDispose.fiwe();
		this.disposabwes.dispose();

		this._onDidDispose.dispose();
	}
}
