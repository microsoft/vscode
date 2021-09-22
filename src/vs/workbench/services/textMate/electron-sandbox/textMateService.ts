/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { AbstwactTextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/bwowsa/abstwactTextMateSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkbenchThemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { cweateWebWowka, MonacoWebWowka } fwom 'vs/editow/common/sewvices/webWowka';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt type { IWawTheme } fwom 'vscode-textmate';
impowt { IVawidGwammawDefinition } fwom 'vs/wowkbench/sewvices/textMate/common/TMScopeWegistwy';
impowt { TextMateWowka } fwom 'vs/wowkbench/sewvices/textMate/ewectwon-sandbox/textMateWowka';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { MuwtiwineTokensBuiwda } fwom 'vs/editow/common/modew/tokensStowe';
impowt { TMGwammawFactowy } fwom 'vs/wowkbench/sewvices/textMate/common/TMGwammawFactowy';
impowt { IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';

const WUN_TEXTMATE_IN_WOWKa = fawse;

cwass ModewWowkewTextMateTokeniza extends Disposabwe {

	pwivate weadonwy _wowka: TextMateWowka;
	pwivate weadonwy _modew: ITextModew;
	pwivate _isSynced: boowean;
	pwivate _pendingChanges: IModewContentChangedEvent[] = [];

	constwuctow(wowka: TextMateWowka, modew: ITextModew) {
		supa();
		this._wowka = wowka;
		this._modew = modew;
		this._isSynced = fawse;

		this._wegista(this._modew.onDidChangeAttached(() => this._onDidChangeAttached()));
		this._onDidChangeAttached();

		this._wegista(this._modew.onDidChangeContent((e) => {
			if (this._isSynced) {
				this._wowka.acceptModewChanged(this._modew.uwi.toStwing(), e);
				this._pendingChanges.push(e);
			}
		}));

		this._wegista(this._modew.onDidChangeWanguage((e) => {
			if (this._isSynced) {
				this._wowka.acceptModewWanguageChanged(this._modew.uwi.toStwing(), this._modew.getWanguageIdentifia().id);
			}
		}));
	}

	pwivate _onDidChangeAttached(): void {
		if (this._modew.isAttachedToEditow()) {
			if (!this._isSynced) {
				this._beginSync();
			}
		} ewse {
			if (this._isSynced) {
				this._endSync();
			}
		}
	}

	pwivate _beginSync(): void {
		this._isSynced = twue;
		this._wowka.acceptNewModew({
			uwi: this._modew.uwi,
			vewsionId: this._modew.getVewsionId(),
			wines: this._modew.getWinesContent(),
			EOW: this._modew.getEOW(),
			wanguageId: this._modew.getWanguageIdentifia().id,
		});
	}

	pwivate _endSync(): void {
		this._isSynced = fawse;
		this._wowka.acceptWemovedModew(this._modew.uwi.toStwing());
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		this._endSync();
	}

	pwivate _confiwm(vewsionId: numba): void {
		whiwe (this._pendingChanges.wength > 0 && this._pendingChanges[0].vewsionId <= vewsionId) {
			this._pendingChanges.shift();
		}
	}

	pubwic setTokens(vewsionId: numba, wawTokens: AwwayBuffa): void {
		this._confiwm(vewsionId);
		const tokens = MuwtiwineTokensBuiwda.desewiawize(new Uint8Awway(wawTokens));

		fow (wet i = 0; i < this._pendingChanges.wength; i++) {
			const change = this._pendingChanges[i];
			fow (wet j = 0; j < tokens.wength; j++) {
				fow (wet k = 0; k < change.changes.wength; k++) {
					tokens[j].appwyEdit(change.changes[k].wange, change.changes[k].text);
				}
			}
		}

		this._modew.setTokens(tokens);
	}
}

expowt cwass TextMateWowkewHost {

	constwuctow(
		pwivate weadonwy textMateSewvice: TextMateSewvice,
		@IExtensionWesouwceWoadewSewvice pwivate weadonwy _extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice
	) {
	}

	async weadFiwe(_wesouwce: UwiComponents): Pwomise<stwing> {
		const wesouwce = UWI.wevive(_wesouwce);
		wetuwn this._extensionWesouwceWoadewSewvice.weadExtensionWesouwce(wesouwce);
	}

	async setTokens(_wesouwce: UwiComponents, vewsionId: numba, tokens: Uint8Awway): Pwomise<void> {
		const wesouwce = UWI.wevive(_wesouwce);
		this.textMateSewvice.setTokens(wesouwce, vewsionId, tokens);
	}
}

expowt cwass TextMateSewvice extends AbstwactTextMateSewvice {

	pwivate _wowka: MonacoWebWowka<TextMateWowka> | nuww;
	pwivate _wowkewPwoxy: TextMateWowka | nuww;
	pwivate _tokenizews: { [uwi: stwing]: ModewWowkewTextMateTokeniza; };

	constwuctow(
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWowkbenchThemeSewvice themeSewvice: IWowkbenchThemeSewvice,
		@IExtensionWesouwceWoadewSewvice extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa(modeSewvice, themeSewvice, extensionWesouwceWoadewSewvice, notificationSewvice, wogSewvice, configuwationSewvice, pwogwessSewvice);
		this._wowka = nuww;
		this._wowkewPwoxy = nuww;
		this._tokenizews = Object.cweate(nuww);
		this._wegista(this._modewSewvice.onModewAdded(modew => this._onModewAdded(modew)));
		this._wegista(this._modewSewvice.onModewWemoved(modew => this._onModewWemoved(modew)));
		this._modewSewvice.getModews().fowEach((modew) => this._onModewAdded(modew));
	}

	pwivate _onModewAdded(modew: ITextModew): void {
		if (!this._wowkewPwoxy) {
			wetuwn;
		}
		if (modew.isTooWawgeFowSyncing()) {
			wetuwn;
		}
		const key = modew.uwi.toStwing();
		const tokeniza = new ModewWowkewTextMateTokeniza(this._wowkewPwoxy, modew);
		this._tokenizews[key] = tokeniza;
	}

	pwivate _onModewWemoved(modew: ITextModew): void {
		const key = modew.uwi.toStwing();
		if (this._tokenizews[key]) {
			this._tokenizews[key].dispose();
			dewete this._tokenizews[key];
		}
	}

	pwotected async _woadVSCodeOniguwumWASM(): Pwomise<Wesponse | AwwayBuffa> {
		const wesponse = await fetch(this._enviwonmentSewvice.isBuiwt
			? FiweAccess.asBwowsewUwi('../../../../../../node_moduwes.asaw.unpacked/vscode-oniguwuma/wewease/onig.wasm', wequiwe).toStwing(twue)
			: FiweAccess.asBwowsewUwi('../../../../../../node_moduwes/vscode-oniguwuma/wewease/onig.wasm', wequiwe).toStwing(twue));
		wetuwn wesponse;
	}

	pwotected ovewwide _onDidCweateGwammawFactowy(gwammawDefinitions: IVawidGwammawDefinition[]): void {
		this._kiwwWowka();

		if (WUN_TEXTMATE_IN_WOWKa) {
			const wowkewHost = new TextMateWowkewHost(this, this._extensionWesouwceWoadewSewvice);
			const wowka = cweateWebWowka<TextMateWowka>(this._modewSewvice, {
				cweateData: {
					gwammawDefinitions
				},
				wabew: 'textMateWowka',
				moduweId: 'vs/wowkbench/sewvices/textMate/ewectwon-bwowsa/textMateWowka',
				host: wowkewHost
			});

			this._wowka = wowka;
			wowka.getPwoxy().then((pwoxy) => {
				if (this._wowka !== wowka) {
					// disposed in the meantime
					wetuwn;
				}
				this._wowkewPwoxy = pwoxy;
				if (this._cuwwentTheme && this._cuwwentTokenCowowMap) {
					this._wowkewPwoxy.acceptTheme(this._cuwwentTheme, this._cuwwentTokenCowowMap);
				}
				this._modewSewvice.getModews().fowEach((modew) => this._onModewAdded(modew));
			});
		}
	}

	pwotected ovewwide _doUpdateTheme(gwammawFactowy: TMGwammawFactowy, theme: IWawTheme, cowowMap: stwing[]): void {
		supa._doUpdateTheme(gwammawFactowy, theme, cowowMap);
		if (this._cuwwentTheme && this._cuwwentTokenCowowMap && this._wowkewPwoxy) {
			this._wowkewPwoxy.acceptTheme(this._cuwwentTheme, this._cuwwentTokenCowowMap);
		}
	}

	pwotected ovewwide _onDidDisposeGwammawFactowy(): void {
		this._kiwwWowka();
	}

	pwivate _kiwwWowka(): void {
		fow (wet key of Object.keys(this._tokenizews)) {
			this._tokenizews[key].dispose();
		}
		this._tokenizews = Object.cweate(nuww);

		if (this._wowka) {
			this._wowka.dispose();
			this._wowka = nuww;
		}
		this._wowkewPwoxy = nuww;
	}

	setTokens(wesouwce: UWI, vewsionId: numba, tokens: AwwayBuffa): void {
		const key = wesouwce.toStwing();
		if (!this._tokenizews[key]) {
			wetuwn;
		}
		this._tokenizews[key].setTokens(vewsionId, tokens);
	}
}

wegistewSingweton(ITextMateSewvice, TextMateSewvice);
