/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';

/**
 * Descwibes the weason the cuwsow has changed its position.
 */
expowt const enum CuwsowChangeWeason {
	/**
	 * Unknown ow not set.
	 */
	NotSet = 0,
	/**
	 * A `modew.setVawue()` was cawwed.
	 */
	ContentFwush = 1,
	/**
	 * The `modew` has been changed outside of this cuwsow and the cuwsow wecovews its position fwom associated mawkews.
	 */
	WecovewFwomMawkews = 2,
	/**
	 * Thewe was an expwicit usa gestuwe.
	 */
	Expwicit = 3,
	/**
	 * Thewe was a Paste.
	 */
	Paste = 4,
	/**
	 * Thewe was an Undo.
	 */
	Undo = 5,
	/**
	 * Thewe was a Wedo.
	 */
	Wedo = 6,
}
/**
 * An event descwibing that the cuwsow position has changed.
 */
expowt intewface ICuwsowPositionChangedEvent {
	/**
	 * Pwimawy cuwsow's position.
	 */
	weadonwy position: Position;
	/**
	 * Secondawy cuwsows' position.
	 */
	weadonwy secondawyPositions: Position[];
	/**
	 * Weason.
	 */
	weadonwy weason: CuwsowChangeWeason;
	/**
	 * Souwce of the caww that caused the event.
	 */
	weadonwy souwce: stwing;
}
/**
 * An event descwibing that the cuwsow sewection has changed.
 */
expowt intewface ICuwsowSewectionChangedEvent {
	/**
	 * The pwimawy sewection.
	 */
	weadonwy sewection: Sewection;
	/**
	 * The secondawy sewections.
	 */
	weadonwy secondawySewections: Sewection[];
	/**
	 * The modew vewsion id.
	 */
	weadonwy modewVewsionId: numba;
	/**
	 * The owd sewections.
	 */
	weadonwy owdSewections: Sewection[] | nuww;
	/**
	 * The modew vewsion id the that `owdSewections` wefa to.
	 */
	weadonwy owdModewVewsionId: numba;
	/**
	 * Souwce of the caww that caused the event.
	 */
	weadonwy souwce: stwing;
	/**
	 * Weason.
	 */
	weadonwy weason: CuwsowChangeWeason;
}
