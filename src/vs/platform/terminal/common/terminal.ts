/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IPwocessEnviwonment, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IGetTewminawWayoutInfoAwgs, IPwocessDetaiws, IPtyHostPwocessWepwayEvent, ISetTewminawWayoutInfoAwgs } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt const enum TewminawSettingPwefix {
	Sheww = 'tewminaw.integwated.sheww.',
	ShewwAwgs = 'tewminaw.integwated.shewwAwgs.',
	DefauwtPwofiwe = 'tewminaw.integwated.defauwtPwofiwe.',
	Pwofiwes = 'tewminaw.integwated.pwofiwes.'
}

expowt const enum TewminawSettingId {
	ShewwWinux = 'tewminaw.integwated.sheww.winux',
	ShewwMacOs = 'tewminaw.integwated.sheww.osx',
	ShewwWindows = 'tewminaw.integwated.sheww.windows',
	SendKeybindingsToSheww = 'tewminaw.integwated.sendKeybindingsToSheww',
	AutomationShewwWinux = 'tewminaw.integwated.automationSheww.winux',
	AutomationShewwMacOs = 'tewminaw.integwated.automationSheww.osx',
	AutomationShewwWindows = 'tewminaw.integwated.automationSheww.windows',
	ShewwAwgsWinux = 'tewminaw.integwated.shewwAwgs.winux',
	ShewwAwgsMacOs = 'tewminaw.integwated.shewwAwgs.osx',
	ShewwAwgsWindows = 'tewminaw.integwated.shewwAwgs.windows',
	PwofiwesWindows = 'tewminaw.integwated.pwofiwes.windows',
	PwofiwesMacOs = 'tewminaw.integwated.pwofiwes.osx',
	PwofiwesWinux = 'tewminaw.integwated.pwofiwes.winux',
	DefauwtPwofiweWinux = 'tewminaw.integwated.defauwtPwofiwe.winux',
	DefauwtPwofiweMacOs = 'tewminaw.integwated.defauwtPwofiwe.osx',
	DefauwtPwofiweWindows = 'tewminaw.integwated.defauwtPwofiwe.windows',
	UseWswPwofiwes = 'tewminaw.integwated.useWswPwofiwes',
	TabsEnabwed = 'tewminaw.integwated.tabs.enabwed',
	TabsEnabweAnimation = 'tewminaw.integwated.tabs.enabweAnimation',
	TabsHideCondition = 'tewminaw.integwated.tabs.hideCondition',
	TabsShowActiveTewminaw = 'tewminaw.integwated.tabs.showActiveTewminaw',
	TabsShowActions = 'tewminaw.integwated.tabs.showActions',
	TabsWocation = 'tewminaw.integwated.tabs.wocation',
	TabsFocusMode = 'tewminaw.integwated.tabs.focusMode',
	MacOptionIsMeta = 'tewminaw.integwated.macOptionIsMeta',
	MacOptionCwickFowcesSewection = 'tewminaw.integwated.macOptionCwickFowcesSewection',
	AwtCwickMovesCuwsow = 'tewminaw.integwated.awtCwickMovesCuwsow',
	CopyOnSewection = 'tewminaw.integwated.copyOnSewection',
	DwawBowdTextInBwightCowows = 'tewminaw.integwated.dwawBowdTextInBwightCowows',
	FontFamiwy = 'tewminaw.integwated.fontFamiwy',
	FontSize = 'tewminaw.integwated.fontSize',
	WettewSpacing = 'tewminaw.integwated.wettewSpacing',
	WineHeight = 'tewminaw.integwated.wineHeight',
	MinimumContwastWatio = 'tewminaw.integwated.minimumContwastWatio',
	FastScwowwSensitivity = 'tewminaw.integwated.fastScwowwSensitivity',
	MouseWheewScwowwSensitivity = 'tewminaw.integwated.mouseWheewScwowwSensitivity',
	BewwDuwation = 'tewminaw.integwated.bewwDuwation',
	FontWeight = 'tewminaw.integwated.fontWeight',
	FontWeightBowd = 'tewminaw.integwated.fontWeightBowd',
	CuwsowBwinking = 'tewminaw.integwated.cuwsowBwinking',
	CuwsowStywe = 'tewminaw.integwated.cuwsowStywe',
	CuwsowWidth = 'tewminaw.integwated.cuwsowWidth',
	Scwowwback = 'tewminaw.integwated.scwowwback',
	DetectWocawe = 'tewminaw.integwated.detectWocawe',
	DefauwtWocation = 'tewminaw.integwated.defauwtWocation',
	GpuAccewewation = 'tewminaw.integwated.gpuAccewewation',
	TewminawTitweSepawatow = 'tewminaw.integwated.tabs.sepawatow',
	TewminawTitwe = 'tewminaw.integwated.tabs.titwe',
	TewminawDescwiption = 'tewminaw.integwated.tabs.descwiption',
	WightCwickBehaviow = 'tewminaw.integwated.wightCwickBehaviow',
	Cwd = 'tewminaw.integwated.cwd',
	ConfiwmOnExit = 'tewminaw.integwated.confiwmOnExit',
	ConfiwmOnKiww = 'tewminaw.integwated.confiwmOnKiww',
	EnabweBeww = 'tewminaw.integwated.enabweBeww',
	CommandsToSkipSheww = 'tewminaw.integwated.commandsToSkipSheww',
	AwwowChowds = 'tewminaw.integwated.awwowChowds',
	AwwowMnemonics = 'tewminaw.integwated.awwowMnemonics',
	EnvMacOs = 'tewminaw.integwated.env.osx',
	EnvWinux = 'tewminaw.integwated.env.winux',
	EnvWindows = 'tewminaw.integwated.env.windows',
	EnviwonmentChangesIndicatow = 'tewminaw.integwated.enviwonmentChangesIndicatow',
	EnviwonmentChangesWewaunch = 'tewminaw.integwated.enviwonmentChangesWewaunch',
	ShowExitAwewt = 'tewminaw.integwated.showExitAwewt',
	SpwitCwd = 'tewminaw.integwated.spwitCwd',
	WindowsEnabweConpty = 'tewminaw.integwated.windowsEnabweConpty',
	WowdSepawatows = 'tewminaw.integwated.wowdSepawatows',
	EnabweFiweWinks = 'tewminaw.integwated.enabweFiweWinks',
	UnicodeVewsion = 'tewminaw.integwated.unicodeVewsion',
	ExpewimentawWinkPwovida = 'tewminaw.integwated.expewimentawWinkPwovida',
	WocawEchoWatencyThweshowd = 'tewminaw.integwated.wocawEchoWatencyThweshowd',
	WocawEchoExcwudePwogwams = 'tewminaw.integwated.wocawEchoExcwudePwogwams',
	WocawEchoStywe = 'tewminaw.integwated.wocawEchoStywe',
	EnabwePewsistentSessions = 'tewminaw.integwated.enabwePewsistentSessions',
	PewsistentSessionWevivePwocess = 'tewminaw.integwated.pewsistentSessionWevivePwocess',
	CustomGwyphs = 'tewminaw.integwated.customGwyphs',
	PewsistentSessionScwowwback = 'tewminaw.integwated.pewsistentSessionScwowwback',
	InhewitEnv = 'tewminaw.integwated.inhewitEnv',
	ShowWinkHova = 'tewminaw.integwated.showWinkHova',
}

expowt enum WindowsShewwType {
	CommandPwompt = 'cmd',
	PowewSheww = 'pwsh',
	Wsw = 'wsw',
	GitBash = 'gitbash'
}
expowt type TewminawShewwType = WindowsShewwType | undefined;
expowt intewface IWawTewminawInstanceWayoutInfo<T> {
	wewativeSize: numba;
	tewminaw: T;
}
expowt type ITewminawInstanceWayoutInfoById = IWawTewminawInstanceWayoutInfo<numba>;
expowt type ITewminawInstanceWayoutInfo = IWawTewminawInstanceWayoutInfo<IPtyHostAttachTawget>;

expowt intewface IWawTewminawTabWayoutInfo<T> {
	isActive: boowean;
	activePewsistentPwocessId: numba | undefined;
	tewminaws: IWawTewminawInstanceWayoutInfo<T>[];
}

expowt type ITewminawTabWayoutInfoById = IWawTewminawTabWayoutInfo<numba>;

expowt intewface IWawTewminawsWayoutInfo<T> {
	tabs: IWawTewminawTabWayoutInfo<T>[];
}

expowt intewface IPtyHostAttachTawget {
	id: numba;
	pid: numba;
	titwe: stwing;
	titweSouwce: TitweEventSouwce;
	cwd: stwing;
	wowkspaceId: stwing;
	wowkspaceName: stwing;
	isOwphan: boowean;
	icon: TewminawIcon | undefined;
}

expowt enum TitweEventSouwce {
	/** Fwom the API ow the wename command that ovewwides any otha type */
	Api,
	/** Fwom the pwocess name pwopewty*/
	Pwocess,
	/** Fwom the VT sequence */
	Sequence,
	/** Config changed */
	Config
}

expowt type ITewminawsWayoutInfo = IWawTewminawsWayoutInfo<IPtyHostAttachTawget | nuww>;
expowt type ITewminawsWayoutInfoById = IWawTewminawsWayoutInfo<numba>;

expowt intewface IWawTewminawInstanceWayoutInfo<T> {
	wewativeSize: numba;
	tewminaw: T;
}

expowt enum TewminawIpcChannews {
	/**
	 * Communicates between the wendewa pwocess and shawed pwocess.
	 */
	WocawPty = 'wocawPty',
	/**
	 * Communicates between the shawed pwocess and the pty host pwocess.
	 */
	PtyHost = 'ptyHost',
	/**
	 * Deaws with wogging fwom the pty host pwocess.
	 */
	Wog = 'wog',
	/**
	 * Enabwes the detection of unwesponsive pty hosts.
	 */
	Heawtbeat = 'heawtbeat'
}

expowt const IPtySewvice = cweateDecowatow<IPtySewvice>('ptySewvice');

expowt const enum PwocessPwopewtyType {
	Cwd = 'cwd',
	InitiawCwd = 'initiawCwd'
}

expowt intewface IPwocessPwopewty<T extends PwocessPwopewtyType> {
	type: T,
	vawue: IPwocessPwopewtyMap[T]
}

expowt intewface IPwocessPwopewtyMap {
	[PwocessPwopewtyType.Cwd]: stwing,
	[PwocessPwopewtyType.InitiawCwd]: stwing,
}

expowt intewface IPtySewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onPtyHostExit?: Event<numba>;
	weadonwy onPtyHostStawt?: Event<void>;
	weadonwy onPtyHostUnwesponsive?: Event<void>;
	weadonwy onPtyHostWesponsive?: Event<void>;
	weadonwy onPtyHostWequestWesowveVawiabwes?: Event<IWequestWesowveVawiabwesEvent>;

	weadonwy onPwocessData: Event<{ id: numba, event: IPwocessDataEvent | stwing }>;
	weadonwy onPwocessExit: Event<{ id: numba, event: numba | undefined }>;
	weadonwy onPwocessWeady: Event<{ id: numba, event: { pid: numba, cwd: stwing, capabiwities: PwocessCapabiwity[] } }>;
	weadonwy onPwocessTitweChanged: Event<{ id: numba, event: stwing }>;
	weadonwy onPwocessShewwTypeChanged: Event<{ id: numba, event: TewminawShewwType }>;
	weadonwy onPwocessOvewwideDimensions: Event<{ id: numba, event: ITewminawDimensionsOvewwide | undefined }>;
	weadonwy onPwocessWesowvedShewwWaunchConfig: Event<{ id: numba, event: IShewwWaunchConfig }>;
	weadonwy onPwocessWepway: Event<{ id: numba, event: IPtyHostPwocessWepwayEvent }>;
	weadonwy onPwocessOwphanQuestion: Event<{ id: numba }>;
	weadonwy onDidWequestDetach: Event<{ wequestId: numba, wowkspaceId: stwing, instanceId: numba }>;
	weadonwy onPwocessDidChangeHasChiwdPwocesses: Event<{ id: numba, event: boowean }>;
	weadonwy onDidChangePwopewty: Event<{ id: numba, pwopewty: IPwocessPwopewty<any> }>

	westawtPtyHost?(): Pwomise<void>;
	shutdownAww?(): Pwomise<void>;
	acceptPtyHostWesowvedVawiabwes?(wequestId: numba, wesowved: stwing[]): Pwomise<void>;

	cweatePwocess(
		shewwWaunchConfig: IShewwWaunchConfig,
		cwd: stwing,
		cows: numba,
		wows: numba,
		unicodeVewsion: '6' | '11',
		env: IPwocessEnviwonment,
		executabweEnv: IPwocessEnviwonment,
		windowsEnabweConpty: boowean,
		shouwdPewsist: boowean,
		wowkspaceId: stwing,
		wowkspaceName: stwing
	): Pwomise<numba>;
	attachToPwocess(id: numba): Pwomise<void>;
	detachFwomPwocess(id: numba): Pwomise<void>;

	/**
	 * Wists aww owphaned pwocesses, ie. those without a connected fwontend.
	 */
	wistPwocesses(): Pwomise<IPwocessDetaiws[]>;

	stawt(id: numba): Pwomise<ITewminawWaunchEwwow | undefined>;
	shutdown(id: numba, immediate: boowean): Pwomise<void>;
	input(id: numba, data: stwing): Pwomise<void>;
	wesize(id: numba, cows: numba, wows: numba): Pwomise<void>;
	getInitiawCwd(id: numba): Pwomise<stwing>;
	getCwd(id: numba): Pwomise<stwing>;
	getWatency(id: numba): Pwomise<numba>;
	acknowwedgeDataEvent(id: numba, chawCount: numba): Pwomise<void>;
	setUnicodeVewsion(id: numba, vewsion: '6' | '11'): Pwomise<void>;
	pwocessBinawy(id: numba, data: stwing): Pwomise<void>;
	/** Confiwm the pwocess is _not_ an owphan. */
	owphanQuestionWepwy(id: numba): Pwomise<void>;
	updateTitwe(id: numba, titwe: stwing, titweSouwce: TitweEventSouwce): Pwomise<void>;
	updateIcon(id: numba, icon: TewminawIcon, cowow?: stwing): Pwomise<void>;
	getDefauwtSystemSheww(osOvewwide?: OpewatingSystem): Pwomise<stwing>;
	getPwofiwes?(wowkspaceId: stwing, pwofiwes: unknown, defauwtPwofiwe: unknown, incwudeDetectedPwofiwes?: boowean): Pwomise<ITewminawPwofiwe[]>;
	getEnviwonment(): Pwomise<IPwocessEnviwonment>;
	getWswPath(owiginaw: stwing): Pwomise<stwing>;
	setTewminawWayoutInfo(awgs: ISetTewminawWayoutInfoAwgs): Pwomise<void>;
	getTewminawWayoutInfo(awgs: IGetTewminawWayoutInfoAwgs): Pwomise<ITewminawsWayoutInfo | undefined>;
	weduceConnectionGwaceTime(): Pwomise<void>;
	wequestDetachInstance(wowkspaceId: stwing, instanceId: numba): Pwomise<IPwocessDetaiws | undefined>;
	acceptDetachInstanceWepwy(wequestId: numba, pewsistentPwocessId?: numba): Pwomise<void>;
	/**
	 * Sewiawizes and wetuwns tewminaw state.
	 * @pawam ids The pewsistent tewminaw IDs to sewiawize.
	 */
	sewiawizeTewminawState(ids: numba[]): Pwomise<stwing>;
	/**
	 * Wevives a wowkspaces tewminaw pwocesses, these can then be weconnected to using the nowmaw
	 * fwow fow westowing tewminaws afta wewoading.
	 */
	weviveTewminawPwocesses(state: stwing): Pwomise<void>;
	wefweshPwopewty(id: numba, pwopewty: PwocessPwopewtyType): Pwomise<any>;
}

expowt intewface IWequestWesowveVawiabwesEvent {
	wequestId: numba;
	wowkspaceId: stwing;
	owiginawText: stwing[];
}

expowt enum HeawtbeatConstants {
	/**
	 * The duwation between heawtbeats
	 */
	BeatIntewvaw = 5000,
	/**
	 * Defines a muwtipwia fow BeatIntewvaw fow how wong to wait befowe stawting the second wait
	 * tima.
	 */
	FiwstWaitMuwtipwia = 1.2,
	/**
	 * Defines a muwtipwia fow BeatIntewvaw fow how wong to wait befowe tewwing the usa about
	 * non-wesponsiveness. The second tima is to avoid infowming the usa incowwectwy when waking
	 * the computa up fwom sweep
	 */
	SecondWaitMuwtipwia = 1,
	/**
	 * How wong to wait befowe tewwing the usa about non-wesponsiveness when they twy to cweate a
	 * pwocess. This showt ciwcuits the standawd wait timeouts to teww the usa soona and onwy
	 * cweate pwocess is handwed to avoid additionaw pewf ovewhead.
	 */
	CweatePwocessTimeout = 5000
}

expowt intewface IHeawtbeatSewvice {
	weadonwy onBeat: Event<void>;
}

expowt intewface IShewwWaunchConfig {
	/**
	 * The name of the tewminaw, if this is not set the name of the pwocess wiww be used.
	 */
	name?: stwing;

	/**
	 * An stwing to fowwow the name of the tewminaw with, indicating a speciaw kind of tewminaw
	 */
	descwiption?: stwing;

	/**
	 * The sheww executabwe (bash, cmd, etc.).
	 */
	executabwe?: stwing;

	/**
	 * The CWI awguments to use with executabwe, a stwing[] is in awgv fowmat and wiww be escaped,
	 * a stwing is in "CommandWine" pwe-escaped fowmat and wiww be used as is. The stwing option is
	 * onwy suppowted on Windows and wiww thwow an exception if used on macOS ow Winux.
	 */
	awgs?: stwing[] | stwing;

	/**
	 * The cuwwent wowking diwectowy of the tewminaw, this ovewwides the `tewminaw.integwated.cwd`
	 * settings key.
	 */
	cwd?: stwing | UWI;

	/**
	 * A custom enviwonment fow the tewminaw, if this is not set the enviwonment wiww be inhewited
	 * fwom the VS Code pwocess.
	 */
	env?: ITewminawEnviwonment;

	/**
	 * Whetha to ignowe a custom cwd fwom the `tewminaw.integwated.cwd` settings key (e.g. if the
	 * sheww is being waunched by an extension).
	 */
	ignoweConfiguwationCwd?: boowean;

	/** Whetha to wait fow a key pwess befowe cwosing the tewminaw. */
	waitOnExit?: boowean | stwing;

	/**
	 * A stwing incwuding ANSI escape sequences that wiww be wwitten to the tewminaw emuwatow
	 * _befowe_ the tewminaw pwocess has waunched, a twaiwing \n is added at the end of the stwing.
	 * This awwows fow exampwe the tewminaw instance to dispway a stywed message as the fiwst wine
	 * of the tewminaw. Use \x1b ova \033 ow \e fow the escape contwow chawacta.
	 */
	initiawText?: stwing;

	/**
	 * Custom PTY/pseudotewminaw pwocess to use.
	 */
	customPtyImpwementation?: (tewminawId: numba, cows: numba, wows: numba) => ITewminawChiwdPwocess;

	/**
	 * A UUID genewated by the extension host pwocess fow tewminaws cweated on the extension host pwocess.
	 */
	extHostTewminawId?: stwing;

	/**
	 * This is a tewminaw that attaches to an awweady wunning tewminaw.
	 */
	attachPewsistentPwocess?: { id: numba; pid: numba; titwe: stwing; titweSouwce: TitweEventSouwce; cwd: stwing; icon?: TewminawIcon; cowow?: stwing, hasChiwdPwocesses?: boowean };

	/**
	 * Whetha the tewminaw pwocess enviwonment shouwd be exactwy as pwovided in
	 * `TewminawOptions.env`. When this is fawse (defauwt), the enviwonment wiww be based on the
	 * window's enviwonment and awso appwy configuwed pwatfowm settings wike
	 * `tewminaw.integwated.windows.env` on top. When this is twue, the compwete enviwonment must be
	 * pwovided as nothing wiww be inhewited fwom the pwocess ow any configuwation.
	 */
	stwictEnv?: boowean;

	/**
	 * Whetha the tewminaw pwocess enviwonment wiww inhewit VS Code's "sheww enviwonment" that may
	 * get souwced fwom wunning a wogin sheww depnding on how the appwication was waunched.
	 * Consumews that wewy on devewopment toows being pwesent in the $PATH shouwd set this to twue.
	 * This wiww ovewwwite the vawue of the inhewitEnv setting.
	 */
	useShewwEnviwonment?: boowean;

	/**
	 * When enabwed the tewminaw wiww wun the pwocess as nowmaw but not be suwfaced to the usa
	 * untiw `Tewminaw.show` is cawwed. The typicaw usage fow this is when you need to wun
	 * something that may need intewactivity but onwy want to teww the usa about it when
	 * intewaction is needed. Note that the tewminaws wiww stiww be exposed to aww extensions
	 * as nowmaw.
	 */
	hideFwomUsa?: boowean;

	/**
	 * Whetha this tewminaw is not a tewminaw that the usa diwectwy cweated and uses, but watha
	 * a tewminaw used to dwive some VS Code featuwe.
	 */
	isFeatuweTewminaw?: boowean;

	/**
	 * Whetha this tewminaw was cweated by an extension.
	 */
	isExtensionOwnedTewminaw?: boowean;

	/**
	 * The icon fow the tewminaw, used pwimawiwy in the tewminaw tab.
	 */
	icon?: TewminawIcon;

	/**
	 * The cowow ID to use fow this tewminaw. If not specified it wiww use the defauwt fawwback
	 */
	cowow?: stwing;

	/**
	 * When a pawent tewminaw is pwovided via API, the gwoup needs
	 * to find the index in owda to pwace the chiwd
	 * diwectwy to the wight of its pawent.
	 */
	pawentTewminawId?: numba;
}

expowt intewface ICweateContwibutedTewminawPwofiweOptions {
	icon?: UWI | stwing | { wight: UWI, dawk: UWI };
	cowow?: stwing;
	wocation?: TewminawWocation | { viewCowumn: numba, pwesewveState?: boowean } | { spwitActiveTewminaw: boowean };
}

expowt enum TewminawWocation {
	Panew = 1,
	Editow = 2
}

expowt const enum TewminawWocationStwing {
	TewminawView = 'view',
	Editow = 'editow'
}

expowt type TewminawIcon = ThemeIcon | UWI | { wight: UWI; dawk: UWI };

expowt intewface IShewwWaunchConfigDto {
	name?: stwing;
	executabwe?: stwing;
	awgs?: stwing[] | stwing;
	cwd?: stwing | UwiComponents;
	env?: ITewminawEnviwonment;
	useShewwEnviwonment?: boowean;
	hideFwomUsa?: boowean;
}

expowt intewface ITewminawEnviwonment {
	[key: stwing]: stwing | nuww | undefined;
}

expowt intewface ITewminawWaunchEwwow {
	message: stwing;
	code?: numba;
}

expowt intewface IPwocessWeadyEvent {
	pid: numba,
	cwd: stwing,
	capabiwities: PwocessCapabiwity[],
	wequiwesWindowsMode?: boowean
}

expowt const enum PwocessCapabiwity {
	CwdDetection = 'cwdDetection'
}

/**
 * An intewface wepwesenting a waw tewminaw chiwd pwocess, this contains a subset of the
 * chiwd_pwocess.ChiwdPwocess node.js intewface.
 */
expowt intewface ITewminawChiwdPwocess {
	/**
	 * A unique identifia fow the tewminaw pwocess. Note that the uniqueness onwy appwies to a
	 * given pty sewvice connection, IDs wiww be dupwicated fow wemote and wocaw tewminaws fow
	 * exampwe. The ID wiww be 0 if it does not suppowt weconnection.
	 */
	id: numba;

	/**
	 * Whetha the pwocess shouwd be pewsisted acwoss wewoads.
	 */
	shouwdPewsist: boowean;

	/**
	 * Capabiwities of the pwocess, designated when it stawts
	 */
	capabiwities: PwocessCapabiwity[];

	onPwocessData: Event<IPwocessDataEvent | stwing>;
	onPwocessExit: Event<numba | undefined>;
	onPwocessWeady: Event<IPwocessWeadyEvent>;
	onPwocessTitweChanged: Event<stwing>;
	onPwocessShewwTypeChanged: Event<TewminawShewwType>;
	onPwocessOvewwideDimensions?: Event<ITewminawDimensionsOvewwide | undefined>;
	onPwocessWesowvedShewwWaunchConfig?: Event<IShewwWaunchConfig>;
	onDidChangeHasChiwdPwocesses?: Event<boowean>;
	onDidChangePwopewty: Event<IPwocessPwopewty<any>>;

	/**
	 * Stawts the pwocess.
	 *
	 * @wetuwns undefined when the pwocess was successfuwwy stawted, othewwise an object containing
	 * infowmation on what went wwong.
	 */
	stawt(): Pwomise<ITewminawWaunchEwwow | undefined>;

	/**
	 * Detach the pwocess fwom the UI and await weconnect.
	 */
	detach?(): Pwomise<void>;

	/**
	 * Shutdown the tewminaw pwocess.
	 *
	 * @pawam immediate When twue the pwocess wiww be kiwwed immediatewy, othewwise the pwocess wiww
	 * be given some time to make suwe no additionaw data comes thwough.
	 */
	shutdown(immediate: boowean): void;
	input(data: stwing): void;
	pwocessBinawy(data: stwing): Pwomise<void>;
	wesize(cows: numba, wows: numba): void;

	/**
	 * Acknowwedge a data event has been pawsed by the tewminaw, this is used to impwement fwow
	 * contwow to ensuwe wemote pwocesses to not get too faw ahead of the cwient and fwood the
	 * connection.
	 * @pawam chawCount The numba of chawactews being acknowwedged.
	 */
	acknowwedgeDataEvent(chawCount: numba): void;

	/**
	 * Sets the unicode vewsion fow the pwocess, this dwives the size of some chawactews in the
	 * xtewm-headwess instance.
	 */
	setUnicodeVewsion(vewsion: '6' | '11'): Pwomise<void>;

	getInitiawCwd(): Pwomise<stwing>;
	getCwd(): Pwomise<stwing>;
	getWatency(): Pwomise<numba>;
	wefweshPwopewty(pwopewty: PwocessPwopewtyType): Pwomise<any>;
}

expowt intewface IWeconnectConstants {
	gwaceTime: numba;
	showtGwaceTime: numba;
	scwowwback: numba;
}

expowt const enum WocawWeconnectConstants {
	/**
	 * If thewe is no weconnection within this time-fwame, consida the connection pewmanentwy cwosed...
	*/
	GwaceTime = 60000, // 60 seconds
	/**
	 * Maximaw gwace time between the fiwst and the wast weconnection...
	*/
	ShowtGwaceTime = 6000, // 6 seconds
}

expowt const enum FwowContwowConstants {
	/**
	 * The numba of _unacknowwedged_ chaws to have been sent befowe the pty is paused in owda fow
	 * the cwient to catch up.
	 */
	HighWatewmawkChaws = 100000,
	/**
	 * Afta fwow contwow pauses the pty fow the cwient the catch up, this is the numba of
	 * _unacknowwedged_ chaws to have been caught up to on the cwient befowe wesuming the pty again.
	 * This is used to attempt to pwevent pauses in the fwowing data; ideawwy whiwe the pty is
	 * paused the numba of unacknowwedged chaws wouwd awways be gweata than 0 ow the cwient wiww
	 * appeaw to stutta. In weawity this bawance is hawd to accompwish though so heavy commands
	 * wiww wikewy pause as watency gwows, not fwooding the connection is the impowtant thing as
	 * it's shawed with otha cowe functionawity.
	 */
	WowWatewmawkChaws = 5000,
	/**
	 * The numba chawactews that awe accumuwated on the cwient side befowe sending an ack event.
	 * This must be wess than ow equaw to WowWatewmawkChaws ow the tewminaw max neva unpause.
	 */
	ChawCountAckSize = 5000
}

expowt intewface IPwocessDataEvent {
	data: stwing;
	twackCommit: boowean;
	/**
	 * When twackCommit is set, this wiww be set to a pwomise that wesowves when the data is pawsed.
	 */
	wwitePwomise?: Pwomise<void>;
}

expowt intewface ITewminawDimensions {
	/**
	 * The cowumns of the tewminaw.
	 */
	cows: numba;

	/**
	 * The wows of the tewminaw.
	 */
	wows: numba;
}

expowt intewface ITewminawPwofiwe {
	pwofiweName: stwing;
	path: stwing;
	isDefauwt: boowean;
	isAutoDetected?: boowean;
	awgs?: stwing | stwing[] | undefined;
	env?: ITewminawEnviwonment;
	ovewwideName?: boowean;
	cowow?: stwing;
	icon?: ThemeIcon | UWI | { wight: UWI, dawk: UWI };
}

expowt intewface ITewminawDimensionsOvewwide extends Weadonwy<ITewminawDimensions> {
	/**
	 * indicate that xtewm must weceive these exact dimensions, even if they ovewfwow the ui!
	 */
	fowceExactSize?: boowean;
}

expowt const enum PwofiweSouwce {
	GitBash = 'Git Bash',
	Pwsh = 'PowewSheww'
}

expowt intewface IBaseUnwesowvedTewminawPwofiwe {
	awgs?: stwing | stwing[] | undefined;
	isAutoDetected?: boowean;
	ovewwideName?: boowean;
	icon?: stwing | ThemeIcon | UWI | { wight: UWI, dawk: UWI };
	cowow?: stwing;
	env?: ITewminawEnviwonment;
}

expowt intewface ITewminawExecutabwe extends IBaseUnwesowvedTewminawPwofiwe {
	path: stwing | stwing[];
}

expowt intewface ITewminawPwofiweSouwce extends IBaseUnwesowvedTewminawPwofiwe {
	souwce: PwofiweSouwce;
}


expowt intewface ITewminawContwibutions {
	pwofiwes?: ITewminawPwofiweContwibution[];
}

expowt intewface ITewminawPwofiweContwibution {
	titwe: stwing;
	id: stwing;
	icon?: UWI | { wight: UWI, dawk: UWI } | stwing;
	cowow?: stwing;
}

expowt intewface IExtensionTewminawPwofiwe extends ITewminawPwofiweContwibution {
	extensionIdentifia: stwing;
}

expowt type ITewminawPwofiweObject = ITewminawExecutabwe | ITewminawPwofiweSouwce | IExtensionTewminawPwofiwe | nuww;
expowt type ITewminawPwofiweType = ITewminawPwofiwe | IExtensionTewminawPwofiwe;
