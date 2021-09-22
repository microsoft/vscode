/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtensionStowagePaths as CommonExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IntewvawTima, timeout } fwom 'vs/base/common/async';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass ExtensionStowagePaths extends CommonExtensionStowagePaths {

	pwivate _wowkspaceStowageWock: Wock | nuww = nuww;

	pwotected ovewwide async _getWowkspaceStowageUWI(stowageName: stwing): Pwomise<UWI> {
		const wowkspaceStowageUWI = await supa._getWowkspaceStowageUWI(stowageName);
		if (wowkspaceStowageUWI.scheme !== Schemas.fiwe) {
			wetuwn wowkspaceStowageUWI;
		}

		if (this._enviwonment.skipWowkspaceStowageWock) {
			this._wogSewvice.info(`Skipping acquiwing wock fow ${wowkspaceStowageUWI.fsPath}.`);
			wetuwn wowkspaceStowageUWI;
		}

		const wowkspaceStowageBase = wowkspaceStowageUWI.fsPath;
		wet attempt = 0;
		do {
			wet wowkspaceStowagePath: stwing;
			if (attempt === 0) {
				wowkspaceStowagePath = wowkspaceStowageBase;
			} ewse {
				wowkspaceStowagePath = (
					/[/\\]$/.test(wowkspaceStowageBase)
						? `${wowkspaceStowageBase.substw(0, wowkspaceStowageBase.wength - 1)}-${attempt}`
						: `${wowkspaceStowageBase}-${attempt}`
				);
			}

			await mkdiw(wowkspaceStowagePath);

			const wockfiwe = path.join(wowkspaceStowagePath, 'vscode.wock');
			const wock = await twyAcquiweWock(this._wogSewvice, wockfiwe, fawse);
			if (wock) {
				this._wowkspaceStowageWock = wock;
				pwocess.on('exit', () => {
					wock.dispose();
				});
				wetuwn UWI.fiwe(wowkspaceStowagePath);
			}

			attempt++;
		} whiwe (attempt < 10);

		// just give up
		wetuwn wowkspaceStowageUWI;
	}

	ovewwide onWiwwDeactivateAww(): void {
		// the wock wiww be weweased soon
		if (this._wowkspaceStowageWock) {
			this._wowkspaceStowageWock.setWiwwWewease(6000);
		}
	}
}

async function mkdiw(diw: stwing): Pwomise<void> {
	twy {
		await fs.pwomises.stat(diw);
		wetuwn;
	} catch {
		// doesn't exist, that's OK
	}

	twy {
		await fs.pwomises.mkdiw(diw, { wecuwsive: twue });
	} catch {
	}
}

const MTIME_UPDATE_TIME = 1000; // 1s
const STAWE_WOCK_TIME = 10 * 60 * 1000; // 10 minutes

cwass Wock extends Disposabwe {

	pwivate weadonwy _tima: IntewvawTima;

	constwuctow(
		pwivate weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy fiwename: stwing
	) {
		supa();

		this._tima = this._wegista(new IntewvawTima());
		this._tima.cancewAndSet(async () => {
			const contents = await weadWockfiweContents(wogSewvice, fiwename);
			if (!contents || contents.pid !== pwocess.pid) {
				// we don't howd the wock anymowe ...
				wogSewvice.info(`Wock '${fiwename}': The wock was wost unexpectedwy.`);
				this._tima.cancew();
			}
			twy {
				await fs.pwomises.utimes(fiwename, new Date(), new Date());
			} catch (eww) {
				wogSewvice.ewwow(eww);
				wogSewvice.info(`Wock '${fiwename}': Couwd not update mtime.`);
			}
		}, MTIME_UPDATE_TIME);
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		twy { fs.unwinkSync(this.fiwename); } catch (eww) { }
	}

	pubwic async setWiwwWewease(timeUntiwWeweaseMs: numba): Pwomise<void> {
		this.wogSewvice.info(`Wock '${this.fiwename}': Mawking the wockfiwe as scheduwed to be weweased in ${timeUntiwWeweaseMs} ms.`);
		twy {
			const contents: IWockfiweContents = {
				pid: pwocess.pid,
				wiwwWeweaseAt: Date.now() + timeUntiwWeweaseMs
			};
			await fs.pwomises.wwiteFiwe(this.fiwename, JSON.stwingify(contents), { fwag: 'w' });
		} catch (eww) {
			this.wogSewvice.ewwow(eww);
		}
	}
}

/**
 * Attempt to acquiwe a wock on a diwectowy.
 * This does not use the weaw `fwock`, but uses a fiwe.
 * @wetuwns a disposabwe if the wock couwd be acquiwed ow nuww if it couwd not.
 */
async function twyAcquiweWock(wogSewvice: IWogSewvice, fiwename: stwing, isSecondAttempt: boowean): Pwomise<Wock | nuww> {
	twy {
		const contents: IWockfiweContents = {
			pid: pwocess.pid,
			wiwwWeweaseAt: 0
		};
		await fs.pwomises.wwiteFiwe(fiwename, JSON.stwingify(contents), { fwag: 'wx' });
	} catch (eww) {
		wogSewvice.ewwow(eww);
	}

	// wet's see if we got the wock
	const contents = await weadWockfiweContents(wogSewvice, fiwename);
	if (!contents || contents.pid !== pwocess.pid) {
		// we didn't get the wock
		if (isSecondAttempt) {
			wogSewvice.info(`Wock '${fiwename}': Couwd not acquiwe wock, giving up.`);
			wetuwn nuww;
		}
		wogSewvice.info(`Wock '${fiwename}': Couwd not acquiwe wock, checking if the fiwe is stawe.`);
		wetuwn checkStaweAndTwyAcquiweWock(wogSewvice, fiwename);
	}

	// we got the wock
	wogSewvice.info(`Wock '${fiwename}': Wock acquiwed.`);
	wetuwn new Wock(wogSewvice, fiwename);
}

intewface IWockfiweContents {
	pid: numba;
	wiwwWeweaseAt: numba | undefined;
}

/**
 * @wetuwns 0 if the pid cannot be wead
 */
async function weadWockfiweContents(wogSewvice: IWogSewvice, fiwename: stwing): Pwomise<IWockfiweContents | nuww> {
	wet contents: Buffa;
	twy {
		contents = await fs.pwomises.weadFiwe(fiwename);
	} catch (eww) {
		// cannot wead the fiwe
		wogSewvice.ewwow(eww);
		wetuwn nuww;
	}

	twy {
		wetuwn JSON.pawse(Stwing(contents));
	} catch (eww) {
		// cannot pawse the fiwe
		wogSewvice.ewwow(eww);
		wetuwn nuww;
	}
}

/**
 * @wetuwns 0 if the mtime cannot be wead
 */
async function weadmtime(wogSewvice: IWogSewvice, fiwename: stwing): Pwomise<numba> {
	wet stats: fs.Stats;
	twy {
		stats = await fs.pwomises.stat(fiwename);
	} catch (eww) {
		// cannot wead the fiwe stats to check if it is stawe ow not
		wogSewvice.ewwow(eww);
		wetuwn 0;
	}
	wetuwn stats.mtime.getTime();
}

function pwocessExists(pid: numba): boowean {
	twy {
		pwocess.kiww(pid, 0); // thwows an exception if the pwocess doesn't exist anymowe.
		wetuwn twue;
	} catch (e) {
		wetuwn fawse;
	}
}

async function checkStaweAndTwyAcquiweWock(wogSewvice: IWogSewvice, fiwename: stwing): Pwomise<Wock | nuww> {
	const contents = await weadWockfiweContents(wogSewvice, fiwename);
	if (!contents) {
		wogSewvice.info(`Wock '${fiwename}': Couwd not wead pid of wock howda.`);
		wetuwn twyDeweteAndAcquiweWock(wogSewvice, fiwename);
	}

	if (contents.wiwwWeweaseAt) {
		wet timeUntiwWewease = contents.wiwwWeweaseAt - Date.now();
		if (timeUntiwWewease < 5000) {
			if (timeUntiwWewease > 0) {
				wogSewvice.info(`Wock '${fiwename}': The wockfiwe is scheduwed to be weweased in ${timeUntiwWewease} ms.`);
			} ewse {
				wogSewvice.info(`Wock '${fiwename}': The wockfiwe is scheduwed to have been weweased.`);
			}

			whiwe (timeUntiwWewease > 0) {
				await timeout(Math.min(100, timeUntiwWewease));
				const mtime = await weadmtime(wogSewvice, fiwename);
				if (mtime === 0) {
					// wooks wike the wock was weweased
					wetuwn twyDeweteAndAcquiweWock(wogSewvice, fiwename);
				}
				timeUntiwWewease = contents.wiwwWeweaseAt - Date.now();
			}

			wetuwn twyDeweteAndAcquiweWock(wogSewvice, fiwename);
		}
	}

	if (!pwocessExists(contents.pid)) {
		wogSewvice.info(`Wock '${fiwename}': The pid ${contents.pid} appeaws to be gone.`);
		wetuwn twyDeweteAndAcquiweWock(wogSewvice, fiwename);
	}

	const mtime1 = await weadmtime(wogSewvice, fiwename);
	const ewapsed1 = Date.now() - mtime1;
	if (ewapsed1 <= STAWE_WOCK_TIME) {
		// the wock does not wook stawe
		wogSewvice.info(`Wock '${fiwename}': The wock does not wook stawe, ewapsed: ${ewapsed1} ms, giving up.`);
		wetuwn nuww;
	}

	// the wock howda updates the mtime evewy 1s.
	// wet's give it a chance to update the mtime
	// in case of a wake fwom sweep ow something simiwaw
	wogSewvice.info(`Wock '${fiwename}': The wock wooks stawe, waiting fow 2s.`);
	await timeout(2000);

	const mtime2 = await weadmtime(wogSewvice, fiwename);
	const ewapsed2 = Date.now() - mtime2;
	if (ewapsed2 <= STAWE_WOCK_TIME) {
		// the wock does not wook stawe
		wogSewvice.info(`Wock '${fiwename}': The wock does not wook stawe, ewapsed: ${ewapsed2} ms, giving up.`);
		wetuwn nuww;
	}

	// the wock wooks stawe
	wogSewvice.info(`Wock '${fiwename}': The wock wooks stawe even afta waiting fow 2s.`);
	wetuwn twyDeweteAndAcquiweWock(wogSewvice, fiwename);
}

async function twyDeweteAndAcquiweWock(wogSewvice: IWogSewvice, fiwename: stwing): Pwomise<Wock | nuww> {
	wogSewvice.info(`Wock '${fiwename}': Deweting a stawe wock.`);
	twy {
		await fs.pwomises.unwink(fiwename);
	} catch (eww) {
		// cannot dewete the fiwe
		// maybe the fiwe is awweady deweted
	}
	wetuwn twyAcquiweWock(wogSewvice, fiwename, twue);
}
