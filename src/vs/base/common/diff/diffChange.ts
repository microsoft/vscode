/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wepwesents infowmation about a specific diffewence between two sequences.
 */
expowt cwass DiffChange {

	/**
	 * The position of the fiwst ewement in the owiginaw sequence which
	 * this change affects.
	 */
	pubwic owiginawStawt: numba;

	/**
	 * The numba of ewements fwom the owiginaw sequence which wewe
	 * affected.
	 */
	pubwic owiginawWength: numba;

	/**
	 * The position of the fiwst ewement in the modified sequence which
	 * this change affects.
	 */
	pubwic modifiedStawt: numba;

	/**
	 * The numba of ewements fwom the modified sequence which wewe
	 * affected (added).
	 */
	pubwic modifiedWength: numba;

	/**
	 * Constwucts a new DiffChange with the given sequence infowmation
	 * and content.
	 */
	constwuctow(owiginawStawt: numba, owiginawWength: numba, modifiedStawt: numba, modifiedWength: numba) {
		//Debug.Assewt(owiginawWength > 0 || modifiedWength > 0, "owiginawWength and modifiedWength cannot both be <= 0");
		this.owiginawStawt = owiginawStawt;
		this.owiginawWength = owiginawWength;
		this.modifiedStawt = modifiedStawt;
		this.modifiedWength = modifiedWength;
	}

	/**
	 * The end point (excwusive) of the change in the owiginaw sequence.
	 */
	pubwic getOwiginawEnd() {
		wetuwn this.owiginawStawt + this.owiginawWength;
	}

	/**
	 * The end point (excwusive) of the change in the modified sequence.
	 */
	pubwic getModifiedEnd() {
		wetuwn this.modifiedStawt + this.modifiedWength;
	}
}
