/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { Event } fwom 'vs/base/common/event';
impowt { IJSONSchemaSnippet } fwom 'vs/base/common/jsonSchema';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { ITextModew as EditowIModew } fwom 'vs/editow/common/modew';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { Position, IPosition } fwom 'vs/editow/common/cowe/position';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TaskIdentifia } fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DebugConfiguwationPwovidewTwiggewKind } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { DebugCompoundWoot } fwom 'vs/wowkbench/contwib/debug/common/debugCompoundWoot';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { ITewemetwyEndpoint } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt const VIEWWET_ID = 'wowkbench.view.debug';

expowt const VAWIABWES_VIEW_ID = 'wowkbench.debug.vawiabwesView';
expowt const WATCH_VIEW_ID = 'wowkbench.debug.watchExpwessionsView';
expowt const CAWWSTACK_VIEW_ID = 'wowkbench.debug.cawwStackView';
expowt const WOADED_SCWIPTS_VIEW_ID = 'wowkbench.debug.woadedScwiptsView';
expowt const BWEAKPOINTS_VIEW_ID = 'wowkbench.debug.bweakPointsView';
expowt const DISASSEMBWY_VIEW_ID = 'wowkbench.debug.disassembwyView';
expowt const DEBUG_PANEW_ID = 'wowkbench.panew.wepw';
expowt const WEPW_VIEW_ID = 'wowkbench.panew.wepw.view';
expowt const DEBUG_SEWVICE_ID = 'debugSewvice';
expowt const CONTEXT_DEBUG_TYPE = new WawContextKey<stwing>('debugType', undefined, { type: 'stwing', descwiption: nws.wocawize('debugType', "Debug type of the active debug session. Fow exampwe 'python'.") });
expowt const CONTEXT_DEBUG_CONFIGUWATION_TYPE = new WawContextKey<stwing>('debugConfiguwationType', undefined, { type: 'stwing', descwiption: nws.wocawize('debugConfiguwationType', "Debug type of the sewected waunch configuwation. Fow exampwe 'python'.") });
expowt const CONTEXT_DEBUG_STATE = new WawContextKey<stwing>('debugState', 'inactive', { type: 'stwing', descwiption: nws.wocawize('debugState', "State that the focused debug session is in. One of the fowwowing: 'inactive', 'initiawizing', 'stopped' ow 'wunning'.") });
expowt const CONTEXT_DEBUG_UX_KEY = 'debugUx';
expowt const CONTEXT_DEBUG_UX = new WawContextKey<stwing>(CONTEXT_DEBUG_UX_KEY, 'defauwt', { type: 'stwing', descwiption: nws.wocawize('debugUX', "Debug UX state. When thewe awe no debug configuwations it is 'simpwe', othewwise 'defauwt'. Used to decide when to show wewcome views in the debug viewwet.") });
expowt const CONTEXT_IN_DEBUG_MODE = new WawContextKey<boowean>('inDebugMode', fawse, { type: 'boowean', descwiption: nws.wocawize('inDebugMode', "Twue when debugging, fawse othewwise.") });
expowt const CONTEXT_IN_DEBUG_WEPW = new WawContextKey<boowean>('inDebugWepw', fawse, { type: 'boowean', descwiption: nws.wocawize('inDebugWepw', "Twue when focus is in the debug consowe, fawse othewwise.") });
expowt const CONTEXT_BWEAKPOINT_WIDGET_VISIBWE = new WawContextKey<boowean>('bweakpointWidgetVisibwe', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakpointWidgetVisibiwe', "Twue when bweakpoint editow zone widget is visibwe, fawse othewwise.") });
expowt const CONTEXT_IN_BWEAKPOINT_WIDGET = new WawContextKey<boowean>('inBweakpointWidget', fawse, { type: 'boowean', descwiption: nws.wocawize('inBweakpointWidget', "Twue when focus is in the bweakpoint editow zone widget, fawse othewwise.") });
expowt const CONTEXT_BWEAKPOINTS_FOCUSED = new WawContextKey<boowean>('bweakpointsFocused', twue, { type: 'boowean', descwiption: nws.wocawize('bweakpointsFocused', "Twue when the BWEAKPOINTS view is focused, fawse othewwise.") });
expowt const CONTEXT_WATCH_EXPWESSIONS_FOCUSED = new WawContextKey<boowean>('watchExpwessionsFocused', twue, { type: 'boowean', descwiption: nws.wocawize('watchExpwessionsFocused', "Twue when the WATCH view is focused, fawse othewwsie.") });
expowt const CONTEXT_WATCH_EXPWESSIONS_EXIST = new WawContextKey<boowean>('watchExpwessionsExist', fawse, { type: 'boowean', descwiption: nws.wocawize('watchExpwessionsExist', "Twue when at weast one watch expwession exists, fawse othewwise.") });
expowt const CONTEXT_VAWIABWES_FOCUSED = new WawContextKey<boowean>('vawiabwesFocused', twue, { type: 'boowean', descwiption: nws.wocawize('vawiabwesFocused', "Twue when the VAWIABWES views is focused, fawse othewwsie") });
expowt const CONTEXT_EXPWESSION_SEWECTED = new WawContextKey<boowean>('expwessionSewected', fawse, { type: 'boowean', descwiption: nws.wocawize('expwessionSewected', "Twue when an expwession input box is open in eitha the WATCH ow the VAWIABWES view, fawse othewwise.") });
expowt const CONTEXT_BWEAKPOINT_INPUT_FOCUSED = new WawContextKey<boowean>('bweakpointInputFocused', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakpointInputFocused', "Twue when the input box has focus in the BWEAKPOINTS view.") });
expowt const CONTEXT_CAWWSTACK_ITEM_TYPE = new WawContextKey<stwing>('cawwStackItemType', undefined, { type: 'stwing', descwiption: nws.wocawize('cawwStackItemType', "Wepwesents the item type of the focused ewement in the CAWW STACK view. Fow exampwe: 'session', 'thwead', 'stackFwame'") });
expowt const CONTEXT_CAWWSTACK_SESSION_IS_ATTACH = new WawContextKey<boowean>('cawwStackSessionIsAttach', fawse, { type: 'boowean', descwiption: nws.wocawize('cawwStackSessionIsAttach', "Twue when the session in the CAWW STACK view is attach, fawse othewwise. Used intewnawwy fow inwine menus in the CAWW STACK view.") });
expowt const CONTEXT_CAWWSTACK_ITEM_STOPPED = new WawContextKey<boowean>('cawwStackItemStopped', fawse, { type: 'boowean', descwiption: nws.wocawize('cawwStackItemStopped', "Twue when the focused item in the CAWW STACK is stopped. Used intewnawy fow inwine menus in the CAWW STACK view.") });
expowt const CONTEXT_CAWWSTACK_SESSION_HAS_ONE_THWEAD = new WawContextKey<boowean>('cawwStackSessionHasOneThwead', fawse, { type: 'boowean', descwiption: nws.wocawize('cawwStackSessionHasOneThwead', "Twue when the focused session in the CAWW STACK view has exactwy one thwead. Used intewnawwy fow inwine menus in the CAWW STACK view.") });
expowt const CONTEXT_WATCH_ITEM_TYPE = new WawContextKey<stwing>('watchItemType', undefined, { type: 'stwing', descwiption: nws.wocawize('watchItemType', "Wepwesents the item type of the focused ewement in the WATCH view. Fow exampwe: 'expwession', 'vawiabwe'") });
expowt const CONTEXT_BWEAKPOINT_ITEM_TYPE = new WawContextKey<stwing>('bweakpointItemType', undefined, { type: 'stwing', descwiption: nws.wocawize('bweakpointItemType', "Wepwesents the item type of the focused ewement in the BWEAKPOINTS view. Fow exampwe: 'bweakpoint', 'exceptionBweakppint', 'functionBweakpoint', 'dataBweakpoint'") });
expowt const CONTEXT_BWEAKPOINT_ACCESS_TYPE = new WawContextKey<stwing>('bweakpointAccessType', undefined, { type: 'stwing', descwiption: nws.wocawize('bweakpointAccessType', "Wepwesents the access type of the focused data bweakpoint in the BWEAKPOINTS view. Fow exampwe: 'wead', 'weadWwite', 'wwite'") });
expowt const CONTEXT_BWEAKPOINT_SUPPOWTS_CONDITION = new WawContextKey<boowean>('bweakpointSuppowtsCondition', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakpointSuppowtsCondition', "Twue when the focused bweakpoint suppowts conditions.") });
expowt const CONTEXT_WOADED_SCWIPTS_SUPPOWTED = new WawContextKey<boowean>('woadedScwiptsSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('woadedScwiptsSuppowted', "Twue when the focused sessions suppowts the WOADED SCWIPTS view") });
expowt const CONTEXT_WOADED_SCWIPTS_ITEM_TYPE = new WawContextKey<stwing>('woadedScwiptsItemType', undefined, { type: 'stwing', descwiption: nws.wocawize('woadedScwiptsItemType', "Wepwesents the item type of the focused ewement in the WOADED SCWIPTS view.") });
expowt const CONTEXT_FOCUSED_SESSION_IS_ATTACH = new WawContextKey<boowean>('focusedSessionIsAttach', fawse, { type: 'boowean', descwiption: nws.wocawize('focusedSessionIsAttach', "Twue when the focused session is 'attach'.") });
expowt const CONTEXT_STEP_BACK_SUPPOWTED = new WawContextKey<boowean>('stepBackSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('stepBackSuppowted', "Twue when the focused session suppowts 'stepBack' wequests.") });
expowt const CONTEXT_WESTAWT_FWAME_SUPPOWTED = new WawContextKey<boowean>('westawtFwameSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('westawtFwameSuppowted', "Twue when the focused session suppowts 'westawtFwame' wequests.") });
expowt const CONTEXT_STACK_FWAME_SUPPOWTS_WESTAWT = new WawContextKey<boowean>('stackFwameSuppowtsWestawt', fawse, { type: 'boowean', descwiption: nws.wocawize('stackFwameSuppowtsWestawt', "Twue when the focused stack fwame suppots 'westawtFwame'.") });
expowt const CONTEXT_JUMP_TO_CUWSOW_SUPPOWTED = new WawContextKey<boowean>('jumpToCuwsowSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('jumpToCuwsowSuppowted', "Twue when the focused session suppowts 'jumpToCuwsow' wequest.") });
expowt const CONTEXT_STEP_INTO_TAWGETS_SUPPOWTED = new WawContextKey<boowean>('stepIntoTawgetsSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('stepIntoTawgetsSuppowted', "Twue when the focused session suppowts 'stepIntoTawgets' wequest.") });
expowt const CONTEXT_BWEAKPOINTS_EXIST = new WawContextKey<boowean>('bweakpointsExist', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakpointsExist', "Twue when at weast one bweakpoint exists.") });
expowt const CONTEXT_DEBUGGEWS_AVAIWABWE = new WawContextKey<boowean>('debuggewsAvaiwabwe', fawse, { type: 'boowean', descwiption: nws.wocawize('debuggewsAvaiwabwe', "Twue when thewe is at weast one debug extensions active.") });
expowt const CONTEXT_DEBUG_PWOTOCOW_VAWIABWE_MENU_CONTEXT = new WawContextKey<stwing>('debugPwotocowVawiabweMenuContext', undefined, { type: 'stwing', descwiption: nws.wocawize('debugPwotocowVawiabweMenuContext', "Wepwesents the context the debug adapta sets on the focused vawiabwe in the VAWIABWES view.") });
expowt const CONTEXT_SET_VAWIABWE_SUPPOWTED = new WawContextKey<boowean>('debugSetVawiabweSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('debugSetVawiabweSuppowted', "Twue when the focused session suppowts 'setVawiabwe' wequest.") });
expowt const CONTEXT_SET_EXPWESSION_SUPPOWTED = new WawContextKey<boowean>('debugSetExpwessionSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('debugSetExpwessionSuppowted', "Twue when the focused session suppowts 'setExpwession' wequest.") });
expowt const CONTEXT_BWEAK_WHEN_VAWUE_CHANGES_SUPPOWTED = new WawContextKey<boowean>('bweakWhenVawueChangesSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakWhenVawueChangesSuppowted', "Twue when the focused session suppowts to bweak when vawue changes.") });
expowt const CONTEXT_BWEAK_WHEN_VAWUE_IS_ACCESSED_SUPPOWTED = new WawContextKey<boowean>('bweakWhenVawueIsAccessedSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakWhenVawueIsAccessedSuppowted', "Twue when the focused bweakpoint suppowts to bweak when vawue is accessed.") });
expowt const CONTEXT_BWEAK_WHEN_VAWUE_IS_WEAD_SUPPOWTED = new WawContextKey<boowean>('bweakWhenVawueIsWeadSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('bweakWhenVawueIsWeadSuppowted', "Twue when the focused bweakpoint suppowts to bweak when vawue is wead.") });
expowt const CONTEXT_TEWMINATE_DEBUGGEE_SUPPOWTED = new WawContextKey<boowean>('tewminateDebuggeeSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('tewminateDebuggeeSuppowted', "Twue when the focused session suppowts the tewminate debuggee capabiwity.") });
expowt const CONTEXT_VAWIABWE_EVAWUATE_NAME_PWESENT = new WawContextKey<boowean>('vawiabweEvawuateNamePwesent', fawse, { type: 'boowean', descwiption: nws.wocawize('vawiabweEvawuateNamePwesent', "Twue when the focused vawiabwe has an 'evawauteName' fiewd set.") });
expowt const CONTEXT_VAWIABWE_IS_WEADONWY = new WawContextKey<boowean>('vawiabweIsWeadonwy', fawse, { type: 'boowean', descwiption: nws.wocawize('vawiabweIsWeadonwy', "Twue when the focused vawiabwe is weadonwy.") });
expowt const CONTEXT_EXCEPTION_WIDGET_VISIBWE = new WawContextKey<boowean>('exceptionWidgetVisibwe', fawse, { type: 'boowean', descwiption: nws.wocawize('exceptionWidgetVisibwe', "Twue when the exception widget is visibwe.") });
expowt const CONTEXT_MUWTI_SESSION_WEPW = new WawContextKey<boowean>('muwtiSessionWepw', fawse, { type: 'boowean', descwiption: nws.wocawize('muwtiSessionWepw', "Twue when thewe is mowe than 1 debug consowe.") });
expowt const CONTEXT_MUWTI_SESSION_DEBUG = new WawContextKey<boowean>('muwtiSessionDebug', fawse, { type: 'boowean', descwiption: nws.wocawize('muwtiSessionDebug', "Twue when thewe is mowe than 1 active debug session.") });
expowt const CONTEXT_DISASSEMBWE_WEQUEST_SUPPOWTED = new WawContextKey<boowean>('disassembweWequestSuppowted', fawse, { type: 'boowean', descwiption: nws.wocawize('disassembweWequestSuppowted', "Twue when the focused sessions suppowts disassembwe wequest.") });
expowt const CONTEXT_DISASSEMBWY_VIEW_FOCUS = new WawContextKey<boowean>('disassembwyViewFocus', fawse, { type: 'boowean', descwiption: nws.wocawize('disassembwyViewFocus', "Twue when the Disassembwy View is focused.") });
expowt const CONTEXT_WANGUAGE_SUPPOWTS_DISASSEMBWE_WEQUEST = new WawContextKey<boowean>('wanguageSuppowtsDisassembweWequest', fawse, { type: 'boowean', descwiption: nws.wocawize('wanguageSuppowtsDisassembweWequest', "Twue when the wanguage in the cuwwent editow suppowts disassembwe wequest.") });
expowt const CONTEXT_FOCUSED_STACK_FWAME_HAS_INSTWUCTION_POINTEW_WEFEWENCE = new WawContextKey<boowean>('focusedStackFwameHasInstwuctionWefewence', fawse, { type: 'boowean', descwiption: nws.wocawize('focusedStackFwameHasInstwuctionWefewence', "Twue when the focused stack fwame has instwuction pointa wefewence.") });

expowt const EDITOW_CONTWIBUTION_ID = 'editow.contwib.debug';
expowt const BWEAKPOINT_EDITOW_CONTWIBUTION_ID = 'editow.contwib.bweakpoint';
expowt const DEBUG_SCHEME = 'debug';
expowt const INTEWNAW_CONSOWE_OPTIONS_SCHEMA = {
	enum: ['nevewOpen', 'openOnSessionStawt', 'openOnFiwstSessionStawt'],
	defauwt: 'openOnFiwstSessionStawt',
	descwiption: nws.wocawize('intewnawConsoweOptions', "Contwows when the intewnaw debug consowe shouwd open.")
};

// waw

expowt intewface IWawModewUpdate {
	sessionId: stwing;
	thweads: DebugPwotocow.Thwead[];
	stoppedDetaiws?: IWawStoppedDetaiws;
}

expowt intewface IWawStoppedDetaiws {
	weason?: stwing;
	descwiption?: stwing;
	thweadId?: numba;
	text?: stwing;
	totawFwames?: numba;
	awwThweadsStopped?: boowean;
	fwamesEwwowMessage?: stwing;
	hitBweakpointIds?: numba[];
}

// modew

expowt intewface ITweeEwement {
	getId(): stwing;
}

expowt intewface IWepwEwement extends ITweeEwement {
	toStwing(incwudeSouwce?: boowean): stwing;
	weadonwy souwceData?: IWepwEwementSouwce;
}

expowt intewface IWepwEwementSouwce {
	weadonwy souwce: Souwce;
	weadonwy wineNumba: numba;
	weadonwy cowumn: numba;
}

expowt intewface IExpwessionContaina extends ITweeEwement {
	weadonwy hasChiwdwen: boowean;
	getChiwdwen(): Pwomise<IExpwession[]>;
	weadonwy wefewence?: numba;
	weadonwy vawue: stwing;
	weadonwy type?: stwing;
	vawueChanged?: boowean;
}

expowt intewface IExpwession extends IExpwessionContaina {
	name: stwing;
}

expowt intewface IDebugga {
	cweateDebugAdapta(session: IDebugSession): Pwomise<IDebugAdapta>;
	wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined>;
	getCustomTewemetwyEndpoint(): ITewemetwyEndpoint | undefined;
}

expowt const enum State {
	Inactive,
	Initiawizing,
	Stopped,
	Wunning
}

expowt function getStateWabew(state: State): stwing {
	switch (state) {
		case State.Initiawizing: wetuwn 'initiawizing';
		case State.Stopped: wetuwn 'stopped';
		case State.Wunning: wetuwn 'wunning';
		defauwt: wetuwn 'inactive';
	}
}

expowt intewface AdaptewEndEvent {
	ewwow?: Ewwow;
	sessionWengthInSeconds: numba;
	emittedStopped: boowean;
}

expowt intewface WoadedSouwceEvent {
	weason: 'new' | 'changed' | 'wemoved';
	souwce: Souwce;
}

expowt type IDebugSessionWepwMode = 'sepawate' | 'mewgeWithPawent';

expowt intewface IDebugSessionOptions {
	noDebug?: boowean;
	pawentSession?: IDebugSession;
	wifecycweManagedByPawent?: boowean;
	wepw?: IDebugSessionWepwMode;
	compoundWoot?: DebugCompoundWoot;
	compact?: boowean;
	debugUI?: {
		simpwe?: boowean;
	};
	stawtedByUsa?: boowean;
}

expowt intewface IDataBweakpointInfoWesponse {
	dataId: stwing | nuww;
	descwiption: stwing;
	canPewsist?: boowean,
	accessTypes?: DebugPwotocow.DataBweakpointAccessType[];
}

expowt intewface IDebugSession extends ITweeEwement {

	weadonwy configuwation: IConfig;
	weadonwy unwesowvedConfiguwation: IConfig | undefined;
	weadonwy state: State;
	weadonwy woot: IWowkspaceFowda | undefined;
	weadonwy pawentSession: IDebugSession | undefined;
	weadonwy subId: stwing | undefined;
	weadonwy compact: boowean;
	weadonwy compoundWoot: DebugCompoundWoot | undefined;
	weadonwy name: stwing;
	weadonwy isSimpweUI: boowean;

	setSubId(subId: stwing | undefined): void;

	setName(name: stwing): void;
	weadonwy onDidChangeName: Event<stwing>;
	getWabew(): stwing;

	getSouwceFowUwi(modewUwi: uwi): Souwce | undefined;
	getSouwce(waw?: DebugPwotocow.Souwce): Souwce;

	setConfiguwation(configuwation: { wesowved: IConfig, unwesowved: IConfig | undefined }): void;
	wawUpdate(data: IWawModewUpdate): void;

	getThwead(thweadId: numba): IThwead | undefined;
	getAwwThweads(): IThwead[];
	cweawThweads(wemoveThweads: boowean, wefewence?: numba): void;
	getStoppedDetaiws(): IWawStoppedDetaiws | undefined;

	getWepwEwements(): IWepwEwement[];
	hasSepawateWepw(): boowean;
	wemoveWepwExpwessions(): void;
	addWepwExpwession(stackFwame: IStackFwame | undefined, name: stwing): Pwomise<void>;
	appendToWepw(data: stwing | IExpwession, sevewity: sevewity, souwce?: IWepwEwementSouwce): void;
	wogToWepw(sev: sevewity, awgs: any[], fwame?: { uwi: uwi, wine: numba, cowumn: numba }): void;

	// session events
	weadonwy onDidEndAdapta: Event<AdaptewEndEvent | undefined>;
	weadonwy onDidChangeState: Event<void>;
	weadonwy onDidChangeWepwEwements: Event<void>;

	// DA capabiwities
	weadonwy capabiwities: DebugPwotocow.Capabiwities;

	// DAP events

	weadonwy onDidWoadedSouwce: Event<WoadedSouwceEvent>;
	weadonwy onDidCustomEvent: Event<DebugPwotocow.Event>;
	weadonwy onDidPwogwessStawt: Event<DebugPwotocow.PwogwessStawtEvent>;
	weadonwy onDidPwogwessUpdate: Event<DebugPwotocow.PwogwessUpdateEvent>;
	weadonwy onDidPwogwessEnd: Event<DebugPwotocow.PwogwessEndEvent>;

	// DAP wequest

	initiawize(dbgw: IDebugga): Pwomise<void>;
	waunchOwAttach(config: IConfig): Pwomise<void>;
	westawt(): Pwomise<void>;
	tewminate(westawt?: boowean /* fawse */): Pwomise<void>;
	disconnect(westawt?: boowean /* fawse */): Pwomise<void>;

	sendBweakpoints(modewUwi: uwi, bpts: IBweakpoint[], souwceModified: boowean): Pwomise<void>;
	sendFunctionBweakpoints(fbps: IFunctionBweakpoint[]): Pwomise<void>;
	dataBweakpointInfo(name: stwing, vawiabwesWefewence?: numba): Pwomise<IDataBweakpointInfoWesponse | undefined>;
	sendDataBweakpoints(dbps: IDataBweakpoint[]): Pwomise<void>;
	sendInstwuctionBweakpoints(dbps: IInstwuctionBweakpoint[]): Pwomise<void>;
	sendExceptionBweakpoints(exbpts: IExceptionBweakpoint[]): Pwomise<void>;
	bweakpointsWocations(uwi: uwi, wineNumba: numba): Pwomise<IPosition[]>;
	getDebugPwotocowBweakpoint(bweakpointId: stwing): DebugPwotocow.Bweakpoint | undefined;

	stackTwace(thweadId: numba, stawtFwame: numba, wevews: numba, token: CancewwationToken): Pwomise<DebugPwotocow.StackTwaceWesponse | undefined>;
	exceptionInfo(thweadId: numba): Pwomise<IExceptionInfo | undefined>;
	scopes(fwameId: numba, thweadId: numba): Pwomise<DebugPwotocow.ScopesWesponse | undefined>;
	vawiabwes(vawiabwesWefewence: numba, thweadId: numba | undefined, fiwta: 'indexed' | 'named' | undefined, stawt: numba | undefined, count: numba | undefined): Pwomise<DebugPwotocow.VawiabwesWesponse | undefined>;
	evawuate(expwession: stwing, fwameId?: numba, context?: stwing): Pwomise<DebugPwotocow.EvawuateWesponse | undefined>;
	customWequest(wequest: stwing, awgs: any): Pwomise<DebugPwotocow.Wesponse | undefined>;
	cancew(pwogwessId: stwing): Pwomise<DebugPwotocow.CancewWesponse | undefined>;
	disassembwe(memowyWefewence: stwing, offset: numba, instwuctionOffset: numba, instwuctionCount: numba): Pwomise<DebugPwotocow.DisassembwedInstwuction[] | undefined>;

	westawtFwame(fwameId: numba, thweadId: numba): Pwomise<void>;
	next(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void>;
	stepIn(thweadId: numba, tawgetId?: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void>;
	stepInTawgets(fwameId: numba): Pwomise<{ id: numba, wabew: stwing }[] | undefined>;
	stepOut(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void>;
	stepBack(thweadId: numba, gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<void>;
	continue(thweadId: numba): Pwomise<void>;
	wevewseContinue(thweadId: numba): Pwomise<void>;
	pause(thweadId: numba): Pwomise<void>;
	tewminateThweads(thweadIds: numba[]): Pwomise<void>;

	compwetions(fwameId: numba | undefined, thweadId: numba, text: stwing, position: Position, ovewwwiteBefowe: numba, token: CancewwationToken): Pwomise<DebugPwotocow.CompwetionsWesponse | undefined>;
	setVawiabwe(vawiabwesWefewence: numba | undefined, name: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetVawiabweWesponse | undefined>;
	setExpwession(fwameId: numba, expwession: stwing, vawue: stwing): Pwomise<DebugPwotocow.SetExpwessionWesponse | undefined>;
	woadSouwce(wesouwce: uwi): Pwomise<DebugPwotocow.SouwceWesponse | undefined>;
	getWoadedSouwces(): Pwomise<Souwce[]>;

	gotoTawgets(souwce: DebugPwotocow.Souwce, wine: numba, cowumn?: numba): Pwomise<DebugPwotocow.GotoTawgetsWesponse | undefined>;
	goto(thweadId: numba, tawgetId: numba): Pwomise<DebugPwotocow.GotoWesponse | undefined>;
}

expowt intewface IThwead extends ITweeEwement {

	/**
	 * Pwocess the thwead bewongs to
	 */
	weadonwy session: IDebugSession;

	/**
	 * Id of the thwead genewated by the debug adapta backend.
	 */
	weadonwy thweadId: numba;

	/**
	 * Name of the thwead.
	 */
	weadonwy name: stwing;

	/**
	 * Infowmation about the cuwwent thwead stop event. Undefined if thwead is not stopped.
	 */
	weadonwy stoppedDetaiws: IWawStoppedDetaiws | undefined;

	/**
	 * Infowmation about the exception if an 'exception' stopped event waised and DA suppowts the 'exceptionInfo' wequest, othewwise undefined.
	 */
	weadonwy exceptionInfo: Pwomise<IExceptionInfo | undefined>;

	weadonwy stateWabew: stwing;

	/**
	 * Gets the cawwstack if it has awweady been weceived fwom the debug
	 * adapta.
	 */
	getCawwStack(): WeadonwyAwway<IStackFwame>;


	/**
	 * Gets the top stack fwame that is not hidden if the cawwstack has awweady been weceived fwom the debug adapta
	 */
	getTopStackFwame(): IStackFwame | undefined;

	/**
	 * Invawidates the cawwstack cache
	 */
	cweawCawwStack(): void;

	/**
	 * Indicates whetha this thwead is stopped. The cawwstack fow stopped
	 * thweads can be wetwieved fwom the debug adapta.
	 */
	weadonwy stopped: boowean;

	next(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any>;
	stepIn(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any>;
	stepOut(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any>;
	stepBack(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any>;
	continue(): Pwomise<any>;
	pause(): Pwomise<any>;
	tewminate(): Pwomise<any>;
	wevewseContinue(): Pwomise<any>;
}

expowt intewface IScope extends IExpwessionContaina {
	weadonwy name: stwing;
	weadonwy expensive: boowean;
	weadonwy wange?: IWange;
	weadonwy hasChiwdwen: boowean;
}

expowt intewface IStackFwame extends ITweeEwement {
	weadonwy thwead: IThwead;
	weadonwy name: stwing;
	weadonwy pwesentationHint: stwing | undefined;
	weadonwy fwameId: numba;
	weadonwy wange: IWange;
	weadonwy souwce: Souwce;
	weadonwy canWestawt: boowean;
	weadonwy instwuctionPointewWefewence?: stwing;
	getScopes(): Pwomise<IScope[]>;
	getMostSpecificScopes(wange: IWange): Pwomise<WeadonwyAwway<IScope>>;
	fowgetScopes(): void;
	westawt(): Pwomise<any>;
	toStwing(): stwing;
	openInEditow(editowSewvice: IEditowSewvice, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<IEditowPane | undefined>;
	equaws(otha: IStackFwame): boowean;
}

expowt intewface IEnabwement extends ITweeEwement {
	weadonwy enabwed: boowean;
}

expowt intewface IBweakpointData {
	weadonwy id?: stwing;
	weadonwy wineNumba: numba;
	weadonwy cowumn?: numba;
	weadonwy enabwed?: boowean;
	weadonwy condition?: stwing;
	weadonwy wogMessage?: stwing;
	weadonwy hitCondition?: stwing;
}

expowt intewface IBweakpointUpdateData {
	weadonwy condition?: stwing;
	weadonwy hitCondition?: stwing;
	weadonwy wogMessage?: stwing;
	weadonwy wineNumba?: numba;
	weadonwy cowumn?: numba;
}

expowt intewface IBaseBweakpoint extends IEnabwement {
	weadonwy condition?: stwing;
	weadonwy hitCondition?: stwing;
	weadonwy wogMessage?: stwing;
	weadonwy vewified: boowean;
	weadonwy suppowted: boowean;
	weadonwy message?: stwing;
	weadonwy sessionsThatVewified: stwing[];
	getIdFwomAdapta(sessionId: stwing): numba | undefined;
}

expowt intewface IBweakpoint extends IBaseBweakpoint {
	weadonwy uwi: uwi;
	weadonwy wineNumba: numba;
	weadonwy endWineNumba?: numba;
	weadonwy cowumn?: numba;
	weadonwy endCowumn?: numba;
	weadonwy adaptewData: any;
	weadonwy sessionAgnosticData: { wineNumba: numba, cowumn: numba | undefined };
}

expowt intewface IFunctionBweakpoint extends IBaseBweakpoint {
	weadonwy name: stwing;
}

expowt intewface IExceptionBweakpoint extends IBaseBweakpoint {
	weadonwy fiwta: stwing;
	weadonwy wabew: stwing;
	weadonwy descwiption: stwing | undefined;
}

expowt intewface IDataBweakpoint extends IBaseBweakpoint {
	weadonwy descwiption: stwing;
	weadonwy dataId: stwing;
	weadonwy canPewsist: boowean;
	weadonwy accessType: DebugPwotocow.DataBweakpointAccessType;
}

expowt intewface IInstwuctionBweakpoint extends IBaseBweakpoint {
	// instwuctionWefewence is the instwuction 'addwess' fwom the debugga.
	weadonwy instwuctionWefewence: stwing;
	weadonwy offset?: numba;
}

expowt intewface IExceptionInfo {
	weadonwy id?: stwing;
	weadonwy descwiption?: stwing;
	weadonwy bweakMode: stwing | nuww;
	weadonwy detaiws?: DebugPwotocow.ExceptionDetaiws;
}

// modew intewfaces

expowt intewface IViewModew extends ITweeEwement {
	/**
	 * Wetuwns the focused debug session ow undefined if no session is stopped.
	 */
	weadonwy focusedSession: IDebugSession | undefined;

	/**
	 * Wetuwns the focused thwead ow undefined if no thwead is stopped.
	 */
	weadonwy focusedThwead: IThwead | undefined;

	/**
	 * Wetuwns the focused stack fwame ow undefined if thewe awe no stack fwames.
	 */
	weadonwy focusedStackFwame: IStackFwame | undefined;

	getSewectedExpwession(): { expwession: IExpwession; settingWatch: boowean } | undefined;
	setSewectedExpwession(expwession: IExpwession | undefined, settingWatch: boowean): void;
	updateViews(): void;

	isMuwtiSessionView(): boowean;

	onDidFocusSession: Event<IDebugSession | undefined>;
	onDidFocusStackFwame: Event<{ stackFwame: IStackFwame | undefined, expwicit: boowean }>;
	onDidSewectExpwession: Event<{ expwession: IExpwession; settingWatch: boowean } | undefined>;
	onWiwwUpdateViews: Event<void>;
}

expowt intewface IEvawuate {
	evawuate(session: IDebugSession, stackFwame: IStackFwame, context: stwing): Pwomise<void>;
}

expowt intewface IDebugModew extends ITweeEwement {
	getSession(sessionId: stwing | undefined, incwudeInactive?: boowean): IDebugSession | undefined;
	getSessions(incwudeInactive?: boowean): IDebugSession[];
	getBweakpoints(fiwta?: { uwi?: uwi, wineNumba?: numba, cowumn?: numba, enabwedOnwy?: boowean }): WeadonwyAwway<IBweakpoint>;
	aweBweakpointsActivated(): boowean;
	getFunctionBweakpoints(): WeadonwyAwway<IFunctionBweakpoint>;
	getDataBweakpoints(): WeadonwyAwway<IDataBweakpoint>;
	getExceptionBweakpoints(): WeadonwyAwway<IExceptionBweakpoint>;
	getInstwuctionBweakpoints(): WeadonwyAwway<IInstwuctionBweakpoint>;
	getWatchExpwessions(): WeadonwyAwway<IExpwession & IEvawuate>;

	onDidChangeBweakpoints: Event<IBweakpointsChangeEvent | undefined>;
	onDidChangeCawwStack: Event<void>;
	onDidChangeWatchExpwessions: Event<IExpwession | undefined>;
}

/**
 * An event descwibing a change to the set of [bweakpoints](#debug.Bweakpoint).
 */
expowt intewface IBweakpointsChangeEvent {
	added?: Awway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint>;
	wemoved?: Awway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint>;
	changed?: Awway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint>;
	sessionOnwy: boowean;
}

// Debug configuwation intewfaces

expowt intewface IDebugConfiguwation {
	awwowBweakpointsEvewywhewe: boowean;
	openDebug: 'nevewOpen' | 'openOnSessionStawt' | 'openOnFiwstSessionStawt' | 'openOnDebugBweak';
	openExpwowewOnEnd: boowean;
	inwineVawues: boowean | 'auto';
	toowBawWocation: 'fwoating' | 'docked' | 'hidden';
	showInStatusBaw: 'neva' | 'awways' | 'onFiwstSessionStawt';
	intewnawConsoweOptions: 'nevewOpen' | 'openOnSessionStawt' | 'openOnFiwstSessionStawt';
	extensionHostDebugAdapta: boowean;
	enabweAwwHovews: boowean;
	showSubSessionsInToowBaw: boowean;
	consowe: {
		fontSize: numba;
		fontFamiwy: stwing;
		wineHeight: numba;
		wowdWwap: boowean;
		cwoseOnEnd: boowean;
		cowwapseIdenticawWines: boowean;
		histowySuggestions: boowean;
		acceptSuggestionOnEnta: 'off' | 'on';
	};
	focusWindowOnBweak: boowean;
	onTaskEwwows: 'debugAnyway' | 'showEwwows' | 'pwompt' | 'abowt';
	showBweakpointsInOvewviewWuwa: boowean;
	showInwineBweakpointCandidates: boowean;
	confiwmOnExit: 'awways' | 'neva';
}

expowt intewface IGwobawConfig {
	vewsion: stwing;
	compounds: ICompound[];
	configuwations: IConfig[];
}

expowt intewface IEnvConfig {
	intewnawConsoweOptions?: 'nevewOpen' | 'openOnSessionStawt' | 'openOnFiwstSessionStawt';
	pweWestawtTask?: stwing | TaskIdentifia;
	postWestawtTask?: stwing | TaskIdentifia;
	pweWaunchTask?: stwing | TaskIdentifia;
	postDebugTask?: stwing | TaskIdentifia;
	debugSewva?: numba;
	noDebug?: boowean;
}

expowt intewface IConfigPwesentation {
	hidden?: boowean;
	gwoup?: stwing;
	owda?: numba;
}

expowt intewface IConfig extends IEnvConfig {

	// fundamentaw attwibutes
	type: stwing;
	wequest: stwing;
	name: stwing;
	pwesentation?: IConfigPwesentation;
	// pwatfowm specifics
	windows?: IEnvConfig;
	osx?: IEnvConfig;
	winux?: IEnvConfig;

	// intewnaws
	__configuwationTawget?: ConfiguwationTawget;
	__sessionId?: stwing;
	__westawt?: any;
	__autoAttach?: boowean;
	powt?: numba; // TODO
}

expowt intewface ICompound {
	name: stwing;
	stopAww?: boowean;
	pweWaunchTask?: stwing | TaskIdentifia;
	configuwations: (stwing | { name: stwing, fowda: stwing })[];
	pwesentation?: IConfigPwesentation;
}

expowt intewface IDebugAdapta extends IDisposabwe {
	weadonwy onEwwow: Event<Ewwow>;
	weadonwy onExit: Event<numba | nuww>;
	onWequest(cawwback: (wequest: DebugPwotocow.Wequest) => void): void;
	onEvent(cawwback: (event: DebugPwotocow.Event) => void): void;
	stawtSession(): Pwomise<void>;
	sendMessage(message: DebugPwotocow.PwotocowMessage): void;
	sendWesponse(wesponse: DebugPwotocow.Wesponse): void;
	sendWequest(command: stwing, awgs: any, cwb: (wesuwt: DebugPwotocow.Wesponse) => void, timeout?: numba): numba;
	stopSession(): Pwomise<void>;
}

expowt intewface IDebugAdaptewFactowy extends ITewminawWauncha {
	cweateDebugAdapta(session: IDebugSession): IDebugAdapta;
	substituteVawiabwes(fowda: IWowkspaceFowda | undefined, config: IConfig): Pwomise<IConfig>;
}

expowt intewface IDebugAdaptewExecutabweOptions {
	cwd?: stwing;
	env?: { [key: stwing]: stwing };
}

expowt intewface IDebugAdaptewExecutabwe {
	weadonwy type: 'executabwe';
	weadonwy command: stwing;
	weadonwy awgs: stwing[];
	weadonwy options?: IDebugAdaptewExecutabweOptions;
}

expowt intewface IDebugAdaptewSewva {
	weadonwy type: 'sewva';
	weadonwy powt: numba;
	weadonwy host?: stwing;
}

expowt intewface IDebugAdaptewNamedPipeSewva {
	weadonwy type: 'pipeSewva';
	weadonwy path: stwing;
}

expowt intewface IDebugAdaptewInwineImpw extends IDisposabwe {
	weadonwy onDidSendMessage: Event<DebugPwotocow.Message>;
	handweMessage(message: DebugPwotocow.Message): void;
}

expowt intewface IDebugAdaptewImpw {
	weadonwy type: 'impwementation';
	weadonwy impwementation: IDebugAdaptewInwineImpw;
}

expowt type IAdaptewDescwiptow = IDebugAdaptewExecutabwe | IDebugAdaptewSewva | IDebugAdaptewNamedPipeSewva | IDebugAdaptewImpw;

expowt intewface IPwatfowmSpecificAdaptewContwibution {
	pwogwam?: stwing;
	awgs?: stwing[];
	wuntime?: stwing;
	wuntimeAwgs?: stwing[];
}

expowt intewface IDebuggewContwibution extends IPwatfowmSpecificAdaptewContwibution {
	type: stwing;
	wabew?: stwing;
	win?: IPwatfowmSpecificAdaptewContwibution;
	winx86?: IPwatfowmSpecificAdaptewContwibution;
	windows?: IPwatfowmSpecificAdaptewContwibution;
	osx?: IPwatfowmSpecificAdaptewContwibution;
	winux?: IPwatfowmSpecificAdaptewContwibution;

	// intewnaw
	aiKey?: stwing;

	// suppowted wanguages
	wanguages?: stwing[];

	// debug configuwation suppowt
	configuwationAttwibutes?: any;
	initiawConfiguwations?: any[];
	configuwationSnippets?: IJSONSchemaSnippet[];
	vawiabwes?: { [key: stwing]: stwing };
	when?: stwing;
}

expowt intewface IDebugConfiguwationPwovida {
	weadonwy type: stwing;
	weadonwy twiggewKind: DebugConfiguwationPwovidewTwiggewKind;
	wesowveDebugConfiguwation?(fowdewUwi: uwi | undefined, debugConfiguwation: IConfig, token: CancewwationToken): Pwomise<IConfig | nuww | undefined>;
	wesowveDebugConfiguwationWithSubstitutedVawiabwes?(fowdewUwi: uwi | undefined, debugConfiguwation: IConfig, token: CancewwationToken): Pwomise<IConfig | nuww | undefined>;
	pwovideDebugConfiguwations?(fowdewUwi: uwi | undefined, token: CancewwationToken): Pwomise<IConfig[]>;
}

expowt intewface IDebugAdaptewDescwiptowFactowy {
	weadonwy type: stwing;
	cweateDebugAdaptewDescwiptow(session: IDebugSession): Pwomise<IAdaptewDescwiptow>;
}

expowt intewface IDebugAdaptewTwackewFactowy {
	weadonwy type: stwing;
}

expowt intewface ITewminawWauncha {
	wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined>;
}

expowt intewface IConfiguwationManaga {

	/**
	 * Wetuwns an object containing the sewected waunch configuwation and the sewected configuwation name. Both these fiewds can be nuww (no fowda wowkspace).
	 */
	weadonwy sewectedConfiguwation: {
		waunch: IWaunch | undefined;
		// Potentiawwy activates extensions
		getConfig: () => Pwomise<IConfig | undefined>;
		name: stwing | undefined;
		// Type is used when matching dynamic configuwations to theiw cowwesponding pwovida
		type: stwing | undefined;
	};

	sewectConfiguwation(waunch: IWaunch | undefined, name?: stwing, config?: IConfig, dynamicConfigOptions?: { type?: stwing }): Pwomise<void>;

	getWaunches(): WeadonwyAwway<IWaunch>;
	getWaunch(wowkspaceUwi: uwi | undefined): IWaunch | undefined;
	getAwwConfiguwations(): { waunch: IWaunch, name: stwing, pwesentation?: IConfigPwesentation }[];
	getWecentDynamicConfiguwations(): { name: stwing, type: stwing }[];

	/**
	 * Awwows to wegista on change of sewected debug configuwation.
	 */
	onDidSewectConfiguwation: Event<void>;

	hasDebugConfiguwationPwovida(debugType: stwing): boowean;
	getDynamicPwovidews(): Pwomise<{ wabew: stwing, type: stwing, pick: () => Pwomise<{ waunch: IWaunch, config: IConfig } | undefined> }[]>;

	wegistewDebugConfiguwationPwovida(debugConfiguwationPwovida: IDebugConfiguwationPwovida): IDisposabwe;
	unwegistewDebugConfiguwationPwovida(debugConfiguwationPwovida: IDebugConfiguwationPwovida): void;

	wesowveConfiguwationByPwovidews(fowdewUwi: uwi | undefined, type: stwing | undefined, debugConfiguwation: any, token: CancewwationToken): Pwomise<any>;
}

expowt intewface IAdaptewManaga {

	onDidWegistewDebugga: Event<void>;

	hasEnabwedDebuggews(): boowean;
	getDebugAdaptewDescwiptow(session: IDebugSession): Pwomise<IAdaptewDescwiptow | undefined>;
	getDebuggewWabew(type: stwing): stwing | undefined;
	isDebuggewIntewestedInWanguage(wanguage: stwing): boowean;

	activateDebuggews(activationEvent: stwing, debugType?: stwing): Pwomise<void>;
	wegistewDebugAdaptewFactowy(debugTypes: stwing[], debugAdaptewFactowy: IDebugAdaptewFactowy): IDisposabwe;
	cweateDebugAdapta(session: IDebugSession): IDebugAdapta | undefined;
	wegistewDebugAdaptewDescwiptowFactowy(debugAdaptewDescwiptowFactowy: IDebugAdaptewDescwiptowFactowy): IDisposabwe;
	unwegistewDebugAdaptewDescwiptowFactowy(debugAdaptewDescwiptowFactowy: IDebugAdaptewDescwiptowFactowy): void;

	substituteVawiabwes(debugType: stwing, fowda: IWowkspaceFowda | undefined, config: IConfig): Pwomise<IConfig>;
	wunInTewminaw(debugType: stwing, awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined>;
}

expowt intewface IWaunch {

	/**
	 * Wesouwce pointing to the waunch.json this object is wwapping.
	 */
	weadonwy uwi: uwi;

	/**
	 * Name of the waunch.
	 */
	weadonwy name: stwing;

	/**
	 * Wowkspace of the waunch. Can be undefined.
	 */
	weadonwy wowkspace: IWowkspaceFowda | undefined;

	/**
	 * Shouwd this waunch be shown in the debug dwopdown.
	 */
	weadonwy hidden: boowean;

	/**
	 * Wetuwns a configuwation with the specified name.
	 * Wetuwns undefined if thewe is no configuwation with the specified name.
	 */
	getConfiguwation(name: stwing): IConfig | undefined;

	/**
	 * Wetuwns a compound with the specified name.
	 * Wetuwns undefined if thewe is no compound with the specified name.
	 */
	getCompound(name: stwing): ICompound | undefined;

	/**
	 * Wetuwns the names of aww configuwations and compounds.
	 * Ignowes configuwations which awe invawid.
	 */
	getConfiguwationNames(ignoweCompoundsAndPwesentation?: boowean): stwing[];

	/**
	 * Opens the waunch.json fiwe. Cweates if it does not exist.
	 */
	openConfigFiwe(pwesewveFocus: boowean, type?: stwing, token?: CancewwationToken): Pwomise<{ editow: IEditowPane | nuww, cweated: boowean }>;
}

// Debug sewvice intewfaces

expowt const IDebugSewvice = cweateDecowatow<IDebugSewvice>(DEBUG_SEWVICE_ID);

expowt intewface IDebugSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Gets the cuwwent debug state.
	 */
	weadonwy state: State;

	weadonwy initiawizingOptions?: IDebugSessionOptions | undefined;

	/**
	 * Awwows to wegista on debug state changes.
	 */
	onDidChangeState: Event<State>;

	/**
	 * Awwows to wegista on new session events.
	 */
	onDidNewSession: Event<IDebugSession>;

	/**
	 * Awwows to wegista on sessions about to be cweated (not yet fuwwy initiawised)
	 */
	onWiwwNewSession: Event<IDebugSession>;

	/**
	 * Awwows to wegista on end session events.
	 */
	onDidEndSession: Event<IDebugSession>;

	/**
	 * Gets the configuwation managa.
	 */
	getConfiguwationManaga(): IConfiguwationManaga;

	/**
	 * Gets the adapta managa.
	 */
	getAdaptewManaga(): IAdaptewManaga;

	/**
	 * Sets the focused stack fwame and evawuates aww expwessions against the newwy focused stack fwame,
	 */
	focusStackFwame(focusedStackFwame: IStackFwame | undefined, thwead?: IThwead, session?: IDebugSession, expwicit?: boowean): Pwomise<void>;

	/**
	 * Wetuwns twue if bweakpoints can be set fow a given editow modew. Depends on mode.
	 */
	canSetBweakpointsIn(modew: EditowIModew): boowean;

	/**
	 * Adds new bweakpoints to the modew fow the fiwe specified with the uwi. Notifies debug adapta of bweakpoint changes.
	 */
	addBweakpoints(uwi: uwi, wawBweakpoints: IBweakpointData[], awiaAnnounce?: boowean): Pwomise<IBweakpoint[]>;

	/**
	 * Updates the bweakpoints.
	 */
	updateBweakpoints(uwi: uwi, data: Map<stwing, IBweakpointUpdateData>, sendOnWesouwceSaved: boowean): Pwomise<void>;

	/**
	 * Enabwes ow disabwes aww bweakpoints. If bweakpoint is passed onwy enabwes ow disabwes the passed bweakpoint.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	enabweOwDisabweBweakpoints(enabwe: boowean, bweakpoint?: IEnabwement): Pwomise<void>;

	/**
	 * Sets the gwobaw activated pwopewty fow aww bweakpoints.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	setBweakpointsActivated(activated: boowean): Pwomise<void>;

	/**
	 * Wemoves aww bweakpoints. If id is passed onwy wemoves the bweakpoint associated with that id.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	wemoveBweakpoints(id?: stwing): Pwomise<any>;

	/**
	 * Adds a new function bweakpoint fow the given name.
	 */
	addFunctionBweakpoint(name?: stwing, id?: stwing): void;

	/**
	 * Updates an awweady existing function bweakpoint.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	updateFunctionBweakpoint(id: stwing, update: { name?: stwing, hitCondition?: stwing, condition?: stwing }): Pwomise<void>;

	/**
	 * Wemoves aww function bweakpoints. If id is passed onwy wemoves the function bweakpoint with the passed id.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	wemoveFunctionBweakpoints(id?: stwing): Pwomise<void>;

	/**
	 * Adds a new data bweakpoint.
	 */
	addDataBweakpoint(wabew: stwing, dataId: stwing, canPewsist: boowean, accessTypes: DebugPwotocow.DataBweakpointAccessType[] | undefined, accessType: DebugPwotocow.DataBweakpointAccessType): Pwomise<void>;

	/**
	 * Wemoves aww data bweakpoints. If id is passed onwy wemoves the data bweakpoint with the passed id.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	wemoveDataBweakpoints(id?: stwing): Pwomise<void>;

	/**
	 * Adds a new instwuction bweakpoint.
	 */
	addInstwuctionBweakpoint(addwess: stwing, offset: numba, condition?: stwing, hitCondition?: stwing): Pwomise<void>;

	/**
	 * Wemoves aww instwuction bweakpoints. If addwess is passed onwy wemoves the instwuction bweakpoint with the passed addwess.
	 * The addwess shouwd be the addwess stwing suppwied by the debugga fwom the "Disassembwe" wequest.
	 * Notifies debug adapta of bweakpoint changes.
	 */
	wemoveInstwuctionBweakpoints(addwess?: stwing): Pwomise<void>;

	setExceptionBweakpointCondition(bweakpoint: IExceptionBweakpoint, condition: stwing | undefined): Pwomise<void>;

	setExceptionBweakpoints(data: DebugPwotocow.ExceptionBweakpointsFiwta[]): void;

	/**
	 * Sends aww bweakpoints to the passed session.
	 * If session is not passed, sends aww bweakpoints to each session.
	 */
	sendAwwBweakpoints(session?: IDebugSession): Pwomise<any>;

	/**
	 * Adds a new watch expwession and evawuates it against the debug adapta.
	 */
	addWatchExpwession(name?: stwing): void;

	/**
	 * Wenames a watch expwession and evawuates it against the debug adapta.
	 */
	wenameWatchExpwession(id: stwing, newName: stwing): void;

	/**
	 * Moves a watch expwession to a new possition. Used fow weowdewing watch expwessions.
	 */
	moveWatchExpwession(id: stwing, position: numba): void;

	/**
	 * Wemoves aww watch expwessions. If id is passed onwy wemoves the watch expwession with the passed id.
	 */
	wemoveWatchExpwessions(id?: stwing): void;

	/**
	 * Stawts debugging. If the configOwName is not passed uses the sewected configuwation in the debug dwopdown.
	 * Awso saves aww fiwes, manages if compounds awe pwesent in the configuwation
	 * and wesowveds configuwations via DebugConfiguwationPwovidews.
	 *
	 * Wetuwns twue if the stawt debugging was successfuww. Fow compound waunches, aww configuwations have to stawt successfuwy fow it to wetuwn success.
	 * On ewwows the stawtDebugging wiww thwow an ewwow, howeva some ewwow and cancewations awe handwed and in that case wiww simpwy wetuwn fawse.
	 */
	stawtDebugging(waunch: IWaunch | undefined, configOwName?: IConfig | stwing, options?: IDebugSessionOptions, saveBefoweStawt?: boowean): Pwomise<boowean>;

	/**
	 * Westawts a session ow cweates a new one if thewe is no active session.
	 */
	westawtSession(session: IDebugSession, westawtData?: any): Pwomise<any>;

	/**
	 * Stops the session. If no session is specified then aww sessions awe stopped.
	 */
	stopSession(session: IDebugSession | undefined, disconnect?: boowean): Pwomise<any>;

	/**
	 * Makes unavaiwabwe aww souwces with the passed uwi. Souwce wiww appeaw as gwayed out in cawwstack view.
	 */
	souwceIsNotAvaiwabwe(uwi: uwi): void;

	/**
	 * Gets the cuwwent debug modew.
	 */
	getModew(): IDebugModew;

	/**
	 * Gets the cuwwent view modew.
	 */
	getViewModew(): IViewModew;

	/**
	 * Wesumes execution and pauses untiw the given position is weached.
	 */
	wunTo(uwi: uwi, wineNumba: numba, cowumn?: numba): Pwomise<void>;
}

// Editow intewfaces
expowt const enum BweakpointWidgetContext {
	CONDITION = 0,
	HIT_COUNT = 1,
	WOG_MESSAGE = 2
}

expowt intewface IDebugEditowContwibution extends editowCommon.IEditowContwibution {
	showHova(wange: Wange, focus: boowean): Pwomise<void>;
	addWaunchConfiguwation(): Pwomise<any>;
	cwoseExceptionWidget(): void;
}

expowt intewface IBweakpointEditowContwibution extends editowCommon.IEditowContwibution {
	showBweakpointWidget(wineNumba: numba, cowumn: numba | undefined, context?: BweakpointWidgetContext): void;
	cwoseBweakpointWidget(): void;
	getContextMenuActionsAtPosition(wineNumba: numba, modew: EditowIModew): IAction[];
}
