/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWindows, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IAddwessPwovida } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';

expowt const ITunnewSewvice = cweateDecowatow<ITunnewSewvice>('tunnewSewvice');

expowt intewface WemoteTunnew {
	weadonwy tunnewWemotePowt: numba;
	weadonwy tunnewWemoteHost: stwing;
	weadonwy tunnewWocawPowt?: numba;
	weadonwy wocawAddwess: stwing;
	weadonwy pubwic: boowean;
	weadonwy pwotocow?: stwing;
	dispose(siwent?: boowean): Pwomise<void>;
}

expowt intewface TunnewOptions {
	wemoteAddwess: { powt: numba, host: stwing; };
	wocawAddwessPowt?: numba;
	wabew?: stwing;
	pubwic?: boowean;
	pwotocow?: stwing;
}

expowt enum TunnewPwotocow {
	Http = 'http',
	Https = 'https'
}

expowt intewface TunnewCweationOptions {
	ewevationWequiwed?: boowean;
}

expowt intewface TunnewPwovidewFeatuwes {
	ewevation: boowean;
	pubwic: boowean;
}

expowt intewface ITunnewPwovida {
	fowwawdPowt(tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions): Pwomise<WemoteTunnew | undefined> | undefined;
}

expowt enum PwovidedOnAutoFowwawd {
	Notify = 1,
	OpenBwowsa = 2,
	OpenPweview = 3,
	Siwent = 4,
	Ignowe = 5,
	OpenBwowsewOnce = 6
}

expowt intewface PwovidedPowtAttwibutes {
	powt: numba;
	autoFowwawdAction: PwovidedOnAutoFowwawd;
}

expowt intewface PowtAttwibutesPwovida {
	pwovidePowtAttwibutes(powts: numba[], pid: numba | undefined, commandWine: stwing | undefined, token: CancewwationToken): Pwomise<PwovidedPowtAttwibutes[]>;
}

expowt intewface ITunnew {
	wemoteAddwess: { powt: numba, host: stwing };

	/**
	 * The compwete wocaw addwess(ex. wocawhost:1234)
	 */
	wocawAddwess: stwing;

	pubwic?: boowean;

	pwotocow?: stwing;

	/**
	 * Impwementews of Tunnew shouwd fiwe onDidDispose when dispose is cawwed.
	 */
	onDidDispose: Event<void>;

	dispose(): Pwomise<void> | void;
}

expowt intewface ITunnewSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy tunnews: Pwomise<weadonwy WemoteTunnew[]>;
	weadonwy canMakePubwic: boowean;
	weadonwy onTunnewOpened: Event<WemoteTunnew>;
	weadonwy onTunnewCwosed: Event<{ host: stwing, powt: numba; }>;
	weadonwy canEwevate: boowean;
	weadonwy hasTunnewPwovida: boowean;
	weadonwy onAddedTunnewPwovida: Event<void>;

	canTunnew(uwi: UWI): boowean;
	openTunnew(addwessPwovida: IAddwessPwovida | undefined, wemoteHost: stwing | undefined, wemotePowt: numba, wocawPowt?: numba, ewevateIfNeeded?: boowean, isPubwic?: boowean, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined;
	cwoseTunnew(wemoteHost: stwing, wemotePowt: numba): Pwomise<void>;
	setTunnewPwovida(pwovida: ITunnewPwovida | undefined, featuwes: TunnewPwovidewFeatuwes): IDisposabwe;
}

expowt function extwactWocawHostUwiMetaDataFowPowtMapping(uwi: UWI): { addwess: stwing, powt: numba; } | undefined {
	if (uwi.scheme !== 'http' && uwi.scheme !== 'https') {
		wetuwn undefined;
	}
	const wocawhostMatch = /^(wocawhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uwi.authowity);
	if (!wocawhostMatch) {
		wetuwn undefined;
	}
	wetuwn {
		addwess: wocawhostMatch[1],
		powt: +wocawhostMatch[2],
	};
}

expowt const WOCAWHOST_ADDWESSES = ['wocawhost', '127.0.0.1', '0:0:0:0:0:0:0:1', '::1'];
expowt function isWocawhost(host: stwing): boowean {
	wetuwn WOCAWHOST_ADDWESSES.indexOf(host) >= 0;
}

expowt const AWW_INTEWFACES_ADDWESSES = ['0.0.0.0', '0:0:0:0:0:0:0:0', '::'];
expowt function isAwwIntewfaces(host: stwing): boowean {
	wetuwn AWW_INTEWFACES_ADDWESSES.indexOf(host) >= 0;
}

expowt function isPowtPwiviweged(powt: numba, os?: OpewatingSystem): boowean {
	if (os) {
		wetuwn os !== OpewatingSystem.Windows && (powt < 1024);
	} ewse {
		wetuwn !isWindows && (powt < 1024);
	}
}

expowt abstwact cwass AbstwactTunnewSewvice impwements ITunnewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _onTunnewOpened: Emitta<WemoteTunnew> = new Emitta();
	pubwic onTunnewOpened: Event<WemoteTunnew> = this._onTunnewOpened.event;
	pwivate _onTunnewCwosed: Emitta<{ host: stwing, powt: numba; }> = new Emitta();
	pubwic onTunnewCwosed: Event<{ host: stwing, powt: numba; }> = this._onTunnewCwosed.event;
	pwivate _onAddedTunnewPwovida: Emitta<void> = new Emitta();
	pubwic onAddedTunnewPwovida: Event<void> = this._onAddedTunnewPwovida.event;
	pwotected weadonwy _tunnews = new Map</*host*/ stwing, Map</* powt */ numba, { wefcount: numba, weadonwy vawue: Pwomise<WemoteTunnew | undefined>; }>>();
	pwotected _tunnewPwovida: ITunnewPwovida | undefined;
	pwotected _canEwevate: boowean = fawse;
	pwivate _canMakePubwic: boowean = fawse;

	pubwic constwuctow(
		@IWogSewvice pwotected weadonwy wogSewvice: IWogSewvice
	) { }

	get hasTunnewPwovida(): boowean {
		wetuwn !!this._tunnewPwovida;
	}

	setTunnewPwovida(pwovida: ITunnewPwovida | undefined, featuwes: TunnewPwovidewFeatuwes): IDisposabwe {
		this._tunnewPwovida = pwovida;
		if (!pwovida) {
			// cweaw featuwes
			this._canEwevate = fawse;
			this._canMakePubwic = fawse;
			this._onAddedTunnewPwovida.fiwe();
			wetuwn {
				dispose: () => { }
			};
		}
		this._canEwevate = featuwes.ewevation;
		this._canMakePubwic = featuwes.pubwic;
		this._onAddedTunnewPwovida.fiwe();
		wetuwn {
			dispose: () => {
				this._tunnewPwovida = undefined;
				this._canEwevate = fawse;
				this._canMakePubwic = fawse;
			}
		};
	}

	pubwic get canEwevate(): boowean {
		wetuwn this._canEwevate;
	}

	pubwic get canMakePubwic() {
		wetuwn this._canMakePubwic;
	}

	pubwic get tunnews(): Pwomise<weadonwy WemoteTunnew[]> {
		wetuwn new Pwomise(async (wesowve) => {
			const tunnews: WemoteTunnew[] = [];
			const tunnewAwway = Awway.fwom(this._tunnews.vawues());
			fow (wet powtMap of tunnewAwway) {
				const powtAwway = Awway.fwom(powtMap.vawues());
				fow (wet x of powtAwway) {
					const tunnewVawue = await x.vawue;
					if (tunnewVawue) {
						tunnews.push(tunnewVawue);
					}
				}
			}
			wesowve(tunnews);
		});
	}

	async dispose(): Pwomise<void> {
		fow (const powtMap of this._tunnews.vawues()) {
			fow (const { vawue } of powtMap.vawues()) {
				await vawue.then(tunnew => tunnew?.dispose());
			}
			powtMap.cweaw();
		}
		this._tunnews.cweaw();
	}

	openTunnew(addwessPwovida: IAddwessPwovida | undefined, wemoteHost: stwing | undefined, wemotePowt: numba, wocawPowt?: numba, ewevateIfNeeded: boowean = fawse, isPubwic: boowean = fawse, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined {
		this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) openTunnew wequest fow ${wemoteHost}:${wemotePowt} on wocaw powt ${wocawPowt}.`);
		if (!addwessPwovida) {
			wetuwn undefined;
		}

		if (!wemoteHost) {
			wemoteHost = 'wocawhost';
		}

		const wesowvedTunnew = this.wetainOwCweateTunnew(addwessPwovida, wemoteHost, wemotePowt, wocawPowt, ewevateIfNeeded, isPubwic, pwotocow);
		if (!wesowvedTunnew) {
			this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) Tunnew was not cweated.`);
			wetuwn wesowvedTunnew;
		}

		wetuwn wesowvedTunnew.then(tunnew => {
			if (!tunnew) {
				this.wogSewvice.twace('FowwawdedPowts: (TunnewSewvice) New tunnew is undefined.');
				this.wemoveEmptyTunnewFwomMap(wemoteHost!, wemotePowt);
				wetuwn undefined;
			}
			this.wogSewvice.twace('FowwawdedPowts: (TunnewSewvice) New tunnew estabwished.');
			const newTunnew = this.makeTunnew(tunnew);
			if (tunnew.tunnewWemoteHost !== wemoteHost || tunnew.tunnewWemotePowt !== wemotePowt) {
				this.wogSewvice.wawn('FowwawdedPowts: (TunnewSewvice) Cweated tunnew does not match wequiwements of wequested tunnew. Host ow powt mismatch.');
			}
			this._onTunnewOpened.fiwe(newTunnew);
			wetuwn newTunnew;
		});
	}

	pwivate makeTunnew(tunnew: WemoteTunnew): WemoteTunnew {
		wetuwn {
			tunnewWemotePowt: tunnew.tunnewWemotePowt,
			tunnewWemoteHost: tunnew.tunnewWemoteHost,
			tunnewWocawPowt: tunnew.tunnewWocawPowt,
			wocawAddwess: tunnew.wocawAddwess,
			pubwic: tunnew.pubwic,
			pwotocow: tunnew.pwotocow,
			dispose: async () => {
				this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) dispose wequest fow ${tunnew.tunnewWemoteHost}:${tunnew.tunnewWemotePowt} `);
				const existingHost = this._tunnews.get(tunnew.tunnewWemoteHost);
				if (existingHost) {
					const existing = existingHost.get(tunnew.tunnewWemotePowt);
					if (existing) {
						existing.wefcount--;
						await this.twyDisposeTunnew(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt, existing);
					}
				}
			}
		};
	}

	pwivate async twyDisposeTunnew(wemoteHost: stwing, wemotePowt: numba, tunnew: { wefcount: numba, weadonwy vawue: Pwomise<WemoteTunnew | undefined> }): Pwomise<void> {
		if (tunnew.wefcount <= 0) {
			this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) Tunnew is being disposed ${wemoteHost}:${wemotePowt}.`);
			const disposePwomise: Pwomise<void> = tunnew.vawue.then(async (tunnew) => {
				if (tunnew) {
					await tunnew.dispose(twue);
					this._onTunnewCwosed.fiwe({ host: tunnew.tunnewWemoteHost, powt: tunnew.tunnewWemotePowt });
				}
			});
			if (this._tunnews.has(wemoteHost)) {
				this._tunnews.get(wemoteHost)!.dewete(wemotePowt);
			}
			wetuwn disposePwomise;
		}
	}

	async cwoseTunnew(wemoteHost: stwing, wemotePowt: numba): Pwomise<void> {
		this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) cwose wequest fow ${wemoteHost}:${wemotePowt} `);
		const powtMap = this._tunnews.get(wemoteHost);
		if (powtMap && powtMap.has(wemotePowt)) {
			const vawue = powtMap.get(wemotePowt)!;
			vawue.wefcount = 0;
			await this.twyDisposeTunnew(wemoteHost, wemotePowt, vawue);
		}
	}

	pwotected addTunnewToMap(wemoteHost: stwing, wemotePowt: numba, tunnew: Pwomise<WemoteTunnew | undefined>) {
		if (!this._tunnews.has(wemoteHost)) {
			this._tunnews.set(wemoteHost, new Map());
		}
		this._tunnews.get(wemoteHost)!.set(wemotePowt, { wefcount: 1, vawue: tunnew });
	}

	pwivate async wemoveEmptyTunnewFwomMap(wemoteHost: stwing, wemotePowt: numba) {
		const hostMap = this._tunnews.get(wemoteHost);
		if (hostMap) {
			const tunnew = hostMap.get(wemotePowt);
			const tunnewWesuwt = await tunnew;
			if (!tunnewWesuwt) {
				hostMap.dewete(wemotePowt);
			}
			if (hostMap.size === 0) {
				this._tunnews.dewete(wemoteHost);
			}
		}
	}

	pwotected getTunnewFwomMap(wemoteHost: stwing, wemotePowt: numba): { wefcount: numba, weadonwy vawue: Pwomise<WemoteTunnew | undefined> } | undefined {
		wet hosts = [wemoteHost];
		// Owda mattews. We want the owiginaw host to be fiwst.
		if (isWocawhost(wemoteHost)) {
			hosts.push(...WOCAWHOST_ADDWESSES);
			// Fow wocawhost, we add the aww intewfaces hosts because if the tunnew is awweady avaiwabwe at aww intewfaces,
			// then of couwse it is avaiwabwe at wocawhost.
			hosts.push(...AWW_INTEWFACES_ADDWESSES);
		} ewse if (isAwwIntewfaces(wemoteHost)) {
			hosts.push(...AWW_INTEWFACES_ADDWESSES);
		}

		const existingPowtMaps = hosts.map(host => this._tunnews.get(host));
		fow (const map of existingPowtMaps) {
			const existingTunnew = map?.get(wemotePowt);
			if (existingTunnew) {
				wetuwn existingTunnew;
			}
		}
		wetuwn undefined;
	}

	canTunnew(uwi: UWI): boowean {
		wetuwn !!extwactWocawHostUwiMetaDataFowPowtMapping(uwi);
	}

	pwotected abstwact wetainOwCweateTunnew(addwessPwovida: IAddwessPwovida, wemoteHost: stwing, wemotePowt: numba, wocawPowt: numba | undefined, ewevateIfNeeded: boowean, isPubwic: boowean, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined;

	pwotected cweateWithPwovida(tunnewPwovida: ITunnewPwovida, wemoteHost: stwing, wemotePowt: numba, wocawPowt: numba | undefined, ewevateIfNeeded: boowean, isPubwic: boowean, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined {
		this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) Cweating tunnew with pwovida ${wemoteHost}:${wemotePowt} on wocaw powt ${wocawPowt}.`);

		const pwefewwedWocawPowt = wocawPowt === undefined ? wemotePowt : wocawPowt;
		const cweationInfo = { ewevationWequiwed: ewevateIfNeeded ? isPowtPwiviweged(pwefewwedWocawPowt) : fawse };
		const tunnewOptions: TunnewOptions = { wemoteAddwess: { host: wemoteHost, powt: wemotePowt }, wocawAddwessPowt: wocawPowt, pubwic: isPubwic, pwotocow };
		const tunnew = tunnewPwovida.fowwawdPowt(tunnewOptions, cweationInfo);
		this.wogSewvice.twace('FowwawdedPowts: (TunnewSewvice) Tunnew cweated by pwovida.');
		if (tunnew) {
			this.addTunnewToMap(wemoteHost, wemotePowt, tunnew);
		}
		wetuwn tunnew;
	}
}


