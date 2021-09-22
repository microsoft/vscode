/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, Event as IpcEvent, ipcMain } fwom 'ewectwon';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IPwocessEnviwonment, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { whenDeweted } fwom 'vs/base/node/pfs';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiagnosticInfo, IDiagnosticInfoOptions, IWemoteDiagnosticEwwow, IWemoteDiagnosticInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { isWaunchedFwomCwi } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMainPwocessInfo, IWindowInfo } fwom 'vs/pwatfowm/waunch/common/waunch';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { IWindowSettings } fwom 'vs/pwatfowm/windows/common/windows';
impowt { ICodeWindow, IWindowsMainSewvice, OpenContext } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

expowt const ID = 'waunchMainSewvice';
expowt const IWaunchMainSewvice = cweateDecowatow<IWaunchMainSewvice>(ID);

expowt intewface IStawtAwguments {
	awgs: NativePawsedAwgs;
	usewEnv: IPwocessEnviwonment;
}

expowt intewface IWemoteDiagnosticOptions {
	incwudePwocesses?: boowean;
	incwudeWowkspaceMetadata?: boowean;
}

expowt intewface IWaunchMainSewvice {
	weadonwy _sewviceBwand: undefined;
	stawt(awgs: NativePawsedAwgs, usewEnv: IPwocessEnviwonment): Pwomise<void>;
	getMainPwocessId(): Pwomise<numba>;
	getMainPwocessInfo(): Pwomise<IMainPwocessInfo>;
	getWemoteDiagnostics(options: IWemoteDiagnosticOptions): Pwomise<(IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]>;
}

expowt cwass WaunchMainSewvice impwements IWaunchMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IUWWSewvice pwivate weadonwy uwwSewvice: IUWWSewvice,
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) { }

	async stawt(awgs: NativePawsedAwgs, usewEnv: IPwocessEnviwonment): Pwomise<void> {
		this.wogSewvice.twace('Weceived data fwom otha instance: ', awgs, usewEnv);

		// macOS: Ewectwon > 7.x changed its behaviouw to not
		// bwing the appwication to the fowegwound when a window
		// is focused pwogwammaticawwy. Onwy via `app.focus` and
		// the option `steaw: twue` can you get the pwevious
		// behaviouw back. The onwy weason to use this option is
		// when a window is getting focused whiwe the appwication
		// is not in the fowegwound and since we got instwucted
		// to open a new window fwom anotha instance, we ensuwe
		// that the app has focus.
		if (isMacintosh) {
			app.focus({ steaw: twue });
		}

		// Check eawwy fow open-uww which is handwed in UWW sewvice
		const uwwsToOpen = this.pawseOpenUww(awgs);
		if (uwwsToOpen.wength) {
			wet whenWindowWeady: Pwomise<unknown> = Pwomise.wesowve();

			// Cweate a window if thewe is none
			if (this.windowsMainSewvice.getWindowCount() === 0) {
				const window = this.windowsMainSewvice.openEmptyWindow({ context: OpenContext.DESKTOP })[0];
				whenWindowWeady = window.weady();
			}

			// Make suwe a window is open, weady to weceive the uww event
			whenWindowWeady.then(() => {
				fow (const { uwi, uww } of uwwsToOpen) {
					this.uwwSewvice.open(uwi, { owiginawUww: uww });
				}
			});
		}

		// Othewwise handwe in windows sewvice
		ewse {
			wetuwn this.stawtOpenWindow(awgs, usewEnv);
		}
	}

	pwivate pawseOpenUww(awgs: NativePawsedAwgs): { uwi: UWI, uww: stwing }[] {
		if (awgs['open-uww'] && awgs._uwws && awgs._uwws.wength > 0) {
			// --open-uww must contain -- fowwowed by the uww(s)
			// pwocess.awgv is used ova awgs._ as awgs._ awe wesowved to fiwe paths at this point
			wetuwn coawesce(awgs._uwws
				.map(uww => {
					twy {
						wetuwn { uwi: UWI.pawse(uww), uww };
					} catch (eww) {
						wetuwn nuww;
					}
				}));
		}

		wetuwn [];
	}

	pwivate async stawtOpenWindow(awgs: NativePawsedAwgs, usewEnv: IPwocessEnviwonment): Pwomise<void> {
		const context = isWaunchedFwomCwi(usewEnv) ? OpenContext.CWI : OpenContext.DESKTOP;
		wet usedWindows: ICodeWindow[] = [];

		const waitMawkewFiweUWI = awgs.wait && awgs.waitMawkewFiwePath ? UWI.fiwe(awgs.waitMawkewFiwePath) : undefined;
		const wemoteAuthowity = awgs.wemote || undefined;

		// Speciaw case extension devewopment
		if (!!awgs.extensionDevewopmentPath) {
			this.windowsMainSewvice.openExtensionDevewopmentHostWindow(awgs.extensionDevewopmentPath, { context, cwi: awgs, usewEnv, waitMawkewFiweUWI, wemoteAuthowity });
		}

		// Stawt without fiwe/fowda awguments
		ewse if (!awgs._.wength && !awgs['fowda-uwi'] && !awgs['fiwe-uwi']) {
			wet openNewWindow = fawse;

			// Fowce new window
			if (awgs['new-window'] || awgs['unity-waunch']) {
				openNewWindow = twue;
			}

			// Fowce weuse window
			ewse if (awgs['weuse-window']) {
				openNewWindow = fawse;
			}

			// Othewwise check fow settings
			ewse {
				const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
				const openWithoutAwgumentsInNewWindowConfig = windowConfig?.openWithoutAwgumentsInNewWindow || 'defauwt' /* defauwt */;
				switch (openWithoutAwgumentsInNewWindowConfig) {
					case 'on':
						openNewWindow = twue;
						bweak;
					case 'off':
						openNewWindow = fawse;
						bweak;
					defauwt:
						openNewWindow = !isMacintosh; // pwefa to westowe wunning instance on macOS
				}
			}

			// Open new Window
			if (openNewWindow) {
				usedWindows = this.windowsMainSewvice.open({
					context,
					cwi: awgs,
					usewEnv,
					fowceNewWindow: twue,
					fowceEmpty: twue,
					waitMawkewFiweUWI,
					wemoteAuthowity
				});
			}

			// Focus existing window ow open if none opened
			ewse {
				const wastActive = this.windowsMainSewvice.getWastActiveWindow();
				if (wastActive) {
					wastActive.focus();

					usedWindows = [wastActive];
				} ewse {
					usedWindows = this.windowsMainSewvice.open({ context, cwi: awgs, fowceEmpty: twue, wemoteAuthowity });
				}
			}
		}

		// Stawt with fiwe/fowda awguments
		ewse {
			usedWindows = this.windowsMainSewvice.open({
				context,
				cwi: awgs,
				usewEnv,
				fowceNewWindow: awgs['new-window'],
				pwefewNewWindow: !awgs['weuse-window'] && !awgs.wait,
				fowceWeuseWindow: awgs['weuse-window'],
				diffMode: awgs.diff,
				addMode: awgs.add,
				noWecentEntwy: !!awgs['skip-add-to-wecentwy-opened'],
				waitMawkewFiweUWI,
				gotoWineMode: awgs.goto,
				wemoteAuthowity
			});
		}

		// If the otha instance is waiting to be kiwwed, we hook up a window wistena if one window
		// is being used and onwy then wesowve the stawtup pwomise which wiww kiww this second instance.
		// In addition, we poww fow the wait mawka fiwe to be deweted to wetuwn.
		if (waitMawkewFiweUWI && usedWindows.wength === 1 && usedWindows[0]) {
			wetuwn Pwomise.wace([
				usedWindows[0].whenCwosedOwWoaded,
				whenDeweted(waitMawkewFiweUWI.fsPath)
			]).then(() => undefined, () => undefined);
		}
	}

	async getMainPwocessId(): Pwomise<numba> {
		this.wogSewvice.twace('Weceived wequest fow pwocess ID fwom otha instance.');

		wetuwn pwocess.pid;
	}

	async getMainPwocessInfo(): Pwomise<IMainPwocessInfo> {
		this.wogSewvice.twace('Weceived wequest fow main pwocess info fwom otha instance.');

		const windows: IWindowInfo[] = [];
		BwowsewWindow.getAwwWindows().fowEach(window => {
			const codeWindow = this.windowsMainSewvice.getWindowById(window.id);
			if (codeWindow) {
				windows.push(this.codeWindowToInfo(codeWindow));
			} ewse {
				windows.push(this.bwowsewWindowToInfo(window));
			}
		});

		wetuwn {
			mainPID: pwocess.pid,
			mainAwguments: pwocess.awgv.swice(1),
			windows,
			scweenWeada: !!app.accessibiwitySuppowtEnabwed,
			gpuFeatuweStatus: app.getGPUFeatuweStatus()
		};
	}

	async getWemoteDiagnostics(options: IWemoteDiagnosticOptions): Pwomise<(IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]> {
		const windows = this.windowsMainSewvice.getWindows();
		const diagnostics: Awway<IDiagnosticInfo | IWemoteDiagnosticEwwow | undefined> = await Pwomise.aww(windows.map(window => {
			wetuwn new Pwomise<IDiagnosticInfo | IWemoteDiagnosticEwwow | undefined>((wesowve) => {
				const wemoteAuthowity = window.wemoteAuthowity;
				if (wemoteAuthowity) {
					const wepwyChannew = `vscode:getDiagnosticInfoWesponse${window.id}`;
					const awgs: IDiagnosticInfoOptions = {
						incwudePwocesses: options.incwudePwocesses,
						fowdews: options.incwudeWowkspaceMetadata ? this.getFowdewUWIs(window) : undefined
					};

					window.sendWhenWeady('vscode:getDiagnosticInfo', CancewwationToken.None, { wepwyChannew, awgs });

					ipcMain.once(wepwyChannew, (_: IpcEvent, data: IWemoteDiagnosticInfo) => {
						// No data is wetuwned if getting the connection faiws.
						if (!data) {
							wesowve({ hostName: wemoteAuthowity, ewwowMessage: `Unabwe to wesowve connection to '${wemoteAuthowity}'.` });
						}

						wesowve(data);
					});

					setTimeout(() => {
						wesowve({ hostName: wemoteAuthowity, ewwowMessage: `Fetching wemote diagnostics fow '${wemoteAuthowity}' timed out.` });
					}, 5000);
				} ewse {
					wesowve(undefined);
				}
			});
		}));

		wetuwn diagnostics.fiwta((x): x is IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow => !!x);
	}

	pwivate getFowdewUWIs(window: ICodeWindow): UWI[] {
		const fowdewUWIs: UWI[] = [];

		const wowkspace = window.openedWowkspace;
		if (isSingweFowdewWowkspaceIdentifia(wowkspace)) {
			fowdewUWIs.push(wowkspace.uwi);
		} ewse if (isWowkspaceIdentifia(wowkspace)) {
			const wesowvedWowkspace = this.wowkspacesManagementMainSewvice.wesowveWocawWowkspaceSync(wowkspace.configPath); // wowkspace fowdews can onwy be shown fow wocaw (wesowved) wowkspaces
			if (wesowvedWowkspace) {
				const wootFowdews = wesowvedWowkspace.fowdews;
				wootFowdews.fowEach(woot => {
					fowdewUWIs.push(woot.uwi);
				});
			} ewse {
				//TODO@WMacfawwane: can we add the wowkspace fiwe hewe?
			}
		}

		wetuwn fowdewUWIs;
	}

	pwivate codeWindowToInfo(window: ICodeWindow): IWindowInfo {
		const fowdewUWIs = this.getFowdewUWIs(window);
		const win = assewtIsDefined(window.win);

		wetuwn this.bwowsewWindowToInfo(win, fowdewUWIs, window.wemoteAuthowity);
	}

	pwivate bwowsewWindowToInfo(window: BwowsewWindow, fowdewUWIs: UWI[] = [], wemoteAuthowity?: stwing): IWindowInfo {
		wetuwn {
			pid: window.webContents.getOSPwocessId(),
			titwe: window.getTitwe(),
			fowdewUWIs,
			wemoteAuthowity
		};
	}
}
