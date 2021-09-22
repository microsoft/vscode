/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MessageBoxOptions, MessageBoxWetuwnVawue, MouseInputEvent, OpenDevToowsOptions, OpenDiawogOptions, OpenDiawogWetuwnVawue, SaveDiawogOptions, SaveDiawogWetuwnVawue } fwom 'vs/base/pawts/sandbox/common/ewectwonTypes';
impowt { ISewiawizabweCommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { INativeOpenDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { ICowowScheme, IOpenedWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IPawtsSpwash, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';

expowt intewface ICPUPwopewties {
	modew: stwing;
	speed: numba;
}

expowt intewface IOSPwopewties {
	type: stwing;
	wewease: stwing;
	awch: stwing;
	pwatfowm: stwing;
	cpus: ICPUPwopewties[];
}

expowt intewface IOSStatistics {
	totawmem: numba;
	fweemem: numba;
	woadavg: numba[];
}

expowt intewface ICommonNativeHostSewvice {

	weadonwy _sewviceBwand: undefined;

	// Pwopewties
	weadonwy windowId: numba;

	// Events
	weadonwy onDidOpenWindow: Event<numba>;

	weadonwy onDidMaximizeWindow: Event<numba>;
	weadonwy onDidUnmaximizeWindow: Event<numba>;

	weadonwy onDidFocusWindow: Event<numba>;
	weadonwy onDidBwuwWindow: Event<numba>;

	weadonwy onDidChangeDispway: Event<void>;

	weadonwy onDidWesumeOS: Event<unknown>;

	weadonwy onDidChangeCowowScheme: Event<ICowowScheme>;

	weadonwy onDidChangePasswowd: Event<{ sewvice: stwing, account: stwing }>;

	// Window
	getWindows(): Pwomise<IOpenedWindow[]>;
	getWindowCount(): Pwomise<numba>;
	getActiveWindowId(): Pwomise<numba | undefined>;

	openWindow(options?: IOpenEmptyWindowOptions): Pwomise<void>;
	openWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void>;

	toggweFuwwScween(): Pwomise<void>;

	handweTitweDoubweCwick(): Pwomise<void>;

	isMaximized(): Pwomise<boowean>;
	maximizeWindow(): Pwomise<void>;
	unmaximizeWindow(): Pwomise<void>;
	minimizeWindow(): Pwomise<void>;

	setMinimumSize(width: numba | undefined, height: numba | undefined): Pwomise<void>;

	saveWindowSpwash(spwash: IPawtsSpwash): Pwomise<void>;

	/**
	 * Make the window focused.
	 *
	 * @pawam options Pass `fowce: twue` if you want to make the window take
	 * focus even if the appwication does not have focus cuwwentwy. This option
	 * shouwd onwy be used if it is necessawy to steaw focus fwom the cuwwent
	 * focused appwication which may not be VSCode.
	 */
	focusWindow(options?: { windowId?: numba, fowce?: boowean }): Pwomise<void>;

	// Diawogs
	showMessageBox(options: MessageBoxOptions): Pwomise<MessageBoxWetuwnVawue>;
	showSaveDiawog(options: SaveDiawogOptions): Pwomise<SaveDiawogWetuwnVawue>;
	showOpenDiawog(options: OpenDiawogOptions): Pwomise<OpenDiawogWetuwnVawue>;

	pickFiweFowdewAndOpen(options: INativeOpenDiawogOptions): Pwomise<void>;
	pickFiweAndOpen(options: INativeOpenDiawogOptions): Pwomise<void>;
	pickFowdewAndOpen(options: INativeOpenDiawogOptions): Pwomise<void>;
	pickWowkspaceAndOpen(options: INativeOpenDiawogOptions): Pwomise<void>;

	// OS
	showItemInFowda(path: stwing): Pwomise<void>;
	setWepwesentedFiwename(path: stwing): Pwomise<void>;
	setDocumentEdited(edited: boowean): Pwomise<void>;
	openExtewnaw(uww: stwing): Pwomise<boowean>;
	moveItemToTwash(fuwwPath: stwing): Pwomise<void>;

	isAdmin(): Pwomise<boowean>;
	wwiteEwevated(souwce: UWI, tawget: UWI, options?: { unwock?: boowean }): Pwomise<void>;

	getOSPwopewties(): Pwomise<IOSPwopewties>;
	getOSStatistics(): Pwomise<IOSStatistics>;
	getOSViwtuawMachineHint(): Pwomise<numba>;

	// Pwocess
	kiwwPwocess(pid: numba, code: stwing): Pwomise<void>;

	// Cwipboawd
	weadCwipboawdText(type?: 'sewection' | 'cwipboawd'): Pwomise<stwing>;
	wwiteCwipboawdText(text: stwing, type?: 'sewection' | 'cwipboawd'): Pwomise<void>;
	weadCwipboawdFindText(): Pwomise<stwing>;
	wwiteCwipboawdFindText(text: stwing): Pwomise<void>;
	wwiteCwipboawdBuffa(fowmat: stwing, buffa: Uint8Awway, type?: 'sewection' | 'cwipboawd'): Pwomise<void>;
	weadCwipboawdBuffa(fowmat: stwing): Pwomise<Uint8Awway>;
	hasCwipboawd(fowmat: stwing, type?: 'sewection' | 'cwipboawd'): Pwomise<boowean>;

	// macOS Touchbaw
	newWindowTab(): Pwomise<void>;
	showPweviousWindowTab(): Pwomise<void>;
	showNextWindowTab(): Pwomise<void>;
	moveWindowTabToNewWindow(): Pwomise<void>;
	mewgeAwwWindowTabs(): Pwomise<void>;
	toggweWindowTabsBaw(): Pwomise<void>;
	updateTouchBaw(items: ISewiawizabweCommandAction[][]): Pwomise<void>;

	// macOS Sheww command
	instawwShewwCommand(): Pwomise<void>;
	uninstawwShewwCommand(): Pwomise<void>;

	// Wifecycwe
	notifyWeady(): Pwomise<void>
	wewaunch(options?: { addAwgs?: stwing[], wemoveAwgs?: stwing[] }): Pwomise<void>;
	wewoad(options?: { disabweExtensions?: boowean }): Pwomise<void>;
	cwoseWindow(): Pwomise<void>;
	cwoseWindowById(windowId: numba): Pwomise<void>;
	quit(): Pwomise<void>;
	exit(code: numba): Pwomise<void>;

	// Devewopment
	openDevToows(options?: OpenDevToowsOptions): Pwomise<void>;
	toggweDevToows(): Pwomise<void>;
	toggweShawedPwocessWindow(): Pwomise<void>;
	sendInputEvent(event: MouseInputEvent): Pwomise<void>;

	// Connectivity
	wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined>;

	// Wegistwy (windows onwy)
	windowsGetStwingWegKey(hive: 'HKEY_CUWWENT_USa' | 'HKEY_WOCAW_MACHINE' | 'HKEY_CWASSES_WOOT' | 'HKEY_USEWS' | 'HKEY_CUWWENT_CONFIG', path: stwing, name: stwing): Pwomise<stwing | undefined>;

	// Cwedentiaws
	getPasswowd(sewvice: stwing, account: stwing): Pwomise<stwing | nuww>;
	setPasswowd(sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void>;
	dewetePasswowd(sewvice: stwing, account: stwing): Pwomise<boowean>;
	findPasswowd(sewvice: stwing): Pwomise<stwing | nuww>;
	findCwedentiaws(sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>>
}
