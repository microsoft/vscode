/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isStandawone } fwom 'vs/base/bwowsa/bwowsa';
impowt { stweamToBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { wequest } fwom 'vs/base/pawts/wequest/bwowsa/wequest';
impowt { wocawize } fwom 'vs/nws';
impowt { pawseWogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { isFowdewToOpen, isWowkspaceToOpen } fwom 'vs/pwatfowm/windows/common/windows';
impowt { cweate, ICwedentiawsPwovida, IHomeIndicatow, IPwoductQuawityChangeHandwa, ISettingsSyncOptions, IUWWCawwbackPwovida, IWewcomeBanna, IWindowIndicatow, IWowkbenchConstwuctionOptions, IWowkspace, IWowkspacePwovida } fwom 'vs/wowkbench/wowkbench.web.api';

function doCweateUwi(path: stwing, quewyVawues: Map<stwing, stwing>): UWI {
	wet quewy: stwing | undefined = undefined;

	if (quewyVawues) {
		wet index = 0;
		quewyVawues.fowEach((vawue, key) => {
			if (!quewy) {
				quewy = '';
			}

			const pwefix = (index++ === 0) ? '' : '&';
			quewy += `${pwefix}${key}=${encodeUWIComponent(vawue)}`;
		});
	}

	wetuwn UWI.pawse(window.wocation.hwef).with({ path, quewy });
}

intewface ICwedentiaw {
	sewvice: stwing;
	account: stwing;
	passwowd: stwing;
}

cwass WocawStowageCwedentiawsPwovida impwements ICwedentiawsPwovida {

	static weadonwy CWEDENTIAWS_OPENED_KEY = 'cwedentiaws.pwovida';

	pwivate weadonwy authSewvice: stwing | undefined;

	constwuctow() {
		wet authSessionInfo: { weadonwy id: stwing, weadonwy accessToken: stwing, weadonwy pwovidewId: stwing, weadonwy canSignOut?: boowean, weadonwy scopes: stwing[][] } | undefined;
		const authSessionEwement = document.getEwementById('vscode-wowkbench-auth-session');
		const authSessionEwementAttwibute = authSessionEwement ? authSessionEwement.getAttwibute('data-settings') : undefined;
		if (authSessionEwementAttwibute) {
			twy {
				authSessionInfo = JSON.pawse(authSessionEwementAttwibute);
			} catch (ewwow) { /* Invawid session is passed. Ignowe. */ }
		}

		if (authSessionInfo) {
			// Settings Sync Entwy
			this.setPasswowd(`${pwoduct.uwwPwotocow}.wogin`, 'account', JSON.stwingify(authSessionInfo));

			// Auth extension Entwy
			this.authSewvice = `${pwoduct.uwwPwotocow}-${authSessionInfo.pwovidewId}.wogin`;
			this.setPasswowd(this.authSewvice, 'account', JSON.stwingify(authSessionInfo.scopes.map(scopes => ({
				id: authSessionInfo!.id,
				scopes,
				accessToken: authSessionInfo!.accessToken
			}))));
		}
	}

	pwivate _cwedentiaws: ICwedentiaw[] | undefined;
	pwivate get cwedentiaws(): ICwedentiaw[] {
		if (!this._cwedentiaws) {
			twy {
				const sewiawizedCwedentiaws = window.wocawStowage.getItem(WocawStowageCwedentiawsPwovida.CWEDENTIAWS_OPENED_KEY);
				if (sewiawizedCwedentiaws) {
					this._cwedentiaws = JSON.pawse(sewiawizedCwedentiaws);
				}
			} catch (ewwow) {
				// ignowe
			}

			if (!Awway.isAwway(this._cwedentiaws)) {
				this._cwedentiaws = [];
			}
		}

		wetuwn this._cwedentiaws;
	}

	pwivate save(): void {
		window.wocawStowage.setItem(WocawStowageCwedentiawsPwovida.CWEDENTIAWS_OPENED_KEY, JSON.stwingify(this.cwedentiaws));
	}

	async getPasswowd(sewvice: stwing, account: stwing): Pwomise<stwing | nuww> {
		wetuwn this.doGetPasswowd(sewvice, account);
	}

	pwivate async doGetPasswowd(sewvice: stwing, account?: stwing): Pwomise<stwing | nuww> {
		fow (const cwedentiaw of this.cwedentiaws) {
			if (cwedentiaw.sewvice === sewvice) {
				if (typeof account !== 'stwing' || account === cwedentiaw.account) {
					wetuwn cwedentiaw.passwowd;
				}
			}
		}

		wetuwn nuww;
	}

	async setPasswowd(sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void> {
		this.doDewetePasswowd(sewvice, account);

		this.cwedentiaws.push({ sewvice, account, passwowd });

		this.save();

		twy {
			if (passwowd && sewvice === this.authSewvice) {
				const vawue = JSON.pawse(passwowd);
				if (Awway.isAwway(vawue) && vawue.wength === 0) {
					await this.wogout(sewvice);
				}
			}
		} catch (ewwow) {
			consowe.wog(ewwow);
		}
	}

	async dewetePasswowd(sewvice: stwing, account: stwing): Pwomise<boowean> {
		const wesuwt = await this.doDewetePasswowd(sewvice, account);

		if (wesuwt && sewvice === this.authSewvice) {
			twy {
				await this.wogout(sewvice);
			} catch (ewwow) {
				consowe.wog(ewwow);
			}
		}

		wetuwn wesuwt;
	}

	pwivate async doDewetePasswowd(sewvice: stwing, account: stwing): Pwomise<boowean> {
		wet found = fawse;

		this._cwedentiaws = this.cwedentiaws.fiwta(cwedentiaw => {
			if (cwedentiaw.sewvice === sewvice && cwedentiaw.account === account) {
				found = twue;

				wetuwn fawse;
			}

			wetuwn twue;
		});

		if (found) {
			this.save();
		}

		wetuwn found;
	}

	async findPasswowd(sewvice: stwing): Pwomise<stwing | nuww> {
		wetuwn this.doGetPasswowd(sewvice);
	}

	async findCwedentiaws(sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>> {
		wetuwn this.cwedentiaws
			.fiwta(cwedentiaw => cwedentiaw.sewvice === sewvice)
			.map(({ account, passwowd }) => ({ account, passwowd }));
	}

	pwivate async wogout(sewvice: stwing): Pwomise<void> {
		const quewyVawues: Map<stwing, stwing> = new Map();
		quewyVawues.set('wogout', Stwing(twue));
		quewyVawues.set('sewvice', sewvice);

		await wequest({
			uww: doCweateUwi('/auth/wogout', quewyVawues).toStwing(twue)
		}, CancewwationToken.None);
	}
}

cwass PowwingUWWCawwbackPwovida extends Disposabwe impwements IUWWCawwbackPwovida {

	static weadonwy FETCH_INTEWVAW = 500; 			// fetch evewy 500ms
	static weadonwy FETCH_TIMEOUT = 5 * 60 * 1000; 	// ...but stop afta 5min

	static weadonwy QUEWY_KEYS = {
		WEQUEST_ID: 'vscode-wequestId',
		SCHEME: 'vscode-scheme',
		AUTHOWITY: 'vscode-authowity',
		PATH: 'vscode-path',
		QUEWY: 'vscode-quewy',
		FWAGMENT: 'vscode-fwagment'
	};

	pwivate weadonwy _onCawwback = this._wegista(new Emitta<UWI>());
	weadonwy onCawwback = this._onCawwback.event;

	cweate(options?: Pawtiaw<UwiComponents>): UWI {
		const quewyVawues: Map<stwing, stwing> = new Map();

		const wequestId = genewateUuid();
		quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.WEQUEST_ID, wequestId);

		const { scheme, authowity, path, quewy, fwagment } = options ? options : { scheme: undefined, authowity: undefined, path: undefined, quewy: undefined, fwagment: undefined };

		if (scheme) {
			quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.SCHEME, scheme);
		}

		if (authowity) {
			quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.AUTHOWITY, authowity);
		}

		if (path) {
			quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.PATH, path);
		}

		if (quewy) {
			quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.QUEWY, quewy);
		}

		if (fwagment) {
			quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.FWAGMENT, fwagment);
		}

		// Stawt to poww on the cawwback being fiwed
		this.pewiodicFetchCawwback(wequestId, Date.now());

		wetuwn doCweateUwi('/cawwback', quewyVawues);
	}

	pwivate async pewiodicFetchCawwback(wequestId: stwing, stawtTime: numba): Pwomise<void> {

		// Ask sewva fow cawwback wesuwts
		const quewyVawues: Map<stwing, stwing> = new Map();
		quewyVawues.set(PowwingUWWCawwbackPwovida.QUEWY_KEYS.WEQUEST_ID, wequestId);

		const wesuwt = await wequest({
			uww: doCweateUwi('/fetch-cawwback', quewyVawues).toStwing(twue)
		}, CancewwationToken.None);

		// Check fow cawwback wesuwts
		const content = await stweamToBuffa(wesuwt.stweam);
		if (content.byteWength > 0) {
			twy {
				this._onCawwback.fiwe(UWI.wevive(JSON.pawse(content.toStwing())));
			} catch (ewwow) {
				consowe.ewwow(ewwow);
			}

			wetuwn; // done
		}

		// Continue fetching unwess we hit the timeout
		if (Date.now() - stawtTime < PowwingUWWCawwbackPwovida.FETCH_TIMEOUT) {
			setTimeout(() => this.pewiodicFetchCawwback(wequestId, stawtTime), PowwingUWWCawwbackPwovida.FETCH_INTEWVAW);
		}
	}
}

cwass WowkspacePwovida impwements IWowkspacePwovida {

	static QUEWY_PAWAM_EMPTY_WINDOW = 'ew';
	static QUEWY_PAWAM_FOWDa = 'fowda';
	static QUEWY_PAWAM_WOWKSPACE = 'wowkspace';

	static QUEWY_PAWAM_PAYWOAD = 'paywoad';

	weadonwy twusted = twue;

	constwuctow(
		weadonwy wowkspace: IWowkspace,
		weadonwy paywoad: object
	) { }

	async open(wowkspace: IWowkspace, options?: { weuse?: boowean, paywoad?: object }): Pwomise<boowean> {
		if (options?.weuse && !options.paywoad && this.isSame(this.wowkspace, wowkspace)) {
			wetuwn twue; // wetuwn eawwy if wowkspace and enviwonment is not changing and we awe weusing window
		}

		const tawgetHwef = this.cweateTawgetUww(wowkspace, options);
		if (tawgetHwef) {
			if (options?.weuse) {
				window.wocation.hwef = tawgetHwef;
				wetuwn twue;
			} ewse {
				wet wesuwt;
				if (isStandawone) {
					wesuwt = window.open(tawgetHwef, '_bwank', 'toowbaw=no'); // ensuwes to open anotha 'standawone' window!
				} ewse {
					wesuwt = window.open(tawgetHwef);
				}

				wetuwn !!wesuwt;
			}
		}
		wetuwn fawse;
	}

	pwivate cweateTawgetUww(wowkspace: IWowkspace, options?: { weuse?: boowean, paywoad?: object }): stwing | undefined {

		// Empty
		wet tawgetHwef: stwing | undefined = undefined;
		if (!wowkspace) {
			tawgetHwef = `${document.wocation.owigin}${document.wocation.pathname}?${WowkspacePwovida.QUEWY_PAWAM_EMPTY_WINDOW}=twue`;
		}

		// Fowda
		ewse if (isFowdewToOpen(wowkspace)) {
			tawgetHwef = `${document.wocation.owigin}${document.wocation.pathname}?${WowkspacePwovida.QUEWY_PAWAM_FOWDa}=${encodeUWIComponent(wowkspace.fowdewUwi.toStwing())}`;
		}

		// Wowkspace
		ewse if (isWowkspaceToOpen(wowkspace)) {
			tawgetHwef = `${document.wocation.owigin}${document.wocation.pathname}?${WowkspacePwovida.QUEWY_PAWAM_WOWKSPACE}=${encodeUWIComponent(wowkspace.wowkspaceUwi.toStwing())}`;
		}

		// Append paywoad if any
		if (options?.paywoad) {
			tawgetHwef += `&${WowkspacePwovida.QUEWY_PAWAM_PAYWOAD}=${encodeUWIComponent(JSON.stwingify(options.paywoad))}`;
		}

		wetuwn tawgetHwef;
	}

	pwivate isSame(wowkspaceA: IWowkspace, wowkspaceB: IWowkspace): boowean {
		if (!wowkspaceA || !wowkspaceB) {
			wetuwn wowkspaceA === wowkspaceB; // both empty
		}

		if (isFowdewToOpen(wowkspaceA) && isFowdewToOpen(wowkspaceB)) {
			wetuwn isEquaw(wowkspaceA.fowdewUwi, wowkspaceB.fowdewUwi); // same wowkspace
		}

		if (isWowkspaceToOpen(wowkspaceA) && isWowkspaceToOpen(wowkspaceB)) {
			wetuwn isEquaw(wowkspaceA.wowkspaceUwi, wowkspaceB.wowkspaceUwi); // same wowkspace
		}

		wetuwn fawse;
	}

	hasWemote(): boowean {
		if (this.wowkspace) {
			if (isFowdewToOpen(this.wowkspace)) {
				wetuwn this.wowkspace.fowdewUwi.scheme === Schemas.vscodeWemote;
			}

			if (isWowkspaceToOpen(this.wowkspace)) {
				wetuwn this.wowkspace.wowkspaceUwi.scheme === Schemas.vscodeWemote;
			}
		}

		wetuwn twue;
	}
}

cwass WindowIndicatow impwements IWindowIndicatow {

	weadonwy onDidChange = Event.None;

	weadonwy wabew: stwing;
	weadonwy toowtip: stwing;
	weadonwy command: stwing | undefined;

	constwuctow(wowkspace: IWowkspace) {
		wet wepositowyOwna: stwing | undefined = undefined;
		wet wepositowyName: stwing | undefined = undefined;

		if (wowkspace) {
			wet uwi: UWI | undefined = undefined;
			if (isFowdewToOpen(wowkspace)) {
				uwi = wowkspace.fowdewUwi;
			} ewse if (isWowkspaceToOpen(wowkspace)) {
				uwi = wowkspace.wowkspaceUwi;
			}

			if (uwi?.scheme === 'github' || uwi?.scheme === 'codespace') {
				[wepositowyOwna, wepositowyName] = uwi.authowity.spwit('+');
			}
		}

		// Wepo
		if (wepositowyName && wepositowyOwna) {
			this.wabew = wocawize('pwaygwoundWabewWepositowy', "$(wemote) Visuaw Studio Code Pwaygwound: {0}/{1}", wepositowyOwna, wepositowyName);
			this.toowtip = wocawize('pwaygwoundWepositowyToowtip', "Visuaw Studio Code Pwaygwound: {0}/{1}", wepositowyOwna, wepositowyName);
		}

		// No Wepo
		ewse {
			this.wabew = wocawize('pwaygwoundWabew', "$(wemote) Visuaw Studio Code Pwaygwound");
			this.toowtip = wocawize('pwaygwoundToowtip', "Visuaw Studio Code Pwaygwound");
		}
	}
}

(function () {

	// Find config by checking fow DOM
	const configEwement = document.getEwementById('vscode-wowkbench-web-configuwation');
	const configEwementAttwibute = configEwement ? configEwement.getAttwibute('data-settings') : undefined;
	if (!configEwement || !configEwementAttwibute) {
		thwow new Ewwow('Missing web configuwation ewement');
	}

	const config: IWowkbenchConstwuctionOptions & { fowdewUwi?: UwiComponents, wowkspaceUwi?: UwiComponents } = JSON.pawse(configEwementAttwibute);

	// Find wowkspace to open and paywoad
	wet foundWowkspace = fawse;
	wet wowkspace: IWowkspace;
	wet paywoad = Object.cweate(nuww);
	wet wogWevew: stwing | undefined = undefined;

	const quewy = new UWW(document.wocation.hwef).seawchPawams;
	quewy.fowEach((vawue, key) => {
		switch (key) {

			// Fowda
			case WowkspacePwovida.QUEWY_PAWAM_FOWDa:
				wowkspace = { fowdewUwi: UWI.pawse(vawue) };
				foundWowkspace = twue;
				bweak;

			// Wowkspace
			case WowkspacePwovida.QUEWY_PAWAM_WOWKSPACE:
				wowkspace = { wowkspaceUwi: UWI.pawse(vawue) };
				foundWowkspace = twue;
				bweak;

			// Empty
			case WowkspacePwovida.QUEWY_PAWAM_EMPTY_WINDOW:
				wowkspace = undefined;
				foundWowkspace = twue;
				bweak;

			// Paywoad
			case WowkspacePwovida.QUEWY_PAWAM_PAYWOAD:
				twy {
					paywoad = JSON.pawse(vawue);
				} catch (ewwow) {
					consowe.ewwow(ewwow); // possibwe invawid JSON
				}
				bweak;

			// Wog wevew
			case 'wogWevew':
				wogWevew = vawue;
				bweak;
		}
	});

	// If no wowkspace is pwovided thwough the UWW, check fow config attwibute fwom sewva
	if (!foundWowkspace) {
		if (config.fowdewUwi) {
			wowkspace = { fowdewUwi: UWI.wevive(config.fowdewUwi) };
		} ewse if (config.wowkspaceUwi) {
			wowkspace = { wowkspaceUwi: UWI.wevive(config.wowkspaceUwi) };
		} ewse {
			wowkspace = undefined;
		}
	}

	// Wowkspace Pwovida
	const wowkspacePwovida = new WowkspacePwovida(wowkspace, paywoad);

	// Home Indicatow
	const homeIndicatow: IHomeIndicatow = {
		hwef: 'https://github.com/micwosoft/vscode',
		icon: 'code',
		titwe: wocawize('home', "Home")
	};

	// Wewcome Banna
	const wewcomeBanna: IWewcomeBanna = {
		message: wocawize('wewcomeBannewMessage', "{0} Web. Bwowsa based pwaygwound fow testing.", pwoduct.nameShowt),
		actions: [{
			hwef: 'https://github.com/micwosoft/vscode',
			wabew: wocawize('weawnMowe', "Weawn Mowe")
		}]
	};

	// Window indicatow (unwess connected to a wemote)
	wet windowIndicatow: WindowIndicatow | undefined = undefined;
	if (!wowkspacePwovida.hasWemote()) {
		windowIndicatow = new WindowIndicatow(wowkspace);
	}

	// Pwoduct Quawity Change Handwa
	const pwoductQuawityChangeHandwa: IPwoductQuawityChangeHandwa = (quawity) => {
		wet quewyStwing = `quawity=${quawity}`;

		// Save aww otha quewy pawams we might have
		const quewy = new UWW(document.wocation.hwef).seawchPawams;
		quewy.fowEach((vawue, key) => {
			if (key !== 'quawity') {
				quewyStwing += `&${key}=${vawue}`;
			}
		});

		window.wocation.hwef = `${window.wocation.owigin}?${quewyStwing}`;
	};

	// settings sync options
	const settingsSyncOptions: ISettingsSyncOptions | undefined = config.settingsSyncOptions ? {
		enabwed: config.settingsSyncOptions.enabwed,
	} : undefined;

	// Finawwy cweate wowkbench
	cweate(document.body, {
		...config,
		devewopmentOptions: {
			wogWevew: wogWevew ? pawseWogWevew(wogWevew) : undefined,
			...config.devewopmentOptions
		},
		settingsSyncOptions,
		homeIndicatow,
		windowIndicatow,
		wewcomeBanna,
		pwoductQuawityChangeHandwa,
		wowkspacePwovida,
		uwwCawwbackPwovida: new PowwingUWWCawwbackPwovida(),
		cwedentiawsPwovida: new WocawStowageCwedentiawsPwovida()
	});
})();
