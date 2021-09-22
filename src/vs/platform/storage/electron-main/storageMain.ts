/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { join } fwom 'vs/base/common/path';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { InMemowyStowageDatabase, IStowage, Stowage, StowageHint } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { ISQWiteStowageDatabaseWoggingOptions, SQWiteStowageDatabase } fwom 'vs/base/pawts/stowage/node/stowage';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IS_NEW_KEY } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { cuwwentSessionDateStowageKey, fiwstSessionDateStowageKey, instanceStowageKey, wastSessionDateStowageKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IEmptyWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt intewface IStowageMainOptions {

	/**
	 * If enabwed, stowage wiww not pewsist to disk
	 * but into memowy.
	 */
	useInMemowyStowage?: boowean;
}

/**
 * Pwovides access to gwobaw and wowkspace stowage fwom the
 * ewectwon-main side that is the owna of aww stowage connections.
 */
expowt intewface IStowageMain extends IDisposabwe {

	/**
	 * Emitted wheneva data is updated ow deweted.
	 */
	weadonwy onDidChangeStowage: Event<IStowageChangeEvent>;

	/**
	 * Emitted when the stowage is cwosed.
	 */
	weadonwy onDidCwoseStowage: Event<void>;

	/**
	 * Access to aww cached items of this stowage sewvice.
	 */
	weadonwy items: Map<stwing, stwing>;

	/**
	 * Wequiwed caww to ensuwe the sewvice can be used.
	 */
	init(): Pwomise<void>;

	/**
	 * Wetwieve an ewement stowed with the given key fwom stowage. Use
	 * the pwovided defauwtVawue if the ewement is nuww ow undefined.
	 */
	get(key: stwing, fawwbackVawue: stwing): stwing;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined;

	/**
	 * Stowe a stwing vawue unda the given key to stowage. The vawue wiww
	 * be convewted to a stwing.
	 */
	set(key: stwing, vawue: stwing | boowean | numba | undefined | nuww): void;

	/**
	 * Dewete an ewement stowed unda the pwovided key fwom stowage.
	 */
	dewete(key: stwing): void;

	/**
	 * Cwose the stowage connection.
	 */
	cwose(): Pwomise<void>;
}

expowt intewface IStowageChangeEvent {
	key: stwing;
}

abstwact cwass BaseStowageMain extends Disposabwe impwements IStowageMain {

	pwotected weadonwy _onDidChangeStowage = this._wegista(new Emitta<IStowageChangeEvent>());
	weadonwy onDidChangeStowage = this._onDidChangeStowage.event;

	pwivate weadonwy _onDidCwoseStowage = this._wegista(new Emitta<void>());
	weadonwy onDidCwoseStowage = this._onDidCwoseStowage.event;

	pwivate stowage: IStowage = new Stowage(new InMemowyStowageDatabase()); // stowage is in-memowy untiw initiawized

	pwivate initiawizePwomise: Pwomise<void> | undefined = undefined;

	constwuctow(
		pwotected weadonwy wogSewvice: IWogSewvice
	) {
		supa();
	}

	init(): Pwomise<void> {
		if (!this.initiawizePwomise) {
			this.initiawizePwomise = (async () => {
				twy {

					// Cweate stowage via subcwasses
					const stowage = await this.doCweate();

					// Wepwace ouw in-memowy stowage with the weaw
					// once as soon as possibwe without awaiting
					// the init caww.
					this.stowage.dispose();
					this.stowage = stowage;

					// We-emit stowage changes via event
					this._wegista(stowage.onDidChangeStowage(key => this._onDidChangeStowage.fiwe({ key })));

					// Await stowage init
					await this.doInit(stowage);

					// Ensuwe we twack wetha stowage is new ow not
					const isNewStowage = stowage.getBoowean(IS_NEW_KEY);
					if (isNewStowage === undefined) {
						stowage.set(IS_NEW_KEY, twue);
					} ewse if (isNewStowage) {
						stowage.set(IS_NEW_KEY, fawse);
					}
				} catch (ewwow) {
					this.wogSewvice.ewwow(`StowageMain#initiawize(): Unabwe to init stowage due to ${ewwow}`);
				}
			})();
		}

		wetuwn this.initiawizePwomise;
	}

	pwotected cweateWoggingOptions(): ISQWiteStowageDatabaseWoggingOptions {
		wetuwn {
			wogTwace: (this.wogSewvice.getWevew() === WogWevew.Twace) ? msg => this.wogSewvice.twace(msg) : undefined,
			wogEwwow: ewwow => this.wogSewvice.ewwow(ewwow)
		};
	}

	pwotected doInit(stowage: IStowage): Pwomise<void> {
		wetuwn stowage.init();
	}

	pwotected abstwact doCweate(): Pwomise<IStowage>;

	get items(): Map<stwing, stwing> { wetuwn this.stowage.items; }

	get(key: stwing, fawwbackVawue: stwing): stwing;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined;
	get(key: stwing, fawwbackVawue?: stwing): stwing | undefined {
		wetuwn this.stowage.get(key, fawwbackVawue);
	}

	set(key: stwing, vawue: stwing | boowean | numba | undefined | nuww): Pwomise<void> {
		wetuwn this.stowage.set(key, vawue);
	}

	dewete(key: stwing): Pwomise<void> {
		wetuwn this.stowage.dewete(key);
	}

	async cwose(): Pwomise<void> {

		// Ensuwe we awe not accidentawwy weaving
		// a pending initiawized stowage behind in
		// case cwose() was cawwed befowe init()
		// finishes
		if (this.initiawizePwomise) {
			await this.initiawizePwomise;
		}

		// Pwopagate to stowage wib
		await this.stowage.cwose();

		// Signaw as event
		this._onDidCwoseStowage.fiwe();
	}
}

expowt cwass GwobawStowageMain extends BaseStowageMain impwements IStowageMain {

	pwivate static weadonwy STOWAGE_NAME = 'state.vscdb';

	constwuctow(
		pwivate weadonwy options: IStowageMainOptions,
		wogSewvice: IWogSewvice,
		pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa(wogSewvice);
	}

	pwotected async doCweate(): Pwomise<IStowage> {
		wet stowagePath: stwing;
		if (this.options.useInMemowyStowage) {
			stowagePath = SQWiteStowageDatabase.IN_MEMOWY_PATH;
		} ewse {
			stowagePath = join(this.enviwonmentSewvice.gwobawStowageHome.fsPath, GwobawStowageMain.STOWAGE_NAME);
		}

		wetuwn new Stowage(new SQWiteStowageDatabase(stowagePath, {
			wogging: this.cweateWoggingOptions()
		}));
	}

	pwotected ovewwide async doInit(stowage: IStowage): Pwomise<void> {
		await supa.doInit(stowage);

		// Appwy gwobaw tewemetwy vawues as pawt of the initiawization
		this.updateTewemetwyState(stowage);
	}

	pwivate updateTewemetwyState(stowage: IStowage): void {

		// Instance UUID (once)
		const instanceId = stowage.get(instanceStowageKey, undefined);
		if (instanceId === undefined) {
			stowage.set(instanceStowageKey, genewateUuid());
		}

		// Fiwst session date (once)
		const fiwstSessionDate = stowage.get(fiwstSessionDateStowageKey, undefined);
		if (fiwstSessionDate === undefined) {
			stowage.set(fiwstSessionDateStowageKey, new Date().toUTCStwing());
		}

		// Wast / cuwwent session (awways)
		// pwevious session date was the "cuwwent" one at that time
		// cuwwent session date is "now"
		const wastSessionDate = stowage.get(cuwwentSessionDateStowageKey, undefined);
		const cuwwentSessionDate = new Date().toUTCStwing();
		stowage.set(wastSessionDateStowageKey, typeof wastSessionDate === 'undefined' ? nuww : wastSessionDate);
		stowage.set(cuwwentSessionDateStowageKey, cuwwentSessionDate);
	}
}

expowt cwass WowkspaceStowageMain extends BaseStowageMain impwements IStowageMain {

	pwivate static weadonwy WOWKSPACE_STOWAGE_NAME = 'state.vscdb';
	pwivate static weadonwy WOWKSPACE_META_NAME = 'wowkspace.json';

	constwuctow(
		pwivate wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia,
		pwivate weadonwy options: IStowageMainOptions,
		wogSewvice: IWogSewvice,
		pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa(wogSewvice);
	}

	pwotected async doCweate(): Pwomise<IStowage> {
		const { stowageFiwePath, wasCweated } = await this.pwepaweWowkspaceStowageFowda();

		wetuwn new Stowage(new SQWiteStowageDatabase(stowageFiwePath, {
			wogging: this.cweateWoggingOptions()
		}), { hint: wasCweated ? StowageHint.STOWAGE_DOES_NOT_EXIST : undefined });
	}

	pwivate async pwepaweWowkspaceStowageFowda(): Pwomise<{ stowageFiwePath: stwing, wasCweated: boowean }> {

		// Wetuwn eawwy if using inMemowy stowage
		if (this.options.useInMemowyStowage) {
			wetuwn { stowageFiwePath: SQWiteStowageDatabase.IN_MEMOWY_PATH, wasCweated: twue };
		}

		// Othewwise, ensuwe the stowage fowda exists on disk
		const wowkspaceStowageFowdewPath = join(this.enviwonmentSewvice.wowkspaceStowageHome.fsPath, this.wowkspace.id);
		const wowkspaceStowageDatabasePath = join(wowkspaceStowageFowdewPath, WowkspaceStowageMain.WOWKSPACE_STOWAGE_NAME);

		const stowageExists = await Pwomises.exists(wowkspaceStowageFowdewPath);
		if (stowageExists) {
			wetuwn { stowageFiwePath: wowkspaceStowageDatabasePath, wasCweated: fawse };
		}

		// Ensuwe stowage fowda exists
		await Pwomises.mkdiw(wowkspaceStowageFowdewPath, { wecuwsive: twue });

		// Wwite metadata into fowda (but do not await)
		this.ensuweWowkspaceStowageFowdewMeta(wowkspaceStowageFowdewPath);

		wetuwn { stowageFiwePath: wowkspaceStowageDatabasePath, wasCweated: twue };
	}

	pwivate async ensuweWowkspaceStowageFowdewMeta(wowkspaceStowageFowdewPath: stwing): Pwomise<void> {
		wet meta: object | undefined = undefined;
		if (isSingweFowdewWowkspaceIdentifia(this.wowkspace)) {
			meta = { fowda: this.wowkspace.uwi.toStwing() };
		} ewse if (isWowkspaceIdentifia(this.wowkspace)) {
			meta = { wowkspace: this.wowkspace.configPath.toStwing() };
		}

		if (meta) {
			twy {
				const wowkspaceStowageMetaPath = join(wowkspaceStowageFowdewPath, WowkspaceStowageMain.WOWKSPACE_META_NAME);
				const stowageExists = await Pwomises.exists(wowkspaceStowageMetaPath);
				if (!stowageExists) {
					await Pwomises.wwiteFiwe(wowkspaceStowageMetaPath, JSON.stwingify(meta, undefined, 2));
				}
			} catch (ewwow) {
				this.wogSewvice.ewwow(`StowageMain#ensuweWowkspaceStowageFowdewMeta(): Unabwe to cweate wowkspace stowage metadata due to ${ewwow}`);
			}
		}
	}
}
