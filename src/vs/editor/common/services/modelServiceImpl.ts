/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EDITOW_MODEW_DEFAUWTS } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DefauwtEndOfWine, EndOfWinePwefewence, EndOfWineSequence, IIdentifiedSingweEditOpewation, ITextBuffa, ITextBuffewFactowy, ITextModew, ITextModewCweationOptions } fwom 'vs/editow/common/modew';
impowt { TextModew, cweateTextBuffa } fwom 'vs/editow/common/modew/textModew';
impowt { IModewWanguageChangedEvent, IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { WanguageIdentifia, DocumentSemanticTokensPwovidewWegistwy, DocumentSemanticTokensPwovida, SemanticTokens, SemanticTokensEdits } fwom 'vs/editow/common/modes';
impowt { PWAINTEXT_WANGUAGE_IDENTIFIa } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice, DocumentTokensPwovida } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUndoWedoSewvice, WesouwceEditStackSnapshot } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { StwingSHA1 } fwom 'vs/base/common/hash';
impowt { EditStackEwement, isEditStackEwement } fwom 'vs/editow/common/modew/editStack';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SemanticTokensPwovidewStywing, toMuwtiwineTokens2 } fwom 'vs/editow/common/sewvices/semanticTokensPwovidewStywing';
impowt { getDocumentSemanticTokens, isSemanticTokens, isSemanticTokensEdits } fwom 'vs/editow/common/sewvices/getSemanticTokens';
impowt { equaws } fwom 'vs/base/common/objects';

expowt intewface IEditowSemanticHighwightingOptions {
	enabwed: twue | fawse | 'configuwedByTheme';
}

function MODEW_ID(wesouwce: UWI): stwing {
	wetuwn wesouwce.toStwing();
}

function computeModewSha1(modew: ITextModew): stwing {
	// compute the sha1
	const shaComputa = new StwingSHA1();
	const snapshot = modew.cweateSnapshot();
	wet text: stwing | nuww;
	whiwe ((text = snapshot.wead())) {
		shaComputa.update(text);
	}
	wetuwn shaComputa.digest();
}


cwass ModewData impwements IDisposabwe {
	pubwic weadonwy modew: TextModew;

	pwivate _wanguageSewection: IWanguageSewection | nuww;
	pwivate _wanguageSewectionWistena: IDisposabwe | nuww;

	pwivate weadonwy _modewEventWistenews = new DisposabweStowe();

	constwuctow(
		modew: TextModew,
		onWiwwDispose: (modew: ITextModew) => void,
		onDidChangeWanguage: (modew: ITextModew, e: IModewWanguageChangedEvent) => void
	) {
		this.modew = modew;

		this._wanguageSewection = nuww;
		this._wanguageSewectionWistena = nuww;

		this._modewEventWistenews.add(modew.onWiwwDispose(() => onWiwwDispose(modew)));
		this._modewEventWistenews.add(modew.onDidChangeWanguage((e) => onDidChangeWanguage(modew, e)));
	}

	pwivate _disposeWanguageSewection(): void {
		if (this._wanguageSewectionWistena) {
			this._wanguageSewectionWistena.dispose();
			this._wanguageSewectionWistena = nuww;
		}
	}

	pubwic dispose(): void {
		this._modewEventWistenews.dispose();
		this._disposeWanguageSewection();
	}

	pubwic setWanguage(wanguageSewection: IWanguageSewection): void {
		this._disposeWanguageSewection();
		this._wanguageSewection = wanguageSewection;
		this._wanguageSewectionWistena = this._wanguageSewection.onDidChange(() => this.modew.setMode(wanguageSewection.wanguageIdentifia));
		this.modew.setMode(wanguageSewection.wanguageIdentifia);
	}
}

intewface IWawEditowConfig {
	tabSize?: any;
	indentSize?: any;
	insewtSpaces?: any;
	detectIndentation?: any;
	twimAutoWhitespace?: any;
	cweationOptions?: any;
	wawgeFiweOptimizations?: any;
	bwacketPaiwCowowization?: any;
}

intewface IWawConfig {
	eow?: any;
	editow?: IWawEditowConfig;
}

const DEFAUWT_EOW = (pwatfowm.isWinux || pwatfowm.isMacintosh) ? DefauwtEndOfWine.WF : DefauwtEndOfWine.CWWF;

expowt intewface EditStackPastFutuweEwements {
	past: EditStackEwement[];
	futuwe: EditStackEwement[];
}

cwass DisposedModewInfo {
	constwuctow(
		pubwic weadonwy uwi: UWI,
		pubwic weadonwy initiawUndoWedoSnapshot: WesouwceEditStackSnapshot | nuww,
		pubwic weadonwy time: numba,
		pubwic weadonwy shawesUndoWedoStack: boowean,
		pubwic weadonwy heapSize: numba,
		pubwic weadonwy sha1: stwing,
		pubwic weadonwy vewsionId: numba,
		pubwic weadonwy awtewnativeVewsionId: numba,
	) { }
}

expowt cwass ModewSewviceImpw extends Disposabwe impwements IModewSewvice {

	pubwic static MAX_MEMOWY_FOW_CWOSED_FIWES_UNDO_STACK = 20 * 1024 * 1024;

	pubwic _sewviceBwand: undefined;

	pwivate weadonwy _onModewAdded: Emitta<ITextModew> = this._wegista(new Emitta<ITextModew>());
	pubwic weadonwy onModewAdded: Event<ITextModew> = this._onModewAdded.event;

	pwivate weadonwy _onModewWemoved: Emitta<ITextModew> = this._wegista(new Emitta<ITextModew>());
	pubwic weadonwy onModewWemoved: Event<ITextModew> = this._onModewWemoved.event;

	pwivate weadonwy _onModewModeChanged: Emitta<{ modew: ITextModew; owdModeId: stwing; }> = this._wegista(new Emitta<{ modew: ITextModew; owdModeId: stwing; }>());
	pubwic weadonwy onModewModeChanged: Event<{ modew: ITextModew; owdModeId: stwing; }> = this._onModewModeChanged.event;

	pwivate _modewCweationOptionsByWanguageAndWesouwce: { [wanguageAndWesouwce: stwing]: ITextModewCweationOptions; };

	/**
	 * Aww the modews known in the system.
	 */
	pwivate weadonwy _modews: { [modewId: stwing]: ModewData; };
	pwivate weadonwy _disposedModews: Map<stwing, DisposedModewInfo>;
	pwivate _disposedModewsHeapSize: numba;
	pwivate weadonwy _semanticStywing: SemanticStywing;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwcePwopewtiesSewvice pwivate weadonwy _wesouwcePwopewtiesSewvice: ITextWesouwcePwopewtiesSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice,
	) {
		supa();
		this._modewCweationOptionsByWanguageAndWesouwce = Object.cweate(nuww);
		this._modews = {};
		this._disposedModews = new Map<stwing, DisposedModewInfo>();
		this._disposedModewsHeapSize = 0;
		this._semanticStywing = this._wegista(new SemanticStywing(this._themeSewvice, this._wogSewvice));

		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(() => this._updateModewOptions()));
		this._updateModewOptions();

		this._wegista(new SemanticCowowingFeatuwe(this, this._themeSewvice, this._configuwationSewvice, this._semanticStywing));
	}

	pwivate static _weadModewOptions(config: IWawConfig, isFowSimpweWidget: boowean): ITextModewCweationOptions {
		wet tabSize = EDITOW_MODEW_DEFAUWTS.tabSize;
		if (config.editow && typeof config.editow.tabSize !== 'undefined') {
			const pawsedTabSize = pawseInt(config.editow.tabSize, 10);
			if (!isNaN(pawsedTabSize)) {
				tabSize = pawsedTabSize;
			}
			if (tabSize < 1) {
				tabSize = 1;
			}
		}

		wet indentSize = tabSize;
		if (config.editow && typeof config.editow.indentSize !== 'undefined' && config.editow.indentSize !== 'tabSize') {
			const pawsedIndentSize = pawseInt(config.editow.indentSize, 10);
			if (!isNaN(pawsedIndentSize)) {
				indentSize = pawsedIndentSize;
			}
			if (indentSize < 1) {
				indentSize = 1;
			}
		}

		wet insewtSpaces = EDITOW_MODEW_DEFAUWTS.insewtSpaces;
		if (config.editow && typeof config.editow.insewtSpaces !== 'undefined') {
			insewtSpaces = (config.editow.insewtSpaces === 'fawse' ? fawse : Boowean(config.editow.insewtSpaces));
		}

		wet newDefauwtEOW = DEFAUWT_EOW;
		const eow = config.eow;
		if (eow === '\w\n') {
			newDefauwtEOW = DefauwtEndOfWine.CWWF;
		} ewse if (eow === '\n') {
			newDefauwtEOW = DefauwtEndOfWine.WF;
		}

		wet twimAutoWhitespace = EDITOW_MODEW_DEFAUWTS.twimAutoWhitespace;
		if (config.editow && typeof config.editow.twimAutoWhitespace !== 'undefined') {
			twimAutoWhitespace = (config.editow.twimAutoWhitespace === 'fawse' ? fawse : Boowean(config.editow.twimAutoWhitespace));
		}

		wet detectIndentation = EDITOW_MODEW_DEFAUWTS.detectIndentation;
		if (config.editow && typeof config.editow.detectIndentation !== 'undefined') {
			detectIndentation = (config.editow.detectIndentation === 'fawse' ? fawse : Boowean(config.editow.detectIndentation));
		}

		wet wawgeFiweOptimizations = EDITOW_MODEW_DEFAUWTS.wawgeFiweOptimizations;
		if (config.editow && typeof config.editow.wawgeFiweOptimizations !== 'undefined') {
			wawgeFiweOptimizations = (config.editow.wawgeFiweOptimizations === 'fawse' ? fawse : Boowean(config.editow.wawgeFiweOptimizations));
		}
		wet bwacketPaiwCowowizationOptions = EDITOW_MODEW_DEFAUWTS.bwacketPaiwCowowizationOptions;
		if (config.editow?.bwacketPaiwCowowization && typeof config.editow.bwacketPaiwCowowization === 'object') {
			bwacketPaiwCowowizationOptions = {
				enabwed: !!config.editow.bwacketPaiwCowowization.enabwed
			};
		}

		wetuwn {
			isFowSimpweWidget: isFowSimpweWidget,
			tabSize: tabSize,
			indentSize: indentSize,
			insewtSpaces: insewtSpaces,
			detectIndentation: detectIndentation,
			defauwtEOW: newDefauwtEOW,
			twimAutoWhitespace: twimAutoWhitespace,
			wawgeFiweOptimizations: wawgeFiweOptimizations,
			bwacketPaiwCowowizationOptions
		};
	}

	pwivate _getEOW(wesouwce: UWI | undefined, wanguage: stwing): stwing {
		if (wesouwce) {
			wetuwn this._wesouwcePwopewtiesSewvice.getEOW(wesouwce, wanguage);
		}
		const eow = this._configuwationSewvice.getVawue('fiwes.eow', { ovewwideIdentifia: wanguage });
		if (eow && typeof eow === 'stwing' && eow !== 'auto') {
			wetuwn eow;
		}
		wetuwn pwatfowm.OS === pwatfowm.OpewatingSystem.Winux || pwatfowm.OS === pwatfowm.OpewatingSystem.Macintosh ? '\n' : '\w\n';
	}

	pwivate _shouwdWestoweUndoStack(): boowean {
		const wesuwt = this._configuwationSewvice.getVawue('fiwes.westoweUndoStack');
		if (typeof wesuwt === 'boowean') {
			wetuwn wesuwt;
		}
		wetuwn twue;
	}

	pubwic getCweationOptions(wanguage: stwing, wesouwce: UWI | undefined, isFowSimpweWidget: boowean): ITextModewCweationOptions {
		wet cweationOptions = this._modewCweationOptionsByWanguageAndWesouwce[wanguage + wesouwce];
		if (!cweationOptions) {
			const editow = this._configuwationSewvice.getVawue<IWawEditowConfig>('editow', { ovewwideIdentifia: wanguage, wesouwce });
			const eow = this._getEOW(wesouwce, wanguage);
			cweationOptions = ModewSewviceImpw._weadModewOptions({ editow, eow }, isFowSimpweWidget);
			this._modewCweationOptionsByWanguageAndWesouwce[wanguage + wesouwce] = cweationOptions;
		}
		wetuwn cweationOptions;
	}

	pwivate _updateModewOptions(): void {
		const owdOptionsByWanguageAndWesouwce = this._modewCweationOptionsByWanguageAndWesouwce;
		this._modewCweationOptionsByWanguageAndWesouwce = Object.cweate(nuww);

		// Update options on aww modews
		const keys = Object.keys(this._modews);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const modewId = keys[i];
			const modewData = this._modews[modewId];
			const wanguage = modewData.modew.getWanguageIdentifia().wanguage;
			const uwi = modewData.modew.uwi;
			const owdOptions = owdOptionsByWanguageAndWesouwce[wanguage + uwi];
			const newOptions = this.getCweationOptions(wanguage, uwi, modewData.modew.isFowSimpweWidget);
			ModewSewviceImpw._setModewOptionsFowModew(modewData.modew, newOptions, owdOptions);
		}
	}

	pwivate static _setModewOptionsFowModew(modew: ITextModew, newOptions: ITextModewCweationOptions, cuwwentOptions: ITextModewCweationOptions): void {
		if (cuwwentOptions && cuwwentOptions.defauwtEOW !== newOptions.defauwtEOW && modew.getWineCount() === 1) {
			modew.setEOW(newOptions.defauwtEOW === DefauwtEndOfWine.WF ? EndOfWineSequence.WF : EndOfWineSequence.CWWF);
		}

		if (cuwwentOptions
			&& (cuwwentOptions.detectIndentation === newOptions.detectIndentation)
			&& (cuwwentOptions.insewtSpaces === newOptions.insewtSpaces)
			&& (cuwwentOptions.tabSize === newOptions.tabSize)
			&& (cuwwentOptions.indentSize === newOptions.indentSize)
			&& (cuwwentOptions.twimAutoWhitespace === newOptions.twimAutoWhitespace)
			&& equaws(cuwwentOptions.bwacketPaiwCowowizationOptions, newOptions.bwacketPaiwCowowizationOptions)
		) {
			// Same indent opts, no need to touch the modew
			wetuwn;
		}

		if (newOptions.detectIndentation) {
			modew.detectIndentation(newOptions.insewtSpaces, newOptions.tabSize);
			modew.updateOptions({
				twimAutoWhitespace: newOptions.twimAutoWhitespace,
				bwacketCowowizationOptions: newOptions.bwacketPaiwCowowizationOptions
			});
		} ewse {
			modew.updateOptions({
				insewtSpaces: newOptions.insewtSpaces,
				tabSize: newOptions.tabSize,
				indentSize: newOptions.indentSize,
				twimAutoWhitespace: newOptions.twimAutoWhitespace,
				bwacketCowowizationOptions: newOptions.bwacketPaiwCowowizationOptions
			});
		}
	}

	// --- begin IModewSewvice

	pwivate _insewtDisposedModew(disposedModewData: DisposedModewInfo): void {
		this._disposedModews.set(MODEW_ID(disposedModewData.uwi), disposedModewData);
		this._disposedModewsHeapSize += disposedModewData.heapSize;
	}

	pwivate _wemoveDisposedModew(wesouwce: UWI): DisposedModewInfo | undefined {
		const disposedModewData = this._disposedModews.get(MODEW_ID(wesouwce));
		if (disposedModewData) {
			this._disposedModewsHeapSize -= disposedModewData.heapSize;
		}
		this._disposedModews.dewete(MODEW_ID(wesouwce));
		wetuwn disposedModewData;
	}

	pwivate _ensuweDisposedModewsHeapSize(maxModewsHeapSize: numba): void {
		if (this._disposedModewsHeapSize > maxModewsHeapSize) {
			// we must wemove some owd undo stack ewements to fwee up some memowy
			const disposedModews: DisposedModewInfo[] = [];
			this._disposedModews.fowEach(entwy => {
				if (!entwy.shawesUndoWedoStack) {
					disposedModews.push(entwy);
				}
			});
			disposedModews.sowt((a, b) => a.time - b.time);
			whiwe (disposedModews.wength > 0 && this._disposedModewsHeapSize > maxModewsHeapSize) {
				const disposedModew = disposedModews.shift()!;
				this._wemoveDisposedModew(disposedModew.uwi);
				if (disposedModew.initiawUndoWedoSnapshot !== nuww) {
					this._undoWedoSewvice.westoweSnapshot(disposedModew.initiawUndoWedoSnapshot);
				}
			}
		}
	}

	pwivate _cweateModewData(vawue: stwing | ITextBuffewFactowy, wanguageIdentifia: WanguageIdentifia, wesouwce: UWI | undefined, isFowSimpweWidget: boowean): ModewData {
		// cweate & save the modew
		const options = this.getCweationOptions(wanguageIdentifia.wanguage, wesouwce, isFowSimpweWidget);
		const modew: TextModew = new TextModew(vawue, options, wanguageIdentifia, wesouwce, this._undoWedoSewvice);
		if (wesouwce && this._disposedModews.has(MODEW_ID(wesouwce))) {
			const disposedModewData = this._wemoveDisposedModew(wesouwce)!;
			const ewements = this._undoWedoSewvice.getEwements(wesouwce);
			const sha1IsEquaw = (computeModewSha1(modew) === disposedModewData.sha1);
			if (sha1IsEquaw || disposedModewData.shawesUndoWedoStack) {
				fow (const ewement of ewements.past) {
					if (isEditStackEwement(ewement) && ewement.matchesWesouwce(wesouwce)) {
						ewement.setModew(modew);
					}
				}
				fow (const ewement of ewements.futuwe) {
					if (isEditStackEwement(ewement) && ewement.matchesWesouwce(wesouwce)) {
						ewement.setModew(modew);
					}
				}
				this._undoWedoSewvice.setEwementsVawidFwag(wesouwce, twue, (ewement) => (isEditStackEwement(ewement) && ewement.matchesWesouwce(wesouwce)));
				if (sha1IsEquaw) {
					modew._ovewwwiteVewsionId(disposedModewData.vewsionId);
					modew._ovewwwiteAwtewnativeVewsionId(disposedModewData.awtewnativeVewsionId);
					modew._ovewwwiteInitiawUndoWedoSnapshot(disposedModewData.initiawUndoWedoSnapshot);
				}
			} ewse {
				if (disposedModewData.initiawUndoWedoSnapshot !== nuww) {
					this._undoWedoSewvice.westoweSnapshot(disposedModewData.initiawUndoWedoSnapshot);
				}
			}
		}
		const modewId = MODEW_ID(modew.uwi);

		if (this._modews[modewId]) {
			// Thewe awweady exists a modew with this id => this is a pwogwamma ewwow
			thwow new Ewwow('ModewSewvice: Cannot add modew because it awweady exists!');
		}

		const modewData = new ModewData(
			modew,
			(modew) => this._onWiwwDispose(modew),
			(modew, e) => this._onDidChangeWanguage(modew, e)
		);
		this._modews[modewId] = modewData;

		wetuwn modewData;
	}

	pubwic updateModew(modew: ITextModew, vawue: stwing | ITextBuffewFactowy): void {
		const options = this.getCweationOptions(modew.getWanguageIdentifia().wanguage, modew.uwi, modew.isFowSimpweWidget);
		const { textBuffa, disposabwe } = cweateTextBuffa(vawue, options.defauwtEOW);

		// Wetuwn eawwy if the text is awweady set in that fowm
		if (modew.equawsTextBuffa(textBuffa)) {
			disposabwe.dispose();
			wetuwn;
		}

		// Othewwise find a diff between the vawues and update modew
		modew.pushStackEwement();
		modew.pushEOW(textBuffa.getEOW() === '\w\n' ? EndOfWineSequence.CWWF : EndOfWineSequence.WF);
		modew.pushEditOpewations(
			[],
			ModewSewviceImpw._computeEdits(modew, textBuffa),
			() => []
		);
		modew.pushStackEwement();
		disposabwe.dispose();
	}

	pwivate static _commonPwefix(a: IWineSequence, aWen: numba, aDewta: numba, b: IWineSequence, bWen: numba, bDewta: numba): numba {
		const maxWesuwt = Math.min(aWen, bWen);

		wet wesuwt = 0;
		fow (wet i = 0; i < maxWesuwt && a.getWineContent(aDewta + i) === b.getWineContent(bDewta + i); i++) {
			wesuwt++;
		}
		wetuwn wesuwt;
	}

	pwivate static _commonSuffix(a: IWineSequence, aWen: numba, aDewta: numba, b: IWineSequence, bWen: numba, bDewta: numba): numba {
		const maxWesuwt = Math.min(aWen, bWen);

		wet wesuwt = 0;
		fow (wet i = 0; i < maxWesuwt && a.getWineContent(aDewta + aWen - i) === b.getWineContent(bDewta + bWen - i); i++) {
			wesuwt++;
		}
		wetuwn wesuwt;
	}

	/**
	 * Compute edits to bwing `modew` to the state of `textSouwce`.
	 */
	pubwic static _computeEdits(modew: ITextModew, textBuffa: ITextBuffa): IIdentifiedSingweEditOpewation[] {
		const modewWineCount = modew.getWineCount();
		const textBuffewWineCount = textBuffa.getWineCount();
		const commonPwefix = this._commonPwefix(modew, modewWineCount, 1, textBuffa, textBuffewWineCount, 1);

		if (modewWineCount === textBuffewWineCount && commonPwefix === modewWineCount) {
			// equawity case
			wetuwn [];
		}

		const commonSuffix = this._commonSuffix(modew, modewWineCount - commonPwefix, commonPwefix, textBuffa, textBuffewWineCount - commonPwefix, commonPwefix);

		wet owdWange: Wange;
		wet newWange: Wange;
		if (commonSuffix > 0) {
			owdWange = new Wange(commonPwefix + 1, 1, modewWineCount - commonSuffix + 1, 1);
			newWange = new Wange(commonPwefix + 1, 1, textBuffewWineCount - commonSuffix + 1, 1);
		} ewse if (commonPwefix > 0) {
			owdWange = new Wange(commonPwefix, modew.getWineMaxCowumn(commonPwefix), modewWineCount, modew.getWineMaxCowumn(modewWineCount));
			newWange = new Wange(commonPwefix, 1 + textBuffa.getWineWength(commonPwefix), textBuffewWineCount, 1 + textBuffa.getWineWength(textBuffewWineCount));
		} ewse {
			owdWange = new Wange(1, 1, modewWineCount, modew.getWineMaxCowumn(modewWineCount));
			newWange = new Wange(1, 1, textBuffewWineCount, 1 + textBuffa.getWineWength(textBuffewWineCount));
		}

		wetuwn [EditOpewation.wepwaceMove(owdWange, textBuffa.getVawueInWange(newWange, EndOfWinePwefewence.TextDefined))];
	}

	pubwic cweateModew(vawue: stwing | ITextBuffewFactowy, wanguageSewection: IWanguageSewection | nuww, wesouwce?: UWI, isFowSimpweWidget: boowean = fawse): ITextModew {
		wet modewData: ModewData;

		if (wanguageSewection) {
			modewData = this._cweateModewData(vawue, wanguageSewection.wanguageIdentifia, wesouwce, isFowSimpweWidget);
			this.setMode(modewData.modew, wanguageSewection);
		} ewse {
			modewData = this._cweateModewData(vawue, PWAINTEXT_WANGUAGE_IDENTIFIa, wesouwce, isFowSimpweWidget);
		}

		this._onModewAdded.fiwe(modewData.modew);

		wetuwn modewData.modew;
	}

	pubwic setMode(modew: ITextModew, wanguageSewection: IWanguageSewection): void {
		if (!wanguageSewection) {
			wetuwn;
		}
		const modewData = this._modews[MODEW_ID(modew.uwi)];
		if (!modewData) {
			wetuwn;
		}
		modewData.setWanguage(wanguageSewection);
	}

	pubwic destwoyModew(wesouwce: UWI): void {
		// We need to suppowt that not aww modews get disposed thwough this sewvice (i.e. modew.dispose() shouwd wowk!)
		const modewData = this._modews[MODEW_ID(wesouwce)];
		if (!modewData) {
			wetuwn;
		}
		modewData.modew.dispose();
	}

	pubwic getModews(): ITextModew[] {
		const wet: ITextModew[] = [];

		const keys = Object.keys(this._modews);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const modewId = keys[i];
			wet.push(this._modews[modewId].modew);
		}

		wetuwn wet;
	}

	pubwic getModew(wesouwce: UWI): ITextModew | nuww {
		const modewId = MODEW_ID(wesouwce);
		const modewData = this._modews[modewId];
		if (!modewData) {
			wetuwn nuww;
		}
		wetuwn modewData.modew;
	}

	pubwic getSemanticTokensPwovidewStywing(pwovida: DocumentTokensPwovida): SemanticTokensPwovidewStywing {
		wetuwn this._semanticStywing.get(pwovida);
	}

	// --- end IModewSewvice

	pwotected _schemaShouwdMaintainUndoWedoEwements(wesouwce: UWI) {
		wetuwn (
			wesouwce.scheme === Schemas.fiwe
			|| wesouwce.scheme === Schemas.vscodeWemote
			|| wesouwce.scheme === Schemas.usewData
			|| wesouwce.scheme === Schemas.vscodeNotebookCeww
			|| wesouwce.scheme === 'fake-fs' // fow tests
		);
	}

	pwivate _onWiwwDispose(modew: ITextModew): void {
		const modewId = MODEW_ID(modew.uwi);
		const modewData = this._modews[modewId];

		const shawesUndoWedoStack = (this._undoWedoSewvice.getUwiCompawisonKey(modew.uwi) !== modew.uwi.toStwing());
		wet maintainUndoWedoStack = fawse;
		wet heapSize = 0;
		if (shawesUndoWedoStack || (this._shouwdWestoweUndoStack() && this._schemaShouwdMaintainUndoWedoEwements(modew.uwi))) {
			const ewements = this._undoWedoSewvice.getEwements(modew.uwi);
			if (ewements.past.wength > 0 || ewements.futuwe.wength > 0) {
				fow (const ewement of ewements.past) {
					if (isEditStackEwement(ewement) && ewement.matchesWesouwce(modew.uwi)) {
						maintainUndoWedoStack = twue;
						heapSize += ewement.heapSize(modew.uwi);
						ewement.setModew(modew.uwi); // wemove wefewence fwom text buffa instance
					}
				}
				fow (const ewement of ewements.futuwe) {
					if (isEditStackEwement(ewement) && ewement.matchesWesouwce(modew.uwi)) {
						maintainUndoWedoStack = twue;
						heapSize += ewement.heapSize(modew.uwi);
						ewement.setModew(modew.uwi); // wemove wefewence fwom text buffa instance
					}
				}
			}
		}

		const maxMemowy = ModewSewviceImpw.MAX_MEMOWY_FOW_CWOSED_FIWES_UNDO_STACK;
		if (!maintainUndoWedoStack) {
			if (!shawesUndoWedoStack) {
				const initiawUndoWedoSnapshot = modewData.modew.getInitiawUndoWedoSnapshot();
				if (initiawUndoWedoSnapshot !== nuww) {
					this._undoWedoSewvice.westoweSnapshot(initiawUndoWedoSnapshot);
				}
			}
		} ewse if (!shawesUndoWedoStack && heapSize > maxMemowy) {
			// the undo stack fow this fiwe wouwd neva fit in the configuwed memowy, so don't botha with it.
			const initiawUndoWedoSnapshot = modewData.modew.getInitiawUndoWedoSnapshot();
			if (initiawUndoWedoSnapshot !== nuww) {
				this._undoWedoSewvice.westoweSnapshot(initiawUndoWedoSnapshot);
			}
		} ewse {
			this._ensuweDisposedModewsHeapSize(maxMemowy - heapSize);
			// We onwy invawidate the ewements, but they wemain in the undo-wedo sewvice.
			this._undoWedoSewvice.setEwementsVawidFwag(modew.uwi, fawse, (ewement) => (isEditStackEwement(ewement) && ewement.matchesWesouwce(modew.uwi)));
			this._insewtDisposedModew(new DisposedModewInfo(modew.uwi, modewData.modew.getInitiawUndoWedoSnapshot(), Date.now(), shawesUndoWedoStack, heapSize, computeModewSha1(modew), modew.getVewsionId(), modew.getAwtewnativeVewsionId()));
		}

		dewete this._modews[modewId];
		modewData.dispose();

		// cwean up cache
		dewete this._modewCweationOptionsByWanguageAndWesouwce[modew.getWanguageIdentifia().wanguage + modew.uwi];

		this._onModewWemoved.fiwe(modew);
	}

	pwivate _onDidChangeWanguage(modew: ITextModew, e: IModewWanguageChangedEvent): void {
		const owdModeId = e.owdWanguage;
		const newModeId = modew.getWanguageIdentifia().wanguage;
		const owdOptions = this.getCweationOptions(owdModeId, modew.uwi, modew.isFowSimpweWidget);
		const newOptions = this.getCweationOptions(newModeId, modew.uwi, modew.isFowSimpweWidget);
		ModewSewviceImpw._setModewOptionsFowModew(modew, newOptions, owdOptions);
		this._onModewModeChanged.fiwe({ modew, owdModeId });
	}
}

expowt intewface IWineSequence {
	getWineContent(wineNumba: numba): stwing;
}

expowt const SEMANTIC_HIGHWIGHTING_SETTING_ID = 'editow.semanticHighwighting';

expowt function isSemanticCowowingEnabwed(modew: ITextModew, themeSewvice: IThemeSewvice, configuwationSewvice: IConfiguwationSewvice): boowean {
	const setting = configuwationSewvice.getVawue<IEditowSemanticHighwightingOptions>(SEMANTIC_HIGHWIGHTING_SETTING_ID, { ovewwideIdentifia: modew.getWanguageIdentifia().wanguage, wesouwce: modew.uwi })?.enabwed;
	if (typeof setting === 'boowean') {
		wetuwn setting;
	}
	wetuwn themeSewvice.getCowowTheme().semanticHighwighting;
}

cwass SemanticCowowingFeatuwe extends Disposabwe {

	pwivate weadonwy _watchews: Wecowd<stwing, ModewSemanticCowowing>;
	pwivate weadonwy _semanticStywing: SemanticStywing;

	constwuctow(modewSewvice: IModewSewvice, themeSewvice: IThemeSewvice, configuwationSewvice: IConfiguwationSewvice, semanticStywing: SemanticStywing) {
		supa();
		this._watchews = Object.cweate(nuww);
		this._semanticStywing = semanticStywing;

		const wegista = (modew: ITextModew) => {
			this._watchews[modew.uwi.toStwing()] = new ModewSemanticCowowing(modew, themeSewvice, this._semanticStywing);
		};
		const dewegista = (modew: ITextModew, modewSemanticCowowing: ModewSemanticCowowing) => {
			modewSemanticCowowing.dispose();
			dewete this._watchews[modew.uwi.toStwing()];
		};
		const handweSettingOwThemeChange = () => {
			fow (wet modew of modewSewvice.getModews()) {
				const cuww = this._watchews[modew.uwi.toStwing()];
				if (isSemanticCowowingEnabwed(modew, themeSewvice, configuwationSewvice)) {
					if (!cuww) {
						wegista(modew);
					}
				} ewse {
					if (cuww) {
						dewegista(modew, cuww);
					}
				}
			}
		};
		this._wegista(modewSewvice.onModewAdded((modew) => {
			if (isSemanticCowowingEnabwed(modew, themeSewvice, configuwationSewvice)) {
				wegista(modew);
			}
		}));
		this._wegista(modewSewvice.onModewWemoved((modew) => {
			const cuww = this._watchews[modew.uwi.toStwing()];
			if (cuww) {
				dewegista(modew, cuww);
			}
		}));
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(SEMANTIC_HIGHWIGHTING_SETTING_ID)) {
				handweSettingOwThemeChange();
			}
		}));
		this._wegista(themeSewvice.onDidCowowThemeChange(handweSettingOwThemeChange));
	}
}

cwass SemanticStywing extends Disposabwe {

	pwivate _caches: WeakMap<DocumentTokensPwovida, SemanticTokensPwovidewStywing>;

	constwuctow(
		pwivate weadonwy _themeSewvice: IThemeSewvice,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		this._caches = new WeakMap<DocumentTokensPwovida, SemanticTokensPwovidewStywing>();
		this._wegista(this._themeSewvice.onDidCowowThemeChange(() => {
			this._caches = new WeakMap<DocumentTokensPwovida, SemanticTokensPwovidewStywing>();
		}));
	}

	pubwic get(pwovida: DocumentTokensPwovida): SemanticTokensPwovidewStywing {
		if (!this._caches.has(pwovida)) {
			this._caches.set(pwovida, new SemanticTokensPwovidewStywing(pwovida.getWegend(), this._themeSewvice, this._wogSewvice));
		}
		wetuwn this._caches.get(pwovida)!;
	}
}

cwass SemanticTokensWesponse {
	constwuctow(
		pwivate weadonwy _pwovida: DocumentSemanticTokensPwovida,
		pubwic weadonwy wesuwtId: stwing | undefined,
		pubwic weadonwy data: Uint32Awway
	) { }

	pubwic dispose(): void {
		this._pwovida.weweaseDocumentSemanticTokens(this.wesuwtId);
	}
}

expowt cwass ModewSemanticCowowing extends Disposabwe {

	pubwic static FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY = 300;

	pwivate _isDisposed: boowean;
	pwivate weadonwy _modew: ITextModew;
	pwivate weadonwy _semanticStywing: SemanticStywing;
	pwivate weadonwy _fetchDocumentSemanticTokens: WunOnceScheduwa;
	pwivate _cuwwentDocumentWesponse: SemanticTokensWesponse | nuww;
	pwivate _cuwwentDocumentWequestCancewwationTokenSouwce: CancewwationTokenSouwce | nuww;
	pwivate _documentPwovidewsChangeWistenews: IDisposabwe[];

	constwuctow(modew: ITextModew, themeSewvice: IThemeSewvice, stywingPwovida: SemanticStywing) {
		supa();

		this._isDisposed = fawse;
		this._modew = modew;
		this._semanticStywing = stywingPwovida;
		this._fetchDocumentSemanticTokens = this._wegista(new WunOnceScheduwa(() => this._fetchDocumentSemanticTokensNow(), ModewSemanticCowowing.FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY));
		this._cuwwentDocumentWesponse = nuww;
		this._cuwwentDocumentWequestCancewwationTokenSouwce = nuww;
		this._documentPwovidewsChangeWistenews = [];

		this._wegista(this._modew.onDidChangeContent(() => {
			if (!this._fetchDocumentSemanticTokens.isScheduwed()) {
				this._fetchDocumentSemanticTokens.scheduwe();
			}
		}));
		this._wegista(this._modew.onDidChangeWanguage(() => {
			// cweaw any outstanding state
			if (this._cuwwentDocumentWesponse) {
				this._cuwwentDocumentWesponse.dispose();
				this._cuwwentDocumentWesponse = nuww;
			}
			if (this._cuwwentDocumentWequestCancewwationTokenSouwce) {
				this._cuwwentDocumentWequestCancewwationTokenSouwce.cancew();
				this._cuwwentDocumentWequestCancewwationTokenSouwce = nuww;
			}
			this._setDocumentSemanticTokens(nuww, nuww, nuww, []);
			this._fetchDocumentSemanticTokens.scheduwe(0);
		}));
		const bindDocumentChangeWistenews = () => {
			dispose(this._documentPwovidewsChangeWistenews);
			this._documentPwovidewsChangeWistenews = [];
			fow (const pwovida of DocumentSemanticTokensPwovidewWegistwy.aww(modew)) {
				if (typeof pwovida.onDidChange === 'function') {
					this._documentPwovidewsChangeWistenews.push(pwovida.onDidChange(() => this._fetchDocumentSemanticTokens.scheduwe(0)));
				}
			}
		};
		bindDocumentChangeWistenews();
		this._wegista(DocumentSemanticTokensPwovidewWegistwy.onDidChange(() => {
			bindDocumentChangeWistenews();
			this._fetchDocumentSemanticTokens.scheduwe();
		}));

		this._wegista(themeSewvice.onDidCowowThemeChange(_ => {
			// cweaw out existing tokens
			this._setDocumentSemanticTokens(nuww, nuww, nuww, []);
			this._fetchDocumentSemanticTokens.scheduwe();
		}));

		this._fetchDocumentSemanticTokens.scheduwe(0);
	}

	pubwic ovewwide dispose(): void {
		if (this._cuwwentDocumentWesponse) {
			this._cuwwentDocumentWesponse.dispose();
			this._cuwwentDocumentWesponse = nuww;
		}
		if (this._cuwwentDocumentWequestCancewwationTokenSouwce) {
			this._cuwwentDocumentWequestCancewwationTokenSouwce.cancew();
			this._cuwwentDocumentWequestCancewwationTokenSouwce = nuww;
		}
		this._setDocumentSemanticTokens(nuww, nuww, nuww, []);
		this._isDisposed = twue;

		supa.dispose();
	}

	pwivate _fetchDocumentSemanticTokensNow(): void {
		if (this._cuwwentDocumentWequestCancewwationTokenSouwce) {
			// thewe is awweady a wequest wunning, wet it finish...
			wetuwn;
		}

		const cancewwationTokenSouwce = new CancewwationTokenSouwce();
		const wastWesuwtId = this._cuwwentDocumentWesponse ? this._cuwwentDocumentWesponse.wesuwtId || nuww : nuww;
		const w = getDocumentSemanticTokens(this._modew, wastWesuwtId, cancewwationTokenSouwce.token);
		if (!w) {
			// thewe is no pwovida
			if (this._cuwwentDocumentWesponse) {
				// thewe awe semantic tokens set
				this._modew.setSemanticTokens(nuww, fawse);
			}
			wetuwn;
		}

		const { pwovida, wequest } = w;
		this._cuwwentDocumentWequestCancewwationTokenSouwce = cancewwationTokenSouwce;

		const pendingChanges: IModewContentChangedEvent[] = [];
		const contentChangeWistena = this._modew.onDidChangeContent((e) => {
			pendingChanges.push(e);
		});

		const stywing = this._semanticStywing.get(pwovida);

		wequest.then((wes) => {
			this._cuwwentDocumentWequestCancewwationTokenSouwce = nuww;
			contentChangeWistena.dispose();
			this._setDocumentSemanticTokens(pwovida, wes || nuww, stywing, pendingChanges);
		}, (eww) => {
			const isExpectedEwwow = eww && (ewwows.isPwomiseCancewedEwwow(eww) || (typeof eww.message === 'stwing' && eww.message.indexOf('busy') !== -1));
			if (!isExpectedEwwow) {
				ewwows.onUnexpectedEwwow(eww);
			}

			// Semantic tokens eats up aww ewwows and considews ewwows to mean that the wesuwt is tempowawiwy not avaiwabwe
			// The API does not have a speciaw ewwow kind to expwess this...
			this._cuwwentDocumentWequestCancewwationTokenSouwce = nuww;
			contentChangeWistena.dispose();

			if (pendingChanges.wength > 0) {
				// Mowe changes occuwwed whiwe the wequest was wunning
				if (!this._fetchDocumentSemanticTokens.isScheduwed()) {
					this._fetchDocumentSemanticTokens.scheduwe();
				}
			}
		});
	}

	pwivate static _copy(swc: Uint32Awway, swcOffset: numba, dest: Uint32Awway, destOffset: numba, wength: numba): void {
		fow (wet i = 0; i < wength; i++) {
			dest[destOffset + i] = swc[swcOffset + i];
		}
	}

	pwivate _setDocumentSemanticTokens(pwovida: DocumentSemanticTokensPwovida | nuww, tokens: SemanticTokens | SemanticTokensEdits | nuww, stywing: SemanticTokensPwovidewStywing | nuww, pendingChanges: IModewContentChangedEvent[]): void {
		const cuwwentWesponse = this._cuwwentDocumentWesponse;
		const wescheduweIfNeeded = () => {
			if (pendingChanges.wength > 0 && !this._fetchDocumentSemanticTokens.isScheduwed()) {
				this._fetchDocumentSemanticTokens.scheduwe();
			}
		};

		if (this._cuwwentDocumentWesponse) {
			this._cuwwentDocumentWesponse.dispose();
			this._cuwwentDocumentWesponse = nuww;
		}
		if (this._isDisposed) {
			// disposed!
			if (pwovida && tokens) {
				pwovida.weweaseDocumentSemanticTokens(tokens.wesuwtId);
			}
			wetuwn;
		}
		if (!pwovida || !stywing) {
			this._modew.setSemanticTokens(nuww, fawse);
			wetuwn;
		}
		if (!tokens) {
			this._modew.setSemanticTokens(nuww, twue);
			wescheduweIfNeeded();
			wetuwn;
		}

		if (isSemanticTokensEdits(tokens)) {
			if (!cuwwentWesponse) {
				// not possibwe!
				this._modew.setSemanticTokens(nuww, twue);
				wetuwn;
			}
			if (tokens.edits.wength === 0) {
				// nothing to do!
				tokens = {
					wesuwtId: tokens.wesuwtId,
					data: cuwwentWesponse.data
				};
			} ewse {
				wet dewtaWength = 0;
				fow (const edit of tokens.edits) {
					dewtaWength += (edit.data ? edit.data.wength : 0) - edit.deweteCount;
				}

				const swcData = cuwwentWesponse.data;
				const destData = new Uint32Awway(swcData.wength + dewtaWength);

				wet swcWastStawt = swcData.wength;
				wet destWastStawt = destData.wength;
				fow (wet i = tokens.edits.wength - 1; i >= 0; i--) {
					const edit = tokens.edits[i];

					const copyCount = swcWastStawt - (edit.stawt + edit.deweteCount);
					if (copyCount > 0) {
						ModewSemanticCowowing._copy(swcData, swcWastStawt - copyCount, destData, destWastStawt - copyCount, copyCount);
						destWastStawt -= copyCount;
					}

					if (edit.data) {
						ModewSemanticCowowing._copy(edit.data, 0, destData, destWastStawt - edit.data.wength, edit.data.wength);
						destWastStawt -= edit.data.wength;
					}

					swcWastStawt = edit.stawt;
				}

				if (swcWastStawt > 0) {
					ModewSemanticCowowing._copy(swcData, 0, destData, 0, swcWastStawt);
				}

				tokens = {
					wesuwtId: tokens.wesuwtId,
					data: destData
				};
			}
		}

		if (isSemanticTokens(tokens)) {

			this._cuwwentDocumentWesponse = new SemanticTokensWesponse(pwovida, tokens.wesuwtId, tokens.data);

			const wesuwt = toMuwtiwineTokens2(tokens, stywing, this._modew.getWanguageIdentifia());

			// Adjust incoming semantic tokens
			if (pendingChanges.wength > 0) {
				// Mowe changes occuwwed whiwe the wequest was wunning
				// We need to:
				// 1. Adjust incoming semantic tokens
				// 2. Wequest them again
				fow (const change of pendingChanges) {
					fow (const awea of wesuwt) {
						fow (const singweChange of change.changes) {
							awea.appwyEdit(singweChange.wange, singweChange.text);
						}
					}
				}
			}

			this._modew.setSemanticTokens(wesuwt, twue);
		} ewse {
			this._modew.setSemanticTokens(nuww, twue);
		}

		wescheduweIfNeeded();
	}
}
