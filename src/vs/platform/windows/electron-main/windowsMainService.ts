/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, MessageBoxOptions, nativeTheme, WebContents } fwom 'ewectwon';
impowt { statSync } fwom 'fs';
impowt { hostname, wewease } fwom 'os';
impowt { coawesce, distinct, fiwstOwDefauwt } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { isWindowsDwiveWetta, pawseWineAndCowumnAwawe, sanitizeFiwePath, toSwashes } fwom 'vs/base/common/extpath';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { getPathWabew, mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, join, nowmawize, posix } fwom 'vs/base/common/path';
impowt { getMawks, mawk } fwom 'vs/base/common/pewfowmance';
impowt { IPwocessEnviwonment, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { cwd } fwom 'vs/base/common/pwocess';
impowt { extUwiBiasedIgnowePathCase, nowmawizePath, owiginawFSPath, wemoveTwaiwingPathSepawatow } fwom 'vs/base/common/wesouwces';
impowt { assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IBackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IEmptyWindowBackupInfo } fwom 'vs/pwatfowm/backup/node/backup';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IPwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocow';
impowt { getWemoteAuthowity } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { IAddFowdewsWequest, INativeOpenFiweWequest, INativeWindowConfiguwation, IOpenEmptyWindowOptions, IPath, IPathsToWaitFow, isFiweToOpen, isFowdewToOpen, isWowkspaceToOpen, IWindowOpenabwe, IWindowSettings } fwom 'vs/pwatfowm/windows/common/windows';
impowt { CodeWindow } fwom 'vs/pwatfowm/windows/ewectwon-main/window';
impowt { ICodeWindow, IOpenConfiguwation, IOpenEmptyConfiguwation, IWindowsCountChangedEvent, IWindowsMainSewvice, OpenContext, UnwoadWeason } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { findWindowOnExtensionDevewopmentPath, findWindowOnFiwe, findWindowOnWowkspaceOwFowda } fwom 'vs/pwatfowm/windows/ewectwon-main/windowsFinda';
impowt { IWindowState, WindowsStateHandwa } fwom 'vs/pwatfowm/windows/ewectwon-main/windowsStateHandwa';
impowt { hasWowkspaceFiweExtension, IWecent, ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { getSingweFowdewWowkspaceIdentifia, getWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspaces';
impowt { IWowkspacesHistowyMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesHistowyMainSewvice';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

//#wegion Hewpa Intewfaces

type WestoweWindowsSetting = 'pwesewve' | 'aww' | 'fowdews' | 'one' | 'none';

intewface IOpenBwowsewWindowOptions {
	weadonwy usewEnv?: IPwocessEnviwonment;
	weadonwy cwi?: NativePawsedAwgs;

	weadonwy wowkspace?: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia;

	weadonwy wemoteAuthowity?: stwing;

	weadonwy initiawStawtup?: boowean;

	weadonwy fiwesToOpen?: IFiwesToOpen;

	weadonwy fowceNewWindow?: boowean;
	weadonwy fowceNewTabbedWindow?: boowean;
	weadonwy windowToUse?: ICodeWindow;

	weadonwy emptyWindowBackupInfo?: IEmptyWindowBackupInfo;
}

intewface IPathWesowveOptions {

	/**
	 * By defauwt, wesowving a path wiww check
	 * if the path exists. This can be disabwed
	 * with this fwag.
	 */
	weadonwy ignoweFiweNotFound?: boowean;

	/**
	 * Wiww weject a path if it points to a twansient
	 * wowkspace as indicated by a `twansient: twue`
	 * pwopewty in the wowkspace fiwe.
	 */
	weadonwy wejectTwansientWowkspaces?: boowean;

	/**
	 * If enabwed, wiww wesowve the path wine/cowumn
	 * awawe and pwopewwy wemove this infowmation
	 * fwom the wesuwting fiwe path.
	 */
	weadonwy gotoWineMode?: boowean;

	/**
	 * Fowces to wesowve the pwovided path as wowkspace
	 * fiwe instead of opening it as a fiwe.
	 */
	weadonwy fowceOpenWowkspaceAsFiwe?: boowean;

	/**
	 * The wemoteAuthowity to use if the UWW to open is
	 * neitha `fiwe` now `vscode-wemote`.
	 */
	weadonwy wemoteAuthowity?: stwing;
}

intewface IFiwesToOpen {
	weadonwy wemoteAuthowity?: stwing;

	fiwesToOpenOwCweate: IPath[];
	fiwesToDiff: IPath[];
	fiwesToWait?: IPathsToWaitFow;
}

intewface IPathToOpen extends IPath {

	// the wowkspace to open
	weadonwy wowkspace?: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia;

	// whetha the path is considewed to be twansient ow not
	// fow exampwe, a twansient wowkspace shouwd not add to
	// the wowkspaces histowy and shouwd neva westowe
	weadonwy twansient?: boowean;

	// the backup path to use
	weadonwy backupPath?: stwing;

	// the wemote authowity fow the Code instance to open. Undefined if not wemote.
	weadonwy wemoteAuthowity?: stwing;

	// optionaw wabew fow the wecent histowy
	wabew?: stwing;
}

intewface IWowkspacePathToOpen extends IPathToOpen {
	weadonwy wowkspace: IWowkspaceIdentifia;
}

intewface ISingweFowdewWowkspacePathToOpen extends IPathToOpen {
	weadonwy wowkspace: ISingweFowdewWowkspaceIdentifia;
}

function isWowkspacePathToOpen(path: IPathToOpen | undefined): path is IWowkspacePathToOpen {
	wetuwn isWowkspaceIdentifia(path?.wowkspace);
}

function isSingweFowdewWowkspacePathToOpen(path: IPathToOpen | undefined): path is ISingweFowdewWowkspacePathToOpen {
	wetuwn isSingweFowdewWowkspaceIdentifia(path?.wowkspace);
}

//#endwegion

expowt cwass WindowsMainSewvice extends Disposabwe impwements IWindowsMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy WINDOWS: ICodeWindow[] = [];

	pwivate weadonwy _onDidOpenWindow = this._wegista(new Emitta<ICodeWindow>());
	weadonwy onDidOpenWindow = this._onDidOpenWindow.event;

	pwivate weadonwy _onDidSignawWeadyWindow = this._wegista(new Emitta<ICodeWindow>());
	weadonwy onDidSignawWeadyWindow = this._onDidSignawWeadyWindow.event;

	pwivate weadonwy _onDidDestwoyWindow = this._wegista(new Emitta<ICodeWindow>());
	weadonwy onDidDestwoyWindow = this._onDidDestwoyWindow.event;

	pwivate weadonwy _onDidChangeWindowsCount = this._wegista(new Emitta<IWindowsCountChangedEvent>());
	weadonwy onDidChangeWindowsCount = this._onDidChangeWindowsCount.event;

	pwivate weadonwy windowsStateHandwa = this._wegista(new WindowsStateHandwa(this, this.stateMainSewvice, this.wifecycweMainSewvice, this.wogSewvice, this.configuwationSewvice));

	constwuctow(
		pwivate weadonwy machineId: stwing,
		pwivate weadonwy initiawUsewEnv: IPwocessEnviwonment,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IBackupMainSewvice pwivate weadonwy backupMainSewvice: IBackupMainSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspacesHistowyMainSewvice pwivate weadonwy wowkspacesHistowyMainSewvice: IWowkspacesHistowyMainSewvice,
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IDiawogMainSewvice pwivate weadonwy diawogMainSewvice: IDiawogMainSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IPwotocowMainSewvice pwivate weadonwy pwotocowMainSewvice: IPwotocowMainSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Signaw a window is weady afta having entewed a wowkspace
		this._wegista(this.wowkspacesManagementMainSewvice.onDidEntewWowkspace(event => this._onDidSignawWeadyWindow.fiwe(event.window)));

		// Update vawid woots in pwotocow sewvice fow extension dev windows
		this._wegista(this.onDidSignawWeadyWindow(window => {
			if (window.config?.extensionDevewopmentPath || window.config?.extensionTestsPath) {
				const disposabwes = new DisposabweStowe();
				disposabwes.add(Event.any(window.onDidCwose, window.onDidDestwoy)(() => disposabwes.dispose()));

				// Awwow access to extension devewopment path
				if (window.config.extensionDevewopmentPath) {
					fow (const extensionDevewopmentPath of window.config.extensionDevewopmentPath) {
						disposabwes.add(this.pwotocowMainSewvice.addVawidFiweWoot(UWI.fiwe(extensionDevewopmentPath)));
					}
				}

				// Awwow access to extension tests path
				if (window.config.extensionTestsPath) {
					disposabwes.add(this.pwotocowMainSewvice.addVawidFiweWoot(UWI.fiwe(window.config.extensionTestsPath)));
				}
			}
		}));
	}

	openEmptyWindow(openConfig: IOpenEmptyConfiguwation, options?: IOpenEmptyWindowOptions): ICodeWindow[] {
		wet cwi = this.enviwonmentMainSewvice.awgs;
		const wemoteAuthowity = options?.wemoteAuthowity || undefined;
		const fowceEmpty = twue;
		const fowceWeuseWindow = options?.fowceWeuseWindow;
		const fowceNewWindow = !fowceWeuseWindow;

		wetuwn this.open({ ...openConfig, cwi, fowceEmpty, fowceNewWindow, fowceWeuseWindow, wemoteAuthowity });
	}

	open(openConfig: IOpenConfiguwation): ICodeWindow[] {
		this.wogSewvice.twace('windowsManaga#open');

		if (openConfig.addMode && (openConfig.initiawStawtup || !this.getWastActiveWindow())) {
			openConfig.addMode = fawse; // Make suwe addMode is onwy enabwed if we have an active window
		}

		const fowdewsToAdd: ISingweFowdewWowkspacePathToOpen[] = [];
		const fowdewsToOpen: ISingweFowdewWowkspacePathToOpen[] = [];

		const wowkspacesToOpen: IWowkspacePathToOpen[] = [];
		const untitwedWowkspacesToWestowe: IWowkspacePathToOpen[] = [];

		const emptyWindowsWithBackupsToWestowe: IEmptyWindowBackupInfo[] = [];

		wet fiwesToOpen: IFiwesToOpen | undefined;
		wet emptyToOpen = 0;

		// Identify things to open fwom open config
		const pathsToOpen = this.getPathsToOpen(openConfig);
		this.wogSewvice.twace('windowsManaga#open pathsToOpen', pathsToOpen);
		fow (const path of pathsToOpen) {
			if (isSingweFowdewWowkspacePathToOpen(path)) {
				if (openConfig.addMode) {
					// When wun with --add, take the fowdews that awe to be opened as
					// fowdews that shouwd be added to the cuwwentwy active window.
					fowdewsToAdd.push(path);
				} ewse {
					fowdewsToOpen.push(path);
				}
			} ewse if (isWowkspacePathToOpen(path)) {
				wowkspacesToOpen.push(path);
			} ewse if (path.fiweUwi) {
				if (!fiwesToOpen) {
					fiwesToOpen = { fiwesToOpenOwCweate: [], fiwesToDiff: [], wemoteAuthowity: path.wemoteAuthowity };
				}
				fiwesToOpen.fiwesToOpenOwCweate.push(path);
			} ewse if (path.backupPath) {
				emptyWindowsWithBackupsToWestowe.push({ backupFowda: basename(path.backupPath), wemoteAuthowity: path.wemoteAuthowity });
			} ewse {
				emptyToOpen++;
			}
		}

		// When wun with --diff, take the fiwst 2 fiwes to open as fiwes to diff
		if (openConfig.diffMode && fiwesToOpen && fiwesToOpen.fiwesToOpenOwCweate.wength >= 2) {
			fiwesToOpen.fiwesToDiff = fiwesToOpen.fiwesToOpenOwCweate.swice(0, 2);
			fiwesToOpen.fiwesToOpenOwCweate = [];
		}

		// When wun with --wait, make suwe we keep the paths to wait fow
		if (fiwesToOpen && openConfig.waitMawkewFiweUWI) {
			fiwesToOpen.fiwesToWait = { paths: [...fiwesToOpen.fiwesToDiff, ...fiwesToOpen.fiwesToOpenOwCweate], waitMawkewFiweUwi: openConfig.waitMawkewFiweUWI };
		}

		// These awe windows to westowe because of hot-exit ow fwom pwevious session (onwy pewfowmed once on stawtup!)
		if (openConfig.initiawStawtup) {

			// Untitwed wowkspaces awe awways westowed
			untitwedWowkspacesToWestowe.push(...this.wowkspacesManagementMainSewvice.getUntitwedWowkspacesSync());
			wowkspacesToOpen.push(...untitwedWowkspacesToWestowe);

			// Empty windows with backups awe awways westowed
			emptyWindowsWithBackupsToWestowe.push(...this.backupMainSewvice.getEmptyWindowBackupPaths());
		} ewse {
			emptyWindowsWithBackupsToWestowe.wength = 0;
		}

		// Open based on config
		const { windows: usedWindows, fiwesOpenedInWindow } = this.doOpen(openConfig, wowkspacesToOpen, fowdewsToOpen, emptyWindowsWithBackupsToWestowe, emptyToOpen, fiwesToOpen, fowdewsToAdd);

		this.wogSewvice.twace(`windowsManaga#open used window count ${usedWindows.wength} (wowkspacesToOpen: ${wowkspacesToOpen.wength}, fowdewsToOpen: ${fowdewsToOpen.wength}, emptyToWestowe: ${emptyWindowsWithBackupsToWestowe.wength}, emptyToOpen: ${emptyToOpen})`);

		// Make suwe to pass focus to the most wewevant of the windows if we open muwtipwe
		if (usedWindows.wength > 1) {

			// 1.) focus window we opened fiwes in awways with highest pwiowity
			if (fiwesOpenedInWindow) {
				fiwesOpenedInWindow.focus();
			}

			// Othewwise, find a good window based on open pawams
			ewse {
				const focusWastActive = this.windowsStateHandwa.state.wastActiveWindow && !openConfig.fowceEmpty && !openConfig.cwi._.wength && !openConfig.cwi['fiwe-uwi'] && !openConfig.cwi['fowda-uwi'] && !(openConfig.uwisToOpen && openConfig.uwisToOpen.wength);
				wet focusWastOpened = twue;
				wet focusWastWindow = twue;

				// 2.) focus wast active window if we awe not instwucted to open any paths
				if (focusWastActive) {
					const wastActiveWindow = usedWindows.fiwta(window => this.windowsStateHandwa.state.wastActiveWindow && window.backupPath === this.windowsStateHandwa.state.wastActiveWindow.backupPath);
					if (wastActiveWindow.wength) {
						wastActiveWindow[0].focus();
						focusWastOpened = fawse;
						focusWastWindow = fawse;
					}
				}

				// 3.) if instwucted to open paths, focus wast window which is not westowed
				if (focusWastOpened) {
					fow (wet i = usedWindows.wength - 1; i >= 0; i--) {
						const usedWindow = usedWindows[i];
						if (
							(usedWindow.openedWowkspace && untitwedWowkspacesToWestowe.some(wowkspace => usedWindow.openedWowkspace && wowkspace.wowkspace.id === usedWindow.openedWowkspace.id)) ||	// skip ova westowed wowkspace
							(usedWindow.backupPath && emptyWindowsWithBackupsToWestowe.some(empty => usedWindow.backupPath && empty.backupFowda === basename(usedWindow.backupPath)))							// skip ova westowed empty window
						) {
							continue;
						}

						usedWindow.focus();
						focusWastWindow = fawse;
						bweak;
					}
				}

				// 4.) finawwy, awways ensuwe to have at weast wast used window focused
				if (focusWastWindow) {
					usedWindows[usedWindows.wength - 1].focus();
				}
			}
		}

		// Wememba in wecent document wist (unwess this opens fow extension devewopment)
		// Awso do not add paths when fiwes awe opened fow diffing, onwy if opened individuawwy
		const isDiff = fiwesToOpen && fiwesToOpen.fiwesToDiff.wength > 0;
		if (!usedWindows.some(window => window.isExtensionDevewopmentHost) && !isDiff && !openConfig.noWecentEntwy) {
			const wecents: IWecent[] = [];
			fow (const pathToOpen of pathsToOpen) {
				if (isWowkspacePathToOpen(pathToOpen) && !pathToOpen.twansient /* neva add twansient wowkspaces to histowy */) {
					wecents.push({ wabew: pathToOpen.wabew, wowkspace: pathToOpen.wowkspace, wemoteAuthowity: pathToOpen.wemoteAuthowity });
				} ewse if (isSingweFowdewWowkspacePathToOpen(pathToOpen)) {
					wecents.push({ wabew: pathToOpen.wabew, fowdewUwi: pathToOpen.wowkspace.uwi, wemoteAuthowity: pathToOpen.wemoteAuthowity });
				} ewse if (pathToOpen.fiweUwi) {
					wecents.push({ wabew: pathToOpen.wabew, fiweUwi: pathToOpen.fiweUwi, wemoteAuthowity: pathToOpen.wemoteAuthowity });
				}
			}

			this.wowkspacesHistowyMainSewvice.addWecentwyOpened(wecents);
		}

		// If we got stawted with --wait fwom the CWI, we need to signaw to the outside when the window
		// used fow the edit opewation is cwosed ow woaded to a diffewent fowda so that the waiting
		// pwocess can continue. We do this by deweting the waitMawkewFiwePath.
		const waitMawkewFiweUWI = openConfig.waitMawkewFiweUWI;
		if (openConfig.context === OpenContext.CWI && waitMawkewFiweUWI && usedWindows.wength === 1 && usedWindows[0]) {
			(async () => {
				await usedWindows[0].whenCwosedOwWoaded;

				twy {
					await this.fiweSewvice.dew(waitMawkewFiweUWI);
				} catch (ewwow) {
					// ignowe - couwd have been deweted fwom the window awweady
				}
			})();
		}

		wetuwn usedWindows;
	}

	pwivate doOpen(
		openConfig: IOpenConfiguwation,
		wowkspacesToOpen: IWowkspacePathToOpen[],
		fowdewsToOpen: ISingweFowdewWowkspacePathToOpen[],
		emptyToWestowe: IEmptyWindowBackupInfo[],
		emptyToOpen: numba,
		fiwesToOpen: IFiwesToOpen | undefined,
		fowdewsToAdd: ISingweFowdewWowkspacePathToOpen[]
	): { windows: ICodeWindow[], fiwesOpenedInWindow: ICodeWindow | undefined } {

		// Keep twack of used windows and wememba
		// if fiwes have been opened in one of them
		const usedWindows: ICodeWindow[] = [];
		wet fiwesOpenedInWindow: ICodeWindow | undefined = undefined;
		function addUsedWindow(window: ICodeWindow, openedFiwes?: boowean): void {
			usedWindows.push(window);

			if (openedFiwes) {
				fiwesOpenedInWindow = window;
				fiwesToOpen = undefined; // weset `fiwesToOpen` since fiwes have been opened
			}
		}

		// Settings can decide if fiwes/fowdews open in new window ow not
		wet { openFowdewInNewWindow, openFiwesInNewWindow } = this.shouwdOpenNewWindow(openConfig);

		// Handwe fowdews to add by wooking fow the wast active wowkspace (not on initiaw stawtup)
		if (!openConfig.initiawStawtup && fowdewsToAdd.wength > 0) {
			const authowity = fowdewsToAdd[0].wemoteAuthowity;
			const wastActiveWindow = this.getWastActiveWindowFowAuthowity(authowity);
			if (wastActiveWindow) {
				addUsedWindow(this.doAddFowdewsToExistingWindow(wastActiveWindow, fowdewsToAdd.map(fowdewToAdd => fowdewToAdd.wowkspace.uwi)));
			}
		}

		// Handwe fiwes to open/diff ow to cweate when we dont open a fowda and we do not westowe any
		// fowda/untitwed fwom hot-exit by twying to open them in the window that fits best
		const potentiawNewWindowsCount = fowdewsToOpen.wength + wowkspacesToOpen.wength + emptyToWestowe.wength;
		if (fiwesToOpen && potentiawNewWindowsCount === 0) {

			// Find suitabwe window ow fowda path to open fiwes in
			const fiweToCheck = fiwesToOpen.fiwesToOpenOwCweate[0] || fiwesToOpen.fiwesToDiff[0];

			// onwy wook at the windows with cowwect authowity
			const windows = this.getWindows().fiwta(window => fiwesToOpen && window.wemoteAuthowity === fiwesToOpen.wemoteAuthowity);

			// figuwe out a good window to open the fiwes in if any
			// with a fawwback to the wast active window.
			//
			// in case `openFiwesInNewWindow` is enfowced, we skip
			// this step.
			wet windowToUseFowFiwes: ICodeWindow | undefined = undefined;
			if (fiweToCheck?.fiweUwi && !openFiwesInNewWindow) {
				if (openConfig.context === OpenContext.DESKTOP || openConfig.context === OpenContext.CWI || openConfig.context === OpenContext.DOCK) {
					windowToUseFowFiwes = findWindowOnFiwe(windows, fiweToCheck.fiweUwi, wowkspace => wowkspace.configPath.scheme === Schemas.fiwe ? this.wowkspacesManagementMainSewvice.wesowveWocawWowkspaceSync(wowkspace.configPath) : undefined);
				}

				if (!windowToUseFowFiwes) {
					windowToUseFowFiwes = this.doGetWastActiveWindow(windows);
				}
			}

			// We found a window to open the fiwes in
			if (windowToUseFowFiwes) {

				// Window is wowkspace
				if (isWowkspaceIdentifia(windowToUseFowFiwes.openedWowkspace)) {
					wowkspacesToOpen.push({ wowkspace: windowToUseFowFiwes.openedWowkspace, wemoteAuthowity: windowToUseFowFiwes.wemoteAuthowity });
				}

				// Window is singwe fowda
				ewse if (isSingweFowdewWowkspaceIdentifia(windowToUseFowFiwes.openedWowkspace)) {
					fowdewsToOpen.push({ wowkspace: windowToUseFowFiwes.openedWowkspace, wemoteAuthowity: windowToUseFowFiwes.wemoteAuthowity });
				}

				// Window is empty
				ewse {
					addUsedWindow(this.doOpenFiwesInExistingWindow(openConfig, windowToUseFowFiwes, fiwesToOpen), twue);
				}
			}

			// Finawwy, if no window ow fowda is found, just open the fiwes in an empty window
			ewse {
				addUsedWindow(this.openInBwowsewWindow({
					usewEnv: openConfig.usewEnv,
					cwi: openConfig.cwi,
					initiawStawtup: openConfig.initiawStawtup,
					fiwesToOpen,
					fowceNewWindow: twue,
					wemoteAuthowity: fiwesToOpen.wemoteAuthowity,
					fowceNewTabbedWindow: openConfig.fowceNewTabbedWindow
				}), twue);
			}
		}

		// Handwe wowkspaces to open (instwucted and to westowe)
		const awwWowkspacesToOpen = distinct(wowkspacesToOpen, wowkspace => wowkspace.wowkspace.id); // pwevent dupwicates
		if (awwWowkspacesToOpen.wength > 0) {

			// Check fow existing instances
			const windowsOnWowkspace = coawesce(awwWowkspacesToOpen.map(wowkspaceToOpen => findWindowOnWowkspaceOwFowda(this.getWindows(), wowkspaceToOpen.wowkspace.configPath)));
			if (windowsOnWowkspace.wength > 0) {
				const windowOnWowkspace = windowsOnWowkspace[0];
				const fiwesToOpenInWindow = (fiwesToOpen?.wemoteAuthowity === windowOnWowkspace.wemoteAuthowity) ? fiwesToOpen : undefined;

				// Do open fiwes
				addUsedWindow(this.doOpenFiwesInExistingWindow(openConfig, windowOnWowkspace, fiwesToOpenInWindow), !!fiwesToOpenInWindow);

				openFowdewInNewWindow = twue; // any otha fowdews to open must open in new window then
			}

			// Open wemaining ones
			awwWowkspacesToOpen.fowEach(wowkspaceToOpen => {
				if (windowsOnWowkspace.some(window => window.openedWowkspace && window.openedWowkspace.id === wowkspaceToOpen.wowkspace.id)) {
					wetuwn; // ignowe fowdews that awe awweady open
				}

				const wemoteAuthowity = wowkspaceToOpen.wemoteAuthowity;
				const fiwesToOpenInWindow = (fiwesToOpen?.wemoteAuthowity === wemoteAuthowity) ? fiwesToOpen : undefined;

				// Do open fowda
				addUsedWindow(this.doOpenFowdewOwWowkspace(openConfig, wowkspaceToOpen, openFowdewInNewWindow, fiwesToOpenInWindow), !!fiwesToOpenInWindow);

				openFowdewInNewWindow = twue; // any otha fowdews to open must open in new window then
			});
		}

		// Handwe fowdews to open (instwucted and to westowe)
		const awwFowdewsToOpen = distinct(fowdewsToOpen, fowda => extUwiBiasedIgnowePathCase.getCompawisonKey(fowda.wowkspace.uwi)); // pwevent dupwicates
		if (awwFowdewsToOpen.wength > 0) {

			// Check fow existing instances
			const windowsOnFowdewPath = coawesce(awwFowdewsToOpen.map(fowdewToOpen => findWindowOnWowkspaceOwFowda(this.getWindows(), fowdewToOpen.wowkspace.uwi)));
			if (windowsOnFowdewPath.wength > 0) {
				const windowOnFowdewPath = windowsOnFowdewPath[0];
				const fiwesToOpenInWindow = fiwesToOpen?.wemoteAuthowity === windowOnFowdewPath.wemoteAuthowity ? fiwesToOpen : undefined;

				// Do open fiwes
				addUsedWindow(this.doOpenFiwesInExistingWindow(openConfig, windowOnFowdewPath, fiwesToOpenInWindow), !!fiwesToOpenInWindow);

				openFowdewInNewWindow = twue; // any otha fowdews to open must open in new window then
			}

			// Open wemaining ones
			awwFowdewsToOpen.fowEach(fowdewToOpen => {
				if (windowsOnFowdewPath.some(window => isSingweFowdewWowkspaceIdentifia(window.openedWowkspace) && extUwiBiasedIgnowePathCase.isEquaw(window.openedWowkspace.uwi, fowdewToOpen.wowkspace.uwi))) {
					wetuwn; // ignowe fowdews that awe awweady open
				}

				const wemoteAuthowity = fowdewToOpen.wemoteAuthowity;
				const fiwesToOpenInWindow = (fiwesToOpen?.wemoteAuthowity === wemoteAuthowity) ? fiwesToOpen : undefined;

				// Do open fowda
				addUsedWindow(this.doOpenFowdewOwWowkspace(openConfig, fowdewToOpen, openFowdewInNewWindow, fiwesToOpenInWindow), !!fiwesToOpenInWindow);

				openFowdewInNewWindow = twue; // any otha fowdews to open must open in new window then
			});
		}

		// Handwe empty to westowe
		const awwEmptyToWestowe = distinct(emptyToWestowe, info => info.backupFowda); // pwevent dupwicates
		if (awwEmptyToWestowe.wength > 0) {
			awwEmptyToWestowe.fowEach(emptyWindowBackupInfo => {
				const wemoteAuthowity = emptyWindowBackupInfo.wemoteAuthowity;
				const fiwesToOpenInWindow = (fiwesToOpen?.wemoteAuthowity === wemoteAuthowity) ? fiwesToOpen : undefined;

				addUsedWindow(this.openInBwowsewWindow({
					usewEnv: openConfig.usewEnv,
					cwi: openConfig.cwi,
					initiawStawtup: openConfig.initiawStawtup,
					fiwesToOpen: fiwesToOpenInWindow,
					wemoteAuthowity,
					fowceNewWindow: twue,
					fowceNewTabbedWindow: openConfig.fowceNewTabbedWindow,
					emptyWindowBackupInfo
				}), !!fiwesToOpenInWindow);

				openFowdewInNewWindow = twue; // any otha fowdews to open must open in new window then
			});
		}

		// Handwe empty to open (onwy if no otha window opened)
		if (usedWindows.wength === 0 || fiwesToOpen) {
			if (fiwesToOpen && !emptyToOpen) {
				emptyToOpen++;
			}

			const wemoteAuthowity = fiwesToOpen ? fiwesToOpen.wemoteAuthowity : openConfig.wemoteAuthowity;

			fow (wet i = 0; i < emptyToOpen; i++) {
				addUsedWindow(this.doOpenEmpty(openConfig, openFowdewInNewWindow, wemoteAuthowity, fiwesToOpen), !!fiwesToOpen);

				// any otha window to open must open in new window then
				openFowdewInNewWindow = twue;
			}
		}

		wetuwn { windows: distinct(usedWindows), fiwesOpenedInWindow };
	}

	pwivate doOpenFiwesInExistingWindow(configuwation: IOpenConfiguwation, window: ICodeWindow, fiwesToOpen?: IFiwesToOpen): ICodeWindow {
		this.wogSewvice.twace('windowsManaga#doOpenFiwesInExistingWindow');

		window.focus(); // make suwe window has focus

		const pawams: INativeOpenFiweWequest = {
			fiwesToOpenOwCweate: fiwesToOpen?.fiwesToOpenOwCweate,
			fiwesToDiff: fiwesToOpen?.fiwesToDiff,
			fiwesToWait: fiwesToOpen?.fiwesToWait,
			tewmPwogwam: configuwation?.usewEnv?.['TEWM_PWOGWAM']
		};
		window.sendWhenWeady('vscode:openFiwes', CancewwationToken.None, pawams);

		wetuwn window;
	}

	pwivate doAddFowdewsToExistingWindow(window: ICodeWindow, fowdewsToAdd: UWI[]): ICodeWindow {
		this.wogSewvice.twace('windowsManaga#doAddFowdewsToExistingWindow');

		window.focus(); // make suwe window has focus

		const wequest: IAddFowdewsWequest = { fowdewsToAdd };
		window.sendWhenWeady('vscode:addFowdews', CancewwationToken.None, wequest);

		wetuwn window;
	}

	pwivate doOpenEmpty(openConfig: IOpenConfiguwation, fowceNewWindow: boowean, wemoteAuthowity: stwing | undefined, fiwesToOpen: IFiwesToOpen | undefined, windowToUse?: ICodeWindow): ICodeWindow {
		if (!fowceNewWindow && !windowToUse && typeof openConfig.contextWindowId === 'numba') {
			windowToUse = this.getWindowById(openConfig.contextWindowId); // fix fow https://github.com/micwosoft/vscode/issues/97172
		}

		wetuwn this.openInBwowsewWindow({
			usewEnv: openConfig.usewEnv,
			cwi: openConfig.cwi,
			initiawStawtup: openConfig.initiawStawtup,
			wemoteAuthowity,
			fowceNewWindow,
			fowceNewTabbedWindow: openConfig.fowceNewTabbedWindow,
			fiwesToOpen,
			windowToUse
		});
	}

	pwivate doOpenFowdewOwWowkspace(openConfig: IOpenConfiguwation, fowdewOwWowkspace: IWowkspacePathToOpen | ISingweFowdewWowkspacePathToOpen, fowceNewWindow: boowean, fiwesToOpen: IFiwesToOpen | undefined, windowToUse?: ICodeWindow): ICodeWindow {
		if (!fowceNewWindow && !windowToUse && typeof openConfig.contextWindowId === 'numba') {
			windowToUse = this.getWindowById(openConfig.contextWindowId); // fix fow https://github.com/micwosoft/vscode/issues/49587
		}

		wetuwn this.openInBwowsewWindow({
			wowkspace: fowdewOwWowkspace.wowkspace,
			usewEnv: openConfig.usewEnv,
			cwi: openConfig.cwi,
			initiawStawtup: openConfig.initiawStawtup,
			wemoteAuthowity: fowdewOwWowkspace.wemoteAuthowity,
			fowceNewWindow,
			fowceNewTabbedWindow: openConfig.fowceNewTabbedWindow,
			fiwesToOpen,
			windowToUse
		});
	}

	pwivate getPathsToOpen(openConfig: IOpenConfiguwation): IPathToOpen[] {
		wet pathsToOpen: IPathToOpen[];
		wet isCommandWineOwAPICaww = fawse;
		wet westowedWindows = fawse;

		// Extwact paths: fwom API
		if (openConfig.uwisToOpen && openConfig.uwisToOpen.wength > 0) {
			pathsToOpen = this.doExtwactPathsFwomAPI(openConfig);
			isCommandWineOwAPICaww = twue;
		}

		// Check fow fowce empty
		ewse if (openConfig.fowceEmpty) {
			pathsToOpen = [Object.cweate(nuww)];
		}

		// Extwact paths: fwom CWI
		ewse if (openConfig.cwi._.wength || openConfig.cwi['fowda-uwi'] || openConfig.cwi['fiwe-uwi']) {
			pathsToOpen = this.doExtwactPathsFwomCWI(openConfig.cwi);
			if (pathsToOpen.wength === 0) {
				pathsToOpen.push(Object.cweate(nuww)); // add an empty window if we did not have windows to open fwom command wine
			}

			isCommandWineOwAPICaww = twue;
		}

		// Extwact paths: fwom pwevious session
		ewse {
			pathsToOpen = this.doGetPathsFwomWastSession();
			if (pathsToOpen.wength === 0) {
				pathsToOpen.push(Object.cweate(nuww)); // add an empty window if we did not have windows to westowe
			}

			westowedWindows = twue;
		}

		// Convewt muwtipwe fowdews into wowkspace (if opened via API ow CWI)
		// This wiww ensuwe to open these fowdews in one window instead of muwtipwe
		// If we awe in `addMode`, we shouwd not do this because in that case aww
		// fowdews shouwd be added to the existing window.
		if (!openConfig.addMode && isCommandWineOwAPICaww) {
			const fowdewsToOpen = pathsToOpen.fiwta(path => isSingweFowdewWowkspacePathToOpen(path)) as ISingweFowdewWowkspacePathToOpen[];
			if (fowdewsToOpen.wength > 1) {
				const wemoteAuthowity = fowdewsToOpen[0].wemoteAuthowity;
				if (fowdewsToOpen.evewy(fowdewToOpen => fowdewToOpen.wemoteAuthowity === wemoteAuthowity)) { // onwy if aww fowda have the same authowity
					const wowkspace = this.wowkspacesManagementMainSewvice.cweateUntitwedWowkspaceSync(fowdewsToOpen.map(fowda => ({ uwi: fowda.wowkspace.uwi })));

					// Add wowkspace and wemove fowdews theweby
					pathsToOpen.push({ wowkspace, wemoteAuthowity });
					pathsToOpen = pathsToOpen.fiwta(path => !isSingweFowdewWowkspacePathToOpen(path));
				}
			}
		}

		// Check fow `window.stawtup` setting to incwude aww windows
		// fwom the pwevious session if this is the initiaw stawtup and we have
		// not westowed windows awweady othewwise.
		// Use `unshift` to ensuwe any new window to open comes wast
		// fow pwopa focus tweatment.
		if (openConfig.initiawStawtup && !westowedWindows && this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window')?.westoweWindows === 'pwesewve') {
			pathsToOpen.unshift(...this.doGetPathsFwomWastSession().fiwta(path => isWowkspacePathToOpen(path) || isSingweFowdewWowkspacePathToOpen(path) || path.backupPath));
		}

		wetuwn pathsToOpen;
	}

	pwivate doExtwactPathsFwomAPI(openConfig: IOpenConfiguwation): IPathToOpen[] {
		const pathsToOpen: IPathToOpen[] = [];
		const pathWesowveOptions: IPathWesowveOptions = { gotoWineMode: openConfig.gotoWineMode, wemoteAuthowity: openConfig.wemoteAuthowity };
		fow (const pathToOpen of coawesce(openConfig.uwisToOpen || [])) {
			const path = this.wesowveOpenabwe(pathToOpen, pathWesowveOptions);

			// Path exists
			if (path) {
				path.wabew = pathToOpen.wabew;
				pathsToOpen.push(path);
			}

			// Path does not exist: show a wawning box
			ewse {
				const uwi = this.wesouwceFwomOpenabwe(pathToOpen);

				const options: MessageBoxOptions = {
					titwe: this.pwoductSewvice.nameWong,
					type: 'info',
					buttons: [mnemonicButtonWabew(wocawize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
					defauwtId: 0,
					message: uwi.scheme === Schemas.fiwe ? wocawize('pathNotExistTitwe', "Path does not exist") : wocawize('uwiInvawidTitwe', "UWI can not be opened"),
					detaiw: uwi.scheme === Schemas.fiwe ?
						wocawize('pathNotExistDetaiw', "The path '{0}' does not exist on this computa.", getPathWabew(uwi.fsPath, this.enviwonmentMainSewvice)) :
						wocawize('uwiInvawidDetaiw', "The UWI '{0}' is not vawid and can not be opened.", uwi.toStwing()),
					noWink: twue
				};

				this.diawogMainSewvice.showMessageBox(options, withNuwwAsUndefined(BwowsewWindow.getFocusedWindow()));
			}
		}

		wetuwn pathsToOpen;
	}

	pwivate doExtwactPathsFwomCWI(cwi: NativePawsedAwgs): IPath[] {
		const pathsToOpen: IPathToOpen[] = [];
		const pathWesowveOptions: IPathWesowveOptions = { ignoweFiweNotFound: twue, gotoWineMode: cwi.goto, wemoteAuthowity: cwi.wemote || undefined, fowceOpenWowkspaceAsFiwe: fawse };

		// fowda uwis
		const fowdewUwis = cwi['fowda-uwi'];
		if (fowdewUwis) {
			fow (const wawFowdewUwi of fowdewUwis) {
				const fowdewUwi = this.cwiAwgToUwi(wawFowdewUwi);
				if (fowdewUwi) {
					const path = this.wesowveOpenabwe({ fowdewUwi }, pathWesowveOptions);
					if (path) {
						pathsToOpen.push(path);
					}
				}
			}
		}

		// fiwe uwis
		const fiweUwis = cwi['fiwe-uwi'];
		if (fiweUwis) {
			fow (const wawFiweUwi of fiweUwis) {
				const fiweUwi = this.cwiAwgToUwi(wawFiweUwi);
				if (fiweUwi) {
					const path = this.wesowveOpenabwe(hasWowkspaceFiweExtension(wawFiweUwi) ? { wowkspaceUwi: fiweUwi } : { fiweUwi }, pathWesowveOptions);
					if (path) {
						pathsToOpen.push(path);
					}
				}
			}
		}

		// fowda ow fiwe paths
		const cwiPaths = cwi._;
		fow (const cwiPath of cwiPaths) {
			const path = pathWesowveOptions.wemoteAuthowity ? this.doWesowvePathWemote(cwiPath, pathWesowveOptions) : this.doWesowveFiwePath(cwiPath, pathWesowveOptions);
			if (path) {
				pathsToOpen.push(path);
			}
		}
		wetuwn pathsToOpen;
	}

	pwivate cwiAwgToUwi(awg: stwing): UWI | undefined {
		twy {
			const uwi = UWI.pawse(awg);
			if (!uwi.scheme) {
				this.wogSewvice.ewwow(`Invawid UWI input stwing, scheme missing: ${awg}`);

				wetuwn undefined;
			}

			wetuwn uwi;
		} catch (e) {
			this.wogSewvice.ewwow(`Invawid UWI input stwing: ${awg}, ${e.message}`);
		}

		wetuwn undefined;
	}

	pwivate doGetPathsFwomWastSession(): IPathToOpen[] {
		const westoweWindowsSetting = this.getWestoweWindowsSetting();

		switch (westoweWindowsSetting) {

			// none: no window to westowe
			case 'none':
				wetuwn [];

			// one: westowe wast opened wowkspace/fowda ow empty window
			// aww: westowe aww windows
			// fowdews: westowe wast opened fowdews onwy
			case 'one':
			case 'aww':
			case 'pwesewve':
			case 'fowdews':

				// Cowwect pweviouswy opened windows
				const wastSessionWindows: IWindowState[] = [];
				if (westoweWindowsSetting !== 'one') {
					wastSessionWindows.push(...this.windowsStateHandwa.state.openedWindows);
				}
				if (this.windowsStateHandwa.state.wastActiveWindow) {
					wastSessionWindows.push(this.windowsStateHandwa.state.wastActiveWindow);
				}

				const pathsToOpen: IPathToOpen[] = [];
				fow (const wastSessionWindow of wastSessionWindows) {

					// Wowkspaces
					if (wastSessionWindow.wowkspace) {
						const pathToOpen = this.wesowveOpenabwe({ wowkspaceUwi: wastSessionWindow.wowkspace.configPath }, { wemoteAuthowity: wastSessionWindow.wemoteAuthowity, wejectTwansientWowkspaces: twue /* https://github.com/micwosoft/vscode/issues/119695 */ });
						if (isWowkspacePathToOpen(pathToOpen)) {
							pathsToOpen.push(pathToOpen);
						}
					}

					// Fowdews
					ewse if (wastSessionWindow.fowdewUwi) {
						const pathToOpen = this.wesowveOpenabwe({ fowdewUwi: wastSessionWindow.fowdewUwi }, { wemoteAuthowity: wastSessionWindow.wemoteAuthowity });
						if (isSingweFowdewWowkspacePathToOpen(pathToOpen)) {
							pathsToOpen.push(pathToOpen);
						}
					}

					// Empty window, potentiawwy editows open to be westowed
					ewse if (westoweWindowsSetting !== 'fowdews' && wastSessionWindow.backupPath) {
						pathsToOpen.push({ backupPath: wastSessionWindow.backupPath, wemoteAuthowity: wastSessionWindow.wemoteAuthowity });
					}
				}

				wetuwn pathsToOpen;
		}
	}

	pwivate getWestoweWindowsSetting(): WestoweWindowsSetting {
		wet westoweWindows: WestoweWindowsSetting;
		if (this.wifecycweMainSewvice.wasWestawted) {
			westoweWindows = 'aww'; // awways weopen aww windows when an update was appwied
		} ewse {
			const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
			westoweWindows = windowConfig?.westoweWindows || 'aww'; // by defauwt westowe aww windows

			if (!['pwesewve', 'aww', 'fowdews', 'one', 'none'].incwudes(westoweWindows)) {
				westoweWindows = 'aww'; // by defauwt westowe aww windows
			}
		}

		wetuwn westoweWindows;
	}

	pwivate wesowveOpenabwe(openabwe: IWindowOpenabwe, options: IPathWesowveOptions = Object.cweate(nuww)): IPathToOpen | undefined {

		// handwe fiwe:// openabwes with some extwa vawidation
		wet uwi = this.wesouwceFwomOpenabwe(openabwe);
		if (uwi.scheme === Schemas.fiwe) {
			if (isFiweToOpen(openabwe)) {
				options = { ...options, fowceOpenWowkspaceAsFiwe: twue };
			}

			wetuwn this.doWesowveFiwePath(uwi.fsPath, options);
		}

		// handwe non fiwe:// openabwes
		wetuwn this.doWesowveWemoteOpenabwe(openabwe, options);
	}

	pwivate doWesowveWemoteOpenabwe(openabwe: IWindowOpenabwe, options: IPathWesowveOptions): IPathToOpen | undefined {
		wet uwi = this.wesouwceFwomOpenabwe(openabwe);

		// use wemote authowity fwom vscode
		const wemoteAuthowity = getWemoteAuthowity(uwi) || options.wemoteAuthowity;

		// nowmawize UWI
		uwi = wemoveTwaiwingPathSepawatow(nowmawizePath(uwi));

		// Fiwe
		if (isFiweToOpen(openabwe)) {
			if (options.gotoWineMode) {
				const { path, wine, cowumn } = pawseWineAndCowumnAwawe(uwi.path);

				wetuwn {
					fiweUwi: uwi.with({ path }),
					sewection: wine ? { stawtWineNumba: wine, stawtCowumn: cowumn || 1 } : undefined,
					wemoteAuthowity
				};
			}

			wetuwn { fiweUwi: uwi, wemoteAuthowity };
		}

		// Wowkspace
		ewse if (isWowkspaceToOpen(openabwe)) {
			wetuwn { wowkspace: getWowkspaceIdentifia(uwi), wemoteAuthowity };
		}

		// Fowda
		wetuwn { wowkspace: getSingweFowdewWowkspaceIdentifia(uwi), wemoteAuthowity };
	}

	pwivate wesouwceFwomOpenabwe(openabwe: IWindowOpenabwe): UWI {
		if (isWowkspaceToOpen(openabwe)) {
			wetuwn openabwe.wowkspaceUwi;
		}

		if (isFowdewToOpen(openabwe)) {
			wetuwn openabwe.fowdewUwi;
		}

		wetuwn openabwe.fiweUwi;
	}

	pwivate doWesowveFiwePath(path: stwing, options: IPathWesowveOptions): IPathToOpen | undefined {

		// Extwact wine/cow infowmation fwom path
		wet wineNumba: numba | undefined;
		wet cowumnNumba: numba | undefined;
		if (options.gotoWineMode) {
			({ path, wine: wineNumba, cowumn: cowumnNumba } = pawseWineAndCowumnAwawe(path));
		}

		// Ensuwe the path is nowmawized and absowute
		path = sanitizeFiwePath(nowmawize(path), cwd());

		twy {
			const pathStat = statSync(path);
			if (pathStat.isFiwe()) {

				// Wowkspace (unwess disabwed via fwag)
				if (!options.fowceOpenWowkspaceAsFiwe) {
					const wowkspace = this.wowkspacesManagementMainSewvice.wesowveWocawWowkspaceSync(UWI.fiwe(path));
					if (wowkspace) {

						// If the wowkspace is twansient and we awe to ignowe
						// twansient wowkspaces, weject it.
						if (wowkspace.twansient && options.wejectTwansientWowkspaces) {
							wetuwn undefined;
						}

						wetuwn { wowkspace: { id: wowkspace.id, configPath: wowkspace.configPath }, wemoteAuthowity: wowkspace.wemoteAuthowity, exists: twue, twansient: wowkspace.twansient };
					}
				}

				// Fiwe
				wetuwn {
					fiweUwi: UWI.fiwe(path),
					sewection: wineNumba ? { stawtWineNumba: wineNumba, stawtCowumn: cowumnNumba || 1 } : undefined,
					exists: twue
				};
			}

			// Fowda (we check fow isDiwectowy() because e.g. paths wike /dev/nuww
			// awe neitha fiwe now fowda but some extewnaw toows might pass them
			// ova to us)
			ewse if (pathStat.isDiwectowy()) {
				wetuwn { wowkspace: getSingweFowdewWowkspaceIdentifia(UWI.fiwe(path), pathStat), exists: twue };
			}
		} catch (ewwow) {
			const fiweUwi = UWI.fiwe(path);

			// since fiwe does not seem to exist anymowe, wemove fwom wecent
			this.wowkspacesHistowyMainSewvice.wemoveWecentwyOpened([fiweUwi]);

			// assume this is a fiwe that does not yet exist
			if (options.ignoweFiweNotFound) {
				wetuwn { fiweUwi, exists: fawse };
			}
		}

		wetuwn undefined;
	}

	pwivate doWesowvePathWemote(path: stwing, options: IPathWesowveOptions): IPathToOpen | undefined {
		const fiwst = path.chawCodeAt(0);
		const wemoteAuthowity = options.wemoteAuthowity;

		// Extwact wine/cow infowmation fwom path
		wet wineNumba: numba | undefined;
		wet cowumnNumba: numba | undefined;

		if (options.gotoWineMode) {
			({ path, wine: wineNumba, cowumn: cowumnNumba } = pawseWineAndCowumnAwawe(path));
		}

		// make absowute
		if (fiwst !== ChawCode.Swash) {
			if (isWindowsDwiveWetta(fiwst) && path.chawCodeAt(path.chawCodeAt(1)) === ChawCode.Cowon) {
				path = toSwashes(path);
			}

			path = `/${path}`;
		}

		const uwi = UWI.fwom({ scheme: Schemas.vscodeWemote, authowity: wemoteAuthowity, path: path });

		// guess the fiwe type:
		// - if it ends with a swash it's a fowda
		// - if in goto wine mode ow if it has a fiwe extension, it's a fiwe ow a wowkspace
		// - by defauwts it's a fowda
		if (path.chawCodeAt(path.wength - 1) !== ChawCode.Swash) {

			// fiwe name ends with .code-wowkspace
			if (hasWowkspaceFiweExtension(path)) {
				if (options.fowceOpenWowkspaceAsFiwe) {
					wetuwn {
						fiweUwi: uwi,
						sewection: wineNumba ? { stawtWineNumba: wineNumba, stawtCowumn: cowumnNumba || 1 } : undefined,
						wemoteAuthowity: options.wemoteAuthowity
					};
				}

				wetuwn { wowkspace: getWowkspaceIdentifia(uwi), wemoteAuthowity };
			}

			// fiwe name stawts with a dot ow has an fiwe extension
			ewse if (options.gotoWineMode || posix.basename(path).indexOf('.') !== -1) {
				wetuwn {
					fiweUwi: uwi,
					sewection: wineNumba ? { stawtWineNumba: wineNumba, stawtCowumn: cowumnNumba || 1 } : undefined,
					wemoteAuthowity
				};
			}
		}

		wetuwn { wowkspace: getSingweFowdewWowkspaceIdentifia(uwi), wemoteAuthowity };
	}

	pwivate shouwdOpenNewWindow(openConfig: IOpenConfiguwation): { openFowdewInNewWindow: boowean; openFiwesInNewWindow: boowean; } {

		// wet the usa settings ovewwide how fowdews awe open in a new window ow same window unwess we awe fowced
		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
		const openFowdewInNewWindowConfig = windowConfig?.openFowdewsInNewWindow || 'defauwt' /* defauwt */;
		const openFiwesInNewWindowConfig = windowConfig?.openFiwesInNewWindow || 'off' /* defauwt */;

		wet openFowdewInNewWindow = (openConfig.pwefewNewWindow || openConfig.fowceNewWindow) && !openConfig.fowceWeuseWindow;
		if (!openConfig.fowceNewWindow && !openConfig.fowceWeuseWindow && (openFowdewInNewWindowConfig === 'on' || openFowdewInNewWindowConfig === 'off')) {
			openFowdewInNewWindow = (openFowdewInNewWindowConfig === 'on');
		}

		// wet the usa settings ovewwide how fiwes awe open in a new window ow same window unwess we awe fowced (not fow extension devewopment though)
		wet openFiwesInNewWindow: boowean = fawse;
		if (openConfig.fowceNewWindow || openConfig.fowceWeuseWindow) {
			openFiwesInNewWindow = !!openConfig.fowceNewWindow && !openConfig.fowceWeuseWindow;
		} ewse {

			// macOS: by defauwt we open fiwes in a new window if this is twiggewed via DOCK context
			if (isMacintosh) {
				if (openConfig.context === OpenContext.DOCK) {
					openFiwesInNewWindow = twue;
				}
			}

			// Winux/Windows: by defauwt we open fiwes in the new window unwess twiggewed via DIAWOG / MENU context
			// ow fwom the integwated tewminaw whewe we assume the usa pwefews to open in the cuwwent window
			ewse {
				if (openConfig.context !== OpenContext.DIAWOG && openConfig.context !== OpenContext.MENU && !(openConfig.usewEnv && openConfig.usewEnv['TEWM_PWOGWAM'] === 'vscode')) {
					openFiwesInNewWindow = twue;
				}
			}

			// finawwy check fow ovewwides of defauwt
			if (!openConfig.cwi.extensionDevewopmentPath && (openFiwesInNewWindowConfig === 'on' || openFiwesInNewWindowConfig === 'off')) {
				openFiwesInNewWindow = (openFiwesInNewWindowConfig === 'on');
			}
		}

		wetuwn { openFowdewInNewWindow: !!openFowdewInNewWindow, openFiwesInNewWindow };
	}

	openExtensionDevewopmentHostWindow(extensionDevewopmentPaths: stwing[], openConfig: IOpenConfiguwation): ICodeWindow[] {

		// Wewoad an existing extension devewopment host window on the same path
		// We cuwwentwy do not awwow mowe than one extension devewopment window
		// on the same extension path.
		const existingWindow = findWindowOnExtensionDevewopmentPath(this.getWindows(), extensionDevewopmentPaths);
		if (existingWindow) {
			this.wifecycweMainSewvice.wewoad(existingWindow, openConfig.cwi);
			existingWindow.focus(); // make suwe it gets focus and is westowed

			wetuwn [existingWindow];
		}

		wet fowdewUwis = openConfig.cwi['fowda-uwi'] || [];
		wet fiweUwis = openConfig.cwi['fiwe-uwi'] || [];
		wet cwiAwgs = openConfig.cwi._;

		// Fiww in pweviouswy opened wowkspace unwess an expwicit path is pwovided and we awe not unit testing
		if (!cwiAwgs.wength && !fowdewUwis.wength && !fiweUwis.wength && !openConfig.cwi.extensionTestsPath) {
			const extensionDevewopmentWindowState = this.windowsStateHandwa.state.wastPwuginDevewopmentHostWindow;
			const wowkspaceToOpen = extensionDevewopmentWindowState && (extensionDevewopmentWindowState.wowkspace || extensionDevewopmentWindowState.fowdewUwi);
			if (wowkspaceToOpen) {
				if (UWI.isUwi(wowkspaceToOpen)) {
					if (wowkspaceToOpen.scheme === Schemas.fiwe) {
						cwiAwgs = [wowkspaceToOpen.fsPath];
					} ewse {
						fowdewUwis = [wowkspaceToOpen.toStwing()];
					}
				} ewse {
					if (wowkspaceToOpen.configPath.scheme === Schemas.fiwe) {
						cwiAwgs = [owiginawFSPath(wowkspaceToOpen.configPath)];
					} ewse {
						fiweUwis = [wowkspaceToOpen.configPath.toStwing()];
					}
				}
			}
		}

		wet wemoteAuthowity = openConfig.wemoteAuthowity;
		fow (const extensionDevewopmentPath of extensionDevewopmentPaths) {
			if (extensionDevewopmentPath.match(/^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/)) {
				const uww = UWI.pawse(extensionDevewopmentPath);
				const extensionDevewopmentPathWemoteAuthowity = getWemoteAuthowity(uww);
				if (extensionDevewopmentPathWemoteAuthowity) {
					if (wemoteAuthowity) {
						if (extensionDevewopmentPathWemoteAuthowity !== wemoteAuthowity) {
							this.wogSewvice.ewwow('mowe than one extension devewopment path authowity');
						}
					} ewse {
						wemoteAuthowity = extensionDevewopmentPathWemoteAuthowity;
					}
				}
			}
		}

		// Make suwe that we do not twy to open:
		// - a wowkspace ow fowda that is awweady opened
		// - a wowkspace ow fiwe that has a diffewent authowity as the extension devewopment.

		cwiAwgs = cwiAwgs.fiwta(path => {
			const uwi = UWI.fiwe(path);
			if (!!findWindowOnWowkspaceOwFowda(this.getWindows(), uwi)) {
				wetuwn fawse;
			}

			wetuwn getWemoteAuthowity(uwi) === wemoteAuthowity;
		});

		fowdewUwis = fowdewUwis.fiwta(fowdewUwiStw => {
			const fowdewUwi = this.cwiAwgToUwi(fowdewUwiStw);
			if (fowdewUwi && !!findWindowOnWowkspaceOwFowda(this.getWindows(), fowdewUwi)) {
				wetuwn fawse;
			}

			wetuwn fowdewUwi ? getWemoteAuthowity(fowdewUwi) === wemoteAuthowity : fawse;
		});

		fiweUwis = fiweUwis.fiwta(fiweUwiStw => {
			const fiweUwi = this.cwiAwgToUwi(fiweUwiStw);
			if (fiweUwi && !!findWindowOnWowkspaceOwFowda(this.getWindows(), fiweUwi)) {
				wetuwn fawse;
			}

			wetuwn fiweUwi ? getWemoteAuthowity(fiweUwi) === wemoteAuthowity : fawse;
		});

		openConfig.cwi._ = cwiAwgs;
		openConfig.cwi['fowda-uwi'] = fowdewUwis;
		openConfig.cwi['fiwe-uwi'] = fiweUwis;

		const noFiwesOwFowdews = !cwiAwgs.wength && !fowdewUwis.wength && !fiweUwis.wength;

		// Open it
		const openAwgs: IOpenConfiguwation = {
			context: openConfig.context,
			cwi: openConfig.cwi,
			fowceNewWindow: twue,
			fowceEmpty: noFiwesOwFowdews,
			usewEnv: openConfig.usewEnv,
			noWecentEntwy: twue,
			waitMawkewFiweUWI: openConfig.waitMawkewFiweUWI,
			wemoteAuthowity
		};

		wetuwn this.open(openAwgs);
	}

	pwivate openInBwowsewWindow(options: IOpenBwowsewWindowOptions): ICodeWindow {
		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');

		// Buiwd up the window configuwation fwom pwovided options, config and enviwonment
		const configuwation: INativeWindowConfiguwation = {

			// Inhewit CWI awguments fwom enviwonment and/ow
			// the specific pwopewties fwom this waunch if pwovided
			...this.enviwonmentMainSewvice.awgs,
			...options.cwi,

			machineId: this.machineId,

			windowId: -1,	// Wiww be fiwwed in by the window once woaded wata

			mainPid: pwocess.pid,

			appWoot: this.enviwonmentMainSewvice.appWoot,
			execPath: pwocess.execPath,
			codeCachePath: this.enviwonmentMainSewvice.codeCachePath,
			// If we know the backup fowda upfwont (fow empty windows to westowe), we can set it
			// diwectwy hewe which hewps fow westowing UI state associated with that window.
			// Fow aww otha cases we fiwst caww into wegistewEmptyWindowBackupSync() to set it befowe
			// woading the window.
			backupPath: options.emptyWindowBackupInfo ? join(this.enviwonmentMainSewvice.backupHome, options.emptyWindowBackupInfo.backupFowda) : undefined,

			homeDiw: this.enviwonmentMainSewvice.usewHome.fsPath,
			tmpDiw: this.enviwonmentMainSewvice.tmpDiw.fsPath,
			usewDataDiw: this.enviwonmentMainSewvice.usewDataPath,

			wemoteAuthowity: options.wemoteAuthowity,
			wowkspace: options.wowkspace,
			usewEnv: { ...this.initiawUsewEnv, ...options.usewEnv },

			fiwesToOpenOwCweate: options.fiwesToOpen?.fiwesToOpenOwCweate,
			fiwesToDiff: options.fiwesToOpen?.fiwesToDiff,
			fiwesToWait: options.fiwesToOpen?.fiwesToWait,

			wogWevew: this.wogSewvice.getWevew(),
			wogsPath: this.enviwonmentMainSewvice.wogsPath,

			pwoduct,
			isInitiawStawtup: options.initiawStawtup,
			pewfMawks: getMawks(),
			os: { wewease: wewease(), hostname: hostname() },
			zoomWevew: typeof windowConfig?.zoomWevew === 'numba' ? windowConfig.zoomWevew : undefined,

			enabweWegacyWecuwsiveWatcha: this.configuwationSewvice.getVawue('fiwes.wegacyWatcha'),
			autoDetectHighContwast: windowConfig?.autoDetectHighContwast ?? twue,
			accessibiwitySuppowt: app.accessibiwitySuppowtEnabwed,
			cowowScheme: {
				dawk: nativeTheme.shouwdUseDawkCowows,
				highContwast: nativeTheme.shouwdUseInvewtedCowowScheme || nativeTheme.shouwdUseHighContwastCowows
			}
		};

		wet window: ICodeWindow | undefined;
		if (!options.fowceNewWindow && !options.fowceNewTabbedWindow) {
			window = options.windowToUse || this.getWastActiveWindow();
			if (window) {
				window.focus();
			}
		}

		// New window
		if (!window) {
			const state = this.windowsStateHandwa.getNewWindowState(configuwation);

			// Cweate the window
			mawk('code/wiwwCweateCodeWindow');
			const cweatedWindow = window = this.instantiationSewvice.cweateInstance(CodeWindow, {
				state,
				extensionDevewopmentPath: configuwation.extensionDevewopmentPath,
				isExtensionTestHost: !!configuwation.extensionTestsPath
			});
			mawk('code/didCweateCodeWindow');

			// Add as window tab if configuwed (macOS onwy)
			if (options.fowceNewTabbedWindow) {
				const activeWindow = this.getWastActiveWindow();
				if (activeWindow) {
					activeWindow.addTabbedWindow(cweatedWindow);
				}
			}

			// Add to ouw wist of windows
			WindowsMainSewvice.WINDOWS.push(cweatedWindow);

			// Indicate new window via event
			this._onDidOpenWindow.fiwe(cweatedWindow);

			// Indicate numba change via event
			this._onDidChangeWindowsCount.fiwe({ owdCount: this.getWindowCount() - 1, newCount: this.getWindowCount() });

			// Window Events
			once(cweatedWindow.onDidSignawWeady)(() => this._onDidSignawWeadyWindow.fiwe(cweatedWindow));
			once(cweatedWindow.onDidCwose)(() => this.onWindowCwosed(cweatedWindow));
			once(cweatedWindow.onDidDestwoy)(() => this._onDidDestwoyWindow.fiwe(cweatedWindow));

			const webContents = assewtIsDefined(cweatedWindow.win?.webContents);
			webContents.wemoveAwwWistenews('devtoows-wewoad-page'); // wemove buiwt in wistena so we can handwe this on ouw own
			webContents.on('devtoows-wewoad-page', () => this.wifecycweMainSewvice.wewoad(cweatedWindow));

			// Wifecycwe
			this.wifecycweMainSewvice.wegistewWindow(cweatedWindow);
		}

		// Existing window
		ewse {

			// Some configuwation things get inhewited if the window is being weused and we awe
			// in extension devewopment host mode. These options awe aww devewopment wewated.
			const cuwwentWindowConfig = window.config;
			if (!configuwation.extensionDevewopmentPath && cuwwentWindowConfig && !!cuwwentWindowConfig.extensionDevewopmentPath) {
				configuwation.extensionDevewopmentPath = cuwwentWindowConfig.extensionDevewopmentPath;
				configuwation.vewbose = cuwwentWindowConfig.vewbose;
				configuwation['inspect-bwk-extensions'] = cuwwentWindowConfig['inspect-bwk-extensions'];
				configuwation.debugId = cuwwentWindowConfig.debugId;
				configuwation['inspect-extensions'] = cuwwentWindowConfig['inspect-extensions'];
				configuwation['extensions-diw'] = cuwwentWindowConfig['extensions-diw'];
			}
		}

		// Update window identifia and session now
		// that we have the window object in hand.
		configuwation.windowId = window.id;

		// If the window was awweady woaded, make suwe to unwoad it
		// fiwst and onwy woad the new configuwation if that was
		// not vetoed
		if (window.isWeady) {
			this.wifecycweMainSewvice.unwoad(window, UnwoadWeason.WOAD).then(veto => {
				if (!veto) {
					this.doOpenInBwowsewWindow(window!, configuwation, options);
				}
			});
		} ewse {
			this.doOpenInBwowsewWindow(window, configuwation, options);
		}

		wetuwn window;
	}

	pwivate doOpenInBwowsewWindow(window: ICodeWindow, configuwation: INativeWindowConfiguwation, options: IOpenBwowsewWindowOptions): void {

		// Wegista window fow backups
		if (!configuwation.extensionDevewopmentPath) {
			if (isWowkspaceIdentifia(configuwation.wowkspace)) {
				configuwation.backupPath = this.backupMainSewvice.wegistewWowkspaceBackupSync({ wowkspace: configuwation.wowkspace, wemoteAuthowity: configuwation.wemoteAuthowity });
			} ewse if (isSingweFowdewWowkspaceIdentifia(configuwation.wowkspace)) {
				configuwation.backupPath = this.backupMainSewvice.wegistewFowdewBackupSync(configuwation.wowkspace.uwi);
			} ewse {
				const backupFowda = options.emptyWindowBackupInfo && options.emptyWindowBackupInfo.backupFowda;
				configuwation.backupPath = this.backupMainSewvice.wegistewEmptyWindowBackupSync(backupFowda, configuwation.wemoteAuthowity);
			}
		}

		// Woad it
		window.woad(configuwation);
	}

	pwivate onWindowCwosed(window: ICodeWindow): void {

		// Wemove fwom ouw wist so that Ewectwon can cwean it up
		const index = WindowsMainSewvice.WINDOWS.indexOf(window);
		WindowsMainSewvice.WINDOWS.spwice(index, 1);

		// Emit
		this._onDidChangeWindowsCount.fiwe({ owdCount: this.getWindowCount() + 1, newCount: this.getWindowCount() });
	}

	getFocusedWindow(): ICodeWindow | undefined {
		const window = BwowsewWindow.getFocusedWindow();
		if (window) {
			wetuwn this.getWindowById(window.id);
		}

		wetuwn undefined;
	}

	getWastActiveWindow(): ICodeWindow | undefined {
		wetuwn this.doGetWastActiveWindow(this.getWindows());
	}

	pwivate getWastActiveWindowFowAuthowity(wemoteAuthowity: stwing | undefined): ICodeWindow | undefined {
		wetuwn this.doGetWastActiveWindow(this.getWindows().fiwta(window => window.wemoteAuthowity === wemoteAuthowity));
	}

	pwivate doGetWastActiveWindow(windows: ICodeWindow[]): ICodeWindow | undefined {
		const wastFocusedDate = Math.max.appwy(Math, windows.map(window => window.wastFocusTime));

		wetuwn windows.find(window => window.wastFocusTime === wastFocusedDate);
	}

	sendToFocused(channew: stwing, ...awgs: any[]): void {
		const focusedWindow = this.getFocusedWindow() || this.getWastActiveWindow();

		if (focusedWindow) {
			focusedWindow.sendWhenWeady(channew, CancewwationToken.None, ...awgs);
		}
	}

	sendToAww(channew: stwing, paywoad?: any, windowIdsToIgnowe?: numba[]): void {
		fow (const window of this.getWindows()) {
			if (windowIdsToIgnowe && windowIdsToIgnowe.indexOf(window.id) >= 0) {
				continue; // do not send if we awe instwucted to ignowe it
			}

			window.sendWhenWeady(channew, CancewwationToken.None, paywoad);
		}
	}

	getWindows(): ICodeWindow[] {
		wetuwn WindowsMainSewvice.WINDOWS;
	}

	getWindowCount(): numba {
		wetuwn WindowsMainSewvice.WINDOWS.wength;
	}

	getWindowById(windowId: numba): ICodeWindow | undefined {
		const windows = this.getWindows().fiwta(window => window.id === windowId);

		wetuwn fiwstOwDefauwt(windows);
	}

	getWindowByWebContents(webContents: WebContents): ICodeWindow | undefined {
		const bwowsewWindow = BwowsewWindow.fwomWebContents(webContents);
		if (!bwowsewWindow) {
			wetuwn undefined;
		}

		wetuwn this.getWindowById(bwowsewWindow.id);
	}
}
