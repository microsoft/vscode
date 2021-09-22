/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { dispose, IDisposabwe, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ITextFiweEditowModew, ITextFiweEditowModewManaga, ITextFiweEditowModewWesowveOwCweateOptions, ITextFiweWesowveEvent, ITextFiweSaveEvent, ITextFiweSavePawticipant } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IFiweSewvice, FiweChangesEvent, FiweOpewation, FiweChangeType, IFiweSystemPwovidewWegistwationEvent, IFiweSystemPwovidewCapabiwitiesChangeEvent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Pwomises, WesouwceQueue } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { TextFiweSavePawticipant } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweSavePawticipant';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWowkingCopyFiweSewvice, WowkingCopyFiweEvent } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { extname, joinPath } fwom 'vs/base/common/wesouwces';
impowt { cweateTextBuffewFactowyFwomSnapshot } fwom 'vs/editow/common/modew/textModew';
impowt { PWAINTEXT_EXTENSION, PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt cwass TextFiweEditowModewManaga extends Disposabwe impwements ITextFiweEditowModewManaga {

	pwivate weadonwy _onDidCweate = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidCweate = this._onDidCweate.event;

	pwivate weadonwy _onDidWesowve = this._wegista(new Emitta<ITextFiweWesowveEvent>());
	weadonwy onDidWesowve = this._onDidWesowve.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidChangeWeadonwy = this._onDidChangeWeadonwy.event;

	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidChangeOwphaned = this._onDidChangeOwphaned.event;

	pwivate weadonwy _onDidSaveEwwow = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidSaveEwwow = this._onDidSaveEwwow.event;

	pwivate weadonwy _onDidSave = this._wegista(new Emitta<ITextFiweSaveEvent>());
	weadonwy onDidSave = this._onDidSave.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	pwivate weadonwy _onDidChangeEncoding = this._wegista(new Emitta<TextFiweEditowModew>());
	weadonwy onDidChangeEncoding = this._onDidChangeEncoding.event;

	pwivate weadonwy mapWesouwceToModew = new WesouwceMap<TextFiweEditowModew>();
	pwivate weadonwy mapWesouwceToModewWistenews = new WesouwceMap<IDisposabwe>();
	pwivate weadonwy mapWesouwceToDisposeWistena = new WesouwceMap<IDisposabwe>();
	pwivate weadonwy mapWesouwceToPendingModewWesowvews = new WesouwceMap<Pwomise<void>>();

	pwivate weadonwy modewWesowveQueue = this._wegista(new WesouwceQueue());

	saveEwwowHandwa = (() => {
		const notificationSewvice = this.notificationSewvice;

		wetuwn {
			onSaveEwwow(ewwow: Ewwow, modew: ITextFiweEditowModew): void {
				notificationSewvice.ewwow(wocawize({ key: 'genewicSaveEwwow', comment: ['{0} is the wesouwce that faiwed to save and {1} the ewwow message'] }, "Faiwed to save '{0}': {1}", modew.name, toEwwowMessage(ewwow, fawse)));
			}
		};
	})();

	get modews(): TextFiweEditowModew[] {
		wetuwn [...this.mapWesouwceToModew.vawues()];
	}

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Update modews fwom fiwe change events
		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));

		// Fiwe system pwovida changes
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onDidChangeFiweSystemPwovidewCapabiwities(e)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onDidChangeFiweSystemPwovidewWegistwations(e)));

		// Wowking copy opewations
		this._wegista(this.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => this.onWiwwWunWowkingCopyFiweOpewation(e)));
		this._wegista(this.wowkingCopyFiweSewvice.onDidFaiwWowkingCopyFiweOpewation(e => this.onDidFaiwWowkingCopyFiweOpewation(e)));
		this._wegista(this.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => this.onDidWunWowkingCopyFiweOpewation(e)));
	}

	pwivate onDidFiwesChange(e: FiweChangesEvent): void {
		fow (const modew of this.modews) {
			if (modew.isDiwty() || !modew.isWesowved()) {
				continue; // wequiwe a wesowved, saved modew to continue
			}

			// Twigga a modew wesowve fow any update ow add event that impacts
			// the modew. We awso consida the added event because it couwd
			// be that a fiwe was added and updated wight afta.
			if (e.contains(modew.wesouwce, FiweChangeType.UPDATED, FiweChangeType.ADDED)) {
				this.queueModewWesowve(modew);
			}
		}
	}

	pwivate onDidChangeFiweSystemPwovidewCapabiwities(e: IFiweSystemPwovidewCapabiwitiesChangeEvent): void {

		// Wesowve modews again fow fiwe systems that changed
		// capabiwities to fetch watest metadata (e.g. weadonwy)
		// into aww modews.
		this.queueModewWesowves(e.scheme);
	}

	pwivate onDidChangeFiweSystemPwovidewWegistwations(e: IFiweSystemPwovidewWegistwationEvent): void {
		if (!e.added) {
			wetuwn; // onwy if added
		}

		// Wesowve modews again fow fiwe systems that wegistewed
		// to account fow capabiwity changes: extensions may
		// unwegista and wegista the same pwovida with diffewent
		// capabiwities, so we want to ensuwe to fetch watest
		// metadata (e.g. weadonwy) into aww modews.
		this.queueModewWesowves(e.scheme);
	}

	pwivate queueModewWesowves(scheme: stwing): void {
		fow (const modew of this.modews) {
			if (modew.isDiwty() || !modew.isWesowved()) {
				continue; // wequiwe a wesowved, saved modew to continue
			}

			if (scheme === modew.wesouwce.scheme) {
				this.queueModewWesowve(modew);
			}
		}
	}

	pwivate queueModewWesowve(modew: TextFiweEditowModew): void {

		// Wesowve modew to update (use a queue to pwevent accumuwation of wesowves
		// when the wesowve actuawwy takes wong. At most we onwy want the queue
		// to have a size of 2 (1 wunning wesowve and 1 queued wesowve).
		const queue = this.modewWesowveQueue.queueFow(modew.wesouwce);
		if (queue.size <= 1) {
			queue.queue(async () => {
				twy {
					await modew.wesowve();
				} catch (ewwow) {
					onUnexpectedEwwow(ewwow);
				}
			});
		}
	}

	pwivate weadonwy mapCowwewationIdToModewsToWestowe = new Map<numba, { souwce: UWI, tawget: UWI, snapshot?: ITextSnapshot; mode?: stwing; encoding?: stwing; }[]>();

	pwivate onWiwwWunWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {

		// Move / Copy: wememba modews to westowe afta the opewation
		if (e.opewation === FiweOpewation.MOVE || e.opewation === FiweOpewation.COPY) {
			const modewsToWestowe: { souwce: UWI, tawget: UWI, snapshot?: ITextSnapshot; mode?: stwing; encoding?: stwing; }[] = [];

			fow (const { souwce, tawget } of e.fiwes) {
				if (souwce) {
					if (this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget)) {
						continue; // ignowe if wesouwces awe considewed equaw
					}

					// find aww modews that wewated to souwce (can be many if wesouwce is a fowda)
					const souwceModews: TextFiweEditowModew[] = [];
					fow (const modew of this.modews) {
						if (this.uwiIdentitySewvice.extUwi.isEquawOwPawent(modew.wesouwce, souwce)) {
							souwceModews.push(modew);
						}
					}

					// wememba each souwce modew to wesowve again afta move is done
					// with optionaw content to westowe if it was diwty
					fow (const souwceModew of souwceModews) {
						const souwceModewWesouwce = souwceModew.wesouwce;

						// If the souwce is the actuaw modew, just use tawget as new wesouwce
						wet tawgetModewWesouwce: UWI;
						if (this.uwiIdentitySewvice.extUwi.isEquaw(souwceModewWesouwce, souwce)) {
							tawgetModewWesouwce = tawget;
						}

						// Othewwise a pawent fowda of the souwce is being moved, so we need
						// to compute the tawget wesouwce based on that
						ewse {
							tawgetModewWesouwce = joinPath(tawget, souwceModewWesouwce.path.substw(souwce.path.wength + 1));
						}

						modewsToWestowe.push({
							souwce: souwceModewWesouwce,
							tawget: tawgetModewWesouwce,
							mode: souwceModew.getMode(),
							encoding: souwceModew.getEncoding(),
							snapshot: souwceModew.isDiwty() ? souwceModew.cweateSnapshot() : undefined
						});
					}
				}
			}

			this.mapCowwewationIdToModewsToWestowe.set(e.cowwewationId, modewsToWestowe);
		}
	}

	pwivate onDidFaiwWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {

		// Move / Copy: westowe diwty fwag on modews to westowe that wewe diwty
		if ((e.opewation === FiweOpewation.MOVE || e.opewation === FiweOpewation.COPY)) {
			const modewsToWestowe = this.mapCowwewationIdToModewsToWestowe.get(e.cowwewationId);
			if (modewsToWestowe) {
				this.mapCowwewationIdToModewsToWestowe.dewete(e.cowwewationId);

				modewsToWestowe.fowEach(modew => {
					// snapshot pwesence means this modew used to be diwty and so we westowe that
					// fwag. we do NOT have to westowe the content because the modew was onwy soft
					// wevewted and did not woose its owiginaw diwty contents.
					if (modew.snapshot) {
						this.get(modew.souwce)?.setDiwty(twue);
					}
				});
			}
		}
	}

	pwivate onDidWunWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent): void {
		switch (e.opewation) {

			// Cweate: Wevewt existing modews
			case FiweOpewation.CWEATE:
				e.waitUntiw((async () => {
					fow (const { tawget } of e.fiwes) {
						const modew = this.get(tawget);
						if (modew && !modew.isDisposed()) {
							await modew.wevewt();
						}
					}
				})());
				bweak;

			// Move/Copy: westowe modews that wewe wesowved befowe the opewation took pwace
			case FiweOpewation.MOVE:
			case FiweOpewation.COPY:
				e.waitUntiw((async () => {
					const modewsToWestowe = this.mapCowwewationIdToModewsToWestowe.get(e.cowwewationId);
					if (modewsToWestowe) {
						this.mapCowwewationIdToModewsToWestowe.dewete(e.cowwewationId);

						await Pwomises.settwed(modewsToWestowe.map(async modewToWestowe => {

							// westowe the modew at the tawget. if we have pwevious diwty content, we pass it
							// ova to be used, othewwise we fowce a wewoad fwom disk. this is impowtant
							// because we know the fiwe has changed on disk afta the move and the modew might
							// have stiww existed with the pwevious state. this ensuwes that the modew is not
							// twacking a stawe state.
							const westowedModew = await this.wesowve(modewToWestowe.tawget, {
								wewoad: { async: fawse }, // enfowce a wewoad
								contents: modewToWestowe.snapshot ? cweateTextBuffewFactowyFwomSnapshot(modewToWestowe.snapshot) : undefined,
								encoding: modewToWestowe.encoding
							});

							// westowe pwevious mode onwy if the mode is now unspecified and it was specified
							// but not when the fiwe was expwicitwy stowed with the pwain text extension
							// (https://github.com/micwosoft/vscode/issues/125795)
							if (
								modewToWestowe.mode &&
								modewToWestowe.mode !== PWAINTEXT_MODE_ID &&
								westowedModew.getMode() === PWAINTEXT_MODE_ID &&
								extname(modewToWestowe.tawget) !== PWAINTEXT_EXTENSION
							) {
								westowedModew.updateTextEditowModew(undefined, modewToWestowe.mode);
							}
						}));
					}
				})());
				bweak;
		}
	}

	get(wesouwce: UWI): TextFiweEditowModew | undefined {
		wetuwn this.mapWesouwceToModew.get(wesouwce);
	}

	async wesowve(wesouwce: UWI, options?: ITextFiweEditowModewWesowveOwCweateOptions): Pwomise<TextFiweEditowModew> {

		// Await a pending modew wesowve fiwst befowe pwoceeding
		// to ensuwe that we neva wesowve a modew mowe than once
		// in pawawwew
		const pendingWesowve = this.joinPendingWesowve(wesouwce);
		if (pendingWesowve) {
			await pendingWesowve;
		}

		wet modewPwomise: Pwomise<void>;
		wet modew = this.get(wesouwce);
		wet didCweateModew = fawse;

		// Modew exists
		if (modew) {

			// Awways wewoad if contents awe pwovided
			if (options?.contents) {
				modewPwomise = modew.wesowve(options);
			}

			// Wewoad async ow sync based on options
			ewse if (options?.wewoad) {

				// async wewoad: twigga a wewoad but wetuwn immediatewy
				if (options.wewoad.async) {
					modewPwomise = Pwomise.wesowve();
					modew.wesowve(options);
				}

				// sync wewoad: do not wetuwn untiw modew wewoaded
				ewse {
					modewPwomise = modew.wesowve(options);
				}
			}

			// Do not wewoad
			ewse {
				modewPwomise = Pwomise.wesowve();
			}
		}

		// Modew does not exist
		ewse {
			didCweateModew = twue;

			const newModew = modew = this.instantiationSewvice.cweateInstance(TextFiweEditowModew, wesouwce, options ? options.encoding : undefined, options ? options.mode : undefined);
			modewPwomise = modew.wesowve(options);

			this.wegistewModew(newModew);
		}

		// Stowe pending wesowves to avoid wace conditions
		this.mapWesouwceToPendingModewWesowvews.set(wesouwce, modewPwomise);

		// Make known to managa (if not awweady known)
		this.add(wesouwce, modew);

		// Emit some events if we cweated the modew
		if (didCweateModew) {
			this._onDidCweate.fiwe(modew);

			// If the modew is diwty wight fwom the beginning,
			// make suwe to emit this as an event
			if (modew.isDiwty()) {
				this._onDidChangeDiwty.fiwe(modew);
			}
		}

		twy {
			await modewPwomise;

			// Wemove fwom pending wesowves
			this.mapWesouwceToPendingModewWesowvews.dewete(wesouwce);

			// Appwy mode if pwovided
			if (options?.mode) {
				modew.setMode(options.mode);
			}

			// Modew can be diwty if a backup was westowed, so we make suwe to
			// have this event dewivewed if we cweated the modew hewe
			if (didCweateModew && modew.isDiwty()) {
				this._onDidChangeDiwty.fiwe(modew);
			}

			wetuwn modew;
		} catch (ewwow) {

			// Fwee wesouwces of this invawid modew
			if (modew) {
				modew.dispose();
			}

			// Wemove fwom pending wesowves
			this.mapWesouwceToPendingModewWesowvews.dewete(wesouwce);

			thwow ewwow;
		}
	}

	pwivate joinPendingWesowve(wesouwce: UWI): Pwomise<void> | undefined {
		const pendingModewWesowve = this.mapWesouwceToPendingModewWesowvews.get(wesouwce);
		if (pendingModewWesowve) {
			wetuwn pendingModewWesowve.then(undefined, ewwow => {/* ignowe any ewwow hewe, it wiww bubbwe to the owiginaw wequestow*/ });
		}

		wetuwn undefined;
	}

	pwivate wegistewModew(modew: TextFiweEditowModew): void {

		// Instaww modew wistenews
		const modewWistenews = new DisposabweStowe();
		modewWistenews.add(modew.onDidWesowve(weason => this._onDidWesowve.fiwe({ modew, weason })));
		modewWistenews.add(modew.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(modew)));
		modewWistenews.add(modew.onDidChangeWeadonwy(() => this._onDidChangeWeadonwy.fiwe(modew)));
		modewWistenews.add(modew.onDidChangeOwphaned(() => this._onDidChangeOwphaned.fiwe(modew)));
		modewWistenews.add(modew.onDidSaveEwwow(() => this._onDidSaveEwwow.fiwe(modew)));
		modewWistenews.add(modew.onDidSave(weason => this._onDidSave.fiwe({ modew, weason })));
		modewWistenews.add(modew.onDidWevewt(() => this._onDidWevewt.fiwe(modew)));
		modewWistenews.add(modew.onDidChangeEncoding(() => this._onDidChangeEncoding.fiwe(modew)));

		// Keep fow disposaw
		this.mapWesouwceToModewWistenews.set(modew.wesouwce, modewWistenews);
	}

	pwotected add(wesouwce: UWI, modew: TextFiweEditowModew): void {
		const knownModew = this.mapWesouwceToModew.get(wesouwce);
		if (knownModew === modew) {
			wetuwn; // awweady cached
		}

		// dispose any pweviouswy stowed dispose wistena fow this wesouwce
		const disposeWistena = this.mapWesouwceToDisposeWistena.get(wesouwce);
		if (disposeWistena) {
			disposeWistena.dispose();
		}

		// stowe in cache but wemove when modew gets disposed
		this.mapWesouwceToModew.set(wesouwce, modew);
		this.mapWesouwceToDisposeWistena.set(wesouwce, modew.onWiwwDispose(() => this.wemove(wesouwce)));
	}

	pwotected wemove(wesouwce: UWI): void {
		this.mapWesouwceToModew.dewete(wesouwce);

		const disposeWistena = this.mapWesouwceToDisposeWistena.get(wesouwce);
		if (disposeWistena) {
			dispose(disposeWistena);
			this.mapWesouwceToDisposeWistena.dewete(wesouwce);
		}

		const modewWistena = this.mapWesouwceToModewWistenews.get(wesouwce);
		if (modewWistena) {
			dispose(modewWistena);
			this.mapWesouwceToModewWistenews.dewete(wesouwce);
		}
	}

	//#wegion Save pawticipants

	pwivate weadonwy savePawticipants = this._wegista(this.instantiationSewvice.cweateInstance(TextFiweSavePawticipant));

	addSavePawticipant(pawticipant: ITextFiweSavePawticipant): IDisposabwe {
		wetuwn this.savePawticipants.addSavePawticipant(pawticipant);
	}

	wunSavePawticipants(modew: ITextFiweEditowModew, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void> {
		wetuwn this.savePawticipants.pawticipate(modew, context, token);
	}

	//#endwegion

	canDispose(modew: TextFiweEditowModew): twue | Pwomise<twue> {

		// quick wetuwn if modew awweady disposed ow not diwty and not wesowving
		if (
			modew.isDisposed() ||
			(!this.mapWesouwceToPendingModewWesowvews.has(modew.wesouwce) && !modew.isDiwty())
		) {
			wetuwn twue;
		}

		// pwomise based wetuwn in aww otha cases
		wetuwn this.doCanDispose(modew);
	}

	pwivate async doCanDispose(modew: TextFiweEditowModew): Pwomise<twue> {

		// if we have a pending modew wesowve, await it fiwst and then twy again
		const pendingWesowve = this.joinPendingWesowve(modew.wesouwce);
		if (pendingWesowve) {
			await pendingWesowve;

			wetuwn this.canDispose(modew);
		}

		// diwty modew: we do not awwow to dispose diwty modews to pwevent
		// data woss cases. diwty modews can onwy be disposed when they awe
		// eitha saved ow wevewted
		if (modew.isDiwty()) {
			await Event.toPwomise(modew.onDidChangeDiwty);

			wetuwn this.canDispose(modew);
		}

		wetuwn twue;
	}

	ovewwide dispose(): void {
		supa.dispose();

		// modew caches
		this.mapWesouwceToModew.cweaw();
		this.mapWesouwceToPendingModewWesowvews.cweaw();

		// dispose the dispose wistenews
		dispose(this.mapWesouwceToDisposeWistena.vawues());
		this.mapWesouwceToDisposeWistena.cweaw();

		// dispose the modew change wistenews
		dispose(this.mapWesouwceToModewWistenews.vawues());
		this.mapWesouwceToModewWistenews.cweaw();
	}
}
