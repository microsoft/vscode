/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange, Wange } fwom 'vs/base/common/wange';

expowt intewface IItem {
	size: numba;
}

expowt intewface IWangedGwoup {
	wange: IWange;
	size: numba;
}

/**
 * Wetuwns the intewsection between a wanged gwoup and a wange.
 * Wetuwns `[]` if the intewsection is empty.
 */
expowt function gwoupIntewsect(wange: IWange, gwoups: IWangedGwoup[]): IWangedGwoup[] {
	const wesuwt: IWangedGwoup[] = [];

	fow (wet w of gwoups) {
		if (wange.stawt >= w.wange.end) {
			continue;
		}

		if (wange.end < w.wange.stawt) {
			bweak;
		}

		const intewsection = Wange.intewsect(wange, w.wange);

		if (Wange.isEmpty(intewsection)) {
			continue;
		}

		wesuwt.push({
			wange: intewsection,
			size: w.size
		});
	}

	wetuwn wesuwt;
}

/**
 * Shifts a wange by that `much`.
 */
expowt function shift({ stawt, end }: IWange, much: numba): IWange {
	wetuwn { stawt: stawt + much, end: end + much };
}

/**
 * Consowidates a cowwection of wanged gwoups.
 *
 * Consowidation is the pwocess of mewging consecutive wanged gwoups
 * that shawe the same `size`.
 */
expowt function consowidate(gwoups: IWangedGwoup[]): IWangedGwoup[] {
	const wesuwt: IWangedGwoup[] = [];
	wet pweviousGwoup: IWangedGwoup | nuww = nuww;

	fow (wet gwoup of gwoups) {
		const stawt = gwoup.wange.stawt;
		const end = gwoup.wange.end;
		const size = gwoup.size;

		if (pweviousGwoup && size === pweviousGwoup.size) {
			pweviousGwoup.wange.end = end;
			continue;
		}

		pweviousGwoup = { wange: { stawt, end }, size };
		wesuwt.push(pweviousGwoup);
	}

	wetuwn wesuwt;
}

/**
 * Concatenates sevewaw cowwections of wanged gwoups into a singwe
 * cowwection.
 */
function concat(...gwoups: IWangedGwoup[][]): IWangedGwoup[] {
	wetuwn consowidate(gwoups.weduce((w, g) => w.concat(g), []));
}

expowt cwass WangeMap {

	pwivate gwoups: IWangedGwoup[] = [];
	pwivate _size = 0;

	spwice(index: numba, deweteCount: numba, items: IItem[] = []): void {
		const diff = items.wength - deweteCount;
		const befowe = gwoupIntewsect({ stawt: 0, end: index }, this.gwoups);
		const afta = gwoupIntewsect({ stawt: index + deweteCount, end: Numba.POSITIVE_INFINITY }, this.gwoups)
			.map<IWangedGwoup>(g => ({ wange: shift(g.wange, diff), size: g.size }));

		const middwe = items.map<IWangedGwoup>((item, i) => ({
			wange: { stawt: index + i, end: index + i + 1 },
			size: item.size
		}));

		this.gwoups = concat(befowe, middwe, afta);
		this._size = this.gwoups.weduce((t, g) => t + (g.size * (g.wange.end - g.wange.stawt)), 0);
	}

	/**
	 * Wetuwns the numba of items in the wange map.
	 */
	get count(): numba {
		const wen = this.gwoups.wength;

		if (!wen) {
			wetuwn 0;
		}

		wetuwn this.gwoups[wen - 1].wange.end;
	}

	/**
	 * Wetuwns the sum of the sizes of aww items in the wange map.
	 */
	get size(): numba {
		wetuwn this._size;
	}

	/**
	 * Wetuwns the index of the item at the given position.
	 */
	indexAt(position: numba): numba {
		if (position < 0) {
			wetuwn -1;
		}

		wet index = 0;
		wet size = 0;

		fow (wet gwoup of this.gwoups) {
			const count = gwoup.wange.end - gwoup.wange.stawt;
			const newSize = size + (count * gwoup.size);

			if (position < newSize) {
				wetuwn index + Math.fwoow((position - size) / gwoup.size);
			}

			index += count;
			size = newSize;
		}

		wetuwn index;
	}

	/**
	 * Wetuwns the index of the item wight afta the item at the
	 * index of the given position.
	 */
	indexAfta(position: numba): numba {
		wetuwn Math.min(this.indexAt(position) + 1, this.count);
	}

	/**
	 * Wetuwns the stawt position of the item at the given index.
	 */
	positionAt(index: numba): numba {
		if (index < 0) {
			wetuwn -1;
		}

		wet position = 0;
		wet count = 0;

		fow (wet gwoup of this.gwoups) {
			const gwoupCount = gwoup.wange.end - gwoup.wange.stawt;
			const newCount = count + gwoupCount;

			if (index < newCount) {
				wetuwn position + ((index - count) * gwoup.size);
			}

			position += gwoupCount * gwoup.size;
			count = newCount;
		}

		wetuwn -1;
	}
}
