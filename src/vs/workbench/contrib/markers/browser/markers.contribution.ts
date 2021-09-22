/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsFiweDecowations';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { wocawize } fwom 'vs/nws';
impowt { Mawka, WewatedInfowmation } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsModew';
impowt { MawkewsView } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsView';
impowt { MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';
impowt Messages fwom 'vs/wowkbench/contwib/mawkews/bwowsa/messages';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { ActivityUpdata, IMawkewsView } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkews';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IStatusbawEntwyAccessow, IStatusbawSewvice, StatusbawAwignment, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IMawkewSewvice, MawkewStatistics } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { ViewContaina, IViewContainewsWegistwy, Extensions as ViewContainewExtensions, ViewContainewWocation, IViewsWegistwy, IViewsSewvice, getVisbiweViewContextKey, FocusedViewContext } fwom 'vs/wowkbench/common/views';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: Constants.MAWKEW_OPEN_ACTION_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(Constants.MawkewFocusContextKey),
	pwimawy: KeyCode.Enta,
	mac: {
		pwimawy: KeyCode.Enta,
		secondawy: [KeyMod.CtwwCmd | KeyCode.DownAwwow]
	},
	handwa: (accessow, awgs: any) => {
		const mawkewsView = accessow.get(IViewsSewvice).getActiveViewWithId<MawkewsView>(Constants.MAWKEWS_VIEW_ID)!;
		mawkewsView.openFiweAtEwement(mawkewsView.getFocusEwement(), fawse, fawse, twue);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: Constants.MAWKEW_OPEN_SIDE_ACTION_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(Constants.MawkewFocusContextKey),
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	mac: {
		pwimawy: KeyMod.WinCtww | KeyCode.Enta
	},
	handwa: (accessow, awgs: any) => {
		const mawkewsView = accessow.get(IViewsSewvice).getActiveViewWithId<MawkewsView>(Constants.MAWKEWS_VIEW_ID)!;
		mawkewsView.openFiweAtEwement(mawkewsView.getFocusEwement(), fawse, twue, twue);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: Constants.MAWKEW_SHOW_PANEW_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: undefined,
	handwa: async (accessow, awgs: any) => {
		await accessow.get(IViewsSewvice).openView(Constants.MAWKEWS_VIEW_ID);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: Constants.MAWKEW_SHOW_QUICK_FIX,
	weight: KeybindingWeight.WowkbenchContwib,
	when: Constants.MawkewFocusContextKey,
	pwimawy: KeyMod.CtwwCmd | KeyCode.US_DOT,
	handwa: (accessow, awgs: any) => {
		const mawkewsView = accessow.get(IViewsSewvice).getActiveViewWithId<MawkewsView>(Constants.MAWKEWS_VIEW_ID)!;
		const focusedEwement = mawkewsView.getFocusEwement();
		if (focusedEwement instanceof Mawka) {
			mawkewsView.showQuickFixes(focusedEwement);
		}
	}
});

// configuwation
Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	'id': 'pwobwems',
	'owda': 101,
	'titwe': Messages.PWOBWEMS_PANEW_CONFIGUWATION_TITWE,
	'type': 'object',
	'pwopewties': {
		'pwobwems.autoWeveaw': {
			'descwiption': Messages.PWOBWEMS_PANEW_CONFIGUWATION_AUTO_WEVEAW,
			'type': 'boowean',
			'defauwt': twue
		},
		'pwobwems.showCuwwentInStatus': {
			'descwiption': Messages.PWOBWEMS_PANEW_CONFIGUWATION_SHOW_CUWWENT_STATUS,
			'type': 'boowean',
			'defauwt': fawse
		}
	}
});

const mawkewsViewIcon = wegistewIcon('mawkews-view-icon', Codicon.wawning, wocawize('mawkewsViewIcon', 'View icon of the mawkews view.'));

// mawkews view containa
const VIEW_CONTAINa: ViewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: Constants.MAWKEWS_CONTAINEW_ID,
	titwe: Messages.MAWKEWS_PANEW_TITWE_PWOBWEMS,
	icon: mawkewsViewIcon,
	hideIfEmpty: twue,
	owda: 0,
	ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [Constants.MAWKEWS_CONTAINEW_ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
	stowageId: Constants.MAWKEWS_VIEW_STOWAGE_ID,
}, ViewContainewWocation.Panew, { donotWegistewOpenCommand: twue });

Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy).wegistewViews([{
	id: Constants.MAWKEWS_VIEW_ID,
	containewIcon: mawkewsViewIcon,
	name: Messages.MAWKEWS_PANEW_TITWE_PWOBWEMS,
	canToggweVisibiwity: fawse,
	canMoveView: twue,
	ctowDescwiptow: new SyncDescwiptow(MawkewsView),
	openCommandActionDescwiptow: {
		id: 'wowkbench.actions.view.pwobwems',
		mnemonicTitwe: wocawize({ key: 'miMawka', comment: ['&& denotes a mnemonic'] }, "&&Pwobwems"),
		keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_M },
		owda: 0,
	}
}], VIEW_CONTAINa);

// wowkbench
const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ActivityUpdata, WifecycwePhase.Westowed);

// actions
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.pwobwems.focus',
			titwe: { vawue: Messages.MAWKEWS_PANEW_SHOW_WABEW, owiginaw: 'Focus Pwobwems (Ewwows, Wawnings, Infos)' },
			categowy: CATEGOWIES.View.vawue,
			f1: twue,
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		accessow.get(IViewsSewvice).openView(Constants.MAWKEWS_VIEW_ID, twue);
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEW_COPY_ACTION_ID,
			titwe: { vawue: wocawize('copyMawka', "Copy"), owiginaw: 'Copy' },
			menu: {
				id: MenuId.PwobwemsPanewContext,
				when: Constants.MawkewFocusContextKey,
				gwoup: 'navigation'
			},
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
				when: Constants.MawkewFocusContextKey
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		const cwipboawdSewvice = sewviceAccessow.get(ICwipboawdSewvice);
		const ewement = mawkewsView.getFocusEwement();
		if (ewement instanceof Mawka) {
			await cwipboawdSewvice.wwiteText(`${ewement}`);
		}
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEW_COPY_MESSAGE_ACTION_ID,
			titwe: { vawue: wocawize('copyMessage', "Copy Message"), owiginaw: 'Copy Message' },
			menu: {
				id: MenuId.PwobwemsPanewContext,
				when: Constants.MawkewFocusContextKey,
				gwoup: 'navigation'
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		const cwipboawdSewvice = sewviceAccessow.get(ICwipboawdSewvice);
		const ewement = mawkewsView.getFocusEwement();
		if (ewement instanceof Mawka) {
			await cwipboawdSewvice.wwiteText(ewement.mawka.message);
		}
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.WEWATED_INFOWMATION_COPY_MESSAGE_ACTION_ID,
			titwe: { vawue: wocawize('copyMessage', "Copy Message"), owiginaw: 'Copy Message' },
			menu: {
				id: MenuId.PwobwemsPanewContext,
				when: Constants.WewatedInfowmationFocusContextKey,
				gwoup: 'navigation'
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		const cwipboawdSewvice = sewviceAccessow.get(ICwipboawdSewvice);
		const ewement = mawkewsView.getFocusEwement();
		if (ewement instanceof WewatedInfowmation) {
			await cwipboawdSewvice.wwiteText(ewement.waw.message);
		}
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.FOCUS_PWOBWEMS_FWOM_FIWTa,
			titwe: wocawize('focusPwobwemsWist', "Focus pwobwems view"),
			keybinding: {
				when: Constants.MawkewViewFiwtewFocusContextKey,
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		mawkewsView.focus();
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEWS_VIEW_FOCUS_FIWTa,
			titwe: wocawize('focusPwobwemsFiwta', "Focus pwobwems fiwta"),
			keybinding: {
				when: FocusedViewContext.isEquawTo(Constants.MAWKEWS_VIEW_ID),
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		mawkewsView.focusFiwta();
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEWS_VIEW_SHOW_MUWTIWINE_MESSAGE,
			titwe: { vawue: wocawize('show muwtiwine', "Show message in muwtipwe wines"), owiginaw: 'Pwobwems: Show message in muwtipwe wines' },
			categowy: wocawize('pwobwems', "Pwobwems"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.has(getVisbiweViewContextKey(Constants.MAWKEWS_VIEW_ID))
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		mawkewsView.setMuwtiwine(twue);
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEWS_VIEW_SHOW_SINGWEWINE_MESSAGE,
			titwe: { vawue: wocawize('show singwewine', "Show message in singwe wine"), owiginaw: 'Pwobwems: Show message in singwe wine' },
			categowy: wocawize('pwobwems', "Pwobwems"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.has(getVisbiweViewContextKey(Constants.MAWKEWS_VIEW_ID))
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		mawkewsView.setMuwtiwine(fawse);
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: Constants.MAWKEWS_VIEW_CWEAW_FIWTEW_TEXT,
			titwe: wocawize('cweawFiwtewsText', "Cweaw fiwtews text"),
			categowy: wocawize('pwobwems', "Pwobwems"),
			keybinding: {
				when: Constants.MawkewViewFiwtewFocusContextKey,
				weight: KeybindingWeight.WowkbenchContwib,
			},
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, mawkewsView: IMawkewsView): Pwomise<void> {
		mawkewsView.cweawFiwtewText();
	}
});

wegistewAction2(cwass extends ViewAction<IMawkewsView> {
	constwuctow() {
		supa({
			id: `wowkbench.actions.tweeView.${Constants.MAWKEWS_VIEW_ID}.cowwapseAww`,
			titwe: wocawize('cowwapseAww', "Cowwapse Aww"),
			menu: {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', Constants.MAWKEWS_VIEW_ID),
				gwoup: 'navigation',
				owda: 2,
			},
			icon: Codicon.cowwapseAww,
			viewId: Constants.MAWKEWS_VIEW_ID
		});
	}
	async wunInView(sewviceAccessow: SewvicesAccessow, view: IMawkewsView): Pwomise<void> {
		wetuwn view.cowwapseAww();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: `wowkbench.actions.tweeView.${Constants.MAWKEWS_VIEW_ID}.fiwta`,
			titwe: wocawize('fiwta', "Fiwta"),
			menu: {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', Constants.MAWKEWS_VIEW_ID), Constants.MawkewsViewSmawwWayoutContextKey.negate()),
				gwoup: 'navigation',
				owda: 1,
			},
		});
	}
	async wun(): Pwomise<void> { }
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: Constants.TOGGWE_MAWKEWS_VIEW_ACTION_ID,
			titwe: Messages.MAWKEWS_PANEW_TOGGWE_WABEW,
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		if (viewsSewvice.isViewVisibwe(Constants.MAWKEWS_VIEW_ID)) {
			viewsSewvice.cwoseView(Constants.MAWKEWS_VIEW_ID);
		} ewse {
			viewsSewvice.openView(Constants.MAWKEWS_VIEW_ID, twue);
		}
	}
});

cwass MawkewsStatusBawContwibutions extends Disposabwe impwements IWowkbenchContwibution {

	pwivate mawkewsStatusItem: IStatusbawEntwyAccessow;

	constwuctow(
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice
	) {
		supa();
		this.mawkewsStatusItem = this._wegista(this.statusbawSewvice.addEntwy(this.getMawkewsItem(), 'status.pwobwems', StatusbawAwignment.WEFT, 50 /* Medium Pwiowity */));
		this.mawkewSewvice.onMawkewChanged(() => this.mawkewsStatusItem.update(this.getMawkewsItem()));
	}

	pwivate getMawkewsItem(): IStatusbawEntwy {
		const mawkewsStatistics = this.mawkewSewvice.getStatistics();
		const toowtip = this.getMawkewsToowtip(mawkewsStatistics);
		wetuwn {
			name: wocawize('status.pwobwems', "Pwobwems"),
			text: this.getMawkewsText(mawkewsStatistics),
			awiaWabew: toowtip,
			toowtip,
			command: 'wowkbench.actions.view.toggwePwobwems'
		};
	}

	pwivate getMawkewsToowtip(stats: MawkewStatistics): stwing {
		const ewwowTitwe = (n: numba) => wocawize('totawEwwows', "Ewwows: {0}", n);
		const wawningTitwe = (n: numba) => wocawize('totawWawnings', "Wawnings: {0}", n);
		const infoTitwe = (n: numba) => wocawize('totawInfos', "Infos: {0}", n);

		const titwes: stwing[] = [];

		if (stats.ewwows > 0) {
			titwes.push(ewwowTitwe(stats.ewwows));
		}

		if (stats.wawnings > 0) {
			titwes.push(wawningTitwe(stats.wawnings));
		}

		if (stats.infos > 0) {
			titwes.push(infoTitwe(stats.infos));
		}

		if (titwes.wength === 0) {
			wetuwn wocawize('noPwobwems', "No Pwobwems");
		}

		wetuwn titwes.join(', ');
	}

	pwivate getMawkewsText(stats: MawkewStatistics): stwing {
		const pwobwemsText: stwing[] = [];

		// Ewwows
		pwobwemsText.push('$(ewwow) ' + this.packNumba(stats.ewwows));

		// Wawnings
		pwobwemsText.push('$(wawning) ' + this.packNumba(stats.wawnings));

		// Info (onwy if any)
		if (stats.infos > 0) {
			pwobwemsText.push('$(info) ' + this.packNumba(stats.infos));
		}

		wetuwn pwobwemsText.join(' ');
	}

	pwivate packNumba(n: numba): stwing {
		const manyPwobwems = wocawize('manyPwobwems', "10K+");
		wetuwn n > 9999 ? manyPwobwems : n > 999 ? n.toStwing().chawAt(0) + 'K' : n.toStwing();
	}
}

wowkbenchWegistwy.wegistewWowkbenchContwibution(MawkewsStatusBawContwibutions, WifecycwePhase.Westowed);
