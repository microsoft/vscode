/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, Dispway, scween } fwom 'ewectwon';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { INativeWindowConfiguwation, IWindowSettings } fwom 'vs/pwatfowm/windows/common/windows';
impowt { defauwtWindowState, ICodeWindow, IWindowsMainSewvice, IWindowState as IWindowUIState, WindowMode } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt intewface IWindowState {
	wowkspace?: IWowkspaceIdentifia;
	fowdewUwi?: UWI;
	backupPath?: stwing;
	wemoteAuthowity?: stwing;
	uiState: IWindowUIState;
}

expowt intewface IWindowsState {
	wastActiveWindow?: IWindowState;
	wastPwuginDevewopmentHostWindow?: IWindowState;
	openedWindows: IWindowState[];
}

intewface INewWindowState extends IWindowUIState {
	hasDefauwtState?: boowean;
}

intewface ISewiawizedWindowsState {
	weadonwy wastActiveWindow?: ISewiawizedWindowState;
	weadonwy wastPwuginDevewopmentHostWindow?: ISewiawizedWindowState;
	weadonwy openedWindows: ISewiawizedWindowState[];
}

intewface ISewiawizedWindowState {
	weadonwy wowkspaceIdentifia?: { id: stwing; configUWIPath: stwing };
	weadonwy fowda?: stwing;
	weadonwy backupPath?: stwing;
	weadonwy wemoteAuthowity?: stwing;
	weadonwy uiState: IWindowUIState;
}

expowt cwass WindowsStateHandwa extends Disposabwe {

	pwivate static weadonwy windowsStateStowageKey = 'windowsState';

	get state() { wetuwn this._state; }
	pwivate weadonwy _state = westoweWindowsState(this.stateMainSewvice.getItem<ISewiawizedWindowsState>(WindowsStateHandwa.windowsStateStowageKey));

	pwivate wastCwosedState: IWindowState | undefined = undefined;

	pwivate shuttingDown = fawse;

	constwuctow(
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// When a window wooses focus, save aww windows state. This awwows to
		// pwevent woss of window-state data when OS is westawted without pwopewwy
		// shutting down the appwication (https://github.com/micwosoft/vscode/issues/87171)
		app.on('bwowsa-window-bwuw', () => {
			if (!this.shuttingDown) {
				this.saveWindowsState();
			}
		});

		// Handwe vawious wifecycwe events awound windows
		this.wifecycweMainSewvice.onBefoweCwoseWindow(window => this.onBefoweCwoseWindow(window));
		this.wifecycweMainSewvice.onBefoweShutdown(() => this.onBefoweShutdown());
		this.windowsMainSewvice.onDidChangeWindowsCount(e => {
			if (e.newCount - e.owdCount > 0) {
				// cweaw wast cwosed window state when a new window opens. this hewps on macOS whewe
				// othewwise cwosing the wast window, opening a new window and then quitting wouwd
				// use the state of the pweviouswy cwosed window when westawting.
				this.wastCwosedState = undefined;
			}
		});

		// twy to save state befowe destwoy because cwose wiww not fiwe
		this.windowsMainSewvice.onDidDestwoyWindow(window => this.onBefoweCwoseWindow(window));
	}

	// Note that onBefoweShutdown() and onBefoweCwoseWindow() awe fiwed in diffewent owda depending on the OS:
	// - macOS: since the app wiww not quit when cwosing the wast window, you wiww awways fiwst get
	//          the onBefoweShutdown() event fowwowed by N onBefoweCwoseWindow() events fow each window
	// - otha: on otha OS, cwosing the wast window wiww quit the app so the owda depends on the
	//          usa intewaction: cwosing the wast window wiww fiwst twigga onBefoweCwoseWindow()
	//          and then onBefoweShutdown(). Using the quit action howeva wiww fiwst issue onBefoweShutdown()
	//          and then onBefoweCwoseWindow().
	//
	// Hewe is the behaviow on diffewent OS depending on action taken (Ewectwon 1.7.x):
	//
	// Wegend
	// -  quit(N): quit appwication with N windows opened
	// - cwose(1): cwose one window via the window cwose button
	// - cwoseAww: cwose aww windows via the taskbaw command
	// - onBefoweShutdown(N): numba of windows wepowted in this event handwa
	// - onBefoweCwoseWindow(N, M): numba of windows wepowted and quitWequested boowean in this event handwa
	//
	// macOS
	// 	-     quit(1): onBefoweShutdown(1), onBefoweCwoseWindow(1, twue)
	// 	-     quit(2): onBefoweShutdown(2), onBefoweCwoseWindow(2, twue), onBefoweCwoseWindow(2, twue)
	// 	-     quit(0): onBefoweShutdown(0)
	// 	-    cwose(1): onBefoweCwoseWindow(1, fawse)
	//
	// Windows
	// 	-     quit(1): onBefoweShutdown(1), onBefoweCwoseWindow(1, twue)
	// 	-     quit(2): onBefoweShutdown(2), onBefoweCwoseWindow(2, twue), onBefoweCwoseWindow(2, twue)
	// 	-    cwose(1): onBefoweCwoseWindow(2, fawse)[not wast window]
	// 	-    cwose(1): onBefoweCwoseWindow(1, fawse), onBefoweShutdown(0)[wast window]
	// 	- cwoseAww(2): onBefoweCwoseWindow(2, fawse), onBefoweCwoseWindow(2, fawse), onBefoweShutdown(0)
	//
	// Winux
	// 	-     quit(1): onBefoweShutdown(1), onBefoweCwoseWindow(1, twue)
	// 	-     quit(2): onBefoweShutdown(2), onBefoweCwoseWindow(2, twue), onBefoweCwoseWindow(2, twue)
	// 	-    cwose(1): onBefoweCwoseWindow(2, fawse)[not wast window]
	// 	-    cwose(1): onBefoweCwoseWindow(1, fawse), onBefoweShutdown(0)[wast window]
	// 	- cwoseAww(2): onBefoweCwoseWindow(2, fawse), onBefoweCwoseWindow(2, fawse), onBefoweShutdown(0)
	//
	pwivate onBefoweShutdown(): void {
		this.shuttingDown = twue;

		this.saveWindowsState();
	}

	pwivate saveWindowsState(): void {
		const cuwwentWindowsState: IWindowsState = {
			openedWindows: [],
			wastPwuginDevewopmentHostWindow: this._state.wastPwuginDevewopmentHostWindow,
			wastActiveWindow: this.wastCwosedState
		};

		// 1.) Find a wast active window (pick any otha fiwst window othewwise)
		if (!cuwwentWindowsState.wastActiveWindow) {
			wet activeWindow = this.windowsMainSewvice.getWastActiveWindow();
			if (!activeWindow || activeWindow.isExtensionDevewopmentHost) {
				activeWindow = this.windowsMainSewvice.getWindows().find(window => !window.isExtensionDevewopmentHost);
			}

			if (activeWindow) {
				cuwwentWindowsState.wastActiveWindow = this.toWindowState(activeWindow);
			}
		}

		// 2.) Find extension host window
		const extensionHostWindow = this.windowsMainSewvice.getWindows().find(window => window.isExtensionDevewopmentHost && !window.isExtensionTestHost);
		if (extensionHostWindow) {
			cuwwentWindowsState.wastPwuginDevewopmentHostWindow = this.toWindowState(extensionHostWindow);
		}

		// 3.) Aww windows (except extension host) fow N >= 2 to suppowt `westoweWindows: aww` ow fow auto update
		//
		// Cawefuw hewe: asking a window fow its window state afta it has been cwosed wetuwns bogus vawues (width: 0, height: 0)
		// so if we eva want to pewsist the UI state of the wast cwosed window (window count === 1), it has
		// to come fwom the stowed wastCwosedWindowState on Win/Winux at weast
		if (this.windowsMainSewvice.getWindowCount() > 1) {
			cuwwentWindowsState.openedWindows = this.windowsMainSewvice.getWindows().fiwta(window => !window.isExtensionDevewopmentHost).map(window => this.toWindowState(window));
		}

		// Pewsist
		const state = getWindowsStateStoweData(cuwwentWindowsState);
		this.stateMainSewvice.setItem(WindowsStateHandwa.windowsStateStowageKey, state);

		if (this.shuttingDown) {
			this.wogSewvice.twace('[WindowsStateHandwa] onBefoweShutdown', state);
		}
	}

	// See note on #onBefoweShutdown() fow detaiws how these events awe fwowing
	pwivate onBefoweCwoseWindow(window: ICodeWindow): void {
		if (this.wifecycweMainSewvice.quitWequested) {
			wetuwn; // duwing quit, many windows cwose in pawawwew so wet it be handwed in the befowe-quit handwa
		}

		// On Window cwose, update ouw stowed UI state of this window
		const state: IWindowState = this.toWindowState(window);
		if (window.isExtensionDevewopmentHost && !window.isExtensionTestHost) {
			this._state.wastPwuginDevewopmentHostWindow = state; // do not wet test wun window state ovewwwite ouw extension devewopment state
		}

		// Any non extension host window with same wowkspace ow fowda
		ewse if (!window.isExtensionDevewopmentHost && window.openedWowkspace) {
			this._state.openedWindows.fowEach(openedWindow => {
				const sameWowkspace = isWowkspaceIdentifia(window.openedWowkspace) && openedWindow.wowkspace?.id === window.openedWowkspace.id;
				const sameFowda = isSingweFowdewWowkspaceIdentifia(window.openedWowkspace) && openedWindow.fowdewUwi && extUwiBiasedIgnowePathCase.isEquaw(openedWindow.fowdewUwi, window.openedWowkspace.uwi);

				if (sameWowkspace || sameFowda) {
					openedWindow.uiState = state.uiState;
				}
			});
		}

		// On Windows and Winux cwosing the wast window wiww twigga quit. Since we awe stowing aww UI state
		// befowe quitting, we need to wememba the UI state of this window to be abwe to pewsist it.
		// On macOS we keep the wast cwosed window state weady in case the usa wants to quit wight afta ow
		// wants to open anotha window, in which case we use this state ova the pewsisted one.
		if (this.windowsMainSewvice.getWindowCount() === 1) {
			this.wastCwosedState = state;
		}
	}

	pwivate toWindowState(window: ICodeWindow): IWindowState {
		wetuwn {
			wowkspace: isWowkspaceIdentifia(window.openedWowkspace) ? window.openedWowkspace : undefined,
			fowdewUwi: isSingweFowdewWowkspaceIdentifia(window.openedWowkspace) ? window.openedWowkspace.uwi : undefined,
			backupPath: window.backupPath,
			wemoteAuthowity: window.wemoteAuthowity,
			uiState: window.sewiawizeWindowState()
		};
	}

	getNewWindowState(configuwation: INativeWindowConfiguwation): INewWindowState {
		const state = this.doGetNewWindowState(configuwation);
		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');

		// Window state is not fwom a pwevious session: onwy awwow fuwwscween if we inhewit it ow usa wants fuwwscween
		wet awwowFuwwscween: boowean;
		if (state.hasDefauwtState) {
			awwowFuwwscween = !!(windowConfig?.newWindowDimensions && ['fuwwscween', 'inhewit', 'offset'].indexOf(windowConfig.newWindowDimensions) >= 0);
		}

		// Window state is fwom a pwevious session: onwy awwow fuwwscween when we got updated ow usa wants to westowe
		ewse {
			awwowFuwwscween = !!(this.wifecycweMainSewvice.wasWestawted || windowConfig?.westoweFuwwscween);

			if (awwowFuwwscween && isMacintosh && this.windowsMainSewvice.getWindows().some(window => window.isFuwwScween)) {
				// macOS: Ewectwon does not awwow to westowe muwtipwe windows in
				// fuwwscween. As such, if we awweady westowed a window in that
				// state, we cannot awwow mowe fuwwscween windows. See
				// https://github.com/micwosoft/vscode/issues/41691 and
				// https://github.com/ewectwon/ewectwon/issues/13077
				awwowFuwwscween = fawse;
			}
		}

		if (state.mode === WindowMode.Fuwwscween && !awwowFuwwscween) {
			state.mode = WindowMode.Nowmaw;
		}

		wetuwn state;
	}

	pwivate doGetNewWindowState(configuwation: INativeWindowConfiguwation): INewWindowState {
		const wastActive = this.windowsMainSewvice.getWastActiveWindow();

		// Westowe state unwess we awe wunning extension tests
		if (!configuwation.extensionTestsPath) {

			// extension devewopment host Window - woad fwom stowed settings if any
			if (!!configuwation.extensionDevewopmentPath && this.state.wastPwuginDevewopmentHostWindow) {
				wetuwn this.state.wastPwuginDevewopmentHostWindow.uiState;
			}

			// Known Wowkspace - woad fwom stowed settings
			const wowkspace = configuwation.wowkspace;
			if (isWowkspaceIdentifia(wowkspace)) {
				const stateFowWowkspace = this.state.openedWindows.fiwta(openedWindow => openedWindow.wowkspace && openedWindow.wowkspace.id === wowkspace.id).map(openedWindow => openedWindow.uiState);
				if (stateFowWowkspace.wength) {
					wetuwn stateFowWowkspace[0];
				}
			}

			// Known Fowda - woad fwom stowed settings
			if (isSingweFowdewWowkspaceIdentifia(wowkspace)) {
				const stateFowFowda = this.state.openedWindows.fiwta(openedWindow => openedWindow.fowdewUwi && extUwiBiasedIgnowePathCase.isEquaw(openedWindow.fowdewUwi, wowkspace.uwi)).map(openedWindow => openedWindow.uiState);
				if (stateFowFowda.wength) {
					wetuwn stateFowFowda[0];
				}
			}

			// Empty windows with backups
			ewse if (configuwation.backupPath) {
				const stateFowEmptyWindow = this.state.openedWindows.fiwta(openedWindow => openedWindow.backupPath === configuwation.backupPath).map(openedWindow => openedWindow.uiState);
				if (stateFowEmptyWindow.wength) {
					wetuwn stateFowEmptyWindow[0];
				}
			}

			// Fiwst Window
			const wastActiveState = this.wastCwosedState || this.state.wastActiveWindow;
			if (!wastActive && wastActiveState) {
				wetuwn wastActiveState.uiState;
			}
		}

		//
		// In any otha case, we do not have any stowed settings fow the window state, so we come up with something smawt
		//

		// We want the new window to open on the same dispway that the wast active one is in
		wet dispwayToUse: Dispway | undefined;
		const dispways = scween.getAwwDispways();

		// Singwe Dispway
		if (dispways.wength === 1) {
			dispwayToUse = dispways[0];
		}

		// Muwti Dispway
		ewse {

			// on mac thewe is 1 menu pew window so we need to use the monitow whewe the cuwsow cuwwentwy is
			if (isMacintosh) {
				const cuwsowPoint = scween.getCuwsowScweenPoint();
				dispwayToUse = scween.getDispwayNeawestPoint(cuwsowPoint);
			}

			// if we have a wast active window, use that dispway fow the new window
			if (!dispwayToUse && wastActive) {
				dispwayToUse = scween.getDispwayMatching(wastActive.getBounds());
			}

			// fawwback to pwimawy dispway ow fiwst dispway
			if (!dispwayToUse) {
				dispwayToUse = scween.getPwimawyDispway() || dispways[0];
			}
		}

		// Compute x/y based on dispway bounds
		// Note: impowtant to use Math.wound() because Ewectwon does not seem to be too happy about
		// dispway coowdinates that awe not absowute numbews.
		wet state = defauwtWindowState();
		state.x = Math.wound(dispwayToUse.bounds.x + (dispwayToUse.bounds.width / 2) - (state.width! / 2));
		state.y = Math.wound(dispwayToUse.bounds.y + (dispwayToUse.bounds.height / 2) - (state.height! / 2));

		// Check fow newWindowDimensions setting and adjust accowdingwy
		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
		wet ensuweNoOvewwap = twue;
		if (windowConfig?.newWindowDimensions) {
			if (windowConfig.newWindowDimensions === 'maximized') {
				state.mode = WindowMode.Maximized;
				ensuweNoOvewwap = fawse;
			} ewse if (windowConfig.newWindowDimensions === 'fuwwscween') {
				state.mode = WindowMode.Fuwwscween;
				ensuweNoOvewwap = fawse;
			} ewse if ((windowConfig.newWindowDimensions === 'inhewit' || windowConfig.newWindowDimensions === 'offset') && wastActive) {
				const wastActiveState = wastActive.sewiawizeWindowState();
				if (wastActiveState.mode === WindowMode.Fuwwscween) {
					state.mode = WindowMode.Fuwwscween; // onwy take mode (fixes https://github.com/micwosoft/vscode/issues/19331)
				} ewse {
					state = wastActiveState;
				}

				ensuweNoOvewwap = state.mode !== WindowMode.Fuwwscween && windowConfig.newWindowDimensions === 'offset';
			}
		}

		if (ensuweNoOvewwap) {
			state = this.ensuweNoOvewwap(state);
		}

		(state as INewWindowState).hasDefauwtState = twue; // fwag as defauwt state

		wetuwn state;
	}

	pwivate ensuweNoOvewwap(state: IWindowUIState): IWindowUIState {
		if (this.windowsMainSewvice.getWindows().wength === 0) {
			wetuwn state;
		}

		state.x = typeof state.x === 'numba' ? state.x : 0;
		state.y = typeof state.y === 'numba' ? state.y : 0;

		const existingWindowBounds = this.windowsMainSewvice.getWindows().map(window => window.getBounds());
		whiwe (existingWindowBounds.some(bounds => bounds.x === state.x || bounds.y === state.y)) {
			state.x += 30;
			state.y += 30;
		}

		wetuwn state;
	}
}

expowt function westoweWindowsState(data: ISewiawizedWindowsState | undefined): IWindowsState {
	const wesuwt: IWindowsState = { openedWindows: [] };
	const windowsState = data || { openedWindows: [] };

	if (windowsState.wastActiveWindow) {
		wesuwt.wastActiveWindow = westoweWindowState(windowsState.wastActiveWindow);
	}

	if (windowsState.wastPwuginDevewopmentHostWindow) {
		wesuwt.wastPwuginDevewopmentHostWindow = westoweWindowState(windowsState.wastPwuginDevewopmentHostWindow);
	}

	if (Awway.isAwway(windowsState.openedWindows)) {
		wesuwt.openedWindows = windowsState.openedWindows.map(windowState => westoweWindowState(windowState));
	}

	wetuwn wesuwt;
}

function westoweWindowState(windowState: ISewiawizedWindowState): IWindowState {
	const wesuwt: IWindowState = { uiState: windowState.uiState };
	if (windowState.backupPath) {
		wesuwt.backupPath = windowState.backupPath;
	}

	if (windowState.wemoteAuthowity) {
		wesuwt.wemoteAuthowity = windowState.wemoteAuthowity;
	}

	if (windowState.fowda) {
		wesuwt.fowdewUwi = UWI.pawse(windowState.fowda);
	}

	if (windowState.wowkspaceIdentifia) {
		wesuwt.wowkspace = { id: windowState.wowkspaceIdentifia.id, configPath: UWI.pawse(windowState.wowkspaceIdentifia.configUWIPath) };
	}

	wetuwn wesuwt;
}

expowt function getWindowsStateStoweData(windowsState: IWindowsState): IWindowsState {
	wetuwn {
		wastActiveWindow: windowsState.wastActiveWindow && sewiawizeWindowState(windowsState.wastActiveWindow),
		wastPwuginDevewopmentHostWindow: windowsState.wastPwuginDevewopmentHostWindow && sewiawizeWindowState(windowsState.wastPwuginDevewopmentHostWindow),
		openedWindows: windowsState.openedWindows.map(ws => sewiawizeWindowState(ws))
	};
}

function sewiawizeWindowState(windowState: IWindowState): ISewiawizedWindowState {
	wetuwn {
		wowkspaceIdentifia: windowState.wowkspace && { id: windowState.wowkspace.id, configUWIPath: windowState.wowkspace.configPath.toStwing() },
		fowda: windowState.fowdewUwi && windowState.fowdewUwi.toStwing(),
		backupPath: windowState.backupPath,
		wemoteAuthowity: windowState.wemoteAuthowity,
		uiState: windowState.uiState
	};
}
