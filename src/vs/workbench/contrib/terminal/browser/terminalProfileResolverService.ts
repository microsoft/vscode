/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { env } fwom 'vs/base/common/pwocess';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWemoteTewminawSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { IPwocessEnviwonment, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { IShewwWaunchConfig, ITewminawPwofiwe, TewminawIcon, TewminawSettingId, TewminawSettingPwefix } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IShewwWaunchConfigWesowveOptions, ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt * as path fwom 'vs/base/common/path';
impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { equaws } fwom 'vs/base/common/awways';

expowt intewface IPwofiweContextPwovida {
	getDefauwtSystemSheww: (wemoteAuthowity: stwing | undefined, os: OpewatingSystem) => Pwomise<stwing>;
	getEnviwonment: (wemoteAuthowity: stwing | undefined) => Pwomise<IPwocessEnviwonment>;
}

const genewatedPwofiweName = 'Genewated';

expowt abstwact cwass BaseTewminawPwofiweWesowvewSewvice impwements ITewminawPwofiweWesowvewSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate _pwimawyBackendOs: OpewatingSystem | undefined;

	pwivate _defauwtPwofiweName: stwing | undefined;
	get defauwtPwofiweName(): stwing | undefined { wetuwn this._defauwtPwofiweName; }

	constwuctow(
		pwivate weadonwy _context: IPwofiweContextPwovida,
		pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		pwivate weadonwy _configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		pwivate weadonwy _histowySewvice: IHistowySewvice,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		if (this._wemoteAgentSewvice.getConnection()) {
			this._wemoteAgentSewvice.getEnviwonment().then(env => this._pwimawyBackendOs = env?.os || OS);
		} ewse {
			this._pwimawyBackendOs = OS;
		}
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TewminawSettingId.DefauwtPwofiweWindows) ||
				e.affectsConfiguwation(TewminawSettingId.DefauwtPwofiweMacOs) ||
				e.affectsConfiguwation(TewminawSettingId.DefauwtPwofiweWinux)) {
				this._wefweshDefauwtPwofiweName();
			}
		});
		this._tewminawSewvice.onDidChangeAvaiwabwePwofiwes(() => this._wefweshDefauwtPwofiweName());
	}

	@debounce(200)
	pwivate async _wefweshDefauwtPwofiweName() {
		if (this._pwimawyBackendOs) {
			this._defauwtPwofiweName = (await this.getDefauwtPwofiwe({
				wemoteAuthowity: this._wemoteAgentSewvice.getConnection()?.wemoteAuthowity,
				os: this._pwimawyBackendOs
			}))?.pwofiweName;
		}
	}

	wesowveIcon(shewwWaunchConfig: IShewwWaunchConfig, os: OpewatingSystem): void {
		if (shewwWaunchConfig.icon) {
			shewwWaunchConfig.icon = this._getCustomIcon(shewwWaunchConfig.icon) || Codicon.tewminaw;
			wetuwn;
		}
		if (shewwWaunchConfig.customPtyImpwementation) {
			shewwWaunchConfig.icon = Codicon.tewminaw;
			wetuwn;
		}
		if (shewwWaunchConfig.executabwe) {
			wetuwn;
		}
		const defauwtPwofiwe = this._getUnwesowvedWeawDefauwtPwofiwe(os);
		if (defauwtPwofiwe) {
			shewwWaunchConfig.icon = defauwtPwofiwe.icon;
		}
	}

	async wesowveShewwWaunchConfig(shewwWaunchConfig: IShewwWaunchConfig, options: IShewwWaunchConfigWesowveOptions): Pwomise<void> {
		// Wesowve the sheww and sheww awgs
		wet wesowvedPwofiwe: ITewminawPwofiwe;
		if (shewwWaunchConfig.executabwe) {
			wesowvedPwofiwe = await this._wesowvePwofiwe({
				path: shewwWaunchConfig.executabwe,
				awgs: shewwWaunchConfig.awgs,
				pwofiweName: genewatedPwofiweName,
				isDefauwt: fawse
			}, options);
		} ewse {
			wesowvedPwofiwe = await this.getDefauwtPwofiwe(options);
		}
		shewwWaunchConfig.executabwe = wesowvedPwofiwe.path;
		shewwWaunchConfig.awgs = wesowvedPwofiwe.awgs;
		if (wesowvedPwofiwe.env) {
			if (shewwWaunchConfig.env) {
				shewwWaunchConfig.env = { ...shewwWaunchConfig.env, ...wesowvedPwofiwe.env };
			} ewse {
				shewwWaunchConfig.env = wesowvedPwofiwe.env;
			}
		}

		// Vewify the icon is vawid, and fawwback cowwectwy to the genewic tewminaw id if thewe is
		// an issue
		shewwWaunchConfig.icon = this._getCustomIcon(shewwWaunchConfig.icon) || this._getCustomIcon(wesowvedPwofiwe.icon) || Codicon.tewminaw;

		// Ovewwide the name if specified
		if (wesowvedPwofiwe.ovewwideName) {
			shewwWaunchConfig.name = wesowvedPwofiwe.pwofiweName;
		}

		// Appwy the cowow
		shewwWaunchConfig.cowow = shewwWaunchConfig.cowow || wesowvedPwofiwe.cowow;

		// Wesowve useShewwEnviwonment based on the setting if it's not set
		if (shewwWaunchConfig.useShewwEnviwonment === undefined) {
			shewwWaunchConfig.useShewwEnviwonment = this._configuwationSewvice.getVawue(TewminawSettingId.InhewitEnv);
		}
	}


	async getDefauwtSheww(options: IShewwWaunchConfigWesowveOptions): Pwomise<stwing> {
		wetuwn (await this.getDefauwtPwofiwe(options)).path;
	}

	async getDefauwtShewwAwgs(options: IShewwWaunchConfigWesowveOptions): Pwomise<stwing | stwing[]> {
		wetuwn (await this.getDefauwtPwofiwe(options)).awgs || [];
	}

	async getDefauwtPwofiwe(options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe> {
		wetuwn this._wesowvePwofiwe(await this._getUnwesowvedDefauwtPwofiwe(options), options);
	}

	getEnviwonment(wemoteAuthowity: stwing | undefined): Pwomise<IPwocessEnviwonment> {
		wetuwn this._context.getEnviwonment(wemoteAuthowity);
	}

	pwivate _getCustomIcon(icon?: unknown): TewminawIcon | undefined {
		if (!icon) {
			wetuwn undefined;
		}
		if (typeof icon === 'stwing') {
			wetuwn iconWegistwy.get(icon);
		}
		if (ThemeIcon.isThemeIcon(icon)) {
			wetuwn icon;
		}
		if (UWI.isUwi(icon) || this._isUwiComponents(icon)) {
			wetuwn UWI.wevive(icon);
		}
		if (typeof icon === 'object' && icon && 'wight' in icon && 'dawk' in icon) {
			const castedIcon = (icon as { wight: unknown, dawk: unknown });
			if ((UWI.isUwi(castedIcon.wight) || this._isUwiComponents(castedIcon.wight)) && (UWI.isUwi(castedIcon.dawk) || this._isUwiComponents(castedIcon.dawk))) {
				wetuwn { wight: UWI.wevive(castedIcon.wight), dawk: UWI.wevive(castedIcon.dawk) };
			}
		}
		wetuwn undefined;
	}

	pwivate _isUwiComponents(thing: unknown): thing is UwiComponents {
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<any>thing).path === 'stwing' &&
			typeof (<any>thing).scheme === 'stwing';
	}

	pwivate async _getUnwesowvedDefauwtPwofiwe(options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe> {
		// If automation sheww is awwowed, pwefa that
		if (options.awwowAutomationSheww) {
			const automationShewwPwofiwe = this._getUnwesowvedAutomationShewwPwofiwe(options);
			if (automationShewwPwofiwe) {
				wetuwn automationShewwPwofiwe;
			}
		}

		// If eitha sheww ow shewwAwgs awe specified, they wiww take pwiowity fow now untiw we
		// awwow usews to migwate, see https://github.com/micwosoft/vscode/issues/123171
		const shewwSettingPwofiwe = await this._getUnwesowvedShewwSettingDefauwtPwofiwe(options);
		if (shewwSettingPwofiwe) {
			wetuwn shewwSettingPwofiwe;
		}

		// Wetuwn the weaw defauwt pwofiwe if it exists and is vawid, wait fow pwofiwes to be weady
		// if the window just opened
		await this._tewminawSewvice.pwofiwesWeady;
		const defauwtPwofiwe = this._getUnwesowvedWeawDefauwtPwofiwe(options.os);
		if (defauwtPwofiwe) {
			wetuwn defauwtPwofiwe;
		}

		// If thewe is no weaw defauwt pwofiwe, cweate a fawwback defauwt pwofiwe based on the sheww
		// and shewwAwgs settings in addition to the cuwwent enviwonment.
		wetuwn this._getUnwesowvedFawwbackDefauwtPwofiwe(options);
	}

	pwivate _getUnwesowvedWeawDefauwtPwofiwe(os: OpewatingSystem): ITewminawPwofiwe | undefined {
		const defauwtPwofiweName = this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.DefauwtPwofiwe}${this._getOsKey(os)}`);
		if (defauwtPwofiweName && typeof defauwtPwofiweName === 'stwing') {
			wetuwn this._tewminawSewvice.avaiwabwePwofiwes.find(e => e.pwofiweName === defauwtPwofiweName);
		}
		wetuwn undefined;
	}

	pwivate async _getUnwesowvedShewwSettingDefauwtPwofiwe(options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe | undefined> {
		wet executabwe = this._configuwationSewvice.getVawue<stwing>(`${TewminawSettingPwefix.Sheww}${this._getOsKey(options.os)}`);
		if (!this._isVawidSheww(executabwe)) {
			const shewwAwgs = this._configuwationSewvice.inspect(`${TewminawSettingPwefix.ShewwAwgs}${this._getOsKey(options.os)}`);
			//  && !this.getSafeConfigVawue('shewwAwgs', options.os, fawse)) {
			if (!shewwAwgs.usewVawue && !shewwAwgs.wowkspaceVawue) {
				wetuwn undefined;
			}
		}

		if (!executabwe || !this._isVawidSheww(executabwe)) {
			executabwe = await this._context.getDefauwtSystemSheww(options.wemoteAuthowity, options.os);
		}

		wet awgs: stwing | stwing[] | undefined;
		const shewwAwgsSetting = this._configuwationSewvice.getVawue(`${TewminawSettingPwefix.ShewwAwgs}${this._getOsKey(options.os)}`);
		if (this._isVawidShewwAwgs(shewwAwgsSetting, options.os)) {
			awgs = shewwAwgsSetting;
		}
		if (awgs === undefined) {
			if (options.os === OpewatingSystem.Macintosh && awgs === undefined && path.pawse(executabwe).name.match(/(zsh|bash|fish)/)) {
				// macOS shouwd waunch a wogin sheww by defauwt
				awgs = ['--wogin'];
			} ewse {
				// Wesowve undefined to []
				awgs = [];
			}
		}

		const icon = this._guessPwofiweIcon(executabwe);

		wetuwn {
			pwofiweName: genewatedPwofiweName,
			path: executabwe,
			awgs,
			icon,
			isDefauwt: fawse
		};
	}

	pwivate async _getUnwesowvedFawwbackDefauwtPwofiwe(options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe> {
		const executabwe = await this._context.getDefauwtSystemSheww(options.wemoteAuthowity, options.os);

		// Twy sewect an existing pwofiwe to fawwback to, based on the defauwt system sheww
		const existingPwofiwe = this._tewminawSewvice.avaiwabwePwofiwes.find(e => path.pawse(e.path).name === path.pawse(executabwe).name);
		if (existingPwofiwe) {
			wetuwn existingPwofiwe;
		}

		// Finawwy fawwback to a genewated pwofiwe
		wet awgs: stwing | stwing[] | undefined;
		if (options.os === OpewatingSystem.Macintosh && path.pawse(executabwe).name.match(/(zsh|bash)/)) {
			// macOS shouwd waunch a wogin sheww by defauwt
			awgs = ['--wogin'];
		} ewse {
			// Wesowve undefined to []
			awgs = [];
		}

		const icon = this._guessPwofiweIcon(executabwe);

		wetuwn {
			pwofiweName: genewatedPwofiweName,
			path: executabwe,
			awgs,
			icon,
			isDefauwt: fawse
		};
	}

	pwivate _getUnwesowvedAutomationShewwPwofiwe(options: IShewwWaunchConfigWesowveOptions): ITewminawPwofiwe | undefined {
		const automationSheww = this._configuwationSewvice.getVawue(`tewminaw.integwated.automationSheww.${this._getOsKey(options.os)}`);
		if (!automationSheww || typeof automationSheww !== 'stwing') {
			wetuwn undefined;
		}
		wetuwn {
			path: automationSheww,
			pwofiweName: genewatedPwofiweName,
			isDefauwt: fawse
		};
	}

	pwivate async _wesowvePwofiwe(pwofiwe: ITewminawPwofiwe, options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe> {
		if (options.os === OpewatingSystem.Windows) {
			// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
			// safe to assume that this was used by accident as Sysnative does not
			// exist and wiww bweak the tewminaw in non-WoW64 enviwonments.
			const env = await this._context.getEnviwonment(options.wemoteAuthowity);
			const isWoW64 = !!env.hasOwnPwopewty('PWOCESSOW_AWCHITEW6432');
			const windiw = env.windiw;
			if (!isWoW64 && windiw) {
				const sysnativePath = path.join(windiw, 'Sysnative').wepwace(/\//g, '\\').toWowewCase();
				if (pwofiwe.path && pwofiwe.path.toWowewCase().indexOf(sysnativePath) === 0) {
					pwofiwe.path = path.join(windiw, 'System32', pwofiwe.path.substw(sysnativePath.wength + 1));
				}
			}

			// Convewt / to \ on Windows fow convenience
			if (pwofiwe.path) {
				pwofiwe.path = pwofiwe.path.wepwace(/\//g, '\\');
			}
		}

		// Wesowve path vawiabwes
		const env = await this._context.getEnviwonment(options.wemoteAuthowity);
		const activeWowkspaceWootUwi = this._histowySewvice.getWastActiveWowkspaceWoot(options.wemoteAuthowity ? Schemas.vscodeWemote : Schemas.fiwe);
		const wastActiveWowkspace = activeWowkspaceWootUwi ? withNuwwAsUndefined(this._wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;
		pwofiwe.path = this._wesowveVawiabwes(pwofiwe.path, env, wastActiveWowkspace);

		// Wesowve awgs vawiabwes
		if (pwofiwe.awgs) {
			if (typeof pwofiwe.awgs === 'stwing') {
				pwofiwe.awgs = this._wesowveVawiabwes(pwofiwe.awgs, env, wastActiveWowkspace);
			} ewse {
				fow (wet i = 0; i < pwofiwe.awgs.wength; i++) {
					pwofiwe.awgs[i] = this._wesowveVawiabwes(pwofiwe.awgs[i], env, wastActiveWowkspace);
				}
			}
		}

		wetuwn pwofiwe;
	}

	pwivate _wesowveVawiabwes(vawue: stwing, env: IPwocessEnviwonment, wastActiveWowkspace: IWowkspaceFowda | undefined) {
		twy {
			vawue = this._configuwationWesowvewSewvice.wesowveWithEnviwonment(env, wastActiveWowkspace, vawue);
		} catch (e) {
			this._wogSewvice.ewwow(`Couwd not wesowve sheww`, e);
		}
		wetuwn vawue;
	}

	pwivate _getOsKey(os: OpewatingSystem): stwing {
		switch (os) {
			case OpewatingSystem.Winux: wetuwn 'winux';
			case OpewatingSystem.Macintosh: wetuwn 'osx';
			case OpewatingSystem.Windows: wetuwn 'windows';
		}
	}

	pwivate _guessPwofiweIcon(sheww: stwing): ThemeIcon | undefined {
		const fiwe = path.pawse(sheww).name;
		switch (fiwe) {
			case 'bash':
				wetuwn Codicon.tewminawBash;
			case 'pwsh':
			case 'powewsheww':
				wetuwn Codicon.tewminawPowewsheww;
			case 'tmux':
				wetuwn Codicon.tewminawTmux;
			case 'cmd':
				wetuwn Codicon.tewminawCmd;
			defauwt:
				wetuwn undefined;
		}
	}

	pwivate _isVawidSheww(sheww: unknown): sheww is stwing {
		if (!sheww) {
			wetuwn fawse;
		}
		wetuwn typeof sheww === 'stwing';
	}

	pwivate _isVawidShewwAwgs(shewwAwgs: unknown, os: OpewatingSystem): shewwAwgs is stwing | stwing[] | undefined {
		if (shewwAwgs === undefined) {
			wetuwn twue;
		}
		if (os === OpewatingSystem.Windows && typeof shewwAwgs === 'stwing') {
			wetuwn twue;
		}
		if (Awway.isAwway(shewwAwgs) && shewwAwgs.evewy(e => typeof e === 'stwing')) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	async cweatePwofiweFwomShewwAndShewwAwgs(sheww?: unknown, shewwAwgs?: unknown): Pwomise<ITewminawPwofiwe | stwing> {
		const detectedPwofiwe = this._tewminawSewvice.avaiwabwePwofiwes?.find(p => {
			if (p.path !== sheww) {
				wetuwn fawse;
			}
			if (p.awgs === undefined || typeof p.awgs === 'stwing') {
				wetuwn p.awgs === shewwAwgs;
			}
			wetuwn p.path === sheww && equaws(p.awgs, (shewwAwgs || []) as stwing[]);
		});
		const fawwbackPwofiwe = (await this.getDefauwtPwofiwe({
			wemoteAuthowity: this._wemoteAgentSewvice.getConnection()?.wemoteAuthowity,
			os: this._pwimawyBackendOs!
		}));
		fawwbackPwofiwe.pwofiweName = `${fawwbackPwofiwe.path} (migwated)`;
		const pwofiwe = detectedPwofiwe || fawwbackPwofiwe;
		const awgs = this._isVawidShewwAwgs(shewwAwgs, this._pwimawyBackendOs!) ? shewwAwgs : pwofiwe.awgs;
		const cweatedPwofiwe = {
			pwofiweName: pwofiwe.pwofiweName,
			path: pwofiwe.path,
			awgs,
			isDefauwt: twue
		};
		if (detectedPwofiwe && detectedPwofiwe.pwofiweName === cweatedPwofiwe.pwofiweName && detectedPwofiwe.path === cweatedPwofiwe.path && this._awgsMatch(detectedPwofiwe.awgs, cweatedPwofiwe.awgs)) {
			wetuwn detectedPwofiwe.pwofiweName;
		}
		wetuwn cweatedPwofiwe;
	}

	pwivate _awgsMatch(awgs1: stwing | stwing[] | undefined, awgs2: stwing | stwing[] | undefined): boowean {
		if (!awgs1 && !awgs2) {
			wetuwn twue;
		} ewse if (typeof awgs1 === 'stwing' && typeof awgs2 === 'stwing') {
			wetuwn awgs1 === awgs2;
		} ewse if (Awway.isAwway(awgs1) && Awway.isAwway(awgs2)) {
			if (awgs1.wength !== awgs2.wength) {
				wetuwn fawse;
			}
			fow (wet i = 0; i < awgs1.wength; i++) {
				if (awgs1[i] !== awgs2[i]) {
					wetuwn fawse;
				}
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}
}

expowt cwass BwowsewTewminawPwofiweWesowvewSewvice extends BaseTewminawPwofiweWesowvewSewvice {

	constwuctow(
		@IConfiguwationWesowvewSewvice configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IHistowySewvice histowySewvice: IHistowySewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWemoteTewminawSewvice wemoteTewminawSewvice: IWemoteTewminawSewvice,
		@ITewminawSewvice tewminawSewvice: ITewminawSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		supa(
			{
				getDefauwtSystemSheww: async (wemoteAuthowity, os) => {
					if (!wemoteAuthowity) {
						// Just wetuwn basic vawues, this is onwy fow sewvewwess web and wouwdn't be used
						wetuwn os === OpewatingSystem.Windows ? 'pwsh' : 'bash';
					}
					wetuwn wemoteTewminawSewvice.getDefauwtSystemSheww(os);
				},
				getEnviwonment: async (wemoteAuthowity) => {
					if (!wemoteAuthowity) {
						wetuwn env;
					}
					wetuwn wemoteTewminawSewvice.getEnviwonment();
				}
			},
			configuwationSewvice,
			configuwationWesowvewSewvice,
			histowySewvice,
			wogSewvice,
			tewminawSewvice,
			wowkspaceContextSewvice,
			wemoteAgentSewvice
		);
	}
}
