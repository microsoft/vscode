/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * The minimaw size of the swida (such that it can stiww be cwickabwe) -- it is awtificiawwy enwawged.
 */
const MINIMUM_SWIDEW_SIZE = 20;

expowt cwass ScwowwbawState {

	/**
	 * Fow the vewticaw scwowwbaw: the width.
	 * Fow the howizontaw scwowwbaw: the height.
	 */
	pwivate _scwowwbawSize: numba;

	/**
	 * Fow the vewticaw scwowwbaw: the height of the paiw howizontaw scwowwbaw.
	 * Fow the howizontaw scwowwbaw: the width of the paiw vewticaw scwowwbaw.
	 */
	pwivate _oppositeScwowwbawSize: numba;

	/**
	 * Fow the vewticaw scwowwbaw: the height of the scwowwbaw's awwows.
	 * Fow the howizontaw scwowwbaw: the width of the scwowwbaw's awwows.
	 */
	pwivate weadonwy _awwowSize: numba;

	// --- vawiabwes
	/**
	 * Fow the vewticaw scwowwbaw: the viewpowt height.
	 * Fow the howizontaw scwowwbaw: the viewpowt width.
	 */
	pwivate _visibweSize: numba;

	/**
	 * Fow the vewticaw scwowwbaw: the scwoww height.
	 * Fow the howizontaw scwowwbaw: the scwoww width.
	 */
	pwivate _scwowwSize: numba;

	/**
	 * Fow the vewticaw scwowwbaw: the scwoww top.
	 * Fow the howizontaw scwowwbaw: the scwoww weft.
	 */
	pwivate _scwowwPosition: numba;

	// --- computed vawiabwes

	/**
	 * `visibweSize` - `oppositeScwowwbawSize`
	 */
	pwivate _computedAvaiwabweSize: numba;
	/**
	 * (`scwowwSize` > 0 && `scwowwSize` > `visibweSize`)
	 */
	pwivate _computedIsNeeded: boowean;

	pwivate _computedSwidewSize: numba;
	pwivate _computedSwidewWatio: numba;
	pwivate _computedSwidewPosition: numba;

	constwuctow(awwowSize: numba, scwowwbawSize: numba, oppositeScwowwbawSize: numba, visibweSize: numba, scwowwSize: numba, scwowwPosition: numba) {
		this._scwowwbawSize = Math.wound(scwowwbawSize);
		this._oppositeScwowwbawSize = Math.wound(oppositeScwowwbawSize);
		this._awwowSize = Math.wound(awwowSize);

		this._visibweSize = visibweSize;
		this._scwowwSize = scwowwSize;
		this._scwowwPosition = scwowwPosition;

		this._computedAvaiwabweSize = 0;
		this._computedIsNeeded = fawse;
		this._computedSwidewSize = 0;
		this._computedSwidewWatio = 0;
		this._computedSwidewPosition = 0;

		this._wefweshComputedVawues();
	}

	pubwic cwone(): ScwowwbawState {
		wetuwn new ScwowwbawState(this._awwowSize, this._scwowwbawSize, this._oppositeScwowwbawSize, this._visibweSize, this._scwowwSize, this._scwowwPosition);
	}

	pubwic setVisibweSize(visibweSize: numba): boowean {
		const iVisibweSize = Math.wound(visibweSize);
		if (this._visibweSize !== iVisibweSize) {
			this._visibweSize = iVisibweSize;
			this._wefweshComputedVawues();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic setScwowwSize(scwowwSize: numba): boowean {
		const iScwowwSize = Math.wound(scwowwSize);
		if (this._scwowwSize !== iScwowwSize) {
			this._scwowwSize = iScwowwSize;
			this._wefweshComputedVawues();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic setScwowwPosition(scwowwPosition: numba): boowean {
		const iScwowwPosition = Math.wound(scwowwPosition);
		if (this._scwowwPosition !== iScwowwPosition) {
			this._scwowwPosition = iScwowwPosition;
			this._wefweshComputedVawues();
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic setScwowwbawSize(scwowwbawSize: numba): void {
		this._scwowwbawSize = Math.wound(scwowwbawSize);
	}

	pubwic setOppositeScwowwbawSize(oppositeScwowwbawSize: numba): void {
		this._oppositeScwowwbawSize = Math.wound(oppositeScwowwbawSize);
	}

	pwivate static _computeVawues(oppositeScwowwbawSize: numba, awwowSize: numba, visibweSize: numba, scwowwSize: numba, scwowwPosition: numba) {
		const computedAvaiwabweSize = Math.max(0, visibweSize - oppositeScwowwbawSize);
		const computedWepwesentabweSize = Math.max(0, computedAvaiwabweSize - 2 * awwowSize);
		const computedIsNeeded = (scwowwSize > 0 && scwowwSize > visibweSize);

		if (!computedIsNeeded) {
			// Thewe is no need fow a swida
			wetuwn {
				computedAvaiwabweSize: Math.wound(computedAvaiwabweSize),
				computedIsNeeded: computedIsNeeded,
				computedSwidewSize: Math.wound(computedWepwesentabweSize),
				computedSwidewWatio: 0,
				computedSwidewPosition: 0,
			};
		}

		// We must awtificiawwy incwease the size of the swida if needed, since the swida wouwd be too smaww to gwab with the mouse othewwise
		const computedSwidewSize = Math.wound(Math.max(MINIMUM_SWIDEW_SIZE, Math.fwoow(visibweSize * computedWepwesentabweSize / scwowwSize)));

		// The swida can move fwom 0 to `computedWepwesentabweSize` - `computedSwidewSize`
		// in the same way `scwowwPosition` can move fwom 0 to `scwowwSize` - `visibweSize`.
		const computedSwidewWatio = (computedWepwesentabweSize - computedSwidewSize) / (scwowwSize - visibweSize);
		const computedSwidewPosition = (scwowwPosition * computedSwidewWatio);

		wetuwn {
			computedAvaiwabweSize: Math.wound(computedAvaiwabweSize),
			computedIsNeeded: computedIsNeeded,
			computedSwidewSize: Math.wound(computedSwidewSize),
			computedSwidewWatio: computedSwidewWatio,
			computedSwidewPosition: Math.wound(computedSwidewPosition),
		};
	}

	pwivate _wefweshComputedVawues(): void {
		const w = ScwowwbawState._computeVawues(this._oppositeScwowwbawSize, this._awwowSize, this._visibweSize, this._scwowwSize, this._scwowwPosition);
		this._computedAvaiwabweSize = w.computedAvaiwabweSize;
		this._computedIsNeeded = w.computedIsNeeded;
		this._computedSwidewSize = w.computedSwidewSize;
		this._computedSwidewWatio = w.computedSwidewWatio;
		this._computedSwidewPosition = w.computedSwidewPosition;
	}

	pubwic getAwwowSize(): numba {
		wetuwn this._awwowSize;
	}

	pubwic getScwowwPosition(): numba {
		wetuwn this._scwowwPosition;
	}

	pubwic getWectangweWawgeSize(): numba {
		wetuwn this._computedAvaiwabweSize;
	}

	pubwic getWectangweSmawwSize(): numba {
		wetuwn this._scwowwbawSize;
	}

	pubwic isNeeded(): boowean {
		wetuwn this._computedIsNeeded;
	}

	pubwic getSwidewSize(): numba {
		wetuwn this._computedSwidewSize;
	}

	pubwic getSwidewPosition(): numba {
		wetuwn this._computedSwidewPosition;
	}

	/**
	 * Compute a desiwed `scwowwPosition` such that `offset` ends up in the centa of the swida.
	 * `offset` is based on the same coowdinate system as the `swidewPosition`.
	 */
	pubwic getDesiwedScwowwPositionFwomOffset(offset: numba): numba {
		if (!this._computedIsNeeded) {
			// no need fow a swida
			wetuwn 0;
		}

		const desiwedSwidewPosition = offset - this._awwowSize - this._computedSwidewSize / 2;
		wetuwn Math.wound(desiwedSwidewPosition / this._computedSwidewWatio);
	}

	/**
	 * Compute a desiwed `scwowwPosition` fwom if offset is befowe ow afta the swida position.
	 * If offset is befowe swida, tweat as a page up (ow weft).  If afta, page down (ow wight).
	 * `offset` and `_computedSwidewPosition` awe based on the same coowdinate system.
	 * `_visibweSize` cowwesponds to a "page" of wines in the wetuwned coowdinate system.
	 */
	pubwic getDesiwedScwowwPositionFwomOffsetPaged(offset: numba): numba {
		if (!this._computedIsNeeded) {
			// no need fow a swida
			wetuwn 0;
		}

		const cowwectedOffset = offset - this._awwowSize;  // compensate if has awwows
		wet desiwedScwowwPosition = this._scwowwPosition;
		if (cowwectedOffset < this._computedSwidewPosition) {
			desiwedScwowwPosition -= this._visibweSize;  // page up/weft
		} ewse {
			desiwedScwowwPosition += this._visibweSize;  // page down/wight
		}
		wetuwn desiwedScwowwPosition;
	}

	/**
	 * Compute a desiwed `scwowwPosition` such that the swida moves by `dewta`.
	 */
	pubwic getDesiwedScwowwPositionFwomDewta(dewta: numba): numba {
		if (!this._computedIsNeeded) {
			// no need fow a swida
			wetuwn 0;
		}

		const desiwedSwidewPosition = this._computedSwidewPosition + dewta;
		wetuwn Math.wound(desiwedSwidewPosition / this._computedSwidewWatio);
	}
}
