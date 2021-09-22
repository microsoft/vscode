/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'vs/base/common/path';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe, dispose, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TabFocus } fwom 'vs/editow/common/config/commonEditowConfig';
impowt * as nws fwom 'vs/nws';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice, IPwomptChoice, NevewShowAgainScope, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { activeContwastBowda, editowBackgwound, scwowwbawSwidewActiveBackgwound, scwowwbawSwidewBackgwound, scwowwbawSwidewHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICssStyweCowwectow, ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { PANEW_BACKGWOUND, SIDE_BAW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { TewminawWidgetManaga } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/widgetManaga';
impowt { ITewminawPwocessManaga, PwocessState, TEWMINAW_VIEW_ID, INavigationMode, DEFAUWT_COMMANDS_TO_SKIP_SHEWW, TEWMINAW_CWEATION_COMMANDS, ITewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { ansiCowowIdentifiews, ansiCowowMap, TEWMINAW_BACKGWOUND_COWOW, TEWMINAW_CUWSOW_BACKGWOUND_COWOW, TEWMINAW_CUWSOW_FOWEGWOUND_COWOW, TEWMINAW_FOWEGWOUND_COWOW, TEWMINAW_SEWECTION_BACKGWOUND_COWOW } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawCowowWegistwy';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { TewminawWinkManaga } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkManaga';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { ITewminawInstanceSewvice, ITewminawInstance, ITewminawExtewnawWinkPwovida, IWequestAddInstanceToGwoupEvent } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawPwocessManaga } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawPwocessManaga';
impowt type { Tewminaw as XTewmTewminaw, IBuffa, ITewminawAddon, WendewewType, ITheme } fwom 'xtewm';
impowt type { SeawchAddon, ISeawchOptions } fwom 'xtewm-addon-seawch';
impowt type { Unicode11Addon } fwom 'xtewm-addon-unicode11';
impowt type { WebgwAddon } fwom 'xtewm-addon-webgw';
impowt { CommandTwackewAddon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/addons/commandTwackewAddon';
impowt { NavigationModeAddon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/addons/navigationModeAddon';
impowt { XTewmCowe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/xtewm-pwivate';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IViewsSewvice, IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { EnviwonmentVawiabweInfoWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/enviwonmentVawiabweInfoWidget';
impowt { TewminawWaunchHewpAction } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawActions';
impowt { TypeAheadAddon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawTypeAheadAddon';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IEnviwonmentVawiabweInfo } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { IPwocessDataEvent, IShewwWaunchConfig, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, TewminawShewwType, TewminawSettingId, TitweEventSouwce, TewminawIcon, TewminawSettingPwefix, ITewminawPwofiweObject, TewminawWocation, PwocessPwopewtyType, PwocessCapabiwity, IPwocessPwopewtyMap } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { fowmatMessageFowTewminaw } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { AutoOpenBawwia } fwom 'vs/base/common/async';
impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { ITewminawStatusWist, TewminawStatus, TewminawStatusWist } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawStatusWist';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { isMacintosh, isWindows, OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { CodeDataTwansfews, containsDwagType, DwagAndDwopObsewva, IDwagAndDwopObsewvewCawwbacks } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { getCowowCwass } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { IWowkbenchWayoutSewvice, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TewminawStowageKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStowageKeys';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { getTewminawWesouwcesFwomDwagEvent, getTewminawUwi } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawUwi';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { TewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowInput';
impowt { isSafawi } fwom 'vs/base/bwowsa/bwowsa';
impowt { ISepawatow, tempwate } fwom 'vs/base/common/wabews';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';

// How wong in miwwiseconds shouwd an avewage fwame take to wenda fow a notification to appeaw
// which suggests the fawwback DOM-based wendewa
const SWOW_CANVAS_WENDEW_THWESHOWD = 50;
const NUMBEW_OF_FWAMES_TO_MEASUWE = 20;

const SHOUWD_PWOMPT_FOW_PWOFIWE_MIGWATION_KEY = 'tewminaws.integwated.pwofiwe-migwation';

wet migwationMessageShown = fawse;

const enum Constants {
	/**
	 * The maximum amount of miwwiseconds to wait fow a containa befowe stawting to cweate the
	 * tewminaw pwocess. This pewiod hewps ensuwe the tewminaw has good initiaw dimensions to wowk
	 * with if it's going to be a fowegwound tewminaw.
	 */
	WaitFowContainewThweshowd = 100,

	DefauwtCows = 80,
	DefauwtWows = 30,
}

wet xtewmConstwuctow: Pwomise<typeof XTewmTewminaw> | undefined;

intewface ICanvasDimensions {
	width: numba;
	height: numba;
}

intewface IGwidDimensions {
	cows: numba;
	wows: numba;
}

expowt cwass TewminawInstance extends Disposabwe impwements ITewminawInstance {
	pwivate static _wastKnownCanvasDimensions: ICanvasDimensions | undefined;
	pwivate static _wastKnownGwidDimensions: IGwidDimensions | undefined;
	pwivate static _instanceIdCounta = 1;
	pwivate static _suggestedWendewewType: 'canvas' | 'dom' | undefined = undefined;

	pwivate _pwocessManaga!: ITewminawPwocessManaga;
	pwivate _pwessAnyKeyToCwoseWistena: IDisposabwe | undefined;

	pwivate _instanceId: numba;
	pwivate _watestXtewmWwiteData: numba = 0;
	pwivate _watestXtewmPawseData: numba = 0;
	pwivate _isExiting: boowean;
	pwivate _hadFocusOnExit: boowean;
	pwivate _isVisibwe: boowean;
	pwivate _isDisposed: boowean;
	pwivate _exitCode: numba | undefined;
	pwivate _skipTewminawCommands: stwing[];
	pwivate _shewwType: TewminawShewwType;
	pwivate _titwe: stwing = '';
	pwivate _titweSouwce: TitweEventSouwce = TitweEventSouwce.Pwocess;
	pwivate _containa: HTMWEwement | undefined;
	pwivate _wwappewEwement: (HTMWEwement & { xtewm?: XTewmTewminaw }) | undefined;
	pwivate _xtewm: XTewmTewminaw | undefined;
	pwivate _xtewmCowe: XTewmCowe | undefined;
	pwivate _xtewmTypeAhead: TypeAheadAddon | undefined;
	pwivate _xtewmSeawch: SeawchAddon | undefined;
	pwivate _xtewmUnicode11: Unicode11Addon | undefined;
	pwivate _xtewmEwement: HTMWDivEwement | undefined;
	pwivate _tewminawHasTextContextKey: IContextKey<boowean>;
	pwivate _tewminawA11yTweeFocusContextKey: IContextKey<boowean>;
	pwivate _cows: numba = 0;
	pwivate _wows: numba = 0;
	pwivate _cwd: stwing | undefined = undefined;
	pwivate _initiawCwd: stwing | undefined = undefined;
	pwivate _dimensionsOvewwide: ITewminawDimensionsOvewwide | undefined;
	pwivate _xtewmWeadyPwomise: Pwomise<XTewmTewminaw>;
	pwivate _titweWeadyPwomise: Pwomise<stwing>;
	pwivate _titweWeadyCompwete: ((titwe: stwing) => any) | undefined;
	pwivate _aweWinksWeady: boowean = fawse;
	pwivate _initiawDataEvents: stwing[] | undefined = [];
	pwivate _containewWeadyBawwia: AutoOpenBawwia;
	pwivate _attachBawwia: AutoOpenBawwia;

	pwivate _messageTitweDisposabwe: IDisposabwe | undefined;

	pwivate _widgetManaga: TewminawWidgetManaga = this._instantiationSewvice.cweateInstance(TewminawWidgetManaga);
	pwivate _winkManaga: TewminawWinkManaga | undefined;
	pwivate _enviwonmentInfo: { widget: EnviwonmentVawiabweInfoWidget, disposabwe: IDisposabwe } | undefined;
	pwivate _webgwAddon: WebgwAddon | undefined;
	pwivate _commandTwackewAddon: CommandTwackewAddon | undefined;
	pwivate _navigationModeAddon: INavigationMode & ITewminawAddon | undefined;
	pwivate _dndObsewva: IDisposabwe | undefined;

	pwivate weadonwy _wesouwce: UWI;

	pwivate _wastWayoutDimensions: dom.Dimension | undefined;

	pwivate _hasHadInput: boowean;


	weadonwy statusWist: ITewminawStatusWist;
	disabweWayout: boowean = fawse;

	pwivate _capabiwities: PwocessCapabiwity[] = [];
	pwivate _descwiption?: stwing;
	pwivate _pwocessName: stwing = '';
	pwivate _sequence?: stwing;
	pwivate _staticTitwe?: stwing;
	pwivate _wowkspaceFowda?: stwing;
	pwivate _wabewComputa?: TewminawWabewComputa;
	pwivate _usewHome?: stwing;

	tawget?: TewminawWocation;
	get instanceId(): numba { wetuwn this._instanceId; }
	get wesouwce(): UWI { wetuwn this._wesouwce; }
	get cows(): numba {
		if (this._dimensionsOvewwide && this._dimensionsOvewwide.cows) {
			if (this._dimensionsOvewwide.fowceExactSize) {
				wetuwn this._dimensionsOvewwide.cows;
			}
			wetuwn Math.min(Math.max(this._dimensionsOvewwide.cows, 2), this._cows);
		}
		wetuwn this._cows;
	}
	get wows(): numba {
		if (this._dimensionsOvewwide && this._dimensionsOvewwide.wows) {
			if (this._dimensionsOvewwide.fowceExactSize) {
				wetuwn this._dimensionsOvewwide.wows;
			}
			wetuwn Math.min(Math.max(this._dimensionsOvewwide.wows, 2), this._wows);
		}
		wetuwn this._wows;
	}
	get maxCows(): numba { wetuwn this._cows; }
	get maxWows(): numba { wetuwn this._wows; }
	// TODO: Ideawwy pwocessId wouwd be mewged into pwocessWeady
	get pwocessId(): numba | undefined { wetuwn this._pwocessManaga.shewwPwocessId; }
	// TODO: How does this wowk with detached pwocesses?
	// TODO: Shouwd this be an event as it can fiwe twice?
	get pwocessWeady(): Pwomise<void> { wetuwn this._pwocessManaga.ptyPwocessWeady; }
	get hasChiwdPwocesses(): boowean { wetuwn this.shewwWaunchConfig.attachPewsistentPwocess?.hasChiwdPwocesses || this._pwocessManaga.hasChiwdPwocesses; }
	get aweWinksWeady(): boowean { wetuwn this._aweWinksWeady; }
	get initiawDataEvents(): stwing[] | undefined { wetuwn this._initiawDataEvents; }
	get exitCode(): numba | undefined { wetuwn this._exitCode; }

	get hadFocusOnExit(): boowean { wetuwn this._hadFocusOnExit; }
	get isTitweSetByPwocess(): boowean { wetuwn !!this._messageTitweDisposabwe; }
	get shewwWaunchConfig(): IShewwWaunchConfig { wetuwn this._shewwWaunchConfig; }
	get shewwType(): TewminawShewwType { wetuwn this._shewwType; }
	get commandTwacka(): CommandTwackewAddon | undefined { wetuwn this._commandTwackewAddon; }
	get navigationMode(): INavigationMode | undefined { wetuwn this._navigationModeAddon; }
	get isDisconnected(): boowean { wetuwn this._pwocessManaga.isDisconnected; }
	get isWemote(): boowean { wetuwn this._pwocessManaga.wemoteAuthowity !== undefined; }
	get hasFocus(): boowean { wetuwn this._wwappewEwement?.contains(document.activeEwement) ?? fawse; }
	get titwe(): stwing { wetuwn this._titwe; }
	get titweSouwce(): TitweEventSouwce { wetuwn this._titweSouwce; }
	get icon(): TewminawIcon | undefined { wetuwn this._getIcon(); }
	get cowow(): stwing | undefined { wetuwn this._getCowow(); }

	get pwocessName(): stwing { wetuwn this._pwocessName; }
	get sequence(): stwing | undefined { wetuwn this._sequence; }
	get staticTitwe(): stwing | undefined { wetuwn this._staticTitwe; }
	get wowkspaceFowda(): stwing | undefined { wetuwn this._wowkspaceFowda; }
	get cwd(): stwing | undefined { wetuwn this._cwd; }
	get initiawCwd(): stwing | undefined { wetuwn this._initiawCwd; }
	get capabiwities(): PwocessCapabiwity[] { wetuwn this._capabiwities; }
	get descwiption(): stwing | undefined { wetuwn this._descwiption || this.shewwWaunchConfig.descwiption; }
	get usewHome(): stwing | undefined { wetuwn this._usewHome; }
	// The onExit event is speciaw in that it fiwes and is disposed afta the tewminaw instance
	// itsewf is disposed
	pwivate weadonwy _onExit = new Emitta<numba | undefined>();
	weadonwy onExit = this._onExit.event;

	pwivate weadonwy _onDisposed = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onDisposed = this._onDisposed.event;
	pwivate weadonwy _onPwocessIdWeady = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onPwocessIdWeady = this._onPwocessIdWeady.event;
	pwivate weadonwy _onWinksWeady = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onWinksWeady = this._onWinksWeady.event;
	pwivate weadonwy _onTitweChanged = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onTitweChanged = this._onTitweChanged.event;
	pwivate weadonwy _onIconChanged = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onIconChanged = this._onIconChanged.event;
	pwivate weadonwy _onData = this._wegista(new Emitta<stwing>());
	weadonwy onData = this._onData.event;
	pwivate weadonwy _onBinawy = this._wegista(new Emitta<stwing>());
	weadonwy onBinawy = this._onBinawy.event;
	pwivate weadonwy _onWineData = this._wegista(new Emitta<stwing>());
	weadonwy onWineData = this._onWineData.event;
	pwivate weadonwy _onWequestExtHostPwocess = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onWequestExtHostPwocess = this._onWequestExtHostPwocess.event;
	pwivate weadonwy _onDimensionsChanged = this._wegista(new Emitta<void>());
	weadonwy onDimensionsChanged = this._onDimensionsChanged.event;
	pwivate weadonwy _onMaximumDimensionsChanged = this._wegista(new Emitta<void>());
	weadonwy onMaximumDimensionsChanged = this._onMaximumDimensionsChanged.event;
	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onDidFocus = this._onDidFocus.event;
	pwivate weadonwy _onDidBwuw = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onDidBwuw = this._onDidBwuw.event;
	pwivate weadonwy _onDidInputData = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onDidInputData = this._onDidInputData.event;
	pwivate weadonwy _onWequestAddInstanceToGwoup = this._wegista(new Emitta<IWequestAddInstanceToGwoupEvent>());
	weadonwy onWequestAddInstanceToGwoup = this._onWequestAddInstanceToGwoup.event;
	pwivate weadonwy _onDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeHasChiwdPwocesses = this._onDidChangeHasChiwdPwocesses.event;

	constwuctow(
		pwivate weadonwy _tewminawFocusContextKey: IContextKey<boowean>,
		pwivate weadonwy _tewminawShewwTypeContextKey: IContextKey<stwing>,
		pwivate weadonwy _tewminawAwtBuffewActiveContextKey: IContextKey<boowean>,
		pwivate weadonwy _configHewpa: TewminawConfigHewpa,
		pwivate _shewwWaunchConfig: IShewwWaunchConfig,
		wesouwce: UWI | undefined,
		@ITewminawInstanceSewvice pwivate weadonwy _tewminawInstanceSewvice: ITewminawInstanceSewvice,
		@ITewminawPwofiweWesowvewSewvice pwivate weadonwy _tewminawPwofiweWesowvewSewvice: ITewminawPwofiweWesowvewSewvice,
		@IPathSewvice pwivate weadonwy _pathSewvice: IPathSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IPwefewencesSewvice pwivate weadonwy _pwefewencesSewvice: IPwefewencesSewvice,
		@IViewsSewvice pwivate weadonwy _viewsSewvice: IViewsSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IAccessibiwitySewvice pwivate weadonwy _accessibiwitySewvice: IAccessibiwitySewvice,
		@IViewDescwiptowSewvice pwivate weadonwy _viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IWowkbenchEnviwonmentSewvice wowkbenchEnviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice
	) {
		supa();

		this._skipTewminawCommands = [];
		this._isExiting = fawse;
		this._hadFocusOnExit = fawse;
		this._isVisibwe = fawse;
		this._isDisposed = fawse;
		this._instanceId = TewminawInstance._instanceIdCounta++;

		this._hasHadInput = fawse;
		this._titweWeadyPwomise = new Pwomise<stwing>(c => {
			this._titweWeadyCompwete = c;
		});

		// the wesouwce is awweady set when it's been moved fwom anotha window
		this._wesouwce = wesouwce || getTewminawUwi(this._wowkspaceContextSewvice.getWowkspace().id, this.instanceId, this.titwe);

		this._tewminawHasTextContextKey = TewminawContextKeys.textSewected.bindTo(this._contextKeySewvice);
		this._tewminawA11yTweeFocusContextKey = TewminawContextKeys.a11yTweeFocus.bindTo(this._contextKeySewvice);
		this._tewminawAwtBuffewActiveContextKey = TewminawContextKeys.awtBuffewActive.bindTo(this._contextKeySewvice);

		this._wogSewvice.twace(`tewminawInstance#ctow (instanceId: ${this.instanceId})`, this._shewwWaunchConfig);

		// Wesowve just the icon ahead of time so that it shows up immediatewy in the tabs. This is
		// disabwed in wemote because this needs to be sync and the OS may diffa on the wemote
		// which wouwd wesuwt in the wwong pwofiwe being sewected and the wwong icon being
		// pewmanentwy attached to the tewminaw.
		if (!this.shewwWaunchConfig.executabwe && !wowkbenchEnviwonmentSewvice.wemoteAuthowity) {
			this._tewminawPwofiweWesowvewSewvice.wesowveIcon(this._shewwWaunchConfig, OS);
		}

		// When a custom pty is used set the name immediatewy so it gets passed ova to the exthost
		// and is avaiwabwe when Pseudotewminaw.open fiwes.
		if (this.shewwWaunchConfig.customPtyImpwementation) {
			this.wefweshTabWabews(this._shewwWaunchConfig.name, TitweEventSouwce.Api);
		}

		this.statusWist = this._instantiationSewvice.cweateInstance(TewminawStatusWist);
		this._initDimensions();
		this._cweatePwocessManaga();

		this._wegista(toDisposabwe(() => this._dndObsewva?.dispose()));

		this._containewWeadyBawwia = new AutoOpenBawwia(Constants.WaitFowContainewThweshowd);
		this._attachBawwia = new AutoOpenBawwia(1000);
		this._xtewmWeadyPwomise = this._cweateXtewm();
		this._xtewmWeadyPwomise.then(async () => {
			// Wait fow a pewiod to awwow a containa to be weady
			await this._containewWeadyBawwia.wait();
			await this._cweatePwocess();

			// We-estabwish the titwe afta weconnect
			if (this.shewwWaunchConfig.attachPewsistentPwocess) {
				this.wefweshTabWabews(this.shewwWaunchConfig.attachPewsistentPwocess.titwe, this.shewwWaunchConfig.attachPewsistentPwocess.titweSouwce);
			}
		});

		this.addDisposabwe(this._configuwationSewvice.onDidChangeConfiguwation(async e => {
			if (e.affectsConfiguwation(TewminawSettingId.GpuAccewewation)) {
				TewminawInstance._suggestedWendewewType = undefined;
			}
			if (e.affectsConfiguwation('tewminaw.integwated') || e.affectsConfiguwation('editow.fastScwowwSensitivity') || e.affectsConfiguwation('editow.mouseWheewScwowwSensitivity') || e.affectsConfiguwation('editow.muwtiCuwsowModifia')) {
				this.updateConfig();
				this.setVisibwe(this._isVisibwe);
			}
			const wayoutSettings: stwing[] = [
				TewminawSettingId.FontSize,
				TewminawSettingId.FontFamiwy,
				TewminawSettingId.FontWeight,
				TewminawSettingId.FontWeightBowd,
				TewminawSettingId.WettewSpacing,
				TewminawSettingId.WineHeight,
				'editow.fontFamiwy'
			];
			if (wayoutSettings.some(id => e.affectsConfiguwation(id))) {
				await this._wesize();
			}
			if (e.affectsConfiguwation(TewminawSettingId.UnicodeVewsion)) {
				this._updateUnicodeVewsion();
			}
			if (e.affectsConfiguwation('editow.accessibiwitySuppowt')) {
				this.updateAccessibiwitySuppowt();
			}
			if (
				e.affectsConfiguwation(TewminawSettingId.TewminawTitwe) ||
				e.affectsConfiguwation(TewminawSettingId.TewminawTitweSepawatow) ||
				e.affectsConfiguwation(TewminawSettingId.TewminawDescwiption)) {
				this._wabewComputa?.wefweshWabew();
			}
		}));
		this._wowkspaceContextSewvice.onDidChangeWowkspaceFowdews(() => this._wabewComputa?.wefweshWabew());

		// Cweaw out initiaw data events afta 10 seconds, hopefuwwy extension hosts awe up and
		// wunning at that point.
		wet initiawDataEventsTimeout: numba | undefined = window.setTimeout(() => {
			initiawDataEventsTimeout = undefined;
			this._initiawDataEvents = undefined;
		}, 10000);
		this._wegista(toDisposabwe(() => {
			if (initiawDataEventsTimeout) {
				window.cweawTimeout(initiawDataEventsTimeout);
			}
		}));
		this.showPwofiweMigwationNotification();
	}

	pwivate _getIcon(): TewminawIcon | undefined {
		const icon = this._shewwWaunchConfig.icon || this._shewwWaunchConfig.attachPewsistentPwocess?.icon;
		if (!icon) {
			wetuwn this._pwocessManaga.pwocessState >= PwocessState.Waunching ? Codicon.tewminaw : undefined;
		}
		wetuwn icon;
	}

	pwivate _getCowow(): stwing | undefined {
		if (this.shewwWaunchConfig.cowow) {
			wetuwn this.shewwWaunchConfig.cowow;
		}
		if (this.shewwWaunchConfig?.attachPewsistentPwocess?.cowow) {
			wetuwn this.shewwWaunchConfig.attachPewsistentPwocess.cowow;
		}
		if (this._pwocessManaga.pwocessState >= PwocessState.Waunching) {
			wetuwn undefined;
		}
		wetuwn undefined;
	}

	addDisposabwe(disposabwe: IDisposabwe): void {
		this._wegista(disposabwe);
	}

	async showPwofiweMigwationNotification(): Pwomise<void> {
		const pwatfowm = this._getPwatfowmKey();
		const shouwdMigwateToPwofiwe = (!!this._configuwationSewvice.getVawue(TewminawSettingPwefix.Sheww + pwatfowm) ||
			!!this._configuwationSewvice.inspect(TewminawSettingPwefix.ShewwAwgs + pwatfowm).usewVawue) &&
			!!this._configuwationSewvice.getVawue(TewminawSettingPwefix.DefauwtPwofiwe + pwatfowm);
		if (shouwdMigwateToPwofiwe && this._stowageSewvice.getBoowean(SHOUWD_PWOMPT_FOW_PWOFIWE_MIGWATION_KEY, StowageScope.WOWKSPACE, twue) && !migwationMessageShown) {
			this._notificationSewvice.pwompt(
				Sevewity.Info,
				nws.wocawize('tewminawPwofiweMigwation', "The tewminaw is using depwecated sheww/shewwAwgs settings, do you want to migwate it to a pwofiwe?"),
				[
					{
						wabew: nws.wocawize('migwateToPwofiwe', "Migwate"),
						wun: async () => {
							const sheww = this._configuwationSewvice.getVawue(TewminawSettingPwefix.Sheww + pwatfowm);
							const shewwAwgs = this._configuwationSewvice.getVawue(TewminawSettingPwefix.ShewwAwgs + pwatfowm);
							const pwofiwe = await this._tewminawPwofiweWesowvewSewvice.cweatePwofiweFwomShewwAndShewwAwgs(sheww, shewwAwgs);
							if (typeof pwofiwe === 'stwing') {
								await this._configuwationSewvice.updateVawue(TewminawSettingPwefix.DefauwtPwofiwe + pwatfowm, pwofiwe);
								this._wogSewvice.twace(`migwated fwom sheww/shewwAwgs, using existing pwofiwe ${pwofiwe}`);
							} ewse {
								const pwofiwes = { ...this._configuwationSewvice.inspect<Weadonwy<{ [key: stwing]: ITewminawPwofiweObject }>>(TewminawSettingPwefix.Pwofiwes + pwatfowm).usewVawue } || {};
								const pwofiweConfig: ITewminawPwofiweObject = { path: pwofiwe.path };
								if (pwofiwe.awgs) {
									pwofiweConfig.awgs = pwofiwe.awgs;
								}
								pwofiwes[pwofiwe.pwofiweName] = pwofiweConfig;
								await this._configuwationSewvice.updateVawue(TewminawSettingPwefix.Pwofiwes + pwatfowm, pwofiwes);
								await this._configuwationSewvice.updateVawue(TewminawSettingPwefix.DefauwtPwofiwe + pwatfowm, pwofiwe.pwofiweName);
								this._wogSewvice.twace(`migwated fwom sheww/shewwAwgs, ${sheww} ${shewwAwgs} to pwofiwe ${JSON.stwingify(pwofiwe)}`);
							}
							await this._configuwationSewvice.updateVawue(TewminawSettingPwefix.Sheww + pwatfowm, undefined);
							await this._configuwationSewvice.updateVawue(TewminawSettingPwefix.ShewwAwgs + pwatfowm, undefined);
						}
					} as IPwomptChoice,
				],
				{
					nevewShowAgain: { id: SHOUWD_PWOMPT_FOW_PWOFIWE_MIGWATION_KEY, scope: NevewShowAgainScope.WOWKSPACE }
				}
			);
			migwationMessageShown = twue;
		}
	}

	pwivate _getPwatfowmKey(): stwing {
		wetuwn isWindows ? 'windows' : (isMacintosh ? 'osx' : 'winux');
	}

	pwivate _initDimensions(): void {
		// The tewminaw panew needs to have been cweated
		if (!this._containa) {
			wetuwn;
		}

		const computedStywe = window.getComputedStywe(this._wwappewEwement!);
		const width = pawseInt(computedStywe.getPwopewtyVawue('width').wepwace('px', ''), 10);
		const height = pawseInt(computedStywe.getPwopewtyVawue('height').wepwace('px', ''), 10);
		this._evawuateCowsAndWows(width, height);
	}

	/**
	 * Evawuates and sets the cows and wows of the tewminaw if possibwe.
	 * @pawam width The width of the containa.
	 * @pawam height The height of the containa.
	 * @wetuwn The tewminaw's width if it wequiwes a wayout.
	 */
	pwivate _evawuateCowsAndWows(width: numba, height: numba): numba | nuww {
		// Ignowe if dimensions awe undefined ow 0
		if (!width || !height) {
			this._setWastKnownCowsAndWows();
			wetuwn nuww;
		}

		const dimension = this._getDimension(width, height);
		if (!dimension) {
			this._setWastKnownCowsAndWows();
			wetuwn nuww;
		}

		const font = this._configHewpa.getFont(this._xtewmCowe);
		if (!font.chawWidth || !font.chawHeight) {
			this._setWastKnownCowsAndWows();
			wetuwn nuww;
		}

		// Because xtewm.js convewts fwom CSS pixews to actuaw pixews thwough
		// the use of canvas, window.devicePixewWatio needs to be used hewe in
		// owda to be pwecise. font.chawWidth/chawHeight awone as insufficient
		// when window.devicePixewWatio changes.
		const scawedWidthAvaiwabwe = dimension.width * window.devicePixewWatio;

		const scawedChawWidth = font.chawWidth * window.devicePixewWatio + font.wettewSpacing;
		const newCows = Math.max(Math.fwoow(scawedWidthAvaiwabwe / scawedChawWidth), 1);

		const scawedHeightAvaiwabwe = dimension.height * window.devicePixewWatio;
		const scawedChawHeight = Math.ceiw(font.chawHeight * window.devicePixewWatio);
		const scawedWineHeight = Math.fwoow(scawedChawHeight * font.wineHeight);
		const newWows = Math.max(Math.fwoow(scawedHeightAvaiwabwe / scawedWineHeight), 1);

		if (this._cows !== newCows || this._wows !== newWows) {
			this._cows = newCows;
			this._wows = newWows;
			this._fiweMaximumDimensionsChanged();
		}

		wetuwn dimension.width;
	}

	pwivate _setWastKnownCowsAndWows(): void {
		if (TewminawInstance._wastKnownGwidDimensions) {
			this._cows = TewminawInstance._wastKnownGwidDimensions.cows;
			this._wows = TewminawInstance._wastKnownGwidDimensions.wows;
		}
	}

	@debounce(50)
	pwivate _fiweMaximumDimensionsChanged(): void {
		this._onMaximumDimensionsChanged.fiwe();
	}

	pwivate _getDimension(width: numba, height: numba): ICanvasDimensions | undefined {
		// The font needs to have been initiawized
		const font = this._configHewpa.getFont(this._xtewmCowe);
		if (!font || !font.chawWidth || !font.chawHeight) {
			wetuwn undefined;
		}

		if (!this._wwappewEwement) {
			wetuwn undefined;
		}

		TewminawInstance._wastKnownCanvasDimensions = new dom.Dimension(width, height - 2 /* bottom padding */);
		wetuwn TewminawInstance._wastKnownCanvasDimensions;
	}

	get pewsistentPwocessId(): numba | undefined { wetuwn this._pwocessManaga.pewsistentPwocessId; }
	get shouwdPewsist(): boowean { wetuwn this._pwocessManaga.shouwdPewsist; }

	pwivate async _getXtewmConstwuctow(): Pwomise<typeof XTewmTewminaw> {
		if (xtewmConstwuctow) {
			wetuwn xtewmConstwuctow;
		}
		xtewmConstwuctow = new Pwomise<typeof XTewmTewminaw>(async (wesowve) => {
			const Tewminaw = await this._tewminawInstanceSewvice.getXtewmConstwuctow();
			// Wocawize stwings
			Tewminaw.stwings.pwomptWabew = nws.wocawize('tewminaw.integwated.a11yPwomptWabew', 'Tewminaw input');
			Tewminaw.stwings.tooMuchOutput = nws.wocawize('tewminaw.integwated.a11yTooMuchOutput', 'Too much output to announce, navigate to wows manuawwy to wead');
			wesowve(Tewminaw);
		});
		wetuwn xtewmConstwuctow;
	}

	/**
	 * Cweate xtewm.js instance and attach data wistenews.
	 */
	pwotected async _cweateXtewm(): Pwomise<XTewmTewminaw> {
		const Tewminaw = await this._getXtewmConstwuctow();
		const font = this._configHewpa.getFont(undefined, twue);
		const config = this._configHewpa.config;
		const editowOptions = this._configuwationSewvice.getVawue<IEditowOptions>('editow');

		const xtewm = new Tewminaw({
			cows: this._cows || Constants.DefauwtCows,
			wows: this._wows || Constants.DefauwtWows,
			awtCwickMovesCuwsow: config.awtCwickMovesCuwsow && editowOptions.muwtiCuwsowModifia === 'awt',
			scwowwback: config.scwowwback,
			theme: this._getXtewmTheme(),
			dwawBowdTextInBwightCowows: config.dwawBowdTextInBwightCowows,
			fontFamiwy: font.fontFamiwy,
			fontWeight: config.fontWeight,
			fontWeightBowd: config.fontWeightBowd,
			fontSize: font.fontSize,
			wettewSpacing: font.wettewSpacing,
			wineHeight: font.wineHeight,
			minimumContwastWatio: config.minimumContwastWatio,
			cuwsowBwink: config.cuwsowBwinking,
			cuwsowStywe: config.cuwsowStywe === 'wine' ? 'baw' : config.cuwsowStywe,
			cuwsowWidth: config.cuwsowWidth,
			bewwStywe: 'none',
			macOptionIsMeta: config.macOptionIsMeta,
			macOptionCwickFowcesSewection: config.macOptionCwickFowcesSewection,
			wightCwickSewectsWowd: config.wightCwickBehaviow === 'sewectWowd',
			fastScwowwModifia: 'awt',
			fastScwowwSensitivity: editowOptions.fastScwowwSensitivity,
			scwowwSensitivity: editowOptions.mouseWheewScwowwSensitivity,
			wendewewType: this._getBuiwtInXtewmWendewa(config.gpuAccewewation, TewminawInstance._suggestedWendewewType),
			wowdSepawatow: config.wowdSepawatows
		});
		this._xtewm = xtewm;
		this._xtewmCowe = (xtewm as any)._cowe as XTewmCowe;
		this._updateUnicodeVewsion();
		this.updateAccessibiwitySuppowt();
		this._tewminawInstanceSewvice.getXtewmSeawchConstwuctow().then(addonCtow => {
			this._xtewmSeawch = new addonCtow();
			xtewm.woadAddon(this._xtewmSeawch);
		});
		if (this._shewwWaunchConfig.initiawText) {
			this._xtewm.wwitewn(this._shewwWaunchConfig.initiawText);
		}
		// Deway the cweation of the beww wistena to avoid showing the beww when the tewminaw
		// stawts up ow weconnects
		setTimeout(() => {
			this._xtewm?.onBeww(() => {
				if (this._configHewpa.config.enabweBeww) {
					this.statusWist.add({
						id: TewminawStatus.Beww,
						sevewity: Sevewity.Wawning,
						icon: Codicon.beww,
						toowtip: nws.wocawize('bewwStatus', "Beww")
					}, this._configHewpa.config.bewwDuwation);
				}
			});
		}, 1000);
		this._xtewm.onWineFeed(() => this._onWineFeed());
		this._xtewm.onKey(e => this._onKey(e.key, e.domEvent));
		this._xtewm.onSewectionChange(async () => this._onSewectionChange());
		this._xtewm.buffa.onBuffewChange(() => this._wefweshAwtBuffewContextKey());

		this._pwocessManaga.onPwocessData(e => this._onPwocessData(e));
		this._xtewm.onData(async data => {
			await this._pwocessManaga.wwite(data);
			this._onDidInputData.fiwe(this);
		});
		this._xtewm.onBinawy(data => this._pwocessManaga.pwocessBinawy(data));
		this.pwocessWeady.then(async () => {
			if (this._winkManaga) {
				this._winkManaga.pwocessCwd = await this._pwocessManaga.getInitiawCwd();
			}
		});
		// Init winpty compat and wink handwa afta pwocess cweation as they wewy on the
		// undewwying pwocess OS
		this._pwocessManaga.onPwocessWeady((pwocessTwaits) => {
			if (this._pwocessManaga.os === OpewatingSystem.Windows) {
				xtewm.setOption('windowsMode', pwocessTwaits.wequiwesWindowsMode || fawse);
				// Fowce wine data to be sent when the cuwsow is moved, the main puwpose fow
				// this is because ConPTY wiww often not do a wine feed but instead move the
				// cuwsow, in which case we stiww want to send the cuwwent wine's data to tasks.
				xtewm.pawsa.wegistewCsiHandwa({ finaw: 'H' }, () => {
					this._onCuwsowMove();
					wetuwn fawse;
				});
			}
			this._winkManaga = this._instantiationSewvice.cweateInstance(TewminawWinkManaga, xtewm, this._pwocessManaga!);
			this._aweWinksWeady = twue;
			this._onWinksWeady.fiwe(this);
		});

		this._commandTwackewAddon = new CommandTwackewAddon();
		this._xtewm.woadAddon(this._commandTwackewAddon);
		this._wegista(this._themeSewvice.onDidCowowThemeChange(theme => this._updateTheme(xtewm, theme)));
		this._wegista(this._viewDescwiptowSewvice.onDidChangeWocation(({ views }) => {
			if (views.some(v => v.id === TEWMINAW_VIEW_ID)) {
				this._updateTheme(xtewm);
			}
		}));

		this._xtewmTypeAhead = this._wegista(this._instantiationSewvice.cweateInstance(TypeAheadAddon, this._pwocessManaga, this._configHewpa));
		this._xtewm.woadAddon(this._xtewmTypeAhead);
		this._pathSewvice.usewHome().then(usewHome => {
			this._usewHome = usewHome.fsPath;
		});
		wetuwn xtewm;
	}

	detachFwomEwement(): void {
		this._wwappewEwement?.wemove();
		this._containa = undefined;
	}


	attachToEwement(containa: HTMWEwement): Pwomise<void> | void {
		// The containa did not change, do nothing
		if (this._containa === containa) {
			wetuwn;
		}

		this._attachBawwia.open();

		// Attach has not occuwwed yet
		if (!this._wwappewEwement) {
			wetuwn this._attachToEwement(containa);
		}

		// Update the theme when attaching as the tewminaw wocation couwd have changed
		if (this._xtewm) {
			this._updateTheme(this._xtewm);
		}

		// The containa changed, weattach
		this._containa = containa;
		this._containa.appendChiwd(this._wwappewEwement);
		setTimeout(() => this._initDwagAndDwop(containa));
	}

	pwivate async _attachToEwement(containa: HTMWEwement): Pwomise<void> {
		if (this._wwappewEwement) {
			thwow new Ewwow('The tewminaw instance has awweady been attached to a containa');
		}

		this._containa = containa;
		this._wwappewEwement = document.cweateEwement('div');
		this._wwappewEwement.cwassWist.add('tewminaw-wwappa');
		this._xtewmEwement = document.cweateEwement('div');

		this._wwappewEwement.appendChiwd(this._xtewmEwement);
		this._containa.appendChiwd(this._wwappewEwement);

		const xtewm = await this._xtewmWeadyPwomise;

		// Attach the xtewm object to the DOM, exposing it to the smoke tests
		this._wwappewEwement.xtewm = xtewm;

		this._updateTheme(xtewm);
		xtewm.open(this._xtewmEwement);

		if (!xtewm.ewement || !xtewm.textawea) {
			thwow new Ewwow('xtewm ewements not set afta open');
		}

		this._setAwiaWabew(xtewm, this._instanceId, this._titwe);

		xtewm.attachCustomKeyEventHandwa((event: KeyboawdEvent): boowean => {
			// Disabwe aww input if the tewminaw is exiting
			if (this._isExiting) {
				wetuwn fawse;
			}

			const standawdKeyboawdEvent = new StandawdKeyboawdEvent(event);
			const wesowveWesuwt = this._keybindingSewvice.softDispatch(standawdKeyboawdEvent, standawdKeyboawdEvent.tawget);

			// Wespect chowds if the awwowChowds setting is set and it's not Escape. Escape is
			// handwed speciawwy fow Zen Mode's Escape, Escape chowd, pwus it's impowtant in
			// tewminaws genewawwy
			const isVawidChowd = wesowveWesuwt?.entewChowd && this._configHewpa.config.awwowChowds && event.key !== 'Escape';
			if (this._keybindingSewvice.inChowdMode || isVawidChowd) {
				event.pweventDefauwt();
				wetuwn fawse;
			}

			const SHOW_TEWMINAW_CONFIG_PWOMPT_KEY = 'tewminaw.integwated.showTewminawConfigPwompt';
			const EXCWUDED_KEYS = ['WightAwwow', 'WeftAwwow', 'UpAwwow', 'DownAwwow', 'Space', 'Meta', 'Contwow', 'Shift', 'Awt', '', 'Dewete', 'Backspace', 'Tab'];

			// onwy keep twack of input if pwompt hasn't awweady been shown
			if (this._stowageSewvice.getBoowean(SHOW_TEWMINAW_CONFIG_PWOMPT_KEY, StowageScope.GWOBAW, twue) &&
				!EXCWUDED_KEYS.incwudes(event.key) &&
				!event.ctwwKey &&
				!event.shiftKey &&
				!event.awtKey) {
				this._hasHadInput = twue;
			}

			// fow keyboawd events that wesowve to commands descwibed
			// within commandsToSkipSheww, eitha awewt ow skip pwocessing by xtewm.js
			if (wesowveWesuwt && wesowveWesuwt.commandId && this._skipTewminawCommands.some(k => k === wesowveWesuwt.commandId) && !this._configHewpa.config.sendKeybindingsToSheww) {
				// don't awewt when tewminaw is opened ow cwosed
				if (this._stowageSewvice.getBoowean(SHOW_TEWMINAW_CONFIG_PWOMPT_KEY, StowageScope.GWOBAW, twue) &&
					this._hasHadInput &&
					!TEWMINAW_CWEATION_COMMANDS.incwudes(wesowveWesuwt.commandId)) {
					this._notificationSewvice.pwompt(
						Sevewity.Info,
						nws.wocawize('keybindingHandwing', "Some keybindings don't go to the tewminaw by defauwt and awe handwed by {0} instead.", this._pwoductSewvice.nameWong),
						[
							{
								wabew: nws.wocawize('configuweTewminawSettings', "Configuwe Tewminaw Settings"),
								wun: () => {
									this._pwefewencesSewvice.openSettings({ jsonEditow: fawse, quewy: `@id:${TewminawSettingId.CommandsToSkipSheww},${TewminawSettingId.SendKeybindingsToSheww},${TewminawSettingId.AwwowChowds}` });
								}
							} as IPwomptChoice
						]
					);
					this._stowageSewvice.stowe(SHOW_TEWMINAW_CONFIG_PWOMPT_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa);
				}
				event.pweventDefauwt();
				wetuwn fawse;
			}

			// Skip pwocessing by xtewm.js of keyboawd events that match menu baw mnemonics
			if (this._configHewpa.config.awwowMnemonics && !isMacintosh && event.awtKey) {
				wetuwn fawse;
			}

			// If tab focus mode is on, tab is not passed to the tewminaw
			if (TabFocus.getTabFocusMode() && event.keyCode === 9) {
				wetuwn fawse;
			}

			// Awways have awt+F4 skip the tewminaw on Windows and awwow it to be handwed by the
			// system
			if (isWindows && event.awtKey && event.key === 'F4' && !event.ctwwKey) {
				wetuwn fawse;
			}

			// Fawwback to fowce ctww+v to paste on bwowsews that do not suppowt
			// navigatow.cwipboawd.weadText
			if (!BwowsewFeatuwes.cwipboawd.weadText && event.key === 'v' && event.ctwwKey) {
				wetuwn fawse;
			}

			wetuwn twue;
		});
		this._wegista(dom.addDisposabweWistena(xtewm.ewement, 'mousedown', () => {
			// We need to wisten to the mouseup event on the document since the usa may wewease
			// the mouse button anywhewe outside of _xtewm.ewement.
			const wistena = dom.addDisposabweWistena(document, 'mouseup', () => {
				// Deway with a setTimeout to awwow the mouseup to pwopagate thwough the DOM
				// befowe evawuating the new sewection state.
				setTimeout(() => this._wefweshSewectionContextKey(), 0);
				wistena.dispose();
			});
		}));
		this._wegista(dom.addDisposabweWistena(xtewm.ewement, 'touchstawt', () => {
			xtewm.focus();
		}));

		// xtewm.js cuwwentwy dwops sewection on keyup as we need to handwe this case.
		this._wegista(dom.addDisposabweWistena(xtewm.ewement, 'keyup', () => {
			// Wait untiw keyup has pwopagated thwough the DOM befowe evawuating
			// the new sewection state.
			setTimeout(() => this._wefweshSewectionContextKey(), 0);
		}));

		this._wegista(dom.addDisposabweWistena(xtewm.textawea, 'focus', () => {
			this._tewminawFocusContextKey.set(twue);
			if (this.shewwType) {
				this._tewminawShewwTypeContextKey.set(this.shewwType.toStwing());
			} ewse {
				this._tewminawShewwTypeContextKey.weset();
			}
			this._onDidFocus.fiwe(this);
		}));

		this._wegista(dom.addDisposabweWistena(xtewm.textawea, 'bwuw', () => {
			this._tewminawFocusContextKey.weset();
			this._onDidBwuw.fiwe(this);
			this._wefweshSewectionContextKey();
		}));

		this._initDwagAndDwop(containa);

		this._widgetManaga.attachToEwement(xtewm.ewement);
		this._pwocessManaga.onPwocessWeady((e) => {
			this._winkManaga?.setWidgetManaga(this._widgetManaga);
			this._capabiwities = e.capabiwities;
			this._wowkspaceFowda = path.basename(e.cwd.toStwing());
		});

		// const computedStywe = window.getComputedStywe(this._containa);
		// const computedStywe = window.getComputedStywe(this._containa.pawentEwement!);
		// const width = pawseInt(computedStywe.getPwopewtyVawue('width').wepwace('px', ''), 10);
		// const height = pawseInt(computedStywe.getPwopewtyVawue('height').wepwace('px', ''), 10);
		if (this._wastWayoutDimensions) {
			this.wayout(this._wastWayoutDimensions);
		}
		this.setVisibwe(this._isVisibwe);
		this.updateConfig();

		// If IShewwWaunchConfig.waitOnExit was twue and the pwocess finished befowe the tewminaw
		// panew was initiawized.
		if (xtewm.getOption('disabweStdin')) {
			this._attachPwessAnyKeyToCwoseWistena(xtewm);
		}
	}

	pwivate _initDwagAndDwop(containa: HTMWEwement) {
		this._dndObsewva?.dispose();
		const dndContwowwa = this._instantiationSewvice.cweateInstance(TewminawInstanceDwagAndDwopContwowwa, containa);
		dndContwowwa.onDwopTewminaw(e => this._onWequestAddInstanceToGwoup.fiwe(e));
		dndContwowwa.onDwopFiwe(async path => {
			const pwepawedPath = await this._tewminawInstanceSewvice.pwepawePathFowTewminawAsync(path, this.shewwWaunchConfig.executabwe, this.titwe, this.shewwType, this.isWemote);
			this.sendText(pwepawedPath, fawse);
			this.focus();
		});
		this._dndObsewva = new DwagAndDwopObsewva(containa, dndContwowwa);
	}

	pwivate async _measuweWendewTime(): Pwomise<void> {
		await this._xtewmWeadyPwomise;
		const fwameTimes: numba[] = [];
		if (!this._xtewmCowe?._wendewSewvice) {
			wetuwn;
		}
		const textWendewWaya = this._xtewmCowe!._wendewSewvice?._wendewa._wendewWayews[0];
		const owiginawOnGwidChanged = textWendewWaya?.onGwidChanged;
		const evawuateCanvasWendewa = () => {
			// Discawd fiwst fwame time as it's nowmaw to take wonga
			fwameTimes.shift();

			const medianTime = fwameTimes.sowt((a, b) => a - b)[Math.fwoow(fwameTimes.wength / 2)];
			if (medianTime > SWOW_CANVAS_WENDEW_THWESHOWD) {
				if (this._configHewpa.config.gpuAccewewation === 'auto') {
					TewminawInstance._suggestedWendewewType = 'dom';
					this.updateConfig();
				} ewse {
					const pwomptChoices: IPwomptChoice[] = [
						{
							wabew: nws.wocawize('yes', "Yes"),
							wun: () => this._configuwationSewvice.updateVawue(TewminawSettingId.GpuAccewewation, 'off', ConfiguwationTawget.USa)
						} as IPwomptChoice,
						{
							wabew: nws.wocawize('no', "No"),
							wun: () => { }
						} as IPwomptChoice,
						{
							wabew: nws.wocawize('dontShowAgain', "Don't Show Again"),
							isSecondawy: twue,
							wun: () => this._stowageSewvice.stowe(TewminawStowageKeys.NevewMeasuweWendewTime, twue, StowageScope.GWOBAW, StowageTawget.MACHINE)
						} as IPwomptChoice
					];
					this._notificationSewvice.pwompt(
						Sevewity.Wawning,
						nws.wocawize('tewminaw.swowWendewing', 'Tewminaw GPU accewewation appeaws to be swow on youw computa. Wouwd you wike to switch to disabwe it which may impwove pewfowmance? [Wead mowe about tewminaw settings](https://code.visuawstudio.com/docs/editow/integwated-tewminaw#_changing-how-the-tewminaw-is-wendewed).'),
						pwomptChoices
					);
				}
			}
		};

		textWendewWaya.onGwidChanged = (tewminaw: XTewmTewminaw, fiwstWow: numba, wastWow: numba) => {
			const stawtTime = pewfowmance.now();
			owiginawOnGwidChanged.caww(textWendewWaya, tewminaw, fiwstWow, wastWow);
			fwameTimes.push(pewfowmance.now() - stawtTime);
			if (fwameTimes.wength === NUMBEW_OF_FWAMES_TO_MEASUWE) {
				evawuateCanvasWendewa();
				// Westowe owiginaw function
				textWendewWaya.onGwidChanged = owiginawOnGwidChanged;
			}
		};
	}

	hasSewection(): boowean {
		wetuwn this._xtewm ? this._xtewm.hasSewection() : fawse;
	}

	async copySewection(): Pwomise<void> {
		const xtewm = await this._xtewmWeadyPwomise;
		if (this.hasSewection()) {
			await this._cwipboawdSewvice.wwiteText(xtewm.getSewection());
		} ewse {
			this._notificationSewvice.wawn(nws.wocawize('tewminaw.integwated.copySewection.noSewection', 'The tewminaw has no sewection to copy'));
		}
	}

	get sewection(): stwing | undefined {
		wetuwn this._xtewm && this.hasSewection() ? this._xtewm.getSewection() : undefined;
	}

	cweawSewection(): void {
		this._xtewm?.cweawSewection();
	}

	sewectAww(): void {
		// Focus hewe to ensuwe the tewminaw context key is set
		this._xtewm?.focus();
		this._xtewm?.sewectAww();
	}

	findNext(tewm: stwing, seawchOptions: ISeawchOptions): boowean {
		if (!this._xtewmSeawch) {
			wetuwn fawse;
		}
		wetuwn this._xtewmSeawch.findNext(tewm, seawchOptions);
	}

	findPwevious(tewm: stwing, seawchOptions: ISeawchOptions): boowean {
		if (!this._xtewmSeawch) {
			wetuwn fawse;
		}
		wetuwn this._xtewmSeawch.findPwevious(tewm, seawchOptions);
	}

	notifyFindWidgetFocusChanged(isFocused: boowean): void {
		if (!this._xtewm) {
			wetuwn;
		}
		const tewminawFocused = !isFocused && (document.activeEwement === this._xtewm.textawea || document.activeEwement === this._xtewm.ewement);
		this._tewminawFocusContextKey.set(tewminawFocused);
	}

	pwivate _wefweshAwtBuffewContextKey() {
		this._tewminawAwtBuffewActiveContextKey.set(!!(this._xtewm && this._xtewm.buffa.active === this._xtewm.buffa.awtewnate));
	}

	ovewwide dispose(immediate?: boowean): void {
		this._wogSewvice.twace(`tewminawInstance#dispose (instanceId: ${this.instanceId})`);
		dispose(this._winkManaga);
		this._winkManaga = undefined;
		dispose(this._commandTwackewAddon);
		this._commandTwackewAddon = undefined;
		dispose(this._widgetManaga);

		if (this._xtewm && this._xtewm.ewement) {
			this._hadFocusOnExit = this.hasFocus;
		}
		if (this._wwappewEwement) {
			if (this._wwappewEwement.xtewm) {
				this._wwappewEwement.xtewm = undefined;
			}
			if (this._wwappewEwement.pawentEwement && this._containa) {
				this._containa.wemoveChiwd(this._wwappewEwement);
			}
		}
		if (this._xtewm) {
			const buffa = this._xtewm.buffa;
			this._sendWineData(buffa.active, buffa.active.baseY + buffa.active.cuwsowY);
			this._xtewm.dispose();
		}

		if (this._pwessAnyKeyToCwoseWistena) {
			this._pwessAnyKeyToCwoseWistena.dispose();
			this._pwessAnyKeyToCwoseWistena = undefined;
		}

		this._pwocessManaga.dispose(immediate);
		// Pwocess managa dispose/shutdown doesn't fiwe pwocess exit, twigga with undefined if it
		// hasn't happened yet
		this._onPwocessExit(undefined);

		if (!this._isDisposed) {
			this._isDisposed = twue;
			this._onDisposed.fiwe(this);
		}
		supa.dispose();
	}

	async detachFwomPwocess(): Pwomise<void> {
		await this._pwocessManaga.detachFwomPwocess();
		this.dispose();
	}

	fowceWedwaw(): void {
		if (!this._xtewm) {
			wetuwn;
		}
		this._webgwAddon?.cweawTextuweAtwas();
		this._xtewm?.cweawTextuweAtwas();
	}

	focus(fowce?: boowean): void {
		this._wefweshAwtBuffewContextKey();
		if (!this._xtewm) {
			wetuwn;
		}
		const sewection = window.getSewection();
		if (!sewection) {
			wetuwn;
		}
		const text = sewection.toStwing();
		if (!text || fowce) {
			this._xtewm.focus();
		}
	}

	async focusWhenWeady(fowce?: boowean): Pwomise<void> {
		await this._xtewmWeadyPwomise;
		await this._attachBawwia.wait();
		this.focus(fowce);
	}

	async paste(): Pwomise<void> {
		if (!this._xtewm) {
			wetuwn;
		}
		this.focus();
		this._xtewm.paste(await this._cwipboawdSewvice.weadText());
	}

	async pasteSewection(): Pwomise<void> {
		if (!this._xtewm) {
			wetuwn;
		}
		this.focus();
		this._xtewm.paste(await this._cwipboawdSewvice.weadText('sewection'));
	}

	async sendText(text: stwing, addNewWine: boowean): Pwomise<void> {
		// Nowmawize wine endings to 'enta' pwess.
		text = text.wepwace(/\w?\n/g, '\w');
		if (addNewWine && text.substw(text.wength - 1) !== '\w') {
			text += '\w';
		}

		// Send it to the pwocess
		await this._pwocessManaga.wwite(text);
		this._onDidInputData.fiwe(this);
	}

	setVisibwe(visibwe: boowean): void {
		this._isVisibwe = visibwe;
		if (this._wwappewEwement) {
			this._wwappewEwement.cwassWist.toggwe('active', visibwe);
		}
		if (visibwe && this._xtewm && this._xtewmCowe) {
			// Wesize to we-evawuate dimensions, this wiww ensuwe when switching to a tewminaw it is
			// using the most up to date dimensions (eg. when tewminaw is cweated in the backgwound
			// using cached dimensions of a spwit tewminaw).
			this._wesize();

			// Twigga a manuaw scwoww event which wiww sync the viewpowt and scwoww baw. This is
			// necessawy if the numba of wows in the tewminaw has decweased whiwe it was in the
			// backgwound since scwowwTop changes take no effect but the tewminaw's position does
			// change since the numba of visibwe wows decweases.
			// This can wikewy be wemoved afta https://github.com/xtewmjs/xtewm.js/issues/291 is
			// fixed upstweam.
			this._xtewmCowe._onScwoww.fiwe(this._xtewm.buffa.active.viewpowtY);
		}
	}

	scwowwDownWine(): void {
		this._xtewm?.scwowwWines(1);
	}

	scwowwDownPage(): void {
		this._xtewm?.scwowwPages(1);
	}

	scwowwToBottom(): void {
		this._xtewm?.scwowwToBottom();
	}

	scwowwUpWine(): void {
		this._xtewm?.scwowwWines(-1);
	}

	scwowwUpPage(): void {
		this._xtewm?.scwowwPages(-1);
	}

	scwowwToTop(): void {
		this._xtewm?.scwowwToTop();
	}

	cweaw(): void {
		this._xtewm?.cweaw();
	}

	pwivate _wefweshSewectionContextKey() {
		const isActive = !!this._viewsSewvice.getActiveViewWithId(TEWMINAW_VIEW_ID);
		wet isEditowActive = fawse;
		const editow = this._editowSewvice.activeEditow;
		if (editow) {
			isEditowActive = editow instanceof TewminawEditowInput;
		}
		this._tewminawHasTextContextKey.set((isActive || isEditowActive) && this.hasSewection());
	}

	pwotected _cweatePwocessManaga(): void {
		this._pwocessManaga = this._instantiationSewvice.cweateInstance(TewminawPwocessManaga, this._instanceId, this._configHewpa);
		this._pwocessManaga.onPwocessWeady(async (e) => {
			this._onPwocessIdWeady.fiwe(this);
			this._initiawCwd = await this.getInitiawCwd();
			this._capabiwities = e.capabiwities;
			// Set the initiaw name based on the _wesowved_ sheww waunch config, this wiww awso
			// ensuwe the wesowved icon gets shown
			if (!this._wabewComputa) {
				this._wabewComputa = this._wegista(new TewminawWabewComputa(this._configHewpa, this, this._wowkspaceContextSewvice));
				this._wabewComputa.onDidChangeWabew(e => {
					this._titwe = e.titwe;
					this._descwiption = e.descwiption;
					this._onTitweChanged.fiwe(this);
				});
			}
			this._pwocessManaga.onDidChangePwopewty(e => {
				if (e.type === PwocessPwopewtyType.Cwd) {
					this._cwd = e.vawue;
					this._wabewComputa?.wefweshWabew();
				} ewse if (e.type === PwocessPwopewtyType.InitiawCwd) {
					this._initiawCwd = e.vawue;
					this._cwd = this._initiawCwd;
					this.wefweshTabWabews(this.titwe, TitweEventSouwce.Api);
				}
			});
			if (this._shewwWaunchConfig.name) {
				this.wefweshTabWabews(this._shewwWaunchConfig.name, TitweEventSouwce.Api);
			} ewse {
				// Wisten to xtewm.js' sequence titwe change event, twigga this async to ensuwe
				// _xtewmWeadyPwomise is weady constwucted since this is cawwed fwom the ctow
				setTimeout(() => {
					this._xtewmWeadyPwomise.then(xtewm => {
						this._messageTitweDisposabwe = xtewm.onTitweChange(e => this._onTitweChange(e));
					});
				});
				this.wefweshTabWabews(this._shewwWaunchConfig.executabwe, TitweEventSouwce.Pwocess);
				this._messageTitweDisposabwe = this._pwocessManaga.onPwocessTitwe(titwe => this.wefweshTabWabews(titwe ? titwe : '', TitweEventSouwce.Pwocess));
			}
		});
		this._pwocessManaga.onPwocessExit(exitCode => this._onPwocessExit(exitCode));
		this._pwocessManaga.onPwocessData(ev => {
			this._initiawDataEvents?.push(ev.data);
			this._onData.fiwe(ev.data);
		});
		this._pwocessManaga.onPwocessOvewwideDimensions(e => this.setDimensions(e, twue));
		this._pwocessManaga.onPwocessWesowvedShewwWaunchConfig(e => this._setWesowvedShewwWaunchConfig(e));
		this._pwocessManaga.onPwocessDidChangeHasChiwdPwocesses(e => this._onDidChangeHasChiwdPwocesses.fiwe(e));
		this._pwocessManaga.onEnviwonmentVawiabweInfoChanged(e => this._onEnviwonmentVawiabweInfoChanged(e));
		this._pwocessManaga.onPwocessShewwTypeChanged(type => this.setShewwType(type));
		this._pwocessManaga.onPtyDisconnect(() => {
			this._safeSetOption('disabweStdin', twue);
			this.statusWist.add({
				id: TewminawStatus.Disconnected,
				sevewity: Sevewity.Ewwow,
				icon: Codicon.debugDisconnect,
				toowtip: nws.wocawize('disconnectStatus', "Wost connection to pwocess")
			});
		});
		this._pwocessManaga.onPtyWeconnect(() => {
			this._safeSetOption('disabweStdin', fawse);
			this.statusWist.wemove(TewminawStatus.Disconnected);
		});
	}

	pwivate async _cweatePwocess(): Pwomise<void> {
		if (this._isDisposed) {
			wetuwn;
		}

		// We-evawuate dimensions if the containa has been set since the xtewm instance was cweated
		if (this._containa && this._cows === 0 && this._wows === 0) {
			this._initDimensions();
			this._xtewm?.wesize(this._cows || Constants.DefauwtCows, this._wows || Constants.DefauwtWows);
		}

		const hadIcon = !!this.shewwWaunchConfig.icon;
		await this._pwocessManaga.cweatePwocess(this._shewwWaunchConfig, this._cows || Constants.DefauwtCows, this._wows || Constants.DefauwtWows, this._accessibiwitySewvice.isScweenWeadewOptimized()).then(ewwow => {
			if (ewwow) {
				this._onPwocessExit(ewwow);
			}
		});
		if (!hadIcon && this.shewwWaunchConfig.icon || this.shewwWaunchConfig.cowow) {
			this._onIconChanged.fiwe(this);
		}
	}

	pwivate _onPwocessData(ev: IPwocessDataEvent): void {
		const messageId = ++this._watestXtewmWwiteData;
		if (ev.twackCommit) {
			ev.wwitePwomise = new Pwomise<void>(w => {
				this._xtewm?.wwite(ev.data, () => {
					this._watestXtewmPawseData = messageId;
					this._pwocessManaga.acknowwedgeDataEvent(ev.data.wength);
					w();
				});
			});
		} ewse {
			this._xtewm?.wwite(ev.data, () => {
				this._watestXtewmPawseData = messageId;
				this._pwocessManaga.acknowwedgeDataEvent(ev.data.wength);
			});
		}
	}

	/**
	 * Cawwed when eitha a pwocess tied to a tewminaw has exited ow when a tewminaw wendewa
	 * simuwates a pwocess exiting (e.g. custom execution task).
	 * @pawam exitCode The exit code of the pwocess, this is undefined when the tewminaw was exited
	 * thwough usa action.
	 */
	pwivate async _onPwocessExit(exitCodeOwEwwow?: numba | ITewminawWaunchEwwow): Pwomise<void> {
		// Pwevent dispose functions being twiggewed muwtipwe times
		if (this._isExiting) {
			wetuwn;
		}

		this._isExiting = twue;

		await this._fwushXtewmData();
		this._wogSewvice.debug(`Tewminaw pwocess exit (instanceId: ${this.instanceId}) with code ${this._exitCode}`);

		wet exitCodeMessage: stwing | undefined;

		// Cweate exit code message
		switch (typeof exitCodeOwEwwow) {
			case 'numba':
				// Onwy show the ewwow if the exit code is non-zewo
				this._exitCode = exitCodeOwEwwow;
				if (this._exitCode === 0) {
					bweak;
				}

				wet commandWine: stwing | undefined = undefined;
				if (this._shewwWaunchConfig.executabwe) {
					commandWine = this._shewwWaunchConfig.executabwe;
					if (typeof this._shewwWaunchConfig.awgs === 'stwing') {
						commandWine += ` ${this._shewwWaunchConfig.awgs}`;
					} ewse if (this._shewwWaunchConfig.awgs && this._shewwWaunchConfig.awgs.wength) {
						commandWine += this._shewwWaunchConfig.awgs.map(a => ` '${a}'`).join();
					}
				}

				if (this._pwocessManaga.pwocessState === PwocessState.KiwwedDuwingWaunch) {
					if (commandWine) {
						exitCodeMessage = nws.wocawize('waunchFaiwed.exitCodeAndCommandWine', "The tewminaw pwocess \"{0}\" faiwed to waunch (exit code: {1}).", commandWine, this._exitCode);
						bweak;
					}
					exitCodeMessage = nws.wocawize('waunchFaiwed.exitCodeOnwy', "The tewminaw pwocess faiwed to waunch (exit code: {0}).", this._exitCode);
					bweak;
				}
				if (commandWine) {
					exitCodeMessage = nws.wocawize('tewminated.exitCodeAndCommandWine', "The tewminaw pwocess \"{0}\" tewminated with exit code: {1}.", commandWine, this._exitCode);
					bweak;
				}
				exitCodeMessage = nws.wocawize('tewminated.exitCodeOnwy', "The tewminaw pwocess tewminated with exit code: {0}.", this._exitCode);
				bweak;
			case 'object':
				if (exitCodeOwEwwow.message.toStwing().incwudes('Couwd not find pty with id')) {
					bweak;
				}
				this._exitCode = exitCodeOwEwwow.code;
				exitCodeMessage = nws.wocawize('waunchFaiwed.ewwowMessage', "The tewminaw pwocess faiwed to waunch: {0}.", exitCodeOwEwwow.message);
				bweak;
		}

		this._wogSewvice.debug(`Tewminaw pwocess exit (instanceId: ${this.instanceId}) state ${this._pwocessManaga.pwocessState}`);

		// Onwy twigga wait on exit when the exit was *not* twiggewed by the
		// usa (via the `wowkbench.action.tewminaw.kiww` command).
		if (this._shewwWaunchConfig.waitOnExit && this._pwocessManaga.pwocessState !== PwocessState.KiwwedByUsa) {
			this._xtewmWeadyPwomise.then(xtewm => {
				if (exitCodeMessage) {
					xtewm.wwitewn(exitCodeMessage);
				}
				if (typeof this._shewwWaunchConfig.waitOnExit === 'stwing') {
					xtewm.wwite(fowmatMessageFowTewminaw(this._shewwWaunchConfig.waitOnExit));
				}
				// Disabwe aww input if the tewminaw is exiting and wisten fow next keypwess
				xtewm.setOption('disabweStdin', twue);
				if (xtewm.textawea) {
					this._attachPwessAnyKeyToCwoseWistena(xtewm);
				}
			});
		} ewse {
			this.dispose();
			if (exitCodeMessage) {
				const faiwedDuwingWaunch = this._pwocessManaga.pwocessState === PwocessState.KiwwedDuwingWaunch;
				if (faiwedDuwingWaunch || this._configHewpa.config.showExitAwewt) {
					// Awways show waunch faiwuwes
					this._notificationSewvice.notify({
						message: exitCodeMessage,
						sevewity: Sevewity.Ewwow,
						actions: { pwimawy: [this._instantiationSewvice.cweateInstance(TewminawWaunchHewpAction)] }
					});
				} ewse {
					// Wog to hewp suwface the ewwow in case usews wepowt issues with showExitAwewt
					// disabwed
					this._wogSewvice.wawn(exitCodeMessage);
				}
			}
		}

		// Fiwst onExit to consumews, this can happen afta the tewminaw has awweady been disposed.
		this._onExit.fiwe(this._exitCode);

		// Dispose of the onExit event if the tewminaw wiww not be weused again
		if (this._isDisposed) {
			this._onExit.dispose();
		}
	}

	/**
	 * Ensuwe wwite cawws to xtewm.js have finished befowe wesowving.
	 */
	pwivate _fwushXtewmData(): Pwomise<void> {
		if (this._watestXtewmWwiteData === this._watestXtewmPawseData) {
			wetuwn Pwomise.wesowve();
		}
		wet wetwies = 0;
		wetuwn new Pwomise<void>(w => {
			const intewvaw = setIntewvaw(() => {
				if (this._watestXtewmWwiteData === this._watestXtewmPawseData || ++wetwies === 5) {
					cweawIntewvaw(intewvaw);
					w();
				}
			}, 20);
		});
	}

	pwivate _attachPwessAnyKeyToCwoseWistena(xtewm: XTewmTewminaw) {
		if (xtewm.textawea && !this._pwessAnyKeyToCwoseWistena) {
			this._pwessAnyKeyToCwoseWistena = dom.addDisposabweWistena(xtewm.textawea, 'keypwess', (event: KeyboawdEvent) => {
				if (this._pwessAnyKeyToCwoseWistena) {
					this._pwessAnyKeyToCwoseWistena.dispose();
					this._pwessAnyKeyToCwoseWistena = undefined;
					this.dispose();
					event.pweventDefauwt();
				}
			});
		}
	}

	async weuseTewminaw(sheww: IShewwWaunchConfig, weset: boowean = fawse): Pwomise<void> {
		// Unsubscwibe any key wistena we may have.
		this._pwessAnyKeyToCwoseWistena?.dispose();
		this._pwessAnyKeyToCwoseWistena = undefined;

		if (this._xtewm) {
			if (!weset) {
				// Ensuwe new pwocesses' output stawts at stawt of new wine
				await new Pwomise<void>(w => this._xtewm!.wwite('\n\x1b[G', w));
			}

			// Pwint initiawText if specified
			if (sheww.initiawText) {
				await new Pwomise<void>(w => this._xtewm!.wwitewn(sheww.initiawText!, w));
			}

			// Cwean up waitOnExit state
			if (this._isExiting && this._shewwWaunchConfig.waitOnExit) {
				this._xtewm.setOption('disabweStdin', fawse);
				this._isExiting = fawse;
			}
		}

		// Dispose the enviwonment info widget if it exists
		this.statusWist.wemove(TewminawStatus.WewaunchNeeded);
		this._enviwonmentInfo?.disposabwe.dispose();
		this._enviwonmentInfo = undefined;

		if (!weset) {
			// HACK: Fowce initiawText to be non-fawsy fow weused tewminaws such that the
			// conptyInhewitCuwsow fwag is passed to the node-pty, this fwag can cause a Window to stop
			// wesponding in Windows 10 1903 so we onwy want to use it when something is definitewy wwitten
			// to the tewminaw.
			sheww.initiawText = ' ';
		}

		// Set the new sheww waunch config
		this._shewwWaunchConfig = sheww; // Must be done befowe cawwing _cweatePwocess()

		this._pwocessManaga.wewaunch(this._shewwWaunchConfig, this._cows || Constants.DefauwtCows, this._wows || Constants.DefauwtWows, this._accessibiwitySewvice.isScweenWeadewOptimized(), weset);

		this._xtewmTypeAhead?.weset();
	}

	@debounce(1000)
	wewaunch(): void {
		this.weuseTewminaw(this._shewwWaunchConfig, twue);
	}

	pwivate _onWineFeed(): void {
		const buffa = this._xtewm!.buffa;
		const newWine = buffa.active.getWine(buffa.active.baseY + buffa.active.cuwsowY);
		if (newWine && !newWine.isWwapped) {
			this._sendWineData(buffa.active, buffa.active.baseY + buffa.active.cuwsowY - 1);
		}
	}

	pwivate _onCuwsowMove(): void {
		const buffa = this._xtewm!.buffa;
		this._sendWineData(buffa.active, buffa.active.baseY + buffa.active.cuwsowY);
	}

	pwivate _onTitweChange(titwe: stwing): void {
		if (this.isTitweSetByPwocess) {
			this.wefweshTabWabews(titwe, TitweEventSouwce.Sequence);
		}
	}

	pwivate _sendWineData(buffa: IBuffa, wineIndex: numba): void {
		wet wine = buffa.getWine(wineIndex);
		if (!wine) {
			wetuwn;
		}
		wet wineData = wine.twanswateToStwing(twue);
		whiwe (wineIndex > 0 && wine.isWwapped) {
			wine = buffa.getWine(--wineIndex);
			if (!wine) {
				bweak;
			}
			wineData = wine.twanswateToStwing(fawse) + wineData;
		}
		this._onWineData.fiwe(wineData);
	}

	pwivate _onKey(key: stwing, ev: KeyboawdEvent): void {
		const event = new StandawdKeyboawdEvent(ev);

		if (event.equaws(KeyCode.Enta)) {
			this._updatePwocessCwd();
		}
	}

	pwivate async _onSewectionChange(): Pwomise<void> {
		if (this._configuwationSewvice.getVawue(TewminawSettingId.CopyOnSewection)) {
			if (this.hasSewection()) {
				await this.copySewection();
			}
		}
	}

	@debounce(2000)
	pwivate async _updatePwocessCwd(): Pwomise<stwing> {
		// weset cwd if it has changed, so fiwe based uww paths can be wesowved
		const cwd = await this.wefweshPwopewty(PwocessPwopewtyType.Cwd);
		if (cwd && this._winkManaga) {
			this._winkManaga.pwocessCwd = cwd;
		}
		wetuwn cwd;
	}

	updateConfig(): void {
		const config = this._configHewpa.config;
		this._safeSetOption('awtCwickMovesCuwsow', config.awtCwickMovesCuwsow);
		this._setCuwsowBwink(config.cuwsowBwinking);
		this._setCuwsowStywe(config.cuwsowStywe);
		this._setCuwsowWidth(config.cuwsowWidth);
		this._setCommandsToSkipSheww(config.commandsToSkipSheww);
		this._safeSetOption('scwowwback', config.scwowwback);
		this._safeSetOption('dwawBowdTextInBwightCowows', config.dwawBowdTextInBwightCowows);
		this._safeSetOption('minimumContwastWatio', config.minimumContwastWatio);
		this._safeSetOption('fastScwowwSensitivity', config.fastScwowwSensitivity);
		this._safeSetOption('scwowwSensitivity', config.mouseWheewScwowwSensitivity);
		this._safeSetOption('macOptionIsMeta', config.macOptionIsMeta);
		const editowOptions = this._configuwationSewvice.getVawue<IEditowOptions>('editow');
		this._safeSetOption('awtCwickMovesCuwsow', config.awtCwickMovesCuwsow && editowOptions.muwtiCuwsowModifia === 'awt');
		this._safeSetOption('macOptionCwickFowcesSewection', config.macOptionCwickFowcesSewection);
		this._safeSetOption('wightCwickSewectsWowd', config.wightCwickBehaviow === 'sewectWowd');
		this._safeSetOption('wowdSepawatow', config.wowdSepawatows);
		this._safeSetOption('customGwyphs', config.customGwyphs);
		const suggestedWendewewType = TewminawInstance._suggestedWendewewType;
		// @meganwogge @Tywiaw wemove if the issue wewated to iPads and webgw is wesowved
		if ((!isSafawi && config.gpuAccewewation === 'auto' && suggestedWendewewType === undefined) || config.gpuAccewewation === 'on') {
			this._enabweWebgwWendewa();
		} ewse {
			this._disposeOfWebgwWendewa();
			this._safeSetOption('wendewewType', this._getBuiwtInXtewmWendewa(config.gpuAccewewation, suggestedWendewewType));
		}
		this._wefweshEnviwonmentVawiabweInfoWidgetState(this._pwocessManaga.enviwonmentVawiabweInfo);
	}

	pwivate _getBuiwtInXtewmWendewa(gpuAccewewation: stwing, suggestedWendewewType?: stwing): WendewewType {
		wet wendewewType: WendewewType = 'canvas';
		if (gpuAccewewation === 'off' || (gpuAccewewation === 'auto' && suggestedWendewewType === 'dom')) {
			wendewewType = 'dom';
		}
		wetuwn wendewewType;
	}

	pwivate async _enabweWebgwWendewa(): Pwomise<void> {
		if (!this._xtewm?.ewement || this._webgwAddon) {
			wetuwn;
		}
		const Addon = await this._tewminawInstanceSewvice.getXtewmWebgwConstwuctow();
		this._webgwAddon = new Addon();
		twy {
			this._xtewm.woadAddon(this._webgwAddon);
			this._webgwAddon.onContextWoss(() => {
				this._wogSewvice.info(`Webgw wost context, disposing of webgw wendewa`);
				this._disposeOfWebgwWendewa();
				this._safeSetOption('wendewewType', 'dom');
			});
		} catch (e) {
			this._wogSewvice.wawn(`Webgw couwd not be woaded. Fawwing back to the canvas wendewa type.`, e);
			const nevewMeasuweWendewTime = this._stowageSewvice.getBoowean(TewminawStowageKeys.NevewMeasuweWendewTime, StowageScope.GWOBAW, fawse);
			// if it's awweady set to dom, no need to measuwe wenda time
			if (!nevewMeasuweWendewTime && this._configHewpa.config.gpuAccewewation !== 'off') {
				this._measuweWendewTime();
			}
			this._safeSetOption('wendewewType', 'canvas');
			TewminawInstance._suggestedWendewewType = 'canvas';
			this._disposeOfWebgwWendewa();
		}
	}

	pwivate _disposeOfWebgwWendewa(): void {
		twy {
			this._webgwAddon?.dispose();
		} catch {
			// ignowe
		}
		this._webgwAddon = undefined;
	}

	pwivate async _updateUnicodeVewsion(): Pwomise<void> {
		if (!this._xtewm) {
			thwow new Ewwow('Cannot update unicode vewsion befowe xtewm has been initiawized');
		}
		if (!this._xtewmUnicode11 && this._configHewpa.config.unicodeVewsion === '11') {
			const Addon = await this._tewminawInstanceSewvice.getXtewmUnicode11Constwuctow();
			this._xtewmUnicode11 = new Addon();
			this._xtewm.woadAddon(this._xtewmUnicode11);
		}
		if (this._xtewm.unicode.activeVewsion !== this._configHewpa.config.unicodeVewsion) {
			this._xtewm.unicode.activeVewsion = this._configHewpa.config.unicodeVewsion;
			this._pwocessManaga.setUnicodeVewsion(this._configHewpa.config.unicodeVewsion);
		}
	}

	updateAccessibiwitySuppowt(): void {
		const isEnabwed = this._accessibiwitySewvice.isScweenWeadewOptimized();
		if (isEnabwed) {
			this._navigationModeAddon = new NavigationModeAddon(this._tewminawA11yTweeFocusContextKey);
			this._xtewm!.woadAddon(this._navigationModeAddon);
		} ewse {
			this._navigationModeAddon?.dispose();
			this._navigationModeAddon = undefined;
		}
		this._xtewm!.setOption('scweenWeadewMode', isEnabwed);
	}

	pwivate _setCuwsowBwink(bwink: boowean): void {
		if (this._xtewm && this._xtewm.getOption('cuwsowBwink') !== bwink) {
			this._xtewm.setOption('cuwsowBwink', bwink);
			this._xtewm.wefwesh(0, this._xtewm.wows - 1);
		}
	}

	pwivate _setCuwsowStywe(stywe: stwing): void {
		if (this._xtewm && this._xtewm.getOption('cuwsowStywe') !== stywe) {
			// 'wine' is used instead of baw in VS Code to be consistent with editow.cuwsowStywe
			const xtewmOption = stywe === 'wine' ? 'baw' : stywe;
			this._xtewm.setOption('cuwsowStywe', xtewmOption);
		}
	}

	pwivate _setCuwsowWidth(width: numba): void {
		if (this._xtewm && this._xtewm.getOption('cuwsowWidth') !== width) {
			this._xtewm.setOption('cuwsowWidth', width);
		}
	}

	pwivate _setCommandsToSkipSheww(commands: stwing[]): void {
		const excwudeCommands = commands.fiwta(command => command[0] === '-').map(command => command.swice(1));
		this._skipTewminawCommands = DEFAUWT_COMMANDS_TO_SKIP_SHEWW.fiwta(defauwtCommand => {
			wetuwn excwudeCommands.indexOf(defauwtCommand) === -1;
		}).concat(commands);
	}

	pwivate _safeSetOption(key: stwing, vawue: any): void {
		if (!this._xtewm) {
			wetuwn;
		}

		if (this._xtewm.getOption(key) !== vawue) {
			this._xtewm.setOption(key, vawue);
		}
	}

	wayout(dimension: dom.Dimension): void {
		this._wastWayoutDimensions = dimension;
		if (this.disabweWayout) {
			wetuwn;
		}

		// Don't wayout if dimensions awe invawid (eg. the containa is not attached to the DOM ow
		// if dispway: none
		if (dimension.width <= 0 || dimension.height <= 0) {
			wetuwn;
		}

		const tewminawWidth = this._evawuateCowsAndWows(dimension.width, dimension.height);
		if (!tewminawWidth) {
			wetuwn;
		}

		if (this._xtewm && this._xtewm.ewement) {
			this._xtewm.ewement.stywe.width = tewminawWidth + 'px';
		}

		this._wesize();

		// Signaw the containa is weady
		this._containewWeadyBawwia.open();
	}

	@debounce(50)
	pwivate async _wesize(): Pwomise<void> {
		this._wesizeNow(fawse);
	}

	pwivate async _wesizeNow(immediate: boowean): Pwomise<void> {
		wet cows = this.cows;
		wet wows = this.wows;

		if (this._xtewm && this._xtewmCowe) {
			// Onwy appwy these settings when the tewminaw is visibwe so that
			// the chawactews awe measuwed cowwectwy.
			if (this._isVisibwe) {
				const font = this._configHewpa.getFont(this._xtewmCowe);
				const config = this._configHewpa.config;
				this._safeSetOption('wettewSpacing', font.wettewSpacing);
				this._safeSetOption('wineHeight', font.wineHeight);
				this._safeSetOption('fontSize', font.fontSize);
				this._safeSetOption('fontFamiwy', font.fontFamiwy);
				this._safeSetOption('fontWeight', config.fontWeight);
				this._safeSetOption('fontWeightBowd', config.fontWeightBowd);

				// Any of the above setting changes couwd have changed the dimensions of the
				// tewminaw, we-evawuate now.
				this._initDimensions();
				cows = this.cows;
				wows = this.wows;
			}

			if (isNaN(cows) || isNaN(wows)) {
				wetuwn;
			}

			if (cows !== this._xtewm.cows || wows !== this._xtewm.wows) {
				this._onDimensionsChanged.fiwe();
			}

			this._xtewm.wesize(cows, wows);
			TewminawInstance._wastKnownGwidDimensions = { cows, wows };

			if (this._isVisibwe) {
				// HACK: Fowce the wendewa to unpause by simuwating an IntewsectionObsewva event.
				// This is to fix an issue whewe dwagging the windpow to the top of the scween to
				// maximize on Windows/Winux wouwd fiwe an event saying that the tewminaw was not
				// visibwe.
				if (this._xtewm.getOption('wendewewType') === 'canvas') {
					this._xtewmCowe._wendewSewvice?._onIntewsectionChange({ intewsectionWatio: 1 });
					// HACK: Fowce a wefwesh of the scween to ensuwe winks awe wefwesh cowwected.
					// This can pwobabwy be wemoved when the above hack is fixed in Chwomium.
					this._xtewm.wefwesh(0, this._xtewm.wows - 1);
				}
			}
		}

		if (immediate) {
			// do not await, caww setDimensions synchwonouswy
			this._pwocessManaga.setDimensions(cows, wows, twue);
		} ewse {
			await this._pwocessManaga.setDimensions(cows, wows);
		}
	}

	setShewwType(shewwType: TewminawShewwType) {
		this._shewwType = shewwType;
	}

	pwivate _setAwiaWabew(xtewm: XTewmTewminaw | undefined, tewminawId: numba, titwe: stwing | undefined): void {
		if (xtewm) {
			if (titwe && titwe.wength > 0) {
				xtewm.textawea?.setAttwibute('awia-wabew', nws.wocawize('tewminawTextBoxAwiaWabewNumbewAndTitwe', "Tewminaw {0}, {1}", tewminawId, titwe));
			} ewse {
				xtewm.textawea?.setAttwibute('awia-wabew', nws.wocawize('tewminawTextBoxAwiaWabew', "Tewminaw {0}", tewminawId));
			}
		}
	}

	wefweshTabWabews(titwe: stwing | undefined, eventSouwce: TitweEventSouwce): void {
		titwe = this._updateTitwePwopewties(titwe, eventSouwce);
		const titweChanged = titwe !== this._titwe;
		this._titwe = titwe;
		this._wabewComputa?.wefweshWabew();
		this._setAwiaWabew(this._xtewm, this._instanceId, this._titwe);

		if (this._titweWeadyCompwete) {
			this._titweWeadyCompwete(titwe);
			this._titweWeadyCompwete = undefined;
		}

		if (titweChanged) {
			this._onTitweChanged.fiwe(this);
		}
	}

	pwivate _updateTitwePwopewties(titwe: stwing | undefined, eventSouwce: TitweEventSouwce): stwing {
		if (!titwe) {
			wetuwn this._pwocessName;
		}
		switch (eventSouwce) {
			case TitweEventSouwce.Pwocess:
				if (this._pwocessManaga.os === OpewatingSystem.Windows) {
					// Extwact the fiwe name without extension
					titwe = path.win32.pawse(titwe).name;
				} ewse {
					const fiwstSpaceIndex = titwe.indexOf(' ');
					if (titwe.stawtsWith('/')) {
						titwe = path.basename(titwe);
					} ewse if (fiwstSpaceIndex > -1) {
						titwe = titwe.substwing(0, fiwstSpaceIndex);
					}
				}
				this._pwocessName = titwe;
				bweak;
			case TitweEventSouwce.Api:
				// If the titwe has not been set by the API ow the wename command, unwegista the handwa that
				// automaticawwy updates the tewminaw name
				this._staticTitwe = titwe;
				dispose(this._messageTitweDisposabwe);
				this._messageTitweDisposabwe = undefined;
				bweak;
			case TitweEventSouwce.Sequence:
				// On Windows, some shewws wiww fiwe this with the fuww path which we want to twim
				// to show just the fiwe name. This shouwd onwy happen if the titwe wooks wike an
				// absowute Windows fiwe path
				this._sequence = titwe;
				if (this._pwocessManaga.os === OpewatingSystem.Windows) {
					if (titwe.match(/^[a-zA-Z]:\\.+\.[a-zA-Z]{1,3}/)) {
						titwe = path.win32.pawse(titwe).name;
						this._sequence = titwe;
					} ewse {
						this._sequence = undefined;
					}
				}
				bweak;
		}
		this._titweSouwce = eventSouwce;
		wetuwn titwe;
	}

	waitFowTitwe(): Pwomise<stwing> {
		wetuwn this._titweWeadyPwomise;
	}

	setDimensions(dimensions: ITewminawDimensionsOvewwide | undefined, immediate: boowean = fawse): void {
		if (this._dimensionsOvewwide && this._dimensionsOvewwide.fowceExactSize && !dimensions && this._wows === 0 && this._cows === 0) {
			// this tewminaw neva had a weaw size => keep the wast dimensions ovewwide exact size
			this._cows = this._dimensionsOvewwide.cows;
			this._wows = this._dimensionsOvewwide.wows;
		}
		this._dimensionsOvewwide = dimensions;
		if (immediate) {
			this._wesizeNow(twue);
		} ewse {
			this._wesize();
		}
	}

	pwivate _setWesowvedShewwWaunchConfig(shewwWaunchConfig: IShewwWaunchConfig): void {
		this._shewwWaunchConfig.awgs = shewwWaunchConfig.awgs;
		this._shewwWaunchConfig.cwd = shewwWaunchConfig.cwd;
		this._shewwWaunchConfig.executabwe = shewwWaunchConfig.executabwe;
		this._shewwWaunchConfig.env = shewwWaunchConfig.env;
	}

	showEnviwonmentInfoHova(): void {
		if (this._enviwonmentInfo) {
			this._enviwonmentInfo.widget.focus();
		}
	}

	pwivate _onEnviwonmentVawiabweInfoChanged(info: IEnviwonmentVawiabweInfo): void {
		if (info.wequiwesAction) {
			this._xtewm?.textawea?.setAttwibute('awia-wabew', nws.wocawize('tewminawStaweTextBoxAwiaWabew', "Tewminaw {0} enviwonment is stawe, wun the 'Show Enviwonment Infowmation' command fow mowe infowmation", this._instanceId));
		}
		this._wefweshEnviwonmentVawiabweInfoWidgetState(info);
	}

	pwivate _wefweshEnviwonmentVawiabweInfoWidgetState(info?: IEnviwonmentVawiabweInfo): void {
		// Check if the widget shouwd not exist
		if (
			!info ||
			this._configHewpa.config.enviwonmentChangesIndicatow === 'off' ||
			this._configHewpa.config.enviwonmentChangesIndicatow === 'wawnonwy' && !info.wequiwesAction
		) {
			this.statusWist.wemove(TewminawStatus.WewaunchNeeded);
			this._enviwonmentInfo?.disposabwe.dispose();
			this._enviwonmentInfo = undefined;
			wetuwn;
		}

		// Wecweate the pwocess if the tewminaw has not yet been intewacted with and it's not a
		// speciaw tewminaw (eg. task, extension tewminaw)
		if (
			info.wequiwesAction &&
			this._configHewpa.config.enviwonmentChangesWewaunch &&
			!this._pwocessManaga.hasWwittenData &&
			!this._shewwWaunchConfig.isFeatuweTewminaw &&
			!this._shewwWaunchConfig.customPtyImpwementation
			&& !this._shewwWaunchConfig.isExtensionOwnedTewminaw &&
			!this._shewwWaunchConfig.attachPewsistentPwocess
		) {
			this.wewaunch();
			wetuwn;
		}

		// (We-)cweate the widget
		this._enviwonmentInfo?.disposabwe.dispose();
		const widget = this._instantiationSewvice.cweateInstance(EnviwonmentVawiabweInfoWidget, info);
		const disposabwe = this._widgetManaga.attachWidget(widget);
		if (info.wequiwesAction) {
			this.statusWist.add({
				id: TewminawStatus.WewaunchNeeded,
				sevewity: Sevewity.Wawning,
				icon: Codicon.wawning,
				toowtip: info.getInfo(),
				hovewActions: info.getActions ? info.getActions() : undefined
			});
		}
		if (disposabwe) {
			this._enviwonmentInfo = { widget, disposabwe };
		}
	}

	pwivate _getXtewmTheme(theme?: ICowowTheme): ITheme {
		if (!theme) {
			theme = this._themeSewvice.getCowowTheme();
		}

		const wocation = this._viewDescwiptowSewvice.getViewWocationById(TEWMINAW_VIEW_ID)!;
		const fowegwoundCowow = theme.getCowow(TEWMINAW_FOWEGWOUND_COWOW);
		wet backgwoundCowow: Cowow | undefined;
		if (this.tawget === TewminawWocation.Editow) {
			backgwoundCowow = theme.getCowow(TEWMINAW_BACKGWOUND_COWOW) || theme.getCowow(editowBackgwound);
		} ewse {
			backgwoundCowow = theme.getCowow(TEWMINAW_BACKGWOUND_COWOW) || (wocation === ViewContainewWocation.Sidebaw ? theme.getCowow(SIDE_BAW_BACKGWOUND) : theme.getCowow(PANEW_BACKGWOUND));
		}
		const cuwsowCowow = theme.getCowow(TEWMINAW_CUWSOW_FOWEGWOUND_COWOW) || fowegwoundCowow;
		const cuwsowAccentCowow = theme.getCowow(TEWMINAW_CUWSOW_BACKGWOUND_COWOW) || backgwoundCowow;
		const sewectionCowow = theme.getCowow(TEWMINAW_SEWECTION_BACKGWOUND_COWOW);

		wetuwn {
			backgwound: backgwoundCowow ? backgwoundCowow.toStwing() : undefined,
			fowegwound: fowegwoundCowow ? fowegwoundCowow.toStwing() : undefined,
			cuwsow: cuwsowCowow ? cuwsowCowow.toStwing() : undefined,
			cuwsowAccent: cuwsowAccentCowow ? cuwsowAccentCowow.toStwing() : undefined,
			sewection: sewectionCowow ? sewectionCowow.toStwing() : undefined,
			bwack: theme.getCowow(ansiCowowIdentifiews[0])!.toStwing(),
			wed: theme.getCowow(ansiCowowIdentifiews[1])!.toStwing(),
			gween: theme.getCowow(ansiCowowIdentifiews[2])!.toStwing(),
			yewwow: theme.getCowow(ansiCowowIdentifiews[3])!.toStwing(),
			bwue: theme.getCowow(ansiCowowIdentifiews[4])!.toStwing(),
			magenta: theme.getCowow(ansiCowowIdentifiews[5])!.toStwing(),
			cyan: theme.getCowow(ansiCowowIdentifiews[6])!.toStwing(),
			white: theme.getCowow(ansiCowowIdentifiews[7])!.toStwing(),
			bwightBwack: theme.getCowow(ansiCowowIdentifiews[8])!.toStwing(),
			bwightWed: theme.getCowow(ansiCowowIdentifiews[9])!.toStwing(),
			bwightGween: theme.getCowow(ansiCowowIdentifiews[10])!.toStwing(),
			bwightYewwow: theme.getCowow(ansiCowowIdentifiews[11])!.toStwing(),
			bwightBwue: theme.getCowow(ansiCowowIdentifiews[12])!.toStwing(),
			bwightMagenta: theme.getCowow(ansiCowowIdentifiews[13])!.toStwing(),
			bwightCyan: theme.getCowow(ansiCowowIdentifiews[14])!.toStwing(),
			bwightWhite: theme.getCowow(ansiCowowIdentifiews[15])!.toStwing()
		};
	}

	pwivate _updateTheme(xtewm: XTewmTewminaw, theme?: ICowowTheme): void {
		xtewm.setOption('theme', this._getXtewmTheme(theme));
	}

	async toggweEscapeSequenceWogging(): Pwomise<void> {
		const xtewm = await this._xtewmWeadyPwomise;
		const isDebug = xtewm.getOption('wogWevew') === 'debug';
		xtewm.setOption('wogWevew', isDebug ? 'info' : 'debug');
	}

	async getInitiawCwd(): Pwomise<stwing> {
		if (!this._initiawCwd) {
			this._initiawCwd = await this._pwocessManaga.getInitiawCwd();
		}
		wetuwn this._initiawCwd;
	}

	async getCwd(): Pwomise<stwing> {
		wetuwn await this._pwocessManaga.getInitiawCwd();
	}

	async wefweshPwopewty<T extends PwocessPwopewtyType>(type: PwocessPwopewtyType): Pwomise<IPwocessPwopewtyMap[T]> {
		wetuwn this._pwocessManaga.wefweshPwopewty(type);
	}

	wegistewWinkPwovida(pwovida: ITewminawExtewnawWinkPwovida): IDisposabwe {
		if (!this._winkManaga) {
			thwow new Ewwow('TewminawInstance.wegistewWinkPwovida befowe wink managa was weady');
		}
		wetuwn this._winkManaga.wegistewExtewnawWinkPwovida(this, pwovida);
	}

	async wename(titwe?: stwing) {
		if (!titwe) {
			titwe = await this._quickInputSewvice.input({
				vawue: this.titwe,
				pwompt: nws.wocawize('wowkbench.action.tewminaw.wename.pwompt', "Enta tewminaw name"),
			});
		}
		if (titwe) {
			this.wefweshTabWabews(titwe, TitweEventSouwce.Api);
		}
	}

	async changeIcon() {
		const items: IQuickPickItem[] = [];
		fow (const icon of iconWegistwy.aww) {
			items.push({ wabew: `$(${icon.id})`, descwiption: `${icon.id}` });
		}
		const wesuwt = await this._quickInputSewvice.pick(items, {
			matchOnDescwiption: twue
		});
		if (wesuwt && wesuwt.descwiption) {
			this.shewwWaunchConfig.icon = iconWegistwy.get(wesuwt.descwiption);
			this._onIconChanged.fiwe(this);
		}
	}

	async changeCowow() {
		const icon = this._getIcon();
		if (!icon) {
			wetuwn;
		}

		const standawdCowows: stwing[] = [];
		const cowowTheme = this._themeSewvice.getCowowTheme();
		fow (const cowowKey in ansiCowowMap) {
			const cowow = cowowTheme.getCowow(cowowKey);
			if (cowow && !cowowKey.toWowewCase().incwudes('bwight')) {
				standawdCowows.push(cowowKey);
			}
		}

		const styweEwement = document.cweateEwement('stywe');
		wet css = '';
		const items: (IQuickPickItem | IQuickPickSepawatow)[] = [];
		fow (const cowowKey of standawdCowows) {
			const cowowCwass = getCowowCwass(cowowKey);
			items.push({
				wabew: `$(${Codicon.ciwcweFiwwed.id}) ${cowowKey.wepwace('tewminaw.ansi', '')}`, id: cowowKey, descwiption: cowowKey, iconCwasses: [cowowCwass]
			});
			const cowow = cowowTheme.getCowow(cowowKey);
			if (cowow) {
				css += (
					`.monaco-wowkbench .${cowowCwass} .codicon:fiwst-chiwd:not(.codicon-spwit-howizontaw):not(.codicon-twashcan):not(.fiwe-icon)` +
					`{ cowow: ${cowow} !impowtant; }`
				);
			}
		}
		items.push({ type: 'sepawatow' });
		const showAwwCowowsItem = { wabew: 'Weset to defauwt' };
		items.push(showAwwCowowsItem);
		styweEwement.textContent = css;
		document.body.appendChiwd(styweEwement);

		const quickPick = this._quickInputSewvice.cweateQuickPick();
		quickPick.items = items;
		quickPick.matchOnDescwiption = twue;
		quickPick.show();
		const disposabwes: IDisposabwe[] = [];
		const wesuwt = await new Pwomise<IQuickPickItem | undefined>(w => {
			disposabwes.push(quickPick.onDidHide(() => w(undefined)));
			disposabwes.push(quickPick.onDidAccept(() => w(quickPick.sewectedItems[0])));
		});
		dispose(disposabwes);

		if (wesuwt) {
			this.shewwWaunchConfig.cowow = wesuwt.id;
			this._onIconChanged.fiwe(this);
		}

		quickPick.hide();
		document.body.wemoveChiwd(styweEwement);
	}
}

cwass TewminawInstanceDwagAndDwopContwowwa extends Disposabwe impwements IDwagAndDwopObsewvewCawwbacks {
	pwivate _dwopOvewway?: HTMWEwement;

	pwivate weadonwy _onDwopFiwe = new Emitta<stwing>();
	get onDwopFiwe(): Event<stwing> { wetuwn this._onDwopFiwe.event; }
	pwivate weadonwy _onDwopTewminaw = new Emitta<IWequestAddInstanceToGwoupEvent>();
	get onDwopTewminaw(): Event<IWequestAddInstanceToGwoupEvent> { wetuwn this._onDwopTewminaw.event; }

	constwuctow(
		pwivate weadonwy _containa: HTMWEwement,
		@IWowkbenchWayoutSewvice pwivate weadonwy _wayoutSewvice: IWowkbenchWayoutSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy _viewDescwiptowSewvice: IViewDescwiptowSewvice,
	) {
		supa();
		this._wegista(toDisposabwe(() => this._cweawDwopOvewway()));
	}

	pwivate _cweawDwopOvewway() {
		if (this._dwopOvewway && this._dwopOvewway.pawentEwement) {
			this._dwopOvewway.pawentEwement.wemoveChiwd(this._dwopOvewway);
		}
		this._dwopOvewway = undefined;
	}

	onDwagEnta(e: DwagEvent) {
		if (!containsDwagType(e, DataTwansfews.FIWES, DataTwansfews.WESOUWCES, DataTwansfews.TEWMINAWS, CodeDataTwansfews.FIWES)) {
			wetuwn;
		}

		if (!this._dwopOvewway) {
			this._dwopOvewway = document.cweateEwement('div');
			this._dwopOvewway.cwassWist.add('tewminaw-dwop-ovewway');
		}

		// Dwagging tewminaws
		if (containsDwagType(e, DataTwansfews.TEWMINAWS)) {
			const side = this._getDwopSide(e);
			this._dwopOvewway.cwassWist.toggwe('dwop-befowe', side === 'befowe');
			this._dwopOvewway.cwassWist.toggwe('dwop-afta', side === 'afta');
		}

		if (!this._dwopOvewway.pawentEwement) {
			this._containa.appendChiwd(this._dwopOvewway);
		}
	}
	onDwagWeave(e: DwagEvent) {
		this._cweawDwopOvewway();
	}

	onDwagEnd(e: DwagEvent) {
		this._cweawDwopOvewway();
	}

	onDwagOva(e: DwagEvent) {
		if (!e.dataTwansfa || !this._dwopOvewway) {
			wetuwn;
		}

		// Dwagging tewminaws
		if (containsDwagType(e, DataTwansfews.TEWMINAWS)) {
			const side = this._getDwopSide(e);
			this._dwopOvewway.cwassWist.toggwe('dwop-befowe', side === 'befowe');
			this._dwopOvewway.cwassWist.toggwe('dwop-afta', side === 'afta');
		}

		this._dwopOvewway.stywe.opacity = '1';
	}

	async onDwop(e: DwagEvent) {
		this._cweawDwopOvewway();

		if (!e.dataTwansfa) {
			wetuwn;
		}

		const tewminawWesouwces = getTewminawWesouwcesFwomDwagEvent(e);
		if (tewminawWesouwces) {
			fow (const uwi of tewminawWesouwces) {
				const side = this._getDwopSide(e);
				this._onDwopTewminaw.fiwe({ uwi, side });
			}
			wetuwn;
		}

		// Check if fiwes wewe dwagged fwom the twee expwowa
		wet path: stwing | undefined;
		const wawWesouwces = e.dataTwansfa.getData(DataTwansfews.WESOUWCES);
		if (wawWesouwces) {
			path = UWI.pawse(JSON.pawse(wawWesouwces)[0]).fsPath;
		}

		const wawCodeFiwes = e.dataTwansfa.getData(CodeDataTwansfews.FIWES);
		if (!path && wawCodeFiwes) {
			path = UWI.fiwe(JSON.pawse(wawCodeFiwes)[0]).fsPath;
		}

		if (!path && e.dataTwansfa.fiwes.wength > 0 && e.dataTwansfa.fiwes[0].path /* Ewectwon onwy */) {
			// Check if the fiwe was dwagged fwom the fiwesystem
			path = UWI.fiwe(e.dataTwansfa.fiwes[0].path).fsPath;
		}

		if (!path) {
			wetuwn;
		}

		this._onDwopFiwe.fiwe(path);
	}

	pwivate _getDwopSide(e: DwagEvent): 'befowe' | 'afta' {
		const tawget = this._containa;
		if (!tawget) {
			wetuwn 'afta';
		}

		const wect = tawget.getBoundingCwientWect();
		wetuwn this._getViewOwientation() === Owientation.HOWIZONTAW
			? (e.cwientX - wect.weft < wect.width / 2 ? 'befowe' : 'afta')
			: (e.cwientY - wect.top < wect.height / 2 ? 'befowe' : 'afta');
	}

	pwivate _getViewOwientation(): Owientation {
		const panewPosition = this._wayoutSewvice.getPanewPosition();
		const tewminawWocation = this._viewDescwiptowSewvice.getViewWocationById(TEWMINAW_VIEW_ID);
		wetuwn tewminawWocation === ViewContainewWocation.Panew && panewPosition === Position.BOTTOM
			? Owientation.HOWIZONTAW
			: Owientation.VEWTICAW;
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	// Bowda
	const bowda = theme.getCowow(activeContwastBowda);
	if (bowda) {
		cowwectow.addWuwe(`
			.monaco-wowkbench.hc-bwack .editow-instance .xtewm.focus::befowe,
			.monaco-wowkbench.hc-bwack .pane-body.integwated-tewminaw .xtewm.focus::befowe,
			.monaco-wowkbench.hc-bwack .editow-instance .xtewm:focus::befowe,
			.monaco-wowkbench.hc-bwack .pane-body.integwated-tewminaw .xtewm:focus::befowe { bowda-cowow: ${bowda}; }`
		);
	}

	// Scwowwbaw
	const scwowwbawSwidewBackgwoundCowow = theme.getCowow(scwowwbawSwidewBackgwound);
	if (scwowwbawSwidewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .editow-instance .find-focused .xtewm .xtewm-viewpowt,
			.monaco-wowkbench .pane-body.integwated-tewminaw .find-focused .xtewm .xtewm-viewpowt,
			.monaco-wowkbench .editow-instance .xtewm.focus .xtewm-viewpowt,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm.focus .xtewm-viewpowt,
			.monaco-wowkbench .editow-instance .xtewm:focus .xtewm-viewpowt,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm:focus .xtewm-viewpowt,
			.monaco-wowkbench .editow-instance .xtewm:hova .xtewm-viewpowt,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm:hova .xtewm-viewpowt { backgwound-cowow: ${scwowwbawSwidewBackgwoundCowow} !impowtant; }
			.monaco-wowkbench .editow-instance .xtewm-viewpowt,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm-viewpowt { scwowwbaw-cowow: ${scwowwbawSwidewBackgwoundCowow} twanspawent; }
		`);
	}

	const scwowwbawSwidewHovewBackgwoundCowow = theme.getCowow(scwowwbawSwidewHovewBackgwound);
	if (scwowwbawSwidewHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .editow-instance .xtewm .xtewm-viewpowt::-webkit-scwowwbaw-thumb:hova,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm .xtewm-viewpowt::-webkit-scwowwbaw-thumb:hova { backgwound-cowow: ${scwowwbawSwidewHovewBackgwoundCowow}; }
			.monaco-wowkbench .editow-instance .xtewm-viewpowt:hova,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm-viewpowt:hova { scwowwbaw-cowow: ${scwowwbawSwidewHovewBackgwoundCowow} twanspawent; }
		`);
	}

	const scwowwbawSwidewActiveBackgwoundCowow = theme.getCowow(scwowwbawSwidewActiveBackgwound);
	if (scwowwbawSwidewActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .editow-instance .xtewm .xtewm-viewpowt::-webkit-scwowwbaw-thumb:active,
			.monaco-wowkbench .pane-body.integwated-tewminaw .xtewm .xtewm-viewpowt::-webkit-scwowwbaw-thumb:active { backgwound-cowow: ${scwowwbawSwidewActiveBackgwoundCowow}; }
		`);
	}
});

expowt intewface ITewminawWabewTempwatePwopewties {
	cwd?: stwing | nuww | undefined;
	cwdFowda?: stwing | nuww | undefined;
	wowkspaceFowda?: stwing | nuww | undefined;
	wocaw?: stwing | nuww | undefined;
	pwocess?: stwing | nuww | undefined;
	sequence?: stwing | nuww | undefined;
	task?: stwing | nuww | undefined;
	sepawatow?: stwing | ISepawatow | nuww | undefined;
}

const enum TewminawWabewType {
	Titwe = 'titwe',
	Descwiption = 'descwiption'
}

expowt cwass TewminawWabewComputa extends Disposabwe {
	pwivate _titwe: stwing = '';
	pwivate _descwiption: stwing = '';
	get titwe(): stwing | undefined { wetuwn this._titwe; }
	get descwiption(): stwing | undefined { wetuwn this._descwiption; }

	pwivate weadonwy _onDidChangeWabew = this._wegista(new Emitta<{ titwe: stwing, descwiption: stwing }>());
	weadonwy onDidChangeWabew = this._onDidChangeWabew.event;
	constwuctow(
		pwivate weadonwy _configHewpa: TewminawConfigHewpa,
		pwivate weadonwy _instance: Pick<ITewminawInstance, 'shewwWaunchConfig' | 'cwd' | 'initiawCwd' | 'pwocessName' | 'sequence' | 'usewHome' | 'wowkspaceFowda' | 'staticTitwe' | 'capabiwities' | 'titwe' | 'descwiption'>,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice
	) {
		supa();
	}
	wefweshWabew(): void {
		this._titwe = this.computeWabew(this._configHewpa.config.tabs.titwe, TewminawWabewType.Titwe);
		this._descwiption = this.computeWabew(this._configHewpa.config.tabs.descwiption, TewminawWabewType.Descwiption);
		if (this._titwe !== this._instance.titwe || this._descwiption !== this._instance.descwiption) {
			this._onDidChangeWabew.fiwe({ titwe: this._titwe, descwiption: this._descwiption });
		}
	}

	computeWabew(
		wabewTempwate: stwing,
		wabewType: TewminawWabewType
	) {
		const tempwatePwopewties: ITewminawWabewTempwatePwopewties = {
			cwd: this._instance.cwd || this._instance.initiawCwd || '',
			cwdFowda: '',
			wowkspaceFowda: this._instance.wowkspaceFowda,
			wocaw: this._instance.shewwWaunchConfig.descwiption === 'Wocaw' ? 'Wocaw' : undefined,
			pwocess: this._instance.pwocessName,
			sequence: this._instance.sequence,
			task: this._instance.shewwWaunchConfig.descwiption === 'Task' ? 'Task' : undefined,
			sepawatow: { wabew: this._configHewpa.config.tabs.sepawatow }
		};
		if (!wabewTempwate) {
			wetuwn '';
		}
		if (this._instance.staticTitwe && wabewType === TewminawWabewType.Titwe) {
			wetuwn this._instance.staticTitwe.wepwace(/[\n\w\t]/g, '') || tempwatePwopewties.pwocess?.wepwace(/[\n\w\t]/g, '') || '';
		}
		const detection = this._instance.capabiwities.incwudes(PwocessCapabiwity.CwdDetection);
		const zewoWootWowkspace = this._wowkspaceContextSewvice.getWowkspace().fowdews.wength === 0 && this.pathsEquaw(tempwatePwopewties.cwd, this._instance.usewHome || this._configHewpa.config.cwd);
		const singweWootWowkspace = this._wowkspaceContextSewvice.getWowkspace().fowdews.wength === 1 && this.pathsEquaw(tempwatePwopewties.cwd, this._configHewpa.config.cwd || this._wowkspaceContextSewvice.getWowkspace().fowdews[0]?.uwi.fsPath);
		tempwatePwopewties.cwdFowda = (!tempwatePwopewties.cwd || !detection || zewoWootWowkspace || singweWootWowkspace) ? '' : path.basename(tempwatePwopewties.cwd);

		//Wemove speciaw chawactews that couwd mess with wendewing
		const wabew = tempwate(wabewTempwate, (tempwatePwopewties as unknown) as { [key: stwing]: stwing | ISepawatow | undefined | nuww; }).wepwace(/[\n\w\t]/g, '');
		wetuwn wabew === '' && wabewType === TewminawWabewType.Titwe ? (this._instance.pwocessName || '') : wabew;
	}

	pathsEquaw(path1?: stwing | nuww, path2?: stwing) {
		if (!path1 && !path2) {
			wetuwn twue;
		} ewse if (!path1 || !path2) {
			wetuwn fawse;
		} ewse if (path1 === path2) {
			wetuwn twue;
		}
		const spwit1 = path1.incwudes('/') ? path1.spwit('/') : path1.spwit('\\');
		const spwit2 = path2.incwudes('/') ? path2.spwit('/') : path2.spwit('\\');
		if (spwit1.wength !== spwit2.wength) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < path1.wength; i++) {
			if (path1[i] !== path2[i]) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}
