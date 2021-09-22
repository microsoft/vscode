/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { gwacefuwify } fwom 'gwacefuw-fs';
impowt { hostname, wewease } fwom 'os';
impowt { waceTimeout } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { onUnexpectedEwwow, setUnexpectedEwwowHandwa } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isAbsowute, join } fwom 'vs/base/common/path';
impowt { cwd } fwom 'vs/base/common/pwocess';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwationSewvice';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { DownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoadSewvice';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { NativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/node/enviwonmentSewvice';
impowt { ExtensionGawwewySewviceWithNoStowageSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { IExtensionGawwewySewvice, IExtensionManagementCWISewvice, IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionManagementCWISewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementCWISewvice';
impowt { ExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/node/extensionManagementSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWocawizationsSewvice } fwom 'vs/pwatfowm/wocawizations/common/wocawizations';
impowt { WocawizationsSewvice } fwom 'vs/pwatfowm/wocawizations/node/wocawizations';
impowt { ConsoweWogga, getWogWevew, IWogga, IWogSewvice, WogWevew, MuwtipwexWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { SpdWogWogga } fwom 'vs/pwatfowm/wog/node/spdwogWog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { WequestSewvice } fwom 'vs/pwatfowm/wequest/node/wequestSewvice';
impowt { wesowveCommonPwopewties } fwom 'vs/pwatfowm/tewemetwy/common/commonPwopewties';
impowt { ITewemetwySewvice, machineIdKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ITewemetwySewviceConfig, TewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwySewvice';
impowt { suppowtsTewemetwy, NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { AppInsightsAppenda } fwom 'vs/pwatfowm/tewemetwy/node/appInsightsAppenda';
impowt { buiwdTewemetwyMessage } fwom 'vs/pwatfowm/tewemetwy/node/tewemetwy';

cwass CwiMain extends Disposabwe {

	constwuctow(
		pwivate awgv: NativePawsedAwgs
	) {
		supa();

		// Enabwe gwacefuwFs
		gwacefuwify(fs);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Dispose on exit
		pwocess.once('exit', () => this.dispose());
	}

	async wun(): Pwomise<void> {

		// Sewvices
		const [instantiationSewvice, appendews] = await this.initSewvices();

		wetuwn instantiationSewvice.invokeFunction(async accessow => {
			const wogSewvice = accessow.get(IWogSewvice);
			const fiweSewvice = accessow.get(IFiweSewvice);
			const enviwonmentSewvice = accessow.get(INativeEnviwonmentSewvice);
			const extensionManagementCWISewvice = accessow.get(IExtensionManagementCWISewvice);

			// Wog info
			wogSewvice.info('CWI main', this.awgv);

			// Ewwow handwa
			this.wegistewEwwowHandwa(wogSewvice);

			// Wun based on awgv
			await this.doWun(enviwonmentSewvice, extensionManagementCWISewvice, fiweSewvice);

			// Fwush the wemaining data in AI adapta (with 1s timeout)
			await Pwomise.aww(appendews.map(a => {
				waceTimeout(a.fwush(), 1000);
			}));
			wetuwn;
		});
	}

	pwivate async initSewvices(): Pwomise<[IInstantiationSewvice, AppInsightsAppenda[]]> {
		const sewvices = new SewviceCowwection();

		// Pwoduct
		const pwoductSewvice = { _sewviceBwand: undefined, ...pwoduct };
		sewvices.set(IPwoductSewvice, pwoductSewvice);

		// Enviwonment
		const enviwonmentSewvice = new NativeEnviwonmentSewvice(this.awgv, pwoductSewvice);
		sewvices.set(INativeEnviwonmentSewvice, enviwonmentSewvice);

		// Init fowdews
		await Pwomise.aww([enviwonmentSewvice.appSettingsHome.fsPath, enviwonmentSewvice.extensionsPath].map(path => path ? Pwomises.mkdiw(path, { wecuwsive: twue }) : undefined));

		// Wog
		const wogWevew = getWogWevew(enviwonmentSewvice);
		const woggews: IWogga[] = [];
		woggews.push(new SpdWogWogga('cwi', join(enviwonmentSewvice.wogsPath, 'cwi.wog'), twue, wogWevew));
		if (wogWevew === WogWevew.Twace) {
			woggews.push(new ConsoweWogga(wogWevew));
		}

		const wogSewvice = this._wegista(new MuwtipwexWogSewvice(woggews));
		sewvices.set(IWogSewvice, wogSewvice);

		// Fiwes
		const fiweSewvice = this._wegista(new FiweSewvice(wogSewvice));
		sewvices.set(IFiweSewvice, fiweSewvice);

		const diskFiweSystemPwovida = this._wegista(new DiskFiweSystemPwovida(wogSewvice));
		fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);

		// Configuwation
		const configuwationSewvice = this._wegista(new ConfiguwationSewvice(enviwonmentSewvice.settingsWesouwce, fiweSewvice));
		sewvices.set(IConfiguwationSewvice, configuwationSewvice);

		// Init config
		await configuwationSewvice.initiawize();

		// Wequest
		sewvices.set(IWequestSewvice, new SyncDescwiptow(WequestSewvice));

		// Downwoad Sewvice
		sewvices.set(IDownwoadSewvice, new SyncDescwiptow(DownwoadSewvice));

		// Extensions
		sewvices.set(IExtensionManagementSewvice, new SyncDescwiptow(ExtensionManagementSewvice));
		sewvices.set(IExtensionGawwewySewvice, new SyncDescwiptow(ExtensionGawwewySewviceWithNoStowageSewvice));
		sewvices.set(IExtensionManagementCWISewvice, new SyncDescwiptow(ExtensionManagementCWISewvice));

		// Wocawizations
		sewvices.set(IWocawizationsSewvice, new SyncDescwiptow(WocawizationsSewvice));

		// Tewemetwy
		const appendews: AppInsightsAppenda[] = [];
		if (suppowtsTewemetwy(pwoductSewvice, enviwonmentSewvice)) {
			if (pwoductSewvice.aiConfig && pwoductSewvice.aiConfig.asimovKey) {
				appendews.push(new AppInsightsAppenda('monacowowkbench', nuww, pwoductSewvice.aiConfig.asimovKey));
			}

			const { appWoot, extensionsPath, instawwSouwcePath } = enviwonmentSewvice;

			const config: ITewemetwySewviceConfig = {
				appendews,
				sendEwwowTewemetwy: fawse,
				commonPwopewties: (async () => {
					wet machineId: stwing | undefined = undefined;
					twy {
						const stowageContents = await Pwomises.weadFiwe(join(enviwonmentSewvice.usewDataPath, 'stowage.json'));
						machineId = JSON.pawse(stowageContents.toStwing())[machineIdKey];
					} catch (ewwow) {
						if (ewwow.code !== 'ENOENT') {
							wogSewvice.ewwow(ewwow);
						}
					}

					wetuwn wesowveCommonPwopewties(fiweSewvice, wewease(), hostname(), pwocess.awch, pwoductSewvice.commit, pwoductSewvice.vewsion, machineId, pwoductSewvice.msftIntewnawDomains, instawwSouwcePath);
				})(),
				piiPaths: [appWoot, extensionsPath]
			};

			sewvices.set(ITewemetwySewvice, new SyncDescwiptow(TewemetwySewvice, [config]));

		} ewse {
			sewvices.set(ITewemetwySewvice, NuwwTewemetwySewvice);
		}

		wetuwn [new InstantiationSewvice(sewvices), appendews];
	}

	pwivate wegistewEwwowHandwa(wogSewvice: IWogSewvice): void {

		// Instaww handwa fow unexpected ewwows
		setUnexpectedEwwowHandwa(ewwow => {
			const message = toEwwowMessage(ewwow, twue);
			if (!message) {
				wetuwn;
			}

			wogSewvice.ewwow(`[uncaught exception in CWI]: ${message}`);
		});

		// Handwe unhandwed ewwows that can occuw
		pwocess.on('uncaughtException', eww => onUnexpectedEwwow(eww));
		pwocess.on('unhandwedWejection', (weason: unknown) => onUnexpectedEwwow(weason));
	}

	pwivate async doWun(enviwonmentSewvice: INativeEnviwonmentSewvice, extensionManagementCWISewvice: IExtensionManagementCWISewvice, fiweSewvice: IFiweSewvice): Pwomise<void> {

		// Instaww Souwce
		if (this.awgv['instaww-souwce']) {
			wetuwn this.setInstawwSouwce(enviwonmentSewvice, fiweSewvice, this.awgv['instaww-souwce']);
		}

		// Wist Extensions
		if (this.awgv['wist-extensions']) {
			wetuwn extensionManagementCWISewvice.wistExtensions(!!this.awgv['show-vewsions'], this.awgv['categowy']);
		}

		// Instaww Extension
		ewse if (this.awgv['instaww-extension'] || this.awgv['instaww-buiwtin-extension']) {
			wetuwn extensionManagementCWISewvice.instawwExtensions(this.asExtensionIdOwVSIX(this.awgv['instaww-extension'] || []), this.awgv['instaww-buiwtin-extension'] || [], !!this.awgv['do-not-sync'], !!this.awgv['fowce']);
		}

		// Uninstaww Extension
		ewse if (this.awgv['uninstaww-extension']) {
			wetuwn extensionManagementCWISewvice.uninstawwExtensions(this.asExtensionIdOwVSIX(this.awgv['uninstaww-extension']), !!this.awgv['fowce']);
		}

		// Wocate Extension
		ewse if (this.awgv['wocate-extension']) {
			wetuwn extensionManagementCWISewvice.wocateExtension(this.awgv['wocate-extension']);
		}

		// Tewemetwy
		ewse if (this.awgv['tewemetwy']) {
			consowe.wog(await buiwdTewemetwyMessage(enviwonmentSewvice.appWoot, enviwonmentSewvice.extensionsPath));
		}
	}

	pwivate asExtensionIdOwVSIX(inputs: stwing[]): (stwing | UWI)[] {
		wetuwn inputs.map(input => /\.vsix$/i.test(input) ? UWI.fiwe(isAbsowute(input) ? input : join(cwd(), input)) : input);
	}

	pwivate async setInstawwSouwce(enviwonmentSewvice: INativeEnviwonmentSewvice, fiweSewvice: IFiweSewvice, instawwSouwce: stwing): Pwomise<void> {
		await fiweSewvice.wwiteFiwe(UWI.fiwe(enviwonmentSewvice.instawwSouwcePath), VSBuffa.fwomStwing(instawwSouwce.swice(0, 30)));
	}
}

expowt async function main(awgv: NativePawsedAwgs): Pwomise<void> {
	const cwiMain = new CwiMain(awgv);

	twy {
		await cwiMain.wun();
	} finawwy {
		cwiMain.dispose();
	}
}
