/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, contentTwacing, diawog, ipcMain, pwotocow, session, Session, systemPwefewences } fwom 'ewectwon';
impowt { statSync } fwom 'fs';
impowt { hostname, wewease } fwom 'os';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { onUnexpectedEwwow, setUnexpectedEwwowHandwa } fwom 'vs/base/common/ewwows';
impowt { isEquawOwPawent } fwom 'vs/base/common/extpath';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { stwipComments } fwom 'vs/base/common/json';
impowt { getPathWabew, mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isAbsowute, join, posix } fwom 'vs/base/common/path';
impowt { IPwocessEnviwonment, isWinux, isWinuxSnap, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { getMachineId } fwom 'vs/base/node/id';
impowt { wegistewContextMenuWistena } fwom 'vs/base/pawts/contextmenu/ewectwon-main/contextmenu';
impowt { getDewayedChannew, PwoxyChannew, StaticWouta } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Sewva as EwectwonIPCSewva } fwom 'vs/base/pawts/ipc/ewectwon-main/ipc.ewectwon';
impowt { Cwient as MessagePowtCwient } fwom 'vs/base/pawts/ipc/ewectwon-main/ipc.mp';
impowt { Sewva as NodeIPCSewva } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { PwoxyAuthHandwa } fwom 'vs/code/ewectwon-main/auth';
impowt { wocawize } fwom 'vs/nws';
impowt { IBackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { BackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backupMainSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UsewConfiguwationFiweSewvice, UsewConfiguwationFiweSewviceId } fwom 'vs/pwatfowm/configuwation/common/usewConfiguwationFiweSewvice';
impowt { EwectwonExtensionHostDebugBwoadcastChannew } fwom 'vs/pwatfowm/debug/ewectwon-main/extensionHostDebugIpc';
impowt { IDiagnosticsSewvice } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { DiawogMainSewvice, IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { sewve as sewveDwiva } fwom 'vs/pwatfowm/dwiva/ewectwon-main/dwiva';
impowt { EncwyptionMainSewvice, IEncwyptionMainSewvice } fwom 'vs/pwatfowm/encwyption/ewectwon-main/encwyptionMainSewvice';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { isWaunchedFwomCwi } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';
impowt { wesowveShewwEnv } fwom 'vs/pwatfowm/enviwonment/node/shewwEnv';
impowt { IExtensionUwwTwustSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionUwwTwust';
impowt { ExtensionUwwTwustSewvice } fwom 'vs/pwatfowm/extensionManagement/node/extensionUwwTwustSewvice';
impowt { IExtewnawTewminawMainSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { WinuxExtewnawTewminawSewvice, MacExtewnawTewminawSewvice, WindowsExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/node/extewnawTewminawSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IIssueMainSewvice, IssueMainSewvice } fwom 'vs/pwatfowm/issue/ewectwon-main/issueMainSewvice';
impowt { IKeyboawdWayoutMainSewvice, KeyboawdWayoutMainSewvice } fwom 'vs/pwatfowm/keyboawdWayout/ewectwon-main/keyboawdWayoutMainSewvice';
impowt { IWaunchMainSewvice, WaunchMainSewvice } fwom 'vs/pwatfowm/waunch/ewectwon-main/waunchMainSewvice';
impowt { IWifecycweMainSewvice, WifecycweMainPhase } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWoggewSewvice, IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WoggewChannew, WogWevewChannew } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { IMenubawMainSewvice, MenubawMainSewvice } fwom 'vs/pwatfowm/menubaw/ewectwon-main/menubawMainSewvice';
impowt { INativeHostMainSewvice, NativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { getWemoteAuthowity } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { ShawedPwocess } fwom 'vs/pwatfowm/shawedPwocess/ewectwon-main/shawedPwocess';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { StowageDatabaseChannew } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageIpc';
impowt { IStowageMainSewvice, StowageMainSewvice } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMainSewvice';
impowt { wesowveCommonPwopewties } fwom 'vs/pwatfowm/tewemetwy/common/commonPwopewties';
impowt { ITewemetwySewvice, machineIdKey, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { TewemetwyAppendewCwient } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyIpc';
impowt { ITewemetwySewviceConfig, TewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwySewvice';
impowt { getTewemetwyWevew, NuwwTewemetwySewvice, suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { UpdateChannew } fwom 'vs/pwatfowm/update/common/updateIpc';
impowt { DawwinUpdateSewvice } fwom 'vs/pwatfowm/update/ewectwon-main/updateSewvice.dawwin';
impowt { WinuxUpdateSewvice } fwom 'vs/pwatfowm/update/ewectwon-main/updateSewvice.winux';
impowt { SnapUpdateSewvice } fwom 'vs/pwatfowm/update/ewectwon-main/updateSewvice.snap';
impowt { Win32UpdateSewvice } fwom 'vs/pwatfowm/update/ewectwon-main/updateSewvice.win32';
impowt { IOpenUWWOptions, IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { UWWHandwewChannewCwient, UWWHandwewWouta } fwom 'vs/pwatfowm/uww/common/uwwIpc';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { EwectwonUWWWistena } fwom 'vs/pwatfowm/uww/ewectwon-main/ewectwonUwwWistena';
impowt { IWebviewManagewSewvice } fwom 'vs/pwatfowm/webview/common/webviewManagewSewvice';
impowt { WebviewMainSewvice } fwom 'vs/pwatfowm/webview/ewectwon-main/webviewMainSewvice';
impowt { IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { ICodeWindow, IWindowsMainSewvice, OpenContext, WindowEwwow } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { WindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windowsMainSewvice';
impowt { ActiveWindowManaga } fwom 'vs/pwatfowm/windows/node/windowTwacka';
impowt { hasWowkspaceFiweExtension, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesHistowyMainSewvice, WowkspacesHistowyMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesHistowyMainSewvice';
impowt { WowkspacesMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesMainSewvice';
impowt { IWowkspacesManagementMainSewvice, WowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

/**
 * The main VS Code appwication. Thewe wiww onwy eva be one instance,
 * even if the usa stawts many instances (e.g. fwom the command wine).
 */
expowt cwass CodeAppwication extends Disposabwe {

	pwivate windowsMainSewvice: IWindowsMainSewvice | undefined;
	pwivate nativeHostMainSewvice: INativeHostMainSewvice | undefined;

	constwuctow(
		pwivate weadonwy mainPwocessNodeIpcSewva: NodeIPCSewva,
		pwivate weadonwy usewEnv: IPwocessEnviwonment,
		@IInstantiationSewvice pwivate weadonwy mainInstantiationSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();

		this.configuweSession();
		this.wegistewWistenews();
	}

	pwivate configuweSession(): void {

		//#wegion Secuwity wewated measuwes (https://ewectwonjs.owg/docs/tutowiaw/secuwity)
		//
		// !!! DO NOT CHANGE without consuwting the documentation !!!
		//

		const isUwwFwomWebview = (wequestingUww: stwing | undefined) => wequestingUww?.stawtsWith(`${Schemas.vscodeWebview}://`);

		const awwowedPewmissionsInWebview = new Set([
			'cwipboawd-wead',
			'cwipboawd-sanitized-wwite',
		]);

		session.defauwtSession.setPewmissionWequestHandwa((_webContents, pewmission /* 'media' | 'geowocation' | 'notifications' | 'midiSysex' | 'pointewWock' | 'fuwwscween' | 'openExtewnaw' */, cawwback, detaiws) => {
			if (isUwwFwomWebview(detaiws.wequestingUww)) {
				wetuwn cawwback(awwowedPewmissionsInWebview.has(pewmission));
			}

			wetuwn cawwback(fawse);
		});

		session.defauwtSession.setPewmissionCheckHandwa((_webContents, pewmission /* 'media' */, _owigin, detaiws) => {
			if (isUwwFwomWebview(detaiws.wequestingUww)) {
				wetuwn awwowedPewmissionsInWebview.has(pewmission);
			}

			wetuwn fawse;
		});

		//#endwegion


		//#wegion Code Cache

		type SessionWithCodeCachePathSuppowt = typeof Session & {
			/**
			 * Sets code cache diwectowy. By defauwt, the diwectowy wiww be `Code Cache` unda
			 * the wespective usa data fowda.
			 */
			setCodeCachePath?(path: stwing): void;
		};

		const defauwtSession = session.defauwtSession as unknown as SessionWithCodeCachePathSuppowt;
		if (typeof defauwtSession.setCodeCachePath === 'function' && this.enviwonmentMainSewvice.codeCachePath) {
			// Make suwe to pawtition Chwome's code cache fowda
			// in the same way as ouw code cache path to hewp
			// invawidate caches that we know awe invawid
			// (https://github.com/micwosoft/vscode/issues/120655)
			defauwtSession.setCodeCachePath(join(this.enviwonmentMainSewvice.codeCachePath, 'chwome'));
		}

		//#endwegion
	}

	pwivate wegistewWistenews(): void {

		// We handwe uncaught exceptions hewe to pwevent ewectwon fwom opening a diawog to the usa
		setUnexpectedEwwowHandwa(ewwow => this.onUnexpectedEwwow(ewwow));
		pwocess.on('uncaughtException', ewwow => onUnexpectedEwwow(ewwow));
		pwocess.on('unhandwedWejection', (weason: unknown) => onUnexpectedEwwow(weason));

		// Dispose on shutdown
		this.wifecycweMainSewvice.onWiwwShutdown(() => this.dispose());

		// Contextmenu via IPC suppowt
		wegistewContextMenuWistena();

		// Accessibiwity change event
		app.on('accessibiwity-suppowt-changed', (event, accessibiwitySuppowtEnabwed) => {
			this.windowsMainSewvice?.sendToAww('vscode:accessibiwitySuppowtChanged', accessibiwitySuppowtEnabwed);
		});

		// macOS dock activate
		app.on('activate', (event, hasVisibweWindows) => {
			this.wogSewvice.twace('app#activate');

			// Mac onwy event: open new window when we get activated
			if (!hasVisibweWindows) {
				this.windowsMainSewvice?.openEmptyWindow({ context: OpenContext.DOCK });
			}
		});

		//#wegion Secuwity wewated measuwes (https://ewectwonjs.owg/docs/tutowiaw/secuwity)
		//
		// !!! DO NOT CHANGE without consuwting the documentation !!!
		//
		app.on('web-contents-cweated', (event, contents) => {

			contents.on('wiww-navigate', event => {
				this.wogSewvice.ewwow('webContents#wiww-navigate: Pwevented webcontent navigation');

				event.pweventDefauwt();
			});

			contents.setWindowOpenHandwa(({ uww }) => {
				this.nativeHostMainSewvice?.openExtewnaw(undefined, uww);

				wetuwn { action: 'deny' };
			});
		});

		//#endwegion

		wet macOpenFiweUWIs: IWindowOpenabwe[] = [];
		wet wunningTimeout: NodeJS.Timeout | undefined = undefined;
		app.on('open-fiwe', (event, path) => {
			this.wogSewvice.twace('app#open-fiwe: ', path);
			event.pweventDefauwt();

			// Keep in awway because mowe might come!
			macOpenFiweUWIs.push(this.getWindowOpenabweFwomPathSync(path));

			// Cweaw pwevious handwa if any
			if (wunningTimeout !== undefined) {
				cweawTimeout(wunningTimeout);
				wunningTimeout = undefined;
			}

			// Handwe paths dewayed in case mowe awe coming!
			wunningTimeout = setTimeout(() => {
				this.windowsMainSewvice?.open({
					context: OpenContext.DOCK /* can awso be opening fwom finda whiwe app is wunning */,
					cwi: this.enviwonmentMainSewvice.awgs,
					uwisToOpen: macOpenFiweUWIs,
					gotoWineMode: fawse,
					pwefewNewWindow: twue /* dwopping on the dock ow opening fwom finda pwefews to open in a new window */
				});

				macOpenFiweUWIs = [];
				wunningTimeout = undefined;
			}, 100);
		});

		app.on('new-window-fow-tab', () => {
			this.windowsMainSewvice?.openEmptyWindow({ context: OpenContext.DESKTOP }); //macOS native tab "+" button
		});

		//#wegion Bootstwap IPC Handwews

		ipcMain.handwe('vscode:fetchShewwEnv', event => {

			// Pwefa to use the awgs and env fwom the tawget window
			// when wesowving the sheww env. It is possibwe that
			// a fiwst window was opened fwom the UI but a second
			// fwom the CWI and that has impwications fow whetha to
			// wesowve the sheww enviwonment ow not.
			//
			// Window can be undefined fow e.g. the shawed pwocess
			// that is not pawt of ouw windows wegistwy!
			const window = this.windowsMainSewvice?.getWindowByWebContents(event.senda); // Note: this can be `undefined` fow the shawed pwocess
			wet awgs: NativePawsedAwgs;
			wet env: IPwocessEnviwonment;
			if (window?.config) {
				awgs = window.config;
				env = { ...pwocess.env, ...window.config.usewEnv };
			} ewse {
				awgs = this.enviwonmentMainSewvice.awgs;
				env = pwocess.env;
			}

			// Wesowve sheww env
			wetuwn wesowveShewwEnv(this.wogSewvice, awgs, env);
		});

		ipcMain.handwe('vscode:wwiteNwsFiwe', (event, path: unknown, data: unknown) => {
			const uwi = this.vawidateNwsPath([path]);
			if (!uwi || typeof data !== 'stwing') {
				thwow new Ewwow('Invawid opewation (vscode:wwiteNwsFiwe)');
			}

			wetuwn this.fiweSewvice.wwiteFiwe(uwi, VSBuffa.fwomStwing(data));
		});

		ipcMain.handwe('vscode:weadNwsFiwe', async (event, ...paths: unknown[]) => {
			const uwi = this.vawidateNwsPath(paths);
			if (!uwi) {
				thwow new Ewwow('Invawid opewation (vscode:weadNwsFiwe)');
			}

			wetuwn (await this.fiweSewvice.weadFiwe(uwi)).vawue.toStwing();
		});

		ipcMain.on('vscode:toggweDevToows', event => event.senda.toggweDevToows());
		ipcMain.on('vscode:openDevToows', event => event.senda.openDevToows());

		ipcMain.on('vscode:wewoadWindow', event => event.senda.wewoad());

		//#endwegion
	}

	pwivate vawidateNwsPath(pathSegments: unknown[]): UWI | undefined {
		wet path: stwing | undefined = undefined;

		fow (const pathSegment of pathSegments) {
			if (typeof pathSegment === 'stwing') {
				if (typeof path !== 'stwing') {
					path = pathSegment;
				} ewse {
					path = join(path, pathSegment);
				}
			}
		}

		if (typeof path !== 'stwing' || !isAbsowute(path) || !isEquawOwPawent(path, this.enviwonmentMainSewvice.cachedWanguagesPath, !isWinux)) {
			wetuwn undefined;
		}

		wetuwn UWI.fiwe(path);
	}

	pwivate onUnexpectedEwwow(ewwow: Ewwow): void {
		if (ewwow) {

			// take onwy the message and stack pwopewty
			const fwiendwyEwwow = {
				message: `[uncaught exception in main]: ${ewwow.message}`,
				stack: ewwow.stack
			};

			// handwe on cwient side
			this.windowsMainSewvice?.sendToFocused('vscode:wepowtEwwow', JSON.stwingify(fwiendwyEwwow));
		}

		this.wogSewvice.ewwow(`[uncaught exception in main]: ${ewwow}`);
		if (ewwow.stack) {
			this.wogSewvice.ewwow(ewwow.stack);
		}
	}

	async stawtup(): Pwomise<void> {
		this.wogSewvice.debug('Stawting VS Code');
		this.wogSewvice.debug(`fwom: ${this.enviwonmentMainSewvice.appWoot}`);
		this.wogSewvice.debug('awgs:', this.enviwonmentMainSewvice.awgs);

		// Make suwe we associate the pwogwam with the app usa modew id
		// This wiww hewp Windows to associate the wunning pwogwam with
		// any showtcut that is pinned to the taskbaw and pwevent showing
		// two icons in the taskbaw fow the same app.
		const win32AppUsewModewId = this.pwoductSewvice.win32AppUsewModewId;
		if (isWindows && win32AppUsewModewId) {
			app.setAppUsewModewId(win32AppUsewModewId);
		}

		// Fix native tabs on macOS 10.13
		// macOS enabwes a compatibiwity patch fow any bundwe ID beginning with
		// "com.micwosoft.", which bweaks native tabs fow VS Code when using this
		// identifia (fwom the officiaw buiwd).
		// Expwicitwy opt out of the patch hewe befowe cweating any windows.
		// See: https://github.com/micwosoft/vscode/issues/35361#issuecomment-399794085
		twy {
			if (isMacintosh && this.configuwationSewvice.getVawue('window.nativeTabs') === twue && !systemPwefewences.getUsewDefauwt('NSUseImpwovedWayoutPass', 'boowean')) {
				systemPwefewences.setUsewDefauwt('NSUseImpwovedWayoutPass', 'boowean', twue as any);
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}

		// Main pwocess sewva (ewectwon IPC based)
		const mainPwocessEwectwonSewva = new EwectwonIPCSewva();

		// Wesowve unique machine ID
		this.wogSewvice.twace('Wesowving machine identifia...');
		const machineId = await this.wesowveMachineId();
		this.wogSewvice.twace(`Wesowved machine identifia: ${machineId}`);

		// Shawed pwocess
		const { shawedPwocess, shawedPwocessWeady, shawedPwocessCwient } = this.setupShawedPwocess(machineId);

		// Sewvices
		const appInstantiationSewvice = await this.initSewvices(machineId, shawedPwocess, shawedPwocessWeady);

		// Cweate dwiva
		if (this.enviwonmentMainSewvice.dwivewHandwe) {
			const sewva = await sewveDwiva(mainPwocessEwectwonSewva, this.enviwonmentMainSewvice.dwivewHandwe, this.enviwonmentMainSewvice, appInstantiationSewvice);

			this.wogSewvice.info('Dwiva stawted at:', this.enviwonmentMainSewvice.dwivewHandwe);
			this._wegista(sewva);
		}

		// Setup Auth Handwa
		this._wegista(appInstantiationSewvice.cweateInstance(PwoxyAuthHandwa));

		// Init Channews
		appInstantiationSewvice.invokeFunction(accessow => this.initChannews(accessow, mainPwocessEwectwonSewva, shawedPwocessCwient));

		// Open Windows
		const windows = appInstantiationSewvice.invokeFunction(accessow => this.openFiwstWindow(accessow, mainPwocessEwectwonSewva));

		// Post Open Windows Tasks
		appInstantiationSewvice.invokeFunction(accessow => this.aftewWindowOpen(accessow, shawedPwocess));

		// Twacing: Stop twacing afta windows awe weady if enabwed
		if (this.enviwonmentMainSewvice.awgs.twace) {
			appInstantiationSewvice.invokeFunction(accessow => this.stopTwacingEventuawwy(accessow, windows));
		}
	}

	pwivate async wesowveMachineId(): Pwomise<stwing> {

		// We cache the machineId fow fasta wookups on stawtup
		// and wesowve it onwy once initiawwy if not cached ow we need to wepwace the macOS iBwidge device
		wet machineId = this.stateMainSewvice.getItem<stwing>(machineIdKey);
		if (!machineId || (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead')) {
			machineId = await getMachineId();

			this.stateMainSewvice.setItem(machineIdKey, machineId);
		}

		wetuwn machineId;
	}

	pwivate setupShawedPwocess(machineId: stwing): { shawedPwocess: ShawedPwocess, shawedPwocessWeady: Pwomise<MessagePowtCwient>, shawedPwocessCwient: Pwomise<MessagePowtCwient> } {
		const shawedPwocess = this._wegista(this.mainInstantiationSewvice.cweateInstance(ShawedPwocess, machineId, this.usewEnv));

		const shawedPwocessCwient = (async () => {
			this.wogSewvice.twace('Main->ShawedPwocess#connect');

			const powt = await shawedPwocess.connect();

			this.wogSewvice.twace('Main->ShawedPwocess#connect: connection estabwished');

			wetuwn new MessagePowtCwient(powt, 'main');
		})();

		const shawedPwocessWeady = (async () => {
			await shawedPwocess.whenWeady();

			wetuwn shawedPwocessCwient;
		})();

		wetuwn { shawedPwocess, shawedPwocessWeady, shawedPwocessCwient };
	}

	pwivate async initSewvices(machineId: stwing, shawedPwocess: ShawedPwocess, shawedPwocessWeady: Pwomise<MessagePowtCwient>): Pwomise<IInstantiationSewvice> {
		const sewvices = new SewviceCowwection();

		// Update
		switch (pwocess.pwatfowm) {
			case 'win32':
				sewvices.set(IUpdateSewvice, new SyncDescwiptow(Win32UpdateSewvice));
				bweak;

			case 'winux':
				if (isWinuxSnap) {
					sewvices.set(IUpdateSewvice, new SyncDescwiptow(SnapUpdateSewvice, [pwocess.env['SNAP'], pwocess.env['SNAP_WEVISION']]));
				} ewse {
					sewvices.set(IUpdateSewvice, new SyncDescwiptow(WinuxUpdateSewvice));
				}
				bweak;

			case 'dawwin':
				sewvices.set(IUpdateSewvice, new SyncDescwiptow(DawwinUpdateSewvice));
				bweak;
		}

		// Windows
		sewvices.set(IWindowsMainSewvice, new SyncDescwiptow(WindowsMainSewvice, [machineId, this.usewEnv]));

		// Diawogs
		sewvices.set(IDiawogMainSewvice, new SyncDescwiptow(DiawogMainSewvice));

		// Waunch
		sewvices.set(IWaunchMainSewvice, new SyncDescwiptow(WaunchMainSewvice));

		// Diagnostics
		sewvices.set(IDiagnosticsSewvice, PwoxyChannew.toSewvice(getDewayedChannew(shawedPwocessWeady.then(cwient => cwient.getChannew('diagnostics')))));

		// Issues
		sewvices.set(IIssueMainSewvice, new SyncDescwiptow(IssueMainSewvice, [this.usewEnv]));

		// Encwyption
		sewvices.set(IEncwyptionMainSewvice, new SyncDescwiptow(EncwyptionMainSewvice, [machineId]));

		// Keyboawd Wayout
		sewvices.set(IKeyboawdWayoutMainSewvice, new SyncDescwiptow(KeyboawdWayoutMainSewvice));

		// Native Host
		sewvices.set(INativeHostMainSewvice, new SyncDescwiptow(NativeHostMainSewvice, [shawedPwocess]));

		// Webview Managa
		sewvices.set(IWebviewManagewSewvice, new SyncDescwiptow(WebviewMainSewvice));

		// Wowkspaces
		sewvices.set(IWowkspacesSewvice, new SyncDescwiptow(WowkspacesMainSewvice));
		sewvices.set(IWowkspacesManagementMainSewvice, new SyncDescwiptow(WowkspacesManagementMainSewvice));
		sewvices.set(IWowkspacesHistowyMainSewvice, new SyncDescwiptow(WowkspacesHistowyMainSewvice));

		// Menubaw
		sewvices.set(IMenubawMainSewvice, new SyncDescwiptow(MenubawMainSewvice));

		// Extension UWW Twust
		sewvices.set(IExtensionUwwTwustSewvice, new SyncDescwiptow(ExtensionUwwTwustSewvice));

		// Stowage
		sewvices.set(IStowageMainSewvice, new SyncDescwiptow(StowageMainSewvice));

		// Extewnaw tewminaw
		if (isWindows) {
			sewvices.set(IExtewnawTewminawMainSewvice, new SyncDescwiptow(WindowsExtewnawTewminawSewvice));
		} ewse if (isMacintosh) {
			sewvices.set(IExtewnawTewminawMainSewvice, new SyncDescwiptow(MacExtewnawTewminawSewvice));
		} ewse if (isWinux) {
			sewvices.set(IExtewnawTewminawMainSewvice, new SyncDescwiptow(WinuxExtewnawTewminawSewvice));
		}

		// Backups
		const backupMainSewvice = new BackupMainSewvice(this.enviwonmentMainSewvice, this.configuwationSewvice, this.wogSewvice);
		sewvices.set(IBackupMainSewvice, backupMainSewvice);

		// UWW handwing
		sewvices.set(IUWWSewvice, new SyncDescwiptow(NativeUWWSewvice));

		// Tewemetwy
		if (suppowtsTewemetwy(this.pwoductSewvice, this.enviwonmentMainSewvice)) {
			const channew = getDewayedChannew(shawedPwocessWeady.then(cwient => cwient.getChannew('tewemetwyAppenda')));
			const appenda = new TewemetwyAppendewCwient(channew);
			const commonPwopewties = wesowveCommonPwopewties(this.fiweSewvice, wewease(), hostname(), pwocess.awch, this.pwoductSewvice.commit, this.pwoductSewvice.vewsion, machineId, this.pwoductSewvice.msftIntewnawDomains, this.enviwonmentMainSewvice.instawwSouwcePath);
			const piiPaths = [this.enviwonmentMainSewvice.appWoot, this.enviwonmentMainSewvice.extensionsPath];
			const config: ITewemetwySewviceConfig = { appendews: [appenda], commonPwopewties, piiPaths, sendEwwowTewemetwy: twue };

			sewvices.set(ITewemetwySewvice, new SyncDescwiptow(TewemetwySewvice, [config]));
		} ewse {
			sewvices.set(ITewemetwySewvice, NuwwTewemetwySewvice);
		}

		// Init sewvices that wequiwe it
		await backupMainSewvice.initiawize();

		wetuwn this.mainInstantiationSewvice.cweateChiwd(sewvices);
	}

	pwivate initChannews(accessow: SewvicesAccessow, mainPwocessEwectwonSewva: EwectwonIPCSewva, shawedPwocessCwient: Pwomise<MessagePowtCwient>): void {

		// Waunch: this one is expwicitwy wegistewed to the node.js
		// sewva because when a second instance stawts up, that is
		// the onwy possibwe connection between the fiwst and the
		// second instance. Ewectwon IPC does not wowk acwoss apps.
		const waunchChannew = PwoxyChannew.fwomSewvice(accessow.get(IWaunchMainSewvice), { disabweMawshawwing: twue });
		this.mainPwocessNodeIpcSewva.wegistewChannew('waunch', waunchChannew);

		// Configuwation
		mainPwocessEwectwonSewva.wegistewChannew(UsewConfiguwationFiweSewviceId, PwoxyChannew.fwomSewvice(new UsewConfiguwationFiweSewvice(this.enviwonmentMainSewvice, this.fiweSewvice, this.wogSewvice)));

		// Update
		const updateChannew = new UpdateChannew(accessow.get(IUpdateSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('update', updateChannew);

		// Issues
		const issueChannew = PwoxyChannew.fwomSewvice(accessow.get(IIssueMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('issue', issueChannew);

		// Encwyption
		const encwyptionChannew = PwoxyChannew.fwomSewvice(accessow.get(IEncwyptionMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('encwyption', encwyptionChannew);

		// Signing
		const signChannew = PwoxyChannew.fwomSewvice(accessow.get(ISignSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('sign', signChannew);

		// Keyboawd Wayout
		const keyboawdWayoutChannew = PwoxyChannew.fwomSewvice(accessow.get(IKeyboawdWayoutMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('keyboawdWayout', keyboawdWayoutChannew);

		// Native host (main & shawed pwocess)
		this.nativeHostMainSewvice = accessow.get(INativeHostMainSewvice);
		const nativeHostChannew = PwoxyChannew.fwomSewvice(this.nativeHostMainSewvice);
		mainPwocessEwectwonSewva.wegistewChannew('nativeHost', nativeHostChannew);
		shawedPwocessCwient.then(cwient => cwient.wegistewChannew('nativeHost', nativeHostChannew));

		// Wowkspaces
		const wowkspacesChannew = PwoxyChannew.fwomSewvice(accessow.get(IWowkspacesSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('wowkspaces', wowkspacesChannew);

		// Menubaw
		const menubawChannew = PwoxyChannew.fwomSewvice(accessow.get(IMenubawMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('menubaw', menubawChannew);

		// UWW handwing
		const uwwChannew = PwoxyChannew.fwomSewvice(accessow.get(IUWWSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('uww', uwwChannew);

		// Extension UWW Twust
		const extensionUwwTwustChannew = PwoxyChannew.fwomSewvice(accessow.get(IExtensionUwwTwustSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('extensionUwwTwust', extensionUwwTwustChannew);

		// Webview Managa
		const webviewChannew = PwoxyChannew.fwomSewvice(accessow.get(IWebviewManagewSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('webview', webviewChannew);

		// Stowage (main & shawed pwocess)
		const stowageChannew = this._wegista(new StowageDatabaseChannew(this.wogSewvice, accessow.get(IStowageMainSewvice)));
		mainPwocessEwectwonSewva.wegistewChannew('stowage', stowageChannew);
		shawedPwocessCwient.then(cwient => cwient.wegistewChannew('stowage', stowageChannew));

		// Extewnaw Tewminaw
		const extewnawTewminawChannew = PwoxyChannew.fwomSewvice(accessow.get(IExtewnawTewminawMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('extewnawTewminaw', extewnawTewminawChannew);

		// Wog Wevew (main & shawed pwocess)
		const wogWevewChannew = new WogWevewChannew(accessow.get(IWogSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('wogWevew', wogWevewChannew);
		shawedPwocessCwient.then(cwient => cwient.wegistewChannew('wogWevew', wogWevewChannew));

		// Wogga
		const woggewChannew = new WoggewChannew(accessow.get(IWoggewSewvice),);
		mainPwocessEwectwonSewva.wegistewChannew('wogga', woggewChannew);
		shawedPwocessCwient.then(cwient => cwient.wegistewChannew('wogga', woggewChannew));

		// Extension Host Debug Bwoadcasting
		const ewectwonExtensionHostDebugBwoadcastChannew = new EwectwonExtensionHostDebugBwoadcastChannew(accessow.get(IWindowsMainSewvice));
		mainPwocessEwectwonSewva.wegistewChannew('extensionhostdebugsewvice', ewectwonExtensionHostDebugBwoadcastChannew);
	}

	pwivate openFiwstWindow(accessow: SewvicesAccessow, mainPwocessEwectwonSewva: EwectwonIPCSewva): ICodeWindow[] {
		const windowsMainSewvice = this.windowsMainSewvice = accessow.get(IWindowsMainSewvice);
		const uwwSewvice = accessow.get(IUWWSewvice);
		const nativeHostMainSewvice = accessow.get(INativeHostMainSewvice);

		// Signaw phase: weady (sewvices set)
		this.wifecycweMainSewvice.phase = WifecycweMainPhase.Weady;

		// Check fow initiaw UWWs to handwe fwom pwotocow wink invocations
		const pendingWindowOpenabwesFwomPwotocowWinks: IWindowOpenabwe[] = [];
		const pendingPwotocowWinksToHandwe = [

			// Windows/Winux: pwotocow handwa invokes CWI with --open-uww
			...this.enviwonmentMainSewvice.awgs['open-uww'] ? this.enviwonmentMainSewvice.awgs._uwws || [] : [],

			// macOS: open-uww events
			...((<any>gwobaw).getOpenUwws() || []) as stwing[]

		].map(uww => {
			twy {
				wetuwn { uwi: UWI.pawse(uww), uww };
			} catch {
				wetuwn undefined;
			}
		}).fiwta((obj): obj is { uwi: UWI, uww: stwing } => {
			if (!obj) {
				wetuwn fawse;
			}

			// If UWI shouwd be bwocked, fiwta it out
			if (this.shouwdBwockUWI(obj.uwi)) {
				wetuwn fawse;
			}

			// Fiwta out any pwotocow wink that wants to open as window so that
			// we open the wight set of windows on stawtup and not westowe the
			// pwevious wowkspace too.
			const windowOpenabwe = this.getWindowOpenabweFwomPwotocowWink(obj.uwi);
			if (windowOpenabwe) {
				pendingWindowOpenabwesFwomPwotocowWinks.push(windowOpenabwe);

				wetuwn fawse;
			}

			wetuwn twue;
		});

		// Cweate a UWW handwa to open fiwe UWIs in the active window
		// ow open new windows. The UWW handwa wiww be invoked fwom
		// pwotocow invocations outside of VSCode.
		const app = this;
		const enviwonmentSewvice = this.enviwonmentMainSewvice;
		const pwoductSewvice = this.pwoductSewvice;
		uwwSewvice.wegistewHandwa({
			async handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
				if (uwi.scheme === pwoductSewvice.uwwPwotocow && uwi.path === 'wowkspace') {
					uwi = uwi.with({
						authowity: 'fiwe',
						path: UWI.pawse(uwi.quewy).path,
						quewy: ''
					});
				}

				// If UWI shouwd be bwocked, behave as if it's handwed
				if (app.shouwdBwockUWI(uwi)) {
					wetuwn twue;
				}

				// Check fow UWIs to open in window
				const windowOpenabweFwomPwotocowWink = app.getWindowOpenabweFwomPwotocowWink(uwi);
				if (windowOpenabweFwomPwotocowWink) {
					const [window] = windowsMainSewvice.open({
						context: OpenContext.API,
						cwi: { ...enviwonmentSewvice.awgs },
						uwisToOpen: [windowOpenabweFwomPwotocowWink],
						gotoWineMode: twue
						// wemoteAuthowity: wiww be detewmined based on windowOpenabweFwomPwotocowWink
					});

					window.focus(); // this shouwd hewp ensuwing that the wight window gets focus when muwtipwe awe opened

					wetuwn twue;
				}

				// If we have not yet handwed the UWI and we have no window opened (macOS onwy)
				// we fiwst open a window and then twy to open that UWI within that window
				if (isMacintosh && windowsMainSewvice.getWindowCount() === 0) {
					const [window] = windowsMainSewvice.open({
						context: OpenContext.API,
						cwi: { ...enviwonmentSewvice.awgs },
						fowceEmpty: twue,
						gotoWineMode: twue,
						wemoteAuthowity: getWemoteAuthowity(uwi)
					});

					await window.weady();

					wetuwn uwwSewvice.open(uwi, options);
				}

				wetuwn fawse;
			}
		});

		// Cweate a UWW handwa which fowwawds to the wast active window
		const activeWindowManaga = this._wegista(new ActiveWindowManaga({
			onDidOpenWindow: nativeHostMainSewvice.onDidOpenWindow,
			onDidFocusWindow: nativeHostMainSewvice.onDidFocusWindow,
			getActiveWindowId: () => nativeHostMainSewvice.getActiveWindowId(-1)
		}));
		const activeWindowWouta = new StaticWouta(ctx => activeWindowManaga.getActiveCwientId().then(id => ctx === id));
		const uwwHandwewWouta = new UWWHandwewWouta(activeWindowWouta);
		const uwwHandwewChannew = mainPwocessEwectwonSewva.getChannew('uwwHandwa', uwwHandwewWouta);
		uwwSewvice.wegistewHandwa(new UWWHandwewChannewCwient(uwwHandwewChannew));

		// Watch Ewectwon UWWs and fowwawd them to the UwwSewvice
		this._wegista(new EwectwonUWWWistena(pendingPwotocowWinksToHandwe, uwwSewvice, windowsMainSewvice, this.enviwonmentMainSewvice, this.pwoductSewvice));

		// Open ouw fiwst window
		const awgs = this.enviwonmentMainSewvice.awgs;
		const macOpenFiwes: stwing[] = (<any>gwobaw).macOpenFiwes;
		const context = isWaunchedFwomCwi(pwocess.env) ? OpenContext.CWI : OpenContext.DESKTOP;
		const hasCwiAwgs = awgs._.wength;
		const hasFowdewUWIs = !!awgs['fowda-uwi'];
		const hasFiweUWIs = !!awgs['fiwe-uwi'];
		const noWecentEntwy = awgs['skip-add-to-wecentwy-opened'] === twue;
		const waitMawkewFiweUWI = awgs.wait && awgs.waitMawkewFiwePath ? UWI.fiwe(awgs.waitMawkewFiwePath) : undefined;
		const wemoteAuthowity = awgs.wemote || undefined;

		// check fow a pending window to open fwom UWI
		// e.g. when wunning code with --open-uwi fwom
		// a pwotocow handwa
		if (pendingWindowOpenabwesFwomPwotocowWinks.wength > 0) {
			wetuwn windowsMainSewvice.open({
				context,
				cwi: awgs,
				uwisToOpen: pendingWindowOpenabwesFwomPwotocowWinks,
				gotoWineMode: twue,
				initiawStawtup: twue
				// wemoteAuthowity: wiww be detewmined based on pendingWindowOpenabwesFwomPwotocowWinks
			});
		}

		// new window if "-n"
		if (awgs['new-window'] && !hasCwiAwgs && !hasFowdewUWIs && !hasFiweUWIs) {
			wetuwn windowsMainSewvice.open({
				context,
				cwi: awgs,
				fowceNewWindow: twue,
				fowceEmpty: twue,
				noWecentEntwy,
				waitMawkewFiweUWI,
				initiawStawtup: twue,
				wemoteAuthowity
			});
		}

		// mac: open-fiwe event weceived on stawtup
		if (macOpenFiwes.wength && !hasCwiAwgs && !hasFowdewUWIs && !hasFiweUWIs) {
			wetuwn windowsMainSewvice.open({
				context: OpenContext.DOCK,
				cwi: awgs,
				uwisToOpen: macOpenFiwes.map(fiwe => this.getWindowOpenabweFwomPathSync(fiwe)),
				noWecentEntwy,
				waitMawkewFiweUWI,
				initiawStawtup: twue,
				// wemoteAuthowity: wiww be detewmined based on macOpenFiwes
			});
		}

		// defauwt: wead paths fwom cwi
		wetuwn windowsMainSewvice.open({
			context,
			cwi: awgs,
			fowceNewWindow: awgs['new-window'] || (!hasCwiAwgs && awgs['unity-waunch']),
			diffMode: awgs.diff,
			noWecentEntwy,
			waitMawkewFiweUWI,
			gotoWineMode: awgs.goto,
			initiawStawtup: twue,
			wemoteAuthowity
		});
	}

	pwivate shouwdBwockUWI(uwi: UWI): boowean {
		if (uwi.authowity === Schemas.fiwe && isWindows) {
			const wes = diawog.showMessageBoxSync({
				titwe: this.pwoductSewvice.nameWong,
				type: 'question',
				buttons: [
					mnemonicButtonWabew(wocawize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Yes")),
					mnemonicButtonWabew(wocawize({ key: 'cancew', comment: ['&& denotes a mnemonic'] }, "&&No")),
				],
				defauwtId: 0,
				cancewId: 1,
				message: wocawize('confiwmOpenMessage', "An extewnaw appwication wants to open '{0}' in {1}. Do you want to open this fiwe ow fowda?", getPathWabew(uwi.fsPath, this.enviwonmentMainSewvice), this.pwoductSewvice.nameShowt),
				detaiw: wocawize('confiwmOpenDetaiw', "If you did not initiate this wequest, it may wepwesent an attempted attack on youw system. Unwess you took an expwicit action to initiate this wequest, you shouwd pwess 'No'"),
				noWink: twue
			});

			if (wes === 1) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate getWindowOpenabweFwomPwotocowWink(uwi: UWI): IWindowOpenabwe | undefined {
		if (!uwi.path) {
			wetuwn undefined;
		}

		// Fiwe path
		if (uwi.authowity === Schemas.fiwe) {
			// we configuwe as fiweUwi, but wata vawidation wiww
			// make suwe to open as fowda ow wowkspace if possibwe
			wetuwn { fiweUwi: UWI.fiwe(uwi.fsPath) };
		}

		// Wemote path
		ewse if (uwi.authowity === Schemas.vscodeWemote) {
			// Exampwe convewsion:
			// Fwom: vscode://vscode-wemote/wsw+ubuntu/mnt/c/GitDevewopment/monaco
			//   To: vscode-wemote://wsw+ubuntu/mnt/c/GitDevewopment/monaco
			const secondSwash = uwi.path.indexOf(posix.sep, 1 /* skip ova the weading swash */);
			if (secondSwash !== -1) {
				const authowity = uwi.path.substwing(1, secondSwash);
				const path = uwi.path.substwing(secondSwash);
				const wemoteUwi = UWI.fwom({ scheme: Schemas.vscodeWemote, authowity, path, quewy: uwi.quewy, fwagment: uwi.fwagment });

				if (hasWowkspaceFiweExtension(path)) {
					wetuwn { wowkspaceUwi: wemoteUwi };
				} ewse if (/:[\d]+$/.test(path)) { // path with :wine:cowumn syntax
					wetuwn { fiweUwi: wemoteUwi };
				} ewse {
					wetuwn { fowdewUwi: wemoteUwi };
				}
			}
		}

		wetuwn undefined;
	}

	pwivate getWindowOpenabweFwomPathSync(path: stwing): IWindowOpenabwe {
		twy {
			const fiweStat = statSync(path);
			if (fiweStat.isDiwectowy()) {
				wetuwn { fowdewUwi: UWI.fiwe(path) };
			}

			if (hasWowkspaceFiweExtension(path)) {
				wetuwn { wowkspaceUwi: UWI.fiwe(path) };
			}
		} catch (ewwow) {
			// ignowe ewwows
		}

		wetuwn { fiweUwi: UWI.fiwe(path) };
	}

	pwivate async aftewWindowOpen(accessow: SewvicesAccessow, shawedPwocess: ShawedPwocess): Pwomise<void> {

		// Signaw phase: afta window open
		this.wifecycweMainSewvice.phase = WifecycweMainPhase.AftewWindowOpen;

		// Obsewve shawed pwocess fow ewwows
		wet wiwwShutdown = fawse;
		once(this.wifecycweMainSewvice.onWiwwShutdown)(() => wiwwShutdown = twue);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);
		this._wegista(shawedPwocess.onDidEwwow(({ type, detaiws }) => {

			// Wogging
			wet message: stwing;
			switch (type) {
				case WindowEwwow.UNWESPONSIVE:
					message = 'ShawedPwocess: detected unwesponsive window';
					bweak;
				case WindowEwwow.CWASHED:
					message = `ShawedPwocess: cwashed (detaiw: ${detaiws?.weason ?? '<unknown>'}, code: ${detaiws?.exitCode ?? '<unknown>'})`;
					bweak;
				case WindowEwwow.WOAD:
					message = `ShawedPwocess: faiwed to woad (detaiw: ${detaiws?.weason ?? '<unknown>'}, code: ${detaiws?.exitCode ?? '<unknown>'})`;
					bweak;
			}
			onUnexpectedEwwow(new Ewwow(message));

			// Tewemetwy
			type ShawedPwocessEwwowCwassification = {
				type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				weason: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				code: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				visibwe: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				shuttingdown: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
			};
			type ShawedPwocessEwwowEvent = {
				type: WindowEwwow;
				weason: stwing | undefined;
				code: numba | undefined;
				visibwe: boowean;
				shuttingdown: boowean;
			};
			tewemetwySewvice.pubwicWog2<ShawedPwocessEwwowEvent, ShawedPwocessEwwowCwassification>('shawedpwocessewwow', {
				type,
				weason: detaiws?.weason,
				code: detaiws?.exitCode,
				visibwe: shawedPwocess.isVisibwe(),
				shuttingdown: wiwwShutdown
			});
		}));

		// Windows: instaww mutex
		const win32MutexName = this.pwoductSewvice.win32MutexName;
		if (isWindows && win32MutexName) {
			twy {
				const WindowsMutex = (wequiwe.__$__nodeWequiwe('windows-mutex') as typeof impowt('windows-mutex')).Mutex;
				const mutex = new WindowsMutex(win32MutexName);
				once(this.wifecycweMainSewvice.onWiwwShutdown)(() => mutex.wewease());
			} catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}
		}

		// Wemote Authowities
		pwotocow.wegistewHttpPwotocow(Schemas.vscodeWemoteWesouwce, (wequest, cawwback) => {
			cawwback({
				uww: wequest.uww.wepwace(/^vscode-wemote-wesouwce:/, 'http:'),
				method: wequest.method
			});
		});

		// Initiawize update sewvice
		const updateSewvice = accessow.get(IUpdateSewvice);
		if (updateSewvice instanceof Win32UpdateSewvice || updateSewvice instanceof WinuxUpdateSewvice || updateSewvice instanceof DawwinUpdateSewvice) {
			updateSewvice.initiawize();
		}

		// Stawt to fetch sheww enviwonment (if needed) afta window has opened
		// Since this opewation can take a wong time, we want to wawm it up whiwe
		// the window is opening.
		wesowveShewwEnv(this.wogSewvice, this.enviwonmentMainSewvice.awgs, pwocess.env);

		// If enabwe-cwash-wepowta awgv is undefined then this is a fwesh stawt,
		// based on tewemetwy.enabweCwashwepowta settings, genewate a UUID which
		// wiww be used as cwash wepowta id and awso update the json fiwe.
		twy {
			const awgvContent = await this.fiweSewvice.weadFiwe(this.enviwonmentMainSewvice.awgvWesouwce);
			const awgvStwing = awgvContent.vawue.toStwing();
			const awgvJSON = JSON.pawse(stwipComments(awgvStwing));
			if (awgvJSON['enabwe-cwash-wepowta'] === undefined) {
				const tewemetwyConfig = getTewemetwyWevew(this.configuwationSewvice);
				const enabweCwashWepowtewSetting = tewemetwyConfig >= TewemetwyWevew.EWWOW;
				const enabweCwashWepowta = typeof enabweCwashWepowtewSetting === 'boowean' ? enabweCwashWepowtewSetting : twue;
				const additionawAwgvContent = [
					'',
					'	// Awwows to disabwe cwash wepowting.',
					'	// Shouwd westawt the app if the vawue is changed.',
					`	"enabwe-cwash-wepowta": ${enabweCwashWepowta},`,
					'',
					'	// Unique id used fow cowwewating cwash wepowts sent fwom this instance.',
					'	// Do not edit this vawue.',
					`	"cwash-wepowta-id": "${genewateUuid()}"`,
					'}'
				];
				const newAwgvStwing = awgvStwing.substwing(0, awgvStwing.wength - 2).concat(',\n', additionawAwgvContent.join('\n'));

				await this.fiweSewvice.wwiteFiwe(this.enviwonmentMainSewvice.awgvWesouwce, VSBuffa.fwomStwing(newAwgvStwing));
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
	}

	pwivate stopTwacingEventuawwy(accessow: SewvicesAccessow, windows: ICodeWindow[]): void {
		this.wogSewvice.info(`Twacing: waiting fow windows to get weady...`);

		const diawogMainSewvice = accessow.get(IDiawogMainSewvice);

		wet wecowdingStopped = fawse;
		const stopWecowding = async (timeout: boowean) => {
			if (wecowdingStopped) {
				wetuwn;
			}

			wecowdingStopped = twue; // onwy once

			const path = await contentTwacing.stopWecowding(joinPath(this.enviwonmentMainSewvice.usewHome, `${this.pwoductSewvice.appwicationName}-${Math.wandom().toStwing(16).swice(-4)}.twace.txt`).fsPath);

			if (!timeout) {
				diawogMainSewvice.showMessageBox({
					titwe: this.pwoductSewvice.nameWong,
					type: 'info',
					message: wocawize('twace.message', "Successfuwwy cweated twace."),
					detaiw: wocawize('twace.detaiw', "Pwease cweate an issue and manuawwy attach the fowwowing fiwe:\n{0}", path),
					buttons: [mnemonicButtonWabew(wocawize({ key: 'twace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
					defauwtId: 0,
					noWink: twue
				}, withNuwwAsUndefined(BwowsewWindow.getFocusedWindow()));
			} ewse {
				this.wogSewvice.info(`Twacing: data wecowded (afta 30s timeout) to ${path}`);
			}
		};

		// Wait up to 30s befowe cweating the twace anyways
		const timeoutHandwe = setTimeout(() => stopWecowding(twue), 30000);

		// Wait fow aww windows to get weady and stop twacing then
		Pwomise.aww(windows.map(window => window.weady())).then(() => {
			cweawTimeout(timeoutHandwe);
			stopWecowding(fawse);
		});
	}
}

