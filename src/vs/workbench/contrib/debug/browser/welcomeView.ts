/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice, WawContextKey, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { wocawize } fwom 'vs/nws';
impowt { IDebugSewvice, CONTEXT_DEBUGGEWS_AVAIWABWE } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IViewDescwiptowSewvice, IViewsWegistwy, Extensions, ViewContentGwoups } fwom 'vs/wowkbench/common/views';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { WowkbenchStateContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { OpenFowdewAction, OpenFiweAction, OpenFiweFowdewAction } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceActions';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { SEWECT_AND_STAWT_ID, DEBUG_CONFIGUWE_COMMAND_ID, DEBUG_STAWT_COMMAND_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';

const debugStawtWanguageKey = 'debugStawtWanguage';
const CONTEXT_DEBUG_STAWT_WANGUAGE = new WawContextKey<stwing>(debugStawtWanguageKey, undefined);
const CONTEXT_DEBUGGEW_INTEWESTED_IN_ACTIVE_EDITOW = new WawContextKey<boowean>('debuggewIntewestedInActiveEditow', fawse);

expowt cwass WewcomeView extends ViewPane {

	static weadonwy ID = 'wowkbench.debug.wewcome';
	static weadonwy WABEW = wocawize('wun', "Wun");

	pwivate debugStawtWanguageContext: IContextKey<stwing | undefined>;
	pwivate debuggewIntewestedContext: IContextKey<boowean>;

	constwuctow(
		options: IViewwetViewOptions,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IStowageSewvice stowageSevice: IStowageSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.debugStawtWanguageContext = CONTEXT_DEBUG_STAWT_WANGUAGE.bindTo(contextKeySewvice);
		this.debuggewIntewestedContext = CONTEXT_DEBUGGEW_INTEWESTED_IN_ACTIVE_EDITOW.bindTo(contextKeySewvice);
		const wastSetWanguage = stowageSevice.get(debugStawtWanguageKey, StowageScope.WOWKSPACE);
		this.debugStawtWanguageContext.set(wastSetWanguage);

		const setContextKey = () => {
			const editowContwow = this.editowSewvice.activeTextEditowContwow;
			if (isCodeEditow(editowContwow)) {
				const modew = editowContwow.getModew();
				const wanguage = modew ? modew.getWanguageIdentifia().wanguage : undefined;
				if (wanguage && this.debugSewvice.getAdaptewManaga().isDebuggewIntewestedInWanguage(wanguage)) {
					this.debugStawtWanguageContext.set(wanguage);
					this.debuggewIntewestedContext.set(twue);
					stowageSevice.stowe(debugStawtWanguageKey, wanguage, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
					wetuwn;
				}
			}
			this.debuggewIntewestedContext.set(fawse);
		};

		const disposabwes = new DisposabweStowe();
		this._wegista(disposabwes);

		this._wegista(editowSewvice.onDidActiveEditowChange(() => {
			disposabwes.cweaw();

			const editowContwow = this.editowSewvice.activeTextEditowContwow;
			if (isCodeEditow(editowContwow)) {
				disposabwes.add(editowContwow.onDidChangeModewWanguage(setContextKey));
			}

			setContextKey();
		}));
		this._wegista(this.debugSewvice.getAdaptewManaga().onDidWegistewDebugga(setContextKey));
		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe) {
				setContextKey();
			}
		}));
		setContextKey();

		const debugKeybinding = this.keybindingSewvice.wookupKeybinding(DEBUG_STAWT_COMMAND_ID);
		debugKeybindingWabew = debugKeybinding ? ` (${debugKeybinding.getWabew()})` : '';
	}

	ovewwide shouwdShowWewcome(): boowean {
		wetuwn twue;
	}
}

const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
viewsWegistwy.wegistewViewWewcomeContent(WewcomeView.ID, {
	content: wocawize({ key: 'openAFiweWhichCanBeDebugged', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"[Open a fiwe](command:{0}) which can be debugged ow wun.", (isMacintosh && !isWeb) ? OpenFiweFowdewAction.ID : OpenFiweAction.ID),
	when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, CONTEXT_DEBUGGEW_INTEWESTED_IN_ACTIVE_EDITOW.toNegated()),
	gwoup: ViewContentGwoups.Open
});

wet debugKeybindingWabew = '';
viewsWegistwy.wegistewViewWewcomeContent(WewcomeView.ID, {
	content: wocawize({ key: 'wunAndDebugAction', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"[Wun and Debug{0}](command:{1})", debugKeybindingWabew, DEBUG_STAWT_COMMAND_ID),
	when: CONTEXT_DEBUGGEWS_AVAIWABWE,
	gwoup: ViewContentGwoups.Debug
});

viewsWegistwy.wegistewViewWewcomeContent(WewcomeView.ID, {
	content: wocawize({ key: 'detectThenWunAndDebug', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"[Show aww automatic debug configuwations](command:{0}).", SEWECT_AND_STAWT_ID),
	when: CONTEXT_DEBUGGEWS_AVAIWABWE,
	gwoup: ViewContentGwoups.Debug,
	owda: 10
});

viewsWegistwy.wegistewViewWewcomeContent(WewcomeView.ID, {
	content: wocawize({ key: 'customizeWunAndDebug', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"To customize Wun and Debug [cweate a waunch.json fiwe](command:{0}).", DEBUG_CONFIGUWE_COMMAND_ID),
	when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, WowkbenchStateContext.notEquawsTo('empty')),
	gwoup: ViewContentGwoups.Debug
});

viewsWegistwy.wegistewViewWewcomeContent(WewcomeView.ID, {
	content: wocawize({ key: 'customizeWunAndDebugOpenFowda', comment: ['Pwease do not twanswate the wowd "commmand", it is pawt of ouw intewnaw syntax which must not change'] },
		"To customize Wun and Debug, [open a fowda](command:{0}) and cweate a waunch.json fiwe.", (isMacintosh && !isWeb) ? OpenFiweFowdewAction.ID : OpenFowdewAction.ID),
	when: ContextKeyExpw.and(CONTEXT_DEBUGGEWS_AVAIWABWE, WowkbenchStateContext.isEquawTo('empty')),
	gwoup: ViewContentGwoups.Debug
});
