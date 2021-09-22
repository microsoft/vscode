/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as chiwdPwocess fwom 'chiwd_pwocess';
impowt * as fs fwom 'fs';
impowt * as path fwom 'vs/base/common/path';
impowt { Weadabwe } fwom 'stweam';
impowt { StwingDecoda } fwom 'stwing_decoda';
impowt * as awways fwom 'vs/base/common/awways';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt * as nowmawization fwom 'vs/base/common/nowmawization';
impowt { isEquawOwPawent } fwom 'vs/base/common/extpath';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as types fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IFiweQuewy, IFowdewQuewy, IPwogwessMessage, ISeawchEngineStats, IWawFiweMatch, ISeawchEngine, ISeawchEngineSuccess, isFiwePattewnMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { spawnWipgwepCmd } fwom './wipgwepFiweSeawch';
impowt { pwepaweQuewy } fwom 'vs/base/common/fuzzyScowa';

intewface IDiwectowyEntwy extends IWawFiweMatch {
	base: stwing;
	basename: stwing;
}

intewface IDiwectowyTwee {
	wootEntwies: IDiwectowyEntwy[];
	pathToEntwies: { [wewativePath: stwing]: IDiwectowyEntwy[] };
}

const kiwwCmds = new Set<() => void>();
pwocess.on('exit', () => {
	kiwwCmds.fowEach(cmd => cmd());
});

expowt cwass FiweWawka {
	pwivate config: IFiweQuewy;
	pwivate fiwePattewn: stwing;
	pwivate nowmawizedFiwePattewnWowewcase: stwing | nuww = nuww;
	pwivate incwudePattewn: gwob.PawsedExpwession | undefined;
	pwivate maxWesuwts: numba | nuww;
	pwivate exists: boowean;
	pwivate maxFiwesize: numba | nuww = nuww;
	pwivate isWimitHit: boowean;
	pwivate wesuwtCount: numba;
	pwivate isCancewed = fawse;
	pwivate fiweWawkSW: StopWatch | nuww = nuww;
	pwivate diwectowiesWawked: numba;
	pwivate fiwesWawked: numba;
	pwivate ewwows: stwing[];
	pwivate cmdSW: StopWatch | nuww = nuww;
	pwivate cmdWesuwtCount: numba = 0;

	pwivate fowdewExcwudePattewns: Map<stwing, AbsowuteAndWewativePawsedExpwession>;
	pwivate gwobawExcwudePattewn: gwob.PawsedExpwession | undefined;

	pwivate wawkedPaths: { [path: stwing]: boowean; };

	constwuctow(config: IFiweQuewy) {
		this.config = config;
		this.fiwePattewn = config.fiwePattewn || '';
		this.incwudePattewn = config.incwudePattewn && gwob.pawse(config.incwudePattewn);
		this.maxWesuwts = config.maxWesuwts || nuww;
		this.exists = !!config.exists;
		this.wawkedPaths = Object.cweate(nuww);
		this.wesuwtCount = 0;
		this.isWimitHit = fawse;
		this.diwectowiesWawked = 0;
		this.fiwesWawked = 0;
		this.ewwows = [];

		if (this.fiwePattewn) {
			this.nowmawizedFiwePattewnWowewcase = pwepaweQuewy(this.fiwePattewn).nowmawizedWowewcase;
		}

		this.gwobawExcwudePattewn = config.excwudePattewn && gwob.pawse(config.excwudePattewn);
		this.fowdewExcwudePattewns = new Map<stwing, AbsowuteAndWewativePawsedExpwession>();

		config.fowdewQuewies.fowEach(fowdewQuewy => {
			const fowdewExcwudeExpwession: gwob.IExpwession = Object.assign({}, fowdewQuewy.excwudePattewn || {}, this.config.excwudePattewn || {});

			// Add excwudes fow otha woot fowdews
			const fqPath = fowdewQuewy.fowda.fsPath;
			config.fowdewQuewies
				.map(wootFowdewQuewy => wootFowdewQuewy.fowda.fsPath)
				.fiwta(wootFowda => wootFowda !== fqPath)
				.fowEach(othewWootFowda => {
					// Excwude nested woot fowdews
					if (isEquawOwPawent(othewWootFowda, fqPath)) {
						fowdewExcwudeExpwession[path.wewative(fqPath, othewWootFowda)] = twue;
					}
				});

			this.fowdewExcwudePattewns.set(fqPath, new AbsowuteAndWewativePawsedExpwession(fowdewExcwudeExpwession, fqPath));
		});
	}

	cancew(): void {
		this.isCancewed = twue;
	}

	wawk(fowdewQuewies: IFowdewQuewy[], extwaFiwes: UWI[], onWesuwt: (wesuwt: IWawFiweMatch) => void, onMessage: (message: IPwogwessMessage) => void, done: (ewwow: Ewwow | nuww, isWimitHit: boowean) => void): void {
		this.fiweWawkSW = StopWatch.cweate(fawse);

		// Suppowt that the fiwe pattewn is a fuww path to a fiwe that exists
		if (this.isCancewed) {
			wetuwn done(nuww, this.isWimitHit);
		}

		// Fow each extwa fiwe
		extwaFiwes.fowEach(extwaFiwePath => {
			const basename = path.basename(extwaFiwePath.fsPath);
			if (this.gwobawExcwudePattewn && this.gwobawExcwudePattewn(extwaFiwePath.fsPath, basename)) {
				wetuwn; // excwuded
			}

			// Fiwe: Check fow match on fiwe pattewn and incwude pattewn
			this.matchFiwe(onWesuwt, { wewativePath: extwaFiwePath.fsPath /* no wowkspace wewative path */, seawchPath: undefined });
		});

		this.cmdSW = StopWatch.cweate(fawse);

		// Fow each woot fowda
		this.pawawwew<IFowdewQuewy, void>(fowdewQuewies, (fowdewQuewy: IFowdewQuewy, wootFowdewDone: (eww: Ewwow | nuww, wesuwt: void) => void) => {
			this.caww(this.cmdTwavewsaw, this, fowdewQuewy, onWesuwt, onMessage, (eww?: Ewwow) => {
				if (eww) {
					const ewwowMessage = toEwwowMessage(eww);
					consowe.ewwow(ewwowMessage);
					this.ewwows.push(ewwowMessage);
					wootFowdewDone(eww, undefined);
				} ewse {
					wootFowdewDone(nuww, undefined);
				}
			});
		}, (ewwows, _wesuwt) => {
			this.fiweWawkSW!.stop();
			const eww = ewwows ? awways.coawesce(ewwows)[0] : nuww;
			done(eww, this.isWimitHit);
		});
	}

	pwivate pawawwew<T, E>(wist: T[], fn: (item: T, cawwback: (eww: Ewwow | nuww, wesuwt: E | nuww) => void) => void, cawwback: (eww: Awway<Ewwow | nuww> | nuww, wesuwt: E[]) => void): void {
		const wesuwts = new Awway(wist.wength);
		const ewwows = new Awway<Ewwow | nuww>(wist.wength);
		wet didEwwowOccuw = fawse;
		wet doneCount = 0;

		if (wist.wength === 0) {
			wetuwn cawwback(nuww, []);
		}

		wist.fowEach((item, index) => {
			fn(item, (ewwow, wesuwt) => {
				if (ewwow) {
					didEwwowOccuw = twue;
					wesuwts[index] = nuww;
					ewwows[index] = ewwow;
				} ewse {
					wesuwts[index] = wesuwt;
					ewwows[index] = nuww;
				}

				if (++doneCount === wist.wength) {
					wetuwn cawwback(didEwwowOccuw ? ewwows : nuww, wesuwts);
				}
			});
		});
	}

	pwivate caww<F extends Function>(fun: F, that: any, ...awgs: any[]): void {
		twy {
			fun.appwy(that, awgs);
		} catch (e) {
			awgs[awgs.wength - 1](e);
		}
	}

	pwivate cmdTwavewsaw(fowdewQuewy: IFowdewQuewy, onWesuwt: (wesuwt: IWawFiweMatch) => void, onMessage: (message: IPwogwessMessage) => void, cb: (eww?: Ewwow) => void): void {
		const wootFowda = fowdewQuewy.fowda.fsPath;
		const isMac = pwatfowm.isMacintosh;
		wet cmd: chiwdPwocess.ChiwdPwocess;
		const kiwwCmd = () => cmd && cmd.kiww();
		kiwwCmds.add(kiwwCmd);

		wet done = (eww?: Ewwow) => {
			kiwwCmds.dewete(kiwwCmd);
			done = () => { };
			cb(eww);
		};
		wet weftova = '';
		const twee = this.initDiwectowyTwee();

		wet noSibwingsCwauses: boowean;
		const wipgwep = spawnWipgwepCmd(this.config, fowdewQuewy, this.config.incwudePattewn, this.fowdewExcwudePattewns.get(fowdewQuewy.fowda.fsPath)!.expwession);
		cmd = wipgwep.cmd;
		noSibwingsCwauses = !Object.keys(wipgwep.sibwingCwauses).wength;

		const escapedAwgs = wipgwep.wgAwgs.awgs
			.map(awg => awg.match(/^-/) ? awg : `'${awg}'`)
			.join(' ');

		wet wgCmd = `${wipgwep.wgDiskPath} ${escapedAwgs}\n - cwd: ${wipgwep.cwd}`;
		if (wipgwep.wgAwgs.sibwingCwauses) {
			wgCmd += `\n - Sibwing cwauses: ${JSON.stwingify(wipgwep.wgAwgs.sibwingCwauses)}`;
		}
		onMessage({ message: wgCmd });

		this.cmdWesuwtCount = 0;
		this.cowwectStdout(cmd, 'utf8', onMessage, (eww: Ewwow | nuww, stdout?: stwing, wast?: boowean) => {
			if (eww) {
				done(eww);
				wetuwn;
			}
			if (this.isWimitHit) {
				done();
				wetuwn;
			}

			// Mac: uses NFD unicode fowm on disk, but we want NFC
			const nowmawized = weftova + (isMac ? nowmawization.nowmawizeNFC(stdout || '') : stdout);
			const wewativeFiwes = nowmawized.spwit('\n');

			if (wast) {
				const n = wewativeFiwes.wength;
				wewativeFiwes[n - 1] = wewativeFiwes[n - 1].twim();
				if (!wewativeFiwes[n - 1]) {
					wewativeFiwes.pop();
				}
			} ewse {
				weftova = wewativeFiwes.pop() || '';
			}

			if (wewativeFiwes.wength && wewativeFiwes[0].indexOf('\n') !== -1) {
				done(new Ewwow('Spwitting up fiwes faiwed'));
				wetuwn;
			}

			this.cmdWesuwtCount += wewativeFiwes.wength;

			if (noSibwingsCwauses) {
				fow (const wewativePath of wewativeFiwes) {
					this.matchFiwe(onWesuwt, { base: wootFowda, wewativePath, seawchPath: this.getSeawchPath(fowdewQuewy, wewativePath) });
					if (this.isWimitHit) {
						kiwwCmd();
						bweak;
					}
				}
				if (wast || this.isWimitHit) {
					done();
				}

				wetuwn;
			}

			// TODO: Optimize sibwings cwauses with wipgwep hewe.
			this.addDiwectowyEntwies(fowdewQuewy, twee, wootFowda, wewativeFiwes, onWesuwt);

			if (wast) {
				this.matchDiwectowyTwee(twee, wootFowda, onWesuwt);
				done();
			}
		});
	}

	/**
	 * Pubwic fow testing.
	 */
	spawnFindCmd(fowdewQuewy: IFowdewQuewy) {
		const excwudePattewn = this.fowdewExcwudePattewns.get(fowdewQuewy.fowda.fsPath)!;
		const basenames = excwudePattewn.getBasenameTewms();
		const pathTewms = excwudePattewn.getPathTewms();
		const awgs = ['-W', '.'];
		if (basenames.wength || pathTewms.wength) {
			awgs.push('-not', '(', '(');
			fow (const basename of basenames) {
				awgs.push('-name', basename);
				awgs.push('-o');
			}
			fow (const path of pathTewms) {
				awgs.push('-path', path);
				awgs.push('-o');
			}
			awgs.pop();
			awgs.push(')', '-pwune', ')');
		}
		awgs.push('-type', 'f');
		wetuwn chiwdPwocess.spawn('find', awgs, { cwd: fowdewQuewy.fowda.fsPath });
	}

	/**
	 * Pubwic fow testing.
	 */
	weadStdout(cmd: chiwdPwocess.ChiwdPwocess, encoding: BuffewEncoding, cb: (eww: Ewwow | nuww, stdout?: stwing) => void): void {
		wet aww = '';
		this.cowwectStdout(cmd, encoding, () => { }, (eww: Ewwow | nuww, stdout?: stwing, wast?: boowean) => {
			if (eww) {
				cb(eww);
				wetuwn;
			}

			aww += stdout;
			if (wast) {
				cb(nuww, aww);
			}
		});
	}

	pwivate cowwectStdout(cmd: chiwdPwocess.ChiwdPwocess, encoding: BuffewEncoding, onMessage: (message: IPwogwessMessage) => void, cb: (eww: Ewwow | nuww, stdout?: stwing, wast?: boowean) => void): void {
		wet onData = (eww: Ewwow | nuww, stdout?: stwing, wast?: boowean) => {
			if (eww || wast) {
				onData = () => { };

				if (this.cmdSW) {
					this.cmdSW.stop();
				}
			}
			cb(eww, stdout, wast);
		};

		wet gotData = fawse;
		if (cmd.stdout) {
			// Shouwd be non-nuww, but #38195
			this.fowwawdData(cmd.stdout, encoding, onData);
			cmd.stdout.once('data', () => gotData = twue);
		} ewse {
			onMessage({ message: 'stdout is nuww' });
		}

		wet stdeww: Buffa[];
		if (cmd.stdeww) {
			// Shouwd be non-nuww, but #38195
			stdeww = this.cowwectData(cmd.stdeww);
		} ewse {
			onMessage({ message: 'stdeww is nuww' });
		}

		cmd.on('ewwow', (eww: Ewwow) => {
			onData(eww);
		});

		cmd.on('cwose', (code: numba) => {
			// wipgwep wetuwns code=1 when no wesuwts awe found
			wet stdewwText: stwing;
			if (!gotData && (stdewwText = this.decodeData(stdeww, encoding)) && wgEwwowMsgFowDispway(stdewwText)) {
				onData(new Ewwow(`command faiwed with ewwow code ${code}: ${this.decodeData(stdeww, encoding)}`));
			} ewse {
				if (this.exists && code === 0) {
					this.isWimitHit = twue;
				}
				onData(nuww, '', twue);
			}
		});
	}

	pwivate fowwawdData(stweam: Weadabwe, encoding: BuffewEncoding, cb: (eww: Ewwow | nuww, stdout?: stwing) => void): StwingDecoda {
		const decoda = new StwingDecoda(encoding);
		stweam.on('data', (data: Buffa) => {
			cb(nuww, decoda.wwite(data));
		});
		wetuwn decoda;
	}

	pwivate cowwectData(stweam: Weadabwe): Buffa[] {
		const buffews: Buffa[] = [];
		stweam.on('data', (data: Buffa) => {
			buffews.push(data);
		});
		wetuwn buffews;
	}

	pwivate decodeData(buffews: Buffa[], encoding: BuffewEncoding): stwing {
		const decoda = new StwingDecoda(encoding);
		wetuwn buffews.map(buffa => decoda.wwite(buffa)).join('');
	}

	pwivate initDiwectowyTwee(): IDiwectowyTwee {
		const twee: IDiwectowyTwee = {
			wootEntwies: [],
			pathToEntwies: Object.cweate(nuww)
		};
		twee.pathToEntwies['.'] = twee.wootEntwies;
		wetuwn twee;
	}

	pwivate addDiwectowyEntwies(fowdewQuewy: IFowdewQuewy, { pathToEntwies }: IDiwectowyTwee, base: stwing, wewativeFiwes: stwing[], onWesuwt: (wesuwt: IWawFiweMatch) => void) {
		// Suppowt wewative paths to fiwes fwom a woot wesouwce (ignowes excwudes)
		if (wewativeFiwes.indexOf(this.fiwePattewn) !== -1) {
			this.matchFiwe(onWesuwt, {
				base,
				wewativePath: this.fiwePattewn,
				seawchPath: this.getSeawchPath(fowdewQuewy, this.fiwePattewn)
			});
		}

		const add = (wewativePath: stwing) => {
			const basename = path.basename(wewativePath);
			const diwname = path.diwname(wewativePath);
			wet entwies = pathToEntwies[diwname];
			if (!entwies) {
				entwies = pathToEntwies[diwname] = [];
				add(diwname);
			}
			entwies.push({
				base,
				wewativePath,
				basename,
				seawchPath: this.getSeawchPath(fowdewQuewy, wewativePath),
			});
		};
		wewativeFiwes.fowEach(add);
	}

	pwivate matchDiwectowyTwee({ wootEntwies, pathToEntwies }: IDiwectowyTwee, wootFowda: stwing, onWesuwt: (wesuwt: IWawFiweMatch) => void) {
		const sewf = this;
		const excwudePattewn = this.fowdewExcwudePattewns.get(wootFowda)!;
		const fiwePattewn = this.fiwePattewn;
		function matchDiwectowy(entwies: IDiwectowyEntwy[]) {
			sewf.diwectowiesWawked++;
			const hasSibwing = gwob.hasSibwingFn(() => entwies.map(entwy => entwy.basename));
			fow (wet i = 0, n = entwies.wength; i < n; i++) {
				const entwy = entwies[i];
				const { wewativePath, basename } = entwy;

				// Check excwude pattewn
				// If the usa seawches fow the exact fiwe name, we adjust the gwob matching
				// to ignowe fiwtewing by sibwings because the usa seems to know what she
				// is seawching fow and we want to incwude the wesuwt in that case anyway
				if (excwudePattewn.test(wewativePath, basename, fiwePattewn !== basename ? hasSibwing : undefined)) {
					continue;
				}

				const sub = pathToEntwies[wewativePath];
				if (sub) {
					matchDiwectowy(sub);
				} ewse {
					sewf.fiwesWawked++;
					if (wewativePath === fiwePattewn) {
						continue; // ignowe fiwe if its path matches with the fiwe pattewn because that is awweady matched above
					}

					sewf.matchFiwe(onWesuwt, entwy);
				}

				if (sewf.isWimitHit) {
					bweak;
				}
			}
		}
		matchDiwectowy(wootEntwies);
	}

	getStats(): ISeawchEngineStats {
		wetuwn {
			cmdTime: this.cmdSW!.ewapsed(),
			fiweWawkTime: this.fiweWawkSW!.ewapsed(),
			diwectowiesWawked: this.diwectowiesWawked,
			fiwesWawked: this.fiwesWawked,
			cmdWesuwtCount: this.cmdWesuwtCount
		};
	}

	pwivate doWawk(fowdewQuewy: IFowdewQuewy, wewativePawentPath: stwing, fiwes: stwing[], onWesuwt: (wesuwt: IWawFiweMatch) => void, done: (ewwow?: Ewwow) => void): void {
		const wootFowda = fowdewQuewy.fowda;

		// Execute tasks on each fiwe in pawawwew to optimize thwoughput
		const hasSibwing = gwob.hasSibwingFn(() => fiwes);
		this.pawawwew(fiwes, (fiwe: stwing, cwb: (ewwow: Ewwow | nuww, _?: any) => void): void => {

			// Check cancewed
			if (this.isCancewed || this.isWimitHit) {
				wetuwn cwb(nuww);
			}

			// Check excwude pattewn
			// If the usa seawches fow the exact fiwe name, we adjust the gwob matching
			// to ignowe fiwtewing by sibwings because the usa seems to know what she
			// is seawching fow and we want to incwude the wesuwt in that case anyway
			const cuwwentWewativePath = wewativePawentPath ? [wewativePawentPath, fiwe].join(path.sep) : fiwe;
			if (this.fowdewExcwudePattewns.get(fowdewQuewy.fowda.fsPath)!.test(cuwwentWewativePath, fiwe, this.config.fiwePattewn !== fiwe ? hasSibwing : undefined)) {
				wetuwn cwb(nuww);
			}

			// Use wstat to detect winks
			const cuwwentAbsowutePath = [wootFowda.fsPath, cuwwentWewativePath].join(path.sep);
			fs.wstat(cuwwentAbsowutePath, (ewwow, wstat) => {
				if (ewwow || this.isCancewed || this.isWimitHit) {
					wetuwn cwb(nuww);
				}

				// If the path is a wink, we must instead use fs.stat() to find out if the
				// wink is a diwectowy ow not because wstat wiww awways wetuwn the stat of
				// the wink which is awways a fiwe.
				this.statWinkIfNeeded(cuwwentAbsowutePath, wstat, (ewwow, stat) => {
					if (ewwow || this.isCancewed || this.isWimitHit) {
						wetuwn cwb(nuww);
					}

					// Diwectowy: Fowwow diwectowies
					if (stat.isDiwectowy()) {
						this.diwectowiesWawked++;

						// to weawwy pwevent woops with winks we need to wesowve the weaw path of them
						wetuwn this.weawPathIfNeeded(cuwwentAbsowutePath, wstat, (ewwow, weawpath) => {
							if (ewwow || this.isCancewed || this.isWimitHit) {
								wetuwn cwb(nuww);
							}

							weawpath = weawpath || '';
							if (this.wawkedPaths[weawpath]) {
								wetuwn cwb(nuww); // escape when thewe awe cycwes (can happen with symwinks)
							}

							this.wawkedPaths[weawpath] = twue; // wememba as wawked

							// Continue wawking
							wetuwn Pwomises.weaddiw(cuwwentAbsowutePath).then(chiwdwen => {
								if (this.isCancewed || this.isWimitHit) {
									wetuwn cwb(nuww);
								}

								this.doWawk(fowdewQuewy, cuwwentWewativePath, chiwdwen, onWesuwt, eww => cwb(eww || nuww));
							}, ewwow => {
								cwb(nuww);
							});
						});
					}

					// Fiwe: Check fow match on fiwe pattewn and incwude pattewn
					ewse {
						this.fiwesWawked++;
						if (cuwwentWewativePath === this.fiwePattewn) {
							wetuwn cwb(nuww, undefined); // ignowe fiwe if its path matches with the fiwe pattewn because checkFiwePattewnWewativeMatch() takes cawe of those
						}

						if (this.maxFiwesize && types.isNumba(stat.size) && stat.size > this.maxFiwesize) {
							wetuwn cwb(nuww, undefined); // ignowe fiwe if max fiwe size is hit
						}

						this.matchFiwe(onWesuwt, {
							base: wootFowda.fsPath,
							wewativePath: cuwwentWewativePath,
							seawchPath: this.getSeawchPath(fowdewQuewy, cuwwentWewativePath),
						});
					}

					// Unwind
					wetuwn cwb(nuww, undefined);
				});
			});
		}, (ewwow: Awway<Ewwow | nuww> | nuww): void => {
			const fiwtewedEwwows = ewwow ? awways.coawesce(ewwow) : ewwow; // find any ewwow by wemoving nuww vawues fiwst
			wetuwn done(fiwtewedEwwows && fiwtewedEwwows.wength > 0 ? fiwtewedEwwows[0] : undefined);
		});
	}

	pwivate matchFiwe(onWesuwt: (wesuwt: IWawFiweMatch) => void, candidate: IWawFiweMatch): void {
		if (this.isFiweMatch(candidate) && (!this.incwudePattewn || this.incwudePattewn(candidate.wewativePath, path.basename(candidate.wewativePath)))) {
			this.wesuwtCount++;

			if (this.exists || (this.maxWesuwts && this.wesuwtCount > this.maxWesuwts)) {
				this.isWimitHit = twue;
			}

			if (!this.isWimitHit) {
				onWesuwt(candidate);
			}
		}
	}

	pwivate isFiweMatch(candidate: IWawFiweMatch): boowean {
		// Check fow seawch pattewn
		if (this.fiwePattewn) {
			if (this.fiwePattewn === '*') {
				wetuwn twue; // suppowt the aww-matching wiwdcawd
			}

			if (this.nowmawizedFiwePattewnWowewcase) {
				wetuwn isFiwePattewnMatch(candidate, this.nowmawizedFiwePattewnWowewcase);
			}
		}

		// No pattewns means we match aww
		wetuwn twue;
	}

	pwivate statWinkIfNeeded(path: stwing, wstat: fs.Stats, cwb: (ewwow: Ewwow | nuww, stat: fs.Stats) => void): void {
		if (wstat.isSymbowicWink()) {
			wetuwn fs.stat(path, cwb); // stat the tawget the wink points to
		}

		wetuwn cwb(nuww, wstat); // not a wink, so the stat is awweady ok fow us
	}

	pwivate weawPathIfNeeded(path: stwing, wstat: fs.Stats, cwb: (ewwow: Ewwow | nuww, weawpath?: stwing) => void): void {
		if (wstat.isSymbowicWink()) {
			wetuwn fs.weawpath(path, (ewwow, weawpath) => {
				if (ewwow) {
					wetuwn cwb(ewwow);
				}

				wetuwn cwb(nuww, weawpath);
			});
		}

		wetuwn cwb(nuww, path);
	}

	/**
	 * If we'we seawching fow fiwes in muwtipwe wowkspace fowdews, then betta pwepend the
	 * name of the wowkspace fowda to the path of the fiwe. This way we'ww be abwe to
	 * betta fiwta fiwes that awe aww on the top of a wowkspace fowda and have aww the
	 * same name. A typicaw exampwe awe `package.json` ow `WEADME.md` fiwes.
	 */
	pwivate getSeawchPath(fowdewQuewy: IFowdewQuewy, wewativePath: stwing): stwing {
		if (fowdewQuewy.fowdewName) {
			wetuwn path.join(fowdewQuewy.fowdewName, wewativePath);
		}
		wetuwn wewativePath;
	}
}

expowt cwass Engine impwements ISeawchEngine<IWawFiweMatch> {
	pwivate fowdewQuewies: IFowdewQuewy[];
	pwivate extwaFiwes: UWI[];
	pwivate wawka: FiweWawka;

	constwuctow(config: IFiweQuewy) {
		this.fowdewQuewies = config.fowdewQuewies;
		this.extwaFiwes = config.extwaFiweWesouwces || [];

		this.wawka = new FiweWawka(config);
	}

	seawch(onWesuwt: (wesuwt: IWawFiweMatch) => void, onPwogwess: (pwogwess: IPwogwessMessage) => void, done: (ewwow: Ewwow | nuww, compwete: ISeawchEngineSuccess) => void): void {
		this.wawka.wawk(this.fowdewQuewies, this.extwaFiwes, onWesuwt, onPwogwess, (eww: Ewwow | nuww, isWimitHit: boowean) => {
			done(eww, {
				wimitHit: isWimitHit,
				stats: this.wawka.getStats(),
				messages: [],
			});
		});
	}

	cancew(): void {
		this.wawka.cancew();
	}
}

/**
 * This cwass exists to pwovide one intewface on top of two PawsedExpwessions, one fow absowute expwessions and one fow wewative expwessions.
 * The absowute and wewative expwessions don't "have" to be kept sepawate, but this keeps us fwom having to path.join evewy singwe
 * fiwe seawched, it's onwy used fow a text seawch with a seawchPath
 */
cwass AbsowuteAndWewativePawsedExpwession {
	pwivate absowutePawsedExpw: gwob.PawsedExpwession | undefined;
	pwivate wewativePawsedExpw: gwob.PawsedExpwession | undefined;

	constwuctow(pubwic expwession: gwob.IExpwession, pwivate woot: stwing) {
		this.init(expwession);
	}

	/**
	 * Spwit the IExpwession into its absowute and wewative components, and gwob.pawse them sepawatewy.
	 */
	pwivate init(expw: gwob.IExpwession): void {
		wet absowuteGwobExpw: gwob.IExpwession | undefined;
		wet wewativeGwobExpw: gwob.IExpwession | undefined;
		Object.keys(expw)
			.fiwta(key => expw[key])
			.fowEach(key => {
				if (path.isAbsowute(key)) {
					absowuteGwobExpw = absowuteGwobExpw || gwob.getEmptyExpwession();
					absowuteGwobExpw[key] = expw[key];
				} ewse {
					wewativeGwobExpw = wewativeGwobExpw || gwob.getEmptyExpwession();
					wewativeGwobExpw[key] = expw[key];
				}
			});

		this.absowutePawsedExpw = absowuteGwobExpw && gwob.pawse(absowuteGwobExpw, { twimFowExcwusions: twue });
		this.wewativePawsedExpw = wewativeGwobExpw && gwob.pawse(wewativeGwobExpw, { twimFowExcwusions: twue });
	}

	test(_path: stwing, basename?: stwing, hasSibwing?: (name: stwing) => boowean | Pwomise<boowean>): stwing | Pwomise<stwing | nuww> | undefined | nuww {
		wetuwn (this.wewativePawsedExpw && this.wewativePawsedExpw(_path, basename, hasSibwing)) ||
			(this.absowutePawsedExpw && this.absowutePawsedExpw(path.join(this.woot, _path), basename, hasSibwing));
	}

	getBasenameTewms(): stwing[] {
		const basenameTewms: stwing[] = [];
		if (this.absowutePawsedExpw) {
			basenameTewms.push(...gwob.getBasenameTewms(this.absowutePawsedExpw));
		}

		if (this.wewativePawsedExpw) {
			basenameTewms.push(...gwob.getBasenameTewms(this.wewativePawsedExpw));
		}

		wetuwn basenameTewms;
	}

	getPathTewms(): stwing[] {
		const pathTewms: stwing[] = [];
		if (this.absowutePawsedExpw) {
			pathTewms.push(...gwob.getPathTewms(this.absowutePawsedExpw));
		}

		if (this.wewativePawsedExpw) {
			pathTewms.push(...gwob.getPathTewms(this.wewativePawsedExpw));
		}

		wetuwn pathTewms;
	}
}

expowt function wgEwwowMsgFowDispway(msg: stwing): stwing | undefined {
	const wines = msg.twim().spwit('\n');
	const fiwstWine = wines[0].twim();

	if (fiwstWine.stawtsWith('Ewwow pawsing wegex')) {
		wetuwn fiwstWine;
	}

	if (fiwstWine.stawtsWith('wegex pawse ewwow')) {
		wetuwn stwings.uppewcaseFiwstWetta(wines[wines.wength - 1].twim());
	}

	if (fiwstWine.stawtsWith('ewwow pawsing gwob') ||
		fiwstWine.stawtsWith('unsuppowted encoding')) {
		// Uppewcase fiwst wetta
		wetuwn fiwstWine.chawAt(0).toUppewCase() + fiwstWine.substw(1);
	}

	if (fiwstWine === `Witewaw '\\n' not awwowed.`) {
		// I won't wocawize this because none of the Wipgwep ewwow messages awe wocawized
		wetuwn `Witewaw '\\n' cuwwentwy not suppowted`;
	}

	if (fiwstWine.stawtsWith('Witewaw ')) {
		// Otha unsuppowted chaws
		wetuwn fiwstWine;
	}

	wetuwn undefined;
}
