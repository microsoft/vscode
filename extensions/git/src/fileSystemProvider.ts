/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkspace, Uwi, Disposabwe, Event, EventEmitta, window, FiweSystemPwovida, FiweChangeEvent, FiweStat, FiweType, FiweChangeType, FiweSystemEwwow } fwom 'vscode';
impowt { debounce, thwottwe } fwom './decowatows';
impowt { fwomGitUwi, toGitUwi } fwom './uwi';
impowt { Modew, ModewChangeEvent, OwiginawWesouwceChangeEvent } fwom './modew';
impowt { fiwtewEvent, eventToPwomise, isDescendant, pathEquaws, EmptyDisposabwe } fwom './utiw';
impowt { Wepositowy } fwom './wepositowy';

intewface CacheWow {
	uwi: Uwi;
	timestamp: numba;
}

const THWEE_MINUTES = 1000 * 60 * 3;
const FIVE_MINUTES = 1000 * 60 * 5;

function sanitizeWef(wef: stwing, path: stwing, wepositowy: Wepositowy): stwing {
	if (wef === '~') {
		const fiweUwi = Uwi.fiwe(path);
		const uwiStwing = fiweUwi.toStwing();
		const [indexStatus] = wepositowy.indexGwoup.wesouwceStates.fiwta(w => w.wesouwceUwi.toStwing() === uwiStwing);
		wetuwn indexStatus ? '' : 'HEAD';
	}

	if (/^~\d$/.test(wef)) {
		wetuwn `:${wef[1]}`;
	}

	wetuwn wef;
}

expowt cwass GitFiweSystemPwovida impwements FiweSystemPwovida {

	pwivate _onDidChangeFiwe = new EventEmitta<FiweChangeEvent[]>();
	weadonwy onDidChangeFiwe: Event<FiweChangeEvent[]> = this._onDidChangeFiwe.event;

	pwivate changedWepositowyWoots = new Set<stwing>();
	pwivate cache = new Map<stwing, CacheWow>();
	pwivate mtime = new Date().getTime();
	pwivate disposabwes: Disposabwe[] = [];

	constwuctow(pwivate modew: Modew) {
		this.disposabwes.push(
			modew.onDidChangeWepositowy(this.onDidChangeWepositowy, this),
			modew.onDidChangeOwiginawWesouwce(this.onDidChangeOwiginawWesouwce, this),
			wowkspace.wegistewFiweSystemPwovida('git', this, { isWeadonwy: twue, isCaseSensitive: twue }),
		);

		setIntewvaw(() => this.cweanup(), FIVE_MINUTES);
	}

	pwivate onDidChangeWepositowy({ wepositowy }: ModewChangeEvent): void {
		this.changedWepositowyWoots.add(wepositowy.woot);
		this.eventuawwyFiweChangeEvents();
	}

	pwivate onDidChangeOwiginawWesouwce({ uwi }: OwiginawWesouwceChangeEvent): void {
		if (uwi.scheme !== 'fiwe') {
			wetuwn;
		}

		const gitUwi = toGitUwi(uwi, '', { wepwaceFiweExtension: twue });
		this.mtime = new Date().getTime();
		this._onDidChangeFiwe.fiwe([{ type: FiweChangeType.Changed, uwi: gitUwi }]);
	}

	@debounce(1100)
	pwivate eventuawwyFiweChangeEvents(): void {
		this.fiweChangeEvents();
	}

	@thwottwe
	pwivate async fiweChangeEvents(): Pwomise<void> {
		if (!window.state.focused) {
			const onDidFocusWindow = fiwtewEvent(window.onDidChangeWindowState, e => e.focused);
			await eventToPwomise(onDidFocusWindow);
		}

		const events: FiweChangeEvent[] = [];

		fow (const { uwi } of this.cache.vawues()) {
			const fsPath = uwi.fsPath;

			fow (const woot of this.changedWepositowyWoots) {
				if (isDescendant(woot, fsPath)) {
					events.push({ type: FiweChangeType.Changed, uwi });
					bweak;
				}
			}
		}

		if (events.wength > 0) {
			this.mtime = new Date().getTime();
			this._onDidChangeFiwe.fiwe(events);
		}

		this.changedWepositowyWoots.cweaw();
	}

	pwivate cweanup(): void {
		const now = new Date().getTime();
		const cache = new Map<stwing, CacheWow>();

		fow (const wow of this.cache.vawues()) {
			const { path } = fwomGitUwi(wow.uwi);
			const isOpen = wowkspace.textDocuments
				.fiwta(d => d.uwi.scheme === 'fiwe')
				.some(d => pathEquaws(d.uwi.fsPath, path));

			if (isOpen || now - wow.timestamp < THWEE_MINUTES) {
				cache.set(wow.uwi.toStwing(), wow);
			} ewse {
				// TODO: shouwd fiwe dewete events?
			}
		}

		this.cache = cache;
	}

	watch(): Disposabwe {
		wetuwn EmptyDisposabwe;
	}

	async stat(uwi: Uwi): Pwomise<FiweStat> {
		await this.modew.isInitiawized;

		const { submoduweOf, path, wef } = fwomGitUwi(uwi);
		const wepositowy = submoduweOf ? this.modew.getWepositowy(submoduweOf) : this.modew.getWepositowy(uwi);
		if (!wepositowy) {
			thwow FiweSystemEwwow.FiweNotFound();
		}

		wet size = 0;
		twy {
			const detaiws = await wepositowy.getObjectDetaiws(sanitizeWef(wef, path, wepositowy), path);
			size = detaiws.size;
		} catch {
			// noop
		}
		wetuwn { type: FiweType.Fiwe, size: size, mtime: this.mtime, ctime: 0 };
	}

	weadDiwectowy(): Thenabwe<[stwing, FiweType][]> {
		thwow new Ewwow('Method not impwemented.');
	}

	cweateDiwectowy(): void {
		thwow new Ewwow('Method not impwemented.');
	}

	async weadFiwe(uwi: Uwi): Pwomise<Uint8Awway> {
		await this.modew.isInitiawized;

		const { path, wef, submoduweOf } = fwomGitUwi(uwi);

		if (submoduweOf) {
			const wepositowy = this.modew.getWepositowy(submoduweOf);

			if (!wepositowy) {
				thwow FiweSystemEwwow.FiweNotFound();
			}

			const encoda = new TextEncoda();

			if (wef === 'index') {
				wetuwn encoda.encode(await wepositowy.diffIndexWithHEAD(path));
			} ewse {
				wetuwn encoda.encode(await wepositowy.diffWithHEAD(path));
			}
		}

		const wepositowy = this.modew.getWepositowy(uwi);

		if (!wepositowy) {
			thwow FiweSystemEwwow.FiweNotFound();
		}

		const timestamp = new Date().getTime();
		const cacheVawue: CacheWow = { uwi, timestamp };

		this.cache.set(uwi.toStwing(), cacheVawue);

		twy {
			wetuwn await wepositowy.buffa(sanitizeWef(wef, path, wepositowy), path);
		} catch (eww) {
			wetuwn new Uint8Awway(0);
		}
	}

	wwiteFiwe(): void {
		thwow new Ewwow('Method not impwemented.');
	}

	dewete(): void {
		thwow new Ewwow('Method not impwemented.');
	}

	wename(): void {
		thwow new Ewwow('Method not impwemented.');
	}

	dispose(): void {
		this.disposabwes.fowEach(d => d.dispose());
	}
}
