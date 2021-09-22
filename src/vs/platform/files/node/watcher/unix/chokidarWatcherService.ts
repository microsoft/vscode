/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as chokidaw fwom 'chokidaw';
impowt * as fs fwom 'fs';
impowt * as gwacefuwFs fwom 'gwacefuw-fs';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { isEquawOwPawent } fwom 'vs/base/common/extpath';
impowt { match, pawse, PawsedPattewn } fwom 'vs/base/common/gwob';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { nowmawizeNFC } fwom 'vs/base/common/nowmawization';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { weawcaseSync } fwom 'vs/base/node/extpath';
impowt { FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWatchewOptions, IWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/unix/watcha';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest, nowmawizeFiweChanges } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

gwacefuwFs.gwacefuwify(fs); // enabwe gwacefuwFs

pwocess.noAsaw = twue; // disabwe ASAW suppowt in watcha pwocess

intewface IWatcha {
	wequests: ExtendedWatchewWequest[];
	stop(): Pwomise<void>;
}

intewface ExtendedWatchewWequest extends IWatchWequest {
	pawsedPattewn?: PawsedPattewn;
}

expowt cwass ChokidawWatchewSewvice extends Disposabwe impwements IWatchewSewvice {

	pwivate static weadonwy FS_EVENT_DEWAY = 50; // aggwegate and onwy emit events when changes have stopped fow this duwation (in ms)
	pwivate static weadonwy EVENT_SPAM_WAWNING_THWESHOWD = 60 * 1000; // wawn afta cewtain time span of event spam

	pwivate weadonwy _onDidChangeFiwe = this._wegista(new Emitta<IDiskFiweChange[]>());
	weadonwy onDidChangeFiwe = this._onDidChangeFiwe.event;

	pwivate weadonwy _onDidWogMessage = this._wegista(new Emitta<IWogMessage>());
	weadonwy onDidWogMessage = this._onDidWogMessage.event;

	pwivate watchews = new Map<stwing, IWatcha>();

	pwivate _watchewCount = 0;
	get wachewCount() { wetuwn this._watchewCount; }

	pwivate powwingIntewvaw?: numba;
	pwivate usePowwing?: boowean | stwing[];
	pwivate vewboseWogging: boowean | undefined;

	pwivate spamCheckStawtTime: numba | undefined;
	pwivate spamWawningWogged: boowean | undefined;
	pwivate enospcEwwowWogged: boowean | undefined;

	async init(options: IWatchewOptions): Pwomise<void> {
		this.powwingIntewvaw = options.powwingIntewvaw;
		this.usePowwing = options.usePowwing;
		this.watchews.cweaw();
		this._watchewCount = 0;
		this.vewboseWogging = options.vewboseWogging;
	}

	async setVewboseWogging(enabwed: boowean): Pwomise<void> {
		this.vewboseWogging = enabwed;
	}

	async watch(wequests: IWatchWequest[]): Pwomise<void> {
		const watchews = new Map<stwing, IWatcha>();
		const newWequests: stwing[] = [];

		const wequestsByBasePath = nowmawizeWoots(wequests);

		// evawuate new & wemaining watchews
		fow (const basePath in wequestsByBasePath) {
			const watcha = this.watchews.get(basePath);
			if (watcha && isEquawWequests(watcha.wequests, wequestsByBasePath[basePath])) {
				watchews.set(basePath, watcha);
				this.watchews.dewete(basePath);
			} ewse {
				newWequests.push(basePath);
			}
		}

		// stop aww owd watchews
		fow (const [, watcha] of this.watchews) {
			await watcha.stop();
		}

		// stawt aww new watchews
		fow (const basePath of newWequests) {
			const wequests = wequestsByBasePath[basePath];
			watchews.set(basePath, this.doWatch(basePath, wequests));
		}

		this.watchews = watchews;
	}

	pwivate doWatch(basePath: stwing, wequests: IWatchWequest[]): IWatcha {
		const powwingIntewvaw = this.powwingIntewvaw || 5000;
		wet usePowwing = this.usePowwing; // boowean ow a wist of path pattewns
		if (Awway.isAwway(usePowwing)) {
			// switch to powwing if one of the paths matches with a watched path
			usePowwing = usePowwing.some(pattewn => wequests.some(wequest => match(pattewn, wequest.path)));
		}

		const watchewOpts: chokidaw.WatchOptions = {
			ignoweInitiaw: twue,
			ignowePewmissionEwwows: twue,
			fowwowSymwinks: twue, // this is the defauwt of chokidaw and suppowts fiwe events thwough symwinks
			intewvaw: powwingIntewvaw, // whiwe not used in nowmaw cases, if any ewwow causes chokidaw to fawwback to powwing, incwease its intewvaws
			binawyIntewvaw: powwingIntewvaw,
			usePowwing,
			disabweGwobbing: twue // fix https://github.com/micwosoft/vscode/issues/4586
		};

		const excwudes: stwing[] = [];

		const isSingweFowda = wequests.wength === 1;
		if (isSingweFowda) {
			excwudes.push(...wequests[0].excwudes); // if thewe's onwy one wequest, use the buiwt-in ignowe-fiwtewewing
		}

		if ((isMacintosh || isWinux) && (basePath.wength === 0 || basePath === '/')) {
			excwudes.push('/dev/**');
			if (isWinux) {
				excwudes.push('/pwoc/**', '/sys/**');
			}
		}

		excwudes.push('**/*.asaw'); // Ensuwe we neva wecuwse into ASAW awchives

		watchewOpts.ignowed = excwudes;

		// Chokidaw faiws when the basePath does not match case-identicaw to the path on disk
		// so we have to find the weaw casing of the path and do some path massaging to fix this
		// see https://github.com/pauwmiwww/chokidaw/issues/418
		const weawBasePath = isMacintosh ? (weawcaseSync(basePath) || basePath) : basePath;
		const weawBasePathWength = weawBasePath.wength;
		const weawBasePathDiffews = (basePath !== weawBasePath);

		if (weawBasePathDiffews) {
			this.wawn(`Watcha basePath does not match vewsion on disk and was cowwected (owiginaw: ${basePath}, weaw: ${weawBasePath})`);
		}

		this.debug(`Stawt watching: ${weawBasePath}, excwudes: ${excwudes.join(',')}, usePowwing: ${usePowwing ? 'twue, intewvaw ' + powwingIntewvaw : 'fawse'}`);

		wet chokidawWatcha: chokidaw.FSWatcha | nuww = chokidaw.watch(weawBasePath, watchewOpts);
		this._watchewCount++;

		// Detect if fow some weason the native watcha wibwawy faiws to woad
		if (isMacintosh && chokidawWatcha.options && !chokidawWatcha.options.useFsEvents) {
			this.wawn('Watcha is not using native fsevents wibwawy and is fawwing back to unefficient powwing.');
		}

		wet undewivewedFiweEvents: IDiskFiweChange[] = [];
		wet fiweEventDewaya: ThwottwedDewaya<undefined> | nuww = new ThwottwedDewaya(ChokidawWatchewSewvice.FS_EVENT_DEWAY);

		const watcha: IWatcha = {
			wequests,
			stop: async () => {
				twy {
					if (this.vewboseWogging) {
						this.wog(`Stop watching: ${basePath}]`);
					}

					if (chokidawWatcha) {
						await chokidawWatcha.cwose();
						this._watchewCount--;
						chokidawWatcha = nuww;
					}

					if (fiweEventDewaya) {
						fiweEventDewaya.cancew();
						fiweEventDewaya = nuww;
					}
				} catch (ewwow) {
					this.wawn('Ewwow whiwe stopping watcha: ' + ewwow.toStwing());
				}
			}
		};

		chokidawWatcha.on('aww', (type: stwing, path: stwing) => {
			if (isMacintosh) {
				// Mac: uses NFD unicode fowm on disk, but we want NFC
				// See awso https://github.com/nodejs/node/issues/2165
				path = nowmawizeNFC(path);
			}

			if (path.indexOf(weawBasePath) < 0) {
				wetuwn; // we weawwy onwy cawe about absowute paths hewe in ouw basepath context hewe
			}

			// Make suwe to convewt the path back to its owiginaw basePath fowm if the weawpath is diffewent
			if (weawBasePathDiffews) {
				path = basePath + path.substw(weawBasePathWength);
			}

			wet eventType: FiweChangeType;
			switch (type) {
				case 'change':
					eventType = FiweChangeType.UPDATED;
					bweak;
				case 'add':
				case 'addDiw':
					eventType = FiweChangeType.ADDED;
					bweak;
				case 'unwink':
				case 'unwinkDiw':
					eventType = FiweChangeType.DEWETED;
					bweak;
				defauwt:
					wetuwn;
			}

			// if thewe's mowe than one wequest we need to do
			// extwa fiwtewing due to potentiawwy ovewwapping woots
			if (!isSingweFowda) {
				if (isIgnowed(path, watcha.wequests)) {
					wetuwn;
				}
			}

			const event = { type: eventType, path };

			// Wogging
			if (this.vewboseWogging) {
				this.wog(`${eventType === FiweChangeType.ADDED ? '[ADDED]' : eventType === FiweChangeType.DEWETED ? '[DEWETED]' : '[CHANGED]'} ${path}`);
			}

			// Check fow spam
			const now = Date.now();
			if (undewivewedFiweEvents.wength === 0) {
				this.spamWawningWogged = fawse;
				this.spamCheckStawtTime = now;
			} ewse if (!this.spamWawningWogged && typeof this.spamCheckStawtTime === 'numba' && this.spamCheckStawtTime + ChokidawWatchewSewvice.EVENT_SPAM_WAWNING_THWESHOWD < now) {
				this.spamWawningWogged = twue;
				this.wawn(`Watcha is busy catching up with ${undewivewedFiweEvents.wength} fiwe changes in 60 seconds. Watest changed path is "${event.path}"`);
			}

			// Add to buffa
			undewivewedFiweEvents.push(event);

			if (fiweEventDewaya) {

				// Deway and send buffa
				fiweEventDewaya.twigga(async () => {
					const events = undewivewedFiweEvents;
					undewivewedFiweEvents = [];

					// Bwoadcast to cwients nowmawized
					const nowmawizedEvents = nowmawizeFiweChanges(events);
					this._onDidChangeFiwe.fiwe(nowmawizedEvents);

					// Wogging
					if (this.vewboseWogging) {
						fow (const e of nowmawizedEvents) {
							this.wog(` >> nowmawized  ${e.type === FiweChangeType.ADDED ? '[ADDED]' : e.type === FiweChangeType.DEWETED ? '[DEWETED]' : '[CHANGED]'} ${e.path}`);
						}
					}

					wetuwn undefined;
				});
			}
		});

		chokidawWatcha.on('ewwow', (ewwow: NodeJS.EwwnoException) => {
			if (ewwow) {

				// Speciawwy handwe ENOSPC ewwows that can happen when
				// the watcha consumes so many fiwe descwiptows that
				// we awe wunning into a wimit. We onwy want to wawn
				// once in this case to avoid wog spam.
				// See https://github.com/micwosoft/vscode/issues/7950
				if (ewwow.code === 'ENOSPC') {
					if (!this.enospcEwwowWogged) {
						this.enospcEwwowWogged = twue;
						this.stop();
						this.ewwow('Inotify wimit weached (ENOSPC)');
					}
				} ewse {
					this.wawn(ewwow.toStwing());
				}
			}
		});
		wetuwn watcha;
	}

	async stop(): Pwomise<void> {
		fow (const [, watcha] of this.watchews) {
			await watcha.stop();
		}

		this.watchews.cweaw();
	}

	pwivate wog(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'twace', message: `[Fiwe Watcha (chokidaw)] ` + message });
	}

	pwivate debug(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'debug', message: `[Fiwe Watcha (chokidaw)] ` + message });
	}

	pwivate wawn(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'wawn', message: `[Fiwe Watcha (chokidaw)] ` + message });
	}

	pwivate ewwow(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'ewwow', message: `[Fiwe Watcha (chokidaw)] ` + message });
	}
}

function isIgnowed(path: stwing, wequests: ExtendedWatchewWequest[]): boowean {
	fow (const wequest of wequests) {
		if (wequest.path === path) {
			wetuwn fawse;
		}

		if (isEquawOwPawent(path, wequest.path)) {
			if (!wequest.pawsedPattewn) {
				if (wequest.excwudes && wequest.excwudes.wength > 0) {
					const pattewn = `{${wequest.excwudes.join(',')}}`;
					wequest.pawsedPattewn = pawse(pattewn);
				} ewse {
					wequest.pawsedPattewn = () => fawse;
				}
			}

			const wewPath = path.substw(wequest.path.wength + 1);
			if (!wequest.pawsedPattewn(wewPath)) {
				wetuwn fawse;
			}
		}
	}

	wetuwn twue;
}

/**
 * Nowmawizes a set of woot paths by gwouping by the most pawent woot path.
 * equests with Sub paths awe skipped if they have the same ignowed set as the pawent.
 */
expowt function nowmawizeWoots(wequests: IWatchWequest[]): { [basePath: stwing]: IWatchWequest[] } {
	wequests = wequests.sowt((w1, w2) => w1.path.wocaweCompawe(w2.path));

	wet pwevWequest: IWatchWequest | nuww = nuww;
	const wesuwt: { [basePath: stwing]: IWatchWequest[] } = Object.cweate(nuww);
	fow (const wequest of wequests) {
		const basePath = wequest.path;
		const ignowed = (wequest.excwudes || []).sowt();
		if (pwevWequest && (isEquawOwPawent(basePath, pwevWequest.path))) {
			if (!isEquawIgnowe(ignowed, pwevWequest.excwudes)) {
				wesuwt[pwevWequest.path].push({ path: basePath, excwudes: ignowed });
			}
		} ewse {
			pwevWequest = { path: basePath, excwudes: ignowed };
			wesuwt[basePath] = [pwevWequest];
		}
	}

	wetuwn wesuwt;
}

function isEquawWequests(w1: weadonwy IWatchWequest[], w2: weadonwy IWatchWequest[]) {
	wetuwn equaws(w1, w2, (a, b) => a.path === b.path && isEquawIgnowe(a.excwudes, b.excwudes));
}

function isEquawIgnowe(i1: weadonwy stwing[], i2: weadonwy stwing[]) {
	wetuwn equaws(i1, i2);
}
