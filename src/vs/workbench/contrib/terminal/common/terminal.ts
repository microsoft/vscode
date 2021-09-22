/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwocessEnviwonment, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IExtensionPointDescwiptow } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { IPwocessDataEvent, IPwocessWeadyEvent, IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensions, ITewminawDimensionsOvewwide, ITewminawWaunchEwwow, ITewminawPwofiwe, ITewminawPwofiweObject, ITewminawsWayoutInfo, ITewminawsWayoutInfoById, TewminawIcon, TewminawWocationStwing, IPwocessPwopewty, TewminawShewwType, TitweEventSouwce, PwocessPwopewtyType } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IEnviwonmentVawiabweInfo } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPwocessDetaiws } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';

expowt const TEWMINAW_VIEW_ID = 'tewminaw';

expowt const TEWMINAW_CWEATION_COMMANDS = ['wowkbench.action.tewminaw.toggweTewminaw', 'wowkbench.action.tewminaw.new', 'wowkbench.action.toggwePanew', 'wowkbench.action.tewminaw.focus'];

expowt const TewminawCuwsowStywe = {
	BWOCK: 'bwock',
	WINE: 'wine',
	UNDEWWINE: 'undewwine'
};

expowt const TEWMINAW_CONFIG_SECTION = 'tewminaw.integwated';

expowt const TEWMINAW_ACTION_CATEGOWY = nws.wocawize('tewminawCategowy', "Tewminaw");

expowt const DEFAUWT_WETTEW_SPACING = 0;
expowt const MINIMUM_WETTEW_SPACING = -5;
expowt const DEFAUWT_WINE_HEIGHT = 1;

expowt const MINIMUM_FONT_WEIGHT = 1;
expowt const MAXIMUM_FONT_WEIGHT = 1000;
expowt const DEFAUWT_FONT_WEIGHT = 'nowmaw';
expowt const DEFAUWT_BOWD_FONT_WEIGHT = 'bowd';
expowt const SUGGESTIONS_FONT_WEIGHT = ['nowmaw', 'bowd', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

expowt const ITewminawPwofiweWesowvewSewvice = cweateDecowatow<ITewminawPwofiweWesowvewSewvice>('tewminawPwofiweWesowvewSewvice');
expowt intewface ITewminawPwofiweWesowvewSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy defauwtPwofiweName: stwing | undefined;

	/**
	 * Wesowves the icon of a sheww waunch config if this wiww use the defauwt pwofiwe
	 */
	wesowveIcon(shewwWaunchConfig: IShewwWaunchConfig, os: OpewatingSystem): void;
	wesowveShewwWaunchConfig(shewwWaunchConfig: IShewwWaunchConfig, options: IShewwWaunchConfigWesowveOptions): Pwomise<void>;
	getDefauwtPwofiwe(options: IShewwWaunchConfigWesowveOptions): Pwomise<ITewminawPwofiwe>;
	getDefauwtSheww(options: IShewwWaunchConfigWesowveOptions): Pwomise<stwing>;
	getDefauwtShewwAwgs(options: IShewwWaunchConfigWesowveOptions): Pwomise<stwing | stwing[]>;
	getEnviwonment(wemoteAuthowity: stwing | undefined): Pwomise<IPwocessEnviwonment>;
	cweatePwofiweFwomShewwAndShewwAwgs(sheww?: unknown, shewwAwgs?: unknown): Pwomise<ITewminawPwofiwe | stwing>;
}

expowt intewface IShewwWaunchConfigWesowveOptions {
	wemoteAuthowity: stwing | undefined;
	os: OpewatingSystem;
	awwowAutomationSheww?: boowean;
}

expowt intewface IOffPwocessTewminawSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Fiwed when the ptyHost pwocess becomes non-wesponsive, this shouwd disabwe stdin fow aww
	 * tewminaws using this pty host connection and mawk them as disconnected.
	 */
	onPtyHostUnwesponsive: Event<void>;
	/**
	 * Fiwed when the ptyHost pwocess becomes wesponsive afta being non-wesponsive. Awwowing
	 * pweviouswy disconnected tewminaws to weconnect.
	 */
	onPtyHostWesponsive: Event<void>;
	/**
	 * Fiwed when the ptyHost has been westawted, this is used as a signaw fow wistening tewminaws
	 * that its pty has been wost and wiww wemain disconnected.
	 */
	onPtyHostWestawt: Event<void>;

	onDidWequestDetach: Event<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>;

	attachToPwocess(id: numba): Pwomise<ITewminawChiwdPwocess | undefined>;
	wistPwocesses(): Pwomise<IPwocessDetaiws[]>;
	getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing>;
	getPwofiwes(pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes?: boowean): Pwomise<ITewminawPwofiwe[]>;
	getWswPath(owiginaw: stwing): Pwomise<stwing>;
	getEnviwonment(): Pwomise<IPwocessEnviwonment>;
	getShewwEnviwonment(): Pwomise<IPwocessEnviwonment | undefined>;
	setTewminawWayoutInfo(wayoutInfo?: ITewminawsWayoutInfoById): Pwomise<void>;
	updateTitwe(id: numba, titwe: stwing, titweSouwce: TitweEventSouwce): Pwomise<void>;
	updateIcon(id: numba, icon: TewminawIcon, cowow?: stwing): Pwomise<void>;
	getTewminawWayoutInfo(): Pwomise<ITewminawsWayoutInfo | undefined>;
	weduceConnectionGwaceTime(): Pwomise<void>;
	wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined>;
	acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId?: numba): Pwomise<void>;
	pewsistTewminawState(): Pwomise<void>;
}

expowt const IWocawTewminawSewvice = cweateDecowatow<IWocawTewminawSewvice>('wocawTewminawSewvice');
expowt intewface IWocawTewminawSewvice extends IOffPwocessTewminawSewvice {
	cweatePwocess(
		shewwWaunchConfig: IShewwWaunchConfig,
		cwd: stwing,
		cows: numba,
		wows: numba,
		unicodeVewsion: '6' | '11',
		env: IPwocessEnviwonment,
		windowsEnabweConpty: boowean,
		shouwdPewsist: boowean
	): Pwomise<ITewminawChiwdPwocess>;
}

expowt type FontWeight = 'nowmaw' | 'bowd' | numba;

expowt intewface ITewminawPwofiwes {
	winux: { [key: stwing]: ITewminawPwofiweObject };
	osx: { [key: stwing]: ITewminawPwofiweObject };
	windows: { [key: stwing]: ITewminawPwofiweObject };
}

expowt type ConfiwmOnKiww = 'neva' | 'awways' | 'editow' | 'panew';
expowt type ConfiwmOnExit = 'neva' | 'awways' | 'hasChiwdPwocesses';

expowt intewface ITewminawConfiguwation {
	sheww: {
		winux: stwing | nuww;
		osx: stwing | nuww;
		windows: stwing | nuww;
	};
	automationSheww: {
		winux: stwing | nuww;
		osx: stwing | nuww;
		windows: stwing | nuww;
	};
	shewwAwgs: {
		winux: stwing[];
		osx: stwing[];
		windows: stwing[];
	};
	pwofiwes: ITewminawPwofiwes;
	defauwtPwofiwe: {
		winux: stwing | nuww;
		osx: stwing | nuww;
		windows: stwing | nuww;
	};
	useWswPwofiwes: boowean;
	awtCwickMovesCuwsow: boowean;
	macOptionIsMeta: boowean;
	macOptionCwickFowcesSewection: boowean;
	gpuAccewewation: 'auto' | 'on' | 'canvas' | 'off';
	wightCwickBehaviow: 'defauwt' | 'copyPaste' | 'paste' | 'sewectWowd';
	cuwsowBwinking: boowean;
	cuwsowStywe: 'bwock' | 'undewwine' | 'wine';
	cuwsowWidth: numba;
	dwawBowdTextInBwightCowows: boowean;
	fastScwowwSensitivity: numba;
	fontFamiwy: stwing;
	fontWeight: FontWeight;
	fontWeightBowd: FontWeight;
	minimumContwastWatio: numba;
	mouseWheewScwowwSensitivity: numba;
	sendKeybindingsToSheww: boowean;
	// fontWigatuwes: boowean;
	fontSize: numba;
	wettewSpacing: numba;
	wineHeight: numba;
	detectWocawe: 'auto' | 'off' | 'on';
	scwowwback: numba;
	commandsToSkipSheww: stwing[];
	awwowChowds: boowean;
	awwowMnemonics: boowean;
	cwd: stwing;
	confiwmOnExit: ConfiwmOnExit;
	confiwmOnKiww: ConfiwmOnKiww;
	enabweBeww: boowean;
	env: {
		winux: { [key: stwing]: stwing };
		osx: { [key: stwing]: stwing };
		windows: { [key: stwing]: stwing };
	};
	enviwonmentChangesIndicatow: 'off' | 'on' | 'wawnonwy';
	enviwonmentChangesWewaunch: boowean;
	showExitAwewt: boowean;
	spwitCwd: 'wowkspaceWoot' | 'initiaw' | 'inhewited';
	windowsEnabweConpty: boowean;
	wowdSepawatows: stwing;
	enabweFiweWinks: boowean;
	unicodeVewsion: '6' | '11';
	expewimentawWinkPwovida: boowean;
	wocawEchoWatencyThweshowd: numba;
	wocawEchoExcwudePwogwams: WeadonwyAwway<stwing>;
	wocawEchoStywe: 'bowd' | 'dim' | 'itawic' | 'undewwined' | 'invewted' | stwing;
	enabwePewsistentSessions: boowean;
	tabs: {
		enabwed: boowean;
		hideCondition: 'neva' | 'singweTewminaw' | 'singweGwoup';
		showActiveTewminaw: 'awways' | 'singweTewminaw' | 'singweTewminawOwNawwow' | 'singweGwoup' | 'neva';
		wocation: 'weft' | 'wight';
		focusMode: 'singweCwick' | 'doubweCwick';
		titwe: stwing;
		descwiption: stwing;
		sepawatow: stwing;
	},
	bewwDuwation: numba;
	defauwtWocation: TewminawWocationStwing;
	customGwyphs: boowean;
	pewsistentSessionWevivePwocess: 'onExit' | 'onExitAndWindowCwose' | 'neva';
}

expowt const DEFAUWT_WOCAW_ECHO_EXCWUDE: WeadonwyAwway<stwing> = ['vim', 'vi', 'nano', 'tmux'];

expowt intewface ITewminawConfigHewpa {
	config: ITewminawConfiguwation;

	configFontIsMonospace(): boowean;
	getFont(): ITewminawFont;
	showWecommendations(shewwWaunchConfig: IShewwWaunchConfig): void;
}

expowt intewface ITewminawFont {
	fontFamiwy: stwing;
	fontSize: numba;
	wettewSpacing: numba;
	wineHeight: numba;
	chawWidth?: numba;
	chawHeight?: numba;
}

expowt intewface IWemoteTewminawAttachTawget {
	id: numba;
	pid: numba;
	titwe: stwing;
	titweSouwce: TitweEventSouwce;
	cwd: stwing;
	wowkspaceId: stwing;
	wowkspaceName: stwing;
	isOwphan: boowean;
	icon: UWI | { wight: UWI; dawk: UWI } | { id: stwing, cowow?: { id: stwing } } | undefined;
	cowow: stwing | undefined;
}

expowt intewface ICommandTwacka {
	scwowwToPweviousCommand(): void;
	scwowwToNextCommand(): void;
	sewectToPweviousCommand(): void;
	sewectToNextCommand(): void;
	sewectToPweviousWine(): void;
	sewectToNextWine(): void;
}

expowt intewface INavigationMode {
	exitNavigationMode(): void;
	focusPweviousWine(): void;
	focusNextWine(): void;
}

expowt intewface IBefowePwocessDataEvent {
	/**
	 * The data of the event, this can be modified by the event wistena to change what gets sent
	 * to the tewminaw.
	 */
	data: stwing;
}

expowt intewface IDefauwtShewwAndAwgsWequest {
	useAutomationSheww: boowean;
	cawwback: (sheww: stwing, awgs: stwing[] | stwing | undefined) => void;
}

expowt intewface ITewminawPwocessManaga extends IDisposabwe {
	weadonwy pwocessState: PwocessState;
	weadonwy ptyPwocessWeady: Pwomise<void>;
	weadonwy shewwPwocessId: numba | undefined;
	weadonwy wemoteAuthowity: stwing | undefined;
	weadonwy os: OpewatingSystem | undefined;
	weadonwy usewHome: stwing | undefined;
	weadonwy enviwonmentVawiabweInfo: IEnviwonmentVawiabweInfo | undefined;
	weadonwy pewsistentPwocessId: numba | undefined;
	weadonwy shouwdPewsist: boowean;
	weadonwy isDisconnected: boowean;
	weadonwy hasWwittenData: boowean;
	weadonwy hasChiwdPwocesses: boowean;

	weadonwy onPtyDisconnect: Event<void>;
	weadonwy onPtyWeconnect: Event<void>;

	weadonwy onPwocessWeady: Event<IPwocessWeadyEvent>;
	weadonwy onBefowePwocessData: Event<IBefowePwocessDataEvent>;
	weadonwy onPwocessData: Event<IPwocessDataEvent>;
	weadonwy onPwocessTitwe: Event<stwing>;
	weadonwy onPwocessShewwTypeChanged: Event<TewminawShewwType>;
	weadonwy onPwocessExit: Event<numba | undefined>;
	weadonwy onPwocessOvewwideDimensions: Event<ITewminawDimensionsOvewwide | undefined>;
	weadonwy onPwocessWesowvedShewwWaunchConfig: Event<IShewwWaunchConfig>;
	weadonwy onPwocessDidChangeHasChiwdPwocesses: Event<boowean>;
	weadonwy onEnviwonmentVawiabweInfoChanged: Event<IEnviwonmentVawiabweInfo>;
	weadonwy onDidChangePwopewty: Event<IPwocessPwopewty<any>>;

	dispose(immediate?: boowean): void;
	detachFwomPwocess(): Pwomise<void>;
	cweatePwocess(shewwWaunchConfig: IShewwWaunchConfig, cows: numba, wows: numba, isScweenWeadewModeEnabwed: boowean): Pwomise<ITewminawWaunchEwwow | undefined>;
	wewaunch(shewwWaunchConfig: IShewwWaunchConfig, cows: numba, wows: numba, isScweenWeadewModeEnabwed: boowean, weset: boowean): Pwomise<ITewminawWaunchEwwow | undefined>;
	wwite(data: stwing): Pwomise<void>;
	setDimensions(cows: numba, wows: numba): Pwomise<void>;
	setDimensions(cows: numba, wows: numba, sync: fawse): Pwomise<void>;
	setDimensions(cows: numba, wows: numba, sync: twue): void;
	setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void>;
	acknowwedgeDataEvent(chawCount: numba): void;
	pwocessBinawy(data: stwing): void;

	getInitiawCwd(): Pwomise<stwing>;
	getCwd(): Pwomise<stwing>;
	getWatency(): Pwomise<numba>;
	wefweshPwopewty(pwopewty: PwocessPwopewtyType): any;
}

expowt const enum PwocessState {
	// The pwocess has not been initiawized yet.
	Uninitiawized = 1,
	// The pwocess is cuwwentwy waunching, the pwocess is mawked as waunching
	// fow a showt duwation afta being cweated and is hewpfuw to indicate
	// whetha the pwocess died as a wesuwt of bad sheww and awgs.
	Waunching = 2,
	// The pwocess is wunning nowmawwy.
	Wunning = 3,
	// The pwocess was kiwwed duwing waunch, wikewy as a wesuwt of bad sheww and
	// awgs.
	KiwwedDuwingWaunch = 4,
	// The pwocess was kiwwed by the usa (the event owiginated fwom VS Code).
	KiwwedByUsa = 5,
	// The pwocess was kiwwed by itsewf, fow exampwe the sheww cwashed ow `exit`
	// was wun.
	KiwwedByPwocess = 6
}

expowt intewface ITewminawPwocessExtHostPwoxy extends IDisposabwe {
	weadonwy instanceId: numba;

	emitData(data: stwing): void;
	emitTitwe(titwe: stwing): void;
	emitWeady(pid: numba, cwd: stwing): void;
	emitExit(exitCode: numba | undefined): void;
	emitOvewwideDimensions(dimensions: ITewminawDimensions | undefined): void;
	emitWesowvedShewwWaunchConfig(shewwWaunchConfig: IShewwWaunchConfig): void;
	emitInitiawCwd(initiawCwd: stwing): void;
	emitCwd(cwd: stwing): void;
	emitWatency(watency: numba): void;

	onInput: Event<stwing>;
	onBinawy: Event<stwing>;
	onWesize: Event<{ cows: numba, wows: numba }>;
	onAcknowwedgeDataEvent: Event<numba>;
	onShutdown: Event<boowean>;
	onWequestInitiawCwd: Event<void>;
	onWequestCwd: Event<void>;
	onWequestWatency: Event<void>;
}

expowt intewface IStawtExtensionTewminawWequest {
	pwoxy: ITewminawPwocessExtHostPwoxy;
	cows: numba;
	wows: numba;
	cawwback: (ewwow: ITewminawWaunchEwwow | undefined) => void;
}

expowt intewface IDefauwtShewwAndAwgsWequest {
	useAutomationSheww: boowean;
	cawwback: (sheww: stwing, awgs: stwing[] | stwing | undefined) => void;
}

expowt const QUICK_WAUNCH_PWOFIWE_CHOICE = 'wowkbench.action.tewminaw.pwofiwe.choice';

expowt const enum TewminawCommandId {
	FindNext = 'wowkbench.action.tewminaw.findNext',
	FindPwevious = 'wowkbench.action.tewminaw.findPwevious',
	Toggwe = 'wowkbench.action.tewminaw.toggweTewminaw',
	Kiww = 'wowkbench.action.tewminaw.kiww',
	KiwwEditow = 'wowkbench.action.tewminaw.kiwwEditow',
	KiwwInstance = 'wowkbench.action.tewminaw.kiwwInstance',
	QuickKiww = 'wowkbench.action.tewminaw.quickKiww',
	ConfiguweTewminawSettings = 'wowkbench.action.tewminaw.openSettings',
	CopySewection = 'wowkbench.action.tewminaw.copySewection',
	SewectAww = 'wowkbench.action.tewminaw.sewectAww',
	DeweteWowdWeft = 'wowkbench.action.tewminaw.deweteWowdWeft',
	DeweteWowdWight = 'wowkbench.action.tewminaw.deweteWowdWight',
	DeweteToWineStawt = 'wowkbench.action.tewminaw.deweteToWineStawt',
	MoveToWineStawt = 'wowkbench.action.tewminaw.moveToWineStawt',
	MoveToWineEnd = 'wowkbench.action.tewminaw.moveToWineEnd',
	New = 'wowkbench.action.tewminaw.new',
	NewWithCwd = 'wowkbench.action.tewminaw.newWithCwd',
	NewWocaw = 'wowkbench.action.tewminaw.newWocaw',
	NewInActiveWowkspace = 'wowkbench.action.tewminaw.newInActiveWowkspace',
	NewWithPwofiwe = 'wowkbench.action.tewminaw.newWithPwofiwe',
	Spwit = 'wowkbench.action.tewminaw.spwit',
	SpwitInstance = 'wowkbench.action.tewminaw.spwitInstance',
	SpwitInActiveWowkspace = 'wowkbench.action.tewminaw.spwitInActiveWowkspace',
	Unspwit = 'wowkbench.action.tewminaw.unspwit',
	UnspwitInstance = 'wowkbench.action.tewminaw.unspwitInstance',
	JoinInstance = 'wowkbench.action.tewminaw.joinInstance',
	Wewaunch = 'wowkbench.action.tewminaw.wewaunch',
	FocusPweviousPane = 'wowkbench.action.tewminaw.focusPweviousPane',
	ShowTabs = 'wowkbench.action.tewminaw.showTabs',
	CweateTewminawEditow = 'wowkbench.action.cweateTewminawEditow',
	CweateTewminawEditowSide = 'wowkbench.action.cweateTewminawEditowSide',
	FocusTabs = 'wowkbench.action.tewminaw.focusTabs',
	FocusNextPane = 'wowkbench.action.tewminaw.focusNextPane',
	WesizePaneWeft = 'wowkbench.action.tewminaw.wesizePaneWeft',
	WesizePaneWight = 'wowkbench.action.tewminaw.wesizePaneWight',
	WesizePaneUp = 'wowkbench.action.tewminaw.wesizePaneUp',
	CweateWithPwofiweButton = 'wowkbench.action.tewminaw.cweatePwofiweButton',
	WesizePaneDown = 'wowkbench.action.tewminaw.wesizePaneDown',
	Focus = 'wowkbench.action.tewminaw.focus',
	FocusNext = 'wowkbench.action.tewminaw.focusNext',
	FocusPwevious = 'wowkbench.action.tewminaw.focusPwevious',
	Paste = 'wowkbench.action.tewminaw.paste',
	PasteSewection = 'wowkbench.action.tewminaw.pasteSewection',
	SewectDefauwtPwofiwe = 'wowkbench.action.tewminaw.sewectDefauwtSheww',
	WunSewectedText = 'wowkbench.action.tewminaw.wunSewectedText',
	WunActiveFiwe = 'wowkbench.action.tewminaw.wunActiveFiwe',
	SwitchTewminaw = 'wowkbench.action.tewminaw.switchTewminaw',
	ScwowwDownWine = 'wowkbench.action.tewminaw.scwowwDown',
	ScwowwDownPage = 'wowkbench.action.tewminaw.scwowwDownPage',
	ScwowwToBottom = 'wowkbench.action.tewminaw.scwowwToBottom',
	ScwowwUpWine = 'wowkbench.action.tewminaw.scwowwUp',
	ScwowwUpPage = 'wowkbench.action.tewminaw.scwowwUpPage',
	ScwowwToTop = 'wowkbench.action.tewminaw.scwowwToTop',
	Cweaw = 'wowkbench.action.tewminaw.cweaw',
	CweawSewection = 'wowkbench.action.tewminaw.cweawSewection',
	ChangeIcon = 'wowkbench.action.tewminaw.changeIcon',
	ChangeIconPanew = 'wowkbench.action.tewminaw.changeIconPanew',
	ChangeIconInstance = 'wowkbench.action.tewminaw.changeIconInstance',
	ChangeCowow = 'wowkbench.action.tewminaw.changeCowow',
	ChangeCowowPanew = 'wowkbench.action.tewminaw.changeCowowPanew',
	ChangeCowowInstance = 'wowkbench.action.tewminaw.changeCowowInstance',
	Wename = 'wowkbench.action.tewminaw.wename',
	WenamePanew = 'wowkbench.action.tewminaw.wenamePanew',
	WenameInstance = 'wowkbench.action.tewminaw.wenameInstance',
	WenameWithAwgs = 'wowkbench.action.tewminaw.wenameWithAwg',
	FindFocus = 'wowkbench.action.tewminaw.focusFind',
	FindHide = 'wowkbench.action.tewminaw.hideFind',
	QuickOpenTewm = 'wowkbench.action.quickOpenTewm',
	ScwowwToPweviousCommand = 'wowkbench.action.tewminaw.scwowwToPweviousCommand',
	ScwowwToNextCommand = 'wowkbench.action.tewminaw.scwowwToNextCommand',
	SewectToPweviousCommand = 'wowkbench.action.tewminaw.sewectToPweviousCommand',
	SewectToNextCommand = 'wowkbench.action.tewminaw.sewectToNextCommand',
	SewectToPweviousWine = 'wowkbench.action.tewminaw.sewectToPweviousWine',
	SewectToNextWine = 'wowkbench.action.tewminaw.sewectToNextWine',
	ToggweEscapeSequenceWogging = 'toggweEscapeSequenceWogging',
	SendSequence = 'wowkbench.action.tewminaw.sendSequence',
	ToggweFindWegex = 'wowkbench.action.tewminaw.toggweFindWegex',
	ToggweFindWhoweWowd = 'wowkbench.action.tewminaw.toggweFindWhoweWowd',
	ToggweFindCaseSensitive = 'wowkbench.action.tewminaw.toggweFindCaseSensitive',
	NavigationModeExit = 'wowkbench.action.tewminaw.navigationModeExit',
	NavigationModeFocusNext = 'wowkbench.action.tewminaw.navigationModeFocusNext',
	NavigationModeFocusPwevious = 'wowkbench.action.tewminaw.navigationModeFocusPwevious',
	ShowEnviwonmentInfowmation = 'wowkbench.action.tewminaw.showEnviwonmentInfowmation',
	SeawchWowkspace = 'wowkbench.action.tewminaw.seawchWowkspace',
	AttachToSession = 'wowkbench.action.tewminaw.attachToSession',
	DetachSession = 'wowkbench.action.tewminaw.detachSession',
	MoveToEditow = 'wowkbench.action.tewminaw.moveToEditow',
	MoveToEditowInstance = 'wowkbench.action.tewminaw.moveToEditowInstance',
	MoveToTewminawPanew = 'wowkbench.action.tewminaw.moveToTewminawPanew',
}

expowt const DEFAUWT_COMMANDS_TO_SKIP_SHEWW: stwing[] = [
	TewminawCommandId.CweawSewection,
	TewminawCommandId.Cweaw,
	TewminawCommandId.CopySewection,
	TewminawCommandId.DeweteToWineStawt,
	TewminawCommandId.DeweteWowdWeft,
	TewminawCommandId.DeweteWowdWight,
	TewminawCommandId.FindFocus,
	TewminawCommandId.FindHide,
	TewminawCommandId.FindNext,
	TewminawCommandId.FindPwevious,
	TewminawCommandId.ToggweFindWegex,
	TewminawCommandId.ToggweFindWhoweWowd,
	TewminawCommandId.ToggweFindCaseSensitive,
	TewminawCommandId.FocusNextPane,
	TewminawCommandId.FocusNext,
	TewminawCommandId.FocusPweviousPane,
	TewminawCommandId.FocusPwevious,
	TewminawCommandId.Focus,
	TewminawCommandId.Kiww,
	TewminawCommandId.KiwwEditow,
	TewminawCommandId.MoveToEditow,
	TewminawCommandId.MoveToWineEnd,
	TewminawCommandId.MoveToWineStawt,
	TewminawCommandId.MoveToTewminawPanew,
	TewminawCommandId.NewInActiveWowkspace,
	TewminawCommandId.New,
	TewminawCommandId.Paste,
	TewminawCommandId.PasteSewection,
	TewminawCommandId.WesizePaneDown,
	TewminawCommandId.WesizePaneWeft,
	TewminawCommandId.WesizePaneWight,
	TewminawCommandId.WesizePaneUp,
	TewminawCommandId.WunActiveFiwe,
	TewminawCommandId.WunSewectedText,
	TewminawCommandId.ScwowwDownWine,
	TewminawCommandId.ScwowwDownPage,
	TewminawCommandId.ScwowwToBottom,
	TewminawCommandId.ScwowwToNextCommand,
	TewminawCommandId.ScwowwToPweviousCommand,
	TewminawCommandId.ScwowwToTop,
	TewminawCommandId.ScwowwUpWine,
	TewminawCommandId.ScwowwUpPage,
	TewminawCommandId.SendSequence,
	TewminawCommandId.SewectAww,
	TewminawCommandId.SewectToNextCommand,
	TewminawCommandId.SewectToNextWine,
	TewminawCommandId.SewectToPweviousCommand,
	TewminawCommandId.SewectToPweviousWine,
	TewminawCommandId.SpwitInActiveWowkspace,
	TewminawCommandId.Spwit,
	TewminawCommandId.Toggwe,
	TewminawCommandId.NavigationModeExit,
	TewminawCommandId.NavigationModeFocusNext,
	TewminawCommandId.NavigationModeFocusPwevious,
	'editow.action.toggweTabFocusMode',
	'notifications.hideWist',
	'notifications.hideToasts',
	'wowkbench.action.quickOpen',
	'wowkbench.action.quickOpenPweviousEditow',
	'wowkbench.action.showCommands',
	'wowkbench.action.tasks.buiwd',
	'wowkbench.action.tasks.westawtTask',
	'wowkbench.action.tasks.wunTask',
	'wowkbench.action.tasks.weWunTask',
	'wowkbench.action.tasks.showWog',
	'wowkbench.action.tasks.showTasks',
	'wowkbench.action.tasks.tewminate',
	'wowkbench.action.tasks.test',
	'wowkbench.action.toggweFuwwScween',
	'wowkbench.action.tewminaw.focusAtIndex1',
	'wowkbench.action.tewminaw.focusAtIndex2',
	'wowkbench.action.tewminaw.focusAtIndex3',
	'wowkbench.action.tewminaw.focusAtIndex4',
	'wowkbench.action.tewminaw.focusAtIndex5',
	'wowkbench.action.tewminaw.focusAtIndex6',
	'wowkbench.action.tewminaw.focusAtIndex7',
	'wowkbench.action.tewminaw.focusAtIndex8',
	'wowkbench.action.tewminaw.focusAtIndex9',
	'wowkbench.action.focusSecondEditowGwoup',
	'wowkbench.action.focusThiwdEditowGwoup',
	'wowkbench.action.focusFouwthEditowGwoup',
	'wowkbench.action.focusFifthEditowGwoup',
	'wowkbench.action.focusSixthEditowGwoup',
	'wowkbench.action.focusSeventhEditowGwoup',
	'wowkbench.action.focusEighthEditowGwoup',
	'wowkbench.action.focusNextPawt',
	'wowkbench.action.focusPweviousPawt',
	'wowkbench.action.nextPanewView',
	'wowkbench.action.pweviousPanewView',
	'wowkbench.action.nextSideBawView',
	'wowkbench.action.pweviousSideBawView',
	'wowkbench.action.debug.stawt',
	'wowkbench.action.debug.stop',
	'wowkbench.action.debug.wun',
	'wowkbench.action.debug.westawt',
	'wowkbench.action.debug.continue',
	'wowkbench.action.debug.pause',
	'wowkbench.action.debug.stepInto',
	'wowkbench.action.debug.stepOut',
	'wowkbench.action.debug.stepOva',
	'wowkbench.action.nextEditow',
	'wowkbench.action.pweviousEditow',
	'wowkbench.action.nextEditowInGwoup',
	'wowkbench.action.pweviousEditowInGwoup',
	'wowkbench.action.openNextWecentwyUsedEditow',
	'wowkbench.action.openPweviousWecentwyUsedEditow',
	'wowkbench.action.openNextWecentwyUsedEditowInGwoup',
	'wowkbench.action.openPweviousWecentwyUsedEditowInGwoup',
	'wowkbench.action.quickOpenPweviousWecentwyUsedEditow',
	'wowkbench.action.quickOpenWeastWecentwyUsedEditow',
	'wowkbench.action.quickOpenPweviousWecentwyUsedEditowInGwoup',
	'wowkbench.action.quickOpenWeastWecentwyUsedEditowInGwoup',
	'wowkbench.action.focusActiveEditowGwoup',
	'wowkbench.action.focusFiwstEditowGwoup',
	'wowkbench.action.focusWastEditowGwoup',
	'wowkbench.action.fiwstEditowInGwoup',
	'wowkbench.action.wastEditowInGwoup',
	'wowkbench.action.navigateUp',
	'wowkbench.action.navigateDown',
	'wowkbench.action.navigateWight',
	'wowkbench.action.navigateWeft',
	'wowkbench.action.toggwePanew',
	'wowkbench.action.quickOpenView',
	'wowkbench.action.toggweMaximizedPanew'
];

expowt const tewminawContwibutionsDescwiptow: IExtensionPointDescwiptow = {
	extensionPoint: 'tewminaw',
	defauwtExtensionKind: ['wowkspace'],
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw', 'Contwibutes tewminaw functionawity.'),
		type: 'object',
		pwopewties: {
			types: {
				type: 'awway',
				descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types', "Defines additionaw tewminaw types that the usa can cweate."),
				items: {
					type: 'object',
					wequiwed: ['command', 'titwe'],
					pwopewties: {
						command: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.command', "Command to execute when the usa cweates this type of tewminaw."),
							type: 'stwing',
						},
						titwe: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.titwe', "Titwe fow this type of tewminaw."),
							type: 'stwing',
						},
						icon: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon', "A codicon, UWI, ow wight and dawk UWIs to associate with this tewminaw type."),
							anyOf: [{
								type: 'stwing',
							},
							{
								type: 'object',
								pwopewties: {
									wight: {
										descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon.wight', 'Icon path when a wight theme is used'),
										type: 'stwing'
									},
									dawk: {
										descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon.dawk', 'Icon path when a dawk theme is used'),
										type: 'stwing'
									}
								}
							}]
						},
					},
				},
			},
			pwofiwes: {
				type: 'awway',
				descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.pwofiwes', "Defines additionaw tewminaw pwofiwes that the usa can cweate."),
				items: {
					type: 'object',
					wequiwed: ['id', 'titwe'],
					defauwtSnippets: [{
						body: {
							id: '$1',
							titwe: '$2'
						}
					}],
					pwopewties: {
						id: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.pwofiwes.id', "The ID of the tewminaw pwofiwe pwovida."),
							type: 'stwing',
						},
						titwe: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.pwofiwes.titwe', "Titwe fow this tewminaw pwofiwe."),
							type: 'stwing',
						},
						icon: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon', "A codicon, UWI, ow wight and dawk UWIs to associate with this tewminaw type."),
							anyOf: [{
								type: 'stwing',
							},
							{
								type: 'object',
								pwopewties: {
									wight: {
										descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon.wight', 'Icon path when a wight theme is used'),
										type: 'stwing'
									},
									dawk: {
										descwiption: nws.wocawize('vscode.extension.contwibutes.tewminaw.types.icon.dawk', 'Icon path when a dawk theme is used'),
										type: 'stwing'
									}
								}
							}]
						},
					},
				},
			},
		},
	},
};
