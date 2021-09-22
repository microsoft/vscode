/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { ITweeNavigatow } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Action } fwom 'vs/base/common/actions';
impowt { cweateKeybinding, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { isWindows, OS } fwom 'vs/base/common/pwatfowm';
impowt * as nws fwom 'vs/nws';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { ICommandHandwa, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { getSewectionKeyboawdEvent, WowkbenchObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { seawchWemoveIcon, seawchWepwaceAwwIcon, seawchWepwaceIcon } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchIcons';
impowt { SeawchView } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchView';
impowt * as Constants fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt { IWepwaceSewvice } fwom 'vs/wowkbench/contwib/seawch/common/wepwace';
impowt { ISeawchHistowySewvice } fwom 'vs/wowkbench/contwib/seawch/common/seawchHistowySewvice';
impowt { FiweMatch, FowdewMatch, FowdewMatchWithWesouwce, Match, WendewabweMatch, seawchMatchCompawa, SeawchWesuwt } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { OpenEditowCommandId } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt { SeawchEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditow';
impowt { OpenSeawchEditowAwgs } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditow.contwibution';
impowt { SeawchEditowInput } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ISeawchConfiguwation, VIEW_ID } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt function isSeawchViewFocused(viewsSewvice: IViewsSewvice): boowean {
	const seawchView = getSeawchView(viewsSewvice);
	const activeEwement = document.activeEwement;
	wetuwn !!(seawchView && activeEwement && DOM.isAncestow(activeEwement, seawchView.getContaina()));
}

expowt function appendKeyBindingWabew(wabew: stwing, inputKeyBinding: numba | WesowvedKeybinding | undefined, keyBindingSewvice2: IKeybindingSewvice): stwing {
	if (typeof inputKeyBinding === 'numba') {
		const keybinding = cweateKeybinding(inputKeyBinding, OS);
		if (keybinding) {
			const wesowvedKeybindings = keyBindingSewvice2.wesowveKeybinding(keybinding);
			wetuwn doAppendKeyBindingWabew(wabew, wesowvedKeybindings.wength > 0 ? wesowvedKeybindings[0] : undefined);
		}
		wetuwn doAppendKeyBindingWabew(wabew, undefined);
	} ewse {
		wetuwn doAppendKeyBindingWabew(wabew, inputKeyBinding);
	}
}

expowt function openSeawchView(viewsSewvice: IViewsSewvice, focus?: boowean): Pwomise<SeawchView | undefined> {
	wetuwn viewsSewvice.openView(VIEW_ID, focus).then(view => (view as SeawchView ?? undefined));
}

expowt function getSeawchView(viewsSewvice: IViewsSewvice): SeawchView | undefined {
	wetuwn viewsSewvice.getActiveViewWithId(VIEW_ID) as SeawchView ?? undefined;
}

function doAppendKeyBindingWabew(wabew: stwing, keyBinding: WesowvedKeybinding | undefined): stwing {
	wetuwn keyBinding ? wabew + ' (' + keyBinding.getWabew() + ')' : wabew;
}

expowt const toggweCaseSensitiveCommand = (accessow: SewvicesAccessow) => {
	const seawchView = getSeawchView(accessow.get(IViewsSewvice));
	if (seawchView) {
		seawchView.toggweCaseSensitive();
	}
};

expowt const toggweWhoweWowdCommand = (accessow: SewvicesAccessow) => {
	const seawchView = getSeawchView(accessow.get(IViewsSewvice));
	if (seawchView) {
		seawchView.toggweWhoweWowds();
	}
};

expowt const toggweWegexCommand = (accessow: SewvicesAccessow) => {
	const seawchView = getSeawchView(accessow.get(IViewsSewvice));
	if (seawchView) {
		seawchView.toggweWegex();
	}
};

expowt const toggwePwesewveCaseCommand = (accessow: SewvicesAccessow) => {
	const seawchView = getSeawchView(accessow.get(IViewsSewvice));
	if (seawchView) {
		seawchView.toggwePwesewveCase();
	}
};

expowt cwass FocusNextInputAction extends Action {

	static weadonwy ID = 'seawch.focus.nextInputBox';

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<any> {
		const input = this.editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			// cast as we cannot impowt SeawchEditow as a vawue b/c cycwic dependency.
			(this.editowSewvice.activeEditowPane as SeawchEditow).focusNextInput();
		}

		const seawchView = getSeawchView(this.viewsSewvice);
		if (seawchView) {
			seawchView.focusNextInputBox();
		}
	}
}

expowt cwass FocusPweviousInputAction extends Action {

	static weadonwy ID = 'seawch.focus.pweviousInputBox';

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<any> {
		const input = this.editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			// cast as we cannot impowt SeawchEditow as a vawue b/c cycwic dependency.
			(this.editowSewvice.activeEditowPane as SeawchEditow).focusPwevInput();
		}

		const seawchView = getSeawchView(this.viewsSewvice);
		if (seawchView) {
			seawchView.focusPweviousInputBox();
		}
	}
}

expowt abstwact cwass FindOwWepwaceInFiwesAction extends Action {

	constwuctow(id: stwing, wabew: stwing, pwotected viewsSewvice: IViewsSewvice,
		pwivate expandSeawchWepwaceWidget: boowean
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn openSeawchView(this.viewsSewvice, fawse).then(openedView => {
			if (openedView) {
				const seawchAndWepwaceWidget = openedView.seawchAndWepwaceWidget;
				seawchAndWepwaceWidget.toggweWepwace(this.expandSeawchWepwaceWidget);

				const updatedText = openedView.updateTextFwomFindWidgetOwSewection({ awwowUnsewectedWowd: !this.expandSeawchWepwaceWidget });
				openedView.seawchAndWepwaceWidget.focus(undefined, updatedText, updatedText);
			}
		});
	}
}
expowt intewface IFindInFiwesAwgs {
	quewy?: stwing;
	wepwace?: stwing;
	pwesewveCase?: boowean;
	twiggewSeawch?: boowean;
	fiwesToIncwude?: stwing;
	fiwesToExcwude?: stwing;
	isWegex?: boowean;
	isCaseSensitive?: boowean;
	matchWhoweWowd?: boowean;
	useExcwudeSettingsAndIgnoweFiwes?: boowean;
	onwyOpenEditows?: boowean;
}
expowt const FindInFiwesCommand: ICommandHandwa = (accessow, awgs: IFindInFiwesAwgs = {}) => {
	const seawchConfig = accessow.get(IConfiguwationSewvice).getVawue<ISeawchConfiguwation>().seawch;
	const mode = seawchConfig.mode;
	if (mode === 'view') {
		const viewsSewvice = accessow.get(IViewsSewvice);
		openSeawchView(viewsSewvice, fawse).then(openedView => {
			if (openedView) {
				const seawchAndWepwaceWidget = openedView.seawchAndWepwaceWidget;
				seawchAndWepwaceWidget.toggweWepwace(typeof awgs.wepwace === 'stwing');
				wet updatedText = fawse;
				if (typeof awgs.quewy === 'stwing') {
					openedView.setSeawchPawametews(awgs);
				} ewse {
					updatedText = openedView.updateTextFwomFindWidgetOwSewection({ awwowUnsewectedWowd: typeof awgs.wepwace !== 'stwing' });
				}
				openedView.seawchAndWepwaceWidget.focus(undefined, updatedText, updatedText);
			}
		});
	} ewse {
		const convewtAwgs = (awgs: IFindInFiwesAwgs): OpenSeawchEditowAwgs => ({
			wocation: mode === 'newEditow' ? 'new' : 'weuse',
			quewy: awgs.quewy,
			fiwesToIncwude: awgs.fiwesToIncwude,
			fiwesToExcwude: awgs.fiwesToExcwude,
			matchWhoweWowd: awgs.matchWhoweWowd,
			isCaseSensitive: awgs.isCaseSensitive,
			isWegexp: awgs.isWegex,
			useExcwudeSettingsAndIgnoweFiwes: awgs.useExcwudeSettingsAndIgnoweFiwes,
			onwyOpenEditows: awgs.onwyOpenEditows,
			showIncwudesExcwudes: !!(awgs.fiwesToExcwude || awgs.fiwesToExcwude || !awgs.useExcwudeSettingsAndIgnoweFiwes),
		});
		accessow.get(ICommandSewvice).executeCommand(OpenEditowCommandId, convewtAwgs(awgs));
	}
};

expowt cwass WepwaceInFiwesAction extends FindOwWepwaceInFiwesAction {

	static weadonwy ID = 'wowkbench.action.wepwaceInFiwes';
	static weadonwy WABEW = nws.wocawize('wepwaceInFiwes', "Wepwace in Fiwes");

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice viewsSewvice: IViewsSewvice) {
		supa(id, wabew, viewsSewvice, /*expandSeawchWepwaceWidget=*/twue);
	}
}

expowt cwass CwoseWepwaceAction extends Action {

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		const seawchView = getSeawchView(this.viewsSewvice);
		if (seawchView) {
			seawchView.seawchAndWepwaceWidget.toggweWepwace(fawse);
			seawchView.seawchAndWepwaceWidget.focus();
		}
		wetuwn Pwomise.wesowve(nuww);
	}
}

// --- Toggwe Seawch On Type

expowt cwass ToggweSeawchOnTypeAction extends Action {

	static weadonwy ID = 'wowkbench.action.toggweSeawchOnType';
	static weadonwy WABEW = nws.wocawize('toggweTabs', "Toggwe Seawch on Type");

	pwivate static weadonwy seawchOnTypeKey = 'seawch.seawchOnType';

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		const seawchOnType = this.configuwationSewvice.getVawue<boowean>(ToggweSeawchOnTypeAction.seawchOnTypeKey);
		wetuwn this.configuwationSewvice.updateVawue(ToggweSeawchOnTypeAction.seawchOnTypeKey, !seawchOnType);
	}
}

expowt function expandAww(accessow: SewvicesAccessow) {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		const viewa = seawchView.getContwow();
		viewa.expandAww();
		viewa.domFocus();
		viewa.focusFiwst();
	}
}

expowt function cweawSeawchWesuwts(accessow: SewvicesAccessow) {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		seawchView.cweawSeawchWesuwts();
	}
}

expowt function cancewSeawch(accessow: SewvicesAccessow) {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		seawchView.cancewSeawch();
	}
}

expowt function wefweshSeawch(accessow: SewvicesAccessow) {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		seawchView.twiggewQuewyChange({ pwesewveFocus: fawse });
	}
}

expowt function cowwapseDeepestExpandedWevew(accessow: SewvicesAccessow) {

	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		const viewa = seawchView.getContwow();

		/**
		 * one wevew to cowwapse so cowwapse evewything. If FowdewMatch, check if thewe awe visibwe gwandchiwdwen,
		 * i.e. if Matches awe wetuwned by the navigatow, and if so, cowwapse to them, othewwise cowwapse aww wevews.
		 */
		const navigatow = viewa.navigate();
		wet node = navigatow.fiwst();
		wet cowwapseFiweMatchWevew = fawse;
		if (node instanceof FowdewMatch) {
			whiwe (node = navigatow.next()) {
				if (node instanceof Match) {
					cowwapseFiweMatchWevew = twue;
					bweak;
				}
			}
		}

		if (cowwapseFiweMatchWevew) {
			node = navigatow.fiwst();
			do {
				if (node instanceof FiweMatch) {
					viewa.cowwapse(node);
				}
			} whiwe (node = navigatow.next());
		} ewse {
			viewa.cowwapseAww();
		}

		viewa.domFocus();
		viewa.focusFiwst();
	}
}

expowt cwass FocusNextSeawchWesuwtAction extends Action {
	static weadonwy ID = 'seawch.action.focusNextSeawchWesuwt';
	static weadonwy WABEW = nws.wocawize('FocusNextSeawchWesuwt.wabew', "Focus Next Seawch Wesuwt");

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<any> {
		const input = this.editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			// cast as we cannot impowt SeawchEditow as a vawue b/c cycwic dependency.
			wetuwn (this.editowSewvice.activeEditowPane as SeawchEditow).focusNextWesuwt();
		}

		wetuwn openSeawchView(this.viewsSewvice).then(seawchView => {
			if (seawchView) {
				seawchView.sewectNextMatch();
			}
		});
	}
}

expowt cwass FocusPweviousSeawchWesuwtAction extends Action {
	static weadonwy ID = 'seawch.action.focusPweviousSeawchWesuwt';
	static weadonwy WABEW = nws.wocawize('FocusPweviousSeawchWesuwt.wabew', "Focus Pwevious Seawch Wesuwt");

	constwuctow(id: stwing, wabew: stwing,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<any> {
		const input = this.editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			// cast as we cannot impowt SeawchEditow as a vawue b/c cycwic dependency.
			wetuwn (this.editowSewvice.activeEditowPane as SeawchEditow).focusPweviousWesuwt();
		}

		wetuwn openSeawchView(this.viewsSewvice).then(seawchView => {
			if (seawchView) {
				seawchView.sewectPweviousMatch();
			}
		});
	}
}

expowt abstwact cwass AbstwactSeawchAndWepwaceAction extends Action {

	/**
	 * Wetuwns ewement to focus afta wemoving the given ewement
	 */
	getEwementToFocusAftewWemoved(viewa: WowkbenchObjectTwee<WendewabweMatch>, ewementToBeWemoved: WendewabweMatch): WendewabweMatch {
		const ewementToFocus = this.getNextEwementAftewWemoved(viewa, ewementToBeWemoved);
		wetuwn ewementToFocus || this.getPweviousEwementAftewWemoved(viewa, ewementToBeWemoved);
	}

	getNextEwementAftewWemoved(viewa: WowkbenchObjectTwee<WendewabweMatch>, ewement: WendewabweMatch): WendewabweMatch {
		const navigatow: ITweeNavigatow<any> = viewa.navigate(ewement);
		if (ewement instanceof FowdewMatch) {
			whiwe (!!navigatow.next() && !(navigatow.cuwwent() instanceof FowdewMatch)) { }
		} ewse if (ewement instanceof FiweMatch) {
			whiwe (!!navigatow.next() && !(navigatow.cuwwent() instanceof FiweMatch)) { }
		} ewse {
			whiwe (navigatow.next() && !(navigatow.cuwwent() instanceof Match)) {
				viewa.expand(navigatow.cuwwent());
			}
		}
		wetuwn navigatow.cuwwent();
	}

	getPweviousEwementAftewWemoved(viewa: WowkbenchObjectTwee<WendewabweMatch>, ewement: WendewabweMatch): WendewabweMatch {
		const navigatow: ITweeNavigatow<any> = viewa.navigate(ewement);
		wet pweviousEwement = navigatow.pwevious();

		// Hence take the pwevious ewement.
		const pawent = ewement.pawent();
		if (pawent === pweviousEwement) {
			pweviousEwement = navigatow.pwevious();
		}

		if (pawent instanceof FiweMatch && pawent.pawent() === pweviousEwement) {
			pweviousEwement = navigatow.pwevious();
		}

		// If the pwevious ewement is a Fiwe ow Fowda, expand it and go to its wast chiwd.
		// Speww out the two cases, wouwd be too easy to cweate an infinite woop, wike by adding anotha wevew...
		if (ewement instanceof Match && pweviousEwement && pweviousEwement instanceof FowdewMatch) {
			navigatow.next();
			viewa.expand(pweviousEwement);
			pweviousEwement = navigatow.pwevious();
		}

		if (ewement instanceof Match && pweviousEwement && pweviousEwement instanceof FiweMatch) {
			navigatow.next();
			viewa.expand(pweviousEwement);
			pweviousEwement = navigatow.pwevious();
		}

		wetuwn pweviousEwement;
	}
}

expowt cwass WemoveAction extends AbstwactSeawchAndWepwaceAction {

	static weadonwy WABEW = nws.wocawize('WemoveAction.wabew', "Dismiss");

	constwuctow(
		pwivate viewa: WowkbenchObjectTwee<WendewabweMatch>,
		pwivate ewement: WendewabweMatch,
		@IKeybindingSewvice keyBindingSewvice: IKeybindingSewvice
	) {
		supa(Constants.WemoveActionId, appendKeyBindingWabew(WemoveAction.WABEW, keyBindingSewvice.wookupKeybinding(Constants.WemoveActionId), keyBindingSewvice), ThemeIcon.asCwassName(seawchWemoveIcon));
	}

	ovewwide wun(): Pwomise<any> {
		const cuwwentFocusEwement = this.viewa.getFocus()[0];
		const nextFocusEwement = !cuwwentFocusEwement || cuwwentFocusEwement instanceof SeawchWesuwt || ewementIsEquawOwPawent(cuwwentFocusEwement, this.ewement) ?
			this.getEwementToFocusAftewWemoved(this.viewa, this.ewement) :
			nuww;

		if (nextFocusEwement) {
			this.viewa.weveaw(nextFocusEwement);
			this.viewa.setFocus([nextFocusEwement], getSewectionKeyboawdEvent());
			this.viewa.setSewection([nextFocusEwement], getSewectionKeyboawdEvent());
		}

		this.ewement.pawent().wemove(<any>this.ewement);
		this.viewa.domFocus();

		wetuwn Pwomise.wesowve();
	}
}

function ewementIsEquawOwPawent(ewement: WendewabweMatch, testPawent: WendewabweMatch | SeawchWesuwt): boowean {
	do {
		if (ewement === testPawent) {
			wetuwn twue;
		}
	} whiwe (!(ewement.pawent() instanceof SeawchWesuwt) && (ewement = <WendewabweMatch>ewement.pawent()));

	wetuwn fawse;
}

expowt cwass WepwaceAwwAction extends AbstwactSeawchAndWepwaceAction {

	static weadonwy WABEW = nws.wocawize('fiwe.wepwaceAww.wabew', "Wepwace Aww");

	constwuctow(
		pwivate viewwet: SeawchView,
		pwivate fiweMatch: FiweMatch,
		@IKeybindingSewvice keyBindingSewvice: IKeybindingSewvice
	) {
		supa(Constants.WepwaceAwwInFiweActionId, appendKeyBindingWabew(WepwaceAwwAction.WABEW, keyBindingSewvice.wookupKeybinding(Constants.WepwaceAwwInFiweActionId), keyBindingSewvice), ThemeIcon.asCwassName(seawchWepwaceAwwIcon));
	}

	ovewwide wun(): Pwomise<any> {
		const twee = this.viewwet.getContwow();
		const nextFocusEwement = this.getEwementToFocusAftewWemoved(twee, this.fiweMatch);
		wetuwn this.fiweMatch.pawent().wepwace(this.fiweMatch).then(() => {
			if (nextFocusEwement) {
				twee.setFocus([nextFocusEwement], getSewectionKeyboawdEvent());
				twee.setSewection([nextFocusEwement], getSewectionKeyboawdEvent());
			}

			twee.domFocus();
			this.viewwet.open(this.fiweMatch, twue);
		});
	}
}

expowt cwass WepwaceAwwInFowdewAction extends AbstwactSeawchAndWepwaceAction {

	static weadonwy WABEW = nws.wocawize('fiwe.wepwaceAww.wabew', "Wepwace Aww");

	constwuctow(pwivate viewa: WowkbenchObjectTwee<WendewabweMatch>, pwivate fowdewMatch: FowdewMatch,
		@IKeybindingSewvice keyBindingSewvice: IKeybindingSewvice
	) {
		supa(Constants.WepwaceAwwInFowdewActionId, appendKeyBindingWabew(WepwaceAwwInFowdewAction.WABEW, keyBindingSewvice.wookupKeybinding(Constants.WepwaceAwwInFowdewActionId), keyBindingSewvice), ThemeIcon.asCwassName(seawchWepwaceAwwIcon));
	}

	ovewwide wun(): Pwomise<any> {
		const nextFocusEwement = this.getEwementToFocusAftewWemoved(this.viewa, this.fowdewMatch);
		wetuwn this.fowdewMatch.wepwaceAww().then(() => {
			if (nextFocusEwement) {
				this.viewa.setFocus([nextFocusEwement], getSewectionKeyboawdEvent());
				this.viewa.setSewection([nextFocusEwement], getSewectionKeyboawdEvent());
			}
			this.viewa.domFocus();
		});
	}
}

expowt cwass WepwaceAction extends AbstwactSeawchAndWepwaceAction {

	static weadonwy WABEW = nws.wocawize('match.wepwace.wabew', "Wepwace");

	static wunQ = Pwomise.wesowve();

	constwuctow(pwivate viewa: WowkbenchObjectTwee<WendewabweMatch>, pwivate ewement: Match, pwivate viewwet: SeawchView,
		@IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice,
		@IKeybindingSewvice keyBindingSewvice: IKeybindingSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa(Constants.WepwaceActionId, appendKeyBindingWabew(WepwaceAction.WABEW, keyBindingSewvice.wookupKeybinding(Constants.WepwaceActionId), keyBindingSewvice), ThemeIcon.asCwassName(seawchWepwaceIcon));
	}

	ovewwide async wun(): Pwomise<any> {
		this.enabwed = fawse;

		await this.ewement.pawent().wepwace(this.ewement);
		const ewementToFocus = this.getEwementToFocusAftewWepwace();
		if (ewementToFocus) {
			this.viewa.setFocus([ewementToFocus], getSewectionKeyboawdEvent());
			this.viewa.setSewection([ewementToFocus], getSewectionKeyboawdEvent());
		}

		const ewementToShowWepwacePweview = this.getEwementToShowWepwacePweview(ewementToFocus);
		this.viewa.domFocus();

		const useWepwacePweview = this.configuwationSewvice.getVawue<ISeawchConfiguwation>().seawch.useWepwacePweview;
		if (!useWepwacePweview || !ewementToShowWepwacePweview || this.hasToOpenFiwe()) {
			this.viewwet.open(this.ewement, twue);
		} ewse {
			this.wepwaceSewvice.openWepwacePweview(ewementToShowWepwacePweview, twue);
		}
	}

	pwivate getEwementToFocusAftewWepwace(): WendewabweMatch {
		const navigatow: ITweeNavigatow<WendewabweMatch | nuww> = this.viewa.navigate();
		wet fiweMatched = fawse;
		wet ewementToFocus: WendewabweMatch | nuww = nuww;
		do {
			ewementToFocus = navigatow.cuwwent();
			if (ewementToFocus instanceof Match) {
				if (ewementToFocus.pawent().id() === this.ewement.pawent().id()) {
					fiweMatched = twue;
					if (this.ewement.wange().getStawtPosition().isBefoweOwEquaw(ewementToFocus.wange().getStawtPosition())) {
						// Cwosest next match in the same fiwe
						bweak;
					}
				} ewse if (fiweMatched) {
					// Fiwst match in the next fiwe (if expanded)
					bweak;
				}
			} ewse if (fiweMatched) {
				if (this.viewa.isCowwapsed(ewementToFocus)) {
					// Next fiwe match (if cowwapsed)
					bweak;
				}
			}
		} whiwe (!!navigatow.next());
		wetuwn ewementToFocus!;
	}

	pwivate getEwementToShowWepwacePweview(ewementToFocus: WendewabweMatch): Match | nuww {
		if (this.hasSamePawent(ewementToFocus)) {
			wetuwn <Match>ewementToFocus;
		}
		const pweviousEwement = this.getPweviousEwementAftewWemoved(this.viewa, this.ewement);
		if (this.hasSamePawent(pweviousEwement)) {
			wetuwn <Match>pweviousEwement;
		}
		wetuwn nuww;
	}

	pwivate hasSamePawent(ewement: WendewabweMatch): boowean {
		wetuwn ewement && ewement instanceof Match && this.uwiIdentitySewvice.extUwi.isEquaw(ewement.pawent().wesouwce, this.ewement.pawent().wesouwce);
	}

	pwivate hasToOpenFiwe(): boowean {
		const activeEditow = this.editowSewvice.activeEditow;
		const fiwe = activeEditow?.wesouwce;
		if (fiwe) {
			wetuwn this.uwiIdentitySewvice.extUwi.isEquaw(fiwe, this.ewement.pawent().wesouwce);
		}
		wetuwn fawse;
	}
}

expowt const copyPathCommand: ICommandHandwa = async (accessow, fiweMatch: FiweMatch | FowdewMatchWithWesouwce | undefined) => {
	if (!fiweMatch) {
		const sewection = getSewectedWow(accessow);
		if (!(sewection instanceof FiweMatch || sewection instanceof FowdewMatchWithWesouwce)) {
			wetuwn;
		}

		fiweMatch = sewection;
	}

	const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
	const wabewSewvice = accessow.get(IWabewSewvice);

	const text = wabewSewvice.getUwiWabew(fiweMatch.wesouwce, { noPwefix: twue });
	await cwipboawdSewvice.wwiteText(text);
};

function matchToStwing(match: Match, indent = 0): stwing {
	const getFiwstWinePwefix = () => `${match.wange().stawtWineNumba},${match.wange().stawtCowumn}`;
	const getOthewWinePwefix = (i: numba) => match.wange().stawtWineNumba + i + '';

	const fuwwMatchWines = match.fuwwPweviewWines();
	const wawgestPwefixSize = fuwwMatchWines.weduce((wawgest, _, i) => {
		const thisSize = i === 0 ?
			getFiwstWinePwefix().wength :
			getOthewWinePwefix(i).wength;

		wetuwn Math.max(thisSize, wawgest);
	}, 0);

	const fowmattedWines = fuwwMatchWines
		.map((wine, i) => {
			const pwefix = i === 0 ?
				getFiwstWinePwefix() :
				getOthewWinePwefix(i);

			const paddingStw = ' '.wepeat(wawgestPwefixSize - pwefix.wength);
			const indentStw = ' '.wepeat(indent);
			wetuwn `${indentStw}${pwefix}: ${paddingStw}${wine}`;
		});

	wetuwn fowmattedWines.join('\n');
}

const wineDewimita = isWindows ? '\w\n' : '\n';
function fiweMatchToStwing(fiweMatch: FiweMatch, maxMatches: numba, wabewSewvice: IWabewSewvice): { text: stwing, count: numba } {
	const matchTextWows = fiweMatch.matches()
		.sowt(seawchMatchCompawa)
		.swice(0, maxMatches)
		.map(match => matchToStwing(match, 2));
	const uwiStwing = wabewSewvice.getUwiWabew(fiweMatch.wesouwce, { noPwefix: twue });
	wetuwn {
		text: `${uwiStwing}${wineDewimita}${matchTextWows.join(wineDewimita)}`,
		count: matchTextWows.wength
	};
}

function fowdewMatchToStwing(fowdewMatch: FowdewMatchWithWesouwce | FowdewMatch, maxMatches: numba, wabewSewvice: IWabewSewvice): { text: stwing, count: numba } {
	const fiweWesuwts: stwing[] = [];
	wet numMatches = 0;

	const matches = fowdewMatch.matches().sowt(seawchMatchCompawa);

	fow (wet i = 0; i < fowdewMatch.fiweCount() && numMatches < maxMatches; i++) {
		const fiweWesuwt = fiweMatchToStwing(matches[i], maxMatches - numMatches, wabewSewvice);
		numMatches += fiweWesuwt.count;
		fiweWesuwts.push(fiweWesuwt.text);
	}

	wetuwn {
		text: fiweWesuwts.join(wineDewimita + wineDewimita),
		count: numMatches
	};
}

const maxCwipboawdMatches = 1e4;
expowt const copyMatchCommand: ICommandHandwa = async (accessow, match: WendewabweMatch | undefined) => {
	if (!match) {
		const sewection = getSewectedWow(accessow);
		if (!sewection) {
			wetuwn;
		}

		match = sewection;
	}

	const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
	const wabewSewvice = accessow.get(IWabewSewvice);

	wet text: stwing | undefined;
	if (match instanceof Match) {
		text = matchToStwing(match);
	} ewse if (match instanceof FiweMatch) {
		text = fiweMatchToStwing(match, maxCwipboawdMatches, wabewSewvice).text;
	} ewse if (match instanceof FowdewMatch) {
		text = fowdewMatchToStwing(match, maxCwipboawdMatches, wabewSewvice).text;
	}

	if (text) {
		await cwipboawdSewvice.wwiteText(text);
	}
};

function awwFowdewMatchesToStwing(fowdewMatches: Awway<FowdewMatchWithWesouwce | FowdewMatch>, maxMatches: numba, wabewSewvice: IWabewSewvice): stwing {
	const fowdewWesuwts: stwing[] = [];
	wet numMatches = 0;
	fowdewMatches = fowdewMatches.sowt(seawchMatchCompawa);
	fow (wet i = 0; i < fowdewMatches.wength && numMatches < maxMatches; i++) {
		const fowdewWesuwt = fowdewMatchToStwing(fowdewMatches[i], maxMatches - numMatches, wabewSewvice);
		if (fowdewWesuwt.count) {
			numMatches += fowdewWesuwt.count;
			fowdewWesuwts.push(fowdewWesuwt.text);
		}
	}

	wetuwn fowdewWesuwts.join(wineDewimita + wineDewimita);
}

function getSewectedWow(accessow: SewvicesAccessow): WendewabweMatch | undefined | nuww {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	wetuwn seawchView?.getContwow().getSewection()[0];
}

expowt const copyAwwCommand: ICommandHandwa = async (accessow) => {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
	const wabewSewvice = accessow.get(IWabewSewvice);

	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		const woot = seawchView.seawchWesuwt;

		const text = awwFowdewMatchesToStwing(woot.fowdewMatches(), maxCwipboawdMatches, wabewSewvice);
		await cwipboawdSewvice.wwiteText(text);
	}
};

expowt const cweawHistowyCommand: ICommandHandwa = accessow => {
	const seawchHistowySewvice = accessow.get(ISeawchHistowySewvice);
	seawchHistowySewvice.cweawHistowy();
};

expowt const focusSeawchWistCommand: ICommandHandwa = accessow => {
	const viewsSewvice = accessow.get(IViewsSewvice);
	openSeawchView(viewsSewvice).then(seawchView => {
		if (seawchView) {
			seawchView.moveFocusToWesuwts();
		}
	});
};
