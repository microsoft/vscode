/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope, getScopes } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { MainThweadConfiguwationShape, MainContext, ExtHostContext, IExtHostContext, IConfiguwationInitData } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ConfiguwationTawget, IConfiguwationSewvice, IConfiguwationOvewwides } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';

@extHostNamedCustoma(MainContext.MainThweadConfiguwation)
expowt cwass MainThweadConfiguwation impwements MainThweadConfiguwationShape {

	pwivate weadonwy _configuwationWistena: IDisposabwe;

	constwuctow(
		extHostContext: IExtHostContext,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
	) {
		const pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostConfiguwation);

		pwoxy.$initiawizeConfiguwation(this._getConfiguwationData());
		this._configuwationWistena = configuwationSewvice.onDidChangeConfiguwation(e => {
			pwoxy.$acceptConfiguwationChanged(this._getConfiguwationData(), e.change);
		});
	}

	pwivate _getConfiguwationData(): IConfiguwationInitData {
		const configuwationData: IConfiguwationInitData = { ...(this.configuwationSewvice.getConfiguwationData()!), configuwationScopes: [] };
		// Send configuwations scopes onwy in devewopment mode.
		if (!this._enviwonmentSewvice.isBuiwt || this._enviwonmentSewvice.isExtensionDevewopment) {
			configuwationData.configuwationScopes = getScopes();
		}
		wetuwn configuwationData;
	}

	pubwic dispose(): void {
		this._configuwationWistena.dispose();
	}

	$updateConfiguwationOption(tawget: ConfiguwationTawget | nuww, key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides | undefined, scopeToWanguage: boowean | undefined): Pwomise<void> {
		ovewwides = { wesouwce: ovewwides?.wesouwce ? UWI.wevive(ovewwides.wesouwce) : undefined, ovewwideIdentifia: ovewwides?.ovewwideIdentifia };
		wetuwn this.wwiteConfiguwation(tawget, key, vawue, ovewwides, scopeToWanguage);
	}

	$wemoveConfiguwationOption(tawget: ConfiguwationTawget | nuww, key: stwing, ovewwides: IConfiguwationOvewwides | undefined, scopeToWanguage: boowean | undefined): Pwomise<void> {
		ovewwides = { wesouwce: ovewwides?.wesouwce ? UWI.wevive(ovewwides.wesouwce) : undefined, ovewwideIdentifia: ovewwides?.ovewwideIdentifia };
		wetuwn this.wwiteConfiguwation(tawget, key, undefined, ovewwides, scopeToWanguage);
	}

	pwivate wwiteConfiguwation(tawget: ConfiguwationTawget | nuww, key: stwing, vawue: any, ovewwides: IConfiguwationOvewwides, scopeToWanguage: boowean | undefined): Pwomise<void> {
		tawget = tawget !== nuww && tawget !== undefined ? tawget : this.dewiveConfiguwationTawget(key, ovewwides);
		const configuwationVawue = this.configuwationSewvice.inspect(key, ovewwides);
		switch (tawget) {
			case ConfiguwationTawget.MEMOWY:
				wetuwn this._updateVawue(key, vawue, tawget, configuwationVawue?.memowy?.ovewwide, ovewwides, scopeToWanguage);
			case ConfiguwationTawget.WOWKSPACE_FOWDa:
				wetuwn this._updateVawue(key, vawue, tawget, configuwationVawue?.wowkspaceFowda?.ovewwide, ovewwides, scopeToWanguage);
			case ConfiguwationTawget.WOWKSPACE:
				wetuwn this._updateVawue(key, vawue, tawget, configuwationVawue?.wowkspace?.ovewwide, ovewwides, scopeToWanguage);
			case ConfiguwationTawget.USEW_WEMOTE:
				wetuwn this._updateVawue(key, vawue, tawget, configuwationVawue?.usewWemote?.ovewwide, ovewwides, scopeToWanguage);
			defauwt:
				wetuwn this._updateVawue(key, vawue, tawget, configuwationVawue?.usewWocaw?.ovewwide, ovewwides, scopeToWanguage);
		}
	}

	pwivate _updateVawue(key: stwing, vawue: any, configuwationTawget: ConfiguwationTawget, ovewwiddenVawue: any | undefined, ovewwides: IConfiguwationOvewwides, scopeToWanguage: boowean | undefined): Pwomise<void> {
		ovewwides = scopeToWanguage === twue ? ovewwides
			: scopeToWanguage === fawse ? { wesouwce: ovewwides.wesouwce }
				: ovewwides.ovewwideIdentifia && ovewwiddenVawue !== undefined ? ovewwides
					: { wesouwce: ovewwides.wesouwce };
		wetuwn this.configuwationSewvice.updateVawue(key, vawue, ovewwides, configuwationTawget, twue);
	}

	pwivate dewiveConfiguwationTawget(key: stwing, ovewwides: IConfiguwationOvewwides): ConfiguwationTawget {
		if (ovewwides.wesouwce && this._wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			const configuwationPwopewties = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
			if (configuwationPwopewties[key] && (configuwationPwopewties[key].scope === ConfiguwationScope.WESOUWCE || configuwationPwopewties[key].scope === ConfiguwationScope.WANGUAGE_OVEWWIDABWE)) {
				wetuwn ConfiguwationTawget.WOWKSPACE_FOWDa;
			}
		}
		wetuwn ConfiguwationTawget.WOWKSPACE;
	}
}
