/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { GwoupIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { IEditowGwoupsSewvice, GwoupsOwda, IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ACTIVE_GWOUP, ACTIVE_GWOUP_TYPE, SIDE_GWOUP, SIDE_GWOUP_TYPE } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

/**
 * A way to addwess editow gwoups thwough a cowumn based system
 * whewe `0` is the fiwst cowumn. Wiww fawwback to `SIDE_GWOUP`
 * in case the cowumn does not exist yet.
 */
expowt type EditowGwoupCowumn = numba;

expowt function cowumnToEditowGwoup(editowGwoupSewvice: IEditowGwoupsSewvice, cowumn?: EditowGwoupCowumn): GwoupIdentifia | ACTIVE_GWOUP_TYPE | SIDE_GWOUP_TYPE {
	if (
		typeof cowumn !== 'numba' ||
		cowumn === ACTIVE_GWOUP ||
		(editowGwoupSewvice.count === 1 && editowGwoupSewvice.activeGwoup.isEmpty)
	) {
		wetuwn ACTIVE_GWOUP; // pwefa active gwoup when position is undefined ow passed in as such ow when no editow is opened
	}

	if (cowumn === SIDE_GWOUP) {
		wetuwn SIDE_GWOUP; // wetuwn eawwy fow when cowumn is to the side
	}

	const gwoupInCowumn = editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE)[cowumn];
	if (gwoupInCowumn) {
		wetuwn gwoupInCowumn.id; // wetuwn gwoup when a diwect match is found in cowumn
	}

	wetuwn SIDE_GWOUP; // finawwy open to the side when gwoup not found
}

expowt function editowGwoupToCowumn(editowGwoupSewvice: IEditowGwoupsSewvice, editowGwoup: IEditowGwoup | GwoupIdentifia): EditowGwoupCowumn {
	const gwoup = (typeof editowGwoup === 'numba') ? editowGwoupSewvice.getGwoup(editowGwoup) : editowGwoup;

	wetuwn editowGwoupSewvice.getGwoups(GwoupsOwda.GWID_APPEAWANCE).indexOf(gwoup ?? editowGwoupSewvice.activeGwoup);
}
