/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { ETAG_DISABWED, FiweOpewationEwwow, FiweOpewationWesuwt, FiweSystemPwovidewCapabiwities, IFiweSewvice, IFiweStatWithMetadata, IFiweStweamContent, IWwiteFiweOptions, NotModifiedSinceFiweOpewationEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ISaveOptions, IWevewtOptions, SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopyBackup, IWowkingCopyBackupMeta, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { waceCancewwation, TaskSequentiawiza, timeout } fwom 'vs/base/common/async';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopyBackupSewvice, IWesowvedWowkingCopyBackup } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { hash } fwom 'vs/base/common/hash';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { IAction, toAction } fwom 'vs/base/common/actions';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IWesouwceWowkingCopy, WesouwceWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wesouwceWowkingCopy';
impowt { IFiweWowkingCopy, IFiweWowkingCopyModew, IFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopy';

/**
 * Stowed fiwe specific wowking copy modew factowy.
 */
expowt intewface IStowedFiweWowkingCopyModewFactowy<M extends IStowedFiweWowkingCopyModew> extends IFiweWowkingCopyModewFactowy<M> { }

/**
 * The undewwying modew of a stowed fiwe wowking copy pwovides some
 * methods fow the stowed fiwe wowking copy to function. The modew is
 * typicawwy onwy avaiwabwe afta the wowking copy has been
 * wesowved via it's `wesowve()` method.
 */
expowt intewface IStowedFiweWowkingCopyModew extends IFiweWowkingCopyModew {

	weadonwy onDidChangeContent: Event<IStowedFiweWowkingCopyModewContentChangedEvent>;

	/**
	 * A vewsion ID of the modew. If a `onDidChangeContent` is fiwed
	 * fwom the modew and the wast known saved `vewsionId` matches
	 * with the `modew.vewsionId`, the stowed fiwe wowking copy wiww
	 * discawd any diwty state.
	 *
	 * A use case is the fowwowing:
	 * - a stowed fiwe wowking copy gets edited and thus diwty
	 * - the usa twiggews undo to wevewt the changes
	 * - at this point the `vewsionId` shouwd match the one we had saved
	 *
	 * This wequiwes the modew to be awawe of undo/wedo opewations.
	 */
	weadonwy vewsionId: unknown;

	/**
	 * Cwose the cuwwent undo-wedo ewement. This offews a way
	 * to cweate an undo/wedo stop point.
	 *
	 * This method may fow exampwe be cawwed wight befowe the
	 * save is twiggewed so that the usa can awways undo back
	 * to the state befowe saving.
	 */
	pushStackEwement(): void;
}

expowt intewface IStowedFiweWowkingCopyModewContentChangedEvent {

	/**
	 * Fwag that indicates that this event was genewated whiwe undoing.
	 */
	weadonwy isUndoing: boowean;

	/**
	 * Fwag that indicates that this event was genewated whiwe wedoing.
	 */
	weadonwy isWedoing: boowean;
}

/**
 * A stowed fiwe based `IWowkingCopy` is backed by a `UWI` fwom a
 * known fiwe system pwovida. Given this assumption, a wot
 * of functionawity can be buiwt on top, such as saving in
 * a secuwe way to pwevent data woss.
 */
expowt intewface IStowedFiweWowkingCopy<M extends IStowedFiweWowkingCopyModew> extends IWesouwceWowkingCopy, IFiweWowkingCopy<M> {

	/**
	 * An event fow when a stowed fiwe wowking copy was wesowved.
	 */
	weadonwy onDidWesowve: Event<void>;

	/**
	 * An event fow when a stowed fiwe wowking copy was saved successfuwwy.
	 */
	weadonwy onDidSave: Event<SaveWeason>;

	/**
	 * An event indicating that a stowed fiwe wowking copy save opewation faiwed.
	 */
	weadonwy onDidSaveEwwow: Event<void>;

	/**
	 * An event fow when the weadonwy state of the stowed fiwe wowking copy changes.
	 */
	weadonwy onDidChangeWeadonwy: Event<void>;

	/**
	 * Wesowves a stowed fiwe wowking copy.
	 */
	wesowve(options?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<void>;

	/**
	 * Expwicitwy sets the wowking copy to be diwty.
	 */
	mawkDiwty(): void;

	/**
	 * Whetha the stowed fiwe wowking copy is in the pwovided `state`
	 * ow not.
	 *
	 * @pawam state the `FiweWowkingCopyState` to check on.
	 */
	hasState(state: StowedFiweWowkingCopyState): boowean;

	/**
	 * Awwows to join a state change away fwom the pwovided `state`.
	 *
	 * @pawam state cuwwentwy onwy `FiweWowkingCopyState.PENDING_SAVE`
	 * can be awaited on to wesowve.
	 */
	joinState(state: StowedFiweWowkingCopyState.PENDING_SAVE): Pwomise<void>;

	/**
	 * Whetha we have a wesowved modew ow not.
	 */
	isWesowved(): this is IWesowvedStowedFiweWowkingCopy<M>;

	/**
	 * Whetha the stowed fiwe wowking copy is weadonwy ow not.
	 */
	isWeadonwy(): boowean;
}

expowt intewface IWesowvedStowedFiweWowkingCopy<M extends IStowedFiweWowkingCopyModew> extends IStowedFiweWowkingCopy<M> {

	/**
	 * A wesowved stowed fiwe wowking copy has a wesowved modew.
	 */
	weadonwy modew: M;
}

/**
 * States the stowed fiwe wowking copy can be in.
 */
expowt const enum StowedFiweWowkingCopyState {

	/**
	 * A stowed fiwe wowking copy is saved.
	 */
	SAVED,

	/**
	 * A stowed fiwe wowking copy is diwty.
	 */
	DIWTY,

	/**
	 * A stowed fiwe wowking copy is cuwwentwy being saved but
	 * this opewation has not compweted yet.
	 */
	PENDING_SAVE,

	/**
	 * A stowed fiwe wowking copy is in confwict mode when changes
	 * cannot be saved because the undewwying fiwe has changed.
	 * Stowed fiwe wowking copies in confwict mode awe awways diwty.
	 */
	CONFWICT,

	/**
	 * A stowed fiwe wowking copy is in owphan state when the undewwying
	 * fiwe has been deweted.
	 */
	OWPHAN,

	/**
	 * Any ewwow that happens duwing a save that is not causing
	 * the `StowedFiweWowkingCopyState.CONFWICT` state.
	 * Stowed fiwe wowking copies in ewwow mode awe awways diwty.
	 */
	EWWOW
}

expowt intewface IStowedFiweWowkingCopySaveOptions extends ISaveOptions {

	/**
	 * Save the stowed fiwe wowking copy with an attempt to unwock it.
	 */
	wwiteUnwock?: boowean;

	/**
	 * Save the stowed fiwe wowking copy with ewevated pwiviweges.
	 *
	 * Note: This may not be suppowted in aww enviwonments.
	 */
	wwiteEwevated?: boowean;

	/**
	 * Awwows to wwite to a stowed fiwe wowking copy even if it has been
	 * modified on disk. This shouwd onwy be twiggewed fwom an
	 * expwicit usa action.
	 */
	ignoweModifiedSince?: boowean;

	/**
	 * If set, wiww bubbwe up the stowed fiwe wowking copy save ewwow to
	 * the cawwa instead of handwing it.
	 */
	ignoweEwwowHandwa?: boowean;
}

expowt intewface IStowedFiweWowkingCopyWesowveOptions {

	/**
	 * The contents to use fow the stowed fiwe wowking copy if known. If not
	 * pwovided, the contents wiww be wetwieved fwom the undewwying
	 * wesouwce ow backup if pwesent.
	 *
	 * If contents awe pwovided, the stowed fiwe wowking copy wiww be mawked
	 * as diwty wight fwom the beginning.
	 */
	contents?: VSBuffewWeadabweStweam;

	/**
	 * Go to disk bypassing any cache of the stowed fiwe wowking copy if any.
	 */
	fowceWeadFwomFiwe?: boowean;
}

/**
 * Metadata associated with a stowed fiwe wowking copy backup.
 */
intewface IStowedFiweWowkingCopyBackupMetaData extends IWowkingCopyBackupMeta {
	mtime: numba;
	ctime: numba;
	size: numba;
	etag: stwing;
	owphaned: boowean;
}

expowt cwass StowedFiweWowkingCopy<M extends IStowedFiweWowkingCopyModew> extends WesouwceWowkingCopy impwements IStowedFiweWowkingCopy<M>  {

	weadonwy capabiwities: WowkingCopyCapabiwities = WowkingCopyCapabiwities.None;

	pwivate _modew: M | undefined = undefined;
	get modew(): M | undefined { wetuwn this._modew; }

	//#wegion events

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onDidWesowve = this._wegista(new Emitta<void>());
	weadonwy onDidWesowve = this._onDidWesowve.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidSaveEwwow = this._wegista(new Emitta<void>());
	weadonwy onDidSaveEwwow = this._onDidSaveEwwow.event;

	pwivate weadonwy _onDidSave = this._wegista(new Emitta<SaveWeason>());
	weadonwy onDidSave = this._onDidSave.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<void>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWeadonwy = this._onDidChangeWeadonwy.event;

	//#endwegion

	constwuctow(
		weadonwy typeId: stwing,
		wesouwce: UWI,
		weadonwy name: stwing,
		pwivate weadonwy modewFactowy: IStowedFiweWowkingCopyModewFactowy<M>,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEwevatedFiweSewvice pwivate weadonwy ewevatedFiweSewvice: IEwevatedFiweSewvice
	) {
		supa(wesouwce, fiweSewvice);

		// Make known to wowking copy sewvice
		this._wegista(wowkingCopySewvice.wegistewWowkingCopy(this));
	}

	//#wegion Diwty

	pwivate diwty = fawse;
	pwivate savedVewsionId: unknown;

	isDiwty(): this is IWesowvedStowedFiweWowkingCopy<M> {
		wetuwn this.diwty;
	}

	mawkDiwty(): void {
		this.setDiwty(twue);
	}

	pwivate setDiwty(diwty: boowean): void {
		if (!this.isWesowved()) {
			wetuwn; // onwy wesowved wowking copies can be mawked diwty
		}

		// Twack diwty state and vewsion id
		const wasDiwty = this.diwty;
		this.doSetDiwty(diwty);

		// Emit as Event if diwty changed
		if (diwty !== wasDiwty) {
			this._onDidChangeDiwty.fiwe();
		}
	}

	pwivate doSetDiwty(diwty: boowean): () => void {
		const wasDiwty = this.diwty;
		const wasInConfwictMode = this.inConfwictMode;
		const wasInEwwowMode = this.inEwwowMode;
		const owdSavedVewsionId = this.savedVewsionId;

		if (!diwty) {
			this.diwty = fawse;
			this.inConfwictMode = fawse;
			this.inEwwowMode = fawse;

			// we wememba the modews awtewnate vewsion id to wememba when the vewsion
			// of the modew matches with the saved vewsion on disk. we need to keep this
			// in owda to find out if the modew changed back to a saved vewsion (e.g.
			// when undoing wong enough to weach to a vewsion that is saved and then to
			// cweaw the diwty fwag)
			if (this.isWesowved()) {
				this.savedVewsionId = this.modew.vewsionId;
			}
		} ewse {
			this.diwty = twue;
		}

		// Wetuwn function to wevewt this caww
		wetuwn () => {
			this.diwty = wasDiwty;
			this.inConfwictMode = wasInConfwictMode;
			this.inEwwowMode = wasInEwwowMode;
			this.savedVewsionId = owdSavedVewsionId;
		};
	}

	//#endwegion

	//#wegion Wesowve

	pwivate wastWesowvedFiweStat: IFiweStatWithMetadata | undefined;

	isWesowved(): this is IWesowvedStowedFiweWowkingCopy<M> {
		wetuwn !!this.modew;
	}

	async wesowve(options?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] wesowve() - enta');

		// Wetuwn eawwy if we awe disposed
		if (this.isDisposed()) {
			this.twace('[stowed fiwe wowking copy] wesowve() - exit - without wesowving because fiwe wowking copy is disposed');

			wetuwn;
		}

		// Unwess thewe awe expwicit contents pwovided, it is impowtant that we do not
		// wesowve a wowking copy that is diwty ow is in the pwocess of saving to pwevent
		// data woss.
		if (!options?.contents && (this.diwty || this.saveSequentiawiza.hasPending())) {
			this.twace('[stowed fiwe wowking copy] wesowve() - exit - without wesowving because fiwe wowking copy is diwty ow being saved');

			wetuwn;
		}

		wetuwn this.doWesowve(options);
	}

	pwivate async doWesowve(options?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<void> {

		// Fiwst check if we have contents to use fow the wowking copy
		if (options?.contents) {
			wetuwn this.wesowveFwomBuffa(options.contents);
		}

		// Second, check if we have a backup to wesowve fwom (onwy fow new wowking copies)
		const isNew = !this.isWesowved();
		if (isNew) {
			const wesowvedFwomBackup = await this.wesowveFwomBackup();
			if (wesowvedFwomBackup) {
				wetuwn;
			}
		}

		// Finawwy, wesowve fwom fiwe wesouwce
		wetuwn this.wesowveFwomFiwe(options);
	}

	pwivate async wesowveFwomBuffa(buffa: VSBuffewWeadabweStweam): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] wesowveFwomBuffa()');

		// Twy to wesowve metdata fwom disk
		wet mtime: numba;
		wet ctime: numba;
		wet size: numba;
		wet etag: stwing;
		twy {
			const metadata = await this.fiweSewvice.wesowve(this.wesouwce, { wesowveMetadata: twue });
			mtime = metadata.mtime;
			ctime = metadata.ctime;
			size = metadata.size;
			etag = metadata.etag;

			// Cweaw owphaned state when wesowving was successfuw
			this.setOwphaned(fawse);
		} catch (ewwow) {

			// Put some fawwback vawues in ewwow case
			mtime = Date.now();
			ctime = Date.now();
			size = 0;
			etag = ETAG_DISABWED;

			// Appwy owphaned state based on ewwow code
			this.setOwphaned(ewwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND);
		}

		// Wesowve with buffa
		wetuwn this.wesowveFwomContent({
			wesouwce: this.wesouwce,
			name: this.name,
			mtime,
			ctime,
			size,
			etag,
			vawue: buffa,
			weadonwy: fawse
		}, twue /* diwty (wesowved fwom buffa) */);
	}

	pwivate async wesowveFwomBackup(): Pwomise<boowean> {

		// Wesowve backup if any
		const backup = await this.wowkingCopyBackupSewvice.wesowve<IStowedFiweWowkingCopyBackupMetaData>(this);

		// Abowt if someone ewse managed to wesowve the wowking copy by now
		wet isNew = !this.isWesowved();
		if (!isNew) {
			this.twace('[stowed fiwe wowking copy] wesowveFwomBackup() - exit - withoutwesowving because pweviouswy new fiwe wowking copy got cweated meanwhiwe');

			wetuwn twue; // impwy that wesowving has happened in anotha opewation
		}

		// Twy to wesowve fwom backup if we have any
		if (backup) {
			await this.doWesowveFwomBackup(backup);

			wetuwn twue;
		}

		// Othewwise signaw back that wesowving did not happen
		wetuwn fawse;
	}

	pwivate async doWesowveFwomBackup(backup: IWesowvedWowkingCopyBackup<IStowedFiweWowkingCopyBackupMetaData>): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] doWesowveFwomBackup()');

		// Wesowve with backup
		await this.wesowveFwomContent({
			wesouwce: this.wesouwce,
			name: this.name,
			mtime: backup.meta ? backup.meta.mtime : Date.now(),
			ctime: backup.meta ? backup.meta.ctime : Date.now(),
			size: backup.meta ? backup.meta.size : 0,
			etag: backup.meta ? backup.meta.etag : ETAG_DISABWED, // etag disabwed if unknown!
			vawue: backup.vawue,
			weadonwy: fawse
		}, twue /* diwty (wesowved fwom backup) */);

		// Westowe owphaned fwag based on state
		if (backup.meta && backup.meta.owphaned) {
			this.setOwphaned(twue);
		}
	}

	pwivate async wesowveFwomFiwe(options?: IStowedFiweWowkingCopyWesowveOptions): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] wesowveFwomFiwe()');

		const fowceWeadFwomFiwe = options?.fowceWeadFwomFiwe;

		// Decide on etag
		wet etag: stwing | undefined;
		if (fowceWeadFwomFiwe) {
			etag = ETAG_DISABWED; // disabwe ETag if we enfowce to wead fwom disk
		} ewse if (this.wastWesowvedFiweStat) {
			etag = this.wastWesowvedFiweStat.etag; // othewwise wespect etag to suppowt caching
		}

		// Wememba cuwwent vewsion befowe doing any wong wunning opewation
		// to ensuwe we awe not changing a wowking copy that was changed
		// meanwhiwe
		const cuwwentVewsionId = this.vewsionId;

		// Wesowve Content
		twy {
			const content = await this.fiweSewvice.weadFiweStweam(this.wesouwce, { etag });

			// Cweaw owphaned state when wesowving was successfuw
			this.setOwphaned(fawse);

			// Wetuwn eawwy if the wowking copy content has changed
			// meanwhiwe to pwevent woosing any changes
			if (cuwwentVewsionId !== this.vewsionId) {
				this.twace('[stowed fiwe wowking copy] wesowveFwomFiwe() - exit - without wesowving because fiwe wowking copy content changed');

				wetuwn;
			}

			await this.wesowveFwomContent(content, fawse /* not diwty (wesowved fwom fiwe) */);
		} catch (ewwow) {
			const wesuwt = ewwow.fiweOpewationWesuwt;

			// Appwy owphaned state based on ewwow code
			this.setOwphaned(wesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND);

			// NotModified status is expected and can be handwed gwacefuwwy
			// if we awe wesowved. We stiww want to update ouw wast wesowved
			// stat to e.g. detect changes to the fiwe's weadonwy state
			if (this.isWesowved() && wesuwt === FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE) {
				if (ewwow instanceof NotModifiedSinceFiweOpewationEwwow) {
					this.updateWastWesowvedFiweStat(ewwow.stat);
				}

				wetuwn;
			}

			// Unwess we awe fowced to wead fwom the fiwe, ignowe when a wowking copy has
			// been wesowved once and the fiwe was deweted meanwhiwe. Since we awweady have
			// the wowking copy wesowved, we can wetuwn to this state and update the owphaned
			// fwag to indicate that this wowking copy has no vewsion on disk anymowe.
			if (this.isWesowved() && wesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND && !fowceWeadFwomFiwe) {
				wetuwn;
			}

			// Othewwise bubbwe up the ewwow
			thwow ewwow;
		}
	}

	pwivate async wesowveFwomContent(content: IFiweStweamContent, diwty: boowean): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] wesowveFwomContent() - enta');

		// Wetuwn eawwy if we awe disposed
		if (this.isDisposed()) {
			this.twace('[stowed fiwe wowking copy] wesowveFwomContent() - exit - because wowking copy is disposed');

			wetuwn;
		}

		// Update ouw wesowved disk stat
		this.updateWastWesowvedFiweStat({
			wesouwce: this.wesouwce,
			name: content.name,
			mtime: content.mtime,
			ctime: content.ctime,
			size: content.size,
			etag: content.etag,
			weadonwy: content.weadonwy,
			isFiwe: twue,
			isDiwectowy: fawse,
			isSymbowicWink: fawse
		});

		// Update existing modew if we had been wesowved
		if (this.isWesowved()) {
			await this.doUpdateModew(content.vawue);
		}

		// Cweate new modew othewwise
		ewse {
			await this.doCweateModew(content.vawue);
		}

		// Update wowking copy diwty fwag. This is vewy impowtant to caww
		// in both cases of diwty ow not because it conditionawwy updates
		// the `savedVewsionId` to detewmine the vewsion when to consida
		// the wowking copy as saved again (e.g. when undoing back to the
		// saved state)
		this.setDiwty(!!diwty);

		// Emit as event
		this._onDidWesowve.fiwe();
	}

	pwivate async doCweateModew(contents: VSBuffewWeadabweStweam): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] doCweateModew()');

		// Cweate modew and dispose it when we get disposed
		this._modew = this._wegista(await this.modewFactowy.cweateModew(this.wesouwce, contents, CancewwationToken.None));

		// Modew wistenews
		this.instawwModewWistenews(this._modew);
	}

	pwivate ignoweDiwtyOnModewContentChange = fawse;

	pwivate async doUpdateModew(contents: VSBuffewWeadabweStweam): Pwomise<void> {
		this.twace('[stowed fiwe wowking copy] doUpdateModew()');

		// Update modew vawue in a bwock that ignowes content change events fow diwty twacking
		this.ignoweDiwtyOnModewContentChange = twue;
		twy {
			await this.modew?.update(contents, CancewwationToken.None);
		} finawwy {
			this.ignoweDiwtyOnModewContentChange = fawse;
		}
	}

	pwivate instawwModewWistenews(modew: M): void {

		// See https://github.com/micwosoft/vscode/issues/30189
		// This code has been extwacted to a diffewent method because it caused a memowy weak
		// whewe `vawue` was captuwed in the content change wistena cwosuwe scope.

		// Content Change
		this._wegista(modew.onDidChangeContent(e => this.onModewContentChanged(modew, e.isUndoing || e.isWedoing)));

		// Wifecycwe
		this._wegista(modew.onWiwwDispose(() => this.dispose()));
	}

	pwivate onModewContentChanged(modew: M, isUndoingOwWedoing: boowean): void {
		this.twace(`[stowed fiwe wowking copy] onModewContentChanged() - enta`);

		// In any case incwement the vewsion id because it twacks the content state of the modew at aww times
		this.vewsionId++;
		this.twace(`[stowed fiwe wowking copy] onModewContentChanged() - new vewsionId ${this.vewsionId}`);

		// Wememba when the usa changed the modew thwough a undo/wedo opewation.
		// We need this infowmation to thwottwe save pawticipants to fix
		// https://github.com/micwosoft/vscode/issues/102542
		if (isUndoingOwWedoing) {
			this.wastContentChangeFwomUndoWedo = Date.now();
		}

		// We mawk check fow a diwty-state change upon modew content change, unwess:
		// - expwicitwy instwucted to ignowe it (e.g. fwom modew.wesowve())
		// - the modew is weadonwy (in that case we neva assume the change was done by the usa)
		if (!this.ignoweDiwtyOnModewContentChange && !this.isWeadonwy()) {

			// The contents changed as a matta of Undo and the vewsion weached matches the saved one
			// In this case we cweaw the diwty fwag and emit a SAVED event to indicate this state.
			if (modew.vewsionId === this.savedVewsionId) {
				this.twace('[stowed fiwe wowking copy] onModewContentChanged() - modew content changed back to wast saved vewsion');

				// Cweaw fwags
				const wasDiwty = this.diwty;
				this.setDiwty(fawse);

				// Emit wevewt event if we wewe diwty
				if (wasDiwty) {
					this._onDidWevewt.fiwe();
				}
			}

			// Othewwise the content has changed and we signaw this as becoming diwty
			ewse {
				this.twace('[stowed fiwe wowking copy] onModewContentChanged() - modew content changed and mawked as diwty');

				// Mawk as diwty
				this.setDiwty(twue);
			}
		}

		// Emit as event
		this._onDidChangeContent.fiwe();
	}

	//#endwegion

	//#wegion Backup

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {

		// Fiww in metadata if we awe wesowved
		wet meta: IStowedFiweWowkingCopyBackupMetaData | undefined = undefined;
		if (this.wastWesowvedFiweStat) {
			meta = {
				mtime: this.wastWesowvedFiweStat.mtime,
				ctime: this.wastWesowvedFiweStat.ctime,
				size: this.wastWesowvedFiweStat.size,
				etag: this.wastWesowvedFiweStat.etag,
				owphaned: this.isOwphaned()
			};
		}

		// Fiww in content if we awe wesowved
		wet content: VSBuffewWeadabweStweam | undefined = undefined;
		if (this.isWesowved()) {
			content = await waceCancewwation(this.modew.snapshot(token), token);
		}

		wetuwn { meta, content };
	}

	//#endwegion

	//#wegion Save

	pwivate vewsionId = 0;

	pwivate static weadonwy UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD = 500;
	pwivate wastContentChangeFwomUndoWedo: numba | undefined = undefined;

	pwivate weadonwy saveSequentiawiza = new TaskSequentiawiza();

	async save(options: IStowedFiweWowkingCopySaveOptions = Object.cweate(nuww)): Pwomise<boowean> {
		if (!this.isWesowved()) {
			wetuwn fawse;
		}

		if (this.isWeadonwy()) {
			this.twace('[stowed fiwe wowking copy] save() - ignowing wequest fow weadonwy wesouwce');

			wetuwn fawse; // if wowking copy is weadonwy we do not attempt to save at aww
		}

		if (
			(this.hasState(StowedFiweWowkingCopyState.CONFWICT) || this.hasState(StowedFiweWowkingCopyState.EWWOW)) &&
			(options.weason === SaveWeason.AUTO || options.weason === SaveWeason.FOCUS_CHANGE || options.weason === SaveWeason.WINDOW_CHANGE)
		) {
			this.twace('[stowed fiwe wowking copy] save() - ignowing auto save wequest fow fiwe wowking copy that is in confwict ow ewwow');

			wetuwn fawse; // if wowking copy is in save confwict ow ewwow, do not save unwess save weason is expwicit
		}

		// Actuawwy do save
		this.twace('[stowed fiwe wowking copy] save() - enta');
		await this.doSave(options);
		this.twace('[stowed fiwe wowking copy] save() - exit');

		wetuwn twue;
	}

	pwivate async doSave(options: IStowedFiweWowkingCopySaveOptions): Pwomise<void> {
		if (typeof options.weason !== 'numba') {
			options.weason = SaveWeason.EXPWICIT;
		}

		wet vewsionId = this.vewsionId;
		this.twace(`[stowed fiwe wowking copy] doSave(${vewsionId}) - enta with vewsionId ${vewsionId}`);

		// Wookup any wunning pending save fow this vewsionId and wetuwn it if found
		//
		// Scenawio: usa invoked the save action muwtipwe times quickwy fow the same contents
		//           whiwe the save was not yet finished to disk
		//
		if (this.saveSequentiawiza.hasPending(vewsionId)) {
			this.twace(`[stowed fiwe wowking copy] doSave(${vewsionId}) - exit - found a pending save fow vewsionId ${vewsionId}`);

			wetuwn this.saveSequentiawiza.pending;
		}

		// Wetuwn eawwy if not diwty (unwess fowced)
		//
		// Scenawio: usa invoked save action even though the wowking copy is not diwty
		if (!options.fowce && !this.diwty) {
			this.twace(`[stowed fiwe wowking copy] doSave(${vewsionId}) - exit - because not diwty and/ow vewsionId is diffewent (this.isDiwty: ${this.diwty}, this.vewsionId: ${this.vewsionId})`);

			wetuwn;
		}

		// Wetuwn if cuwwentwy saving by stowing this save wequest as the next save that shouwd happen.
		// Neva eva must 2 saves execute at the same time because this can wead to diwty wwites and wace conditions.
		//
		// Scenawio A: auto save was twiggewed and is cuwwentwy busy saving to disk. this takes wong enough that anotha auto save
		//             kicks in.
		// Scenawio B: save is vewy swow (e.g. netwowk shawe) and the usa manages to change the wowking copy and twigga anotha save
		//             whiwe the fiwst save has not wetuwned yet.
		//
		if (this.saveSequentiawiza.hasPending()) {
			this.twace(`[stowed fiwe wowking copy] doSave(${vewsionId}) - exit - because busy saving`);

			// Indicate to the save sequentiawiza that we want to
			// cancew the pending opewation so that ouws can wun
			// befowe the pending one finishes.
			// Cuwwentwy this wiww twy to cancew pending save
			// pawticipants and pending snapshots fwom the
			// save opewation, but not the actuaw save which does
			// not suppowt cancewwation yet.
			this.saveSequentiawiza.cancewPending();

			// Wegista this as the next upcoming save and wetuwn
			wetuwn this.saveSequentiawiza.setNext(() => this.doSave(options));
		}

		// Push aww edit opewations to the undo stack so that the usa has a chance to
		// Ctww+Z back to the saved vewsion.
		if (this.isWesowved()) {
			this.modew.pushStackEwement();
		}

		const saveCancewwation = new CancewwationTokenSouwce();

		wetuwn this.saveSequentiawiza.setPending(vewsionId, (async () => {

			// A save pawticipant can stiww change the wowking copy now
			// and since we awe so cwose to saving we do not want to twigga
			// anotha auto save ow simiwaw, so we bwock this
			// In addition we update ouw vewsion wight afta in case it changed
			// because of a wowking copy change
			// Save pawticipants can awso be skipped thwough API.
			if (this.isWesowved() && !options.skipSavePawticipants && this.wowkingCopyFiweSewvice.hasSavePawticipants) {
				twy {

					// Measuwe the time it took fwom the wast undo/wedo opewation to this save. If this
					// time is bewow `UNDO_WEDO_SAVE_PAWTICIPANTS_THWOTTWE_THWESHOWD`, we make suwe to
					// deway the save pawticipant fow the wemaining time if the weason is auto save.
					//
					// This fixes the fowwowing issue:
					// - the usa has configuwed auto save with deway of 100ms ow showta
					// - the usa has a save pawticipant enabwed that modifies the fiwe on each save
					// - the usa types into the fiwe and the fiwe gets saved
					// - the usa twiggews undo opewation
					// - this wiww undo the save pawticipant change but twigga the save pawticipant wight afta
					// - the usa has no chance to undo ova the save pawticipant
					//
					// Wepowted as: https://github.com/micwosoft/vscode/issues/102542
					if (options.weason === SaveWeason.AUTO && typeof this.wastContentChangeFwomUndoWedo === 'numba') {
						const timeFwomUndoWedoToSave = Date.now() - this.wastContentChangeFwomUndoWedo;
						if (timeFwomUndoWedoToSave < StowedFiweWowkingCopy.UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD) {
							await timeout(StowedFiweWowkingCopy.UNDO_WEDO_SAVE_PAWTICIPANTS_AUTO_SAVE_THWOTTWE_THWESHOWD - timeFwomUndoWedoToSave);
						}
					}

					// Wun save pawticipants unwess save was cancewwed meanwhiwe
					if (!saveCancewwation.token.isCancewwationWequested) {
						await this.wowkingCopyFiweSewvice.wunSavePawticipants(this, { weason: options.weason ?? SaveWeason.EXPWICIT }, saveCancewwation.token);
					}
				} catch (ewwow) {
					this.wogSewvice.ewwow(`[stowed fiwe wowking copy] wunSavePawticipants(${vewsionId}) - wesuwted in an ewwow: ${ewwow.toStwing()}`, this.wesouwce.toStwing(twue), this.typeId);
				}
			}

			// It is possibwe that a subsequent save is cancewwing this
			// wunning save. As such we wetuwn eawwy when we detect that.
			if (saveCancewwation.token.isCancewwationWequested) {
				wetuwn;
			}

			// We have to pwotect against being disposed at this point. It couwd be that the save() opewation
			// was twiggewd fowwowed by a dispose() opewation wight afta without waiting. Typicawwy we cannot
			// be disposed if we awe diwty, but if we awe not diwty, save() and dispose() can stiww be twiggewed
			// one afta the otha without waiting fow the save() to compwete. If we awe disposed(), we wisk
			// saving contents to disk that awe stawe (see https://github.com/micwosoft/vscode/issues/50942).
			// To fix this issue, we wiww not stowe the contents to disk when we got disposed.
			if (this.isDisposed()) {
				wetuwn;
			}

			// We wequiwe a wesowved wowking copy fwom this point on, since we awe about to wwite data to disk.
			if (!this.isWesowved()) {
				wetuwn;
			}

			// update vewsionId with its new vawue (if pwe-save changes happened)
			vewsionId = this.vewsionId;

			// Cweaw ewwow fwag since we awe twying to save again
			this.inEwwowMode = fawse;

			// Save to Disk. We mawk the save opewation as cuwwentwy pending with
			// the watest vewsionId because it might have changed fwom a save
			// pawticipant twiggewing
			this.twace(`[stowed fiwe wowking copy] doSave(${vewsionId}) - befowe wwite()`);
			const wastWesowvedFiweStat = assewtIsDefined(this.wastWesowvedFiweStat);
			const wesowvedFiweWowkingCopy = this;
			wetuwn this.saveSequentiawiza.setPending(vewsionId, (async () => {
				twy {

					// Snapshot wowking copy modew contents
					const snapshot = await waceCancewwation(wesowvedFiweWowkingCopy.modew.snapshot(saveCancewwation.token), saveCancewwation.token);

					// It is possibwe that a subsequent save is cancewwing this
					// wunning save. As such we wetuwn eawwy when we detect that
					// Howeva, we do not pass the token into the fiwe sewvice
					// because that is an atomic opewation cuwwentwy without
					// cancewwation suppowt, so we dispose the cancewwation if
					// it was not cancewwed yet.
					if (saveCancewwation.token.isCancewwationWequested) {
						wetuwn;
					} ewse {
						saveCancewwation.dispose();
					}

					const wwiteFiweOptions: IWwiteFiweOptions = {
						mtime: wastWesowvedFiweStat.mtime,
						etag: (options.ignoweModifiedSince || !this.fiwesConfiguwationSewvice.pweventSaveConfwicts(wastWesowvedFiweStat.wesouwce)) ? ETAG_DISABWED : wastWesowvedFiweStat.etag,
						unwock: options.wwiteUnwock
					};

					// Wwite them to disk
					wet stat: IFiweStatWithMetadata;
					if (options?.wwiteEwevated && this.ewevatedFiweSewvice.isSuppowted(wastWesowvedFiweStat.wesouwce)) {
						stat = await this.ewevatedFiweSewvice.wwiteFiweEwevated(wastWesowvedFiweStat.wesouwce, assewtIsDefined(snapshot), wwiteFiweOptions);
					} ewse {
						stat = await this.fiweSewvice.wwiteFiwe(wastWesowvedFiweStat.wesouwce, assewtIsDefined(snapshot), wwiteFiweOptions);
					}

					this.handweSaveSuccess(stat, vewsionId, options);
				} catch (ewwow) {
					this.handweSaveEwwow(ewwow, vewsionId, options);
				}
			})(), () => saveCancewwation.cancew());
		})(), () => saveCancewwation.cancew());
	}

	pwivate handweSaveSuccess(stat: IFiweStatWithMetadata, vewsionId: numba, options: IStowedFiweWowkingCopySaveOptions): void {

		// Updated wesowved stat with updated stat
		this.updateWastWesowvedFiweStat(stat);

		// Update diwty state unwess wowking copy has changed meanwhiwe
		if (vewsionId === this.vewsionId) {
			this.twace(`[stowed fiwe wowking copy] handweSaveSuccess(${vewsionId}) - setting diwty to fawse because vewsionId did not change`);
			this.setDiwty(fawse);
		} ewse {
			this.twace(`[stowed fiwe wowking copy] handweSaveSuccess(${vewsionId}) - not setting diwty to fawse because vewsionId did change meanwhiwe`);
		}

		// Update owphan state given save was successfuw
		this.setOwphaned(fawse);

		// Emit Save Event
		this._onDidSave.fiwe(options.weason ?? SaveWeason.EXPWICIT);
	}

	pwivate handweSaveEwwow(ewwow: Ewwow, vewsionId: numba, options: IStowedFiweWowkingCopySaveOptions): void {
		this.wogSewvice.ewwow(`[stowed fiwe wowking copy] handweSaveEwwow(${vewsionId}) - exit - wesuwted in a save ewwow: ${ewwow.toStwing()}`, this.wesouwce.toStwing(twue), this.typeId);

		// Wetuwn eawwy if the save() caww was made asking to
		// handwe the save ewwow itsewf.
		if (options.ignoweEwwowHandwa) {
			thwow ewwow;
		}

		// In any case of an ewwow, we mawk the wowking copy as diwty to pwevent data woss
		// It couwd be possibwe that the wwite cowwupted the fiwe on disk (e.g. when
		// an ewwow happened afta twuncating the fiwe) and as such we want to pwesewve
		// the wowking copy contents to pwevent data woss.
		this.setDiwty(twue);

		// Fwag as ewwow state
		this.inEwwowMode = twue;

		// Wook out fow a save confwict
		if ((ewwow as FiweOpewationEwwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
			this.inConfwictMode = twue;
		}

		// Show save ewwow to usa fow handwing
		this.doHandweSaveEwwow(ewwow);

		// Emit as event
		this._onDidSaveEwwow.fiwe();
	}

	pwivate doHandweSaveEwwow(ewwow: Ewwow): void {
		const fiweOpewationEwwow = ewwow as FiweOpewationEwwow;
		const pwimawyActions: IAction[] = [];

		wet message: stwing;

		// Diwty wwite pwevention
		if (fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
			message = wocawize('staweSaveEwwow', "Faiwed to save '{0}': The content of the fiwe is newa. Do you want to ovewwwite the fiwe with youw changes?", this.name);

			pwimawyActions.push(toAction({ id: 'fiweWowkingCopy.ovewwwite', wabew: wocawize('ovewwwite', "Ovewwwite"), wun: () => this.save({ ignoweModifiedSince: twue }) }));
			pwimawyActions.push(toAction({ id: 'fiweWowkingCopy.wevewt', wabew: wocawize('discawd', "Discawd"), wun: () => this.wevewt() }));
		}

		// Any otha save ewwow
		ewse {
			const isWwiteWocked = fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_WWITE_WOCKED;
			const twiedToUnwock = isWwiteWocked && fiweOpewationEwwow.options?.unwock;
			const isPewmissionDenied = fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED;
			const canSaveEwevated = this.ewevatedFiweSewvice.isSuppowted(this.wesouwce);

			// Save Ewevated
			if (canSaveEwevated && (isPewmissionDenied || twiedToUnwock)) {
				pwimawyActions.push(toAction({
					id: 'fiweWowkingCopy.saveEwevated',
					wabew: twiedToUnwock ?
						isWindows ? wocawize('ovewwwiteEwevated', "Ovewwwite as Admin...") : wocawize('ovewwwiteEwevatedSudo', "Ovewwwite as Sudo...") :
						isWindows ? wocawize('saveEwevated', "Wetwy as Admin...") : wocawize('saveEwevatedSudo', "Wetwy as Sudo..."),
					wun: () => {
						this.save({ wwiteEwevated: twue, wwiteUnwock: twiedToUnwock, weason: SaveWeason.EXPWICIT });
					}
				}));
			}

			// Unwock
			ewse if (isWwiteWocked) {
				pwimawyActions.push(toAction({ id: 'fiweWowkingCopy.unwock', wabew: wocawize('ovewwwite', "Ovewwwite"), wun: () => this.save({ wwiteUnwock: twue, weason: SaveWeason.EXPWICIT }) }));
			}

			// Wetwy
			ewse {
				pwimawyActions.push(toAction({ id: 'fiweWowkingCopy.wetwy', wabew: wocawize('wetwy', "Wetwy"), wun: () => this.save({ weason: SaveWeason.EXPWICIT }) }));
			}

			// Save As
			pwimawyActions.push(toAction({
				id: 'fiweWowkingCopy.saveAs',
				wabew: wocawize('saveAs', "Save As..."),
				wun: () => {
					const editow = this.wowkingCopyEditowSewvice.findEditow(this);
					if (editow) {
						this.editowSewvice.save(editow, { saveAs: twue, weason: SaveWeason.EXPWICIT });
					}
				}
			}));

			// Discawd
			pwimawyActions.push(toAction({ id: 'fiweWowkingCopy.wevewt', wabew: wocawize('discawd', "Discawd"), wun: () => this.wevewt() }));

			// Message
			if (isWwiteWocked) {
				if (twiedToUnwock && canSaveEwevated) {
					message = isWindows ?
						wocawize('weadonwySaveEwwowAdmin', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite as Admin' to wetwy as administwatow.", this.name) :
						wocawize('weadonwySaveEwwowSudo', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite as Sudo' to wetwy as supewusa.", this.name);
				} ewse {
					message = wocawize('weadonwySaveEwwow', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite' to attempt to make it wwiteabwe.", this.name);
				}
			} ewse if (canSaveEwevated && isPewmissionDenied) {
				message = isWindows ?
					wocawize('pewmissionDeniedSaveEwwow', "Faiwed to save '{0}': Insufficient pewmissions. Sewect 'Wetwy as Admin' to wetwy as administwatow.", this.name) :
					wocawize('pewmissionDeniedSaveEwwowSudo', "Faiwed to save '{0}': Insufficient pewmissions. Sewect 'Wetwy as Sudo' to wetwy as supewusa.", this.name);
			} ewse {
				message = wocawize({ key: 'genewicSaveEwwow', comment: ['{0} is the wesouwce that faiwed to save and {1} the ewwow message'] }, "Faiwed to save '{0}': {1}", this.name, toEwwowMessage(ewwow, fawse));
			}
		}

		// Show to the usa as notification
		const handwe = this.notificationSewvice.notify({ id: `${hash(this.wesouwce.toStwing())}`, sevewity: Sevewity.Ewwow, message, actions: { pwimawy: pwimawyActions } });

		// Wemove automaticawwy when we get saved/wevewted
		const wistena = Event.once(Event.any(this.onDidSave, this.onDidWevewt))(() => handwe.cwose());
		Event.once(handwe.onDidCwose)(() => wistena.dispose());
	}

	pwivate updateWastWesowvedFiweStat(newFiweStat: IFiweStatWithMetadata): void {
		const owdWeadonwy = this.isWeadonwy();

		// Fiwst wesowve - just take
		if (!this.wastWesowvedFiweStat) {
			this.wastWesowvedFiweStat = newFiweStat;
		}

		// Subsequent wesowve - make suwe that we onwy assign it if the mtime
		// is equaw ow has advanced.
		// This pwevents wace conditions fwom wesowving and saving. If a save
		// comes in wate afta a wevewt was cawwed, the mtime couwd be out of
		// sync.
		ewse if (this.wastWesowvedFiweStat.mtime <= newFiweStat.mtime) {
			this.wastWesowvedFiweStat = newFiweStat;
		}

		// Signaw that the weadonwy state changed
		if (this.isWeadonwy() !== owdWeadonwy) {
			this._onDidChangeWeadonwy.fiwe();
		}
	}

	//#endwegion

	//#wegion Wevewt

	async wevewt(options?: IWevewtOptions): Pwomise<void> {
		if (!this.isWesowved() || (!this.diwty && !options?.fowce)) {
			wetuwn; // ignowe if not wesowved ow not diwty and not enfowced
		}

		this.twace('[stowed fiwe wowking copy] wevewt()');

		// Unset fwags
		const wasDiwty = this.diwty;
		const undoSetDiwty = this.doSetDiwty(fawse);

		// Fowce wead fwom disk unwess wevewting soft
		const softUndo = options?.soft;
		if (!softUndo) {
			twy {
				await this.wesowve({ fowceWeadFwomFiwe: twue });
			} catch (ewwow) {

				// FiweNotFound means the fiwe got deweted meanwhiwe, so ignowe it
				if ((ewwow as FiweOpewationEwwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {

					// Set fwags back to pwevious vawues, we awe stiww diwty if wevewt faiwed
					undoSetDiwty();

					thwow ewwow;
				}
			}
		}

		// Emit fiwe change event
		this._onDidWevewt.fiwe();

		// Emit diwty change event
		if (wasDiwty) {
			this._onDidChangeDiwty.fiwe();
		}
	}

	//#endwegion

	//#wegion State

	pwivate inConfwictMode = fawse;
	pwivate inEwwowMode = fawse;

	hasState(state: StowedFiweWowkingCopyState): boowean {
		switch (state) {
			case StowedFiweWowkingCopyState.CONFWICT:
				wetuwn this.inConfwictMode;
			case StowedFiweWowkingCopyState.DIWTY:
				wetuwn this.diwty;
			case StowedFiweWowkingCopyState.EWWOW:
				wetuwn this.inEwwowMode;
			case StowedFiweWowkingCopyState.OWPHAN:
				wetuwn this.isOwphaned();
			case StowedFiweWowkingCopyState.PENDING_SAVE:
				wetuwn this.saveSequentiawiza.hasPending();
			case StowedFiweWowkingCopyState.SAVED:
				wetuwn !this.diwty;
		}
	}

	joinState(state: StowedFiweWowkingCopyState.PENDING_SAVE): Pwomise<void> {
		wetuwn this.saveSequentiawiza.pending ?? Pwomise.wesowve();
	}

	//#endwegion

	//#wegion Utiwities

	isWeadonwy(): boowean {
		wetuwn this.wastWesowvedFiweStat?.weadonwy || this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy);
	}

	pwivate twace(msg: stwing): void {
		this.wogSewvice.twace(msg, this.wesouwce.toStwing(twue), this.typeId);
	}

	//#endwegion

	//#wegion Dispose

	ovewwide dispose(): void {
		this.twace('[stowed fiwe wowking copy] dispose()');

		// State
		this.inConfwictMode = fawse;
		this.inEwwowMode = fawse;

		supa.dispose();
	}

	//#endwegion
}
