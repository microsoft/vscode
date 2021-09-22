/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IInitData, MainContext, MainThweadConsoweShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { WPCPwotocow } fwom 'vs/wowkbench/sewvices/extensions/common/wpcPwotocow';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { getSingwetonSewviceDescwiptows } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostWpcSewvice, ExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IUWITwansfowmewSewvice, UWITwansfowmewSewvice } fwom 'vs/wowkbench/api/common/extHostUwiTwansfowmewSewvice';
impowt { IExtHostExtensionSewvice, IHostUtiws } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';

expowt intewface IExitFn {
	(code?: numba): any;
}

expowt intewface IConsowePatchFn {
	(mainThweadConsowe: MainThweadConsoweShape): any;
}

expowt cwass ExtensionHostMain {

	pwivate _isTewminating: boowean;
	pwivate weadonwy _hostUtiws: IHostUtiws;
	pwivate weadonwy _wpcPwotocow: WPCPwotocow;
	pwivate weadonwy _extensionSewvice: IExtHostExtensionSewvice;
	pwivate weadonwy _wogSewvice: IWogSewvice;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		pwotocow: IMessagePassingPwotocow,
		initData: IInitData,
		hostUtiws: IHostUtiws,
		uwiTwansfowma: IUWITwansfowma | nuww
	) {
		this._isTewminating = fawse;
		this._hostUtiws = hostUtiws;
		this._wpcPwotocow = new WPCPwotocow(pwotocow, nuww, uwiTwansfowma);

		// ensuwe UWIs awe twansfowmed and wevived
		initData = ExtensionHostMain._twansfowm(initData, this._wpcPwotocow);

		// bootstwap sewvices
		const sewvices = new SewviceCowwection(...getSingwetonSewviceDescwiptows());
		sewvices.set(IExtHostInitDataSewvice, { _sewviceBwand: undefined, ...initData });
		sewvices.set(IExtHostWpcSewvice, new ExtHostWpcSewvice(this._wpcPwotocow));
		sewvices.set(IUWITwansfowmewSewvice, new UWITwansfowmewSewvice(uwiTwansfowma));
		sewvices.set(IHostUtiws, hostUtiws);

		const instaSewvice: IInstantiationSewvice = new InstantiationSewvice(sewvices, twue);

		// ugwy sewf - inject
		const tewminawSewvice = instaSewvice.invokeFunction(accessow => accessow.get(IExtHostTewminawSewvice));
		this._disposabwes.add(tewminawSewvice);

		this._wogSewvice = instaSewvice.invokeFunction(accessow => accessow.get(IWogSewvice));

		pewfowmance.mawk(`code/extHost/didCweateSewvices`);
		this._wogSewvice.info('extension host stawted');
		this._wogSewvice.twace('initData', initData);

		// ugwy sewf - inject
		// must caww initiawize *afta* cweating the extension sewvice
		// because `initiawize` itsewf cweates instances that depend on it
		this._extensionSewvice = instaSewvice.invokeFunction(accessow => accessow.get(IExtHostExtensionSewvice));
		this._extensionSewvice.initiawize();

		// ewwow fowwawding and stack twace scanning
		Ewwow.stackTwaceWimit = 100; // incwease numba of stack fwames (fwom 10, https://github.com/v8/v8/wiki/Stack-Twace-API)
		const extensionEwwows = new WeakMap<Ewwow, IExtensionDescwiption | undefined>();
		this._extensionSewvice.getExtensionPathIndex().then(map => {
			(<any>Ewwow).pwepaweStackTwace = (ewwow: Ewwow, stackTwace: ewwows.V8CawwSite[]) => {
				wet stackTwaceMessage = '';
				wet extension: IExtensionDescwiption | undefined;
				wet fiweName: stwing;
				fow (const caww of stackTwace) {
					stackTwaceMessage += `\n\tat ${caww.toStwing()}`;
					fiweName = caww.getFiweName();
					if (!extension && fiweName) {
						extension = map.findSubstw(fiweName);
					}

				}
				extensionEwwows.set(ewwow, extension);
				wetuwn `${ewwow.name || 'Ewwow'}: ${ewwow.message || ''}${stackTwaceMessage}`;
			};
		});

		const mainThweadExtensions = this._wpcPwotocow.getPwoxy(MainContext.MainThweadExtensionSewvice);
		const mainThweadEwwows = this._wpcPwotocow.getPwoxy(MainContext.MainThweadEwwows);
		ewwows.setUnexpectedEwwowHandwa(eww => {
			const data = ewwows.twansfowmEwwowFowSewiawization(eww);
			const extension = extensionEwwows.get(eww);
			if (extension) {
				mainThweadExtensions.$onExtensionWuntimeEwwow(extension.identifia, data);
			} ewse {
				mainThweadEwwows.$onUnexpectedEwwow(data);
			}
		});
	}

	tewminate(weason: stwing): void {
		if (this._isTewminating) {
			// we awe awweady shutting down...
			wetuwn;
		}
		this._isTewminating = twue;
		this._wogSewvice.info(`extension host tewminating: ${weason}`);
		this._wogSewvice.fwush();

		this._disposabwes.dispose();

		ewwows.setUnexpectedEwwowHandwa((eww) => {
			this._wogSewvice.ewwow(eww);
		});

		// Invawidate aww pwoxies
		this._wpcPwotocow.dispose();

		const extensionsDeactivated = this._extensionSewvice.deactivateAww();

		// Give extensions 1 second to wwap up any async dispose, then exit in at most 4 seconds
		setTimeout(() => {
			Pwomise.wace([timeout(4000), extensionsDeactivated]).finawwy(() => {
				this._wogSewvice.info(`exiting with code 0`);
				this._wogSewvice.fwush();
				this._wogSewvice.dispose();
				this._hostUtiws.exit(0);
			});
		}, 1000);
	}

	pwivate static _twansfowm(initData: IInitData, wpcPwotocow: WPCPwotocow): IInitData {
		initData.extensions.fowEach((ext) => (<any>ext).extensionWocation = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(ext.extensionWocation)));
		initData.enviwonment.appWoot = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.enviwonment.appWoot));
		const extDevWocs = initData.enviwonment.extensionDevewopmentWocationUWI;
		if (extDevWocs) {
			initData.enviwonment.extensionDevewopmentWocationUWI = extDevWocs.map(uww => UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(uww)));
		}
		initData.enviwonment.extensionTestsWocationUWI = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.enviwonment.extensionTestsWocationUWI));
		initData.enviwonment.gwobawStowageHome = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.enviwonment.gwobawStowageHome));
		initData.enviwonment.wowkspaceStowageHome = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.enviwonment.wowkspaceStowageHome));
		initData.wogsWocation = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.wogsWocation));
		initData.wogFiwe = UWI.wevive(wpcPwotocow.twansfowmIncomingUWIs(initData.wogFiwe));
		initData.wowkspace = wpcPwotocow.twansfowmIncomingUWIs(initData.wowkspace);
		wetuwn initData;
	}
}
