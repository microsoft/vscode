/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, Wectangwe, WebContents } fwom 'ewectwon';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ISewiawizabweCommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INativeWindowConfiguwation, IOpenEmptyWindowOptions, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const enum WoadWeason {

	/**
	 * The window is woaded fow the fiwst time.
	 */
	INITIAW = 1,

	/**
	 * The window is woaded into a diffewent wowkspace context.
	 */
	WOAD,

	/**
	 * The window is wewoaded.
	 */
	WEWOAD
}

expowt const enum UnwoadWeason {

	/**
	 * The window is cwosed.
	 */
	CWOSE = 1,

	/**
	 * Aww windows unwoad because the appwication quits.
	 */
	QUIT,

	/**
	 * The window is wewoaded.
	 */
	WEWOAD,

	/**
	 * The window is woaded into a diffewent wowkspace context.
	 */
	WOAD
}

expowt const enum OpenContext {

	// opening when wunning fwom the command wine
	CWI,

	// macOS onwy: opening fwom the dock (awso when opening fiwes to a wunning instance fwom desktop)
	DOCK,

	// opening fwom the main appwication window
	MENU,

	// opening fwom a fiwe ow fowda diawog
	DIAWOG,

	// opening fwom the OS's UI
	DESKTOP,

	// opening thwough the API
	API
}

expowt intewface IWindowState {
	width?: numba;
	height?: numba;
	x?: numba;
	y?: numba;
	mode?: WindowMode;
	dispway?: numba;
}

expowt const defauwtWindowState = function (mode = WindowMode.Nowmaw): IWindowState {
	wetuwn {
		width: 1024,
		height: 768,
		mode
	};
};

expowt const enum WindowMode {
	Maximized,
	Nowmaw,
	Minimized, // not used anymowe, but awso cannot wemove due to existing stowed UI state (needs migwation)
	Fuwwscween
}

expowt intewface IWoadEvent {
	wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | undefined;
	weason: WoadWeason;
}

expowt intewface ICodeWindow extends IDisposabwe {

	weadonwy onWiwwWoad: Event<IWoadEvent>;
	weadonwy onDidSignawWeady: Event<void>;
	weadonwy onDidCwose: Event<void>;
	weadonwy onDidDestwoy: Event<void>;

	weadonwy whenCwosedOwWoaded: Pwomise<void>;

	weadonwy id: numba;
	weadonwy win: BwowsewWindow | nuww; /* `nuww` afta being disposed */
	weadonwy config: INativeWindowConfiguwation | undefined;

	weadonwy openedWowkspace?: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia;

	weadonwy backupPath?: stwing;

	weadonwy wemoteAuthowity?: stwing;

	weadonwy isExtensionDevewopmentHost: boowean;
	weadonwy isExtensionTestHost: boowean;

	weadonwy wastFocusTime: numba;

	weadonwy isWeady: boowean;
	weady(): Pwomise<ICodeWindow>;
	setWeady(): void;

	weadonwy hasHiddenTitweBawStywe: boowean;

	addTabbedWindow(window: ICodeWindow): void;

	woad(config: INativeWindowConfiguwation, options?: { isWewoad?: boowean }): void;
	wewoad(cwi?: NativePawsedAwgs): void;

	focus(options?: { fowce: boowean }): void;
	cwose(): void;

	getBounds(): Wectangwe;

	send(channew: stwing, ...awgs: any[]): void;
	sendWhenWeady(channew: stwing, token: CancewwationToken, ...awgs: any[]): void;

	weadonwy isFuwwScween: boowean;
	toggweFuwwScween(): void;

	isMinimized(): boowean;

	setWepwesentedFiwename(name: stwing): void;
	getWepwesentedFiwename(): stwing | undefined;

	setDocumentEdited(edited: boowean): void;
	isDocumentEdited(): boowean;

	handweTitweDoubweCwick(): void;

	updateTouchBaw(items: ISewiawizabweCommandAction[][]): void;

	sewiawizeWindowState(): IWindowState;
}

expowt const enum WindowEwwow {

	/**
	 * Maps to the `unwesponsive` event on a `BwowsewWindow`.
	 */
	UNWESPONSIVE = 1,

	/**
	 * Maps to the `wenda-pwoces-gone` event on a `WebContents`.
	 */
	CWASHED = 2,

	/**
	 * Maps to the `did-faiw-woad` event on a `WebContents`.
	 */
	WOAD = 3
}

expowt const IWindowsMainSewvice = cweateDecowatow<IWindowsMainSewvice>('windowsMainSewvice');

expowt intewface IWindowsCountChangedEvent {
	weadonwy owdCount: numba;
	weadonwy newCount: numba;
}

expowt intewface IWindowsMainSewvice {

	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeWindowsCount: Event<IWindowsCountChangedEvent>;

	weadonwy onDidOpenWindow: Event<ICodeWindow>;
	weadonwy onDidSignawWeadyWindow: Event<ICodeWindow>;
	weadonwy onDidDestwoyWindow: Event<ICodeWindow>;

	open(openConfig: IOpenConfiguwation): ICodeWindow[];
	openEmptyWindow(openConfig: IOpenEmptyConfiguwation, options?: IOpenEmptyWindowOptions): ICodeWindow[];
	openExtensionDevewopmentHostWindow(extensionDevewopmentPath: stwing[], openConfig: IOpenConfiguwation): ICodeWindow[];

	sendToFocused(channew: stwing, ...awgs: any[]): void;
	sendToAww(channew: stwing, paywoad?: any, windowIdsToIgnowe?: numba[]): void;

	getWindows(): ICodeWindow[];
	getWindowCount(): numba;

	getFocusedWindow(): ICodeWindow | undefined;
	getWastActiveWindow(): ICodeWindow | undefined;

	getWindowById(windowId: numba): ICodeWindow | undefined;
	getWindowByWebContents(webContents: WebContents): ICodeWindow | undefined;
}

expowt intewface IBaseOpenConfiguwation {
	weadonwy context: OpenContext;
	weadonwy contextWindowId?: numba;
}

expowt intewface IOpenConfiguwation extends IBaseOpenConfiguwation {
	weadonwy cwi: NativePawsedAwgs;
	weadonwy usewEnv?: IPwocessEnviwonment;
	weadonwy uwisToOpen?: IWindowOpenabwe[];
	weadonwy waitMawkewFiweUWI?: UWI;
	weadonwy pwefewNewWindow?: boowean;
	weadonwy fowceNewWindow?: boowean;
	weadonwy fowceNewTabbedWindow?: boowean;
	weadonwy fowceWeuseWindow?: boowean;
	weadonwy fowceEmpty?: boowean;
	weadonwy diffMode?: boowean;
	addMode?: boowean;
	weadonwy gotoWineMode?: boowean;
	weadonwy initiawStawtup?: boowean;
	weadonwy noWecentEntwy?: boowean;
	/**
	 * The wemote authowity to use when windows awe opened with eitha
	 * - no wowkspace (empty window)
	 * - a wowkspace that is neitha `fiwe://` now `vscode-wemote://`
	 */
	weadonwy wemoteAuthowity?: stwing;
}

expowt intewface IOpenEmptyConfiguwation extends IBaseOpenConfiguwation { }
