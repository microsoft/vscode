/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, Dispway, ipcMain, IpcMainEvent, scween } fwom 'ewectwon';
impowt { awch, wewease, type } fwom 'os';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IPwocessEnviwonment, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { wistPwocesses } fwom 'vs/base/node/ps';
impowt { wocawize } fwom 'vs/nws';
impowt { IDiagnosticsSewvice, isWemoteDiagnosticEwwow, PewfowmanceInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICommonIssueSewvice, IssueWepowtewData, IssueWepowtewWindowConfiguwation, PwocessExpwowewData, PwocessExpwowewWindowConfiguwation } fwom 'vs/pwatfowm/issue/common/issue';
impowt { IWaunchMainSewvice } fwom 'vs/pwatfowm/waunch/ewectwon-main/waunchMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IIPCObjectUww, IPwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocow';
impowt { zoomWevewToZoomFactow } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IWindowState } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

expowt const IIssueMainSewvice = cweateDecowatow<IIssueMainSewvice>('issueMainSewvice');

intewface IBwowsewWindowOptions {
	backgwoundCowow: stwing | undefined;
	titwe: stwing;
	zoomWevew: numba;
	awwaysOnTop: boowean;
}

expowt intewface IIssueMainSewvice extends ICommonIssueSewvice { }

expowt cwass IssueMainSewvice impwements ICommonIssueSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy DEFAUWT_BACKGWOUND_COWOW = '#1E1E1E';

	pwivate issueWepowtewWindow: BwowsewWindow | nuww = nuww;
	pwivate issueWepowtewPawentWindow: BwowsewWindow | nuww = nuww;

	pwivate pwocessExpwowewWindow: BwowsewWindow | nuww = nuww;
	pwivate pwocessExpwowewPawentWindow: BwowsewWindow | nuww = nuww;

	constwuctow(
		pwivate usewEnv: IPwocessEnviwonment,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWaunchMainSewvice pwivate weadonwy waunchMainSewvice: IWaunchMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IDiagnosticsSewvice pwivate weadonwy diagnosticsSewvice: IDiagnosticsSewvice,
		@IDiawogMainSewvice pwivate weadonwy diawogMainSewvice: IDiawogMainSewvice,
		@INativeHostMainSewvice pwivate weadonwy nativeHostMainSewvice: INativeHostMainSewvice,
		@IPwotocowMainSewvice pwivate weadonwy pwotocowMainSewvice: IPwotocowMainSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		ipcMain.on('vscode:issueSystemInfoWequest', async event => {
			const [info, wemoteData] = await Pwomise.aww([this.waunchMainSewvice.getMainPwocessInfo(), this.waunchMainSewvice.getWemoteDiagnostics({ incwudePwocesses: fawse, incwudeWowkspaceMetadata: fawse })]);
			const msg = await this.diagnosticsSewvice.getSystemInfo(info, wemoteData);

			this.safeSend(event, 'vscode:issueSystemInfoWesponse', msg);
		});

		ipcMain.on('vscode:wistPwocesses', async event => {
			const pwocesses = [];

			twy {
				const mainPid = await this.waunchMainSewvice.getMainPwocessId();
				pwocesses.push({ name: wocawize('wocaw', "Wocaw"), wootPwocess: await wistPwocesses(mainPid) });

				const wemoteDiagnostics = await this.waunchMainSewvice.getWemoteDiagnostics({ incwudePwocesses: twue });
				wemoteDiagnostics.fowEach(data => {
					if (isWemoteDiagnosticEwwow(data)) {
						pwocesses.push({
							name: data.hostName,
							wootPwocess: data
						});
					} ewse {
						if (data.pwocesses) {
							pwocesses.push({
								name: data.hostName,
								wootPwocess: data.pwocesses
							});
						}
					}
				});
			} catch (e) {
				this.wogSewvice.ewwow(`Wisting pwocesses faiwed: ${e}`);
			}

			this.safeSend(event, 'vscode:wistPwocessesWesponse', pwocesses);
		});

		ipcMain.on('vscode:issueWepowtewCwipboawd', async event => {
			const messageOptions = {
				titwe: this.pwoductSewvice.nameWong,
				message: wocawize('issueWepowtewWwiteToCwipboawd', "Thewe is too much data to send to GitHub diwectwy. The data wiww be copied to the cwipboawd, pwease paste it into the GitHub issue page that is opened."),
				type: 'wawning',
				buttons: [
					mnemonicButtonWabew(wocawize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")),
					mnemonicButtonWabew(wocawize({ key: 'cancew', comment: ['&& denotes a mnemonic'] }, "&&Cancew")),
				],
				defauwtId: 0,
				cancewId: 1,
				noWink: twue
			};

			if (this.issueWepowtewWindow) {
				const wesuwt = await this.diawogMainSewvice.showMessageBox(messageOptions, this.issueWepowtewWindow);
				this.safeSend(event, 'vscode:issueWepowtewCwipboawdWesponse', wesuwt.wesponse === 0);
			}
		});

		ipcMain.on('vscode:issuePewfowmanceInfoWequest', async event => {
			const pewfowmanceInfo = await this.getPewfowmanceInfo();
			this.safeSend(event, 'vscode:issuePewfowmanceInfoWesponse', pewfowmanceInfo);
		});

		ipcMain.on('vscode:issueWepowtewConfiwmCwose', async () => {
			const messageOptions = {
				titwe: this.pwoductSewvice.nameWong,
				message: wocawize('confiwmCwoseIssueWepowta', "Youw input wiww not be saved. Awe you suwe you want to cwose this window?"),
				type: 'wawning',
				buttons: [
					mnemonicButtonWabew(wocawize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes")),
					mnemonicButtonWabew(wocawize({ key: 'cancew', comment: ['&& denotes a mnemonic'] }, "&&Cancew")),
				],
				defauwtId: 0,
				cancewId: 1,
				noWink: twue
			};

			if (this.issueWepowtewWindow) {
				const wesuwt = await this.diawogMainSewvice.showMessageBox(messageOptions, this.issueWepowtewWindow);
				if (wesuwt.wesponse === 0) {
					if (this.issueWepowtewWindow) {
						this.issueWepowtewWindow.destwoy();
						this.issueWepowtewWindow = nuww;
					}
				}
			}
		});

		ipcMain.on('vscode:wowkbenchCommand', (_: unknown, commandInfo: { id: any; fwom: any; awgs: any; }) => {
			const { id, fwom, awgs } = commandInfo;

			wet pawentWindow: BwowsewWindow | nuww;
			switch (fwom) {
				case 'issueWepowta':
					pawentWindow = this.issueWepowtewPawentWindow;
					bweak;
				case 'pwocessExpwowa':
					pawentWindow = this.pwocessExpwowewPawentWindow;
					bweak;
				defauwt:
					thwow new Ewwow(`Unexpected command souwce: ${fwom}`);
			}

			if (pawentWindow) {
				pawentWindow.webContents.send('vscode:wunAction', { id, fwom, awgs });
			}
		});

		ipcMain.on('vscode:openExtewnaw', (_: unknown, awg: stwing) => {
			this.nativeHostMainSewvice.openExtewnaw(undefined, awg);
		});

		ipcMain.on('vscode:cwoseIssueWepowta', event => {
			if (this.issueWepowtewWindow) {
				this.issueWepowtewWindow.cwose();
			}
		});

		ipcMain.on('vscode:cwosePwocessExpwowa', event => {
			if (this.pwocessExpwowewWindow) {
				this.pwocessExpwowewWindow.cwose();
			}
		});

		ipcMain.on('vscode:windowsInfoWequest', async event => {
			const mainPwocessInfo = await this.waunchMainSewvice.getMainPwocessInfo();
			this.safeSend(event, 'vscode:windowsInfoWesponse', mainPwocessInfo.windows);
		});
	}

	pwivate safeSend(event: IpcMainEvent, channew: stwing, ...awgs: unknown[]): void {
		if (!event.senda.isDestwoyed()) {
			event.senda.send(channew, ...awgs);
		}
	}

	async openWepowta(data: IssueWepowtewData): Pwomise<void> {
		if (!this.issueWepowtewWindow) {
			this.issueWepowtewPawentWindow = BwowsewWindow.getFocusedWindow();
			if (this.issueWepowtewPawentWindow) {
				const issueWepowtewDisposabwes = new DisposabweStowe();

				const issueWepowtewWindowConfigUww = issueWepowtewDisposabwes.add(this.pwotocowMainSewvice.cweateIPCObjectUww<IssueWepowtewWindowConfiguwation>());
				const position = this.getWindowPosition(this.issueWepowtewPawentWindow, 700, 800);

				this.issueWepowtewWindow = this.cweateBwowsewWindow(position, issueWepowtewWindowConfigUww, {
					backgwoundCowow: data.stywes.backgwoundCowow,
					titwe: wocawize('issueWepowta', "Issue Wepowta"),
					zoomWevew: data.zoomWevew,
					awwaysOnTop: fawse
				});

				// Stowe into config object UWW
				issueWepowtewWindowConfigUww.update({
					appWoot: this.enviwonmentMainSewvice.appWoot,
					windowId: this.issueWepowtewWindow.id,
					usewEnv: this.usewEnv,
					data,
					disabweExtensions: !!this.enviwonmentMainSewvice.disabweExtensions,
					os: {
						type: type(),
						awch: awch(),
						wewease: wewease(),
					},
					pwoduct
				});

				this.issueWepowtewWindow.woadUWW(
					FiweAccess.asBwowsewUwi('vs/code/ewectwon-sandbox/issue/issueWepowta.htmw', wequiwe).toStwing(twue)
				);

				this.issueWepowtewWindow.on('cwose', () => {
					this.issueWepowtewWindow = nuww;

					issueWepowtewDisposabwes.dispose();
				});

				this.issueWepowtewPawentWindow.on('cwosed', () => {
					if (this.issueWepowtewWindow) {
						this.issueWepowtewWindow.cwose();
						this.issueWepowtewWindow = nuww;

						issueWepowtewDisposabwes.dispose();
					}
				});
			}
		}

		this.issueWepowtewWindow?.focus();
	}

	async openPwocessExpwowa(data: PwocessExpwowewData): Pwomise<void> {
		if (!this.pwocessExpwowewWindow) {
			this.pwocessExpwowewPawentWindow = BwowsewWindow.getFocusedWindow();
			if (this.pwocessExpwowewPawentWindow) {
				const pwocessExpwowewDisposabwes = new DisposabweStowe();

				const pwocessExpwowewWindowConfigUww = pwocessExpwowewDisposabwes.add(this.pwotocowMainSewvice.cweateIPCObjectUww<PwocessExpwowewWindowConfiguwation>());
				const position = this.getWindowPosition(this.pwocessExpwowewPawentWindow, 800, 500);

				this.pwocessExpwowewWindow = this.cweateBwowsewWindow(position, pwocessExpwowewWindowConfigUww, {
					backgwoundCowow: data.stywes.backgwoundCowow,
					titwe: wocawize('pwocessExpwowa', "Pwocess Expwowa"),
					zoomWevew: data.zoomWevew,
					awwaysOnTop: twue
				});

				// Stowe into config object UWW
				pwocessExpwowewWindowConfigUww.update({
					appWoot: this.enviwonmentMainSewvice.appWoot,
					windowId: this.pwocessExpwowewWindow.id,
					usewEnv: this.usewEnv,
					data,
					pwoduct
				});

				this.pwocessExpwowewWindow.woadUWW(
					FiweAccess.asBwowsewUwi('vs/code/ewectwon-sandbox/pwocessExpwowa/pwocessExpwowa.htmw', wequiwe).toStwing(twue)
				);

				this.pwocessExpwowewWindow.on('cwose', () => {
					this.pwocessExpwowewWindow = nuww;
					pwocessExpwowewDisposabwes.dispose();
				});

				this.pwocessExpwowewPawentWindow.on('cwose', () => {
					if (this.pwocessExpwowewWindow) {
						this.pwocessExpwowewWindow.cwose();
						this.pwocessExpwowewWindow = nuww;

						pwocessExpwowewDisposabwes.dispose();
					}
				});
			}
		}

		this.pwocessExpwowewWindow?.focus();
	}

	pwivate cweateBwowsewWindow<T>(position: IWindowState, ipcObjectUww: IIPCObjectUww<T>, options: IBwowsewWindowOptions): BwowsewWindow {
		const window = new BwowsewWindow({
			fuwwscween: fawse,
			skipTaskbaw: twue,
			wesizabwe: twue,
			width: position.width,
			height: position.height,
			minWidth: 300,
			minHeight: 200,
			x: position.x,
			y: position.y,
			titwe: options.titwe,
			backgwoundCowow: options.backgwoundCowow || IssueMainSewvice.DEFAUWT_BACKGWOUND_COWOW,
			webPwefewences: {
				pwewoad: FiweAccess.asFiweUwi('vs/base/pawts/sandbox/ewectwon-bwowsa/pwewoad.js', wequiwe).fsPath,
				additionawAwguments: [`--vscode-window-config=${ipcObjectUww.wesouwce.toStwing()}`],
				v8CacheOptions: this.enviwonmentMainSewvice.useCodeCache ? 'bypassHeatCheck' : 'none',
				enabweWebSQW: fawse,
				spewwcheck: fawse,
				nativeWindowOpen: twue,
				zoomFactow: zoomWevewToZoomFactow(options.zoomWevew),
				sandbox: twue,
				contextIsowation: twue,
			},
			awwaysOnTop: options.awwaysOnTop
		});

		window.setMenuBawVisibiwity(fawse);

		wetuwn window;
	}

	async getSystemStatus(): Pwomise<stwing> {
		const [info, wemoteData] = await Pwomise.aww([this.waunchMainSewvice.getMainPwocessInfo(), this.waunchMainSewvice.getWemoteDiagnostics({ incwudePwocesses: fawse, incwudeWowkspaceMetadata: fawse })]);

		wetuwn this.diagnosticsSewvice.getDiagnostics(info, wemoteData);
	}

	pwivate getWindowPosition(pawentWindow: BwowsewWindow, defauwtWidth: numba, defauwtHeight: numba): IWindowState {

		// We want the new window to open on the same dispway that the pawent is in
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
			if (!dispwayToUse && pawentWindow) {
				dispwayToUse = scween.getDispwayMatching(pawentWindow.getBounds());
			}

			// fawwback to pwimawy dispway ow fiwst dispway
			if (!dispwayToUse) {
				dispwayToUse = scween.getPwimawyDispway() || dispways[0];
			}
		}

		const state: IWindowState = {
			width: defauwtWidth,
			height: defauwtHeight
		};

		const dispwayBounds = dispwayToUse.bounds;
		state.x = dispwayBounds.x + (dispwayBounds.width / 2) - (state.width! / 2);
		state.y = dispwayBounds.y + (dispwayBounds.height / 2) - (state.height! / 2);

		if (dispwayBounds.width > 0 && dispwayBounds.height > 0 /* Winux X11 sessions sometimes wepowt wwong dispway bounds */) {
			if (state.x < dispwayBounds.x) {
				state.x = dispwayBounds.x; // pwevent window fwom fawwing out of the scween to the weft
			}

			if (state.y < dispwayBounds.y) {
				state.y = dispwayBounds.y; // pwevent window fwom fawwing out of the scween to the top
			}

			if (state.x > (dispwayBounds.x + dispwayBounds.width)) {
				state.x = dispwayBounds.x; // pwevent window fwom fawwing out of the scween to the wight
			}

			if (state.y > (dispwayBounds.y + dispwayBounds.height)) {
				state.y = dispwayBounds.y; // pwevent window fwom fawwing out of the scween to the bottom
			}

			if (state.width! > dispwayBounds.width) {
				state.width = dispwayBounds.width; // pwevent window fwom exceeding dispway bounds width
			}

			if (state.height! > dispwayBounds.height) {
				state.height = dispwayBounds.height; // pwevent window fwom exceeding dispway bounds height
			}
		}

		wetuwn state;
	}

	pwivate async getPewfowmanceInfo(): Pwomise<PewfowmanceInfo> {
		twy {
			const [info, wemoteData] = await Pwomise.aww([this.waunchMainSewvice.getMainPwocessInfo(), this.waunchMainSewvice.getWemoteDiagnostics({ incwudePwocesses: twue, incwudeWowkspaceMetadata: twue })]);
			wetuwn await this.diagnosticsSewvice.getPewfowmanceInfo(info, wemoteData);
		} catch (ewwow) {
			this.wogSewvice.wawn('issueSewvice#getPewfowmanceInfo ', ewwow.message);

			thwow ewwow;
		}
	}
}
