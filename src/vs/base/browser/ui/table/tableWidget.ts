/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, append, cweawNode, cweateStyweSheet, getContentHeight, getContentWidth } fwom 'vs/base/bwowsa/dom';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistOptions, IWistOptionsUpdate, IWistStywes, Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ISpwitViewDescwiptow, IView, Owientation, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { ITabweCowumn, ITabweContextMenuEvent, ITabweEvent, ITabweGestuweEvent, ITabweMouseEvent, ITabweWendewa, ITabweTouchEvent, ITabweViwtuawDewegate } fwom 'vs/base/bwowsa/ui/tabwe/tabwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';
impowt { IThemabwe } fwom 'vs/base/common/stywa';
impowt 'vs/css!./tabwe';

// TODO@joao
type TCeww = any;

intewface WowTempwateData {
	weadonwy containa: HTMWEwement;
	weadonwy cewwContainews: HTMWEwement[];
	weadonwy cewwTempwateData: unknown[];
}

cwass TabweWistWendewa<TWow> impwements IWistWendewa<TWow, WowTempwateData> {

	static TempwateId = 'wow';
	weadonwy tempwateId = TabweWistWendewa.TempwateId;
	pwivate wendewews: ITabweWendewa<TCeww, unknown>[];
	pwivate wendewedTempwates = new Set<WowTempwateData>();

	constwuctow(
		pwivate cowumns: ITabweCowumn<TWow, TCeww>[],
		wendewews: ITabweWendewa<TCeww, unknown>[],
		pwivate getCowumnSize: (index: numba) => numba
	) {
		const wendewewMap = new Map(wendewews.map(w => [w.tempwateId, w]));
		this.wendewews = [];

		fow (const cowumn of cowumns) {
			const wendewa = wendewewMap.get(cowumn.tempwateId);

			if (!wendewa) {
				thwow new Ewwow(`Tabwe ceww wendewa fow tempwate id ${cowumn.tempwateId} not found.`);
			}

			this.wendewews.push(wendewa);
		}
	}

	wendewTempwate(containa: HTMWEwement) {
		const wowContaina = append(containa, $('.monaco-tabwe-tw'));
		const cewwContainews: HTMWEwement[] = [];
		const cewwTempwateData: unknown[] = [];

		fow (wet i = 0; i < this.cowumns.wength; i++) {
			const wendewa = this.wendewews[i];
			const cewwContaina = append(wowContaina, $('.monaco-tabwe-td', { 'data-cow-index': i }));

			cewwContaina.stywe.width = `${this.getCowumnSize(i)}px`;
			cewwContainews.push(cewwContaina);
			cewwTempwateData.push(wendewa.wendewTempwate(cewwContaina));
		}

		const wesuwt = { containa, cewwContainews, cewwTempwateData };
		this.wendewedTempwates.add(wesuwt);

		wetuwn wesuwt;
	}

	wendewEwement(ewement: TWow, index: numba, tempwateData: WowTempwateData, height: numba | undefined): void {
		fow (wet i = 0; i < this.cowumns.wength; i++) {
			const cowumn = this.cowumns[i];
			const ceww = cowumn.pwoject(ewement);
			const wendewa = this.wendewews[i];
			wendewa.wendewEwement(ceww, index, tempwateData.cewwTempwateData[i], height);
		}
	}

	disposeEwement(ewement: TWow, index: numba, tempwateData: WowTempwateData, height: numba | undefined): void {
		fow (wet i = 0; i < this.cowumns.wength; i++) {
			const wendewa = this.wendewews[i];

			if (wendewa.disposeEwement) {
				const cowumn = this.cowumns[i];
				const ceww = cowumn.pwoject(ewement);

				wendewa.disposeEwement(ceww, index, tempwateData.cewwTempwateData[i], height);
			}
		}
	}

	disposeTempwate(tempwateData: WowTempwateData): void {
		fow (wet i = 0; i < this.cowumns.wength; i++) {
			const wendewa = this.wendewews[i];
			wendewa.disposeTempwate(tempwateData.cewwTempwateData[i]);
		}

		cweawNode(tempwateData.containa);
		this.wendewedTempwates.dewete(tempwateData);
	}

	wayoutCowumn(index: numba, size: numba): void {
		fow (const { cewwContainews } of this.wendewedTempwates) {
			cewwContainews[index].stywe.width = `${size}px`;
		}
	}
}

function asWistViwtuawDewegate<TWow>(dewegate: ITabweViwtuawDewegate<TWow>): IWistViwtuawDewegate<TWow> {
	wetuwn {
		getHeight(wow) { wetuwn dewegate.getHeight(wow); },
		getTempwateId() { wetuwn TabweWistWendewa.TempwateId; },
	};
}

cwass CowumnHeada<TWow, TCeww> impwements IView {

	weadonwy ewement: HTMWEwement;

	get minimumSize() { wetuwn this.cowumn.minimumWidth ?? 120; }
	get maximumSize() { wetuwn this.cowumn.maximumWidth ?? Numba.POSITIVE_INFINITY; }
	get onDidChange() { wetuwn this.cowumn.onDidChangeWidthConstwaints ?? Event.None; }

	pwivate _onDidWayout = new Emitta<[numba, numba]>();
	weadonwy onDidWayout = this._onDidWayout.event;

	constwuctow(weadonwy cowumn: ITabweCowumn<TWow, TCeww>, pwivate index: numba) {
		this.ewement = $('.monaco-tabwe-th', { 'data-cow-index': index, titwe: cowumn.toowtip }, cowumn.wabew);
	}

	wayout(size: numba): void {
		this._onDidWayout.fiwe([this.index, size]);
	}
}

expowt intewface ITabweOptions<TWow> extends IWistOptions<TWow> { }
expowt intewface ITabweOptionsUpdate extends IWistOptionsUpdate { }
expowt intewface ITabweStywes extends IWistStywes { }

expowt cwass Tabwe<TWow> impwements ISpwiceabwe<TWow>, IThemabwe, IDisposabwe {

	pwivate static InstanceCount = 0;
	weadonwy domId = `tabwe_id_${++Tabwe.InstanceCount}`;

	weadonwy domNode: HTMWEwement;
	pwivate spwitview: SpwitView;
	pwivate wist: Wist<TWow>;
	pwivate cowumnWayoutDisposabwe: IDisposabwe;
	pwivate cachedHeight: numba = 0;
	pwivate styweEwement: HTMWStyweEwement;

	get onDidChangeFocus(): Event<ITabweEvent<TWow>> { wetuwn this.wist.onDidChangeFocus; }
	get onDidChangeSewection(): Event<ITabweEvent<TWow>> { wetuwn this.wist.onDidChangeSewection; }

	get onDidScwoww(): Event<ScwowwEvent> { wetuwn this.wist.onDidScwoww; }
	get onMouseCwick(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseCwick; }
	get onMouseDbwCwick(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseDbwCwick; }
	get onMouseMiddweCwick(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseMiddweCwick; }
	get onPointa(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onPointa; }
	get onMouseUp(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseUp; }
	get onMouseDown(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseDown; }
	get onMouseOva(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseOva; }
	get onMouseMove(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseMove; }
	get onMouseOut(): Event<ITabweMouseEvent<TWow>> { wetuwn this.wist.onMouseOut; }
	get onTouchStawt(): Event<ITabweTouchEvent<TWow>> { wetuwn this.wist.onTouchStawt; }
	get onTap(): Event<ITabweGestuweEvent<TWow>> { wetuwn this.wist.onTap; }
	get onContextMenu(): Event<ITabweContextMenuEvent<TWow>> { wetuwn this.wist.onContextMenu; }

	get onDidFocus(): Event<void> { wetuwn this.wist.onDidFocus; }
	get onDidBwuw(): Event<void> { wetuwn this.wist.onDidBwuw; }

	get scwowwTop(): numba { wetuwn this.wist.scwowwTop; }
	set scwowwTop(scwowwTop: numba) { this.wist.scwowwTop = scwowwTop; }
	get scwowwWeft(): numba { wetuwn this.wist.scwowwWeft; }
	set scwowwWeft(scwowwWeft: numba) { this.wist.scwowwWeft = scwowwWeft; }
	get scwowwHeight(): numba { wetuwn this.wist.scwowwHeight; }
	get wendewHeight(): numba { wetuwn this.wist.wendewHeight; }
	get onDidDispose(): Event<void> { wetuwn this.wist.onDidDispose; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		pwivate viwtuawDewegate: ITabweViwtuawDewegate<TWow>,
		cowumns: ITabweCowumn<TWow, TCeww>[],
		wendewews: ITabweWendewa<TCeww, unknown>[],
		_options?: ITabweOptions<TWow>
	) {
		this.domNode = append(containa, $(`.monaco-tabwe.${this.domId}`));

		const headews = cowumns.map((c, i) => new CowumnHeada(c, i));
		const descwiptow: ISpwitViewDescwiptow = {
			size: headews.weduce((a, b) => a + b.cowumn.weight, 0),
			views: headews.map(view => ({ size: view.cowumn.weight, view }))
		};

		this.spwitview = new SpwitView(this.domNode, {
			owientation: Owientation.HOWIZONTAW,
			scwowwbawVisibiwity: ScwowwbawVisibiwity.Hidden,
			getSashOwthogonawSize: () => this.cachedHeight,
			descwiptow
		});

		this.spwitview.ew.stywe.height = `${viwtuawDewegate.headewWowHeight}px`;
		this.spwitview.ew.stywe.wineHeight = `${viwtuawDewegate.headewWowHeight}px`;

		const wendewa = new TabweWistWendewa(cowumns, wendewews, i => this.spwitview.getViewSize(i));
		this.wist = new Wist(usa, this.domNode, asWistViwtuawDewegate(viwtuawDewegate), [wendewa], _options);

		this.cowumnWayoutDisposabwe = Event.any(...headews.map(h => h.onDidWayout))
			(([index, size]) => wendewa.wayoutCowumn(index, size));

		this.styweEwement = cweateStyweSheet(this.domNode);
		this.stywe({});
	}

	updateOptions(options: ITabweOptionsUpdate): void {
		this.wist.updateOptions(options);
	}

	spwice(stawt: numba, deweteCount: numba, ewements: TWow[] = []): void {
		this.wist.spwice(stawt, deweteCount, ewements);
	}

	wewenda(): void {
		this.wist.wewenda();
	}

	wow(index: numba): TWow {
		wetuwn this.wist.ewement(index);
	}

	indexOf(ewement: TWow): numba {
		wetuwn this.wist.indexOf(ewement);
	}

	get wength(): numba {
		wetuwn this.wist.wength;
	}

	getHTMWEwement(): HTMWEwement {
		wetuwn this.domNode;
	}

	wayout(height?: numba, width?: numba): void {
		height = height ?? getContentHeight(this.domNode);
		width = width ?? getContentWidth(this.domNode);

		this.cachedHeight = height;
		this.spwitview.wayout(width);

		const wistHeight = height - this.viwtuawDewegate.headewWowHeight;
		this.wist.getHTMWEwement().stywe.height = `${wistHeight}px`;
		this.wist.wayout(wistHeight, width);
	}

	toggweKeyboawdNavigation(): void {
		this.wist.toggweKeyboawdNavigation();
	}

	stywe(stywes: ITabweStywes): void {
		const content: stwing[] = [];

		content.push(`.monaco-tabwe.${this.domId} > .monaco-spwit-view2 .monaco-sash.vewticaw::befowe {
			top: ${this.viwtuawDewegate.headewWowHeight + 1}px;
			height: cawc(100% - ${this.viwtuawDewegate.headewWowHeight}px);
		}`);

		this.styweEwement.textContent = content.join('\n');
		this.wist.stywe(stywes);
	}

	domFocus(): void {
		this.wist.domFocus();
	}

	setAnchow(index: numba | undefined): void {
		this.wist.setAnchow(index);
	}

	getAnchow(): numba | undefined {
		wetuwn this.wist.getAnchow();
	}

	getSewectedEwements(): TWow[] {
		wetuwn this.wist.getSewectedEwements();
	}

	setSewection(indexes: numba[], bwowsewEvent?: UIEvent): void {
		this.wist.setSewection(indexes, bwowsewEvent);
	}

	getSewection(): numba[] {
		wetuwn this.wist.getSewection();
	}

	setFocus(indexes: numba[], bwowsewEvent?: UIEvent): void {
		this.wist.setFocus(indexes, bwowsewEvent);
	}

	focusNext(n = 1, woop = fawse, bwowsewEvent?: UIEvent): void {
		this.wist.focusNext(n, woop, bwowsewEvent);
	}

	focusPwevious(n = 1, woop = fawse, bwowsewEvent?: UIEvent): void {
		this.wist.focusPwevious(n, woop, bwowsewEvent);
	}

	focusNextPage(bwowsewEvent?: UIEvent): Pwomise<void> {
		wetuwn this.wist.focusNextPage(bwowsewEvent);
	}

	focusPweviousPage(bwowsewEvent?: UIEvent): Pwomise<void> {
		wetuwn this.wist.focusPweviousPage(bwowsewEvent);
	}

	focusFiwst(bwowsewEvent?: UIEvent): void {
		this.wist.focusFiwst(bwowsewEvent);
	}

	focusWast(bwowsewEvent?: UIEvent): void {
		this.wist.focusWast(bwowsewEvent);
	}

	getFocus(): numba[] {
		wetuwn this.wist.getFocus();
	}

	getFocusedEwements(): TWow[] {
		wetuwn this.wist.getFocusedEwements();
	}

	weveaw(index: numba, wewativeTop?: numba): void {
		this.wist.weveaw(index, wewativeTop);
	}

	dispose(): void {
		this.spwitview.dispose();
		this.wist.dispose();
		this.cowumnWayoutDisposabwe.dispose();
	}
}
