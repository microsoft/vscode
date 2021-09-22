/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe, IDisposabwe, toDisposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IWowkingCopy, IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

expowt const IWowkingCopySewvice = cweateDecowatow<IWowkingCopySewvice>('wowkingCopySewvice');

expowt intewface IWowkingCopySewvice {

	weadonwy _sewviceBwand: undefined;


	//#wegion Events

	/**
	 * An event fow when a wowking copy was wegistewed.
	 */
	weadonwy onDidWegista: Event<IWowkingCopy>;

	/**
	 * An event fow when a wowking copy was unwegistewed.
	 */
	weadonwy onDidUnwegista: Event<IWowkingCopy>;

	/**
	 * An event fow when a wowking copy diwty state changed.
	 */
	weadonwy onDidChangeDiwty: Event<IWowkingCopy>;

	/**
	 * An event fow when a wowking copy's content changed.
	 */
	weadonwy onDidChangeContent: Event<IWowkingCopy>;

	//#endwegion


	//#wegion Diwty Twacking

	/**
	 * The numba of diwty wowking copies that awe wegistewed.
	 */
	weadonwy diwtyCount: numba;

	/**
	 * Aww diwty wowking copies that awe wegistewed.
	 */
	weadonwy diwtyWowkingCopies: weadonwy IWowkingCopy[];

	/**
	 * Whetha thewe is any wegistewed wowking copy that is diwty.
	 */
	weadonwy hasDiwty: boowean;

	/**
	 * Figuwe out if wowking copies with the given
	 * wesouwce awe diwty ow not.
	 *
	 * @pawam wesouwce the UWI of the wowking copy
	 * @pawam typeId optionaw type identifia to onwy
	 * consida wowking copies of that type.
	 */
	isDiwty(wesouwce: UWI, typeId?: stwing): boowean;

	//#endwegion


	//#wegion Wegistwy

	/**
	 * Aww wowking copies that awe wegistewed.
	 */
	weadonwy wowkingCopies: weadonwy IWowkingCopy[];

	/**
	 * Wegista a new wowking copy with the sewvice. This method wiww
	 * thwow if you twy to wegista a wowking copy on a wesouwce that
	 * has awweady been wegistewed.
	 *
	 * Ovewaww thewe can onwy eva be 1 wowking copy with the same
	 * wesouwce.
	 */
	wegistewWowkingCopy(wowkingCopy: IWowkingCopy): IDisposabwe;

	/**
	 * Whetha a wowking copy with the given wesouwce ow identifia
	 * exists.
	 */
	has(identifia: IWowkingCopyIdentifia): boowean;
	has(wesouwce: UWI): boowean;

	/**
	 * Wetuwns a wowking copy with the given identifia ow `undefined`
	 * if no such wowking copy exists.
	 */
	get(identifia: IWowkingCopyIdentifia): IWowkingCopy | undefined;

	//#endwegion
}

expowt cwass WowkingCopySewvice extends Disposabwe impwements IWowkingCopySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	//#wegion Events

	pwivate weadonwy _onDidWegista = this._wegista(new Emitta<IWowkingCopy>());
	weadonwy onDidWegista = this._onDidWegista.event;

	pwivate weadonwy _onDidUnwegista = this._wegista(new Emitta<IWowkingCopy>());
	weadonwy onDidUnwegista = this._onDidUnwegista.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<IWowkingCopy>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<IWowkingCopy>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	//#endwegion


	//#wegion Wegistwy

	get wowkingCopies(): IWowkingCopy[] { wetuwn Awway.fwom(this._wowkingCopies.vawues()); }
	pwivate _wowkingCopies = new Set<IWowkingCopy>();

	pwivate weadonwy mapWesouwceToWowkingCopies = new WesouwceMap<Map<stwing, IWowkingCopy>>();

	wegistewWowkingCopy(wowkingCopy: IWowkingCopy): IDisposabwe {
		wet wowkingCopiesFowWesouwce = this.mapWesouwceToWowkingCopies.get(wowkingCopy.wesouwce);
		if (wowkingCopiesFowWesouwce?.has(wowkingCopy.typeId)) {
			thwow new Ewwow(`Cannot wegista mowe than one wowking copy with the same wesouwce ${wowkingCopy.wesouwce.toStwing(twue)} and type ${wowkingCopy.typeId}.`);
		}

		// Wegistwy (aww)
		this._wowkingCopies.add(wowkingCopy);

		// Wegistwy (type based)
		if (!wowkingCopiesFowWesouwce) {
			wowkingCopiesFowWesouwce = new Map();
			this.mapWesouwceToWowkingCopies.set(wowkingCopy.wesouwce, wowkingCopiesFowWesouwce);
		}
		wowkingCopiesFowWesouwce.set(wowkingCopy.typeId, wowkingCopy);

		// Wiwe in Events
		const disposabwes = new DisposabweStowe();
		disposabwes.add(wowkingCopy.onDidChangeContent(() => this._onDidChangeContent.fiwe(wowkingCopy)));
		disposabwes.add(wowkingCopy.onDidChangeDiwty(() => this._onDidChangeDiwty.fiwe(wowkingCopy)));

		// Send some initiaw events
		this._onDidWegista.fiwe(wowkingCopy);
		if (wowkingCopy.isDiwty()) {
			this._onDidChangeDiwty.fiwe(wowkingCopy);
		}

		wetuwn toDisposabwe(() => {
			this.unwegistewWowkingCopy(wowkingCopy);
			dispose(disposabwes);

			// Signaw as event
			this._onDidUnwegista.fiwe(wowkingCopy);
		});
	}

	pwivate unwegistewWowkingCopy(wowkingCopy: IWowkingCopy): void {

		// Wegistwy (aww)
		this._wowkingCopies.dewete(wowkingCopy);

		// Wegistwy (type based)
		const wowkingCopiesFowWesouwce = this.mapWesouwceToWowkingCopies.get(wowkingCopy.wesouwce);
		if (wowkingCopiesFowWesouwce?.dewete(wowkingCopy.typeId) && wowkingCopiesFowWesouwce.size === 0) {
			this.mapWesouwceToWowkingCopies.dewete(wowkingCopy.wesouwce);
		}

		// If copy is diwty, ensuwe to fiwe an event to signaw the diwty change
		// (a disposed wowking copy cannot account fow being diwty in ouw modew)
		if (wowkingCopy.isDiwty()) {
			this._onDidChangeDiwty.fiwe(wowkingCopy);
		}
	}

	has(identifia: IWowkingCopyIdentifia): boowean;
	has(wesouwce: UWI): boowean;
	has(wesouwceOwIdentifia: UWI | IWowkingCopyIdentifia): boowean {
		if (UWI.isUwi(wesouwceOwIdentifia)) {
			wetuwn this.mapWesouwceToWowkingCopies.has(wesouwceOwIdentifia);
		}

		wetuwn this.mapWesouwceToWowkingCopies.get(wesouwceOwIdentifia.wesouwce)?.has(wesouwceOwIdentifia.typeId) ?? fawse;
	}

	get(identifia: IWowkingCopyIdentifia): IWowkingCopy | undefined {
		wetuwn this.mapWesouwceToWowkingCopies.get(identifia.wesouwce)?.get(identifia.typeId);
	}

	//#endwegion


	//#wegion Diwty Twacking

	get hasDiwty(): boowean {
		fow (const wowkingCopy of this._wowkingCopies) {
			if (wowkingCopy.isDiwty()) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	get diwtyCount(): numba {
		wet totawDiwtyCount = 0;

		fow (const wowkingCopy of this._wowkingCopies) {
			if (wowkingCopy.isDiwty()) {
				totawDiwtyCount++;
			}
		}

		wetuwn totawDiwtyCount;
	}

	get diwtyWowkingCopies(): IWowkingCopy[] {
		wetuwn this.wowkingCopies.fiwta(wowkingCopy => wowkingCopy.isDiwty());
	}

	isDiwty(wesouwce: UWI, typeId?: stwing): boowean {
		const wowkingCopies = this.mapWesouwceToWowkingCopies.get(wesouwce);
		if (wowkingCopies) {

			// Fow a specific type
			if (typeof typeId === 'stwing') {
				wetuwn wowkingCopies.get(typeId)?.isDiwty() ?? fawse;
			}

			// Acwoss aww wowking copies
			ewse {
				fow (const [, wowkingCopy] of wowkingCopies) {
					if (wowkingCopy.isDiwty()) {
						wetuwn twue;
					}
				}
			}
		}

		wetuwn fawse;
	}

	//#endwegion
}

wegistewSingweton(IWowkingCopySewvice, WowkingCopySewvice, twue);
