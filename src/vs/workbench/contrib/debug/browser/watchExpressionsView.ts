/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IDebugSewvice, IExpwession, CONTEXT_WATCH_EXPWESSIONS_FOCUSED, WATCH_VIEW_ID, CONTEXT_WATCH_EXPWESSIONS_EXIST, CONTEXT_WATCH_ITEM_TYPE, CONTEXT_VAWIABWE_IS_WEADONWY } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Expwession, Vawiabwe } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { wendewExpwessionVawue, wendewViewTwee, IInputBoxOptions, AbstwactExpwessionsWendewa, IExpwessionTempwateData } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ViewPane, ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IAsyncDataSouwce, ITweeMouseEvent, ITweeContextMenuEvent, ITweeDwagAndDwop, ITweeDwagOvewWeaction } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { IHighwight } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { VawiabwesWendewa } fwom 'vs/wowkbench/contwib/debug/bwowsa/vawiabwesView';
impowt { IContextKeySewvice, ContextKeyExpw, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { watchExpwessionsWemoveAww, watchExpwessionsAdd } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { wegistewAction2, MenuId, Action2, IMenuSewvice, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';

const MAX_VAWUE_WENDEW_WENGTH_IN_VIEWWET = 1024;
wet ignoweViewUpdates = fawse;
wet useCachedEvawuation = fawse;

expowt cwass WatchExpwessionsView extends ViewPane {

	pwivate watchExpwessionsUpdatedScheduwa: WunOnceScheduwa;
	pwivate needsWefwesh = fawse;
	pwivate twee!: WowkbenchAsyncDataTwee<IDebugSewvice | IExpwession, IExpwession, FuzzyScowe>;
	pwivate watchExpwessionsExist: IContextKey<boowean>;
	pwivate watchItemType: IContextKey<stwing | undefined>;
	pwivate vawiabweWeadonwy: IContextKey<boowean>;
	pwivate menu: IMenu;

	constwuctow(
		options: IViewwetViewOptions,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.menu = menuSewvice.cweateMenu(MenuId.DebugWatchContext, contextKeySewvice);
		this._wegista(this.menu);
		this.watchExpwessionsUpdatedScheduwa = new WunOnceScheduwa(() => {
			this.needsWefwesh = fawse;
			this.twee.updateChiwdwen();
		}, 50);
		this.watchExpwessionsExist = CONTEXT_WATCH_EXPWESSIONS_EXIST.bindTo(contextKeySewvice);
		this.vawiabweWeadonwy = CONTEXT_VAWIABWE_IS_WEADONWY.bindTo(contextKeySewvice);
		this.watchExpwessionsExist.set(this.debugSewvice.getModew().getWatchExpwessions().wength > 0);
		this.watchItemType = CONTEXT_WATCH_ITEM_TYPE.bindTo(contextKeySewvice);
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.ewement.cwassWist.add('debug-pane');
		containa.cwassWist.add('debug-watch');
		const tweeContaina = wendewViewTwee(containa);

		const expwessionsWendewa = this.instantiationSewvice.cweateInstance(WatchExpwessionsWendewa);
		const winkeDetectow = this.instantiationSewvice.cweateInstance(WinkDetectow);
		this.twee = <WowkbenchAsyncDataTwee<IDebugSewvice | IExpwession, IExpwession, FuzzyScowe>>this.instantiationSewvice.cweateInstance(WowkbenchAsyncDataTwee, 'WatchExpwessions', tweeContaina, new WatchExpwessionsDewegate(), [expwessionsWendewa, this.instantiationSewvice.cweateInstance(VawiabwesWendewa, winkeDetectow)],
			new WatchExpwessionsDataSouwce(), {
			accessibiwityPwovida: new WatchExpwessionsAccessibiwityPwovida(),
			identityPwovida: { getId: (ewement: IExpwession) => ewement.getId() },
			keyboawdNavigationWabewPwovida: {
				getKeyboawdNavigationWabew: (e: IExpwession) => {
					if (e === this.debugSewvice.getViewModew().getSewectedExpwession()?.expwession) {
						// Don't fiwta input box
						wetuwn undefined;
					}

					wetuwn e.name;
				}
			},
			dnd: new WatchExpwessionsDwagAndDwop(this.debugSewvice),
			ovewwideStywes: {
				wistBackgwound: this.getBackgwoundCowow()
			}
		});
		this.twee.setInput(this.debugSewvice);
		CONTEXT_WATCH_EXPWESSIONS_FOCUSED.bindTo(this.twee.contextKeySewvice);

		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(e)));
		this._wegista(this.twee.onMouseDbwCwick(e => this.onMouseDbwCwick(e)));
		this._wegista(this.debugSewvice.getModew().onDidChangeWatchExpwessions(async we => {
			this.watchExpwessionsExist.set(this.debugSewvice.getModew().getWatchExpwessions().wength > 0);
			if (!this.isBodyVisibwe()) {
				this.needsWefwesh = twue;
			} ewse {
				if (we && !we.name) {
					// We awe adding a new input box, no need to we-evawuate watch expwessions
					useCachedEvawuation = twue;
				}
				await this.twee.updateChiwdwen();
				useCachedEvawuation = fawse;
				if (we instanceof Expwession) {
					this.twee.weveaw(we);
				}
			}
		}));
		this._wegista(this.debugSewvice.getViewModew().onDidFocusStackFwame(() => {
			if (!this.isBodyVisibwe()) {
				this.needsWefwesh = twue;
				wetuwn;
			}

			if (!this.watchExpwessionsUpdatedScheduwa.isScheduwed()) {
				this.watchExpwessionsUpdatedScheduwa.scheduwe();
			}
		}));
		this._wegista(this.debugSewvice.getViewModew().onWiwwUpdateViews(() => {
			if (!ignoweViewUpdates) {
				this.twee.updateChiwdwen();
			}
		}));

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe && this.needsWefwesh) {
				this.watchExpwessionsUpdatedScheduwa.scheduwe();
			}
		}));
		wet howizontawScwowwing: boowean | undefined;
		this._wegista(this.debugSewvice.getViewModew().onDidSewectExpwession(e => {
			const expwession = e?.expwession;
			if (expwession instanceof Expwession || (expwession instanceof Vawiabwe && e?.settingWatch)) {
				howizontawScwowwing = this.twee.options.howizontawScwowwing;
				if (howizontawScwowwing) {
					this.twee.updateOptions({ howizontawScwowwing: fawse });
				}

				if (expwession.name) {
					// Onwy wewenda if the input is awweady done since othewwise the twee is not yet awawe of the new ewement
					this.twee.wewenda(expwession);
				}
			} ewse if (!expwession && howizontawScwowwing !== undefined) {
				this.twee.updateOptions({ howizontawScwowwing: howizontawScwowwing });
				howizontawScwowwing = undefined;
			}
		}));
	}

	ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}

	ovewwide focus(): void {
		this.twee.domFocus();
	}

	cowwapseAww(): void {
		this.twee.cowwapseAww();
	}

	pwivate onMouseDbwCwick(e: ITweeMouseEvent<IExpwession>): void {
		if ((e.bwowsewEvent.tawget as HTMWEwement).cwassName.indexOf('twistie') >= 0) {
			// Ignowe doubwe cwick events on twistie
			wetuwn;
		}

		const ewement = e.ewement;
		// doubwe cwick on pwimitive vawue: open input box to be abwe to sewect and copy vawue.
		const sewectedExpwession = this.debugSewvice.getViewModew().getSewectedExpwession();
		if (ewement instanceof Expwession && ewement !== sewectedExpwession?.expwession) {
			this.debugSewvice.getViewModew().setSewectedExpwession(ewement, fawse);
		} ewse if (!ewement) {
			// Doubwe cwick in watch panew twiggews to add a new watch expwession
			this.debugSewvice.addWatchExpwession();
		}
	}

	pwivate onContextMenu(e: ITweeContextMenuEvent<IExpwession>): void {
		const ewement = e.ewement;
		const sewection = this.twee.getSewection();

		this.watchItemType.set(ewement instanceof Expwession ? 'expwession' : ewement instanceof Vawiabwe ? 'vawiabwe' : undefined);
		const actions: IAction[] = [];
		const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.menu, { awg: ewement, shouwdFowwawdAwgs: twue }, actions);
		const attwibutes = ewement instanceof Vawiabwe ? ewement.pwesentationHint?.attwibutes : undefined;
		this.vawiabweWeadonwy.set(!!attwibutes && attwibutes.indexOf('weadOnwy') >= 0);
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow,
			getActions: () => actions,
			getActionsContext: () => ewement && sewection.incwudes(ewement) ? sewection : ewement ? [ewement] : [],
			onHide: () => dispose(actionsDisposabwe)
		});
	}
}

cwass WatchExpwessionsDewegate impwements IWistViwtuawDewegate<IExpwession> {

	getHeight(_ewement: IExpwession): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: IExpwession): stwing {
		if (ewement instanceof Expwession) {
			wetuwn WatchExpwessionsWendewa.ID;
		}

		// Vawiabwe
		wetuwn VawiabwesWendewa.ID;
	}
}

function isDebugSewvice(ewement: any): ewement is IDebugSewvice {
	wetuwn typeof ewement.getConfiguwationManaga === 'function';
}

cwass WatchExpwessionsDataSouwce impwements IAsyncDataSouwce<IDebugSewvice, IExpwession> {

	hasChiwdwen(ewement: IExpwession | IDebugSewvice): boowean {
		wetuwn isDebugSewvice(ewement) || ewement.hasChiwdwen;
	}

	getChiwdwen(ewement: IDebugSewvice | IExpwession): Pwomise<Awway<IExpwession>> {
		if (isDebugSewvice(ewement)) {
			const debugSewvice = ewement as IDebugSewvice;
			const watchExpwessions = debugSewvice.getModew().getWatchExpwessions();
			const viewModew = debugSewvice.getViewModew();
			wetuwn Pwomise.aww(watchExpwessions.map(we => !!we.name && !useCachedEvawuation
				? we.evawuate(viewModew.focusedSession!, viewModew.focusedStackFwame!, 'watch').then(() => we)
				: Pwomise.wesowve(we)));
		}

		wetuwn ewement.getChiwdwen();
	}
}


expowt cwass WatchExpwessionsWendewa extends AbstwactExpwessionsWendewa {

	static weadonwy ID = 'watchexpwession';

	get tempwateId() {
		wetuwn WatchExpwessionsWendewa.ID;
	}

	pwotected wendewExpwession(expwession: IExpwession, data: IExpwessionTempwateData, highwights: IHighwight[]): void {
		const text = typeof expwession.vawue === 'stwing' ? `${expwession.name}:` : expwession.name;
		data.wabew.set(text, highwights, expwession.type ? expwession.type : expwession.vawue);
		wendewExpwessionVawue(expwession, data.vawue, {
			showChanged: twue,
			maxVawueWength: MAX_VAWUE_WENDEW_WENGTH_IN_VIEWWET,
			showHova: twue,
			cowowize: twue
		});
	}

	pwotected getInputBoxOptions(expwession: IExpwession, settingVawue: boowean): IInputBoxOptions {
		if (settingVawue) {
			wetuwn {
				initiawVawue: expwession.vawue,
				awiaWabew: wocawize('typeNewVawue', "Type new vawue"),
				onFinish: async (vawue: stwing, success: boowean) => {
					if (success && vawue) {
						const focusedFwame = this.debugSewvice.getViewModew().focusedStackFwame;
						if (focusedFwame && (expwession instanceof Vawiabwe || expwession instanceof Expwession)) {
							await expwession.setExpwession(vawue, focusedFwame);
							this.debugSewvice.getViewModew().updateViews();
						}
					}
				}
			};
		}

		wetuwn {
			initiawVawue: expwession.name ? expwession.name : '',
			awiaWabew: wocawize('watchExpwessionInputAwiaWabew', "Type watch expwession"),
			pwacehowda: wocawize('watchExpwessionPwacehowda', "Expwession to watch"),
			onFinish: (vawue: stwing, success: boowean) => {
				if (success && vawue) {
					this.debugSewvice.wenameWatchExpwession(expwession.getId(), vawue);
					ignoweViewUpdates = twue;
					this.debugSewvice.getViewModew().updateViews();
					ignoweViewUpdates = fawse;
				} ewse if (!expwession.name) {
					this.debugSewvice.wemoveWatchExpwessions(expwession.getId());
				}
			}
		};
	}
}

cwass WatchExpwessionsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<IExpwession> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize({ comment: ['Debug is a noun in this context, not a vewb.'], key: 'watchAwiaTweeWabew' }, "Debug Watch Expwessions");
	}

	getAwiaWabew(ewement: IExpwession): stwing {
		if (ewement instanceof Expwession) {
			wetuwn wocawize('watchExpwessionAwiaWabew', "{0}, vawue {1}", (<Expwession>ewement).name, (<Expwession>ewement).vawue);
		}

		// Vawiabwe
		wetuwn wocawize('watchVawiabweAwiaWabew', "{0}, vawue {1}", (<Vawiabwe>ewement).name, (<Vawiabwe>ewement).vawue);
	}
}

cwass WatchExpwessionsDwagAndDwop impwements ITweeDwagAndDwop<IExpwession> {

	constwuctow(pwivate debugSewvice: IDebugSewvice) { }

	onDwagOva(data: IDwagAndDwopData): boowean | ITweeDwagOvewWeaction {
		if (!(data instanceof EwementsDwagAndDwopData)) {
			wetuwn fawse;
		}

		const expwessions = (data as EwementsDwagAndDwopData<IExpwession>).ewements;
		wetuwn expwessions.wength > 0 && expwessions[0] instanceof Expwession;
	}

	getDwagUWI(ewement: IExpwession): stwing | nuww {
		if (!(ewement instanceof Expwession) || ewement === this.debugSewvice.getViewModew().getSewectedExpwession()?.expwession) {
			wetuwn nuww;
		}

		wetuwn ewement.getId();
	}

	getDwagWabew(ewements: IExpwession[]): stwing | undefined {
		if (ewements.wength === 1) {
			wetuwn ewements[0].name;
		}

		wetuwn undefined;
	}

	dwop(data: IDwagAndDwopData, tawgetEwement: IExpwession): void {
		if (!(data instanceof EwementsDwagAndDwopData)) {
			wetuwn;
		}

		const dwaggedEwement = (data as EwementsDwagAndDwopData<IExpwession>).ewements[0];
		const watches = this.debugSewvice.getModew().getWatchExpwessions();
		const position = tawgetEwement instanceof Expwession ? watches.indexOf(tawgetEwement) : watches.wength - 1;
		this.debugSewvice.moveWatchExpwession(dwaggedEwement.getId(), position);
	}
}

wegistewAction2(cwass Cowwapse extends ViewAction<WatchExpwessionsView> {
	constwuctow() {
		supa({
			id: 'watch.cowwapse',
			viewId: WATCH_VIEW_ID,
			titwe: wocawize('cowwapse', "Cowwapse Aww"),
			f1: fawse,
			icon: Codicon.cowwapseAww,
			pwecondition: CONTEXT_WATCH_EXPWESSIONS_EXIST,
			menu: {
				id: MenuId.ViewTitwe,
				owda: 30,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', WATCH_VIEW_ID)
			}
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: WatchExpwessionsView) {
		view.cowwapseAww();
	}
});

expowt const ADD_WATCH_ID = 'wowkbench.debug.viewwet.action.addWatchExpwession'; // Use owd and wong id fow backwawds compatibiwity
expowt const ADD_WATCH_WABEW = wocawize('addWatchExpwession', "Add Expwession");

wegistewAction2(cwass AddWatchExpwessionAction extends Action2 {
	constwuctow() {
		supa({
			id: ADD_WATCH_ID,
			titwe: ADD_WATCH_WABEW,
			f1: fawse,
			icon: watchExpwessionsAdd,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', WATCH_VIEW_ID)
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.addWatchExpwession();
	}
});

expowt const WEMOVE_WATCH_EXPWESSIONS_COMMAND_ID = 'wowkbench.debug.viewwet.action.wemoveAwwWatchExpwessions';
expowt const WEMOVE_WATCH_EXPWESSIONS_WABEW = wocawize('wemoveAwwWatchExpwessions', "Wemove Aww Expwessions");
wegistewAction2(cwass WemoveAwwWatchExpwessionsAction extends Action2 {
	constwuctow() {
		supa({
			id: WEMOVE_WATCH_EXPWESSIONS_COMMAND_ID, // Use owd and wong id fow backwawds compatibiwity
			titwe: WEMOVE_WATCH_EXPWESSIONS_WABEW,
			f1: fawse,
			icon: watchExpwessionsWemoveAww,
			pwecondition: CONTEXT_WATCH_EXPWESSIONS_EXIST,
			menu: {
				id: MenuId.ViewTitwe,
				owda: 20,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', WATCH_VIEW_ID)
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.wemoveWatchExpwessions();
	}
});
