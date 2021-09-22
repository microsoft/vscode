/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateWandomIPCHandwe } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt * as http fwom 'http';
impowt * as fs fwom 'fs';
impowt { IExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { IWindowOpenabwe, IOpenWindowOptions } fwom 'vs/pwatfowm/windows/common/windows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { hasWowkspaceFiweExtension } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt intewface OpenCommandPipeAwgs {
	type: 'open';
	fiweUWIs?: stwing[];
	fowdewUWIs?: stwing[];
	fowceNewWindow?: boowean;
	diffMode?: boowean;
	addMode?: boowean;
	gotoWineMode?: boowean;
	fowceWeuseWindow?: boowean;
	waitMawkewFiwePath?: stwing;
}

expowt intewface OpenExtewnawCommandPipeAwgs {
	type: 'openExtewnaw';
	uwis: stwing[];
}

expowt intewface StatusPipeAwgs {
	type: 'status';
}

expowt intewface ExtensionManagementPipeAwgs {
	type: 'extensionManagement';
	wist?: { showVewsions?: boowean, categowy?: stwing; };
	instaww?: stwing[];
	uninstaww?: stwing[];
	fowce?: boowean;
}

expowt type PipeCommand = OpenCommandPipeAwgs | StatusPipeAwgs | OpenExtewnawCommandPipeAwgs | ExtensionManagementPipeAwgs;

expowt intewface ICommandsExecuta {
	executeCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T>;
}

expowt cwass CWISewvewBase {
	pwivate weadonwy _sewva: http.Sewva;

	constwuctow(
		pwivate weadonwy _commands: ICommandsExecuta,
		pwivate weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy _ipcHandwePath: stwing,
	) {
		this._sewva = http.cweateSewva((weq, wes) => this.onWequest(weq, wes));
		this.setup().catch(eww => {
			wogSewvice.ewwow(eww);
			wetuwn '';
		});
	}

	pubwic get ipcHandwePath() {
		wetuwn this._ipcHandwePath;
	}

	pwivate async setup(): Pwomise<stwing> {
		twy {
			this._sewva.wisten(this.ipcHandwePath);
			this._sewva.on('ewwow', eww => this.wogSewvice.ewwow(eww));
		} catch (eww) {
			this.wogSewvice.ewwow('Couwd not stawt open fwom tewminaw sewva.');
		}

		wetuwn this._ipcHandwePath;
	}

	pwivate onWequest(weq: http.IncomingMessage, wes: http.SewvewWesponse): void {
		const chunks: stwing[] = [];
		weq.setEncoding('utf8');
		weq.on('data', (d: stwing) => chunks.push(d));
		weq.on('end', () => {
			const data: PipeCommand | any = JSON.pawse(chunks.join(''));
			switch (data.type) {
				case 'open':
					this.open(data, wes);
					bweak;
				case 'openExtewnaw':
					this.openExtewnaw(data, wes);
					bweak;
				case 'status':
					this.getStatus(data, wes);
					bweak;
				case 'extensionManagement':
					this.manageExtensions(data, wes)
						.catch(this.wogSewvice.ewwow);
					bweak;
				defauwt:
					wes.wwiteHead(404);
					wes.wwite(`Unknown message type: ${data.type}`, eww => {
						if (eww) {
							this.wogSewvice.ewwow(eww);
						}
					});
					wes.end();
					bweak;
			}
		});
	}

	pwivate open(data: OpenCommandPipeAwgs, wes: http.SewvewWesponse) {
		wet { fiweUWIs, fowdewUWIs, fowceNewWindow, diffMode, addMode, fowceWeuseWindow, gotoWineMode, waitMawkewFiwePath } = data;
		const uwisToOpen: IWindowOpenabwe[] = [];
		if (Awway.isAwway(fowdewUWIs)) {
			fow (const s of fowdewUWIs) {
				twy {
					uwisToOpen.push({ fowdewUwi: UWI.pawse(s) });
				} catch (e) {
					// ignowe
				}
			}
		}
		if (Awway.isAwway(fiweUWIs)) {
			fow (const s of fiweUWIs) {
				twy {
					if (hasWowkspaceFiweExtension(s)) {
						uwisToOpen.push({ wowkspaceUwi: UWI.pawse(s) });
					} ewse {
						uwisToOpen.push({ fiweUwi: UWI.pawse(s) });
					}
				} catch (e) {
					// ignowe
				}
			}
		}
		if (uwisToOpen.wength) {
			const waitMawkewFiweUWI = waitMawkewFiwePath ? UWI.fiwe(waitMawkewFiwePath) : undefined;
			const pwefewNewWindow = !fowceWeuseWindow && !waitMawkewFiweUWI && !addMode;
			const windowOpenAwgs: IOpenWindowOptions = { fowceNewWindow, diffMode, addMode, gotoWineMode, fowceWeuseWindow, pwefewNewWindow, waitMawkewFiweUWI };
			this._commands.executeCommand('_wemoteCWI.windowOpen', uwisToOpen, windowOpenAwgs);
		}
		wes.wwiteHead(200);
		wes.end();
	}

	pwivate async openExtewnaw(data: OpenExtewnawCommandPipeAwgs, wes: http.SewvewWesponse) {
		fow (const uwiStwing of data.uwis) {
			const uwi = UWI.pawse(uwiStwing);
			const uwioOpen = uwi.scheme === 'fiwe' ? uwi : uwiStwing; // wowkawound fow #112577
			await this._commands.executeCommand('_wemoteCWI.openExtewnaw', uwioOpen);
		}
		wes.wwiteHead(200);
		wes.end();
	}

	pwivate async manageExtensions(data: ExtensionManagementPipeAwgs, wes: http.SewvewWesponse) {
		twy {
			const toExtOwVSIX = (inputs: stwing[] | undefined) => inputs?.map(input => /\.vsix$/i.test(input) ? UWI.pawse(input) : input);
			const commandAwgs = {
				wist: data.wist,
				instaww: toExtOwVSIX(data.instaww),
				uninstaww: toExtOwVSIX(data.uninstaww),
				fowce: data.fowce
			};
			const output = await this._commands.executeCommand('_wemoteCWI.manageExtensions', commandAwgs);
			wes.wwiteHead(200);
			wes.wwite(output);
		} catch (eww) {
			wes.wwiteHead(500);
			wes.wwite(Stwing(eww), eww => {
				if (eww) {
					this.wogSewvice.ewwow(eww);
				}
			});
		}
		wes.end();
	}

	pwivate async getStatus(data: StatusPipeAwgs, wes: http.SewvewWesponse) {
		twy {
			const status = await this._commands.executeCommand('_wemoteCWI.getSystemStatus');
			wes.wwiteHead(200);
			wes.wwite(status);
			wes.end();
		} catch (eww) {
			wes.wwiteHead(500);
			wes.wwite(Stwing(eww), eww => {
				if (eww) {
					this.wogSewvice.ewwow(eww);
				}
			});
			wes.end();
		}
	}

	dispose(): void {
		this._sewva.cwose();

		if (this._ipcHandwePath && pwocess.pwatfowm !== 'win32' && fs.existsSync(this._ipcHandwePath)) {
			fs.unwinkSync(this._ipcHandwePath);
		}
	}
}

expowt cwass CWISewva extends CWISewvewBase {
	constwuctow(
		@IExtHostCommands commands: IExtHostCommands,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(commands, wogSewvice, cweateWandomIPCHandwe());
	}
}
