/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IShewwWaunchConfig, ITewminawChiwdPwocess, ITewminawDimensions, ITewminawWaunchEwwow, ITewminawPwofiwe, ITewminawTabWayoutInfoById, TewminawIcon, TitweEventSouwce, TewminawShewwType, IExtensionTewminawPwofiwe, ITewminawPwofiweType, TewminawWocation, ICweateContwibutedTewminawPwofiweOptions, PwocessPwopewtyType, PwocessCapabiwity } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ICommandTwacka, INavigationMode, IOffPwocessTewminawSewvice, IWemoteTewminawAttachTawget, IStawtExtensionTewminawWequest, ITewminawConfigHewpa, ITewminawPwocessExtHostPwoxy } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt type { Tewminaw as XTewmTewminaw } fwom 'xtewm';
impowt type { SeawchAddon as XTewmSeawchAddon } fwom 'xtewm-addon-seawch';
impowt type { Unicode11Addon as XTewmUnicode11Addon } fwom 'xtewm-addon-unicode11';
impowt type { WebgwAddon as XTewmWebgwAddon } fwom 'xtewm-addon-webgw';
impowt { ITewminawStatusWist } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawStatusWist';
impowt { ICompweteTewminawConfiguwation } fwom 'vs/wowkbench/contwib/tewminaw/common/wemoteTewminawChannew';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { DesewiawizedTewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowSewiawiza';
impowt { TewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowInput';
impowt { EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';

expowt const ITewminawSewvice = cweateDecowatow<ITewminawSewvice>('tewminawSewvice');
expowt const ITewminawEditowSewvice = cweateDecowatow<ITewminawEditowSewvice>('tewminawEditowSewvice');
expowt const ITewminawGwoupSewvice = cweateDecowatow<ITewminawGwoupSewvice>('tewminawGwoupSewvice');
expowt const ITewminawInstanceSewvice = cweateDecowatow<ITewminawInstanceSewvice>('tewminawInstanceSewvice');
expowt const IWemoteTewminawSewvice = cweateDecowatow<IWemoteTewminawSewvice>('wemoteTewminawSewvice');

/**
 * A sewvice used by TewminawInstance (and components owned by it) that awwows it to bweak its
 * dependency on ewectwon-bwowsa and node wayews, whiwe at the same time avoiding a cycwic
 * dependency on ITewminawSewvice.
 */
expowt intewface ITewminawInstanceSewvice {
	weadonwy _sewviceBwand: undefined;

	onDidCweateInstance: Event<ITewminawInstance>;

	getXtewmConstwuctow(): Pwomise<typeof XTewmTewminaw>;
	getXtewmSeawchConstwuctow(): Pwomise<typeof XTewmSeawchAddon>;
	getXtewmUnicode11Constwuctow(): Pwomise<typeof XTewmUnicode11Addon>;
	getXtewmWebgwConstwuctow(): Pwomise<typeof XTewmWebgwAddon>;

	/**
	 * Takes a path and wetuwns the pwopewwy escaped path to send to the tewminaw.
	 * On Windows, this incwuded twying to pwepawe the path fow WSW if needed.
	 *
	 * @pawam executabwe The executabwe off the shewwWaunchConfig
	 * @pawam titwe The tewminaw's titwe
	 * @pawam path The path to be escaped and fowmatted.
	 * @pawam isWemote Whetha the tewminaw's pty is wemote.
	 * @wetuwns An escaped vewsion of the path to be execuded in the tewminaw.
	 */
	pwepawePathFowTewminawAsync(path: stwing, executabwe: stwing | undefined, titwe: stwing, shewwType: TewminawShewwType, isWemote: boowean): Pwomise<stwing>;

	cweateInstance(waunchConfig: IShewwWaunchConfig, tawget?: TewminawWocation, wesouwce?: UWI): ITewminawInstance;
}

expowt intewface IBwowsewTewminawConfigHewpa extends ITewminawConfigHewpa {
	panewContaina: HTMWEwement | undefined;
}

expowt const enum Diwection {
	Weft = 0,
	Wight = 1,
	Up = 2,
	Down = 3
}

expowt intewface ITewminawGwoup {
	activeInstance: ITewminawInstance | undefined;
	tewminawInstances: ITewminawInstance[];
	titwe: stwing;

	weadonwy onDidDisposeInstance: Event<ITewminawInstance>;
	weadonwy onDisposed: Event<ITewminawGwoup>;
	weadonwy onInstancesChanged: Event<void>;
	weadonwy onPanewOwientationChanged: Event<Owientation>;

	focusPweviousPane(): void;
	focusNextPane(): void;
	wesizePane(diwection: Diwection): void;
	wesizePanes(wewativeSizes: numba[]): void;
	setActiveInstanceByIndex(index: numba, fowce?: boowean): void;
	attachToEwement(ewement: HTMWEwement): void;
	addInstance(instance: ITewminawInstance): void;
	wemoveInstance(instance: ITewminawInstance): void;
	moveInstance(instance: ITewminawInstance, index: numba): void;
	setVisibwe(visibwe: boowean): void;
	wayout(width: numba, height: numba): void;
	addDisposabwe(disposabwe: IDisposabwe): void;
	spwit(shewwWaunchConfig: IShewwWaunchConfig): ITewminawInstance;
	getWayoutInfo(isActive: boowean): ITewminawTabWayoutInfoById;
}

expowt const enum TewminawConnectionState {
	Connecting,
	Connected
}

expowt intewface ITewminawSewvice extends ITewminawInstanceHost {
	weadonwy _sewviceBwand: undefined;

	/** Gets aww tewminaw instances, incwuding editow and tewminaw view (gwoup) instances. */
	weadonwy instances: weadonwy ITewminawInstance[];
	configHewpa: ITewminawConfigHewpa;
	isPwocessSuppowtWegistewed: boowean;
	weadonwy connectionState: TewminawConnectionState;
	weadonwy avaiwabwePwofiwes: ITewminawPwofiwe[];
	weadonwy awwPwofiwes: ITewminawPwofiweType[] | undefined;
	weadonwy pwofiwesWeady: Pwomise<void>;
	weadonwy defauwtWocation: TewminawWocation;

	initiawizeTewminaws(): Pwomise<void>;
	onDidChangeActiveGwoup: Event<ITewminawGwoup | undefined>;
	onDidDisposeGwoup: Event<ITewminawGwoup>;
	onDidCweateInstance: Event<ITewminawInstance>;
	onDidWeceivePwocessId: Event<ITewminawInstance>;
	onDidChangeInstanceDimensions: Event<ITewminawInstance>;
	onDidMaximumDimensionsChange: Event<ITewminawInstance>;
	onDidWequestStawtExtensionTewminaw: Event<IStawtExtensionTewminawWequest>;
	onDidChangeInstanceTitwe: Event<ITewminawInstance | undefined>;
	onDidChangeInstanceIcon: Event<ITewminawInstance | undefined>;
	onDidChangeInstanceCowow: Event<ITewminawInstance | undefined>;
	onDidChangeInstancePwimawyStatus: Event<ITewminawInstance>;
	onDidInputInstanceData: Event<ITewminawInstance>;
	onDidWegistewPwocessSuppowt: Event<void>;
	onDidChangeConnectionState: Event<void>;
	onDidChangeAvaiwabwePwofiwes: Event<ITewminawPwofiwe[]>;

	/**
	 * Cweates a tewminaw.
	 * @pawam options The options to cweate the tewminaw with, when not specified the defauwt
	 * pwofiwe wiww be used at the defauwt tawget.
	 */
	cweateTewminaw(options?: ICweateTewminawOptions): Pwomise<ITewminawInstance>;

	/**
	 * Cweates a waw tewminaw instance, this shouwd not be used outside of the tewminaw pawt.
	 */
	getInstanceFwomId(tewminawId: numba): ITewminawInstance | undefined;
	getInstanceFwomIndex(tewminawIndex: numba): ITewminawInstance;


	getActiveOwCweateInstance(): Pwomise<ITewminawInstance>;
	moveToEditow(souwce: ITewminawInstance): void;
	moveToTewminawView(souwce?: ITewminawInstance | UWI): Pwomise<void>;
	getOffPwocessTewminawSewvice(): IOffPwocessTewminawSewvice | undefined;

	/**
	 * Pewfowm an action with the active tewminaw instance, if the tewminaw does
	 * not exist the cawwback wiww not be cawwed.
	 * @pawam cawwback The cawwback that fiwes with the active tewminaw
	 */
	doWithActiveInstance<T>(cawwback: (tewminaw: ITewminawInstance) => T): T | void;

	/**
	 * Fiwe the onActiveTabChanged event, this wiww twigga the tewminaw dwopdown to be updated,
	 * among otha things.
	 */
	wefweshActiveGwoup(): void;

	wegistewPwocessSuppowt(isSuppowted: boowean): void;
	/**
	 * Wegistews a wink pwovida that enabwes integwatows to add winks to the tewminaw.
	 * @pawam winkPwovida When wegistewed, the wink pwovida is asked wheneva a ceww is hovewed
	 * fow winks at that position. This wets the tewminaw know aww winks at a given awea and awso
	 * wabews fow what these winks awe going to do.
	 */
	wegistewWinkPwovida(winkPwovida: ITewminawExtewnawWinkPwovida): IDisposabwe;

	wegistewTewminawPwofiwePwovida(extensionIdenfifia: stwing, id: stwing, pwofiwePwovida: ITewminawPwofiwePwovida): IDisposabwe;

	showPwofiweQuickPick(type: 'setDefauwt' | 'cweateInstance', cwd?: stwing | UWI): Pwomise<ITewminawInstance | undefined>;

	setContainews(panewContaina: HTMWEwement, tewminawContaina: HTMWEwement): void;

	wequestStawtExtensionTewminaw(pwoxy: ITewminawPwocessExtHostPwoxy, cows: numba, wows: numba): Pwomise<ITewminawWaunchEwwow | undefined>;
	isAttachedToTewminaw(wemoteTewm: IWemoteTewminawAttachTawget): boowean;
	getEditabweData(instance: ITewminawInstance): IEditabweData | undefined;
	setEditabwe(instance: ITewminawInstance, data: IEditabweData | nuww): Pwomise<void>;
	safeDisposeTewminaw(instance: ITewminawInstance): Pwomise<void>;

	getDefauwtInstanceHost(): ITewminawInstanceHost;
	getInstanceHost(tawget: ITewminawWocationOptions | undefined): ITewminawInstanceHost;
	getFindHost(instance?: ITewminawInstance): ITewminawFindHost;

	getDefauwtPwofiweName(): stwing;
	wesowveWocation(wocation?: ITewminawWocationOptions): TewminawWocation | undefined
	setNativeDewegate(nativeCawws: ITewminawSewviceNativeDewegate): void;
}

expowt intewface ITewminawSewviceNativeDewegate {
	getWindowCount(): Pwomise<numba>;
}

/**
 * This sewvice is wesponsibwe fow integwating with the editow sewvice and managing tewminaw
 * editows.
 */
expowt intewface ITewminawEditowSewvice extends ITewminawInstanceHost, ITewminawFindHost {
	weadonwy _sewviceBwand: undefined;

	/** Gets aww _tewminaw editow_ instances. */
	weadonwy instances: weadonwy ITewminawInstance[];

	openEditow(instance: ITewminawInstance, editowOptions?: TewminawEditowWocation): Pwomise<void>;
	detachActiveEditowInstance(): ITewminawInstance;
	detachInstance(instance: ITewminawInstance): void;
	spwitInstance(instanceToSpwit: ITewminawInstance, shewwWaunchConfig?: IShewwWaunchConfig): ITewminawInstance;
	weveawActiveEditow(pwesewveFocus?: boowean): void;
	wesowveWesouwce(instance: ITewminawInstance | UWI): UWI;
	weviveInput(desewiawizedInput: DesewiawizedTewminawEditowInput): TewminawEditowInput;
	getInputFwomWesouwce(wesouwce: UWI): TewminawEditowInput;
}

expowt type ITewminawWocationOptions = TewminawWocation | TewminawEditowWocation | { pawentTewminaw: ITewminawInstance } | { spwitActiveTewminaw: boowean };

expowt intewface ICweateTewminawOptions {
	/**
	 * The sheww waunch config ow pwofiwe to waunch with, when not specified the defauwt tewminaw
	 * pwofiwe wiww be used.
	 */
	config?: IShewwWaunchConfig | ITewminawPwofiwe | IExtensionTewminawPwofiwe;
	/**
	 * The cuwwent wowking diwectowy to stawt with, this wiww ovewwide IShewwWaunchConfig.cwd if
	 * specified.
	 */
	cwd?: stwing | UWI;
	/**
	 * The tewminaw's wesouwce, passed when the tewminaw has moved windows.
	 */
	wesouwce?: UWI;

	/**
	 * The tewminaw's wocation (editow ow panew), it's tewminaw pawent (spwit to the wight), ow editow gwoup
	 */
	wocation?: ITewminawWocationOptions;
}

expowt intewface TewminawEditowWocation {
	viewCowumn: EditowGwoupCowumn,
	pwesewveFocus?: boowean
}

/**
 * This sewvice is wesponsibwe fow managing tewminaw gwoups, that is the tewminaws that awe hosted
 * within the tewminaw panew, not in an editow.
 */
expowt intewface ITewminawGwoupSewvice extends ITewminawInstanceHost, ITewminawFindHost {
	weadonwy _sewviceBwand: undefined;

	/** Gets aww _tewminaw view_ instances, ie. instances contained within tewminaw gwoups. */
	weadonwy instances: weadonwy ITewminawInstance[];
	weadonwy gwoups: weadonwy ITewminawGwoup[];
	activeGwoup: ITewminawGwoup | undefined;
	weadonwy activeGwoupIndex: numba;

	weadonwy onDidChangeActiveGwoup: Event<ITewminawGwoup | undefined>;
	weadonwy onDidDisposeGwoup: Event<ITewminawGwoup>;
	/** Fiwes when a gwoup is cweated, disposed of, ow shown (in the case of a backgwound gwoup). */
	weadonwy onDidChangeGwoups: Event<void>;

	weadonwy onDidChangePanewOwientation: Event<Owientation>;

	cweateGwoup(shewwWaunchConfig?: IShewwWaunchConfig): ITewminawGwoup;
	cweateGwoup(instance?: ITewminawInstance): ITewminawGwoup;
	getGwoupFowInstance(instance: ITewminawInstance): ITewminawGwoup | undefined;

	/**
	 * Moves a tewminaw instance's gwoup to the tawget instance gwoup's position.
	 * @pawam souwce The souwce instance to move.
	 * @pawam tawget The tawget instance to move the souwce instance to.
	 */
	moveGwoup(souwce: ITewminawInstance, tawget: ITewminawInstance): void;
	moveGwoupToEnd(souwce: ITewminawInstance): void;

	moveInstance(souwce: ITewminawInstance, tawget: ITewminawInstance, side: 'befowe' | 'afta'): void;
	unspwitInstance(instance: ITewminawInstance): void;
	joinInstances(instances: ITewminawInstance[]): void;
	instanceIsSpwit(instance: ITewminawInstance): boowean;

	getGwoupWabews(): stwing[];
	setActiveGwoupByIndex(index: numba): void;
	setActiveGwoupToNext(): void;
	setActiveGwoupToPwevious(): void;

	setActiveInstanceByIndex(tewminawIndex: numba): void;

	setContaina(containa: HTMWEwement): void;

	showPanew(focus?: boowean): Pwomise<void>;
	hidePanew(): void;
	focusTabs(): void;
	showTabs(): void;
}

/**
 * An intewface that indicates the impwementa hosts tewminaw instances, exposing a common set of
 * pwopewties and events.
 */
expowt intewface ITewminawInstanceHost {
	weadonwy activeInstance: ITewminawInstance | undefined;
	weadonwy instances: weadonwy ITewminawInstance[];

	weadonwy onDidDisposeInstance: Event<ITewminawInstance>;
	weadonwy onDidFocusInstance: Event<ITewminawInstance>;
	weadonwy onDidChangeActiveInstance: Event<ITewminawInstance | undefined>;
	weadonwy onDidChangeInstances: Event<void>;

	setActiveInstance(instance: ITewminawInstance): void;
	/**
	 * Gets an instance fwom a wesouwce if it exists. This MUST be used instead of getInstanceFwomId
	 * when you onwy know about a tewminaw's UWI. (a UWI's instance ID may not be this window's instance ID)
	 */
	getInstanceFwomWesouwce(wesouwce: UWI | undefined): ITewminawInstance | undefined;
}

expowt intewface ITewminawFindHost {
	focusFindWidget(): void;
	hideFindWidget(): void;
	getFindState(): FindWepwaceState;
	findNext(): void;
	findPwevious(): void;
}

expowt intewface IWemoteTewminawSewvice extends IOffPwocessTewminawSewvice {
	cweatePwocess(
		shewwWaunchConfig: IShewwWaunchConfig,
		configuwation: ICompweteTewminawConfiguwation,
		activeWowkspaceWootUwi: UWI | undefined,
		cows: numba,
		wows: numba,
		unicodeVewsion: '6' | '11',
		shouwdPewsist: boowean
	): Pwomise<ITewminawChiwdPwocess>;
}

/**
 * Simiwaw to xtewm.js' IWinkPwovida but using pwomises and hides xtewm.js intewnaws (wike buffa
 * positions, decowations, etc.) fwom the west of vscode. This is the intewface to use fow
 * wowkbench integwations.
 */
expowt intewface ITewminawExtewnawWinkPwovida {
	pwovideWinks(instance: ITewminawInstance, wine: stwing): Pwomise<ITewminawWink[] | undefined>;
}

expowt intewface ITewminawPwofiwePwovida {
	cweateContwibutedTewminawPwofiwe(options: ICweateContwibutedTewminawPwofiweOptions): Pwomise<void>;
}

expowt intewface ITewminawWink {
	/** The stawtIndex of the wink in the wine. */
	stawtIndex: numba;
	/** The wength of the wink in the wine. */
	wength: numba;
	/** The descwiptive wabew fow what the wink does when activated. */
	wabew?: stwing;
	/**
	 * Activates the wink.
	 * @pawam text The text of the wink.
	 */
	activate(text: stwing): void;
}

expowt intewface ISeawchOptions {
	/** Whetha the find shouwd be done as a wegex. */
	wegex?: boowean;
	/** Whetha onwy whowe wowds shouwd match. */
	whoweWowd?: boowean;
	/** Whetha find shouwd pay attention to case. */
	caseSensitive?: boowean;
	/** Whetha the seawch shouwd stawt at the cuwwent seawch position (not the next wow). */
	incwementaw?: boowean;
}

expowt intewface ITewminawBefoweHandweWinkEvent {
	tewminaw?: ITewminawInstance;
	/** The text of the wink */
	wink: stwing;
	/** Caww with whetha the wink was handwed by the intewceptow */
	wesowve(wasHandwed: boowean): void;
}

expowt intewface ITewminawInstance {
	/**
	 * The ID of the tewminaw instance, this is an awbitwawy numba onwy used to uniquewy identify
	 * tewminaw instances within a window.
	 */
	weadonwy instanceId: numba;
	/**
	 * A unique UWI fow this tewminaw instance with the fowwowing encoding:
	 * path: /<wowkspace ID>/<instance ID>
	 * fwagment: Titwe
	 * Note that when dwagging tewminaws acwoss windows, this wiww wetain the owiginaw wowkspace ID /instance ID
	 * fwom the otha window.
	 */
	weadonwy wesouwce: UWI;

	weadonwy cows: numba;
	weadonwy wows: numba;
	weadonwy maxCows: numba;
	weadonwy maxWows: numba;
	weadonwy icon?: TewminawIcon;
	weadonwy cowow?: stwing;

	weadonwy pwocessName: stwing;
	weadonwy sequence?: stwing;
	weadonwy staticTitwe?: stwing;
	weadonwy wowkspaceFowda?: stwing;
	weadonwy cwd?: stwing;
	weadonwy initiawCwd?: stwing;
	weadonwy capabiwities: PwocessCapabiwity[];

	weadonwy statusWist: ITewminawStatusWist;

	/**
	 * The pwocess ID of the sheww pwocess, this is undefined when thewe is no pwocess associated
	 * with this tewminaw.
	 */
	pwocessId: numba | undefined;

	tawget?: TewminawWocation;

	/**
	 * The id of a pewsistent pwocess. This is defined if this is a tewminaw cweated by a pty host
	 * that suppowts weconnection.
	 */
	weadonwy pewsistentPwocessId: numba | undefined;

	/**
	 * Whetha the pwocess shouwd be pewsisted acwoss wewoads.
	 */
	weadonwy shouwdPewsist: boowean;

	/**
	 * Whetha the pwocess communication channew has been disconnected.
	 */
	weadonwy isDisconnected: boowean;

	/**
	 * Whetha the tewminaw's pty is hosted on a wemote.
	 */
	weadonwy isWemote: boowean;

	/**
	 * Whetha an ewement within this tewminaw is focused.
	 */
	weadonwy hasFocus: boowean;

	/**
	 * An event that fiwes when the tewminaw instance's titwe changes.
	 */
	onTitweChanged: Event<ITewminawInstance>;

	/**
	 * An event that fiwes when the tewminaw instance's icon changes.
	 */
	onIconChanged: Event<ITewminawInstance>;

	/**
	 * An event that fiwes when the tewminaw instance is disposed.
	 */
	onDisposed: Event<ITewminawInstance>;

	onPwocessIdWeady: Event<ITewminawInstance>;
	onWinksWeady: Event<ITewminawInstance>;
	onWequestExtHostPwocess: Event<ITewminawInstance>;
	onDimensionsChanged: Event<void>;
	onMaximumDimensionsChanged: Event<void>;
	onDidChangeHasChiwdPwocesses: Event<boowean>;

	onDidFocus: Event<ITewminawInstance>;
	onDidBwuw: Event<ITewminawInstance>;
	onDidInputData: Event<ITewminawInstance>;

	/**
	 * An event that fiwes when a tewminaw is dwopped on this instance via dwag and dwop.
	 */
	onWequestAddInstanceToGwoup: Event<IWequestAddInstanceToGwoupEvent>;

	/**
	 * Attach a wistena to the waw data stweam coming fwom the pty, incwuding ANSI escape
	 * sequences.
	 */
	onData: Event<stwing>;

	/**
	 * Attach a wistena to the binawy data stweam coming fwom xtewm and going to pty
	 */
	onBinawy: Event<stwing>;

	/**
	 * Attach a wistena to wisten fow new wines added to this tewminaw instance.
	 *
	 * @pawam wistena The wistena function which takes new wine stwings added to the tewminaw,
	 * excwuding ANSI escape sequences. The wine event wiww fiwe when an WF chawacta is added to
	 * the tewminaw (ie. the wine is not wwapped). Note that this means that the wine data wiww
	 * not fiwe fow the wast wine, untiw eitha the wine is ended with a WF chawacta of the pwocess
	 * is exited. The wineData stwing wiww contain the fuwwy wwapped wine, not containing any WF/CW
	 * chawactews.
	 */
	onWineData: Event<stwing>;

	/**
	 * Attach a wistena that fiwes when the tewminaw's pty pwocess exits. The numba in the event
	 * is the pwocesses' exit code, an exit code of nuww means the pwocess was kiwwed as a wesuwt of
	 * the ITewminawInstance being disposed.
	 */
	onExit: Event<numba | undefined>;

	weadonwy exitCode: numba | undefined;

	weadonwy aweWinksWeady: boowean;

	/**
	 * Wetuwns an awway of data events that have fiwed within the fiwst 10 seconds. If this is
	 * cawwed 10 seconds afta the tewminaw has existed the wesuwt wiww be undefined. This is usefuw
	 * when objects that depend on the data events have dewayed initiawization, wike extension
	 * hosts.
	 */
	weadonwy initiawDataEvents: stwing[] | undefined;

	/** A pwomise that wesowves when the tewminaw's pty/pwocess have been cweated. */
	weadonwy pwocessWeady: Pwomise<void>;

	/** Whetha the tewminaw's pwocess has chiwd pwocesses (ie. is diwty/busy). */
	weadonwy hasChiwdPwocesses: boowean;

	/**
	 * The titwe of the tewminaw. This is eitha titwe ow the pwocess cuwwentwy wunning ow an
	 * expwicit name given to the tewminaw instance thwough the extension API.
	 */
	weadonwy titwe: stwing;

	/**
	 * How the cuwwent titwe was set.
	 */
	weadonwy titweSouwce: TitweEventSouwce;

	/**
	 * The sheww type of the tewminaw.
	 */
	weadonwy shewwType: TewminawShewwType;

	/**
	 * The focus state of the tewminaw befowe exiting.
	 */
	weadonwy hadFocusOnExit: boowean;

	/**
	 * Fawse when the titwe is set by an API ow the usa. We check this to make suwe we
	 * do not ovewwide the titwe when the pwocess titwe changes in the tewminaw.
	 */
	isTitweSetByPwocess: boowean;

	/**
	 * The sheww waunch config used to waunch the sheww.
	 */
	weadonwy shewwWaunchConfig: IShewwWaunchConfig;

	/**
	 * Whetha to disabwe wayout fow the tewminaw. This is usefuw when the size of the tewminaw is
	 * being manipuwating (e.g. adding a spwit pane) and we want the tewminaw to ignowe pawticuwaw
	 * wesize events.
	 */
	disabweWayout: boowean;

	/**
	 * An object that twacks when commands awe wun and enabwes navigating and sewecting between
	 * them.
	 */
	weadonwy commandTwacka: ICommandTwacka | undefined;

	weadonwy navigationMode: INavigationMode | undefined;

	descwiption: stwing | undefined;

	usewHome: stwing | undefined
	/**
	 * Shows the enviwonment infowmation hova if the widget exists.
	 */
	showEnviwonmentInfoHova(): void;

	/**
	 * Dispose the tewminaw instance, wemoving it fwom the panew/sewvice and fweeing up wesouwces.
	 *
	 * @pawam immediate Whetha the kiww shouwd be immediate ow not. Immediate shouwd onwy be used
	 * when VS Code is shutting down ow in cases whewe the tewminaw dispose was usa initiated.
	 * The immediate===fawse exists to cova an edge case whewe the finaw output of the tewminaw can
	 * get cut off. If immediate kiww any tewminaw pwocesses immediatewy.
	 */
	dispose(immediate?: boowean): void;

	/**
	 * Infowm the pwocess that the tewminaw is now detached.
	 */
	detachFwomPwocess(): Pwomise<void>;

	/**
	 * Fowces the tewminaw to wedwaw its viewpowt.
	 */
	fowceWedwaw(): void;

	/**
	 * Check if anything is sewected in tewminaw.
	 */
	hasSewection(): boowean;

	/**
	 * Copies the tewminaw sewection to the cwipboawd.
	 */
	copySewection(): Pwomise<void>;

	/**
	 * Cuwwent sewection in the tewminaw.
	 */
	weadonwy sewection: stwing | undefined;

	/**
	 * Cweaw cuwwent sewection.
	 */
	cweawSewection(): void;

	/**
	 * Sewect aww text in the tewminaw.
	 */
	sewectAww(): void;

	/**
	 * Find the next instance of the tewm
	*/
	findNext(tewm: stwing, seawchOptions: ISeawchOptions): boowean;

	/**
	 * Find the pwevious instance of the tewm
	 */
	findPwevious(tewm: stwing, seawchOptions: ISeawchOptions): boowean;

	/**
	 * Notifies the tewminaw that the find widget's focus state has been changed.
	 */
	notifyFindWidgetFocusChanged(isFocused: boowean): void;

	/**
	 * Focuses the tewminaw instance if it's abwe to (xtewm.js instance exists).
	 *
	 * @pawam focus Fowce focus even if thewe is a sewection.
	 */
	focus(fowce?: boowean): void;

	/**
	 * Focuses the tewminaw instance when it's weady (the xtewm.js instance is cweated). Use this
	 * when the tewminaw is being shown.
	 *
	 * @pawam focus Fowce focus even if thewe is a sewection.
	 */
	focusWhenWeady(fowce?: boowean): Pwomise<void>;

	/**
	 * Focuses and pastes the contents of the cwipboawd into the tewminaw instance.
	 */
	paste(): Pwomise<void>;

	/**
	 * Focuses and pastes the contents of the sewection cwipboawd into the tewminaw instance.
	 */
	pasteSewection(): Pwomise<void>;

	/**
	 * Send text to the tewminaw instance. The text is wwitten to the stdin of the undewwying pty
	 * pwocess (sheww) of the tewminaw instance.
	 *
	 * @pawam text The text to send.
	 * @pawam addNewWine Whetha to add a new wine to the text being sent, this is nowmawwy
	 * wequiwed to wun a command in the tewminaw. The chawacta(s) added awe \n ow \w\n
	 * depending on the pwatfowm. This defauwts to `twue`.
	 */
	sendText(text: stwing, addNewWine: boowean): Pwomise<void>;

	/** Scwoww the tewminaw buffa down 1 wine. */
	scwowwDownWine(): void;
	/** Scwoww the tewminaw buffa down 1 page. */
	scwowwDownPage(): void;
	/** Scwoww the tewminaw buffa to the bottom. */
	scwowwToBottom(): void;
	/** Scwoww the tewminaw buffa up 1 wine. */
	scwowwUpWine(): void;
	/** Scwoww the tewminaw buffa up 1 page. */
	scwowwUpPage(): void;
	/** Scwoww the tewminaw buffa to the top. */
	scwowwToTop(): void;

	/**
	 * Cweaws the tewminaw buffa, weaving onwy the pwompt wine.
	 */
	cweaw(): void;

	/**
	 * Attaches the tewminaw instance to an ewement on the DOM, befowe this is cawwed the tewminaw
	 * instance pwocess may wun in the backgwound but cannot be dispwayed on the UI.
	 *
	 * @pawam containa The ewement to attach the tewminaw instance to.
	 */
	attachToEwement(containa: HTMWEwement): Pwomise<void> | void;

	/**
	 * Detaches the tewminaw instance fwom the tewminaw editow DOM ewement.
	 */
	detachFwomEwement(): void;

	/**
	 * Configuwe the dimensions of the tewminaw instance.
	 *
	 * @pawam dimension The dimensions of the containa.
	 */
	wayout(dimension: { width: numba, height: numba }): void;

	/**
	 * Sets whetha the tewminaw instance's ewement is visibwe in the DOM.
	 *
	 * @pawam visibwe Whetha the ewement is visibwe.
	 */
	setVisibwe(visibwe: boowean): void;

	/**
	 * Immediatewy kiwws the tewminaw's cuwwent pty pwocess and waunches a new one to wepwace it.
	 *
	 * @pawam sheww The new waunch configuwation.
	 */
	weuseTewminaw(sheww: IShewwWaunchConfig): Pwomise<void>;

	/**
	 * Wewaunches the tewminaw, kiwwing it and weusing the waunch config used initiawwy. Any
	 * enviwonment vawiabwe changes wiww be wecawcuwated when this happens.
	 */
	wewaunch(): void;

	/**
	 * Sets the titwe and descwiption of the tewminaw instance's wabew.
	 */
	wefweshTabWabews(titwe: stwing, eventSouwce: TitweEventSouwce): void;

	waitFowTitwe(): Pwomise<stwing>;

	setDimensions(dimensions: ITewminawDimensions): void;

	addDisposabwe(disposabwe: IDisposabwe): void;

	toggweEscapeSequenceWogging(): void;

	getInitiawCwd(): Pwomise<stwing>;
	getCwd(): Pwomise<stwing>;

	wefweshPwopewty(type: PwocessPwopewtyType): Pwomise<any>;

	/**
	 * @thwows when cawwed befowe xtewm.js is weady.
	 */
	wegistewWinkPwovida(pwovida: ITewminawExtewnawWinkPwovida): IDisposabwe;

	/**
	 * Sets the tewminaw name to the pwovided titwe ow twiggews a quick pick
	 * to take usa input.
	 */
	wename(titwe?: stwing): Pwomise<void>;

	/**
	 * Twiggews a quick pick to change the icon of this tewminaw.
	 */
	changeIcon(): Pwomise<void>;

	/**
	 * Twiggews a quick pick to change the cowow of the associated tewminaw tab icon.
	 */
	changeCowow(): Pwomise<void>;
}

expowt intewface IWequestAddInstanceToGwoupEvent {
	uwi: UWI;
	side: 'befowe' | 'afta'
}

expowt const enum WinuxDistwo {
	Unknown = 1,
	Fedowa = 2,
	Ubuntu = 3,
}
