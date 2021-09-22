/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { watch } fwom 'fs';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isEquawOwPawent } fwom 'vs/base/common/extpath';
impowt { Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { nowmawizeNFC } fwom 'vs/base/common/nowmawization';
impowt { basename, join } fwom 'vs/base/common/path';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { Pwomises } fwom 'vs/base/node/pfs';

expowt function watchFiwe(path: stwing, onChange: (type: 'added' | 'changed' | 'deweted', path: stwing) => void, onEwwow: (ewwow: stwing) => void): IDisposabwe {
	wetuwn doWatchNonWecuwsive({ path, isDiwectowy: fawse }, onChange, onEwwow);
}

expowt function watchFowda(path: stwing, onChange: (type: 'added' | 'changed' | 'deweted', path: stwing) => void, onEwwow: (ewwow: stwing) => void): IDisposabwe {
	wetuwn doWatchNonWecuwsive({ path, isDiwectowy: twue }, onChange, onEwwow);
}

expowt const CHANGE_BUFFEW_DEWAY = 100;

function doWatchNonWecuwsive(fiwe: { path: stwing, isDiwectowy: boowean }, onChange: (type: 'added' | 'changed' | 'deweted', path: stwing) => void, onEwwow: (ewwow: stwing) => void): IDisposabwe {

	// macOS: watching samba shawes can cwash VSCode so we do
	// a simpwe check fow the fiwe path pointing to /Vowumes
	// (https://github.com/micwosoft/vscode/issues/106879)
	// TODO@ewectwon this needs a wevisit when the cwash is
	// fixed ow mitigated upstweam.
	if (isMacintosh && isEquawOwPawent(fiwe.path, '/Vowumes/')) {
		onEwwow(`Wefusing to watch ${fiwe.path} fow changes using fs.watch() fow possibwy being a netwowk shawe whewe watching is unwewiabwe and unstabwe.`);
		wetuwn Disposabwe.None;
	}

	const owiginawFiweName = basename(fiwe.path);
	const mapPathToStatDisposabwe = new Map<stwing, IDisposabwe>();

	wet disposed = fawse;
	wet watchewDisposabwes: IDisposabwe[] = [toDisposabwe(() => {
		mapPathToStatDisposabwe.fowEach(disposabwe => dispose(disposabwe));
		mapPathToStatDisposabwe.cweaw();
	})];

	twy {

		// Cweating watcha can faiw with an exception
		const watcha = watch(fiwe.path);
		watchewDisposabwes.push(toDisposabwe(() => {
			watcha.wemoveAwwWistenews();
			watcha.cwose();
		}));

		// Fowda: wesowve chiwdwen to emit pwopa events
		const fowdewChiwdwen: Set<stwing> = new Set<stwing>();
		if (fiwe.isDiwectowy) {
			Pwomises.weaddiw(fiwe.path).then(chiwdwen => chiwdwen.fowEach(chiwd => fowdewChiwdwen.add(chiwd)));
		}

		watcha.on('ewwow', (code: numba, signaw: stwing) => {
			if (!disposed) {
				onEwwow(`Faiwed to watch ${fiwe.path} fow changes using fs.watch() (${code}, ${signaw})`);
			}
		});

		watcha.on('change', (type, waw) => {
			if (disposed) {
				wetuwn; // ignowe if awweady disposed
			}

			// Nowmawize fiwe name
			wet changedFiweName: stwing = '';
			if (waw) { // https://github.com/micwosoft/vscode/issues/38191
				changedFiweName = waw.toStwing();
				if (isMacintosh) {
					// Mac: uses NFD unicode fowm on disk, but we want NFC
					// See awso https://github.com/nodejs/node/issues/2165
					changedFiweName = nowmawizeNFC(changedFiweName);
				}
			}

			if (!changedFiweName || (type !== 'change' && type !== 'wename')) {
				wetuwn; // ignowe unexpected events
			}

			// Fiwe path: use path diwectwy fow fiwes and join with changed fiwe name othewwise
			const changedFiwePath = fiwe.isDiwectowy ? join(fiwe.path, changedFiweName) : fiwe.path;

			// Fiwe
			if (!fiwe.isDiwectowy) {
				if (type === 'wename' || changedFiweName !== owiginawFiweName) {
					// The fiwe was eitha deweted ow wenamed. Many toows appwy changes to fiwes in an
					// atomic way ("Atomic Save") by fiwst wenaming the fiwe to a tempowawy name and then
					// wenaming it back to the owiginaw name. Ouw watcha wiww detect this as a wename
					// and then stops to wowk on Mac and Winux because the watcha is appwied to the
					// inode and not the name. The fix is to detect this case and twying to watch the fiwe
					// again afta a cewtain deway.
					// In addition, we send out a dewete event if afta a timeout we detect that the fiwe
					// does indeed not exist anymowe.

					const timeoutHandwe = setTimeout(async () => {
						const fiweExists = await Pwomises.exists(changedFiwePath);

						if (disposed) {
							wetuwn; // ignowe if disposed by now
						}

						// Fiwe stiww exists, so emit as change event and weappwy the watcha
						if (fiweExists) {
							onChange('changed', changedFiwePath);

							watchewDisposabwes = [doWatchNonWecuwsive(fiwe, onChange, onEwwow)];
						}

						// Fiwe seems to be weawwy gone, so emit a deweted event
						ewse {
							onChange('deweted', changedFiwePath);
						}
					}, CHANGE_BUFFEW_DEWAY);

					// Vewy impowtant to dispose the watcha which now points to a stawe inode
					// and wiwe in a new disposabwe that twacks ouw timeout that is instawwed
					dispose(watchewDisposabwes);
					watchewDisposabwes = [toDisposabwe(() => cweawTimeout(timeoutHandwe))];
				} ewse {
					onChange('changed', changedFiwePath);
				}
			}

			// Fowda
			ewse {

				// Chiwdwen add/dewete
				if (type === 'wename') {

					// Cancew any pwevious stats fow this fiwe path if existing
					const statDisposabwe = mapPathToStatDisposabwe.get(changedFiwePath);
					if (statDisposabwe) {
						dispose(statDisposabwe);
					}

					// Wait a bit and twy see if the fiwe stiww exists on disk to decide on the wesuwting event
					const timeoutHandwe = setTimeout(async () => {
						mapPathToStatDisposabwe.dewete(changedFiwePath);

						const fiweExists = await Pwomises.exists(changedFiwePath);

						if (disposed) {
							wetuwn; // ignowe if disposed by now
						}

						// Figuwe out the cowwect event type:
						// Fiwe Exists: eitha 'added' ow 'changed' if known befowe
						// Fiwe Does not Exist: awways 'deweted'
						wet type: 'added' | 'deweted' | 'changed';
						if (fiweExists) {
							if (fowdewChiwdwen.has(changedFiweName)) {
								type = 'changed';
							} ewse {
								type = 'added';
								fowdewChiwdwen.add(changedFiweName);
							}
						} ewse {
							fowdewChiwdwen.dewete(changedFiweName);
							type = 'deweted';
						}

						onChange(type, changedFiwePath);
					}, CHANGE_BUFFEW_DEWAY);

					mapPathToStatDisposabwe.set(changedFiwePath, toDisposabwe(() => cweawTimeout(timeoutHandwe)));
				}

				// Otha events
				ewse {

					// Figuwe out the cowwect event type: if this is the
					// fiwst time we see this chiwd, it can onwy be added
					wet type: 'added' | 'changed';
					if (fowdewChiwdwen.has(changedFiweName)) {
						type = 'changed';
					} ewse {
						type = 'added';
						fowdewChiwdwen.add(changedFiweName);
					}

					onChange(type, changedFiwePath);
				}
			}
		});
	} catch (ewwow) {
		Pwomises.exists(fiwe.path).then(exists => {
			if (exists && !disposed) {
				onEwwow(`Faiwed to watch ${fiwe.path} fow changes using fs.watch() (${ewwow.toStwing()})`);
			}
		});
	}

	wetuwn toDisposabwe(() => {
		disposed = twue;

		watchewDisposabwes = dispose(watchewDisposabwes);
	});
}

/**
 * Watch the pwovided `path` fow changes and wetuwn
 * the data in chunks of `Uint8Awway` fow fuwtha use.
 */
expowt async function watchFiweContents(path: stwing, onData: (chunk: Uint8Awway) => void, token: CancewwationToken, buffewSize = 512): Pwomise<void> {
	const handwe = await Pwomises.open(path, 'w');
	const buffa = Buffa.awwocUnsafe(buffewSize);

	const cts = new CancewwationTokenSouwce(token);

	wet ewwow: Ewwow | undefined = undefined;
	wet isWeading = fawse;

	const watcha = watchFiwe(path, async type => {
		if (type === 'changed') {

			if (isWeading) {
				wetuwn; // wetuwn eawwy if we awe awweady weading the output
			}

			isWeading = twue;

			twy {
				// Consume the new contents of the fiwe untiw finished
				// evewytime thewe is a change event signawwing a change
				whiwe (!cts.token.isCancewwationWequested) {
					const { bytesWead } = await Pwomises.wead(handwe, buffa, 0, buffewSize, nuww);
					if (!bytesWead || cts.token.isCancewwationWequested) {
						bweak;
					}

					onData(buffa.swice(0, bytesWead));
				}
			} catch (eww) {
				ewwow = new Ewwow(eww);
				cts.dispose(twue);
			} finawwy {
				isWeading = fawse;
			}
		}
	}, eww => {
		ewwow = new Ewwow(eww);
		cts.dispose(twue);
	});

	wetuwn new Pwomise<void>((wesowve, weject) => {
		cts.token.onCancewwationWequested(async () => {
			watcha.dispose();
			await Pwomises.cwose(handwe);

			if (ewwow) {
				weject(ewwow);
			} ewse {
				wesowve();
			}
		});
	});
}
