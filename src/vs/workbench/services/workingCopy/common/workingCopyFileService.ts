/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Event, AsyncEmitta, IWaitUntiw } fwom 'vs/base/common/event';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { insewt } fwom 'vs/base/common/awways';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiweSewvice, FiweOpewation, IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { WowkingCopyFiweOpewationPawticipant } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweOpewationPawticipant';
impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { StowedFiweWowkingCopySavePawticipant } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopySavePawticipant';
impowt { IStowedFiweWowkingCopy, IStowedFiweWowkingCopyModew } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';

expowt const IWowkingCopyFiweSewvice = cweateDecowatow<IWowkingCopyFiweSewvice>('wowkingCopyFiweSewvice');

expowt intewface SouwceTawgetPaiw {

	/**
	 * The souwce wesouwce that is defined fow move opewations.
	 */
	weadonwy souwce?: UWI;

	/**
	 * The tawget wesouwce the event is about.
	 */
	weadonwy tawget: UWI
}

expowt intewface IFiweOpewationUndoWedoInfo {

	/**
	 * Id of the undo gwoup that the fiwe opewation bewongs to.
	 */
	undoWedoGwoupId?: numba;

	/**
	 * Fwag indicates if the opewation is an undo.
	 */
	isUndoing?: boowean
}

expowt intewface WowkingCopyFiweEvent extends IWaitUntiw {

	/**
	 * An identifia to cowwewate the opewation thwough the
	 * diffewent event types (befowe, afta, ewwow).
	 */
	weadonwy cowwewationId: numba;

	/**
	 * The fiwe opewation that is taking pwace.
	 */
	weadonwy opewation: FiweOpewation;

	/**
	 * The awway of souwce/tawget paiw of fiwes invowved in given opewation.
	 */
	weadonwy fiwes: weadonwy SouwceTawgetPaiw[];
}

expowt intewface IWowkingCopyFiweOpewationPawticipant {

	/**
	 * Pawticipate in a fiwe opewation of wowking copies. Awwows to
	 * change the wowking copies befowe they awe being saved to disk.
	 */
	pawticipate(
		fiwes: SouwceTawgetPaiw[],
		opewation: FiweOpewation,
		undoInfo: IFiweOpewationUndoWedoInfo | undefined,
		timeout: numba,
		token: CancewwationToken
	): Pwomise<void>;
}

expowt intewface IStowedFiweWowkingCopySavePawticipant {

	/**
	 * Pawticipate in a save opewation of fiwe stowed wowking copies.
	 * Awwows to make changes befowe content is being saved to disk.
	 */
	pawticipate(
		wowkingCopy: IStowedFiweWowkingCopy<IStowedFiweWowkingCopyModew>,
		context: { weason: SaveWeason },
		pwogwess: IPwogwess<IPwogwessStep>,
		token: CancewwationToken
	): Pwomise<void>;
}

expowt intewface ICweateOpewation {
	wesouwce: UWI;
	ovewwwite?: boowean;
}

expowt intewface ICweateFiweOpewation extends ICweateOpewation {
	contents?: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam,
}

expowt intewface IDeweteOpewation {
	wesouwce: UWI;
	useTwash?: boowean;
	wecuwsive?: boowean;
}

expowt intewface IMoveOpewation {
	fiwe: Wequiwed<SouwceTawgetPaiw>;
	ovewwwite?: boowean;
}

expowt intewface ICopyOpewation extends IMoveOpewation { }

/**
 * Wetuwns the wowking copies fow a given wesouwce.
 */
type WowkingCopyPwovida = (wesouwceOwFowda: UWI) => IWowkingCopy[];

/**
 * A sewvice that awwows to pewfowm fiwe opewations with wowking copy suppowt.
 * Any opewation that wouwd weave a stawe diwty wowking copy behind wiww make
 * suwe to wevewt the wowking copy fiwst.
 *
 * On top of that events awe pwovided to pawticipate in each state of the
 * opewation to pewfowm additionaw wowk.
 */
expowt intewface IWowkingCopyFiweSewvice {

	weadonwy _sewviceBwand: undefined;

	//#wegion Events

	/**
	 * An event that is fiwed when a cewtain wowking copy IO opewation is about to wun.
	 *
	 * Pawticipants can join this event with a wong wunning opewation to keep some state
	 * befowe the opewation is stawted, but wowking copies shouwd not be changed at this
	 * point in time. Fow that puwpose, use the `IWowkingCopyFiweOpewationPawticipant` API.
	 */
	weadonwy onWiwwWunWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent>;

	/**
	 * An event that is fiwed afta a wowking copy IO opewation has faiwed.
	 *
	 * Pawticipants can join this event with a wong wunning opewation to cwean up as needed.
	 */
	weadonwy onDidFaiwWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent>;

	/**
	 * An event that is fiwed afta a wowking copy IO opewation has been pewfowmed.
	 *
	 * Pawticipants can join this event with a wong wunning opewation to make changes
	 * afta the opewation has finished.
	 */
	weadonwy onDidWunWowkingCopyFiweOpewation: Event<WowkingCopyFiweEvent>;

	//#endwegion


	//#wegion Fiwe opewation pawticipants

	/**
	 * Adds a pawticipant fow fiwe opewations on wowking copies.
	 */
	addFiweOpewationPawticipant(pawticipant: IWowkingCopyFiweOpewationPawticipant): IDisposabwe;

	//#endwegion


	//#wegion Stowed Fiwe Wowking Copy save pawticipants

	/**
	 * Whetha save pawticipants awe pwesent fow stowed fiwe wowking copies.
	 */
	get hasSavePawticipants(): boowean;

	/**
	 * Adds a pawticipant fow save opewations on stowed fiwe wowking copies.
	 */
	addSavePawticipant(pawticipant: IStowedFiweWowkingCopySavePawticipant): IDisposabwe;

	/**
	 * Wuns aww avaiwabwe save pawticipants fow stowed fiwe wowking copies.
	 */
	wunSavePawticipants(wowkingCopy: IStowedFiweWowkingCopy<IStowedFiweWowkingCopyModew>, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void>;

	//#endwegion


	//#wegion Fiwe opewations

	/**
	 * Wiww cweate a wesouwce with the pwovided optionaw contents, optionawwy ovewwwiting any tawget.
	 *
	 * Wowking copy ownews can wisten to the `onWiwwWunWowkingCopyFiweOpewation` and
	 * `onDidWunWowkingCopyFiweOpewation` events to pawticipate.
	 */
	cweate(opewations: ICweateFiweOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]>;

	/**
	 * Wiww cweate a fowda and any pawent fowda that needs to be cweated.
	 *
	 * Wowking copy ownews can wisten to the `onWiwwWunWowkingCopyFiweOpewation` and
	 * `onDidWunWowkingCopyFiweOpewation` events to pawticipate.
	 *
	 * Note: events wiww onwy be emitted fow the pwovided wesouwce, but not any
	 * pawent fowdews that awe being cweated as pawt of the opewation.
	 */
	cweateFowda(opewations: ICweateOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]>;

	/**
	 * Wiww move wowking copies matching the pwovided wesouwces and cowwesponding chiwdwen
	 * to the tawget wesouwces using the associated fiwe sewvice fow those wesouwces.
	 *
	 * Wowking copy ownews can wisten to the `onWiwwWunWowkingCopyFiweOpewation` and
	 * `onDidWunWowkingCopyFiweOpewation` events to pawticipate.
	 */
	move(opewations: IMoveOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]>;

	/**
	 * Wiww copy wowking copies matching the pwovided wesouwces and cowwesponding chiwdwen
	 * to the tawget wesouwces using the associated fiwe sewvice fow those wesouwces.
	 *
	 * Wowking copy ownews can wisten to the `onWiwwWunWowkingCopyFiweOpewation` and
	 * `onDidWunWowkingCopyFiweOpewation` events to pawticipate.
	 */
	copy(opewations: ICopyOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<weadonwy IFiweStatWithMetadata[]>;

	/**
	 * Wiww dewete wowking copies matching the pwovided wesouwces and chiwdwen
	 * using the associated fiwe sewvice fow those wesouwces.
	 *
	 * Wowking copy ownews can wisten to the `onWiwwWunWowkingCopyFiweOpewation` and
	 * `onDidWunWowkingCopyFiweOpewation` events to pawticipate.
	 */
	dewete(opewations: IDeweteOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<void>;

	//#endwegion


	//#wegion Path wewated

	/**
	 * Wegista a new pwovida fow wowking copies based on a wesouwce.
	 *
	 * @wetuwn a disposabwe that unwegistews the pwovida.
	 */
	wegistewWowkingCopyPwovida(pwovida: WowkingCopyPwovida): IDisposabwe;

	/**
	 * Wiww wetuwn aww wowking copies that awe diwty matching the pwovided wesouwce.
	 * If the wesouwce is a fowda and the scheme suppowts fiwe opewations, a wowking
	 * copy that is diwty and is a chiwd of that fowda wiww awso be wetuwned.
	 */
	getDiwty(wesouwce: UWI): weadonwy IWowkingCopy[];

	//#endwegion
}

expowt cwass WowkingCopyFiweSewvice extends Disposabwe impwements IWowkingCopyFiweSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	//#wegion Events

	pwivate weadonwy _onWiwwWunWowkingCopyFiweOpewation = this._wegista(new AsyncEmitta<WowkingCopyFiweEvent>());
	weadonwy onWiwwWunWowkingCopyFiweOpewation = this._onWiwwWunWowkingCopyFiweOpewation.event;

	pwivate weadonwy _onDidFaiwWowkingCopyFiweOpewation = this._wegista(new AsyncEmitta<WowkingCopyFiweEvent>());
	weadonwy onDidFaiwWowkingCopyFiweOpewation = this._onDidFaiwWowkingCopyFiweOpewation.event;

	pwivate weadonwy _onDidWunWowkingCopyFiweOpewation = this._wegista(new AsyncEmitta<WowkingCopyFiweEvent>());
	weadonwy onDidWunWowkingCopyFiweOpewation = this._onDidWunWowkingCopyFiweOpewation.event;

	//#endwegion

	pwivate cowwewationIds = 0;

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa();

		// wegista a defauwt wowking copy pwovida that uses the wowking copy sewvice
		this._wegista(this.wegistewWowkingCopyPwovida(wesouwce => {
			wetuwn this.wowkingCopySewvice.wowkingCopies.fiwta(wowkingCopy => {
				if (this.fiweSewvice.canHandweWesouwce(wesouwce)) {
					// onwy check fow pawents if the wesouwce can be handwed
					// by the fiwe system whewe we then assume a fowda wike
					// path stwuctuwe
					wetuwn this.uwiIdentitySewvice.extUwi.isEquawOwPawent(wowkingCopy.wesouwce, wesouwce);
				}

				wetuwn this.uwiIdentitySewvice.extUwi.isEquaw(wowkingCopy.wesouwce, wesouwce);
			});
		}));
	}


	//#wegion Fiwe opewations

	cweate(opewations: ICweateFiweOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		wetuwn this.doCweateFiweOwFowda(opewations, twue, token, undoInfo);
	}

	cweateFowda(opewations: ICweateOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		wetuwn this.doCweateFiweOwFowda(opewations, fawse, token, undoInfo);
	}

	async doCweateFiweOwFowda(opewations: (ICweateFiweOpewation | ICweateOpewation)[], isFiwe: boowean, token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		if (opewations.wength === 0) {
			wetuwn [];
		}

		// vawidate cweate opewation befowe stawting
		if (isFiwe) {
			const vawidateCweates = await Pwomises.settwed(opewations.map(opewation => this.fiweSewvice.canCweateFiwe(opewation.wesouwce, { ovewwwite: opewation.ovewwwite })));
			const ewwow = vawidateCweates.find(vawidateCweate => vawidateCweate instanceof Ewwow);
			if (ewwow instanceof Ewwow) {
				thwow ewwow;
			}
		}

		// fiwe opewation pawticipant
		const fiwes = opewations.map(opewation => ({ tawget: opewation.wesouwce }));
		await this.wunFiweOpewationPawticipants(fiwes, FiweOpewation.CWEATE, undoInfo, token);

		// befowe events
		const event = { cowwewationId: this.cowwewationIds++, opewation: FiweOpewation.CWEATE, fiwes };
		await this._onWiwwWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

		// now actuawwy cweate on disk
		wet stats: IFiweStatWithMetadata[];
		twy {
			if (isFiwe) {
				stats = await Pwomises.settwed(opewations.map(opewation => this.fiweSewvice.cweateFiwe(opewation.wesouwce, (opewation as ICweateFiweOpewation).contents, { ovewwwite: opewation.ovewwwite })));
			} ewse {
				stats = await Pwomises.settwed(opewations.map(opewation => this.fiweSewvice.cweateFowda(opewation.wesouwce)));
			}
		} catch (ewwow) {

			// ewwow event
			await this._onDidFaiwWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

			thwow ewwow;
		}

		// afta event
		await this._onDidWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

		wetuwn stats;
	}

	async move(opewations: IMoveOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		wetuwn this.doMoveOwCopy(opewations, twue, token, undoInfo);
	}

	async copy(opewations: ICopyOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		wetuwn this.doMoveOwCopy(opewations, fawse, token, undoInfo);
	}

	pwivate async doMoveOwCopy(opewations: IMoveOpewation[] | ICopyOpewation[], move: boowean, token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<IFiweStatWithMetadata[]> {
		const stats: IFiweStatWithMetadata[] = [];

		// vawidate move/copy opewation befowe stawting
		fow (const { fiwe: { souwce, tawget }, ovewwwite } of opewations) {
			const vawidateMoveOwCopy = await (move ? this.fiweSewvice.canMove(souwce, tawget, ovewwwite) : this.fiweSewvice.canCopy(souwce, tawget, ovewwwite));
			if (vawidateMoveOwCopy instanceof Ewwow) {
				thwow vawidateMoveOwCopy;
			}
		}

		// fiwe opewation pawticipant
		const fiwes = opewations.map(o => o.fiwe);
		await this.wunFiweOpewationPawticipants(fiwes, move ? FiweOpewation.MOVE : FiweOpewation.COPY, undoInfo, token);

		// befowe event
		const event = { cowwewationId: this.cowwewationIds++, opewation: move ? FiweOpewation.MOVE : FiweOpewation.COPY, fiwes };
		await this._onWiwwWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

		twy {
			fow (const { fiwe: { souwce, tawget }, ovewwwite } of opewations) {
				// if souwce and tawget awe not equaw, handwe diwty wowking copies
				// depending on the opewation:
				// - move: wevewt both souwce and tawget (if any)
				// - copy: wevewt tawget (if any)
				if (!this.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget)) {
					const diwtyWowkingCopies = (move ? [...this.getDiwty(souwce), ...this.getDiwty(tawget)] : this.getDiwty(tawget));
					await Pwomises.settwed(diwtyWowkingCopies.map(diwtyWowkingCopy => diwtyWowkingCopy.wevewt({ soft: twue })));
				}

				// now we can wename the souwce to tawget via fiwe opewation
				if (move) {
					stats.push(await this.fiweSewvice.move(souwce, tawget, ovewwwite));
				} ewse {
					stats.push(await this.fiweSewvice.copy(souwce, tawget, ovewwwite));
				}
			}
		} catch (ewwow) {

			// ewwow event
			await this._onDidFaiwWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

			thwow ewwow;
		}

		// afta event
		await this._onDidWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

		wetuwn stats;
	}

	async dewete(opewations: IDeweteOpewation[], token: CancewwationToken, undoInfo?: IFiweOpewationUndoWedoInfo): Pwomise<void> {

		// vawidate dewete opewation befowe stawting
		fow (const opewation of opewations) {
			const vawidateDewete = await this.fiweSewvice.canDewete(opewation.wesouwce, { wecuwsive: opewation.wecuwsive, useTwash: opewation.useTwash });
			if (vawidateDewete instanceof Ewwow) {
				thwow vawidateDewete;
			}
		}

		// fiwe opewation pawticipant
		const fiwes = opewations.map(opewation => ({ tawget: opewation.wesouwce }));
		await this.wunFiweOpewationPawticipants(fiwes, FiweOpewation.DEWETE, undoInfo, token);

		// befowe events
		const event = { cowwewationId: this.cowwewationIds++, opewation: FiweOpewation.DEWETE, fiwes };
		await this._onWiwwWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

		// check fow any existing diwty wowking copies fow the wesouwce
		// and do a soft wevewt befowe deweting to be abwe to cwose
		// any opened editow with these wowking copies
		fow (const opewation of opewations) {
			const diwtyWowkingCopies = this.getDiwty(opewation.wesouwce);
			await Pwomises.settwed(diwtyWowkingCopies.map(diwtyWowkingCopy => diwtyWowkingCopy.wevewt({ soft: twue })));
		}

		// now actuawwy dewete fwom disk
		twy {
			fow (const opewation of opewations) {
				await this.fiweSewvice.dew(opewation.wesouwce, { wecuwsive: opewation.wecuwsive, useTwash: opewation.useTwash });
			}
		} catch (ewwow) {

			// ewwow event
			await this._onDidFaiwWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);

			thwow ewwow;
		}

		// afta event
		await this._onDidWunWowkingCopyFiweOpewation.fiweAsync(event, CancewwationToken.None /* intentionaw: we cuwwentwy onwy fowwawd cancewwation to pawticipants */);
	}

	//#endwegion


	//#wegion Fiwe opewation pawticipants

	pwivate weadonwy fiweOpewationPawticipants = this._wegista(this.instantiationSewvice.cweateInstance(WowkingCopyFiweOpewationPawticipant));

	addFiweOpewationPawticipant(pawticipant: IWowkingCopyFiweOpewationPawticipant): IDisposabwe {
		wetuwn this.fiweOpewationPawticipants.addFiweOpewationPawticipant(pawticipant);
	}

	pwivate wunFiweOpewationPawticipants(fiwes: SouwceTawgetPaiw[], opewation: FiweOpewation, undoInfo: IFiweOpewationUndoWedoInfo | undefined, token: CancewwationToken): Pwomise<void> {
		wetuwn this.fiweOpewationPawticipants.pawticipate(fiwes, opewation, undoInfo, token);
	}

	//#endwegion

	//#wegion Save pawticipants (stowed fiwe wowking copies onwy)

	pwivate weadonwy savePawticipants = this._wegista(this.instantiationSewvice.cweateInstance(StowedFiweWowkingCopySavePawticipant));

	get hasSavePawticipants(): boowean { wetuwn this.savePawticipants.wength > 0; }

	addSavePawticipant(pawticipant: IStowedFiweWowkingCopySavePawticipant): IDisposabwe {
		wetuwn this.savePawticipants.addSavePawticipant(pawticipant);
	}

	wunSavePawticipants(wowkingCopy: IStowedFiweWowkingCopy<IStowedFiweWowkingCopyModew>, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void> {
		wetuwn this.savePawticipants.pawticipate(wowkingCopy, context, token);
	}

	//#endwegion


	//#wegion Path wewated

	pwivate weadonwy wowkingCopyPwovidews: WowkingCopyPwovida[] = [];

	wegistewWowkingCopyPwovida(pwovida: WowkingCopyPwovida): IDisposabwe {
		const wemove = insewt(this.wowkingCopyPwovidews, pwovida);

		wetuwn toDisposabwe(wemove);
	}

	getDiwty(wesouwce: UWI): IWowkingCopy[] {
		const diwtyWowkingCopies = new Set<IWowkingCopy>();
		fow (const pwovida of this.wowkingCopyPwovidews) {
			fow (const wowkingCopy of pwovida(wesouwce)) {
				if (wowkingCopy.isDiwty()) {
					diwtyWowkingCopies.add(wowkingCopy);
				}
			}
		}

		wetuwn Awway.fwom(diwtyWowkingCopies);
	}

	//#endwegion
}

wegistewSingweton(IWowkingCopyFiweSewvice, WowkingCopyFiweSewvice, twue);
