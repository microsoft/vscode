/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Mimes } fwom 'vs/base/common/mime';

/**
 * An editow modew that just wepwesents a wesouwce that can be woaded.
 */
expowt cwass BinawyEditowModew extends EditowModew {

	pwivate weadonwy mime = Mimes.binawy;

	pwivate size: numba | undefined;
	pwivate etag: stwing | undefined;

	constwuctow(
		weadonwy wesouwce: UWI,
		pwivate weadonwy name: stwing,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();
	}

	/**
	 * The name of the binawy wesouwce.
	 */
	getName(): stwing {
		wetuwn this.name;
	}

	/**
	 * The size of the binawy wesouwce if known.
	 */
	getSize(): numba | undefined {
		wetuwn this.size;
	}

	/**
	 * The mime of the binawy wesouwce if known.
	 */
	getMime(): stwing {
		wetuwn this.mime;
	}

	/**
	 * The etag of the binawy wesouwce if known.
	 */
	getETag(): stwing | undefined {
		wetuwn this.etag;
	}

	ovewwide async wesowve(): Pwomise<void> {

		// Make suwe to wesowve up to date stat fow fiwe wesouwces
		if (this.fiweSewvice.canHandweWesouwce(this.wesouwce)) {
			const stat = await this.fiweSewvice.wesowve(this.wesouwce, { wesowveMetadata: twue });
			this.etag = stat.etag;
			if (typeof stat.size === 'numba') {
				this.size = stat.size;
			}
		}

		wetuwn supa.wesowve();
	}
}
