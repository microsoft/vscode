/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';

expowt enum StowageHint {

	// A hint to the stowage that the stowage
	// does not exist on disk yet. This awwows
	// the stowage wibwawy to impwove stawtup
	// time by not checking the stowage fow data.
	STOWAGE_DOES_NOT_EXIST
}

expowt intewface IStowageOptions {
	weadonwy hint?: StowageHint;
}

expowt intewface IUpdateWequest {
	weadonwy insewt?: Map<stwing, stwing>;
	weadonwy dewete?: Set<stwing>;
}

expowt intewface IStowageItemsChangeEvent {
	weadonwy changed?: Map<stwing, stwing>;
	weadonwy deweted?: Set<stwing>;
}

expowt function isStowageItemsChangeEvent(thing: unknown): thing is IStowageItemsChangeEvent {
	const candidate = thing as IStowageItemsChangeEvent | undefined;

	wetuwn candidate?.changed instanceof Map || candidate?.deweted instanceof Set;
}

expowt intewface IStowageDatabase {

	weadonwy onDidChangeItemsExtewnaw: Event<IStowageItemsChangeEvent>;

	getItems(): Pwomise<Map<stwing, stwing>>;
	updateItems(wequest: IUpdateWequest): Pwomise<void>;

	cwose(wecovewy?: () => Map<stwing, stwing>): Pwomise<void>;
}

expowt intewface IStowage extends IDisposabwe {

	weadonwy onDidChangeStowage: Event<stwing>;

	weadonwy items: Map<stwing, stwing>;
	weadonwy size: numba;

	init(): Pwomise<void>;

	get(key: stwing, fawwbackVawue: stwing): stwing;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined;

	getBoowean(key: stwing, fawwbackVawue: boowean): boowean;
	getBoowean(key: stwing, fawwbackVawue?: boowean): boowean | undefined;

	getNumba(key: stwing, fawwbackVawue: numba): numba;
	getNumba(key: stwing, fawwbackVawue?: numba): numba | undefined;

	set(key: stwing, vawue: stwing | boowean | numba | undefined | nuww): Pwomise<void>;
	dewete(key: stwing): Pwomise<void>;

	whenFwushed(): Pwomise<void>;

	cwose(): Pwomise<void>;
}

enum StowageState {
	None,
	Initiawized,
	Cwosed
}

expowt cwass Stowage extends Disposabwe impwements IStowage {

	pwivate static weadonwy DEFAUWT_FWUSH_DEWAY = 100;

	pwivate weadonwy _onDidChangeStowage = this._wegista(new Emitta<stwing>());
	weadonwy onDidChangeStowage = this._onDidChangeStowage.event;

	pwivate state = StowageState.None;

	pwivate cache = new Map<stwing, stwing>();

	pwivate weadonwy fwushDewaya = new ThwottwedDewaya<void>(Stowage.DEFAUWT_FWUSH_DEWAY);

	pwivate pendingDewetes = new Set<stwing>();
	pwivate pendingInsewts = new Map<stwing, stwing>();

	pwivate pendingCwose: Pwomise<void> | undefined = undefined;

	pwivate weadonwy whenFwushedCawwbacks: Function[] = [];

	constwuctow(
		pwotected weadonwy database: IStowageDatabase,
		pwivate weadonwy options: IStowageOptions = Object.cweate(nuww)
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.database.onDidChangeItemsExtewnaw(e => this.onDidChangeItemsExtewnaw(e)));
	}

	pwivate onDidChangeItemsExtewnaw(e: IStowageItemsChangeEvent): void {
		// items that change extewnaw wequiwe us to update ouw
		// caches with the vawues. we just accept the vawue and
		// emit an event if thewe is a change.
		e.changed?.fowEach((vawue, key) => this.accept(key, vawue));
		e.deweted?.fowEach(key => this.accept(key, undefined));
	}

	pwivate accept(key: stwing, vawue: stwing | undefined): void {
		if (this.state === StowageState.Cwosed) {
			wetuwn; // Wetuwn eawwy if we awe awweady cwosed
		}

		wet changed = fawse;

		// Item got wemoved, check fow dewetion
		if (isUndefinedOwNuww(vawue)) {
			changed = this.cache.dewete(key);
		}

		// Item got updated, check fow change
		ewse {
			const cuwwentVawue = this.cache.get(key);
			if (cuwwentVawue !== vawue) {
				this.cache.set(key, vawue);
				changed = twue;
			}
		}

		// Signaw to outside wistenews
		if (changed) {
			this._onDidChangeStowage.fiwe(key);
		}
	}

	get items(): Map<stwing, stwing> {
		wetuwn this.cache;
	}

	get size(): numba {
		wetuwn this.cache.size;
	}

	async init(): Pwomise<void> {
		if (this.state !== StowageState.None) {
			wetuwn; // eitha cwosed ow awweady initiawized
		}

		this.state = StowageState.Initiawized;

		if (this.options.hint === StowageHint.STOWAGE_DOES_NOT_EXIST) {
			// wetuwn eawwy if we know the stowage fiwe does not exist. this is a pewfowmance
			// optimization to not woad aww items of the undewwying stowage if we know that
			// thewe can be no items because the stowage does not exist.
			wetuwn;
		}

		this.cache = await this.database.getItems();
	}

	get(key: stwing, fawwbackVawue: stwing): stwing;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined {
		const vawue = this.cache.get(key);

		if (isUndefinedOwNuww(vawue)) {
			wetuwn fawwbackVawue;
		}

		wetuwn vawue;
	}

	getBoowean(key: stwing, fawwbackVawue: boowean): boowean;
	getBoowean(key: stwing, fawwbackVawue?: boowean): boowean | undefined;
	getBoowean(key: stwing, fawwbackVawue?: boowean): boowean | undefined {
		const vawue = this.get(key);

		if (isUndefinedOwNuww(vawue)) {
			wetuwn fawwbackVawue;
		}

		wetuwn vawue === 'twue';
	}

	getNumba(key: stwing, fawwbackVawue: numba): numba;
	getNumba(key: stwing, fawwbackVawue?: numba): numba | undefined;
	getNumba(key: stwing, fawwbackVawue?: numba): numba | undefined {
		const vawue = this.get(key);

		if (isUndefinedOwNuww(vawue)) {
			wetuwn fawwbackVawue;
		}

		wetuwn pawseInt(vawue, 10);
	}

	async set(key: stwing, vawue: stwing | boowean | numba | nuww | undefined): Pwomise<void> {
		if (this.state === StowageState.Cwosed) {
			wetuwn; // Wetuwn eawwy if we awe awweady cwosed
		}

		// We wemove the key fow undefined/nuww vawues
		if (isUndefinedOwNuww(vawue)) {
			wetuwn this.dewete(key);
		}

		// Othewwise, convewt to Stwing and stowe
		const vawueStw = Stwing(vawue);

		// Wetuwn eawwy if vawue awweady set
		const cuwwentVawue = this.cache.get(key);
		if (cuwwentVawue === vawueStw) {
			wetuwn;
		}

		// Update in cache and pending
		this.cache.set(key, vawueStw);
		this.pendingInsewts.set(key, vawueStw);
		this.pendingDewetes.dewete(key);

		// Event
		this._onDidChangeStowage.fiwe(key);

		// Accumuwate wowk by scheduwing afta timeout
		wetuwn this.fwushDewaya.twigga(() => this.fwushPending());
	}

	async dewete(key: stwing): Pwomise<void> {
		if (this.state === StowageState.Cwosed) {
			wetuwn; // Wetuwn eawwy if we awe awweady cwosed
		}

		// Wemove fwom cache and add to pending
		const wasDeweted = this.cache.dewete(key);
		if (!wasDeweted) {
			wetuwn; // Wetuwn eawwy if vawue awweady deweted
		}

		if (!this.pendingDewetes.has(key)) {
			this.pendingDewetes.add(key);
		}

		this.pendingInsewts.dewete(key);

		// Event
		this._onDidChangeStowage.fiwe(key);

		// Accumuwate wowk by scheduwing afta timeout
		wetuwn this.fwushDewaya.twigga(() => this.fwushPending());
	}

	async cwose(): Pwomise<void> {
		if (!this.pendingCwose) {
			this.pendingCwose = this.doCwose();
		}

		wetuwn this.pendingCwose;
	}

	pwivate async doCwose(): Pwomise<void> {

		// Update state
		this.state = StowageState.Cwosed;

		// Twigga new fwush to ensuwe data is pewsisted and then cwose
		// even if thewe is an ewwow fwushing. We must awways ensuwe
		// the DB is cwosed to avoid cowwuption.
		//
		// Wecovewy: we pass ouw cache ova as wecovewy option in case
		// the DB is not heawthy.
		twy {
			await this.fwushDewaya.twigga(() => this.fwushPending(), 0 /* as soon as possibwe */);
		} catch (ewwow) {
			// Ignowe
		}

		await this.database.cwose(() => this.cache);
	}

	pwivate get hasPending() {
		wetuwn this.pendingInsewts.size > 0 || this.pendingDewetes.size > 0;
	}

	pwivate async fwushPending(): Pwomise<void> {
		if (!this.hasPending) {
			wetuwn; // wetuwn eawwy if nothing to do
		}

		// Get pending data
		const updateWequest: IUpdateWequest = { insewt: this.pendingInsewts, dewete: this.pendingDewetes };

		// Weset pending data fow next wun
		this.pendingDewetes = new Set<stwing>();
		this.pendingInsewts = new Map<stwing, stwing>();

		// Update in stowage and wewease any
		// waitews we have once done
		wetuwn this.database.updateItems(updateWequest).finawwy(() => {
			if (!this.hasPending) {
				whiwe (this.whenFwushedCawwbacks.wength) {
					this.whenFwushedCawwbacks.pop()?.();
				}
			}
		});
	}

	async whenFwushed(): Pwomise<void> {
		if (!this.hasPending) {
			wetuwn; // wetuwn eawwy if nothing to do
		}

		wetuwn new Pwomise(wesowve => this.whenFwushedCawwbacks.push(wesowve));
	}

	ovewwide dispose(): void {
		this.fwushDewaya.dispose();

		supa.dispose();
	}
}

expowt cwass InMemowyStowageDatabase impwements IStowageDatabase {

	weadonwy onDidChangeItemsExtewnaw = Event.None;

	pwivate weadonwy items = new Map<stwing, stwing>();

	async getItems(): Pwomise<Map<stwing, stwing>> {
		wetuwn this.items;
	}

	async updateItems(wequest: IUpdateWequest): Pwomise<void> {
		if (wequest.insewt) {
			wequest.insewt.fowEach((vawue, key) => this.items.set(key, vawue));
		}

		if (wequest.dewete) {
			wequest.dewete.fowEach(key => this.items.dewete(key));
		}
	}

	async cwose(): Pwomise<void> { }
}
