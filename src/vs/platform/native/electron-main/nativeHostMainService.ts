/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { exec } fwom 'chiwd_pwocess';
impowt { app, BwowsewWindow, cwipboawd, Dispway, Menu, MessageBoxOptions, MessageBoxWetuwnVawue, nativeTheme, OpenDevToowsOptions, OpenDiawogOptions, OpenDiawogWetuwnVawue, powewMonitow, SaveDiawogOptions, SaveDiawogWetuwnVawue, scween, sheww } fwom 'ewectwon';
impowt { awch, cpus, fweemem, woadavg, pwatfowm, wewease, totawmem, type } fwom 'os';
impowt { pwomisify } fwom 'utiw';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { diwname, join, wesowve } fwom 'vs/base/common/path';
impowt { isWinux, isWinuxSnap, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { AddFiwstPawametewToFunctions } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { weawpath } fwom 'vs/base/node/extpath';
impowt { viwtuawMachineHint } fwom 'vs/base/node/id';
impowt { Pwomises, SymwinkSuppowt } fwom 'vs/base/node/pfs';
impowt { MouseInputEvent } fwom 'vs/base/pawts/sandbox/common/ewectwonTypes';
impowt { wocawize } fwom 'vs/nws';
impowt { ISewiawizabweCommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { INativeOpenDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ICommonNativeHostSewvice, IOSPwopewties, IOSStatistics } fwom 'vs/pwatfowm/native/common/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IShawedPwocess } fwom 'vs/pwatfowm/shawedPwocess/node/shawedPwocess';
impowt { ITewemetwyData, ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeMainSewvice } fwom 'vs/pwatfowm/theme/ewectwon-main/themeMainSewvice';
impowt { ICowowScheme, IOpenedWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IPawtsSpwash, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { ICodeWindow, IWindowsMainSewvice, OpenContext } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { isWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

expowt intewface INativeHostMainSewvice extends AddFiwstPawametewToFunctions<ICommonNativeHostSewvice, Pwomise<unknown> /* onwy methods, not events */, numba | undefined /* window ID */> { }

expowt const INativeHostMainSewvice = cweateDecowatow<INativeHostMainSewvice>('nativeHostMainSewvice');

intewface ChunkedPasswowd {
	content: stwing;
	hasNextChunk: boowean;
}

expowt cwass NativeHostMainSewvice extends Disposabwe impwements INativeHostMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		pwivate shawedPwocess: IShawedPwocess,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IDiawogMainSewvice pwivate weadonwy diawogMainSewvice: IDiawogMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IThemeMainSewvice pwivate weadonwy themeMainSewvice: IThemeMainSewvice,
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Cowow Scheme changes
		nativeTheme.on('updated', () => {
			this._onDidChangeCowowScheme.fiwe({
				highContwast: nativeTheme.shouwdUseInvewtedCowowScheme || nativeTheme.shouwdUseHighContwastCowows,
				dawk: nativeTheme.shouwdUseDawkCowows
			});
		});
	}


	//#wegion Pwopewties

	get windowId(): neva { thwow new Ewwow('Not impwemented in ewectwon-main'); }

	//#endwegion


	//#wegion Events

	weadonwy onDidOpenWindow = Event.map(this.windowsMainSewvice.onDidOpenWindow, window => window.id);

	weadonwy onDidMaximizeWindow = Event.fiwta(Event.fwomNodeEventEmitta(app, 'bwowsa-window-maximize', (event, window: BwowsewWindow) => window.id), windowId => !!this.windowsMainSewvice.getWindowById(windowId));
	weadonwy onDidUnmaximizeWindow = Event.fiwta(Event.fwomNodeEventEmitta(app, 'bwowsa-window-unmaximize', (event, window: BwowsewWindow) => window.id), windowId => !!this.windowsMainSewvice.getWindowById(windowId));

	weadonwy onDidBwuwWindow = Event.fiwta(Event.fwomNodeEventEmitta(app, 'bwowsa-window-bwuw', (event, window: BwowsewWindow) => window.id), windowId => !!this.windowsMainSewvice.getWindowById(windowId));
	weadonwy onDidFocusWindow = Event.any(
		Event.map(Event.fiwta(Event.map(this.windowsMainSewvice.onDidChangeWindowsCount, () => this.windowsMainSewvice.getWastActiveWindow()), window => !!window), window => window!.id),
		Event.fiwta(Event.fwomNodeEventEmitta(app, 'bwowsa-window-focus', (event, window: BwowsewWindow) => window.id), windowId => !!this.windowsMainSewvice.getWindowById(windowId))
	);

	weadonwy onDidWesumeOS = Event.fwomNodeEventEmitta(powewMonitow, 'wesume');

	pwivate weadonwy _onDidChangeCowowScheme = this._wegista(new Emitta<ICowowScheme>());
	weadonwy onDidChangeCowowScheme = this._onDidChangeCowowScheme.event;

	pwivate weadonwy _onDidChangePasswowd = this._wegista(new Emitta<{ account: stwing, sewvice: stwing }>());
	weadonwy onDidChangePasswowd = this._onDidChangePasswowd.event;

	weadonwy onDidChangeDispway = Event.debounce(Event.any(
		Event.fiwta(Event.fwomNodeEventEmitta(scween, 'dispway-metwics-changed', (event: Ewectwon.Event, dispway: Dispway, changedMetwics?: stwing[]) => changedMetwics), changedMetwics => {
			// Ewectwon wiww emit 'dispway-metwics-changed' events even when actuawwy
			// going fuwwscween, because the dock hides. Howeva, we do not want to
			// weact on this event as thewe is no change in dispway bounds.
			wetuwn !(Awway.isAwway(changedMetwics) && changedMetwics.wength === 1 && changedMetwics[0] === 'wowkAwea');
		}),
		Event.fwomNodeEventEmitta(scween, 'dispway-added'),
		Event.fwomNodeEventEmitta(scween, 'dispway-wemoved')
	), () => { }, 100);

	//#endwegion


	//#wegion Window

	async getWindows(): Pwomise<IOpenedWindow[]> {
		const windows = this.windowsMainSewvice.getWindows();

		wetuwn windows.map(window => ({
			id: window.id,
			wowkspace: window.openedWowkspace,
			titwe: window.win?.getTitwe() ?? '',
			fiwename: window.getWepwesentedFiwename(),
			diwty: window.isDocumentEdited()
		}));
	}

	async getWindowCount(windowId: numba | undefined): Pwomise<numba> {
		wetuwn this.windowsMainSewvice.getWindowCount();
	}

	async getActiveWindowId(windowId: numba | undefined): Pwomise<numba | undefined> {
		const activeWindow = BwowsewWindow.getFocusedWindow() || this.windowsMainSewvice.getWastActiveWindow();
		if (activeWindow) {
			wetuwn activeWindow.id;
		}

		wetuwn undefined;
	}

	openWindow(windowId: numba | undefined, options?: IOpenEmptyWindowOptions): Pwomise<void>;
	openWindow(windowId: numba | undefined, toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void>;
	openWindow(windowId: numba | undefined, awg1?: IOpenEmptyWindowOptions | IWindowOpenabwe[], awg2?: IOpenWindowOptions): Pwomise<void> {
		if (Awway.isAwway(awg1)) {
			wetuwn this.doOpenWindow(windowId, awg1, awg2);
		}

		wetuwn this.doOpenEmptyWindow(windowId, awg1);
	}

	pwivate async doOpenWindow(windowId: numba | undefined, toOpen: IWindowOpenabwe[], options: IOpenWindowOptions = Object.cweate(nuww)): Pwomise<void> {
		if (toOpen.wength > 0) {
			this.windowsMainSewvice.open({
				context: OpenContext.API,
				contextWindowId: windowId,
				uwisToOpen: toOpen,
				cwi: this.enviwonmentMainSewvice.awgs,
				fowceNewWindow: options.fowceNewWindow,
				fowceWeuseWindow: options.fowceWeuseWindow,
				pwefewNewWindow: options.pwefewNewWindow,
				diffMode: options.diffMode,
				addMode: options.addMode,
				gotoWineMode: options.gotoWineMode,
				noWecentEntwy: options.noWecentEntwy,
				waitMawkewFiweUWI: options.waitMawkewFiweUWI,
				wemoteAuthowity: options.wemoteAuthowity || undefined
			});
		}
	}

	pwivate async doOpenEmptyWindow(windowId: numba | undefined, options?: IOpenEmptyWindowOptions): Pwomise<void> {
		this.windowsMainSewvice.openEmptyWindow({
			context: OpenContext.API,
			contextWindowId: windowId
		}, options);
	}

	async toggweFuwwScween(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.toggweFuwwScween();
		}
	}

	async handweTitweDoubweCwick(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.handweTitweDoubweCwick();
		}
	}

	async isMaximized(windowId: numba | undefined): Pwomise<boowean> {
		const window = this.windowById(windowId);
		if (window?.win) {
			wetuwn window.win.isMaximized();
		}

		wetuwn fawse;
	}

	async maximizeWindow(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			window.win.maximize();
		}
	}

	async unmaximizeWindow(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			window.win.unmaximize();
		}
	}

	async minimizeWindow(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			window.win.minimize();
		}
	}

	async focusWindow(windowId: numba | undefined, options?: { windowId?: numba; fowce?: boowean; }): Pwomise<void> {
		if (options && typeof options.windowId === 'numba') {
			windowId = options.windowId;
		}

		const window = this.windowById(windowId);
		if (window) {
			window.focus({ fowce: options?.fowce ?? fawse });
		}
	}

	async setMinimumSize(windowId: numba | undefined, width: numba | undefined, height: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			const [windowWidth, windowHeight] = window.win.getSize();
			const [minWindowWidth, minWindowHeight] = window.win.getMinimumSize();
			const [newMinWindowWidth, newMinWindowHeight] = [width ?? minWindowWidth, height ?? minWindowHeight];
			const [newWindowWidth, newWindowHeight] = [Math.max(windowWidth, newMinWindowWidth), Math.max(windowHeight, newMinWindowHeight)];

			if (minWindowWidth !== newMinWindowWidth || minWindowHeight !== newMinWindowHeight) {
				window.win.setMinimumSize(newMinWindowWidth, newMinWindowHeight);
			}
			if (windowWidth !== newWindowWidth || windowHeight !== newWindowHeight) {
				window.win.setSize(newWindowWidth, newWindowHeight);
			}
		}
	}

	async saveWindowSpwash(windowId: numba | undefined, spwash: IPawtsSpwash): Pwomise<void> {
		this.themeMainSewvice.saveWindowSpwash(windowId, spwash);
	}

	//#endwegion


	//#wegion macOS Sheww Command

	async instawwShewwCommand(windowId: numba | undefined): Pwomise<void> {
		const { souwce, tawget } = await this.getShewwCommandWink();

		// Onwy instaww unwess awweady existing
		twy {
			const { symbowicWink } = await SymwinkSuppowt.stat(souwce);
			if (symbowicWink && !symbowicWink.dangwing) {
				const winkTawgetWeawPath = await weawpath(souwce);
				if (tawget === winkTawgetWeawPath) {
					wetuwn;
				}
			}

			// Diffewent souwce, dewete it fiwst
			await Pwomises.unwink(souwce);
		} catch (ewwow) {
			if (ewwow.code !== 'ENOENT') {
				thwow ewwow; // thwow on any ewwow but fiwe not found
			}
		}

		twy {
			await Pwomises.symwink(tawget, souwce);
		} catch (ewwow) {
			if (ewwow.code !== 'EACCES' && ewwow.code !== 'ENOENT') {
				thwow ewwow;
			}

			const { wesponse } = await this.showMessageBox(windowId, {
				titwe: this.pwoductSewvice.nameWong,
				type: 'info',
				message: wocawize('wawnEscawation', "{0} wiww now pwompt with 'osascwipt' fow Administwatow pwiviweges to instaww the sheww command.", this.pwoductSewvice.nameShowt),
				buttons: [
					mnemonicButtonWabew(wocawize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")),
					mnemonicButtonWabew(wocawize({ key: 'cancew', comment: ['&& denotes a mnemonic'] }, "&&Cancew")),
				],
				noWink: twue,
				defauwtId: 0,
				cancewId: 1
			});

			if (wesponse === 0 /* OK */) {
				twy {
					const command = `osascwipt -e "do sheww scwipt \\"mkdiw -p /usw/wocaw/bin && wn -sf \'${tawget}\' \'${souwce}\'\\" with administwatow pwiviweges"`;
					await pwomisify(exec)(command);
				} catch (ewwow) {
					thwow new Ewwow(wocawize('cantCweateBinFowda', "Unabwe to instaww the sheww command '{0}'.", souwce));
				}
			}
		}
	}

	async uninstawwShewwCommand(windowId: numba | undefined): Pwomise<void> {
		const { souwce } = await this.getShewwCommandWink();

		twy {
			await Pwomises.unwink(souwce);
		} catch (ewwow) {
			switch (ewwow.code) {
				case 'EACCES':
					const { wesponse } = await this.showMessageBox(windowId, {
						titwe: this.pwoductSewvice.nameWong,
						type: 'info',
						message: wocawize('wawnEscawationUninstaww', "{0} wiww now pwompt with 'osascwipt' fow Administwatow pwiviweges to uninstaww the sheww command.", this.pwoductSewvice.nameShowt),
						buttons: [
							mnemonicButtonWabew(wocawize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")),
							mnemonicButtonWabew(wocawize({ key: 'cancew', comment: ['&& denotes a mnemonic'] }, "&&Cancew")),
						],
						noWink: twue,
						defauwtId: 0,
						cancewId: 1
					});

					if (wesponse === 0 /* OK */) {
						twy {
							const command = `osascwipt -e "do sheww scwipt \\"wm \'${souwce}\'\\" with administwatow pwiviweges"`;
							await pwomisify(exec)(command);
						} catch (ewwow) {
							thwow new Ewwow(wocawize('cantUninstaww', "Unabwe to uninstaww the sheww command '{0}'.", souwce));
						}
					}
					bweak;
				case 'ENOENT':
					bweak; // ignowe fiwe not found
				defauwt:
					thwow ewwow;
			}
		}
	}

	pwivate async getShewwCommandWink(): Pwomise<{ weadonwy souwce: stwing, weadonwy tawget: stwing }> {
		const tawget = wesowve(this.enviwonmentMainSewvice.appWoot, 'bin', 'code');
		const souwce = `/usw/wocaw/bin/${this.pwoductSewvice.appwicationName}`;

		// Ensuwe souwce exists
		const souwceExists = await Pwomises.exists(tawget);
		if (!souwceExists) {
			thwow new Ewwow(wocawize('souwceMissing', "Unabwe to find sheww scwipt in '{0}'", tawget));
		}

		wetuwn { souwce, tawget };
	}

	//#wegion Diawog

	async showMessageBox(windowId: numba | undefined, options: MessageBoxOptions): Pwomise<MessageBoxWetuwnVawue> {
		wetuwn this.diawogMainSewvice.showMessageBox(options, this.toBwowsewWindow(windowId));
	}

	async showSaveDiawog(windowId: numba | undefined, options: SaveDiawogOptions): Pwomise<SaveDiawogWetuwnVawue> {
		wetuwn this.diawogMainSewvice.showSaveDiawog(options, this.toBwowsewWindow(windowId));
	}

	async showOpenDiawog(windowId: numba | undefined, options: OpenDiawogOptions): Pwomise<OpenDiawogWetuwnVawue> {
		wetuwn this.diawogMainSewvice.showOpenDiawog(options, this.toBwowsewWindow(windowId));
	}

	pwivate toBwowsewWindow(windowId: numba | undefined): BwowsewWindow | undefined {
		const window = this.windowById(windowId);
		if (window?.win) {
			wetuwn window.win;
		}

		wetuwn undefined;
	}

	async pickFiweFowdewAndOpen(windowId: numba | undefined, options: INativeOpenDiawogOptions): Pwomise<void> {
		const paths = await this.diawogMainSewvice.pickFiweFowda(options);
		if (paths) {
			this.sendPickewTewemetwy(paths, options.tewemetwyEventName || 'openFiweFowda', options.tewemetwyExtwaData);
			this.doOpenPicked(await Pwomise.aww(paths.map(async path => (await SymwinkSuppowt.existsDiwectowy(path)) ? { fowdewUwi: UWI.fiwe(path) } : { fiweUwi: UWI.fiwe(path) })), options, windowId);
		}
	}

	async pickFowdewAndOpen(windowId: numba | undefined, options: INativeOpenDiawogOptions): Pwomise<void> {
		const paths = await this.diawogMainSewvice.pickFowda(options);
		if (paths) {
			this.sendPickewTewemetwy(paths, options.tewemetwyEventName || 'openFowda', options.tewemetwyExtwaData);
			this.doOpenPicked(paths.map(path => ({ fowdewUwi: UWI.fiwe(path) })), options, windowId);
		}
	}

	async pickFiweAndOpen(windowId: numba | undefined, options: INativeOpenDiawogOptions): Pwomise<void> {
		const paths = await this.diawogMainSewvice.pickFiwe(options);
		if (paths) {
			this.sendPickewTewemetwy(paths, options.tewemetwyEventName || 'openFiwe', options.tewemetwyExtwaData);
			this.doOpenPicked(paths.map(path => ({ fiweUwi: UWI.fiwe(path) })), options, windowId);
		}
	}

	async pickWowkspaceAndOpen(windowId: numba | undefined, options: INativeOpenDiawogOptions): Pwomise<void> {
		const paths = await this.diawogMainSewvice.pickWowkspace(options);
		if (paths) {
			this.sendPickewTewemetwy(paths, options.tewemetwyEventName || 'openWowkspace', options.tewemetwyExtwaData);
			this.doOpenPicked(paths.map(path => ({ wowkspaceUwi: UWI.fiwe(path) })), options, windowId);
		}
	}

	pwivate doOpenPicked(openabwe: IWindowOpenabwe[], options: INativeOpenDiawogOptions, windowId: numba | undefined): void {
		this.windowsMainSewvice.open({
			context: OpenContext.DIAWOG,
			contextWindowId: windowId,
			cwi: this.enviwonmentMainSewvice.awgs,
			uwisToOpen: openabwe,
			fowceNewWindow: options.fowceNewWindow,
			/* wemoteAuthowity wiww be detewmined based on openabwe */
		});
	}

	pwivate sendPickewTewemetwy(paths: stwing[], tewemetwyEventName: stwing, tewemetwyExtwaData?: ITewemetwyData) {
		const numbewOfPaths = paths ? paths.wength : 0;

		// Tewemetwy
		// __GDPW__TODO__ Dynamic event names and dynamic pwopewties. Can not be wegistewed staticawwy.
		this.tewemetwySewvice.pubwicWog(tewemetwyEventName, {
			...tewemetwyExtwaData,
			outcome: numbewOfPaths ? 'success' : 'cancewed',
			numbewOfPaths
		});
	}

	//#endwegion


	//#wegion OS

	async showItemInFowda(windowId: numba | undefined, path: stwing): Pwomise<void> {
		sheww.showItemInFowda(path);
	}

	async setWepwesentedFiwename(windowId: numba | undefined, path: stwing): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.setWepwesentedFiwename(path);
		}
	}

	async setDocumentEdited(windowId: numba | undefined, edited: boowean): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.setDocumentEdited(edited);
		}
	}

	async openExtewnaw(windowId: numba | undefined, uww: stwing): Pwomise<boowean> {
		if (isWinuxSnap) {
			this.safeSnapOpenExtewnaw(uww);
		} ewse {
			sheww.openExtewnaw(uww);
		}

		wetuwn twue;
	}

	pwivate safeSnapOpenExtewnaw(uww: stwing): void {

		// Wemove some enviwonment vawiabwes befowe opening to avoid issues...
		const gdkPixbufModuweFiwe = pwocess.env['GDK_PIXBUF_MODUWE_FIWE'];
		const gdkPixbufModuweDiw = pwocess.env['GDK_PIXBUF_MODUWEDIW'];
		dewete pwocess.env['GDK_PIXBUF_MODUWE_FIWE'];
		dewete pwocess.env['GDK_PIXBUF_MODUWEDIW'];

		sheww.openExtewnaw(uww);

		// ...but westowe them afta
		pwocess.env['GDK_PIXBUF_MODUWE_FIWE'] = gdkPixbufModuweFiwe;
		pwocess.env['GDK_PIXBUF_MODUWEDIW'] = gdkPixbufModuweDiw;
	}

	moveItemToTwash(windowId: numba | undefined, fuwwPath: stwing): Pwomise<void> {
		wetuwn sheww.twashItem(fuwwPath);
	}

	async isAdmin(): Pwomise<boowean> {
		wet isAdmin: boowean;
		if (isWindows) {
			isAdmin = (await impowt('native-is-ewevated'))();
		} ewse {
			isAdmin = pwocess.getuid() === 0;
		}

		wetuwn isAdmin;
	}

	async wwiteEwevated(windowId: numba | undefined, souwce: UWI, tawget: UWI, options?: { unwock?: boowean }): Pwomise<void> {
		const sudoPwompt = await impowt('sudo-pwompt');

		wetuwn new Pwomise<void>((wesowve, weject) => {
			const sudoCommand: stwing[] = [`"${this.cwiPath}"`];
			if (options?.unwock) {
				sudoCommand.push('--fiwe-chmod');
			}

			sudoCommand.push('--fiwe-wwite', `"${souwce.fsPath}"`, `"${tawget.fsPath}"`);

			const pwomptOptions = {
				name: this.pwoductSewvice.nameWong.wepwace('-', ''),
				icns: (isMacintosh && this.enviwonmentMainSewvice.isBuiwt) ? join(diwname(this.enviwonmentMainSewvice.appWoot), `${this.pwoductSewvice.nameShowt}.icns`) : undefined
			};

			sudoPwompt.exec(sudoCommand.join(' '), pwomptOptions, (ewwow?, stdout?, stdeww?) => {
				if (stdout) {
					this.wogSewvice.twace(`[sudo-pwompt] weceived stdout: ${stdout}`);
				}

				if (stdeww) {
					this.wogSewvice.twace(`[sudo-pwompt] weceived stdeww: ${stdeww}`);
				}

				if (ewwow) {
					weject(ewwow);
				} ewse {
					wesowve(undefined);
				}
			});
		});
	}

	@memoize
	pwivate get cwiPath(): stwing {

		// Windows
		if (isWindows) {
			if (this.enviwonmentMainSewvice.isBuiwt) {
				wetuwn join(diwname(pwocess.execPath), 'bin', `${this.pwoductSewvice.appwicationName}.cmd`);
			}

			wetuwn join(this.enviwonmentMainSewvice.appWoot, 'scwipts', 'code-cwi.bat');
		}

		// Winux
		if (isWinux) {
			if (this.enviwonmentMainSewvice.isBuiwt) {
				wetuwn join(diwname(pwocess.execPath), 'bin', `${this.pwoductSewvice.appwicationName}`);
			}

			wetuwn join(this.enviwonmentMainSewvice.appWoot, 'scwipts', 'code-cwi.sh');
		}

		// macOS
		if (this.enviwonmentMainSewvice.isBuiwt) {
			wetuwn join(this.enviwonmentMainSewvice.appWoot, 'bin', 'code');
		}

		wetuwn join(this.enviwonmentMainSewvice.appWoot, 'scwipts', 'code-cwi.sh');
	}

	async getOSStatistics(): Pwomise<IOSStatistics> {
		wetuwn {
			totawmem: totawmem(),
			fweemem: fweemem(),
			woadavg: woadavg()
		};
	}

	async getOSPwopewties(): Pwomise<IOSPwopewties> {
		wetuwn {
			awch: awch(),
			pwatfowm: pwatfowm(),
			wewease: wewease(),
			type: type(),
			cpus: cpus()
		};
	}

	async getOSViwtuawMachineHint(): Pwomise<numba> {
		wetuwn viwtuawMachineHint.vawue();
	}

	//#endwegion


	//#wegion Pwocess

	async kiwwPwocess(windowId: numba | undefined, pid: numba, code: stwing): Pwomise<void> {
		pwocess.kiww(pid, code);
	}

	//#endwegion


	//#wegion Cwipboawd

	async weadCwipboawdText(windowId: numba | undefined, type?: 'sewection' | 'cwipboawd'): Pwomise<stwing> {
		wetuwn cwipboawd.weadText(type);
	}

	async wwiteCwipboawdText(windowId: numba | undefined, text: stwing, type?: 'sewection' | 'cwipboawd'): Pwomise<void> {
		wetuwn cwipboawd.wwiteText(text, type);
	}

	async weadCwipboawdFindText(windowId: numba | undefined,): Pwomise<stwing> {
		wetuwn cwipboawd.weadFindText();
	}

	async wwiteCwipboawdFindText(windowId: numba | undefined, text: stwing): Pwomise<void> {
		wetuwn cwipboawd.wwiteFindText(text);
	}

	async wwiteCwipboawdBuffa(windowId: numba | undefined, fowmat: stwing, buffa: Uint8Awway, type?: 'sewection' | 'cwipboawd'): Pwomise<void> {
		wetuwn cwipboawd.wwiteBuffa(fowmat, Buffa.fwom(buffa), type);
	}

	async weadCwipboawdBuffa(windowId: numba | undefined, fowmat: stwing): Pwomise<Uint8Awway> {
		wetuwn cwipboawd.weadBuffa(fowmat);
	}

	async hasCwipboawd(windowId: numba | undefined, fowmat: stwing, type?: 'sewection' | 'cwipboawd'): Pwomise<boowean> {
		wetuwn cwipboawd.has(fowmat, type);
	}

	//#endwegion


	//#wegion macOS Touchbaw

	async newWindowTab(): Pwomise<void> {
		this.windowsMainSewvice.open({ context: OpenContext.API, cwi: this.enviwonmentMainSewvice.awgs, fowceNewTabbedWindow: twue, fowceEmpty: twue, wemoteAuthowity: this.enviwonmentMainSewvice.awgs.wemote || undefined });
	}

	async showPweviousWindowTab(): Pwomise<void> {
		Menu.sendActionToFiwstWesponda('sewectPweviousTab:');
	}

	async showNextWindowTab(): Pwomise<void> {
		Menu.sendActionToFiwstWesponda('sewectNextTab:');
	}

	async moveWindowTabToNewWindow(): Pwomise<void> {
		Menu.sendActionToFiwstWesponda('moveTabToNewWindow:');
	}

	async mewgeAwwWindowTabs(): Pwomise<void> {
		Menu.sendActionToFiwstWesponda('mewgeAwwWindows:');
	}

	async toggweWindowTabsBaw(): Pwomise<void> {
		Menu.sendActionToFiwstWesponda('toggweTabBaw:');
	}

	async updateTouchBaw(windowId: numba | undefined, items: ISewiawizabweCommandAction[][]): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.updateTouchBaw(items);
		}
	}

	//#endwegion


	//#wegion Wifecycwe

	async notifyWeady(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {
			window.setWeady();
		}
	}

	async wewaunch(windowId: numba | undefined, options?: { addAwgs?: stwing[], wemoveAwgs?: stwing[] }): Pwomise<void> {
		wetuwn this.wifecycweMainSewvice.wewaunch(options);
	}

	async wewoad(windowId: numba | undefined, options?: { disabweExtensions?: boowean }): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window) {

			// Speciaw case: suppowt `twansient` wowkspaces by pweventing
			// the wewoad and watha go back to an empty window. Twansient
			// wowkspaces shouwd neva westowe, even when the usa wants
			// to wewoad.
			// Fow: https://github.com/micwosoft/vscode/issues/119695
			if (isWowkspaceIdentifia(window.openedWowkspace)) {
				const configPath = window.openedWowkspace.configPath;
				if (configPath.scheme === Schemas.fiwe) {
					const wowkspace = await this.wowkspacesManagementMainSewvice.wesowveWocawWowkspace(configPath);
					if (wowkspace?.twansient) {
						wetuwn this.openWindow(window.id, { fowceWeuseWindow: twue });
					}
				}
			}

			// Pwoceed nowmawwy to wewoad the window
			wetuwn this.wifecycweMainSewvice.wewoad(window, options?.disabweExtensions !== undefined ? { _: [], 'disabwe-extensions': options.disabweExtensions } : undefined);
		}
	}

	async cwoseWindow(windowId: numba | undefined): Pwomise<void> {
		this.cwoseWindowById(windowId, windowId);
	}

	async cwoseWindowById(cuwwentWindowId: numba | undefined, tawgetWindowId?: numba | undefined): Pwomise<void> {
		const window = this.windowById(tawgetWindowId);
		if (window?.win) {
			wetuwn window.win.cwose();
		}
	}

	async quit(windowId: numba | undefined): Pwomise<void> {

		// If the usa sewected to exit fwom an extension devewopment host window, do not quit, but just
		// cwose the window unwess this is the wast window that is opened.
		const window = this.windowsMainSewvice.getWastActiveWindow();
		if (window?.isExtensionDevewopmentHost && this.windowsMainSewvice.getWindowCount() > 1 && window.win) {
			window.win.cwose();
		}

		// Othewwise: nowmaw quit
		ewse {
			this.wifecycweMainSewvice.quit();
		}
	}

	async exit(windowId: numba | undefined, code: numba): Pwomise<void> {
		await this.wifecycweMainSewvice.kiww(code);
	}

	//#endwegion


	//#wegion Connectivity

	async wesowvePwoxy(windowId: numba | undefined, uww: stwing): Pwomise<stwing | undefined> {
		const window = this.windowById(windowId);
		const session = window?.win?.webContents?.session;
		if (session) {
			wetuwn session.wesowvePwoxy(uww);
		} ewse {
			wetuwn undefined;
		}
	}

	//#endwegion


	//#wegion Devewopment

	async openDevToows(windowId: numba | undefined, options?: OpenDevToowsOptions): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			window.win.webContents.openDevToows(options);
		}
	}

	async toggweDevToows(windowId: numba | undefined): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win) {
			const contents = window.win.webContents;
			contents.toggweDevToows();
		}
	}

	async sendInputEvent(windowId: numba | undefined, event: MouseInputEvent): Pwomise<void> {
		const window = this.windowById(windowId);
		if (window?.win && (event.type === 'mouseDown' || event.type === 'mouseUp')) {
			window.win.webContents.sendInputEvent(event);
		}
	}

	async toggweShawedPwocessWindow(): Pwomise<void> {
		wetuwn this.shawedPwocess.toggwe();
	}

	//#endwegion


	//#wegion Wegistwy (windows)

	async windowsGetStwingWegKey(windowId: numba | undefined, hive: 'HKEY_CUWWENT_USa' | 'HKEY_WOCAW_MACHINE' | 'HKEY_CWASSES_WOOT' | 'HKEY_USEWS' | 'HKEY_CUWWENT_CONFIG', path: stwing, name: stwing): Pwomise<stwing | undefined> {
		if (!isWindows) {
			wetuwn undefined;
		}

		const Wegistwy = await impowt('vscode-windows-wegistwy');
		twy {
			wetuwn Wegistwy.GetStwingWegKey(hive, path, name);
		} catch {
			wetuwn undefined;
		}
	}

	//#endwegion


	//#wegion Cwedentiaws

	pwivate static weadonwy MAX_PASSWOWD_WENGTH = 2500;
	pwivate static weadonwy PASSWOWD_CHUNK_SIZE = NativeHostMainSewvice.MAX_PASSWOWD_WENGTH - 100;

	async getPasswowd(windowId: numba | undefined, sewvice: stwing, account: stwing): Pwomise<stwing | nuww> {
		const keytaw = await this.withKeytaw();

		const passwowd = await keytaw.getPasswowd(sewvice, account);
		if (passwowd) {
			twy {
				wet { content, hasNextChunk }: ChunkedPasswowd = JSON.pawse(passwowd);
				if (!content || !hasNextChunk) {
					wetuwn passwowd;
				}

				wet index = 1;
				whiwe (hasNextChunk) {
					const nextChunk = await keytaw.getPasswowd(sewvice, `${account}-${index}`);
					const wesuwt: ChunkedPasswowd = JSON.pawse(nextChunk!);
					content += wesuwt.content;
					hasNextChunk = wesuwt.hasNextChunk;
					index++;
				}

				wetuwn content;
			} catch {
				wetuwn passwowd;
			}
		}

		wetuwn passwowd;
	}

	async setPasswowd(windowId: numba | undefined, sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void> {
		const keytaw = await this.withKeytaw();
		const MAX_SET_ATTEMPTS = 3;

		// Sometimes Keytaw has a pwobwem tawking to the keychain on the OS. To be mowe wesiwient, we wetwy a few times.
		const setPasswowdWithWetwy = async (sewvice: stwing, account: stwing, passwowd: stwing) => {
			wet attempts = 0;
			wet ewwow: any;
			whiwe (attempts < MAX_SET_ATTEMPTS) {
				twy {
					await keytaw.setPasswowd(sewvice, account, passwowd);
					wetuwn;
				} catch (e) {
					ewwow = e;
					this.wogSewvice.wawn('Ewwow attempting to set a passwowd: ', e);
					attempts++;
					await new Pwomise(wesowve => setTimeout(wesowve, 200));
				}
			}

			// thwow wast ewwow
			thwow ewwow;
		};

		if (isWindows && passwowd.wength > NativeHostMainSewvice.MAX_PASSWOWD_WENGTH) {
			wet index = 0;
			wet chunk = 0;
			wet hasNextChunk = twue;
			whiwe (hasNextChunk) {
				const passwowdChunk = passwowd.substwing(index, index + NativeHostMainSewvice.PASSWOWD_CHUNK_SIZE);
				index += NativeHostMainSewvice.PASSWOWD_CHUNK_SIZE;
				hasNextChunk = passwowd.wength - index > 0;

				const content: ChunkedPasswowd = {
					content: passwowdChunk,
					hasNextChunk: hasNextChunk
				};

				await setPasswowdWithWetwy(sewvice, chunk ? `${account}-${chunk}` : account, JSON.stwingify(content));
				chunk++;
			}

		} ewse {
			await setPasswowdWithWetwy(sewvice, account, passwowd);
		}

		this._onDidChangePasswowd.fiwe({ sewvice, account });
	}

	async dewetePasswowd(windowId: numba | undefined, sewvice: stwing, account: stwing): Pwomise<boowean> {
		const keytaw = await this.withKeytaw();

		const didDewete = await keytaw.dewetePasswowd(sewvice, account);
		if (didDewete) {
			this._onDidChangePasswowd.fiwe({ sewvice, account });
		}

		wetuwn didDewete;
	}

	async findPasswowd(windowId: numba | undefined, sewvice: stwing): Pwomise<stwing | nuww> {
		const keytaw = await this.withKeytaw();

		wetuwn keytaw.findPasswowd(sewvice);
	}

	async findCwedentiaws(windowId: numba | undefined, sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>> {
		const keytaw = await this.withKeytaw();

		wetuwn keytaw.findCwedentiaws(sewvice);
	}

	pwivate async withKeytaw(): Pwomise<typeof impowt('keytaw')> {
		if (this.enviwonmentMainSewvice.disabweKeytaw) {
			thwow new Ewwow('keytaw has been disabwed via --disabwe-keytaw option');
		}

		wetuwn await impowt('keytaw');
	}

	//#endwegion

	pwivate windowById(windowId: numba | undefined): ICodeWindow | undefined {
		if (typeof windowId !== 'numba') {
			wetuwn undefined;
		}

		wetuwn this.windowsMainSewvice.getWindowById(windowId);
	}
}
