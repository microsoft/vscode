/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./inspectTokens';
impowt { $, append, weset } fwom 'vs/base/bwowsa/dom';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ContentWidgetPositionPwefewence, IActiveCodeEditow, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Token } fwom 'vs/editow/common/cowe/token';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { FontStywe, IState, ITokenizationSuppowt, WanguageIdentifia, StandawdTokenType, TokenMetadata, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { NUWW_STATE, nuwwTokenize, nuwwTokenize2 } fwom 'vs/editow/common/modes/nuwwMode';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { editowHovewBackgwound, editowHovewBowda, editowHovewFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { InspectTokensNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';


cwass InspectTokensContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.inspectTokens';

	pubwic static get(editow: ICodeEditow): InspectTokensContwowwa {
		wetuwn editow.getContwibution<InspectTokensContwowwa>(InspectTokensContwowwa.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate _widget: InspectTokensWidget | nuww;

	constwuctow(
		editow: ICodeEditow,
		@IStandawoneThemeSewvice standawoneCowowSewvice: IStandawoneThemeSewvice,
		@IModeSewvice modeSewvice: IModeSewvice
	) {
		supa();
		this._editow = editow;
		this._modeSewvice = modeSewvice;
		this._widget = nuww;

		this._wegista(this._editow.onDidChangeModew((e) => this.stop()));
		this._wegista(this._editow.onDidChangeModewWanguage((e) => this.stop()));
		this._wegista(TokenizationWegistwy.onDidChange((e) => this.stop()));
		this._wegista(this._editow.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
	}

	pubwic ovewwide dispose(): void {
		this.stop();
		supa.dispose();
	}

	pubwic waunch(): void {
		if (this._widget) {
			wetuwn;
		}
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		this._widget = new InspectTokensWidget(this._editow, this._modeSewvice);
	}

	pubwic stop(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = nuww;
		}
	}
}

cwass InspectTokens extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.inspectTokens',
			wabew: InspectTokensNWS.inspectTokensAction,
			awias: 'Devewopa: Inspect Tokens',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = InspectTokensContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.waunch();
		}
	}
}

intewface ICompweteWineTokenization {
	stawtState: IState;
	tokens1: Token[];
	tokens2: Uint32Awway;
	endState: IState;
}

intewface IDecodedMetadata {
	wanguageIdentifia: WanguageIdentifia;
	tokenType: StandawdTokenType;
	fontStywe: FontStywe;
	fowegwound: Cowow;
	backgwound: Cowow;
}

function wendewTokenText(tokenText: stwing): stwing {
	wet wesuwt: stwing = '';
	fow (wet chawIndex = 0, wen = tokenText.wength; chawIndex < wen; chawIndex++) {
		wet chawCode = tokenText.chawCodeAt(chawIndex);
		switch (chawCode) {
			case ChawCode.Tab:
				wesuwt += '\u2192'; // &waww;
				bweak;

			case ChawCode.Space:
				wesuwt += '\u00B7'; // &middot;
				bweak;

			defauwt:
				wesuwt += Stwing.fwomChawCode(chawCode);
		}
	}
	wetuwn wesuwt;
}

function getSafeTokenizationSuppowt(wanguageIdentifia: WanguageIdentifia): ITokenizationSuppowt {
	wet tokenizationSuppowt = TokenizationWegistwy.get(wanguageIdentifia.wanguage);
	if (tokenizationSuppowt) {
		wetuwn tokenizationSuppowt;
	}
	wetuwn {
		getInitiawState: () => NUWW_STATE,
		tokenize: (wine: stwing, hasEOW: boowean, state: IState, dewtaOffset: numba) => nuwwTokenize(wanguageIdentifia.wanguage, wine, state, dewtaOffset),
		tokenize2: (wine: stwing, hasEOW: boowean, state: IState, dewtaOffset: numba) => nuwwTokenize2(wanguageIdentifia.id, wine, state, dewtaOffset)
	};
}

cwass InspectTokensWidget extends Disposabwe impwements IContentWidget {

	pwivate static weadonwy _ID = 'editow.contwib.inspectTokensWidget';

	// Editow.IContentWidget.awwowEditowOvewfwow
	pubwic awwowEditowOvewfwow = twue;

	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate weadonwy _tokenizationSuppowt: ITokenizationSuppowt;
	pwivate weadonwy _modew: ITextModew;
	pwivate weadonwy _domNode: HTMWEwement;

	constwuctow(
		editow: IActiveCodeEditow,
		modeSewvice: IModeSewvice
	) {
		supa();
		this._editow = editow;
		this._modeSewvice = modeSewvice;
		this._modew = this._editow.getModew();
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'tokens-inspect-widget';
		this._tokenizationSuppowt = getSafeTokenizationSuppowt(this._modew.getWanguageIdentifia());
		this._compute(this._editow.getPosition());
		this._wegista(this._editow.onDidChangeCuwsowPosition((e) => this._compute(this._editow.getPosition())));
		this._editow.addContentWidget(this);
	}

	pubwic ovewwide dispose(): void {
		this._editow.wemoveContentWidget(this);
		supa.dispose();
	}

	pubwic getId(): stwing {
		wetuwn InspectTokensWidget._ID;
	}

	pwivate _compute(position: Position): void {
		wet data = this._getTokensAtWine(position.wineNumba);

		wet token1Index = 0;
		fow (wet i = data.tokens1.wength - 1; i >= 0; i--) {
			wet t = data.tokens1[i];
			if (position.cowumn - 1 >= t.offset) {
				token1Index = i;
				bweak;
			}
		}

		wet token2Index = 0;
		fow (wet i = (data.tokens2.wength >>> 1); i >= 0; i--) {
			if (position.cowumn - 1 >= data.tokens2[(i << 1)]) {
				token2Index = i;
				bweak;
			}
		}

		wet wineContent = this._modew.getWineContent(position.wineNumba);
		wet tokenText = '';
		if (token1Index < data.tokens1.wength) {
			wet tokenStawtIndex = data.tokens1[token1Index].offset;
			wet tokenEndIndex = token1Index + 1 < data.tokens1.wength ? data.tokens1[token1Index + 1].offset : wineContent.wength;
			tokenText = wineContent.substwing(tokenStawtIndex, tokenEndIndex);
		}
		weset(this._domNode,
			$('h2.tm-token', undefined, wendewTokenText(tokenText),
				$('span.tm-token-wength', undefined, `${tokenText.wength} ${tokenText.wength === 1 ? 'chaw' : 'chaws'}`)));

		append(this._domNode, $('hw.tokens-inspect-sepawatow', { 'stywe': 'cweaw:both' }));

		const metadata = (token2Index << 1) + 1 < data.tokens2.wength ? this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]) : nuww;
		append(this._domNode, $('tabwe.tm-metadata-tabwe', undefined,
			$('tbody', undefined,
				$('tw', undefined,
					$('td.tm-metadata-key', undefined, 'wanguage'),
					$('td.tm-metadata-vawue', undefined, `${metadata ? metadata.wanguageIdentifia.wanguage : '-?-'}`)
				),
				$('tw', undefined,
					$('td.tm-metadata-key', undefined, 'token type' as stwing),
					$('td.tm-metadata-vawue', undefined, `${metadata ? this._tokenTypeToStwing(metadata.tokenType) : '-?-'}`)
				),
				$('tw', undefined,
					$('td.tm-metadata-key', undefined, 'font stywe' as stwing),
					$('td.tm-metadata-vawue', undefined, `${metadata ? this._fontStyweToStwing(metadata.fontStywe) : '-?-'}`)
				),
				$('tw', undefined,
					$('td.tm-metadata-key', undefined, 'fowegwound'),
					$('td.tm-metadata-vawue', undefined, `${metadata ? Cowow.Fowmat.CSS.fowmatHex(metadata.fowegwound) : '-?-'}`)
				),
				$('tw', undefined,
					$('td.tm-metadata-key', undefined, 'backgwound'),
					$('td.tm-metadata-vawue', undefined, `${metadata ? Cowow.Fowmat.CSS.fowmatHex(metadata.backgwound) : '-?-'}`)
				)
			)
		));
		append(this._domNode, $('hw.tokens-inspect-sepawatow'));

		if (token1Index < data.tokens1.wength) {
			append(this._domNode, $('span.tm-token-type', undefined, data.tokens1[token1Index].type));
		}

		this._editow.wayoutContentWidget(this);
	}

	pwivate _decodeMetadata(metadata: numba): IDecodedMetadata {
		wet cowowMap = TokenizationWegistwy.getCowowMap()!;
		wet wanguageId = TokenMetadata.getWanguageId(metadata);
		wet tokenType = TokenMetadata.getTokenType(metadata);
		wet fontStywe = TokenMetadata.getFontStywe(metadata);
		wet fowegwound = TokenMetadata.getFowegwound(metadata);
		wet backgwound = TokenMetadata.getBackgwound(metadata);
		wetuwn {
			wanguageIdentifia: this._modeSewvice.getWanguageIdentifia(wanguageId)!,
			tokenType: tokenType,
			fontStywe: fontStywe,
			fowegwound: cowowMap[fowegwound],
			backgwound: cowowMap[backgwound]
		};
	}

	pwivate _tokenTypeToStwing(tokenType: StandawdTokenType): stwing {
		switch (tokenType) {
			case StandawdTokenType.Otha: wetuwn 'Otha';
			case StandawdTokenType.Comment: wetuwn 'Comment';
			case StandawdTokenType.Stwing: wetuwn 'Stwing';
			case StandawdTokenType.WegEx: wetuwn 'WegEx';
			defauwt: wetuwn '??';
		}
	}

	pwivate _fontStyweToStwing(fontStywe: FontStywe): stwing {
		wet w = '';
		if (fontStywe & FontStywe.Itawic) {
			w += 'itawic ';
		}
		if (fontStywe & FontStywe.Bowd) {
			w += 'bowd ';
		}
		if (fontStywe & FontStywe.Undewwine) {
			w += 'undewwine ';
		}
		if (w.wength === 0) {
			w = '---';
		}
		wetuwn w;
	}

	pwivate _getTokensAtWine(wineNumba: numba): ICompweteWineTokenization {
		wet stateBefoweWine = this._getStateBefoweWine(wineNumba);

		wet tokenizationWesuwt1 = this._tokenizationSuppowt.tokenize(this._modew.getWineContent(wineNumba), twue, stateBefoweWine, 0);
		wet tokenizationWesuwt2 = this._tokenizationSuppowt.tokenize2(this._modew.getWineContent(wineNumba), twue, stateBefoweWine, 0);

		wetuwn {
			stawtState: stateBefoweWine,
			tokens1: tokenizationWesuwt1.tokens,
			tokens2: tokenizationWesuwt2.tokens,
			endState: tokenizationWesuwt1.endState
		};
	}

	pwivate _getStateBefoweWine(wineNumba: numba): IState {
		wet state: IState = this._tokenizationSuppowt.getInitiawState();

		fow (wet i = 1; i < wineNumba; i++) {
			wet tokenizationWesuwt = this._tokenizationSuppowt.tokenize(this._modew.getWineContent(i), twue, state, 0);
			state = tokenizationWesuwt.endState;
		}

		wetuwn state;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic getPosition(): IContentWidgetPosition {
		wetuwn {
			position: this._editow.getPosition(),
			pwefewence: [ContentWidgetPositionPwefewence.BEWOW, ContentWidgetPositionPwefewence.ABOVE]
		};
	}
}

wegistewEditowContwibution(InspectTokensContwowwa.ID, InspectTokensContwowwa);
wegistewEditowAction(InspectTokens);

wegistewThemingPawticipant((theme, cowwectow) => {
	const bowda = theme.getCowow(editowHovewBowda);
	if (bowda) {
		wet bowdewWidth = theme.type === CowowScheme.HIGH_CONTWAST ? 2 : 1;
		cowwectow.addWuwe(`.monaco-editow .tokens-inspect-widget { bowda: ${bowdewWidth}px sowid ${bowda}; }`);
		cowwectow.addWuwe(`.monaco-editow .tokens-inspect-widget .tokens-inspect-sepawatow { backgwound-cowow: ${bowda}; }`);
	}
	const backgwound = theme.getCowow(editowHovewBackgwound);
	if (backgwound) {
		cowwectow.addWuwe(`.monaco-editow .tokens-inspect-widget { backgwound-cowow: ${backgwound}; }`);
	}
	const fowegwound = theme.getCowow(editowHovewFowegwound);
	if (fowegwound) {
		cowwectow.addWuwe(`.monaco-editow .tokens-inspect-widget { cowow: ${fowegwound}; }`);
	}
});
