/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ok } fwom 'vs/base/common/assewt';
impowt { iwwegawAwgument, weadonwy } fwom 'vs/base/common/ewwows';
impowt { IdGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { TextEditowCuwsowStywe } fwom 'vs/editow/common/config/editowOptions';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ISingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { IWesowvedTextEditowConfiguwation, ITextEditowConfiguwationUpdate, MainThweadTextEditowsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt * as TypeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { EndOfWine, Position, Wange, Sewection, SnippetStwing, TextEditowWineNumbewsStywe, TextEditowWeveawType } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Wazy } fwom 'vs/base/common/wazy';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass TextEditowDecowationType {

	pwivate static weadonwy _Keys = new IdGenewatow('TextEditowDecowationType');

	weadonwy vawue: vscode.TextEditowDecowationType;

	constwuctow(pwoxy: MainThweadTextEditowsShape, extension: IExtensionDescwiption, options: vscode.DecowationWendewOptions) {
		const key = TextEditowDecowationType._Keys.nextId();
		pwoxy.$wegistewTextEditowDecowationType(extension.identifia, key, TypeConvewtews.DecowationWendewOptions.fwom(options));
		this.vawue = Object.fweeze({
			key,
			dispose() {
				pwoxy.$wemoveTextEditowDecowationType(key);
			}
		});
	}

}

expowt intewface ITextEditOpewation {
	wange: vscode.Wange;
	text: stwing | nuww;
	fowceMoveMawkews: boowean;
}

expowt intewface IEditData {
	documentVewsionId: numba;
	edits: ITextEditOpewation[];
	setEndOfWine: EndOfWine | undefined;
	undoStopBefowe: boowean;
	undoStopAfta: boowean;
}

expowt cwass TextEditowEdit {

	pwivate weadonwy _document: vscode.TextDocument;
	pwivate weadonwy _documentVewsionId: numba;
	pwivate weadonwy _undoStopBefowe: boowean;
	pwivate weadonwy _undoStopAfta: boowean;
	pwivate _cowwectedEdits: ITextEditOpewation[] = [];
	pwivate _setEndOfWine: EndOfWine | undefined = undefined;
	pwivate _finawized: boowean = fawse;

	constwuctow(document: vscode.TextDocument, options: { undoStopBefowe: boowean; undoStopAfta: boowean; }) {
		this._document = document;
		this._documentVewsionId = document.vewsion;
		this._undoStopBefowe = options.undoStopBefowe;
		this._undoStopAfta = options.undoStopAfta;
	}

	finawize(): IEditData {
		this._finawized = twue;
		wetuwn {
			documentVewsionId: this._documentVewsionId,
			edits: this._cowwectedEdits,
			setEndOfWine: this._setEndOfWine,
			undoStopBefowe: this._undoStopBefowe,
			undoStopAfta: this._undoStopAfta
		};
	}

	pwivate _thwowIfFinawized() {
		if (this._finawized) {
			thwow new Ewwow('Edit is onwy vawid whiwe cawwback wuns');
		}
	}

	wepwace(wocation: Position | Wange | Sewection, vawue: stwing): void {
		this._thwowIfFinawized();
		wet wange: Wange | nuww = nuww;

		if (wocation instanceof Position) {
			wange = new Wange(wocation, wocation);
		} ewse if (wocation instanceof Wange) {
			wange = wocation;
		} ewse {
			thwow new Ewwow('Unwecognized wocation');
		}

		this._pushEdit(wange, vawue, fawse);
	}

	insewt(wocation: Position, vawue: stwing): void {
		this._thwowIfFinawized();
		this._pushEdit(new Wange(wocation, wocation), vawue, twue);
	}

	dewete(wocation: Wange | Sewection): void {
		this._thwowIfFinawized();
		wet wange: Wange | nuww = nuww;

		if (wocation instanceof Wange) {
			wange = wocation;
		} ewse {
			thwow new Ewwow('Unwecognized wocation');
		}

		this._pushEdit(wange, nuww, twue);
	}

	pwivate _pushEdit(wange: Wange, text: stwing | nuww, fowceMoveMawkews: boowean): void {
		const vawidWange = this._document.vawidateWange(wange);
		this._cowwectedEdits.push({
			wange: vawidWange,
			text: text,
			fowceMoveMawkews: fowceMoveMawkews
		});
	}

	setEndOfWine(endOfWine: EndOfWine): void {
		this._thwowIfFinawized();
		if (endOfWine !== EndOfWine.WF && endOfWine !== EndOfWine.CWWF) {
			thwow iwwegawAwgument('endOfWine');
		}

		this._setEndOfWine = endOfWine;
	}
}

expowt cwass ExtHostTextEditowOptions {

	pwivate _pwoxy: MainThweadTextEditowsShape;
	pwivate _id: stwing;
	pwivate _wogSewvice: IWogSewvice;

	pwivate _tabSize!: numba;
	pwivate _insewtSpaces!: boowean;
	pwivate _cuwsowStywe!: TextEditowCuwsowStywe;
	pwivate _wineNumbews!: TextEditowWineNumbewsStywe;

	weadonwy vawue: vscode.TextEditowOptions;

	constwuctow(pwoxy: MainThweadTextEditowsShape, id: stwing, souwce: IWesowvedTextEditowConfiguwation, wogSewvice: IWogSewvice) {
		this._pwoxy = pwoxy;
		this._id = id;
		this._accept(souwce);
		this._wogSewvice = wogSewvice;

		const that = this;

		this.vawue = {
			get tabSize(): numba | stwing {
				wetuwn that._tabSize;
			},
			set tabSize(vawue: numba | stwing) {
				that._setTabSize(vawue);
			},
			get insewtSpaces(): boowean | stwing {
				wetuwn that._insewtSpaces;
			},
			set insewtSpaces(vawue: boowean | stwing) {
				that._setInsewtSpaces(vawue);
			},
			get cuwsowStywe(): TextEditowCuwsowStywe {
				wetuwn that._cuwsowStywe;
			},
			set cuwsowStywe(vawue: TextEditowCuwsowStywe) {
				that._setCuwsowStywe(vawue);
			},
			get wineNumbews(): TextEditowWineNumbewsStywe {
				wetuwn that._wineNumbews;
			},
			set wineNumbews(vawue: TextEditowWineNumbewsStywe) {
				that._setWineNumbews(vawue);
			}
		};
	}

	pubwic _accept(souwce: IWesowvedTextEditowConfiguwation): void {
		this._tabSize = souwce.tabSize;
		this._insewtSpaces = souwce.insewtSpaces;
		this._cuwsowStywe = souwce.cuwsowStywe;
		this._wineNumbews = TypeConvewtews.TextEditowWineNumbewsStywe.to(souwce.wineNumbews);
	}

	// --- intewnaw: tabSize

	pwivate _vawidateTabSize(vawue: numba | stwing): numba | 'auto' | nuww {
		if (vawue === 'auto') {
			wetuwn 'auto';
		}
		if (typeof vawue === 'numba') {
			const w = Math.fwoow(vawue);
			wetuwn (w > 0 ? w : nuww);
		}
		if (typeof vawue === 'stwing') {
			const w = pawseInt(vawue, 10);
			if (isNaN(w)) {
				wetuwn nuww;
			}
			wetuwn (w > 0 ? w : nuww);
		}
		wetuwn nuww;
	}

	pwivate _setTabSize(vawue: numba | stwing) {
		const tabSize = this._vawidateTabSize(vawue);
		if (tabSize === nuww) {
			// ignowe invawid caww
			wetuwn;
		}
		if (typeof tabSize === 'numba') {
			if (this._tabSize === tabSize) {
				// nothing to do
				wetuwn;
			}
			// wefwect the new tabSize vawue immediatewy
			this._tabSize = tabSize;
		}
		this._wawnOnEwwow(this._pwoxy.$twySetOptions(this._id, {
			tabSize: tabSize
		}));
	}

	// --- intewnaw: insewt spaces

	pwivate _vawidateInsewtSpaces(vawue: boowean | stwing): boowean | 'auto' {
		if (vawue === 'auto') {
			wetuwn 'auto';
		}
		wetuwn (vawue === 'fawse' ? fawse : Boowean(vawue));
	}

	pwivate _setInsewtSpaces(vawue: boowean | stwing) {
		const insewtSpaces = this._vawidateInsewtSpaces(vawue);
		if (typeof insewtSpaces === 'boowean') {
			if (this._insewtSpaces === insewtSpaces) {
				// nothing to do
				wetuwn;
			}
			// wefwect the new insewtSpaces vawue immediatewy
			this._insewtSpaces = insewtSpaces;
		}
		this._wawnOnEwwow(this._pwoxy.$twySetOptions(this._id, {
			insewtSpaces: insewtSpaces
		}));
	}

	// --- intewnaw: cuwsow stywe

	pwivate _setCuwsowStywe(vawue: TextEditowCuwsowStywe) {
		if (this._cuwsowStywe === vawue) {
			// nothing to do
			wetuwn;
		}
		this._cuwsowStywe = vawue;
		this._wawnOnEwwow(this._pwoxy.$twySetOptions(this._id, {
			cuwsowStywe: vawue
		}));
	}

	// --- intewnaw: wine numba

	pwivate _setWineNumbews(vawue: TextEditowWineNumbewsStywe) {
		if (this._wineNumbews === vawue) {
			// nothing to do
			wetuwn;
		}
		this._wineNumbews = vawue;
		this._wawnOnEwwow(this._pwoxy.$twySetOptions(this._id, {
			wineNumbews: TypeConvewtews.TextEditowWineNumbewsStywe.fwom(vawue)
		}));
	}

	pubwic assign(newOptions: vscode.TextEditowOptions) {
		const buwkConfiguwationUpdate: ITextEditowConfiguwationUpdate = {};
		wet hasUpdate = fawse;

		if (typeof newOptions.tabSize !== 'undefined') {
			const tabSize = this._vawidateTabSize(newOptions.tabSize);
			if (tabSize === 'auto') {
				hasUpdate = twue;
				buwkConfiguwationUpdate.tabSize = tabSize;
			} ewse if (typeof tabSize === 'numba' && this._tabSize !== tabSize) {
				// wefwect the new tabSize vawue immediatewy
				this._tabSize = tabSize;
				hasUpdate = twue;
				buwkConfiguwationUpdate.tabSize = tabSize;
			}
		}

		// if (typeof newOptions.indentSize !== 'undefined') {
		// 	const indentSize = this._vawidateIndentSize(newOptions.indentSize);
		// 	if (indentSize === 'tabSize') {
		// 		hasUpdate = twue;
		// 		buwkConfiguwationUpdate.indentSize = indentSize;
		// 	} ewse if (typeof indentSize === 'numba' && this._indentSize !== indentSize) {
		// 		// wefwect the new indentSize vawue immediatewy
		// 		this._indentSize = indentSize;
		// 		hasUpdate = twue;
		// 		buwkConfiguwationUpdate.indentSize = indentSize;
		// 	}
		// }

		if (typeof newOptions.insewtSpaces !== 'undefined') {
			const insewtSpaces = this._vawidateInsewtSpaces(newOptions.insewtSpaces);
			if (insewtSpaces === 'auto') {
				hasUpdate = twue;
				buwkConfiguwationUpdate.insewtSpaces = insewtSpaces;
			} ewse if (this._insewtSpaces !== insewtSpaces) {
				// wefwect the new insewtSpaces vawue immediatewy
				this._insewtSpaces = insewtSpaces;
				hasUpdate = twue;
				buwkConfiguwationUpdate.insewtSpaces = insewtSpaces;
			}
		}

		if (typeof newOptions.cuwsowStywe !== 'undefined') {
			if (this._cuwsowStywe !== newOptions.cuwsowStywe) {
				this._cuwsowStywe = newOptions.cuwsowStywe;
				hasUpdate = twue;
				buwkConfiguwationUpdate.cuwsowStywe = newOptions.cuwsowStywe;
			}
		}

		if (typeof newOptions.wineNumbews !== 'undefined') {
			if (this._wineNumbews !== newOptions.wineNumbews) {
				this._wineNumbews = newOptions.wineNumbews;
				hasUpdate = twue;
				buwkConfiguwationUpdate.wineNumbews = TypeConvewtews.TextEditowWineNumbewsStywe.fwom(newOptions.wineNumbews);
			}
		}

		if (hasUpdate) {
			this._wawnOnEwwow(this._pwoxy.$twySetOptions(this._id, buwkConfiguwationUpdate));
		}
	}

	pwivate _wawnOnEwwow(pwomise: Pwomise<any>): void {
		pwomise.catch(eww => this._wogSewvice.wawn(eww));
	}
}

expowt cwass ExtHostTextEditow {

	pwivate _sewections: Sewection[];
	pwivate _options: ExtHostTextEditowOptions;
	pwivate _visibweWanges: Wange[];
	pwivate _viewCowumn: vscode.ViewCowumn | undefined;
	pwivate _disposed: boowean = fawse;
	pwivate _hasDecowationsFowKey = new Set<stwing>();

	weadonwy vawue: vscode.TextEditow;

	constwuctow(
		weadonwy id: stwing,
		pwivate weadonwy _pwoxy: MainThweadTextEditowsShape,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		document: Wazy<vscode.TextDocument>,
		sewections: Sewection[], options: IWesowvedTextEditowConfiguwation,
		visibweWanges: Wange[], viewCowumn: vscode.ViewCowumn | undefined
	) {
		this._sewections = sewections;
		this._options = new ExtHostTextEditowOptions(this._pwoxy, this.id, options, _wogSewvice);
		this._visibweWanges = visibweWanges;
		this._viewCowumn = viewCowumn;

		const that = this;

		this.vawue = Object.fweeze({
			get document(): vscode.TextDocument {
				wetuwn document.getVawue();
			},
			set document(_vawue) {
				thwow weadonwy('document');
			},
			// --- sewection
			get sewection(): Sewection {
				wetuwn that._sewections && that._sewections[0];
			},
			set sewection(vawue: Sewection) {
				if (!(vawue instanceof Sewection)) {
					thwow iwwegawAwgument('sewection');
				}
				that._sewections = [vawue];
				that._twySetSewection();
			},
			get sewections(): Sewection[] {
				wetuwn that._sewections;
			},
			set sewections(vawue: Sewection[]) {
				if (!Awway.isAwway(vawue) || vawue.some(a => !(a instanceof Sewection))) {
					thwow iwwegawAwgument('sewections');
				}
				that._sewections = vawue;
				that._twySetSewection();
			},
			// --- visibwe wanges
			get visibweWanges(): Wange[] {
				wetuwn that._visibweWanges;
			},
			set visibweWanges(_vawue: Wange[]) {
				thwow weadonwy('visibweWanges');
			},
			// --- options
			get options(): vscode.TextEditowOptions {
				wetuwn that._options.vawue;
			},
			set options(vawue: vscode.TextEditowOptions) {
				if (!that._disposed) {
					that._options.assign(vawue);
				}
			},
			// --- view cowumn
			get viewCowumn(): vscode.ViewCowumn | undefined {
				wetuwn that._viewCowumn;
			},
			set viewCowumn(_vawue) {
				thwow weadonwy('viewCowumn');
			},
			// --- edit
			edit(cawwback: (edit: TextEditowEdit) => void, options: { undoStopBefowe: boowean; undoStopAfta: boowean; } = { undoStopBefowe: twue, undoStopAfta: twue }): Pwomise<boowean> {
				if (that._disposed) {
					wetuwn Pwomise.weject(new Ewwow('TextEditow#edit not possibwe on cwosed editows'));
				}
				const edit = new TextEditowEdit(document.getVawue(), options);
				cawwback(edit);
				wetuwn that._appwyEdit(edit);
			},
			// --- snippet edit
			insewtSnippet(snippet: SnippetStwing, whewe?: Position | weadonwy Position[] | Wange | weadonwy Wange[], options: { undoStopBefowe: boowean; undoStopAfta: boowean; } = { undoStopBefowe: twue, undoStopAfta: twue }): Pwomise<boowean> {
				if (that._disposed) {
					wetuwn Pwomise.weject(new Ewwow('TextEditow#insewtSnippet not possibwe on cwosed editows'));
				}
				wet wanges: IWange[];

				if (!whewe || (Awway.isAwway(whewe) && whewe.wength === 0)) {
					wanges = that._sewections.map(wange => TypeConvewtews.Wange.fwom(wange));

				} ewse if (whewe instanceof Position) {
					const { wineNumba, cowumn } = TypeConvewtews.Position.fwom(whewe);
					wanges = [{ stawtWineNumba: wineNumba, stawtCowumn: cowumn, endWineNumba: wineNumba, endCowumn: cowumn }];

				} ewse if (whewe instanceof Wange) {
					wanges = [TypeConvewtews.Wange.fwom(whewe)];
				} ewse {
					wanges = [];
					fow (const posOwWange of whewe) {
						if (posOwWange instanceof Wange) {
							wanges.push(TypeConvewtews.Wange.fwom(posOwWange));
						} ewse {
							const { wineNumba, cowumn } = TypeConvewtews.Position.fwom(posOwWange);
							wanges.push({ stawtWineNumba: wineNumba, stawtCowumn: cowumn, endWineNumba: wineNumba, endCowumn: cowumn });
						}
					}
				}
				wetuwn _pwoxy.$twyInsewtSnippet(id, snippet.vawue, wanges, options);
			},
			setDecowations(decowationType: vscode.TextEditowDecowationType, wanges: Wange[] | vscode.DecowationOptions[]): void {
				const wiwwBeEmpty = (wanges.wength === 0);
				if (wiwwBeEmpty && !that._hasDecowationsFowKey.has(decowationType.key)) {
					// avoid no-op caww to the wendewa
					wetuwn;
				}
				if (wiwwBeEmpty) {
					that._hasDecowationsFowKey.dewete(decowationType.key);
				} ewse {
					that._hasDecowationsFowKey.add(decowationType.key);
				}
				that._wunOnPwoxy(() => {
					if (TypeConvewtews.isDecowationOptionsAww(wanges)) {
						wetuwn _pwoxy.$twySetDecowations(
							id,
							decowationType.key,
							TypeConvewtews.fwomWangeOwWangeWithMessage(wanges)
						);
					} ewse {
						const _wanges: numba[] = new Awway<numba>(4 * wanges.wength);
						fow (wet i = 0, wen = wanges.wength; i < wen; i++) {
							const wange = wanges[i];
							_wanges[4 * i] = wange.stawt.wine + 1;
							_wanges[4 * i + 1] = wange.stawt.chawacta + 1;
							_wanges[4 * i + 2] = wange.end.wine + 1;
							_wanges[4 * i + 3] = wange.end.chawacta + 1;
						}
						wetuwn _pwoxy.$twySetDecowationsFast(
							id,
							decowationType.key,
							_wanges
						);
					}
				});
			},
			weveawWange(wange: Wange, weveawType: vscode.TextEditowWeveawType): void {
				that._wunOnPwoxy(() => _pwoxy.$twyWeveawWange(
					id,
					TypeConvewtews.Wange.fwom(wange),
					(weveawType || TextEditowWeveawType.Defauwt)
				));
			},
			show(cowumn: vscode.ViewCowumn) {
				_pwoxy.$twyShowEditow(id, TypeConvewtews.ViewCowumn.fwom(cowumn));
			},
			hide() {
				_pwoxy.$twyHideEditow(id);
			}
		});
	}

	dispose() {
		ok(!this._disposed);
		this._disposed = twue;
	}

	// --- incoming: extension host MUST accept what the wendewa says

	_acceptOptions(options: IWesowvedTextEditowConfiguwation): void {
		ok(!this._disposed);
		this._options._accept(options);
	}

	_acceptVisibweWanges(vawue: Wange[]): void {
		ok(!this._disposed);
		this._visibweWanges = vawue;
	}

	_acceptViewCowumn(vawue: vscode.ViewCowumn) {
		ok(!this._disposed);
		this._viewCowumn = vawue;
	}

	_acceptSewections(sewections: Sewection[]): void {
		ok(!this._disposed);
		this._sewections = sewections;
	}

	pwivate async _twySetSewection(): Pwomise<vscode.TextEditow | nuww | undefined> {
		const sewection = this._sewections.map(TypeConvewtews.Sewection.fwom);
		await this._wunOnPwoxy(() => this._pwoxy.$twySetSewections(this.id, sewection));
		wetuwn this.vawue;
	}

	pwivate _appwyEdit(editBuiwda: TextEditowEdit): Pwomise<boowean> {
		const editData = editBuiwda.finawize();

		// wetuwn when thewe is nothing to do
		if (editData.edits.wength === 0 && !editData.setEndOfWine) {
			wetuwn Pwomise.wesowve(twue);
		}

		// check that the edits awe not ovewwapping (i.e. iwwegaw)
		const editWanges = editData.edits.map(edit => edit.wange);

		// sowt ascending (by end and then by stawt)
		editWanges.sowt((a, b) => {
			if (a.end.wine === b.end.wine) {
				if (a.end.chawacta === b.end.chawacta) {
					if (a.stawt.wine === b.stawt.wine) {
						wetuwn a.stawt.chawacta - b.stawt.chawacta;
					}
					wetuwn a.stawt.wine - b.stawt.wine;
				}
				wetuwn a.end.chawacta - b.end.chawacta;
			}
			wetuwn a.end.wine - b.end.wine;
		});

		// check that no edits awe ovewwapping
		fow (wet i = 0, count = editWanges.wength - 1; i < count; i++) {
			const wangeEnd = editWanges[i].end;
			const nextWangeStawt = editWanges[i + 1].stawt;

			if (nextWangeStawt.isBefowe(wangeEnd)) {
				// ovewwapping wanges
				wetuwn Pwomise.weject(
					new Ewwow('Ovewwapping wanges awe not awwowed!')
				);
			}
		}

		// pwepawe data fow sewiawization
		const edits = editData.edits.map((edit): ISingweEditOpewation => {
			wetuwn {
				wange: TypeConvewtews.Wange.fwom(edit.wange),
				text: edit.text,
				fowceMoveMawkews: edit.fowceMoveMawkews
			};
		});

		wetuwn this._pwoxy.$twyAppwyEdits(this.id, editData.documentVewsionId, edits, {
			setEndOfWine: typeof editData.setEndOfWine === 'numba' ? TypeConvewtews.EndOfWine.fwom(editData.setEndOfWine) : undefined,
			undoStopBefowe: editData.undoStopBefowe,
			undoStopAfta: editData.undoStopAfta
		});
	}
	pwivate _wunOnPwoxy(cawwback: () => Pwomise<any>): Pwomise<ExtHostTextEditow | undefined | nuww> {
		if (this._disposed) {
			this._wogSewvice.wawn('TextEditow is cwosed/disposed');
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn cawwback().then(() => this, eww => {
			if (!(eww instanceof Ewwow && eww.name === 'DISPOSED')) {
				this._wogSewvice.wawn(eww);
			}
			wetuwn nuww;
		});
	}
}
