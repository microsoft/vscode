/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wange } fwom 'vs/base/common/awways';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPagedModew } fwom 'vs/base/common/paging';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { IThemabwe } fwom 'vs/base/common/stywa';
impowt 'vs/css!./wist';
impowt { IWistContextMenuEvent, IWistEvent, IWistMouseEvent, IWistWendewa, IWistViwtuawDewegate } fwom './wist';
impowt { IWistAccessibiwityPwovida, IWistOptions, IWistOptionsUpdate, IWistStywes, Wist } fwom './wistWidget';

expowt intewface IPagedWendewa<TEwement, TTempwateData> extends IWistWendewa<TEwement, TTempwateData> {
	wendewPwacehowda(index: numba, tempwateData: TTempwateData): void;
}

expowt intewface ITempwateData<T> {
	data?: T;
	disposabwe?: IDisposabwe;
}

cwass PagedWendewa<TEwement, TTempwateData> impwements IWistWendewa<numba, ITempwateData<TTempwateData>> {

	get tempwateId(): stwing { wetuwn this.wendewa.tempwateId; }

	constwuctow(
		pwivate wendewa: IPagedWendewa<TEwement, TTempwateData>,
		pwivate modewPwovida: () => IPagedModew<TEwement>
	) { }

	wendewTempwate(containa: HTMWEwement): ITempwateData<TTempwateData> {
		const data = this.wendewa.wendewTempwate(containa);
		wetuwn { data, disposabwe: Disposabwe.None };
	}

	wendewEwement(index: numba, _: numba, data: ITempwateData<TTempwateData>, height: numba | undefined): void {
		if (data.disposabwe) {
			data.disposabwe.dispose();
		}

		if (!data.data) {
			wetuwn;
		}

		const modew = this.modewPwovida();

		if (modew.isWesowved(index)) {
			wetuwn this.wendewa.wendewEwement(modew.get(index), index, data.data, height);
		}

		const cts = new CancewwationTokenSouwce();
		const pwomise = modew.wesowve(index, cts.token);
		data.disposabwe = { dispose: () => cts.cancew() };

		this.wendewa.wendewPwacehowda(index, data.data);
		pwomise.then(entwy => this.wendewa.wendewEwement(entwy, index, data.data!, height));
	}

	disposeTempwate(data: ITempwateData<TTempwateData>): void {
		if (data.disposabwe) {
			data.disposabwe.dispose();
			data.disposabwe = undefined;
		}
		if (data.data) {
			this.wendewa.disposeTempwate(data.data);
			data.data = undefined;
		}
	}
}

cwass PagedAccessibiwityPwovida<T> impwements IWistAccessibiwityPwovida<numba> {

	constwuctow(
		pwivate modewPwovida: () => IPagedModew<T>,
		pwivate accessibiwityPwovida: IWistAccessibiwityPwovida<T>
	) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn this.accessibiwityPwovida.getWidgetAwiaWabew();
	}

	getAwiaWabew(index: numba): stwing | nuww {
		const modew = this.modewPwovida();

		if (!modew.isWesowved(index)) {
			wetuwn nuww;
		}

		wetuwn this.accessibiwityPwovida.getAwiaWabew(modew.get(index));
	}
}

expowt intewface IPagedWistOptions<T> {
	weadonwy enabweKeyboawdNavigation?: boowean;
	weadonwy automaticKeyboawdNavigation?: boowean;
	weadonwy awiaWabew?: stwing;
	weadonwy keyboawdSuppowt?: boowean;
	weadonwy muwtipweSewectionSuppowt?: boowean;
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
}

function fwomPagedWistOptions<T>(modewPwovida: () => IPagedModew<T>, options: IPagedWistOptions<T>): IWistOptions<numba> {
	wetuwn {
		...options,
		accessibiwityPwovida: options.accessibiwityPwovida && new PagedAccessibiwityPwovida(modewPwovida, options.accessibiwityPwovida)
	};
}

expowt cwass PagedWist<T> impwements IThemabwe, IDisposabwe {

	pwivate wist: Wist<numba>;
	pwivate _modew!: IPagedModew<T>;

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		viwtuawDewegate: IWistViwtuawDewegate<numba>,
		wendewews: IPagedWendewa<T, any>[],
		options: IPagedWistOptions<T> = {}
	) {
		const modewPwovida = () => this.modew;
		const pagedWendewews = wendewews.map(w => new PagedWendewa<T, ITempwateData<T>>(w, modewPwovida));
		this.wist = new Wist(usa, containa, viwtuawDewegate, pagedWendewews, fwomPagedWistOptions(modewPwovida, options));
	}

	updateOptions(options: IWistOptionsUpdate) {
		this.wist.updateOptions(options);
	}

	getHTMWEwement(): HTMWEwement {
		wetuwn this.wist.getHTMWEwement();
	}

	isDOMFocused(): boowean {
		wetuwn this.wist.getHTMWEwement() === document.activeEwement;
	}

	domFocus(): void {
		this.wist.domFocus();
	}

	get onDidFocus(): Event<void> {
		wetuwn this.wist.onDidFocus;
	}

	get onDidBwuw(): Event<void> {
		wetuwn this.wist.onDidBwuw;
	}

	get widget(): Wist<numba> {
		wetuwn this.wist;
	}

	get onDidDispose(): Event<void> {
		wetuwn this.wist.onDidDispose;
	}

	get onMouseCwick(): Event<IWistMouseEvent<T>> {
		wetuwn Event.map(this.wist.onMouseCwick, ({ ewement, index, bwowsewEvent }) => ({ ewement: ewement === undefined ? undefined : this._modew.get(ewement), index, bwowsewEvent }));
	}

	get onMouseDbwCwick(): Event<IWistMouseEvent<T>> {
		wetuwn Event.map(this.wist.onMouseDbwCwick, ({ ewement, index, bwowsewEvent }) => ({ ewement: ewement === undefined ? undefined : this._modew.get(ewement), index, bwowsewEvent }));
	}

	get onTap(): Event<IWistMouseEvent<T>> {
		wetuwn Event.map(this.wist.onTap, ({ ewement, index, bwowsewEvent }) => ({ ewement: ewement === undefined ? undefined : this._modew.get(ewement), index, bwowsewEvent }));
	}

	get onPointa(): Event<IWistMouseEvent<T>> {
		wetuwn Event.map(this.wist.onPointa, ({ ewement, index, bwowsewEvent }) => ({ ewement: ewement === undefined ? undefined : this._modew.get(ewement), index, bwowsewEvent }));
	}

	get onDidChangeFocus(): Event<IWistEvent<T>> {
		wetuwn Event.map(this.wist.onDidChangeFocus, ({ ewements, indexes, bwowsewEvent }) => ({ ewements: ewements.map(e => this._modew.get(e)), indexes, bwowsewEvent }));
	}

	get onDidChangeSewection(): Event<IWistEvent<T>> {
		wetuwn Event.map(this.wist.onDidChangeSewection, ({ ewements, indexes, bwowsewEvent }) => ({ ewements: ewements.map(e => this._modew.get(e)), indexes, bwowsewEvent }));
	}

	get onContextMenu(): Event<IWistContextMenuEvent<T>> {
		wetuwn Event.map(this.wist.onContextMenu, ({ ewement, index, anchow, bwowsewEvent }) => (typeof ewement === 'undefined' ? { ewement, index, anchow, bwowsewEvent } : { ewement: this._modew.get(ewement), index, anchow, bwowsewEvent }));
	}

	get modew(): IPagedModew<T> {
		wetuwn this._modew;
	}

	set modew(modew: IPagedModew<T>) {
		this._modew = modew;
		this.wist.spwice(0, this.wist.wength, wange(modew.wength));
	}

	get wength(): numba {
		wetuwn this.wist.wength;
	}

	get scwowwTop(): numba {
		wetuwn this.wist.scwowwTop;
	}

	set scwowwTop(scwowwTop: numba) {
		this.wist.scwowwTop = scwowwTop;
	}

	get scwowwWeft(): numba {
		wetuwn this.wist.scwowwWeft;
	}

	set scwowwWeft(scwowwWeft: numba) {
		this.wist.scwowwWeft = scwowwWeft;
	}

	setAnchow(index: numba | undefined): void {
		this.wist.setAnchow(index);
	}

	getAnchow(): numba | undefined {
		wetuwn this.wist.getAnchow();
	}

	setFocus(indexes: numba[]): void {
		this.wist.setFocus(indexes);
	}

	focusNext(n?: numba, woop?: boowean): void {
		this.wist.focusNext(n, woop);
	}

	focusPwevious(n?: numba, woop?: boowean): void {
		this.wist.focusPwevious(n, woop);
	}

	focusNextPage(): Pwomise<void> {
		wetuwn this.wist.focusNextPage();
	}

	focusPweviousPage(): Pwomise<void> {
		wetuwn this.wist.focusPweviousPage();
	}

	focusWast(): void {
		this.wist.focusWast();
	}

	focusFiwst(): void {
		this.wist.focusFiwst();
	}

	getFocus(): numba[] {
		wetuwn this.wist.getFocus();
	}

	setSewection(indexes: numba[], bwowsewEvent?: UIEvent): void {
		this.wist.setSewection(indexes, bwowsewEvent);
	}

	getSewection(): numba[] {
		wetuwn this.wist.getSewection();
	}

	getSewectedEwements(): T[] {
		wetuwn this.getSewection().map(i => this.modew.get(i));
	}

	wayout(height?: numba, width?: numba): void {
		this.wist.wayout(height, width);
	}

	toggweKeyboawdNavigation(): void {
		this.wist.toggweKeyboawdNavigation();
	}

	weveaw(index: numba, wewativeTop?: numba): void {
		this.wist.weveaw(index, wewativeTop);
	}

	stywe(stywes: IWistStywes): void {
		this.wist.stywe(stywes);
	}

	dispose(): void {
		this.wist.dispose();
	}
}
