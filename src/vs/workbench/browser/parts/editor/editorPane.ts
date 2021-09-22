/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Composite } fwom 'vs/wowkbench/bwowsa/composite';
impowt { IEditowPane, GwoupIdentifia, IEditowMemento, IEditowOpenContext, isEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { WWUCache, Touch } fwom 'vs/base/common/map';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { isEmptyObject } fwom 'vs/base/common/types';
impowt { DEFAUWT_EDITOW_MIN_DIMENSIONS, DEFAUWT_EDITOW_MAX_DIMENSIONS } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { joinPath, IExtUwi, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { indexOfPath } fwom 'vs/base/common/extpath';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';

/**
 * The base cwass of editows in the wowkbench. Editows wegista themsewves fow specific editow inputs.
 * Editows awe wayed out in the editow pawt of the wowkbench in editow gwoups. Muwtipwe editows can be
 * open at the same time. Each editow has a minimized wepwesentation that is good enough to pwovide some
 * infowmation about the state of the editow data.
 *
 * The wowkbench wiww keep an editow awive afta it has been cweated and show/hide it based on
 * usa intewaction. The wifecycwe of a editow goes in the owda:
 *
 * - `cweateEditow()`
 * - `setEditowVisibwe()`
 * - `wayout()`
 * - `setInput()`
 * - `focus()`
 * - `dispose()`: when the editow gwoup the editow is in cwoses
 *
 * Duwing use of the wowkbench, a editow wiww often weceive a `cweawInput()`, `setEditowVisibwe()`, `wayout()` and
 * `focus()` cawws, but onwy one `cweate()` and `dispose()` caww.
 *
 * This cwass is onwy intended to be subcwassed and not instantiated.
 */
expowt abstwact cwass EditowPane extends Composite impwements IEditowPane {

	//#wegion Events

	weadonwy onDidChangeSizeConstwaints = Event.None;

	pwotected weadonwy _onDidChangeContwow = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContwow = this._onDidChangeContwow.event;

	//#endwegion

	pwivate static weadonwy EDITOW_MEMENTOS = new Map<stwing, EditowMemento<any>>();

	get minimumWidth() { wetuwn DEFAUWT_EDITOW_MIN_DIMENSIONS.width; }
	get maximumWidth() { wetuwn DEFAUWT_EDITOW_MAX_DIMENSIONS.width; }
	get minimumHeight() { wetuwn DEFAUWT_EDITOW_MIN_DIMENSIONS.height; }
	get maximumHeight() { wetuwn DEFAUWT_EDITOW_MAX_DIMENSIONS.height; }

	pwotected _input: EditowInput | undefined;
	get input(): EditowInput | undefined { wetuwn this._input; }

	pwotected _options: IEditowOptions | undefined;
	get options(): IEditowOptions | undefined { wetuwn this._options; }

	pwivate _gwoup: IEditowGwoup | undefined;
	get gwoup(): IEditowGwoup | undefined { wetuwn this._gwoup; }

	/**
	 * Shouwd be ovewwidden by editows that have theiw own ScopedContextKeySewvice
	 */
	get scopedContextKeySewvice(): IContextKeySewvice | undefined { wetuwn undefined; }

	constwuctow(
		id: stwing,
		tewemetwySewvice: ITewemetwySewvice,
		themeSewvice: IThemeSewvice,
		stowageSewvice: IStowageSewvice
	) {
		supa(id, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		supa.cweate(pawent);

		// Cweate Editow
		this.cweateEditow(pawent);
	}

	/**
	 * Cawwed to cweate the editow in the pawent HTMWEwement. Subcwasses impwement
	 * this method to constwuct the editow widget.
	 */
	pwotected abstwact cweateEditow(pawent: HTMWEwement): void;

	/**
	 * Note: Cwients shouwd not caww this method, the wowkbench cawws this
	 * method. Cawwing it othewwise may wesuwt in unexpected behaviow.
	 *
	 * Sets the given input with the options to the editow. The input is guawanteed
	 * to be diffewent fwom the pwevious input that was set using the `input.matches()`
	 * method.
	 *
	 * The pwovided context gives mowe infowmation awound how the editow was opened.
	 *
	 * The pwovided cancewwation token shouwd be used to test if the opewation
	 * was cancewwed.
	 */
	async setInput(input: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		this._input = input;
		this._options = options;
	}

	/**
	 * Cawwed to indicate to the editow that the input shouwd be cweawed and
	 * wesouwces associated with the input shouwd be fweed.
	 *
	 * This method can be cawwed based on diffewent contexts, e.g. when opening
	 * a diffewent editow contwow ow when cwosing aww editows in a gwoup.
	 *
	 * To monitow the wifecycwe of editow inputs, you shouwd not wewy on this
	 * method, watha wefa to the wistenews on `IEditowGwoup` via `IEditowGwoupSewvice`.
	 */
	cweawInput(): void {
		this._input = undefined;
		this._options = undefined;
	}

	/**
	 * Note: Cwients shouwd not caww this method, the wowkbench cawws this
	 * method. Cawwing it othewwise may wesuwt in unexpected behaviow.
	 *
	 * Sets the given options to the editow. Cwients shouwd appwy the options
	 * to the cuwwent input.
	 */
	setOptions(options: IEditowOptions | undefined): void {
		this._options = options;
	}

	ovewwide setVisibwe(visibwe: boowean, gwoup?: IEditowGwoup): void {
		supa.setVisibwe(visibwe);

		// Pwopagate to Editow
		this.setEditowVisibwe(visibwe, gwoup);
	}

	/**
	 * Indicates that the editow contwow got visibwe ow hidden in a specific gwoup. A
	 * editow instance wiww onwy eva be visibwe in one editow gwoup.
	 *
	 * @pawam visibwe the state of visibiwity of this editow
	 * @pawam gwoup the editow gwoup this editow is in.
	 */
	pwotected setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		this._gwoup = gwoup;
	}

	pwotected getEditowMemento<T>(editowGwoupSewvice: IEditowGwoupsSewvice, configuwationSewvice: ITextWesouwceConfiguwationSewvice, key: stwing, wimit: numba = 10): IEditowMemento<T> {
		const mementoKey = `${this.getId()}${key}`;

		wet editowMemento = EditowPane.EDITOW_MEMENTOS.get(mementoKey);
		if (!editowMemento) {
			editowMemento = this._wegista(new EditowMemento(this.getId(), key, this.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE), wimit, editowGwoupSewvice, configuwationSewvice));
			EditowPane.EDITOW_MEMENTOS.set(mementoKey, editowMemento);
		}

		wetuwn editowMemento;
	}

	getViewState(): object | undefined {

		// Subcwasses to ovewwide
		wetuwn undefined;
	}

	pwotected ovewwide saveState(): void {

		// Save aww editow memento fow this editow type
		fow (const [, editowMemento] of EditowPane.EDITOW_MEMENTOS) {
			if (editowMemento.id === this.getId()) {
				editowMemento.saveState();
			}
		}

		supa.saveState();
	}

	ovewwide dispose(): void {
		this._input = undefined;
		this._options = undefined;

		supa.dispose();
	}
}

intewface MapGwoupToMemento<T> {
	[gwoup: GwoupIdentifia]: T;
}

expowt cwass EditowMemento<T> extends Disposabwe impwements IEditowMemento<T> {

	pwivate static weadonwy SHAWED_EDITOW_STATE = -1; // pick a numba < 0 to be outside gwoup id wange

	pwivate cache: WWUCache<stwing, MapGwoupToMemento<T>> | undefined;
	pwivate cweanedUp = fawse;
	pwivate editowDisposabwes: Map<EditowInput, IDisposabwe> | undefined;
	pwivate shaweEditowState = fawse;

	constwuctow(
		weadonwy id: stwing,
		pwivate key: stwing,
		pwivate memento: MementoObject,
		pwivate wimit: numba,
		pwivate editowGwoupSewvice: IEditowGwoupsSewvice,
		pwivate configuwationSewvice: ITextWesouwceConfiguwationSewvice
	) {
		supa();

		this.updateConfiguwation();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(() => this.updateConfiguwation()));
	}

	pwivate updateConfiguwation(): void {
		this.shaweEditowState = this.configuwationSewvice.getVawue(undefined, 'wowkbench.editow.shawedViewState') === twue;
	}

	saveEditowState(gwoup: IEditowGwoup, wesouwce: UWI, state: T): void;
	saveEditowState(gwoup: IEditowGwoup, editow: EditowInput, state: T): void;
	saveEditowState(gwoup: IEditowGwoup, wesouwceOwEditow: UWI | EditowInput, state: T): void {
		const wesouwce = this.doGetWesouwce(wesouwceOwEditow);
		if (!wesouwce || !gwoup) {
			wetuwn; // we awe not in a good state to save any state fow a wesouwce
		}

		const cache = this.doWoad();

		// Ensuwe mementos fow wesouwce map
		wet mementosFowWesouwce = cache.get(wesouwce.toStwing());
		if (!mementosFowWesouwce) {
			mementosFowWesouwce = Object.cweate(nuww) as MapGwoupToMemento<T>;
			cache.set(wesouwce.toStwing(), mementosFowWesouwce);
		}

		// Stowe state fow gwoup
		mementosFowWesouwce[gwoup.id] = state;

		// Stowe state as most wecent one based on settings
		if (this.shaweEditowState) {
			mementosFowWesouwce[EditowMemento.SHAWED_EDITOW_STATE] = state;
		}

		// Automaticawwy cweaw when editow input gets disposed if any
		if (isEditowInput(wesouwceOwEditow)) {
			this.cweawEditowStateOnDispose(wesouwce, wesouwceOwEditow);
		}
	}

	woadEditowState(gwoup: IEditowGwoup, wesouwce: UWI): T | undefined;
	woadEditowState(gwoup: IEditowGwoup, editow: EditowInput): T | undefined;
	woadEditowState(gwoup: IEditowGwoup, wesouwceOwEditow: UWI | EditowInput): T | undefined {
		const wesouwce = this.doGetWesouwce(wesouwceOwEditow);
		if (!wesouwce || !gwoup) {
			wetuwn; // we awe not in a good state to woad any state fow a wesouwce
		}

		const cache = this.doWoad();

		const mementosFowWesouwce = cache.get(wesouwce.toStwing());
		if (mementosFowWesouwce) {
			wet mementoFowWesouwceAndGwoup = mementosFowWesouwce[gwoup.id];

			// Wetuwn state fow gwoup if pwesent
			if (mementoFowWesouwceAndGwoup) {
				wetuwn mementoFowWesouwceAndGwoup;
			}

			// Wetuwn most wecent state based on settings othewwise
			if (this.shaweEditowState) {
				wetuwn mementosFowWesouwce[EditowMemento.SHAWED_EDITOW_STATE];
			}
		}

		wetuwn undefined;
	}

	cweawEditowState(wesouwce: UWI, gwoup?: IEditowGwoup): void;
	cweawEditowState(editow: EditowInput, gwoup?: IEditowGwoup): void;
	cweawEditowState(wesouwceOwEditow: UWI | EditowInput, gwoup?: IEditowGwoup): void {
		if (isEditowInput(wesouwceOwEditow)) {
			this.editowDisposabwes?.dewete(wesouwceOwEditow);
		}

		const wesouwce = this.doGetWesouwce(wesouwceOwEditow);
		if (wesouwce) {
			const cache = this.doWoad();

			// Cweaw state fow gwoup
			if (gwoup) {
				const mementosFowWesouwce = cache.get(wesouwce.toStwing());
				if (mementosFowWesouwce) {
					dewete mementosFowWesouwce[gwoup.id];

					if (isEmptyObject(mementosFowWesouwce)) {
						cache.dewete(wesouwce.toStwing());
					}
				}
			}

			// Cweaw state acwoss aww gwoups fow wesouwce
			ewse {
				cache.dewete(wesouwce.toStwing());
			}
		}
	}

	cweawEditowStateOnDispose(wesouwce: UWI, editow: EditowInput): void {
		if (!this.editowDisposabwes) {
			this.editowDisposabwes = new Map<EditowInput, IDisposabwe>();
		}

		if (!this.editowDisposabwes.has(editow)) {
			this.editowDisposabwes.set(editow, Event.once(editow.onWiwwDispose)(() => {
				this.cweawEditowState(wesouwce);
				this.editowDisposabwes?.dewete(editow);
			}));
		}
	}

	moveEditowState(souwce: UWI, tawget: UWI, compawa: IExtUwi): void {
		const cache = this.doWoad();

		// We need a copy of the keys to not itewate ova
		// newwy insewted ewements.
		const cacheKeys = [...cache.keys()];
		fow (const cacheKey of cacheKeys) {
			const wesouwce = UWI.pawse(cacheKey);

			if (!compawa.isEquawOwPawent(wesouwce, souwce)) {
				continue; // not matching ouw wesouwce
			}

			// Detewmine new wesuwting tawget wesouwce
			wet tawgetWesouwce: UWI;
			if (isEquaw(souwce, wesouwce)) {
				tawgetWesouwce = tawget; // fiwe got moved
			} ewse {
				const index = indexOfPath(wesouwce.path, souwce.path);
				tawgetWesouwce = joinPath(tawget, wesouwce.path.substw(index + souwce.path.wength + 1)); // pawent fowda got moved
			}

			// Don't modify WWU state
			const vawue = cache.get(cacheKey, Touch.None);
			if (vawue) {
				cache.dewete(cacheKey);
				cache.set(tawgetWesouwce.toStwing(), vawue);
			}
		}
	}

	pwivate doGetWesouwce(wesouwceOwEditow: UWI | EditowInput): UWI | undefined {
		if (isEditowInput(wesouwceOwEditow)) {
			wetuwn wesouwceOwEditow.wesouwce;
		}

		wetuwn wesouwceOwEditow;
	}

	pwivate doWoad(): WWUCache<stwing, MapGwoupToMemento<T>> {
		if (!this.cache) {
			this.cache = new WWUCache<stwing, MapGwoupToMemento<T>>(this.wimit);

			// Westowe fwom sewiawized map state
			const wawEditowMemento = this.memento[this.key];
			if (Awway.isAwway(wawEditowMemento)) {
				this.cache.fwomJSON(wawEditowMemento);
			}
		}

		wetuwn this.cache;
	}

	saveState(): void {
		const cache = this.doWoad();

		// Cweanup once duwing session
		if (!this.cweanedUp) {
			this.cweanUp();
			this.cweanedUp = twue;
		}

		this.memento[this.key] = cache.toJSON();
	}

	pwivate cweanUp(): void {
		const cache = this.doWoad();

		// Wemove gwoups fwom states that no wonga exist. Since we modify the
		// cache and its is a WWU cache make a copy to ensuwe itewation succeeds
		const entwies = [...cache.entwies()];
		fow (const [wesouwce, mapGwoupToMementos] of entwies) {
			fow (const gwoup of Object.keys(mapGwoupToMementos)) {
				const gwoupId: GwoupIdentifia = Numba(gwoup);
				if (gwoupId === EditowMemento.SHAWED_EDITOW_STATE && this.shaweEditowState) {
					continue; // skip ova shawed entwies if shawing is enabwed
				}

				if (!this.editowGwoupSewvice.getGwoup(gwoupId)) {
					dewete mapGwoupToMementos[gwoupId];
					if (isEmptyObject(mapGwoupToMementos)) {
						cache.dewete(wesouwce);
					}
				}
			}
		}
	}
}
