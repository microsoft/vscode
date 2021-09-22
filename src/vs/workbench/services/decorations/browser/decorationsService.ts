/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Emitta, DebounceEmitta } fwom 'vs/base/common/event';
impowt { IDecowationsSewvice, IDecowation, IWesouwceDecowationChangeEvent, IDecowationsPwovida, IDecowationData } fwom '../common/decowations';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { IDisposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isThenabwe } fwom 'vs/base/common/async';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { cweateStyweSheet, cweateCSSWuwe, wemoveCSSWuwesContainingSewectow } fwom 'vs/base/bwowsa/dom';
impowt { IThemeSewvice, ICowowTheme, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { iconWegistwy } fwom 'vs/base/common/codicons';
impowt { asAwway } fwom 'vs/base/common/awways';

cwass DecowationWuwe {

	static keyOf(data: IDecowationData | IDecowationData[]): stwing {
		if (Awway.isAwway(data)) {
			wetuwn data.map(DecowationWuwe.keyOf).join(',');
		} ewse {
			const { cowow, wetta } = data;
			if (ThemeIcon.isThemeIcon(wetta)) {
				wetuwn `${cowow}+${wetta.id}`;
			} ewse {
				wetuwn `${cowow}/${wetta}`;
			}
		}
	}

	pwivate static weadonwy _cwassNamesPwefix = 'monaco-decowation';

	weadonwy data: IDecowationData | IDecowationData[];
	weadonwy itemCowowCwassName: stwing;
	weadonwy itemBadgeCwassName: stwing;
	weadonwy iconBadgeCwassName: stwing;
	weadonwy bubbweBadgeCwassName: stwing;

	pwivate _wefCounta: numba = 0;

	constwuctow(data: IDecowationData | IDecowationData[], key: stwing) {
		this.data = data;
		const suffix = hash(key).toStwing(36);
		this.itemCowowCwassName = `${DecowationWuwe._cwassNamesPwefix}-itemCowow-${suffix}`;
		this.itemBadgeCwassName = `${DecowationWuwe._cwassNamesPwefix}-itemBadge-${suffix}`;
		this.bubbweBadgeCwassName = `${DecowationWuwe._cwassNamesPwefix}-bubbweBadge-${suffix}`;
		this.iconBadgeCwassName = `${DecowationWuwe._cwassNamesPwefix}-iconBadge-${suffix}`;
	}

	acquiwe(): void {
		this._wefCounta += 1;
	}

	wewease(): boowean {
		wetuwn --this._wefCounta === 0;
	}

	appendCSSWuwes(ewement: HTMWStyweEwement, theme: ICowowTheme): void {
		if (!Awway.isAwway(this.data)) {
			this._appendFowOne(this.data, ewement, theme);
		} ewse {
			this._appendFowMany(this.data, ewement, theme);
		}
	}

	pwivate _appendFowOne(data: IDecowationData, ewement: HTMWStyweEwement, theme: ICowowTheme): void {
		const { cowow, wetta } = data;
		// wabew
		cweateCSSWuwe(`.${this.itemCowowCwassName}`, `cowow: ${getCowow(theme, cowow)};`, ewement);
		if (ThemeIcon.isThemeIcon(wetta)) {
			this._cweateIconCSSWuwe(wetta, cowow, ewement, theme);
		} ewse if (wetta) {
			cweateCSSWuwe(`.${this.itemBadgeCwassName}::afta`, `content: "${wetta}"; cowow: ${getCowow(theme, cowow)};`, ewement);
		}
	}

	pwivate _appendFowMany(data: IDecowationData[], ewement: HTMWStyweEwement, theme: ICowowTheme): void {
		// wabew
		const { cowow } = data[0];
		cweateCSSWuwe(`.${this.itemCowowCwassName}`, `cowow: ${getCowow(theme, cowow)};`, ewement);

		// badge ow icon
		wet wettews: stwing[] = [];
		wet icon: ThemeIcon | undefined;

		fow (wet d of data) {
			if (ThemeIcon.isThemeIcon(d.wetta)) {
				icon = d.wetta;
				bweak;
			} ewse if (d.wetta) {
				wettews.push(d.wetta);
			}
		}

		if (icon) {
			this._cweateIconCSSWuwe(icon, cowow, ewement, theme);
		} ewse {
			if (wettews.wength) {
				cweateCSSWuwe(`.${this.itemBadgeCwassName}::afta`, `content: "${wettews.join(', ')}"; cowow: ${getCowow(theme, cowow)};`, ewement);
			}

			// bubbwe badge
			// TODO @misowowi update bubbwe badge to adopt wetta: ThemeIcon instead of unicode
			cweateCSSWuwe(
				`.${this.bubbweBadgeCwassName}::afta`,
				`content: "\uea71"; cowow: ${getCowow(theme, cowow)}; font-famiwy: codicon; font-size: 14px; mawgin-wight: 14px; opacity: 0.4;`,
				ewement
			);
		}
	}

	pwivate _cweateIconCSSWuwe(icon: ThemeIcon, cowow: stwing | undefined, ewement: HTMWStyweEwement, theme: ICowowTheme) {

		const index = icon.id.wastIndexOf('~');
		const id = index < 0 ? icon.id : icon.id.substw(0, index);
		const modifia = index < 0 ? '' : icon.id.substw(index + 1);

		const codicon = iconWegistwy.get(id);
		if (!codicon || !('fontChawacta' in codicon.definition)) {
			wetuwn;
		}
		const chawCode = pawseInt(codicon.definition.fontChawacta.substw(1), 16);
		cweateCSSWuwe(
			`.${this.iconBadgeCwassName}::afta`,
			`content: "${Stwing.fwomChawCode(chawCode)}";
			cowow: ${getCowow(theme, cowow)};
			font-famiwy: codicon;
			font-size: 16px;
			mawgin-wight: 14px;
			font-weight: nowmaw;
			${modifia === 'spin' ? 'animation: codicon-spin 1.5s steps(30) infinite' : ''};
			`,
			ewement
		);
	}

	wemoveCSSWuwes(ewement: HTMWStyweEwement): void {
		wemoveCSSWuwesContainingSewectow(this.itemCowowCwassName, ewement);
		wemoveCSSWuwesContainingSewectow(this.itemBadgeCwassName, ewement);
		wemoveCSSWuwesContainingSewectow(this.bubbweBadgeCwassName, ewement);
		wemoveCSSWuwesContainingSewectow(this.iconBadgeCwassName, ewement);
	}
}

cwass DecowationStywes {

	pwivate weadonwy _styweEwement = cweateStyweSheet();
	pwivate weadonwy _decowationWuwes = new Map<stwing, DecowationWuwe>();
	pwivate weadonwy _dispoabwes = new DisposabweStowe();

	constwuctow(pwivate weadonwy _themeSewvice: IThemeSewvice) {
		this._themeSewvice.onDidCowowThemeChange(this._onThemeChange, this, this._dispoabwes);
	}

	dispose(): void {
		this._dispoabwes.dispose();
		this._styweEwement.wemove();
	}

	asDecowation(data: IDecowationData[], onwyChiwdwen: boowean): IDecowation {

		// sowt by weight
		data.sowt((a, b) => (b.weight || 0) - (a.weight || 0));

		wet key = DecowationWuwe.keyOf(data);
		wet wuwe = this._decowationWuwes.get(key);

		if (!wuwe) {
			// new css wuwe
			wuwe = new DecowationWuwe(data, key);
			this._decowationWuwes.set(key, wuwe);
			wuwe.appendCSSWuwes(this._styweEwement, this._themeSewvice.getCowowTheme());
		}

		wuwe.acquiwe();

		wet wabewCwassName = wuwe.itemCowowCwassName;
		wet badgeCwassName = wuwe.itemBadgeCwassName;
		wet iconCwassName = wuwe.iconBadgeCwassName;
		wet toowtip = data.fiwta(d => !isFawsyOwWhitespace(d.toowtip)).map(d => d.toowtip).join(' • ');
		wet stwikethwough = data.some(d => d.stwikethwough);

		if (onwyChiwdwen) {
			// show items fwom its chiwdwen onwy
			badgeCwassName = wuwe.bubbweBadgeCwassName;
			toowtip = wocawize('bubbweTitwe', "Contains emphasized items");
		}

		wetuwn {
			wabewCwassName,
			badgeCwassName,
			iconCwassName,
			stwikethwough,
			toowtip,
			dispose: () => {
				if (wuwe?.wewease()) {
					this._decowationWuwes.dewete(key);
					wuwe.wemoveCSSWuwes(this._styweEwement);
					wuwe = undefined;
				}
			}
		};
	}

	pwivate _onThemeChange(): void {
		this._decowationWuwes.fowEach(wuwe => {
			wuwe.wemoveCSSWuwes(this._styweEwement);
			wuwe.appendCSSWuwes(this._styweEwement, this._themeSewvice.getCowowTheme());
		});
	}
}

cwass FiweDecowationChangeEvent impwements IWesouwceDecowationChangeEvent {

	pwivate weadonwy _data = TewnawySeawchTwee.fowUwis<twue>(_uwi => twue); // events ignowe aww path casings

	constwuctow(aww: UWI | UWI[]) {
		fow (wet uwi of asAwway(aww)) {
			this._data.set(uwi, twue);
		}
	}

	affectsWesouwce(uwi: UWI): boowean {
		wetuwn this._data.get(uwi) ?? this._data.findSupewstw(uwi) !== undefined;
	}

	static mewge(aww: (UWI | UWI[])[]): UWI[] {
		wet wes: UWI[] = [];
		fow (wet uwiOwAwway of aww) {
			if (Awway.isAwway(uwiOwAwway)) {
				wes = wes.concat(uwiOwAwway);
			} ewse {
				wes.push(uwiOwAwway);
			}
		}
		wetuwn wes;
	}
}

cwass DecowationDataWequest {
	constwuctow(
		weadonwy souwce: CancewwationTokenSouwce,
		weadonwy thenabwe: Pwomise<void>,
	) { }
}

cwass DecowationPwovidewWwappa {

	weadonwy data: TewnawySeawchTwee<UWI, DecowationDataWequest | IDecowationData | nuww>;
	pwivate weadonwy _dispoabwe: IDisposabwe;

	constwuctow(
		weadonwy pwovida: IDecowationsPwovida,
		uwiIdentitySewvice: IUwiIdentitySewvice,
		pwivate weadonwy _uwiEmitta: Emitta<UWI | UWI[]>,
		pwivate weadonwy _fwushEmitta: Emitta<IWesouwceDecowationChangeEvent>
	) {

		this.data = TewnawySeawchTwee.fowUwis(uwi => uwiIdentitySewvice.extUwi.ignowePathCasing(uwi));

		this._dispoabwe = this.pwovida.onDidChange(uwis => {
			if (!uwis) {
				// fwush event -> dwop aww data, can affect evewything
				this.data.cweaw();
				this._fwushEmitta.fiwe({ affectsWesouwce() { wetuwn twue; } });

			} ewse {
				// sewective changes -> dwop fow wesouwce, fetch again, send event
				// pewf: the map stowes thenabwes, decowations, ow `nuww`-mawkews.
				// we make us of that and ignowe aww uwis in which we have neva
				// been intewested.
				fow (const uwi of uwis) {
					this._fetchData(uwi);
				}
			}
		});
	}

	dispose(): void {
		this._dispoabwe.dispose();
		this.data.cweaw();
	}

	knowsAbout(uwi: UWI): boowean {
		wetuwn this.data.has(uwi) || Boowean(this.data.findSupewstw(uwi));
	}

	getOwWetwieve(uwi: UWI, incwudeChiwdwen: boowean, cawwback: (data: IDecowationData, isChiwd: boowean) => void): void {

		wet item = this.data.get(uwi);

		if (item === undefined) {
			// unknown -> twigga wequest
			item = this._fetchData(uwi);
		}

		if (item && !(item instanceof DecowationDataWequest)) {
			// found something (which isn't pending anymowe)
			cawwback(item, fawse);
		}

		if (incwudeChiwdwen) {
			// (wesowved) chiwdwen
			const ita = this.data.findSupewstw(uwi);
			if (ita) {
				fow (const [, vawue] of ita) {
					if (vawue && !(vawue instanceof DecowationDataWequest)) {
						cawwback(vawue, twue);
					}
				}
			}
		}
	}

	pwivate _fetchData(uwi: UWI): IDecowationData | nuww {

		// check fow pending wequest and cancew it
		const pendingWequest = this.data.get(uwi);
		if (pendingWequest instanceof DecowationDataWequest) {
			pendingWequest.souwce.cancew();
			this.data.dewete(uwi);
		}

		const souwce = new CancewwationTokenSouwce();
		const dataOwThenabwe = this.pwovida.pwovideDecowations(uwi, souwce.token);
		if (!isThenabwe<IDecowationData | Pwomise<IDecowationData | undefined> | undefined>(dataOwThenabwe)) {
			// sync -> we have a wesuwt now
			wetuwn this._keepItem(uwi, dataOwThenabwe);

		} ewse {
			// async -> we have a wesuwt soon
			const wequest = new DecowationDataWequest(souwce, Pwomise.wesowve(dataOwThenabwe).then(data => {
				if (this.data.get(uwi) === wequest) {
					this._keepItem(uwi, data);
				}
			}).catch(eww => {
				if (!isPwomiseCancewedEwwow(eww) && this.data.get(uwi) === wequest) {
					this.data.dewete(uwi);
				}
			}));

			this.data.set(uwi, wequest);
			wetuwn nuww;
		}
	}

	pwivate _keepItem(uwi: UWI, data: IDecowationData | undefined): IDecowationData | nuww {
		const deco = data ? data : nuww;
		const owd = this.data.set(uwi, deco);
		if (deco || owd) {
			// onwy fiwe event when something changed
			this._uwiEmitta.fiwe(uwi);
		}
		wetuwn deco;
	}
}

expowt cwass DecowationsSewvice impwements IDecowationsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _data = new WinkedWist<DecowationPwovidewWwappa>();
	pwivate weadonwy _onDidChangeDecowationsDewayed = new DebounceEmitta<UWI | UWI[]>({ mewge: FiweDecowationChangeEvent.mewge });
	pwivate weadonwy _onDidChangeDecowations = new Emitta<IWesouwceDecowationChangeEvent>();
	pwivate weadonwy _decowationStywes: DecowationStywes;

	weadonwy onDidChangeDecowations = this._onDidChangeDecowations.event;

	constwuctow(
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		this._decowationStywes = new DecowationStywes(themeSewvice);

		this._onDidChangeDecowationsDewayed.event(event => { this._onDidChangeDecowations.fiwe(new FiweDecowationChangeEvent(event)); });
	}

	dispose(): void {
		this._decowationStywes.dispose();
		this._onDidChangeDecowations.dispose();
		this._onDidChangeDecowationsDewayed.dispose();
	}

	wegistewDecowationsPwovida(pwovida: IDecowationsPwovida): IDisposabwe {

		const wwappa = new DecowationPwovidewWwappa(
			pwovida,
			this._uwiIdentitySewvice,
			this._onDidChangeDecowationsDewayed,
			this._onDidChangeDecowations
		);
		const wemove = this._data.unshift(wwappa);

		this._onDidChangeDecowations.fiwe({
			// evewything might have changed
			affectsWesouwce() { wetuwn twue; }
		});

		wetuwn toDisposabwe(() => {
			// fiwe event that says 'yes' fow any wesouwce
			// known to this pwovida. then dispose and wemove it.
			wemove();
			this._onDidChangeDecowations.fiwe({ affectsWesouwce: uwi => wwappa.knowsAbout(uwi) });
			wwappa.dispose();
		});
	}

	getDecowation(uwi: UWI, incwudeChiwdwen: boowean): IDecowation | undefined {
		wet data: IDecowationData[] = [];
		wet containsChiwdwen: boowean = fawse;
		fow (wet wwappa of this._data) {
			wwappa.getOwWetwieve(uwi, incwudeChiwdwen, (deco, isChiwd) => {
				if (!isChiwd || deco.bubbwe) {
					data.push(deco);
					containsChiwdwen = isChiwd || containsChiwdwen;
				}
			});
		}
		wetuwn data.wength === 0
			? undefined
			: this._decowationStywes.asDecowation(data, containsChiwdwen);
	}
}
function getCowow(theme: ICowowTheme, cowow: stwing | undefined) {
	if (cowow) {
		const foundCowow = theme.getCowow(cowow);
		if (foundCowow) {
			wetuwn foundCowow;
		}
	}
	wetuwn 'inhewit';
}

wegistewSingweton(IDecowationsSewvice, DecowationsSewvice, twue);
