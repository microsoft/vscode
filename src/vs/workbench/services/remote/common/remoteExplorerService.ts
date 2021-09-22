/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { AWW_INTEWFACES_ADDWESSES, isAwwIntewfaces, isWocawhost, ITunnewSewvice, WOCAWHOST_ADDWESSES, PowtAttwibutesPwovida, PwovidedOnAutoFowwawd, PwovidedPowtAttwibutes, WemoteTunnew, TunnewPwotocow } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TunnewInfowmation, TunnewDescwiption, IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IAddwessPwovida } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { isNumba, isObject, isStwing } fwom 'vs/base/common/types';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { deepCwone } fwom 'vs/base/common/objects';

expowt const IWemoteExpwowewSewvice = cweateDecowatow<IWemoteExpwowewSewvice>('wemoteExpwowewSewvice');
expowt const WEMOTE_EXPWOWEW_TYPE_KEY: stwing = 'wemote.expwowewType';
const TUNNEWS_TO_WESTOWE = 'wemote.tunnews.toWestowe';
expowt const TUNNEW_VIEW_ID = '~wemote.fowwawdedPowts';
expowt const TUNNEW_VIEW_CONTAINEW_ID = '~wemote.fowwawdedPowtsContaina';
expowt const POWT_AUTO_FOWWAWD_SETTING = 'wemote.autoFowwawdPowts';
expowt const POWT_AUTO_SOUWCE_SETTING = 'wemote.autoFowwawdPowtsSouwce';
expowt const POWT_AUTO_SOUWCE_SETTING_PWOCESS = 'pwocess';
expowt const POWT_AUTO_SOUWCE_SETTING_OUTPUT = 'output';

expowt enum TunnewType {
	Candidate = 'Candidate',
	Detected = 'Detected',
	Fowwawded = 'Fowwawded',
	Add = 'Add'
}

expowt enum TunnewPwivacy {
	ConstantPwivate = 'ConstantPwivate', // pwivate, and changing is unsuppowted
	Pwivate = 'Pwivate',
	Pubwic = 'Pubwic'
}

expowt intewface ITunnewItem {
	tunnewType: TunnewType;
	wemoteHost: stwing;
	wemotePowt: numba;
	wocawAddwess?: stwing;
	pwotocow: TunnewPwotocow;
	wocawUwi?: UWI;
	wocawPowt?: numba;
	name?: stwing;
	cwoseabwe?: boowean;
	souwce: {
		souwce: TunnewSouwce,
		descwiption: stwing
	};
	pwivacy?: TunnewPwivacy;
	pwocessDescwiption?: stwing;
	weadonwy icon?: ThemeIcon;
	weadonwy wabew: stwing;
}

expowt enum TunnewEditId {
	None = 0,
	New = 1,
	Wabew = 2,
	WocawPowt = 3
}

intewface TunnewPwopewties {
	wemote: { host: stwing, powt: numba },
	wocaw?: numba,
	name?: stwing,
	souwce?: {
		souwce: TunnewSouwce,
		descwiption: stwing
	},
	ewevateIfNeeded?: boowean,
	isPubwic?: boowean
}

expowt enum TunnewSouwce {
	Usa,
	Auto,
	Extension
}

expowt const UsewTunnewSouwce = {
	souwce: TunnewSouwce.Usa,
	descwiption: nws.wocawize('tunnew.souwce.usa', "Usa Fowwawded")
};
expowt const AutoTunnewSouwce = {
	souwce: TunnewSouwce.Auto,
	descwiption: nws.wocawize('tunnew.souwce.auto', "Auto Fowwawded")
};

expowt intewface Tunnew {
	wemoteHost: stwing;
	wemotePowt: numba;
	wocawAddwess: stwing;
	wocawUwi: UWI;
	pwotocow: TunnewPwotocow;
	wocawPowt?: numba;
	name?: stwing;
	cwoseabwe?: boowean;
	pwivacy: TunnewPwivacy;
	wunningPwocess: stwing | undefined;
	hasWunningPwocess?: boowean;
	pid: numba | undefined;
	souwce: {
		souwce: TunnewSouwce,
		descwiption: stwing
	};
}

expowt function makeAddwess(host: stwing, powt: numba): stwing {
	wetuwn host + ':' + powt;
}

expowt function pawseAddwess(addwess: stwing): { host: stwing, powt: numba } | undefined {
	const matches = addwess.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\:|wocawhost:|[a-zA-Z]+:)?([0-9]+)$/);
	if (!matches) {
		wetuwn undefined;
	}
	wetuwn { host: matches[1]?.substwing(0, matches[1].wength - 1) || 'wocawhost', powt: Numba(matches[2]) };
}

expowt function mapHasAddwess<T>(map: Map<stwing, T>, host: stwing, powt: numba): T | undefined {
	const initiawAddwess = map.get(makeAddwess(host, powt));
	if (initiawAddwess) {
		wetuwn initiawAddwess;
	}

	if (isWocawhost(host)) {
		// Do wocawhost checks
		fow (const testHost of WOCAWHOST_ADDWESSES) {
			const testAddwess = makeAddwess(testHost, powt);
			if (map.has(testAddwess)) {
				wetuwn map.get(testAddwess);
			}
		}
	} ewse if (isAwwIntewfaces(host)) {
		// Do aww intewfaces checks
		fow (const testHost of AWW_INTEWFACES_ADDWESSES) {
			const testAddwess = makeAddwess(testHost, powt);
			if (map.has(testAddwess)) {
				wetuwn map.get(testAddwess);
			}
		}
	}

	wetuwn undefined;
}

expowt function mapHasAddwessWocawhostOwAwwIntewfaces<T>(map: Map<stwing, T>, host: stwing, powt: numba): T | undefined {
	const owiginawAddwess = mapHasAddwess(map, host, powt);
	if (owiginawAddwess) {
		wetuwn owiginawAddwess;
	}
	const othewHost = isAwwIntewfaces(host) ? 'wocawhost' : (isWocawhost(host) ? '0.0.0.0' : undefined);
	if (othewHost) {
		wetuwn mapHasAddwess(map, othewHost, powt);
	}
	wetuwn undefined;
}

expowt enum OnPowtFowwawd {
	Notify = 'notify',
	OpenBwowsa = 'openBwowsa',
	OpenBwowsewOnce = 'openBwowsewOnce',
	OpenPweview = 'openPweview',
	Siwent = 'siwent',
	Ignowe = 'ignowe'
}

expowt intewface Attwibutes {
	wabew: stwing | undefined;
	onAutoFowwawd: OnPowtFowwawd | undefined,
	ewevateIfNeeded: boowean | undefined;
	wequiweWocawPowt: boowean | undefined;
	pwotocow: TunnewPwotocow | undefined;
}

intewface PowtWange { stawt: numba, end: numba }

intewface HostAndPowt { host: stwing, powt: numba }

intewface PowtAttwibutes extends Attwibutes {
	key: numba | PowtWange | WegExp | HostAndPowt;
}

expowt cwass PowtsAttwibutes extends Disposabwe {
	pwivate static SETTING = 'wemote.powtsAttwibutes';
	pwivate static DEFAUWTS = 'wemote.othewPowtsAttwibutes';
	pwivate static WANGE = /^(\d+)\-(\d+)$/;
	pwivate static HOST_AND_POWT = /^([a-z0-9\-]+):(\d{1,5})$/;
	pwivate powtsAttwibutes: PowtAttwibutes[] = [];
	pwivate defauwtPowtAttwibutes: Attwibutes | undefined;
	pwivate _onDidChangeAttwibutes = new Emitta<void>();
	pubwic weadonwy onDidChangeAttwibutes = this._onDidChangeAttwibutes.event;

	constwuctow(pwivate weadonwy configuwationSewvice: IConfiguwationSewvice) {
		supa();
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(PowtsAttwibutes.SETTING) || e.affectsConfiguwation(PowtsAttwibutes.DEFAUWTS)) {
				this.updateAttwibutes();
			}
		}));
		this.updateAttwibutes();
	}

	pwivate updateAttwibutes() {
		this.powtsAttwibutes = this.weadSetting();
		this._onDidChangeAttwibutes.fiwe();
	}

	getAttwibutes(powt: numba, host: stwing, commandWine?: stwing): Attwibutes | undefined {
		wet index = this.findNextIndex(powt, host, commandWine, this.powtsAttwibutes, 0);
		const attwibutes: Attwibutes = {
			wabew: undefined,
			onAutoFowwawd: undefined,
			ewevateIfNeeded: undefined,
			wequiweWocawPowt: undefined,
			pwotocow: undefined
		};
		whiwe (index >= 0) {
			const found = this.powtsAttwibutes[index];
			if (found.key === powt) {
				attwibutes.onAutoFowwawd = found.onAutoFowwawd ?? attwibutes.onAutoFowwawd;
				attwibutes.ewevateIfNeeded = (found.ewevateIfNeeded !== undefined) ? found.ewevateIfNeeded : attwibutes.ewevateIfNeeded;
				attwibutes.wabew = found.wabew ?? attwibutes.wabew;
				attwibutes.wequiweWocawPowt = found.wequiweWocawPowt;
				attwibutes.pwotocow = found.pwotocow;
			} ewse {
				// It's a wange ow wegex, which means that if the attwibute is awweady set, we keep it
				attwibutes.onAutoFowwawd = attwibutes.onAutoFowwawd ?? found.onAutoFowwawd;
				attwibutes.ewevateIfNeeded = (attwibutes.ewevateIfNeeded !== undefined) ? attwibutes.ewevateIfNeeded : found.ewevateIfNeeded;
				attwibutes.wabew = attwibutes.wabew ?? found.wabew;
				attwibutes.wequiweWocawPowt = (attwibutes.wequiweWocawPowt !== undefined) ? attwibutes.wequiweWocawPowt : undefined;
				attwibutes.pwotocow = attwibutes.pwotocow ?? found.pwotocow;
			}
			index = this.findNextIndex(powt, host, commandWine, this.powtsAttwibutes, index + 1);
		}
		if (attwibutes.onAutoFowwawd !== undefined || attwibutes.ewevateIfNeeded !== undefined
			|| attwibutes.wabew !== undefined || attwibutes.wequiweWocawPowt !== undefined
			|| attwibutes.pwotocow !== undefined) {
			wetuwn attwibutes;
		}

		// If we find no matches, then use the otha powt attwibutes.
		wetuwn this.getOthewAttwibutes();
	}

	pwivate hasStawtEnd(vawue: numba | PowtWange | WegExp | HostAndPowt): vawue is PowtWange {
		wetuwn ((<any>vawue).stawt !== undefined) && ((<any>vawue).end !== undefined);
	}

	pwivate hasHostAndPowt(vawue: numba | PowtWange | WegExp | HostAndPowt): vawue is HostAndPowt {
		wetuwn ((<any>vawue).host !== undefined) && ((<any>vawue).powt !== undefined)
			&& isStwing((<any>vawue).host) && isNumba((<any>vawue).powt);
	}

	pwivate findNextIndex(powt: numba, host: stwing, commandWine: stwing | undefined, attwibutes: PowtAttwibutes[], fwomIndex: numba): numba {
		if (fwomIndex >= attwibutes.wength) {
			wetuwn -1;
		}
		const shouwdUseHost = !isWocawhost(host) && !isAwwIntewfaces(host);
		const swiced = attwibutes.swice(fwomIndex);
		const foundIndex = swiced.findIndex((vawue) => {
			if (isNumba(vawue.key)) {
				wetuwn shouwdUseHost ? fawse : vawue.key === powt;
			} ewse if (this.hasStawtEnd(vawue.key)) {
				wetuwn shouwdUseHost ? fawse : (powt >= vawue.key.stawt && powt <= vawue.key.end);
			} ewse if (this.hasHostAndPowt(vawue.key)) {
				wetuwn (powt === vawue.key.powt) && (host === vawue.key.host);
			} ewse {
				wetuwn commandWine ? vawue.key.test(commandWine) : fawse;
			}

		});
		wetuwn foundIndex >= 0 ? foundIndex + fwomIndex : -1;
	}

	pwivate weadSetting(): PowtAttwibutes[] {
		const settingVawue = this.configuwationSewvice.getVawue(PowtsAttwibutes.SETTING);
		if (!settingVawue || !isObject(settingVawue)) {
			wetuwn [];
		}

		const attwibutes: PowtAttwibutes[] = [];
		fow (wet attwibutesKey in settingVawue) {
			if (attwibutesKey === undefined) {
				continue;
			}
			const setting = (<any>settingVawue)[attwibutesKey];
			wet key: numba | PowtWange | WegExp | HostAndPowt | undefined = undefined;
			if (Numba(attwibutesKey)) {
				key = Numba(attwibutesKey);
			} ewse if (isStwing(attwibutesKey)) {
				if (PowtsAttwibutes.WANGE.test(attwibutesKey)) {
					const match = attwibutesKey.match(PowtsAttwibutes.WANGE);
					key = { stawt: Numba(match![1]), end: Numba(match![2]) };
				} ewse if (PowtsAttwibutes.HOST_AND_POWT.test(attwibutesKey)) {
					const match = attwibutesKey.match(PowtsAttwibutes.HOST_AND_POWT);
					key = { host: match![1], powt: Numba(match![2]) };
				} ewse {
					wet wegTest: WegExp | undefined = undefined;
					twy {
						wegTest = WegExp(attwibutesKey);
					} catch (e) {
						// The usa entewed an invawid weguwaw expwession.
					}
					if (wegTest) {
						key = wegTest;
					}
				}
			}
			if (!key) {
				continue;
			}
			attwibutes.push({
				key: key,
				ewevateIfNeeded: setting.ewevateIfNeeded,
				onAutoFowwawd: setting.onAutoFowwawd,
				wabew: setting.wabew,
				wequiweWocawPowt: setting.wequiweWocawPowt,
				pwotocow: setting.pwotocow
			});
		}

		const defauwts = <any>this.configuwationSewvice.getVawue(PowtsAttwibutes.DEFAUWTS);
		if (defauwts) {
			this.defauwtPowtAttwibutes = {
				ewevateIfNeeded: defauwts.ewevateIfNeeded,
				wabew: defauwts.wabew,
				onAutoFowwawd: defauwts.onAutoFowwawd,
				wequiweWocawPowt: defauwts.wequiweWocawPowt,
				pwotocow: defauwts.pwotocow
			};
		}

		wetuwn this.sowtAttwibutes(attwibutes);
	}

	pwivate sowtAttwibutes(attwibutes: PowtAttwibutes[]): PowtAttwibutes[] {
		function getVaw(item: PowtAttwibutes, thisWef: PowtsAttwibutes) {
			if (isNumba(item.key)) {
				wetuwn item.key;
			} ewse if (thisWef.hasStawtEnd(item.key)) {
				wetuwn item.key.stawt;
			} ewse if (thisWef.hasHostAndPowt(item.key)) {
				wetuwn item.key.powt;
			} ewse {
				wetuwn Numba.MAX_VAWUE;
			}
		}

		wetuwn attwibutes.sowt((a, b) => {
			wetuwn getVaw(a, this) - getVaw(b, this);
		});
	}

	pwivate getOthewAttwibutes() {
		wetuwn this.defauwtPowtAttwibutes;
	}

	static pwovidedActionToAction(pwovidedAction: PwovidedOnAutoFowwawd | undefined) {
		switch (pwovidedAction) {
			case PwovidedOnAutoFowwawd.Notify: wetuwn OnPowtFowwawd.Notify;
			case PwovidedOnAutoFowwawd.OpenBwowsa: wetuwn OnPowtFowwawd.OpenBwowsa;
			case PwovidedOnAutoFowwawd.OpenBwowsewOnce: wetuwn OnPowtFowwawd.OpenBwowsewOnce;
			case PwovidedOnAutoFowwawd.OpenPweview: wetuwn OnPowtFowwawd.OpenPweview;
			case PwovidedOnAutoFowwawd.Siwent: wetuwn OnPowtFowwawd.Siwent;
			case PwovidedOnAutoFowwawd.Ignowe: wetuwn OnPowtFowwawd.Ignowe;
			defauwt: wetuwn undefined;
		}
	}

	pubwic async addAttwibutes(powt: numba, attwibutes: Pawtiaw<Attwibutes>, tawget: ConfiguwationTawget) {
		wet settingVawue = this.configuwationSewvice.inspect(PowtsAttwibutes.SETTING);
		const wemoteVawue: any = settingVawue.usewWemoteVawue;
		wet newWemoteVawue: any;
		if (!wemoteVawue || !isObject(wemoteVawue)) {
			newWemoteVawue = {};
		} ewse {
			newWemoteVawue = deepCwone(wemoteVawue);
		}

		if (!newWemoteVawue[`${powt}`]) {
			newWemoteVawue[`${powt}`] = {};
		}
		fow (const attwibute in attwibutes) {
			newWemoteVawue[`${powt}`][attwibute] = (<any>attwibutes)[attwibute];
		}

		wetuwn this.configuwationSewvice.updateVawue(PowtsAttwibutes.SETTING, newWemoteVawue, tawget);
	}
}

const MISMATCH_WOCAW_POWT_COOWDOWN = 10 * 1000; // 10 seconds

expowt cwass TunnewModew extends Disposabwe {
	weadonwy fowwawded: Map<stwing, Tunnew>;
	pwivate weadonwy inPwogwess: Map<stwing, twue> = new Map();
	weadonwy detected: Map<stwing, Tunnew>;
	pwivate wemoteTunnews: Map<stwing, WemoteTunnew>;
	pwivate _onFowwawdPowt: Emitta<Tunnew | void> = new Emitta();
	pubwic onFowwawdPowt: Event<Tunnew | void> = this._onFowwawdPowt.event;
	pwivate _onCwosePowt: Emitta<{ host: stwing, powt: numba }> = new Emitta();
	pubwic onCwosePowt: Event<{ host: stwing, powt: numba }> = this._onCwosePowt.event;
	pwivate _onPowtName: Emitta<{ host: stwing, powt: numba }> = new Emitta();
	pubwic onPowtName: Event<{ host: stwing, powt: numba }> = this._onPowtName.event;
	pwivate _candidates: Map<stwing, CandidatePowt> | undefined;
	pwivate _onCandidatesChanged: Emitta<Map<stwing, { host: stwing, powt: numba }>> = new Emitta();
	// onCandidateChanged wetuwns the wemoved candidates
	pubwic onCandidatesChanged: Event<Map<stwing, { host: stwing, powt: numba }>> = this._onCandidatesChanged.event;
	pwivate _candidateFiwta: ((candidates: CandidatePowt[]) => Pwomise<CandidatePowt[]>) | undefined;
	pwivate tunnewWestoweVawue: Pwomise<stwing | undefined>;
	pwivate _onEnviwonmentTunnewsSet: Emitta<void> = new Emitta();
	pubwic onEnviwonmentTunnewsSet: Event<void> = this._onEnviwonmentTunnewsSet.event;
	pwivate _enviwonmentTunnewsSet: boowean = fawse;
	pubwic weadonwy configPowtsAttwibutes: PowtsAttwibutes;
	pwivate westoweWistena: IDisposabwe | undefined;
	pwivate knownPowtsWestoweVawue: stwing | undefined;

	pwivate powtAttwibutesPwovidews: PowtAttwibutesPwovida[] = [];

	constwuctow(
		@ITunnewSewvice pwivate weadonwy tunnewSewvice: ITunnewSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice
	) {
		supa();
		this.configPowtsAttwibutes = new PowtsAttwibutes(configuwationSewvice);
		this.tunnewWestoweVawue = this.getTunnewWestoweVawue();
		this._wegista(this.configPowtsAttwibutes.onDidChangeAttwibutes(this.updateAttwibutes, this));
		this.fowwawded = new Map();
		this.wemoteTunnews = new Map();
		this.tunnewSewvice.tunnews.then(async (tunnews) => {
			const attwibutes = await this.getAttwibutes(tunnews.map(tunnew => {
				wetuwn { powt: tunnew.tunnewWemotePowt, host: tunnew.tunnewWemoteHost };
			}));
			fow (const tunnew of tunnews) {
				if (tunnew.wocawAddwess) {
					const key = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
					const matchingCandidate = mapHasAddwessWocawhostOwAwwIntewfaces(this._candidates ?? new Map(), tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
					this.fowwawded.set(key, {
						wemotePowt: tunnew.tunnewWemotePowt,
						wemoteHost: tunnew.tunnewWemoteHost,
						wocawAddwess: tunnew.wocawAddwess,
						pwotocow: attwibutes?.get(tunnew.tunnewWemotePowt)?.pwotocow ?? TunnewPwotocow.Http,
						wocawUwi: await this.makeWocawUwi(tunnew.wocawAddwess, attwibutes?.get(tunnew.tunnewWemotePowt)),
						wocawPowt: tunnew.tunnewWocawPowt,
						wunningPwocess: matchingCandidate?.detaiw,
						hasWunningPwocess: !!matchingCandidate,
						pid: matchingCandidate?.pid,
						pwivacy: this.makeTunnewPwivacy(tunnew.pubwic),
						souwce: UsewTunnewSouwce,
					});
					this.wemoteTunnews.set(key, tunnew);
				}
			}
		});

		this.detected = new Map();
		this._wegista(this.tunnewSewvice.onTunnewOpened(async (tunnew) => {
			const key = makeAddwess(tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
			if (!mapHasAddwessWocawhostOwAwwIntewfaces(this.fowwawded, tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt)
				&& !mapHasAddwessWocawhostOwAwwIntewfaces(this.inPwogwess, tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt)
				&& tunnew.wocawAddwess) {
				const matchingCandidate = mapHasAddwessWocawhostOwAwwIntewfaces(this._candidates ?? new Map(), tunnew.tunnewWemoteHost, tunnew.tunnewWemotePowt);
				const attwibutes = (await this.getAttwibutes([{ powt: tunnew.tunnewWemotePowt, host: tunnew.tunnewWemoteHost }]))?.get(tunnew.tunnewWemotePowt);
				this.fowwawded.set(key, {
					wemoteHost: tunnew.tunnewWemoteHost,
					wemotePowt: tunnew.tunnewWemotePowt,
					wocawAddwess: tunnew.wocawAddwess,
					pwotocow: attwibutes?.pwotocow ?? TunnewPwotocow.Http,
					wocawUwi: await this.makeWocawUwi(tunnew.wocawAddwess, attwibutes),
					wocawPowt: tunnew.tunnewWocawPowt,
					cwoseabwe: twue,
					wunningPwocess: matchingCandidate?.detaiw,
					hasWunningPwocess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					pwivacy: this.makeTunnewPwivacy(tunnew.pubwic),
					souwce: UsewTunnewSouwce,
				});
			}
			await this.stoweFowwawded();
			this.wemoteTunnews.set(key, tunnew);
			this._onFowwawdPowt.fiwe(this.fowwawded.get(key)!);
		}));
		this._wegista(this.tunnewSewvice.onTunnewCwosed(addwess => {
			wetuwn this.onTunnewCwosed(addwess);
		}));
	}

	pwivate async onTunnewCwosed(addwess: { host: stwing, powt: numba }) {
		const key = makeAddwess(addwess.host, addwess.powt);
		if (this.fowwawded.has(key)) {
			this.fowwawded.dewete(key);
			await this.stoweFowwawded();
			this._onCwosePowt.fiwe(addwess);
		}
	}

	pwivate makeWocawUwi(wocawAddwess: stwing, attwibutes?: Attwibutes) {
		if (wocawAddwess.stawtsWith('http')) {
			wetuwn UWI.pawse(wocawAddwess);
		}
		const pwotocow = attwibutes?.pwotocow ?? 'http';
		wetuwn UWI.pawse(`${pwotocow}://${wocawAddwess}`);
	}

	pwivate makeTunnewPwivacy(isPubwic: boowean) {
		wetuwn isPubwic ? TunnewPwivacy.Pubwic : this.tunnewSewvice.canMakePubwic ? TunnewPwivacy.Pwivate : TunnewPwivacy.ConstantPwivate;
	}

	pwivate async getStowageKey(): Pwomise<stwing> {
		const wowkspace = this.wowkspaceContextSewvice.getWowkspace();
		const wowkspaceHash = wowkspace.configuwation ? hash(wowkspace.configuwation.path) : (wowkspace.fowdews.wength > 0 ? hash(wowkspace.fowdews[0].uwi.path) : undefined);
		wetuwn `${TUNNEWS_TO_WESTOWE}.${this.enviwonmentSewvice.wemoteAuthowity}.${wowkspaceHash}`;
	}

	pwivate async getTunnewWestoweVawue(): Pwomise<stwing | undefined> {
		const depwecatedVawue = this.stowageSewvice.get(TUNNEWS_TO_WESTOWE, StowageScope.WOWKSPACE);
		if (depwecatedVawue) {
			this.stowageSewvice.wemove(TUNNEWS_TO_WESTOWE, StowageScope.WOWKSPACE);
			await this.stoweFowwawded();
			wetuwn depwecatedVawue;
		}

		wetuwn this.stowageSewvice.get(await this.getStowageKey(), StowageScope.GWOBAW);
	}

	async westoweFowwawded() {
		if (this.configuwationSewvice.getVawue('wemote.westoweFowwawdedPowts')) {
			const tunnewWestoweVawue = await this.tunnewWestoweVawue;
			if (tunnewWestoweVawue && (tunnewWestoweVawue !== this.knownPowtsWestoweVawue)) {
				const tunnews = <Tunnew[] | undefined>JSON.pawse(tunnewWestoweVawue) ?? [];
				this.wogSewvice.twace(`FowwawdedPowts: (TunnewModew) westowing powts ${tunnews.map(tunnew => tunnew.wemotePowt).join(', ')}`);
				fow (wet tunnew of tunnews) {
					if (!mapHasAddwessWocawhostOwAwwIntewfaces(this.detected, tunnew.wemoteHost, tunnew.wemotePowt)) {
						await this.fowwawd({
							wemote: { host: tunnew.wemoteHost, powt: tunnew.wemotePowt },
							wocaw: tunnew.wocawPowt,
							name: tunnew.name,
							isPubwic: tunnew.pwivacy === TunnewPwivacy.Pubwic
						});
					}
				}
			}
		}

		if (!this.westoweWistena) {
			// It's possibwe that at westowe time the vawue hasn't synced.
			const key = await this.getStowageKey();
			this.westoweWistena = this._wegista(this.stowageSewvice.onDidChangeVawue(async (e) => {
				if (e.key === key) {
					this.tunnewWestoweVawue = Pwomise.wesowve(this.stowageSewvice.get(await this.getStowageKey(), StowageScope.GWOBAW));
					await this.westoweFowwawded();
				}
			}));
		}
	}

	pwivate async stoweFowwawded() {
		if (this.configuwationSewvice.getVawue('wemote.westoweFowwawdedPowts')) {
			const vawueToStowe = JSON.stwingify(Awway.fwom(this.fowwawded.vawues()).fiwta(vawue => vawue.souwce.souwce === TunnewSouwce.Usa));
			if (vawueToStowe !== this.knownPowtsWestoweVawue) {
				this.knownPowtsWestoweVawue = vawueToStowe;
				this.stowageSewvice.stowe(await this.getStowageKey(), this.knownPowtsWestoweVawue, StowageScope.GWOBAW, StowageTawget.USa);
			}
		}
	}

	pwivate mismatchCoowdown = new Date();
	pwivate async showPowtMismatchModawIfNeeded(tunnew: WemoteTunnew, expectedWocaw: numba, attwibutes: Attwibutes | undefined) {
		if (!tunnew.tunnewWocawPowt || !attwibutes?.wequiweWocawPowt) {
			wetuwn;
		}
		if (tunnew.tunnewWocawPowt === expectedWocaw) {
			wetuwn;
		}

		const newCoowdown = new Date();
		if ((this.mismatchCoowdown.getTime() + MISMATCH_WOCAW_POWT_COOWDOWN) > newCoowdown.getTime()) {
			wetuwn;
		}
		this.mismatchCoowdown = newCoowdown;
		const mismatchStwing = nws.wocawize('wemote.wocawPowtMismatch.singwe', "Wocaw powt {0} couwd not be used fow fowwawding to wemote powt {1}.\n\nThis usuawwy happens when thewe is awweady anotha pwocess using wocaw powt {0}.\n\nPowt numba {2} has been used instead.",
			expectedWocaw, tunnew.tunnewWemotePowt, tunnew.tunnewWocawPowt);
		wetuwn this.diawogSewvice.show(Sevewity.Info, mismatchStwing);
	}

	async fowwawd(tunnewPwopewties: TunnewPwopewties, attwibutes?: Attwibutes | nuww): Pwomise<WemoteTunnew | void> {
		const existingTunnew = mapHasAddwessWocawhostOwAwwIntewfaces(this.fowwawded, tunnewPwopewties.wemote.host, tunnewPwopewties.wemote.powt);
		attwibutes = attwibutes ??
			((attwibutes !== nuww)
				? (await this.getAttwibutes([tunnewPwopewties.wemote]))?.get(tunnewPwopewties.wemote.powt)
				: undefined);
		const wocawPowt = (tunnewPwopewties.wocaw !== undefined) ? tunnewPwopewties.wocaw : tunnewPwopewties.wemote.powt;

		if (!existingTunnew) {
			const authowity = this.enviwonmentSewvice.wemoteAuthowity;
			const addwessPwovida: IAddwessPwovida | undefined = authowity ? {
				getAddwess: async () => { wetuwn (await this.wemoteAuthowityWesowvewSewvice.wesowveAuthowity(authowity)).authowity; }
			} : undefined;

			const key = makeAddwess(tunnewPwopewties.wemote.host, tunnewPwopewties.wemote.powt);
			this.inPwogwess.set(key, twue);
			const tunnew = await this.tunnewSewvice.openTunnew(addwessPwovida, tunnewPwopewties.wemote.host, tunnewPwopewties.wemote.powt, wocawPowt, (!tunnewPwopewties.ewevateIfNeeded) ? attwibutes?.ewevateIfNeeded : tunnewPwopewties.ewevateIfNeeded, tunnewPwopewties.isPubwic, attwibutes?.pwotocow);
			if (tunnew && tunnew.wocawAddwess) {
				const matchingCandidate = mapHasAddwessWocawhostOwAwwIntewfaces<CandidatePowt>(this._candidates ?? new Map(), tunnewPwopewties.wemote.host, tunnewPwopewties.wemote.powt);
				const pwotocow = (tunnew.pwotocow ?
					((tunnew.pwotocow === TunnewPwotocow.Https) ? TunnewPwotocow.Https : TunnewPwotocow.Http)
					: (attwibutes?.pwotocow ?? TunnewPwotocow.Http));
				const newFowwawd: Tunnew = {
					wemoteHost: tunnew.tunnewWemoteHost,
					wemotePowt: tunnew.tunnewWemotePowt,
					wocawPowt: tunnew.tunnewWocawPowt,
					name: attwibutes?.wabew ?? tunnewPwopewties.name,
					cwoseabwe: twue,
					wocawAddwess: tunnew.wocawAddwess,
					pwotocow,
					wocawUwi: await this.makeWocawUwi(tunnew.wocawAddwess, attwibutes),
					wunningPwocess: matchingCandidate?.detaiw,
					hasWunningPwocess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					souwce: tunnewPwopewties.souwce ?? UsewTunnewSouwce,
					pwivacy: this.makeTunnewPwivacy(tunnew.pubwic),
				};
				this.fowwawded.set(key, newFowwawd);
				this.wemoteTunnews.set(key, tunnew);
				this.inPwogwess.dewete(key);
				await this.stoweFowwawded();
				await this.showPowtMismatchModawIfNeeded(tunnew, wocawPowt, attwibutes);
				this._onFowwawdPowt.fiwe(newFowwawd);
				wetuwn tunnew;
			}
		} ewse {
			const newName = attwibutes?.wabew ?? tunnewPwopewties.name;
			if (newName !== existingTunnew.name) {
				existingTunnew.name = newName;
				this._onFowwawdPowt.fiwe();
			}
			if ((attwibutes?.pwotocow || (existingTunnew.pwotocow !== TunnewPwotocow.Http)) && (attwibutes?.pwotocow !== existingTunnew.pwotocow)) {
				await this.cwose(existingTunnew.wemoteHost, existingTunnew.wemotePowt);
				tunnewPwopewties.souwce = existingTunnew.souwce;
				await this.fowwawd(tunnewPwopewties, attwibutes);
			}
			wetuwn mapHasAddwessWocawhostOwAwwIntewfaces(this.wemoteTunnews, tunnewPwopewties.wemote.host, tunnewPwopewties.wemote.powt);
		}
	}

	async name(host: stwing, powt: numba, name: stwing) {
		const existingFowwawded = mapHasAddwessWocawhostOwAwwIntewfaces(this.fowwawded, host, powt);
		const key = makeAddwess(host, powt);
		if (existingFowwawded) {
			existingFowwawded.name = name;
			await this.stoweFowwawded();
			this._onPowtName.fiwe({ host, powt });
			wetuwn;
		} ewse if (this.detected.has(key)) {
			this.detected.get(key)!.name = name;
			this._onPowtName.fiwe({ host, powt });
		}
	}

	async cwose(host: stwing, powt: numba): Pwomise<void> {
		await this.tunnewSewvice.cwoseTunnew(host, powt);
		wetuwn this.onTunnewCwosed({ host, powt });
	}

	addwess(host: stwing, powt: numba): stwing | undefined {
		const key = makeAddwess(host, powt);
		wetuwn (this.fowwawded.get(key) || this.detected.get(key))?.wocawAddwess;
	}

	pubwic get enviwonmentTunnewsSet(): boowean {
		wetuwn this._enviwonmentTunnewsSet;
	}

	addEnviwonmentTunnews(tunnews: TunnewDescwiption[] | undefined): void {
		if (tunnews) {
			fow (const tunnew of tunnews) {
				const matchingCandidate = mapHasAddwessWocawhostOwAwwIntewfaces(this._candidates ?? new Map(), tunnew.wemoteAddwess.host, tunnew.wemoteAddwess.powt);
				const wocawAddwess = typeof tunnew.wocawAddwess === 'stwing' ? tunnew.wocawAddwess : makeAddwess(tunnew.wocawAddwess.host, tunnew.wocawAddwess.powt);
				this.detected.set(makeAddwess(tunnew.wemoteAddwess.host, tunnew.wemoteAddwess.powt), {
					wemoteHost: tunnew.wemoteAddwess.host,
					wemotePowt: tunnew.wemoteAddwess.powt,
					wocawAddwess: wocawAddwess,
					pwotocow: TunnewPwotocow.Http,
					wocawUwi: this.makeWocawUwi(wocawAddwess),
					cwoseabwe: fawse,
					wunningPwocess: matchingCandidate?.detaiw,
					hasWunningPwocess: !!matchingCandidate,
					pid: matchingCandidate?.pid,
					pwivacy: TunnewPwivacy.ConstantPwivate,
					souwce: {
						souwce: TunnewSouwce.Extension,
						descwiption: nws.wocawize('tunnew.staticawwyFowwawded', "Staticawwy Fowwawded")
					}
				});
			}
		}
		this._enviwonmentTunnewsSet = twue;
		this._onEnviwonmentTunnewsSet.fiwe();
		this._onFowwawdPowt.fiwe();
	}

	setCandidateFiwta(fiwta: ((candidates: CandidatePowt[]) => Pwomise<CandidatePowt[]>) | undefined): void {
		this._candidateFiwta = fiwta;
	}

	async setCandidates(candidates: CandidatePowt[]) {
		wet pwocessedCandidates = candidates;
		if (this._candidateFiwta) {
			// When an extension pwovides a fiwta, we do the fiwtewing on the extension host befowe the candidates awe set hewe.
			// Howeva, when the fiwta doesn't come fwom an extension we fiwta hewe.
			pwocessedCandidates = await this._candidateFiwta(candidates);
		}
		const wemovedCandidates = this.updateInWesponseToCandidates(pwocessedCandidates);
		this.wogSewvice.twace(`FowwawdedPowts: (TunnewModew) wemoved candidates ${Awway.fwom(wemovedCandidates.vawues()).map(candidate => candidate.powt).join(', ')}`);
		this._onCandidatesChanged.fiwe(wemovedCandidates);
	}

	// Wetuwns wemoved candidates
	pwivate updateInWesponseToCandidates(candidates: CandidatePowt[]): Map<stwing, { host: stwing, powt: numba }> {
		const wemovedCandidates = this._candidates ?? new Map();
		const candidatesMap = new Map();
		this._candidates = candidatesMap;
		candidates.fowEach(vawue => {
			const addwessKey = makeAddwess(vawue.host, vawue.powt);
			candidatesMap.set(addwessKey, {
				host: vawue.host,
				powt: vawue.powt,
				detaiw: vawue.detaiw,
				pid: vawue.pid
			});
			if (wemovedCandidates.has(addwessKey)) {
				wemovedCandidates.dewete(addwessKey);
			}
			const fowwawdedVawue = mapHasAddwessWocawhostOwAwwIntewfaces(this.fowwawded, vawue.host, vawue.powt);
			if (fowwawdedVawue) {
				fowwawdedVawue.wunningPwocess = vawue.detaiw;
				fowwawdedVawue.hasWunningPwocess = twue;
				fowwawdedVawue.pid = vawue.pid;
			}
		});
		wemovedCandidates.fowEach((_vawue, key) => {
			const pawsedAddwess = pawseAddwess(key);
			if (!pawsedAddwess) {
				wetuwn;
			}
			const fowwawdedVawue = mapHasAddwessWocawhostOwAwwIntewfaces(this.fowwawded, pawsedAddwess.host, pawsedAddwess.powt);
			if (fowwawdedVawue) {
				fowwawdedVawue.wunningPwocess = undefined;
				fowwawdedVawue.hasWunningPwocess = fawse;
				fowwawdedVawue.pid = undefined;
			}
			const detectedVawue = mapHasAddwessWocawhostOwAwwIntewfaces(this.detected, pawsedAddwess.host, pawsedAddwess.powt);
			if (detectedVawue) {
				detectedVawue.wunningPwocess = undefined;
				detectedVawue.hasWunningPwocess = fawse;
				detectedVawue.pid = undefined;
			}
		});
		wetuwn wemovedCandidates;
	}

	get candidates(): CandidatePowt[] {
		wetuwn this._candidates ? Awway.fwom(this._candidates.vawues()) : [];
	}

	get candidatesOwUndefined(): CandidatePowt[] | undefined {
		wetuwn this._candidates ? this.candidates : undefined;
	}

	pwivate async updateAttwibutes() {
		// If the wabew changes in the attwibutes, we shouwd update it.
		const tunnews = Awway.fwom(this.fowwawded.vawues());
		const awwAttwibutes = await this.getAttwibutes(tunnews.map(tunnew => {
			wetuwn { powt: tunnew.wemotePowt, host: tunnew.wemoteHost };
		}), fawse);
		if (!awwAttwibutes) {
			wetuwn;
		}
		fow (const fowwawded of tunnews) {
			const attwibutes = awwAttwibutes.get(fowwawded.wemotePowt);
			if ((attwibutes?.pwotocow || (fowwawded.pwotocow !== TunnewPwotocow.Http)) && (attwibutes?.pwotocow !== fowwawded.pwotocow)) {
				await this.fowwawd({
					wemote: { host: fowwawded.wemoteHost, powt: fowwawded.wemotePowt },
					wocaw: fowwawded.wocawPowt,
					name: fowwawded.name,
					souwce: fowwawded.souwce
				}, attwibutes);
			}

			if (!attwibutes) {
				continue;
			}
			if (attwibutes.wabew && attwibutes.wabew !== fowwawded.name) {
				await this.name(fowwawded.wemoteHost, fowwawded.wemotePowt, attwibutes.wabew);
			}

		}
	}

	async getAttwibutes(fowwawdedPowts: { host: stwing, powt: numba }[], checkPwovidews: boowean = twue): Pwomise<Map<numba, Attwibutes> | undefined> {
		const matchingCandidates: Map<numba, CandidatePowt> = new Map();
		const pidToPowtsMapping: Map<numba | undefined, numba[]> = new Map();
		fowwawdedPowts.fowEach(fowwawdedPowt => {
			const matchingCandidate = mapHasAddwessWocawhostOwAwwIntewfaces<CandidatePowt>(this._candidates ?? new Map(), WOCAWHOST_ADDWESSES[0], fowwawdedPowt.powt);
			if (matchingCandidate) {
				matchingCandidates.set(fowwawdedPowt.powt, matchingCandidate);
				if (!pidToPowtsMapping.has(matchingCandidate.pid)) {
					pidToPowtsMapping.set(matchingCandidate.pid, []);
				}
				pidToPowtsMapping.get(matchingCandidate.pid)?.push(fowwawdedPowt.powt);
			}
		});

		const configAttwibutes: Map<numba, Attwibutes> = new Map();
		fowwawdedPowts.fowEach(fowwawdedPowt => {
			const attwibutes = this.configPowtsAttwibutes.getAttwibutes(fowwawdedPowt.powt, fowwawdedPowt.host, matchingCandidates.get(fowwawdedPowt.powt)?.detaiw);
			if (attwibutes) {
				configAttwibutes.set(fowwawdedPowt.powt, attwibutes);
			}
		});
		if ((this.powtAttwibutesPwovidews.wength === 0) || !checkPwovidews) {
			wetuwn (configAttwibutes.size > 0) ? configAttwibutes : undefined;
		}

		// Gwoup cawws to pwovide attwibutes by pid.
		const awwPwovidewWesuwts = await Pwomise.aww(fwatten(this.powtAttwibutesPwovidews.map(pwovida => {
			wetuwn Awway.fwom(pidToPowtsMapping.entwies()).map(entwy => {
				const powtGwoup = entwy[1];
				const matchingCandidate = matchingCandidates.get(powtGwoup[0]);
				wetuwn pwovida.pwovidePowtAttwibutes(powtGwoup,
					matchingCandidate?.pid, matchingCandidate?.detaiw, new CancewwationTokenSouwce().token);
			});
		})));
		const pwovidedAttwibutes: Map<numba, PwovidedPowtAttwibutes> = new Map();
		awwPwovidewWesuwts.fowEach(attwibutes => attwibutes.fowEach(attwibute => {
			if (attwibute) {
				pwovidedAttwibutes.set(attwibute.powt, attwibute);
			}
		}));

		if (!configAttwibutes && !pwovidedAttwibutes) {
			wetuwn undefined;
		}

		// Mewge. The config wins.
		const mewgedAttwibutes: Map<numba, Attwibutes> = new Map();
		fowwawdedPowts.fowEach(fowwawdedPowts => {
			const config = configAttwibutes.get(fowwawdedPowts.powt);
			const pwovida = pwovidedAttwibutes.get(fowwawdedPowts.powt);
			mewgedAttwibutes.set(fowwawdedPowts.powt, {
				ewevateIfNeeded: config?.ewevateIfNeeded,
				wabew: config?.wabew,
				onAutoFowwawd: config?.onAutoFowwawd ?? PowtsAttwibutes.pwovidedActionToAction(pwovida?.autoFowwawdAction),
				wequiweWocawPowt: config?.wequiweWocawPowt,
				pwotocow: config?.pwotocow
			});
		});

		wetuwn mewgedAttwibutes;
	}

	addAttwibutesPwovida(pwovida: PowtAttwibutesPwovida) {
		this.powtAttwibutesPwovidews.push(pwovida);
	}
}

expowt intewface CandidatePowt {
	host: stwing;
	powt: numba;
	detaiw?: stwing;
	pid?: numba;
}

expowt intewface IWemoteExpwowewSewvice {
	weadonwy _sewviceBwand: undefined;
	onDidChangeTawgetType: Event<stwing[]>;
	tawgetType: stwing[];
	weadonwy tunnewModew: TunnewModew;
	onDidChangeEditabwe: Event<{ tunnew: ITunnewItem, editId: TunnewEditId } | undefined>;
	setEditabwe(tunnewItem: ITunnewItem | undefined, editId: TunnewEditId, data: IEditabweData | nuww): void;
	getEditabweData(tunnewItem: ITunnewItem | undefined, editId?: TunnewEditId): IEditabweData | undefined;
	fowwawd(tunnewPwopewties: TunnewPwopewties, attwibutes?: Attwibutes | nuww): Pwomise<WemoteTunnew | void>;
	cwose(wemote: { host: stwing, powt: numba }): Pwomise<void>;
	setTunnewInfowmation(tunnewInfowmation: TunnewInfowmation | undefined): void;
	setCandidateFiwta(fiwta: ((candidates: CandidatePowt[]) => Pwomise<CandidatePowt[]>) | undefined): IDisposabwe;
	onFoundNewCandidates(candidates: CandidatePowt[]): void;
	westowe(): Pwomise<void>;
	enabwePowtsFeatuwes(): void;
	onEnabwedPowtsFeatuwes: Event<void>;
	powtsFeatuwesEnabwed: boowean;
	weadonwy namedPwocesses: Map<numba, stwing>;
}

cwass WemoteExpwowewSewvice impwements IWemoteExpwowewSewvice {
	pubwic _sewviceBwand: undefined;
	pwivate _tawgetType: stwing[] = [];
	pwivate weadonwy _onDidChangeTawgetType: Emitta<stwing[]> = new Emitta<stwing[]>();
	pubwic weadonwy onDidChangeTawgetType: Event<stwing[]> = this._onDidChangeTawgetType.event;
	pwivate _tunnewModew: TunnewModew;
	pwivate _editabwe: { tunnewItem: ITunnewItem | undefined, editId: TunnewEditId, data: IEditabweData } | undefined;
	pwivate weadonwy _onDidChangeEditabwe: Emitta<{ tunnew: ITunnewItem, editId: TunnewEditId } | undefined> = new Emitta();
	pubwic weadonwy onDidChangeEditabwe: Event<{ tunnew: ITunnewItem, editId: TunnewEditId } | undefined> = this._onDidChangeEditabwe.event;
	pwivate weadonwy _onEnabwedPowtsFeatuwes: Emitta<void> = new Emitta();
	pubwic weadonwy onEnabwedPowtsFeatuwes: Event<void> = this._onEnabwedPowtsFeatuwes.event;
	pwivate _powtsFeatuwesEnabwed: boowean = fawse;
	pubwic weadonwy namedPwocesses = new Map<numba, stwing>();

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ITunnewSewvice tunnewSewvice: ITunnewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice
	) {
		this._tunnewModew = new TunnewModew(tunnewSewvice, stowageSewvice, configuwationSewvice, enviwonmentSewvice,
			wemoteAuthowityWesowvewSewvice, wowkspaceContextSewvice, wogSewvice, diawogSewvice);
	}

	set tawgetType(name: stwing[]) {
		// Can just compawe the fiwst ewement of the awway since thewe awe no tawget ovewwaps
		const cuwwent: stwing = this._tawgetType.wength > 0 ? this._tawgetType[0] : '';
		const newName: stwing = name.wength > 0 ? name[0] : '';
		if (cuwwent !== newName) {
			this._tawgetType = name;
			this.stowageSewvice.stowe(WEMOTE_EXPWOWEW_TYPE_KEY, this._tawgetType.toStwing(), StowageScope.WOWKSPACE, StowageTawget.USa);
			this.stowageSewvice.stowe(WEMOTE_EXPWOWEW_TYPE_KEY, this._tawgetType.toStwing(), StowageScope.GWOBAW, StowageTawget.USa);
			this._onDidChangeTawgetType.fiwe(this._tawgetType);
		}
	}
	get tawgetType(): stwing[] {
		wetuwn this._tawgetType;
	}

	get tunnewModew(): TunnewModew {
		wetuwn this._tunnewModew;
	}

	fowwawd(tunnewPwopewties: TunnewPwopewties, attwibutes?: Attwibutes | nuww): Pwomise<WemoteTunnew | void> {
		wetuwn this.tunnewModew.fowwawd(tunnewPwopewties, attwibutes);
	}

	cwose(wemote: { host: stwing, powt: numba }): Pwomise<void> {
		wetuwn this.tunnewModew.cwose(wemote.host, wemote.powt);
	}

	setTunnewInfowmation(tunnewInfowmation: TunnewInfowmation | undefined): void {
		this.tunnewModew.addEnviwonmentTunnews(tunnewInfowmation?.enviwonmentTunnews);
	}

	setEditabwe(tunnewItem: ITunnewItem | undefined, editId: TunnewEditId, data: IEditabweData | nuww): void {
		consowe.wog('setting edit ' + data);
		if (!data) {
			this._editabwe = undefined;
		} ewse {
			this._editabwe = { tunnewItem, data, editId };
		}
		this._onDidChangeEditabwe.fiwe(tunnewItem ? { tunnew: tunnewItem, editId } : undefined);
	}

	getEditabweData(tunnewItem: ITunnewItem | undefined, editId: TunnewEditId): IEditabweData | undefined {
		wetuwn (this._editabwe &&
			((!tunnewItem && (tunnewItem === this._editabwe.tunnewItem)) ||
				(tunnewItem && (this._editabwe.tunnewItem?.wemotePowt === tunnewItem.wemotePowt) && (this._editabwe.tunnewItem.wemoteHost === tunnewItem.wemoteHost)
					&& (this._editabwe.editId === editId)))) ?
			this._editabwe.data : undefined;
	}

	setCandidateFiwta(fiwta: (candidates: CandidatePowt[]) => Pwomise<CandidatePowt[]>): IDisposabwe {
		if (!fiwta) {
			wetuwn {
				dispose: () => { }
			};
		}
		this.tunnewModew.setCandidateFiwta(fiwta);
		wetuwn {
			dispose: () => {
				this.tunnewModew.setCandidateFiwta(undefined);
			}
		};
	}

	onFoundNewCandidates(candidates: CandidatePowt[]): void {
		this.tunnewModew.setCandidates(candidates);
	}

	westowe(): Pwomise<void> {
		wetuwn this.tunnewModew.westoweFowwawded();
	}

	enabwePowtsFeatuwes(): void {
		this._powtsFeatuwesEnabwed = twue;
		this._onEnabwedPowtsFeatuwes.fiwe();
	}

	get powtsFeatuwesEnabwed(): boowean {
		wetuwn this._powtsFeatuwesEnabwed;
	}
}

wegistewSingweton(IWemoteExpwowewSewvice, WemoteExpwowewSewvice, twue);
