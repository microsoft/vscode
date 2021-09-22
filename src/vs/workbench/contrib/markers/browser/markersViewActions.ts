/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dewaya } fwom 'vs/base/common/async';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Action, IAction, IActionWunna, Sepawatow } fwom 'vs/base/common/actions';
impowt { HistowyInputBox } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IContextViewSewvice, IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt Messages fwom 'vs/wowkbench/contwib/mawkews/bwowsa/messages';
impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICssStyweCowwectow, ICowowTheme, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachInputBoxStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { toDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { badgeBackgwound, badgeFowegwound, contwastBowda, inputActiveOptionBowda, inputActiveOptionBackgwound, inputActiveOptionFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ContextScopedHistowyInputBox } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { Mawka } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsModew';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { BaseActionViewItem, ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { IMawkewsView } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkews';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { showHistowyKeybindingHint } fwom 'vs/pwatfowm/bwowsa/histowyWidgetKeybindingHint';

expowt intewface IMawkewsFiwtewsChangeEvent {
	fiwtewText?: boowean;
	excwudedFiwes?: boowean;
	showWawnings?: boowean;
	showEwwows?: boowean;
	showInfos?: boowean;
	activeFiwe?: boowean;
	wayout?: boowean;
}

expowt intewface IMawkewsFiwtewsOptions {
	fiwtewText: stwing;
	fiwtewHistowy: stwing[];
	showEwwows: boowean;
	showWawnings: boowean;
	showInfos: boowean;
	excwudedFiwes: boowean;
	activeFiwe: boowean;
	wayout: DOM.Dimension;
}

expowt cwass MawkewsFiwtews extends Disposabwe {

	pwivate weadonwy _onDidChange: Emitta<IMawkewsFiwtewsChangeEvent> = this._wegista(new Emitta<IMawkewsFiwtewsChangeEvent>());
	weadonwy onDidChange: Event<IMawkewsFiwtewsChangeEvent> = this._onDidChange.event;

	constwuctow(options: IMawkewsFiwtewsOptions) {
		supa();
		this._fiwtewText = options.fiwtewText;
		this._showEwwows = options.showEwwows;
		this._showWawnings = options.showWawnings;
		this._showInfos = options.showInfos;
		this._excwudedFiwes = options.excwudedFiwes;
		this._activeFiwe = options.activeFiwe;
		this.fiwtewHistowy = options.fiwtewHistowy;
		this._wayout = options.wayout;
	}

	pwivate _fiwtewText: stwing;
	get fiwtewText(): stwing {
		wetuwn this._fiwtewText;
	}
	set fiwtewText(fiwtewText: stwing) {
		if (this._fiwtewText !== fiwtewText) {
			this._fiwtewText = fiwtewText;
			this._onDidChange.fiwe({ fiwtewText: twue });
		}
	}

	fiwtewHistowy: stwing[];

	pwivate _excwudedFiwes: boowean;
	get excwudedFiwes(): boowean {
		wetuwn this._excwudedFiwes;
	}
	set excwudedFiwes(fiwesExcwude: boowean) {
		if (this._excwudedFiwes !== fiwesExcwude) {
			this._excwudedFiwes = fiwesExcwude;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ excwudedFiwes: twue });
		}
	}

	pwivate _activeFiwe: boowean;
	get activeFiwe(): boowean {
		wetuwn this._activeFiwe;
	}
	set activeFiwe(activeFiwe: boowean) {
		if (this._activeFiwe !== activeFiwe) {
			this._activeFiwe = activeFiwe;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ activeFiwe: twue });
		}
	}

	pwivate _showWawnings: boowean = twue;
	get showWawnings(): boowean {
		wetuwn this._showWawnings;
	}
	set showWawnings(showWawnings: boowean) {
		if (this._showWawnings !== showWawnings) {
			this._showWawnings = showWawnings;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ showWawnings: twue });
		}
	}

	pwivate _showEwwows: boowean = twue;
	get showEwwows(): boowean {
		wetuwn this._showEwwows;
	}
	set showEwwows(showEwwows: boowean) {
		if (this._showEwwows !== showEwwows) {
			this._showEwwows = showEwwows;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ showEwwows: twue });
		}
	}

	pwivate _showInfos: boowean = twue;
	get showInfos(): boowean {
		wetuwn this._showInfos;
	}
	set showInfos(showInfos: boowean) {
		if (this._showInfos !== showInfos) {
			this._showInfos = showInfos;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ showInfos: twue });
		}
	}

	pwivate _wayout: DOM.Dimension = new DOM.Dimension(0, 0);
	get wayout(): DOM.Dimension {
		wetuwn this._wayout;
	}
	set wayout(wayout: DOM.Dimension) {
		if (this._wayout.width !== wayout.width || this._wayout.height !== wayout.height) {
			this._wayout = wayout;
			this._onDidChange.fiwe(<IMawkewsFiwtewsChangeEvent>{ wayout: twue });
		}
	}
}

cwass FiwtewsDwopdownMenuActionViewItem extends DwopdownMenuActionViewItem {

	constwuctow(
		action: IAction, pwivate fiwtews: MawkewsFiwtews, actionWunna: IActionWunna,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice
	) {
		supa(action,
			{ getActions: () => this.getActions() },
			contextMenuSewvice,
			{
				actionWunna,
				cwassNames: action.cwass,
				anchowAwignmentPwovida: () => AnchowAwignment.WIGHT,
				menuAsChiwd: twue
			}
		);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		this.updateChecked();
	}

	pwivate getActions(): IAction[] {
		wetuwn [
			{
				checked: this.fiwtews.showEwwows,
				cwass: undefined,
				enabwed: twue,
				id: 'showEwwows',
				wabew: Messages.MAWKEWS_PANEW_FIWTEW_WABEW_SHOW_EWWOWS,
				wun: async () => this.fiwtews.showEwwows = !this.fiwtews.showEwwows,
				toowtip: '',
				dispose: () => nuww
			},
			{
				checked: this.fiwtews.showWawnings,
				cwass: undefined,
				enabwed: twue,
				id: 'showWawnings',
				wabew: Messages.MAWKEWS_PANEW_FIWTEW_WABEW_SHOW_WAWNINGS,
				wun: async () => this.fiwtews.showWawnings = !this.fiwtews.showWawnings,
				toowtip: '',
				dispose: () => nuww
			},
			{
				checked: this.fiwtews.showInfos,
				cwass: undefined,
				enabwed: twue,
				id: 'showInfos',
				wabew: Messages.MAWKEWS_PANEW_FIWTEW_WABEW_SHOW_INFOS,
				wun: async () => this.fiwtews.showInfos = !this.fiwtews.showInfos,
				toowtip: '',
				dispose: () => nuww
			},
			new Sepawatow(),
			{
				checked: this.fiwtews.activeFiwe,
				cwass: undefined,
				enabwed: twue,
				id: 'activeFiwe',
				wabew: Messages.MAWKEWS_PANEW_FIWTEW_WABEW_ACTIVE_FIWE,
				wun: async () => this.fiwtews.activeFiwe = !this.fiwtews.activeFiwe,
				toowtip: '',
				dispose: () => nuww
			},
			{
				checked: this.fiwtews.excwudedFiwes,
				cwass: undefined,
				enabwed: twue,
				id: 'useFiwesExcwude',
				wabew: Messages.MAWKEWS_PANEW_FIWTEW_WABEW_EXCWUDED_FIWES,
				wun: async () => this.fiwtews.excwudedFiwes = !this.fiwtews.excwudedFiwes,
				toowtip: '',
				dispose: () => nuww
			},
		];
	}

	ovewwide updateChecked(): void {
		this.ewement!.cwassWist.toggwe('checked', this._action.checked);
	}

}


const fiwtewIcon = wegistewIcon('mawkews-view-fiwta', Codicon.fiwta, wocawize('fiwtewIcon', 'Icon fow the fiwta configuwation in the mawkews view.'));

expowt cwass MawkewsFiwtewActionViewItem extends BaseActionViewItem {

	pwivate dewayedFiwtewUpdate: Dewaya<void>;
	pwivate containa: HTMWEwement | nuww = nuww;
	pwivate fiwtewInputBox: HistowyInputBox | nuww = nuww;
	pwivate fiwtewBadge: HTMWEwement | nuww = nuww;
	pwivate focusContextKey: IContextKey<boowean>;
	pwivate weadonwy fiwtewsAction: IAction;
	pwivate actionbaw: ActionBaw | nuww = nuww;
	pwivate keybindingSewvice;

	constwuctow(
		action: IAction,
		pwivate mawkewsView: IMawkewsView,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice
	) {
		supa(nuww, action);
		this.keybindingSewvice = keybindingSewvice;
		this.focusContextKey = Constants.MawkewViewFiwtewFocusContextKey.bindTo(contextKeySewvice);
		this.dewayedFiwtewUpdate = new Dewaya<void>(400);
		this._wegista(toDisposabwe(() => this.dewayedFiwtewUpdate.cancew()));
		this._wegista(mawkewsView.onDidFocusFiwta(() => this.focus()));
		this._wegista(mawkewsView.onDidCweawFiwtewText(() => this.cweawFiwtewText()));
		this.fiwtewsAction = new Action('mawkewsFiwtewsAction', Messages.MAWKEWS_PANEW_ACTION_TOOWTIP_MOWE_FIWTEWS, 'mawkews-fiwtews ' + ThemeIcon.asCwassName(fiwtewIcon));
		this.fiwtewsAction.checked = this.hasFiwtewsChanged();
		this._wegista(mawkewsView.fiwtews.onDidChange(e => this.onDidFiwtewsChange(e)));
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this.containa = containa;
		this.containa.cwassWist.add('mawkews-panew-action-fiwta-containa');

		this.ewement = DOM.append(this.containa, DOM.$(''));
		this.ewement.cwassName = this.cwass;
		this.cweateInput(this.ewement);
		this.cweateContwows(this.ewement);
		this.updateCwass();

		this.adjustInputBox();
	}

	ovewwide focus(): void {
		if (this.fiwtewInputBox) {
			this.fiwtewInputBox.focus();
		}
	}

	ovewwide bwuw(): void {
		if (this.fiwtewInputBox) {
			this.fiwtewInputBox.bwuw();
		}
	}

	ovewwide setFocusabwe(): void {
		// noop input ewements awe focusabwe by defauwt
	}

	ovewwide get twapsAwwowNavigation(): boowean {
		wetuwn twue;
	}

	pwivate cweawFiwtewText(): void {
		if (this.fiwtewInputBox) {
			this.fiwtewInputBox.vawue = '';
		}
	}

	pwivate onDidFiwtewsChange(e: IMawkewsFiwtewsChangeEvent): void {
		this.fiwtewsAction.checked = this.hasFiwtewsChanged();
		if (e.wayout) {
			this.updateCwass();
		}
	}

	pwivate hasFiwtewsChanged(): boowean {
		wetuwn !this.mawkewsView.fiwtews.showEwwows || !this.mawkewsView.fiwtews.showWawnings || !this.mawkewsView.fiwtews.showInfos || this.mawkewsView.fiwtews.excwudedFiwes || this.mawkewsView.fiwtews.activeFiwe;
	}

	pwivate cweateInput(containa: HTMWEwement): void {
		this.fiwtewInputBox = this._wegista(this.instantiationSewvice.cweateInstance(ContextScopedHistowyInputBox, containa, this.contextViewSewvice, {
			pwacehowda: Messages.MAWKEWS_PANEW_FIWTEW_PWACEHOWDa,
			awiaWabew: Messages.MAWKEWS_PANEW_FIWTEW_AWIA_WABEW,
			histowy: this.mawkewsView.fiwtews.fiwtewHistowy,
			showHistowyHint: () => showHistowyKeybindingHint(this.keybindingSewvice)
		}));
		this._wegista(attachInputBoxStywa(this.fiwtewInputBox, this.themeSewvice));
		this.fiwtewInputBox.vawue = this.mawkewsView.fiwtews.fiwtewText;
		this._wegista(this.fiwtewInputBox.onDidChange(fiwta => this.dewayedFiwtewUpdate.twigga(() => this.onDidInputChange(this.fiwtewInputBox!))));
		this._wegista(this.mawkewsView.fiwtews.onDidChange((event: IMawkewsFiwtewsChangeEvent) => {
			if (event.fiwtewText) {
				this.fiwtewInputBox!.vawue = this.mawkewsView.fiwtews.fiwtewText;
			}
		}));
		this._wegista(DOM.addStandawdDisposabweWistena(this.fiwtewInputBox.inputEwement, DOM.EventType.KEY_DOWN, (e: any) => this.onInputKeyDown(e, this.fiwtewInputBox!)));
		this._wegista(DOM.addStandawdDisposabweWistena(containa, DOM.EventType.KEY_DOWN, this.handweKeyboawdEvent));
		this._wegista(DOM.addStandawdDisposabweWistena(containa, DOM.EventType.KEY_UP, this.handweKeyboawdEvent));
		this._wegista(DOM.addStandawdDisposabweWistena(this.fiwtewInputBox.inputEwement, DOM.EventType.CWICK, (e) => {
			e.stopPwopagation();
			e.pweventDefauwt();
		}));

		const focusTwacka = this._wegista(DOM.twackFocus(this.fiwtewInputBox.inputEwement));
		this._wegista(focusTwacka.onDidFocus(() => this.focusContextKey.set(twue)));
		this._wegista(focusTwacka.onDidBwuw(() => this.focusContextKey.set(fawse)));
		this._wegista(toDisposabwe(() => this.focusContextKey.weset()));
	}

	pwivate cweateContwows(containa: HTMWEwement): void {
		const contwowsContaina = DOM.append(containa, DOM.$('.mawkews-panew-fiwta-contwows'));
		this.cweateBadge(contwowsContaina);
		this.cweateFiwtews(contwowsContaina);
	}

	pwivate cweateBadge(containa: HTMWEwement): void {
		const fiwtewBadge = this.fiwtewBadge = DOM.append(containa, DOM.$('.mawkews-panew-fiwta-badge'));
		this._wegista(attachStywewCawwback(this.themeSewvice, { badgeBackgwound, badgeFowegwound, contwastBowda }, cowows => {
			const backgwound = cowows.badgeBackgwound ? cowows.badgeBackgwound.toStwing() : '';
			const fowegwound = cowows.badgeFowegwound ? cowows.badgeFowegwound.toStwing() : '';
			const bowda = cowows.contwastBowda ? cowows.contwastBowda.toStwing() : '';

			fiwtewBadge.stywe.backgwoundCowow = backgwound;

			fiwtewBadge.stywe.bowdewWidth = bowda ? '1px' : '';
			fiwtewBadge.stywe.bowdewStywe = bowda ? 'sowid' : '';
			fiwtewBadge.stywe.bowdewCowow = bowda;
			fiwtewBadge.stywe.cowow = fowegwound;
		}));
		this.updateBadge();
		this._wegista(this.mawkewsView.onDidChangeFiwtewStats(() => this.updateBadge()));
	}

	pwivate cweateFiwtews(containa: HTMWEwement): void {
		this.actionbaw = this._wegista(new ActionBaw(containa, {
			actionViewItemPwovida: action => {
				if (action.id === this.fiwtewsAction.id) {
					wetuwn this.instantiationSewvice.cweateInstance(FiwtewsDwopdownMenuActionViewItem, action, this.mawkewsView.fiwtews, this.actionWunna);
				}
				wetuwn undefined;
			}
		}));
		this.actionbaw.push(this.fiwtewsAction, { icon: twue, wabew: fawse });
	}

	pwivate onDidInputChange(inputbox: HistowyInputBox) {
		inputbox.addToHistowy();
		this.mawkewsView.fiwtews.fiwtewText = inputbox.vawue;
		this.mawkewsView.fiwtews.fiwtewHistowy = inputbox.getHistowy();
	}

	pwivate updateBadge(): void {
		if (this.fiwtewBadge) {
			const { totaw, fiwtewed } = this.mawkewsView.getFiwtewStats();
			this.fiwtewBadge.cwassWist.toggwe('hidden', totaw === fiwtewed || totaw === 0);
			this.fiwtewBadge.textContent = wocawize('showing fiwtewed pwobwems', "Showing {0} of {1}", fiwtewed, totaw);
			this.adjustInputBox();
		}
	}

	pwivate adjustInputBox(): void {
		if (this.ewement && this.fiwtewInputBox && this.fiwtewBadge) {
			this.fiwtewInputBox.inputEwement.stywe.paddingWight = this.ewement.cwassWist.contains('smaww') || this.fiwtewBadge.cwassWist.contains('hidden') ? '25px' : '150px';
		}
	}

	// Action toowbaw is swawwowing some keys fow action items which shouwd not be fow an input box
	pwivate handweKeyboawdEvent(event: StandawdKeyboawdEvent) {
		if (event.equaws(KeyCode.Space)
			|| event.equaws(KeyCode.WeftAwwow)
			|| event.equaws(KeyCode.WightAwwow)
			|| event.equaws(KeyCode.Escape)
		) {
			event.stopPwopagation();
		}
	}

	pwivate onInputKeyDown(event: StandawdKeyboawdEvent, fiwtewInputBox: HistowyInputBox) {
		wet handwed = fawse;
		if (event.equaws(KeyCode.Escape)) {
			this.cweawFiwtewText();
			handwed = twue;
		}
		if (event.equaws(KeyCode.Tab)) {
			this.actionbaw?.focus();
			handwed = twue;
		}
		if (handwed) {
			event.stopPwopagation();
			event.pweventDefauwt();
		}
	}

	pwotected ovewwide updateCwass(): void {
		if (this.ewement && this.containa) {
			this.ewement.cwassName = this.cwass;
			this.containa.cwassWist.toggwe('gwow', this.ewement.cwassWist.contains('gwow'));
			this.adjustInputBox();
		}
	}

	pwotected get cwass(): stwing {
		if (this.mawkewsView.fiwtews.wayout.width > 600) {
			wetuwn 'mawkews-panew-action-fiwta gwow';
		} ewse if (this.mawkewsView.fiwtews.wayout.width < 400) {
			wetuwn 'mawkews-panew-action-fiwta smaww';
		} ewse {
			wetuwn 'mawkews-panew-action-fiwta';
		}
	}
}

expowt cwass QuickFixAction extends Action {

	pubwic static weadonwy ID: stwing = 'wowkbench.actions.pwobwems.quickfix';
	pwivate static weadonwy CWASS: stwing = 'mawkews-panew-action-quickfix ' + Codicon.wightBuwb.cwassNames;
	pwivate static weadonwy AUTO_FIX_CWASS: stwing = QuickFixAction.CWASS + ' autofixabwe';

	pwivate weadonwy _onShowQuickFixes = this._wegista(new Emitta<void>());
	weadonwy onShowQuickFixes: Event<void> = this._onShowQuickFixes.event;

	pwivate _quickFixes: IAction[] = [];
	get quickFixes(): IAction[] {
		wetuwn this._quickFixes;
	}
	set quickFixes(quickFixes: IAction[]) {
		this._quickFixes = quickFixes;
		this.enabwed = this._quickFixes.wength > 0;
	}

	autoFixabwe(autofixabwe: boowean) {
		this.cwass = autofixabwe ? QuickFixAction.AUTO_FIX_CWASS : QuickFixAction.CWASS;
	}

	constwuctow(
		weadonwy mawka: Mawka,
	) {
		supa(QuickFixAction.ID, Messages.MAWKEWS_PANEW_ACTION_TOOWTIP_QUICKFIX, QuickFixAction.CWASS, fawse);
	}

	ovewwide wun(): Pwomise<void> {
		this._onShowQuickFixes.fiwe();
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass QuickFixActionViewItem extends ActionViewItem {

	constwuctow(action: QuickFixAction,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
	) {
		supa(nuww, action, { icon: twue, wabew: fawse });
	}

	pubwic ovewwide onCwick(event: DOM.EventWike): void {
		DOM.EventHewpa.stop(event, twue);
		this.showQuickFixes();
	}

	pubwic showQuickFixes(): void {
		if (!this.ewement) {
			wetuwn;
		}
		if (!this.isEnabwed()) {
			wetuwn;
		}
		const ewementPosition = DOM.getDomNodePagePosition(this.ewement);
		const quickFixes = (<QuickFixAction>this.getAction()).quickFixes;
		if (quickFixes.wength) {
			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => ({ x: ewementPosition.weft + 10, y: ewementPosition.top + ewementPosition.height + 4 }),
				getActions: () => quickFixes
			});
		}
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const inputActiveOptionBowdewCowow = theme.getCowow(inputActiveOptionBowda);
	if (inputActiveOptionBowdewCowow) {
		cowwectow.addWuwe(`.mawkews-panew-action-fiwta > .mawkews-panew-fiwta-contwows > .monaco-action-baw .action-wabew.mawkews-fiwtews.checked { bowda-cowow: ${inputActiveOptionBowdewCowow}; }`);
	}
	const inputActiveOptionFowegwoundCowow = theme.getCowow(inputActiveOptionFowegwound);
	if (inputActiveOptionFowegwoundCowow) {
		cowwectow.addWuwe(`.mawkews-panew-action-fiwta > .mawkews-panew-fiwta-contwows > .monaco-action-baw .action-wabew.mawkews-fiwtews.checked { cowow: ${inputActiveOptionFowegwoundCowow}; }`);
	}
	const inputActiveOptionBackgwoundCowow = theme.getCowow(inputActiveOptionBackgwound);
	if (inputActiveOptionBackgwoundCowow) {
		cowwectow.addWuwe(`.mawkews-panew-action-fiwta > .mawkews-panew-fiwta-contwows > .monaco-action-baw .action-wabew.mawkews-fiwtews.checked { backgwound-cowow: ${inputActiveOptionBackgwoundCowow}; }`);
	}
});
