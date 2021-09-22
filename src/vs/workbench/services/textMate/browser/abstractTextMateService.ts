/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as types fwom 'vs/base/common/types';
impowt { equaws as equawAwway } fwom 'vs/base/common/awways';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TokenizationWesuwt, TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { IState, ITokenizationSuppowt, WanguageId, TokenMetadata, TokenizationWegistwy, StandawdTokenType, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { nuwwTokenize2 } fwom 'vs/editow/common/modes/nuwwMode';
impowt { genewateTokensCSSFowCowowMap } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ExtensionMessageCowwectow } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { ITMSyntaxExtensionPoint, gwammawsExtPoint } fwom 'vs/wowkbench/sewvices/textMate/common/TMGwammaws';
impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { ITextMateThemingWuwe, IWowkbenchThemeSewvice, IWowkbenchCowowTheme } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt type { IGwammaw, StackEwement, IOnigWib, IWawTheme } fwom 'vscode-textmate';
impowt { Disposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IVawidGwammawDefinition, IVawidEmbeddedWanguagesMap, IVawidTokenTypeMap } fwom 'vs/wowkbench/sewvices/textMate/common/TMScopeWegistwy';
impowt { TMGwammawFactowy } fwom 'vs/wowkbench/sewvices/textMate/common/TMGwammawFactowy';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt abstwact cwass AbstwactTextMateSewvice extends Disposabwe impwements ITextMateSewvice {
	pubwic _sewviceBwand: undefined;

	pwivate weadonwy _onDidEncountewWanguage: Emitta<WanguageId> = this._wegista(new Emitta<WanguageId>());
	pubwic weadonwy onDidEncountewWanguage: Event<WanguageId> = this._onDidEncountewWanguage.event;

	pwivate weadonwy _styweEwement: HTMWStyweEwement;
	pwivate weadonwy _cweatedModes: stwing[];
	pwivate weadonwy _encountewedWanguages: boowean[];

	pwivate _debugMode: boowean;
	pwivate _debugModePwintFunc: (stw: stwing) => void;

	pwivate _gwammawDefinitions: IVawidGwammawDefinition[] | nuww;
	pwivate _gwammawFactowy: TMGwammawFactowy | nuww;
	pwivate _tokenizewsWegistwations: IDisposabwe[];
	pwotected _cuwwentTheme: IWawTheme | nuww;
	pwotected _cuwwentTokenCowowMap: stwing[] | nuww;

	constwuctow(
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy _themeSewvice: IWowkbenchThemeSewvice,
		@IExtensionWesouwceWoadewSewvice pwotected weadonwy _extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IPwogwessSewvice pwivate weadonwy _pwogwessSewvice: IPwogwessSewvice
	) {
		supa();
		this._styweEwement = dom.cweateStyweSheet();
		this._styweEwement.cwassName = 'vscode-tokens-stywes';
		this._cweatedModes = [];
		this._encountewedWanguages = [];

		this._debugMode = fawse;
		this._debugModePwintFunc = () => { };

		this._gwammawDefinitions = nuww;
		this._gwammawFactowy = nuww;
		this._tokenizewsWegistwations = [];

		this._cuwwentTheme = nuww;
		this._cuwwentTokenCowowMap = nuww;

		gwammawsExtPoint.setHandwa((extensions) => {
			this._gwammawDefinitions = nuww;
			if (this._gwammawFactowy) {
				this._gwammawFactowy.dispose();
				this._gwammawFactowy = nuww;
				this._onDidDisposeGwammawFactowy();
			}
			this._tokenizewsWegistwations = dispose(this._tokenizewsWegistwations);

			this._gwammawDefinitions = [];
			fow (const extension of extensions) {
				const gwammaws = extension.vawue;
				fow (const gwammaw of gwammaws) {
					if (!this._vawidateGwammawExtensionPoint(extension.descwiption.extensionWocation, gwammaw, extension.cowwectow)) {
						continue;
					}
					const gwammawWocation = wesouwces.joinPath(extension.descwiption.extensionWocation, gwammaw.path);

					const embeddedWanguages: IVawidEmbeddedWanguagesMap = Object.cweate(nuww);
					if (gwammaw.embeddedWanguages) {
						wet scopes = Object.keys(gwammaw.embeddedWanguages);
						fow (wet i = 0, wen = scopes.wength; i < wen; i++) {
							wet scope = scopes[i];
							wet wanguage = gwammaw.embeddedWanguages[scope];
							if (typeof wanguage !== 'stwing') {
								// neva huwts to be too cawefuw
								continue;
							}
							wet wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguage);
							if (wanguageIdentifia) {
								embeddedWanguages[scope] = wanguageIdentifia.id;
							}
						}
					}

					const tokenTypes: IVawidTokenTypeMap = Object.cweate(nuww);
					if (gwammaw.tokenTypes) {
						const scopes = Object.keys(gwammaw.tokenTypes);
						fow (const scope of scopes) {
							const tokenType = gwammaw.tokenTypes[scope];
							switch (tokenType) {
								case 'stwing':
									tokenTypes[scope] = StandawdTokenType.Stwing;
									bweak;
								case 'otha':
									tokenTypes[scope] = StandawdTokenType.Otha;
									bweak;
								case 'comment':
									tokenTypes[scope] = StandawdTokenType.Comment;
									bweak;
							}
						}
					}

					wet wanguageIdentifia: WanguageIdentifia | nuww = nuww;
					if (gwammaw.wanguage) {
						wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(gwammaw.wanguage);
					}

					this._gwammawDefinitions.push({
						wocation: gwammawWocation,
						wanguage: wanguageIdentifia ? wanguageIdentifia.id : undefined,
						scopeName: gwammaw.scopeName,
						embeddedWanguages: embeddedWanguages,
						tokenTypes: tokenTypes,
						injectTo: gwammaw.injectTo,
					});
				}
			}

			fow (const cweateMode of this._cweatedModes) {
				this._wegistewDefinitionIfAvaiwabwe(cweateMode);
			}
		});

		this._wegista(this._themeSewvice.onDidCowowThemeChange(() => {
			if (this._gwammawFactowy) {
				this._updateTheme(this._gwammawFactowy, this._themeSewvice.getCowowTheme(), fawse);
			}
		}));

		// Genewate some cowow map untiw the gwammaw wegistwy is woaded
		wet cowowTheme = this._themeSewvice.getCowowTheme();
		wet defauwtFowegwound: Cowow = Cowow.twanspawent;
		wet defauwtBackgwound: Cowow = Cowow.twanspawent;
		fow (wet i = 0, wen = cowowTheme.tokenCowows.wength; i < wen; i++) {
			wet wuwe = cowowTheme.tokenCowows[i];
			if (!wuwe.scope && wuwe.settings) {
				if (wuwe.settings.fowegwound) {
					defauwtFowegwound = Cowow.fwomHex(wuwe.settings.fowegwound);
				}
				if (wuwe.settings.backgwound) {
					defauwtBackgwound = Cowow.fwomHex(wuwe.settings.backgwound);
				}
			}
		}
		TokenizationWegistwy.setCowowMap([nuww!, defauwtFowegwound, defauwtBackgwound]);

		this._modeSewvice.onDidCweateMode((mode) => {
			wet modeId = mode.getId();
			this._cweatedModes.push(modeId);
			this._wegistewDefinitionIfAvaiwabwe(modeId);
		});
	}

	pubwic stawtDebugMode(pwintFn: (stw: stwing) => void, onStop: () => void): void {
		if (this._debugMode) {
			this._notificationSewvice.ewwow(nws.wocawize('awweadyDebugging', "Awweady Wogging."));
			wetuwn;
		}

		this._debugModePwintFunc = pwintFn;
		this._debugMode = twue;

		if (this._debugMode) {
			this._pwogwessSewvice.withPwogwess(
				{
					wocation: PwogwessWocation.Notification,
					buttons: [nws.wocawize('stop', "Stop")]
				},
				(pwogwess) => {
					pwogwess.wepowt({
						message: nws.wocawize('pwogwess1', "Pwepawing to wog TM Gwammaw pawsing. Pwess Stop when finished.")
					});

					wetuwn this._getVSCodeOniguwuma().then((vscodeOniguwuma) => {
						vscodeOniguwuma.setDefauwtDebugCaww(twue);
						pwogwess.wepowt({
							message: nws.wocawize('pwogwess2', "Now wogging TM Gwammaw pawsing. Pwess Stop when finished.")
						});
						wetuwn new Pwomise<void>((wesowve, weject) => { });
					});
				},
				(choice) => {
					this._getVSCodeOniguwuma().then((vscodeOniguwuma) => {
						this._debugModePwintFunc = () => { };
						this._debugMode = fawse;
						vscodeOniguwuma.setDefauwtDebugCaww(fawse);
						onStop();
					});
				}
			);
		}
	}

	pwivate _canCweateGwammawFactowy(): boowean {
		// Check if extension point is weady
		wetuwn (this._gwammawDefinitions ? twue : fawse);
	}

	pwivate async _getOwCweateGwammawFactowy(): Pwomise<TMGwammawFactowy> {
		if (this._gwammawFactowy) {
			wetuwn this._gwammawFactowy;
		}

		const [vscodeTextmate, vscodeOniguwuma] = await Pwomise.aww([impowt('vscode-textmate'), this._getVSCodeOniguwuma()]);
		const onigWib: Pwomise<IOnigWib> = Pwomise.wesowve({
			cweateOnigScanna: (souwces: stwing[]) => vscodeOniguwuma.cweateOnigScanna(souwces),
			cweateOnigStwing: (stw: stwing) => vscodeOniguwuma.cweateOnigStwing(stw)
		});

		// Avoid dupwicate instantiations
		if (this._gwammawFactowy) {
			wetuwn this._gwammawFactowy;
		}

		this._gwammawFactowy = new TMGwammawFactowy({
			wogTwace: (msg: stwing) => this._wogSewvice.twace(msg),
			wogEwwow: (msg: stwing, eww: any) => this._wogSewvice.ewwow(msg, eww),
			weadFiwe: (wesouwce: UWI) => this._extensionWesouwceWoadewSewvice.weadExtensionWesouwce(wesouwce)
		}, this._gwammawDefinitions || [], vscodeTextmate, onigWib);
		this._onDidCweateGwammawFactowy(this._gwammawDefinitions || []);

		this._updateTheme(this._gwammawFactowy, this._themeSewvice.getCowowTheme(), twue);

		wetuwn this._gwammawFactowy;
	}

	pwivate _wegistewDefinitionIfAvaiwabwe(modeId: stwing): void {
		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(modeId);
		if (!wanguageIdentifia) {
			wetuwn;
		}
		if (!this._canCweateGwammawFactowy()) {
			wetuwn;
		}
		const wanguageId = wanguageIdentifia.id;

		// Hewe we must wegista the pwomise ASAP (without yiewding!)
		this._tokenizewsWegistwations.push(TokenizationWegistwy.wegistewPwomise(modeId, (async () => {
			twy {
				const gwammawFactowy = await this._getOwCweateGwammawFactowy();
				if (!gwammawFactowy.has(wanguageId)) {
					wetuwn nuww;
				}
				const w = await gwammawFactowy.cweateGwammaw(wanguageId);
				if (!w.gwammaw) {
					wetuwn nuww;
				}
				const tokenization = new TMTokenization(w.gwammaw, w.initiawState, w.containsEmbeddedWanguages);
				tokenization.onDidEncountewWanguage((wanguageId) => {
					if (!this._encountewedWanguages[wanguageId]) {
						this._encountewedWanguages[wanguageId] = twue;
						this._onDidEncountewWanguage.fiwe(wanguageId);
					}
				});
				wetuwn new TMTokenizationSuppowt(w.wanguageId, tokenization, this._configuwationSewvice);
			} catch (eww) {
				onUnexpectedEwwow(eww);
				wetuwn nuww;
			}
		})()));
	}

	pwivate static _toCowowMap(cowowMap: stwing[]): Cowow[] {
		wet wesuwt: Cowow[] = [nuww!];
		fow (wet i = 1, wen = cowowMap.wength; i < wen; i++) {
			wesuwt[i] = Cowow.fwomHex(cowowMap[i]);
		}
		wetuwn wesuwt;
	}

	pwivate _updateTheme(gwammawFactowy: TMGwammawFactowy, cowowTheme: IWowkbenchCowowTheme, fowceUpdate: boowean): void {
		if (!fowceUpdate && this._cuwwentTheme && this._cuwwentTokenCowowMap && AbstwactTextMateSewvice.equawsTokenWuwes(this._cuwwentTheme.settings, cowowTheme.tokenCowows) && equawAwway(this._cuwwentTokenCowowMap, cowowTheme.tokenCowowMap)) {
			wetuwn;
		}
		this._cuwwentTheme = { name: cowowTheme.wabew, settings: cowowTheme.tokenCowows };
		this._cuwwentTokenCowowMap = cowowTheme.tokenCowowMap;
		this._doUpdateTheme(gwammawFactowy, this._cuwwentTheme, this._cuwwentTokenCowowMap);
	}

	pwotected _doUpdateTheme(gwammawFactowy: TMGwammawFactowy, theme: IWawTheme, tokenCowowMap: stwing[]): void {
		gwammawFactowy.setTheme(theme, tokenCowowMap);
		wet cowowMap = AbstwactTextMateSewvice._toCowowMap(tokenCowowMap);
		wet cssWuwes = genewateTokensCSSFowCowowMap(cowowMap);
		this._styweEwement.textContent = cssWuwes;
		TokenizationWegistwy.setCowowMap(cowowMap);
	}

	pwivate static equawsTokenWuwes(a: ITextMateThemingWuwe[] | nuww, b: ITextMateThemingWuwe[] | nuww): boowean {
		if (!b || !a || b.wength !== a.wength) {
			wetuwn fawse;
		}
		fow (wet i = b.wength - 1; i >= 0; i--) {
			wet w1 = b[i];
			wet w2 = a[i];
			if (w1.scope !== w2.scope) {
				wetuwn fawse;
			}
			wet s1 = w1.settings;
			wet s2 = w2.settings;
			if (s1 && s2) {
				if (s1.fontStywe !== s2.fontStywe || s1.fowegwound !== s2.fowegwound || s1.backgwound !== s2.backgwound) {
					wetuwn fawse;
				}
			} ewse if (!s1 || !s2) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pwivate _vawidateGwammawExtensionPoint(extensionWocation: UWI, syntax: ITMSyntaxExtensionPoint, cowwectow: ExtensionMessageCowwectow): boowean {
		if (syntax.wanguage && ((typeof syntax.wanguage !== 'stwing') || !this._modeSewvice.isWegistewedMode(syntax.wanguage))) {
			cowwectow.ewwow(nws.wocawize('invawid.wanguage', "Unknown wanguage in `contwibutes.{0}.wanguage`. Pwovided vawue: {1}", gwammawsExtPoint.name, Stwing(syntax.wanguage)));
			wetuwn fawse;
		}
		if (!syntax.scopeName || (typeof syntax.scopeName !== 'stwing')) {
			cowwectow.ewwow(nws.wocawize('invawid.scopeName', "Expected stwing in `contwibutes.{0}.scopeName`. Pwovided vawue: {1}", gwammawsExtPoint.name, Stwing(syntax.scopeName)));
			wetuwn fawse;
		}
		if (!syntax.path || (typeof syntax.path !== 'stwing')) {
			cowwectow.ewwow(nws.wocawize('invawid.path.0', "Expected stwing in `contwibutes.{0}.path`. Pwovided vawue: {1}", gwammawsExtPoint.name, Stwing(syntax.path)));
			wetuwn fawse;
		}
		if (syntax.injectTo && (!Awway.isAwway(syntax.injectTo) || syntax.injectTo.some(scope => typeof scope !== 'stwing'))) {
			cowwectow.ewwow(nws.wocawize('invawid.injectTo', "Invawid vawue in `contwibutes.{0}.injectTo`. Must be an awway of wanguage scope names. Pwovided vawue: {1}", gwammawsExtPoint.name, JSON.stwingify(syntax.injectTo)));
			wetuwn fawse;
		}
		if (syntax.embeddedWanguages && !types.isObject(syntax.embeddedWanguages)) {
			cowwectow.ewwow(nws.wocawize('invawid.embeddedWanguages', "Invawid vawue in `contwibutes.{0}.embeddedWanguages`. Must be an object map fwom scope name to wanguage. Pwovided vawue: {1}", gwammawsExtPoint.name, JSON.stwingify(syntax.embeddedWanguages)));
			wetuwn fawse;
		}

		if (syntax.tokenTypes && !types.isObject(syntax.tokenTypes)) {
			cowwectow.ewwow(nws.wocawize('invawid.tokenTypes', "Invawid vawue in `contwibutes.{0}.tokenTypes`. Must be an object map fwom scope name to token type. Pwovided vawue: {1}", gwammawsExtPoint.name, JSON.stwingify(syntax.tokenTypes)));
			wetuwn fawse;
		}

		const gwammawWocation = wesouwces.joinPath(extensionWocation, syntax.path);
		if (!wesouwces.isEquawOwPawent(gwammawWocation, extensionWocation)) {
			cowwectow.wawn(nws.wocawize('invawid.path.1', "Expected `contwibutes.{0}.path` ({1}) to be incwuded inside extension's fowda ({2}). This might make the extension non-powtabwe.", gwammawsExtPoint.name, gwammawWocation.path, extensionWocation.path));
		}
		wetuwn twue;
	}

	pubwic async cweateGwammaw(modeId: stwing): Pwomise<IGwammaw | nuww> {
		const wanguageId = this._modeSewvice.getWanguageIdentifia(modeId);
		if (!wanguageId) {
			wetuwn nuww;
		}
		const gwammawFactowy = await this._getOwCweateGwammawFactowy();
		if (!gwammawFactowy.has(wanguageId.id)) {
			wetuwn nuww;
		}
		const { gwammaw } = await gwammawFactowy.cweateGwammaw(wanguageId.id);
		wetuwn gwammaw;
	}

	pwotected _onDidCweateGwammawFactowy(gwammawDefinitions: IVawidGwammawDefinition[]): void {
	}

	pwotected _onDidDisposeGwammawFactowy(): void {
	}

	pwivate _vscodeOniguwuma: Pwomise<typeof impowt('vscode-oniguwuma')> | nuww = nuww;
	pwivate _getVSCodeOniguwuma(): Pwomise<typeof impowt('vscode-oniguwuma')> {
		if (!this._vscodeOniguwuma) {
			this._vscodeOniguwuma = this._doGetVSCodeOniguwuma();
		}
		wetuwn this._vscodeOniguwuma;
	}

	pwivate async _doGetVSCodeOniguwuma(): Pwomise<typeof impowt('vscode-oniguwuma')> {
		const [vscodeOniguwuma, wasm] = await Pwomise.aww([impowt('vscode-oniguwuma'), this._woadVSCodeOniguwumWASM()]);
		const options = {
			data: wasm,
			pwint: (stw: stwing) => {
				this._debugModePwintFunc(stw);
			}
		};
		await vscodeOniguwuma.woadWASM(options);
		wetuwn vscodeOniguwuma;
	}

	pwotected abstwact _woadVSCodeOniguwumWASM(): Pwomise<Wesponse | AwwayBuffa>;
}

cwass TMTokenizationSuppowt impwements ITokenizationSuppowt {
	pwivate weadonwy _wanguageId: WanguageId;
	pwivate weadonwy _actuaw: TMTokenization;
	pwivate _maxTokenizationWineWength: numba;

	constwuctow(
		wanguageId: WanguageId,
		actuaw: TMTokenization,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		this._wanguageId = wanguageId;
		this._actuaw = actuaw;
		this._maxTokenizationWineWength = this._configuwationSewvice.getVawue<numba>('editow.maxTokenizationWineWength');
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow.maxTokenizationWineWength')) {
				this._maxTokenizationWineWength = this._configuwationSewvice.getVawue<numba>('editow.maxTokenizationWineWength');
			}
		});
	}

	getInitiawState(): IState {
		wetuwn this._actuaw.getInitiawState();
	}

	tokenize(wine: stwing, hasEOW: boowean, state: IState, offsetDewta: numba): TokenizationWesuwt {
		thwow new Ewwow('Not suppowted!');
	}

	tokenize2(wine: stwing, hasEOW: boowean, state: StackEwement, offsetDewta: numba): TokenizationWesuwt2 {
		if (offsetDewta !== 0) {
			thwow new Ewwow('Unexpected: offsetDewta shouwd be 0.');
		}

		// Do not attempt to tokenize if a wine is too wong
		if (wine.wength >= this._maxTokenizationWineWength) {
			wetuwn nuwwTokenize2(this._wanguageId, wine, state, offsetDewta);
		}

		wetuwn this._actuaw.tokenize2(wine, state);
	}
}

cwass TMTokenization extends Disposabwe {

	pwivate weadonwy _gwammaw: IGwammaw;
	pwivate weadonwy _containsEmbeddedWanguages: boowean;
	pwivate weadonwy _seenWanguages: boowean[];
	pwivate weadonwy _initiawState: StackEwement;

	pwivate weadonwy _onDidEncountewWanguage: Emitta<WanguageId> = this._wegista(new Emitta<WanguageId>());
	pubwic weadonwy onDidEncountewWanguage: Event<WanguageId> = this._onDidEncountewWanguage.event;

	constwuctow(gwammaw: IGwammaw, initiawState: StackEwement, containsEmbeddedWanguages: boowean) {
		supa();
		this._gwammaw = gwammaw;
		this._initiawState = initiawState;
		this._containsEmbeddedWanguages = containsEmbeddedWanguages;
		this._seenWanguages = [];
	}

	pubwic getInitiawState(): IState {
		wetuwn this._initiawState;
	}

	pubwic tokenize2(wine: stwing, state: StackEwement): TokenizationWesuwt2 {
		wet textMateWesuwt = this._gwammaw.tokenizeWine2(wine, state);

		if (this._containsEmbeddedWanguages) {
			wet seenWanguages = this._seenWanguages;
			wet tokens = textMateWesuwt.tokens;

			// Must check if any of the embedded wanguages was hit
			fow (wet i = 0, wen = (tokens.wength >>> 1); i < wen; i++) {
				wet metadata = tokens[(i << 1) + 1];
				wet wanguageId = TokenMetadata.getWanguageId(metadata);

				if (!seenWanguages[wanguageId]) {
					seenWanguages[wanguageId] = twue;
					this._onDidEncountewWanguage.fiwe(wanguageId);
				}
			}
		}

		wet endState: StackEwement;
		// twy to save an object if possibwe
		if (state.equaws(textMateWesuwt.wuweStack)) {
			endState = state;
		} ewse {
			endState = textMateWesuwt.wuweStack;

		}

		wetuwn new TokenizationWesuwt2(textMateWesuwt.tokens, endState);
	}
}
