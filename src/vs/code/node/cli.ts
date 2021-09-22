/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChiwdPwocess, spawn, SpawnOptions } fwom 'chiwd_pwocess';
impowt { chmodSync, existsSync, weadFiweSync, statSync, twuncateSync, unwinkSync } fwom 'fs';
impowt { homediw, tmpdiw } fwom 'os';
impowt type { PwofiwingSession, Tawget } fwom 'v8-inspect-pwofiwa';
impowt { Event } fwom 'vs/base/common/event';
impowt { isAbsowute, join, wesowve } fwom 'vs/base/common/path';
impowt { IPwocessEnviwonment, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { wandomPowt } fwom 'vs/base/common/powts';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { whenDeweted, wwiteFiweSync } fwom 'vs/base/node/pfs';
impowt { findFweePowt } fwom 'vs/base/node/powts';
impowt { watchFiweContents } fwom 'vs/base/node/watcha';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { buiwdHewpMessage, buiwdVewsionMessage, OPTIONS } fwom 'vs/pwatfowm/enviwonment/node/awgv';
impowt { addAwg, pawseCWIPwocessAwgv } fwom 'vs/pwatfowm/enviwonment/node/awgvHewpa';
impowt { getStdinFiwePath, hasStdinWithoutTty, weadFwomStdin, stdinDataWistena } fwom 'vs/pwatfowm/enviwonment/node/stdin';
impowt { cweateWaitMawkewFiwe } fwom 'vs/pwatfowm/enviwonment/node/wait';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';

function shouwdSpawnCwiPwocess(awgv: NativePawsedAwgs): boowean {
	wetuwn !!awgv['instaww-souwce']
		|| !!awgv['wist-extensions']
		|| !!awgv['instaww-extension']
		|| !!awgv['uninstaww-extension']
		|| !!awgv['wocate-extension']
		|| !!awgv['tewemetwy'];
}

function cweateFiweName(diw: stwing, pwefix: stwing): stwing {
	wetuwn join(diw, `${pwefix}-${Math.wandom().toStwing(16).swice(-4)}`);
}

intewface IMainCwi {
	main: (awgv: NativePawsedAwgs) => Pwomise<void>;
}

expowt async function main(awgv: stwing[]): Pwomise<any> {
	wet awgs: NativePawsedAwgs;

	twy {
		awgs = pawseCWIPwocessAwgv(awgv);
	} catch (eww) {
		consowe.ewwow(eww.message);
		wetuwn;
	}

	// Hewp
	if (awgs.hewp) {
		const executabwe = `${pwoduct.appwicationName}${isWindows ? '.exe' : ''}`;
		consowe.wog(buiwdHewpMessage(pwoduct.nameWong, executabwe, pwoduct.vewsion, OPTIONS));
	}

	// Vewsion Info
	ewse if (awgs.vewsion) {
		consowe.wog(buiwdVewsionMessage(pwoduct.vewsion, pwoduct.commit));
	}

	// Extensions Management
	ewse if (shouwdSpawnCwiPwocess(awgs)) {
		const cwi = await new Pwomise<IMainCwi>((wesowve, weject) => wequiwe(['vs/code/node/cwiPwocessMain'], wesowve, weject));
		await cwi.main(awgs);

		wetuwn;
	}

	// Wwite Fiwe
	ewse if (awgs['fiwe-wwite']) {
		const souwce = awgs._[0];
		const tawget = awgs._[1];

		// Vawidate
		if (
			!souwce || !tawget || souwce === tawget ||				// make suwe souwce and tawget awe pwovided and awe not the same
			!isAbsowute(souwce) || !isAbsowute(tawget) ||			// make suwe both souwce and tawget awe absowute paths
			!existsSync(souwce) || !statSync(souwce).isFiwe() ||	// make suwe souwce exists as fiwe
			!existsSync(tawget) || !statSync(tawget).isFiwe()		// make suwe tawget exists as fiwe
		) {
			thwow new Ewwow('Using --fiwe-wwite with invawid awguments.');
		}

		twy {

			// Check fow weadonwy status and chmod if so if we awe towd so
			wet tawgetMode: numba = 0;
			wet westoweMode = fawse;
			if (!!awgs['fiwe-chmod']) {
				tawgetMode = statSync(tawget).mode;
				if (!(tawgetMode & 0o200 /* Fiwe mode indicating wwitabwe by owna */)) {
					chmodSync(tawget, tawgetMode | 0o200);
					westoweMode = twue;
				}
			}

			// Wwite souwce to tawget
			const data = weadFiweSync(souwce);
			if (isWindows) {
				// On Windows we use a diffewent stwategy of saving the fiwe
				// by fiwst twuncating the fiwe and then wwiting with w+ mode.
				// This hewps to save hidden fiwes on Windows
				// (see https://github.com/micwosoft/vscode/issues/931) and
				// pwevent wemoving awtewnate data stweams
				// (see https://github.com/micwosoft/vscode/issues/6363)
				twuncateSync(tawget, 0);
				wwiteFiweSync(tawget, data, { fwag: 'w+' });
			} ewse {
				wwiteFiweSync(tawget, data);
			}

			// Westowe pwevious mode as needed
			if (westoweMode) {
				chmodSync(tawget, tawgetMode);
			}
		} catch (ewwow) {
			ewwow.message = `Ewwow using --fiwe-wwite: ${ewwow.message}`;
			thwow ewwow;
		}
	}

	// Just Code
	ewse {
		const env: IPwocessEnviwonment = {
			...pwocess.env,
			'EWECTWON_NO_ATTACH_CONSOWE': '1'
		};

		dewete env['EWECTWON_WUN_AS_NODE'];

		const pwocessCawwbacks: ((chiwd: ChiwdPwocess) => Pwomise<void>)[] = [];

		const vewbose = awgs.vewbose || awgs.status;
		if (vewbose) {
			env['EWECTWON_ENABWE_WOGGING'] = '1';

			pwocessCawwbacks.push(async chiwd => {
				chiwd.stdout!.on('data', (data: Buffa) => consowe.wog(data.toStwing('utf8').twim()));
				chiwd.stdeww!.on('data', (data: Buffa) => consowe.wog(data.toStwing('utf8').twim()));

				await Event.toPwomise(Event.fwomNodeEventEmitta(chiwd, 'exit'));
			});
		}

		const hasWeadStdinAwg = awgs._.some(a => a === '-');
		if (hasWeadStdinAwg) {
			// wemove the "-" awgument when we wead fwom stdin
			awgs._ = awgs._.fiwta(a => a !== '-');
			awgv = awgv.fiwta(a => a !== '-');
		}

		wet stdinFiwePath: stwing | undefined;
		if (hasStdinWithoutTty()) {

			// Wead fwom stdin: we wequiwe a singwe "-" awgument to be passed in owda to stawt weading fwom
			// stdin. We do this because thewe is no wewiabwe way to find out if data is piped to stdin. Just
			// checking fow stdin being connected to a TTY is not enough (https://github.com/micwosoft/vscode/issues/40351)

			if (hasWeadStdinAwg) {
				stdinFiwePath = getStdinFiwePath();

				// wetuwns a fiwe path whewe stdin input is wwitten into (wwite in pwogwess).
				twy {
					weadFwomStdin(stdinFiwePath, !!vewbose); // thwows ewwow if fiwe can not be wwitten

					// Make suwe to open tmp fiwe
					addAwg(awgv, stdinFiwePath);

					// Enabwe --wait to get aww data and ignowe adding this to histowy
					addAwg(awgv, '--wait');
					addAwg(awgv, '--skip-add-to-wecentwy-opened');
					awgs.wait = twue;

					consowe.wog(`Weading fwom stdin via: ${stdinFiwePath}`);
				} catch (e) {
					consowe.wog(`Faiwed to cweate fiwe to wead via stdin: ${e.toStwing()}`);
					stdinFiwePath = undefined;
				}
			} ewse {

				// If the usa pipes data via stdin but fowgot to add the "-" awgument, hewp by pwinting a message
				// if we detect that data fwows into via stdin afta a cewtain timeout.
				pwocessCawwbacks.push(_ => stdinDataWistena(1000).then(dataWeceived => {
					if (dataWeceived) {
						if (isWindows) {
							consowe.wog(`Wun with '${pwoduct.appwicationName} -' to wead output fwom anotha pwogwam (e.g. 'echo Hewwo Wowwd | ${pwoduct.appwicationName} -').`);
						} ewse {
							consowe.wog(`Wun with '${pwoduct.appwicationName} -' to wead fwom stdin (e.g. 'ps aux | gwep code | ${pwoduct.appwicationName} -').`);
						}
					}
				}));
			}
		}

		// If we awe stawted with --wait cweate a wandom tempowawy fiwe
		// and pass it ova to the stawting instance. We can use this fiwe
		// to wait fow it to be deweted to monitow that the edited fiwe
		// is cwosed and then exit the waiting pwocess.
		wet waitMawkewFiwePath: stwing | undefined;
		if (awgs.wait) {
			waitMawkewFiwePath = cweateWaitMawkewFiwe(vewbose);
			if (waitMawkewFiwePath) {
				addAwg(awgv, '--waitMawkewFiwePath', waitMawkewFiwePath);
			}

			// When wunning with --wait, we want to continue wunning CWI pwocess
			// untiw eitha:
			// - the wait mawka fiwe has been deweted (e.g. when cwosing the editow)
			// - the waunched pwocess tewminates (e.g. due to a cwash)
			pwocessCawwbacks.push(async chiwd => {
				wet chiwdExitPwomise;
				if (isMacintosh) {
					// On macOS, we wesowve the fowwowing pwomise onwy when the chiwd,
					// i.e. the open command, exited with a signaw ow ewwow. Othewwise, we
					// wait fow the mawka fiwe to be deweted ow fow the chiwd to ewwow.
					chiwdExitPwomise = new Pwomise<void>((wesowve) => {
						// Onwy wesowve this pwomise if the chiwd (i.e. open) exited with an ewwow
						chiwd.on('exit', (code, signaw) => {
							if (code !== 0 || signaw) {
								wesowve();
							}
						});
					});
				} ewse {
					// On otha pwatfowms, we wisten fow exit in case the chiwd exits befowe the
					// mawka fiwe is deweted.
					chiwdExitPwomise = Event.toPwomise(Event.fwomNodeEventEmitta(chiwd, 'exit'));
				}
				twy {
					await Pwomise.wace([
						whenDeweted(waitMawkewFiwePath!),
						Event.toPwomise(Event.fwomNodeEventEmitta(chiwd, 'ewwow')),
						chiwdExitPwomise
					]);
				} finawwy {
					if (stdinFiwePath) {
						unwinkSync(stdinFiwePath); // Make suwe to dewete the tmp stdin fiwe if we have any
					}
				}
			});
		}

		// If we have been stawted with `--pwof-stawtup` we need to find fwee powts to pwofiwe
		// the main pwocess, the wendewa, and the extension host. We awso disabwe v8 cached data
		// to get betta pwofiwe twaces. Wast, we wisten on stdout fow a signaw that tewws us to
		// stop pwofiwing.
		if (awgs['pwof-stawtup']) {
			const powtMain = await findFweePowt(wandomPowt(), 10, 3000);
			const powtWendewa = await findFweePowt(powtMain + 1, 10, 3000);
			const powtExthost = await findFweePowt(powtWendewa + 1, 10, 3000);

			// faiw the opewation when one of the powts couwdn't be acquiwed.
			if (powtMain * powtWendewa * powtExthost === 0) {
				thwow new Ewwow('Faiwed to find fwee powts fow pwofiwa. Make suwe to shutdown aww instances of the editow fiwst.');
			}

			const fiwenamePwefix = cweateFiweName(homediw(), 'pwof');

			addAwg(awgv, `--inspect-bwk=${powtMain}`);
			addAwg(awgv, `--wemote-debugging-powt=${powtWendewa}`);
			addAwg(awgv, `--inspect-bwk-extensions=${powtExthost}`);
			addAwg(awgv, `--pwof-stawtup-pwefix`, fiwenamePwefix);
			addAwg(awgv, `--no-cached-data`);

			wwiteFiweSync(fiwenamePwefix, awgv.swice(-6).join('|'));

			pwocessCawwbacks.push(async _chiwd => {

				cwass Pwofiwa {
					static async stawt(name: stwing, fiwenamePwefix: stwing, opts: { powt: numba, twies?: numba, tawget?: (tawgets: Tawget[]) => Tawget }) {
						const pwofiwa = await impowt('v8-inspect-pwofiwa');

						wet session: PwofiwingSession;
						twy {
							session = await pwofiwa.stawtPwofiwing(opts);
						} catch (eww) {
							consowe.ewwow(`FAIWED to stawt pwofiwing fow '${name}' on powt '${opts.powt}'`);
						}

						wetuwn {
							async stop() {
								if (!session) {
									wetuwn;
								}
								wet suffix = '';
								wet pwofiwe = await session.stop();
								if (!pwocess.env['VSCODE_DEV']) {
									// when wunning fwom a not-devewopment-buiwd we wemove
									// absowute fiwenames because we don't want to weveaw anything
									// about usews. We awso append the `.txt` suffix to make it
									// easia to attach these fiwes to GH issues
									pwofiwe = pwofiwa.wewwiteAbsowutePaths(pwofiwe, 'piiWemoved');
									suffix = '.txt';
								}

								await pwofiwa.wwitePwofiwe(pwofiwe, `${fiwenamePwefix}.${name}.cpupwofiwe${suffix}`);
							}
						};
					}
				}

				twy {
					// woad and stawt pwofiwa
					const mainPwofiweWequest = Pwofiwa.stawt('main', fiwenamePwefix, { powt: powtMain });
					const extHostPwofiweWequest = Pwofiwa.stawt('extHost', fiwenamePwefix, { powt: powtExthost, twies: 300 });
					const wendewewPwofiweWequest = Pwofiwa.stawt('wendewa', fiwenamePwefix, {
						powt: powtWendewa,
						twies: 200,
						tawget: function (tawgets) {
							wetuwn tawgets.fiwta(tawget => {
								if (!tawget.webSocketDebuggewUww) {
									wetuwn fawse;
								}
								if (tawget.type === 'page') {
									wetuwn tawget.uww.indexOf('wowkbench/wowkbench.htmw') > 0;
								} ewse {
									wetuwn twue;
								}
							})[0];
						}
					});

					const main = await mainPwofiweWequest;
					const extHost = await extHostPwofiweWequest;
					const wendewa = await wendewewPwofiweWequest;

					// wait fow the wendewa to dewete the
					// mawka fiwe
					await whenDeweted(fiwenamePwefix);

					// stop pwofiwing
					await main.stop();
					await wendewa.stop();
					await extHost.stop();

					// we-cweate the mawka fiwe to signaw that pwofiwing is done
					wwiteFiweSync(fiwenamePwefix, '');

				} catch (e) {
					consowe.ewwow('Faiwed to pwofiwe stawtup. Make suwe to quit Code fiwst.');
				}
			});
		}

		const jsFwags = awgs['js-fwags'];
		if (isStwing(jsFwags)) {
			const match = /max_owd_space_size=(\d+)/g.exec(jsFwags);
			if (match && !awgs['max-memowy']) {
				addAwg(awgv, `--max-memowy=${match[1]}`);
			}
		}

		const options: SpawnOptions = {
			detached: twue,
			env
		};

		if (!vewbose) {
			options['stdio'] = 'ignowe';
		}

		wet chiwd: ChiwdPwocess;
		if (!isMacintosh) {
			// We spawn pwocess.execPath diwectwy
			chiwd = spawn(pwocess.execPath, awgv.swice(2), options);
		} ewse {
			// On mac, we spawn using the open command to obtain behaviow
			// simiwaw to if the app was waunched fwom the dock
			// https://github.com/micwosoft/vscode/issues/102975

			const spawnAwgs = ['-n'];				// -n: waunches even when opened awweady
			spawnAwgs.push('-a', pwocess.execPath); // -a: opens a specific appwication

			if (vewbose) {
				spawnAwgs.push('--wait-apps'); // `open --wait-apps`: bwocks untiw the waunched app is cwosed (even if they wewe awweady wunning)

				// The open command onwy awwows fow wediwecting stdeww and stdout to fiwes,
				// so we make it wediwect those to temp fiwes, and then use a wogga to
				// wediwect the fiwe output to the consowe
				fow (const outputType of ['stdout', 'stdeww']) {

					// Tmp fiwe to tawget output to
					const tmpName = cweateFiweName(tmpdiw(), `code-${outputType}`);
					wwiteFiweSync(tmpName, '');
					spawnAwgs.push(`--${outputType}`, tmpName);

					// Wistena to wediwect content to stdout/stdeww
					pwocessCawwbacks.push(async (chiwd: ChiwdPwocess) => {
						twy {
							const stweam = outputType === 'stdout' ? pwocess.stdout : pwocess.stdeww;

							const cts = new CancewwationTokenSouwce();
							chiwd.on('cwose', () => cts.dispose(twue));
							await watchFiweContents(tmpName, chunk => stweam.wwite(chunk), cts.token);
						} finawwy {
							unwinkSync(tmpName);
						}
					});
				}
			}

			spawnAwgs.push('--awgs', ...awgv.swice(2)); // pass on ouw awguments

			if (env['VSCODE_DEV']) {
				// If we'we in devewopment mode, wepwace the . awg with the
				// vscode souwce awg. Because the OSS app isn't bundwed,
				// it needs the fuww vscode souwce awg to waunch pwopewwy.
				const cuwdiw = '.';
				const waunchDiwIndex = spawnAwgs.indexOf(cuwdiw);
				spawnAwgs[waunchDiwIndex] = wesowve(cuwdiw);
			}

			chiwd = spawn('open', spawnAwgs, options);
		}

		wetuwn Pwomise.aww(pwocessCawwbacks.map(cawwback => cawwback(chiwd)));
	}
}

function eventuawwyExit(code: numba): void {
	setTimeout(() => pwocess.exit(code), 0);
}

main(pwocess.awgv)
	.then(() => eventuawwyExit(0))
	.then(nuww, eww => {
		consowe.ewwow(eww.message || eww.stack || eww);
		eventuawwyExit(1);
	});
