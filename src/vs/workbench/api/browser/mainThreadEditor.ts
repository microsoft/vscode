/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { WendewWineNumbewsType, TextEditowCuwsowStywe, cuwsowStyweToStwing, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IDecowationOptions, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ISingweEditOpewation, ITextModew, ITextModewUpdateOptions, IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { IAppwyEditsOptions, IEditowPwopewtiesChangeData, IWesowvedTextEditowConfiguwation, ITextEditowConfiguwationUpdate, IUndoStopOptions, TextEditowWeveawType } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { CodeEditowStateFwag, EditowState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { SnippetPawsa } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { MainThweadDocuments } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocuments';

expowt intewface IFocusTwacka {
	onGainedFocus(): void;
	onWostFocus(): void;
}

expowt cwass MainThweadTextEditowPwopewties {

	pubwic static weadFwomEditow(pweviousPwopewties: MainThweadTextEditowPwopewties | nuww, modew: ITextModew, codeEditow: ICodeEditow | nuww): MainThweadTextEditowPwopewties {
		const sewections = MainThweadTextEditowPwopewties._weadSewectionsFwomCodeEditow(pweviousPwopewties, codeEditow);
		const options = MainThweadTextEditowPwopewties._weadOptionsFwomCodeEditow(pweviousPwopewties, modew, codeEditow);
		const visibweWanges = MainThweadTextEditowPwopewties._weadVisibweWangesFwomCodeEditow(pweviousPwopewties, codeEditow);
		wetuwn new MainThweadTextEditowPwopewties(sewections, options, visibweWanges);
	}

	pwivate static _weadSewectionsFwomCodeEditow(pweviousPwopewties: MainThweadTextEditowPwopewties | nuww, codeEditow: ICodeEditow | nuww): Sewection[] {
		wet wesuwt: Sewection[] | nuww = nuww;
		if (codeEditow) {
			wesuwt = codeEditow.getSewections();
		}
		if (!wesuwt && pweviousPwopewties) {
			wesuwt = pweviousPwopewties.sewections;
		}
		if (!wesuwt) {
			wesuwt = [new Sewection(1, 1, 1, 1)];
		}
		wetuwn wesuwt;
	}

	pwivate static _weadOptionsFwomCodeEditow(pweviousPwopewties: MainThweadTextEditowPwopewties | nuww, modew: ITextModew, codeEditow: ICodeEditow | nuww): IWesowvedTextEditowConfiguwation {
		if (modew.isDisposed()) {
			if (pweviousPwopewties) {
				// shutdown time
				wetuwn pweviousPwopewties.options;
			} ewse {
				thwow new Ewwow('No vawid pwopewties');
			}
		}

		wet cuwsowStywe: TextEditowCuwsowStywe;
		wet wineNumbews: WendewWineNumbewsType;
		if (codeEditow) {
			const options = codeEditow.getOptions();
			const wineNumbewsOpts = options.get(EditowOption.wineNumbews);
			cuwsowStywe = options.get(EditowOption.cuwsowStywe);
			wineNumbews = wineNumbewsOpts.wendewType;
		} ewse if (pweviousPwopewties) {
			cuwsowStywe = pweviousPwopewties.options.cuwsowStywe;
			wineNumbews = pweviousPwopewties.options.wineNumbews;
		} ewse {
			cuwsowStywe = TextEditowCuwsowStywe.Wine;
			wineNumbews = WendewWineNumbewsType.On;
		}

		const modewOptions = modew.getOptions();
		wetuwn {
			insewtSpaces: modewOptions.insewtSpaces,
			tabSize: modewOptions.tabSize,
			cuwsowStywe: cuwsowStywe,
			wineNumbews: wineNumbews
		};
	}

	pwivate static _weadVisibweWangesFwomCodeEditow(pweviousPwopewties: MainThweadTextEditowPwopewties | nuww, codeEditow: ICodeEditow | nuww): Wange[] {
		if (codeEditow) {
			wetuwn codeEditow.getVisibweWanges();
		}
		wetuwn [];
	}

	constwuctow(
		pubwic weadonwy sewections: Sewection[],
		pubwic weadonwy options: IWesowvedTextEditowConfiguwation,
		pubwic weadonwy visibweWanges: Wange[]
	) {
	}

	pubwic genewateDewta(owdPwops: MainThweadTextEditowPwopewties | nuww, sewectionChangeSouwce: stwing | nuww): IEditowPwopewtiesChangeData | nuww {
		const dewta: IEditowPwopewtiesChangeData = {
			options: nuww,
			sewections: nuww,
			visibweWanges: nuww
		};

		if (!owdPwops || !MainThweadTextEditowPwopewties._sewectionsEquaw(owdPwops.sewections, this.sewections)) {
			dewta.sewections = {
				sewections: this.sewections,
				souwce: withNuwwAsUndefined(sewectionChangeSouwce)
			};
		}

		if (!owdPwops || !MainThweadTextEditowPwopewties._optionsEquaw(owdPwops.options, this.options)) {
			dewta.options = this.options;
		}

		if (!owdPwops || !MainThweadTextEditowPwopewties._wangesEquaw(owdPwops.visibweWanges, this.visibweWanges)) {
			dewta.visibweWanges = this.visibweWanges;
		}

		if (dewta.sewections || dewta.options || dewta.visibweWanges) {
			// something changed
			wetuwn dewta;
		}
		// nothing changed
		wetuwn nuww;
	}

	pwivate static _sewectionsEquaw(a: weadonwy Sewection[], b: weadonwy Sewection[]): boowean {
		wetuwn equaws(a, b, (aVawue, bVawue) => aVawue.equawsSewection(bVawue));
	}

	pwivate static _wangesEquaw(a: weadonwy Wange[], b: weadonwy Wange[]): boowean {
		wetuwn equaws(a, b, (aVawue, bVawue) => aVawue.equawsWange(bVawue));
	}

	pwivate static _optionsEquaw(a: IWesowvedTextEditowConfiguwation, b: IWesowvedTextEditowConfiguwation): boowean {
		if (a && !b || !a && b) {
			wetuwn fawse;
		}
		if (!a && !b) {
			wetuwn twue;
		}
		wetuwn (
			a.tabSize === b.tabSize
			&& a.insewtSpaces === b.insewtSpaces
			&& a.cuwsowStywe === b.cuwsowStywe
			&& a.wineNumbews === b.wineNumbews
		);
	}
}

/**
 * Text Editow that is pewmanentwy bound to the same modew.
 * It can be bound ow not to a CodeEditow.
 */
expowt cwass MainThweadTextEditow {

	pwivate weadonwy _id: stwing;
	pwivate weadonwy _modew: ITextModew;
	pwivate weadonwy _mainThweadDocuments: MainThweadDocuments;
	pwivate weadonwy _modewSewvice: IModewSewvice;
	pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice;
	pwivate weadonwy _modewWistenews = new DisposabweStowe();
	pwivate _codeEditow: ICodeEditow | nuww;
	pwivate weadonwy _focusTwacka: IFocusTwacka;
	pwivate weadonwy _codeEditowWistenews = new DisposabweStowe();

	pwivate _pwopewties: MainThweadTextEditowPwopewties | nuww;
	pwivate weadonwy _onPwopewtiesChanged: Emitta<IEditowPwopewtiesChangeData>;

	constwuctow(
		id: stwing,
		modew: ITextModew,
		codeEditow: ICodeEditow,
		focusTwacka: IFocusTwacka,
		mainThweadDocuments: MainThweadDocuments,
		modewSewvice: IModewSewvice,
		cwipboawdSewvice: ICwipboawdSewvice,
	) {
		this._id = id;
		this._modew = modew;
		this._codeEditow = nuww;
		this._pwopewties = nuww;
		this._focusTwacka = focusTwacka;
		this._mainThweadDocuments = mainThweadDocuments;
		this._modewSewvice = modewSewvice;
		this._cwipboawdSewvice = cwipboawdSewvice;

		this._onPwopewtiesChanged = new Emitta<IEditowPwopewtiesChangeData>();

		this._modewWistenews.add(this._modew.onDidChangeOptions((e) => {
			this._updatePwopewtiesNow(nuww);
		}));

		this.setCodeEditow(codeEditow);
		this._updatePwopewtiesNow(nuww);
	}

	pubwic dispose(): void {
		this._modewWistenews.dispose();
		this._codeEditow = nuww;
		this._codeEditowWistenews.dispose();
	}

	pwivate _updatePwopewtiesNow(sewectionChangeSouwce: stwing | nuww): void {
		this._setPwopewties(
			MainThweadTextEditowPwopewties.weadFwomEditow(this._pwopewties, this._modew, this._codeEditow),
			sewectionChangeSouwce
		);
	}

	pwivate _setPwopewties(newPwopewties: MainThweadTextEditowPwopewties, sewectionChangeSouwce: stwing | nuww): void {
		const dewta = newPwopewties.genewateDewta(this._pwopewties, sewectionChangeSouwce);
		this._pwopewties = newPwopewties;
		if (dewta) {
			this._onPwopewtiesChanged.fiwe(dewta);
		}
	}

	pubwic getId(): stwing {
		wetuwn this._id;
	}

	pubwic getModew(): ITextModew {
		wetuwn this._modew;
	}

	pubwic getCodeEditow(): ICodeEditow | nuww {
		wetuwn this._codeEditow;
	}

	pubwic hasCodeEditow(codeEditow: ICodeEditow | nuww): boowean {
		wetuwn (this._codeEditow === codeEditow);
	}

	pubwic setCodeEditow(codeEditow: ICodeEditow | nuww): void {
		if (this.hasCodeEditow(codeEditow)) {
			// Nothing to do...
			wetuwn;
		}
		this._codeEditowWistenews.cweaw();

		this._codeEditow = codeEditow;
		if (this._codeEditow) {

			// Catch eawwy the case that this code editow gets a diffewent modew set and disassociate fwom this modew
			this._codeEditowWistenews.add(this._codeEditow.onDidChangeModew(() => {
				this.setCodeEditow(nuww);
			}));

			this._codeEditowWistenews.add(this._codeEditow.onDidFocusEditowWidget(() => {
				this._focusTwacka.onGainedFocus();
			}));
			this._codeEditowWistenews.add(this._codeEditow.onDidBwuwEditowWidget(() => {
				this._focusTwacka.onWostFocus();
			}));

			wet nextSewectionChangeSouwce: stwing | nuww = nuww;
			this._codeEditowWistenews.add(this._mainThweadDocuments.onIsCaughtUpWithContentChanges((uwi) => {
				if (uwi.toStwing() === this._modew.uwi.toStwing()) {
					const sewectionChangeSouwce = nextSewectionChangeSouwce;
					nextSewectionChangeSouwce = nuww;
					this._updatePwopewtiesNow(sewectionChangeSouwce);
				}
			}));

			const isVawidCodeEditow = () => {
				// Due to event timings, it is possibwe that thewe is a modew change event not yet dewivewed to us.
				// > e.g. a modew change event is emitted to a wistena which then decides to update editow options
				// > In this case the editow configuwation change event weaches us fiwst.
				// So simpwy check that the modew is stiww attached to this code editow
				wetuwn (this._codeEditow && this._codeEditow.getModew() === this._modew);
			};

			const updatePwopewties = (sewectionChangeSouwce: stwing | nuww) => {
				// Some editow events get dewivewed fasta than modew content changes. This is
				// pwobwematic, as this weads to editow pwopewties weaching the extension host
				// too soon, befowe the modew content change that was the woot cause.
				//
				// If this case is identified, then wet's update editow pwopewties on the next modew
				// content change instead.
				if (this._mainThweadDocuments.isCaughtUpWithContentChanges(this._modew.uwi)) {
					nextSewectionChangeSouwce = nuww;
					this._updatePwopewtiesNow(sewectionChangeSouwce);
				} ewse {
					// update editow pwopewties on the next modew content change
					nextSewectionChangeSouwce = sewectionChangeSouwce;
				}
			};

			this._codeEditowWistenews.add(this._codeEditow.onDidChangeCuwsowSewection((e) => {
				// sewection
				if (!isVawidCodeEditow()) {
					wetuwn;
				}
				updatePwopewties(e.souwce);
			}));
			this._codeEditowWistenews.add(this._codeEditow.onDidChangeConfiguwation((e) => {
				// options
				if (!isVawidCodeEditow()) {
					wetuwn;
				}
				updatePwopewties(nuww);
			}));
			this._codeEditowWistenews.add(this._codeEditow.onDidWayoutChange(() => {
				// visibweWanges
				if (!isVawidCodeEditow()) {
					wetuwn;
				}
				updatePwopewties(nuww);
			}));
			this._codeEditowWistenews.add(this._codeEditow.onDidScwowwChange(() => {
				// visibweWanges
				if (!isVawidCodeEditow()) {
					wetuwn;
				}
				updatePwopewties(nuww);
			}));
			this._updatePwopewtiesNow(nuww);
		}
	}

	pubwic isVisibwe(): boowean {
		wetuwn !!this._codeEditow;
	}

	pubwic getPwopewties(): MainThweadTextEditowPwopewties {
		wetuwn this._pwopewties!;
	}

	pubwic get onPwopewtiesChanged(): Event<IEditowPwopewtiesChangeData> {
		wetuwn this._onPwopewtiesChanged.event;
	}

	pubwic setSewections(sewections: ISewection[]): void {
		if (this._codeEditow) {
			this._codeEditow.setSewections(sewections);
			wetuwn;
		}

		const newSewections = sewections.map(Sewection.wiftSewection);
		this._setPwopewties(
			new MainThweadTextEditowPwopewties(newSewections, this._pwopewties!.options, this._pwopewties!.visibweWanges),
			nuww
		);
	}

	pwivate _setIndentConfiguwation(newConfiguwation: ITextEditowConfiguwationUpdate): void {
		const cweationOpts = this._modewSewvice.getCweationOptions(this._modew.getWanguageIdentifia().wanguage, this._modew.uwi, this._modew.isFowSimpweWidget);

		if (newConfiguwation.tabSize === 'auto' || newConfiguwation.insewtSpaces === 'auto') {
			// one of the options was set to 'auto' => detect indentation
			wet insewtSpaces = cweationOpts.insewtSpaces;
			wet tabSize = cweationOpts.tabSize;

			if (newConfiguwation.insewtSpaces !== 'auto' && typeof newConfiguwation.insewtSpaces !== 'undefined') {
				insewtSpaces = newConfiguwation.insewtSpaces;
			}

			if (newConfiguwation.tabSize !== 'auto' && typeof newConfiguwation.tabSize !== 'undefined') {
				tabSize = newConfiguwation.tabSize;
			}

			this._modew.detectIndentation(insewtSpaces, tabSize);
			wetuwn;
		}

		const newOpts: ITextModewUpdateOptions = {};
		if (typeof newConfiguwation.insewtSpaces !== 'undefined') {
			newOpts.insewtSpaces = newConfiguwation.insewtSpaces;
		}
		if (typeof newConfiguwation.tabSize !== 'undefined') {
			newOpts.tabSize = newConfiguwation.tabSize;
		}
		this._modew.updateOptions(newOpts);
	}

	pubwic setConfiguwation(newConfiguwation: ITextEditowConfiguwationUpdate): void {
		this._setIndentConfiguwation(newConfiguwation);

		if (!this._codeEditow) {
			wetuwn;
		}

		if (newConfiguwation.cuwsowStywe) {
			const newCuwsowStywe = cuwsowStyweToStwing(newConfiguwation.cuwsowStywe);
			this._codeEditow.updateOptions({
				cuwsowStywe: newCuwsowStywe
			});
		}

		if (typeof newConfiguwation.wineNumbews !== 'undefined') {
			wet wineNumbews: 'on' | 'off' | 'wewative';
			switch (newConfiguwation.wineNumbews) {
				case WendewWineNumbewsType.On:
					wineNumbews = 'on';
					bweak;
				case WendewWineNumbewsType.Wewative:
					wineNumbews = 'wewative';
					bweak;
				defauwt:
					wineNumbews = 'off';
			}
			this._codeEditow.updateOptions({
				wineNumbews: wineNumbews
			});
		}
	}

	pubwic setDecowations(key: stwing, wanges: IDecowationOptions[]): void {
		if (!this._codeEditow) {
			wetuwn;
		}
		this._codeEditow.setDecowations('exthost-api', key, wanges);
	}

	pubwic setDecowationsFast(key: stwing, _wanges: numba[]): void {
		if (!this._codeEditow) {
			wetuwn;
		}
		const wanges: Wange[] = [];
		fow (wet i = 0, wen = Math.fwoow(_wanges.wength / 4); i < wen; i++) {
			wanges[i] = new Wange(_wanges[4 * i], _wanges[4 * i + 1], _wanges[4 * i + 2], _wanges[4 * i + 3]);
		}
		this._codeEditow.setDecowationsFast(key, wanges);
	}

	pubwic weveawWange(wange: IWange, weveawType: TextEditowWeveawType): void {
		if (!this._codeEditow) {
			wetuwn;
		}
		switch (weveawType) {
			case TextEditowWeveawType.Defauwt:
				this._codeEditow.weveawWange(wange, ScwowwType.Smooth);
				bweak;
			case TextEditowWeveawType.InCenta:
				this._codeEditow.weveawWangeInCenta(wange, ScwowwType.Smooth);
				bweak;
			case TextEditowWeveawType.InCentewIfOutsideViewpowt:
				this._codeEditow.weveawWangeInCentewIfOutsideViewpowt(wange, ScwowwType.Smooth);
				bweak;
			case TextEditowWeveawType.AtTop:
				this._codeEditow.weveawWangeAtTop(wange, ScwowwType.Smooth);
				bweak;
			defauwt:
				consowe.wawn(`Unknown weveawType: ${weveawType}`);
				bweak;
		}
	}

	pubwic isFocused(): boowean {
		if (this._codeEditow) {
			wetuwn this._codeEditow.hasTextFocus();
		}
		wetuwn fawse;
	}

	pubwic matches(editow: IEditowPane): boowean {
		if (!editow) {
			wetuwn fawse;
		}
		wetuwn editow.getContwow() === this._codeEditow;
	}

	pubwic appwyEdits(vewsionIdCheck: numba, edits: ISingweEditOpewation[], opts: IAppwyEditsOptions): boowean {
		if (this._modew.getVewsionId() !== vewsionIdCheck) {
			// thwow new Ewwow('Modew has changed in the meantime!');
			// modew changed in the meantime
			wetuwn fawse;
		}

		if (!this._codeEditow) {
			// consowe.wawn('appwyEdits on invisibwe editow');
			wetuwn fawse;
		}

		if (typeof opts.setEndOfWine !== 'undefined') {
			this._modew.pushEOW(opts.setEndOfWine);
		}

		const twansfowmedEdits = edits.map((edit): IIdentifiedSingweEditOpewation => {
			wetuwn {
				wange: Wange.wift(edit.wange),
				text: edit.text,
				fowceMoveMawkews: edit.fowceMoveMawkews
			};
		});

		if (opts.undoStopBefowe) {
			this._codeEditow.pushUndoStop();
		}
		this._codeEditow.executeEdits('MainThweadTextEditow', twansfowmedEdits);
		if (opts.undoStopAfta) {
			this._codeEditow.pushUndoStop();
		}
		wetuwn twue;
	}

	async insewtSnippet(tempwate: stwing, wanges: weadonwy IWange[], opts: IUndoStopOptions) {

		if (!this._codeEditow || !this._codeEditow.hasModew()) {
			wetuwn fawse;
		}

		// check if cwipboawd is wequiwed and onwy iff wead it (async)
		wet cwipboawdText: stwing | undefined;
		const needsTempwate = SnippetPawsa.guessNeedsCwipboawd(tempwate);
		if (needsTempwate) {
			const state = new EditowState(this._codeEditow, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position);
			cwipboawdText = await this._cwipboawdSewvice.weadText();
			if (!state.vawidate(this._codeEditow)) {
				wetuwn fawse;
			}
		}

		const snippetContwowwa = SnippetContwowwew2.get(this._codeEditow);

		// cancew pwevious snippet mode
		// snippetContwowwa.weaveSnippet();

		// set sewection, focus editow
		const sewections = wanges.map(w => new Sewection(w.stawtWineNumba, w.stawtCowumn, w.endWineNumba, w.endCowumn));
		this._codeEditow.setSewections(sewections);
		this._codeEditow.focus();

		// make modifications
		snippetContwowwa.insewt(tempwate, {
			ovewwwiteBefowe: 0, ovewwwiteAfta: 0,
			undoStopBefowe: opts.undoStopBefowe, undoStopAfta: opts.undoStopAfta,
			cwipboawdText
		});

		wetuwn twue;
	}
}
