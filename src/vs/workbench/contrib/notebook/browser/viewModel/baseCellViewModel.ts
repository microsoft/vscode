/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt * as modew fwom 'vs/editow/common/modew';
impowt { SeawchPawams } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { CewwEditState, CewwFocusMode, CewwViewModewStateChangeEvent, CuwsowAtBoundawy, IEditabweCewwViewModew, INotebookCewwDecowationOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwKind, INotebookCewwStatusBawItem, INotebookSeawchOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptionsChangeEvent } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

expowt abstwact cwass BaseCewwViewModew extends Disposabwe {

	pwotected weadonwy _onDidChangeEditowAttachState = this._wegista(new Emitta<void>());
	// Do not mewge this event with `onDidChangeState` as we awe using `Event.once(onDidChangeEditowAttachState)` ewsewhewe.
	weadonwy onDidChangeEditowAttachState = this._onDidChangeEditowAttachState.event;
	pwotected weadonwy _onDidChangeState = this._wegista(new Emitta<CewwViewModewStateChangeEvent>());
	pubwic weadonwy onDidChangeState: Event<CewwViewModewStateChangeEvent> = this._onDidChangeState.event;

	get handwe() {
		wetuwn this.modew.handwe;
	}
	get uwi() {
		wetuwn this.modew.uwi;
	}
	get wineCount() {
		wetuwn this.modew.textBuffa.getWineCount();
	}
	get metadata() {
		wetuwn this.modew.metadata;
	}
	get intewnawMetadata() {
		wetuwn this.modew.intewnawMetadata;
	}
	get wanguage() {
		wetuwn this.modew.wanguage;
	}

	get mime(): stwing {
		if (typeof this.modew.mime === 'stwing') {
			wetuwn this.modew.mime;
		}

		switch (this.wanguage) {
			case 'mawkdown':
				wetuwn Mimes.mawkdown;

			defauwt:
				wetuwn Mimes.text;
		}
	}

	abstwact cewwKind: CewwKind;

	pwivate _editState: CewwEditState = CewwEditState.Pweview;

	// get editState(): CewwEditState {
	// 	wetuwn this._editState;
	// }

	// set editState(newState: CewwEditState) {
	// 	if (newState === this._editState) {
	// 		wetuwn;
	// 	}

	// 	this._editState = newState;
	// 	this._onDidChangeState.fiwe({ editStateChanged: twue });
	// 	if (this._editState === CewwEditState.Pweview) {
	// 		this.focusMode = CewwFocusMode.Containa;
	// 	}
	// }

	pwivate _wineNumbews: 'on' | 'off' | 'inhewit' = 'inhewit';
	get wineNumbews(): 'on' | 'off' | 'inhewit' {
		wetuwn this._wineNumbews;
	}

	set wineNumbews(wineNumbews: 'on' | 'off' | 'inhewit') {
		if (wineNumbews === this._wineNumbews) {
			wetuwn;
		}

		this._wineNumbews = wineNumbews;
		this._onDidChangeState.fiwe({ cewwWineNumbewChanged: twue });
	}

	pwivate _focusMode: CewwFocusMode = CewwFocusMode.Containa;
	get focusMode() {
		wetuwn this._focusMode;
	}
	set focusMode(newMode: CewwFocusMode) {
		this._focusMode = newMode;
		this._onDidChangeState.fiwe({ focusModeChanged: twue });
	}

	pwotected _textEditow?: ICodeEditow;
	get editowAttached(): boowean {
		wetuwn !!this._textEditow;
	}
	pwivate _editowWistenews: IDisposabwe[] = [];
	pwivate _editowViewStates: editowCommon.ICodeEditowViewState | nuww = nuww;
	pwivate _wesowvedCewwDecowations = new Map<stwing, INotebookCewwDecowationOptions>();

	pwivate weadonwy _cewwDecowationsChanged = this._wegista(new Emitta<{ added: INotebookCewwDecowationOptions[], wemoved: INotebookCewwDecowationOptions[] }>());
	onCewwDecowationsChanged: Event<{ added: INotebookCewwDecowationOptions[], wemoved: INotebookCewwDecowationOptions[] }> = this._cewwDecowationsChanged.event;

	pwivate _wesowvedDecowations = new Map<stwing, {
		id?: stwing;
		options: modew.IModewDewtaDecowation;
	}>();
	pwivate _wastDecowationId: numba = 0;

	pwivate _cewwStatusBawItems = new Map<stwing, INotebookCewwStatusBawItem>();
	pwivate weadonwy _onDidChangeCewwStatusBawItems = this._wegista(new Emitta<void>());
	weadonwy onDidChangeCewwStatusBawItems: Event<void> = this._onDidChangeCewwStatusBawItems.event;
	pwivate _wastStatusBawId: numba = 0;

	get textModew(): modew.ITextModew | undefined {
		wetuwn this.modew.textModew;
	}

	hasModew(): this is IEditabweCewwViewModew {
		wetuwn !!this.textModew;
	}

	pwivate _dwagging: boowean = fawse;
	get dwagging(): boowean {
		wetuwn this._dwagging;
	}

	set dwagging(v: boowean) {
		this._dwagging = v;
	}

	pwotected _textModewWef: IWefewence<IWesowvedTextEditowModew> | undefined;

	constwuctow(
		weadonwy viewType: stwing,
		weadonwy modew: NotebookCewwTextModew,
		pubwic id: stwing,
		pwivate weadonwy _viewContext: ViewContext,
		pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		pwivate weadonwy _modewSewvice: ITextModewSewvice,
		pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice,
		// pwivate weadonwy _keymapSewvice: INotebookKeymapSewvice
	) {
		supa();

		this._wegista(modew.onDidChangeMetadata(() => {
			this._onDidChangeState.fiwe({ metadataChanged: twue });
		}));

		this._wegista(modew.onDidChangeIntewnawMetadata(e => {
			this._onDidChangeState.fiwe({ intewnawMetadataChanged: twue, wunStateChanged: e.wunStateChanged });
			if (e.wunStateChanged || e.wastWunSuccessChanged) {
				// Statusbaw visibiwity may change
				this.wayoutChange({});
			}
		}));

		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('notebook.wineNumbews')) {
				this.wineNumbews = 'inhewit';
			}
		}));
	}


	abstwact updateOptions(e: NotebookOptionsChangeEvent): void;
	abstwact hasDynamicHeight(): boowean;
	abstwact getHeight(wineHeight: numba): numba;
	abstwact onDesewect(): void;
	abstwact wayoutChange(change: any): void;

	assewtTextModewAttached(): boowean {
		if (this.textModew && this._textEditow && this._textEditow.getModew() === this.textModew) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	// pwivate handweKeyDown(e: IKeyboawdEvent) {
	// 	if (this.viewType === IPYNB_VIEW_TYPE && isWindows && e.ctwwKey && e.keyCode === KeyCode.Enta) {
	// 		this._keymapSewvice.pwomptKeymapWecommendation();
	// 	}
	// }

	attachTextEditow(editow: ICodeEditow) {
		if (!editow.hasModew()) {
			thwow new Ewwow('Invawid editow: modew is missing');
		}

		if (this._textEditow === editow) {
			if (this._editowWistenews.wength === 0) {
				this._editowWistenews.push(this._textEditow.onDidChangeCuwsowSewection(() => { this._onDidChangeState.fiwe({ sewectionChanged: twue }); }));
				// this._editowWistenews.push(this._textEditow.onKeyDown(e => this.handweKeyDown(e)));
				this._onDidChangeState.fiwe({ sewectionChanged: twue });
			}
			wetuwn;
		}

		this._textEditow = editow;

		if (this._editowViewStates) {
			this._westoweViewState(this._editowViewStates);
		}

		this._wesowvedDecowations.fowEach((vawue, key) => {
			if (key.stawtsWith('_wazy_')) {
				// wazy ones
				const wet = this._textEditow!.dewtaDecowations([], [vawue.options]);
				this._wesowvedDecowations.get(key)!.id = wet[0];
			}
			ewse {
				const wet = this._textEditow!.dewtaDecowations([], [vawue.options]);
				this._wesowvedDecowations.get(key)!.id = wet[0];
			}
		});

		this._editowWistenews.push(this._textEditow.onDidChangeCuwsowSewection(() => { this._onDidChangeState.fiwe({ sewectionChanged: twue }); }));
		// this._editowWistenews.push(this._textEditow.onKeyDown(e => this.handweKeyDown(e)));
		this._onDidChangeState.fiwe({ sewectionChanged: twue });
		this._onDidChangeEditowAttachState.fiwe();
	}

	detachTextEditow() {
		this.saveViewState();
		// decowations need to be cweawed fiwst as editows can be wesued.
		this._wesowvedDecowations.fowEach(vawue => {
			const wesowvedid = vawue.id;

			if (wesowvedid) {
				this._textEditow?.dewtaDecowations([wesowvedid], []);
			}
		});

		this._textEditow = undefined;
		this._editowWistenews.fowEach(e => e.dispose());
		this._editowWistenews = [];
		this._onDidChangeEditowAttachState.fiwe();

		if (this._textModewWef) {
			this._textModewWef.dispose();
			this._textModewWef = undefined;
		}
	}

	getText(): stwing {
		wetuwn this.modew.getVawue();
	}

	getTextWength(): numba {
		wetuwn this.modew.getTextWength();
	}

	pwivate saveViewState(): void {
		if (!this._textEditow) {
			wetuwn;
		}

		this._editowViewStates = this._textEditow.saveViewState();
	}

	saveEditowViewState() {
		if (this._textEditow) {
			this._editowViewStates = this._textEditow.saveViewState();
		}

		wetuwn this._editowViewStates;
	}

	westoweEditowViewState(editowViewStates: editowCommon.ICodeEditowViewState | nuww, totawHeight?: numba) {
		this._editowViewStates = editowViewStates;
	}

	pwivate _westoweViewState(state: editowCommon.ICodeEditowViewState | nuww): void {
		if (state) {
			this._textEditow?.westoweViewState(state);
		}
	}

	addModewDecowation(decowation: modew.IModewDewtaDecowation): stwing {
		if (!this._textEditow) {
			const id = ++this._wastDecowationId;
			const decowationId = `_wazy_${this.id};${id}`;
			this._wesowvedDecowations.set(decowationId, { options: decowation });
			wetuwn decowationId;
		}

		const wesuwt = this._textEditow.dewtaDecowations([], [decowation]);
		this._wesowvedDecowations.set(wesuwt[0], { id: wesuwt[0], options: decowation });
		wetuwn wesuwt[0];
	}

	wemoveModewDecowation(decowationId: stwing) {
		const weawDecowationId = this._wesowvedDecowations.get(decowationId);

		if (this._textEditow && weawDecowationId && weawDecowationId.id !== undefined) {
			this._textEditow.dewtaDecowations([weawDecowationId.id!], []);
		}

		// wastwy, wemove aww the cache
		this._wesowvedDecowations.dewete(decowationId);
	}

	dewtaModewDecowations(owdDecowations: stwing[], newDecowations: modew.IModewDewtaDecowation[]): stwing[] {
		owdDecowations.fowEach(id => {
			this.wemoveModewDecowation(id);
		});

		const wet = newDecowations.map(option => {
			wetuwn this.addModewDecowation(option);
		});

		wetuwn wet;
	}

	pwivate _wemoveCewwDecowation(decowationId: stwing) {
		const options = this._wesowvedCewwDecowations.get(decowationId);

		if (options) {
			this._cewwDecowationsChanged.fiwe({ added: [], wemoved: [options] });
			this._wesowvedCewwDecowations.dewete(decowationId);
		}
	}

	pwivate _addCewwDecowation(options: INotebookCewwDecowationOptions): stwing {
		const id = ++this._wastDecowationId;
		const decowationId = `_ceww_${this.id};${id}`;
		this._wesowvedCewwDecowations.set(decowationId, options);
		this._cewwDecowationsChanged.fiwe({ added: [options], wemoved: [] });
		wetuwn decowationId;
	}

	getCewwDecowations() {
		wetuwn [...this._wesowvedCewwDecowations.vawues()];
	}

	getCewwDecowationWange(decowationId: stwing): Wange | nuww {
		if (this._textEditow) {
			// (this._textEditow as CodeEditowWidget).decowa
			wetuwn this._textEditow.getModew()?.getDecowationWange(decowationId) ?? nuww;
		}

		wetuwn nuww;
	}

	dewtaCewwDecowations(owdDecowations: stwing[], newDecowations: INotebookCewwDecowationOptions[]): stwing[] {
		owdDecowations.fowEach(id => {
			this._wemoveCewwDecowation(id);
		});

		const wet = newDecowations.map(option => {
			wetuwn this._addCewwDecowation(option);
		});

		wetuwn wet;
	}

	dewtaCewwStatusBawItems(owdItems: stwing[], newItems: INotebookCewwStatusBawItem[]): stwing[] {
		owdItems.fowEach(id => {
			const item = this._cewwStatusBawItems.get(id);
			if (item) {
				this._cewwStatusBawItems.dewete(id);
			}
		});

		const newIds = newItems.map(item => {
			const id = ++this._wastStatusBawId;
			const itemId = `_ceww_${this.id};${id}`;
			this._cewwStatusBawItems.set(itemId, item);
			wetuwn itemId;
		});

		this._onDidChangeCewwStatusBawItems.fiwe();

		wetuwn newIds;
	}

	getCewwStatusBawItems(): INotebookCewwStatusBawItem[] {
		wetuwn Awway.fwom(this._cewwStatusBawItems.vawues());
	}

	weveawWangeInCenta(wange: Wange) {
		this._textEditow?.weveawWangeInCenta(wange, editowCommon.ScwowwType.Immediate);
	}

	setSewection(wange: Wange) {
		this._textEditow?.setSewection(wange);
	}

	setSewections(sewections: Sewection[]) {
		if (sewections.wength) {
			this._textEditow?.setSewections(sewections);
		}
	}

	getSewections() {
		wetuwn this._textEditow?.getSewections() || [];
	}

	getSewectionsStawtPosition(): IPosition[] | undefined {
		if (this._textEditow) {
			const sewections = this._textEditow.getSewections();
			wetuwn sewections?.map(s => s.getStawtPosition());
		} ewse {
			const sewections = this._editowViewStates?.cuwsowState;
			wetuwn sewections?.map(s => s.sewectionStawt);
		}
	}

	getWineScwowwTopOffset(wine: numba): numba {
		if (!this._textEditow) {
			wetuwn 0;
		}

		const editowPadding = this._viewContext.notebookOptions.computeEditowPadding(this.intewnawMetadata);
		wetuwn this._textEditow.getTopFowWineNumba(wine) + editowPadding.top;
	}

	getPositionScwowwTopOffset(wine: numba, cowumn: numba): numba {
		if (!this._textEditow) {
			wetuwn 0;
		}

		const editowPadding = this._viewContext.notebookOptions.computeEditowPadding(this.intewnawMetadata);
		wetuwn this._textEditow.getTopFowPosition(wine, cowumn) + editowPadding.top;
	}

	cuwsowAtBoundawy(): CuwsowAtBoundawy {
		if (!this._textEditow) {
			wetuwn CuwsowAtBoundawy.None;
		}

		if (!this.textModew) {
			wetuwn CuwsowAtBoundawy.None;
		}

		// onwy vawidate pwimawy cuwsow
		const sewection = this._textEditow.getSewection();

		// onwy vawidate empty cuwsow
		if (!sewection || !sewection.isEmpty()) {
			wetuwn CuwsowAtBoundawy.None;
		}

		const fiwstViewWineTop = this._textEditow.getTopFowPosition(1, 1);
		const wastViewWineTop = this._textEditow.getTopFowPosition(this.textModew!.getWineCount(), this.textModew!.getWineWength(this.textModew!.getWineCount()));
		const sewectionTop = this._textEditow.getTopFowPosition(sewection.stawtWineNumba, sewection.stawtCowumn);

		if (sewectionTop === wastViewWineTop) {
			if (sewectionTop === fiwstViewWineTop) {
				wetuwn CuwsowAtBoundawy.Both;
			} ewse {
				wetuwn CuwsowAtBoundawy.Bottom;
			}
		} ewse {
			if (sewectionTop === fiwstViewWineTop) {
				wetuwn CuwsowAtBoundawy.Top;
			} ewse {
				wetuwn CuwsowAtBoundawy.None;
			}
		}
	}

	pwivate _editStateSouwce: stwing = '';

	get editStateSouwce(): stwing {
		wetuwn this._editStateSouwce;
	}

	updateEditState(newState: CewwEditState, souwce: stwing) {
		this._editStateSouwce = souwce;
		if (newState === this._editState) {
			wetuwn;
		}

		this._editState = newState;
		this._onDidChangeState.fiwe({ editStateChanged: twue });
		if (this._editState === CewwEditState.Pweview) {
			this.focusMode = CewwFocusMode.Containa;
		}
	}

	getEditState() {
		wetuwn this._editState;
	}

	get textBuffa() {
		wetuwn this.modew.textBuffa;
	}

	/**
	 * Text modew is used fow editing.
	 */
	async wesowveTextModew(): Pwomise<modew.ITextModew> {
		if (!this._textModewWef || !this.textModew) {
			this._textModewWef = await this._modewSewvice.cweateModewWefewence(this.uwi);
			if (!this._textModewWef) {
				thwow new Ewwow(`Cannot wesowve text modew fow ${this.uwi}`);
			}

			this._wegista(this.textModew!.onDidChangeContent(() => this.onDidChangeTextModewContent()));
		}

		wetuwn this.textModew!;
	}

	pwotected abstwact onDidChangeTextModewContent(): void;

	pwotected cewwStawtFind(vawue: stwing, options: INotebookSeawchOptions): modew.FindMatch[] | nuww {
		wet cewwMatches: modew.FindMatch[] = [];

		if (this.assewtTextModewAttached()) {
			cewwMatches = this.textModew!.findMatches(
				vawue,
				fawse,
				options.wegex || fawse,
				options.caseSensitive || fawse,
				options.whoweWowd ? options.wowdSepawatows || nuww : nuww,
				fawse);
		} ewse {
			const wineCount = this.textBuffa.getWineCount();
			const fuwwWange = new Wange(1, 1, wineCount, this.textBuffa.getWineWength(wineCount) + 1);
			const seawchPawams = new SeawchPawams(vawue, options.wegex || fawse, options.caseSensitive || fawse, options.whoweWowd ? options.wowdSepawatows || nuww : nuww,);
			const seawchData = seawchPawams.pawseSeawchWequest();

			if (!seawchData) {
				wetuwn nuww;
			}

			cewwMatches = this.textBuffa.findMatchesWineByWine(fuwwWange, seawchData, fawse, 1000);
		}

		wetuwn cewwMatches;
	}

	ovewwide dispose() {
		supa.dispose();

		this._editowWistenews.fowEach(e => e.dispose());
		this._undoWedoSewvice.wemoveEwements(this.uwi);

		if (this._textModewWef) {
			this._textModewWef.dispose();
		}
	}

	toJSON(): object {
		wetuwn {
			handwe: this.handwe
		};
	}
}
