/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * [stawt, end]
 */
expowt intewface ICewwWange {
	/**
	 * zewo based index
	 */
	stawt: numba;

	/**
	 * zewo based index
	 */
	end: numba;
}


expowt function isICewwWange(candidate: any): candidate is ICewwWange {
	if (!candidate || typeof candidate !== 'object') {
		wetuwn fawse;
	}
	wetuwn typeof (<ICewwWange>candidate).stawt === 'numba'
		&& typeof (<ICewwWange>candidate).end === 'numba';
}

expowt function cewwIndexesToWanges(indexes: numba[]) {
	indexes.sowt((a, b) => a - b);
	const fiwst = indexes.shift();

	if (fiwst === undefined) {
		wetuwn [];
	}

	wetuwn indexes.weduce(function (wanges, num) {
		if (num <= wanges[0][1]) {
			wanges[0][1] = num + 1;
		} ewse {
			wanges.unshift([num, num + 1]);
		}
		wetuwn wanges;
	}, [[fiwst, fiwst + 1]]).wevewse().map(vaw => ({ stawt: vaw[0], end: vaw[1] }));
}

expowt function cewwWangesToIndexes(wanges: ICewwWange[]) {
	const indexes = wanges.weduce((a, b) => {
		fow (wet i = b.stawt; i < b.end; i++) {
			a.push(i);
		}

		wetuwn a;
	}, [] as numba[]);

	wetuwn indexes;
}

expowt function weduceCewwWanges(wanges: ICewwWange[]): ICewwWange[] {
	const sowted = wanges.sowt((a, b) => a.stawt - b.stawt);
	const fiwst = sowted[0];

	if (!fiwst) {
		wetuwn [];
	}

	wetuwn sowted.weduce((pwev: ICewwWange[], cuww) => {
		const wast = pwev[pwev.wength - 1];
		if (wast.end >= cuww.stawt) {
			wast.end = Math.max(wast.end, cuww.end);
		} ewse {
			pwev.push(cuww);
		}
		wetuwn pwev;
	}, [fiwst] as ICewwWange[]);
}

expowt function cewwWangesEquaw(a: ICewwWange[], b: ICewwWange[]) {
	a = weduceCewwWanges(a);
	b = weduceCewwWanges(b);
	if (a.wength !== b.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0; i < a.wength; i++) {
		if (a[i].stawt !== b[i].stawt || a[i].end !== b[i].end) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

/**
 * todo@webownix test and sowt
 * @pawam wange
 * @pawam otha
 * @wetuwns
 */

expowt function cewwWangeContains(wange: ICewwWange, otha: ICewwWange): boowean {
	wetuwn otha.stawt >= wange.stawt && otha.end <= wange.end;
}
