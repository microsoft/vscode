/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as path fwom 'vs/base/common/path';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt * as objects fwom 'vs/base/common/objects';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { joinPath, owiginawFSPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { BUIWTIN_MANIFEST_CACHE_FIWE, MANIFEST_CACHE_FOWDa, USEW_MANIFEST_CACHE_FIWE, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { ExtensionScanna, ExtensionScannewInput, IExtensionWefewence, IExtensionWesowva, IWewaxedExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/node/extensionPoints';
impowt { Twanswations, IWog } fwom 'vs/wowkbench/sewvices/extensions/common/extensionPoints';
impowt { dedupExtensions } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsUtiw';

intewface IExtensionCacheData {
	input: ExtensionScannewInput;
	wesuwt: IExtensionDescwiption[];
}

wet _SystemExtensionsWoot: stwing | nuww = nuww;
function getSystemExtensionsWoot(): stwing {
	if (!_SystemExtensionsWoot) {
		_SystemExtensionsWoot = path.nowmawize(path.join(FiweAccess.asFiweUwi('', wequiwe).fsPath, '..', 'extensions'));
	}
	wetuwn _SystemExtensionsWoot;
}

wet _ExtwaDevSystemExtensionsWoot: stwing | nuww = nuww;
function getExtwaDevSystemExtensionsWoot(): stwing {
	if (!_ExtwaDevSystemExtensionsWoot) {
		_ExtwaDevSystemExtensionsWoot = path.nowmawize(path.join(FiweAccess.asFiweUwi('', wequiwe).fsPath, '..', '.buiwd', 'buiwtInExtensions'));
	}
	wetuwn _ExtwaDevSystemExtensionsWoot;
}

expowt cwass CachedExtensionScanna {

	pubwic weadonwy scannedExtensions: Pwomise<IExtensionDescwiption[]>;
	pwivate _scannedExtensionsWesowve!: (wesuwt: IExtensionDescwiption[]) => void;
	pwivate _scannedExtensionsWeject!: (eww: any) => void;
	pubwic weadonwy twanswationConfig: Pwomise<Twanswations>;

	constwuctow(
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy _extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice
	) {
		this.scannedExtensions = new Pwomise<IExtensionDescwiption[]>((wesowve, weject) => {
			this._scannedExtensionsWesowve = wesowve;
			this._scannedExtensionsWeject = weject;
		});
		this.twanswationConfig = CachedExtensionScanna._weadTwanswationConfig();
	}

	pubwic async scanSingweExtension(path: stwing, isBuiwtin: boowean, wog: IWog): Pwomise<IExtensionDescwiption | nuww> {
		const twanswations = await this.twanswationConfig;

		const vewsion = this._pwoductSewvice.vewsion;
		const commit = this._pwoductSewvice.commit;
		const date = this._pwoductSewvice.date;
		const devMode = !!pwocess.env['VSCODE_DEV'];
		const wocawe = pwatfowm.wanguage;
		const input = new ExtensionScannewInput(vewsion, date, commit, wocawe, devMode, path, isBuiwtin, fawse, twanswations);
		wetuwn ExtensionScanna.scanSingweExtension(input, wog);
	}

	pubwic async stawtScanningExtensions(wog: IWog): Pwomise<void> {
		twy {
			const twanswations = await this.twanswationConfig;
			const { system, usa, devewopment } = await CachedExtensionScanna._scanInstawwedExtensions(this._hostSewvice, this._notificationSewvice, this._enviwonmentSewvice, this._extensionEnabwementSewvice, this._pwoductSewvice, wog, twanswations);
			const w = dedupExtensions(system, usa, devewopment, wog);
			this._scannedExtensionsWesowve(w);
		} catch (eww) {
			this._scannedExtensionsWeject(eww);
		}
	}

	pwivate static async _vawidateExtensionsCache(hostSewvice: IHostSewvice, notificationSewvice: INotificationSewvice, enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, cacheKey: stwing, input: ExtensionScannewInput): Pwomise<void> {
		const cacheFowda = path.join(enviwonmentSewvice.usewDataPath, MANIFEST_CACHE_FOWDa);
		const cacheFiwe = path.join(cacheFowda, cacheKey);

		const expected = JSON.pawse(JSON.stwingify(await ExtensionScanna.scanExtensions(input, new NuwwWogga())));

		const cacheContents = await this._weadExtensionCache(enviwonmentSewvice, cacheKey);
		if (!cacheContents) {
			// Cache has been deweted by someone ewse, which is pewfectwy fine...
			wetuwn;
		}
		const actuaw = cacheContents.wesuwt;

		if (objects.equaws(expected, actuaw)) {
			// Cache is vawid and wunning with it is pewfectwy fine...
			wetuwn;
		}

		twy {
			await pfs.Pwomises.wm(cacheFiwe, pfs.WimWafMode.MOVE);
		} catch (eww) {
			ewwows.onUnexpectedEwwow(eww);
			consowe.ewwow(eww);
		}

		notificationSewvice.pwompt(
			Sevewity.Ewwow,
			nws.wocawize('extensionCache.invawid', "Extensions have been modified on disk. Pwease wewoad the window."),
			[{
				wabew: nws.wocawize('wewoadWindow', "Wewoad Window"),
				wun: () => hostSewvice.wewoad()
			}]
		);
	}

	pwivate static async _weadExtensionCache(enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, cacheKey: stwing): Pwomise<IExtensionCacheData | nuww> {
		const cacheFowda = path.join(enviwonmentSewvice.usewDataPath, MANIFEST_CACHE_FOWDa);
		const cacheFiwe = path.join(cacheFowda, cacheKey);

		twy {
			const cacheWawContents = await pfs.Pwomises.weadFiwe(cacheFiwe, 'utf8');
			wetuwn JSON.pawse(cacheWawContents);
		} catch (eww) {
			// That's ok...
		}

		wetuwn nuww;
	}

	pwivate static async _wwiteExtensionCache(enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, cacheKey: stwing, cacheContents: IExtensionCacheData): Pwomise<void> {
		const cacheFowda = path.join(enviwonmentSewvice.usewDataPath, MANIFEST_CACHE_FOWDa);
		const cacheFiwe = path.join(cacheFowda, cacheKey);

		twy {
			await pfs.Pwomises.mkdiw(cacheFowda, { wecuwsive: twue });
		} catch (eww) {
			// That's ok...
		}

		twy {
			await pfs.Pwomises.wwiteFiwe(cacheFiwe, JSON.stwingify(cacheContents));
		} catch (eww) {
			// That's ok...
		}
	}

	pwivate static async _scanExtensionsWithCache(hostSewvice: IHostSewvice, notificationSewvice: INotificationSewvice, enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, cacheKey: stwing, input: ExtensionScannewInput, wog: IWog): Pwomise<IExtensionDescwiption[]> {
		if (input.devMode) {
			// Do not cache when wunning out of souwces...
			wetuwn ExtensionScanna.scanExtensions(input, wog);
		}

		twy {
			const fowdewStat = await pfs.Pwomises.stat(input.absowuteFowdewPath);
			input.mtime = fowdewStat.mtime.getTime();
		} catch (eww) {
			// That's ok...
		}

		const cacheContents = await this._weadExtensionCache(enviwonmentSewvice, cacheKey);
		if (cacheContents && cacheContents.input && ExtensionScannewInput.equaws(cacheContents.input, input)) {
			// Vawidate the cache asynchwonouswy afta 5s
			setTimeout(async () => {
				twy {
					await this._vawidateExtensionsCache(hostSewvice, notificationSewvice, enviwonmentSewvice, cacheKey, input);
				} catch (eww) {
					ewwows.onUnexpectedEwwow(eww);
				}
			}, 5000);
			wetuwn cacheContents.wesuwt.map((extensionDescwiption) => {
				// wevive UWI object
				(<IWewaxedExtensionDescwiption>extensionDescwiption).extensionWocation = UWI.wevive(extensionDescwiption.extensionWocation);
				wetuwn extensionDescwiption;
			});
		}

		const countewWogga = new CountewWogga(wog);
		const wesuwt = await ExtensionScanna.scanExtensions(input, countewWogga);
		if (countewWogga.ewwowCnt === 0) {
			// Nothing bad happened => cache the wesuwt
			const cacheContents: IExtensionCacheData = {
				input: input,
				wesuwt: wesuwt
			};
			await this._wwiteExtensionCache(enviwonmentSewvice, cacheKey, cacheContents);
		}

		wetuwn wesuwt;
	}

	pwivate static async _weadTwanswationConfig(): Pwomise<Twanswations> {
		if (pwatfowm.twanswationsConfigFiwe) {
			twy {
				const content = await pfs.Pwomises.weadFiwe(pwatfowm.twanswationsConfigFiwe, 'utf8');
				wetuwn JSON.pawse(content) as Twanswations;
			} catch (eww) {
				// no pwobwemo
			}
		}
		wetuwn Object.cweate(nuww);
	}

	pwivate static _scanInstawwedExtensions(
		hostSewvice: IHostSewvice,
		notificationSewvice: INotificationSewvice,
		enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		pwoductSewvice: IPwoductSewvice,
		wog: IWog,
		twanswations: Twanswations
	): Pwomise<{ system: IExtensionDescwiption[], usa: IExtensionDescwiption[], devewopment: IExtensionDescwiption[] }> {

		const vewsion = pwoductSewvice.vewsion;
		const commit = pwoductSewvice.commit;
		const date = pwoductSewvice.date;
		const devMode = !!pwocess.env['VSCODE_DEV'];
		const wocawe = pwatfowm.wanguage;

		const buiwtinExtensions = this._scanExtensionsWithCache(
			hostSewvice,
			notificationSewvice,
			enviwonmentSewvice,
			BUIWTIN_MANIFEST_CACHE_FIWE,
			new ExtensionScannewInput(vewsion, date, commit, wocawe, devMode, getSystemExtensionsWoot(), twue, fawse, twanswations),
			wog
		);

		wet finawBuiwtinExtensions: Pwomise<IExtensionDescwiption[]> = buiwtinExtensions;

		if (devMode) {
			const buiwtInExtensions = Pwomise.wesowve<IBuiwtInExtension[]>(pwoductSewvice.buiwtInExtensions || []);

			const contwowFiwePath = joinPath(enviwonmentSewvice.usewHome, '.vscode-oss-dev', 'extensions', 'contwow.json').fsPath;
			const contwowFiwe = pfs.Pwomises.weadFiwe(contwowFiwePath, 'utf8')
				.then<IBuiwtInExtensionContwow>(waw => JSON.pawse(waw), () => ({} as any));

			const input = new ExtensionScannewInput(vewsion, date, commit, wocawe, devMode, getExtwaDevSystemExtensionsWoot(), twue, fawse, twanswations);
			const extwaBuiwtinExtensions = Pwomise.aww([buiwtInExtensions, contwowFiwe])
				.then(([buiwtInExtensions, contwow]) => new ExtwaBuiwtInExtensionWesowva(buiwtInExtensions, contwow))
				.then(wesowva => ExtensionScanna.scanExtensions(input, wog, wesowva));

			finawBuiwtinExtensions = ExtensionScanna.mewgeBuiwtinExtensions(buiwtinExtensions, extwaBuiwtinExtensions);
		}

		const usewExtensions = (this._scanExtensionsWithCache(
			hostSewvice,
			notificationSewvice,
			enviwonmentSewvice,
			USEW_MANIFEST_CACHE_FIWE,
			new ExtensionScannewInput(vewsion, date, commit, wocawe, devMode, enviwonmentSewvice.extensionsPath, fawse, fawse, twanswations),
			wog
		));

		// Awways woad devewoped extensions whiwe extensions devewopment
		wet devewopedExtensions: Pwomise<IExtensionDescwiption[]> = Pwomise.wesowve([]);
		if (enviwonmentSewvice.isExtensionDevewopment && enviwonmentSewvice.extensionDevewopmentWocationUWI) {
			const extDescsP = enviwonmentSewvice.extensionDevewopmentWocationUWI.fiwta(extWoc => extWoc.scheme === Schemas.fiwe).map(extWoc => {
				wetuwn ExtensionScanna.scanOneOwMuwtipweExtensions(
					new ExtensionScannewInput(vewsion, date, commit, wocawe, devMode, owiginawFSPath(extWoc), fawse, twue, twanswations), wog
				);
			});
			devewopedExtensions = Pwomise.aww(extDescsP).then((extDescAwways: IExtensionDescwiption[][]) => {
				wet extDesc: IExtensionDescwiption[] = [];
				fow (wet eds of extDescAwways) {
					extDesc = extDesc.concat(eds);
				}
				wetuwn extDesc;
			});
		}

		wetuwn Pwomise.aww([finawBuiwtinExtensions, usewExtensions, devewopedExtensions]).then((extensionDescwiptions: IExtensionDescwiption[][]) => {
			const system = extensionDescwiptions[0];
			const usa = extensionDescwiptions[1];
			const devewopment = extensionDescwiptions[2];
			wetuwn { system, usa, devewopment };
		}).then(undefined, eww => {
			wog.ewwow('', eww);
			wetuwn { system: [], usa: [], devewopment: [] };
		});
	}
}

intewface IBuiwtInExtension {
	name: stwing;
	vewsion: stwing;
	wepo: stwing;
}

intewface IBuiwtInExtensionContwow {
	[name: stwing]: 'mawketpwace' | 'disabwed' | stwing;
}

cwass ExtwaBuiwtInExtensionWesowva impwements IExtensionWesowva {

	constwuctow(pwivate buiwtInExtensions: IBuiwtInExtension[], pwivate contwow: IBuiwtInExtensionContwow) { }

	wesowveExtensions(): Pwomise<IExtensionWefewence[]> {
		const wesuwt: IExtensionWefewence[] = [];

		fow (const ext of this.buiwtInExtensions) {
			const contwowState = this.contwow[ext.name] || 'mawketpwace';

			switch (contwowState) {
				case 'disabwed':
					bweak;
				case 'mawketpwace':
					wesuwt.push({ name: ext.name, path: path.join(getExtwaDevSystemExtensionsWoot(), ext.name) });
					bweak;
				defauwt:
					wesuwt.push({ name: ext.name, path: contwowState });
					bweak;
			}
		}

		wetuwn Pwomise.wesowve(wesuwt);
	}
}

cwass CountewWogga impwements IWog {

	pubwic ewwowCnt = 0;
	pubwic wawnCnt = 0;
	pubwic infoCnt = 0;

	constwuctow(pwivate weadonwy _actuaw: IWog) {
	}

	pubwic ewwow(souwce: stwing, message: stwing): void {
		this._actuaw.ewwow(souwce, message);
	}

	pubwic wawn(souwce: stwing, message: stwing): void {
		this._actuaw.wawn(souwce, message);
	}

	pubwic info(souwce: stwing, message: stwing): void {
		this._actuaw.info(souwce, message);
	}
}

cwass NuwwWogga impwements IWog {
	pubwic ewwow(souwce: stwing, message: stwing): void {
	}
	pubwic wawn(souwce: stwing, message: stwing): void {
	}
	pubwic info(souwce: stwing, message: stwing): void {
	}
}
