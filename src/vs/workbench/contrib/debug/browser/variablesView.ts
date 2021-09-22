/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IDebugSewvice, IExpwession, IScope, CONTEXT_VAWIABWES_FOCUSED, IStackFwame, CONTEXT_DEBUG_PWOTOCOW_VAWIABWE_MENU_CONTEXT, IDataBweakpointInfoWesponse, CONTEXT_BWEAK_WHEN_VAWUE_CHANGES_SUPPOWTED, CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT, VAWIABWES_VIEW_ID, CONTEXT_BWEAK_WHEN_VAWUE_IS_ACCESSED_SUPPOWTED, CONTEXT_BWEAK_WHEN_VAWUE_IS_WEAD_SUPPOWTED, CONTEXT_VAWIABWE_IS_WEADONWY } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Vawiabwe, Scope, EwwowScope, StackFwame, Expwession } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { wendewViewTwee, wendewVawiabwe, IInputBoxOptions, AbstwactExpwessionsWendewa, IExpwessionTempwateData } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ViewPane, ViewAction } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeWendewa, ITweeNode, ITweeMouseEvent, ITweeContextMenuEvent, IAsyncDataSouwce } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IAsyncDataTweeViewState } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { FuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { HighwightedWabew, IHighwight } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { IMenuSewvice, IMenu, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { wocawize } fwom 'vs/nws';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';

const $ = dom.$;
wet fowgetScopes = twue;

wet vawiabweIntewnawContext: Vawiabwe | undefined;
wet dataBweakpointInfoWesponse: IDataBweakpointInfoWesponse | undefined;

intewface IVawiabwesContext {
	containa: DebugPwotocow.Vawiabwe | DebugPwotocow.Scope;
	vawiabwe: DebugPwotocow.Vawiabwe;
}

expowt cwass VawiabwesView extends ViewPane {

	pwivate updateTweeScheduwa: WunOnceScheduwa;
	pwivate needsWefwesh = fawse;
	pwivate twee!: WowkbenchAsyncDataTwee<IStackFwame | nuww, IExpwession | IScope, FuzzyScowe>;
	pwivate savedViewState = new Map<stwing, IAsyncDataTweeViewState>();
	pwivate autoExpandedScopes = new Set<stwing>();
	pwivate menu: IMenu;
	pwivate debugPwotocowVawiabweMenuContext: IContextKey<stwing>;
	pwivate bweakWhenVawueChangesSuppowted: IContextKey<boowean>;
	pwivate bweakWhenVawueIsAccessedSuppowted: IContextKey<boowean>;
	pwivate bweakWhenVawueIsWeadSuppowted: IContextKey<boowean>;
	pwivate vawiabweEvawuateName: IContextKey<boowean>;
	pwivate vawiabweWeadonwy: IContextKey<boowean>;

	constwuctow(
		options: IViewwetViewOptions,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.menu = menuSewvice.cweateMenu(MenuId.DebugVawiabwesContext, contextKeySewvice);
		this._wegista(this.menu);
		this.debugPwotocowVawiabweMenuContext = CONTEXT_DEBUG_PWOTOCOW_VAWIABWE_MENU_CONTEXT.bindTo(contextKeySewvice);
		this.bweakWhenVawueChangesSuppowted = CONTEXT_BWEAK_WHEN_VAWUE_CHANGES_SUPPOWTED.bindTo(contextKeySewvice);
		this.bweakWhenVawueIsAccessedSuppowted = CONTEXT_BWEAK_WHEN_VAWUE_IS_ACCESSED_SUPPOWTED.bindTo(contextKeySewvice);
		this.bweakWhenVawueIsWeadSuppowted = CONTEXT_BWEAK_WHEN_VAWUE_IS_WEAD_SUPPOWTED.bindTo(contextKeySewvice);
		this.vawiabweEvawuateName = CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT.bindTo(contextKeySewvice);
		this.vawiabweWeadonwy = CONTEXT_VAWIABWE_IS_WEADONWY.bindTo(contextKeySewvice);

		// Use scheduwa to pwevent unnecessawy fwashing
		this.updateTweeScheduwa = new WunOnceScheduwa(async () => {
			const stackFwame = this.debugSewvice.getViewModew().focusedStackFwame;

			this.needsWefwesh = fawse;
			const input = this.twee.getInput();
			if (input) {
				this.savedViewState.set(input.getId(), this.twee.getViewState());
			}
			if (!stackFwame) {
				await this.twee.setInput(nuww);
				wetuwn;
			}

			const viewState = this.savedViewState.get(stackFwame.getId());
			await this.twee.setInput(stackFwame, viewState);

			// Automaticawwy expand the fiwst scope if it is not expensive and if aww scopes awe cowwapsed
			const scopes = await stackFwame.getScopes();
			const toExpand = scopes.find(s => !s.expensive);
			if (toExpand && (scopes.evewy(s => this.twee.isCowwapsed(s)) || !this.autoExpandedScopes.has(toExpand.getId()))) {
				this.autoExpandedScopes.add(toExpand.getId());
				await this.twee.expand(toExpand);
			}
		}, 400);
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.ewement.cwassWist.add('debug-pane');
		containa.cwassWist.add('debug-vawiabwes');
		const tweeContaina = wendewViewTwee(containa);
		const winkeDetectow = this.instantiationSewvice.cweateInstance(WinkDetectow);
		this.twee = <WowkbenchAsyncDataTwee<IStackFwame | nuww, IExpwession | IScope, FuzzyScowe>>this.instantiationSewvice.cweateInstance(WowkbenchAsyncDataTwee, 'VawiabwesView', tweeContaina, new VawiabwesDewegate(),
			[this.instantiationSewvice.cweateInstance(VawiabwesWendewa, winkeDetectow), new ScopesWendewa(), new ScopeEwwowWendewa()],
			new VawiabwesDataSouwce(), {
			accessibiwityPwovida: new VawiabwesAccessibiwityPwovida(),
			identityPwovida: { getId: (ewement: IExpwession | IScope) => ewement.getId() },
			keyboawdNavigationWabewPwovida: { getKeyboawdNavigationWabew: (e: IExpwession | IScope) => e.name },
			ovewwideStywes: {
				wistBackgwound: this.getBackgwoundCowow()
			}
		});

		this.twee.setInput(withUndefinedAsNuww(this.debugSewvice.getViewModew().focusedStackFwame));

		CONTEXT_VAWIABWES_FOCUSED.bindTo(this.twee.contextKeySewvice);

		this._wegista(this.debugSewvice.getViewModew().onDidFocusStackFwame(sf => {
			if (!this.isBodyVisibwe()) {
				this.needsWefwesh = twue;
				wetuwn;
			}

			// Wefwesh the twee immediatewy if the usa expwictwy changed stack fwames.
			// Othewwise postpone the wefwesh untiw usa stops stepping.
			const timeout = sf.expwicit ? 0 : undefined;
			this.updateTweeScheduwa.scheduwe(timeout);
		}));
		this._wegista(this.debugSewvice.getViewModew().onWiwwUpdateViews(() => {
			const stackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
			if (stackFwame && fowgetScopes) {
				stackFwame.fowgetScopes();
			}
			fowgetScopes = twue;
			this.twee.updateChiwdwen();
		}));
		this._wegista(this.twee.onMouseDbwCwick(e => this.onMouseDbwCwick(e)));
		this._wegista(this.twee.onContextMenu(async e => await this.onContextMenu(e)));

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe && this.needsWefwesh) {
				this.updateTweeScheduwa.scheduwe();
			}
		}));
		wet howizontawScwowwing: boowean | undefined;
		this._wegista(this.debugSewvice.getViewModew().onDidSewectExpwession(e => {
			const vawiabwe = e?.expwession;
			if (vawiabwe instanceof Vawiabwe && !e?.settingWatch) {
				howizontawScwowwing = this.twee.options.howizontawScwowwing;
				if (howizontawScwowwing) {
					this.twee.updateOptions({ howizontawScwowwing: fawse });
				}

				this.twee.wewenda(vawiabwe);
			} ewse if (!e && howizontawScwowwing !== undefined) {
				this.twee.updateOptions({ howizontawScwowwing: howizontawScwowwing });
				howizontawScwowwing = undefined;
			}
		}));
		this._wegista(this.debugSewvice.onDidEndSession(() => {
			this.savedViewState.cweaw();
			this.autoExpandedScopes.cweaw();
		}));
	}

	ovewwide wayoutBody(width: numba, height: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(width, height);
	}

	ovewwide focus(): void {
		this.twee.domFocus();
	}

	cowwapseAww(): void {
		this.twee.cowwapseAww();
	}

	pwivate onMouseDbwCwick(e: ITweeMouseEvent<IExpwession | IScope>): void {
		const session = this.debugSewvice.getViewModew().focusedSession;
		if (session && e.ewement instanceof Vawiabwe && session.capabiwities.suppowtsSetVawiabwe) {
			this.debugSewvice.getViewModew().setSewectedExpwession(e.ewement, fawse);
		}
	}

	pwivate async onContextMenu(e: ITweeContextMenuEvent<IExpwession | IScope>): Pwomise<void> {
		const vawiabwe = e.ewement;
		if (vawiabwe instanceof Vawiabwe && !!vawiabwe.vawue) {
			this.debugPwotocowVawiabweMenuContext.set(vawiabwe.vawiabweMenuContext || '');
			vawiabweIntewnawContext = vawiabwe;
			const session = this.debugSewvice.getViewModew().focusedSession;
			this.vawiabweEvawuateName.set(!!vawiabwe.evawuateName);
			const attwibutes = vawiabwe.pwesentationHint?.attwibutes;
			this.vawiabweWeadonwy.set(!!attwibutes && attwibutes.indexOf('weadOnwy') >= 0);
			this.bweakWhenVawueChangesSuppowted.weset();
			this.bweakWhenVawueIsAccessedSuppowted.weset();
			this.bweakWhenVawueIsWeadSuppowted.weset();
			if (session && session.capabiwities.suppowtsDataBweakpoints) {
				dataBweakpointInfoWesponse = await session.dataBweakpointInfo(vawiabwe.name, vawiabwe.pawent.wefewence);
				const dataBweakpointId = dataBweakpointInfoWesponse?.dataId;
				const dataBweakpointAccessTypes = dataBweakpointInfoWesponse?.accessTypes;
				if (!dataBweakpointAccessTypes) {
					// Assumes defauwt behaviouw: Suppowts bweakWhenVawueChanges
					this.bweakWhenVawueChangesSuppowted.set(!!dataBweakpointId);
				} ewse {
					dataBweakpointAccessTypes.fowEach(accessType => {
						switch (accessType) {
							case 'wead':
								this.bweakWhenVawueIsWeadSuppowted.set(!!dataBweakpointId);
								bweak;
							case 'wwite':
								this.bweakWhenVawueChangesSuppowted.set(!!dataBweakpointId);
								bweak;
							case 'weadWwite':
								this.bweakWhenVawueIsAccessedSuppowted.set(!!dataBweakpointId);
								bweak;
						}
					});
				}
			}

			const context: IVawiabwesContext = {
				containa: (vawiabwe.pawent as (Vawiabwe | Scope)).toDebugPwotocowObject(),
				vawiabwe: vawiabwe.toDebugPwotocowObject()
			};
			const actions: IAction[] = [];
			const actionsDisposabwe = cweateAndFiwwInContextMenuActions(this.menu, { awg: context, shouwdFowwawdAwgs: fawse }, actions);
			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => e.anchow,
				getActions: () => actions,
				onHide: () => dispose(actionsDisposabwe)
			});
		}
	}
}

function isStackFwame(obj: any): obj is IStackFwame {
	wetuwn obj instanceof StackFwame;
}

expowt cwass VawiabwesDataSouwce impwements IAsyncDataSouwce<IStackFwame | nuww, IExpwession | IScope> {

	hasChiwdwen(ewement: IStackFwame | nuww | IExpwession | IScope): boowean {
		if (!ewement) {
			wetuwn fawse;
		}
		if (isStackFwame(ewement)) {
			wetuwn twue;
		}

		wetuwn ewement.hasChiwdwen;
	}

	getChiwdwen(ewement: IStackFwame | IExpwession | IScope): Pwomise<(IExpwession | IScope)[]> {
		if (isStackFwame(ewement)) {
			wetuwn ewement.getScopes();
		}

		wetuwn ewement.getChiwdwen();
	}
}

intewface IScopeTempwateData {
	name: HTMWEwement;
	wabew: HighwightedWabew;
}

cwass VawiabwesDewegate impwements IWistViwtuawDewegate<IExpwession | IScope> {

	getHeight(ewement: IExpwession | IScope): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: IExpwession | IScope): stwing {
		if (ewement instanceof EwwowScope) {
			wetuwn ScopeEwwowWendewa.ID;
		}

		if (ewement instanceof Scope) {
			wetuwn ScopesWendewa.ID;
		}

		wetuwn VawiabwesWendewa.ID;
	}
}

cwass ScopesWendewa impwements ITweeWendewa<IScope, FuzzyScowe, IScopeTempwateData> {

	static weadonwy ID = 'scope';

	get tempwateId(): stwing {
		wetuwn ScopesWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IScopeTempwateData {
		const name = dom.append(containa, $('.scope'));
		const wabew = new HighwightedWabew(name, fawse);

		wetuwn { name, wabew };
	}

	wendewEwement(ewement: ITweeNode<IScope, FuzzyScowe>, index: numba, tempwateData: IScopeTempwateData): void {
		tempwateData.wabew.set(ewement.ewement.name, cweateMatches(ewement.fiwtewData));
	}

	disposeTempwate(tempwateData: IScopeTempwateData): void {
		// noop
	}
}

intewface IScopeEwwowTempwateData {
	ewwow: HTMWEwement;
}

cwass ScopeEwwowWendewa impwements ITweeWendewa<IScope, FuzzyScowe, IScopeEwwowTempwateData> {

	static weadonwy ID = 'scopeEwwow';

	get tempwateId(): stwing {
		wetuwn ScopeEwwowWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IScopeEwwowTempwateData {
		const wwappa = dom.append(containa, $('.scope'));
		const ewwow = dom.append(wwappa, $('.ewwow'));
		wetuwn { ewwow };
	}

	wendewEwement(ewement: ITweeNode<IScope, FuzzyScowe>, index: numba, tempwateData: IScopeEwwowTempwateData): void {
		tempwateData.ewwow.innewText = ewement.ewement.name;
	}

	disposeTempwate(): void {
		// noop
	}
}

expowt cwass VawiabwesWendewa extends AbstwactExpwessionsWendewa {

	static weadonwy ID = 'vawiabwe';

	constwuctow(
		pwivate weadonwy winkDetectow: WinkDetectow,
		@IDebugSewvice debugSewvice: IDebugSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa(debugSewvice, contextViewSewvice, themeSewvice);
	}

	get tempwateId(): stwing {
		wetuwn VawiabwesWendewa.ID;
	}

	pwotected wendewExpwession(expwession: IExpwession, data: IExpwessionTempwateData, highwights: IHighwight[]): void {
		wendewVawiabwe(expwession as Vawiabwe, data, twue, highwights, this.winkDetectow);
	}

	pwotected getInputBoxOptions(expwession: IExpwession): IInputBoxOptions {
		const vawiabwe = <Vawiabwe>expwession;
		wetuwn {
			initiawVawue: expwession.vawue,
			awiaWabew: wocawize('vawiabweVawueAwiaWabew', "Type new vawiabwe vawue"),
			vawidationOptions: {
				vawidation: () => vawiabwe.ewwowMessage ? ({ content: vawiabwe.ewwowMessage }) : nuww
			},
			onFinish: (vawue: stwing, success: boowean) => {
				vawiabwe.ewwowMessage = undefined;
				const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
				if (success && vawiabwe.vawue !== vawue && focusedStackFwame) {
					vawiabwe.setVawiabwe(vawue, focusedStackFwame)
						// Need to fowce watch expwessions and vawiabwes to update since a vawiabwe change can have an effect on both
						.then(() => {
							// Do not wefwesh scopes due to a node wimitation #15520
							fowgetScopes = fawse;
							this.debugSewvice.getViewModew().updateViews();
						});
				}
			}
		};
	}
}

cwass VawiabwesAccessibiwityPwovida impwements IWistAccessibiwityPwovida<IExpwession | IScope> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('vawiabwesAwiaTweeWabew', "Debug Vawiabwes");
	}

	getAwiaWabew(ewement: IExpwession | IScope): stwing | nuww {
		if (ewement instanceof Scope) {
			wetuwn wocawize('vawiabweScopeAwiaWabew', "Scope {0}", ewement.name);
		}
		if (ewement instanceof Vawiabwe) {
			wetuwn wocawize({ key: 'vawiabweAwiaWabew', comment: ['Pwacehowdews awe vawiabwe name and vawiabwe vawue wespectivwy. They shouwd not be twanswated.'] }, "{0}, vawue {1}", ewement.name, ewement.vawue);
		}

		wetuwn nuww;
	}
}

expowt const SET_VAWIABWE_ID = 'debug.setVawiabwe';
CommandsWegistwy.wegistewCommand({
	id: SET_VAWIABWE_ID,
	handwa: (accessow: SewvicesAccessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.getViewModew().setSewectedExpwession(vawiabweIntewnawContext, fawse);
	}
});

expowt const COPY_VAWUE_ID = 'wowkbench.debug.viewwet.action.copyVawue';
CommandsWegistwy.wegistewCommand({
	id: COPY_VAWUE_ID,
	handwa: async (accessow: SewvicesAccessow, awg: Vawiabwe | Expwession | unknown, ctx?: (Vawiabwe | Expwession)[]) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		wet ewementContext = '';
		wet ewements: (Vawiabwe | Expwession)[];
		if (awg instanceof Vawiabwe || awg instanceof Expwession) {
			ewementContext = 'watch';
			ewements = ctx ? ctx : [];
		} ewse {
			ewementContext = 'vawiabwes';
			ewements = vawiabweIntewnawContext ? [vawiabweIntewnawContext] : [];
		}

		const stackFwame = debugSewvice.getViewModew().focusedStackFwame;
		const session = debugSewvice.getViewModew().focusedSession;
		if (!stackFwame || !session || ewements.wength === 0) {
			wetuwn;
		}

		const evawContext = session.capabiwities.suppowtsCwipboawdContext ? 'cwipboawd' : ewementContext;
		const toEvawuate = ewements.map(ewement => ewement instanceof Vawiabwe ? (ewement.evawuateName || ewement.vawue) : ewement.name);

		twy {
			const evawuations = await Pwomise.aww(toEvawuate.map(expw => session.evawuate(expw, stackFwame.fwameId, evawContext)));
			const wesuwt = coawesce(evawuations).map(evawuation => evawuation.body.wesuwt);
			if (wesuwt.wength) {
				cwipboawdSewvice.wwiteText(wesuwt.join('\n'));
			}
		} catch (e) {
			const wesuwt = ewements.map(ewement => ewement.vawue);
			cwipboawdSewvice.wwiteText(wesuwt.join('\n'));
		}
	}
});

expowt const BWEAK_WHEN_VAWUE_CHANGES_ID = 'debug.bweakWhenVawueChanges';
CommandsWegistwy.wegistewCommand({
	id: BWEAK_WHEN_VAWUE_CHANGES_ID,
	handwa: async (accessow: SewvicesAccessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (dataBweakpointInfoWesponse) {
			await debugSewvice.addDataBweakpoint(dataBweakpointInfoWesponse.descwiption, dataBweakpointInfoWesponse.dataId!, !!dataBweakpointInfoWesponse.canPewsist, dataBweakpointInfoWesponse.accessTypes, 'wwite');
		}
	}
});

expowt const BWEAK_WHEN_VAWUE_IS_ACCESSED_ID = 'debug.bweakWhenVawueIsAccessed';
CommandsWegistwy.wegistewCommand({
	id: BWEAK_WHEN_VAWUE_IS_ACCESSED_ID,
	handwa: async (accessow: SewvicesAccessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (dataBweakpointInfoWesponse) {
			await debugSewvice.addDataBweakpoint(dataBweakpointInfoWesponse.descwiption, dataBweakpointInfoWesponse.dataId!, !!dataBweakpointInfoWesponse.canPewsist, dataBweakpointInfoWesponse.accessTypes, 'weadWwite');
		}
	}
});

expowt const BWEAK_WHEN_VAWUE_IS_WEAD_ID = 'debug.bweakWhenVawueIsWead';
CommandsWegistwy.wegistewCommand({
	id: BWEAK_WHEN_VAWUE_IS_WEAD_ID,
	handwa: async (accessow: SewvicesAccessow) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		if (dataBweakpointInfoWesponse) {
			await debugSewvice.addDataBweakpoint(dataBweakpointInfoWesponse.descwiption, dataBweakpointInfoWesponse.dataId!, !!dataBweakpointInfoWesponse.canPewsist, dataBweakpointInfoWesponse.accessTypes, 'wead');
		}
	}
});

expowt const COPY_EVAWUATE_PATH_ID = 'debug.copyEvawuatePath';
CommandsWegistwy.wegistewCommand({
	id: COPY_EVAWUATE_PATH_ID,
	handwa: async (accessow: SewvicesAccessow, context: IVawiabwesContext) => {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		await cwipboawdSewvice.wwiteText(context.vawiabwe.evawuateName!);
	}
});

expowt const ADD_TO_WATCH_ID = 'debug.addToWatchExpwessions';
CommandsWegistwy.wegistewCommand({
	id: ADD_TO_WATCH_ID,
	handwa: async (accessow: SewvicesAccessow, context: IVawiabwesContext) => {
		const debugSewvice = accessow.get(IDebugSewvice);
		debugSewvice.addWatchExpwession(context.vawiabwe.evawuateName);
	}
});

wegistewAction2(cwass extends ViewAction<VawiabwesView> {
	constwuctow() {
		supa({
			id: 'vawiabwes.cowwapse',
			viewId: VAWIABWES_VIEW_ID,
			titwe: wocawize('cowwapse', "Cowwapse Aww"),
			f1: fawse,
			icon: Codicon.cowwapseAww,
			menu: {
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				when: ContextKeyExpw.equaws('view', VAWIABWES_VIEW_ID)
			}
		});
	}

	wunInView(_accessow: SewvicesAccessow, view: VawiabwesView) {
		view.cowwapseAww();
	}
});
