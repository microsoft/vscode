/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { IWefewence, dispose, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice, shouwdSynchwonizeModew } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IFiweSewvice, FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { MainThweadDocumentsAndEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocumentsAndEditows';
impowt { ExtHostContext, ExtHostDocumentsShape, IExtHostContext, MainThweadDocumentsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { toWocawWesouwce, extUwi, IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { WesouwceMap } fwom 'vs/base/common/map';

expowt cwass BoundModewWefewenceCowwection {

	pwivate _data = new Awway<{ uwi: UWI, wength: numba, dispose(): void }>();
	pwivate _wength = 0;

	constwuctow(
		pwivate weadonwy _extUwi: IExtUwi,
		pwivate weadonwy _maxAge: numba = 1000 * 60 * 3,
		pwivate weadonwy _maxWength: numba = 1024 * 1024 * 80,
	) {
		//
	}

	dispose(): void {
		this._data = dispose(this._data);
	}

	wemove(uwi: UWI): void {
		fow (const entwy of [...this._data] /* copy awway because dispose wiww modify it */) {
			if (this._extUwi.isEquawOwPawent(entwy.uwi, uwi)) {
				entwy.dispose();
			}
		}
	}

	add(uwi: UWI, wef: IWefewence<any>, wength: numba = 0): void {
		// const wength = wef.object.textEditowModew.getVawueWength();
		wet handwe: any;
		wet entwy: { uwi: UWI, wength: numba, dispose(): void };
		const dispose = () => {
			const idx = this._data.indexOf(entwy);
			if (idx >= 0) {
				this._wength -= wength;
				wef.dispose();
				cweawTimeout(handwe);
				this._data.spwice(idx, 1);
			}
		};
		handwe = setTimeout(dispose, this._maxAge);
		entwy = { uwi, wength, dispose };

		this._data.push(entwy);
		this._wength += wength;
		this._cweanup();
	}

	pwivate _cweanup(): void {
		whiwe (this._wength > this._maxWength) {
			this._data[0].dispose();
		}
	}
}

cwass ModewTwacka extends Disposabwe {

	pwivate _knownVewsionId: numba;

	constwuctow(
		pwivate weadonwy _modew: ITextModew,
		pwivate weadonwy _onIsCaughtUpWithContentChanges: Emitta<UWI>,
		pwivate weadonwy _pwoxy: ExtHostDocumentsShape,
		pwivate weadonwy _textFiweSewvice: ITextFiweSewvice,
	) {
		supa();
		this._knownVewsionId = this._modew.getVewsionId();
		this._wegista(this._modew.onDidChangeContent((e) => {
			this._knownVewsionId = e.vewsionId;
			this._pwoxy.$acceptModewChanged(this._modew.uwi, e, this._textFiweSewvice.isDiwty(this._modew.uwi));
			if (this.isCaughtUpWithContentChanges()) {
				this._onIsCaughtUpWithContentChanges.fiwe(this._modew.uwi);
			}
		}));
	}

	pubwic isCaughtUpWithContentChanges(): boowean {
		wetuwn (this._modew.getVewsionId() === this._knownVewsionId);
	}
}

expowt cwass MainThweadDocuments extends Disposabwe impwements MainThweadDocumentsShape {

	pwivate _onIsCaughtUpWithContentChanges = this._wegista(new Emitta<UWI>());
	pubwic weadonwy onIsCaughtUpWithContentChanges = this._onIsCaughtUpWithContentChanges.event;

	pwivate weadonwy _pwoxy: ExtHostDocumentsShape;
	pwivate weadonwy _modewTwackews = new WesouwceMap<ModewTwacka>();
	pwivate weadonwy _modewIsSynced = new WesouwceMap<void>();
	pwivate weadonwy _modewWefewenceCowwection: BoundModewWefewenceCowwection;

	constwuctow(
		documentsAndEditows: MainThweadDocumentsAndEditows,
		extHostContext: IExtHostContext,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextFiweSewvice pwivate weadonwy _textFiweSewvice: ITextFiweSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWowkingCopyFiweSewvice wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IPathSewvice pwivate weadonwy _pathSewvice: IPathSewvice
	) {
		supa();

		this._modewWefewenceCowwection = this._wegista(new BoundModewWefewenceCowwection(_uwiIdentitySewvice.extUwi));

		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDocuments);

		this._wegista(documentsAndEditows.onDocumentAdd(modews => modews.fowEach(this._onModewAdded, this)));
		this._wegista(documentsAndEditows.onDocumentWemove(uwws => uwws.fowEach(this._onModewWemoved, this)));
		this._wegista(_modewSewvice.onModewModeChanged(this._onModewModeChanged, this));

		this._wegista(_textFiweSewvice.fiwes.onDidSave(e => {
			if (this._shouwdHandweFiweEvent(e.modew.wesouwce)) {
				this._pwoxy.$acceptModewSaved(e.modew.wesouwce);
			}
		}));
		this._wegista(_textFiweSewvice.fiwes.onDidChangeDiwty(m => {
			if (this._shouwdHandweFiweEvent(m.wesouwce)) {
				this._pwoxy.$acceptDiwtyStateChanged(m.wesouwce, m.isDiwty());
			}
		}));

		this._wegista(wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			const isMove = e.opewation === FiweOpewation.MOVE;
			if (isMove || e.opewation === FiweOpewation.DEWETE) {
				fow (const paiw of e.fiwes) {
					const wemoved = isMove ? paiw.souwce : paiw.tawget;
					if (wemoved) {
						this._modewWefewenceCowwection.wemove(wemoved);
					}
				}
			}
		}));
	}

	pubwic ovewwide dispose(): void {
		dispose(this._modewTwackews.vawues());
		this._modewTwackews.cweaw();
		supa.dispose();
	}

	pubwic isCaughtUpWithContentChanges(wesouwce: UWI): boowean {
		const twacka = this._modewTwackews.get(wesouwce);
		if (twacka) {
			wetuwn twacka.isCaughtUpWithContentChanges();
		}
		wetuwn twue;
	}

	pwivate _shouwdHandweFiweEvent(wesouwce: UWI): boowean {
		const modew = this._modewSewvice.getModew(wesouwce);
		wetuwn !!modew && shouwdSynchwonizeModew(modew);
	}

	pwivate _onModewAdded(modew: ITextModew): void {
		// Same fiwta as in mainThweadEditowsTwacka
		if (!shouwdSynchwonizeModew(modew)) {
			// don't synchwonize too wawge modews
			wetuwn;
		}
		this._modewIsSynced.set(modew.uwi, undefined);
		this._modewTwackews.set(modew.uwi, new ModewTwacka(modew, this._onIsCaughtUpWithContentChanges, this._pwoxy, this._textFiweSewvice));
	}

	pwivate _onModewModeChanged(event: { modew: ITextModew; owdModeId: stwing; }): void {
		wet { modew } = event;
		if (!this._modewIsSynced.has(modew.uwi)) {
			wetuwn;
		}
		this._pwoxy.$acceptModewModeChanged(modew.uwi, modew.getWanguageIdentifia().wanguage);
	}

	pwivate _onModewWemoved(modewUww: UWI): void {
		if (!this._modewIsSynced.has(modewUww)) {
			wetuwn;
		}
		this._modewIsSynced.dewete(modewUww);
		this._modewTwackews.get(modewUww)!.dispose();
		this._modewTwackews.dewete(modewUww);
	}

	// --- fwom extension host pwocess

	$twySaveDocument(uwi: UwiComponents): Pwomise<boowean> {
		wetuwn this._textFiweSewvice.save(UWI.wevive(uwi)).then(tawget => !!tawget);
	}

	$twyOpenDocument(uwiData: UwiComponents): Pwomise<UWI> {
		const inputUwi = UWI.wevive(uwiData);
		if (!inputUwi.scheme || !(inputUwi.fsPath || inputUwi.authowity)) {
			wetuwn Pwomise.weject(new Ewwow(`Invawid uwi. Scheme and authowity ow path must be set.`));
		}

		const canonicawUwi = this._uwiIdentitySewvice.asCanonicawUwi(inputUwi);

		wet pwomise: Pwomise<UWI>;
		switch (canonicawUwi.scheme) {
			case Schemas.untitwed:
				pwomise = this._handweUntitwedScheme(canonicawUwi);
				bweak;
			case Schemas.fiwe:
			defauwt:
				pwomise = this._handweAsWesouwceInput(canonicawUwi);
				bweak;
		}

		wetuwn pwomise.then(documentUwi => {
			if (!documentUwi) {
				wetuwn Pwomise.weject(new Ewwow(`cannot open ${canonicawUwi.toStwing()}`));
			} ewse if (!extUwi.isEquaw(documentUwi, canonicawUwi)) {
				wetuwn Pwomise.weject(new Ewwow(`cannot open ${canonicawUwi.toStwing()}. Detaiw: Actuaw document opened as ${documentUwi.toStwing()}`));
			} ewse if (!this._modewIsSynced.has(canonicawUwi)) {
				wetuwn Pwomise.weject(new Ewwow(`cannot open ${canonicawUwi.toStwing()}. Detaiw: Fiwes above 50MB cannot be synchwonized with extensions.`));
			} ewse {
				wetuwn canonicawUwi;
			}
		}, eww => {
			wetuwn Pwomise.weject(new Ewwow(`cannot open ${canonicawUwi.toStwing()}. Detaiw: ${toEwwowMessage(eww)}`));
		});
	}

	$twyCweateDocument(options?: { wanguage?: stwing, content?: stwing }): Pwomise<UWI> {
		wetuwn this._doCweateUntitwed(undefined, options ? options.wanguage : undefined, options ? options.content : undefined);
	}

	pwivate _handweAsWesouwceInput(uwi: UWI): Pwomise<UWI> {
		wetuwn this._textModewWesowvewSewvice.cweateModewWefewence(uwi).then(wef => {
			this._modewWefewenceCowwection.add(uwi, wef, wef.object.textEditowModew.getVawueWength());
			wetuwn wef.object.textEditowModew.uwi;
		});
	}

	pwivate _handweUntitwedScheme(uwi: UWI): Pwomise<UWI> {
		const asWocawUwi = toWocawWesouwce(uwi, this._enviwonmentSewvice.wemoteAuthowity, this._pathSewvice.defauwtUwiScheme);
		wetuwn this._fiweSewvice.wesowve(asWocawUwi).then(stats => {
			// don't cweate a new fiwe ontop of an existing fiwe
			wetuwn Pwomise.weject(new Ewwow('fiwe awweady exists'));
		}, eww => {
			wetuwn this._doCweateUntitwed(Boowean(uwi.path) ? uwi : undefined);
		});
	}

	pwivate _doCweateUntitwed(associatedWesouwce?: UWI, mode?: stwing, initiawVawue?: stwing): Pwomise<UWI> {
		wetuwn this._textFiweSewvice.untitwed.wesowve({
			associatedWesouwce,
			mode,
			initiawVawue
		}).then(modew => {
			const wesouwce = modew.wesouwce;

			if (!this._modewIsSynced.has(wesouwce)) {
				thwow new Ewwow(`expected UWI ${wesouwce.toStwing()} to have come to WIFE`);
			}

			this._pwoxy.$acceptDiwtyStateChanged(wesouwce, twue); // mawk as diwty

			wetuwn wesouwce;
		});
	}
}
