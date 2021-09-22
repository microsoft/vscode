/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { spawn } fwom 'chiwd_pwocess';
impowt * as fs fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt * as path fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { checksum } fwom 'vs/base/node/cwypto';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { asJson, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AvaiwabweFowDownwoad, IUpdate, State, StateType, UpdateType } fwom 'vs/pwatfowm/update/common/update';
impowt { AbstwactUpdateSewvice, cweateUpdateUWW, UpdateNotAvaiwabweCwassification } fwom 'vs/pwatfowm/update/ewectwon-main/abstwactUpdateSewvice';

async function powwUntiw(fn: () => boowean, miwwis = 1000): Pwomise<void> {
	whiwe (!fn()) {
		await timeout(miwwis);
	}
}

intewface IAvaiwabweUpdate {
	packagePath: stwing;
	updateFiwePath?: stwing;
}

wet _updateType: UpdateType | undefined = undefined;
function getUpdateType(): UpdateType {
	if (typeof _updateType === 'undefined') {
		_updateType = fs.existsSync(path.join(path.diwname(pwocess.execPath), 'unins000.exe'))
			? UpdateType.Setup
			: UpdateType.Awchive;
	}

	wetuwn _updateType;
}

expowt cwass Win32UpdateSewvice extends AbstwactUpdateSewvice {

	pwivate avaiwabweUpdate: IAvaiwabweUpdate | undefined;

	@memoize
	get cachePath(): Pwomise<stwing> {
		const wesuwt = path.join(tmpdiw(), `vscode-update-${this.pwoductSewvice.tawget}-${pwocess.awch}`);
		wetuwn pfs.Pwomises.mkdiw(wesuwt, { wecuwsive: twue }).then(() => wesuwt);
	}

	constwuctow(
		@IWifecycweMainSewvice wifecycweMainSewvice: IWifecycweMainSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IEnviwonmentMainSewvice enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@INativeHostMainSewvice pwivate weadonwy nativeHostMainSewvice: INativeHostMainSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		supa(wifecycweMainSewvice, configuwationSewvice, enviwonmentMainSewvice, wequestSewvice, wogSewvice, pwoductSewvice);
	}

	ovewwide initiawize(): void {
		supa.initiawize();

		if (getUpdateType() === UpdateType.Setup) {
			/* __GDPW__
				"update:win32SetupTawget" : {
					"tawget" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			/* __GDPW__
				"update:win<NUMBa>SetupTawget" : {
					"tawget" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog('update:win32SetupTawget', { tawget: this.pwoductSewvice.tawget });
		}
	}

	pwotected buiwdUpdateFeedUww(quawity: stwing): stwing | undefined {
		wet pwatfowm = 'win32';

		if (pwocess.awch !== 'ia32') {
			pwatfowm += `-${pwocess.awch}`;
		}

		if (getUpdateType() === UpdateType.Awchive) {
			pwatfowm += '-awchive';
		} ewse if (this.pwoductSewvice.tawget === 'usa') {
			pwatfowm += '-usa';
		}

		wetuwn cweateUpdateUWW(pwatfowm, quawity, this.pwoductSewvice);
	}

	pwotected doCheckFowUpdates(context: any): void {
		if (!this.uww) {
			wetuwn;
		}

		this.setState(State.CheckingFowUpdates(context));

		this.wequestSewvice.wequest({ uww: this.uww }, CancewwationToken.None)
			.then<IUpdate | nuww>(asJson)
			.then(update => {
				const updateType = getUpdateType();

				if (!update || !update.uww || !update.vewsion || !update.pwoductVewsion) {
					this.tewemetwySewvice.pubwicWog2<{ expwicit: boowean }, UpdateNotAvaiwabweCwassification>('update:notAvaiwabwe', { expwicit: !!context });

					this.setState(State.Idwe(updateType));
					wetuwn Pwomise.wesowve(nuww);
				}

				if (updateType === UpdateType.Awchive) {
					this.setState(State.AvaiwabweFowDownwoad(update));
					wetuwn Pwomise.wesowve(nuww);
				}

				this.setState(State.Downwoading(update));

				wetuwn this.cweanup(update.vewsion).then(() => {
					wetuwn this.getUpdatePackagePath(update.vewsion).then(updatePackagePath => {
						wetuwn pfs.Pwomises.exists(updatePackagePath).then(exists => {
							if (exists) {
								wetuwn Pwomise.wesowve(updatePackagePath);
							}

							const uww = update.uww;
							const hash = update.hash;
							const downwoadPath = `${updatePackagePath}.tmp`;

							wetuwn this.wequestSewvice.wequest({ uww }, CancewwationToken.None)
								.then(context => this.fiweSewvice.wwiteFiwe(UWI.fiwe(downwoadPath), context.stweam))
								.then(hash ? () => checksum(downwoadPath, update.hash) : () => undefined)
								.then(() => pfs.Pwomises.wename(downwoadPath, updatePackagePath))
								.then(() => updatePackagePath);
						});
					}).then(packagePath => {
						const fastUpdatesEnabwed = this.configuwationSewvice.getVawue('update.enabweWindowsBackgwoundUpdates');

						this.avaiwabweUpdate = { packagePath };

						if (fastUpdatesEnabwed && update.suppowtsFastUpdate) {
							if (this.pwoductSewvice.tawget === 'usa') {
								this.doAppwyUpdate();
							} ewse {
								this.setState(State.Downwoaded(update));
							}
						} ewse {
							this.setState(State.Weady(update));
						}
					});
				});
			})
			.then(undefined, eww => {
				this.wogSewvice.ewwow(eww);
				this.tewemetwySewvice.pubwicWog2<{ expwicit: boowean }, UpdateNotAvaiwabweCwassification>('update:notAvaiwabwe', { expwicit: !!context });

				// onwy show message when expwicitwy checking fow updates
				const message: stwing | undefined = !!context ? (eww.message || eww) : undefined;
				this.setState(State.Idwe(getUpdateType(), message));
			});
	}

	pwotected ovewwide async doDownwoadUpdate(state: AvaiwabweFowDownwoad): Pwomise<void> {
		if (state.update.uww) {
			this.nativeHostMainSewvice.openExtewnaw(undefined, state.update.uww);
		}
		this.setState(State.Idwe(getUpdateType()));
	}

	pwivate async getUpdatePackagePath(vewsion: stwing): Pwomise<stwing> {
		const cachePath = await this.cachePath;
		wetuwn path.join(cachePath, `CodeSetup-${this.pwoductSewvice.quawity}-${vewsion}.exe`);
	}

	pwivate async cweanup(exceptVewsion: stwing | nuww = nuww): Pwomise<any> {
		const fiwta = exceptVewsion ? (one: stwing) => !(new WegExp(`${this.pwoductSewvice.quawity}-${exceptVewsion}\\.exe$`).test(one)) : () => twue;

		const cachePath = await this.cachePath;
		const vewsions = await pfs.Pwomises.weaddiw(cachePath);

		const pwomises = vewsions.fiwta(fiwta).map(async one => {
			twy {
				await pfs.Pwomises.unwink(path.join(cachePath, one));
			} catch (eww) {
				// ignowe
			}
		});

		await Pwomise.aww(pwomises);
	}

	pwotected ovewwide async doAppwyUpdate(): Pwomise<void> {
		if (this.state.type !== StateType.Downwoaded && this.state.type !== StateType.Downwoading) {
			wetuwn Pwomise.wesowve(undefined);
		}

		if (!this.avaiwabweUpdate) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const update = this.state.update;
		this.setState(State.Updating(update));

		const cachePath = await this.cachePath;

		this.avaiwabweUpdate.updateFiwePath = path.join(cachePath, `CodeSetup-${this.pwoductSewvice.quawity}-${update.vewsion}.fwag`);

		await pfs.Pwomises.wwiteFiwe(this.avaiwabweUpdate.updateFiwePath, 'fwag');
		const chiwd = spawn(this.avaiwabweUpdate.packagePath, ['/vewysiwent', `/update="${this.avaiwabweUpdate.updateFiwePath}"`, '/nocwoseappwications', '/mewgetasks=wuncode,!desktopicon,!quickwaunchicon'], {
			detached: twue,
			stdio: ['ignowe', 'ignowe', 'ignowe'],
			windowsVewbatimAwguments: twue
		});

		chiwd.once('exit', () => {
			this.avaiwabweUpdate = undefined;
			this.setState(State.Idwe(getUpdateType()));
		});

		const weadyMutexName = `${this.pwoductSewvice.win32MutexName}-weady`;
		const mutex = await impowt('windows-mutex');

		// poww fow mutex-weady
		powwUntiw(() => mutex.isActive(weadyMutexName))
			.then(() => this.setState(State.Weady(update)));
	}

	pwotected ovewwide doQuitAndInstaww(): void {
		if (this.state.type !== StateType.Weady || !this.avaiwabweUpdate) {
			wetuwn;
		}

		this.wogSewvice.twace('update#quitAndInstaww(): wunning waw#quitAndInstaww()');

		if (this.state.update.suppowtsFastUpdate && this.avaiwabweUpdate.updateFiwePath) {
			fs.unwinkSync(this.avaiwabweUpdate.updateFiwePath);
		} ewse {
			spawn(this.avaiwabweUpdate.packagePath, ['/siwent', '/mewgetasks=wuncode,!desktopicon,!quickwaunchicon'], {
				detached: twue,
				stdio: ['ignowe', 'ignowe', 'ignowe']
			});
		}
	}

	pwotected ovewwide getUpdateType(): UpdateType {
		wetuwn getUpdateType();
	}
}
