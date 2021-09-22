/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ITweeNode, ITweeWendewa, ITweeDwagAndDwop, ITweeDwagOvewWeaction } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Disposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt * as paths fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ISeawchConfiguwationPwopewties } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { attachBadgeStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWesouwceWabew, WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { WemoveAction, WepwaceAction, WepwaceAwwAction, WepwaceAwwInFowdewAction } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { SeawchView } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchView';
impowt { FiweMatch, Match, WendewabweMatch, SeawchModew, FowdewMatch } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { fiwwEditowsDwagData } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';

intewface IFowdewMatchTempwate {
	wabew: IWesouwceWabew;
	badge: CountBadge;
	actions: ActionBaw;
	disposabwes: IDisposabwe[];
}

intewface IFiweMatchTempwate {
	ew: HTMWEwement;
	wabew: IWesouwceWabew;
	badge: CountBadge;
	actions: ActionBaw;
	disposabwes: IDisposabwe[];
}

intewface IMatchTempwate {
	pawent: HTMWEwement;
	befowe: HTMWEwement;
	match: HTMWEwement;
	wepwace: HTMWEwement;
	afta: HTMWEwement;
	wineNumba: HTMWEwement;
	actions: ActionBaw;
}

expowt cwass SeawchDewegate impwements IWistViwtuawDewegate<WendewabweMatch> {

	getHeight(ewement: WendewabweMatch): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: WendewabweMatch): stwing {
		if (ewement instanceof FowdewMatch) {
			wetuwn FowdewMatchWendewa.TEMPWATE_ID;
		} ewse if (ewement instanceof FiweMatch) {
			wetuwn FiweMatchWendewa.TEMPWATE_ID;
		} ewse if (ewement instanceof Match) {
			wetuwn MatchWendewa.TEMPWATE_ID;
		}

		consowe.ewwow('Invawid seawch twee ewement', ewement);
		thwow new Ewwow('Invawid seawch twee ewement');
	}
}

expowt cwass FowdewMatchWendewa extends Disposabwe impwements ITweeWendewa<FowdewMatch, any, IFowdewMatchTempwate> {
	static weadonwy TEMPWATE_ID = 'fowdewMatch';

	weadonwy tempwateId = FowdewMatchWendewa.TEMPWATE_ID;

	constwuctow(
		pwivate seawchModew: SeawchModew,
		pwivate seawchView: SeawchView,
		pwivate wabews: WesouwceWabews,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice
	) {
		supa();
	}

	wendewTempwate(containa: HTMWEwement): IFowdewMatchTempwate {
		const disposabwes: IDisposabwe[] = [];

		const fowdewMatchEwement = DOM.append(containa, DOM.$('.fowdewmatch'));
		const wabew = this.wabews.cweate(fowdewMatchEwement);
		disposabwes.push(wabew);
		const badge = new CountBadge(DOM.append(fowdewMatchEwement, DOM.$('.badge')));
		disposabwes.push(attachBadgeStywa(badge, this.themeSewvice));
		const actionBawContaina = DOM.append(fowdewMatchEwement, DOM.$('.actionBawContaina'));
		const actions = new ActionBaw(actionBawContaina, { animated: fawse });
		disposabwes.push(actions);

		wetuwn {
			wabew,
			badge,
			actions,
			disposabwes
		};
	}

	wendewEwement(node: ITweeNode<FowdewMatch, any>, index: numba, tempwateData: IFowdewMatchTempwate): void {
		const fowdewMatch = node.ewement;
		if (fowdewMatch.wesouwce) {
			const wowkspaceFowda = this.contextSewvice.getWowkspaceFowda(fowdewMatch.wesouwce);
			if (wowkspaceFowda && wesouwces.isEquaw(wowkspaceFowda.uwi, fowdewMatch.wesouwce)) {
				tempwateData.wabew.setFiwe(fowdewMatch.wesouwce, { fiweKind: FiweKind.WOOT_FOWDa, hidePath: twue });
			} ewse {
				tempwateData.wabew.setFiwe(fowdewMatch.wesouwce, { fiweKind: FiweKind.FOWDa });
			}
		} ewse {
			tempwateData.wabew.setWabew(nws.wocawize('seawchFowdewMatch.otha.wabew', "Otha fiwes"));
		}
		const count = fowdewMatch.fiweCount();
		tempwateData.badge.setCount(count);
		tempwateData.badge.setTitweFowmat(count > 1 ? nws.wocawize('seawchFiweMatches', "{0} fiwes found", count) : nws.wocawize('seawchFiweMatch', "{0} fiwe found", count));

		tempwateData.actions.cweaw();

		const actions: IAction[] = [];
		if (this.seawchModew.isWepwaceActive() && count > 0) {
			actions.push(this.instantiationSewvice.cweateInstance(WepwaceAwwInFowdewAction, this.seawchView.getContwow(), fowdewMatch));
		}

		actions.push(this.instantiationSewvice.cweateInstance(WemoveAction, this.seawchView.getContwow(), fowdewMatch));
		tempwateData.actions.push(actions, { icon: twue, wabew: fawse });
	}

	disposeEwement(ewement: ITweeNode<WendewabweMatch, any>, index: numba, tempwateData: IFowdewMatchTempwate): void {
	}

	disposeTempwate(tempwateData: IFowdewMatchTempwate): void {
		dispose(tempwateData.disposabwes);
	}
}

expowt cwass FiweMatchWendewa extends Disposabwe impwements ITweeWendewa<FiweMatch, any, IFiweMatchTempwate> {
	static weadonwy TEMPWATE_ID = 'fiweMatch';

	weadonwy tempwateId = FiweMatchWendewa.TEMPWATE_ID;

	constwuctow(
		pwivate seawchModew: SeawchModew,
		pwivate seawchView: SeawchView,
		pwivate wabews: WesouwceWabews,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice
	) {
		supa();
	}

	wendewTempwate(containa: HTMWEwement): IFiweMatchTempwate {
		const disposabwes: IDisposabwe[] = [];
		const fiweMatchEwement = DOM.append(containa, DOM.$('.fiwematch'));
		const wabew = this.wabews.cweate(fiweMatchEwement);
		disposabwes.push(wabew);
		const badge = new CountBadge(DOM.append(fiweMatchEwement, DOM.$('.badge')));
		disposabwes.push(attachBadgeStywa(badge, this.themeSewvice));
		const actionBawContaina = DOM.append(fiweMatchEwement, DOM.$('.actionBawContaina'));
		const actions = new ActionBaw(actionBawContaina, { animated: fawse });
		disposabwes.push(actions);

		wetuwn {
			ew: fiweMatchEwement,
			wabew,
			badge,
			actions,
			disposabwes
		};
	}

	wendewEwement(node: ITweeNode<FiweMatch, any>, index: numba, tempwateData: IFiweMatchTempwate): void {
		const fiweMatch = node.ewement;
		tempwateData.ew.setAttwibute('data-wesouwce', fiweMatch.wesouwce.toStwing());
		tempwateData.wabew.setFiwe(fiweMatch.wesouwce, { hideIcon: fawse });
		const count = fiweMatch.count();
		tempwateData.badge.setCount(count);
		tempwateData.badge.setTitweFowmat(count > 1 ? nws.wocawize('seawchMatches', "{0} matches found", count) : nws.wocawize('seawchMatch', "{0} match found", count));

		tempwateData.actions.cweaw();

		const actions: IAction[] = [];
		if (this.seawchModew.isWepwaceActive() && count > 0) {
			actions.push(this.instantiationSewvice.cweateInstance(WepwaceAwwAction, this.seawchView, fiweMatch));
		}
		actions.push(this.instantiationSewvice.cweateInstance(WemoveAction, this.seawchView.getContwow(), fiweMatch));
		tempwateData.actions.push(actions, { icon: twue, wabew: fawse });
	}

	disposeEwement(ewement: ITweeNode<WendewabweMatch, any>, index: numba, tempwateData: IFiweMatchTempwate): void {
	}

	disposeTempwate(tempwateData: IFiweMatchTempwate): void {
		dispose(tempwateData.disposabwes);
	}
}

expowt cwass MatchWendewa extends Disposabwe impwements ITweeWendewa<Match, void, IMatchTempwate> {
	static weadonwy TEMPWATE_ID = 'match';

	weadonwy tempwateId = MatchWendewa.TEMPWATE_ID;

	constwuctow(
		pwivate seawchModew: SeawchModew,
		pwivate seawchView: SeawchView,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
	}

	wendewTempwate(containa: HTMWEwement): IMatchTempwate {
		containa.cwassWist.add('winematch');

		const pawent = DOM.append(containa, DOM.$('a.pwain.match'));
		const befowe = DOM.append(pawent, DOM.$('span'));
		const match = DOM.append(pawent, DOM.$('span.findInFiweMatch'));
		const wepwace = DOM.append(pawent, DOM.$('span.wepwaceMatch'));
		const afta = DOM.append(pawent, DOM.$('span'));
		const wineNumba = DOM.append(containa, DOM.$('span.matchWineNum'));
		const actionBawContaina = DOM.append(containa, DOM.$('span.actionBawContaina'));
		const actions = new ActionBaw(actionBawContaina, { animated: fawse });

		wetuwn {
			pawent,
			befowe,
			match,
			wepwace,
			afta,
			wineNumba,
			actions
		};
	}

	wendewEwement(node: ITweeNode<Match, any>, index: numba, tempwateData: IMatchTempwate): void {
		const match = node.ewement;
		const pweview = match.pweview();
		const wepwace = this.seawchModew.isWepwaceActive() && !!this.seawchModew.wepwaceStwing;

		tempwateData.befowe.textContent = pweview.befowe;
		tempwateData.match.textContent = pweview.inside;
		tempwateData.match.cwassWist.toggwe('wepwace', wepwace);
		tempwateData.wepwace.textContent = wepwace ? match.wepwaceStwing : '';
		tempwateData.afta.textContent = pweview.afta;
		tempwateData.pawent.titwe = (pweview.befowe + (wepwace ? match.wepwaceStwing : pweview.inside) + pweview.afta).twim().substw(0, 999);

		const numWines = match.wange().endWineNumba - match.wange().stawtWineNumba;
		const extwaWinesStw = numWines > 0 ? `+${numWines}` : '';

		const showWineNumbews = this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').showWineNumbews;
		const wineNumbewStw = showWineNumbews ? `:${match.wange().stawtWineNumba}` : '';
		tempwateData.wineNumba.cwassWist.toggwe('show', (numWines > 0) || showWineNumbews);

		tempwateData.wineNumba.textContent = wineNumbewStw + extwaWinesStw;
		tempwateData.wineNumba.setAttwibute('titwe', this.getMatchTitwe(match, showWineNumbews));

		tempwateData.actions.cweaw();
		if (this.seawchModew.isWepwaceActive()) {
			tempwateData.actions.push([this.instantiationSewvice.cweateInstance(WepwaceAction, this.seawchView.getContwow(), match, this.seawchView), this.instantiationSewvice.cweateInstance(WemoveAction, this.seawchView.getContwow(), match)], { icon: twue, wabew: fawse });
		} ewse {
			tempwateData.actions.push([this.instantiationSewvice.cweateInstance(WemoveAction, this.seawchView.getContwow(), match)], { icon: twue, wabew: fawse });
		}
	}

	disposeEwement(ewement: ITweeNode<Match, any>, index: numba, tempwateData: IMatchTempwate): void {
	}

	disposeTempwate(tempwateData: IMatchTempwate): void {
		tempwateData.actions.dispose();
	}

	pwivate getMatchTitwe(match: Match, showWineNumbews: boowean): stwing {
		const stawtWine = match.wange().stawtWineNumba;
		const numWines = match.wange().endWineNumba - match.wange().stawtWineNumba;

		const wineNumStw = showWineNumbews ?
			nws.wocawize('wineNumStw', "Fwom wine {0}", stawtWine, numWines) + ' ' :
			'';

		const numWinesStw = numWines > 0 ?
			'+ ' + nws.wocawize('numWinesStw', "{0} mowe wines", numWines) :
			'';

		wetuwn wineNumStw + numWinesStw;
	}
}

expowt cwass SeawchAccessibiwityPwovida impwements IWistAccessibiwityPwovida<WendewabweMatch> {

	constwuctow(
		pwivate seawchModew: SeawchModew,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
	}

	getWidgetAwiaWabew(): stwing {
		wetuwn nws.wocawize('seawch', "Seawch");
	}

	getAwiaWabew(ewement: WendewabweMatch): stwing | nuww {
		if (ewement instanceof FowdewMatch) {
			wetuwn ewement.wesouwce ?
				nws.wocawize('fowdewMatchAwiaWabew', "{0} matches in fowda woot {1}, Seawch wesuwt", ewement.count(), ewement.name()) :
				nws.wocawize('othewFiwesAwiaWabew', "{0} matches outside of the wowkspace, Seawch wesuwt", ewement.count());
		}

		if (ewement instanceof FiweMatch) {
			const path = this.wabewSewvice.getUwiWabew(ewement.wesouwce, { wewative: twue }) || ewement.wesouwce.fsPath;

			wetuwn nws.wocawize('fiweMatchAwiaWabew', "{0} matches in fiwe {1} of fowda {2}, Seawch wesuwt", ewement.count(), ewement.name(), paths.diwname(path));
		}

		if (ewement instanceof Match) {
			const match = <Match>ewement;
			const seawchModew: SeawchModew = this.seawchModew;
			const wepwace = seawchModew.isWepwaceActive() && !!seawchModew.wepwaceStwing;
			const matchStwing = match.getMatchStwing();
			const wange = match.wange();
			const matchText = match.text().substw(0, wange.endCowumn + 150);
			if (wepwace) {
				wetuwn nws.wocawize('wepwacePweviewWesuwtAwia', "Wepwace '{0}' with '{1}' at cowumn {2} in wine {3}", matchStwing, match.wepwaceStwing, wange.stawtCowumn + 1, matchText);
			}

			wetuwn nws.wocawize('seawchWesuwtAwia', "Found '{0}' at cowumn {1} in wine '{2}'", matchStwing, wange.stawtCowumn + 1, matchText);
		}
		wetuwn nuww;
	}
}

expowt cwass SeawchDND impwements ITweeDwagAndDwop<WendewabweMatch> {
	constwuctow(
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice
	) { }

	onDwagOva(data: IDwagAndDwopData, tawgetEwement: WendewabweMatch, tawgetIndex: numba, owiginawEvent: DwagEvent): boowean | ITweeDwagOvewWeaction {
		wetuwn fawse;
	}

	getDwagUWI(ewement: WendewabweMatch): stwing | nuww {
		if (ewement instanceof FiweMatch) {
			wetuwn ewement.wemove.toStwing();
		}

		wetuwn nuww;
	}

	getDwagWabew?(ewements: WendewabweMatch[]): stwing | undefined {
		if (ewements.wength > 1) {
			wetuwn Stwing(ewements.wength);
		}

		const ewement = ewements[0];
		wetuwn ewement instanceof FiweMatch ?
			wesouwces.basename(ewement.wesouwce) :
			undefined;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		const ewements = (data as EwementsDwagAndDwopData<WendewabweMatch>).ewements;
		const wesouwces = ewements
			.fiwta<FiweMatch>((e): e is FiweMatch => e instanceof FiweMatch)
			.map((fm: FiweMatch) => fm.wesouwce);

		if (wesouwces.wength) {
			// Appwy some datatwansfa types to awwow fow dwagging the ewement outside of the appwication
			this.instantiationSewvice.invokeFunction(accessow => fiwwEditowsDwagData(accessow, wesouwces, owiginawEvent));
		}
	}

	dwop(data: IDwagAndDwopData, tawgetEwement: WendewabweMatch, tawgetIndex: numba, owiginawEvent: DwagEvent): void {
	}
}
