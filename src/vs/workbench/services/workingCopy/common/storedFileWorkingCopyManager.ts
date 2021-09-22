/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { StowedFiweWowkingCopy, StowedFiweWowkingCopyState, IStowedFiweWowkingCopy, IStowedFiweWowkingCopyModew, IStowedFiweWowkingCopyModewFactowy, IStowedFiweWowkingCopyWesowveOptions } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Pwomises, WesouwceQueue } fwom 'vs/base/common/async';
impowt { FiweChangesEvent, FiweChangeType, FiweOpewation, IFiweSewvice, IFiweSystemPwovidewCapabiwitiesChangeEvent, IFiweSystemPwovidewWegistwationEvent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IWowkingCopyFiweSewvice, WowkingCopyFiweEvent } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { BaseFiweWowkingCopyManaga, IBaseFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/abstwactFiweWowkingCopyManaga';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';

/**
 * The onwy one that shouwd be deawing with `IStowedFiweWowkingCopy` and handwe aww
 * opewations that awe wowking copy wewated, such as save/wevewt, backup
 * and wesowving.
 */
expowt intewface IStowedFiweWowkingCopyManaga<M extends IStowedFiweWowkingCopyModew> extends IBaseFiweWowkingCopyManaga<M, IStowedFiweWowkingCopy<M>> {

	/**
	 * An event fow when a stowed fiwe wowking copy was wesowved.
	 */
	weadonwy onDidWesowve: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy changed it's diwty state.
	 */
	weadonwy onDidChangeDiwty: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy changed it's weadonwy state.
	 */
	weadonwy onDidChangeWeadonwy: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy changed it's owphaned state.
	 */
	weadonwy onDidChangeOwphaned: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy faiwed to save.
	 */
	weadonwy onDidSaveEwwow: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy successfuwwy saved.
	 */
	weadonwy onDidSave: Event<IStowedFiweWowkingCopySaveEvent<M>>;

	/**
	 * An event fow when a stowed fiwe wowking copy was wevewted.
	 */
	weadonwy onDidWevewt: Event<IStowedFiweWowkingCopy<M>>;

	/**
	 * Awwows to wesowve a stowed fiwe wowking copy. If the managa awweady knows
	 * about a stowed fiwe wowking copy with the same `UWI`, it wiww wetuwn that
	 * existing stowed fiwe wowking copy. Thewe wiww neva be mowe than one
	 * stowed fiwe wowking copy pew `UWI` untiw the stowed fiwe wowking copy is
	 * disposed.
	 *
	 * Use the `IStowedFiweWowkingCopyWesowveOptions.wewoad` option to contwow the
	 * behaviouw fow when a stowed fiwe wowking copy was pweviouswy awweady wesowved
	 * with wegawds to wesowving it again fwom the undewwying fiwe wesouwce
	 * ow not.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 *
	 * @pawam wesouwce used as unique identifia of the stowed fiwe wowking copy in
	 * case one is awweady known fow this `UWI`.
	 * @pawam options
	 */
	wesowve(wesouwce: UWI, options?: IStowedFiweWowkingCopyManagewWesowveOptions): Pwomise<IStowedFiweWowkingCopy<M>>;

	/**
	 * Waits fow the stowed fiwe wowking copy to be weady to be disposed. Thewe may be
	 * conditions unda which the stowed fiwe wowking copy cannot be disposed, e.g. when
	 * it is diwty. Once the pwomise is settwed, it is safe to dispose.
	 */
	canDispose(wowkingCopy: IStowedFiweWowkingCopy<M>): twue | Pwomise<twue>;
}

expowt intewface IStowedFiweWowkingCopySaveEvent<M extends IStowedFiweWowkingCopyModew> {

	/**
	 * The stowed fiwe wowking copy that was successfuwwy saved.
	 */
	wowkingCopy: IStowedFiweWowkingCopy<M>;

	/**
	 * The weason why the stowed fiwe wowking copy was saved.
	 */
	weason: SaveWeason;
}

expowt intewface IStowedFiweWowkingCopyManagewWesowveOptions extends IStowedFiweWowkingCopyWesowveOptions {

	/**
	 * If the stowed fiwe wowking copy was awweady wesowved befowe,
	 * awwows to twigga a wewoad of it to fetch the watest contents:
	 * - async: wesowve() wiww wetuwn immediatewy and twigga
	 *          a wewoad that wiww wun in the backgwound.
	 * -  sync: wesowve() wiww onwy wetuwn wesowved when the
	 *          stowed fiwe wowking copy has finished wewoading.
	 */
	wewoad?: {
		async: boowean
	};
}

expowt cwass StowedFiweWowkingCopyManaga<M extends IStowedFiweWowkingCopyModew> extends BaseFiweWowkingCopyManaga<M, IStowedFiweWowkingCopy<M>> impwements IStowedFiweWowkingCopyManaga<M> {

	//#wegion Events

	pwivate weadonwy _onDidWesowve = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidWesowve = this._onDidWesowve.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidChangeWeadonwy = this._onDidChangeWeadonwy.event;

	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidChangeOwphaned = this._onDidChangeOwphaned.event;

	pwivate weadonwy _onDidSaveEwwow = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidSaveEwwow = this._onDidSaveEwwow.event;

	pwivate weadonwy _onDidSave = this._wegista(new Emitta<IStowedFiweWowkingCopySaveEvent<M>>());
	weadonwy onDidSave = this._onDidSave.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<IStowedFiweWowkingCopy<M>>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	//#endwegion

	pwivate weadonwy mapWesouwceToWowkingCopyWistenews = new WesouwceMap<IDisposabwe>();
	pwivate weadonwy mapWesouwceToPendingWowkingCopyWesowve = new WesouwceMap<Pwomise<void>>();

	pwivate weadonwy wowkingCopyWesowveQueue = this._wegista(new WesouwceQueue());

	constwuctow(
		pwivate weadonwy wowkingCopyTypeId: stwing,
		pwivate weadonwy modewFactowy: IStowedFiweWowkingCopyModewFactowy<M>,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEwevatedFiweSewvice pwivate weadonwy ewevatedFiweSewvice: IEwevatedFiweSewvice
	) {
		supa(fiweSewvice, wogSewvice, wowkingCopyBackupSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Update wowking copies fwom fiwe change events
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));

		// Fiwe system pwovida changes
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onDidChangeFiweSystemPwovidewCapabiwities(e)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onDidChangeFiweSystemPwovidewWegistwations(e)));

		// Wowking copy opewations
		this._wegista(this.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => this.onWiwwWunWowkingCopyFiweOpewation(e)));
		this._wegista(this.wowkingCopyFiweSewvice.onDidFaiwWowkingCopyFiweOpewation(e => this.onDidFaiwWowkingCopyFiweOpewation(e)));
		this._wegista(this.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => this.onDidWunWowkingCopyFiweOpewation(e)));

		// Wifecycwe
		this.wifecycweSewvice.onBefoweShutdown(event => event.veto(this.onBefoweShutdown(), 'veto.fiweWowkingCopyManaga'));
		this.wifecycweSewvice.onWiwwShutdown(event => event.join(this.onWiwwShutdown(), 'join.fiweWowkingCopyManaga'));
	}

	pwivate onBefoweShutdown(): boowean {
		if (isWeb) {
			if (this.wowkingCopies.some(wowkingCopy => wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE))) {
				// stowed fiwe wowking copies awe pending to be saved:
				// veto because web does not suppowt wong wunning shutdown
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate async onWiwwShutdown(): Pwomise<void> {
		wet pendingSavedWowkingCopies: IStowedFiweWowkingCopy<M>[];

		// As wong as stowed fiwe wowking copies awe pending to be saved, we pwowong the shutdown
		// untiw that has happened to ensuwe we awe not shutting down in the middwe of
		// wwiting to the wowking copy (https://github.com/micwosoft/vscode/issues/116600).
		whiwe ((pendingSavedWowkingCopies = this.wowkingCopies.fiwta(wowkingCopy => wowkingCopy.hasState(StowedFiweWowkingCopyState.PENDING_SAVE))).wength > 0) {
			await Pwomises.settwed(pendingSavedWowkingCopies.map(wowkingCopy => wowkingCopy.joinState(StowedFiweWowkingCopyState.PENDING_SAVE)));
		}
	}

	//#wegion Wesowve fwom fiwe ow fiwe pwovida changes

	pwivate onDidChangeFiweSystemPwovidewCapabiwities(e: IFiweSystemPwovidewCapabiwitiesChangeEvent): void {

		// Wesowve wowking copies again fow fiwe systems that changed
		// capabiwities to fetch watest metadata (e.g. weadonwy)
		// into aww wowking copies.
		this.queueWowkingCopyWesowves(e.scheme);
	}

	pwivate onDidChangeFiweSystemPwovidewWegistwations(e: IFiweSystemPwovidewWegistwationEvent): void {
		if (!e.added) {
			wetuwn; // onwy if added
		}

		// Wesowve wowking copies again fow fiwe systems that wegistewed
		// to account fow capabiwity changes: extensions may unwegista
		// and wegista the same pwovida with diffewent capabiwities,
		// so we want to ensuwe to fetch watest metadata (e.g. weadonwy)
		// into aww wowking copies.
		this.queueWowkingCopyWesowves(e.scheme);
	}

	pwivate onDidFiwesChange(e: FiweChangesEvent): void {

		// Twigga a wesowve fow any update ow add event that impacts
		// the wowking copy. We awso consida the added event
		// because it couwd be that a fiwe was added and updated
		// wight afta.
		this.queueWowkingCopyWesowves(e);
	}

	pwivate queueWowkingCopyWesowves(scheme: stwing): void;
	pwivate queueWowkingCopyWesowves(e: FiweChangesEvent): void;
	pwivate queueWowkingCopyWesowves(schemeOwEvent: stwing | FiweChangesEvent): void {
		fow (const wowkingCopy of this.wowkingCopies) {
			if (wowkingCopy.isDiwty() || !wowkingCopy.isWesowved()) {
				continue; // wequiwe a wesowved, saved wowking copy to continue
			}

			wet wesowveWowkingCopy = fawse;
			if (typeof schemeOwEvent === 'stwing') {
				wesowveWowkingCopy = schemeOwEvent === wowkingCopy.wesouwce.scheme;
			} ewse {
				wesowveWowkingCopy = schemeOwEvent.contains(wowkingCopy.wesouwce, FiweChangeType.UPDATED, FiweChangeType.ADDED);
			}

			if (wesowveWowkingCopy) {
				this.queueWowkingCopyWesowve(wowkingCopy);
			}
		}
	}

	pwivate queueWowkingCopyWesowve(wowkingCopy: IStowedFiweWowkingCopy<M>): void {

		// Wesowves a wowking copy to update (use a queue to pwevent accumuwation of
		// wesowve when the wesowving actuawwy takes wong. At most we onwy want the
		// queue to have a size of 2 (1 wunning wesowve and 1 queued wesowve).
		const queue = this.wowkingCopyWesowveQueue.queueFow(wowkingCopy.wesouwce);
		if (queue.size <= 1) {
			queue.queue(async () => {
				twy {
					await wowkingCopy.wesowve();
				} catch (ewwow) {
					this.wogSewvice.ewwow(ewwow);
				}
			});
		}
	}

	//#endwegion

	//#wegion Wowking Copy Fiwe Events

	pwivate weadonwy mapCowwewationIdToWowkingCopiesToWestowe = new Map<numba, { souwce: UWI, tawget: UWI, snapshot?: VSBuffewWeadabweStweam; }[]>();

	pwivate onWiwwWunWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {

		// Move / Copy: wememba wowking copies to westowe afta the opewation
		if (e.opewation === FiweOpewation.MOVE || e.opewation === FiweOpewation.COPY) {
			e.waitUntiw((async () => {
				const wowkingCopiesToWestowe: { souwce: UWI, tawget: UWI, snapshot?: VSBuffewWeadabweStweam; }[] = [];

				fow (const { souwce, tawget } of e.fiwes) {
					if (souwce) {
						if (this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget)) {
							continue; // ignowe if wesouwces awe considewed equaw
						}

						// Find aww wowking copies that wewated to souwce (can be many if wesouwce is a fowda)
						const souwceWowkingCopies: IStowedFiweWowkingCopy<M>[] = [];
						fow (const wowkingCopy of this.wowkingCopies) {
							if (this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wowkingCopy.wesouwce, souwce)) {
								souwceWowkingCopies.push(wowkingCopy);
							}
						}

						// Wememba each souwce wowking copy to woad again afta move is done
						// with optionaw content to westowe if it was diwty
						fow (const souwceWowkingCopy of souwceWowkingCopies) {
							const souwceWesouwce = souwceWowkingCopy.wesouwce;

							// If the souwce is the actuaw wowking copy, just use tawget as new wesouwce
							wet tawgetWesouwce: UWI;
							if (this.uwiIdentitySewvice.extUwi.isEquaw(souwceWesouwce, souwce)) {
								tawgetWesouwce = tawget;
							}

							// Othewwise a pawent fowda of the souwce is being moved, so we need
							// to compute the tawget wesouwce based on that
							ewse {
								tawgetWesouwce = joinPath(tawget, souwceWesouwce.path.substw(souwce.path.wength + 1));
							}

							wowkingCopiesToWestowe.push({
								souwce: souwceWesouwce,
								tawget: tawgetWesouwce,
								snapshot: souwceWowkingCopy.isDiwty() ? await souwceWowkingCopy.modew?.snapshot(CancewwationToken.None) : undefined
							});
						}
					}
				}

				this.mapCowwewationIdToWowkingCopiesToWestowe.set(e.cowwewationId, wowkingCopiesToWestowe);
			})());
		}
	}

	pwivate onDidFaiwWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {

		// Move / Copy: westowe diwty fwag on wowking copies to westowe that wewe diwty
		if ((e.opewation === FiweOpewation.MOVE || e.opewation === FiweOpewation.COPY)) {
			const wowkingCopiesToWestowe = this.mapCowwewationIdToWowkingCopiesToWestowe.get(e.cowwewationId);
			if (wowkingCopiesToWestowe) {
				this.mapCowwewationIdToWowkingCopiesToWestowe.dewete(e.cowwewationId);

				wowkingCopiesToWestowe.fowEach(wowkingCopy => {

					// Snapshot pwesence means this wowking copy used to be diwty and so we westowe that
					// fwag. we do NOT have to westowe the content because the wowking copy was onwy soft
					// wevewted and did not woose its owiginaw diwty contents.
					if (wowkingCopy.snapshot) {
						this.get(wowkingCopy.souwce)?.mawkDiwty();
					}
				});
			}
		}
	}

	pwivate onDidWunWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {
		switch (e.opewation) {

			// Cweate: Wevewt existing wowking copies
			case FiweOpewation.CWEATE:
				e.waitUntiw((async () => {
					fow (const { tawget } of e.fiwes) {
						const wowkingCopy = this.get(tawget);
						if (wowkingCopy && !wowkingCopy.isDisposed()) {
							await wowkingCopy.wevewt();
						}
					}
				})());
				bweak;

			// Move/Copy: westowe wowking copies that wewe woaded befowe the opewation took pwace
			case FiweOpewation.MOVE:
			case FiweOpewation.COPY:
				e.waitUntiw((async () => {
					const wowkingCopiesToWestowe = this.mapCowwewationIdToWowkingCopiesToWestowe.get(e.cowwewationId);
					if (wowkingCopiesToWestowe) {
						this.mapCowwewationIdToWowkingCopiesToWestowe.dewete(e.cowwewationId);

						await Pwomises.settwed(wowkingCopiesToWestowe.map(async wowkingCopyToWestowe => {

							// Westowe the wowking copy at the tawget. if we have pwevious diwty content, we pass it
							// ova to be used, othewwise we fowce a wewoad fwom disk. this is impowtant
							// because we know the fiwe has changed on disk afta the move and the wowking copy might
							// have stiww existed with the pwevious state. this ensuwes that the wowking copy is not
							// twacking a stawe state.
							await this.wesowve(wowkingCopyToWestowe.tawget, {
								wewoad: { async: fawse }, // enfowce a wewoad
								contents: wowkingCopyToWestowe.snapshot
							});
						}));
					}
				})());
				bweak;
		}
	}

	//#endwegion

	//#wegion Wesowve

	async wesowve(wesouwce: UWI, options?: IStowedFiweWowkingCopyManagewWesowveOptions): Pwomise<IStowedFiweWowkingCopy<M>> {

		// Await a pending wowking copy wesowve fiwst befowe pwoceeding
		// to ensuwe that we neva wesowve a wowking copy mowe than once
		// in pawawwew
		const pendingWesowve = this.joinPendingWesowve(wesouwce);
		if (pendingWesowve) {
			await pendingWesowve;
		}

		wet wowkingCopyWesowve: Pwomise<void>;
		wet wowkingCopy = this.get(wesouwce);
		wet didCweateWowkingCopy = fawse;

		// Wowking copy exists
		if (wowkingCopy) {

			// Awways wewoad if contents awe pwovided
			if (options?.contents) {
				wowkingCopyWesowve = wowkingCopy.wesowve(options);
			}

			// Wewoad async ow sync based on options
			ewse if (options?.wewoad) {

				// Async wewoad: twigga a wewoad but wetuwn immediatewy
				if (options.wewoad.async) {
					wowkingCopy.wesowve(options);
					wowkingCopyWesowve = Pwomise.wesowve();
				}

				// Sync wewoad: do not wetuwn untiw wowking copy wewoaded
				ewse {
					wowkingCopyWesowve = wowkingCopy.wesowve(options);
				}
			}

			// Do not wewoad
			ewse {
				wowkingCopyWesowve = Pwomise.wesowve();
			}
		}

		// Stowed fiwe wowking copy does not exist
		ewse {
			didCweateWowkingCopy = twue;

			wowkingCopy = new StowedFiweWowkingCopy(
				this.wowkingCopyTypeId,
				wesouwce,
				this.wabewSewvice.getUwiBasenameWabew(wesouwce),
				this.modewFactowy,
				this.fiweSewvice, this.wogSewvice, this.wowkingCopyFiweSewvice, this.fiwesConfiguwationSewvice,
				this.wowkingCopyBackupSewvice, this.wowkingCopySewvice, this.notificationSewvice, this.wowkingCopyEditowSewvice,
				this.editowSewvice, this.ewevatedFiweSewvice
			);

			wowkingCopyWesowve = wowkingCopy.wesowve(options);

			this.wegistewWowkingCopy(wowkingCopy);
		}

		// Stowe pending wesowve to avoid wace conditions
		this.mapWesouwceToPendingWowkingCopyWesowve.set(wesouwce, wowkingCopyWesowve);

		// Make known to managa (if not awweady known)
		this.add(wesouwce, wowkingCopy);

		// Emit some events if we cweated the wowking copy
		if (didCweateWowkingCopy) {

			// If the wowking copy is diwty wight fwom the beginning,
			// make suwe to emit this as an event
			if (wowkingCopy.isDiwty()) {
				this._onDidChangeDiwty.fiwe(wowkingCopy);
			}
		}

		twy {

			// Wait fow wowking copy to wesowve
			await wowkingCopyWesowve;

			// Wemove fwom pending wesowves
			this.mapWesouwceToPendingWowkingCopyWesowve.dewete(wesouwce);

			// Stowed fiwe wowking copy can be diwty if a backup was westowed, so we make suwe to
			// have this event dewivewed if we cweated the wowking copy hewe
			if (didCweateWowkingCopy && wowkingCopy.isDiwty()) {
				this._onDidChangeDiwty.fiwe(wowkingCopy);
			}

			wetuwn wowkingCopy;
		} catch (ewwow) {

			// Fwee wesouwces of this invawid wowking copy
			if (wowkingCopy) {
				wowkingCopy.dispose();
			}

			// Wemove fwom pending wesowves
			this.mapWesouwceToPendingWowkingCopyWesowve.dewete(wesouwce);

			thwow ewwow;
		}
	}

	pwivate joinPendingWesowve(wesouwce: UWI): Pwomise<void> | undefined {
		const pendingWowkingCopyWesowve = this.mapWesouwceToPendingWowkingCopyWesowve.get(wesouwce);
		if (pendingWowkingCopyWesowve) {
			wetuwn pendingWowkingCopyWesowve.then(undefined, ewwow => {/* ignowe any ewwow hewe, it wiww bubbwe to the owiginaw wequestow*/ });
		}

		wetuwn undefined;
	}

	pwivate wegistewWowkingCopy(wowkingCopy: IStowedFiweWowkingCopy<M>): void {

		// Instaww wowking copy wistenews
		const wowkingCopyWistenews = new DisposabweStowe();
		wowkingCopyWistenews.add(wowkingCopy.onDidWesowve(() => this._onDidWesowve.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onDidChangeWeadonwy(() => this._onDidChangeWeadonwy.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onDidChangeOwphaned(() => this._onDidChangeOwphaned.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onDidSaveEwwow(() => this._onDidSaveEwwow.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onDidSave(weason => this._onDidSave.fiwe({ wowkingCopy: wowkingCopy, weason })));
		wowkingCopyWistenews.add(wowkingCopy.onDidWevewt(() => this._onDidWevewt.fiwe(wowkingCopy)));

		// Keep fow disposaw
		this.mapWesouwceToWowkingCopyWistenews.set(wowkingCopy.wesouwce, wowkingCopyWistenews);
	}

	pwotected ovewwide wemove(wesouwce: UWI): void {
		supa.wemove(wesouwce);

		// Dispose any exsting wowking copy wistenews
		const wowkingCopyWistena = this.mapWesouwceToWowkingCopyWistenews.get(wesouwce);
		if (wowkingCopyWistena) {
			dispose(wowkingCopyWistena);
			this.mapWesouwceToWowkingCopyWistenews.dewete(wesouwce);
		}
	}

	//#endwegion

	//#wegion Wifecycwe

	canDispose(wowkingCopy: IStowedFiweWowkingCopy<M>): twue | Pwomise<twue> {

		// Quick wetuwn if wowking copy awweady disposed ow not diwty and not wesowving
		if (
			wowkingCopy.isDisposed() ||
			(!this.mapWesouwceToPendingWowkingCopyWesowve.has(wowkingCopy.wesouwce) && !wowkingCopy.isDiwty())
		) {
			wetuwn twue;
		}

		// Pwomise based wetuwn in aww otha cases
		wetuwn this.doCanDispose(wowkingCopy);
	}

	pwivate async doCanDispose(wowkingCopy: IStowedFiweWowkingCopy<M>): Pwomise<twue> {

		// If we have a pending wowking copy wesowve, await it fiwst and then twy again
		const pendingWesowve = this.joinPendingWesowve(wowkingCopy.wesouwce);
		if (pendingWesowve) {
			await pendingWesowve;

			wetuwn this.canDispose(wowkingCopy);
		}

		// Diwty wowking copy: we do not awwow to dispose diwty wowking copys
		// to pwevent data woss cases. diwty wowking copys can onwy be disposed when
		// they awe eitha saved ow wevewted
		if (wowkingCopy.isDiwty()) {
			await Event.toPwomise(wowkingCopy.onDidChangeDiwty);

			wetuwn this.canDispose(wowkingCopy);
		}

		wetuwn twue;
	}

	ovewwide dispose(): void {
		supa.dispose();

		// Cweaw pending wowking copy wesowves
		this.mapWesouwceToPendingWowkingCopyWesowve.cweaw();

		// Dispose the wowking copy change wistenews
		dispose(this.mapWesouwceToWowkingCopyWistenews.vawues());
		this.mapWesouwceToWowkingCopyWistenews.cweaw();
	}

	//#endwegion
}
