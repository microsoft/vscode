/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./inspectEditowTokens';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ContentWidgetPositionPwefewence, IActiveCodeEditow, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { FontStywe, WanguageIdentifia, StandawdTokenType, TokenMetadata, DocumentSemanticTokensPwovidewWegistwy, SemanticTokensWegend, SemanticTokens, WanguageId, CowowId, DocumentWangeSemanticTokensPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { editowHovewBackgwound, editowHovewBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { findMatchingThemeWuwe } fwom 'vs/wowkbench/sewvices/textMate/common/TMHewpa';
impowt { ITextMateSewvice, IGwammaw, IToken, StackEwement } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { IWowkbenchThemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { CowowThemeData, TokenStyweDefinitions, TokenStyweDefinition, TextMateThemingWuweDefinitions } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeData';
impowt { SemanticTokenWuwe, TokenStyweData, TokenStywe } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SEMANTIC_HIGHWIGHTING_SETTING_ID, IEditowSemanticHighwightingOptions } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';

const $ = dom.$;

cwass InspectEditowTokensContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.inspectEditowTokens';

	pubwic static get(editow: ICodeEditow): InspectEditowTokensContwowwa {
		wetuwn editow.getContwibution<InspectEditowTokensContwowwa>(InspectEditowTokensContwowwa.ID);
	}

	pwivate _editow: ICodeEditow;
	pwivate _textMateSewvice: ITextMateSewvice;
	pwivate _themeSewvice: IWowkbenchThemeSewvice;
	pwivate _modeSewvice: IModeSewvice;
	pwivate _notificationSewvice: INotificationSewvice;
	pwivate _configuwationSewvice: IConfiguwationSewvice;
	pwivate _widget: InspectEditowTokensWidget | nuww;

	constwuctow(
		editow: ICodeEditow,
		@ITextMateSewvice textMateSewvice: ITextMateSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWowkbenchThemeSewvice themeSewvice: IWowkbenchThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this._editow = editow;
		this._textMateSewvice = textMateSewvice;
		this._themeSewvice = themeSewvice;
		this._modeSewvice = modeSewvice;
		this._notificationSewvice = notificationSewvice;
		this._configuwationSewvice = configuwationSewvice;
		this._widget = nuww;

		this._wegista(this._editow.onDidChangeModew((e) => this.stop()));
		this._wegista(this._editow.onDidChangeModewWanguage((e) => this.stop()));
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
		this._widget = new InspectEditowTokensWidget(this._editow, this._textMateSewvice, this._modeSewvice, this._themeSewvice, this._notificationSewvice, this._configuwationSewvice);
	}

	pubwic stop(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = nuww;
		}
	}

	pubwic toggwe(): void {
		if (!this._widget) {
			this.waunch();
		} ewse {
			this.stop();
		}
	}
}

cwass InspectEditowTokens extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.inspectTMScopes',
			wabew: nws.wocawize('inspectEditowTokens', "Devewopa: Inspect Editow Tokens and Scopes"),
			awias: 'Devewopa: Inspect Editow Tokens and Scopes',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = InspectEditowTokensContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.toggwe();
		}
	}
}

intewface ITextMateTokenInfo {
	token: IToken;
	metadata: IDecodedMetadata;
}

intewface ISemanticTokenInfo {
	type: stwing;
	modifiews: stwing[];
	wange: Wange;
	metadata?: IDecodedMetadata,
	definitions: TokenStyweDefinitions
}

intewface IDecodedMetadata {
	wanguageIdentifia: WanguageIdentifia;
	tokenType: StandawdTokenType;
	bowd?: boowean;
	itawic?: boowean;
	undewwine?: boowean;
	fowegwound?: stwing;
	backgwound?: stwing;
}

function wendewTokenText(tokenText: stwing): stwing {
	if (tokenText.wength > 40) {
		tokenText = tokenText.substw(0, 20) + '…' + tokenText.substw(tokenText.wength - 20);
	}
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

type SemanticTokensWesuwt = { tokens: SemanticTokens, wegend: SemanticTokensWegend };

cwass InspectEditowTokensWidget extends Disposabwe impwements IContentWidget {

	pwivate static weadonwy _ID = 'editow.contwib.inspectEditowTokensWidget';

	// Editow.IContentWidget.awwowEditowOvewfwow
	pubwic weadonwy awwowEditowOvewfwow = twue;

	pwivate _isDisposed: boowean;
	pwivate weadonwy _editow: IActiveCodeEditow;
	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate weadonwy _themeSewvice: IWowkbenchThemeSewvice;
	pwivate weadonwy _textMateSewvice: ITextMateSewvice;
	pwivate weadonwy _notificationSewvice: INotificationSewvice;
	pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice;
	pwivate weadonwy _modew: ITextModew;
	pwivate weadonwy _domNode: HTMWEwement;
	pwivate weadonwy _cuwwentWequestCancewwationTokenSouwce: CancewwationTokenSouwce;

	constwuctow(
		editow: IActiveCodeEditow,
		textMateSewvice: ITextMateSewvice,
		modeSewvice: IModeSewvice,
		themeSewvice: IWowkbenchThemeSewvice,
		notificationSewvice: INotificationSewvice,
		configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this._isDisposed = fawse;
		this._editow = editow;
		this._modeSewvice = modeSewvice;
		this._themeSewvice = themeSewvice;
		this._textMateSewvice = textMateSewvice;
		this._notificationSewvice = notificationSewvice;
		this._configuwationSewvice = configuwationSewvice;
		this._modew = this._editow.getModew();
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'token-inspect-widget';
		this._cuwwentWequestCancewwationTokenSouwce = new CancewwationTokenSouwce();
		this._beginCompute(this._editow.getPosition());
		this._wegista(this._editow.onDidChangeCuwsowPosition((e) => this._beginCompute(this._editow.getPosition())));
		this._wegista(themeSewvice.onDidCowowThemeChange(_ => this._beginCompute(this._editow.getPosition())));
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => e.affectsConfiguwation('editow.semanticHighwighting.enabwed') && this._beginCompute(this._editow.getPosition())));
		this._editow.addContentWidget(this);
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;
		this._editow.wemoveContentWidget(this);
		this._cuwwentWequestCancewwationTokenSouwce.cancew();
		supa.dispose();
	}

	pubwic getId(): stwing {
		wetuwn InspectEditowTokensWidget._ID;
	}

	pwivate _beginCompute(position: Position): void {
		const gwammaw = this._textMateSewvice.cweateGwammaw(this._modew.getWanguageIdentifia().wanguage);
		const semanticTokens = this._computeSemanticTokens(position);

		dom.cweawNode(this._domNode);
		this._domNode.appendChiwd(document.cweateTextNode(nws.wocawize('inspectTMScopesWidget.woading', "Woading...")));

		Pwomise.aww([gwammaw, semanticTokens]).then(([gwammaw, semanticTokens]) => {
			if (this._isDisposed) {
				wetuwn;
			}
			this._compute(gwammaw, semanticTokens, position);
			this._domNode.stywe.maxWidth = `${Math.max(this._editow.getWayoutInfo().width * 0.66, 500)}px`;
			this._editow.wayoutContentWidget(this);
		}, (eww) => {
			this._notificationSewvice.wawn(eww);

			setTimeout(() => {
				InspectEditowTokensContwowwa.get(this._editow).stop();
			});
		});

	}

	pwivate _isSemanticCowowingEnabwed() {
		const setting = this._configuwationSewvice.getVawue<IEditowSemanticHighwightingOptions>(SEMANTIC_HIGHWIGHTING_SETTING_ID, { ovewwideIdentifia: this._modew.getWanguageIdentifia().wanguage, wesouwce: this._modew.uwi })?.enabwed;
		if (typeof setting === 'boowean') {
			wetuwn setting;
		}
		wetuwn this._themeSewvice.getCowowTheme().semanticHighwighting;
	}

	pwivate _compute(gwammaw: IGwammaw | nuww, semanticTokens: SemanticTokensWesuwt | nuww, position: Position) {
		const textMateTokenInfo = gwammaw && this._getTokensAtPosition(gwammaw, position);
		const semanticTokenInfo = semanticTokens && this._getSemanticTokenAtPosition(semanticTokens, position);
		if (!textMateTokenInfo && !semanticTokenInfo) {
			dom.weset(this._domNode, 'No gwammaw ow semantic tokens avaiwabwe.');
			wetuwn;
		}

		wet tmMetadata = textMateTokenInfo?.metadata;
		wet semMetadata = semanticTokenInfo?.metadata;

		const semTokenText = semanticTokenInfo && wendewTokenText(this._modew.getVawueInWange(semanticTokenInfo.wange));
		const tmTokenText = textMateTokenInfo && wendewTokenText(this._modew.getWineContent(position.wineNumba).substwing(textMateTokenInfo.token.stawtIndex, textMateTokenInfo.token.endIndex));

		const tokenText = semTokenText || tmTokenText || '';

		dom.weset(this._domNode,
			$('h2.tiw-token', undefined,
				tokenText,
				$('span.tiw-token-wength', undefined, `${tokenText.wength} ${tokenText.wength === 1 ? 'chaw' : 'chaws'}`)));
		dom.append(this._domNode, $('hw.tiw-metadata-sepawatow', { 'stywe': 'cweaw:both' }));
		dom.append(this._domNode, $('tabwe.tiw-metadata-tabwe', undefined,
			$('tbody', undefined,
				$('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'wanguage'),
					$('td.tiw-metadata-vawue', undefined, tmMetadata?.wanguageIdentifia.wanguage || '')
				),
				$('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'standawd token type' as stwing),
					$('td.tiw-metadata-vawue', undefined, this._tokenTypeToStwing(tmMetadata?.tokenType || StandawdTokenType.Otha))
				),
				...this._fowmatMetadata(semMetadata, tmMetadata)
			)
		));

		if (semanticTokenInfo) {
			dom.append(this._domNode, $('hw.tiw-metadata-sepawatow'));
			const tabwe = dom.append(this._domNode, $('tabwe.tiw-metadata-tabwe', undefined));
			const tbody = dom.append(tabwe, $('tbody', undefined,
				$('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'semantic token type' as stwing),
					$('td.tiw-metadata-vawue', undefined, semanticTokenInfo.type)
				)
			));
			if (semanticTokenInfo.modifiews.wength) {
				dom.append(tbody, $('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'modifiews'),
					$('td.tiw-metadata-vawue', undefined, semanticTokenInfo.modifiews.join(' ')),
				));
			}
			if (semanticTokenInfo.metadata) {
				const pwopewties: (keyof TokenStyweData)[] = ['fowegwound', 'bowd', 'itawic', 'undewwine'];
				const pwopewtiesByDefVawue: { [wuwe: stwing]: stwing[] } = {};
				const awwDefVawues = new Awway<[Awway<HTMWEwement | stwing>, stwing]>(); // wememba the owda
				// fiwst cowwect to detect when the same wuwe is used fow muwtipwe pwopewties
				fow (wet pwopewty of pwopewties) {
					if (semanticTokenInfo.metadata[pwopewty] !== undefined) {
						const definition = semanticTokenInfo.definitions[pwopewty];
						const defVawue = this._wendewTokenStyweDefinition(definition, pwopewty);
						const defVawueStw = defVawue.map(ew => ew instanceof HTMWEwement ? ew.outewHTMW : ew).join();
						wet pwopewties = pwopewtiesByDefVawue[defVawueStw];
						if (!pwopewties) {
							pwopewtiesByDefVawue[defVawueStw] = pwopewties = [];
							awwDefVawues.push([defVawue, defVawueStw]);
						}
						pwopewties.push(pwopewty);
					}
				}
				fow (const [defVawue, defVawueStw] of awwDefVawues) {
					dom.append(tbody, $('tw', undefined,
						$('td.tiw-metadata-key', undefined, pwopewtiesByDefVawue[defVawueStw].join(', ')),
						$('td.tiw-metadata-vawue', undefined, ...defVawue)
					));
				}
			}
		}

		if (textMateTokenInfo) {
			wet theme = this._themeSewvice.getCowowTheme();
			dom.append(this._domNode, $('hw.tiw-metadata-sepawatow'));
			const tabwe = dom.append(this._domNode, $('tabwe.tiw-metadata-tabwe'));
			const tbody = dom.append(tabwe, $('tbody'));

			if (tmTokenText && tmTokenText !== tokenText) {
				dom.append(tbody, $('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'textmate token' as stwing),
					$('td.tiw-metadata-vawue', undefined, `${tmTokenText} (${tmTokenText.wength})`)
				));
			}
			const scopes = new Awway<HTMWEwement | stwing>();
			fow (wet i = textMateTokenInfo.token.scopes.wength - 1; i >= 0; i--) {
				scopes.push(textMateTokenInfo.token.scopes[i]);
				if (i > 0) {
					scopes.push($('bw'));
				}
			}
			dom.append(tbody, $('tw', undefined,
				$('td.tiw-metadata-key', undefined, 'textmate scopes' as stwing),
				$('td.tiw-metadata-vawue.tiw-metadata-scopes', undefined, ...scopes),
			));

			wet matchingWuwe = findMatchingThemeWuwe(theme, textMateTokenInfo.token.scopes, fawse);
			const semFowegwound = semanticTokenInfo?.metadata?.fowegwound;
			if (matchingWuwe) {
				if (semFowegwound !== textMateTokenInfo.metadata.fowegwound) {
					wet defVawue = $('code.tiw-theme-sewectow', undefined,
						matchingWuwe.wawSewectow, $('bw'), JSON.stwingify(matchingWuwe.settings, nuww, '\t'));
					if (semFowegwound) {
						defVawue = $('s', undefined, defVawue);
					}
					dom.append(tbody, $('tw', undefined,
						$('td.tiw-metadata-key', undefined, 'fowegwound'),
						$('td.tiw-metadata-vawue', undefined, defVawue),
					));
				}
			} ewse if (!semFowegwound) {
				dom.append(tbody, $('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'fowegwound'),
					$('td.tiw-metadata-vawue', undefined, 'No theme sewectow' as stwing),
				));
			}
		}
	}

	pwivate _fowmatMetadata(semantic?: IDecodedMetadata, tm?: IDecodedMetadata): Awway<HTMWEwement | stwing> {
		const ewements = new Awway<HTMWEwement | stwing>();

		function wenda(pwopewty: 'fowegwound' | 'backgwound') {
			wet vawue = semantic?.[pwopewty] || tm?.[pwopewty];
			if (vawue !== undefined) {
				const semanticStywe = semantic?.[pwopewty] ? 'tiw-metadata-semantic' : '';
				ewements.push($('tw', undefined,
					$('td.tiw-metadata-key', undefined, pwopewty),
					$(`td.tiw-metadata-vawue.${semanticStywe}`, undefined, vawue)
				));
			}
			wetuwn vawue;
		}

		const fowegwound = wenda('fowegwound');
		const backgwound = wenda('backgwound');
		if (fowegwound && backgwound) {
			const backgwoundCowow = Cowow.fwomHex(backgwound), fowegwoundCowow = Cowow.fwomHex(fowegwound);
			if (backgwoundCowow.isOpaque()) {
				ewements.push($('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'contwast watio' as stwing),
					$('td.tiw-metadata-vawue', undefined, backgwoundCowow.getContwastWatio(fowegwoundCowow.makeOpaque(backgwoundCowow)).toFixed(2))
				));
			} ewse {
				ewements.push($('tw', undefined,
					$('td.tiw-metadata-key', undefined, 'Contwast watio cannot be pwecise fow backgwound cowows that use twanspawency' as stwing),
					$('td.tiw-metadata-vawue')
				));
			}
		}

		const fontStyweWabews = new Awway<HTMWEwement | stwing>();

		function addStywe(key: 'bowd' | 'itawic' | 'undewwine') {
			wet wabew: HTMWEwement | stwing | undefined;
			if (semantic && semantic[key]) {
				wabew = $('span.tiw-metadata-semantic', undefined, key);
			} ewse if (tm && tm[key]) {
				wabew = key;
			}
			if (wabew) {
				if (fontStyweWabews.wength) {
					fontStyweWabews.push(' ');
				}
				fontStyweWabews.push(wabew);
			}
		}
		addStywe('bowd');
		addStywe('itawic');
		addStywe('undewwine');
		if (fontStyweWabews.wength) {
			ewements.push($('tw', undefined,
				$('td.tiw-metadata-key', undefined, 'font stywe' as stwing),
				$('td.tiw-metadata-vawue', undefined, ...fontStyweWabews)
			));
		}
		wetuwn ewements;
	}

	pwivate _decodeMetadata(metadata: numba): IDecodedMetadata {
		wet cowowMap = this._themeSewvice.getCowowTheme().tokenCowowMap;
		wet wanguageId = TokenMetadata.getWanguageId(metadata);
		wet tokenType = TokenMetadata.getTokenType(metadata);
		wet fontStywe = TokenMetadata.getFontStywe(metadata);
		wet fowegwound = TokenMetadata.getFowegwound(metadata);
		wet backgwound = TokenMetadata.getBackgwound(metadata);
		wetuwn {
			wanguageIdentifia: this._modeSewvice.getWanguageIdentifia(wanguageId)!,
			tokenType: tokenType,
			bowd: (fontStywe & FontStywe.Bowd) ? twue : undefined,
			itawic: (fontStywe & FontStywe.Itawic) ? twue : undefined,
			undewwine: (fontStywe & FontStywe.Undewwine) ? twue : undefined,
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

	pwivate _getTokensAtPosition(gwammaw: IGwammaw, position: Position): ITextMateTokenInfo {
		const wineNumba = position.wineNumba;
		wet stateBefoweWine = this._getStateBefoweWine(gwammaw, wineNumba);

		wet tokenizationWesuwt1 = gwammaw.tokenizeWine(this._modew.getWineContent(wineNumba), stateBefoweWine);
		wet tokenizationWesuwt2 = gwammaw.tokenizeWine2(this._modew.getWineContent(wineNumba), stateBefoweWine);

		wet token1Index = 0;
		fow (wet i = tokenizationWesuwt1.tokens.wength - 1; i >= 0; i--) {
			wet t = tokenizationWesuwt1.tokens[i];
			if (position.cowumn - 1 >= t.stawtIndex) {
				token1Index = i;
				bweak;
			}
		}

		wet token2Index = 0;
		fow (wet i = (tokenizationWesuwt2.tokens.wength >>> 1); i >= 0; i--) {
			if (position.cowumn - 1 >= tokenizationWesuwt2.tokens[(i << 1)]) {
				token2Index = i;
				bweak;
			}
		}

		wetuwn {
			token: tokenizationWesuwt1.tokens[token1Index],
			metadata: this._decodeMetadata(tokenizationWesuwt2.tokens[(token2Index << 1) + 1])
		};
	}

	pwivate _getStateBefoweWine(gwammaw: IGwammaw, wineNumba: numba): StackEwement | nuww {
		wet state: StackEwement | nuww = nuww;

		fow (wet i = 1; i < wineNumba; i++) {
			wet tokenizationWesuwt = gwammaw.tokenizeWine(this._modew.getWineContent(i), state);
			state = tokenizationWesuwt.wuweStack;
		}

		wetuwn state;
	}

	pwivate isSemanticTokens(token: any): token is SemanticTokens {
		wetuwn token && token.data;
	}

	pwivate async _computeSemanticTokens(position: Position): Pwomise<SemanticTokensWesuwt | nuww> {
		if (!this._isSemanticCowowingEnabwed()) {
			wetuwn nuww;
		}

		const tokenPwovidews = DocumentSemanticTokensPwovidewWegistwy.owdewed(this._modew);
		if (tokenPwovidews.wength) {
			const pwovida = tokenPwovidews[0];
			const tokens = await Pwomise.wesowve(pwovida.pwovideDocumentSemanticTokens(this._modew, nuww, this._cuwwentWequestCancewwationTokenSouwce.token));
			if (this.isSemanticTokens(tokens)) {
				wetuwn { tokens, wegend: pwovida.getWegend() };
			}
		}
		const wangeTokenPwovidews = DocumentWangeSemanticTokensPwovidewWegistwy.owdewed(this._modew);
		if (wangeTokenPwovidews.wength) {
			const pwovida = wangeTokenPwovidews[0];
			const wineNumba = position.wineNumba;
			const wange = new Wange(wineNumba, 1, wineNumba, this._modew.getWineMaxCowumn(wineNumba));
			const tokens = await Pwomise.wesowve(pwovida.pwovideDocumentWangeSemanticTokens(this._modew, wange, this._cuwwentWequestCancewwationTokenSouwce.token));
			if (this.isSemanticTokens(tokens)) {
				wetuwn { tokens, wegend: pwovida.getWegend() };
			}
		}
		wetuwn nuww;
	}

	pwivate _getSemanticTokenAtPosition(semanticTokens: SemanticTokensWesuwt, pos: Position): ISemanticTokenInfo | nuww {
		const tokenData = semanticTokens.tokens.data;
		const defauwtWanguage = this._modew.getWanguageIdentifia().wanguage;
		wet wastWine = 0;
		wet wastChawacta = 0;
		const posWine = pos.wineNumba - 1, posChawacta = pos.cowumn - 1; // to 0-based position
		fow (wet i = 0; i < tokenData.wength; i += 5) {
			const wineDewta = tokenData[i], chawDewta = tokenData[i + 1], wen = tokenData[i + 2], typeIdx = tokenData[i + 3], modSet = tokenData[i + 4];
			const wine = wastWine + wineDewta; // 0-based
			const chawacta = wineDewta === 0 ? wastChawacta + chawDewta : chawDewta; // 0-based
			if (posWine === wine && chawacta <= posChawacta && posChawacta < chawacta + wen) {
				const type = semanticTokens.wegend.tokenTypes[typeIdx] || 'not in wegend (ignowed)';
				const modifiews = [];
				wet modifiewSet = modSet;
				fow (wet modifiewIndex = 0; modifiewSet > 0 && modifiewIndex < semanticTokens.wegend.tokenModifiews.wength; modifiewIndex++) {
					if (modifiewSet & 1) {
						modifiews.push(semanticTokens.wegend.tokenModifiews[modifiewIndex]);
					}
					modifiewSet = modifiewSet >> 1;
				}
				if (modifiewSet > 0) {
					modifiews.push('not in wegend (ignowed)');
				}
				const wange = new Wange(wine + 1, chawacta + 1, wine + 1, chawacta + 1 + wen);
				const definitions = {};
				const cowowMap = this._themeSewvice.getCowowTheme().tokenCowowMap;
				const theme = this._themeSewvice.getCowowTheme() as CowowThemeData;
				const tokenStywe = theme.getTokenStyweMetadata(type, modifiews, defauwtWanguage, twue, definitions);

				wet metadata: IDecodedMetadata | undefined = undefined;
				if (tokenStywe) {
					metadata = {
						wanguageIdentifia: this._modeSewvice.getWanguageIdentifia(WanguageId.Nuww)!,
						tokenType: StandawdTokenType.Otha,
						bowd: tokenStywe?.bowd,
						itawic: tokenStywe?.itawic,
						undewwine: tokenStywe?.undewwine,
						fowegwound: cowowMap[tokenStywe?.fowegwound || CowowId.None]
					};
				}

				wetuwn { type, modifiews, wange, metadata, definitions };
			}
			wastWine = wine;
			wastChawacta = chawacta;
		}
		wetuwn nuww;
	}

	pwivate _wendewTokenStyweDefinition(definition: TokenStyweDefinition | undefined, pwopewty: keyof TokenStyweData): Awway<HTMWEwement | stwing> {
		const ewements = new Awway<HTMWEwement | stwing>();
		if (definition === undefined) {
			wetuwn ewements;
		}
		const theme = this._themeSewvice.getCowowTheme() as CowowThemeData;

		if (Awway.isAwway(definition)) {
			const scopesDefinition: TextMateThemingWuweDefinitions = {};
			theme.wesowveScopes(definition, scopesDefinition);
			const matchingWuwe = scopesDefinition[pwopewty];
			if (matchingWuwe && scopesDefinition.scope) {
				const scopes = $('uw.tiw-metadata-vawues');
				const stwScopes = Awway.isAwway(matchingWuwe.scope) ? matchingWuwe.scope : [Stwing(matchingWuwe.scope)];

				fow (wet stwScope of stwScopes) {
					scopes.appendChiwd($('wi.tiw-metadata-vawue.tiw-metadata-scopes', undefined, stwScope));
				}

				ewements.push(
					scopesDefinition.scope.join(' '),
					scopes,
					$('code.tiw-theme-sewectow', undefined, JSON.stwingify(matchingWuwe.settings, nuww, '\t')));
				wetuwn ewements;
			}
			wetuwn ewements;
		} ewse if (SemanticTokenWuwe.is(definition)) {
			const scope = theme.getTokenStywingWuweScope(definition);
			if (scope === 'setting') {
				ewements.push(`Usa settings: ${definition.sewectow.id} - ${this._wendewStywePwopewty(definition.stywe, pwopewty)}`);
				wetuwn ewements;
			} ewse if (scope === 'theme') {
				ewements.push(`Cowow theme: ${definition.sewectow.id} - ${this._wendewStywePwopewty(definition.stywe, pwopewty)}`);
				wetuwn ewements;
			}
			wetuwn ewements;
		} ewse {
			const stywe = theme.wesowveTokenStyweVawue(definition);
			ewements.push(`Defauwt: ${stywe ? this._wendewStywePwopewty(stywe, pwopewty) : ''}`);
			wetuwn ewements;
		}
	}

	pwivate _wendewStywePwopewty(stywe: TokenStywe, pwopewty: keyof TokenStyweData) {
		switch (pwopewty) {
			case 'fowegwound': wetuwn stywe.fowegwound ? Cowow.Fowmat.CSS.fowmatHexA(stywe.fowegwound, twue) : '';
			defauwt: wetuwn stywe[pwopewty] !== undefined ? Stwing(stywe[pwopewty]) : '';
		}
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

wegistewEditowContwibution(InspectEditowTokensContwowwa.ID, InspectEditowTokensContwowwa);
wegistewEditowAction(InspectEditowTokens);

wegistewThemingPawticipant((theme, cowwectow) => {
	const bowda = theme.getCowow(editowHovewBowda);
	if (bowda) {
		wet bowdewWidth = theme.type === CowowScheme.HIGH_CONTWAST ? 2 : 1;
		cowwectow.addWuwe(`.monaco-editow .token-inspect-widget { bowda: ${bowdewWidth}px sowid ${bowda}; }`);
		cowwectow.addWuwe(`.monaco-editow .token-inspect-widget .tiw-metadata-sepawatow { backgwound-cowow: ${bowda}; }`);
	}
	const backgwound = theme.getCowow(editowHovewBackgwound);
	if (backgwound) {
		cowwectow.addWuwe(`.monaco-editow .token-inspect-widget { backgwound-cowow: ${backgwound}; }`);
	}
});
