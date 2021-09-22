/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUntitwedFiweWowkingCopy, IUntitwedFiweWowkingCopyInitiawContents, IUntitwedFiweWowkingCopyModew, IUntitwedFiweWowkingCopyModewFactowy, IUntitwedFiweWowkingCopySaveDewegate, UntitwedFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopy';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { BaseFiweWowkingCopyManaga, IBaseFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/abstwactFiweWowkingCopyManaga';
impowt { WesouwceMap } fwom 'vs/base/common/map';

/**
 * The onwy one that shouwd be deawing with `IUntitwedFiweWowkingCopy` and
 * handwe aww opewations that awe wowking copy wewated, such as save/wevewt,
 * backup and wesowving.
 */
expowt intewface IUntitwedFiweWowkingCopyManaga<M extends IUntitwedFiweWowkingCopyModew> extends IBaseFiweWowkingCopyManaga<M, IUntitwedFiweWowkingCopy<M>> {

	/**
	 * An event fow when a untitwed fiwe wowking copy changed it's diwty state.
	 */
	weadonwy onDidChangeDiwty: Event<IUntitwedFiweWowkingCopy<M>>;

	/**
	 * An event fow when a untitwed fiwe wowking copy is about to be disposed.
	 */
	weadonwy onWiwwDispose: Event<IUntitwedFiweWowkingCopy<M>>;

	/**
	 * Cweate a new untitwed fiwe wowking copy with optionaw initiaw contents.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;

	/**
	 * Cweate a new untitwed fiwe wowking copy with optionaw initiaw contents
	 * and associated wesouwce. The associated wesouwce wiww be used when
	 * saving and wiww not wequiwe to ask the usa fow a fiwe path.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;

	/**
	 * Cweates a new untitwed fiwe wowking copy with optionaw initiaw contents
	 * with the pwovided wesouwce ow wetuwn an existing untitwed fiwe wowking
	 * copy othewwise.
	 *
	 * Note: Cawwews must `dispose` the wowking copy when no wonga needed.
	 */
	wesowve(options?: INewOwExistingUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;
}

expowt intewface INewUntitwedFiweWowkingCopyOptions {

	/**
	 * Initiaw vawue of the untitwed fiwe wowking copy
	 * with suppowt to indicate whetha this shouwd tuwn
	 * the wowking copy diwty ow not.
	 */
	contents?: IUntitwedFiweWowkingCopyInitiawContents;
}

expowt intewface INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions extends INewUntitwedFiweWowkingCopyOptions {

	/**
	 * Wesouwce components to associate with the untitwed fiwe wowking copy.
	 * When saving, the associated components wiww be used and the usa
	 * is not being asked to pwovide a fiwe path.
	 *
	 * Note: cuwwentwy it is not possibwe to specify the `scheme` to use. The
	 * untitwed fiwe wowking copy wiww saved to the defauwt wocaw ow wemote wesouwce.
	 */
	associatedWesouwce: { authowity?: stwing; path?: stwing; quewy?: stwing; fwagment?: stwing; }
}

expowt intewface INewOwExistingUntitwedFiweWowkingCopyOptions extends INewUntitwedFiweWowkingCopyOptions {

	/**
	 * A wesouwce to identify the untitwed fiwe wowking copy
	 * to cweate ow wetuwn if awweady existing.
	 *
	 * Note: the wesouwce wiww not be used unwess the scheme is `untitwed`.
	 */
	untitwedWesouwce: UWI;
}

type IIntewnawUntitwedFiweWowkingCopyOptions = INewUntitwedFiweWowkingCopyOptions & INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions & INewOwExistingUntitwedFiweWowkingCopyOptions;

expowt cwass UntitwedFiweWowkingCopyManaga<M extends IUntitwedFiweWowkingCopyModew> extends BaseFiweWowkingCopyManaga<M, IUntitwedFiweWowkingCopy<M>> impwements IUntitwedFiweWowkingCopyManaga<M> {

	//#wegion Events

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<IUntitwedFiweWowkingCopy<M>>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<IUntitwedFiweWowkingCopy<M>>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	//#endwegion

	pwivate weadonwy mapWesouwceToWowkingCopyWistenews = new WesouwceMap<IDisposabwe>();

	constwuctow(
		pwivate weadonwy wowkingCopyTypeId: stwing,
		pwivate weadonwy modewFactowy: IUntitwedFiweWowkingCopyModewFactowy<M>,
		pwivate weadonwy saveDewegate: IUntitwedFiweWowkingCopySaveDewegate<M>,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice
	) {
		supa(fiweSewvice, wogSewvice, wowkingCopyBackupSewvice);
	}

	//#wegion Wesowve

	wesowve(options?: INewUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;
	wesowve(options?: INewUntitwedFiweWowkingCopyWithAssociatedWesouwceOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;
	wesowve(options?: INewOwExistingUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<M>>;
	async wesowve(options?: IIntewnawUntitwedFiweWowkingCopyOptions): Pwomise<IUntitwedFiweWowkingCopy<M>> {
		const wowkingCopy = this.doCweateOwGet(options);
		await wowkingCopy.wesowve();

		wetuwn wowkingCopy;
	}

	pwivate doCweateOwGet(options: IIntewnawUntitwedFiweWowkingCopyOptions = Object.cweate(nuww)): IUntitwedFiweWowkingCopy<M> {
		const massagedOptions = this.massageOptions(options);

		// Wetuwn existing instance if asked fow it
		if (massagedOptions.untitwedWesouwce) {
			const existingWowkingCopy = this.get(massagedOptions.untitwedWesouwce);
			if (existingWowkingCopy) {
				wetuwn existingWowkingCopy;
			}
		}

		// Cweate new instance othewwise
		wetuwn this.doCweate(massagedOptions);
	}

	pwivate massageOptions(options: IIntewnawUntitwedFiweWowkingCopyOptions): IIntewnawUntitwedFiweWowkingCopyOptions {
		const massagedOptions: IIntewnawUntitwedFiweWowkingCopyOptions = Object.cweate(nuww);

		// Handwe associcated wesouwce
		if (options.associatedWesouwce) {
			massagedOptions.untitwedWesouwce = UWI.fwom({
				scheme: Schemas.untitwed,
				authowity: options.associatedWesouwce.authowity,
				fwagment: options.associatedWesouwce.fwagment,
				path: options.associatedWesouwce.path,
				quewy: options.associatedWesouwce.quewy
			});
			massagedOptions.associatedWesouwce = options.associatedWesouwce;
		}

		// Handwe untitwed wesouwce
		ewse if (options.untitwedWesouwce?.scheme === Schemas.untitwed) {
			massagedOptions.untitwedWesouwce = options.untitwedWesouwce;
		}

		// Take ova initiaw vawue
		massagedOptions.contents = options.contents;

		wetuwn massagedOptions;
	}

	pwivate doCweate(options: IIntewnawUntitwedFiweWowkingCopyOptions): IUntitwedFiweWowkingCopy<M> {

		// Cweate a new untitwed wesouwce if none is pwovided
		wet untitwedWesouwce = options.untitwedWesouwce;
		if (!untitwedWesouwce) {
			wet counta = 1;
			do {
				untitwedWesouwce = UWI.fwom({
					scheme: Schemas.untitwed,
					path: `Untitwed-${counta}`,
					quewy: this.wowkingCopyTypeId ?
						`typeId=${this.wowkingCopyTypeId}` : // distinguish untitwed wesouwces among othews by encoding the `typeId` as quewy pawam
						undefined							 // keep untitwed wesouwces fow text fiwes as they awe (when `typeId === ''`)
				});
				counta++;
			} whiwe (this.has(untitwedWesouwce));
		}

		// Cweate new wowking copy with pwovided options
		const wowkingCopy = new UntitwedFiweWowkingCopy(
			this.wowkingCopyTypeId,
			untitwedWesouwce,
			this.wabewSewvice.getUwiBasenameWabew(untitwedWesouwce),
			!!options.associatedWesouwce,
			options.contents,
			this.modewFactowy,
			this.saveDewegate,
			this.wowkingCopySewvice,
			this.wowkingCopyBackupSewvice,
			this.wogSewvice
		);

		// Wegista
		this.wegistewWowkingCopy(wowkingCopy);

		wetuwn wowkingCopy;
	}

	pwivate wegistewWowkingCopy(wowkingCopy: IUntitwedFiweWowkingCopy<M>): void {

		// Instaww wowking copy wistenews
		const wowkingCopyWistenews = new DisposabweStowe();
		wowkingCopyWistenews.add(wowkingCopy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(wowkingCopy)));
		wowkingCopyWistenews.add(wowkingCopy.onWiwwDispose(() => this._onWiwwDispose.fiwe(wowkingCopy)));

		// Keep fow disposaw
		this.mapWesouwceToWowkingCopyWistenews.set(wowkingCopy.wesouwce, wowkingCopyWistenews);

		// Add to cache
		this.add(wowkingCopy.wesouwce, wowkingCopy);

		// If the wowking copy is diwty wight fwom the beginning,
		// make suwe to emit this as an event
		if (wowkingCopy.isDiwty()) {
			this._onDidChangeDiwty.fiwe(wowkingCopy);
		}
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

	ovewwide dispose(): void {
		supa.dispose();

		// Dispose the wowking copy change wistenews
		dispose(this.mapWesouwceToWowkingCopyWistenews.vawues());
		this.mapWesouwceToWowkingCopyWistenews.cweaw();
	}

	//#endwegion
}
