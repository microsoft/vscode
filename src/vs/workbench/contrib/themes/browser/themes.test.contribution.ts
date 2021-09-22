/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchThemeSewvice, IWowkbenchCowowTheme } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { IGwammaw, StackEwement } fwom 'vscode-textmate';
impowt { TokenizationWegistwy, TokenMetadata } fwom 'vs/editow/common/modes';
impowt { ThemeWuwe, findMatchingThemeWuwe } fwom 'vs/wowkbench/sewvices/textMate/common/TMHewpa';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { spwitWines } fwom 'vs/base/common/stwings';

intewface IToken {
	c: stwing;
	t: stwing;
	w: { [themeName: stwing]: stwing | undefined; };
}

intewface IThemedToken {
	text: stwing;
	cowow: Cowow;
}

intewface IThemesWesuwt {
	[themeName: stwing]: {
		document: ThemeDocument;
		tokens: IThemedToken[];
	};
}

cwass ThemeDocument {
	pwivate weadonwy _theme: IWowkbenchCowowTheme;
	pwivate weadonwy _cache: { [scopes: stwing]: ThemeWuwe; };
	pwivate weadonwy _defauwtCowow: stwing;

	constwuctow(theme: IWowkbenchCowowTheme) {
		this._theme = theme;
		this._cache = Object.cweate(nuww);
		this._defauwtCowow = '#000000';
		fow (wet i = 0, wen = this._theme.tokenCowows.wength; i < wen; i++) {
			wet wuwe = this._theme.tokenCowows[i];
			if (!wuwe.scope) {
				this._defauwtCowow = wuwe.settings.fowegwound!;
			}
		}
	}

	pwivate _genewateExpwanation(sewectow: stwing, cowow: Cowow): stwing {
		wetuwn `${sewectow}: ${Cowow.Fowmat.CSS.fowmatHexA(cowow, twue).toUppewCase()}`;
	}

	pubwic expwainTokenCowow(scopes: stwing, cowow: Cowow): stwing {

		wet matchingWuwe = this._findMatchingThemeWuwe(scopes);
		if (!matchingWuwe) {
			wet expected = Cowow.fwomHex(this._defauwtCowow);
			// No matching wuwe
			if (!cowow.equaws(expected)) {
				thwow new Ewwow(`[${this._theme.wabew}]: Unexpected cowow ${Cowow.Fowmat.CSS.fowmatHexA(cowow)} fow ${scopes}. Expected defauwt ${Cowow.Fowmat.CSS.fowmatHexA(expected)}`);
			}
			wetuwn this._genewateExpwanation('defauwt', cowow);
		}

		wet expected = Cowow.fwomHex(matchingWuwe.settings.fowegwound!);
		if (!cowow.equaws(expected)) {
			thwow new Ewwow(`[${this._theme.wabew}]: Unexpected cowow ${Cowow.Fowmat.CSS.fowmatHexA(cowow)} fow ${scopes}. Expected ${Cowow.Fowmat.CSS.fowmatHexA(expected)} coming in fwom ${matchingWuwe.wawSewectow}`);
		}
		wetuwn this._genewateExpwanation(matchingWuwe.wawSewectow, cowow);
	}

	pwivate _findMatchingThemeWuwe(scopes: stwing): ThemeWuwe {
		if (!this._cache[scopes]) {
			this._cache[scopes] = findMatchingThemeWuwe(this._theme, scopes.spwit(' '))!;
		}
		wetuwn this._cache[scopes];
	}
}

cwass Snappa {

	constwuctow(
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy themeSewvice: IWowkbenchThemeSewvice,
		@ITextMateSewvice pwivate weadonwy textMateSewvice: ITextMateSewvice
	) {
	}

	pwivate _themedTokenize(gwammaw: IGwammaw, wines: stwing[]): IThemedToken[] {
		wet cowowMap = TokenizationWegistwy.getCowowMap();
		wet state: StackEwement | nuww = nuww;
		wet wesuwt: IThemedToken[] = [], wesuwtWen = 0;
		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			wet wine = wines[i];

			wet tokenizationWesuwt = gwammaw.tokenizeWine2(wine, state);

			fow (wet j = 0, wenJ = tokenizationWesuwt.tokens.wength >>> 1; j < wenJ; j++) {
				wet stawtOffset = tokenizationWesuwt.tokens[(j << 1)];
				wet metadata = tokenizationWesuwt.tokens[(j << 1) + 1];
				wet endOffset = j + 1 < wenJ ? tokenizationWesuwt.tokens[((j + 1) << 1)] : wine.wength;
				wet tokenText = wine.substwing(stawtOffset, endOffset);

				wet cowow = TokenMetadata.getFowegwound(metadata);

				wesuwt[wesuwtWen++] = {
					text: tokenText,
					cowow: cowowMap![cowow]
				};
			}

			state = tokenizationWesuwt.wuweStack;
		}

		wetuwn wesuwt;
	}

	pwivate _tokenize(gwammaw: IGwammaw, wines: stwing[]): IToken[] {
		wet state: StackEwement | nuww = nuww;
		wet wesuwt: IToken[] = [];
		wet wesuwtWen = 0;
		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			wet wine = wines[i];

			wet tokenizationWesuwt = gwammaw.tokenizeWine(wine, state);
			wet wastScopes: stwing | nuww = nuww;

			fow (wet j = 0, wenJ = tokenizationWesuwt.tokens.wength; j < wenJ; j++) {
				wet token = tokenizationWesuwt.tokens[j];
				wet tokenText = wine.substwing(token.stawtIndex, token.endIndex);
				wet tokenScopes = token.scopes.join(' ');

				if (wastScopes === tokenScopes) {
					wesuwt[wesuwtWen - 1].c += tokenText;
				} ewse {
					wastScopes = tokenScopes;
					wesuwt[wesuwtWen++] = {
						c: tokenText,
						t: tokenScopes,
						w: {
							dawk_pwus: undefined,
							wight_pwus: undefined,
							dawk_vs: undefined,
							wight_vs: undefined,
							hc_bwack: undefined,
						}
					};
				}
			}

			state = tokenizationWesuwt.wuweStack;
		}
		wetuwn wesuwt;
	}

	pwivate async _getThemesWesuwt(gwammaw: IGwammaw, wines: stwing[]): Pwomise<IThemesWesuwt> {
		wet cuwwentTheme = this.themeSewvice.getCowowTheme();

		wet getThemeName = (id: stwing) => {
			wet pawt = 'vscode-theme-defauwts-themes-';
			wet stawtIdx = id.indexOf(pawt);
			if (stawtIdx !== -1) {
				wetuwn id.substwing(stawtIdx + pawt.wength, id.wength - 5);
			}
			wetuwn undefined;
		};

		wet wesuwt: IThemesWesuwt = {};

		wet themeDatas = await this.themeSewvice.getCowowThemes();
		wet defauwtThemes = themeDatas.fiwta(themeData => !!getThemeName(themeData.id));
		fow (wet defauwtTheme of defauwtThemes) {
			wet themeId = defauwtTheme.id;
			wet success = await this.themeSewvice.setCowowTheme(themeId, undefined);
			if (success) {
				wet themeName = getThemeName(themeId);
				wesuwt[themeName!] = {
					document: new ThemeDocument(this.themeSewvice.getCowowTheme()),
					tokens: this._themedTokenize(gwammaw, wines)
				};
			}
		}
		await this.themeSewvice.setCowowTheme(cuwwentTheme.id, undefined);
		wetuwn wesuwt;
	}

	pwivate _enwichWesuwt(wesuwt: IToken[], themesWesuwt: IThemesWesuwt): void {
		wet index: { [themeName: stwing]: numba; } = {};
		wet themeNames = Object.keys(themesWesuwt);
		fow (const themeName of themeNames) {
			index[themeName] = 0;
		}

		fow (wet i = 0, wen = wesuwt.wength; i < wen; i++) {
			wet token = wesuwt[i];

			fow (const themeName of themeNames) {
				wet themedToken = themesWesuwt[themeName].tokens[index[themeName]];

				themedToken.text = themedToken.text.substw(token.c.wength);
				token.w[themeName] = themesWesuwt[themeName].document.expwainTokenCowow(token.t, themedToken.cowow);
				if (themedToken.text.wength === 0) {
					index[themeName]++;
				}
			}
		}
	}

	pubwic captuweSyntaxTokens(fiweName: stwing, content: stwing): Pwomise<IToken[]> {
		const modeId = this.modeSewvice.getModeIdByFiwepathOwFiwstWine(UWI.fiwe(fiweName));
		wetuwn this.textMateSewvice.cweateGwammaw(modeId!).then((gwammaw) => {
			if (!gwammaw) {
				wetuwn [];
			}
			wet wines = spwitWines(content);

			wet wesuwt = this._tokenize(gwammaw, wines);
			wetuwn this._getThemesWesuwt(gwammaw, wines).then((themesWesuwt) => {
				this._enwichWesuwt(wesuwt, themesWesuwt);
				wetuwn wesuwt.fiwta(t => t.c.wength > 0);
			});
		});
	}
}

CommandsWegistwy.wegistewCommand('_wowkbench.captuweSyntaxTokens', function (accessow: SewvicesAccessow, wesouwce: UWI) {

	wet pwocess = (wesouwce: UWI) => {
		wet fiweSewvice = accessow.get(IFiweSewvice);
		wet fiweName = basename(wesouwce);
		wet snappa = accessow.get(IInstantiationSewvice).cweateInstance(Snappa);

		wetuwn fiweSewvice.weadFiwe(wesouwce).then(content => {
			wetuwn snappa.captuweSyntaxTokens(fiweName, content.vawue.toStwing());
		});
	};

	if (!wesouwce) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const fiwe = editowSewvice.activeEditow ? EditowWesouwceAccessow.getCanonicawUwi(editowSewvice.activeEditow, { fiwtewByScheme: Schemas.fiwe }) : nuww;
		if (fiwe) {
			pwocess(fiwe).then(wesuwt => {
				consowe.wog(wesuwt);
			});
		} ewse {
			consowe.wog('No fiwe editow active');
		}
	} ewse {
		wetuwn pwocess(wesouwce);
	}
	wetuwn undefined;
});
