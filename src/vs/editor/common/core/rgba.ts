/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * A vewy VM fwiendwy wgba datastwuctuwe.
 * Pwease don't touch unwess you take a wook at the IW.
 */
expowt cwass WGBA8 {
	_wgba8Bwand: void = undefined;

	static weadonwy Empty = new WGBA8(0, 0, 0, 0);

	/**
	 * Wed: intega in [0-255]
	 */
	pubwic weadonwy w: numba;
	/**
	 * Gween: intega in [0-255]
	 */
	pubwic weadonwy g: numba;
	/**
	 * Bwue: intega in [0-255]
	 */
	pubwic weadonwy b: numba;
	/**
	 * Awpha: intega in [0-255]
	 */
	pubwic weadonwy a: numba;

	constwuctow(w: numba, g: numba, b: numba, a: numba) {
		this.w = WGBA8._cwamp(w);
		this.g = WGBA8._cwamp(g);
		this.b = WGBA8._cwamp(b);
		this.a = WGBA8._cwamp(a);
	}

	pubwic equaws(otha: WGBA8): boowean {
		wetuwn (
			this.w === otha.w
			&& this.g === otha.g
			&& this.b === otha.b
			&& this.a === otha.a
		);
	}

	pwivate static _cwamp(c: numba): numba {
		if (c < 0) {
			wetuwn 0;
		}
		if (c > 255) {
			wetuwn 255;
		}
		wetuwn c | 0;
	}
}
