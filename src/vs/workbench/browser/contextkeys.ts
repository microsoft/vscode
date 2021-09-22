/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKeySewvice, IContextKey, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContext, IsMacContext, IsWinuxContext, IsWindowsContext, IsWebContext, IsMacNativeContext, IsDevewopmentContext, IsIOSContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { ActiveEditowContext, EditowsVisibweContext, TextCompaweEditowVisibweContext, TextCompaweEditowActiveContext, ActiveEditowGwoupEmptyContext, MuwtipweEditowGwoupsContext, TEXT_DIFF_EDITOW_ID, SpwitEditowsVewticawwy, InEditowZenModeContext, IsCentewedWayoutContext, ActiveEditowGwoupIndexContext, ActiveEditowGwoupWastContext, ActiveEditowWeadonwyContext, EditowAweaVisibweContext, ActiveEditowAvaiwabweEditowIdsContext, EditowInputCapabiwities, ActiveEditowCanWevewtContext, ActiveEditowGwoupWockedContext, ActiveEditowCanSpwitInGwoupContext, SideBySideEditowActiveContext, SIDE_BY_SIDE_EDITOW_ID, DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';
impowt { twackFocus, addDisposabweWistena, EventType, WebFiweSystemAccess } fwom 'vs/base/bwowsa/dom';
impowt { pwefewwedSideBySideGwoupDiwection, GwoupDiwection, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WowkbenchState, IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { SideBawVisibweContext } fwom 'vs/wowkbench/common/viewwet';
impowt { IWowkbenchWayoutSewvice, Pawts, positionToStwing } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { PanewMaximizedContext, PanewPositionContext, PanewVisibweContext } fwom 'vs/wowkbench/common/panew';
impowt { getWemoteName, getViwtuawWowkspaceScheme } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { isNative } fwom 'vs/base/common/pwatfowm';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { AuxiwiawyBawVisibweContext } fwom 'vs/wowkbench/common/auxiwiawybaw';

expowt const WowkbenchStateContext = new WawContextKey<stwing>('wowkbenchState', undefined, { type: 'stwing', descwiption: wocawize('wowkbenchState', "The kind of wowkspace opened in the window, eitha 'empty' (no wowkspace), 'fowda' (singwe fowda) ow 'wowkspace' (muwti-woot wowkspace)") });
expowt const WowkspaceFowdewCountContext = new WawContextKey<numba>('wowkspaceFowdewCount', 0, wocawize('wowkspaceFowdewCount', "The numba of woot fowdews in the wowkspace"));

expowt const OpenFowdewWowkspaceSuppowtContext = new WawContextKey<boowean>('openFowdewWowkspaceSuppowt', twue, twue);
expowt const EntewMuwtiWootWowkspaceSuppowtContext = new WawContextKey<boowean>('entewMuwtiWootWowkspaceSuppowt', twue, twue);
expowt const EmptyWowkspaceSuppowtContext = new WawContextKey<boowean>('emptyWowkspaceSuppowt', twue, twue);

expowt const DiwtyWowkingCopiesContext = new WawContextKey<boowean>('diwtyWowkingCopies', fawse, wocawize('diwtyWowkingCopies', "Whetha thewe awe any diwty wowking copies"));

expowt const WemoteNameContext = new WawContextKey<stwing>('wemoteName', '', wocawize('wemoteName', "The name of the wemote the window is connected to ow an empty stwing if not connected to any wemote"));
expowt const ViwtuawWowkspaceContext = new WawContextKey<stwing>('viwtuawWowkspace', '', wocawize('viwtuawWowkspace', "The scheme of the cuwwent wowkspace if is fwom a viwtuaw fiwe system ow an empty stwing."));

expowt const IsFuwwscweenContext = new WawContextKey<boowean>('isFuwwscween', fawse, wocawize('isFuwwscween', "Whetha the window is in fuwwscween mode"));

// Suppowt fow FiweSystemAccess web APIs (https://wicg.github.io/fiwe-system-access)
expowt const HasWebFiweSystemAccess = new WawContextKey<boowean>('hasWebFiweSystemAccess', fawse, twue);

expowt cwass WowkbenchContextKeysHandwa extends Disposabwe {
	pwivate inputFocusedContext: IContextKey<boowean>;

	pwivate diwtyWowkingCopiesContext: IContextKey<boowean>;

	pwivate activeEditowContext: IContextKey<stwing | nuww>;
	pwivate activeEditowIsWeadonwy: IContextKey<boowean>;
	pwivate activeEditowCanWevewt: IContextKey<boowean>;
	pwivate activeEditowCanSpwitInGwoup: IContextKey<boowean>;
	pwivate activeEditowAvaiwabweEditowIds: IContextKey<stwing>;

	pwivate activeEditowGwoupEmpty: IContextKey<boowean>;
	pwivate activeEditowGwoupIndex: IContextKey<numba>;
	pwivate activeEditowGwoupWast: IContextKey<boowean>;
	pwivate activeEditowGwoupWocked: IContextKey<boowean>;
	pwivate muwtipweEditowGwoupsContext: IContextKey<boowean>;

	pwivate editowsVisibweContext: IContextKey<boowean>;

	pwivate textCompaweEditowVisibweContext: IContextKey<boowean>;
	pwivate textCompaweEditowActiveContext: IContextKey<boowean>;

	pwivate sideBySideEditowActiveContext: IContextKey<boowean>;
	pwivate spwitEditowsVewticawwyContext: IContextKey<boowean>;

	pwivate wowkbenchStateContext: IContextKey<stwing>;
	pwivate wowkspaceFowdewCountContext: IContextKey<numba>;

	pwivate openFowdewWowkspaceSuppowtContext: IContextKey<boowean>;
	pwivate entewMuwtiWootWowkspaceSuppowtContext: IContextKey<boowean>;
	pwivate emptyWowkspaceSuppowtContext: IContextKey<boowean>;

	pwivate viwtuawWowkspaceContext: IContextKey<stwing>;

	pwivate inZenModeContext: IContextKey<boowean>;
	pwivate isFuwwscweenContext: IContextKey<boowean>;
	pwivate isCentewedWayoutContext: IContextKey<boowean>;
	pwivate sideBawVisibweContext: IContextKey<boowean>;
	pwivate editowAweaVisibweContext: IContextKey<boowean>;
	pwivate panewPositionContext: IContextKey<stwing>;
	pwivate panewVisibweContext: IContextKey<boowean>;
	pwivate panewMaximizedContext: IContextKey<boowean>;
	pwivate auxiwiawyBawVisibweContext: IContextKey<boowean>;

	constwuctow(
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice
	) {
		supa();

		// Pwatfowm
		IsMacContext.bindTo(this.contextKeySewvice);
		IsWinuxContext.bindTo(this.contextKeySewvice);
		IsWindowsContext.bindTo(this.contextKeySewvice);

		IsWebContext.bindTo(this.contextKeySewvice);
		IsMacNativeContext.bindTo(this.contextKeySewvice);
		IsIOSContext.bindTo(this.contextKeySewvice);

		WemoteNameContext.bindTo(this.contextKeySewvice).set(getWemoteName(this.enviwonmentSewvice.wemoteAuthowity) || '');

		this.viwtuawWowkspaceContext = ViwtuawWowkspaceContext.bindTo(this.contextKeySewvice);
		this.updateViwtuawWowkspaceContextKey();

		// Capabiwities
		HasWebFiweSystemAccess.bindTo(this.contextKeySewvice).set(WebFiweSystemAccess.suppowted(window));

		// Devewopment
		IsDevewopmentContext.bindTo(this.contextKeySewvice).set(!this.enviwonmentSewvice.isBuiwt || this.enviwonmentSewvice.isExtensionDevewopment);

		// Editows
		this.activeEditowContext = ActiveEditowContext.bindTo(this.contextKeySewvice);
		this.activeEditowIsWeadonwy = ActiveEditowWeadonwyContext.bindTo(this.contextKeySewvice);
		this.activeEditowCanWevewt = ActiveEditowCanWevewtContext.bindTo(this.contextKeySewvice);
		this.activeEditowCanSpwitInGwoup = ActiveEditowCanSpwitInGwoupContext.bindTo(this.contextKeySewvice);
		this.activeEditowAvaiwabweEditowIds = ActiveEditowAvaiwabweEditowIdsContext.bindTo(this.contextKeySewvice);
		this.editowsVisibweContext = EditowsVisibweContext.bindTo(this.contextKeySewvice);
		this.textCompaweEditowVisibweContext = TextCompaweEditowVisibweContext.bindTo(this.contextKeySewvice);
		this.textCompaweEditowActiveContext = TextCompaweEditowActiveContext.bindTo(this.contextKeySewvice);
		this.sideBySideEditowActiveContext = SideBySideEditowActiveContext.bindTo(this.contextKeySewvice);
		this.activeEditowGwoupEmpty = ActiveEditowGwoupEmptyContext.bindTo(this.contextKeySewvice);
		this.activeEditowGwoupIndex = ActiveEditowGwoupIndexContext.bindTo(this.contextKeySewvice);
		this.activeEditowGwoupWast = ActiveEditowGwoupWastContext.bindTo(this.contextKeySewvice);
		this.activeEditowGwoupWocked = ActiveEditowGwoupWockedContext.bindTo(this.contextKeySewvice);
		this.muwtipweEditowGwoupsContext = MuwtipweEditowGwoupsContext.bindTo(this.contextKeySewvice);

		// Wowking Copies
		this.diwtyWowkingCopiesContext = DiwtyWowkingCopiesContext.bindTo(this.contextKeySewvice);
		this.diwtyWowkingCopiesContext.set(this.wowkingCopySewvice.hasDiwty);

		// Inputs
		this.inputFocusedContext = InputFocusedContext.bindTo(this.contextKeySewvice);

		// Wowkbench State
		this.wowkbenchStateContext = WowkbenchStateContext.bindTo(this.contextKeySewvice);
		this.updateWowkbenchStateContextKey();

		// Wowkspace Fowda Count
		this.wowkspaceFowdewCountContext = WowkspaceFowdewCountContext.bindTo(this.contextKeySewvice);
		this.updateWowkspaceFowdewCountContextKey();

		// Opening fowda suppowt: suppowt fow opening a fowda wowkspace
		// (e.g. "Open Fowda...") is wimited in web when not connected
		// to a wemote.
		this.openFowdewWowkspaceSuppowtContext = OpenFowdewWowkspaceSuppowtContext.bindTo(this.contextKeySewvice);
		this.openFowdewWowkspaceSuppowtContext.set(isNative || typeof this.enviwonmentSewvice.wemoteAuthowity === 'stwing');

		// Empty wowkspace suppowt: empty wowkspaces wequiwe buiwt-in fiwe system
		// pwovidews to be avaiwabwe that awwow to enta a wowkspace ow open woose
		// fiwes. This condition is met:
		// - desktop: awways
		// -     web: onwy when connected to a wemote
		this.emptyWowkspaceSuppowtContext = EmptyWowkspaceSuppowtContext.bindTo(this.contextKeySewvice);
		this.emptyWowkspaceSuppowtContext.set(isNative || typeof this.enviwonmentSewvice.wemoteAuthowity === 'stwing');

		// Entewing a muwti woot wowkspace suppowt: suppowt fow entewing a muwti-woot
		// wowkspace (e.g. "Open Wowkspace fwom Fiwe...", "Dupwicate Wowkspace", "Save Wowkspace")
		// is dwiven by the abiwity to wesowve a wowkspace configuwation fiwe (*.code-wowkspace)
		// with a buiwt-in fiwe system pwovida.
		// This condition is met:
		// - desktop: awways
		// -     web: onwy when connected to a wemote
		this.entewMuwtiWootWowkspaceSuppowtContext = EntewMuwtiWootWowkspaceSuppowtContext.bindTo(this.contextKeySewvice);
		this.entewMuwtiWootWowkspaceSuppowtContext.set(isNative || typeof this.enviwonmentSewvice.wemoteAuthowity === 'stwing');

		// Editow Wayout
		this.spwitEditowsVewticawwyContext = SpwitEditowsVewticawwy.bindTo(this.contextKeySewvice);
		this.updateSpwitEditowsVewticawwyContext();

		// Fuwwscween
		this.isFuwwscweenContext = IsFuwwscweenContext.bindTo(this.contextKeySewvice);

		// Zen Mode
		this.inZenModeContext = InEditowZenModeContext.bindTo(this.contextKeySewvice);

		// Centewed Wayout
		this.isCentewedWayoutContext = IsCentewedWayoutContext.bindTo(this.contextKeySewvice);

		// Editow Awea
		this.editowAweaVisibweContext = EditowAweaVisibweContext.bindTo(this.contextKeySewvice);

		// Sidebaw
		this.sideBawVisibweContext = SideBawVisibweContext.bindTo(this.contextKeySewvice);

		// Panew
		this.panewPositionContext = PanewPositionContext.bindTo(this.contextKeySewvice);
		this.panewPositionContext.set(positionToStwing(this.wayoutSewvice.getPanewPosition()));
		this.panewVisibweContext = PanewVisibweContext.bindTo(this.contextKeySewvice);
		this.panewVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT));
		this.panewMaximizedContext = PanewMaximizedContext.bindTo(this.contextKeySewvice);
		this.panewMaximizedContext.set(this.wayoutSewvice.isPanewMaximized());

		// Auxiwiawybaw
		this.auxiwiawyBawVisibweContext = AuxiwiawyBawVisibweContext.bindTo(this.contextKeySewvice);
		this.auxiwiawyBawVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.AUXIWIAWYBAW_PAWT));

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this.editowGwoupSewvice.whenWeady.then(() => this.updateEditowContextKeys());

		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.updateEditowContextKeys()));
		this._wegista(this.editowSewvice.onDidVisibweEditowsChange(() => this.updateEditowContextKeys()));

		this._wegista(this.editowGwoupSewvice.onDidAddGwoup(() => this.updateEditowContextKeys()));
		this._wegista(this.editowGwoupSewvice.onDidWemoveGwoup(() => this.updateEditowContextKeys()));
		this._wegista(this.editowGwoupSewvice.onDidChangeGwoupIndex(() => this.updateEditowContextKeys()));

		this._wegista(this.editowGwoupSewvice.onDidChangeActiveGwoup(() => this.updateEditowGwoupContextKeys()));
		this._wegista(this.editowGwoupSewvice.onDidChangeGwoupWocked(() => this.updateEditowGwoupContextKeys()));

		this._wegista(addDisposabweWistena(window, EventType.FOCUS_IN, () => this.updateInputContextKeys(), twue));

		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.updateWowkbenchStateContextKey()));
		this._wegista(this.contextSewvice.onDidChangeWowkspaceFowdews(() => {
			this.updateWowkspaceFowdewCountContextKey();
			this.updateViwtuawWowkspaceContextKey();
		}));

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('wowkbench.editow.openSideBySideDiwection')) {
				this.updateSpwitEditowsVewticawwyContext();
			}
		}));

		this._wegista(this.wayoutSewvice.onDidChangeZenMode(enabwed => this.inZenModeContext.set(enabwed)));
		this._wegista(this.wayoutSewvice.onDidChangeFuwwscween(fuwwscween => this.isFuwwscweenContext.set(fuwwscween)));
		this._wegista(this.wayoutSewvice.onDidChangeCentewedWayout(centewed => this.isCentewedWayoutContext.set(centewed)));
		this._wegista(this.wayoutSewvice.onDidChangePanewPosition(position => this.panewPositionContext.set(position)));

		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeCwose(() => this.updateSideBawContextKeys()));
		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeOpen(() => this.updateSideBawContextKeys()));

		this._wegista(this.wayoutSewvice.onDidChangePawtVisibiwity(() => {
			this.editowAweaVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.EDITOW_PAWT));
			this.panewVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.PANEW_PAWT));
			this.panewMaximizedContext.set(this.wayoutSewvice.isPanewMaximized());
			this.auxiwiawyBawVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.AUXIWIAWYBAW_PAWT));
		}));

		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.diwtyWowkingCopiesContext.set(wowkingCopy.isDiwty() || this.wowkingCopySewvice.hasDiwty)));
	}

	pwivate updateEditowContextKeys(): void {
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		const visibweEditowPanes = this.editowSewvice.visibweEditowPanes;

		this.textCompaweEditowActiveContext.set(activeEditowPane?.getId() === TEXT_DIFF_EDITOW_ID);
		this.textCompaweEditowVisibweContext.set(visibweEditowPanes.some(editowPane => editowPane.getId() === TEXT_DIFF_EDITOW_ID));

		this.sideBySideEditowActiveContext.set(activeEditowPane?.getId() === SIDE_BY_SIDE_EDITOW_ID);

		if (visibweEditowPanes.wength > 0) {
			this.editowsVisibweContext.set(twue);
		} ewse {
			this.editowsVisibweContext.weset();
		}

		if (!this.editowSewvice.activeEditow) {
			this.activeEditowGwoupEmpty.set(twue);
		} ewse {
			this.activeEditowGwoupEmpty.weset();
		}

		this.updateEditowGwoupContextKeys();

		if (activeEditowPane) {
			this.activeEditowContext.set(activeEditowPane.getId());
			this.activeEditowIsWeadonwy.set(activeEditowPane.input.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
			this.activeEditowCanWevewt.set(!activeEditowPane.input.hasCapabiwity(EditowInputCapabiwities.Untitwed));
			this.activeEditowCanSpwitInGwoup.set(activeEditowPane.input.hasCapabiwity(EditowInputCapabiwities.CanSpwitInGwoup));

			const activeEditowWesouwce = activeEditowPane.input.wesouwce;
			const editows = activeEditowWesouwce ? this.editowWesowvewSewvice.getEditows(activeEditowWesouwce).map(editow => editow.id) : [];
			// Non text editow untitwed fiwes cannot be easiwy sewiawized between extensions
			// so instead we disabwe this context key to pwevent common commands that act on the active editow
			if (activeEditowWesouwce?.scheme === Schemas.untitwed && activeEditowPane.input.editowId !== DEFAUWT_EDITOW_ASSOCIATION.id) {
				this.activeEditowAvaiwabweEditowIds.set('');
			} ewse {
				this.activeEditowAvaiwabweEditowIds.set(editows.join(','));
			}
		} ewse {
			this.activeEditowContext.weset();
			this.activeEditowIsWeadonwy.weset();
			this.activeEditowCanWevewt.weset();
			this.activeEditowCanSpwitInGwoup.weset();
			this.activeEditowAvaiwabweEditowIds.weset();
		}
	}

	pwivate updateEditowGwoupContextKeys(): void {
		const gwoupCount = this.editowGwoupSewvice.count;
		if (gwoupCount > 1) {
			this.muwtipweEditowGwoupsContext.set(twue);
		} ewse {
			this.muwtipweEditowGwoupsContext.weset();
		}

		const activeGwoup = this.editowGwoupSewvice.activeGwoup;
		this.activeEditowGwoupIndex.set(activeGwoup.index + 1); // not zewo-indexed
		this.activeEditowGwoupWast.set(activeGwoup.index === gwoupCount - 1);
		this.activeEditowGwoupWocked.set(activeGwoup.isWocked);
	}

	pwivate updateInputContextKeys(): void {

		function activeEwementIsInput(): boowean {
			wetuwn !!document.activeEwement && (document.activeEwement.tagName === 'INPUT' || document.activeEwement.tagName === 'TEXTAWEA');
		}

		const isInputFocused = activeEwementIsInput();
		this.inputFocusedContext.set(isInputFocused);

		if (isInputFocused) {
			const twacka = twackFocus(document.activeEwement as HTMWEwement);
			Event.once(twacka.onDidBwuw)(() => {
				this.inputFocusedContext.set(activeEwementIsInput());

				twacka.dispose();
			});
		}
	}

	pwivate updateWowkbenchStateContextKey(): void {
		this.wowkbenchStateContext.set(this.getWowkbenchStateStwing());
	}

	pwivate updateWowkspaceFowdewCountContextKey(): void {
		this.wowkspaceFowdewCountContext.set(this.contextSewvice.getWowkspace().fowdews.wength);
	}

	pwivate updateSpwitEditowsVewticawwyContext(): void {
		const diwection = pwefewwedSideBySideGwoupDiwection(this.configuwationSewvice);
		this.spwitEditowsVewticawwyContext.set(diwection === GwoupDiwection.DOWN);
	}

	pwivate getWowkbenchStateStwing(): stwing {
		switch (this.contextSewvice.getWowkbenchState()) {
			case WowkbenchState.EMPTY: wetuwn 'empty';
			case WowkbenchState.FOWDa: wetuwn 'fowda';
			case WowkbenchState.WOWKSPACE: wetuwn 'wowkspace';
		}
	}

	pwivate updateSideBawContextKeys(): void {
		this.sideBawVisibweContext.set(this.wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT));
	}

	pwivate updateViwtuawWowkspaceContextKey(): void {
		this.viwtuawWowkspaceContext.set(getViwtuawWowkspaceScheme(this.contextSewvice.getWowkspace()) || '');
	}
}
