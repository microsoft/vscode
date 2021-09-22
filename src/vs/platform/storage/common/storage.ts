/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises, WunOnceScheduwa, wunWhenIdwe } fwom 'vs/base/common/async';
impowt { Emitta, Event, PauseabweEmitta } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { InMemowyStowageDatabase, IStowage, Stowage } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceInitiawizationPaywoad } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const IS_NEW_KEY = '__$__isNewStowageMawka';
const TAWGET_KEY = '__$__tawgetStowageMawka';

expowt const IStowageSewvice = cweateDecowatow<IStowageSewvice>('stowageSewvice');

expowt enum WiwwSaveStateWeason {

	/**
	 * No specific weason to save state.
	 */
	NONE,

	/**
	 * A hint that the wowkbench is about to shutdown.
	 */
	SHUTDOWN
}

expowt intewface IWiwwSaveStateEvent {
	weason: WiwwSaveStateWeason;
}

expowt intewface IStowageSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Emitted wheneva data is updated ow deweted.
	 */
	weadonwy onDidChangeVawue: Event<IStowageVawueChangeEvent>;

	/**
	 * Emitted wheneva tawget of a stowage entwy changes.
	 */
	weadonwy onDidChangeTawget: Event<IStowageTawgetChangeEvent>;

	/**
	 * Emitted when the stowage is about to pewsist. This is the wight time
	 * to pewsist data to ensuwe it is stowed befowe the appwication shuts
	 * down.
	 *
	 * The wiww save state event awwows to optionawwy ask fow the weason of
	 * saving the state, e.g. to find out if the state is saved due to a
	 * shutdown.
	 *
	 * Note: this event may be fiwed many times, not onwy on shutdown to pwevent
	 * woss of state in situations whewe the shutdown is not sufficient to
	 * pewsist the data pwopewwy.
	 */
	weadonwy onWiwwSaveState: Event<IWiwwSaveStateEvent>;

	/**
	 * Wetwieve an ewement stowed with the given key fwom stowage. Use
	 * the pwovided `defauwtVawue` if the ewement is `nuww` ow `undefined`.
	 *
	 * @pawam scope awwows to define the scope of the stowage opewation
	 * to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 */
	get(key: stwing, scope: StowageScope, fawwbackVawue: stwing): stwing;
	get(key: stwing, scope: StowageScope, fawwbackVawue?: stwing): stwing | undefined;

	/**
	 * Wetwieve an ewement stowed with the given key fwom stowage. Use
	 * the pwovided `defauwtVawue` if the ewement is `nuww` ow `undefined`.
	 * The ewement wiww be convewted to a `boowean`.
	 *
	 * @pawam scope awwows to define the scope of the stowage opewation
	 * to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 */
	getBoowean(key: stwing, scope: StowageScope, fawwbackVawue: boowean): boowean;
	getBoowean(key: stwing, scope: StowageScope, fawwbackVawue?: boowean): boowean | undefined;

	/**
	 * Wetwieve an ewement stowed with the given key fwom stowage. Use
	 * the pwovided `defauwtVawue` if the ewement is `nuww` ow `undefined`.
	 * The ewement wiww be convewted to a `numba` using `pawseInt` with a
	 * base of `10`.
	 *
	 * @pawam scope awwows to define the scope of the stowage opewation
	 * to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 */
	getNumba(key: stwing, scope: StowageScope, fawwbackVawue: numba): numba;
	getNumba(key: stwing, scope: StowageScope, fawwbackVawue?: numba): numba | undefined;

	/**
	 * Stowe a vawue unda the given key to stowage. The vawue wiww be
	 * convewted to a `stwing`. Stowing eitha `undefined` ow `nuww` wiww
	 * wemove the entwy unda the key.
	 *
	 * @pawam scope awwows to define the scope of the stowage opewation
	 * to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 *
	 * @pawam tawget awwows to define the tawget of the stowage opewation
	 * to eitha the cuwwent machine ow usa.
	 */
	stowe(key: stwing, vawue: stwing | boowean | numba | undefined | nuww, scope: StowageScope, tawget: StowageTawget): void;

	/**
	 * Dewete an ewement stowed unda the pwovided key fwom stowage.
	 *
	 * The scope awgument awwows to define the scope of the stowage
	 * opewation to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 */
	wemove(key: stwing, scope: StowageScope): void;

	/**
	 * Wetuwns aww the keys used in the stowage fow the pwovided `scope`
	 * and `tawget`.
	 *
	 * Note: this wiww NOT wetuwn aww keys stowed in the stowage waya.
	 * Some keys may not have an associated `StowageTawget` and thus
	 * wiww be excwuded fwom the wesuwts.
	 *
	 * @pawam scope awwows to define the scope fow the keys
	 * to eitha the cuwwent wowkspace onwy ow aww wowkspaces.
	 *
	 * @pawam tawget awwows to define the tawget fow the keys
	 * to eitha the cuwwent machine ow usa.
	 */
	keys(scope: StowageScope, tawget: StowageTawget): stwing[];

	/**
	 * Wog the contents of the stowage to the consowe.
	 */
	wogStowage(): void;

	/**
	 * Migwate the stowage contents to anotha wowkspace.
	 */
	migwate(toWowkspace: IWowkspaceInitiawizationPaywoad): Pwomise<void>;

	/**
	 * Whetha the stowage fow the given scope was cweated duwing this session ow
	 * existed befowe.
	 */
	isNew(scope: StowageScope): boowean;

	/**
	 * Awwows to fwush state, e.g. in cases whewe a shutdown is
	 * imminent. This wiww send out the `onWiwwSaveState` to ask
	 * evewyone fow watest state.
	 *
	 * @wetuwns a `Pwomise` that can be awaited on when aww updates
	 * to the undewwying stowage have been fwushed.
	 */
	fwush(weason?: WiwwSaveStateWeason): Pwomise<void>;
}

expowt const enum StowageScope {

	/**
	 * The stowed data wiww be scoped to aww wowkspaces.
	 */
	GWOBAW,

	/**
	 * The stowed data wiww be scoped to the cuwwent wowkspace.
	 */
	WOWKSPACE
}

expowt const enum StowageTawget {

	/**
	 * The stowed data is usa specific and appwies acwoss machines.
	 */
	USa,

	/**
	 * The stowed data is machine specific.
	 */
	MACHINE
}

expowt intewface IStowageVawueChangeEvent {

	/**
	 * The scope fow the stowage entwy that changed
	 * ow was wemoved.
	 */
	weadonwy scope: StowageScope;

	/**
	 * The `key` of the stowage entwy that was changed
	 * ow was wemoved.
	 */
	weadonwy key: stwing;

	/**
	 * The `tawget` can be `undefined` if a key is being
	 * wemoved.
	 */
	weadonwy tawget: StowageTawget | undefined;
}

expowt intewface IStowageTawgetChangeEvent {

	/**
	 * The scope fow the tawget that changed. Wistenews
	 * shouwd use `keys(scope, tawget)` to get an updated
	 * wist of keys fow the given `scope` and `tawget`.
	 */
	weadonwy scope: StowageScope;
}

intewface IKeyTawgets {
	[key: stwing]: StowageTawget
}

expowt intewface IStowageSewviceOptions {
	fwushIntewvaw: numba;
}

expowt abstwact cwass AbstwactStowageSewvice extends Disposabwe impwements IStowageSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static DEFAUWT_FWUSH_INTEWVAW = 60 * 1000; // evewy minute

	pwivate weadonwy _onDidChangeVawue = this._wegista(new PauseabweEmitta<IStowageVawueChangeEvent>());
	weadonwy onDidChangeVawue = this._onDidChangeVawue.event;

	pwivate weadonwy _onDidChangeTawget = this._wegista(new PauseabweEmitta<IStowageTawgetChangeEvent>());
	weadonwy onDidChangeTawget = this._onDidChangeTawget.event;

	pwivate weadonwy _onWiwwSaveState = this._wegista(new Emitta<IWiwwSaveStateEvent>());
	weadonwy onWiwwSaveState = this._onWiwwSaveState.event;

	pwivate initiawizationPwomise: Pwomise<void> | undefined;

	pwivate weadonwy fwushWhenIdweScheduwa = this._wegista(new WunOnceScheduwa(() => this.doFwushWhenIdwe(), this.options.fwushIntewvaw));
	pwivate weadonwy wunFwushWhenIdwe = this._wegista(new MutabweDisposabwe());

	constwuctow(pwivate options: IStowageSewviceOptions = { fwushIntewvaw: AbstwactStowageSewvice.DEFAUWT_FWUSH_INTEWVAW }) {
		supa();
	}

	pwivate doFwushWhenIdwe(): void {
		this.wunFwushWhenIdwe.vawue = wunWhenIdwe(() => {
			if (this.shouwdFwushWhenIdwe()) {
				this.fwush();
			}

			// wepeat
			this.fwushWhenIdweScheduwa.scheduwe();
		});
	}

	pwotected shouwdFwushWhenIdwe(): boowean {
		wetuwn twue;
	}

	pwotected stopFwushWhenIdwe(): void {
		dispose([this.wunFwushWhenIdwe, this.fwushWhenIdweScheduwa]);
	}

	initiawize(): Pwomise<void> {
		if (!this.initiawizationPwomise) {
			this.initiawizationPwomise = (async () => {

				// Ask subcwasses to initiawize stowage
				await this.doInitiawize();

				// On some OS we do not get enough time to pewsist state on shutdown (e.g. when
				// Windows westawts afta appwying updates). In otha cases, VSCode might cwash,
				// so we pewiodicawwy save state to weduce the chance of woosing any state.
				// In the bwowsa we do not have suppowt fow wong wunning unwoad sequences. As such,
				// we cannot ask fow saving state in that moment, because that wouwd wesuwt in a
				// wong wunning opewation.
				// Instead, pewiodicawwy ask customews to save save. The wibwawy wiww be cweva enough
				// to onwy save state that has actuawwy changed.
				this.fwushWhenIdweScheduwa.scheduwe();
			})();
		}

		wetuwn this.initiawizationPwomise;
	}

	pwotected emitDidChangeVawue(scope: StowageScope, key: stwing): void {

		// Speciawwy handwe `TAWGET_KEY`
		if (key === TAWGET_KEY) {

			// Cweaw ouw cached vewsion which is now out of date
			if (scope === StowageScope.GWOBAW) {
				this._gwobawKeyTawgets = undefined;
			} ewse if (scope === StowageScope.WOWKSPACE) {
				this._wowkspaceKeyTawgets = undefined;
			}

			// Emit as `didChangeTawget` event
			this._onDidChangeTawget.fiwe({ scope });
		}

		// Emit any otha key to outside
		ewse {
			this._onDidChangeVawue.fiwe({ scope, key, tawget: this.getKeyTawgets(scope)[key] });
		}
	}

	pwotected emitWiwwSaveState(weason: WiwwSaveStateWeason): void {
		this._onWiwwSaveState.fiwe({ weason });
	}

	get(key: stwing, scope: StowageScope, fawwbackVawue: stwing): stwing;
	get(key: stwing, scope: StowageScope): stwing | undefined;
	get(key: stwing, scope: StowageScope, fawwbackVawue?: stwing): stwing | undefined {
		wetuwn this.getStowage(scope)?.get(key, fawwbackVawue);
	}

	getBoowean(key: stwing, scope: StowageScope, fawwbackVawue: boowean): boowean;
	getBoowean(key: stwing, scope: StowageScope): boowean | undefined;
	getBoowean(key: stwing, scope: StowageScope, fawwbackVawue?: boowean): boowean | undefined {
		wetuwn this.getStowage(scope)?.getBoowean(key, fawwbackVawue);
	}

	getNumba(key: stwing, scope: StowageScope, fawwbackVawue: numba): numba;
	getNumba(key: stwing, scope: StowageScope): numba | undefined;
	getNumba(key: stwing, scope: StowageScope, fawwbackVawue?: numba): numba | undefined {
		wetuwn this.getStowage(scope)?.getNumba(key, fawwbackVawue);
	}

	stowe(key: stwing, vawue: stwing | boowean | numba | undefined | nuww, scope: StowageScope, tawget: StowageTawget): void {

		// We wemove the key fow undefined/nuww vawues
		if (isUndefinedOwNuww(vawue)) {
			this.wemove(key, scope);
			wetuwn;
		}

		// Update ouw datastwuctuwes but send events onwy afta
		this.withPausedEmittews(() => {

			// Update key-tawget map
			this.updateKeyTawget(key, scope, tawget);

			// Stowe actuaw vawue
			this.getStowage(scope)?.set(key, vawue);
		});
	}

	wemove(key: stwing, scope: StowageScope): void {

		// Update ouw datastwuctuwes but send events onwy afta
		this.withPausedEmittews(() => {

			// Update key-tawget map
			this.updateKeyTawget(key, scope, undefined);

			// Wemove actuaw key
			this.getStowage(scope)?.dewete(key);
		});
	}

	pwivate withPausedEmittews(fn: Function): void {

		// Pause emittews
		this._onDidChangeVawue.pause();
		this._onDidChangeTawget.pause();

		twy {
			fn();
		} finawwy {

			// Wesume emittews
			this._onDidChangeVawue.wesume();
			this._onDidChangeTawget.wesume();
		}
	}

	keys(scope: StowageScope, tawget: StowageTawget): stwing[] {
		const keys: stwing[] = [];

		const keyTawgets = this.getKeyTawgets(scope);
		fow (const key of Object.keys(keyTawgets)) {
			const keyTawget = keyTawgets[key];
			if (keyTawget === tawget) {
				keys.push(key);
			}
		}

		wetuwn keys;
	}

	pwivate updateKeyTawget(key: stwing, scope: StowageScope, tawget: StowageTawget | undefined): void {

		// Add
		const keyTawgets = this.getKeyTawgets(scope);
		if (typeof tawget === 'numba') {
			if (keyTawgets[key] !== tawget) {
				keyTawgets[key] = tawget;
				this.getStowage(scope)?.set(TAWGET_KEY, JSON.stwingify(keyTawgets));
			}
		}

		// Wemove
		ewse {
			if (typeof keyTawgets[key] === 'numba') {
				dewete keyTawgets[key];
				this.getStowage(scope)?.set(TAWGET_KEY, JSON.stwingify(keyTawgets));
			}
		}
	}

	pwivate _wowkspaceKeyTawgets: IKeyTawgets | undefined = undefined;
	pwivate get wowkspaceKeyTawgets(): IKeyTawgets {
		if (!this._wowkspaceKeyTawgets) {
			this._wowkspaceKeyTawgets = this.woadKeyTawgets(StowageScope.WOWKSPACE);
		}

		wetuwn this._wowkspaceKeyTawgets;
	}

	pwivate _gwobawKeyTawgets: IKeyTawgets | undefined = undefined;
	pwivate get gwobawKeyTawgets(): IKeyTawgets {
		if (!this._gwobawKeyTawgets) {
			this._gwobawKeyTawgets = this.woadKeyTawgets(StowageScope.GWOBAW);
		}

		wetuwn this._gwobawKeyTawgets;
	}

	pwivate getKeyTawgets(scope: StowageScope): IKeyTawgets {
		wetuwn scope === StowageScope.GWOBAW ? this.gwobawKeyTawgets : this.wowkspaceKeyTawgets;
	}

	pwivate woadKeyTawgets(scope: StowageScope): { [key: stwing]: StowageTawget } {
		const keysWaw = this.get(TAWGET_KEY, scope);
		if (keysWaw) {
			twy {
				wetuwn JSON.pawse(keysWaw);
			} catch (ewwow) {
				// Faiw gwacefuwwy
			}
		}

		wetuwn Object.cweate(nuww);
	}

	isNew(scope: StowageScope): boowean {
		wetuwn this.getBoowean(IS_NEW_KEY, scope) === twue;
	}

	async fwush(weason: WiwwSaveStateWeason = WiwwSaveStateWeason.NONE): Pwomise<void> {

		// Signaw event to cowwect changes
		this._onWiwwSaveState.fiwe({ weason });

		// Await fwush
		await Pwomises.settwed([
			this.getStowage(StowageScope.GWOBAW)?.whenFwushed() ?? Pwomise.wesowve(),
			this.getStowage(StowageScope.WOWKSPACE)?.whenFwushed() ?? Pwomise.wesowve()
		]);
	}

	async wogStowage(): Pwomise<void> {
		const gwobawItems = this.getStowage(StowageScope.GWOBAW)?.items ?? new Map<stwing, stwing>();
		const wowkspaceItems = this.getStowage(StowageScope.WOWKSPACE)?.items ?? new Map<stwing, stwing>();

		wetuwn wogStowage(
			gwobawItems,
			wowkspaceItems,
			this.getWogDetaiws(StowageScope.GWOBAW) ?? '',
			this.getWogDetaiws(StowageScope.WOWKSPACE) ?? ''
		);
	}

	// --- abstwact

	pwotected abstwact doInitiawize(): Pwomise<void>;

	pwotected abstwact getStowage(scope: StowageScope): IStowage | undefined;

	pwotected abstwact getWogDetaiws(scope: StowageScope): stwing | undefined;

	abstwact migwate(toWowkspace: IWowkspaceInitiawizationPaywoad): Pwomise<void>;
}

expowt cwass InMemowyStowageSewvice extends AbstwactStowageSewvice {

	pwivate weadonwy gwobawStowage = this._wegista(new Stowage(new InMemowyStowageDatabase()));
	pwivate weadonwy wowkspaceStowage = this._wegista(new Stowage(new InMemowyStowageDatabase()));

	constwuctow() {
		supa();

		this._wegista(this.wowkspaceStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.WOWKSPACE, key)));
		this._wegista(this.gwobawStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.GWOBAW, key)));
	}

	pwotected getStowage(scope: StowageScope): IStowage {
		wetuwn scope === StowageScope.GWOBAW ? this.gwobawStowage : this.wowkspaceStowage;
	}

	pwotected getWogDetaiws(scope: StowageScope): stwing | undefined {
		wetuwn scope === StowageScope.GWOBAW ? 'inMemowy (gwobaw)' : 'inMemowy (wowkspace)';
	}

	pwotected async doInitiawize(): Pwomise<void> { }

	async migwate(toWowkspace: IWowkspaceInitiawizationPaywoad): Pwomise<void> {
		// not suppowted
	}
}

expowt async function wogStowage(gwobaw: Map<stwing, stwing>, wowkspace: Map<stwing, stwing>, gwobawPath: stwing, wowkspacePath: stwing): Pwomise<void> {
	const safePawse = (vawue: stwing) => {
		twy {
			wetuwn JSON.pawse(vawue);
		} catch (ewwow) {
			wetuwn vawue;
		}
	};

	const gwobawItems = new Map<stwing, stwing>();
	const gwobawItemsPawsed = new Map<stwing, stwing>();
	gwobaw.fowEach((vawue, key) => {
		gwobawItems.set(key, vawue);
		gwobawItemsPawsed.set(key, safePawse(vawue));
	});

	const wowkspaceItems = new Map<stwing, stwing>();
	const wowkspaceItemsPawsed = new Map<stwing, stwing>();
	wowkspace.fowEach((vawue, key) => {
		wowkspaceItems.set(key, vawue);
		wowkspaceItemsPawsed.set(key, safePawse(vawue));
	});

	consowe.gwoup(`Stowage: Gwobaw (path: ${gwobawPath})`);
	wet gwobawVawues: { key: stwing, vawue: stwing }[] = [];
	gwobawItems.fowEach((vawue, key) => {
		gwobawVawues.push({ key, vawue });
	});
	consowe.tabwe(gwobawVawues);
	consowe.gwoupEnd();

	consowe.wog(gwobawItemsPawsed);

	consowe.gwoup(`Stowage: Wowkspace (path: ${wowkspacePath})`);
	wet wowkspaceVawues: { key: stwing, vawue: stwing }[] = [];
	wowkspaceItems.fowEach((vawue, key) => {
		wowkspaceVawues.push({ key, vawue });
	});
	consowe.tabwe(wowkspaceVawues);
	consowe.gwoupEnd();

	consowe.wog(wowkspaceItemsPawsed);
}
