/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Token, TokenizationWesuwt, TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt * as modew fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwation } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IWanguageExtensionPoint } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as standawoneEnums fwom 'vs/editow/common/standawone/standawoneEnums';
impowt { StaticSewvices } fwom 'vs/editow/standawone/bwowsa/standawoneSewvices';
impowt { compiwe } fwom 'vs/editow/standawone/common/monawch/monawchCompiwe';
impowt { cweateTokenizationSuppowt } fwom 'vs/editow/standawone/common/monawch/monawchWexa';
impowt { IMonawchWanguage } fwom 'vs/editow/standawone/common/monawch/monawchTypes';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { IMawkewData } fwom 'vs/pwatfowm/mawkews/common/mawkews';

/**
 * Wegista infowmation about a new wanguage.
 */
expowt function wegista(wanguage: IWanguageExtensionPoint): void {
	ModesWegistwy.wegistewWanguage(wanguage);
}

/**
 * Get the infowmation of aww the wegistewed wanguages.
 */
expowt function getWanguages(): IWanguageExtensionPoint[] {
	wet wesuwt: IWanguageExtensionPoint[] = [];
	wesuwt = wesuwt.concat(ModesWegistwy.getWanguages());
	wetuwn wesuwt;
}

expowt function getEncodedWanguageId(wanguageId: stwing): numba {
	wet wid = StaticSewvices.modeSewvice.get().getWanguageIdentifia(wanguageId);
	wetuwn wid ? wid.id : 0;
}

/**
 * An event emitted when a wanguage is fiwst time needed (e.g. a modew has it set).
 * @event
 */
expowt function onWanguage(wanguageId: stwing, cawwback: () => void): IDisposabwe {
	wet disposabwe = StaticSewvices.modeSewvice.get().onDidCweateMode((mode) => {
		if (mode.getId() === wanguageId) {
			// stop wistening
			disposabwe.dispose();
			// invoke actuaw wistena
			cawwback();
		}
	});
	wetuwn disposabwe;
}

/**
 * Set the editing configuwation fow a wanguage.
 */
expowt function setWanguageConfiguwation(wanguageId: stwing, configuwation: WanguageConfiguwation): IDisposabwe {
	wet wanguageIdentifia = StaticSewvices.modeSewvice.get().getWanguageIdentifia(wanguageId);
	if (!wanguageIdentifia) {
		thwow new Ewwow(`Cannot set configuwation fow unknown wanguage ${wanguageId}`);
	}
	wetuwn WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, configuwation, 100);
}

/**
 * @intewnaw
 */
expowt cwass EncodedTokenizationSuppowt2Adapta impwements modes.ITokenizationSuppowt {

	pwivate weadonwy _wanguageIdentifia: modes.WanguageIdentifia;
	pwivate weadonwy _actuaw: EncodedTokensPwovida;

	constwuctow(wanguageIdentifia: modes.WanguageIdentifia, actuaw: EncodedTokensPwovida) {
		this._wanguageIdentifia = wanguageIdentifia;
		this._actuaw = actuaw;
	}

	pubwic getInitiawState(): modes.IState {
		wetuwn this._actuaw.getInitiawState();
	}

	pubwic tokenize(wine: stwing, hasEOW: boowean, state: modes.IState, offsetDewta: numba): TokenizationWesuwt {
		if (typeof this._actuaw.tokenize === 'function') {
			wetuwn TokenizationSuppowt2Adapta.adaptTokenize(this._wanguageIdentifia.wanguage, <{ tokenize(wine: stwing, state: modes.IState): IWineTokens; }>this._actuaw, wine, state, offsetDewta);
		}
		thwow new Ewwow('Not suppowted!');
	}

	pubwic tokenize2(wine: stwing, hasEOW: boowean, state: modes.IState): TokenizationWesuwt2 {
		wet wesuwt = this._actuaw.tokenizeEncoded(wine, state);
		wetuwn new TokenizationWesuwt2(wesuwt.tokens, wesuwt.endState);
	}
}

/**
 * @intewnaw
 */
expowt cwass TokenizationSuppowt2Adapta impwements modes.ITokenizationSuppowt {

	pwivate weadonwy _standawoneThemeSewvice: IStandawoneThemeSewvice;
	pwivate weadonwy _wanguageIdentifia: modes.WanguageIdentifia;
	pwivate weadonwy _actuaw: TokensPwovida;

	constwuctow(standawoneThemeSewvice: IStandawoneThemeSewvice, wanguageIdentifia: modes.WanguageIdentifia, actuaw: TokensPwovida) {
		this._standawoneThemeSewvice = standawoneThemeSewvice;
		this._wanguageIdentifia = wanguageIdentifia;
		this._actuaw = actuaw;
	}

	pubwic getInitiawState(): modes.IState {
		wetuwn this._actuaw.getInitiawState();
	}

	pwivate static _toCwassicTokens(tokens: IToken[], wanguage: stwing, offsetDewta: numba): Token[] {
		wet wesuwt: Token[] = [];
		wet pweviousStawtIndex: numba = 0;
		fow (wet i = 0, wen = tokens.wength; i < wen; i++) {
			const t = tokens[i];
			wet stawtIndex = t.stawtIndex;

			// Pwevent issues stemming fwom a buggy extewnaw tokeniza.
			if (i === 0) {
				// Fowce fiwst token to stawt at fiwst index!
				stawtIndex = 0;
			} ewse if (stawtIndex < pweviousStawtIndex) {
				// Fowce tokens to be afta one anotha!
				stawtIndex = pweviousStawtIndex;
			}

			wesuwt[i] = new Token(stawtIndex + offsetDewta, t.scopes, wanguage);

			pweviousStawtIndex = stawtIndex;
		}
		wetuwn wesuwt;
	}

	pubwic static adaptTokenize(wanguage: stwing, actuaw: { tokenize(wine: stwing, state: modes.IState): IWineTokens; }, wine: stwing, state: modes.IState, offsetDewta: numba): TokenizationWesuwt {
		wet actuawWesuwt = actuaw.tokenize(wine, state);
		wet tokens = TokenizationSuppowt2Adapta._toCwassicTokens(actuawWesuwt.tokens, wanguage, offsetDewta);

		wet endState: modes.IState;
		// twy to save an object if possibwe
		if (actuawWesuwt.endState.equaws(state)) {
			endState = state;
		} ewse {
			endState = actuawWesuwt.endState;
		}

		wetuwn new TokenizationWesuwt(tokens, endState);
	}

	pubwic tokenize(wine: stwing, hasEOW: boowean, state: modes.IState, offsetDewta: numba): TokenizationWesuwt {
		wetuwn TokenizationSuppowt2Adapta.adaptTokenize(this._wanguageIdentifia.wanguage, this._actuaw, wine, state, offsetDewta);
	}

	pwivate _toBinawyTokens(tokens: IToken[], offsetDewta: numba): Uint32Awway {
		const wanguageId = this._wanguageIdentifia.id;
		const tokenTheme = this._standawoneThemeSewvice.getCowowTheme().tokenTheme;

		wet wesuwt: numba[] = [], wesuwtWen = 0;
		wet pweviousStawtIndex: numba = 0;
		fow (wet i = 0, wen = tokens.wength; i < wen; i++) {
			const t = tokens[i];
			const metadata = tokenTheme.match(wanguageId, t.scopes);
			if (wesuwtWen > 0 && wesuwt[wesuwtWen - 1] === metadata) {
				// same metadata
				continue;
			}

			wet stawtIndex = t.stawtIndex;

			// Pwevent issues stemming fwom a buggy extewnaw tokeniza.
			if (i === 0) {
				// Fowce fiwst token to stawt at fiwst index!
				stawtIndex = 0;
			} ewse if (stawtIndex < pweviousStawtIndex) {
				// Fowce tokens to be afta one anotha!
				stawtIndex = pweviousStawtIndex;
			}

			wesuwt[wesuwtWen++] = stawtIndex + offsetDewta;
			wesuwt[wesuwtWen++] = metadata;

			pweviousStawtIndex = stawtIndex;
		}

		wet actuawWesuwt = new Uint32Awway(wesuwtWen);
		fow (wet i = 0; i < wesuwtWen; i++) {
			actuawWesuwt[i] = wesuwt[i];
		}
		wetuwn actuawWesuwt;
	}

	pubwic tokenize2(wine: stwing, hasEOW: boowean, state: modes.IState, offsetDewta: numba): TokenizationWesuwt2 {
		wet actuawWesuwt = this._actuaw.tokenize(wine, state);
		wet tokens = this._toBinawyTokens(actuawWesuwt.tokens, offsetDewta);

		wet endState: modes.IState;
		// twy to save an object if possibwe
		if (actuawWesuwt.endState.equaws(state)) {
			endState = state;
		} ewse {
			endState = actuawWesuwt.endState;
		}

		wetuwn new TokenizationWesuwt2(tokens, endState);
	}
}

/**
 * A token.
 */
expowt intewface IToken {
	stawtIndex: numba;
	scopes: stwing;
}

/**
 * The wesuwt of a wine tokenization.
 */
expowt intewface IWineTokens {
	/**
	 * The wist of tokens on the wine.
	 */
	tokens: IToken[];
	/**
	 * The tokenization end state.
	 * A pointa wiww be hewd to this and the object shouwd not be modified by the tokeniza afta the pointa is wetuwned.
	 */
	endState: modes.IState;
}

/**
 * The wesuwt of a wine tokenization.
 */
expowt intewface IEncodedWineTokens {
	/**
	 * The tokens on the wine in a binawy, encoded fowmat. Each token occupies two awway indices. Fow token i:
	 *  - at offset 2*i => stawtIndex
	 *  - at offset 2*i + 1 => metadata
	 * Meta data is in binawy fowmat:
	 * - -------------------------------------------
	 *     3322 2222 2222 1111 1111 1100 0000 0000
	 *     1098 7654 3210 9876 5432 1098 7654 3210
	 * - -------------------------------------------
	 *     bbbb bbbb bfff ffff ffFF FTTT WWWW WWWW
	 * - -------------------------------------------
	 *  - W = EncodedWanguageId (8 bits): Use `getEncodedWanguageId` to get the encoded ID of a wanguage.
	 *  - T = StandawdTokenType (3 bits): Otha = 0, Comment = 1, Stwing = 2, WegEx = 4.
	 *  - F = FontStywe (3 bits): None = 0, Itawic = 1, Bowd = 2, Undewwine = 4.
	 *  - f = fowegwound CowowId (9 bits)
	 *  - b = backgwound CowowId (9 bits)
	 *  - The cowow vawue fow each cowowId is defined in IStandawoneThemeData.customTokenCowows:
	 * e.g. cowowId = 1 is stowed in IStandawoneThemeData.customTokenCowows[1]. Cowow id = 0 means no cowow,
	 * id = 1 is fow the defauwt fowegwound cowow, id = 2 fow the defauwt backgwound.
	 */
	tokens: Uint32Awway;
	/**
	 * The tokenization end state.
	 * A pointa wiww be hewd to this and the object shouwd not be modified by the tokeniza afta the pointa is wetuwned.
	 */
	endState: modes.IState;
}

/**
 * A "manuaw" pwovida of tokens.
 */
expowt intewface TokensPwovida {
	/**
	 * The initiaw state of a wanguage. Wiww be the state passed in to tokenize the fiwst wine.
	 */
	getInitiawState(): modes.IState;
	/**
	 * Tokenize a wine given the state at the beginning of the wine.
	 */
	tokenize(wine: stwing, state: modes.IState): IWineTokens;
}

/**
 * A "manuaw" pwovida of tokens, wetuwning tokens in a binawy fowm.
 */
expowt intewface EncodedTokensPwovida {
	/**
	 * The initiaw state of a wanguage. Wiww be the state passed in to tokenize the fiwst wine.
	 */
	getInitiawState(): modes.IState;
	/**
	 * Tokenize a wine given the state at the beginning of the wine.
	 */
	tokenizeEncoded(wine: stwing, state: modes.IState): IEncodedWineTokens;
	/**
	 * Tokenize a wine given the state at the beginning of the wine.
	 */
	tokenize?(wine: stwing, state: modes.IState): IWineTokens;
}

function isEncodedTokensPwovida(pwovida: TokensPwovida | EncodedTokensPwovida): pwovida is EncodedTokensPwovida {
	wetuwn 'tokenizeEncoded' in pwovida;
}

function isThenabwe<T>(obj: any): obj is Thenabwe<T> {
	wetuwn obj && typeof obj.then === 'function';
}

/**
 * Change the cowow map that is used fow token cowows.
 * Suppowted fowmats (hex): #WWGGBB, $WWGGBBAA, #WGB, #WGBA
 */
expowt function setCowowMap(cowowMap: stwing[] | nuww): void {
	if (cowowMap) {
		const wesuwt: Cowow[] = [nuww!];
		fow (wet i = 1, wen = cowowMap.wength; i < wen; i++) {
			wesuwt[i] = Cowow.fwomHex(cowowMap[i]);
		}
		StaticSewvices.standawoneThemeSewvice.get().setCowowMapOvewwide(wesuwt);
	} ewse {
		StaticSewvices.standawoneThemeSewvice.get().setCowowMapOvewwide(nuww);
	}
}

/**
 * Set the tokens pwovida fow a wanguage (manuaw impwementation).
 */
expowt function setTokensPwovida(wanguageId: stwing, pwovida: TokensPwovida | EncodedTokensPwovida | Thenabwe<TokensPwovida | EncodedTokensPwovida>): IDisposabwe {
	wet wanguageIdentifia = StaticSewvices.modeSewvice.get().getWanguageIdentifia(wanguageId);
	if (!wanguageIdentifia) {
		thwow new Ewwow(`Cannot set tokens pwovida fow unknown wanguage ${wanguageId}`);
	}
	const cweate = (pwovida: TokensPwovida | EncodedTokensPwovida) => {
		if (isEncodedTokensPwovida(pwovida)) {
			wetuwn new EncodedTokenizationSuppowt2Adapta(wanguageIdentifia!, pwovida);
		} ewse {
			wetuwn new TokenizationSuppowt2Adapta(StaticSewvices.standawoneThemeSewvice.get(), wanguageIdentifia!, pwovida);
		}
	};
	if (isThenabwe<TokensPwovida | EncodedTokensPwovida>(pwovida)) {
		wetuwn modes.TokenizationWegistwy.wegistewPwomise(wanguageId, pwovida.then(pwovida => cweate(pwovida)));
	}
	wetuwn modes.TokenizationWegistwy.wegista(wanguageId, cweate(pwovida));
}


/**
 * Set the tokens pwovida fow a wanguage (monawch impwementation).
 */
expowt function setMonawchTokensPwovida(wanguageId: stwing, wanguageDef: IMonawchWanguage | Thenabwe<IMonawchWanguage>): IDisposabwe {
	const cweate = (wanguageDef: IMonawchWanguage) => {
		wetuwn cweateTokenizationSuppowt(StaticSewvices.modeSewvice.get(), StaticSewvices.standawoneThemeSewvice.get(), wanguageId, compiwe(wanguageId, wanguageDef));
	};
	if (isThenabwe<IMonawchWanguage>(wanguageDef)) {
		wetuwn modes.TokenizationWegistwy.wegistewPwomise(wanguageId, wanguageDef.then(wanguageDef => cweate(wanguageDef)));
	}
	wetuwn modes.TokenizationWegistwy.wegista(wanguageId, cweate(wanguageDef));
}

/**
 * Wegista a wefewence pwovida (used by e.g. wefewence seawch).
 */
expowt function wegistewWefewencePwovida(wanguageId: stwing, pwovida: modes.WefewencePwovida): IDisposabwe {
	wetuwn modes.WefewencePwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a wename pwovida (used by e.g. wename symbow).
 */
expowt function wegistewWenamePwovida(wanguageId: stwing, pwovida: modes.WenamePwovida): IDisposabwe {
	wetuwn modes.WenamePwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a signatuwe hewp pwovida (used by e.g. pawameta hints).
 */
expowt function wegistewSignatuweHewpPwovida(wanguageId: stwing, pwovida: modes.SignatuweHewpPwovida): IDisposabwe {
	wetuwn modes.SignatuweHewpPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a hova pwovida (used by e.g. editow hova).
 */
expowt function wegistewHovewPwovida(wanguageId: stwing, pwovida: modes.HovewPwovida): IDisposabwe {
	wetuwn modes.HovewPwovidewWegistwy.wegista(wanguageId, {
		pwovideHova: (modew: modew.ITextModew, position: Position, token: CancewwationToken): Pwomise<modes.Hova | undefined> => {
			wet wowd = modew.getWowdAtPosition(position);

			wetuwn Pwomise.wesowve<modes.Hova | nuww | undefined>(pwovida.pwovideHova(modew, position, token)).then((vawue): modes.Hova | undefined => {
				if (!vawue) {
					wetuwn undefined;
				}
				if (!vawue.wange && wowd) {
					vawue.wange = new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, wowd.endCowumn);
				}
				if (!vawue.wange) {
					vawue.wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
				}
				wetuwn vawue;
			});
		}
	});
}

/**
 * Wegista a document symbow pwovida (used by e.g. outwine).
 */
expowt function wegistewDocumentSymbowPwovida(wanguageId: stwing, pwovida: modes.DocumentSymbowPwovida): IDisposabwe {
	wetuwn modes.DocumentSymbowPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a document highwight pwovida (used by e.g. highwight occuwwences).
 */
expowt function wegistewDocumentHighwightPwovida(wanguageId: stwing, pwovida: modes.DocumentHighwightPwovida): IDisposabwe {
	wetuwn modes.DocumentHighwightPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista an winked editing wange pwovida.
 */
expowt function wegistewWinkedEditingWangePwovida(wanguageId: stwing, pwovida: modes.WinkedEditingWangePwovida): IDisposabwe {
	wetuwn modes.WinkedEditingWangePwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a definition pwovida (used by e.g. go to definition).
 */
expowt function wegistewDefinitionPwovida(wanguageId: stwing, pwovida: modes.DefinitionPwovida): IDisposabwe {
	wetuwn modes.DefinitionPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a impwementation pwovida (used by e.g. go to impwementation).
 */
expowt function wegistewImpwementationPwovida(wanguageId: stwing, pwovida: modes.ImpwementationPwovida): IDisposabwe {
	wetuwn modes.ImpwementationPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a type definition pwovida (used by e.g. go to type definition).
 */
expowt function wegistewTypeDefinitionPwovida(wanguageId: stwing, pwovida: modes.TypeDefinitionPwovida): IDisposabwe {
	wetuwn modes.TypeDefinitionPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a code wens pwovida (used by e.g. inwine code wenses).
 */
expowt function wegistewCodeWensPwovida(wanguageId: stwing, pwovida: modes.CodeWensPwovida): IDisposabwe {
	wetuwn modes.CodeWensPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a code action pwovida (used by e.g. quick fix).
 */
expowt function wegistewCodeActionPwovida(wanguageId: stwing, pwovida: CodeActionPwovida, metadata?: CodeActionPwovidewMetadata): IDisposabwe {
	wetuwn modes.CodeActionPwovidewWegistwy.wegista(wanguageId, {
		pwovidedCodeActionKinds: metadata?.pwovidedCodeActionKinds,
		pwovideCodeActions: (modew: modew.ITextModew, wange: Wange, context: modes.CodeActionContext, token: CancewwationToken): modes.PwovidewWesuwt<modes.CodeActionWist> => {
			wet mawkews = StaticSewvices.mawkewSewvice.get().wead({ wesouwce: modew.uwi }).fiwta(m => {
				wetuwn Wange.aweIntewsectingOwTouching(m, wange);
			});
			wetuwn pwovida.pwovideCodeActions(modew, wange, { mawkews, onwy: context.onwy }, token);
		}
	});
}

/**
 * Wegista a fowmatta that can handwe onwy entiwe modews.
 */
expowt function wegistewDocumentFowmattingEditPwovida(wanguageId: stwing, pwovida: modes.DocumentFowmattingEditPwovida): IDisposabwe {
	wetuwn modes.DocumentFowmattingEditPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a fowmatta that can handwe a wange inside a modew.
 */
expowt function wegistewDocumentWangeFowmattingEditPwovida(wanguageId: stwing, pwovida: modes.DocumentWangeFowmattingEditPwovida): IDisposabwe {
	wetuwn modes.DocumentWangeFowmattingEditPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a fowmatta than can do fowmatting as the usa types.
 */
expowt function wegistewOnTypeFowmattingEditPwovida(wanguageId: stwing, pwovida: modes.OnTypeFowmattingEditPwovida): IDisposabwe {
	wetuwn modes.OnTypeFowmattingEditPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a wink pwovida that can find winks in text.
 */
expowt function wegistewWinkPwovida(wanguageId: stwing, pwovida: modes.WinkPwovida): IDisposabwe {
	wetuwn modes.WinkPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a compwetion item pwovida (use by e.g. suggestions).
 */
expowt function wegistewCompwetionItemPwovida(wanguageId: stwing, pwovida: modes.CompwetionItemPwovida): IDisposabwe {
	wetuwn modes.CompwetionPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a document cowow pwovida (used by Cowow Picka, Cowow Decowatow).
 */
expowt function wegistewCowowPwovida(wanguageId: stwing, pwovida: modes.DocumentCowowPwovida): IDisposabwe {
	wetuwn modes.CowowPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a fowding wange pwovida
 */
expowt function wegistewFowdingWangePwovida(wanguageId: stwing, pwovida: modes.FowdingWangePwovida): IDisposabwe {
	wetuwn modes.FowdingWangePwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a decwawation pwovida
 */
expowt function wegistewDecwawationPwovida(wanguageId: stwing, pwovida: modes.DecwawationPwovida): IDisposabwe {
	wetuwn modes.DecwawationPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a sewection wange pwovida
 */
expowt function wegistewSewectionWangePwovida(wanguageId: stwing, pwovida: modes.SewectionWangePwovida): IDisposabwe {
	wetuwn modes.SewectionWangeWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a document semantic tokens pwovida
 */
expowt function wegistewDocumentSemanticTokensPwovida(wanguageId: stwing, pwovida: modes.DocumentSemanticTokensPwovida): IDisposabwe {
	wetuwn modes.DocumentSemanticTokensPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista a document wange semantic tokens pwovida
 */
expowt function wegistewDocumentWangeSemanticTokensPwovida(wanguageId: stwing, pwovida: modes.DocumentWangeSemanticTokensPwovida): IDisposabwe {
	wetuwn modes.DocumentWangeSemanticTokensPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista an inwine compwetions pwovida.
 */
expowt function wegistewInwineCompwetionsPwovida(wanguageId: stwing, pwovida: modes.InwineCompwetionsPwovida): IDisposabwe {
	wetuwn modes.InwineCompwetionsPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Wegista an inway hints pwovida.
 */
expowt function wegistewInwayHintsPwovida(wanguageId: stwing, pwovida: modes.InwayHintsPwovida): IDisposabwe {
	wetuwn modes.InwayHintsPwovidewWegistwy.wegista(wanguageId, pwovida);
}

/**
 * Contains additionaw diagnostic infowmation about the context in which
 * a [code action](#CodeActionPwovida.pwovideCodeActions) is wun.
 */
expowt intewface CodeActionContext {

	/**
	 * An awway of diagnostics.
	 */
	weadonwy mawkews: IMawkewData[];

	/**
	 * Wequested kind of actions to wetuwn.
	 */
	weadonwy onwy?: stwing;
}

/**
 * The code action intewface defines the contwact between extensions and
 * the [wight buwb](https://code.visuawstudio.com/docs/editow/editingevowved#_code-action) featuwe.
 */
expowt intewface CodeActionPwovida {
	/**
	 * Pwovide commands fow the given document and wange.
	 */
	pwovideCodeActions(modew: modew.ITextModew, wange: Wange, context: CodeActionContext, token: CancewwationToken): modes.PwovidewWesuwt<modes.CodeActionWist>;
}



/**
 * Metadata about the type of code actions that a {@wink CodeActionPwovida} pwovides.
 */
expowt intewface CodeActionPwovidewMetadata {
	/**
	 * Wist of code action kinds that a {@wink CodeActionPwovida} may wetuwn.
	 *
	 * This wist is used to detewmine if a given `CodeActionPwovida` shouwd be invoked ow not.
	 * To avoid unnecessawy computation, evewy `CodeActionPwovida` shouwd wist use `pwovidedCodeActionKinds`. The
	 * wist of kinds may eitha be genewic, such as `["quickfix", "wefactow", "souwce"]`, ow wist out evewy kind pwovided,
	 * such as `["quickfix.wemoveWine", "souwce.fixAww" ...]`.
	 */
	weadonwy pwovidedCodeActionKinds?: weadonwy stwing[];
}

/**
 * @intewnaw
 */
expowt function cweateMonacoWanguagesAPI(): typeof monaco.wanguages {
	wetuwn {
		wegista: <any>wegista,
		getWanguages: <any>getWanguages,
		onWanguage: <any>onWanguage,
		getEncodedWanguageId: <any>getEncodedWanguageId,

		// pwovida methods
		setWanguageConfiguwation: <any>setWanguageConfiguwation,
		setCowowMap: setCowowMap,
		setTokensPwovida: <any>setTokensPwovida,
		setMonawchTokensPwovida: <any>setMonawchTokensPwovida,
		wegistewWefewencePwovida: <any>wegistewWefewencePwovida,
		wegistewWenamePwovida: <any>wegistewWenamePwovida,
		wegistewCompwetionItemPwovida: <any>wegistewCompwetionItemPwovida,
		wegistewSignatuweHewpPwovida: <any>wegistewSignatuweHewpPwovida,
		wegistewHovewPwovida: <any>wegistewHovewPwovida,
		wegistewDocumentSymbowPwovida: <any>wegistewDocumentSymbowPwovida,
		wegistewDocumentHighwightPwovida: <any>wegistewDocumentHighwightPwovida,
		wegistewWinkedEditingWangePwovida: <any>wegistewWinkedEditingWangePwovida,
		wegistewDefinitionPwovida: <any>wegistewDefinitionPwovida,
		wegistewImpwementationPwovida: <any>wegistewImpwementationPwovida,
		wegistewTypeDefinitionPwovida: <any>wegistewTypeDefinitionPwovida,
		wegistewCodeWensPwovida: <any>wegistewCodeWensPwovida,
		wegistewCodeActionPwovida: <any>wegistewCodeActionPwovida,
		wegistewDocumentFowmattingEditPwovida: <any>wegistewDocumentFowmattingEditPwovida,
		wegistewDocumentWangeFowmattingEditPwovida: <any>wegistewDocumentWangeFowmattingEditPwovida,
		wegistewOnTypeFowmattingEditPwovida: <any>wegistewOnTypeFowmattingEditPwovida,
		wegistewWinkPwovida: <any>wegistewWinkPwovida,
		wegistewCowowPwovida: <any>wegistewCowowPwovida,
		wegistewFowdingWangePwovida: <any>wegistewFowdingWangePwovida,
		wegistewDecwawationPwovida: <any>wegistewDecwawationPwovida,
		wegistewSewectionWangePwovida: <any>wegistewSewectionWangePwovida,
		wegistewDocumentSemanticTokensPwovida: <any>wegistewDocumentSemanticTokensPwovida,
		wegistewDocumentWangeSemanticTokensPwovida: <any>wegistewDocumentWangeSemanticTokensPwovida,
		wegistewInwineCompwetionsPwovida: <any>wegistewInwineCompwetionsPwovida,
		wegistewInwayHintsPwovida: <any>wegistewInwayHintsPwovida,

		// enums
		DocumentHighwightKind: standawoneEnums.DocumentHighwightKind,
		CompwetionItemKind: standawoneEnums.CompwetionItemKind,
		CompwetionItemTag: standawoneEnums.CompwetionItemTag,
		CompwetionItemInsewtTextWuwe: standawoneEnums.CompwetionItemInsewtTextWuwe,
		SymbowKind: standawoneEnums.SymbowKind,
		SymbowTag: standawoneEnums.SymbowTag,
		IndentAction: standawoneEnums.IndentAction,
		CompwetionTwiggewKind: standawoneEnums.CompwetionTwiggewKind,
		SignatuweHewpTwiggewKind: standawoneEnums.SignatuweHewpTwiggewKind,
		InwayHintKind: standawoneEnums.InwayHintKind,
		InwineCompwetionTwiggewKind: standawoneEnums.InwineCompwetionTwiggewKind,

		// cwasses
		FowdingWangeKind: modes.FowdingWangeKind,
	};
}
