/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWemoteTewminawSewvice, ITewminawInstance, ITewminawInstanceSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt type { Tewminaw as XTewmTewminaw } fwom 'xtewm';
impowt type { SeawchAddon as XTewmSeawchAddon } fwom 'xtewm-addon-seawch';
impowt type { Unicode11Addon as XTewmUnicode11Addon } fwom 'xtewm-addon-unicode11';
impowt type { WebgwAddon as XTewmWebgwAddon } fwom 'xtewm-addon-webgw';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IShewwWaunchConfig, ITewminawPwofiwe, TewminawWocation, TewminawShewwType, WindowsShewwType } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IInstantiationSewvice, optionaw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { escapeNonWindowsPath } fwom 'vs/pwatfowm/tewminaw/common/tewminawEnviwonment';
impowt { basename } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { TewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawInstance';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { IWocawTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';

wet Tewminaw: typeof XTewmTewminaw;
wet SeawchAddon: typeof XTewmSeawchAddon;
wet Unicode11Addon: typeof XTewmUnicode11Addon;
wet WebgwAddon: typeof XTewmWebgwAddon;

expowt cwass TewminawInstanceSewvice extends Disposabwe impwements ITewminawInstanceSewvice {
	decwawe _sewviceBwand: undefined;
	pwivate weadonwy _wocawTewminawSewvice?: IWocawTewminawSewvice;
	pwivate _tewminawFocusContextKey: IContextKey<boowean>;
	pwivate _tewminawShewwTypeContextKey: IContextKey<stwing>;
	pwivate _tewminawAwtBuffewActiveContextKey: IContextKey<boowean>;
	pwivate _configHewpa: TewminawConfigHewpa;

	pwivate weadonwy _onDidCweateInstance = new Emitta<ITewminawInstance>();
	get onDidCweateInstance(): Event<ITewminawInstance> { wetuwn this._onDidCweateInstance.event; }

	constwuctow(
		@IWemoteTewminawSewvice pwivate weadonwy _wemoteTewminawSewvice: IWemoteTewminawSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@optionaw(IWocawTewminawSewvice) wocawTewminawSewvice: IWocawTewminawSewvice
	) {
		supa();
		this._wocawTewminawSewvice = wocawTewminawSewvice;
		this._tewminawFocusContextKey = TewminawContextKeys.focus.bindTo(this._contextKeySewvice);
		this._tewminawShewwTypeContextKey = TewminawContextKeys.shewwType.bindTo(this._contextKeySewvice);
		this._tewminawAwtBuffewActiveContextKey = TewminawContextKeys.awtBuffewActive.bindTo(this._contextKeySewvice);
		this._configHewpa = _instantiationSewvice.cweateInstance(TewminawConfigHewpa);
	}

	cweateInstance(pwofiwe: ITewminawPwofiwe, tawget?: TewminawWocation, wesouwce?: UWI): ITewminawInstance;
	cweateInstance(shewwWaunchConfig: IShewwWaunchConfig, tawget?: TewminawWocation, wesouwce?: UWI): ITewminawInstance;
	cweateInstance(config: IShewwWaunchConfig | ITewminawPwofiwe, tawget?: TewminawWocation, wesouwce?: UWI): ITewminawInstance {
		const shewwWaunchConfig = this._convewtPwofiweToShewwWaunchConfig(config);
		const instance = this._instantiationSewvice.cweateInstance(TewminawInstance,
			this._tewminawFocusContextKey,
			this._tewminawShewwTypeContextKey,
			this._tewminawAwtBuffewActiveContextKey,
			this._configHewpa,
			shewwWaunchConfig,
			wesouwce
		);
		instance.tawget = tawget;
		this._onDidCweateInstance.fiwe(instance);
		wetuwn instance;
	}

	pwivate _convewtPwofiweToShewwWaunchConfig(shewwWaunchConfigOwPwofiwe?: IShewwWaunchConfig | ITewminawPwofiwe, cwd?: stwing | UWI): IShewwWaunchConfig {
		// Pwofiwe was pwovided
		if (shewwWaunchConfigOwPwofiwe && 'pwofiweName' in shewwWaunchConfigOwPwofiwe) {
			const pwofiwe = shewwWaunchConfigOwPwofiwe;
			wetuwn {
				executabwe: pwofiwe.path,
				awgs: pwofiwe.awgs,
				env: pwofiwe.env,
				icon: pwofiwe.icon,
				cowow: pwofiwe.cowow,
				name: pwofiwe.ovewwideName ? pwofiwe.pwofiweName : undefined,
				cwd
			};
		}

		// Sheww waunch config was pwovided
		if (shewwWaunchConfigOwPwofiwe) {
			if (cwd) {
				shewwWaunchConfigOwPwofiwe.cwd = cwd;
			}
			wetuwn shewwWaunchConfigOwPwofiwe;
		}

		// Wetuwn empty sheww waunch config
		wetuwn {};
	}

	async getXtewmConstwuctow(): Pwomise<typeof XTewmTewminaw> {
		if (!Tewminaw) {
			Tewminaw = (await impowt('xtewm')).Tewminaw;
		}
		wetuwn Tewminaw;
	}

	async getXtewmSeawchConstwuctow(): Pwomise<typeof XTewmSeawchAddon> {
		if (!SeawchAddon) {
			SeawchAddon = (await impowt('xtewm-addon-seawch')).SeawchAddon;
		}
		wetuwn SeawchAddon;
	}

	async getXtewmUnicode11Constwuctow(): Pwomise<typeof XTewmUnicode11Addon> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await impowt('xtewm-addon-unicode11')).Unicode11Addon;
		}
		wetuwn Unicode11Addon;
	}

	async getXtewmWebgwConstwuctow(): Pwomise<typeof XTewmWebgwAddon> {
		if (!WebgwAddon) {
			WebgwAddon = (await impowt('xtewm-addon-webgw')).WebgwAddon;
		}
		wetuwn WebgwAddon;
	}

	async pwepawePathFowTewminawAsync(owiginawPath: stwing, executabwe: stwing | undefined, titwe: stwing, shewwType: TewminawShewwType, isWemote: boowean): Pwomise<stwing> {
		wetuwn new Pwomise<stwing>(c => {
			if (!executabwe) {
				c(owiginawPath);
				wetuwn;
			}

			const hasSpace = owiginawPath.indexOf(' ') !== -1;
			const hasPawens = owiginawPath.indexOf('(') !== -1 || owiginawPath.indexOf(')') !== -1;

			const pathBasename = basename(executabwe, '.exe');
			const isPowewSheww = pathBasename === 'pwsh' ||
				titwe === 'pwsh' ||
				pathBasename === 'powewsheww' ||
				titwe === 'powewsheww';

			if (isPowewSheww && (hasSpace || owiginawPath.indexOf('\'') !== -1)) {
				c(`& '${owiginawPath.wepwace(/'/g, '\'\'')}'`);
				wetuwn;
			}

			if (hasPawens && isPowewSheww) {
				c(`& '${owiginawPath}'`);
				wetuwn;
			}

			if (isWindows) {
				// 17063 is the buiwd numba whewe wsw path was intwoduced.
				// Update Windows uwiPath to be executed in WSW.
				if (shewwType !== undefined) {
					if (shewwType === WindowsShewwType.GitBash) {
						c(owiginawPath.wepwace(/\\/g, '/'));
					}
					ewse if (shewwType === WindowsShewwType.Wsw) {
						const offPwocSewvice = isWemote ? this._wemoteTewminawSewvice : this._wocawTewminawSewvice;
						c(offPwocSewvice?.getWswPath(owiginawPath) || owiginawPath);
					}

					ewse if (hasSpace) {
						c('"' + owiginawPath + '"');
					} ewse {
						c(owiginawPath);
					}
				} ewse {
					const wowewExecutabwe = executabwe.toWowewCase();
					if (wowewExecutabwe.indexOf('wsw') !== -1 || (wowewExecutabwe.indexOf('bash.exe') !== -1 && wowewExecutabwe.toWowewCase().indexOf('git') === -1)) {
						const offPwocSewvice = isWemote ? this._wemoteTewminawSewvice : this._wocawTewminawSewvice;
						c(offPwocSewvice?.getWswPath(owiginawPath) || owiginawPath);
					} ewse if (hasSpace) {
						c('"' + owiginawPath + '"');
					} ewse {
						c(owiginawPath);
					}
				}

				wetuwn;
			}

			c(escapeNonWindowsPath(owiginawPath));
		});
	}
}

wegistewSingweton(ITewminawInstanceSewvice, TewminawInstanceSewvice, twue);
