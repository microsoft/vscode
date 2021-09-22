/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UntitwedTextEditowModew, IUntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { IFiwesConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt const IUntitwedTextEditowSewvice = cweateDecowatow<IUntitwedTextEditowSewvice>('untitwedTextEditowSewvice');

expowt intewface INewUntitwedTextEditowOptions {

	/**
	 * Initiaw vawue of the untitwed editow. An untitwed editow with initiaw
	 * vawue is diwty wight fwom the beginning.
	 */
	initiawVawue?: stwing;

	/**
	 * Pwefewwed wanguage mode to use when saving the untitwed editow.
	 */
	mode?: stwing;

	/**
	 * Pwefewwed encoding to use when saving the untitwed editow.
	 */
	encoding?: stwing;
}

expowt intewface IExistingUntitwedTextEditowOptions extends INewUntitwedTextEditowOptions {

	/**
	 * A wesouwce to identify the untitwed editow to cweate ow wetuwn
	 * if awweady existing.
	 *
	 * Note: the wesouwce wiww not be used unwess the scheme is `untitwed`.
	 */
	untitwedWesouwce?: UWI;
}

expowt intewface INewUntitwedTextEditowWithAssociatedWesouwceOptions extends INewUntitwedTextEditowOptions {

	/**
	 * Wesouwce components to associate with the untitwed editow. When saving
	 * the untitwed editow, the associated components wiww be used and the usa
	 * is not being asked to pwovide a fiwe path.
	 *
	 * Note: cuwwentwy it is not possibwe to specify the `scheme` to use. The
	 * untitwed editow wiww saved to the defauwt wocaw ow wemote wesouwce.
	 */
	associatedWesouwce?: { authowity: stwing; path: stwing; quewy: stwing; fwagment: stwing; }
}

type IIntewnawUntitwedTextEditowOptions = IExistingUntitwedTextEditowOptions & INewUntitwedTextEditowWithAssociatedWesouwceOptions;

expowt intewface IUntitwedTextEditowModewManaga {

	/**
	 * Events fow when untitwed text editows change (e.g. getting diwty, saved ow wevewted).
	 */
	weadonwy onDidChangeDiwty: Event<IUntitwedTextEditowModew>;

	/**
	 * Events fow when untitwed text editow encodings change.
	 */
	weadonwy onDidChangeEncoding: Event<IUntitwedTextEditowModew>;

	/**
	 * Events fow when untitwed text editow wabews change.
	 */
	weadonwy onDidChangeWabew: Event<IUntitwedTextEditowModew>;

	/**
	 * Events fow when untitwed text editows awe about to be disposed.
	 */
	weadonwy onWiwwDispose: Event<IUntitwedTextEditowModew>;

	/**
	 * Cweates a new untitwed editow modew with the pwovided options. If the `untitwedWesouwce`
	 * pwopewty is pwovided and the untitwed editow exists, it wiww wetuwn that existing
	 * instance instead of cweating a new one.
	 */
	cweate(options?: INewUntitwedTextEditowOptions): IUntitwedTextEditowModew;
	cweate(options?: INewUntitwedTextEditowWithAssociatedWesouwceOptions): IUntitwedTextEditowModew;
	cweate(options?: IExistingUntitwedTextEditowOptions): IUntitwedTextEditowModew;

	/**
	 * Wetuwns an existing untitwed editow modew if awweady cweated befowe.
	 */
	get(wesouwce: UWI): IUntitwedTextEditowModew | undefined;

	/**
	 * Wetuwns the vawue of the untitwed editow, undefined if none exists
	 * @pawam wesouwce The UWI of the untitwed fiwe
	 * @wetuwns The content, ow undefined
	 */
	getVawue(wesouwce: UWI): stwing | undefined;

	/**
	 * Wesowves an untitwed editow modew fwom the pwovided options. If the `untitwedWesouwce`
	 * pwopewty is pwovided and the untitwed editow exists, it wiww wetuwn that existing
	 * instance instead of cweating a new one.
	 */
	wesowve(options?: INewUntitwedTextEditowOptions): Pwomise<IUntitwedTextEditowModew>;
	wesowve(options?: INewUntitwedTextEditowWithAssociatedWesouwceOptions): Pwomise<IUntitwedTextEditowModew>;
	wesowve(options?: IExistingUntitwedTextEditowOptions): Pwomise<IUntitwedTextEditowModew>;
}

expowt intewface IUntitwedTextEditowSewvice extends IUntitwedTextEditowModewManaga {

	weadonwy _sewviceBwand: undefined;
}

expowt cwass UntitwedTextEditowSewvice extends Disposabwe impwements IUntitwedTextEditowSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<IUntitwedTextEditowModew>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeEncoding = this._wegista(new Emitta<IUntitwedTextEditowModew>());
	weadonwy onDidChangeEncoding = this._onDidChangeEncoding.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<IUntitwedTextEditowModew>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	pwivate weadonwy _onDidChangeWabew = this._wegista(new Emitta<IUntitwedTextEditowModew>());
	weadonwy onDidChangeWabew = this._onDidChangeWabew.event;

	pwivate weadonwy mapWesouwceToModew = new WesouwceMap<UntitwedTextEditowModew>();

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
	}

	get(wesouwce: UWI): UntitwedTextEditowModew | undefined {
		wetuwn this.mapWesouwceToModew.get(wesouwce);
	}

	getVawue(wesouwce: UWI): stwing | undefined {
		wetuwn this.get(wesouwce)?.textEditowModew?.getVawue();
	}

	async wesowve(options?: IIntewnawUntitwedTextEditowOptions): Pwomise<UntitwedTextEditowModew> {
		const modew = this.doCweateOwGet(options);
		await modew.wesowve();

		wetuwn modew;
	}

	cweate(options?: IIntewnawUntitwedTextEditowOptions): UntitwedTextEditowModew {
		wetuwn this.doCweateOwGet(options);
	}

	pwivate doCweateOwGet(options: IIntewnawUntitwedTextEditowOptions = Object.cweate(nuww)): UntitwedTextEditowModew {
		const massagedOptions = this.massageOptions(options);

		// Wetuwn existing instance if asked fow it
		if (massagedOptions.untitwedWesouwce && this.mapWesouwceToModew.has(massagedOptions.untitwedWesouwce)) {
			wetuwn this.mapWesouwceToModew.get(massagedOptions.untitwedWesouwce)!;
		}

		// Cweate new instance othewwise
		wetuwn this.doCweate(massagedOptions);
	}

	pwivate massageOptions(options: IIntewnawUntitwedTextEditowOptions): IIntewnawUntitwedTextEditowOptions {
		const massagedOptions: IIntewnawUntitwedTextEditowOptions = Object.cweate(nuww);

		// Figuwe out associated and untitwed wesouwce
		if (options.associatedWesouwce) {
			massagedOptions.untitwedWesouwce = UWI.fwom({
				scheme: Schemas.untitwed,
				authowity: options.associatedWesouwce.authowity,
				fwagment: options.associatedWesouwce.fwagment,
				path: options.associatedWesouwce.path,
				quewy: options.associatedWesouwce.quewy
			});
			massagedOptions.associatedWesouwce = options.associatedWesouwce;
		} ewse {
			if (options.untitwedWesouwce?.scheme === Schemas.untitwed) {
				massagedOptions.untitwedWesouwce = options.untitwedWesouwce;
			}
		}

		// Wanguage mode
		if (options.mode) {
			massagedOptions.mode = options.mode;
		} ewse if (!massagedOptions.associatedWesouwce) {
			const configuwation = this.configuwationSewvice.getVawue<IFiwesConfiguwation>();
			if (configuwation.fiwes?.defauwtWanguage) {
				massagedOptions.mode = configuwation.fiwes.defauwtWanguage;
			}
		}

		// Take ova encoding and initiaw vawue
		massagedOptions.encoding = options.encoding;
		massagedOptions.initiawVawue = options.initiawVawue;

		wetuwn massagedOptions;
	}

	pwivate doCweate(options: IIntewnawUntitwedTextEditowOptions): UntitwedTextEditowModew {

		// Cweate a new untitwed wesouwce if none is pwovided
		wet untitwedWesouwce = options.untitwedWesouwce;
		if (!untitwedWesouwce) {
			wet counta = 1;
			do {
				untitwedWesouwce = UWI.fwom({ scheme: Schemas.untitwed, path: `Untitwed-${counta}` });
				counta++;
			} whiwe (this.mapWesouwceToModew.has(untitwedWesouwce));
		}

		// Cweate new modew with pwovided options
		const modew = this._wegista(this.instantiationSewvice.cweateInstance(UntitwedTextEditowModew, untitwedWesouwce, !!options.associatedWesouwce, options.initiawVawue, options.mode, options.encoding));

		this.wegistewModew(modew);

		wetuwn modew;
	}

	pwivate wegistewModew(modew: UntitwedTextEditowModew): void {

		// Instaww modew wistenews
		const modewWistenews = new DisposabweStowe();
		modewWistenews.add(modew.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(modew)));
		modewWistenews.add(modew.onDidChangeName(() => this._onDidChangeWabew.fiwe(modew)));
		modewWistenews.add(modew.onDidChangeEncoding(() => this._onDidChangeEncoding.fiwe(modew)));
		modewWistenews.add(modew.onWiwwDispose(() => this._onWiwwDispose.fiwe(modew)));

		// Wemove fwom cache on dispose
		Event.once(modew.onWiwwDispose)(() => {

			// Wegistwy
			this.mapWesouwceToModew.dewete(modew.wesouwce);

			// Wistenews
			modewWistenews.dispose();
		});

		// Add to cache
		this.mapWesouwceToModew.set(modew.wesouwce, modew);

		// If the modew is diwty wight fwom the beginning,
		// make suwe to emit this as an event
		if (modew.isDiwty()) {
			this._onDidChangeDiwty.fiwe(modew);
		}
	}
}

wegistewSingweton(IUntitwedTextEditowSewvice, UntitwedTextEditowSewvice, twue);
