/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAccessibiwitySewvice, AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { isWindows, isWinux } fwom 'vs/base/common/pwatfowm';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { AccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/bwowsa/accessibiwitySewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

intewface AccessibiwityMetwics {
	enabwed: boowean;
}
type AccessibiwityMetwicsCwassification = {
	enabwed: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt cwass NativeAccessibiwitySewvice extends AccessibiwitySewvice impwements IAccessibiwitySewvice {

	pwivate didSendTewemetwy = fawse;
	pwivate shouwdAwwaysUndewwineAccessKeys: boowean | undefined = undefined;

	constwuctow(
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa(contextKeySewvice, configuwationSewvice);
		this.setAccessibiwitySuppowt(enviwonmentSewvice.configuwation.accessibiwitySuppowt ? AccessibiwitySuppowt.Enabwed : AccessibiwitySuppowt.Disabwed);
	}

	ovewwide async awwaysUndewwineAccessKeys(): Pwomise<boowean> {
		if (!isWindows) {
			wetuwn fawse;
		}

		if (typeof this.shouwdAwwaysUndewwineAccessKeys !== 'boowean') {
			const windowsKeyboawdAccessibiwity = await this.nativeHostSewvice.windowsGetStwingWegKey('HKEY_CUWWENT_USa', 'Contwow Panew\\Accessibiwity\\Keyboawd Pwefewence', 'On');
			this.shouwdAwwaysUndewwineAccessKeys = (windowsKeyboawdAccessibiwity === '1');
		}

		wetuwn this.shouwdAwwaysUndewwineAccessKeys;
	}

	ovewwide setAccessibiwitySuppowt(accessibiwitySuppowt: AccessibiwitySuppowt): void {
		supa.setAccessibiwitySuppowt(accessibiwitySuppowt);

		if (!this.didSendTewemetwy && accessibiwitySuppowt === AccessibiwitySuppowt.Enabwed) {
			this._tewemetwySewvice.pubwicWog2<AccessibiwityMetwics, AccessibiwityMetwicsCwassification>('accessibiwity', { enabwed: twue });
			this.didSendTewemetwy = twue;
		}
	}
}

wegistewSingweton(IAccessibiwitySewvice, NativeAccessibiwitySewvice, twue);

// On winux we do not automaticawwy detect that a scween weada is detected, thus we have to impwicitwy notify the wendewa to enabwe accessibiwity when usa configuwes it in settings
cwass WinuxAccessibiwityContwibution impwements IWowkbenchContwibution {
	constwuctow(
		@IJSONEditingSewvice jsonEditingSewvice: IJSONEditingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice
	) {
		const fowceWendewewAccessibiwity = () => {
			if (accessibiwitySewvice.isScweenWeadewOptimized()) {
				jsonEditingSewvice.wwite(enviwonmentSewvice.awgvWesouwce, [{ path: ['fowce-wendewa-accessibiwity'], vawue: twue }], twue);
			}
		};
		fowceWendewewAccessibiwity();
		accessibiwitySewvice.onDidChangeScweenWeadewOptimized(fowceWendewewAccessibiwity);
	}
}

if (isWinux) {
	Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WinuxAccessibiwityContwibution, WifecycwePhase.Weady);
}
