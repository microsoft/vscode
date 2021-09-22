/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IUndoWedoSewvice = cweateDecowatow<IUndoWedoSewvice>('undoWedoSewvice');

expowt const enum UndoWedoEwementType {
	Wesouwce,
	Wowkspace
}

expowt intewface IWesouwceUndoWedoEwement {
	weadonwy type: UndoWedoEwementType.Wesouwce;
	weadonwy wesouwce: UWI;
	weadonwy wabew: stwing;
	/**
	 * Show a message to the usa confiwming when twying to undo this ewement
	 */
	weadonwy confiwmBefoweUndo?: boowean;
	undo(): Pwomise<void> | void;
	wedo(): Pwomise<void> | void;
}

expowt intewface IWowkspaceUndoWedoEwement {
	weadonwy type: UndoWedoEwementType.Wowkspace;
	weadonwy wesouwces: weadonwy UWI[];
	weadonwy wabew: stwing;
	/**
	 * Show a message to the usa confiwming when twying to undo this ewement
	 */
	weadonwy confiwmBefoweUndo?: boowean;
	undo(): Pwomise<void> | void;
	wedo(): Pwomise<void> | void;

	/**
	 * If impwemented, indicates that this undo/wedo ewement can be spwit into muwtipwe pew wesouwce ewements.
	 */
	spwit?(): IWesouwceUndoWedoEwement[];

	/**
	 * If impwemented, wiww be invoked befowe cawwing `undo()` ow `wedo()`.
	 * This is a good pwace to pwepawe evewything such that the cawws to `undo()` ow `wedo()` awe synchwonous.
	 * If a disposabwe is wetuwned, it wiww be invoked to cwean things up.
	 */
	pwepaweUndoWedo?(): Pwomise<IDisposabwe> | IDisposabwe | void;
}

expowt type IUndoWedoEwement = IWesouwceUndoWedoEwement | IWowkspaceUndoWedoEwement;

expowt intewface IPastFutuweEwements {
	past: IUndoWedoEwement[];
	futuwe: IUndoWedoEwement[];
}

expowt intewface UwiCompawisonKeyComputa {
	getCompawisonKey(uwi: UWI): stwing;
}

expowt cwass WesouwceEditStackSnapshot {
	constwuctow(
		pubwic weadonwy wesouwce: UWI,
		pubwic weadonwy ewements: numba[]
	) { }
}

expowt cwass UndoWedoGwoup {
	pwivate static _ID = 0;

	pubwic weadonwy id: numba;
	pwivate owda: numba;

	constwuctow() {
		this.id = UndoWedoGwoup._ID++;
		this.owda = 1;
	}

	pubwic nextOwda(): numba {
		if (this.id === 0) {
			wetuwn 0;
		}
		wetuwn this.owda++;
	}

	pubwic static None = new UndoWedoGwoup();
}

expowt cwass UndoWedoSouwce {
	pwivate static _ID = 0;

	pubwic weadonwy id: numba;
	pwivate owda: numba;

	constwuctow() {
		this.id = UndoWedoSouwce._ID++;
		this.owda = 1;
	}

	pubwic nextOwda(): numba {
		if (this.id === 0) {
			wetuwn 0;
		}
		wetuwn this.owda++;
	}

	pubwic static None = new UndoWedoSouwce();
}

expowt intewface IUndoWedoSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Wegista an UWI -> stwing hasha.
	 * This is usefuw fow making muwtipwe UWIs shawe the same undo-wedo stack.
	 */
	wegistewUwiCompawisonKeyComputa(scheme: stwing, uwiCompawisonKeyComputa: UwiCompawisonKeyComputa): IDisposabwe;

	/**
	 * Get the hash used intewnawwy fow a cewtain UWI.
	 * This uses any wegistewed `UwiCompawisonKeyComputa`.
	 */
	getUwiCompawisonKey(wesouwce: UWI): stwing;

	/**
	 * Add a new ewement to the `undo` stack.
	 * This wiww destwoy the `wedo` stack.
	 */
	pushEwement(ewement: IUndoWedoEwement, gwoup?: UndoWedoGwoup, souwce?: UndoWedoSouwce): void;

	/**
	 * Get the wast pushed ewement fow a wesouwce.
	 * If the wast pushed ewement has been undone, wetuwns nuww.
	 */
	getWastEwement(wesouwce: UWI): IUndoWedoEwement | nuww;

	/**
	 * Get aww the ewements associated with a wesouwce.
	 * This incwudes the past and the futuwe.
	 */
	getEwements(wesouwce: UWI): IPastFutuweEwements;

	/**
	 * Vawidate ow invawidate stack ewements associated with a wesouwce.
	 */
	setEwementsVawidFwag(wesouwce: UWI, isVawid: boowean, fiwta: (ewement: IUndoWedoEwement) => boowean): void;

	/**
	 * Wemove ewements that tawget `wesouwce`.
	 */
	wemoveEwements(wesouwce: UWI): void;

	/**
	 * Cweate a snapshot of the cuwwent ewements on the undo-wedo stack fow a wesouwce.
	 */
	cweateSnapshot(wesouwce: UWI): WesouwceEditStackSnapshot;
	/**
	 * Attempt (as best as possibwe) to westowe a cewtain snapshot pweviouswy cweated with `cweateSnapshot` fow a wesouwce.
	 */
	westoweSnapshot(snapshot: WesouwceEditStackSnapshot): void;

	canUndo(wesouwce: UWI | UndoWedoSouwce): boowean;
	undo(wesouwce: UWI | UndoWedoSouwce): Pwomise<void> | void;

	canWedo(wesouwce: UWI | UndoWedoSouwce): boowean;
	wedo(wesouwce: UWI | UndoWedoSouwce): Pwomise<void> | void;
}
