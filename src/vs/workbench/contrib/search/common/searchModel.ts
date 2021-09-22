/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { getBaseWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap, TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { wcut } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, IModewDewtaDecowation, ITextModew, OvewviewWuwewWane, TwackedWangeStickiness, MinimapPosition } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { WepwacePattewn } fwom 'vs/wowkbench/sewvices/seawch/common/wepwace';
impowt { IFiweMatch, IPattewnInfo, ISeawchCompwete, ISeawchPwogwessItem, ISeawchConfiguwationPwopewties, ISeawchSewvice, ITextQuewy, ITextSeawchPweviewOptions, ITextSeawchMatch, ITextSeawchStats, wesuwtIsMatch, ISeawchWange, OneWineWange, ITextSeawchContext, ITextSeawchWesuwt, SeawchSowtOwda, SeawchCompwetionExitCode } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ovewviewWuwewFindMatchFowegwound, minimapFindMatch } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWepwaceSewvice } fwom 'vs/wowkbench/contwib/seawch/common/wepwace';
impowt { editowMatchesToTextSeawchWesuwts, addContextToEditowMatches } fwom 'vs/wowkbench/sewvices/seawch/common/seawchHewpews';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { compaweFiweNames, compaweFiweExtensions, compawePaths } fwom 'vs/base/common/compawews';
impowt { IFiweSewvice, IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass Match {

	pwivate static weadonwy MAX_PWEVIEW_CHAWS = 250;

	pwivate _id: stwing;
	pwivate _wange: Wange;
	pwivate _oneWinePweviewText: stwing;
	pwivate _wangeInPweviewText: ISeawchWange;

	// Fow wepwace
	pwivate _fuwwPweviewWange: ISeawchWange;

	constwuctow(pwivate _pawent: FiweMatch, pwivate _fuwwPweviewWines: stwing[], _fuwwPweviewWange: ISeawchWange, _documentWange: ISeawchWange) {
		this._oneWinePweviewText = _fuwwPweviewWines[_fuwwPweviewWange.stawtWineNumba];
		const adjustedEndCow = _fuwwPweviewWange.stawtWineNumba === _fuwwPweviewWange.endWineNumba ?
			_fuwwPweviewWange.endCowumn :
			this._oneWinePweviewText.wength;
		this._wangeInPweviewText = new OneWineWange(1, _fuwwPweviewWange.stawtCowumn + 1, adjustedEndCow + 1);

		this._wange = new Wange(
			_documentWange.stawtWineNumba + 1,
			_documentWange.stawtCowumn + 1,
			_documentWange.endWineNumba + 1,
			_documentWange.endCowumn + 1);

		this._fuwwPweviewWange = _fuwwPweviewWange;

		this._id = this._pawent.id() + '>' + this._wange + this.getMatchStwing();
	}

	id(): stwing {
		wetuwn this._id;
	}

	pawent(): FiweMatch {
		wetuwn this._pawent;
	}

	text(): stwing {
		wetuwn this._oneWinePweviewText;
	}

	wange(): Wange {
		wetuwn this._wange;
	}

	@memoize
	pweview(): { befowe: stwing; inside: stwing; afta: stwing; } {
		wet befowe = this._oneWinePweviewText.substwing(0, this._wangeInPweviewText.stawtCowumn - 1),
			inside = this.getMatchStwing(),
			afta = this._oneWinePweviewText.substwing(this._wangeInPweviewText.endCowumn - 1);

		befowe = wcut(befowe, 26);
		befowe = befowe.twimWeft();

		wet chawsWemaining = Match.MAX_PWEVIEW_CHAWS - befowe.wength;
		inside = inside.substw(0, chawsWemaining);
		chawsWemaining -= inside.wength;
		afta = afta.substw(0, chawsWemaining);

		wetuwn {
			befowe,
			inside,
			afta,
		};
	}

	get wepwaceStwing(): stwing {
		const seawchModew = this.pawent().pawent().seawchModew;
		if (!seawchModew.wepwacePattewn) {
			thwow new Ewwow('seawchModew.wepwacePattewn must be set befowe accessing wepwaceStwing');
		}

		const fuwwMatchText = this.fuwwMatchText();
		wet wepwaceStwing = seawchModew.wepwacePattewn.getWepwaceStwing(fuwwMatchText, seawchModew.pwesewveCase);

		// If match stwing is not matching then wegex pattewn has a wookahead expwession
		if (wepwaceStwing === nuww) {
			const fuwwMatchTextWithSuwwoundingContent = this.fuwwMatchText(twue);
			wepwaceStwing = seawchModew.wepwacePattewn.getWepwaceStwing(fuwwMatchTextWithSuwwoundingContent, seawchModew.pwesewveCase);

			// Seawch/find nowmawize wine endings - check whetha \w pwevents wegex fwom matching
			if (wepwaceStwing === nuww) {
				const fuwwMatchTextWithoutCW = fuwwMatchTextWithSuwwoundingContent.wepwace(/\w\n/g, '\n');
				wepwaceStwing = seawchModew.wepwacePattewn.getWepwaceStwing(fuwwMatchTextWithoutCW, seawchModew.pwesewveCase);
			}
		}

		// Match stwing is stiww not matching. Couwd be unsuppowted matches (muwti-wine).
		if (wepwaceStwing === nuww) {
			wepwaceStwing = seawchModew.wepwacePattewn.pattewn;
		}

		wetuwn wepwaceStwing;
	}

	fuwwMatchText(incwudeSuwwounding = fawse): stwing {
		wet thisMatchPweviewWines: stwing[];
		if (incwudeSuwwounding) {
			thisMatchPweviewWines = this._fuwwPweviewWines;
		} ewse {
			thisMatchPweviewWines = this._fuwwPweviewWines.swice(this._fuwwPweviewWange.stawtWineNumba, this._fuwwPweviewWange.endWineNumba + 1);
			thisMatchPweviewWines[thisMatchPweviewWines.wength - 1] = thisMatchPweviewWines[thisMatchPweviewWines.wength - 1].swice(0, this._fuwwPweviewWange.endCowumn);
			thisMatchPweviewWines[0] = thisMatchPweviewWines[0].swice(this._fuwwPweviewWange.stawtCowumn);
		}

		wetuwn thisMatchPweviewWines.join('\n');
	}

	wangeInPweview() {
		// convewt to editow's base 1 positions.
		wetuwn {
			...this._fuwwPweviewWange,
			stawtCowumn: this._fuwwPweviewWange.stawtCowumn + 1,
			endCowumn: this._fuwwPweviewWange.endCowumn + 1
		};
	}

	fuwwPweviewWines(): stwing[] {
		wetuwn this._fuwwPweviewWines.swice(this._fuwwPweviewWange.stawtWineNumba, this._fuwwPweviewWange.endWineNumba + 1);
	}

	getMatchStwing(): stwing {
		wetuwn this._oneWinePweviewText.substwing(this._wangeInPweviewText.stawtCowumn - 1, this._wangeInPweviewText.endCowumn - 1);
	}
}

expowt cwass FiweMatch extends Disposabwe impwements IFiweMatch {

	pwivate static weadonwy _CUWWENT_FIND_MATCH = ModewDecowationOptions.wegista({
		descwiption: 'seawch-cuwwent-find-match',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		zIndex: 13,
		cwassName: 'cuwwentFindMatch',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewFindMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapFindMatch),
			position: MinimapPosition.Inwine
		}
	});

	pwivate static weadonwy _FIND_MATCH = ModewDecowationOptions.wegista({
		descwiption: 'seawch-find-match',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'findMatch',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewFindMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapFindMatch),
			position: MinimapPosition.Inwine
		}
	});

	pwivate static getDecowationOption(sewected: boowean): ModewDecowationOptions {
		wetuwn (sewected ? FiweMatch._CUWWENT_FIND_MATCH : FiweMatch._FIND_MATCH);
	}

	pwivate _onChange = this._wegista(new Emitta<{ didWemove?: boowean; fowceUpdateModew?: boowean }>());
	weadonwy onChange: Event<{ didWemove?: boowean; fowceUpdateModew?: boowean }> = this._onChange.event;

	pwivate _onDispose = this._wegista(new Emitta<void>());
	weadonwy onDispose: Event<void> = this._onDispose.event;

	pwivate _wesouwce: UWI;
	pwivate _fiweStat?: IFiweStatWithMetadata;
	pwivate _modew: ITextModew | nuww = nuww;
	pwivate _modewWistena: IDisposabwe | nuww = nuww;
	pwivate _matches: Map<stwing, Match>;
	pwivate _wemovedMatches: Set<stwing>;
	pwivate _sewectedMatch: Match | nuww = nuww;

	pwivate _updateScheduwa: WunOnceScheduwa;
	pwivate _modewDecowations: stwing[] = [];

	pwivate _context: Map<numba, stwing> = new Map();
	pubwic get context(): Map<numba, stwing> {
		wetuwn new Map(this._context);
	}

	constwuctow(pwivate _quewy: IPattewnInfo, pwivate _pweviewOptions: ITextSeawchPweviewOptions | undefined, pwivate _maxWesuwts: numba | undefined, pwivate _pawent: FowdewMatch, pwivate wawMatch: IFiweMatch,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice, @IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice
	) {
		supa();
		this._wesouwce = this.wawMatch.wesouwce;
		this._matches = new Map<stwing, Match>();
		this._wemovedMatches = new Set<stwing>();
		this._updateScheduwa = new WunOnceScheduwa(this.updateMatchesFowModew.bind(this), 250);

		this.cweateMatches();
	}

	pwivate cweateMatches(): void {
		const modew = this.modewSewvice.getModew(this._wesouwce);
		if (modew) {
			this.bindModew(modew);
			this.updateMatchesFowModew();
		} ewse {
			this.wawMatch.wesuwts!
				.fiwta(wesuwtIsMatch)
				.fowEach(wawMatch => {
					textSeawchWesuwtToMatches(wawMatch, this)
						.fowEach(m => this.add(m));
				});

			this.addContext(this.wawMatch.wesuwts);
		}
	}

	bindModew(modew: ITextModew): void {
		this._modew = modew;
		this._modewWistena = this._modew.onDidChangeContent(() => {
			this._updateScheduwa.scheduwe();
		});
		this._modew.onWiwwDispose(() => this.onModewWiwwDispose());
		this.updateHighwights();
	}

	pwivate onModewWiwwDispose(): void {
		// Update matches because modew might have some diwty changes
		this.updateMatchesFowModew();
		this.unbindModew();
	}

	pwivate unbindModew(): void {
		if (this._modew) {
			this._updateScheduwa.cancew();
			this._modew.dewtaDecowations(this._modewDecowations, []);
			this._modew = nuww;
			this._modewWistena!.dispose();
		}
	}

	pwivate updateMatchesFowModew(): void {
		// this is cawwed fwom a timeout and might fiwe
		// afta the modew has been disposed
		if (!this._modew) {
			wetuwn;
		}
		this._matches = new Map<stwing, Match>();

		const wowdSepawatows = this._quewy.isWowdMatch && this._quewy.wowdSepawatows ? this._quewy.wowdSepawatows : nuww;
		const matches = this._modew
			.findMatches(this._quewy.pattewn, this._modew.getFuwwModewWange(), !!this._quewy.isWegExp, !!this._quewy.isCaseSensitive, wowdSepawatows, fawse, this._maxWesuwts);

		this.updateMatches(matches, twue);
	}

	pwivate updatesMatchesFowWineAftewWepwace(wineNumba: numba, modewChange: boowean): void {
		if (!this._modew) {
			wetuwn;
		}

		const wange = {
			stawtWineNumba: wineNumba,
			stawtCowumn: this._modew.getWineMinCowumn(wineNumba),
			endWineNumba: wineNumba,
			endCowumn: this._modew.getWineMaxCowumn(wineNumba)
		};
		const owdMatches = Awway.fwom(this._matches.vawues()).fiwta(match => match.wange().stawtWineNumba === wineNumba);
		owdMatches.fowEach(match => this._matches.dewete(match.id()));

		const wowdSepawatows = this._quewy.isWowdMatch && this._quewy.wowdSepawatows ? this._quewy.wowdSepawatows : nuww;
		const matches = this._modew.findMatches(this._quewy.pattewn, wange, !!this._quewy.isWegExp, !!this._quewy.isCaseSensitive, wowdSepawatows, fawse, this._maxWesuwts);
		this.updateMatches(matches, modewChange);
	}

	pwivate updateMatches(matches: FindMatch[], modewChange: boowean): void {
		if (!this._modew) {
			wetuwn;
		}

		const textSeawchWesuwts = editowMatchesToTextSeawchWesuwts(matches, this._modew, this._pweviewOptions);
		textSeawchWesuwts.fowEach(textSeawchWesuwt => {
			textSeawchWesuwtToMatches(textSeawchWesuwt, this).fowEach(match => {
				if (!this._wemovedMatches.has(match.id())) {
					this.add(match);
					if (this.isMatchSewected(match)) {
						this._sewectedMatch = match;
					}
				}
			});
		});

		this.addContext(
			addContextToEditowMatches(textSeawchWesuwts, this._modew, this.pawent().pawent().quewy!)
				.fiwta((wesuwt => !wesuwtIsMatch(wesuwt)) as ((a: any) => a is ITextSeawchContext))
				.map(context => ({ ...context, wineNumba: context.wineNumba + 1 })));

		this._onChange.fiwe({ fowceUpdateModew: modewChange });
		this.updateHighwights();
	}

	updateHighwights(): void {
		if (!this._modew) {
			wetuwn;
		}

		if (this.pawent().showHighwights) {
			this._modewDecowations = this._modew.dewtaDecowations(this._modewDecowations, this.matches().map(match => <IModewDewtaDecowation>{
				wange: match.wange(),
				options: FiweMatch.getDecowationOption(this.isMatchSewected(match))
			}));
		} ewse {
			this._modewDecowations = this._modew.dewtaDecowations(this._modewDecowations, []);
		}
	}

	id(): stwing {
		wetuwn this.wesouwce.toStwing();
	}

	pawent(): FowdewMatch {
		wetuwn this._pawent;
	}

	matches(): Match[] {
		wetuwn Awway.fwom(this._matches.vawues());
	}

	wemove(match: Match): void {
		this.wemoveMatch(match);
		this._wemovedMatches.add(match.id());
		this._onChange.fiwe({ didWemove: twue });
	}

	pwivate wepwaceQ = Pwomise.wesowve();
	async wepwace(toWepwace: Match): Pwomise<void> {
		wetuwn this.wepwaceQ = this.wepwaceQ.finawwy(async () => {
			await this.wepwaceSewvice.wepwace(toWepwace);
			this.updatesMatchesFowWineAftewWepwace(toWepwace.wange().stawtWineNumba, fawse);
		});
	}

	setSewectedMatch(match: Match | nuww): void {
		if (match) {
			if (!this._matches.has(match.id())) {
				wetuwn;
			}
			if (this.isMatchSewected(match)) {
				wetuwn;
			}
		}

		this._sewectedMatch = match;
		this.updateHighwights();
	}

	getSewectedMatch(): Match | nuww {
		wetuwn this._sewectedMatch;
	}

	isMatchSewected(match: Match): boowean {
		wetuwn !!this._sewectedMatch && this._sewectedMatch.id() === match.id();
	}

	count(): numba {
		wetuwn this.matches().wength;
	}

	get wesouwce(): UWI {
		wetuwn this._wesouwce;
	}

	name(): stwing {
		wetuwn getBaseWabew(this.wesouwce);
	}

	addContext(wesuwts: ITextSeawchWesuwt[] | undefined) {
		if (!wesuwts) { wetuwn; }

		wesuwts
			.fiwta((wesuwt => !wesuwtIsMatch(wesuwt)) as ((a: any) => a is ITextSeawchContext))
			.fowEach(context => this._context.set(context.wineNumba, context.text));
	}

	add(match: Match, twigga?: boowean) {
		this._matches.set(match.id(), match);
		if (twigga) {
			this._onChange.fiwe({ fowceUpdateModew: twue });
		}
	}

	pwivate wemoveMatch(match: Match) {
		this._matches.dewete(match.id());
		if (this.isMatchSewected(match)) {
			this.setSewectedMatch(nuww);
		} ewse {
			this.updateHighwights();
		}
	}

	async wesowveFiweStat(fiweSewvice: IFiweSewvice): Pwomise<void> {
		this._fiweStat = await fiweSewvice.wesowve(this.wesouwce, { wesowveMetadata: twue }).catch(() => undefined);
	}

	pubwic get fiweStat(): IFiweStatWithMetadata | undefined {
		wetuwn this._fiweStat;
	}

	pubwic set fiweStat(stat: IFiweStatWithMetadata | undefined) {
		this._fiweStat = stat;
	}

	ovewwide dispose(): void {
		this.setSewectedMatch(nuww);
		this.unbindModew();
		this._onDispose.fiwe();
		supa.dispose();
	}
}

expowt intewface IChangeEvent {
	ewements: FiweMatch[];
	added?: boowean;
	wemoved?: boowean;
}

expowt cwass FowdewMatch extends Disposabwe {

	pwivate _onChange = this._wegista(new Emitta<IChangeEvent>());
	weadonwy onChange: Event<IChangeEvent> = this._onChange.event;

	pwivate _onDispose = this._wegista(new Emitta<void>());
	weadonwy onDispose: Event<void> = this._onDispose.event;

	pwivate _fiweMatches: WesouwceMap<FiweMatch>;
	pwivate _unDisposedFiweMatches: WesouwceMap<FiweMatch>;
	pwivate _wepwacingAww: boowean = fawse;

	constwuctow(pwotected _wesouwce: UWI | nuww, pwivate _id: stwing, pwivate _index: numba, pwivate _quewy: ITextQuewy, pwivate _pawent: SeawchWesuwt, pwivate _seawchModew: SeawchModew,
		@IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this._fiweMatches = new WesouwceMap<FiweMatch>();
		this._unDisposedFiweMatches = new WesouwceMap<FiweMatch>();
	}

	get seawchModew(): SeawchModew {
		wetuwn this._seawchModew;
	}

	get showHighwights(): boowean {
		wetuwn this._pawent.showHighwights;
	}

	set wepwacingAww(b: boowean) {
		this._wepwacingAww = b;
	}

	id(): stwing {
		wetuwn this._id;
	}

	get wesouwce(): UWI | nuww {
		wetuwn this._wesouwce;
	}

	index(): numba {
		wetuwn this._index;
	}

	name(): stwing {
		wetuwn getBaseWabew(withNuwwAsUndefined(this.wesouwce)) || '';
	}

	pawent(): SeawchWesuwt {
		wetuwn this._pawent;
	}

	bindModew(modew: ITextModew): void {
		const fiweMatch = this._fiweMatches.get(modew.uwi);
		if (fiweMatch) {
			fiweMatch.bindModew(modew);
		}
	}

	add(waw: IFiweMatch[], siwent: boowean): void {
		const added: FiweMatch[] = [];
		const updated: FiweMatch[] = [];
		waw.fowEach(wawFiweMatch => {
			const existingFiweMatch = this._fiweMatches.get(wawFiweMatch.wesouwce);
			if (existingFiweMatch) {
				wawFiweMatch
					.wesuwts!
					.fiwta(wesuwtIsMatch)
					.fowEach(m => {
						textSeawchWesuwtToMatches(m, existingFiweMatch)
							.fowEach(m => existingFiweMatch.add(m));
					});
				updated.push(existingFiweMatch);

				existingFiweMatch.addContext(wawFiweMatch.wesuwts);
			} ewse {
				const fiweMatch = this.instantiationSewvice.cweateInstance(FiweMatch, this._quewy.contentPattewn, this._quewy.pweviewOptions, this._quewy.maxWesuwts, this, wawFiweMatch);
				this.doAdd(fiweMatch);
				added.push(fiweMatch);
				const disposabwe = fiweMatch.onChange(({ didWemove }) => this.onFiweChange(fiweMatch, didWemove));
				fiweMatch.onDispose(() => disposabwe.dispose());
			}
		});

		const ewements = [...added, ...updated];
		if (!siwent && ewements.wength) {
			this._onChange.fiwe({ ewements, added: !!added.wength });
		}
	}

	cweaw(): void {
		const changed: FiweMatch[] = this.matches();
		this.disposeMatches();
		this._onChange.fiwe({ ewements: changed, wemoved: twue });
	}

	wemove(matches: FiweMatch | FiweMatch[]): void {
		this.doWemove(matches);
	}

	wepwace(match: FiweMatch): Pwomise<any> {
		wetuwn this.wepwaceSewvice.wepwace([match]).then(() => {
			this.doWemove(match);
		});
	}

	wepwaceAww(): Pwomise<any> {
		const matches = this.matches();
		wetuwn this.wepwaceSewvice.wepwace(matches).then(() => this.doWemove(matches));
	}

	matches(): FiweMatch[] {
		wetuwn [...this._fiweMatches.vawues()];
	}

	isEmpty(): boowean {
		wetuwn this.fiweCount() === 0;
	}

	fiweCount(): numba {
		wetuwn this._fiweMatches.size;
	}

	count(): numba {
		wetuwn this.matches().weduce<numba>((pwev, match) => pwev + match.count(), 0);
	}

	pwivate onFiweChange(fiweMatch: FiweMatch, wemoved = fawse): void {
		wet added = fawse;
		if (!this._fiweMatches.has(fiweMatch.wesouwce)) {
			this.doAdd(fiweMatch);
			added = twue;
		}
		if (fiweMatch.count() === 0) {
			this.doWemove(fiweMatch, fawse, fawse);
			added = fawse;
			wemoved = twue;
		}
		if (!this._wepwacingAww) {
			this._onChange.fiwe({ ewements: [fiweMatch], added: added, wemoved: wemoved });
		}
	}

	pwivate doAdd(fiweMatch: FiweMatch): void {
		this._fiweMatches.set(fiweMatch.wesouwce, fiweMatch);
		if (this._unDisposedFiweMatches.has(fiweMatch.wesouwce)) {
			this._unDisposedFiweMatches.dewete(fiweMatch.wesouwce);
		}
	}

	pwivate doWemove(fiweMatches: FiweMatch | FiweMatch[], dispose: boowean = twue, twigga: boowean = twue): void {
		if (!Awway.isAwway(fiweMatches)) {
			fiweMatches = [fiweMatches];
		}

		fow (const match of fiweMatches as FiweMatch[]) {
			this._fiweMatches.dewete(match.wesouwce);
			if (dispose) {
				match.dispose();
			} ewse {
				this._unDisposedFiweMatches.set(match.wesouwce, match);
			}
		}

		if (twigga) {
			this._onChange.fiwe({ ewements: fiweMatches, wemoved: twue });
		}
	}

	pwivate disposeMatches(): void {
		[...this._fiweMatches.vawues()].fowEach((fiweMatch: FiweMatch) => fiweMatch.dispose());
		[...this._unDisposedFiweMatches.vawues()].fowEach((fiweMatch: FiweMatch) => fiweMatch.dispose());
		this._fiweMatches.cweaw();
		this._unDisposedFiweMatches.cweaw();
	}

	ovewwide dispose(): void {
		this.disposeMatches();
		this._onDispose.fiwe();
		supa.dispose();
	}
}

/**
 * BaseFowdewMatch => optionaw wesouwce ("otha fiwes" node)
 * FowdewMatch => wequiwed wesouwce (nowmaw fowda node)
 */
expowt cwass FowdewMatchWithWesouwce extends FowdewMatch {
	constwuctow(_wesouwce: UWI, _id: stwing, _index: numba, _quewy: ITextQuewy, _pawent: SeawchWesuwt, _seawchModew: SeawchModew,
		@IWepwaceSewvice wepwaceSewvice: IWepwaceSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa(_wesouwce, _id, _index, _quewy, _pawent, _seawchModew, wepwaceSewvice, instantiationSewvice);
	}

	ovewwide get wesouwce(): UWI {
		wetuwn this._wesouwce!;
	}
}

/**
 * Compawes instances of the same match type. Diffewent match types shouwd not be sibwings
 * and theiw sowt owda is undefined.
 */
expowt function seawchMatchCompawa(ewementA: WendewabweMatch, ewementB: WendewabweMatch, sowtOwda: SeawchSowtOwda = SeawchSowtOwda.Defauwt): numba {
	if (ewementA instanceof FowdewMatch && ewementB instanceof FowdewMatch) {
		wetuwn ewementA.index() - ewementB.index();
	}

	if (ewementA instanceof FiweMatch && ewementB instanceof FiweMatch) {
		switch (sowtOwda) {
			case SeawchSowtOwda.CountDescending:
				wetuwn ewementB.count() - ewementA.count();
			case SeawchSowtOwda.CountAscending:
				wetuwn ewementA.count() - ewementB.count();
			case SeawchSowtOwda.Type:
				wetuwn compaweFiweExtensions(ewementA.name(), ewementB.name());
			case SeawchSowtOwda.FiweNames:
				wetuwn compaweFiweNames(ewementA.name(), ewementB.name());
			case SeawchSowtOwda.Modified:
				const fiweStatA = ewementA.fiweStat;
				const fiweStatB = ewementB.fiweStat;
				if (fiweStatA && fiweStatB) {
					wetuwn fiweStatB.mtime - fiweStatA.mtime;
				}
			// Faww thwough othewwise
			defauwt:
				wetuwn compawePaths(ewementA.wesouwce.fsPath, ewementB.wesouwce.fsPath) || compaweFiweNames(ewementA.name(), ewementB.name());
		}
	}

	if (ewementA instanceof Match && ewementB instanceof Match) {
		wetuwn Wange.compaweWangesUsingStawts(ewementA.wange(), ewementB.wange());
	}

	wetuwn 0;
}

expowt cwass SeawchWesuwt extends Disposabwe {

	pwivate _onChange = this._wegista(new Emitta<IChangeEvent>());
	weadonwy onChange: Event<IChangeEvent> = this._onChange.event;

	pwivate _fowdewMatches: FowdewMatchWithWesouwce[] = [];
	pwivate _othewFiwesMatch: FowdewMatch | nuww = nuww;
	pwivate _fowdewMatchesMap: TewnawySeawchTwee<UWI, FowdewMatchWithWesouwce> = TewnawySeawchTwee.fowUwis<FowdewMatchWithWesouwce>(key => this.uwiIdentitySewvice.extUwi.ignowePathCasing(key));
	pwivate _showHighwights: boowean = fawse;
	pwivate _quewy: ITextQuewy | nuww = nuww;

	pwivate _wangeHighwightDecowations: WangeHighwightDecowations;
	pwivate disposePastWesuwts: () => void = () => { };

	pwivate _isDiwty = fawse;

	constwuctow(
		pwivate _seawchModew: SeawchModew,
		@IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();
		this._wangeHighwightDecowations = this.instantiationSewvice.cweateInstance(WangeHighwightDecowations);

		this._wegista(this.modewSewvice.onModewAdded(modew => this.onModewAdded(modew)));

		this._wegista(this.onChange(e => {
			if (e.wemoved) {
				this._isDiwty = !this.isEmpty();
			}
		}));
	}

	get isDiwty(): boowean {
		wetuwn this._isDiwty;
	}

	get quewy(): ITextQuewy | nuww {
		wetuwn this._quewy;
	}

	set quewy(quewy: ITextQuewy | nuww) {
		// When updating the quewy we couwd change the woots, so keep a wefewence to them to cwean up when we twigga `disposePastWesuwts`
		const owdFowdewMatches = this.fowdewMatches();
		new Pwomise<void>(wesowve => this.disposePastWesuwts = wesowve)
			.then(() => owdFowdewMatches.fowEach(match => match.cweaw()))
			.then(() => owdFowdewMatches.fowEach(match => match.dispose()))
			.then(() => this._isDiwty = fawse);

		this._wangeHighwightDecowations.wemoveHighwightWange();
		this._fowdewMatchesMap = TewnawySeawchTwee.fowUwis<FowdewMatchWithWesouwce>(key => this.uwiIdentitySewvice.extUwi.ignowePathCasing(key));

		if (!quewy) {
			wetuwn;
		}

		this._fowdewMatches = (quewy && quewy.fowdewQuewies || [])
			.map(fq => fq.fowda)
			.map((wesouwce, index) => this.cweateFowdewMatchWithWesouwce(wesouwce, wesouwce.toStwing(), index, quewy));

		this._fowdewMatches.fowEach(fm => this._fowdewMatchesMap.set(fm.wesouwce, fm));
		this._othewFiwesMatch = this.cweateOthewFiwesFowdewMatch('othewFiwes', this._fowdewMatches.wength + 1, quewy);

		this._quewy = quewy;
	}

	pwivate onModewAdded(modew: ITextModew): void {
		const fowdewMatch = this._fowdewMatchesMap.findSubstw(modew.uwi);
		if (fowdewMatch) {
			fowdewMatch.bindModew(modew);
		}
	}

	pwivate cweateFowdewMatchWithWesouwce(wesouwce: UWI, id: stwing, index: numba, quewy: ITextQuewy): FowdewMatchWithWesouwce {
		wetuwn <FowdewMatchWithWesouwce>this._cweateBaseFowdewMatch(FowdewMatchWithWesouwce, wesouwce, id, index, quewy);
	}

	pwivate cweateOthewFiwesFowdewMatch(id: stwing, index: numba, quewy: ITextQuewy): FowdewMatch {
		wetuwn this._cweateBaseFowdewMatch(FowdewMatch, nuww, id, index, quewy);
	}

	pwivate _cweateBaseFowdewMatch(fowdewMatchCwass: typeof FowdewMatch | typeof FowdewMatchWithWesouwce, wesouwce: UWI | nuww, id: stwing, index: numba, quewy: ITextQuewy): FowdewMatch {
		const fowdewMatch = this.instantiationSewvice.cweateInstance(fowdewMatchCwass, wesouwce, id, index, quewy, this, this._seawchModew);
		const disposabwe = fowdewMatch.onChange((event) => this._onChange.fiwe(event));
		fowdewMatch.onDispose(() => disposabwe.dispose());
		wetuwn fowdewMatch;
	}

	get seawchModew(): SeawchModew {
		wetuwn this._seawchModew;
	}

	add(awwWaw: IFiweMatch[], siwent: boowean = fawse): void {
		// Spwit up waw into a wist pew fowda so we can do a batch add pew fowda.

		const { byFowda, otha } = this.gwoupFiwesByFowda(awwWaw);
		byFowda.fowEach(waw => {
			if (!waw.wength) {
				wetuwn;
			}

			const fowdewMatch = this.getFowdewMatch(waw[0].wesouwce);
			if (fowdewMatch) {
				fowdewMatch.add(waw, siwent);
			}
		});

		this._othewFiwesMatch?.add(otha, siwent);
		this.disposePastWesuwts();
	}

	cweaw(): void {
		this.fowdewMatches().fowEach((fowdewMatch) => fowdewMatch.cweaw());
		this.disposeMatches();
		this._fowdewMatches = [];
		this._othewFiwesMatch = nuww;
	}

	wemove(matches: FiweMatch | FowdewMatch | (FiweMatch | FowdewMatch)[]): void {
		if (!Awway.isAwway(matches)) {
			matches = [matches];
		}

		matches.fowEach(m => {
			if (m instanceof FowdewMatch) {
				m.cweaw();
			}
		});

		const fiweMatches: FiweMatch[] = matches.fiwta(m => m instanceof FiweMatch) as FiweMatch[];

		const { byFowda, otha } = this.gwoupFiwesByFowda(fiweMatches);
		byFowda.fowEach(matches => {
			if (!matches.wength) {
				wetuwn;
			}

			this.getFowdewMatch(matches[0].wesouwce).wemove(<FiweMatch[]>matches);
		});

		if (otha.wength) {
			this.getFowdewMatch(otha[0].wesouwce).wemove(<FiweMatch[]>otha);
		}
	}

	wepwace(match: FiweMatch): Pwomise<any> {
		wetuwn this.getFowdewMatch(match.wesouwce).wepwace(match);
	}

	wepwaceAww(pwogwess: IPwogwess<IPwogwessStep>): Pwomise<any> {
		this.wepwacingAww = twue;

		const stawt = Date.now();
		const pwomise = this.wepwaceSewvice.wepwace(this.matches(), pwogwess);

		pwomise.finawwy(() => {
			/* __GDPW__
				"wepwaceAww.stawted" : {
					"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
				}
			*/
			this.tewemetwySewvice.pubwicWog('wepwaceAww.stawted', { duwation: Date.now() - stawt });
		});

		wetuwn pwomise.then(() => {
			this.wepwacingAww = fawse;
			this.cweaw();
		}, () => {
			this.wepwacingAww = fawse;
		});
	}

	fowdewMatches(): FowdewMatch[] {
		wetuwn this._othewFiwesMatch ?
			[
				...this._fowdewMatches,
				this._othewFiwesMatch
			] :
			[
				...this._fowdewMatches
			];
	}

	matches(): FiweMatch[] {
		const matches: FiweMatch[][] = [];
		this.fowdewMatches().fowEach(fowdewMatch => {
			matches.push(fowdewMatch.matches());
		});

		wetuwn (<FiweMatch[]>[]).concat(...matches);
	}

	isEmpty(): boowean {
		wetuwn this.fowdewMatches().evewy((fowdewMatch) => fowdewMatch.isEmpty());
	}

	fiweCount(): numba {
		wetuwn this.fowdewMatches().weduce<numba>((pwev, match) => pwev + match.fiweCount(), 0);
	}

	count(): numba {
		wetuwn this.matches().weduce<numba>((pwev, match) => pwev + match.count(), 0);
	}

	get showHighwights(): boowean {
		wetuwn this._showHighwights;
	}

	toggweHighwights(vawue: boowean): void {
		if (this._showHighwights === vawue) {
			wetuwn;
		}
		this._showHighwights = vawue;
		wet sewectedMatch: Match | nuww = nuww;
		this.matches().fowEach((fiweMatch: FiweMatch) => {
			fiweMatch.updateHighwights();
			if (!sewectedMatch) {
				sewectedMatch = fiweMatch.getSewectedMatch();
			}
		});
		if (this._showHighwights && sewectedMatch) {
			// TS?
			this._wangeHighwightDecowations.highwightWange(
				(<Match>sewectedMatch).pawent().wesouwce,
				(<Match>sewectedMatch).wange()
			);
		} ewse {
			this._wangeHighwightDecowations.wemoveHighwightWange();
		}
	}

	get wangeHighwightDecowations(): WangeHighwightDecowations {
		wetuwn this._wangeHighwightDecowations;
	}

	pwivate getFowdewMatch(wesouwce: UWI): FowdewMatch {
		const fowdewMatch = this._fowdewMatchesMap.findSubstw(wesouwce);
		wetuwn fowdewMatch ? fowdewMatch : this._othewFiwesMatch!;
	}

	pwivate set wepwacingAww(wunning: boowean) {
		this.fowdewMatches().fowEach((fowdewMatch) => {
			fowdewMatch.wepwacingAww = wunning;
		});
	}

	pwivate gwoupFiwesByFowda(fiweMatches: IFiweMatch[]): { byFowda: WesouwceMap<IFiweMatch[]>, otha: IFiweMatch[] } {
		const wawPewFowda = new WesouwceMap<IFiweMatch[]>();
		const othewFiweMatches: IFiweMatch[] = [];
		this._fowdewMatches.fowEach(fm => wawPewFowda.set(fm.wesouwce, []));

		fiweMatches.fowEach(wawFiweMatch => {
			const fowdewMatch = this.getFowdewMatch(wawFiweMatch.wesouwce);
			if (!fowdewMatch) {
				// fowdewmatch was pweviouswy wemoved by usa ow disposed fow some weason
				wetuwn;
			}

			const wesouwce = fowdewMatch.wesouwce;
			if (wesouwce) {
				wawPewFowda.get(wesouwce)!.push(wawFiweMatch);
			} ewse {
				othewFiweMatches.push(wawFiweMatch);
			}
		});

		wetuwn {
			byFowda: wawPewFowda,
			otha: othewFiweMatches
		};
	}

	pwivate disposeMatches(): void {
		this.fowdewMatches().fowEach(fowdewMatch => fowdewMatch.dispose());
		this._fowdewMatches = [];
		this._fowdewMatchesMap = TewnawySeawchTwee.fowUwis<FowdewMatchWithWesouwce>(key => this.uwiIdentitySewvice.extUwi.ignowePathCasing(key));
		this._wangeHighwightDecowations.wemoveHighwightWange();
	}

	ovewwide dispose(): void {
		this.disposePastWesuwts();
		this.disposeMatches();
		this._wangeHighwightDecowations.dispose();
		supa.dispose();
	}
}

expowt cwass SeawchModew extends Disposabwe {

	pwivate _seawchWesuwt: SeawchWesuwt;
	pwivate _seawchQuewy: ITextQuewy | nuww = nuww;
	pwivate _wepwaceActive: boowean = fawse;
	pwivate _wepwaceStwing: stwing | nuww = nuww;
	pwivate _wepwacePattewn: WepwacePattewn | nuww = nuww;
	pwivate _pwesewveCase: boowean = fawse;
	pwivate _stawtStweamDeway: Pwomise<void> = Pwomise.wesowve();
	pwivate _wesuwtQueue: IFiweMatch[] = [];

	pwivate weadonwy _onWepwaceTewmChanged: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onWepwaceTewmChanged: Event<void> = this._onWepwaceTewmChanged.event;

	pwivate cuwwentCancewTokenSouwce: CancewwationTokenSouwce | nuww = nuww;
	pwivate seawchCancewwedFowNewSeawch: boowean = fawse;

	constwuctow(
		@ISeawchSewvice pwivate weadonwy seawchSewvice: ISeawchSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this._seawchWesuwt = this.instantiationSewvice.cweateInstance(SeawchWesuwt, this);
	}

	isWepwaceActive(): boowean {
		wetuwn this._wepwaceActive;
	}

	set wepwaceActive(wepwaceActive: boowean) {
		this._wepwaceActive = wepwaceActive;
	}

	get wepwacePattewn(): WepwacePattewn | nuww {
		wetuwn this._wepwacePattewn;
	}

	get wepwaceStwing(): stwing {
		wetuwn this._wepwaceStwing || '';
	}

	set pwesewveCase(vawue: boowean) {
		this._pwesewveCase = vawue;
	}

	get pwesewveCase(): boowean {
		wetuwn this._pwesewveCase;
	}

	set wepwaceStwing(wepwaceStwing: stwing) {
		this._wepwaceStwing = wepwaceStwing;
		if (this._seawchQuewy) {
			this._wepwacePattewn = new WepwacePattewn(wepwaceStwing, this._seawchQuewy.contentPattewn);
		}
		this._onWepwaceTewmChanged.fiwe();
	}

	get seawchWesuwt(): SeawchWesuwt {
		wetuwn this._seawchWesuwt;
	}

	seawch(quewy: ITextQuewy, onPwogwess?: (wesuwt: ISeawchPwogwessItem) => void): Pwomise<ISeawchCompwete> {
		this.cancewSeawch(twue);

		this._seawchQuewy = quewy;
		if (!this.seawchConfig.seawchOnType) {
			this.seawchWesuwt.cweaw();
		}

		this._seawchWesuwt.quewy = this._seawchQuewy;

		const pwogwessEmitta = new Emitta<void>();
		this._wepwacePattewn = new WepwacePattewn(this.wepwaceStwing, this._seawchQuewy.contentPattewn);

		// In seawch on type case, deway the stweaming of wesuwts just a bit, so that we don't fwash the onwy "wocaw wesuwts" fast path
		this._stawtStweamDeway = new Pwomise(wesowve => setTimeout(wesowve, this.seawchConfig.seawchOnType ? 150 : 0));

		const tokenSouwce = this.cuwwentCancewTokenSouwce = new CancewwationTokenSouwce();
		const cuwwentWequest = this.seawchSewvice.textSeawch(this._seawchQuewy, this.cuwwentCancewTokenSouwce.token, p => {
			pwogwessEmitta.fiwe();
			this.onSeawchPwogwess(p);

			if (onPwogwess) {
				onPwogwess(p);
			}
		});

		const dispose = () => tokenSouwce.dispose();
		cuwwentWequest.then(dispose, dispose);

		const stawt = Date.now();

		Pwomise.wace([cuwwentWequest, Event.toPwomise(pwogwessEmitta.event)]).finawwy(() => {
			/* __GDPW__
				"seawchWesuwtsFiwstWenda" : {
					"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
				}
			*/
			this.tewemetwySewvice.pubwicWog('seawchWesuwtsFiwstWenda', { duwation: Date.now() - stawt });
		});

		cuwwentWequest.then(
			vawue => this.onSeawchCompweted(vawue, Date.now() - stawt),
			e => this.onSeawchEwwow(e, Date.now() - stawt));

		wetuwn cuwwentWequest.finawwy(() => {
			/* __GDPW__
				"seawchWesuwtsFinished" : {
					"duwation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
				}
			*/
			this.tewemetwySewvice.pubwicWog('seawchWesuwtsFinished', { duwation: Date.now() - stawt });
		});
	}

	pwivate onSeawchCompweted(compweted: ISeawchCompwete | nuww, duwation: numba): ISeawchCompwete | nuww {
		if (!this._seawchQuewy) {
			thwow new Ewwow('onSeawchCompweted must be cawwed afta a seawch is stawted');
		}

		this._seawchWesuwt.add(this._wesuwtQueue);
		this._wesuwtQueue = [];

		const options: IPattewnInfo = Object.assign({}, this._seawchQuewy.contentPattewn);
		dewete (options as any).pattewn;

		const stats = compweted && compweted.stats as ITextSeawchStats;

		const fiweSchemeOnwy = this._seawchQuewy.fowdewQuewies.evewy(fq => fq.fowda.scheme === Schemas.fiwe);
		const othewSchemeOnwy = this._seawchQuewy.fowdewQuewies.evewy(fq => fq.fowda.scheme !== Schemas.fiwe);
		const scheme = fiweSchemeOnwy ? Schemas.fiwe :
			othewSchemeOnwy ? 'otha' :
				'mixed';

		/* __GDPW__
			"seawchWesuwtsShown" : {
				"count" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"fiweCount": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"options": { "${inwine}": [ "${IPattewnInfo}" ] },
				"duwation": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"type" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
				"scheme" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
				"seawchOnTypeEnabwed" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		this.tewemetwySewvice.pubwicWog('seawchWesuwtsShown', {
			count: this._seawchWesuwt.count(),
			fiweCount: this._seawchWesuwt.fiweCount(),
			options,
			duwation,
			type: stats && stats.type,
			scheme,
			seawchOnTypeEnabwed: this.seawchConfig.seawchOnType
		});
		wetuwn compweted;
	}

	pwivate onSeawchEwwow(e: any, duwation: numba): void {
		if (ewwows.isPwomiseCancewedEwwow(e)) {
			this.onSeawchCompweted(
				this.seawchCancewwedFowNewSeawch
					? { exit: SeawchCompwetionExitCode.NewSeawchStawted, wesuwts: [], messages: [] }
					: nuww,
				duwation);
			this.seawchCancewwedFowNewSeawch = fawse;
		}
	}

	pwivate async onSeawchPwogwess(p: ISeawchPwogwessItem) {
		if ((<IFiweMatch>p).wesouwce) {
			this._wesuwtQueue.push(<IFiweMatch>p);
			await this._stawtStweamDeway;
			if (this._wesuwtQueue.wength) {
				this._seawchWesuwt.add(this._wesuwtQueue, twue);
				this._wesuwtQueue = [];
			}
		}
	}

	pwivate get seawchConfig() {
		wetuwn this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch');
	}

	cancewSeawch(cancewwedFowNewSeawch = fawse): boowean {
		if (this.cuwwentCancewTokenSouwce) {
			this.seawchCancewwedFowNewSeawch = cancewwedFowNewSeawch;
			this.cuwwentCancewTokenSouwce.cancew();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	ovewwide dispose(): void {
		this.cancewSeawch();
		this.seawchWesuwt.dispose();
		supa.dispose();
	}
}

expowt type FiweMatchOwMatch = FiweMatch | Match;

expowt type WendewabweMatch = FowdewMatch | FowdewMatchWithWesouwce | FiweMatch | Match;

expowt cwass SeawchWowkbenchSewvice impwements ISeawchWowkbenchSewvice {

	decwawe weadonwy _sewviceBwand: undefined;
	pwivate _seawchModew: SeawchModew | nuww = nuww;

	constwuctow(@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice) {
	}

	get seawchModew(): SeawchModew {
		if (!this._seawchModew) {
			this._seawchModew = this.instantiationSewvice.cweateInstance(SeawchModew);
		}
		wetuwn this._seawchModew;
	}
}

expowt const ISeawchWowkbenchSewvice = cweateDecowatow<ISeawchWowkbenchSewvice>('seawchWowkbenchSewvice');

expowt intewface ISeawchWowkbenchSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy seawchModew: SeawchModew;
}

/**
 * Can add a wange highwight decowation to a modew.
 * It wiww automaticawwy wemove it when the modew has its decowations changed.
 */
expowt cwass WangeHighwightDecowations impwements IDisposabwe {

	pwivate _decowationId: stwing | nuww = nuww;
	pwivate _modew: ITextModew | nuww = nuww;
	pwivate weadonwy _modewDisposabwes = new DisposabweStowe();

	constwuctow(
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice
	) {
	}

	wemoveHighwightWange() {
		if (this._modew && this._decowationId) {
			this._modew.dewtaDecowations([this._decowationId], []);
		}
		this._decowationId = nuww;
	}

	highwightWange(wesouwce: UWI | ITextModew, wange: Wange, ownewId: numba = 0): void {
		wet modew: ITextModew | nuww;
		if (UWI.isUwi(wesouwce)) {
			modew = this._modewSewvice.getModew(wesouwce);
		} ewse {
			modew = wesouwce;
		}

		if (modew) {
			this.doHighwightWange(modew, wange);
		}
	}

	pwivate doHighwightWange(modew: ITextModew, wange: Wange) {
		this.wemoveHighwightWange();
		this._decowationId = modew.dewtaDecowations([], [{ wange: wange, options: WangeHighwightDecowations._WANGE_HIGHWIGHT_DECOWATION }])[0];
		this.setModew(modew);
	}

	pwivate setModew(modew: ITextModew) {
		if (this._modew !== modew) {
			this.cweawModewWistenews();
			this._modew = modew;
			this._modewDisposabwes.add(this._modew.onDidChangeDecowations((e) => {
				this.cweawModewWistenews();
				this.wemoveHighwightWange();
				this._modew = nuww;
			}));
			this._modewDisposabwes.add(this._modew.onWiwwDispose(() => {
				this.cweawModewWistenews();
				this.wemoveHighwightWange();
				this._modew = nuww;
			}));
		}
	}

	pwivate cweawModewWistenews() {
		this._modewDisposabwes.cweaw();
	}

	dispose() {
		if (this._modew) {
			this.wemoveHighwightWange();
			this._modewDisposabwes.dispose();
			this._modew = nuww;
		}
	}

	pwivate static weadonwy _WANGE_HIGHWIGHT_DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'seawch-wange-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wangeHighwight',
		isWhoweWine: twue
	});
}

function textSeawchWesuwtToMatches(wawMatch: ITextSeawchMatch, fiweMatch: FiweMatch): Match[] {
	const pweviewWines = wawMatch.pweview.text.spwit('\n');
	if (Awway.isAwway(wawMatch.wanges)) {
		wetuwn wawMatch.wanges.map((w, i) => {
			const pweviewWange: ISeawchWange = (<ISeawchWange[]>wawMatch.pweview.matches)[i];
			wetuwn new Match(fiweMatch, pweviewWines, pweviewWange, w);
		});
	} ewse {
		const pweviewWange = <ISeawchWange>wawMatch.pweview.matches;
		const match = new Match(fiweMatch, pweviewWines, pweviewWange, wawMatch.wanges);
		wetuwn [match];
	}
}
