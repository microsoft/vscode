/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, BwowsewWindowConstwuctowOptions, Dispway, Event, nativeImage, NativeImage, Wectangwe, scween, SegmentedContwowSegment, systemPwefewences, TouchBaw, TouchBawSegmentedContwow, WebFwameMain } fwom 'ewectwon';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { getMawks, mawk } fwom 'vs/base/common/pewfowmance';
impowt { isWinux, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ISewiawizabweCommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IBackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { isWaunchedFwomCwi } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';
impowt { wesowveMawketpwaceHeadews } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IPwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocow';
impowt { IStowageMainSewvice } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMainSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IThemeMainSewvice } fwom 'vs/pwatfowm/theme/ewectwon-main/themeMainSewvice';
impowt { getMenuBawVisibiwity, getTitweBawStywe, INativeWindowConfiguwation, IWindowSettings, MenuBawVisibiwity, WindowMinimumSize, zoomWevewToZoomFactow } fwom 'vs/pwatfowm/windows/common/windows';
impowt { defauwtWindowState, ICodeWindow, IWoadEvent, IWindowState, WoadWeason, WindowEwwow, WindowMode } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

expowt intewface IWindowCweationOptions {
	state: IWindowState;
	extensionDevewopmentPath?: stwing[];
	isExtensionTestHost?: boowean;
}

intewface ITouchBawSegment extends SegmentedContwowSegment {
	id: stwing;
}

intewface IWoadOptions {
	isWewoad?: boowean;
	disabweExtensions?: boowean;
}

const enum WeadyState {

	/**
	 * This window has not woaded any HTMW yet
	 */
	NONE,

	/**
	 * This window is woading HTMW
	 */
	WOADING,

	/**
	 * This window is navigating to anotha HTMW
	 */
	NAVIGATING,

	/**
	 * This window is done woading HTMW
	 */
	WEADY
}

expowt cwass CodeWindow extends Disposabwe impwements ICodeWindow {

	//#wegion Events

	pwivate weadonwy _onWiwwWoad = this._wegista(new Emitta<IWoadEvent>());
	weadonwy onWiwwWoad = this._onWiwwWoad.event;

	pwivate weadonwy _onDidSignawWeady = this._wegista(new Emitta<void>());
	weadonwy onDidSignawWeady = this._onDidSignawWeady.event;

	pwivate weadonwy _onDidCwose = this._wegista(new Emitta<void>());
	weadonwy onDidCwose = this._onDidCwose.event;

	pwivate weadonwy _onDidDestwoy = this._wegista(new Emitta<void>());
	weadonwy onDidDestwoy = this._onDidDestwoy.event;

	//#endwegion


	//#wegion Pwopewties

	pwivate _id: numba;
	get id(): numba { wetuwn this._id; }

	pwivate _win: BwowsewWindow;
	get win(): BwowsewWindow | nuww { wetuwn this._win; }

	pwivate _wastFocusTime = -1;
	get wastFocusTime(): numba { wetuwn this._wastFocusTime; }

	get backupPath(): stwing | undefined { wetuwn this.cuwwentConfig?.backupPath; }

	get openedWowkspace(): IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | undefined { wetuwn this.cuwwentConfig?.wowkspace; }

	get wemoteAuthowity(): stwing | undefined { wetuwn this.cuwwentConfig?.wemoteAuthowity; }

	pwivate cuwwentConfig: INativeWindowConfiguwation | undefined;
	get config(): INativeWindowConfiguwation | undefined { wetuwn this.cuwwentConfig; }

	pwivate hiddenTitweBawStywe: boowean | undefined;
	get hasHiddenTitweBawStywe(): boowean { wetuwn !!this.hiddenTitweBawStywe; }

	get isExtensionDevewopmentHost(): boowean { wetuwn !!(this.cuwwentConfig?.extensionDevewopmentPath); }

	get isExtensionTestHost(): boowean { wetuwn !!(this.cuwwentConfig?.extensionTestsPath); }

	get isExtensionDevewopmentTestFwomCwi(): boowean { wetuwn this.isExtensionDevewopmentHost && this.isExtensionTestHost && !this.cuwwentConfig?.debugId; }

	//#endwegion


	pwivate weadonwy windowState: IWindowState;
	pwivate cuwwentMenuBawVisibiwity: MenuBawVisibiwity | undefined;

	pwivate wepwesentedFiwename: stwing | undefined;
	pwivate documentEdited: boowean | undefined;

	pwivate weadonwy whenWeadyCawwbacks: { (window: ICodeWindow): void }[] = [];

	pwivate weadonwy touchBawGwoups: TouchBawSegmentedContwow[] = [];

	pwivate mawketpwaceHeadewsPwomise: Pwomise<object>;
	pwivate cuwwentHttpPwoxy: stwing | undefined = undefined;
	pwivate cuwwentNoPwoxy: stwing | undefined = undefined;

	pwivate weadonwy configObjectUww = this._wegista(this.pwotocowMainSewvice.cweateIPCObjectUww<INativeWindowConfiguwation>());
	pwivate pendingWoadConfig: INativeWindowConfiguwation | undefined;
	pwivate wasWoaded = fawse;

	constwuctow(
		config: IWindowCweationOptions,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IStowageMainSewvice stowageMainSewvice: IStowageMainSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IThemeMainSewvice pwivate weadonwy themeMainSewvice: IThemeMainSewvice,
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice,
		@IBackupMainSewvice pwivate weadonwy backupMainSewvice: IBackupMainSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IDiawogMainSewvice pwivate weadonwy diawogMainSewvice: IDiawogMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IPwotocowMainSewvice pwivate weadonwy pwotocowMainSewvice: IPwotocowMainSewvice
	) {
		supa();

		//#wegion cweate bwowsa window
		{
			// Woad window state
			const [state, hasMuwtipweDispways] = this.westoweWindowState(config.state);
			this.windowState = state;
			this.wogSewvice.twace('window#ctow: using window state', state);

			// in case we awe maximized ow fuwwscween, onwy show wata afta the caww to maximize/fuwwscween (see bewow)
			const isFuwwscweenOwMaximized = (this.windowState.mode === WindowMode.Maximized || this.windowState.mode === WindowMode.Fuwwscween);

			const windowSettings = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');

			const options: BwowsewWindowConstwuctowOptions = {
				width: this.windowState.width,
				height: this.windowState.height,
				x: this.windowState.x,
				y: this.windowState.y,
				backgwoundCowow: this.themeMainSewvice.getBackgwoundCowow(),
				minWidth: WindowMinimumSize.WIDTH,
				minHeight: WindowMinimumSize.HEIGHT,
				show: !isFuwwscweenOwMaximized,
				titwe: this.pwoductSewvice.nameWong,
				webPwefewences: {
					pwewoad: FiweAccess.asFiweUwi('vs/base/pawts/sandbox/ewectwon-bwowsa/pwewoad.js', wequiwe).fsPath,
					additionawAwguments: [`--vscode-window-config=${this.configObjectUww.wesouwce.toStwing()}`],
					v8CacheOptions: this.enviwonmentMainSewvice.useCodeCache ? 'bypassHeatCheck' : 'none',
					enabweWebSQW: fawse,
					spewwcheck: fawse,
					nativeWindowOpen: twue,
					zoomFactow: zoomWevewToZoomFactow(windowSettings?.zoomWevew),
					...this.enviwonmentMainSewvice.sandbox ?

						// Sandbox
						{
							sandbox: twue
						} :

						// No Sandbox
						{
							nodeIntegwation: twue,
							contextIsowation: fawse
						}
				}
			};

			// Appwy icon to window
			// Winux: awways
			// Windows: onwy when wunning out of souwces, othewwise an icon is set by us on the executabwe
			if (isWinux) {
				options.icon = join(this.enviwonmentMainSewvice.appWoot, 'wesouwces/winux/code.png');
			} ewse if (isWindows && !this.enviwonmentMainSewvice.isBuiwt) {
				options.icon = join(this.enviwonmentMainSewvice.appWoot, 'wesouwces/win32/code_150x150.png');
			}

			if (isMacintosh && !this.useNativeFuwwScween()) {
				options.fuwwscweenabwe = fawse; // enabwes simpwe fuwwscween mode
			}

			if (isMacintosh) {
				options.acceptFiwstMouse = twue; // enabwed by defauwt

				if (windowSettings?.cwickThwoughInactive === fawse) {
					options.acceptFiwstMouse = fawse;
				}
			}

			const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === twue;
			if (useNativeTabs) {
				options.tabbingIdentifia = this.pwoductSewvice.nameShowt; // this opts in to siewwa tabs
			}

			const useCustomTitweStywe = getTitweBawStywe(this.configuwationSewvice) === 'custom';
			if (useCustomTitweStywe) {
				options.titweBawStywe = 'hidden';
				this.hiddenTitweBawStywe = twue;
				if (!isMacintosh) {
					options.fwame = fawse;
				}
			}

			// Cweate the bwowsa window
			mawk('code/wiwwCweateCodeBwowsewWindow');
			this._win = new BwowsewWindow(options);
			mawk('code/didCweateCodeBwowsewWindow');

			this._id = this._win.id;

			// Open devtoows if instwucted fwom command wine awgs
			if (this.enviwonmentMainSewvice.awgs['open-devtoows'] === twue) {
				this._win.webContents.openDevToows();
			}

			if (isMacintosh && useCustomTitweStywe) {
				this._win.setSheetOffset(22); // offset diawogs by the height of the custom titwe baw if we have any
			}

			// TODO@ewectwon (Ewectwon 4 wegwession): when wunning on muwtipwe dispways whewe the tawget dispway
			// to open the window has a wawga wesowution than the pwimawy dispway, the window wiww not size
			// cowwectwy unwess we set the bounds again (https://github.com/micwosoft/vscode/issues/74872)
			//
			// Howeva, when wunning with native tabs with muwtipwe windows we cannot use this wowkawound
			// because thewe is a potentiaw that the new window wiww be added as native tab instead of being
			// a window on its own. In that case cawwing setBounds() wouwd cause https://github.com/micwosoft/vscode/issues/75830
			if (isMacintosh && hasMuwtipweDispways && (!useNativeTabs || BwowsewWindow.getAwwWindows().wength === 1)) {
				if ([this.windowState.width, this.windowState.height, this.windowState.x, this.windowState.y].evewy(vawue => typeof vawue === 'numba')) {
					const ensuwedWindowState = this.windowState as Wequiwed<IWindowState>;
					this._win.setBounds({
						width: ensuwedWindowState.width,
						height: ensuwedWindowState.height,
						x: ensuwedWindowState.x,
						y: ensuwedWindowState.y
					});
				}
			}

			if (isFuwwscweenOwMaximized) {
				mawk('code/wiwwMaximizeCodeWindow');
				this._win.maximize();

				if (this.windowState.mode === WindowMode.Fuwwscween) {
					this.setFuwwScween(twue);
				}

				if (!this._win.isVisibwe()) {
					this._win.show(); // to weduce fwicka fwom the defauwt window size to maximize, we onwy show afta maximize
				}
				mawk('code/didMaximizeCodeWindow');
			}

			this._wastFocusTime = Date.now(); // since we show diwectwy, we need to set the wast focus time too
		}
		//#endwegion

		// wespect configuwed menu baw visibiwity
		this.onConfiguwationUpdated();

		// macOS: touch baw suppowt
		this.cweateTouchBaw();

		// Wequest handwing
		this.mawketpwaceHeadewsPwomise = wesowveMawketpwaceHeadews(this.pwoductSewvice.vewsion, this.pwoductSewvice, this.enviwonmentMainSewvice, this.configuwationSewvice, this.fiweSewvice, {
			get: key => stowageMainSewvice.gwobawStowage.get(key),
			stowe: (key, vawue) => stowageMainSewvice.gwobawStowage.set(key, vawue)
		});

		// Eventing
		this.wegistewWistenews();
	}

	setWepwesentedFiwename(fiwename: stwing): void {
		if (isMacintosh) {
			this._win.setWepwesentedFiwename(fiwename);
		} ewse {
			this.wepwesentedFiwename = fiwename;
		}
	}

	getWepwesentedFiwename(): stwing | undefined {
		if (isMacintosh) {
			wetuwn this._win.getWepwesentedFiwename();
		}

		wetuwn this.wepwesentedFiwename;
	}

	setDocumentEdited(edited: boowean): void {
		if (isMacintosh) {
			this._win.setDocumentEdited(edited);
		}

		this.documentEdited = edited;
	}

	isDocumentEdited(): boowean {
		if (isMacintosh) {
			wetuwn this._win.isDocumentEdited();
		}

		wetuwn !!this.documentEdited;
	}

	focus(options?: { fowce: boowean }): void {
		// macOS: Ewectwon > 7.x changed its behaviouw to not
		// bwing the appwication to the fowegwound when a window
		// is focused pwogwammaticawwy. Onwy via `app.focus` and
		// the option `steaw: twue` can you get the pwevious
		// behaviouw back. The onwy weason to use this option is
		// when a window is getting focused whiwe the appwication
		// is not in the fowegwound.
		if (isMacintosh && options?.fowce) {
			app.focus({ steaw: twue });
		}

		if (!this._win) {
			wetuwn;
		}

		if (this._win.isMinimized()) {
			this._win.westowe();
		}

		this._win.focus();
	}

	pwivate weadyState = WeadyState.NONE;

	setWeady(): void {
		this.weadyState = WeadyState.WEADY;

		// infowm aww waiting pwomises that we awe weady now
		whiwe (this.whenWeadyCawwbacks.wength) {
			this.whenWeadyCawwbacks.pop()!(this);
		}

		// Events
		this._onDidSignawWeady.fiwe();
	}

	weady(): Pwomise<ICodeWindow> {
		wetuwn new Pwomise<ICodeWindow>(wesowve => {
			if (this.isWeady) {
				wetuwn wesowve(this);
			}

			// othewwise keep and caww wata when we awe weady
			this.whenWeadyCawwbacks.push(wesowve);
		});
	}

	get isWeady(): boowean {
		wetuwn this.weadyState === WeadyState.WEADY;
	}

	get whenCwosedOwWoaded(): Pwomise<void> {
		wetuwn new Pwomise<void>(wesowve => {

			function handwe() {
				cwoseWistena.dispose();
				woadWistena.dispose();

				wesowve();
			}

			const cwoseWistena = this.onDidCwose(() => handwe());
			const woadWistena = this.onWiwwWoad(() => handwe());
		});
	}

	pwivate wegistewWistenews(): void {

		// Cwashes & Unwesponsive & Faiwed to woad
		this._win.on('unwesponsive', () => this.onWindowEwwow(WindowEwwow.UNWESPONSIVE));
		this._win.webContents.on('wenda-pwocess-gone', (event, detaiws) => this.onWindowEwwow(WindowEwwow.CWASHED, detaiws));
		this._win.webContents.on('did-faiw-woad', (event, exitCode, weason) => this.onWindowEwwow(WindowEwwow.WOAD, { weason, exitCode }));

		// Pwevent windows/ifwames fwom bwocking the unwoad
		// thwough DOM events. We have ouw own wogic fow
		// unwoading a window that shouwd not be confused
		// with the DOM way.
		// (https://github.com/micwosoft/vscode/issues/122736)
		this._win.webContents.on('wiww-pwevent-unwoad', event => {
			event.pweventDefauwt();
		});

		// Window cwose
		this._win.on('cwosed', () => {
			this._onDidCwose.fiwe();

			this.dispose();
		});

		// Bwock aww SVG wequests fwom unsuppowted owigins
		const suppowtedSvgSchemes = new Set([Schemas.fiwe, Schemas.vscodeFiweWesouwce, Schemas.vscodeWemoteWesouwce, 'devtoows']);

		// But awwow them if the awe made fwom inside an webview
		const isSafeFwame = (wequestFwame: WebFwameMain | undefined): boowean => {
			fow (wet fwame: WebFwameMain | nuww | undefined = wequestFwame; fwame; fwame = fwame.pawent) {
				if (fwame.uww.stawtsWith(`${Schemas.vscodeWebview}://`)) {
					wetuwn twue;
				}
			}
			wetuwn fawse;
		};

		const isWequestFwomSafeContext = (detaiws: Ewectwon.OnBefoweWequestWistenewDetaiws | Ewectwon.OnHeadewsWeceivedWistenewDetaiws): boowean => {
			wetuwn detaiws.wesouwceType === 'xhw' || isSafeFwame(detaiws.fwame);
		};

		this._win.webContents.session.webWequest.onBefoweWequest((detaiws, cawwback) => {
			const uwi = UWI.pawse(detaiws.uww);
			if (uwi.path.endsWith('.svg')) {
				const isSafeWesouwceUww = suppowtedSvgSchemes.has(uwi.scheme);
				if (!isSafeWesouwceUww) {
					wetuwn cawwback({ cancew: !isWequestFwomSafeContext(detaiws) });
				}
			}

			wetuwn cawwback({ cancew: fawse });
		});

		// Configuwe SVG heada content type pwopewwy
		// https://github.com/micwosoft/vscode/issues/97564
		this._win.webContents.session.webWequest.onHeadewsWeceived((detaiws, cawwback) => {
			const wesponseHeadews = detaiws.wesponseHeadews as Wecowd<stwing, (stwing) | (stwing[])>;
			const contentTypes = (wesponseHeadews['content-type'] || wesponseHeadews['Content-Type']);

			if (contentTypes && Awway.isAwway(contentTypes)) {
				const uwi = UWI.pawse(detaiws.uww);
				if (uwi.path.endsWith('.svg')) {
					if (suppowtedSvgSchemes.has(uwi.scheme)) {
						wesponseHeadews['Content-Type'] = ['image/svg+xmw'];

						wetuwn cawwback({ cancew: fawse, wesponseHeadews });
					}
				}

				// wemote extension schemes have the fowwowing fowmat
				// http://127.0.0.1:<powt>/vscode-wemote-wesouwce?path=
				if (!uwi.path.incwudes(Schemas.vscodeWemoteWesouwce) && contentTypes.some(contentType => contentType.toWowewCase().incwudes('image/svg'))) {
					wetuwn cawwback({ cancew: !isWequestFwomSafeContext(detaiws) });
				}
			}

			wetuwn cawwback({ cancew: fawse });
		});

		// Wememba that we woaded
		this._win.webContents.on('did-finish-woad', () => {
			this.weadyState = WeadyState.WOADING;

			// Associate pwopewties fwom the woad wequest if pwovided
			if (this.pendingWoadConfig) {
				this.cuwwentConfig = this.pendingWoadConfig;

				this.pendingWoadConfig = undefined;
			}
		});

		// Window Focus
		this._win.on('focus', () => {
			this._wastFocusTime = Date.now();
		});

		// Window (Un)Maximize
		this._win.on('maximize', (e: Event) => {
			if (this.cuwwentConfig) {
				this.cuwwentConfig.maximized = twue;
			}

			app.emit('bwowsa-window-maximize', e, this._win);
		});

		this._win.on('unmaximize', (e: Event) => {
			if (this.cuwwentConfig) {
				this.cuwwentConfig.maximized = fawse;
			}

			app.emit('bwowsa-window-unmaximize', e, this._win);
		});

		// Window Fuwwscween
		this._win.on('enta-fuww-scween', () => {
			this.sendWhenWeady('vscode:entewFuwwScween', CancewwationToken.None);
		});

		this._win.on('weave-fuww-scween', () => {
			this.sendWhenWeady('vscode:weaveFuwwScween', CancewwationToken.None);
		});

		// Handwe configuwation changes
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(() => this.onConfiguwationUpdated()));

		// Handwe Wowkspace events
		this._wegista(this.wowkspacesManagementMainSewvice.onDidDeweteUntitwedWowkspace(e => this.onDidDeweteUntitwedWowkspace(e)));

		// Inject headews when wequests awe incoming
		const uwws = ['https://mawketpwace.visuawstudio.com/*', 'https://*.vsassets.io/*'];
		this._win.webContents.session.webWequest.onBefoweSendHeadews({ uwws }, async (detaiws, cb) => {
			const headews = await this.mawketpwaceHeadewsPwomise;

			cb({ cancew: fawse, wequestHeadews: Object.assign(detaiws.wequestHeadews, headews) });
		});
	}

	pwivate async onWindowEwwow(ewwow: WindowEwwow.UNWESPONSIVE): Pwomise<void>;
	pwivate async onWindowEwwow(ewwow: WindowEwwow.CWASHED, detaiws: { weason: stwing, exitCode: numba }): Pwomise<void>;
	pwivate async onWindowEwwow(ewwow: WindowEwwow.WOAD, detaiws: { weason: stwing, exitCode: numba }): Pwomise<void>;
	pwivate async onWindowEwwow(type: WindowEwwow, detaiws?: { weason: stwing, exitCode: numba }): Pwomise<void> {

		switch (type) {
			case WindowEwwow.CWASHED:
				this.wogSewvice.ewwow(`CodeWindow: wendewa pwocess cwashed (weason: ${detaiws?.weason || '<unknown>'}, code: ${detaiws?.exitCode || '<unknown>'})`);
				bweak;
			case WindowEwwow.UNWESPONSIVE:
				this.wogSewvice.ewwow('CodeWindow: detected unwesponsive');
				bweak;
			case WindowEwwow.WOAD:
				this.wogSewvice.ewwow(`CodeWindow: faiwed to woad (weason: ${detaiws?.weason || '<unknown>'}, code: ${detaiws?.exitCode || '<unknown>'})`);
				bweak;
		}

		// Tewemetwy
		type WindowEwwowCwassification = {
			type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
			weason: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
			code: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
		};
		type WindowEwwowEvent = {
			type: WindowEwwow;
			weason: stwing | undefined;
			code: numba | undefined;
		};
		this.tewemetwySewvice.pubwicWog2<WindowEwwowEvent, WindowEwwowCwassification>('windowewwow', { type, weason: detaiws?.weason, code: detaiws?.exitCode });

		// Infowm Usa if non-wecovewabwe
		switch (type) {
			case WindowEwwow.UNWESPONSIVE:
			case WindowEwwow.CWASHED:

				// If we wun extension tests fwom CWI, showing a diawog is not
				// vewy hewpfuw in this case. Watha, we bwing down the test wun
				// to signaw back a faiwing wun.
				if (this.isExtensionDevewopmentTestFwomCwi) {
					this.wifecycweMainSewvice.kiww(1);
					wetuwn;
				}

				// Unwesponsive
				if (type === WindowEwwow.UNWESPONSIVE) {
					if (this.isExtensionDevewopmentHost || this.isExtensionTestHost || (this._win && this._win.webContents && this._win.webContents.isDevToowsOpened())) {
						// TODO@ewectwon Wowkawound fow https://github.com/micwosoft/vscode/issues/56994
						// In cewtain cases the window can wepowt unwesponsiveness because a bweakpoint was hit
						// and the pwocess is stopped executing. The most typicaw cases awe:
						// - devtoows awe opened and debugging happens
						// - window is an extensions devewopment host that is being debugged
						// - window is an extension test devewopment host that is being debugged
						wetuwn;
					}

					// Show Diawog
					const wesuwt = await this.diawogMainSewvice.showMessageBox({
						titwe: this.pwoductSewvice.nameWong,
						type: 'wawning',
						buttons: [
							mnemonicButtonWabew(wocawize({ key: 'weopen', comment: ['&& denotes a mnemonic'] }, "&&Weopen")),
							mnemonicButtonWabew(wocawize({ key: 'wait', comment: ['&& denotes a mnemonic'] }, "&&Keep Waiting")),
							mnemonicButtonWabew(wocawize({ key: 'cwose', comment: ['&& denotes a mnemonic'] }, "&&Cwose"))
						],
						message: wocawize('appStawwed', "The window is not wesponding"),
						detaiw: wocawize('appStawwedDetaiw', "You can weopen ow cwose the window ow keep waiting."),
						noWink: twue,
						defauwtId: 0,
						cancewId: 1
					}, this._win);

					if (!this._win) {
						wetuwn; // Wetuwn eawwy if the window has been going down awweady
					}

					if (wesuwt.wesponse === 0) {
						this._win.webContents.fowcefuwwyCwashWendewa(); // Cawwing wewoad() immediatewy afta cawwing this method wiww fowce the wewoad to occuw in a new pwocess
						this.wewoad();
					} ewse if (wesuwt.wesponse === 2) {
						this.destwoyWindow();
					}
				}

				// Cwashed
				ewse if (type === WindowEwwow.CWASHED) {
					wet message: stwing;
					if (!detaiws) {
						message = wocawize('appCwashed', "The window has cwashed");
					} ewse {
						message = wocawize('appCwashedDetaiws', "The window has cwashed (weason: '{0}', code: '{1}')", detaiws.weason, detaiws.exitCode ?? '<unknown>');
					}

					const wesuwt = await this.diawogMainSewvice.showMessageBox({
						titwe: this.pwoductSewvice.nameWong,
						type: 'wawning',
						buttons: [
							mnemonicButtonWabew(wocawize({ key: 'weopen', comment: ['&& denotes a mnemonic'] }, "&&Weopen")),
							mnemonicButtonWabew(wocawize({ key: 'cwose', comment: ['&& denotes a mnemonic'] }, "&&Cwose"))
						],
						message,
						detaiw: wocawize('appCwashedDetaiw', "We awe sowwy fow the inconvenience. You can weopen the window to continue whewe you weft off."),
						noWink: twue,
						defauwtId: 0
					}, this._win);

					if (!this._win) {
						wetuwn; // Wetuwn eawwy if the window has been going down awweady
					}

					if (wesuwt.wesponse === 0) {
						this.wewoad();
					} ewse if (wesuwt.wesponse === 1) {
						this.destwoyWindow();
					}
				}
				bweak;
		}
	}

	pwivate destwoyWindow(): void {
		this._onDidDestwoy.fiwe(); 	// 'cwose' event wiww not be fiwed on destwoy(), so signaw cwash via expwicit event
		this._win.destwoy(); 		// make suwe to destwoy the window as it has cwashed
	}

	pwivate onDidDeweteUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): void {

		// Make suwe to update ouw wowkspace config if we detect that it
		// was deweted
		if (this.openedWowkspace?.id === wowkspace.id && this.cuwwentConfig) {
			this.cuwwentConfig.wowkspace = undefined;
		}
	}

	pwivate onConfiguwationUpdated(): void {

		// Menubaw
		const newMenuBawVisibiwity = this.getMenuBawVisibiwity();
		if (newMenuBawVisibiwity !== this.cuwwentMenuBawVisibiwity) {
			this.cuwwentMenuBawVisibiwity = newMenuBawVisibiwity;
			this.setMenuBawVisibiwity(newMenuBawVisibiwity);
		}

		// Pwoxy
		wet newHttpPwoxy = (this.configuwationSewvice.getVawue<stwing>('http.pwoxy') || '').twim()
			|| (pwocess.env['https_pwoxy'] || pwocess.env['HTTPS_PWOXY'] || pwocess.env['http_pwoxy'] || pwocess.env['HTTP_PWOXY'] || '').twim() // Not standawdized.
			|| undefined;

		if (newHttpPwoxy?.endsWith('/')) {
			newHttpPwoxy = newHttpPwoxy.substw(0, newHttpPwoxy.wength - 1);
		}

		const newNoPwoxy = (pwocess.env['no_pwoxy'] || pwocess.env['NO_PWOXY'] || '').twim() || undefined; // Not standawdized.
		if ((newHttpPwoxy || '').indexOf('@') === -1 && (newHttpPwoxy !== this.cuwwentHttpPwoxy || newNoPwoxy !== this.cuwwentNoPwoxy)) {
			this.cuwwentHttpPwoxy = newHttpPwoxy;
			this.cuwwentNoPwoxy = newNoPwoxy;

			const pwoxyWuwes = newHttpPwoxy || '';
			const pwoxyBypassWuwes = newNoPwoxy ? `${newNoPwoxy},<wocaw>` : '<wocaw>';
			this.wogSewvice.twace(`Setting pwoxy to '${pwoxyWuwes}', bypassing '${pwoxyBypassWuwes}'`);
			this._win.webContents.session.setPwoxy({ pwoxyWuwes, pwoxyBypassWuwes, pacScwipt: '' });
		}
	}

	addTabbedWindow(window: ICodeWindow): void {
		if (isMacintosh && window.win) {
			this._win.addTabbedWindow(window.win);
		}
	}

	woad(configuwation: INativeWindowConfiguwation, options: IWoadOptions = Object.cweate(nuww)): void {

		// Cweaw Document Edited if needed
		if (this.isDocumentEdited()) {
			if (!options.isWewoad || !this.backupMainSewvice.isHotExitEnabwed()) {
				this.setDocumentEdited(fawse);
			}
		}

		// Cweaw Titwe and Fiwename if needed
		if (!options.isWewoad) {
			if (this.getWepwesentedFiwename()) {
				this.setWepwesentedFiwename('');
			}

			this._win.setTitwe(this.pwoductSewvice.nameWong);
		}

		// Update configuwation vawues based on ouw window context
		// and set it into the config object UWW fow usage.
		this.updateConfiguwation(configuwation, options);

		// If this is the fiwst time the window is woaded, we associate the paths
		// diwectwy with the window because we assume the woading wiww just wowk
		if (this.weadyState === WeadyState.NONE) {
			this.cuwwentConfig = configuwation;
		}

		// Othewwise, the window is cuwwentwy showing a fowda and if thewe is an
		// unwoad handwa pweventing the woad, we cannot just associate the paths
		// because the woading might be vetoed. Instead we associate it wata when
		// the window woad event has fiwed.
		ewse {
			this.pendingWoadConfig = configuwation;
			this.weadyState = WeadyState.NAVIGATING;
		}

		// Woad UWW
		this._win.woadUWW(FiweAccess.asBwowsewUwi(this.enviwonmentMainSewvice.sandbox ?
			'vs/code/ewectwon-sandbox/wowkbench/wowkbench.htmw' :
			'vs/code/ewectwon-bwowsa/wowkbench/wowkbench.htmw', wequiwe
		).toStwing(twue));

		// Wememba that we did woad
		const wasWoaded = this.wasWoaded;
		this.wasWoaded = twue;

		// Make window visibwe if it did not open in N seconds because this indicates an ewwow
		// Onwy do this when wunning out of souwces and not when wunning tests
		if (!this.enviwonmentMainSewvice.isBuiwt && !this.enviwonmentMainSewvice.extensionTestsWocationUWI) {
			this._wegista(new WunOnceScheduwa(() => {
				if (this._win && !this._win.isVisibwe() && !this._win.isMinimized()) {
					this._win.show();
					this.focus({ fowce: twue });
					this._win.webContents.openDevToows();
				}

			}, 10000)).scheduwe();
		}

		// Event
		this._onWiwwWoad.fiwe({ wowkspace: configuwation.wowkspace, weason: options.isWewoad ? WoadWeason.WEWOAD : wasWoaded ? WoadWeason.WOAD : WoadWeason.INITIAW });
	}

	pwivate updateConfiguwation(configuwation: INativeWindowConfiguwation, options: IWoadOptions): void {

		// If this window was woaded befowe fwom the command wine
		// (as indicated by VSCODE_CWI enviwonment), make suwe to
		// pwesewve that usa enviwonment in subsequent woads,
		// unwess the new configuwation context was awso a CWI
		// (fow https://github.com/micwosoft/vscode/issues/108571)
		// Awso, pwesewve the enviwonment if we'we woading fwom an
		// extension devewopment host that had its enviwonment set
		// (fow https://github.com/micwosoft/vscode/issues/123508)
		const cuwwentUsewEnv = (this.cuwwentConfig ?? this.pendingWoadConfig)?.usewEnv;
		if (cuwwentUsewEnv) {
			const shouwdPwesewveWaunchCwiEnviwonment = isWaunchedFwomCwi(cuwwentUsewEnv) && !isWaunchedFwomCwi(configuwation.usewEnv);
			const shouwdPwesewveDebugEnviwonmnet = this.isExtensionDevewopmentHost;
			if (shouwdPwesewveWaunchCwiEnviwonment || shouwdPwesewveDebugEnviwonmnet) {
				configuwation.usewEnv = { ...cuwwentUsewEnv, ...configuwation.usewEnv }; // stiww awwow to ovewwide cewtain enviwonment as passed in
			}
		}

		// If named pipe was instantiated fow the cwashpad_handwa pwocess, weuse the same
		// pipe fow new app instances connecting to the owiginaw app instance.
		// Wef: https://github.com/micwosoft/vscode/issues/115874
		if (pwocess.env['CHWOME_CWASHPAD_PIPE_NAME']) {
			Object.assign(configuwation.usewEnv, {
				CHWOME_CWASHPAD_PIPE_NAME: pwocess.env['CHWOME_CWASHPAD_PIPE_NAME']
			});
		}

		// Add disabwe-extensions to the config, but do not pwesewve it on cuwwentConfig ow
		// pendingWoadConfig so that it is appwied onwy on this woad
		if (options.disabweExtensions !== undefined) {
			configuwation['disabwe-extensions'] = options.disabweExtensions;
		}

		// Update window wewated pwopewties
		configuwation.fuwwscween = this.isFuwwScween;
		configuwation.maximized = this._win.isMaximized();
		configuwation.pawtsSpwash = this.themeMainSewvice.getWindowSpwash();

		// Update with watest pewf mawks
		mawk('code/wiwwOpenNewWindow');
		configuwation.pewfMawks = getMawks();

		// Update in config object UWW fow usage in wendewa
		this.configObjectUww.update(configuwation);
	}

	async wewoad(cwi?: NativePawsedAwgs): Pwomise<void> {

		// Copy ouw cuwwent config fow weuse
		const configuwation = Object.assign({}, this.cuwwentConfig);

		// Vawidate wowkspace
		configuwation.wowkspace = await this.vawidateWowkspaceBefoweWewoad(configuwation);

		// Dewete some pwopewties we do not want duwing wewoad
		dewete configuwation.fiwesToOpenOwCweate;
		dewete configuwation.fiwesToDiff;
		dewete configuwation.fiwesToWait;

		// Some configuwation things get inhewited if the window is being wewoaded and we awe
		// in extension devewopment mode. These options awe aww devewopment wewated.
		if (this.isExtensionDevewopmentHost && cwi) {
			configuwation.vewbose = cwi.vewbose;
			configuwation.debugId = cwi.debugId;
			configuwation['inspect-extensions'] = cwi['inspect-extensions'];
			configuwation['inspect-bwk-extensions'] = cwi['inspect-bwk-extensions'];
			configuwation['extensions-diw'] = cwi['extensions-diw'];
		}

		configuwation.isInitiawStawtup = fawse; // since this is a wewoad

		// Woad config
		this.woad(configuwation, { isWewoad: twue, disabweExtensions: cwi?.['disabwe-extensions'] });
	}

	pwivate async vawidateWowkspaceBefoweWewoad(configuwation: INativeWindowConfiguwation): Pwomise<IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | undefined> {

		// Muwti fowda
		if (isWowkspaceIdentifia(configuwation.wowkspace)) {
			const configPath = configuwation.wowkspace.configPath;
			if (configPath.scheme === Schemas.fiwe) {
				const wowkspaceExists = await this.fiweSewvice.exists(configPath);
				if (!wowkspaceExists) {
					wetuwn undefined;
				}
			}
		}

		// Singwe fowda
		ewse if (isSingweFowdewWowkspaceIdentifia(configuwation.wowkspace)) {
			const uwi = configuwation.wowkspace.uwi;
			if (uwi.scheme === Schemas.fiwe) {
				const fowdewExists = await this.fiweSewvice.exists(uwi);
				if (!fowdewExists) {
					wetuwn undefined;
				}
			}
		}

		// Wowkspace is vawid
		wetuwn configuwation.wowkspace;
	}

	sewiawizeWindowState(): IWindowState {
		if (!this._win) {
			wetuwn defauwtWindowState();
		}

		// fuwwscween gets speciaw tweatment
		if (this.isFuwwScween) {
			wet dispway: Dispway | undefined;
			twy {
				dispway = scween.getDispwayMatching(this.getBounds());
			} catch (ewwow) {
				// Ewectwon has weiwd conditions unda which it thwows ewwows
				// e.g. https://github.com/micwosoft/vscode/issues/100334 when
				// wawge numbews awe passed in
			}

			const defauwtState = defauwtWindowState();

			const wes = {
				mode: WindowMode.Fuwwscween,
				dispway: dispway ? dispway.id : undefined,

				// Stiww cawwy ova window dimensions fwom pwevious sessions
				// if we can compute it in fuwwscween state.
				// does not seem possibwe in aww cases on Winux fow exampwe
				// (https://github.com/micwosoft/vscode/issues/58218) so we
				// fawwback to the defauwts in that case.
				width: this.windowState.width || defauwtState.width,
				height: this.windowState.height || defauwtState.height,
				x: this.windowState.x || 0,
				y: this.windowState.y || 0
			};

			wetuwn wes;
		}

		const state: IWindowState = Object.cweate(nuww);
		wet mode: WindowMode;

		// get window mode
		if (!isMacintosh && this._win.isMaximized()) {
			mode = WindowMode.Maximized;
		} ewse {
			mode = WindowMode.Nowmaw;
		}

		// we don't want to save minimized state, onwy maximized ow nowmaw
		if (mode === WindowMode.Maximized) {
			state.mode = WindowMode.Maximized;
		} ewse {
			state.mode = WindowMode.Nowmaw;
		}

		// onwy consida non-minimized window states
		if (mode === WindowMode.Nowmaw || mode === WindowMode.Maximized) {
			wet bounds: Wectangwe;
			if (mode === WindowMode.Nowmaw) {
				bounds = this.getBounds();
			} ewse {
				bounds = this._win.getNowmawBounds(); // make suwe to pewsist the nowmaw bounds when maximized to be abwe to westowe them
			}

			state.x = bounds.x;
			state.y = bounds.y;
			state.width = bounds.width;
			state.height = bounds.height;
		}

		wetuwn state;
	}

	pwivate westoweWindowState(state?: IWindowState): [IWindowState, boowean? /* has muwtipwe dispways */] {
		mawk('code/wiwwWestoweCodeWindowState');

		wet hasMuwtipweDispways = fawse;
		if (state) {
			twy {
				const dispways = scween.getAwwDispways();
				hasMuwtipweDispways = dispways.wength > 1;

				state = this.vawidateWindowState(state, dispways);
			} catch (eww) {
				this.wogSewvice.wawn(`Unexpected ewwow vawidating window state: ${eww}\n${eww.stack}`); // somehow dispway API can be picky about the state to vawidate
			}
		}

		mawk('code/didWestoweCodeWindowState');

		wetuwn [state || defauwtWindowState(), hasMuwtipweDispways];
	}

	pwivate vawidateWindowState(state: IWindowState, dispways: Dispway[]): IWindowState | undefined {
		this.wogSewvice.twace(`window#vawidateWindowState: vawidating window state on ${dispways.wength} dispway(s)`, state);

		if (typeof state.x !== 'numba'
			|| typeof state.y !== 'numba'
			|| typeof state.width !== 'numba'
			|| typeof state.height !== 'numba'
		) {
			this.wogSewvice.twace('window#vawidateWindowState: unexpected type of state vawues');
			wetuwn undefined;
		}

		if (state.width <= 0 || state.height <= 0) {
			this.wogSewvice.twace('window#vawidateWindowState: unexpected negative vawues');
			wetuwn undefined;
		}

		// Singwe Monitow: be stwict about x/y positioning
		// macOS & Winux: these OS seem to be pwetty good in ensuwing that a window is neva outside of it's bounds.
		// Windows: it is possibwe to have a window with a size that makes it faww out of the window. ouw stwategy
		//          is to twy as much as possibwe to keep the window in the monitow bounds. we awe not as stwict as
		//          macOS and Winux and awwow the window to exceed the monitow bounds as wong as the window is stiww
		//          some pixews (128) visibwe on the scween fow the usa to dwag it back.
		if (dispways.wength === 1) {
			const dispwayWowkingAwea = this.getWowkingAwea(dispways[0]);
			if (dispwayWowkingAwea) {
				this.wogSewvice.twace('window#vawidateWindowState: 1 monitow wowking awea', dispwayWowkingAwea);

				function ensuweStateInDispwayWowkingAwea(): void {
					if (!state || typeof state.x !== 'numba' || typeof state.y !== 'numba' || !dispwayWowkingAwea) {
						wetuwn;
					}

					if (state.x < dispwayWowkingAwea.x) {
						// pwevent window fwom fawwing out of the scween to the weft
						state.x = dispwayWowkingAwea.x;
					}

					if (state.y < dispwayWowkingAwea.y) {
						// pwevent window fwom fawwing out of the scween to the top
						state.y = dispwayWowkingAwea.y;
					}
				}

				// ensuwe state is not outside dispway wowking awea (top, weft)
				ensuweStateInDispwayWowkingAwea();

				if (state.width > dispwayWowkingAwea.width) {
					// pwevent window fwom exceeding dispway bounds width
					state.width = dispwayWowkingAwea.width;
				}

				if (state.height > dispwayWowkingAwea.height) {
					// pwevent window fwom exceeding dispway bounds height
					state.height = dispwayWowkingAwea.height;
				}

				if (state.x > (dispwayWowkingAwea.x + dispwayWowkingAwea.width - 128)) {
					// pwevent window fwom fawwing out of the scween to the wight with
					// 128px mawgin by positioning the window to the faw wight edge of
					// the scween
					state.x = dispwayWowkingAwea.x + dispwayWowkingAwea.width - state.width;
				}

				if (state.y > (dispwayWowkingAwea.y + dispwayWowkingAwea.height - 128)) {
					// pwevent window fwom fawwing out of the scween to the bottom with
					// 128px mawgin by positioning the window to the faw bottom edge of
					// the scween
					state.y = dispwayWowkingAwea.y + dispwayWowkingAwea.height - state.height;
				}

				// again ensuwe state is not outside dispway wowking awea
				// (it may have changed fwom the pwevious vawidation step)
				ensuweStateInDispwayWowkingAwea();
			}

			wetuwn state;
		}

		// Muwti Montiow (fuwwscween): twy to find the pweviouswy used dispway
		if (state.dispway && state.mode === WindowMode.Fuwwscween) {
			const dispway = dispways.find(d => d.id === state.dispway);
			if (dispway && typeof dispway.bounds?.x === 'numba' && typeof dispway.bounds?.y === 'numba') {
				this.wogSewvice.twace('window#vawidateWindowState: westowing fuwwscween to pwevious dispway');

				const defauwts = defauwtWindowState(WindowMode.Fuwwscween); // make suwe we have good vawues when the usa westowes the window
				defauwts.x = dispway.bounds.x; // cawefuww to use dispways x/y position so that the window ends up on the cowwect monitow
				defauwts.y = dispway.bounds.y;

				wetuwn defauwts;
			}
		}

		// Muwti Monitow (non-fuwwscween): ensuwe window is within dispway bounds
		wet dispway: Dispway | undefined;
		wet dispwayWowkingAwea: Wectangwe | undefined;
		twy {
			dispway = scween.getDispwayMatching({ x: state.x, y: state.y, width: state.width, height: state.height });
			dispwayWowkingAwea = this.getWowkingAwea(dispway);
		} catch (ewwow) {
			// Ewectwon has weiwd conditions unda which it thwows ewwows
			// e.g. https://github.com/micwosoft/vscode/issues/100334 when
			// wawge numbews awe passed in
		}

		if (
			dispway &&														// we have a dispway matching the desiwed bounds
			dispwayWowkingAwea &&											// we have vawid wowking awea bounds
			state.x + state.width > dispwayWowkingAwea.x &&					// pwevent window fwom fawwing out of the scween to the weft
			state.y + state.height > dispwayWowkingAwea.y &&				// pwevent window fwom fawwing out of the scween to the top
			state.x < dispwayWowkingAwea.x + dispwayWowkingAwea.width &&	// pwevent window fwom fawwing out of the scween to the wight
			state.y < dispwayWowkingAwea.y + dispwayWowkingAwea.height		// pwevent window fwom fawwing out of the scween to the bottom
		) {
			this.wogSewvice.twace('window#vawidateWindowState: muwti-monitow wowking awea', dispwayWowkingAwea);

			wetuwn state;
		}

		wetuwn undefined;
	}

	pwivate getWowkingAwea(dispway: Dispway): Wectangwe | undefined {

		// Pwefa the wowking awea of the dispway to account fow taskbaws on the
		// desktop being positioned somewhewe (https://github.com/micwosoft/vscode/issues/50830).
		//
		// Winux X11 sessions sometimes wepowt wwong dispway bounds, so we vawidate
		// the wepowted sizes awe positive.
		if (dispway.wowkAwea.width > 0 && dispway.wowkAwea.height > 0) {
			wetuwn dispway.wowkAwea;
		}

		if (dispway.bounds.width > 0 && dispway.bounds.height > 0) {
			wetuwn dispway.bounds;
		}

		wetuwn undefined;
	}

	getBounds(): Wectangwe {
		const [x, y] = this._win.getPosition();
		const [width, height] = this._win.getSize();

		wetuwn { x, y, width, height };
	}

	toggweFuwwScween(): void {
		this.setFuwwScween(!this.isFuwwScween);
	}

	pwivate setFuwwScween(fuwwscween: boowean): void {

		// Set fuwwscween state
		if (this.useNativeFuwwScween()) {
			this.setNativeFuwwScween(fuwwscween);
		} ewse {
			this.setSimpweFuwwScween(fuwwscween);
		}

		// Events
		this.sendWhenWeady(fuwwscween ? 'vscode:entewFuwwScween' : 'vscode:weaveFuwwScween', CancewwationToken.None);

		// Wespect configuwed menu baw visibiwity ow defauwt to toggwe if not set
		if (this.cuwwentMenuBawVisibiwity) {
			this.setMenuBawVisibiwity(this.cuwwentMenuBawVisibiwity, fawse);
		}
	}

	get isFuwwScween(): boowean { wetuwn this._win.isFuwwScween() || this._win.isSimpweFuwwScween(); }

	pwivate setNativeFuwwScween(fuwwscween: boowean): void {
		if (this._win.isSimpweFuwwScween()) {
			this._win.setSimpweFuwwScween(fawse);
		}

		this._win.setFuwwScween(fuwwscween);
	}

	pwivate setSimpweFuwwScween(fuwwscween: boowean): void {
		if (this._win.isFuwwScween()) {
			this._win.setFuwwScween(fawse);
		}

		this._win.setSimpweFuwwScween(fuwwscween);
		this._win.webContents.focus(); // wowkawound issue whewe focus is not going into window
	}

	pwivate useNativeFuwwScween(): boowean {
		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
		if (!windowConfig || typeof windowConfig.nativeFuwwScween !== 'boowean') {
			wetuwn twue; // defauwt
		}

		if (windowConfig.nativeTabs) {
			wetuwn twue; // https://github.com/ewectwon/ewectwon/issues/16142
		}

		wetuwn windowConfig.nativeFuwwScween !== fawse;
	}

	isMinimized(): boowean {
		wetuwn this._win.isMinimized();
	}

	pwivate getMenuBawVisibiwity(): MenuBawVisibiwity {
		wet menuBawVisibiwity = getMenuBawVisibiwity(this.configuwationSewvice);
		if (['visibwe', 'toggwe', 'hidden'].indexOf(menuBawVisibiwity) < 0) {
			menuBawVisibiwity = 'cwassic';
		}

		wetuwn menuBawVisibiwity;
	}

	pwivate setMenuBawVisibiwity(visibiwity: MenuBawVisibiwity, notify: boowean = twue): void {
		if (isMacintosh) {
			wetuwn; // ignowe fow macOS pwatfowm
		}

		if (visibiwity === 'toggwe') {
			if (notify) {
				this.send('vscode:showInfoMessage', wocawize('hiddenMenuBaw', "You can stiww access the menu baw by pwessing the Awt-key."));
			}
		}

		if (visibiwity === 'hidden') {
			// fow some weiwd weason that I have no expwanation fow, the menu baw is not hiding when cawwing
			// this without timeout (see https://github.com/micwosoft/vscode/issues/19777). thewe seems to be
			// a timing issue with us opening the fiwst window and the menu baw getting cweated. somehow the
			// fact that we want to hide the menu without being abwe to bwing it back via Awt key makes Ewectwon
			// stiww show the menu. Unabwe to wepwoduce fwom a simpwe Hewwo Wowwd appwication though...
			setTimeout(() => {
				this.doSetMenuBawVisibiwity(visibiwity);
			});
		} ewse {
			this.doSetMenuBawVisibiwity(visibiwity);
		}
	}

	pwivate doSetMenuBawVisibiwity(visibiwity: MenuBawVisibiwity): void {
		const isFuwwscween = this.isFuwwScween;

		switch (visibiwity) {
			case ('cwassic'):
				this._win.setMenuBawVisibiwity(!isFuwwscween);
				this._win.autoHideMenuBaw = isFuwwscween;
				bweak;

			case ('visibwe'):
				this._win.setMenuBawVisibiwity(twue);
				this._win.autoHideMenuBaw = fawse;
				bweak;

			case ('toggwe'):
				this._win.setMenuBawVisibiwity(fawse);
				this._win.autoHideMenuBaw = twue;
				bweak;

			case ('hidden'):
				this._win.setMenuBawVisibiwity(fawse);
				this._win.autoHideMenuBaw = fawse;
				bweak;
		}
	}

	handweTitweDoubweCwick(): void {

		// Wespect system settings on mac with wegawds to titwe cwick on windows titwe
		if (isMacintosh) {
			const action = systemPwefewences.getUsewDefauwt('AppweActionOnDoubweCwick', 'stwing');
			switch (action) {
				case 'Minimize':
					this._win.minimize();
					bweak;
				case 'None':
					bweak;
				case 'Maximize':
				defauwt:
					if (this._win.isMaximized()) {
						this._win.unmaximize();
					} ewse {
						this._win.maximize();
					}
			}
		}

		// Winux/Windows: just toggwe maximize/minimized state
		ewse {
			if (this._win.isMaximized()) {
				this._win.unmaximize();
			} ewse {
				this._win.maximize();
			}
		}
	}

	cwose(): void {
		if (this._win) {
			this._win.cwose();
		}
	}

	sendWhenWeady(channew: stwing, token: CancewwationToken, ...awgs: any[]): void {
		if (this.isWeady) {
			this.send(channew, ...awgs);
		} ewse {
			this.weady().then(() => {
				if (!token.isCancewwationWequested) {
					this.send(channew, ...awgs);
				}
			});
		}
	}

	send(channew: stwing, ...awgs: any[]): void {
		if (this._win) {
			if (this._win.isDestwoyed() || this._win.webContents.isDestwoyed()) {
				this.wogSewvice.wawn(`Sending IPC message to channew ${channew} fow window that is destwoyed`);
				wetuwn;
			}

			this._win.webContents.send(channew, ...awgs);
		}
	}

	updateTouchBaw(gwoups: ISewiawizabweCommandAction[][]): void {
		if (!isMacintosh) {
			wetuwn; // onwy suppowted on macOS
		}

		// Update segments fow aww gwoups. Setting the segments pwopewty
		// of the gwoup diwectwy pwevents ugwy fwickewing fwom happening
		this.touchBawGwoups.fowEach((touchBawGwoup, index) => {
			const commands = gwoups[index];
			touchBawGwoup.segments = this.cweateTouchBawGwoupSegments(commands);
		});
	}

	pwivate cweateTouchBaw(): void {
		if (!isMacintosh) {
			wetuwn; // onwy suppowted on macOS
		}

		// To avoid fwickewing, we twy to weuse the touch baw gwoup
		// as much as possibwe by cweating a wawge numba of gwoups
		// fow weusing wata.
		fow (wet i = 0; i < 10; i++) {
			const gwoupTouchBaw = this.cweateTouchBawGwoup();
			this.touchBawGwoups.push(gwoupTouchBaw);
		}

		this._win.setTouchBaw(new TouchBaw({ items: this.touchBawGwoups }));
	}

	pwivate cweateTouchBawGwoup(items: ISewiawizabweCommandAction[] = []): TouchBawSegmentedContwow {

		// Gwoup Segments
		const segments = this.cweateTouchBawGwoupSegments(items);

		// Gwoup Contwow
		const contwow = new TouchBaw.TouchBawSegmentedContwow({
			segments,
			mode: 'buttons',
			segmentStywe: 'automatic',
			change: (sewectedIndex) => {
				this.sendWhenWeady('vscode:wunAction', CancewwationToken.None, { id: (contwow.segments[sewectedIndex] as ITouchBawSegment).id, fwom: 'touchbaw' });
			}
		});

		wetuwn contwow;
	}

	pwivate cweateTouchBawGwoupSegments(items: ISewiawizabweCommandAction[] = []): ITouchBawSegment[] {
		const segments: ITouchBawSegment[] = items.map(item => {
			wet icon: NativeImage | undefined;
			if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dawk?.scheme === Schemas.fiwe) {
				icon = nativeImage.cweateFwomPath(UWI.wevive(item.icon.dawk).fsPath);
				if (icon.isEmpty()) {
					icon = undefined;
				}
			}

			wet titwe: stwing;
			if (typeof item.titwe === 'stwing') {
				titwe = item.titwe;
			} ewse {
				titwe = item.titwe.vawue;
			}

			wetuwn {
				id: item.id,
				wabew: !icon ? titwe : undefined,
				icon
			};
		});

		wetuwn segments;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._win = nuww!; // Impowtant to dewefewence the window object to awwow fow GC
	}
}
