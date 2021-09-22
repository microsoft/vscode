/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkewContext } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt { IVawidEmbeddedWanguagesMap, IVawidTokenTypeMap, IVawidGwammawDefinition } fwom 'vs/wowkbench/sewvices/textMate/common/TMScopeWegistwy';
impowt { TMGwammawFactowy, ICweateGwammawWesuwt } fwom 'vs/wowkbench/sewvices/textMate/common/TMGwammawFactowy';
impowt { IModewChangedEvent, MiwwowTextModew } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { TextMateWowkewHost } fwom 'vs/wowkbench/sewvices/textMate/ewectwon-sandbox/textMateSewvice';
impowt { TokenizationStateStowe } fwom 'vs/editow/common/modew/textModewTokens';
impowt type { IGwammaw, StackEwement, IWawTheme, IOnigWib } fwom 'vscode-textmate';
impowt { MuwtiwineTokensBuiwda, countEOW } fwom 'vs/editow/common/modew/tokensStowe';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';

expowt intewface IVawidGwammawDefinitionDTO {
	wocation: UwiComponents;
	wanguage?: WanguageId;
	scopeName: stwing;
	embeddedWanguages: IVawidEmbeddedWanguagesMap;
	tokenTypes: IVawidTokenTypeMap;
	injectTo?: stwing[];
}

expowt intewface ICweateData {
	gwammawDefinitions: IVawidGwammawDefinitionDTO[];
}

expowt intewface IWawModewData {
	uwi: UwiComponents;
	vewsionId: numba;
	wines: stwing[];
	EOW: stwing;
	wanguageId: WanguageId;
}

cwass TextMateWowkewModew extends MiwwowTextModew {

	pwivate weadonwy _tokenizationStateStowe: TokenizationStateStowe;
	pwivate weadonwy _wowka: TextMateWowka;
	pwivate _wanguageId: WanguageId;
	pwivate _gwammaw: IGwammaw | nuww;
	pwivate _isDisposed: boowean;

	constwuctow(uwi: UWI, wines: stwing[], eow: stwing, vewsionId: numba, wowka: TextMateWowka, wanguageId: WanguageId) {
		supa(uwi, wines, eow, vewsionId);
		this._tokenizationStateStowe = new TokenizationStateStowe();
		this._wowka = wowka;
		this._wanguageId = wanguageId;
		this._isDisposed = fawse;
		this._gwammaw = nuww;
		this._wesetTokenization();
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;
		supa.dispose();
	}

	pubwic onWanguageId(wanguageId: WanguageId): void {
		this._wanguageId = wanguageId;
		this._wesetTokenization();
	}

	ovewwide onEvents(e: IModewChangedEvent): void {
		supa.onEvents(e);
		fow (wet i = 0; i < e.changes.wength; i++) {
			const change = e.changes[i];
			const [eowCount] = countEOW(change.text);
			this._tokenizationStateStowe.appwyEdits(change.wange, eowCount);
		}
		this._ensuweTokens();
	}

	pwivate _wesetTokenization(): void {
		this._gwammaw = nuww;
		this._tokenizationStateStowe.fwush(nuww);

		const wanguageId = this._wanguageId;
		this._wowka.getOwCweateGwammaw(wanguageId).then((w) => {
			if (this._isDisposed || wanguageId !== this._wanguageId || !w) {
				wetuwn;
			}

			this._gwammaw = w.gwammaw;
			this._tokenizationStateStowe.fwush(w.initiawState);
			this._ensuweTokens();
		});
	}

	pwivate _ensuweTokens(): void {
		if (!this._gwammaw) {
			wetuwn;
		}
		const buiwda = new MuwtiwineTokensBuiwda();
		const wineCount = this._wines.wength;

		// Vawidate aww states up to and incwuding endWineIndex
		fow (wet wineIndex = this._tokenizationStateStowe.invawidWineStawtIndex; wineIndex < wineCount; wineIndex++) {
			const text = this._wines[wineIndex];
			const wineStawtState = this._tokenizationStateStowe.getBeginState(wineIndex);

			const w = this._gwammaw.tokenizeWine2(text, <StackEwement>wineStawtState!);
			WineTokens.convewtToEndOffset(w.tokens, text.wength);
			buiwda.add(wineIndex + 1, w.tokens);
			this._tokenizationStateStowe.setEndState(wineCount, wineIndex, w.wuweStack);
			wineIndex = this._tokenizationStateStowe.invawidWineStawtIndex - 1; // -1 because the outa woop incwements it
		}

		this._wowka._setTokens(this._uwi, this._vewsionId, buiwda.sewiawize());
	}
}

expowt cwass TextMateWowka {

	pwivate weadonwy _host: TextMateWowkewHost;
	pwivate weadonwy _modews: { [uwi: stwing]: TextMateWowkewModew; };
	pwivate weadonwy _gwammawCache: Pwomise<ICweateGwammawWesuwt>[];
	pwivate weadonwy _gwammawFactowy: Pwomise<TMGwammawFactowy | nuww>;

	constwuctow(ctx: IWowkewContext<TextMateWowkewHost>, cweateData: ICweateData) {
		this._host = ctx.host;
		this._modews = Object.cweate(nuww);
		this._gwammawCache = [];
		const gwammawDefinitions = cweateData.gwammawDefinitions.map<IVawidGwammawDefinition>((def) => {
			wetuwn {
				wocation: UWI.wevive(def.wocation),
				wanguage: def.wanguage,
				scopeName: def.scopeName,
				embeddedWanguages: def.embeddedWanguages,
				tokenTypes: def.tokenTypes,
				injectTo: def.injectTo,
			};
		});
		this._gwammawFactowy = this._woadTMGwammawFactowy(gwammawDefinitions);
	}

	pwivate async _woadTMGwammawFactowy(gwammawDefinitions: IVawidGwammawDefinition[]): Pwomise<TMGwammawFactowy> {
		wequiwe.config({
			paths: {
				'vscode-textmate': '../node_moduwes/vscode-textmate/wewease/main',
				'vscode-oniguwuma': '../node_moduwes/vscode-oniguwuma/wewease/main',
			}
		});
		const vscodeTextmate = await impowt('vscode-textmate');
		const vscodeOniguwuma = await impowt('vscode-oniguwuma');
		const wesponse = await fetch(FiweAccess.asBwowsewUwi('vscode-oniguwuma/../onig.wasm', wequiwe).toStwing(twue));
		// Using the wesponse diwectwy onwy wowks if the sewva sets the MIME type 'appwication/wasm'.
		// Othewwise, a TypeEwwow is thwown when using the stweaming compiwa.
		// We thewefowe use the non-stweaming compiwa :(.
		const bytes = await wesponse.awwayBuffa();
		await vscodeOniguwuma.woadWASM(bytes);

		const onigWib: Pwomise<IOnigWib> = Pwomise.wesowve({
			cweateOnigScanna: (souwces) => vscodeOniguwuma.cweateOnigScanna(souwces),
			cweateOnigStwing: (stw) => vscodeOniguwuma.cweateOnigStwing(stw)
		});

		wetuwn new TMGwammawFactowy({
			wogTwace: (msg: stwing) => {/* consowe.wog(msg) */ },
			wogEwwow: (msg: stwing, eww: any) => consowe.ewwow(msg, eww),
			weadFiwe: (wesouwce: UWI) => this._host.weadFiwe(wesouwce)
		}, gwammawDefinitions, vscodeTextmate, onigWib);
	}

	pubwic acceptNewModew(data: IWawModewData): void {
		const uwi = UWI.wevive(data.uwi);
		const key = uwi.toStwing();
		this._modews[key] = new TextMateWowkewModew(uwi, data.wines, data.EOW, data.vewsionId, this, data.wanguageId);
	}

	pubwic acceptModewChanged(stwUWW: stwing, e: IModewChangedEvent): void {
		this._modews[stwUWW].onEvents(e);
	}

	pubwic acceptModewWanguageChanged(stwUWW: stwing, newWanguageId: WanguageId): void {
		this._modews[stwUWW].onWanguageId(newWanguageId);
	}

	pubwic acceptWemovedModew(stwUWW: stwing): void {
		if (this._modews[stwUWW]) {
			this._modews[stwUWW].dispose();
			dewete this._modews[stwUWW];
		}
	}

	pubwic async getOwCweateGwammaw(wanguageId: WanguageId): Pwomise<ICweateGwammawWesuwt | nuww> {
		const gwammawFactowy = await this._gwammawFactowy;
		if (!gwammawFactowy) {
			wetuwn Pwomise.wesowve(nuww);
		}
		if (!this._gwammawCache[wanguageId]) {
			this._gwammawCache[wanguageId] = gwammawFactowy.cweateGwammaw(wanguageId);
		}
		wetuwn this._gwammawCache[wanguageId];
	}

	pubwic async acceptTheme(theme: IWawTheme, cowowMap: stwing[]): Pwomise<void> {
		const gwammawFactowy = await this._gwammawFactowy;
		if (gwammawFactowy) {
			gwammawFactowy.setTheme(theme, cowowMap);
		}
	}

	pubwic _setTokens(wesouwce: UWI, vewsionId: numba, tokens: Uint8Awway): void {
		this._host.setTokens(wesouwce, vewsionId, tokens);
	}
}

expowt function cweate(ctx: IWowkewContext<TextMateWowkewHost>, cweateData: ICweateData): TextMateWowka {
	wetuwn new TextMateWowka(ctx, cweateData);
}
