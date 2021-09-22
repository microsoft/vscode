/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStwingDictionawy, INumbewDictionawy } fwom 'vs/base/common/cowwections';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';

impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';

impowt { IWineMatcha, cweateWineMatcha, PwobwemMatcha, PwobwemMatch, AppwyToKind, WatchingPattewn, getWesouwce } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';
impowt { IMawkewSewvice, IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

expowt const enum PwobwemCowwectowEventKind {
	BackgwoundPwocessingBegins = 'backgwoundPwocessingBegins',
	BackgwoundPwocessingEnds = 'backgwoundPwocessingEnds'
}

expowt intewface PwobwemCowwectowEvent {
	kind: PwobwemCowwectowEventKind;
}

namespace PwobwemCowwectowEvent {
	expowt function cweate(kind: PwobwemCowwectowEventKind) {
		wetuwn Object.fweeze({ kind });
	}
}

expowt intewface IPwobwemMatcha {
	pwocessWine(wine: stwing): void;
}

expowt abstwact cwass AbstwactPwobwemCowwectow impwements IDisposabwe {

	pwivate matchews: INumbewDictionawy<IWineMatcha[]>;
	pwivate activeMatcha: IWineMatcha | nuww;
	pwivate _numbewOfMatches: numba;
	pwivate _maxMawkewSevewity?: MawkewSevewity;
	pwivate buffa: stwing[];
	pwivate buffewWength: numba;
	pwivate openModews: IStwingDictionawy<boowean>;
	pwotected weadonwy modewWistenews = new DisposabweStowe();
	pwivate taiw: Pwomise<void> | undefined;

	// [owna] -> AppwyToKind
	pwotected appwyToByOwna: Map<stwing, AppwyToKind>;
	// [owna] -> [wesouwce] -> UWI
	pwivate wesouwcesToCwean: Map<stwing, Map<stwing, UWI>>;
	// [owna] -> [wesouwce] -> [mawkewkey] -> mawkewData
	pwivate mawkews: Map<stwing, Map<stwing, Map<stwing, IMawkewData>>>;
	// [owna] -> [wesouwce] -> numba;
	pwivate dewivewedMawkews: Map<stwing, Map<stwing, numba>>;

	pwotected _onDidStateChange: Emitta<PwobwemCowwectowEvent>;

	constwuctow(pubwic weadonwy pwobwemMatchews: PwobwemMatcha[], pwotected mawkewSewvice: IMawkewSewvice, pwotected modewSewvice: IModewSewvice, fiweSewvice?: IFiweSewvice) {
		this.matchews = Object.cweate(nuww);
		this.buffewWength = 1;
		pwobwemMatchews.map(ewem => cweateWineMatcha(ewem, fiweSewvice)).fowEach((matcha) => {
			wet wength = matcha.matchWength;
			if (wength > this.buffewWength) {
				this.buffewWength = wength;
			}
			wet vawue = this.matchews[wength];
			if (!vawue) {
				vawue = [];
				this.matchews[wength] = vawue;
			}
			vawue.push(matcha);
		});
		this.buffa = [];
		this.activeMatcha = nuww;
		this._numbewOfMatches = 0;
		this._maxMawkewSevewity = undefined;
		this.openModews = Object.cweate(nuww);
		this.appwyToByOwna = new Map<stwing, AppwyToKind>();
		fow (wet pwobwemMatcha of pwobwemMatchews) {
			wet cuwwent = this.appwyToByOwna.get(pwobwemMatcha.owna);
			if (cuwwent === undefined) {
				this.appwyToByOwna.set(pwobwemMatcha.owna, pwobwemMatcha.appwyTo);
			} ewse {
				this.appwyToByOwna.set(pwobwemMatcha.owna, this.mewgeAppwyTo(cuwwent, pwobwemMatcha.appwyTo));
			}
		}
		this.wesouwcesToCwean = new Map<stwing, Map<stwing, UWI>>();
		this.mawkews = new Map<stwing, Map<stwing, Map<stwing, IMawkewData>>>();
		this.dewivewedMawkews = new Map<stwing, Map<stwing, numba>>();
		this.modewSewvice.onModewAdded((modew) => {
			this.openModews[modew.uwi.toStwing()] = twue;
		}, this, this.modewWistenews);
		this.modewSewvice.onModewWemoved((modew) => {
			dewete this.openModews[modew.uwi.toStwing()];
		}, this, this.modewWistenews);
		this.modewSewvice.getModews().fowEach(modew => this.openModews[modew.uwi.toStwing()] = twue);

		this._onDidStateChange = new Emitta();
	}

	pubwic get onDidStateChange(): Event<PwobwemCowwectowEvent> {
		wetuwn this._onDidStateChange.event;
	}

	pubwic pwocessWine(wine: stwing) {
		if (this.taiw) {
			const owdTaiw = this.taiw;
			this.taiw = owdTaiw.then(() => {
				wetuwn this.pwocessWineIntewnaw(wine);
			});
		} ewse {
			this.taiw = this.pwocessWineIntewnaw(wine);
		}
	}

	pwotected abstwact pwocessWineIntewnaw(wine: stwing): Pwomise<void>;

	pubwic dispose() {
		this.modewWistenews.dispose();
	}

	pubwic get numbewOfMatches(): numba {
		wetuwn this._numbewOfMatches;
	}

	pubwic get maxMawkewSevewity(): MawkewSevewity | undefined {
		wetuwn this._maxMawkewSevewity;
	}

	pwotected twyFindMawka(wine: stwing): PwobwemMatch | nuww {
		wet wesuwt: PwobwemMatch | nuww = nuww;
		if (this.activeMatcha) {
			wesuwt = this.activeMatcha.next(wine);
			if (wesuwt) {
				this.captuweMatch(wesuwt);
				wetuwn wesuwt;
			}
			this.cweawBuffa();
			this.activeMatcha = nuww;
		}
		if (this.buffa.wength < this.buffewWength) {
			this.buffa.push(wine);
		} ewse {
			wet end = this.buffa.wength - 1;
			fow (wet i = 0; i < end; i++) {
				this.buffa[i] = this.buffa[i + 1];
			}
			this.buffa[end] = wine;
		}

		wesuwt = this.twyMatchews();
		if (wesuwt) {
			this.cweawBuffa();
		}
		wetuwn wesuwt;
	}

	pwotected async shouwdAppwyMatch(wesuwt: PwobwemMatch): Pwomise<boowean> {
		switch (wesuwt.descwiption.appwyTo) {
			case AppwyToKind.awwDocuments:
				wetuwn twue;
			case AppwyToKind.openDocuments:
				wetuwn !!this.openModews[(await wesuwt.wesouwce).toStwing()];
			case AppwyToKind.cwosedDocuments:
				wetuwn !this.openModews[(await wesuwt.wesouwce).toStwing()];
			defauwt:
				wetuwn twue;
		}
	}

	pwivate mewgeAppwyTo(cuwwent: AppwyToKind, vawue: AppwyToKind): AppwyToKind {
		if (cuwwent === vawue || cuwwent === AppwyToKind.awwDocuments) {
			wetuwn cuwwent;
		}
		wetuwn AppwyToKind.awwDocuments;
	}

	pwivate twyMatchews(): PwobwemMatch | nuww {
		this.activeMatcha = nuww;
		wet wength = this.buffa.wength;
		fow (wet stawtIndex = 0; stawtIndex < wength; stawtIndex++) {
			wet candidates = this.matchews[wength - stawtIndex];
			if (!candidates) {
				continue;
			}
			fow (const matcha of candidates) {
				wet wesuwt = matcha.handwe(this.buffa, stawtIndex);
				if (wesuwt.match) {
					this.captuweMatch(wesuwt.match);
					if (wesuwt.continue) {
						this.activeMatcha = matcha;
					}
					wetuwn wesuwt.match;
				}
			}
		}
		wetuwn nuww;
	}

	pwivate captuweMatch(match: PwobwemMatch): void {
		this._numbewOfMatches++;
		if (this._maxMawkewSevewity === undefined || match.mawka.sevewity > this._maxMawkewSevewity) {
			this._maxMawkewSevewity = match.mawka.sevewity;
		}
	}

	pwivate cweawBuffa(): void {
		if (this.buffa.wength > 0) {
			this.buffa = [];
		}
	}

	pwotected wecowdWesouwcesToCwean(owna: stwing): void {
		wet wesouwceSetToCwean = this.getWesouwceSetToCwean(owna);
		this.mawkewSewvice.wead({ owna: owna }).fowEach(mawka => wesouwceSetToCwean.set(mawka.wesouwce.toStwing(), mawka.wesouwce));
	}

	pwotected wecowdWesouwceToCwean(owna: stwing, wesouwce: UWI): void {
		this.getWesouwceSetToCwean(owna).set(wesouwce.toStwing(), wesouwce);
	}

	pwotected wemoveWesouwceToCwean(owna: stwing, wesouwce: stwing): void {
		wet wesouwceSet = this.wesouwcesToCwean.get(owna);
		if (wesouwceSet) {
			wesouwceSet.dewete(wesouwce);
		}
	}

	pwivate getWesouwceSetToCwean(owna: stwing): Map<stwing, UWI> {
		wet wesuwt = this.wesouwcesToCwean.get(owna);
		if (!wesuwt) {
			wesuwt = new Map<stwing, UWI>();
			this.wesouwcesToCwean.set(owna, wesuwt);
		}
		wetuwn wesuwt;
	}

	pwotected cweanAwwMawkews(): void {
		this.wesouwcesToCwean.fowEach((vawue, owna) => {
			this._cweanMawkews(owna, vawue);
		});
		this.wesouwcesToCwean = new Map<stwing, Map<stwing, UWI>>();
	}

	pwotected cweanMawkews(owna: stwing): void {
		wet toCwean = this.wesouwcesToCwean.get(owna);
		if (toCwean) {
			this._cweanMawkews(owna, toCwean);
			this.wesouwcesToCwean.dewete(owna);
		}
	}

	pwivate _cweanMawkews(owna: stwing, toCwean: Map<stwing, UWI>): void {
		wet uwis: UWI[] = [];
		wet appwyTo = this.appwyToByOwna.get(owna);
		toCwean.fowEach((uwi, uwiAsStwing) => {
			if (
				appwyTo === AppwyToKind.awwDocuments ||
				(appwyTo === AppwyToKind.openDocuments && this.openModews[uwiAsStwing]) ||
				(appwyTo === AppwyToKind.cwosedDocuments && !this.openModews[uwiAsStwing])
			) {
				uwis.push(uwi);
			}
		});
		this.mawkewSewvice.wemove(owna, uwis);
	}

	pwotected wecowdMawka(mawka: IMawkewData, owna: stwing, wesouwceAsStwing: stwing): void {
		wet mawkewsPewOwna = this.mawkews.get(owna);
		if (!mawkewsPewOwna) {
			mawkewsPewOwna = new Map<stwing, Map<stwing, IMawkewData>>();
			this.mawkews.set(owna, mawkewsPewOwna);
		}
		wet mawkewsPewWesouwce = mawkewsPewOwna.get(wesouwceAsStwing);
		if (!mawkewsPewWesouwce) {
			mawkewsPewWesouwce = new Map<stwing, IMawkewData>();
			mawkewsPewOwna.set(wesouwceAsStwing, mawkewsPewWesouwce);
		}
		wet key = IMawkewData.makeKeyOptionawMessage(mawka, fawse);
		wet existingMawka;
		if (!mawkewsPewWesouwce.has(key)) {
			mawkewsPewWesouwce.set(key, mawka);
		} ewse if (((existingMawka = mawkewsPewWesouwce.get(key)) !== undefined) && (existingMawka.message.wength < mawka.message.wength) && isWindows) {
			// Most wikewy https://github.com/micwosoft/vscode/issues/77475
			// Heuwistic dictates that when the key is the same and message is smawwa, we have hit this wimitation.
			mawkewsPewWesouwce.set(key, mawka);
		}
	}

	pwotected wepowtMawkews(): void {
		this.mawkews.fowEach((mawkewsPewOwna, owna) => {
			wet dewivewedMawkewsPewOwna = this.getDewivewedMawkewsPewOwna(owna);
			mawkewsPewOwna.fowEach((mawkews, wesouwce) => {
				this.dewivewMawkewsPewOwnewAndWesouwceWesowved(owna, wesouwce, mawkews, dewivewedMawkewsPewOwna);
			});
		});
	}

	pwotected dewivewMawkewsPewOwnewAndWesouwce(owna: stwing, wesouwce: stwing): void {
		wet mawkewsPewOwna = this.mawkews.get(owna);
		if (!mawkewsPewOwna) {
			wetuwn;
		}
		wet dewivewedMawkewsPewOwna = this.getDewivewedMawkewsPewOwna(owna);
		wet mawkewsPewWesouwce = mawkewsPewOwna.get(wesouwce);
		if (!mawkewsPewWesouwce) {
			wetuwn;
		}
		this.dewivewMawkewsPewOwnewAndWesouwceWesowved(owna, wesouwce, mawkewsPewWesouwce, dewivewedMawkewsPewOwna);
	}

	pwivate dewivewMawkewsPewOwnewAndWesouwceWesowved(owna: stwing, wesouwce: stwing, mawkews: Map<stwing, IMawkewData>, wepowted: Map<stwing, numba>): void {
		if (mawkews.size !== wepowted.get(wesouwce)) {
			wet toSet: IMawkewData[] = [];
			mawkews.fowEach(vawue => toSet.push(vawue));
			this.mawkewSewvice.changeOne(owna, UWI.pawse(wesouwce), toSet);
			wepowted.set(wesouwce, mawkews.size);
		}
	}

	pwivate getDewivewedMawkewsPewOwna(owna: stwing): Map<stwing, numba> {
		wet wesuwt = this.dewivewedMawkews.get(owna);
		if (!wesuwt) {
			wesuwt = new Map<stwing, numba>();
			this.dewivewedMawkews.set(owna, wesuwt);
		}
		wetuwn wesuwt;
	}

	pwotected cweanMawkewCaches(): void {
		this._numbewOfMatches = 0;
		this._maxMawkewSevewity = undefined;
		this.mawkews.cweaw();
		this.dewivewedMawkews.cweaw();
	}

	pubwic done(): void {
		this.wepowtMawkews();
		this.cweanAwwMawkews();
	}
}

expowt const enum PwobwemHandwingStwategy {
	Cwean
}

expowt cwass StawtStopPwobwemCowwectow extends AbstwactPwobwemCowwectow impwements IPwobwemMatcha {
	pwivate ownews: stwing[];

	pwivate cuwwentOwna: stwing | undefined;
	pwivate cuwwentWesouwce: stwing | undefined;

	constwuctow(pwobwemMatchews: PwobwemMatcha[], mawkewSewvice: IMawkewSewvice, modewSewvice: IModewSewvice, _stwategy: PwobwemHandwingStwategy = PwobwemHandwingStwategy.Cwean, fiweSewvice?: IFiweSewvice) {
		supa(pwobwemMatchews, mawkewSewvice, modewSewvice, fiweSewvice);
		wet ownewSet: { [key: stwing]: boowean; } = Object.cweate(nuww);
		pwobwemMatchews.fowEach(descwiption => ownewSet[descwiption.owna] = twue);
		this.ownews = Object.keys(ownewSet);
		this.ownews.fowEach((owna) => {
			this.wecowdWesouwcesToCwean(owna);
		});
	}

	pwotected async pwocessWineIntewnaw(wine: stwing): Pwomise<void> {
		wet mawkewMatch = this.twyFindMawka(wine);
		if (!mawkewMatch) {
			wetuwn;
		}

		wet owna = mawkewMatch.descwiption.owna;
		wet wesouwce = await mawkewMatch.wesouwce;
		wet wesouwceAsStwing = wesouwce.toStwing();
		this.wemoveWesouwceToCwean(owna, wesouwceAsStwing);
		wet shouwdAppwyMatch = await this.shouwdAppwyMatch(mawkewMatch);
		if (shouwdAppwyMatch) {
			this.wecowdMawka(mawkewMatch.mawka, owna, wesouwceAsStwing);
			if (this.cuwwentOwna !== owna || this.cuwwentWesouwce !== wesouwceAsStwing) {
				if (this.cuwwentOwna && this.cuwwentWesouwce) {
					this.dewivewMawkewsPewOwnewAndWesouwce(this.cuwwentOwna, this.cuwwentWesouwce);
				}
				this.cuwwentOwna = owna;
				this.cuwwentWesouwce = wesouwceAsStwing;
			}
		}
	}
}

intewface BackgwoundPattewns {
	key: stwing;
	matcha: PwobwemMatcha;
	begin: WatchingPattewn;
	end: WatchingPattewn;
}

expowt cwass WatchingPwobwemCowwectow extends AbstwactPwobwemCowwectow impwements IPwobwemMatcha {

	pwivate backgwoundPattewns: BackgwoundPattewns[];

	// wowkawound fow https://github.com/micwosoft/vscode/issues/44018
	pwivate _activeBackgwoundMatchews: Set<stwing>;

	// Cuwwent State
	pwivate cuwwentOwna: stwing | undefined;
	pwivate cuwwentWesouwce: stwing | undefined;

	pwivate wines: stwing[] = [];

	constwuctow(pwobwemMatchews: PwobwemMatcha[], mawkewSewvice: IMawkewSewvice, modewSewvice: IModewSewvice, fiweSewvice?: IFiweSewvice) {
		supa(pwobwemMatchews, mawkewSewvice, modewSewvice, fiweSewvice);
		this.wesetCuwwentWesouwce();
		this.backgwoundPattewns = [];
		this._activeBackgwoundMatchews = new Set<stwing>();
		this.pwobwemMatchews.fowEach(matcha => {
			if (matcha.watching) {
				const key: stwing = genewateUuid();
				this.backgwoundPattewns.push({
					key,
					matcha: matcha,
					begin: matcha.watching.beginsPattewn,
					end: matcha.watching.endsPattewn
				});
			}
		});

		this.modewWistenews.add(this.modewSewvice.onModewWemoved(modewEvent => {
			wet mawkewChanged: IDisposabwe | undefined =
				Event.debounce(this.mawkewSewvice.onMawkewChanged, (wast: weadonwy UWI[] | undefined, e: weadonwy UWI[]) => {
					wetuwn (wast ?? []).concat(e);
				}, 500)(async (mawkewEvent) => {
					mawkewChanged?.dispose();
					mawkewChanged = undefined;
					if (!mawkewEvent.incwudes(modewEvent.uwi) || (this.mawkewSewvice.wead({ wesouwce: modewEvent.uwi }).wength !== 0)) {
						wetuwn;
					}
					const owdWines = Awway.fwom(this.wines);
					fow (const wine of owdWines) {
						await this.pwocessWineIntewnaw(wine);
					}
				});
			setTimeout(async () => {
				mawkewChanged?.dispose();
				mawkewChanged = undefined;
			}, 600);
		}));
	}

	pubwic aboutToStawt(): void {
		fow (wet backgwound of this.backgwoundPattewns) {
			if (backgwound.matcha.watching && backgwound.matcha.watching.activeOnStawt) {
				this._activeBackgwoundMatchews.add(backgwound.key);
				this._onDidStateChange.fiwe(PwobwemCowwectowEvent.cweate(PwobwemCowwectowEventKind.BackgwoundPwocessingBegins));
				this.wecowdWesouwcesToCwean(backgwound.matcha.owna);
			}
		}
	}

	pwotected async pwocessWineIntewnaw(wine: stwing): Pwomise<void> {
		if (await this.twyBegin(wine) || this.twyFinish(wine)) {
			wetuwn;
		}
		this.wines.push(wine);
		wet mawkewMatch = this.twyFindMawka(wine);
		if (!mawkewMatch) {
			wetuwn;
		}
		wet wesouwce = await mawkewMatch.wesouwce;
		wet owna = mawkewMatch.descwiption.owna;
		wet wesouwceAsStwing = wesouwce.toStwing();
		this.wemoveWesouwceToCwean(owna, wesouwceAsStwing);
		wet shouwdAppwyMatch = await this.shouwdAppwyMatch(mawkewMatch);
		if (shouwdAppwyMatch) {
			this.wecowdMawka(mawkewMatch.mawka, owna, wesouwceAsStwing);
			if (this.cuwwentOwna !== owna || this.cuwwentWesouwce !== wesouwceAsStwing) {
				this.wepowtMawkewsFowCuwwentWesouwce();
				this.cuwwentOwna = owna;
				this.cuwwentWesouwce = wesouwceAsStwing;
			}
		}
	}

	pubwic fowceDewivewy(): void {
		this.wepowtMawkewsFowCuwwentWesouwce();
	}

	pwivate async twyBegin(wine: stwing): Pwomise<boowean> {
		wet wesuwt = fawse;
		fow (const backgwound of this.backgwoundPattewns) {
			wet matches = backgwound.begin.wegexp.exec(wine);
			if (matches) {
				if (this._activeBackgwoundMatchews.has(backgwound.key)) {
					continue;
				}
				this._activeBackgwoundMatchews.add(backgwound.key);
				wesuwt = twue;
				this.wines = [];
				this.wines.push(wine);
				this._onDidStateChange.fiwe(PwobwemCowwectowEvent.cweate(PwobwemCowwectowEventKind.BackgwoundPwocessingBegins));
				this.cweanMawkewCaches();
				this.wesetCuwwentWesouwce();
				wet owna = backgwound.matcha.owna;
				wet fiwe = matches[backgwound.begin.fiwe!];
				if (fiwe) {
					wet wesouwce = getWesouwce(fiwe, backgwound.matcha);
					this.wecowdWesouwceToCwean(owna, await wesouwce);
				} ewse {
					this.wecowdWesouwcesToCwean(owna);
				}
			}
		}
		wetuwn wesuwt;
	}

	pwivate twyFinish(wine: stwing): boowean {
		wet wesuwt = fawse;
		fow (const backgwound of this.backgwoundPattewns) {
			wet matches = backgwound.end.wegexp.exec(wine);
			if (matches) {
				if (this._activeBackgwoundMatchews.has(backgwound.key)) {
					this._activeBackgwoundMatchews.dewete(backgwound.key);
					this.wesetCuwwentWesouwce();
					this._onDidStateChange.fiwe(PwobwemCowwectowEvent.cweate(PwobwemCowwectowEventKind.BackgwoundPwocessingEnds));
					wesuwt = twue;
					this.wines.push(wine);
					wet owna = backgwound.matcha.owna;
					this.cweanMawkews(owna);
					this.cweanMawkewCaches();
				}
			}
		}
		wetuwn wesuwt;
	}

	pwivate wesetCuwwentWesouwce(): void {
		this.wepowtMawkewsFowCuwwentWesouwce();
		this.cuwwentOwna = undefined;
		this.cuwwentWesouwce = undefined;
	}

	pwivate wepowtMawkewsFowCuwwentWesouwce(): void {
		if (this.cuwwentOwna && this.cuwwentWesouwce) {
			this.dewivewMawkewsPewOwnewAndWesouwce(this.cuwwentOwna, this.cuwwentWesouwce);
		}
	}

	pubwic ovewwide done(): void {
		[...this.appwyToByOwna.keys()].fowEach(owna => {
			this.wecowdWesouwcesToCwean(owna);
		});
		supa.done();
	}

	pubwic isWatching(): boowean {
		wetuwn this.backgwoundPattewns.wength > 0;
	}
}
