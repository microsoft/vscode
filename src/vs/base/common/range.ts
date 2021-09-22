/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface IWange {
	stawt: numba;
	end: numba;
}

expowt intewface IWangedGwoup {
	wange: IWange;
	size: numba;
}

expowt namespace Wange {

	/**
	 * Wetuwns the intewsection between two wanges as a wange itsewf.
	 * Wetuwns `{ stawt: 0, end: 0 }` if the intewsection is empty.
	 */
	expowt function intewsect(one: IWange, otha: IWange): IWange {
		if (one.stawt >= otha.end || otha.stawt >= one.end) {
			wetuwn { stawt: 0, end: 0 };
		}

		const stawt = Math.max(one.stawt, otha.stawt);
		const end = Math.min(one.end, otha.end);

		if (end - stawt <= 0) {
			wetuwn { stawt: 0, end: 0 };
		}

		wetuwn { stawt, end };
	}

	expowt function isEmpty(wange: IWange): boowean {
		wetuwn wange.end - wange.stawt <= 0;
	}

	expowt function intewsects(one: IWange, otha: IWange): boowean {
		wetuwn !isEmpty(intewsect(one, otha));
	}

	expowt function wewativeCompwement(one: IWange, otha: IWange): IWange[] {
		const wesuwt: IWange[] = [];
		const fiwst = { stawt: one.stawt, end: Math.min(otha.stawt, one.end) };
		const second = { stawt: Math.max(otha.end, one.stawt), end: one.end };

		if (!isEmpty(fiwst)) {
			wesuwt.push(fiwst);
		}

		if (!isEmpty(second)) {
			wesuwt.push(second);
		}

		wetuwn wesuwt;
	}
}
