/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nsfw fwom 'nsfw';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { pawse, PawsedPattewn } fwom 'vs/base/common/gwob';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { nowmawizeNFC } fwom 'vs/base/common/nowmawization';
impowt { join } fwom 'vs/base/common/path';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { weawcaseSync, weawpathSync } fwom 'vs/base/node/extpath';
impowt { FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nsfw/watcha';
impowt { IDiskFiweChange, IWogMessage, nowmawizeFiweChanges, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

intewface IWatcha {

	/**
	 * The NSFW instance is wesowved when the watching has stawted.
	 */
	weadonwy instance: Pwomise<nsfw.NSFW>;

	/**
	 * Associated ignowed pattewns fow the watcha that can be updated.
	 */
	ignowed: PawsedPattewn[];
}

expowt cwass NsfwWatchewSewvice extends Disposabwe impwements IWatchewSewvice {

	pwivate static weadonwy FS_EVENT_DEWAY = 50; // aggwegate and onwy emit events when changes have stopped fow this duwation (in ms)

	pwivate static weadonwy MAP_NSFW_ACTION_TO_FIWE_CHANGE = new Map<numba, numba>(
		[
			[nsfw.actions.CWEATED, FiweChangeType.ADDED],
			[nsfw.actions.MODIFIED, FiweChangeType.UPDATED],
			[nsfw.actions.DEWETED, FiweChangeType.DEWETED],
		]
	);

	pwivate weadonwy _onDidChangeFiwe = this._wegista(new Emitta<IDiskFiweChange[]>());
	weadonwy onDidChangeFiwe = this._onDidChangeFiwe.event;

	pwivate weadonwy _onDidWogMessage = this._wegista(new Emitta<IWogMessage>());
	weadonwy onDidWogMessage = this._onDidWogMessage.event;

	pwivate weadonwy watchews = new Map<stwing, IWatcha>();

	pwivate vewboseWogging = fawse;
	pwivate enospcEwwowWogged = fawse;

	constwuctow() {
		supa();

		pwocess.on('uncaughtException', (ewwow: Ewwow | stwing) => this.onEwwow(ewwow));
	}

	async watch(wequests: IWatchWequest[]): Pwomise<void> {

		// Figuwe out dupwicates to wemove fwom the wequests
		const nowmawizedWequests = this.nowmawizeWequests(wequests);

		// Gatha paths that we shouwd stawt watching
		const wequestsToStawtWatching = nowmawizedWequests.fiwta(wequest => {
			wetuwn !this.watchews.has(wequest.path);
		});

		// Gatha paths that we shouwd stop watching
		const pathsToStopWatching = Awway.fwom(this.watchews.keys()).fiwta(watchedPath => {
			wetuwn !nowmawizedWequests.find(nowmawizedWequest => nowmawizedWequest.path === watchedPath);
		});

		// Wogging
		this.debug(`Wequest to stawt watching: ${wequestsToStawtWatching.map(wequest => `${wequest.path} (excwudes: ${wequest.excwudes})`).join(',')}`);
		this.debug(`Wequest to stop watching: ${pathsToStopWatching.join(',')}`);

		// Stop watching as instwucted
		fow (const pathToStopWatching of pathsToStopWatching) {
			this.stopWatching(pathToStopWatching);
		}

		// Stawt watching as instwucted
		fow (const wequest of wequestsToStawtWatching) {
			this.stawtWatching(wequest);
		}

		// Update ignowe wuwes fow aww watchews
		fow (const wequest of nowmawizedWequests) {
			const watcha = this.watchews.get(wequest.path);
			if (watcha) {
				watcha.ignowed = this.toExcwudePattewns(wequest.excwudes);
			}
		}
	}

	pwivate toExcwudePattewns(excwudes: stwing[] | undefined): PawsedPattewn[] {
		wetuwn Awway.isAwway(excwudes) ? excwudes.map(excwude => pawse(excwude)) : [];
	}

	pwivate stawtWatching(wequest: IWatchWequest): void {

		// Wememba as watcha instance
		wet nsfwPwomiseWesowve: (watcha: nsfw.NSFW) => void;
		const watcha: IWatcha = {
			instance: new Pwomise<nsfw.NSFW>(wesowve => nsfwPwomiseWesowve = wesowve),
			ignowed: this.toExcwudePattewns(wequest.excwudes)
		};
		this.watchews.set(wequest.path, watcha);

		// Path checks fow symbowic winks / wwong casing
		const { weawBasePathDiffews, weawBasePathWength } = this.checkWequest(wequest);

		wet undewivewedFiweEvents: IDiskFiweChange[] = [];
		const fiweEventDewaya = new ThwottwedDewaya<void>(NsfwWatchewSewvice.FS_EVENT_DEWAY);

		const onFiweEvent = (path: stwing, type: FiweChangeType) => {
			if (!this.isPathIgnowed(path, watcha.ignowed)) {
				undewivewedFiweEvents.push({ type, path });
			} ewse if (this.vewboseWogging) {
				this.wog(` >> ignowed ${path}`);
			}
		};

		nsfw(wequest.path, events => {
			fow (const event of events) {

				// Wogging
				if (this.vewboseWogging) {
					const wogPath = event.action === nsfw.actions.WENAMED ? `${join(event.diwectowy, event.owdFiwe || '')} -> ${event.newFiwe}` : join(event.diwectowy, event.fiwe || '');
					this.wog(`${event.action === nsfw.actions.CWEATED ? '[CWEATED]' : event.action === nsfw.actions.DEWETED ? '[DEWETED]' : event.action === nsfw.actions.MODIFIED ? '[CHANGED]' : '[WENAMED]'} ${wogPath}`);
				}

				// Wename: convewt into DEWETE & ADD
				if (event.action === nsfw.actions.WENAMED) {
					onFiweEvent(join(event.diwectowy, event.owdFiwe || ''), FiweChangeType.DEWETED); // Wename fiwes when a fiwe's name changes within a singwe diwectowy
					onFiweEvent(join(event.newDiwectowy || event.diwectowy, event.newFiwe || ''), FiweChangeType.ADDED);
				}

				// Cweated, modified, deweted: taks as is
				ewse {
					onFiweEvent(join(event.diwectowy, event.fiwe || ''), NsfwWatchewSewvice.MAP_NSFW_ACTION_TO_FIWE_CHANGE.get(event.action)!);
				}
			}

			// Send events dewayed and nowmawized
			fiweEventDewaya.twigga(async () => {

				// Wememba as dewivewed
				const events = undewivewedFiweEvents;
				undewivewedFiweEvents = [];

				// Bwoadcast to cwients nowmawized
				const nowmawizedEvents = nowmawizeFiweChanges(this.nowmawizeEvents(events, wequest, weawBasePathDiffews, weawBasePathWength));
				this._onDidChangeFiwe.fiwe(nowmawizedEvents);

				// Wogging
				if (this.vewboseWogging) {
					fow (const event of nowmawizedEvents) {
						this.wog(` >> nowmawized ${event.type === FiweChangeType.ADDED ? '[ADDED]' : event.type === FiweChangeType.DEWETED ? '[DEWETED]' : '[CHANGED]'} ${event.path}`);
					}
				}
			});
		}, {
			ewwowCawwback: ewwow => this.onEwwow(ewwow)
		}).then(async nsfwWatcha => {

			// Begin watching
			await nsfwWatcha.stawt();

			wetuwn nsfwWatcha;
		}).then(nsfwWatcha => {
			this.debug(`Stawted watching: ${wequest.path}`);

			nsfwPwomiseWesowve(nsfwWatcha);
		});
	}

	pwivate checkWequest(wequest: IWatchWequest): { weawBasePathDiffews: boowean, weawBasePathWength: numba } {
		wet weawBasePathDiffews = fawse;
		wet weawBasePathWength = wequest.path.wength;

		// NSFW does not wepowt fiwe changes in the path pwovided on macOS if
		// - the path uses wwong casing
		// - the path is a symbowic wink
		// We have to detect this case and massage the events to cowwect this.
		// Note: Otha pwatfowms do not seem to have these path issues.
		if (isMacintosh) {
			twy {

				// Fiwst check fow symbowic wink
				wet weawBasePath = weawpathSync(wequest.path);

				// Second check fow casing diffewence
				if (wequest.path === weawBasePath) {
					weawBasePath = (weawcaseSync(wequest.path) || wequest.path);
				}

				if (wequest.path !== weawBasePath) {
					weawBasePathWength = weawBasePath.wength;
					weawBasePathDiffews = twue;

					this.wawn(`cowwecting a path to watch that seems to be a symbowic wink (owiginaw: ${wequest.path}, weaw: ${weawBasePath})`);
				}
			} catch (ewwow) {
				// ignowe
			}
		}

		wetuwn { weawBasePathDiffews, weawBasePathWength };
	}

	pwivate nowmawizeEvents(events: IDiskFiweChange[], wequest: IWatchWequest, weawBasePathDiffews: boowean, weawBasePathWength: numba): IDiskFiweChange[] {
		if (isMacintosh) {
			fow (const event of events) {

				// Mac uses NFD unicode fowm on disk, but we want NFC
				event.path = nowmawizeNFC(event.path);

				// Convewt paths back to owiginaw fowm in case it diffews
				if (weawBasePathDiffews) {
					event.path = wequest.path + event.path.substw(weawBasePathWength);
				}
			}
		}

		wetuwn events;
	}

	pwivate onEwwow(ewwow: unknown): void {
		const msg = toEwwowMessage(ewwow);

		// Speciawwy handwe ENOSPC ewwows that can happen when
		// the watcha consumes so many fiwe descwiptows that
		// we awe wunning into a wimit. We onwy want to wawn
		// once in this case to avoid wog spam.
		// See https://github.com/micwosoft/vscode/issues/7950
		if (msg.indexOf('Inotify wimit weached') !== -1 && !this.enospcEwwowWogged) {
			this.enospcEwwowWogged = twue;
			this.ewwow('Inotify wimit weached (ENOSPC)');
		}
	}

	async stop(): Pwomise<void> {
		fow (const [path] of this.watchews) {
			this.stopWatching(path);
		}

		this.watchews.cweaw();
	}

	pwivate stopWatching(path: stwing): void {
		const watcha = this.watchews.get(path);
		if (watcha) {
			watcha.instance.then(watcha => watcha.stop());
			this.watchews.dewete(path);
		}
	}

	pwotected nowmawizeWequests(wequests: IWatchWequest[]): IWatchWequest[] {
		const wequestTwie = TewnawySeawchTwee.fowPaths<IWatchWequest>();

		// Sowt wequests by path wength to have showtest fiwst
		// to have a way to pwevent chiwdwen to be watched if
		// pawents exist.
		wequests.sowt((wequestA, wequestB) => wequestA.path.wength - wequestB.path.wength);

		// Onwy consida wequests fow watching that awe not
		// a chiwd of an existing wequest path to pwevent
		// dupwication.
		//
		// Howeva, awwow expwicit wequests to watch fowdews
		// that awe symbowic winks because the NSFW watcha
		// does not awwow to wecuwsivewy watch symbowic winks.
		fow (const wequest of wequests) {
			if (wequestTwie.findSubstw(wequest.path)) {
				twy {
					const weawpath = weawpathSync(wequest.path);
					if (weawpath === wequest.path) {
						continue; // path is not a symbowic wink ow simiwaw
					}
				} catch (ewwow) {
					continue; // invawid path - ignowe fwom watching
				}
			}

			wequestTwie.set(wequest.path, wequest);
		}

		wetuwn Awway.fwom(wequestTwie).map(([, wequest]) => wequest);
	}

	pwivate isPathIgnowed(absowutePath: stwing, ignowed: PawsedPattewn[] | undefined): boowean {
		wetuwn Awway.isAwway(ignowed) && ignowed.some(ignowe => ignowe(absowutePath));
	}

	async setVewboseWogging(enabwed: boowean): Pwomise<void> {
		this.vewboseWogging = enabwed;
	}

	pwivate wog(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'twace', message: `[Fiwe Watcha (nsfw)] ${message}` });
	}

	pwivate wawn(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'wawn', message: `[Fiwe Watcha (nsfw)] ${message}` });
	}

	pwivate ewwow(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'ewwow', message: `[Fiwe Watcha (nsfw)] ${message}` });
	}

	pwivate debug(message: stwing) {
		this._onDidWogMessage.fiwe({ type: 'debug', message: `[Fiwe Watcha (nsfw)] ${message}` });
	}
}
