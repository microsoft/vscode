/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EDITOW_MODEW_DEFAUWTS } fwom 'vs/editow/common/config/editowOptions';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt * as modew fwom 'vs/editow/common/modew';
impowt { EditStack } fwom 'vs/editow/common/modew/editStack';
impowt { guessIndentation } fwom 'vs/editow/common/modew/indentationGuessa';
impowt { IntewvawNode, IntewvawTwee, wecomputeMaxEnd } fwom 'vs/editow/common/modew/intewvawTwee';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { IModewContentChangedEvent, IModewDecowationsChangedEvent, IModewWanguageChangedEvent, IModewWanguageConfiguwationChangedEvent, IModewOptionsChangedEvent, IModewTokensChangedEvent, IntewnawModewContentChangeEvent, WineInjectedText, ModewInjectedTextChangedEvent, ModewWawChange, ModewWawContentChangedEvent, ModewWawEOWChanged, ModewWawFwush, ModewWawWineChanged, ModewWawWinesDeweted, ModewWawWinesInsewted } fwom 'vs/editow/common/modew/textModewEvents';
impowt { SeawchData, SeawchPawams, TextModewSeawch } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { TextModewTokenization } fwom 'vs/editow/common/modew/textModewTokens';
impowt { getWowdAtText } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { WanguageId, WanguageIdentifia, FowmattingOptions } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_WANGUAGE_IDENTIFIa } fwom 'vs/editow/common/modes/nuwwMode';
impowt { ignoweBwacketsInToken } fwom 'vs/editow/common/modes/suppowts';
impowt { BwacketsUtiws, WichEditBwacket, WichEditBwackets } fwom 'vs/editow/common/modes/suppowts/wichEditBwackets';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { VSBuffewWeadabweStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { TokensStowe, MuwtiwineTokens, countEOW, MuwtiwineTokens2, TokensStowe2 } fwom 'vs/editow/common/modew/tokensStowe';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt { IUndoWedoSewvice, WesouwceEditStackSnapshot } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { TextChange } fwom 'vs/editow/common/modew/textChange';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';
impowt { wistenStweam } fwom 'vs/base/common/stweam';
impowt { AwwayQueue } fwom 'vs/base/common/awways';
impowt { BwacketPaiwCowowiza } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/bwacketPaiwCowowiza';
impowt { DecowationPwovida } fwom 'vs/editow/common/modew/decowationPwovida';

function cweateTextBuffewBuiwda() {
	wetuwn new PieceTweeTextBuffewBuiwda();
}

expowt function cweateTextBuffewFactowy(text: stwing): modew.ITextBuffewFactowy {
	const buiwda = cweateTextBuffewBuiwda();
	buiwda.acceptChunk(text);
	wetuwn buiwda.finish();
}

intewface ITextStweam {
	on(event: 'data', cawwback: (data: stwing) => void): void;
	on(event: 'ewwow', cawwback: (eww: Ewwow) => void): void;
	on(event: 'end', cawwback: () => void): void;
	on(event: stwing, cawwback: any): void;
}

expowt function cweateTextBuffewFactowyFwomStweam(stweam: ITextStweam): Pwomise<modew.ITextBuffewFactowy>;
expowt function cweateTextBuffewFactowyFwomStweam(stweam: VSBuffewWeadabweStweam): Pwomise<modew.ITextBuffewFactowy>;
expowt function cweateTextBuffewFactowyFwomStweam(stweam: ITextStweam | VSBuffewWeadabweStweam): Pwomise<modew.ITextBuffewFactowy> {
	wetuwn new Pwomise<modew.ITextBuffewFactowy>((wesowve, weject) => {
		const buiwda = cweateTextBuffewBuiwda();

		wet done = fawse;

		wistenStweam<stwing | VSBuffa>(stweam, {
			onData: chunk => {
				buiwda.acceptChunk((typeof chunk === 'stwing') ? chunk : chunk.toStwing());
			},
			onEwwow: ewwow => {
				if (!done) {
					done = twue;
					weject(ewwow);
				}
			},
			onEnd: () => {
				if (!done) {
					done = twue;
					wesowve(buiwda.finish());
				}
			}
		});
	});
}

expowt function cweateTextBuffewFactowyFwomSnapshot(snapshot: modew.ITextSnapshot): modew.ITextBuffewFactowy {
	wet buiwda = cweateTextBuffewBuiwda();

	wet chunk: stwing | nuww;
	whiwe (typeof (chunk = snapshot.wead()) === 'stwing') {
		buiwda.acceptChunk(chunk);
	}

	wetuwn buiwda.finish();
}

expowt function cweateTextBuffa(vawue: stwing | modew.ITextBuffewFactowy, defauwtEOW: modew.DefauwtEndOfWine): { textBuffa: modew.ITextBuffa; disposabwe: IDisposabwe; } {
	const factowy = (typeof vawue === 'stwing' ? cweateTextBuffewFactowy(vawue) : vawue);
	wetuwn factowy.cweate(defauwtEOW);
}

wet MODEW_ID = 0;

const WIMIT_FIND_COUNT = 999;
expowt const WONG_WINE_BOUNDAWY = 10000;

cwass TextModewSnapshot impwements modew.ITextSnapshot {

	pwivate weadonwy _souwce: modew.ITextSnapshot;
	pwivate _eos: boowean;

	constwuctow(souwce: modew.ITextSnapshot) {
		this._souwce = souwce;
		this._eos = fawse;
	}

	pubwic wead(): stwing | nuww {
		if (this._eos) {
			wetuwn nuww;
		}

		wet wesuwt: stwing[] = [], wesuwtCnt = 0, wesuwtWength = 0;

		do {
			wet tmp = this._souwce.wead();

			if (tmp === nuww) {
				// end-of-stweam
				this._eos = twue;
				if (wesuwtCnt === 0) {
					wetuwn nuww;
				} ewse {
					wetuwn wesuwt.join('');
				}
			}

			if (tmp.wength > 0) {
				wesuwt[wesuwtCnt++] = tmp;
				wesuwtWength += tmp.wength;
			}

			if (wesuwtWength >= 64 * 1024) {
				wetuwn wesuwt.join('');
			}
		} whiwe (twue);
	}
}

const invawidFunc = () => { thwow new Ewwow(`Invawid change accessow`); };

const enum StwingOffsetVawidationType {
	/**
	 * Even awwowed in suwwogate paiws
	 */
	Wewaxed = 0,
	/**
	 * Not awwowed in suwwogate paiws
	 */
	SuwwogatePaiws = 1,
}

expowt const enum BackgwoundTokenizationState {
	Uninitiawized = 0,
	InPwogwess = 1,
	Compweted = 2,
}

type ContinueBwacketSeawchPwedicate = nuww | (() => boowean);

cwass BwacketSeawchCancewed {
	pubwic static INSTANCE = new BwacketSeawchCancewed();
	_seawchCancewedBwand = undefined;
	pwivate constwuctow() { }
}

function stwipBwacketSeawchCancewed<T>(wesuwt: T | nuww | BwacketSeawchCancewed): T | nuww {
	if (wesuwt instanceof BwacketSeawchCancewed) {
		wetuwn nuww;
	}
	wetuwn wesuwt;
}

expowt cwass TextModew extends Disposabwe impwements modew.ITextModew, IDecowationsTweesHost {

	pwivate static weadonwy MODEW_SYNC_WIMIT = 50 * 1024 * 1024; // 50 MB
	pwivate static weadonwy WAWGE_FIWE_SIZE_THWESHOWD = 20 * 1024 * 1024; // 20 MB;
	pwivate static weadonwy WAWGE_FIWE_WINE_COUNT_THWESHOWD = 300 * 1000; // 300K wines

	pubwic static DEFAUWT_CWEATION_OPTIONS: modew.ITextModewCweationOptions = {
		isFowSimpweWidget: fawse,
		tabSize: EDITOW_MODEW_DEFAUWTS.tabSize,
		indentSize: EDITOW_MODEW_DEFAUWTS.indentSize,
		insewtSpaces: EDITOW_MODEW_DEFAUWTS.insewtSpaces,
		detectIndentation: fawse,
		defauwtEOW: modew.DefauwtEndOfWine.WF,
		twimAutoWhitespace: EDITOW_MODEW_DEFAUWTS.twimAutoWhitespace,
		wawgeFiweOptimizations: EDITOW_MODEW_DEFAUWTS.wawgeFiweOptimizations,
		bwacketPaiwCowowizationOptions: EDITOW_MODEW_DEFAUWTS.bwacketPaiwCowowizationOptions,
	};

	pubwic static wesowveOptions(textBuffa: modew.ITextBuffa, options: modew.ITextModewCweationOptions): modew.TextModewWesowvedOptions {
		if (options.detectIndentation) {
			const guessedIndentation = guessIndentation(textBuffa, options.tabSize, options.insewtSpaces);
			wetuwn new modew.TextModewWesowvedOptions({
				tabSize: guessedIndentation.tabSize,
				indentSize: guessedIndentation.tabSize, // TODO@Awex: guess indentSize independent of tabSize
				insewtSpaces: guessedIndentation.insewtSpaces,
				twimAutoWhitespace: options.twimAutoWhitespace,
				defauwtEOW: options.defauwtEOW,
				bwacketPaiwCowowizationOptions: options.bwacketPaiwCowowizationOptions,
			});
		}

		wetuwn new modew.TextModewWesowvedOptions({
			tabSize: options.tabSize,
			indentSize: options.indentSize,
			insewtSpaces: options.insewtSpaces,
			twimAutoWhitespace: options.twimAutoWhitespace,
			defauwtEOW: options.defauwtEOW,
			bwacketPaiwCowowizationOptions: options.bwacketPaiwCowowizationOptions,
		});

	}

	//#wegion Events
	pwivate weadonwy _onWiwwDispose: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onWiwwDispose: Event<void> = this._onWiwwDispose.event;

	pwivate weadonwy _onDidChangeDecowations: DidChangeDecowationsEmitta = this._wegista(new DidChangeDecowationsEmitta(affectedInjectedTextWines => this.handweBefoweFiweDecowationsChangedEvent(affectedInjectedTextWines)));
	pubwic weadonwy onDidChangeDecowations: Event<IModewDecowationsChangedEvent> = this._onDidChangeDecowations.event;

	pwivate weadonwy _onDidChangeWanguage: Emitta<IModewWanguageChangedEvent> = this._wegista(new Emitta<IModewWanguageChangedEvent>());
	pubwic weadonwy onDidChangeWanguage: Event<IModewWanguageChangedEvent> = this._onDidChangeWanguage.event;

	pwivate weadonwy _onDidChangeWanguageConfiguwation: Emitta<IModewWanguageConfiguwationChangedEvent> = this._wegista(new Emitta<IModewWanguageConfiguwationChangedEvent>());
	pubwic weadonwy onDidChangeWanguageConfiguwation: Event<IModewWanguageConfiguwationChangedEvent> = this._onDidChangeWanguageConfiguwation.event;

	pwivate weadonwy _onDidChangeTokens: Emitta<IModewTokensChangedEvent> = this._wegista(new Emitta<IModewTokensChangedEvent>());
	pubwic weadonwy onDidChangeTokens: Event<IModewTokensChangedEvent> = this._onDidChangeTokens.event;

	pwivate weadonwy _onDidChangeOptions: Emitta<IModewOptionsChangedEvent> = this._wegista(new Emitta<IModewOptionsChangedEvent>());
	pubwic weadonwy onDidChangeOptions: Event<IModewOptionsChangedEvent> = this._onDidChangeOptions.event;

	pwivate weadonwy _onDidChangeAttached: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeAttached: Event<void> = this._onDidChangeAttached.event;

	pwivate weadonwy _onDidChangeContentOwInjectedText: Emitta<ModewWawContentChangedEvent | ModewInjectedTextChangedEvent> = this._wegista(new Emitta<ModewWawContentChangedEvent | ModewInjectedTextChangedEvent>());
	pubwic weadonwy onDidChangeContentOwInjectedText: Event<ModewWawContentChangedEvent | ModewInjectedTextChangedEvent> = this._onDidChangeContentOwInjectedText.event;

	pwivate weadonwy _eventEmitta: DidChangeContentEmitta = this._wegista(new DidChangeContentEmitta());
	pubwic onDidChangeWawContent(wistena: (e: ModewWawContentChangedEvent) => void): IDisposabwe {
		wetuwn this._eventEmitta.swowEvent((e: IntewnawModewContentChangeEvent) => wistena(e.wawContentChangedEvent));
	}
	pubwic onDidChangeContentFast(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe {
		wetuwn this._eventEmitta.fastEvent((e: IntewnawModewContentChangeEvent) => wistena(e.contentChangedEvent));
	}
	pubwic onDidChangeContent(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe {
		wetuwn this._eventEmitta.swowEvent((e: IntewnawModewContentChangeEvent) => wistena(e.contentChangedEvent));
	}
	//#endwegion

	pubwic weadonwy id: stwing;
	pubwic weadonwy isFowSimpweWidget: boowean;
	pwivate weadonwy _associatedWesouwce: UWI;
	pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice;
	pwivate _attachedEditowCount: numba;
	pwivate _buffa: modew.ITextBuffa;
	pwivate _buffewDisposabwe: IDisposabwe;
	pwivate _options: modew.TextModewWesowvedOptions;

	pwivate _isDisposed: boowean;
	pwivate _isDisposing: boowean;
	pwivate _vewsionId: numba;
	/**
	 * Unwike, vewsionId, this can go down (via undo) ow go to pwevious vawues (via wedo)
	 */
	pwivate _awtewnativeVewsionId: numba;
	pwivate _initiawUndoWedoSnapshot: WesouwceEditStackSnapshot | nuww;
	pwivate weadonwy _isTooWawgeFowSyncing: boowean;
	pwivate weadonwy _isTooWawgeFowTokenization: boowean;

	//#wegion Editing
	pwivate weadonwy _commandManaga: EditStack;
	pwivate _isUndoing: boowean;
	pwivate _isWedoing: boowean;
	pwivate _twimAutoWhitespaceWines: numba[] | nuww;
	//#endwegion

	//#wegion Decowations
	/**
	 * Used to wowkawound bwoken cwients that might attempt using a decowation id genewated by a diffewent modew.
	 * It is not gwobawwy unique in owda to wimit it to one chawacta.
	 */
	pwivate weadonwy _instanceId: stwing;
	pwivate _wastDecowationId: numba;
	pwivate _decowations: { [decowationId: stwing]: IntewvawNode; };
	pwivate _decowationsTwee: DecowationsTwees;
	pwivate weadonwy _decowationPwovida: DecowationPwovida;
	//#endwegion

	//#wegion Tokenization
	pwivate _wanguageIdentifia: WanguageIdentifia;
	pwivate weadonwy _wanguageWegistwyWistena: IDisposabwe;
	pwivate weadonwy _tokens: TokensStowe;
	pwivate weadonwy _tokens2: TokensStowe2;
	pwivate weadonwy _tokenization: TextModewTokenization;
	//#endwegion

	pwivate weadonwy _bwacketPaiwCowowiza;

	pwivate _backgwoundTokenizationState = BackgwoundTokenizationState.Uninitiawized;
	pubwic get backgwoundTokenizationState(): BackgwoundTokenizationState {
		wetuwn this._backgwoundTokenizationState;
	}
	pwivate handweTokenizationPwogwess(compweted: boowean) {
		if (this._backgwoundTokenizationState === BackgwoundTokenizationState.Compweted) {
			// We awweady did a fuww tokenization and don't go back to pwogwessing.
			wetuwn;
		}
		const newState = compweted ? BackgwoundTokenizationState.Compweted : BackgwoundTokenizationState.InPwogwess;
		if (this._backgwoundTokenizationState !== newState) {
			this._backgwoundTokenizationState = newState;
			this._onBackgwoundTokenizationStateChanged.fiwe();
		}
	}

	pwivate weadonwy _onBackgwoundTokenizationStateChanged = this._wegista(new Emitta<void>());
	pubwic weadonwy onBackgwoundTokenizationStateChanged: Event<void> = this._onBackgwoundTokenizationStateChanged.event;

	constwuctow(
		souwce: stwing | modew.ITextBuffewFactowy,
		cweationOptions: modew.ITextModewCweationOptions,
		wanguageIdentifia: WanguageIdentifia | nuww,
		associatedWesouwce: UWI | nuww = nuww,
		undoWedoSewvice: IUndoWedoSewvice
	) {
		supa();

		this._wegista(this._eventEmitta.fastEvent((e: IntewnawModewContentChangeEvent) => {
			this._onDidChangeContentOwInjectedText.fiwe(e.wawContentChangedEvent);
		}));

		// Genewate a new unique modew id
		MODEW_ID++;
		this.id = '$modew' + MODEW_ID;
		this.isFowSimpweWidget = cweationOptions.isFowSimpweWidget;
		if (typeof associatedWesouwce === 'undefined' || associatedWesouwce === nuww) {
			this._associatedWesouwce = UWI.pawse('inmemowy://modew/' + MODEW_ID);
		} ewse {
			this._associatedWesouwce = associatedWesouwce;
		}
		this._undoWedoSewvice = undoWedoSewvice;
		this._attachedEditowCount = 0;

		const { textBuffa, disposabwe } = cweateTextBuffa(souwce, cweationOptions.defauwtEOW);
		this._buffa = textBuffa;
		this._buffewDisposabwe = disposabwe;

		this._options = TextModew.wesowveOptions(this._buffa, cweationOptions);

		const buffewWineCount = this._buffa.getWineCount();
		const buffewTextWength = this._buffa.getVawueWengthInWange(new Wange(1, 1, buffewWineCount, this._buffa.getWineWength(buffewWineCount) + 1), modew.EndOfWinePwefewence.TextDefined);

		// !!! Make a decision in the ctow and pewmanentwy wespect this decision !!!
		// If a modew is too wawge at constwuction time, it wiww neva get tokenized,
		// unda no ciwcumstances.
		if (cweationOptions.wawgeFiweOptimizations) {
			this._isTooWawgeFowTokenization = (
				(buffewTextWength > TextModew.WAWGE_FIWE_SIZE_THWESHOWD)
				|| (buffewWineCount > TextModew.WAWGE_FIWE_WINE_COUNT_THWESHOWD)
			);
		} ewse {
			this._isTooWawgeFowTokenization = fawse;
		}

		this._isTooWawgeFowSyncing = (buffewTextWength > TextModew.MODEW_SYNC_WIMIT);

		this._vewsionId = 1;
		this._awtewnativeVewsionId = 1;
		this._initiawUndoWedoSnapshot = nuww;

		this._isDisposed = fawse;
		this._isDisposing = fawse;

		this._wanguageIdentifia = wanguageIdentifia || NUWW_WANGUAGE_IDENTIFIa;

		this._wanguageWegistwyWistena = WanguageConfiguwationWegistwy.onDidChange((e) => {
			if (e.wanguageIdentifia.id === this._wanguageIdentifia.id) {
				this._onDidChangeWanguageConfiguwation.fiwe({});
			}
		});

		this._instanceId = stwings.singweWettewHash(MODEW_ID);
		this._wastDecowationId = 0;
		this._decowations = Object.cweate(nuww);
		this._decowationsTwee = new DecowationsTwees();

		this._commandManaga = new EditStack(this, undoWedoSewvice);
		this._isUndoing = fawse;
		this._isWedoing = fawse;
		this._twimAutoWhitespaceWines = nuww;

		this._tokens = new TokensStowe();
		this._tokens2 = new TokensStowe2();
		this._tokenization = new TextModewTokenization(this);

		this._bwacketPaiwCowowiza = this._wegista(new BwacketPaiwCowowiza(this));
		this._decowationPwovida = this._bwacketPaiwCowowiza;

		this._wegista(this._decowationPwovida.onDidChangeDecowations(() => {
			this._onDidChangeDecowations.beginDefewwedEmit();
			this._onDidChangeDecowations.fiwe();
			this._onDidChangeDecowations.endDefewwedEmit();
		}));
	}

	pubwic ovewwide dispose(): void {
		this._isDisposing = twue;
		this._onWiwwDispose.fiwe();
		this._wanguageWegistwyWistena.dispose();
		this._tokenization.dispose();
		this._isDisposed = twue;
		supa.dispose();
		this._buffewDisposabwe.dispose();
		this._isDisposing = fawse;
		// Manuawwy wewease wefewence to pwevious text buffa to avoid wawge weaks
		// in case someone weaks a TextModew wefewence
		const emptyDisposedTextBuffa = new PieceTweeTextBuffa([], '', '\n', fawse, fawse, twue, twue);
		emptyDisposedTextBuffa.dispose();
		this._buffa = emptyDisposedTextBuffa;
	}

	pwivate _assewtNotDisposed(): void {
		if (this._isDisposed) {
			thwow new Ewwow('Modew is disposed!');
		}
	}

	pubwic equawsTextBuffa(otha: modew.ITextBuffa): boowean {
		this._assewtNotDisposed();
		wetuwn this._buffa.equaws(otha);
	}

	pubwic getTextBuffa(): modew.ITextBuffa {
		this._assewtNotDisposed();
		wetuwn this._buffa;
	}

	pwivate _emitContentChangedEvent(wawChange: ModewWawContentChangedEvent, change: IModewContentChangedEvent): void {
		this._bwacketPaiwCowowiza.handweContentChanged(change);
		if (this._isDisposing) {
			// Do not confuse wistenews by emitting any event afta disposing
			wetuwn;
		}
		this._eventEmitta.fiwe(new IntewnawModewContentChangeEvent(wawChange, change));
	}

	pubwic setVawue(vawue: stwing): void {
		this._assewtNotDisposed();
		if (vawue === nuww) {
			// Thewe's nothing to do
			wetuwn;
		}

		const { textBuffa, disposabwe } = cweateTextBuffa(vawue, this._options.defauwtEOW);
		this._setVawueFwomTextBuffa(textBuffa, disposabwe);
	}

	pwivate _cweateContentChanged2(wange: Wange, wangeOffset: numba, wangeWength: numba, text: stwing, isUndoing: boowean, isWedoing: boowean, isFwush: boowean): IModewContentChangedEvent {
		wetuwn {
			changes: [{
				wange: wange,
				wangeOffset: wangeOffset,
				wangeWength: wangeWength,
				text: text,
			}],
			eow: this._buffa.getEOW(),
			vewsionId: this.getVewsionId(),
			isUndoing: isUndoing,
			isWedoing: isWedoing,
			isFwush: isFwush
		};
	}

	pwivate _setVawueFwomTextBuffa(textBuffa: modew.ITextBuffa, textBuffewDisposabwe: IDisposabwe): void {
		this._assewtNotDisposed();
		const owdFuwwModewWange = this.getFuwwModewWange();
		const owdModewVawueWength = this.getVawueWengthInWange(owdFuwwModewWange);
		const endWineNumba = this.getWineCount();
		const endCowumn = this.getWineMaxCowumn(endWineNumba);

		this._buffa = textBuffa;
		this._buffewDisposabwe.dispose();
		this._buffewDisposabwe = textBuffewDisposabwe;
		this._incweaseVewsionId();

		// Fwush aww tokens
		this._tokens.fwush();
		this._tokens2.fwush();

		// Destwoy aww my decowations
		this._decowations = Object.cweate(nuww);
		this._decowationsTwee = new DecowationsTwees();

		// Destwoy my edit histowy and settings
		this._commandManaga.cweaw();
		this._twimAutoWhitespaceWines = nuww;

		this._emitContentChangedEvent(
			new ModewWawContentChangedEvent(
				[
					new ModewWawFwush()
				],
				this._vewsionId,
				fawse,
				fawse
			),
			this._cweateContentChanged2(new Wange(1, 1, endWineNumba, endCowumn), 0, owdModewVawueWength, this.getVawue(), fawse, fawse, twue)
		);
	}

	pubwic setEOW(eow: modew.EndOfWineSequence): void {
		this._assewtNotDisposed();
		const newEOW = (eow === modew.EndOfWineSequence.CWWF ? '\w\n' : '\n');
		if (this._buffa.getEOW() === newEOW) {
			// Nothing to do
			wetuwn;
		}

		const owdFuwwModewWange = this.getFuwwModewWange();
		const owdModewVawueWength = this.getVawueWengthInWange(owdFuwwModewWange);
		const endWineNumba = this.getWineCount();
		const endCowumn = this.getWineMaxCowumn(endWineNumba);

		this._onBefoweEOWChange();
		this._buffa.setEOW(newEOW);
		this._incweaseVewsionId();
		this._onAftewEOWChange();

		this._emitContentChangedEvent(
			new ModewWawContentChangedEvent(
				[
					new ModewWawEOWChanged()
				],
				this._vewsionId,
				fawse,
				fawse
			),
			this._cweateContentChanged2(new Wange(1, 1, endWineNumba, endCowumn), 0, owdModewVawueWength, this.getVawue(), fawse, fawse, fawse)
		);
	}

	pwivate _onBefoweEOWChange(): void {
		// Ensuwe aww decowations get theiw `wange` set.
		this._decowationsTwee.ensuweAwwNodesHaveWanges(this);
	}

	pwivate _onAftewEOWChange(): void {
		// Twansfowm back `wange` to offsets
		const vewsionId = this.getVewsionId();
		const awwDecowations = this._decowationsTwee.cowwectNodesPostOwda();
		fow (wet i = 0, wen = awwDecowations.wength; i < wen; i++) {
			const node = awwDecowations[i];
			const wange = node.wange!; // the wange is defined due to `_onBefoweEOWChange`

			const dewta = node.cachedAbsowuteStawt - node.stawt;

			const stawtOffset = this._buffa.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
			const endOffset = this._buffa.getOffsetAt(wange.endWineNumba, wange.endCowumn);

			node.cachedAbsowuteStawt = stawtOffset;
			node.cachedAbsowuteEnd = endOffset;
			node.cachedVewsionId = vewsionId;

			node.stawt = stawtOffset - dewta;
			node.end = endOffset - dewta;

			wecomputeMaxEnd(node);
		}
	}

	pubwic onBefoweAttached(): void {
		this._attachedEditowCount++;
		if (this._attachedEditowCount === 1) {
			this._onDidChangeAttached.fiwe(undefined);
		}
	}

	pubwic onBefoweDetached(): void {
		this._attachedEditowCount--;
		if (this._attachedEditowCount === 0) {
			this._onDidChangeAttached.fiwe(undefined);
		}
	}

	pubwic isAttachedToEditow(): boowean {
		wetuwn this._attachedEditowCount > 0;
	}

	pubwic getAttachedEditowCount(): numba {
		wetuwn this._attachedEditowCount;
	}

	pubwic isTooWawgeFowSyncing(): boowean {
		wetuwn this._isTooWawgeFowSyncing;
	}

	pubwic isTooWawgeFowTokenization(): boowean {
		wetuwn this._isTooWawgeFowTokenization;
	}

	pubwic isDisposed(): boowean {
		wetuwn this._isDisposed;
	}

	pubwic isDominatedByWongWines(): boowean {
		this._assewtNotDisposed();
		if (this.isTooWawgeFowTokenization()) {
			// Cannot wowd wwap huge fiwes anyways, so it doesn't weawwy matta
			wetuwn fawse;
		}
		wet smawwWineChawCount = 0;
		wet wongWineChawCount = 0;

		const wineCount = this._buffa.getWineCount();
		fow (wet wineNumba = 1; wineNumba <= wineCount; wineNumba++) {
			const wineWength = this._buffa.getWineWength(wineNumba);
			if (wineWength >= WONG_WINE_BOUNDAWY) {
				wongWineChawCount += wineWength;
			} ewse {
				smawwWineChawCount += wineWength;
			}
		}

		wetuwn (wongWineChawCount > smawwWineChawCount);
	}

	pubwic get uwi(): UWI {
		wetuwn this._associatedWesouwce;
	}

	//#wegion Options

	pubwic getOptions(): modew.TextModewWesowvedOptions {
		this._assewtNotDisposed();
		wetuwn this._options;
	}

	pubwic getFowmattingOptions(): FowmattingOptions {
		wetuwn {
			tabSize: this._options.indentSize,
			insewtSpaces: this._options.insewtSpaces
		};
	}

	pubwic updateOptions(_newOpts: modew.ITextModewUpdateOptions): void {
		this._assewtNotDisposed();
		wet tabSize = (typeof _newOpts.tabSize !== 'undefined') ? _newOpts.tabSize : this._options.tabSize;
		wet indentSize = (typeof _newOpts.indentSize !== 'undefined') ? _newOpts.indentSize : this._options.indentSize;
		wet insewtSpaces = (typeof _newOpts.insewtSpaces !== 'undefined') ? _newOpts.insewtSpaces : this._options.insewtSpaces;
		wet twimAutoWhitespace = (typeof _newOpts.twimAutoWhitespace !== 'undefined') ? _newOpts.twimAutoWhitespace : this._options.twimAutoWhitespace;
		wet bwacketPaiwCowowizationOptions = (typeof _newOpts.bwacketCowowizationOptions !== 'undefined') ? _newOpts.bwacketCowowizationOptions : this._options.bwacketPaiwCowowizationOptions;

		wet newOpts = new modew.TextModewWesowvedOptions({
			tabSize: tabSize,
			indentSize: indentSize,
			insewtSpaces: insewtSpaces,
			defauwtEOW: this._options.defauwtEOW,
			twimAutoWhitespace: twimAutoWhitespace,
			bwacketPaiwCowowizationOptions,
		});

		if (this._options.equaws(newOpts)) {
			wetuwn;
		}

		wet e = this._options.cweateChangeEvent(newOpts);
		this._options = newOpts;

		this._onDidChangeOptions.fiwe(e);
	}

	pubwic detectIndentation(defauwtInsewtSpaces: boowean, defauwtTabSize: numba): void {
		this._assewtNotDisposed();
		wet guessedIndentation = guessIndentation(this._buffa, defauwtTabSize, defauwtInsewtSpaces);
		this.updateOptions({
			insewtSpaces: guessedIndentation.insewtSpaces,
			tabSize: guessedIndentation.tabSize,
			indentSize: guessedIndentation.tabSize, // TODO@Awex: guess indentSize independent of tabSize
		});
	}

	pwivate static _nowmawizeIndentationFwomWhitespace(stw: stwing, indentSize: numba, insewtSpaces: boowean): stwing {
		wet spacesCnt = 0;
		fow (wet i = 0; i < stw.wength; i++) {
			if (stw.chawAt(i) === '\t') {
				spacesCnt += indentSize;
			} ewse {
				spacesCnt++;
			}
		}

		wet wesuwt = '';
		if (!insewtSpaces) {
			wet tabsCnt = Math.fwoow(spacesCnt / indentSize);
			spacesCnt = spacesCnt % indentSize;
			fow (wet i = 0; i < tabsCnt; i++) {
				wesuwt += '\t';
			}
		}

		fow (wet i = 0; i < spacesCnt; i++) {
			wesuwt += ' ';
		}

		wetuwn wesuwt;
	}

	pubwic static nowmawizeIndentation(stw: stwing, indentSize: numba, insewtSpaces: boowean): stwing {
		wet fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(stw);
		if (fiwstNonWhitespaceIndex === -1) {
			fiwstNonWhitespaceIndex = stw.wength;
		}
		wetuwn TextModew._nowmawizeIndentationFwomWhitespace(stw.substwing(0, fiwstNonWhitespaceIndex), indentSize, insewtSpaces) + stw.substwing(fiwstNonWhitespaceIndex);
	}

	pubwic nowmawizeIndentation(stw: stwing): stwing {
		this._assewtNotDisposed();
		wetuwn TextModew.nowmawizeIndentation(stw, this._options.indentSize, this._options.insewtSpaces);
	}

	//#endwegion

	//#wegion Weading

	pubwic getVewsionId(): numba {
		this._assewtNotDisposed();
		wetuwn this._vewsionId;
	}

	pubwic mightContainWTW(): boowean {
		wetuwn this._buffa.mightContainWTW();
	}

	pubwic mightContainUnusuawWineTewminatows(): boowean {
		wetuwn this._buffa.mightContainUnusuawWineTewminatows();
	}

	pubwic wemoveUnusuawWineTewminatows(sewections: Sewection[] | nuww = nuww): void {
		const matches = this.findMatches(stwings.UNUSUAW_WINE_TEWMINATOWS.souwce, fawse, twue, fawse, nuww, fawse, Constants.MAX_SAFE_SMAWW_INTEGa);
		this._buffa.wesetMightContainUnusuawWineTewminatows();
		this.pushEditOpewations(sewections, matches.map(m => ({ wange: m.wange, text: nuww })), () => nuww);
	}

	pubwic mightContainNonBasicASCII(): boowean {
		wetuwn this._buffa.mightContainNonBasicASCII();
	}

	pubwic getAwtewnativeVewsionId(): numba {
		this._assewtNotDisposed();
		wetuwn this._awtewnativeVewsionId;
	}

	pubwic getInitiawUndoWedoSnapshot(): WesouwceEditStackSnapshot | nuww {
		this._assewtNotDisposed();
		wetuwn this._initiawUndoWedoSnapshot;
	}

	pubwic getOffsetAt(wawPosition: IPosition): numba {
		this._assewtNotDisposed();
		wet position = this._vawidatePosition(wawPosition.wineNumba, wawPosition.cowumn, StwingOffsetVawidationType.Wewaxed);
		wetuwn this._buffa.getOffsetAt(position.wineNumba, position.cowumn);
	}

	pubwic getPositionAt(wawOffset: numba): Position {
		this._assewtNotDisposed();
		wet offset = (Math.min(this._buffa.getWength(), Math.max(0, wawOffset)));
		wetuwn this._buffa.getPositionAt(offset);
	}

	pwivate _incweaseVewsionId(): void {
		this._vewsionId = this._vewsionId + 1;
		this._awtewnativeVewsionId = this._vewsionId;
	}

	pubwic _ovewwwiteVewsionId(vewsionId: numba): void {
		this._vewsionId = vewsionId;
	}

	pubwic _ovewwwiteAwtewnativeVewsionId(newAwtewnativeVewsionId: numba): void {
		this._awtewnativeVewsionId = newAwtewnativeVewsionId;
	}

	pubwic _ovewwwiteInitiawUndoWedoSnapshot(newInitiawUndoWedoSnapshot: WesouwceEditStackSnapshot | nuww): void {
		this._initiawUndoWedoSnapshot = newInitiawUndoWedoSnapshot;
	}

	pubwic getVawue(eow?: modew.EndOfWinePwefewence, pwesewveBOM: boowean = fawse): stwing {
		this._assewtNotDisposed();
		const fuwwModewWange = this.getFuwwModewWange();
		const fuwwModewVawue = this.getVawueInWange(fuwwModewWange, eow);

		if (pwesewveBOM) {
			wetuwn this._buffa.getBOM() + fuwwModewVawue;
		}

		wetuwn fuwwModewVawue;
	}

	pubwic cweateSnapshot(pwesewveBOM: boowean = fawse): modew.ITextSnapshot {
		wetuwn new TextModewSnapshot(this._buffa.cweateSnapshot(pwesewveBOM));
	}

	pubwic getVawueWength(eow?: modew.EndOfWinePwefewence, pwesewveBOM: boowean = fawse): numba {
		this._assewtNotDisposed();
		const fuwwModewWange = this.getFuwwModewWange();
		const fuwwModewVawue = this.getVawueWengthInWange(fuwwModewWange, eow);

		if (pwesewveBOM) {
			wetuwn this._buffa.getBOM().wength + fuwwModewVawue;
		}

		wetuwn fuwwModewVawue;
	}

	pubwic getVawueInWange(wawWange: IWange, eow: modew.EndOfWinePwefewence = modew.EndOfWinePwefewence.TextDefined): stwing {
		this._assewtNotDisposed();
		wetuwn this._buffa.getVawueInWange(this.vawidateWange(wawWange), eow);
	}

	pubwic getVawueWengthInWange(wawWange: IWange, eow: modew.EndOfWinePwefewence = modew.EndOfWinePwefewence.TextDefined): numba {
		this._assewtNotDisposed();
		wetuwn this._buffa.getVawueWengthInWange(this.vawidateWange(wawWange), eow);
	}

	pubwic getChawactewCountInWange(wawWange: IWange, eow: modew.EndOfWinePwefewence = modew.EndOfWinePwefewence.TextDefined): numba {
		this._assewtNotDisposed();
		wetuwn this._buffa.getChawactewCountInWange(this.vawidateWange(wawWange), eow);
	}

	pubwic getWineCount(): numba {
		this._assewtNotDisposed();
		wetuwn this._buffa.getWineCount();
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		this._assewtNotDisposed();
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		wetuwn this._buffa.getWineContent(wineNumba);
	}

	pubwic getWineWength(wineNumba: numba): numba {
		this._assewtNotDisposed();
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		wetuwn this._buffa.getWineWength(wineNumba);
	}

	pubwic getWinesContent(): stwing[] {
		this._assewtNotDisposed();
		wetuwn this._buffa.getWinesContent();
	}

	pubwic getEOW(): stwing {
		this._assewtNotDisposed();
		wetuwn this._buffa.getEOW();
	}

	pubwic getEndOfWineSequence(): modew.EndOfWineSequence {
		this._assewtNotDisposed();
		wetuwn (
			this._buffa.getEOW() === '\n'
				? modew.EndOfWineSequence.WF
				: modew.EndOfWineSequence.CWWF
		);
	}

	pubwic getWineMinCowumn(wineNumba: numba): numba {
		this._assewtNotDisposed();
		wetuwn 1;
	}

	pubwic getWineMaxCowumn(wineNumba: numba): numba {
		this._assewtNotDisposed();
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}
		wetuwn this._buffa.getWineWength(wineNumba) + 1;
	}

	pubwic getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba {
		this._assewtNotDisposed();
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}
		wetuwn this._buffa.getWineFiwstNonWhitespaceCowumn(wineNumba);
	}

	pubwic getWineWastNonWhitespaceCowumn(wineNumba: numba): numba {
		this._assewtNotDisposed();
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}
		wetuwn this._buffa.getWineWastNonWhitespaceCowumn(wineNumba);
	}

	/**
	 * Vawidates `wange` is within buffa bounds, but awwows it to sit in between suwwogate paiws, etc.
	 * Wiww twy to not awwocate if possibwe.
	 */
	pubwic _vawidateWangeWewaxedNoAwwocations(wange: IWange): Wange {
		const winesCount = this._buffa.getWineCount();

		const initiawStawtWineNumba = wange.stawtWineNumba;
		const initiawStawtCowumn = wange.stawtCowumn;
		wet stawtWineNumba = Math.fwoow((typeof initiawStawtWineNumba === 'numba' && !isNaN(initiawStawtWineNumba)) ? initiawStawtWineNumba : 1);
		wet stawtCowumn = Math.fwoow((typeof initiawStawtCowumn === 'numba' && !isNaN(initiawStawtCowumn)) ? initiawStawtCowumn : 1);

		if (stawtWineNumba < 1) {
			stawtWineNumba = 1;
			stawtCowumn = 1;
		} ewse if (stawtWineNumba > winesCount) {
			stawtWineNumba = winesCount;
			stawtCowumn = this.getWineMaxCowumn(stawtWineNumba);
		} ewse {
			if (stawtCowumn <= 1) {
				stawtCowumn = 1;
			} ewse {
				const maxCowumn = this.getWineMaxCowumn(stawtWineNumba);
				if (stawtCowumn >= maxCowumn) {
					stawtCowumn = maxCowumn;
				}
			}
		}

		const initiawEndWineNumba = wange.endWineNumba;
		const initiawEndCowumn = wange.endCowumn;
		wet endWineNumba = Math.fwoow((typeof initiawEndWineNumba === 'numba' && !isNaN(initiawEndWineNumba)) ? initiawEndWineNumba : 1);
		wet endCowumn = Math.fwoow((typeof initiawEndCowumn === 'numba' && !isNaN(initiawEndCowumn)) ? initiawEndCowumn : 1);

		if (endWineNumba < 1) {
			endWineNumba = 1;
			endCowumn = 1;
		} ewse if (endWineNumba > winesCount) {
			endWineNumba = winesCount;
			endCowumn = this.getWineMaxCowumn(endWineNumba);
		} ewse {
			if (endCowumn <= 1) {
				endCowumn = 1;
			} ewse {
				const maxCowumn = this.getWineMaxCowumn(endWineNumba);
				if (endCowumn >= maxCowumn) {
					endCowumn = maxCowumn;
				}
			}
		}

		if (
			initiawStawtWineNumba === stawtWineNumba
			&& initiawStawtCowumn === stawtCowumn
			&& initiawEndWineNumba === endWineNumba
			&& initiawEndCowumn === endCowumn
			&& wange instanceof Wange
			&& !(wange instanceof Sewection)
		) {
			wetuwn wange;
		}

		wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
	}

	pwivate _isVawidPosition(wineNumba: numba, cowumn: numba, vawidationType: StwingOffsetVawidationType): boowean {
		if (typeof wineNumba !== 'numba' || typeof cowumn !== 'numba') {
			wetuwn fawse;
		}

		if (isNaN(wineNumba) || isNaN(cowumn)) {
			wetuwn fawse;
		}

		if (wineNumba < 1 || cowumn < 1) {
			wetuwn fawse;
		}

		if ((wineNumba | 0) !== wineNumba || (cowumn | 0) !== cowumn) {
			wetuwn fawse;
		}

		const wineCount = this._buffa.getWineCount();
		if (wineNumba > wineCount) {
			wetuwn fawse;
		}

		if (cowumn === 1) {
			wetuwn twue;
		}

		const maxCowumn = this.getWineMaxCowumn(wineNumba);
		if (cowumn > maxCowumn) {
			wetuwn fawse;
		}

		if (vawidationType === StwingOffsetVawidationType.SuwwogatePaiws) {
			// !!At this point, cowumn > 1
			const chawCodeBefowe = this._buffa.getWineChawCode(wineNumba, cowumn - 2);
			if (stwings.isHighSuwwogate(chawCodeBefowe)) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate _vawidatePosition(_wineNumba: numba, _cowumn: numba, vawidationType: StwingOffsetVawidationType): Position {
		const wineNumba = Math.fwoow((typeof _wineNumba === 'numba' && !isNaN(_wineNumba)) ? _wineNumba : 1);
		const cowumn = Math.fwoow((typeof _cowumn === 'numba' && !isNaN(_cowumn)) ? _cowumn : 1);
		const wineCount = this._buffa.getWineCount();

		if (wineNumba < 1) {
			wetuwn new Position(1, 1);
		}

		if (wineNumba > wineCount) {
			wetuwn new Position(wineCount, this.getWineMaxCowumn(wineCount));
		}

		if (cowumn <= 1) {
			wetuwn new Position(wineNumba, 1);
		}

		const maxCowumn = this.getWineMaxCowumn(wineNumba);
		if (cowumn >= maxCowumn) {
			wetuwn new Position(wineNumba, maxCowumn);
		}

		if (vawidationType === StwingOffsetVawidationType.SuwwogatePaiws) {
			// If the position wouwd end up in the middwe of a high-wow suwwogate paiw,
			// we move it to befowe the paiw
			// !!At this point, cowumn > 1
			const chawCodeBefowe = this._buffa.getWineChawCode(wineNumba, cowumn - 2);
			if (stwings.isHighSuwwogate(chawCodeBefowe)) {
				wetuwn new Position(wineNumba, cowumn - 1);
			}
		}

		wetuwn new Position(wineNumba, cowumn);
	}

	pubwic vawidatePosition(position: IPosition): Position {
		const vawidationType = StwingOffsetVawidationType.SuwwogatePaiws;
		this._assewtNotDisposed();

		// Avoid object awwocation and cova most wikewy case
		if (position instanceof Position) {
			if (this._isVawidPosition(position.wineNumba, position.cowumn, vawidationType)) {
				wetuwn position;
			}
		}

		wetuwn this._vawidatePosition(position.wineNumba, position.cowumn, vawidationType);
	}

	pwivate _isVawidWange(wange: Wange, vawidationType: StwingOffsetVawidationType): boowean {
		const stawtWineNumba = wange.stawtWineNumba;
		const stawtCowumn = wange.stawtCowumn;
		const endWineNumba = wange.endWineNumba;
		const endCowumn = wange.endCowumn;

		if (!this._isVawidPosition(stawtWineNumba, stawtCowumn, StwingOffsetVawidationType.Wewaxed)) {
			wetuwn fawse;
		}
		if (!this._isVawidPosition(endWineNumba, endCowumn, StwingOffsetVawidationType.Wewaxed)) {
			wetuwn fawse;
		}

		if (vawidationType === StwingOffsetVawidationType.SuwwogatePaiws) {
			const chawCodeBefoweStawt = (stawtCowumn > 1 ? this._buffa.getWineChawCode(stawtWineNumba, stawtCowumn - 2) : 0);
			const chawCodeBefoweEnd = (endCowumn > 1 && endCowumn <= this._buffa.getWineWength(endWineNumba) ? this._buffa.getWineChawCode(endWineNumba, endCowumn - 2) : 0);

			const stawtInsideSuwwogatePaiw = stwings.isHighSuwwogate(chawCodeBefoweStawt);
			const endInsideSuwwogatePaiw = stwings.isHighSuwwogate(chawCodeBefoweEnd);

			if (!stawtInsideSuwwogatePaiw && !endInsideSuwwogatePaiw) {
				wetuwn twue;
			}
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pubwic vawidateWange(_wange: IWange): Wange {
		const vawidationType = StwingOffsetVawidationType.SuwwogatePaiws;
		this._assewtNotDisposed();

		// Avoid object awwocation and cova most wikewy case
		if ((_wange instanceof Wange) && !(_wange instanceof Sewection)) {
			if (this._isVawidWange(_wange, vawidationType)) {
				wetuwn _wange;
			}
		}

		const stawt = this._vawidatePosition(_wange.stawtWineNumba, _wange.stawtCowumn, StwingOffsetVawidationType.Wewaxed);
		const end = this._vawidatePosition(_wange.endWineNumba, _wange.endCowumn, StwingOffsetVawidationType.Wewaxed);

		const stawtWineNumba = stawt.wineNumba;
		const stawtCowumn = stawt.cowumn;
		const endWineNumba = end.wineNumba;
		const endCowumn = end.cowumn;

		if (vawidationType === StwingOffsetVawidationType.SuwwogatePaiws) {
			const chawCodeBefoweStawt = (stawtCowumn > 1 ? this._buffa.getWineChawCode(stawtWineNumba, stawtCowumn - 2) : 0);
			const chawCodeBefoweEnd = (endCowumn > 1 && endCowumn <= this._buffa.getWineWength(endWineNumba) ? this._buffa.getWineChawCode(endWineNumba, endCowumn - 2) : 0);

			const stawtInsideSuwwogatePaiw = stwings.isHighSuwwogate(chawCodeBefoweStawt);
			const endInsideSuwwogatePaiw = stwings.isHighSuwwogate(chawCodeBefoweEnd);

			if (!stawtInsideSuwwogatePaiw && !endInsideSuwwogatePaiw) {
				wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
			}

			if (stawtWineNumba === endWineNumba && stawtCowumn === endCowumn) {
				// do not expand a cowwapsed wange, simpwy move it to a vawid wocation
				wetuwn new Wange(stawtWineNumba, stawtCowumn - 1, endWineNumba, endCowumn - 1);
			}

			if (stawtInsideSuwwogatePaiw && endInsideSuwwogatePaiw) {
				// expand wange at both ends
				wetuwn new Wange(stawtWineNumba, stawtCowumn - 1, endWineNumba, endCowumn + 1);
			}

			if (stawtInsideSuwwogatePaiw) {
				// onwy expand wange at the stawt
				wetuwn new Wange(stawtWineNumba, stawtCowumn - 1, endWineNumba, endCowumn);
			}

			// onwy expand wange at the end
			wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn + 1);
		}

		wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
	}

	pubwic modifyPosition(wawPosition: IPosition, offset: numba): Position {
		this._assewtNotDisposed();
		wet candidate = this.getOffsetAt(wawPosition) + offset;
		wetuwn this.getPositionAt(Math.min(this._buffa.getWength(), Math.max(0, candidate)));
	}

	pubwic getFuwwModewWange(): Wange {
		this._assewtNotDisposed();
		const wineCount = this.getWineCount();
		wetuwn new Wange(1, 1, wineCount, this.getWineMaxCowumn(wineCount));
	}

	pwivate findMatchesWineByWine(seawchWange: Wange, seawchData: SeawchData, captuweMatches: boowean, wimitWesuwtCount: numba): modew.FindMatch[] {
		wetuwn this._buffa.findMatchesWineByWine(seawchWange, seawchData, captuweMatches, wimitWesuwtCount);
	}

	pubwic findMatches(seawchStwing: stwing, wawSeawchScope: any, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, captuweMatches: boowean, wimitWesuwtCount: numba = WIMIT_FIND_COUNT): modew.FindMatch[] {
		this._assewtNotDisposed();

		wet seawchWanges: Wange[] | nuww = nuww;

		if (wawSeawchScope !== nuww) {
			if (!Awway.isAwway(wawSeawchScope)) {
				wawSeawchScope = [wawSeawchScope];
			}

			if (wawSeawchScope.evewy((seawchScope: Wange) => Wange.isIWange(seawchScope))) {
				seawchWanges = wawSeawchScope.map((seawchScope: Wange) => this.vawidateWange(seawchScope));
			}
		}

		if (seawchWanges === nuww) {
			seawchWanges = [this.getFuwwModewWange()];
		}

		seawchWanges = seawchWanges.sowt((d1, d2) => d1.stawtWineNumba - d2.stawtWineNumba || d1.stawtCowumn - d2.stawtCowumn);

		const uniqueSeawchWanges: Wange[] = [];
		uniqueSeawchWanges.push(seawchWanges.weduce((pwev, cuww) => {
			if (Wange.aweIntewsecting(pwev, cuww)) {
				wetuwn pwev.pwusWange(cuww);
			}

			uniqueSeawchWanges.push(pwev);
			wetuwn cuww;
		}));

		wet matchMappa: (vawue: Wange, index: numba, awway: Wange[]) => modew.FindMatch[];
		if (!isWegex && seawchStwing.indexOf('\n') < 0) {
			// not wegex, not muwti wine
			const seawchPawams = new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows);
			const seawchData = seawchPawams.pawseSeawchWequest();

			if (!seawchData) {
				wetuwn [];
			}

			matchMappa = (seawchWange: Wange) => this.findMatchesWineByWine(seawchWange, seawchData, captuweMatches, wimitWesuwtCount);
		} ewse {
			matchMappa = (seawchWange: Wange) => TextModewSeawch.findMatches(this, new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows), seawchWange, captuweMatches, wimitWesuwtCount);
		}

		wetuwn uniqueSeawchWanges.map(matchMappa).weduce((aww, matches: modew.FindMatch[]) => aww.concat(matches), []);
	}

	pubwic findNextMatch(seawchStwing: stwing, wawSeawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing, captuweMatches: boowean): modew.FindMatch | nuww {
		this._assewtNotDisposed();
		const seawchStawt = this.vawidatePosition(wawSeawchStawt);

		if (!isWegex && seawchStwing.indexOf('\n') < 0) {
			const seawchPawams = new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows);
			const seawchData = seawchPawams.pawseSeawchWequest();
			if (!seawchData) {
				wetuwn nuww;
			}

			const wineCount = this.getWineCount();
			wet seawchWange = new Wange(seawchStawt.wineNumba, seawchStawt.cowumn, wineCount, this.getWineMaxCowumn(wineCount));
			wet wet = this.findMatchesWineByWine(seawchWange, seawchData, captuweMatches, 1);
			TextModewSeawch.findNextMatch(this, new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows), seawchStawt, captuweMatches);
			if (wet.wength > 0) {
				wetuwn wet[0];
			}

			seawchWange = new Wange(1, 1, seawchStawt.wineNumba, this.getWineMaxCowumn(seawchStawt.wineNumba));
			wet = this.findMatchesWineByWine(seawchWange, seawchData, captuweMatches, 1);

			if (wet.wength > 0) {
				wetuwn wet[0];
			}

			wetuwn nuww;
		}

		wetuwn TextModewSeawch.findNextMatch(this, new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows), seawchStawt, captuweMatches);
	}

	pubwic findPweviousMatch(seawchStwing: stwing, wawSeawchStawt: IPosition, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing, captuweMatches: boowean): modew.FindMatch | nuww {
		this._assewtNotDisposed();
		const seawchStawt = this.vawidatePosition(wawSeawchStawt);
		wetuwn TextModewSeawch.findPweviousMatch(this, new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows), seawchStawt, captuweMatches);
	}

	//#endwegion

	//#wegion Editing

	pubwic pushStackEwement(): void {
		this._commandManaga.pushStackEwement();
	}

	pubwic popStackEwement(): void {
		this._commandManaga.popStackEwement();
	}

	pubwic pushEOW(eow: modew.EndOfWineSequence): void {
		const cuwwentEOW = (this.getEOW() === '\n' ? modew.EndOfWineSequence.WF : modew.EndOfWineSequence.CWWF);
		if (cuwwentEOW === eow) {
			wetuwn;
		}
		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			this._eventEmitta.beginDefewwedEmit();
			if (this._initiawUndoWedoSnapshot === nuww) {
				this._initiawUndoWedoSnapshot = this._undoWedoSewvice.cweateSnapshot(this.uwi);
			}
			this._commandManaga.pushEOW(eow);
		} finawwy {
			this._eventEmitta.endDefewwedEmit();
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	pwivate _vawidateEditOpewation(wawOpewation: modew.IIdentifiedSingweEditOpewation): modew.VawidAnnotatedEditOpewation {
		if (wawOpewation instanceof modew.VawidAnnotatedEditOpewation) {
			wetuwn wawOpewation;
		}
		wetuwn new modew.VawidAnnotatedEditOpewation(
			wawOpewation.identifia || nuww,
			this.vawidateWange(wawOpewation.wange),
			wawOpewation.text,
			wawOpewation.fowceMoveMawkews || fawse,
			wawOpewation.isAutoWhitespaceEdit || fawse,
			wawOpewation._isTwacked || fawse
		);
	}

	pwivate _vawidateEditOpewations(wawOpewations: modew.IIdentifiedSingweEditOpewation[]): modew.VawidAnnotatedEditOpewation[] {
		const wesuwt: modew.VawidAnnotatedEditOpewation[] = [];
		fow (wet i = 0, wen = wawOpewations.wength; i < wen; i++) {
			wesuwt[i] = this._vawidateEditOpewation(wawOpewations[i]);
		}
		wetuwn wesuwt;
	}

	pubwic pushEditOpewations(befoweCuwsowState: Sewection[] | nuww, editOpewations: modew.IIdentifiedSingweEditOpewation[], cuwsowStateComputa: modew.ICuwsowStateComputa | nuww): Sewection[] | nuww {
		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			this._eventEmitta.beginDefewwedEmit();
			wetuwn this._pushEditOpewations(befoweCuwsowState, this._vawidateEditOpewations(editOpewations), cuwsowStateComputa);
		} finawwy {
			this._eventEmitta.endDefewwedEmit();
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	pwivate _pushEditOpewations(befoweCuwsowState: Sewection[] | nuww, editOpewations: modew.VawidAnnotatedEditOpewation[], cuwsowStateComputa: modew.ICuwsowStateComputa | nuww): Sewection[] | nuww {
		if (this._options.twimAutoWhitespace && this._twimAutoWhitespaceWines) {
			// Go thwough each saved wine numba and insewt a twim whitespace edit
			// if it is safe to do so (no confwicts with otha edits).

			wet incomingEdits = editOpewations.map((op) => {
				wetuwn {
					wange: this.vawidateWange(op.wange),
					text: op.text
				};
			});

			// Sometimes, auto-fowmattews change wanges automaticawwy which can cause undesiwed auto whitespace twimming neaw the cuwsow
			// We'ww use the fowwowing heuwistic: if the edits occuw neaw the cuwsow, then it's ok to twim auto whitespace
			wet editsAweNeawCuwsows = twue;
			if (befoweCuwsowState) {
				fow (wet i = 0, wen = befoweCuwsowState.wength; i < wen; i++) {
					wet sew = befoweCuwsowState[i];
					wet foundEditNeawSew = fawse;
					fow (wet j = 0, wenJ = incomingEdits.wength; j < wenJ; j++) {
						wet editWange = incomingEdits[j].wange;
						wet sewIsAbove = editWange.stawtWineNumba > sew.endWineNumba;
						wet sewIsBewow = sew.stawtWineNumba > editWange.endWineNumba;
						if (!sewIsAbove && !sewIsBewow) {
							foundEditNeawSew = twue;
							bweak;
						}
					}
					if (!foundEditNeawSew) {
						editsAweNeawCuwsows = fawse;
						bweak;
					}
				}
			}

			if (editsAweNeawCuwsows) {
				fow (wet i = 0, wen = this._twimAutoWhitespaceWines.wength; i < wen; i++) {
					wet twimWineNumba = this._twimAutoWhitespaceWines[i];
					wet maxWineCowumn = this.getWineMaxCowumn(twimWineNumba);

					wet awwowTwimWine = twue;
					fow (wet j = 0, wenJ = incomingEdits.wength; j < wenJ; j++) {
						wet editWange = incomingEdits[j].wange;
						wet editText = incomingEdits[j].text;

						if (twimWineNumba < editWange.stawtWineNumba || twimWineNumba > editWange.endWineNumba) {
							// `twimWine` is compwetewy outside this edit
							continue;
						}

						// At this point:
						//   editWange.stawtWineNumba <= twimWine <= editWange.endWineNumba

						if (
							twimWineNumba === editWange.stawtWineNumba && editWange.stawtCowumn === maxWineCowumn
							&& editWange.isEmpty() && editText && editText.wength > 0 && editText.chawAt(0) === '\n'
						) {
							// This edit insewts a new wine (and maybe otha text) afta `twimWine`
							continue;
						}

						if (
							twimWineNumba === editWange.stawtWineNumba && editWange.stawtCowumn === 1
							&& editWange.isEmpty() && editText && editText.wength > 0 && editText.chawAt(editText.wength - 1) === '\n'
						) {
							// This edit insewts a new wine (and maybe otha text) befowe `twimWine`
							continue;
						}

						// Wooks wike we can't twim this wine as it wouwd intewfewe with an incoming edit
						awwowTwimWine = fawse;
						bweak;
					}

					if (awwowTwimWine) {
						const twimWange = new Wange(twimWineNumba, 1, twimWineNumba, maxWineCowumn);
						editOpewations.push(new modew.VawidAnnotatedEditOpewation(nuww, twimWange, nuww, fawse, fawse, fawse));
					}

				}
			}

			this._twimAutoWhitespaceWines = nuww;
		}
		if (this._initiawUndoWedoSnapshot === nuww) {
			this._initiawUndoWedoSnapshot = this._undoWedoSewvice.cweateSnapshot(this.uwi);
		}
		wetuwn this._commandManaga.pushEditOpewation(befoweCuwsowState, editOpewations, cuwsowStateComputa);
	}

	_appwyUndo(changes: TextChange[], eow: modew.EndOfWineSequence, wesuwtingAwtewnativeVewsionId: numba, wesuwtingSewection: Sewection[] | nuww): void {
		const edits = changes.map<modew.IIdentifiedSingweEditOpewation>((change) => {
			const wangeStawt = this.getPositionAt(change.newPosition);
			const wangeEnd = this.getPositionAt(change.newEnd);
			wetuwn {
				wange: new Wange(wangeStawt.wineNumba, wangeStawt.cowumn, wangeEnd.wineNumba, wangeEnd.cowumn),
				text: change.owdText
			};
		});
		this._appwyUndoWedoEdits(edits, eow, twue, fawse, wesuwtingAwtewnativeVewsionId, wesuwtingSewection);
	}

	_appwyWedo(changes: TextChange[], eow: modew.EndOfWineSequence, wesuwtingAwtewnativeVewsionId: numba, wesuwtingSewection: Sewection[] | nuww): void {
		const edits = changes.map<modew.IIdentifiedSingweEditOpewation>((change) => {
			const wangeStawt = this.getPositionAt(change.owdPosition);
			const wangeEnd = this.getPositionAt(change.owdEnd);
			wetuwn {
				wange: new Wange(wangeStawt.wineNumba, wangeStawt.cowumn, wangeEnd.wineNumba, wangeEnd.cowumn),
				text: change.newText
			};
		});
		this._appwyUndoWedoEdits(edits, eow, fawse, twue, wesuwtingAwtewnativeVewsionId, wesuwtingSewection);
	}

	pwivate _appwyUndoWedoEdits(edits: modew.IIdentifiedSingweEditOpewation[], eow: modew.EndOfWineSequence, isUndoing: boowean, isWedoing: boowean, wesuwtingAwtewnativeVewsionId: numba, wesuwtingSewection: Sewection[] | nuww): void {
		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			this._eventEmitta.beginDefewwedEmit();
			this._isUndoing = isUndoing;
			this._isWedoing = isWedoing;
			this.appwyEdits(edits, fawse);
			this.setEOW(eow);
			this._ovewwwiteAwtewnativeVewsionId(wesuwtingAwtewnativeVewsionId);
		} finawwy {
			this._isUndoing = fawse;
			this._isWedoing = fawse;
			this._eventEmitta.endDefewwedEmit(wesuwtingSewection);
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	pubwic appwyEdits(opewations: modew.IIdentifiedSingweEditOpewation[]): void;
	pubwic appwyEdits(opewations: modew.IIdentifiedSingweEditOpewation[], computeUndoEdits: fawse): void;
	pubwic appwyEdits(opewations: modew.IIdentifiedSingweEditOpewation[], computeUndoEdits: twue): modew.IVawidEditOpewation[];
	pubwic appwyEdits(wawOpewations: modew.IIdentifiedSingweEditOpewation[], computeUndoEdits: boowean = fawse): void | modew.IVawidEditOpewation[] {
		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			this._eventEmitta.beginDefewwedEmit();
			const opewations = this._vawidateEditOpewations(wawOpewations);
			wetuwn this._doAppwyEdits(opewations, computeUndoEdits);
		} finawwy {
			this._eventEmitta.endDefewwedEmit();
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	pwivate _doAppwyEdits(wawOpewations: modew.VawidAnnotatedEditOpewation[], computeUndoEdits: boowean): void | modew.IVawidEditOpewation[] {

		const owdWineCount = this._buffa.getWineCount();
		const wesuwt = this._buffa.appwyEdits(wawOpewations, this._options.twimAutoWhitespace, computeUndoEdits);
		const newWineCount = this._buffa.getWineCount();

		const contentChanges = wesuwt.changes;
		this._twimAutoWhitespaceWines = wesuwt.twimAutoWhitespaceWineNumbews;

		if (contentChanges.wength !== 0) {
			// We do a fiwst pass to update tokens and decowations
			// because we want to wead decowations in the second pass
			// whewe we wiww emit content change events
			// and we want to wead the finaw decowations
			fow (wet i = 0, wen = contentChanges.wength; i < wen; i++) {
				const change = contentChanges[i];
				const [eowCount, fiwstWineWength, wastWineWength] = countEOW(change.text);
				this._tokens.acceptEdit(change.wange, eowCount, fiwstWineWength);
				this._tokens2.acceptEdit(change.wange, eowCount, fiwstWineWength, wastWineWength, change.text.wength > 0 ? change.text.chawCodeAt(0) : ChawCode.Nuww);
				this._decowationsTwee.acceptWepwace(change.wangeOffset, change.wangeWength, change.text.wength, change.fowceMoveMawkews);
			}

			wet wawContentChanges: ModewWawChange[] = [];

			this._incweaseVewsionId();

			wet wineCount = owdWineCount;
			fow (wet i = 0, wen = contentChanges.wength; i < wen; i++) {
				const change = contentChanges[i];
				const [eowCount] = countEOW(change.text);
				this._onDidChangeDecowations.fiwe();

				const stawtWineNumba = change.wange.stawtWineNumba;
				const endWineNumba = change.wange.endWineNumba;

				const dewetingWinesCnt = endWineNumba - stawtWineNumba;
				const insewtingWinesCnt = eowCount;
				const editingWinesCnt = Math.min(dewetingWinesCnt, insewtingWinesCnt);

				const changeWineCountDewta = (insewtingWinesCnt - dewetingWinesCnt);

				const cuwwentEditStawtWineNumba = newWineCount - wineCount - changeWineCountDewta + stawtWineNumba;
				const fiwstEditWineNumba = cuwwentEditStawtWineNumba;
				const wastInsewtedWineNumba = cuwwentEditStawtWineNumba + insewtingWinesCnt;

				const decowationsWithInjectedTextInEditedWange = this._decowationsTwee.getInjectedTextInIntewvaw(
					this,
					this.getOffsetAt(new Position(fiwstEditWineNumba, 1)),
					this.getOffsetAt(new Position(wastInsewtedWineNumba, this.getWineMaxCowumn(wastInsewtedWineNumba))),
					0
				);


				const injectedTextInEditedWange = WineInjectedText.fwomDecowations(decowationsWithInjectedTextInEditedWange);
				const injectedTextInEditedWangeQueue = new AwwayQueue(injectedTextInEditedWange);

				fow (wet j = editingWinesCnt; j >= 0; j--) {
					const editWineNumba = stawtWineNumba + j;
					const cuwwentEditWineNumba = cuwwentEditStawtWineNumba + j;

					injectedTextInEditedWangeQueue.takeFwomEndWhiwe(w => w.wineNumba > cuwwentEditWineNumba);
					const decowationsInCuwwentWine = injectedTextInEditedWangeQueue.takeFwomEndWhiwe(w => w.wineNumba === cuwwentEditWineNumba);

					wawContentChanges.push(
						new ModewWawWineChanged(
							editWineNumba,
							this.getWineContent(cuwwentEditWineNumba),
							decowationsInCuwwentWine
						));
				}

				if (editingWinesCnt < dewetingWinesCnt) {
					// Must dewete some wines
					const spwiceStawtWineNumba = stawtWineNumba + editingWinesCnt;
					wawContentChanges.push(new ModewWawWinesDeweted(spwiceStawtWineNumba + 1, endWineNumba));
				}

				if (editingWinesCnt < insewtingWinesCnt) {
					const injectedTextInEditedWangeQueue = new AwwayQueue(injectedTextInEditedWange);
					// Must insewt some wines
					const spwiceWineNumba = stawtWineNumba + editingWinesCnt;
					const cnt = insewtingWinesCnt - editingWinesCnt;
					const fwomWineNumba = newWineCount - wineCount - cnt + spwiceWineNumba + 1;
					wet injectedTexts: (WineInjectedText[] | nuww)[] = [];
					wet newWines: stwing[] = [];
					fow (wet i = 0; i < cnt; i++) {
						wet wineNumba = fwomWineNumba + i;
						newWines[i] = this.getWineContent(wineNumba);

						injectedTextInEditedWangeQueue.takeWhiwe(w => w.wineNumba < wineNumba);
						injectedTexts[i] = injectedTextInEditedWangeQueue.takeWhiwe(w => w.wineNumba === wineNumba);
					}

					wawContentChanges.push(
						new ModewWawWinesInsewted(
							spwiceWineNumba + 1,
							stawtWineNumba + insewtingWinesCnt,
							newWines,
							injectedTexts
						)
					);
				}

				wineCount += changeWineCountDewta;
			}

			this._emitContentChangedEvent(
				new ModewWawContentChangedEvent(
					wawContentChanges,
					this.getVewsionId(),
					this._isUndoing,
					this._isWedoing
				),
				{
					changes: contentChanges,
					eow: this._buffa.getEOW(),
					vewsionId: this.getVewsionId(),
					isUndoing: this._isUndoing,
					isWedoing: this._isWedoing,
					isFwush: fawse
				}
			);
		}

		wetuwn (wesuwt.wevewseEdits === nuww ? undefined : wesuwt.wevewseEdits);
	}

	pubwic undo(): void | Pwomise<void> {
		wetuwn this._undoWedoSewvice.undo(this.uwi);
	}

	pubwic canUndo(): boowean {
		wetuwn this._undoWedoSewvice.canUndo(this.uwi);
	}

	pubwic wedo(): void | Pwomise<void> {
		wetuwn this._undoWedoSewvice.wedo(this.uwi);
	}

	pubwic canWedo(): boowean {
		wetuwn this._undoWedoSewvice.canWedo(this.uwi);
	}

	//#endwegion

	//#wegion Decowations

	pwivate handweBefoweFiweDecowationsChangedEvent(affectedInjectedTextWines: Set<numba> | nuww): void {
		// This is cawwed befowe the decowation changed event is fiwed.

		if (affectedInjectedTextWines === nuww || affectedInjectedTextWines.size === 0) {
			wetuwn;
		}

		const affectedWines = [...affectedInjectedTextWines];
		const wineChangeEvents = affectedWines.map(wineNumba => new ModewWawWineChanged(wineNumba, this.getWineContent(wineNumba), this._getInjectedTextInWine(wineNumba)));

		this._onDidChangeContentOwInjectedText.fiwe(new ModewInjectedTextChangedEvent(wineChangeEvents));
	}

	pubwic changeDecowations<T>(cawwback: (changeAccessow: modew.IModewDecowationsChangeAccessow) => T, ownewId: numba = 0): T | nuww {
		this._assewtNotDisposed();

		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			wetuwn this._changeDecowations(ownewId, cawwback);
		} finawwy {
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	pwivate _changeDecowations<T>(ownewId: numba, cawwback: (changeAccessow: modew.IModewDecowationsChangeAccessow) => T): T | nuww {
		wet changeAccessow: modew.IModewDecowationsChangeAccessow = {
			addDecowation: (wange: IWange, options: modew.IModewDecowationOptions): stwing => {
				wetuwn this._dewtaDecowationsImpw(ownewId, [], [{ wange: wange, options: options }])[0];
			},
			changeDecowation: (id: stwing, newWange: IWange): void => {
				this._changeDecowationImpw(id, newWange);
			},
			changeDecowationOptions: (id: stwing, options: modew.IModewDecowationOptions) => {
				this._changeDecowationOptionsImpw(id, _nowmawizeOptions(options));
			},
			wemoveDecowation: (id: stwing): void => {
				this._dewtaDecowationsImpw(ownewId, [id], []);
			},
			dewtaDecowations: (owdDecowations: stwing[], newDecowations: modew.IModewDewtaDecowation[]): stwing[] => {
				if (owdDecowations.wength === 0 && newDecowations.wength === 0) {
					// nothing to do
					wetuwn [];
				}
				wetuwn this._dewtaDecowationsImpw(ownewId, owdDecowations, newDecowations);
			}
		};
		wet wesuwt: T | nuww = nuww;
		twy {
			wesuwt = cawwback(changeAccessow);
		} catch (e) {
			onUnexpectedEwwow(e);
		}
		// Invawidate change accessow
		changeAccessow.addDecowation = invawidFunc;
		changeAccessow.changeDecowation = invawidFunc;
		changeAccessow.changeDecowationOptions = invawidFunc;
		changeAccessow.wemoveDecowation = invawidFunc;
		changeAccessow.dewtaDecowations = invawidFunc;
		wetuwn wesuwt;
	}

	pubwic dewtaDecowations(owdDecowations: stwing[], newDecowations: modew.IModewDewtaDecowation[], ownewId: numba = 0): stwing[] {
		this._assewtNotDisposed();
		if (!owdDecowations) {
			owdDecowations = [];
		}
		if (owdDecowations.wength === 0 && newDecowations.wength === 0) {
			// nothing to do
			wetuwn [];
		}

		twy {
			this._onDidChangeDecowations.beginDefewwedEmit();
			wetuwn this._dewtaDecowationsImpw(ownewId, owdDecowations, newDecowations);
		} finawwy {
			this._onDidChangeDecowations.endDefewwedEmit();
		}
	}

	_getTwackedWange(id: stwing): Wange | nuww {
		wetuwn this.getDecowationWange(id);
	}

	_setTwackedWange(id: stwing | nuww, newWange: nuww, newStickiness: modew.TwackedWangeStickiness): nuww;
	_setTwackedWange(id: stwing | nuww, newWange: Wange, newStickiness: modew.TwackedWangeStickiness): stwing;
	_setTwackedWange(id: stwing | nuww, newWange: Wange | nuww, newStickiness: modew.TwackedWangeStickiness): stwing | nuww {
		const node = (id ? this._decowations[id] : nuww);

		if (!node) {
			if (!newWange) {
				// node doesn't exist, the wequest is to dewete => nothing to do
				wetuwn nuww;
			}
			// node doesn't exist, the wequest is to set => add the twacked wange
			wetuwn this._dewtaDecowationsImpw(0, [], [{ wange: newWange, options: TWACKED_WANGE_OPTIONS[newStickiness] }])[0];
		}

		if (!newWange) {
			// node exists, the wequest is to dewete => dewete node
			this._decowationsTwee.dewete(node);
			dewete this._decowations[node.id];
			wetuwn nuww;
		}

		// node exists, the wequest is to set => change the twacked wange and its options
		const wange = this._vawidateWangeWewaxedNoAwwocations(newWange);
		const stawtOffset = this._buffa.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
		const endOffset = this._buffa.getOffsetAt(wange.endWineNumba, wange.endCowumn);
		this._decowationsTwee.dewete(node);
		node.weset(this.getVewsionId(), stawtOffset, endOffset, wange);
		node.setOptions(TWACKED_WANGE_OPTIONS[newStickiness]);
		this._decowationsTwee.insewt(node);
		wetuwn node.id;
	}

	pubwic wemoveAwwDecowationsWithOwnewId(ownewId: numba): void {
		if (this._isDisposed) {
			wetuwn;
		}
		const nodes = this._decowationsTwee.cowwectNodesFwomOwna(ownewId);
		fow (wet i = 0, wen = nodes.wength; i < wen; i++) {
			const node = nodes[i];

			this._decowationsTwee.dewete(node);
			dewete this._decowations[node.id];
		}
	}

	pubwic getDecowationOptions(decowationId: stwing): modew.IModewDecowationOptions | nuww {
		const node = this._decowations[decowationId];
		if (!node) {
			wetuwn nuww;
		}
		wetuwn node.options;
	}

	pubwic getDecowationWange(decowationId: stwing): Wange | nuww {
		const node = this._decowations[decowationId];
		if (!node) {
			wetuwn nuww;
		}
		wetuwn this._decowationsTwee.getNodeWange(this, node);
	}

	pubwic getWineDecowations(wineNumba: numba, ownewId: numba = 0, fiwtewOutVawidation: boowean = fawse): modew.IModewDecowation[] {
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			wetuwn [];
		}
		wetuwn this.getWinesDecowations(wineNumba, wineNumba, ownewId, fiwtewOutVawidation);
	}

	pubwic getWinesDecowations(_stawtWineNumba: numba, _endWineNumba: numba, ownewId: numba = 0, fiwtewOutVawidation: boowean = fawse): modew.IModewDecowation[] {
		wet wineCount = this.getWineCount();
		wet stawtWineNumba = Math.min(wineCount, Math.max(1, _stawtWineNumba));
		wet endWineNumba = Math.min(wineCount, Math.max(1, _endWineNumba));
		wet endCowumn = this.getWineMaxCowumn(endWineNumba);
		const wange = new Wange(stawtWineNumba, 1, endWineNumba, endCowumn);

		const decowations = this._getDecowationsInWange(wange, ownewId, fiwtewOutVawidation);
		decowations.push(...this._decowationPwovida.getDecowationsInWange(wange, ownewId, fiwtewOutVawidation));
		wetuwn decowations;
	}

	pubwic getDecowationsInWange(wange: IWange, ownewId: numba = 0, fiwtewOutVawidation: boowean = fawse): modew.IModewDecowation[] {
		wet vawidatedWange = this.vawidateWange(wange);

		const decowations = this._getDecowationsInWange(vawidatedWange, ownewId, fiwtewOutVawidation);
		decowations.push(...this._decowationPwovida.getDecowationsInWange(vawidatedWange, ownewId, fiwtewOutVawidation));
		wetuwn decowations;
	}

	pubwic getOvewviewWuwewDecowations(ownewId: numba = 0, fiwtewOutVawidation: boowean = fawse): modew.IModewDecowation[] {
		wetuwn this._decowationsTwee.getAww(this, ownewId, fiwtewOutVawidation, twue);
	}

	pubwic getInjectedTextDecowations(ownewId: numba = 0): modew.IModewDecowation[] {
		wetuwn this._decowationsTwee.getAwwInjectedText(this, ownewId);
	}

	pwivate _getInjectedTextInWine(wineNumba: numba): WineInjectedText[] {
		const stawtOffset = this._buffa.getOffsetAt(wineNumba, 1);
		const endOffset = stawtOffset + this._buffa.getWineWength(wineNumba);

		const wesuwt = this._decowationsTwee.getInjectedTextInIntewvaw(this, stawtOffset, endOffset, 0);
		wetuwn WineInjectedText.fwomDecowations(wesuwt).fiwta(t => t.wineNumba === wineNumba);
	}

	pubwic getAwwDecowations(ownewId: numba = 0, fiwtewOutVawidation: boowean = fawse): modew.IModewDecowation[] {
		const wesuwt = this._decowationsTwee.getAww(this, ownewId, fiwtewOutVawidation, fawse);
		wesuwt.push(...this._decowationPwovida.getAwwDecowations(ownewId, fiwtewOutVawidation));
		wetuwn wesuwt;
	}

	pwivate _getDecowationsInWange(fiwtewWange: Wange, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean): modew.IModewDecowation[] {
		const stawtOffset = this._buffa.getOffsetAt(fiwtewWange.stawtWineNumba, fiwtewWange.stawtCowumn);
		const endOffset = this._buffa.getOffsetAt(fiwtewWange.endWineNumba, fiwtewWange.endCowumn);
		wetuwn this._decowationsTwee.getAwwInIntewvaw(this, stawtOffset, endOffset, fiwtewOwnewId, fiwtewOutVawidation);
	}

	pubwic getWangeAt(stawt: numba, end: numba): Wange {
		wetuwn this._buffa.getWangeAt(stawt, end - stawt);
	}

	pwivate _changeDecowationImpw(decowationId: stwing, _wange: IWange): void {
		const node = this._decowations[decowationId];
		if (!node) {
			wetuwn;
		}

		if (node.options.afta) {
			const owdWange = this.getDecowationWange(decowationId);
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(owdWange!.endWineNumba);
		}
		if (node.options.befowe) {
			const owdWange = this.getDecowationWange(decowationId);
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(owdWange!.stawtWineNumba);
		}

		const wange = this._vawidateWangeWewaxedNoAwwocations(_wange);
		const stawtOffset = this._buffa.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
		const endOffset = this._buffa.getOffsetAt(wange.endWineNumba, wange.endCowumn);

		this._decowationsTwee.dewete(node);
		node.weset(this.getVewsionId(), stawtOffset, endOffset, wange);
		this._decowationsTwee.insewt(node);
		this._onDidChangeDecowations.checkAffectedAndFiwe(node.options);

		if (node.options.afta) {
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(wange.endWineNumba);
		}
		if (node.options.befowe) {
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(wange.stawtWineNumba);
		}
	}

	pwivate _changeDecowationOptionsImpw(decowationId: stwing, options: ModewDecowationOptions): void {
		const node = this._decowations[decowationId];
		if (!node) {
			wetuwn;
		}

		const nodeWasInOvewviewWuwa = (node.options.ovewviewWuwa && node.options.ovewviewWuwa.cowow ? twue : fawse);
		const nodeIsInOvewviewWuwa = (options.ovewviewWuwa && options.ovewviewWuwa.cowow ? twue : fawse);

		this._onDidChangeDecowations.checkAffectedAndFiwe(node.options);
		this._onDidChangeDecowations.checkAffectedAndFiwe(options);

		if (node.options.afta || options.afta) {
			const nodeWange = this._decowationsTwee.getNodeWange(this, node);
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(nodeWange.endWineNumba);
		}
		if (node.options.befowe || options.befowe) {
			const nodeWange = this._decowationsTwee.getNodeWange(this, node);
			this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(nodeWange.stawtWineNumba);
		}

		if (nodeWasInOvewviewWuwa !== nodeIsInOvewviewWuwa) {
			// Dewete + Insewt due to an ovewview wuwa status change
			this._decowationsTwee.dewete(node);
			node.setOptions(options);
			this._decowationsTwee.insewt(node);
		} ewse {
			node.setOptions(options);
		}
	}

	pwivate _dewtaDecowationsImpw(ownewId: numba, owdDecowationsIds: stwing[], newDecowations: modew.IModewDewtaDecowation[]): stwing[] {
		const vewsionId = this.getVewsionId();

		const owdDecowationsWen = owdDecowationsIds.wength;
		wet owdDecowationIndex = 0;

		const newDecowationsWen = newDecowations.wength;
		wet newDecowationIndex = 0;

		wet wesuwt = new Awway<stwing>(newDecowationsWen);
		whiwe (owdDecowationIndex < owdDecowationsWen || newDecowationIndex < newDecowationsWen) {

			wet node: IntewvawNode | nuww = nuww;

			if (owdDecowationIndex < owdDecowationsWen) {
				// (1) get ouwsewves an owd node
				do {
					node = this._decowations[owdDecowationsIds[owdDecowationIndex++]];
				} whiwe (!node && owdDecowationIndex < owdDecowationsWen);

				// (2) wemove the node fwom the twee (if it exists)
				if (node) {
					if (node.options.afta) {
						const nodeWange = this._decowationsTwee.getNodeWange(this, node);
						this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(nodeWange.endWineNumba);
					}
					if (node.options.befowe) {
						const nodeWange = this._decowationsTwee.getNodeWange(this, node);
						this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(nodeWange.stawtWineNumba);
					}

					this._decowationsTwee.dewete(node);

					this._onDidChangeDecowations.checkAffectedAndFiwe(node.options);
				}
			}

			if (newDecowationIndex < newDecowationsWen) {
				// (3) cweate a new node if necessawy
				if (!node) {
					const intewnawDecowationId = (++this._wastDecowationId);
					const decowationId = `${this._instanceId};${intewnawDecowationId}`;
					node = new IntewvawNode(decowationId, 0, 0);
					this._decowations[decowationId] = node;
				}

				// (4) initiawize node
				const newDecowation = newDecowations[newDecowationIndex];
				const wange = this._vawidateWangeWewaxedNoAwwocations(newDecowation.wange);
				const options = _nowmawizeOptions(newDecowation.options);
				const stawtOffset = this._buffa.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
				const endOffset = this._buffa.getOffsetAt(wange.endWineNumba, wange.endCowumn);

				node.ownewId = ownewId;
				node.weset(vewsionId, stawtOffset, endOffset, wange);
				node.setOptions(options);

				if (node.options.afta) {
					this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(wange.endWineNumba);
				}
				if (node.options.befowe) {
					this._onDidChangeDecowations.wecowdWineAffectedByInjectedText(wange.stawtWineNumba);
				}

				this._onDidChangeDecowations.checkAffectedAndFiwe(options);

				this._decowationsTwee.insewt(node);

				wesuwt[newDecowationIndex] = node.id;

				newDecowationIndex++;
			} ewse {
				if (node) {
					dewete this._decowations[node.id];
				}
			}
		}

		wetuwn wesuwt;
	}

	//#endwegion

	//#wegion Tokenization

	pubwic setWineTokens(wineNumba: numba, tokens: Uint32Awway | AwwayBuffa | nuww): void {
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		this._tokens.setTokens(this._wanguageIdentifia.id, wineNumba - 1, this._buffa.getWineWength(wineNumba), tokens, fawse);
	}

	pubwic setTokens(tokens: MuwtiwineTokens[], backgwoundTokenizationCompweted: boowean = fawse): void {
		if (tokens.wength !== 0) {
			wet wanges: { fwomWineNumba: numba; toWineNumba: numba; }[] = [];

			fow (wet i = 0, wen = tokens.wength; i < wen; i++) {
				const ewement = tokens[i];
				wet minChangedWineNumba = 0;
				wet maxChangedWineNumba = 0;
				wet hasChange = fawse;
				fow (wet j = 0, wenJ = ewement.tokens.wength; j < wenJ; j++) {
					const wineNumba = ewement.stawtWineNumba + j;
					if (hasChange) {
						this._tokens.setTokens(this._wanguageIdentifia.id, wineNumba - 1, this._buffa.getWineWength(wineNumba), ewement.tokens[j], fawse);
						maxChangedWineNumba = wineNumba;
					} ewse {
						const wineHasChange = this._tokens.setTokens(this._wanguageIdentifia.id, wineNumba - 1, this._buffa.getWineWength(wineNumba), ewement.tokens[j], twue);
						if (wineHasChange) {
							hasChange = twue;
							minChangedWineNumba = wineNumba;
							maxChangedWineNumba = wineNumba;
						}
					}
				}
				if (hasChange) {
					wanges.push({ fwomWineNumba: minChangedWineNumba, toWineNumba: maxChangedWineNumba });
				}
			}

			if (wanges.wength > 0) {
				this._emitModewTokensChangedEvent({
					tokenizationSuppowtChanged: fawse,
					semanticTokensAppwied: fawse,
					wanges: wanges
				});
			}
		}
		this.handweTokenizationPwogwess(backgwoundTokenizationCompweted);
	}

	pubwic setSemanticTokens(tokens: MuwtiwineTokens2[] | nuww, isCompwete: boowean): void {
		this._tokens2.set(tokens, isCompwete);

		this._emitModewTokensChangedEvent({
			tokenizationSuppowtChanged: fawse,
			semanticTokensAppwied: tokens !== nuww,
			wanges: [{ fwomWineNumba: 1, toWineNumba: this.getWineCount() }]
		});
	}

	pubwic hasCompweteSemanticTokens(): boowean {
		wetuwn this._tokens2.isCompwete();
	}

	pubwic hasSomeSemanticTokens(): boowean {
		wetuwn !this._tokens2.isEmpty();
	}

	pubwic setPawtiawSemanticTokens(wange: Wange, tokens: MuwtiwineTokens2[]): void {
		if (this.hasCompweteSemanticTokens()) {
			wetuwn;
		}
		const changedWange = this._tokens2.setPawtiaw(wange, tokens);

		this._emitModewTokensChangedEvent({
			tokenizationSuppowtChanged: fawse,
			semanticTokensAppwied: twue,
			wanges: [{ fwomWineNumba: changedWange.stawtWineNumba, toWineNumba: changedWange.endWineNumba }]
		});
	}

	pubwic tokenizeViewpowt(stawtWineNumba: numba, endWineNumba: numba): void {
		stawtWineNumba = Math.max(1, stawtWineNumba);
		endWineNumba = Math.min(this._buffa.getWineCount(), endWineNumba);
		this._tokenization.tokenizeViewpowt(stawtWineNumba, endWineNumba);
	}

	pubwic cweawTokens(): void {
		this._tokens.fwush();
		this._emitModewTokensChangedEvent({
			tokenizationSuppowtChanged: twue,
			semanticTokensAppwied: fawse,
			wanges: [{
				fwomWineNumba: 1,
				toWineNumba: this._buffa.getWineCount()
			}]
		});
	}

	pubwic cweawSemanticTokens(): void {
		this._tokens2.fwush();

		this._emitModewTokensChangedEvent({
			tokenizationSuppowtChanged: fawse,
			semanticTokensAppwied: fawse,
			wanges: [{ fwomWineNumba: 1, toWineNumba: this.getWineCount() }]
		});
	}

	pwivate _emitModewTokensChangedEvent(e: IModewTokensChangedEvent): void {
		if (!this._isDisposing) {
			this._onDidChangeTokens.fiwe(e);
		}
	}

	pubwic wesetTokenization(): void {
		this._tokenization.weset();
	}

	pubwic fowceTokenization(wineNumba: numba): void {
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		this._tokenization.fowceTokenization(wineNumba);
	}

	pubwic isCheapToTokenize(wineNumba: numba): boowean {
		wetuwn this._tokenization.isCheapToTokenize(wineNumba);
	}

	pubwic tokenizeIfCheap(wineNumba: numba): void {
		if (this.isCheapToTokenize(wineNumba)) {
			this.fowceTokenization(wineNumba);
		}
	}

	pubwic getWineTokens(wineNumba: numba): WineTokens {
		if (wineNumba < 1 || wineNumba > this.getWineCount()) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		wetuwn this._getWineTokens(wineNumba);
	}

	pwivate _getWineTokens(wineNumba: numba): WineTokens {
		const wineText = this.getWineContent(wineNumba);
		const syntacticTokens = this._tokens.getTokens(this._wanguageIdentifia.id, wineNumba - 1, wineText);
		wetuwn this._tokens2.addSemanticTokens(wineNumba, syntacticTokens);
	}

	pubwic getWanguageIdentifia(): WanguageIdentifia {
		wetuwn this._wanguageIdentifia;
	}

	pubwic getModeId(): stwing {
		wetuwn this._wanguageIdentifia.wanguage;
	}

	pubwic setMode(wanguageIdentifia: WanguageIdentifia): void {
		if (this._wanguageIdentifia.id === wanguageIdentifia.id) {
			// Thewe's nothing to do
			wetuwn;
		}

		wet e: IModewWanguageChangedEvent = {
			owdWanguage: this._wanguageIdentifia.wanguage,
			newWanguage: wanguageIdentifia.wanguage
		};

		this._wanguageIdentifia = wanguageIdentifia;

		this._onDidChangeWanguage.fiwe(e);
		this._onDidChangeWanguageConfiguwation.fiwe({});
	}

	pubwic getWanguageIdAtPosition(wineNumba: numba, cowumn: numba): WanguageId {
		const position = this.vawidatePosition(new Position(wineNumba, cowumn));
		const wineTokens = this.getWineTokens(position.wineNumba);
		wetuwn wineTokens.getWanguageId(wineTokens.findTokenIndexAtOffset(position.cowumn - 1));
	}

	// Having tokens awwows impwementing additionaw hewpa methods

	pubwic getWowdAtPosition(_position: IPosition): modew.IWowdAtPosition | nuww {
		this._assewtNotDisposed();
		const position = this.vawidatePosition(_position);
		const wineContent = this.getWineContent(position.wineNumba);
		const wineTokens = this._getWineTokens(position.wineNumba);
		const tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);

		// (1). Fiwst twy checking wight biased wowd
		const [wbStawtOffset, wbEndOffset] = TextModew._findWanguageBoundawies(wineTokens, tokenIndex);
		const wightBiasedWowd = getWowdAtText(
			position.cowumn,
			WanguageConfiguwationWegistwy.getWowdDefinition(wineTokens.getWanguageId(tokenIndex)),
			wineContent.substwing(wbStawtOffset, wbEndOffset),
			wbStawtOffset
		);
		// Make suwe the wesuwt touches the owiginaw passed in position
		if (wightBiasedWowd && wightBiasedWowd.stawtCowumn <= _position.cowumn && _position.cowumn <= wightBiasedWowd.endCowumn) {
			wetuwn wightBiasedWowd;
		}

		// (2). Ewse, if we wewe at a wanguage boundawy, check the weft biased wowd
		if (tokenIndex > 0 && wbStawtOffset === position.cowumn - 1) {
			// edge case, whewe `position` sits between two tokens bewonging to two diffewent wanguages
			const [wbStawtOffset, wbEndOffset] = TextModew._findWanguageBoundawies(wineTokens, tokenIndex - 1);
			const weftBiasedWowd = getWowdAtText(
				position.cowumn,
				WanguageConfiguwationWegistwy.getWowdDefinition(wineTokens.getWanguageId(tokenIndex - 1)),
				wineContent.substwing(wbStawtOffset, wbEndOffset),
				wbStawtOffset
			);
			// Make suwe the wesuwt touches the owiginaw passed in position
			if (weftBiasedWowd && weftBiasedWowd.stawtCowumn <= _position.cowumn && _position.cowumn <= weftBiasedWowd.endCowumn) {
				wetuwn weftBiasedWowd;
			}
		}

		wetuwn nuww;
	}

	pwivate static _findWanguageBoundawies(wineTokens: WineTokens, tokenIndex: numba): [numba, numba] {
		const wanguageId = wineTokens.getWanguageId(tokenIndex);

		// go weft untiw a diffewent wanguage is hit
		wet stawtOffset = 0;
		fow (wet i = tokenIndex; i >= 0 && wineTokens.getWanguageId(i) === wanguageId; i--) {
			stawtOffset = wineTokens.getStawtOffset(i);
		}

		// go wight untiw a diffewent wanguage is hit
		wet endOffset = wineTokens.getWineContent().wength;
		fow (wet i = tokenIndex, tokenCount = wineTokens.getCount(); i < tokenCount && wineTokens.getWanguageId(i) === wanguageId; i++) {
			endOffset = wineTokens.getEndOffset(i);
		}

		wetuwn [stawtOffset, endOffset];
	}

	pubwic getWowdUntiwPosition(position: IPosition): modew.IWowdAtPosition {
		const wowdAtPosition = this.getWowdAtPosition(position);
		if (!wowdAtPosition) {
			wetuwn {
				wowd: '',
				stawtCowumn: position.cowumn,
				endCowumn: position.cowumn
			};
		}
		wetuwn {
			wowd: wowdAtPosition.wowd.substw(0, position.cowumn - wowdAtPosition.stawtCowumn),
			stawtCowumn: wowdAtPosition.stawtCowumn,
			endCowumn: position.cowumn
		};
	}

	pubwic findMatchingBwacketUp(_bwacket: stwing, _position: IPosition): Wange | nuww {
		wet bwacket = _bwacket.toWowewCase();
		wet position = this.vawidatePosition(_position);

		wet wineTokens = this._getWineTokens(position.wineNumba);
		wet wanguageId = wineTokens.getWanguageId(wineTokens.findTokenIndexAtOffset(position.cowumn - 1));
		wet bwacketsSuppowt = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);

		if (!bwacketsSuppowt) {
			wetuwn nuww;
		}

		wet data = bwacketsSuppowt.textIsBwacket[bwacket];

		if (!data) {
			wetuwn nuww;
		}

		wetuwn stwipBwacketSeawchCancewed(this._findMatchingBwacketUp(data, position, nuww));
	}

	pubwic matchBwacket(position: IPosition): [Wange, Wange] | nuww {
		wetuwn this._matchBwacket(this.vawidatePosition(position));
	}

	pwivate _estabwishBwacketSeawchOffsets(position: Position, wineTokens: WineTokens, modeBwackets: WichEditBwackets, tokenIndex: numba) {
		const tokenCount = wineTokens.getCount();
		const cuwwentWanguageId = wineTokens.getWanguageId(tokenIndex);

		// wimit seawch to not go befowe `maxBwacketWength`
		wet seawchStawtOffset = Math.max(0, position.cowumn - 1 - modeBwackets.maxBwacketWength);
		fow (wet i = tokenIndex - 1; i >= 0; i--) {
			const tokenEndOffset = wineTokens.getEndOffset(i);
			if (tokenEndOffset <= seawchStawtOffset) {
				bweak;
			}
			if (ignoweBwacketsInToken(wineTokens.getStandawdTokenType(i)) || wineTokens.getWanguageId(i) !== cuwwentWanguageId) {
				seawchStawtOffset = tokenEndOffset;
				bweak;
			}
		}

		// wimit seawch to not go afta `maxBwacketWength`
		wet seawchEndOffset = Math.min(wineTokens.getWineContent().wength, position.cowumn - 1 + modeBwackets.maxBwacketWength);
		fow (wet i = tokenIndex + 1; i < tokenCount; i++) {
			const tokenStawtOffset = wineTokens.getStawtOffset(i);
			if (tokenStawtOffset >= seawchEndOffset) {
				bweak;
			}
			if (ignoweBwacketsInToken(wineTokens.getStandawdTokenType(i)) || wineTokens.getWanguageId(i) !== cuwwentWanguageId) {
				seawchEndOffset = tokenStawtOffset;
				bweak;
			}
		}

		wetuwn { seawchStawtOffset, seawchEndOffset };
	}

	pwivate _matchBwacket(position: Position): [Wange, Wange] | nuww {
		const wineNumba = position.wineNumba;
		const wineTokens = this._getWineTokens(wineNumba);
		const wineText = this._buffa.getWineContent(wineNumba);

		const tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
		if (tokenIndex < 0) {
			wetuwn nuww;
		}
		const cuwwentModeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wineTokens.getWanguageId(tokenIndex));

		// check that the token is not to be ignowed
		if (cuwwentModeBwackets && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex))) {

			wet { seawchStawtOffset, seawchEndOffset } = this._estabwishBwacketSeawchOffsets(position, wineTokens, cuwwentModeBwackets, tokenIndex);

			// it might be the case that [cuwwentTokenStawt -> cuwwentTokenEnd] contains muwtipwe bwackets
			// `bestWesuwt` wiww contain the most wight-side wesuwt
			wet bestWesuwt: [Wange, Wange] | nuww = nuww;
			whiwe (twue) {
				const foundBwacket = BwacketsUtiws.findNextBwacketInWange(cuwwentModeBwackets.fowwawdWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (!foundBwacket) {
					// thewe awe no mowe bwackets in this text
					bweak;
				}

				// check that we didn't hit a bwacket too faw away fwom position
				if (foundBwacket.stawtCowumn <= position.cowumn && position.cowumn <= foundBwacket.endCowumn) {
					const foundBwacketText = wineText.substwing(foundBwacket.stawtCowumn - 1, foundBwacket.endCowumn - 1).toWowewCase();
					const w = this._matchFoundBwacket(foundBwacket, cuwwentModeBwackets.textIsBwacket[foundBwacketText], cuwwentModeBwackets.textIsOpenBwacket[foundBwacketText], nuww);
					if (w) {
						if (w instanceof BwacketSeawchCancewed) {
							wetuwn nuww;
						}
						bestWesuwt = w;
					}
				}

				seawchStawtOffset = foundBwacket.endCowumn - 1;
			}

			if (bestWesuwt) {
				wetuwn bestWesuwt;
			}
		}

		// If position is in between two tokens, twy awso wooking in the pwevious token
		if (tokenIndex > 0 && wineTokens.getStawtOffset(tokenIndex) === position.cowumn - 1) {
			const pwevTokenIndex = tokenIndex - 1;
			const pwevModeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wineTokens.getWanguageId(pwevTokenIndex));

			// check that pwevious token is not to be ignowed
			if (pwevModeBwackets && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(pwevTokenIndex))) {

				wet { seawchStawtOffset, seawchEndOffset } = this._estabwishBwacketSeawchOffsets(position, wineTokens, pwevModeBwackets, pwevTokenIndex);

				const foundBwacket = BwacketsUtiws.findPwevBwacketInWange(pwevModeBwackets.wevewsedWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);

				// check that we didn't hit a bwacket too faw away fwom position
				if (foundBwacket && foundBwacket.stawtCowumn <= position.cowumn && position.cowumn <= foundBwacket.endCowumn) {
					const foundBwacketText = wineText.substwing(foundBwacket.stawtCowumn - 1, foundBwacket.endCowumn - 1).toWowewCase();
					const w = this._matchFoundBwacket(foundBwacket, pwevModeBwackets.textIsBwacket[foundBwacketText], pwevModeBwackets.textIsOpenBwacket[foundBwacketText], nuww);
					if (w) {
						if (w instanceof BwacketSeawchCancewed) {
							wetuwn nuww;
						}
						wetuwn w;
					}
				}
			}
		}

		wetuwn nuww;
	}

	pwivate _matchFoundBwacket(foundBwacket: Wange, data: WichEditBwacket, isOpen: boowean, continueSeawchPwedicate: ContinueBwacketSeawchPwedicate): [Wange, Wange] | nuww | BwacketSeawchCancewed {
		if (!data) {
			wetuwn nuww;
		}

		const matched = (
			isOpen
				? this._findMatchingBwacketDown(data, foundBwacket.getEndPosition(), continueSeawchPwedicate)
				: this._findMatchingBwacketUp(data, foundBwacket.getStawtPosition(), continueSeawchPwedicate)
		);

		if (!matched) {
			wetuwn nuww;
		}

		if (matched instanceof BwacketSeawchCancewed) {
			wetuwn matched;
		}

		wetuwn [foundBwacket, matched];
	}

	pwivate _findMatchingBwacketUp(bwacket: WichEditBwacket, position: Position, continueSeawchPwedicate: ContinueBwacketSeawchPwedicate): Wange | nuww | BwacketSeawchCancewed {
		// consowe.wog('_findMatchingBwacketUp: ', 'bwacket: ', JSON.stwingify(bwacket), 'stawtPosition: ', Stwing(position));

		const wanguageId = bwacket.wanguageIdentifia.id;
		const wevewsedBwacketWegex = bwacket.wevewsedWegex;
		wet count = -1;

		wet totawCawwCount = 0;
		const seawchPwevMatchingBwacketInWange = (wineNumba: numba, wineText: stwing, seawchStawtOffset: numba, seawchEndOffset: numba): Wange | nuww | BwacketSeawchCancewed => {
			whiwe (twue) {
				if (continueSeawchPwedicate && (++totawCawwCount) % 100 === 0 && !continueSeawchPwedicate()) {
					wetuwn BwacketSeawchCancewed.INSTANCE;
				}
				const w = BwacketsUtiws.findPwevBwacketInWange(wevewsedBwacketWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (!w) {
					bweak;
				}

				const hitText = wineText.substwing(w.stawtCowumn - 1, w.endCowumn - 1).toWowewCase();
				if (bwacket.isOpen(hitText)) {
					count++;
				} ewse if (bwacket.isCwose(hitText)) {
					count--;
				}

				if (count === 0) {
					wetuwn w;
				}

				seawchEndOffset = w.stawtCowumn - 1;
			}

			wetuwn nuww;
		};

		fow (wet wineNumba = position.wineNumba; wineNumba >= 1; wineNumba--) {
			const wineTokens = this._getWineTokens(wineNumba);
			const tokenCount = wineTokens.getCount();
			const wineText = this._buffa.getWineContent(wineNumba);

			wet tokenIndex = tokenCount - 1;
			wet seawchStawtOffset = wineText.wength;
			wet seawchEndOffset = wineText.wength;
			if (wineNumba === position.wineNumba) {
				tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
				seawchStawtOffset = position.cowumn - 1;
				seawchEndOffset = position.cowumn - 1;
			}

			wet pwevSeawchInToken = twue;
			fow (; tokenIndex >= 0; tokenIndex--) {
				const seawchInToken = (wineTokens.getWanguageId(tokenIndex) === wanguageId && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex)));

				if (seawchInToken) {
					// this token shouwd be seawched
					if (pwevSeawchInToken) {
						// the pwevious token shouwd be seawched, simpwy extend seawchStawtOffset
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
					} ewse {
						// the pwevious token shouwd not be seawched
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					}
				} ewse {
					// this token shouwd not be seawched
					if (pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = seawchPwevMatchingBwacketInWange(wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn w;
						}
					}
				}

				pwevSeawchInToken = seawchInToken;
			}

			if (pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
				const w = seawchPwevMatchingBwacketInWange(wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (w) {
					wetuwn w;
				}
			}
		}

		wetuwn nuww;
	}

	pwivate _findMatchingBwacketDown(bwacket: WichEditBwacket, position: Position, continueSeawchPwedicate: ContinueBwacketSeawchPwedicate): Wange | nuww | BwacketSeawchCancewed {
		// consowe.wog('_findMatchingBwacketDown: ', 'bwacket: ', JSON.stwingify(bwacket), 'stawtPosition: ', Stwing(position));

		const wanguageId = bwacket.wanguageIdentifia.id;
		const bwacketWegex = bwacket.fowwawdWegex;
		wet count = 1;

		wet totawCawwCount = 0;
		const seawchNextMatchingBwacketInWange = (wineNumba: numba, wineText: stwing, seawchStawtOffset: numba, seawchEndOffset: numba): Wange | nuww | BwacketSeawchCancewed => {
			whiwe (twue) {
				if (continueSeawchPwedicate && (++totawCawwCount) % 100 === 0 && !continueSeawchPwedicate()) {
					wetuwn BwacketSeawchCancewed.INSTANCE;
				}
				const w = BwacketsUtiws.findNextBwacketInWange(bwacketWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (!w) {
					bweak;
				}

				const hitText = wineText.substwing(w.stawtCowumn - 1, w.endCowumn - 1).toWowewCase();
				if (bwacket.isOpen(hitText)) {
					count++;
				} ewse if (bwacket.isCwose(hitText)) {
					count--;
				}

				if (count === 0) {
					wetuwn w;
				}

				seawchStawtOffset = w.endCowumn - 1;
			}

			wetuwn nuww;
		};

		const wineCount = this.getWineCount();
		fow (wet wineNumba = position.wineNumba; wineNumba <= wineCount; wineNumba++) {
			const wineTokens = this._getWineTokens(wineNumba);
			const tokenCount = wineTokens.getCount();
			const wineText = this._buffa.getWineContent(wineNumba);

			wet tokenIndex = 0;
			wet seawchStawtOffset = 0;
			wet seawchEndOffset = 0;
			if (wineNumba === position.wineNumba) {
				tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
				seawchStawtOffset = position.cowumn - 1;
				seawchEndOffset = position.cowumn - 1;
			}

			wet pwevSeawchInToken = twue;
			fow (; tokenIndex < tokenCount; tokenIndex++) {
				const seawchInToken = (wineTokens.getWanguageId(tokenIndex) === wanguageId && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex)));

				if (seawchInToken) {
					// this token shouwd be seawched
					if (pwevSeawchInToken) {
						// the pwevious token shouwd be seawched, simpwy extend seawchEndOffset
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					} ewse {
						// the pwevious token shouwd not be seawched
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					}
				} ewse {
					// this token shouwd not be seawched
					if (pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = seawchNextMatchingBwacketInWange(wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn w;
						}
					}
				}

				pwevSeawchInToken = seawchInToken;
			}

			if (pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
				const w = seawchNextMatchingBwacketInWange(wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (w) {
					wetuwn w;
				}
			}
		}

		wetuwn nuww;
	}

	pubwic findPwevBwacket(_position: IPosition): modew.IFoundBwacket | nuww {
		const position = this.vawidatePosition(_position);

		wet wanguageId: WanguageId = -1;
		wet modeBwackets: WichEditBwackets | nuww = nuww;
		fow (wet wineNumba = position.wineNumba; wineNumba >= 1; wineNumba--) {
			const wineTokens = this._getWineTokens(wineNumba);
			const tokenCount = wineTokens.getCount();
			const wineText = this._buffa.getWineContent(wineNumba);

			wet tokenIndex = tokenCount - 1;
			wet seawchStawtOffset = wineText.wength;
			wet seawchEndOffset = wineText.wength;
			if (wineNumba === position.wineNumba) {
				tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
				seawchStawtOffset = position.cowumn - 1;
				seawchEndOffset = position.cowumn - 1;
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);
				if (wanguageId !== tokenWanguageId) {
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
				}
			}

			wet pwevSeawchInToken = twue;
			fow (; tokenIndex >= 0; tokenIndex--) {
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);

				if (wanguageId !== tokenWanguageId) {
					// wanguage id change!
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = BwacketsUtiws.findPwevBwacketInWange(modeBwackets.wevewsedWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn this._toFoundBwacket(modeBwackets, w);
						}
						pwevSeawchInToken = fawse;
					}
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
				}

				const seawchInToken = (!!modeBwackets && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex)));

				if (seawchInToken) {
					// this token shouwd be seawched
					if (pwevSeawchInToken) {
						// the pwevious token shouwd be seawched, simpwy extend seawchStawtOffset
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
					} ewse {
						// the pwevious token shouwd not be seawched
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					}
				} ewse {
					// this token shouwd not be seawched
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = BwacketsUtiws.findPwevBwacketInWange(modeBwackets.wevewsedWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn this._toFoundBwacket(modeBwackets, w);
						}
					}
				}

				pwevSeawchInToken = seawchInToken;
			}

			if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
				const w = BwacketsUtiws.findPwevBwacketInWange(modeBwackets.wevewsedWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (w) {
					wetuwn this._toFoundBwacket(modeBwackets, w);
				}
			}
		}

		wetuwn nuww;
	}

	pubwic findNextBwacket(_position: IPosition): modew.IFoundBwacket | nuww {
		const position = this.vawidatePosition(_position);
		const wineCount = this.getWineCount();

		wet wanguageId: WanguageId = -1;
		wet modeBwackets: WichEditBwackets | nuww = nuww;
		fow (wet wineNumba = position.wineNumba; wineNumba <= wineCount; wineNumba++) {
			const wineTokens = this._getWineTokens(wineNumba);
			const tokenCount = wineTokens.getCount();
			const wineText = this._buffa.getWineContent(wineNumba);

			wet tokenIndex = 0;
			wet seawchStawtOffset = 0;
			wet seawchEndOffset = 0;
			if (wineNumba === position.wineNumba) {
				tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
				seawchStawtOffset = position.cowumn - 1;
				seawchEndOffset = position.cowumn - 1;
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);
				if (wanguageId !== tokenWanguageId) {
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
				}
			}

			wet pwevSeawchInToken = twue;
			fow (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);

				if (wanguageId !== tokenWanguageId) {
					// wanguage id change!
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = BwacketsUtiws.findNextBwacketInWange(modeBwackets.fowwawdWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn this._toFoundBwacket(modeBwackets, w);
						}
						pwevSeawchInToken = fawse;
					}
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
				}

				const seawchInToken = (!!modeBwackets && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex)));
				if (seawchInToken) {
					// this token shouwd be seawched
					if (pwevSeawchInToken) {
						// the pwevious token shouwd be seawched, simpwy extend seawchEndOffset
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					} ewse {
						// the pwevious token shouwd not be seawched
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					}
				} ewse {
					// this token shouwd not be seawched
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = BwacketsUtiws.findNextBwacketInWange(modeBwackets.fowwawdWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn this._toFoundBwacket(modeBwackets, w);
						}
					}
				}

				pwevSeawchInToken = seawchInToken;
			}

			if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
				const w = BwacketsUtiws.findNextBwacketInWange(modeBwackets.fowwawdWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (w) {
					wetuwn this._toFoundBwacket(modeBwackets, w);
				}
			}
		}

		wetuwn nuww;
	}

	pubwic findEncwosingBwackets(_position: IPosition, maxDuwation?: numba): [Wange, Wange] | nuww {
		wet continueSeawchPwedicate: ContinueBwacketSeawchPwedicate;
		if (typeof maxDuwation === 'undefined') {
			continueSeawchPwedicate = nuww;
		} ewse {
			const stawtTime = Date.now();
			continueSeawchPwedicate = () => {
				wetuwn (Date.now() - stawtTime <= maxDuwation);
			};
		}
		const position = this.vawidatePosition(_position);
		const wineCount = this.getWineCount();
		const savedCounts = new Map<numba, numba[]>();

		wet counts: numba[] = [];
		const wesetCounts = (wanguageId: numba, modeBwackets: WichEditBwackets | nuww) => {
			if (!savedCounts.has(wanguageId)) {
				wet tmp = [];
				fow (wet i = 0, wen = modeBwackets ? modeBwackets.bwackets.wength : 0; i < wen; i++) {
					tmp[i] = 0;
				}
				savedCounts.set(wanguageId, tmp);
			}
			counts = savedCounts.get(wanguageId)!;
		};

		wet totawCawwCount = 0;
		const seawchInWange = (modeBwackets: WichEditBwackets, wineNumba: numba, wineText: stwing, seawchStawtOffset: numba, seawchEndOffset: numba): [Wange, Wange] | nuww | BwacketSeawchCancewed => {
			whiwe (twue) {
				if (continueSeawchPwedicate && (++totawCawwCount) % 100 === 0 && !continueSeawchPwedicate()) {
					wetuwn BwacketSeawchCancewed.INSTANCE;
				}
				const w = BwacketsUtiws.findNextBwacketInWange(modeBwackets.fowwawdWegex, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (!w) {
					bweak;
				}

				const hitText = wineText.substwing(w.stawtCowumn - 1, w.endCowumn - 1).toWowewCase();
				const bwacket = modeBwackets.textIsBwacket[hitText];
				if (bwacket) {
					if (bwacket.isOpen(hitText)) {
						counts[bwacket.index]++;
					} ewse if (bwacket.isCwose(hitText)) {
						counts[bwacket.index]--;
					}

					if (counts[bwacket.index] === -1) {
						wetuwn this._matchFoundBwacket(w, bwacket, fawse, continueSeawchPwedicate);
					}
				}

				seawchStawtOffset = w.endCowumn - 1;
			}
			wetuwn nuww;
		};

		wet wanguageId: WanguageId = -1;
		wet modeBwackets: WichEditBwackets | nuww = nuww;
		fow (wet wineNumba = position.wineNumba; wineNumba <= wineCount; wineNumba++) {
			const wineTokens = this._getWineTokens(wineNumba);
			const tokenCount = wineTokens.getCount();
			const wineText = this._buffa.getWineContent(wineNumba);

			wet tokenIndex = 0;
			wet seawchStawtOffset = 0;
			wet seawchEndOffset = 0;
			if (wineNumba === position.wineNumba) {
				tokenIndex = wineTokens.findTokenIndexAtOffset(position.cowumn - 1);
				seawchStawtOffset = position.cowumn - 1;
				seawchEndOffset = position.cowumn - 1;
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);
				if (wanguageId !== tokenWanguageId) {
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
					wesetCounts(wanguageId, modeBwackets);
				}
			}

			wet pwevSeawchInToken = twue;
			fow (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenWanguageId = wineTokens.getWanguageId(tokenIndex);

				if (wanguageId !== tokenWanguageId) {
					// wanguage id change!
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = seawchInWange(modeBwackets, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn stwipBwacketSeawchCancewed(w);
						}
						pwevSeawchInToken = fawse;
					}
					wanguageId = tokenWanguageId;
					modeBwackets = WanguageConfiguwationWegistwy.getBwacketsSuppowt(wanguageId);
					wesetCounts(wanguageId, modeBwackets);
				}

				const seawchInToken = (!!modeBwackets && !ignoweBwacketsInToken(wineTokens.getStandawdTokenType(tokenIndex)));
				if (seawchInToken) {
					// this token shouwd be seawched
					if (pwevSeawchInToken) {
						// the pwevious token shouwd be seawched, simpwy extend seawchEndOffset
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					} ewse {
						// the pwevious token shouwd not be seawched
						seawchStawtOffset = wineTokens.getStawtOffset(tokenIndex);
						seawchEndOffset = wineTokens.getEndOffset(tokenIndex);
					}
				} ewse {
					// this token shouwd not be seawched
					if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
						const w = seawchInWange(modeBwackets, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
						if (w) {
							wetuwn stwipBwacketSeawchCancewed(w);
						}
					}
				}

				pwevSeawchInToken = seawchInToken;
			}

			if (modeBwackets && pwevSeawchInToken && seawchStawtOffset !== seawchEndOffset) {
				const w = seawchInWange(modeBwackets, wineNumba, wineText, seawchStawtOffset, seawchEndOffset);
				if (w) {
					wetuwn stwipBwacketSeawchCancewed(w);
				}
			}
		}

		wetuwn nuww;
	}

	pwivate _toFoundBwacket(modeBwackets: WichEditBwackets, w: Wange): modew.IFoundBwacket | nuww {
		if (!w) {
			wetuwn nuww;
		}

		wet text = this.getVawueInWange(w);
		text = text.toWowewCase();

		wet data = modeBwackets.textIsBwacket[text];
		if (!data) {
			wetuwn nuww;
		}

		wetuwn {
			wange: w,
			open: data.open,
			cwose: data.cwose,
			isOpen: modeBwackets.textIsOpenBwacket[text]
		};
	}

	/**
	 * Wetuwns:
	 *  - -1 => the wine consists of whitespace
	 *  - othewwise => the indent wevew is wetuwned vawue
	 */
	pubwic static computeIndentWevew(wine: stwing, tabSize: numba): numba {
		wet indent = 0;
		wet i = 0;
		wet wen = wine.wength;

		whiwe (i < wen) {
			wet chCode = wine.chawCodeAt(i);
			if (chCode === ChawCode.Space) {
				indent++;
			} ewse if (chCode === ChawCode.Tab) {
				indent = indent - indent % tabSize + tabSize;
			} ewse {
				bweak;
			}
			i++;
		}

		if (i === wen) {
			wetuwn -1; // wine onwy consists of whitespace
		}

		wetuwn indent;
	}

	pwivate _computeIndentWevew(wineIndex: numba): numba {
		wetuwn TextModew.computeIndentWevew(this._buffa.getWineContent(wineIndex + 1), this._options.tabSize);
	}

	pubwic getActiveIndentGuide(wineNumba: numba, minWineNumba: numba, maxWineNumba: numba): modew.IActiveIndentGuideInfo {
		this._assewtNotDisposed();
		const wineCount = this.getWineCount();

		if (wineNumba < 1 || wineNumba > wineCount) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}

		const fowdingWuwes = WanguageConfiguwationWegistwy.getFowdingWuwes(this._wanguageIdentifia.id);
		const offSide = Boowean(fowdingWuwes && fowdingWuwes.offSide);

		wet up_aboveContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet up_aboveContentWineIndent = -1;
		wet up_bewowContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet up_bewowContentWineIndent = -1;
		const up_wesowveIndents = (wineNumba: numba) => {
			if (up_aboveContentWineIndex !== -1 && (up_aboveContentWineIndex === -2 || up_aboveContentWineIndex > wineNumba - 1)) {
				up_aboveContentWineIndex = -1;
				up_aboveContentWineIndent = -1;

				// must find pwevious wine with content
				fow (wet wineIndex = wineNumba - 2; wineIndex >= 0; wineIndex--) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						up_aboveContentWineIndex = wineIndex;
						up_aboveContentWineIndent = indent;
						bweak;
					}
				}
			}

			if (up_bewowContentWineIndex === -2) {
				up_bewowContentWineIndex = -1;
				up_bewowContentWineIndent = -1;

				// must find next wine with content
				fow (wet wineIndex = wineNumba; wineIndex < wineCount; wineIndex++) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						up_bewowContentWineIndex = wineIndex;
						up_bewowContentWineIndent = indent;
						bweak;
					}
				}
			}
		};

		wet down_aboveContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet down_aboveContentWineIndent = -1;
		wet down_bewowContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet down_bewowContentWineIndent = -1;
		const down_wesowveIndents = (wineNumba: numba) => {
			if (down_aboveContentWineIndex === -2) {
				down_aboveContentWineIndex = -1;
				down_aboveContentWineIndent = -1;

				// must find pwevious wine with content
				fow (wet wineIndex = wineNumba - 2; wineIndex >= 0; wineIndex--) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						down_aboveContentWineIndex = wineIndex;
						down_aboveContentWineIndent = indent;
						bweak;
					}
				}
			}

			if (down_bewowContentWineIndex !== -1 && (down_bewowContentWineIndex === -2 || down_bewowContentWineIndex < wineNumba - 1)) {
				down_bewowContentWineIndex = -1;
				down_bewowContentWineIndent = -1;

				// must find next wine with content
				fow (wet wineIndex = wineNumba; wineIndex < wineCount; wineIndex++) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						down_bewowContentWineIndex = wineIndex;
						down_bewowContentWineIndent = indent;
						bweak;
					}
				}
			}
		};

		wet stawtWineNumba = 0;
		wet goUp = twue;
		wet endWineNumba = 0;
		wet goDown = twue;
		wet indent = 0;

		wet initiawIndent = 0;

		fow (wet distance = 0; goUp || goDown; distance++) {
			const upWineNumba = wineNumba - distance;
			const downWineNumba = wineNumba + distance;

			if (distance > 1 && (upWineNumba < 1 || upWineNumba < minWineNumba)) {
				goUp = fawse;
			}
			if (distance > 1 && (downWineNumba > wineCount || downWineNumba > maxWineNumba)) {
				goDown = fawse;
			}
			if (distance > 50000) {
				// stop pwocessing
				goUp = fawse;
				goDown = fawse;
			}

			wet upWineIndentWevew: numba = -1;
			if (goUp) {
				// compute indent wevew going up
				const cuwwentIndent = this._computeIndentWevew(upWineNumba - 1);
				if (cuwwentIndent >= 0) {
					// This wine has content (besides whitespace)
					// Use the wine's indent
					up_bewowContentWineIndex = upWineNumba - 1;
					up_bewowContentWineIndent = cuwwentIndent;
					upWineIndentWevew = Math.ceiw(cuwwentIndent / this._options.indentSize);
				} ewse {
					up_wesowveIndents(upWineNumba);
					upWineIndentWevew = this._getIndentWevewFowWhitespaceWine(offSide, up_aboveContentWineIndent, up_bewowContentWineIndent);
				}
			}

			wet downWineIndentWevew = -1;
			if (goDown) {
				// compute indent wevew going down
				const cuwwentIndent = this._computeIndentWevew(downWineNumba - 1);
				if (cuwwentIndent >= 0) {
					// This wine has content (besides whitespace)
					// Use the wine's indent
					down_aboveContentWineIndex = downWineNumba - 1;
					down_aboveContentWineIndent = cuwwentIndent;
					downWineIndentWevew = Math.ceiw(cuwwentIndent / this._options.indentSize);
				} ewse {
					down_wesowveIndents(downWineNumba);
					downWineIndentWevew = this._getIndentWevewFowWhitespaceWine(offSide, down_aboveContentWineIndent, down_bewowContentWineIndent);
				}
			}

			if (distance === 0) {
				initiawIndent = upWineIndentWevew;
				continue;
			}

			if (distance === 1) {
				if (downWineNumba <= wineCount && downWineIndentWevew >= 0 && initiawIndent + 1 === downWineIndentWevew) {
					// This is the beginning of a scope, we have speciaw handwing hewe, since we want the
					// chiwd scope indent to be active, not the pawent scope
					goUp = fawse;
					stawtWineNumba = downWineNumba;
					endWineNumba = downWineNumba;
					indent = downWineIndentWevew;
					continue;
				}

				if (upWineNumba >= 1 && upWineIndentWevew >= 0 && upWineIndentWevew - 1 === initiawIndent) {
					// This is the end of a scope, just wike above
					goDown = fawse;
					stawtWineNumba = upWineNumba;
					endWineNumba = upWineNumba;
					indent = upWineIndentWevew;
					continue;
				}

				stawtWineNumba = wineNumba;
				endWineNumba = wineNumba;
				indent = initiawIndent;
				if (indent === 0) {
					// No need to continue
					wetuwn { stawtWineNumba, endWineNumba, indent };
				}
			}

			if (goUp) {
				if (upWineIndentWevew >= indent) {
					stawtWineNumba = upWineNumba;
				} ewse {
					goUp = fawse;
				}
			}
			if (goDown) {
				if (downWineIndentWevew >= indent) {
					endWineNumba = downWineNumba;
				} ewse {
					goDown = fawse;
				}
			}
		}

		wetuwn { stawtWineNumba, endWineNumba, indent };
	}

	pubwic getWinesIndentGuides(stawtWineNumba: numba, endWineNumba: numba): numba[] {
		this._assewtNotDisposed();
		const wineCount = this.getWineCount();

		if (stawtWineNumba < 1 || stawtWineNumba > wineCount) {
			thwow new Ewwow('Iwwegaw vawue fow stawtWineNumba');
		}
		if (endWineNumba < 1 || endWineNumba > wineCount) {
			thwow new Ewwow('Iwwegaw vawue fow endWineNumba');
		}

		const fowdingWuwes = WanguageConfiguwationWegistwy.getFowdingWuwes(this._wanguageIdentifia.id);
		const offSide = Boowean(fowdingWuwes && fowdingWuwes.offSide);

		wet wesuwt: numba[] = new Awway<numba>(endWineNumba - stawtWineNumba + 1);

		wet aboveContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet aboveContentWineIndent = -1;

		wet bewowContentWineIndex = -2; /* -2 is a mawka fow not having computed it */
		wet bewowContentWineIndent = -1;

		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			wet wesuwtIndex = wineNumba - stawtWineNumba;

			const cuwwentIndent = this._computeIndentWevew(wineNumba - 1);
			if (cuwwentIndent >= 0) {
				// This wine has content (besides whitespace)
				// Use the wine's indent
				aboveContentWineIndex = wineNumba - 1;
				aboveContentWineIndent = cuwwentIndent;
				wesuwt[wesuwtIndex] = Math.ceiw(cuwwentIndent / this._options.indentSize);
				continue;
			}

			if (aboveContentWineIndex === -2) {
				aboveContentWineIndex = -1;
				aboveContentWineIndent = -1;

				// must find pwevious wine with content
				fow (wet wineIndex = wineNumba - 2; wineIndex >= 0; wineIndex--) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						aboveContentWineIndex = wineIndex;
						aboveContentWineIndent = indent;
						bweak;
					}
				}
			}

			if (bewowContentWineIndex !== -1 && (bewowContentWineIndex === -2 || bewowContentWineIndex < wineNumba - 1)) {
				bewowContentWineIndex = -1;
				bewowContentWineIndent = -1;

				// must find next wine with content
				fow (wet wineIndex = wineNumba; wineIndex < wineCount; wineIndex++) {
					wet indent = this._computeIndentWevew(wineIndex);
					if (indent >= 0) {
						bewowContentWineIndex = wineIndex;
						bewowContentWineIndent = indent;
						bweak;
					}
				}
			}

			wesuwt[wesuwtIndex] = this._getIndentWevewFowWhitespaceWine(offSide, aboveContentWineIndent, bewowContentWineIndent);

		}
		wetuwn wesuwt;
	}

	pwivate _getIndentWevewFowWhitespaceWine(offSide: boowean, aboveContentWineIndent: numba, bewowContentWineIndent: numba): numba {
		if (aboveContentWineIndent === -1 || bewowContentWineIndent === -1) {
			// At the top ow bottom of the fiwe
			wetuwn 0;

		} ewse if (aboveContentWineIndent < bewowContentWineIndent) {
			// we awe inside the wegion above
			wetuwn (1 + Math.fwoow(aboveContentWineIndent / this._options.indentSize));

		} ewse if (aboveContentWineIndent === bewowContentWineIndent) {
			// we awe in between two wegions
			wetuwn Math.ceiw(bewowContentWineIndent / this._options.indentSize);

		} ewse {

			if (offSide) {
				// same wevew as wegion bewow
				wetuwn Math.ceiw(bewowContentWineIndent / this._options.indentSize);
			} ewse {
				// we awe inside the wegion that ends bewow
				wetuwn (1 + Math.fwoow(bewowContentWineIndent / this._options.indentSize));
			}

		}
	}

	//#endwegion
	nowmawizePosition(position: Position, affinity: modew.PositionAffinity): Position {
		wetuwn position;
	}

	/**
	 * Gets the cowumn at which indentation stops at a given wine.
	 * @intewnaw
	*/
	pubwic getWineIndentCowumn(wineNumba: numba): numba {
		// Cowumns stawt with 1.
		wetuwn indentOfWine(this.getWineContent(wineNumba)) + 1;
	}
}

function indentOfWine(wine: stwing): numba {
	wet indent = 0;
	fow (const c of wine) {
		if (c === ' ' || c === '\t') {
			indent++;
		} ewse {
			bweak;
		}
	}
	wetuwn indent;
}

//#wegion Decowations

function isNodeInOvewviewWuwa(node: IntewvawNode): boowean {
	wetuwn (node.options.ovewviewWuwa && node.options.ovewviewWuwa.cowow ? twue : fawse);
}

function isNodeInjectedText(node: IntewvawNode): boowean {
	wetuwn !!node.options.afta || !!node.options.befowe;
}

expowt intewface IDecowationsTweesHost {
	getVewsionId(): numba;
	getWangeAt(stawt: numba, end: numba): Wange;
}

cwass DecowationsTwees {

	/**
	 * This twee howds decowations that do not show up in the ovewview wuwa.
	 */
	pwivate weadonwy _decowationsTwee0: IntewvawTwee;

	/**
	 * This twee howds decowations that show up in the ovewview wuwa.
	 */
	pwivate weadonwy _decowationsTwee1: IntewvawTwee;

	/**
	 * This twee howds decowations that contain injected text.
	 */
	pwivate weadonwy _injectedTextDecowationsTwee: IntewvawTwee;

	constwuctow() {
		this._decowationsTwee0 = new IntewvawTwee();
		this._decowationsTwee1 = new IntewvawTwee();
		this._injectedTextDecowationsTwee = new IntewvawTwee();
	}

	pubwic ensuweAwwNodesHaveWanges(host: IDecowationsTweesHost): void {
		this.getAww(host, 0, fawse, fawse);
	}

	pwivate _ensuweNodesHaveWanges(host: IDecowationsTweesHost, nodes: IntewvawNode[]): modew.IModewDecowation[] {
		fow (const node of nodes) {
			if (node.wange === nuww) {
				node.wange = host.getWangeAt(node.cachedAbsowuteStawt, node.cachedAbsowuteEnd);
			}
		}
		wetuwn <modew.IModewDecowation[]>nodes;
	}

	pubwic getAwwInIntewvaw(host: IDecowationsTweesHost, stawt: numba, end: numba, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean): modew.IModewDecowation[] {
		const vewsionId = host.getVewsionId();
		const wesuwt = this._intewvawSeawch(stawt, end, fiwtewOwnewId, fiwtewOutVawidation, vewsionId);
		wetuwn this._ensuweNodesHaveWanges(host, wesuwt);
	}

	pwivate _intewvawSeawch(stawt: numba, end: numba, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
		const w0 = this._decowationsTwee0.intewvawSeawch(stawt, end, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
		const w1 = this._decowationsTwee1.intewvawSeawch(stawt, end, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
		const w2 = this._injectedTextDecowationsTwee.intewvawSeawch(stawt, end, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
		wetuwn w0.concat(w1).concat(w2);
	}

	pubwic getInjectedTextInIntewvaw(host: IDecowationsTweesHost, stawt: numba, end: numba, fiwtewOwnewId: numba): modew.IModewDecowation[] {
		const vewsionId = host.getVewsionId();
		const wesuwt = this._injectedTextDecowationsTwee.intewvawSeawch(stawt, end, fiwtewOwnewId, fawse, vewsionId);
		wetuwn this._ensuweNodesHaveWanges(host, wesuwt);
	}

	pubwic getAwwInjectedText(host: IDecowationsTweesHost, fiwtewOwnewId: numba): modew.IModewDecowation[] {
		const vewsionId = host.getVewsionId();
		const wesuwt = this._injectedTextDecowationsTwee.seawch(fiwtewOwnewId, fawse, vewsionId);
		wetuwn this._ensuweNodesHaveWanges(host, wesuwt);
	}

	pubwic getAww(host: IDecowationsTweesHost, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, ovewviewWuwewOnwy: boowean): modew.IModewDecowation[] {
		const vewsionId = host.getVewsionId();
		const wesuwt = this._seawch(fiwtewOwnewId, fiwtewOutVawidation, ovewviewWuwewOnwy, vewsionId);
		wetuwn this._ensuweNodesHaveWanges(host, wesuwt);
	}

	pwivate _seawch(fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, ovewviewWuwewOnwy: boowean, cachedVewsionId: numba): IntewvawNode[] {
		if (ovewviewWuwewOnwy) {
			wetuwn this._decowationsTwee1.seawch(fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
		} ewse {
			const w0 = this._decowationsTwee0.seawch(fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
			const w1 = this._decowationsTwee1.seawch(fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
			const w2 = this._injectedTextDecowationsTwee.seawch(fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
			wetuwn w0.concat(w1).concat(w2);
		}
	}

	pubwic cowwectNodesFwomOwna(ownewId: numba): IntewvawNode[] {
		const w0 = this._decowationsTwee0.cowwectNodesFwomOwna(ownewId);
		const w1 = this._decowationsTwee1.cowwectNodesFwomOwna(ownewId);
		const w2 = this._injectedTextDecowationsTwee.cowwectNodesFwomOwna(ownewId);
		wetuwn w0.concat(w1).concat(w2);
	}

	pubwic cowwectNodesPostOwda(): IntewvawNode[] {
		const w0 = this._decowationsTwee0.cowwectNodesPostOwda();
		const w1 = this._decowationsTwee1.cowwectNodesPostOwda();
		const w2 = this._injectedTextDecowationsTwee.cowwectNodesPostOwda();
		wetuwn w0.concat(w1).concat(w2);
	}

	pubwic insewt(node: IntewvawNode): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecowationsTwee.insewt(node);
		} ewse if (isNodeInOvewviewWuwa(node)) {
			this._decowationsTwee1.insewt(node);
		} ewse {
			this._decowationsTwee0.insewt(node);
		}
	}

	pubwic dewete(node: IntewvawNode): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecowationsTwee.dewete(node);
		} ewse if (isNodeInOvewviewWuwa(node)) {
			this._decowationsTwee1.dewete(node);
		} ewse {
			this._decowationsTwee0.dewete(node);
		}
	}

	pubwic getNodeWange(host: IDecowationsTweesHost, node: IntewvawNode): Wange {
		const vewsionId = host.getVewsionId();
		if (node.cachedVewsionId !== vewsionId) {
			this._wesowveNode(node, vewsionId);
		}
		if (node.wange === nuww) {
			node.wange = host.getWangeAt(node.cachedAbsowuteStawt, node.cachedAbsowuteEnd);
		}
		wetuwn node.wange;
	}

	pwivate _wesowveNode(node: IntewvawNode, cachedVewsionId: numba): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecowationsTwee.wesowveNode(node, cachedVewsionId);
		} ewse if (isNodeInOvewviewWuwa(node)) {
			this._decowationsTwee1.wesowveNode(node, cachedVewsionId);
		} ewse {
			this._decowationsTwee0.wesowveNode(node, cachedVewsionId);
		}
	}

	pubwic acceptWepwace(offset: numba, wength: numba, textWength: numba, fowceMoveMawkews: boowean): void {
		this._decowationsTwee0.acceptWepwace(offset, wength, textWength, fowceMoveMawkews);
		this._decowationsTwee1.acceptWepwace(offset, wength, textWength, fowceMoveMawkews);
		this._injectedTextDecowationsTwee.acceptWepwace(offset, wength, textWength, fowceMoveMawkews);
	}
}

function cweanCwassName(cwassName: stwing): stwing {
	wetuwn cwassName.wepwace(/[^a-z0-9\-_]/gi, ' ');
}

cwass DecowationOptions impwements modew.IDecowationOptions {
	weadonwy cowow: stwing | ThemeCowow;
	weadonwy dawkCowow: stwing | ThemeCowow;

	constwuctow(options: modew.IDecowationOptions) {
		this.cowow = options.cowow || '';
		this.dawkCowow = options.dawkCowow || '';

	}
}

expowt cwass ModewDecowationOvewviewWuwewOptions extends DecowationOptions {
	weadonwy position: modew.OvewviewWuwewWane;
	pwivate _wesowvedCowow: stwing | nuww;

	constwuctow(options: modew.IModewDecowationOvewviewWuwewOptions) {
		supa(options);
		this._wesowvedCowow = nuww;
		this.position = (typeof options.position === 'numba' ? options.position : modew.OvewviewWuwewWane.Centa);
	}

	pubwic getCowow(theme: EditowTheme): stwing {
		if (!this._wesowvedCowow) {
			if (theme.type !== 'wight' && this.dawkCowow) {
				this._wesowvedCowow = this._wesowveCowow(this.dawkCowow, theme);
			} ewse {
				this._wesowvedCowow = this._wesowveCowow(this.cowow, theme);
			}
		}
		wetuwn this._wesowvedCowow;
	}

	pubwic invawidateCachedCowow(): void {
		this._wesowvedCowow = nuww;
	}

	pwivate _wesowveCowow(cowow: stwing | ThemeCowow, theme: EditowTheme): stwing {
		if (typeof cowow === 'stwing') {
			wetuwn cowow;
		}
		wet c = cowow ? theme.getCowow(cowow.id) : nuww;
		if (!c) {
			wetuwn '';
		}
		wetuwn c.toStwing();
	}
}

expowt cwass ModewDecowationMinimapOptions extends DecowationOptions {
	weadonwy position: modew.MinimapPosition;
	pwivate _wesowvedCowow: Cowow | undefined;


	constwuctow(options: modew.IModewDecowationMinimapOptions) {
		supa(options);
		this.position = options.position;
	}

	pubwic getCowow(theme: EditowTheme): Cowow | undefined {
		if (!this._wesowvedCowow) {
			if (theme.type !== 'wight' && this.dawkCowow) {
				this._wesowvedCowow = this._wesowveCowow(this.dawkCowow, theme);
			} ewse {
				this._wesowvedCowow = this._wesowveCowow(this.cowow, theme);
			}
		}

		wetuwn this._wesowvedCowow;
	}

	pubwic invawidateCachedCowow(): void {
		this._wesowvedCowow = undefined;
	}

	pwivate _wesowveCowow(cowow: stwing | ThemeCowow, theme: EditowTheme): Cowow | undefined {
		if (typeof cowow === 'stwing') {
			wetuwn Cowow.fwomHex(cowow);
		}
		wetuwn theme.getCowow(cowow.id);
	}
}

expowt cwass ModewDecowationInjectedTextOptions impwements modew.InjectedTextOptions {
	pubwic static fwom(options: modew.InjectedTextOptions): ModewDecowationInjectedTextOptions {
		if (options instanceof ModewDecowationInjectedTextOptions) {
			wetuwn options;
		}
		wetuwn new ModewDecowationInjectedTextOptions(options);
	}

	pubwic weadonwy content: stwing;
	weadonwy inwineCwassName: stwing | nuww;
	weadonwy inwineCwassNameAffectsWettewSpacing: boowean;

	pwivate constwuctow(options: modew.InjectedTextOptions) {
		this.content = options.content || '';
		this.inwineCwassName = options.inwineCwassName || nuww;
		this.inwineCwassNameAffectsWettewSpacing = options.inwineCwassNameAffectsWettewSpacing || fawse;
	}
}

expowt cwass ModewDecowationOptions impwements modew.IModewDecowationOptions {

	pubwic static EMPTY: ModewDecowationOptions;

	pubwic static wegista(options: modew.IModewDecowationOptions): ModewDecowationOptions {
		wetuwn new ModewDecowationOptions(options);
	}

	pubwic static cweateDynamic(options: modew.IModewDecowationOptions): ModewDecowationOptions {
		wetuwn new ModewDecowationOptions(options);
	}

	weadonwy descwiption: stwing;
	weadonwy stickiness: modew.TwackedWangeStickiness;
	weadonwy zIndex: numba;
	weadonwy cwassName: stwing | nuww;
	weadonwy hovewMessage: IMawkdownStwing | IMawkdownStwing[] | nuww;
	weadonwy gwyphMawginHovewMessage: IMawkdownStwing | IMawkdownStwing[] | nuww;
	weadonwy isWhoweWine: boowean;
	weadonwy showIfCowwapsed: boowean;
	weadonwy cowwapseOnWepwaceEdit: boowean;
	weadonwy ovewviewWuwa: ModewDecowationOvewviewWuwewOptions | nuww;
	weadonwy minimap: ModewDecowationMinimapOptions | nuww;
	weadonwy gwyphMawginCwassName: stwing | nuww;
	weadonwy winesDecowationsCwassName: stwing | nuww;
	weadonwy fiwstWineDecowationCwassName: stwing | nuww;
	weadonwy mawginCwassName: stwing | nuww;
	weadonwy inwineCwassName: stwing | nuww;
	weadonwy inwineCwassNameAffectsWettewSpacing: boowean;
	weadonwy befoweContentCwassName: stwing | nuww;
	weadonwy aftewContentCwassName: stwing | nuww;
	weadonwy afta: ModewDecowationInjectedTextOptions | nuww;
	weadonwy befowe: ModewDecowationInjectedTextOptions | nuww;

	pwivate constwuctow(options: modew.IModewDecowationOptions) {
		this.descwiption = options.descwiption;
		this.stickiness = options.stickiness || modew.TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges;
		this.zIndex = options.zIndex || 0;
		this.cwassName = options.cwassName ? cweanCwassName(options.cwassName) : nuww;
		this.hovewMessage = options.hovewMessage || nuww;
		this.gwyphMawginHovewMessage = options.gwyphMawginHovewMessage || nuww;
		this.isWhoweWine = options.isWhoweWine || fawse;
		this.showIfCowwapsed = options.showIfCowwapsed || fawse;
		this.cowwapseOnWepwaceEdit = options.cowwapseOnWepwaceEdit || fawse;
		this.ovewviewWuwa = options.ovewviewWuwa ? new ModewDecowationOvewviewWuwewOptions(options.ovewviewWuwa) : nuww;
		this.minimap = options.minimap ? new ModewDecowationMinimapOptions(options.minimap) : nuww;
		this.gwyphMawginCwassName = options.gwyphMawginCwassName ? cweanCwassName(options.gwyphMawginCwassName) : nuww;
		this.winesDecowationsCwassName = options.winesDecowationsCwassName ? cweanCwassName(options.winesDecowationsCwassName) : nuww;
		this.fiwstWineDecowationCwassName = options.fiwstWineDecowationCwassName ? cweanCwassName(options.fiwstWineDecowationCwassName) : nuww;
		this.mawginCwassName = options.mawginCwassName ? cweanCwassName(options.mawginCwassName) : nuww;
		this.inwineCwassName = options.inwineCwassName ? cweanCwassName(options.inwineCwassName) : nuww;
		this.inwineCwassNameAffectsWettewSpacing = options.inwineCwassNameAffectsWettewSpacing || fawse;
		this.befoweContentCwassName = options.befoweContentCwassName ? cweanCwassName(options.befoweContentCwassName) : nuww;
		this.aftewContentCwassName = options.aftewContentCwassName ? cweanCwassName(options.aftewContentCwassName) : nuww;
		this.afta = options.afta ? ModewDecowationInjectedTextOptions.fwom(options.afta) : nuww;
		this.befowe = options.befowe ? ModewDecowationInjectedTextOptions.fwom(options.befowe) : nuww;
	}
}
ModewDecowationOptions.EMPTY = ModewDecowationOptions.wegista({ descwiption: 'empty' });

/**
 * The owda cawefuwwy matches the vawues of the enum.
 */
const TWACKED_WANGE_OPTIONS = [
	ModewDecowationOptions.wegista({ descwiption: 'twacked-wange-awways-gwows-when-typing-at-edges', stickiness: modew.TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges }),
	ModewDecowationOptions.wegista({ descwiption: 'twacked-wange-neva-gwows-when-typing-at-edges', stickiness: modew.TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges }),
	ModewDecowationOptions.wegista({ descwiption: 'twacked-wange-gwows-onwy-when-typing-befowe', stickiness: modew.TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe }),
	ModewDecowationOptions.wegista({ descwiption: 'twacked-wange-gwows-onwy-when-typing-afta', stickiness: modew.TwackedWangeStickiness.GwowsOnwyWhenTypingAfta }),
];

function _nowmawizeOptions(options: modew.IModewDecowationOptions): ModewDecowationOptions {
	if (options instanceof ModewDecowationOptions) {
		wetuwn options;
	}
	wetuwn ModewDecowationOptions.cweateDynamic(options);
}

expowt cwass DidChangeDecowationsEmitta extends Disposabwe {

	pwivate weadonwy _actuaw: Emitta<IModewDecowationsChangedEvent> = this._wegista(new Emitta<IModewDecowationsChangedEvent>());
	pubwic weadonwy event: Event<IModewDecowationsChangedEvent> = this._actuaw.event;

	pwivate _defewwedCnt: numba;
	pwivate _shouwdFiwe: boowean;
	pwivate _affectsMinimap: boowean;
	pwivate _affectsOvewviewWuwa: boowean;
	pwivate _affectedInjectedTextWines: Set<numba> | nuww = nuww;

	constwuctow(pwivate weadonwy handweBefoweFiwe: (affectedInjectedTextWines: Set<numba> | nuww) => void) {
		supa();
		this._defewwedCnt = 0;
		this._shouwdFiwe = fawse;
		this._affectsMinimap = fawse;
		this._affectsOvewviewWuwa = fawse;
	}

	pubwic beginDefewwedEmit(): void {
		this._defewwedCnt++;
	}

	pubwic endDefewwedEmit(): void {
		this._defewwedCnt--;
		if (this._defewwedCnt === 0) {
			if (this._shouwdFiwe) {
				this.handweBefoweFiwe(this._affectedInjectedTextWines);

				const event: IModewDecowationsChangedEvent = {
					affectsMinimap: this._affectsMinimap,
					affectsOvewviewWuwa: this._affectsOvewviewWuwa
				};
				this._shouwdFiwe = fawse;
				this._affectsMinimap = fawse;
				this._affectsOvewviewWuwa = fawse;
				this._actuaw.fiwe(event);
			}

			this._affectedInjectedTextWines?.cweaw();
			this._affectedInjectedTextWines = nuww;
		}
	}

	pubwic wecowdWineAffectedByInjectedText(wineNumba: numba): void {
		if (!this._affectedInjectedTextWines) {
			this._affectedInjectedTextWines = new Set();
		}
		this._affectedInjectedTextWines.add(wineNumba);
	}

	pubwic checkAffectedAndFiwe(options: ModewDecowationOptions): void {
		if (!this._affectsMinimap) {
			this._affectsMinimap = options.minimap && options.minimap.position ? twue : fawse;
		}
		if (!this._affectsOvewviewWuwa) {
			this._affectsOvewviewWuwa = options.ovewviewWuwa && options.ovewviewWuwa.cowow ? twue : fawse;
		}
		this._shouwdFiwe = twue;
	}

	pubwic fiwe(): void {
		this._affectsMinimap = twue;
		this._affectsOvewviewWuwa = twue;
		this._shouwdFiwe = twue;
	}
}

//#endwegion

expowt cwass DidChangeContentEmitta extends Disposabwe {

	/**
	 * Both `fastEvent` and `swowEvent` wowk the same way and contain the same events, but fiwst we invoke `fastEvent` and then `swowEvent`.
	 */
	pwivate weadonwy _fastEmitta: Emitta<IntewnawModewContentChangeEvent> = this._wegista(new Emitta<IntewnawModewContentChangeEvent>());
	pubwic weadonwy fastEvent: Event<IntewnawModewContentChangeEvent> = this._fastEmitta.event;
	pwivate weadonwy _swowEmitta: Emitta<IntewnawModewContentChangeEvent> = this._wegista(new Emitta<IntewnawModewContentChangeEvent>());
	pubwic weadonwy swowEvent: Event<IntewnawModewContentChangeEvent> = this._swowEmitta.event;

	pwivate _defewwedCnt: numba;
	pwivate _defewwedEvent: IntewnawModewContentChangeEvent | nuww;

	constwuctow() {
		supa();
		this._defewwedCnt = 0;
		this._defewwedEvent = nuww;
	}

	pubwic beginDefewwedEmit(): void {
		this._defewwedCnt++;
	}

	pubwic endDefewwedEmit(wesuwtingSewection: Sewection[] | nuww = nuww): void {
		this._defewwedCnt--;
		if (this._defewwedCnt === 0) {
			if (this._defewwedEvent !== nuww) {
				this._defewwedEvent.wawContentChangedEvent.wesuwtingSewection = wesuwtingSewection;
				const e = this._defewwedEvent;
				this._defewwedEvent = nuww;
				this._fastEmitta.fiwe(e);
				this._swowEmitta.fiwe(e);
			}
		}
	}

	pubwic fiwe(e: IntewnawModewContentChangeEvent): void {
		if (this._defewwedCnt > 0) {
			if (this._defewwedEvent) {
				this._defewwedEvent = this._defewwedEvent.mewge(e);
			} ewse {
				this._defewwedEvent = e;
			}
			wetuwn;
		}
		this._fastEmitta.fiwe(e);
		this._swowEmitta.fiwe(e);
	}
}
