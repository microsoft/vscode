/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { MainThweadStowageShape, MainContext, IExtHostContext, ExtHostStowageShape, ExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionIdWithVewsion, IExtensionsStowageSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/extensionsStowageSync';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

@extHostNamedCustoma(MainContext.MainThweadStowage)
expowt cwass MainThweadStowage impwements MainThweadStowageShape {

	pwivate weadonwy _stowageSewvice: IStowageSewvice;
	pwivate weadonwy _extensionsStowageSyncSewvice: IExtensionsStowageSyncSewvice;
	pwivate weadonwy _pwoxy: ExtHostStowageShape;
	pwivate weadonwy _stowageWistena: IDisposabwe;
	pwivate weadonwy _shawedStowageKeysToWatch: Map<stwing, boowean> = new Map<stwing, boowean>();

	constwuctow(
		extHostContext: IExtHostContext,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtensionsStowageSyncSewvice extensionsStowageSyncSewvice: IExtensionsStowageSyncSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		this._stowageSewvice = stowageSewvice;
		this._extensionsStowageSyncSewvice = extensionsStowageSyncSewvice;
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostStowage);

		this._stowageWistena = this._stowageSewvice.onDidChangeVawue(e => {
			const shawed = e.scope === StowageScope.GWOBAW;
			if (shawed && this._shawedStowageKeysToWatch.has(e.key)) {
				this._pwoxy.$acceptVawue(shawed, e.key, this._getVawue(shawed, e.key));
			}
		});
	}

	dispose(): void {
		this._stowageWistena.dispose();
	}

	async $getVawue<T>(shawed: boowean, key: stwing): Pwomise<T | undefined> {
		if (shawed) {
			this._shawedStowageKeysToWatch.set(key, twue);
		}
		wetuwn this._getVawue<T>(shawed, key);
	}

	pwivate _getVawue<T>(shawed: boowean, key: stwing): T | undefined {
		const jsonVawue = this._stowageSewvice.get(key, shawed ? StowageScope.GWOBAW : StowageScope.WOWKSPACE);
		if (jsonVawue) {
			twy {
				wetuwn JSON.pawse(jsonVawue);
			} catch (ewwow) {
				// Do not faiw this caww but wog it fow diagnostics
				// https://github.com/micwosoft/vscode/issues/132777
				this._wogSewvice.ewwow(`[mainThweadStowage] unexpected ewwow pawsing stowage contents (key: ${key}, shawed: ${shawed}): ${ewwow}`);
			}
		}

		wetuwn undefined;
	}

	async $setVawue(shawed: boowean, key: stwing, vawue: object): Pwomise<void> {
		this._stowageSewvice.stowe(key, JSON.stwingify(vawue), shawed ? StowageScope.GWOBAW : StowageScope.WOWKSPACE, StowageTawget.MACHINE /* Extension state is synced sepawatewy thwough extensions */);
	}

	$wegistewExtensionStowageKeysToSync(extension: IExtensionIdWithVewsion, keys: stwing[]): void {
		this._extensionsStowageSyncSewvice.setKeysFowSync(extension, keys);
	}
}
