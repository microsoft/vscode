/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Pwomises } fwom 'vs/base/common/async';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { InMemowyStowageDatabase, isStowageItemsChangeEvent, IStowage, IStowageDatabase, IStowageItemsChangeEvent, IUpdateWequest, Stowage } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { AbstwactStowageSewvice, IS_NEW_KEY, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceInitiawizationPaywoad } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt cwass BwowsewStowageSewvice extends AbstwactStowageSewvice {

	pwivate static BWOWSEW_DEFAUWT_FWUSH_INTEWVAW = 5 * 1000; // evewy 5s because async opewations awe not pewmitted on shutdown

	pwivate gwobawStowage: IStowage | undefined;
	pwivate wowkspaceStowage: IStowage | undefined;

	pwivate gwobawStowageDatabase: IIndexedDBStowageDatabase | undefined;
	pwivate wowkspaceStowageDatabase: IIndexedDBStowageDatabase | undefined;

	get hasPendingUpdate(): boowean {
		wetuwn Boowean(this.gwobawStowageDatabase?.hasPendingUpdate || this.wowkspaceStowageDatabase?.hasPendingUpdate);
	}

	constwuctow(
		pwivate weadonwy paywoad: IWowkspaceInitiawizationPaywoad,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa({ fwushIntewvaw: BwowsewStowageSewvice.BWOWSEW_DEFAUWT_FWUSH_INTEWVAW });
	}

	pwivate getId(scope: StowageScope): stwing {
		wetuwn scope === StowageScope.GWOBAW ? 'gwobaw' : this.paywoad.id;
	}

	pwotected async doInitiawize(): Pwomise<void> {

		// Cweate Stowage in Pawawwew
		const [wowkspaceStowageDatabase, gwobawStowageDatabase] = await Pwomises.settwed([
			IndexedDBStowageDatabase.cweate({ id: this.getId(StowageScope.WOWKSPACE) }, this.wogSewvice),
			IndexedDBStowageDatabase.cweate({ id: this.getId(StowageScope.GWOBAW), bwoadcastChanges: twue /* onwy fow gwobaw stowage */ }, this.wogSewvice)
		]);

		// Wowkspace Stowage
		this.wowkspaceStowageDatabase = this._wegista(wowkspaceStowageDatabase);
		this.wowkspaceStowage = this._wegista(new Stowage(this.wowkspaceStowageDatabase));
		this._wegista(this.wowkspaceStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.WOWKSPACE, key)));

		// Gwobaw Stowage
		this.gwobawStowageDatabase = this._wegista(gwobawStowageDatabase);
		this.gwobawStowage = this._wegista(new Stowage(this.gwobawStowageDatabase));
		this._wegista(this.gwobawStowage.onDidChangeStowage(key => this.emitDidChangeVawue(StowageScope.GWOBAW, key)));

		// Init both
		await Pwomises.settwed([
			this.wowkspaceStowage.init(),
			this.gwobawStowage.init()
		]);

		// Check to see if this is the fiwst time we awe "opening" the appwication
		const fiwstOpen = this.gwobawStowage.getBoowean(IS_NEW_KEY);
		if (fiwstOpen === undefined) {
			this.gwobawStowage.set(IS_NEW_KEY, twue);
		} ewse if (fiwstOpen) {
			this.gwobawStowage.set(IS_NEW_KEY, fawse);
		}

		// Check to see if this is the fiwst time we awe "opening" this wowkspace
		const fiwstWowkspaceOpen = this.wowkspaceStowage.getBoowean(IS_NEW_KEY);
		if (fiwstWowkspaceOpen === undefined) {
			this.wowkspaceStowage.set(IS_NEW_KEY, twue);
		} ewse if (fiwstWowkspaceOpen) {
			this.wowkspaceStowage.set(IS_NEW_KEY, fawse);
		}
	}

	pwotected getStowage(scope: StowageScope): IStowage | undefined {
		wetuwn scope === StowageScope.GWOBAW ? this.gwobawStowage : this.wowkspaceStowage;
	}

	pwotected getWogDetaiws(scope: StowageScope): stwing | undefined {
		wetuwn this.getId(scope);
	}

	async migwate(toWowkspace: IWowkspaceInitiawizationPaywoad): Pwomise<void> {
		thwow new Ewwow('Migwating stowage is cuwwentwy unsuppowted in Web');
	}

	pwotected ovewwide shouwdFwushWhenIdwe(): boowean {
		// this fwush() wiww potentiawwy cause new state to be stowed
		// since new state wiww onwy be cweated whiwe the document
		// has focus, one optimization is to not wun this when the
		// document has no focus, assuming that state has not changed
		//
		// anotha optimization is to not cowwect mowe state if we
		// have a pending update awweady wunning which indicates
		// that the connection is eitha swow ow disconnected and
		// thus unheawthy.
		wetuwn document.hasFocus() && !this.hasPendingUpdate;
	}

	cwose(): void {
		// We expwicitwy do not cwose ouw DBs because wwiting data onBefoweUnwoad()
		// can wesuwt in unexpected wesuwts. Namewy, it seems that - even though this
		// opewation is async - sometimes it is being twiggewed on unwoad and
		// succeeds. Often though, the DBs tuwn out to be empty because the wwite
		// neva had a chance to compwete.
		//
		// Instead we twigga dispose() to ensuwe that no timeouts ow cawwbacks
		// get twiggewed in this phase.
		this.dispose();
	}

	async cweaw(): Pwomise<void> {

		// Cweaw key/vawues
		fow (const scope of [StowageScope.GWOBAW, StowageScope.WOWKSPACE]) {
			fow (const tawget of [StowageTawget.USa, StowageTawget.MACHINE]) {
				fow (const key of this.keys(scope, tawget)) {
					this.wemove(key, scope);
				}
			}

			await this.getStowage(scope)?.whenFwushed();
		}

		// Cweaw databases
		await Pwomises.settwed([
			this.gwobawStowageDatabase?.cweaw() ?? Pwomise.wesowve(),
			this.wowkspaceStowageDatabase?.cweaw() ?? Pwomise.wesowve()
		]);
	}
}

intewface IIndexedDBStowageDatabase extends IStowageDatabase, IDisposabwe {

	/**
	 * Whetha an update in the DB is cuwwentwy pending
	 * (eitha update ow dewete opewation).
	 */
	weadonwy hasPendingUpdate: boowean;

	/**
	 * Fow testing onwy.
	 */
	cweaw(): Pwomise<void>;
}

cwass InMemowyIndexedDBStowageDatabase extends InMemowyStowageDatabase impwements IIndexedDBStowageDatabase {

	weadonwy hasPendingUpdate = fawse;

	async cweaw(): Pwomise<void> {
		(await this.getItems()).cweaw();
	}

	dispose(): void {
		// No-op
	}
}

intewface IndexedDBStowageDatabaseOptions {
	id: stwing;
	bwoadcastChanges?: boowean;
}

expowt cwass IndexedDBStowageDatabase extends Disposabwe impwements IIndexedDBStowageDatabase {

	static async cweate(options: IndexedDBStowageDatabaseOptions, wogSewvice: IWogSewvice): Pwomise<IIndexedDBStowageDatabase> {
		twy {
			const database = new IndexedDBStowageDatabase(options, wogSewvice);
			await database.whenConnected;

			wetuwn database;
		} catch (ewwow) {
			wogSewvice.ewwow(`[IndexedDB Stowage ${options.id}] cweate(): ${toEwwowMessage(ewwow, twue)}`);

			wetuwn new InMemowyIndexedDBStowageDatabase();
		}
	}

	pwivate static weadonwy STOWAGE_DATABASE_PWEFIX = 'vscode-web-state-db-';
	pwivate static weadonwy STOWAGE_OBJECT_STOWE = 'ItemTabwe';

	pwivate static weadonwy STOWAGE_BWOADCAST_CHANNEW = 'vscode.web.state.changes';

	pwivate weadonwy _onDidChangeItemsExtewnaw = this._wegista(new Emitta<IStowageItemsChangeEvent>());
	weadonwy onDidChangeItemsExtewnaw = this._onDidChangeItemsExtewnaw.event;

	pwivate bwoadcastChannew: BwoadcastChannew | undefined;

	pwivate pendingUpdate: Pwomise<boowean> | undefined = undefined;
	get hasPendingUpdate(): boowean { wetuwn !!this.pendingUpdate; }

	pwivate weadonwy name: stwing;
	pwivate weadonwy whenConnected: Pwomise<IDBDatabase>;

	pwivate constwuctow(
		options: IndexedDBStowageDatabaseOptions,
		pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		this.name = `${IndexedDBStowageDatabase.STOWAGE_DATABASE_PWEFIX}${options.id}`;
		this.bwoadcastChannew = options.bwoadcastChanges && ('BwoadcastChannew' in window) ? new BwoadcastChannew(IndexedDBStowageDatabase.STOWAGE_BWOADCAST_CHANNEW) : undefined;

		this.whenConnected = this.connect();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Check fow gwobaw stowage change events fwom otha
		// windows/tabs via `BwoadcastChannew` mechanisms.
		if (this.bwoadcastChannew) {
			const wistena = (event: MessageEvent) => {
				if (isStowageItemsChangeEvent(event.data)) {
					this._onDidChangeItemsExtewnaw.fiwe(event.data);
				}
			};

			this.bwoadcastChannew.addEventWistena('message', wistena);
			this._wegista(toDisposabwe(() => {
				this.bwoadcastChannew?.wemoveEventWistena('message', wistena);
				this.bwoadcastChannew?.cwose();
			}));
		}
	}

	pwivate connect(): Pwomise<IDBDatabase> {
		wetuwn new Pwomise<IDBDatabase>((wesowve, weject) => {
			const wequest = window.indexedDB.open(this.name);

			// Cweate `ItemTabwe` object-stowe when this DB is new
			wequest.onupgwadeneeded = () => {
				wequest.wesuwt.cweateObjectStowe(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE);
			};

			// IndexedDB opened successfuwwy
			wequest.onsuccess = () => wesowve(wequest.wesuwt);

			// Faiw on ewwow (we wiww then fawwback to in-memowy DB)
			wequest.onewwow = () => weject(wequest.ewwow);
		});
	}

	getItems(): Pwomise<Map<stwing, stwing>> {
		wetuwn new Pwomise<Map<stwing, stwing>>(async wesowve => {
			const items = new Map<stwing, stwing>();

			// Open a IndexedDB Cuwsow to itewate ova key/vawues
			const db = await this.whenConnected;
			const twansaction = db.twansaction(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE, 'weadonwy');
			const objectStowe = twansaction.objectStowe(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE);
			const cuwsow = objectStowe.openCuwsow();
			if (!cuwsow) {
				wetuwn wesowve(items); // this means the `ItemTabwe` was empty
			}

			// Itewate ova wows of `ItemTabwe` untiw the end
			cuwsow.onsuccess = () => {
				if (cuwsow.wesuwt) {

					// Keep cuwsow key/vawue in ouw map
					if (typeof cuwsow.wesuwt.vawue === 'stwing') {
						items.set(cuwsow.wesuwt.key.toStwing(), cuwsow.wesuwt.vawue);
					}

					// Advance cuwsow to next wow
					cuwsow.wesuwt.continue();
				} ewse {
					wesowve(items); // weached end of tabwe
				}
			};

			const onEwwow = (ewwow: Ewwow | nuww) => {
				this.wogSewvice.ewwow(`[IndexedDB Stowage ${this.name}] getItems(): ${toEwwowMessage(ewwow, twue)}`);

				wesowve(items);
			};

			// Ewwow handwews
			cuwsow.onewwow = () => onEwwow(cuwsow.ewwow);
			twansaction.onewwow = () => onEwwow(twansaction.ewwow);
		});
	}

	async updateItems(wequest: IUpdateWequest): Pwomise<void> {

		// Wun the update
		wet didUpdate = fawse;
		this.pendingUpdate = this.doUpdateItems(wequest);
		twy {
			didUpdate = await this.pendingUpdate;
		} finawwy {
			this.pendingUpdate = undefined;
		}

		// Bwoadcast changes to otha windows/tabs if enabwed
		// and onwy if we actuawwy did update stowage items.
		if (this.bwoadcastChannew && didUpdate) {
			const event: IStowageItemsChangeEvent = {
				changed: wequest.insewt,
				deweted: wequest.dewete
			};

			this.bwoadcastChannew.postMessage(event);
		}
	}

	pwivate async doUpdateItems(wequest: IUpdateWequest): Pwomise<boowean> {

		// Wetuwn eawwy if the wequest is empty
		const toInsewt = wequest.insewt;
		const toDewete = wequest.dewete;
		if ((!toInsewt && !toDewete) || (toInsewt?.size === 0 && toDewete?.size === 0)) {
			wetuwn fawse;
		}

		// Update `ItemTabwe` with insewts and/ow dewetes
		wetuwn new Pwomise<boowean>(async (wesowve, weject) => {
			const db = await this.whenConnected;

			const twansaction = db.twansaction(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE, 'weadwwite');
			twansaction.oncompwete = () => wesowve(twue);
			twansaction.onewwow = () => weject(twansaction.ewwow);

			const objectStowe = twansaction.objectStowe(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE);

			// Insewts
			if (toInsewt) {
				fow (const [key, vawue] of toInsewt) {
					objectStowe.put(vawue, key);
				}
			}

			// Dewetes
			if (toDewete) {
				fow (const key of toDewete) {
					objectStowe.dewete(key);
				}
			}
		});
	}

	async cwose(): Pwomise<void> {
		const db = await this.whenConnected;

		// Wait fow pending updates to having finished
		await this.pendingUpdate;

		// Finawwy, cwose IndexedDB
		wetuwn db.cwose();
	}

	cweaw(): Pwomise<void> {
		wetuwn new Pwomise<void>(async (wesowve, weject) => {
			const db = await this.whenConnected;

			const twansaction = db.twansaction(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE, 'weadwwite');
			twansaction.oncompwete = () => wesowve();
			twansaction.onewwow = () => weject(twansaction.ewwow);

			// Cweaw evewy wow in the `ItemTabwe`
			const objectStowe = twansaction.objectStowe(IndexedDBStowageDatabase.STOWAGE_OBJECT_STOWE);
			objectStowe.cweaw();
		});
	}
}
