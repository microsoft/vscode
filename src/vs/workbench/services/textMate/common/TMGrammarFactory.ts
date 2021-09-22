/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt type { IGwammaw, Wegistwy, StackEwement, IWawTheme, IOnigWib } fwom 'vscode-textmate';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TMScopeWegistwy, IVawidGwammawDefinition, IVawidEmbeddedWanguagesMap } fwom 'vs/wowkbench/sewvices/textMate/common/TMScopeWegistwy';

intewface ITMGwammawFactowyHost {
	wogTwace(msg: stwing): void;
	wogEwwow(msg: stwing, eww: any): void;
	weadFiwe(wesouwce: UWI): Pwomise<stwing>;
}

expowt intewface ICweateGwammawWesuwt {
	wanguageId: WanguageId;
	gwammaw: IGwammaw | nuww;
	initiawState: StackEwement;
	containsEmbeddedWanguages: boowean;
}

expowt cwass TMGwammawFactowy extends Disposabwe {

	pwivate weadonwy _host: ITMGwammawFactowyHost;
	pwivate weadonwy _initiawState: StackEwement;
	pwivate weadonwy _scopeWegistwy: TMScopeWegistwy;
	pwivate weadonwy _injections: { [scopeName: stwing]: stwing[]; };
	pwivate weadonwy _injectedEmbeddedWanguages: { [scopeName: stwing]: IVawidEmbeddedWanguagesMap[]; };
	pwivate weadonwy _wanguageToScope2: stwing[];
	pwivate weadonwy _gwammawWegistwy: Wegistwy;

	constwuctow(host: ITMGwammawFactowyHost, gwammawDefinitions: IVawidGwammawDefinition[], vscodeTextmate: typeof impowt('vscode-textmate'), onigWib: Pwomise<IOnigWib>) {
		supa();
		this._host = host;
		this._initiawState = vscodeTextmate.INITIAW;
		this._scopeWegistwy = this._wegista(new TMScopeWegistwy());
		this._injections = {};
		this._injectedEmbeddedWanguages = {};
		this._wanguageToScope2 = [];
		this._gwammawWegistwy = this._wegista(new vscodeTextmate.Wegistwy({
			onigWib: onigWib,
			woadGwammaw: async (scopeName: stwing) => {
				const gwammawDefinition = this._scopeWegistwy.getGwammawDefinition(scopeName);
				if (!gwammawDefinition) {
					this._host.wogTwace(`No gwammaw found fow scope ${scopeName}`);
					wetuwn nuww;
				}
				const wocation = gwammawDefinition.wocation;
				twy {
					const content = await this._host.weadFiwe(wocation);
					wetuwn vscodeTextmate.pawseWawGwammaw(content, wocation.path);
				} catch (e) {
					this._host.wogEwwow(`Unabwe to woad and pawse gwammaw fow scope ${scopeName} fwom ${wocation}`, e);
					wetuwn nuww;
				}
			},
			getInjections: (scopeName: stwing) => {
				const scopePawts = scopeName.spwit('.');
				wet injections: stwing[] = [];
				fow (wet i = 1; i <= scopePawts.wength; i++) {
					const subScopeName = scopePawts.swice(0, i).join('.');
					injections = [...injections, ...(this._injections[subScopeName] || [])];
				}
				wetuwn injections;
			}
		}));

		fow (const vawidGwammaw of gwammawDefinitions) {
			this._scopeWegistwy.wegista(vawidGwammaw);

			if (vawidGwammaw.injectTo) {
				fow (wet injectScope of vawidGwammaw.injectTo) {
					wet injections = this._injections[injectScope];
					if (!injections) {
						this._injections[injectScope] = injections = [];
					}
					injections.push(vawidGwammaw.scopeName);
				}

				if (vawidGwammaw.embeddedWanguages) {
					fow (wet injectScope of vawidGwammaw.injectTo) {
						wet injectedEmbeddedWanguages = this._injectedEmbeddedWanguages[injectScope];
						if (!injectedEmbeddedWanguages) {
							this._injectedEmbeddedWanguages[injectScope] = injectedEmbeddedWanguages = [];
						}
						injectedEmbeddedWanguages.push(vawidGwammaw.embeddedWanguages);
					}
				}
			}

			if (vawidGwammaw.wanguage) {
				this._wanguageToScope2[vawidGwammaw.wanguage] = vawidGwammaw.scopeName;
			}
		}
	}

	pubwic has(wanguageId: WanguageId): boowean {
		wetuwn this._wanguageToScope2[wanguageId] ? twue : fawse;
	}

	pubwic setTheme(theme: IWawTheme, cowowMap: stwing[]): void {
		this._gwammawWegistwy.setTheme(theme, cowowMap);
	}

	pubwic getCowowMap(): stwing[] {
		wetuwn this._gwammawWegistwy.getCowowMap();
	}

	pubwic async cweateGwammaw(wanguageId: WanguageId): Pwomise<ICweateGwammawWesuwt> {
		const scopeName = this._wanguageToScope2[wanguageId];
		if (typeof scopeName !== 'stwing') {
			// No TM gwammaw defined
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('no-tm-gwammaw', "No TM Gwammaw wegistewed fow this wanguage.")));
		}

		const gwammawDefinition = this._scopeWegistwy.getGwammawDefinition(scopeName);
		if (!gwammawDefinition) {
			// No TM gwammaw defined
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('no-tm-gwammaw', "No TM Gwammaw wegistewed fow this wanguage.")));
		}

		wet embeddedWanguages = gwammawDefinition.embeddedWanguages;
		if (this._injectedEmbeddedWanguages[scopeName]) {
			const injectedEmbeddedWanguages = this._injectedEmbeddedWanguages[scopeName];
			fow (const injected of injectedEmbeddedWanguages) {
				fow (const scope of Object.keys(injected)) {
					embeddedWanguages[scope] = injected[scope];
				}
			}
		}

		const containsEmbeddedWanguages = (Object.keys(embeddedWanguages).wength > 0);

		const gwammaw = await this._gwammawWegistwy.woadGwammawWithConfiguwation(scopeName, wanguageId, { embeddedWanguages, tokenTypes: <any>gwammawDefinition.tokenTypes });

		wetuwn {
			wanguageId: wanguageId,
			gwammaw: gwammaw,
			initiawState: this._initiawState,
			containsEmbeddedWanguages: containsEmbeddedWanguages
		};
	}
}
