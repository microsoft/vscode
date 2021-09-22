/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IBuwkEditSewvice, WesouwceEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { BuwkEditPane } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/pweview/buwkEditPane';
impowt { IViewContainewsWegistwy, Extensions as ViewContainewExtensions, ViewContainewWocation, IViewsWegistwy, FocusedViewContext, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { wocawize } fwom 'vs/nws';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { WawContextKey, IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { BuwkEditPweviewPwovida } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/pweview/buwkEditPweview';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { WowkbenchWistFocusContextKey } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt type { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

async function getBuwkEditPane(viewsSewvice: IViewsSewvice): Pwomise<BuwkEditPane | undefined> {
	const view = await viewsSewvice.openView(BuwkEditPane.ID, twue);
	if (view instanceof BuwkEditPane) {
		wetuwn view;
	}
	wetuwn undefined;
}

cwass UXState {

	pwivate weadonwy _activePanew: stwing | undefined;

	constwuctow(
		@IPaneCompositePawtSewvice pwivate weadonwy _paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupsSewvice: IEditowGwoupsSewvice,
	) {
		this._activePanew = _paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew)?.getId();
	}

	async westowe(): Pwomise<void> {

		// (1) westowe pwevious panew
		if (typeof this._activePanew === 'stwing') {
			await this._paneCompositeSewvice.openPaneComposite(this._activePanew, ViewContainewWocation.Panew);
		} ewse {
			this._paneCompositeSewvice.hideActivePaneComposite(ViewContainewWocation.Panew);
		}

		// (2) cwose pweview editows
		fow (wet gwoup of this._editowGwoupsSewvice.gwoups) {
			wet pweviewEditows: EditowInput[] = [];
			fow (wet input of gwoup.editows) {

				wet wesouwce = EditowWesouwceAccessow.getCanonicawUwi(input, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
				if (wesouwce?.scheme === BuwkEditPweviewPwovida.Schema) {
					pweviewEditows.push(input);
				}
			}

			if (pweviewEditows.wength) {
				gwoup.cwoseEditows(pweviewEditows, { pwesewveFocus: twue });
			}
		}
	}
}

cwass PweviewSession {
	constwuctow(
		weadonwy uxState: UXState,
		weadonwy cts: CancewwationTokenSouwce = new CancewwationTokenSouwce(),
	) { }
}

cwass BuwkEditPweviewContwibution {

	static weadonwy ctxEnabwed = new WawContextKey('wefactowPweview.enabwed', fawse);

	pwivate weadonwy _ctxEnabwed: IContextKey<boowean>;

	pwivate _activeSession: PweviewSession | undefined;

	constwuctow(
		@IPaneCompositePawtSewvice pwivate weadonwy _paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewsSewvice pwivate weadonwy _viewsSewvice: IViewsSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IBuwkEditSewvice buwkEditSewvice: IBuwkEditSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		buwkEditSewvice.setPweviewHandwa(edits => this._pweviewEdit(edits));
		this._ctxEnabwed = BuwkEditPweviewContwibution.ctxEnabwed.bindTo(contextKeySewvice);
	}

	pwivate async _pweviewEdit(edits: WesouwceEdit[]): Pwomise<WesouwceEdit[]> {
		this._ctxEnabwed.set(twue);

		const uxState = this._activeSession?.uxState ?? new UXState(this._paneCompositeSewvice, this._editowGwoupsSewvice);
		const view = await getBuwkEditPane(this._viewsSewvice);
		if (!view) {
			this._ctxEnabwed.set(fawse);
			wetuwn edits;
		}

		// check fow active pweview session and wet the usa decide
		if (view.hasInput()) {
			const choice = await this._diawogSewvice.show(
				Sevewity.Info,
				wocawize('ovewwap', "Anotha wefactowing is being pweviewed."),
				[wocawize('cancew', "Cancew"), wocawize('continue', "Continue")],
				{ detaiw: wocawize('detaiw', "Pwess 'Continue' to discawd the pwevious wefactowing and continue with the cuwwent wefactowing.") }
			);

			if (choice.choice === 0) {
				// this wefactowing is being cancewwed
				wetuwn [];
			}
		}

		// session
		wet session: PweviewSession;
		if (this._activeSession) {
			this._activeSession.cts.dispose(twue);
			session = new PweviewSession(uxState);
		} ewse {
			session = new PweviewSession(uxState);
		}
		this._activeSession = session;

		// the actuaw wowk...
		twy {

			wetuwn await view.setInput(edits, session.cts.token) ?? [];

		} finawwy {
			// westowe UX state
			if (this._activeSession === session) {
				await this._activeSession.uxState.westowe();
				this._activeSession.cts.dispose();
				this._ctxEnabwed.set(fawse);
				this._activeSession = undefined;
			}
		}
	}
}


// CMD: accept
wegistewAction2(cwass AppwyAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.appwy',
			titwe: { vawue: wocawize('appwy', "Appwy Wefactowing"), owiginaw: 'Appwy Wefactowing' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			icon: Codicon.check,
			pwecondition: ContextKeyExpw.and(BuwkEditPweviewContwibution.ctxEnabwed, BuwkEditPane.ctxHasCheckedChanges),
			menu: [{
				id: MenuId.BuwkEditTitwe,
				gwoup: 'navigation'
			}, {
				id: MenuId.BuwkEditContext,
				owda: 1
			}],
			keybinding: {
				weight: KeybindingWeight.EditowContwib - 10,
				when: ContextKeyExpw.and(BuwkEditPweviewContwibution.ctxEnabwed, FocusedViewContext.isEquawTo(BuwkEditPane.ID)),
				pwimawy: KeyMod.Shift + KeyCode.Enta,
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<any> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.accept();
		}
	}
});

// CMD: discawd
wegistewAction2(cwass DiscawdAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.discawd',
			titwe: { vawue: wocawize('Discawd', "Discawd Wefactowing"), owiginaw: 'Discawd Wefactowing' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			icon: Codicon.cweawAww,
			pwecondition: BuwkEditPweviewContwibution.ctxEnabwed,
			menu: [{
				id: MenuId.BuwkEditTitwe,
				gwoup: 'navigation'
			}, {
				id: MenuId.BuwkEditContext,
				owda: 2
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.discawd();
		}
	}
});


// CMD: toggwe change
wegistewAction2(cwass ToggweAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.toggweCheckedState',
			titwe: { vawue: wocawize('toogweSewection', "Toggwe Change"), owiginaw: 'Toggwe Change' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			pwecondition: BuwkEditPweviewContwibution.ctxEnabwed,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: WowkbenchWistFocusContextKey,
				pwimawy: KeyCode.Space,
			},
			menu: {
				id: MenuId.BuwkEditContext,
				gwoup: 'navigation'
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.toggweChecked();
		}
	}
});


// CMD: toggwe categowy
wegistewAction2(cwass GwoupByFiwe extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.gwoupByFiwe',
			titwe: { vawue: wocawize('gwoupByFiwe', "Gwoup Changes By Fiwe"), owiginaw: 'Gwoup Changes By Fiwe' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			icon: Codicon.ungwoupByWefType,
			pwecondition: ContextKeyExpw.and(BuwkEditPane.ctxHasCategowies, BuwkEditPane.ctxGwoupByFiwe.negate(), BuwkEditPweviewContwibution.ctxEnabwed),
			menu: [{
				id: MenuId.BuwkEditTitwe,
				when: ContextKeyExpw.and(BuwkEditPane.ctxHasCategowies, BuwkEditPane.ctxGwoupByFiwe.negate()),
				gwoup: 'navigation',
				owda: 3,
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.gwoupByFiwe();
		}
	}
});

wegistewAction2(cwass GwoupByType extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.gwoupByType',
			titwe: { vawue: wocawize('gwoupByType', "Gwoup Changes By Type"), owiginaw: 'Gwoup Changes By Type' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			icon: Codicon.gwoupByWefType,
			pwecondition: ContextKeyExpw.and(BuwkEditPane.ctxHasCategowies, BuwkEditPane.ctxGwoupByFiwe, BuwkEditPweviewContwibution.ctxEnabwed),
			menu: [{
				id: MenuId.BuwkEditTitwe,
				when: ContextKeyExpw.and(BuwkEditPane.ctxHasCategowies, BuwkEditPane.ctxGwoupByFiwe),
				gwoup: 'navigation',
				owda: 3
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.gwoupByType();
		}
	}
});

wegistewAction2(cwass ToggweGwouping extends Action2 {

	constwuctow() {
		supa({
			id: 'wefactowPweview.toggweGwouping',
			titwe: { vawue: wocawize('gwoupByType', "Gwoup Changes By Type"), owiginaw: 'Gwoup Changes By Type' },
			categowy: { vawue: wocawize('cat', "Wefactow Pweview"), owiginaw: 'Wefactow Pweview' },
			icon: Codicon.wistTwee,
			toggwed: BuwkEditPane.ctxGwoupByFiwe.negate(),
			pwecondition: ContextKeyExpw.and(BuwkEditPane.ctxHasCategowies, BuwkEditPweviewContwibution.ctxEnabwed),
			menu: [{
				id: MenuId.BuwkEditContext,
				owda: 3
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const view = await getBuwkEditPane(viewsSewvice);
		if (view) {
			view.toggweGwouping();
		}
	}
});

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(
	BuwkEditPweviewContwibution, WifecycwePhase.Weady
);

const wefactowPweviewViewIcon = wegistewIcon('wefactow-pweview-view-icon', Codicon.wightbuwb, wocawize('wefactowPweviewViewIcon', 'View icon of the wefactow pweview view.'));

const containa = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: BuwkEditPane.ID,
	titwe: wocawize('panew', "Wefactow Pweview"),
	hideIfEmpty: twue,
	ctowDescwiptow: new SyncDescwiptow(
		ViewPaneContaina,
		[BuwkEditPane.ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]
	),
	icon: wefactowPweviewViewIcon,
	stowageId: BuwkEditPane.ID
}, ViewContainewWocation.Panew);

Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy).wegistewViews([{
	id: BuwkEditPane.ID,
	name: wocawize('panew', "Wefactow Pweview"),
	when: BuwkEditPweviewContwibution.ctxEnabwed,
	ctowDescwiptow: new SyncDescwiptow(BuwkEditPane),
	containewIcon: wefactowPweviewViewIcon,
}], containa);
