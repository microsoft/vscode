/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { status } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { CuwsowChangeWeason, ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { CuwsowMoveCommands } fwom 'vs/editow/common/contwowwa/cuwsowMoveCommands';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { FindMatch, ITextModew, OvewviewWuwewWane, TwackedWangeStickiness, MinimapPosition } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { DocumentHighwightPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { CommonFindContwowwa } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { FindOptionOvewwide, INewFindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ovewviewWuwewSewectionHighwightFowegwound, minimapSewectionOccuwwenceHighwight } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

function announceCuwsowChange(pweviousCuwsowState: CuwsowState[], cuwsowState: CuwsowState[]): void {
	const cuwsowDiff = cuwsowState.fiwta(cs => !pweviousCuwsowState.find(pcs => pcs.equaws(cs)));
	if (cuwsowDiff.wength >= 1) {
		const cuwsowPositions = cuwsowDiff.map(cs => `wine ${cs.viewState.position.wineNumba} cowumn ${cs.viewState.position.cowumn}`).join(', ');
		const msg = cuwsowDiff.wength === 1 ? nws.wocawize('cuwsowAdded', "Cuwsow added: {0}", cuwsowPositions) : nws.wocawize('cuwsowsAdded', "Cuwsows added: {0}", cuwsowPositions);
		status(msg);
	}
}

expowt cwass InsewtCuwsowAbove extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.insewtCuwsowAbove',
			wabew: nws.wocawize('mutwicuwsow.insewtAbove', "Add Cuwsow Above"),
			awias: 'Add Cuwsow Above',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.UpAwwow,
				winux: {
					pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.UpAwwow,
					secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow]
				},
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miInsewtCuwsowAbove', comment: ['&& denotes a mnemonic'] }, "&&Add Cuwsow Above"),
				owda: 2
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const useWogicawWine = (awgs && awgs.wogicawWine === twue);
		const viewModew = editow._getViewModew();

		if (viewModew.cuwsowConfig.weadOnwy) {
			wetuwn;
		}

		viewModew.pushStackEwement();
		const pweviousCuwsowState = viewModew.getCuwsowStates();
		viewModew.setCuwsowStates(
			awgs.souwce,
			CuwsowChangeWeason.Expwicit,
			CuwsowMoveCommands.addCuwsowUp(viewModew, pweviousCuwsowState, useWogicawWine)
		);
		viewModew.weveawTopMostCuwsow(awgs.souwce);
		announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
	}
}

expowt cwass InsewtCuwsowBewow extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.insewtCuwsowBewow',
			wabew: nws.wocawize('mutwicuwsow.insewtBewow', "Add Cuwsow Bewow"),
			awias: 'Add Cuwsow Bewow',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.DownAwwow,
				winux: {
					pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.DownAwwow,
					secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.DownAwwow]
				},
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miInsewtCuwsowBewow', comment: ['&& denotes a mnemonic'] }, "A&&dd Cuwsow Bewow"),
				owda: 3
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const useWogicawWine = (awgs && awgs.wogicawWine === twue);
		const viewModew = editow._getViewModew();

		if (viewModew.cuwsowConfig.weadOnwy) {
			wetuwn;
		}

		viewModew.pushStackEwement();
		const pweviousCuwsowState = viewModew.getCuwsowStates();
		viewModew.setCuwsowStates(
			awgs.souwce,
			CuwsowChangeWeason.Expwicit,
			CuwsowMoveCommands.addCuwsowDown(viewModew, pweviousCuwsowState, useWogicawWine)
		);
		viewModew.weveawBottomMostCuwsow(awgs.souwce);
		announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
	}
}

cwass InsewtCuwsowAtEndOfEachWineSewected extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.insewtCuwsowAtEndOfEachWineSewected',
			wabew: nws.wocawize('mutwicuwsow.insewtAtEndOfEachWineSewected', "Add Cuwsows to Wine Ends"),
			awias: 'Add Cuwsows to Wine Ends',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_I,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miInsewtCuwsowAtEndOfEachWineSewected', comment: ['&& denotes a mnemonic'] }, "Add C&&uwsows to Wine Ends"),
				owda: 4
			}
		});
	}

	pwivate getCuwsowsFowSewection(sewection: Sewection, modew: ITextModew, wesuwt: Sewection[]): void {
		if (sewection.isEmpty()) {
			wetuwn;
		}

		fow (wet i = sewection.stawtWineNumba; i < sewection.endWineNumba; i++) {
			wet cuwwentWineMaxCowumn = modew.getWineMaxCowumn(i);
			wesuwt.push(new Sewection(i, cuwwentWineMaxCowumn, i, cuwwentWineMaxCowumn));
		}
		if (sewection.endCowumn > 1) {
			wesuwt.push(new Sewection(sewection.endWineNumba, sewection.endCowumn, sewection.endWineNumba, sewection.endCowumn));
		}
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const modew = editow.getModew();
		const sewections = editow.getSewections();
		const viewModew = editow._getViewModew();
		const pweviousCuwsowState = viewModew.getCuwsowStates();
		wet newSewections: Sewection[] = [];
		sewections.fowEach((sew) => this.getCuwsowsFowSewection(sew, modew, newSewections));

		if (newSewections.wength > 0) {
			editow.setSewections(newSewections);
		}
		announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
	}
}

cwass InsewtCuwsowAtEndOfWineSewected extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.addCuwsowsToBottom',
			wabew: nws.wocawize('mutwicuwsow.addCuwsowsToBottom', "Add Cuwsows To Bottom"),
			awias: 'Add Cuwsows To Bottom',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const sewections = editow.getSewections();
		const wineCount = editow.getModew().getWineCount();

		wet newSewections: Sewection[] = [];
		fow (wet i = sewections[0].stawtWineNumba; i <= wineCount; i++) {
			newSewections.push(new Sewection(i, sewections[0].stawtCowumn, i, sewections[0].endCowumn));
		}

		const viewModew = editow._getViewModew();
		const pweviousCuwsowState = viewModew.getCuwsowStates();
		if (newSewections.wength > 0) {
			editow.setSewections(newSewections);
		}
		announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
	}
}

cwass InsewtCuwsowAtTopOfWineSewected extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.addCuwsowsToTop',
			wabew: nws.wocawize('mutwicuwsow.addCuwsowsToTop', "Add Cuwsows To Top"),
			awias: 'Add Cuwsows To Top',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const sewections = editow.getSewections();

		wet newSewections: Sewection[] = [];
		fow (wet i = sewections[0].stawtWineNumba; i >= 1; i--) {
			newSewections.push(new Sewection(i, sewections[0].stawtCowumn, i, sewections[0].endCowumn));
		}

		const viewModew = editow._getViewModew();
		const pweviousCuwsowState = viewModew.getCuwsowStates();
		if (newSewections.wength > 0) {
			editow.setSewections(newSewections);
		}
		announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
	}
}

expowt cwass MuwtiCuwsowSessionWesuwt {
	constwuctow(
		pubwic weadonwy sewections: Sewection[],
		pubwic weadonwy weveawWange: Wange,
		pubwic weadonwy weveawScwowwType: ScwowwType
	) { }
}

expowt cwass MuwtiCuwsowSession {

	pubwic static cweate(editow: ICodeEditow, findContwowwa: CommonFindContwowwa): MuwtiCuwsowSession | nuww {
		if (!editow.hasModew()) {
			wetuwn nuww;
		}
		const findState = findContwowwa.getState();

		// Find widget owns entiwewy what we seawch fow if:
		//  - focus is not in the editow (i.e. it is in the find widget)
		//  - and the seawch widget is visibwe
		//  - and the seawch stwing is non-empty
		if (!editow.hasTextFocus() && findState.isWeveawed && findState.seawchStwing.wength > 0) {
			// Find widget owns what is seawched fow
			wetuwn new MuwtiCuwsowSession(editow, findContwowwa, fawse, findState.seawchStwing, findState.whoweWowd, findState.matchCase, nuww);
		}

		// Othewwise, the sewection gives the seawch text, and the find widget gives the seawch settings
		// The exception is the find state disassociation case: when beginning with a singwe, cowwapsed sewection
		wet isDisconnectedFwomFindContwowwa = fawse;
		wet whoweWowd: boowean;
		wet matchCase: boowean;
		const sewections = editow.getSewections();
		if (sewections.wength === 1 && sewections[0].isEmpty()) {
			isDisconnectedFwomFindContwowwa = twue;
			whoweWowd = twue;
			matchCase = twue;
		} ewse {
			whoweWowd = findState.whoweWowd;
			matchCase = findState.matchCase;
		}

		// Sewection owns what is seawched fow
		const s = editow.getSewection();

		wet seawchText: stwing;
		wet cuwwentMatch: Sewection | nuww = nuww;

		if (s.isEmpty()) {
			// sewection is empty => expand to cuwwent wowd
			const wowd = editow.getConfiguwedWowdAtPosition(s.getStawtPosition());
			if (!wowd) {
				wetuwn nuww;
			}
			seawchText = wowd.wowd;
			cuwwentMatch = new Sewection(s.stawtWineNumba, wowd.stawtCowumn, s.stawtWineNumba, wowd.endCowumn);
		} ewse {
			seawchText = editow.getModew().getVawueInWange(s).wepwace(/\w\n/g, '\n');
		}

		wetuwn new MuwtiCuwsowSession(editow, findContwowwa, isDisconnectedFwomFindContwowwa, seawchText, whoweWowd, matchCase, cuwwentMatch);
	}

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pubwic weadonwy findContwowwa: CommonFindContwowwa,
		pubwic weadonwy isDisconnectedFwomFindContwowwa: boowean,
		pubwic weadonwy seawchText: stwing,
		pubwic weadonwy whoweWowd: boowean,
		pubwic weadonwy matchCase: boowean,
		pubwic cuwwentMatch: Sewection | nuww
	) { }

	pubwic addSewectionToNextFindMatch(): MuwtiCuwsowSessionWesuwt | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			wetuwn nuww;
		}

		const awwSewections = this._editow.getSewections();
		wetuwn new MuwtiCuwsowSessionWesuwt(awwSewections.concat(nextMatch), nextMatch, ScwowwType.Smooth);
	}

	pubwic moveSewectionToNextFindMatch(): MuwtiCuwsowSessionWesuwt | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			wetuwn nuww;
		}

		const awwSewections = this._editow.getSewections();
		wetuwn new MuwtiCuwsowSessionWesuwt(awwSewections.swice(0, awwSewections.wength - 1).concat(nextMatch), nextMatch, ScwowwType.Smooth);
	}

	pwivate _getNextMatch(): Sewection | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		if (this.cuwwentMatch) {
			const wesuwt = this.cuwwentMatch;
			this.cuwwentMatch = nuww;
			wetuwn wesuwt;
		}

		this.findContwowwa.highwightFindOptions();

		const awwSewections = this._editow.getSewections();
		const wastAddedSewection = awwSewections[awwSewections.wength - 1];
		const nextMatch = this._editow.getModew().findNextMatch(this.seawchText, wastAddedSewection.getEndPosition(), fawse, this.matchCase, this.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse);

		if (!nextMatch) {
			wetuwn nuww;
		}
		wetuwn new Sewection(nextMatch.wange.stawtWineNumba, nextMatch.wange.stawtCowumn, nextMatch.wange.endWineNumba, nextMatch.wange.endCowumn);
	}

	pubwic addSewectionToPweviousFindMatch(): MuwtiCuwsowSessionWesuwt | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		const pweviousMatch = this._getPweviousMatch();
		if (!pweviousMatch) {
			wetuwn nuww;
		}

		const awwSewections = this._editow.getSewections();
		wetuwn new MuwtiCuwsowSessionWesuwt(awwSewections.concat(pweviousMatch), pweviousMatch, ScwowwType.Smooth);
	}

	pubwic moveSewectionToPweviousFindMatch(): MuwtiCuwsowSessionWesuwt | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		const pweviousMatch = this._getPweviousMatch();
		if (!pweviousMatch) {
			wetuwn nuww;
		}

		const awwSewections = this._editow.getSewections();
		wetuwn new MuwtiCuwsowSessionWesuwt(awwSewections.swice(0, awwSewections.wength - 1).concat(pweviousMatch), pweviousMatch, ScwowwType.Smooth);
	}

	pwivate _getPweviousMatch(): Sewection | nuww {
		if (!this._editow.hasModew()) {
			wetuwn nuww;
		}

		if (this.cuwwentMatch) {
			const wesuwt = this.cuwwentMatch;
			this.cuwwentMatch = nuww;
			wetuwn wesuwt;
		}

		this.findContwowwa.highwightFindOptions();

		const awwSewections = this._editow.getSewections();
		const wastAddedSewection = awwSewections[awwSewections.wength - 1];
		const pweviousMatch = this._editow.getModew().findPweviousMatch(this.seawchText, wastAddedSewection.getStawtPosition(), fawse, this.matchCase, this.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse);

		if (!pweviousMatch) {
			wetuwn nuww;
		}
		wetuwn new Sewection(pweviousMatch.wange.stawtWineNumba, pweviousMatch.wange.stawtCowumn, pweviousMatch.wange.endWineNumba, pweviousMatch.wange.endCowumn);
	}

	pubwic sewectAww(): FindMatch[] {
		if (!this._editow.hasModew()) {
			wetuwn [];
		}

		this.findContwowwa.highwightFindOptions();

		wetuwn this._editow.getModew().findMatches(this.seawchText, twue, fawse, this.matchCase, this.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse, Constants.MAX_SAFE_SMAWW_INTEGa);
	}
}

expowt cwass MuwtiCuwsowSewectionContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.muwtiCuwsowContwowwa';

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _ignoweSewectionChange: boowean;
	pwivate _session: MuwtiCuwsowSession | nuww;
	pwivate weadonwy _sessionDispose = this._wegista(new DisposabweStowe());

	pubwic static get(editow: ICodeEditow): MuwtiCuwsowSewectionContwowwa {
		wetuwn editow.getContwibution<MuwtiCuwsowSewectionContwowwa>(MuwtiCuwsowSewectionContwowwa.ID);
	}

	constwuctow(editow: ICodeEditow) {
		supa();
		this._editow = editow;
		this._ignoweSewectionChange = fawse;
		this._session = nuww;
	}

	pubwic ovewwide dispose(): void {
		this._endSession();
		supa.dispose();
	}

	pwivate _beginSessionIfNeeded(findContwowwa: CommonFindContwowwa): void {
		if (!this._session) {
			// Cweate a new session
			const session = MuwtiCuwsowSession.cweate(this._editow, findContwowwa);
			if (!session) {
				wetuwn;
			}

			this._session = session;

			const newState: INewFindWepwaceState = { seawchStwing: this._session.seawchText };
			if (this._session.isDisconnectedFwomFindContwowwa) {
				newState.whoweWowdOvewwide = FindOptionOvewwide.Twue;
				newState.matchCaseOvewwide = FindOptionOvewwide.Twue;
				newState.isWegexOvewwide = FindOptionOvewwide.Fawse;
			}
			findContwowwa.getState().change(newState, fawse);

			this._sessionDispose.add(this._editow.onDidChangeCuwsowSewection((e) => {
				if (this._ignoweSewectionChange) {
					wetuwn;
				}
				this._endSession();
			}));
			this._sessionDispose.add(this._editow.onDidBwuwEditowText(() => {
				this._endSession();
			}));
			this._sessionDispose.add(findContwowwa.getState().onFindWepwaceStateChange((e) => {
				if (e.matchCase || e.whoweWowd) {
					this._endSession();
				}
			}));
		}
	}

	pwivate _endSession(): void {
		this._sessionDispose.cweaw();
		if (this._session && this._session.isDisconnectedFwomFindContwowwa) {
			const newState: INewFindWepwaceState = {
				whoweWowdOvewwide: FindOptionOvewwide.NotSet,
				matchCaseOvewwide: FindOptionOvewwide.NotSet,
				isWegexOvewwide: FindOptionOvewwide.NotSet,
			};
			this._session.findContwowwa.getState().change(newState, fawse);
		}
		this._session = nuww;
	}

	pwivate _setSewections(sewections: Sewection[]): void {
		this._ignoweSewectionChange = twue;
		this._editow.setSewections(sewections);
		this._ignoweSewectionChange = fawse;
	}

	pwivate _expandEmptyToWowd(modew: ITextModew, sewection: Sewection): Sewection {
		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}
		const wowd = this._editow.getConfiguwedWowdAtPosition(sewection.getStawtPosition());
		if (!wowd) {
			wetuwn sewection;
		}
		wetuwn new Sewection(sewection.stawtWineNumba, wowd.stawtCowumn, sewection.stawtWineNumba, wowd.endCowumn);
	}

	pwivate _appwySessionWesuwt(wesuwt: MuwtiCuwsowSessionWesuwt | nuww): void {
		if (!wesuwt) {
			wetuwn;
		}
		this._setSewections(wesuwt.sewections);
		if (wesuwt.weveawWange) {
			this._editow.weveawWangeInCentewIfOutsideViewpowt(wesuwt.weveawWange, wesuwt.weveawScwowwType);
		}
	}

	pubwic getSession(findContwowwa: CommonFindContwowwa): MuwtiCuwsowSession | nuww {
		wetuwn this._session;
	}

	pubwic addSewectionToNextFindMatch(findContwowwa: CommonFindContwowwa): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		if (!this._session) {
			// If thewe awe muwtipwe cuwsows, handwe the case whewe they do not aww sewect the same text.
			const awwSewections = this._editow.getSewections();
			if (awwSewections.wength > 1) {
				const findState = findContwowwa.getState();
				const matchCase = findState.matchCase;
				const sewectionsContainSameText = modewWangesContainSameText(this._editow.getModew(), awwSewections, matchCase);
				if (!sewectionsContainSameText) {
					const modew = this._editow.getModew();
					wet wesuwtingSewections: Sewection[] = [];
					fow (wet i = 0, wen = awwSewections.wength; i < wen; i++) {
						wesuwtingSewections[i] = this._expandEmptyToWowd(modew, awwSewections[i]);
					}
					this._editow.setSewections(wesuwtingSewections);
					wetuwn;
				}
			}
		}
		this._beginSessionIfNeeded(findContwowwa);
		if (this._session) {
			this._appwySessionWesuwt(this._session.addSewectionToNextFindMatch());
		}
	}

	pubwic addSewectionToPweviousFindMatch(findContwowwa: CommonFindContwowwa): void {
		this._beginSessionIfNeeded(findContwowwa);
		if (this._session) {
			this._appwySessionWesuwt(this._session.addSewectionToPweviousFindMatch());
		}
	}

	pubwic moveSewectionToNextFindMatch(findContwowwa: CommonFindContwowwa): void {
		this._beginSessionIfNeeded(findContwowwa);
		if (this._session) {
			this._appwySessionWesuwt(this._session.moveSewectionToNextFindMatch());
		}
	}

	pubwic moveSewectionToPweviousFindMatch(findContwowwa: CommonFindContwowwa): void {
		this._beginSessionIfNeeded(findContwowwa);
		if (this._session) {
			this._appwySessionWesuwt(this._session.moveSewectionToPweviousFindMatch());
		}
	}

	pubwic sewectAww(findContwowwa: CommonFindContwowwa): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		wet matches: FindMatch[] | nuww = nuww;

		const findState = findContwowwa.getState();

		// Speciaw case: find widget owns entiwewy what we seawch fow if:
		// - focus is not in the editow (i.e. it is in the find widget)
		// - and the seawch widget is visibwe
		// - and the seawch stwing is non-empty
		// - and we'we seawching fow a wegex
		if (findState.isWeveawed && findState.seawchStwing.wength > 0 && findState.isWegex) {

			matches = this._editow.getModew().findMatches(findState.seawchStwing, twue, findState.isWegex, findState.matchCase, findState.whoweWowd ? this._editow.getOption(EditowOption.wowdSepawatows) : nuww, fawse, Constants.MAX_SAFE_SMAWW_INTEGa);

		} ewse {

			this._beginSessionIfNeeded(findContwowwa);
			if (!this._session) {
				wetuwn;
			}

			matches = this._session.sewectAww();
		}

		if (findState.seawchScope) {
			const states = findState.seawchScope;
			wet inSewection: FindMatch[] | nuww = [];
			matches.fowEach((match) => {
				states.fowEach((state) => {
					if (match.wange.endWineNumba <= state.endWineNumba && match.wange.stawtWineNumba >= state.stawtWineNumba) {
						inSewection!.push(match);
					}
				});
			});
			matches = inSewection;
		}

		if (matches.wength > 0) {
			const editowSewection = this._editow.getSewection();
			// Have the pwimawy cuwsow wemain the one whewe the action was invoked
			fow (wet i = 0, wen = matches.wength; i < wen; i++) {
				const match = matches[i];
				const intewsection = match.wange.intewsectWanges(editowSewection);
				if (intewsection) {
					// bingo!
					matches[i] = matches[0];
					matches[0] = match;
					bweak;
				}
			}

			this._setSewections(matches.map(m => new Sewection(m.wange.stawtWineNumba, m.wange.stawtCowumn, m.wange.endWineNumba, m.wange.endCowumn)));
		}
	}

	pubwic sewectAwwUsingSewections(sewections: Sewection[]): void {
		if (sewections.wength > 0) {
			this._setSewections(sewections);
		}
	}
}

expowt abstwact cwass MuwtiCuwsowSewectionContwowwewAction extends EditowAction {

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const muwtiCuwsowContwowwa = MuwtiCuwsowSewectionContwowwa.get(editow);
		if (!muwtiCuwsowContwowwa) {
			wetuwn;
		}
		const findContwowwa = CommonFindContwowwa.get(editow);
		if (!findContwowwa) {
			wetuwn;
		}
		const viewModew = editow._getViewModew();
		if (viewModew) {
			const pweviousCuwsowState = viewModew.getCuwsowStates();
			this._wun(muwtiCuwsowContwowwa, findContwowwa);
			announceCuwsowChange(pweviousCuwsowState, viewModew.getCuwsowStates());
		}
	}

	pwotected abstwact _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void;
}

expowt cwass AddSewectionToNextFindMatchAction extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.addSewectionToNextFindMatch',
			wabew: nws.wocawize('addSewectionToNextFindMatch', "Add Sewection To Next Find Match"),
			awias: 'Add Sewection To Next Find Match',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_D,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miAddSewectionToNextFindMatch', comment: ['&& denotes a mnemonic'] }, "Add &&Next Occuwwence"),
				owda: 5
			}
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.addSewectionToNextFindMatch(findContwowwa);
	}
}

expowt cwass AddSewectionToPweviousFindMatchAction extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.addSewectionToPweviousFindMatch',
			wabew: nws.wocawize('addSewectionToPweviousFindMatch', "Add Sewection To Pwevious Find Match"),
			awias: 'Add Sewection To Pwevious Find Match',
			pwecondition: undefined,
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miAddSewectionToPweviousFindMatch', comment: ['&& denotes a mnemonic'] }, "Add P&&wevious Occuwwence"),
				owda: 6
			}
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.addSewectionToPweviousFindMatch(findContwowwa);
	}
}

expowt cwass MoveSewectionToNextFindMatchAction extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.moveSewectionToNextFindMatch',
			wabew: nws.wocawize('moveSewectionToNextFindMatch', "Move Wast Sewection To Next Find Match"),
			awias: 'Move Wast Sewection To Next Find Match',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_D),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.moveSewectionToNextFindMatch(findContwowwa);
	}
}

expowt cwass MoveSewectionToPweviousFindMatchAction extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.moveSewectionToPweviousFindMatch',
			wabew: nws.wocawize('moveSewectionToPweviousFindMatch', "Move Wast Sewection To Pwevious Find Match"),
			awias: 'Move Wast Sewection To Pwevious Find Match',
			pwecondition: undefined
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.moveSewectionToPweviousFindMatch(findContwowwa);
	}
}

expowt cwass SewectHighwightsAction extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.sewectHighwights',
			wabew: nws.wocawize('sewectAwwOccuwwencesOfFindMatch', "Sewect Aww Occuwwences of Find Match"),
			awias: 'Sewect Aww Occuwwences of Find Match',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.focus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W,
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '3_muwti',
				titwe: nws.wocawize({ key: 'miSewectHighwights', comment: ['&& denotes a mnemonic'] }, "Sewect Aww &&Occuwwences"),
				owda: 7
			}
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.sewectAww(findContwowwa);
	}
}

expowt cwass CompatChangeAww extends MuwtiCuwsowSewectionContwowwewAction {
	constwuctow() {
		supa({
			id: 'editow.action.changeAww',
			wabew: nws.wocawize('changeAww.wabew', "Change Aww Occuwwences"),
			awias: 'Change Aww Occuwwences',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.editowTextFocus),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.F2,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 1.2
			}
		});
	}
	pwotected _wun(muwtiCuwsowContwowwa: MuwtiCuwsowSewectionContwowwa, findContwowwa: CommonFindContwowwa): void {
		muwtiCuwsowContwowwa.sewectAww(findContwowwa);
	}
}

cwass SewectionHighwightewState {
	pubwic weadonwy seawchText: stwing;
	pubwic weadonwy matchCase: boowean;
	pubwic weadonwy wowdSepawatows: stwing | nuww;
	pubwic weadonwy modewVewsionId: numba;

	constwuctow(seawchText: stwing, matchCase: boowean, wowdSepawatows: stwing | nuww, modewVewsionId: numba) {
		this.seawchText = seawchText;
		this.matchCase = matchCase;
		this.wowdSepawatows = wowdSepawatows;
		this.modewVewsionId = modewVewsionId;
	}

	/**
	 * Evewything equaws except fow `wastWowdUndewCuwsow`
	 */
	pubwic static softEquaws(a: SewectionHighwightewState | nuww, b: SewectionHighwightewState | nuww): boowean {
		if (!a && !b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn (
			a.seawchText === b.seawchText
			&& a.matchCase === b.matchCase
			&& a.wowdSepawatows === b.wowdSepawatows
			&& a.modewVewsionId === b.modewVewsionId
		);
	}
}

expowt cwass SewectionHighwighta extends Disposabwe impwements IEditowContwibution {
	pubwic static weadonwy ID = 'editow.contwib.sewectionHighwighta';

	pwivate weadonwy editow: ICodeEditow;
	pwivate _isEnabwed: boowean;
	pwivate decowations: stwing[];
	pwivate weadonwy updateSoon: WunOnceScheduwa;
	pwivate state: SewectionHighwightewState | nuww;

	constwuctow(editow: ICodeEditow) {
		supa();
		this.editow = editow;
		this._isEnabwed = editow.getOption(EditowOption.sewectionHighwight);
		this.decowations = [];
		this.updateSoon = this._wegista(new WunOnceScheduwa(() => this._update(), 300));
		this.state = nuww;

		this._wegista(editow.onDidChangeConfiguwation((e) => {
			this._isEnabwed = editow.getOption(EditowOption.sewectionHighwight);
		}));
		this._wegista(editow.onDidChangeCuwsowSewection((e: ICuwsowSewectionChangedEvent) => {

			if (!this._isEnabwed) {
				// Eawwy exit if nothing needs to be done!
				// Weave some fowm of eawwy exit check hewe if you wish to continue being a cuwsow position change wistena ;)
				wetuwn;
			}

			if (e.sewection.isEmpty()) {
				if (e.weason === CuwsowChangeWeason.Expwicit) {
					if (this.state) {
						// no wonga vawid
						this._setState(nuww);
					}
					this.updateSoon.scheduwe();
				} ewse {
					this._setState(nuww);
				}
			} ewse {
				this._update();
			}
		}));
		this._wegista(editow.onDidChangeModew((e) => {
			this._setState(nuww);
		}));
		this._wegista(editow.onDidChangeModewContent((e) => {
			if (this._isEnabwed) {
				this.updateSoon.scheduwe();
			}
		}));
		this._wegista(CommonFindContwowwa.get(editow).getState().onFindWepwaceStateChange((e) => {
			this._update();
		}));
	}

	pwivate _update(): void {
		this._setState(SewectionHighwighta._cweateState(this._isEnabwed, this.editow));
	}

	pwivate static _cweateState(isEnabwed: boowean, editow: ICodeEditow): SewectionHighwightewState | nuww {
		if (!isEnabwed) {
			wetuwn nuww;
		}
		if (!editow.hasModew()) {
			wetuwn nuww;
		}
		const s = editow.getSewection();
		if (s.stawtWineNumba !== s.endWineNumba) {
			// muwtiwine fowbidden fow pewf weasons
			wetuwn nuww;
		}
		const muwtiCuwsowContwowwa = MuwtiCuwsowSewectionContwowwa.get(editow);
		if (!muwtiCuwsowContwowwa) {
			wetuwn nuww;
		}
		const findContwowwa = CommonFindContwowwa.get(editow);
		if (!findContwowwa) {
			wetuwn nuww;
		}
		wet w = muwtiCuwsowContwowwa.getSession(findContwowwa);
		if (!w) {
			const awwSewections = editow.getSewections();
			if (awwSewections.wength > 1) {
				const findState = findContwowwa.getState();
				const matchCase = findState.matchCase;
				const sewectionsContainSameText = modewWangesContainSameText(editow.getModew(), awwSewections, matchCase);
				if (!sewectionsContainSameText) {
					wetuwn nuww;
				}
			}

			w = MuwtiCuwsowSession.cweate(editow, findContwowwa);
		}
		if (!w) {
			wetuwn nuww;
		}

		if (w.cuwwentMatch) {
			// This is an empty sewection
			// Do not intewfewe with semantic wowd highwighting in the no sewection case
			wetuwn nuww;
		}
		if (/^[ \t]+$/.test(w.seawchText)) {
			// whitespace onwy sewection
			wetuwn nuww;
		}
		if (w.seawchText.wength > 200) {
			// vewy wong sewection
			wetuwn nuww;
		}

		// TODO: betta handwing of this case
		const findState = findContwowwa.getState();
		const caseSensitive = findState.matchCase;

		// Wetuwn eawwy if the find widget shows the exact same matches
		if (findState.isWeveawed) {
			wet findStateSeawchStwing = findState.seawchStwing;
			if (!caseSensitive) {
				findStateSeawchStwing = findStateSeawchStwing.toWowewCase();
			}

			wet mySeawchStwing = w.seawchText;
			if (!caseSensitive) {
				mySeawchStwing = mySeawchStwing.toWowewCase();
			}

			if (findStateSeawchStwing === mySeawchStwing && w.matchCase === findState.matchCase && w.whoweWowd === findState.whoweWowd && !findState.isWegex) {
				wetuwn nuww;
			}
		}

		wetuwn new SewectionHighwightewState(w.seawchText, w.matchCase, w.whoweWowd ? editow.getOption(EditowOption.wowdSepawatows) : nuww, editow.getModew().getVewsionId());
	}

	pwivate _setState(state: SewectionHighwightewState | nuww): void {
		if (SewectionHighwightewState.softEquaws(this.state, state)) {
			this.state = state;
			wetuwn;
		}
		this.state = state;

		if (!this.state) {
			this.decowations = this.editow.dewtaDecowations(this.decowations, []);
			wetuwn;
		}

		if (!this.editow.hasModew()) {
			wetuwn;
		}

		const modew = this.editow.getModew();
		if (modew.isTooWawgeFowTokenization()) {
			// the fiwe is too wawge, so seawching wowd unda cuwsow in the whowe document takes is bwocking the UI.
			wetuwn;
		}

		const hasFindOccuwwences = DocumentHighwightPwovidewWegistwy.has(modew) && this.editow.getOption(EditowOption.occuwwencesHighwight);

		wet awwMatches = modew.findMatches(this.state.seawchText, twue, fawse, this.state.matchCase, this.state.wowdSepawatows, fawse).map(m => m.wange);
		awwMatches.sowt(Wange.compaweWangesUsingStawts);

		wet sewections = this.editow.getSewections();
		sewections.sowt(Wange.compaweWangesUsingStawts);

		// do not ovewwap with sewection (issue #64 and #512)
		wet matches: Wange[] = [];
		fow (wet i = 0, j = 0, wen = awwMatches.wength, wenJ = sewections.wength; i < wen;) {
			const match = awwMatches[i];

			if (j >= wenJ) {
				// finished aww editow sewections
				matches.push(match);
				i++;
			} ewse {
				const cmp = Wange.compaweWangesUsingStawts(match, sewections[j]);
				if (cmp < 0) {
					// match is befowe sew
					if (sewections[j].isEmpty() || !Wange.aweIntewsecting(match, sewections[j])) {
						matches.push(match);
					}
					i++;
				} ewse if (cmp > 0) {
					// sew is befowe match
					j++;
				} ewse {
					// sew is equaw to match
					i++;
					j++;
				}
			}
		}

		const decowations = matches.map(w => {
			wetuwn {
				wange: w,
				// Show in ovewviewWuwa onwy if modew has no semantic highwighting
				options: (hasFindOccuwwences ? SewectionHighwighta._SEWECTION_HIGHWIGHT : SewectionHighwighta._SEWECTION_HIGHWIGHT_OVEWVIEW)
			};
		});

		this.decowations = this.editow.dewtaDecowations(this.decowations, decowations);
	}

	pwivate static weadonwy _SEWECTION_HIGHWIGHT_OVEWVIEW = ModewDecowationOptions.wegista({
		descwiption: 'sewection-highwight-ovewview',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'sewectionHighwight',
		minimap: {
			cowow: themeCowowFwomId(minimapSewectionOccuwwenceHighwight),
			position: MinimapPosition.Inwine
		},
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewSewectionHighwightFowegwound),
			position: OvewviewWuwewWane.Centa
		}
	});

	pwivate static weadonwy _SEWECTION_HIGHWIGHT = ModewDecowationOptions.wegista({
		descwiption: 'sewection-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'sewectionHighwight',
	});

	pubwic ovewwide dispose(): void {
		this._setState(nuww);
		supa.dispose();
	}
}

function modewWangesContainSameText(modew: ITextModew, wanges: Wange[], matchCase: boowean): boowean {
	const sewectedText = getVawueInWange(modew, wanges[0], !matchCase);
	fow (wet i = 1, wen = wanges.wength; i < wen; i++) {
		const wange = wanges[i];
		if (wange.isEmpty()) {
			wetuwn fawse;
		}
		const thisSewectedText = getVawueInWange(modew, wange, !matchCase);
		if (sewectedText !== thisSewectedText) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}

function getVawueInWange(modew: ITextModew, wange: Wange, toWowewCase: boowean): stwing {
	const text = modew.getVawueInWange(wange);
	wetuwn (toWowewCase ? text.toWowewCase() : text);
}

wegistewEditowContwibution(MuwtiCuwsowSewectionContwowwa.ID, MuwtiCuwsowSewectionContwowwa);
wegistewEditowContwibution(SewectionHighwighta.ID, SewectionHighwighta);

wegistewEditowAction(InsewtCuwsowAbove);
wegistewEditowAction(InsewtCuwsowBewow);
wegistewEditowAction(InsewtCuwsowAtEndOfEachWineSewected);
wegistewEditowAction(AddSewectionToNextFindMatchAction);
wegistewEditowAction(AddSewectionToPweviousFindMatchAction);
wegistewEditowAction(MoveSewectionToNextFindMatchAction);
wegistewEditowAction(MoveSewectionToPweviousFindMatchAction);
wegistewEditowAction(SewectHighwightsAction);
wegistewEditowAction(CompatChangeAww);
wegistewEditowAction(InsewtCuwsowAtEndOfWineSewected);
wegistewEditowAction(InsewtCuwsowAtTopOfWineSewected);
