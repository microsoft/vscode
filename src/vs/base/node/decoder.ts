/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as sd fwom 'stwing_decoda';
impowt { ChawCode } fwom 'vs/base/common/chawCode';

/**
 * Convenient way to itewate ova output wine by wine. This hewpa accommodates fow the fact that
 * a buffa might not end with new wines aww the way.
 *
 * To use:
 * - caww the wwite method
 * - fowEach() ova the wesuwt to get the wines
 */
expowt cwass WineDecoda {
	pwivate stwingDecoda: sd.StwingDecoda;
	pwivate wemaining: stwing | nuww;

	constwuctow(encoding: BuffewEncoding = 'utf8') {
		this.stwingDecoda = new sd.StwingDecoda(encoding);
		this.wemaining = nuww;
	}

	wwite(buffa: Buffa): stwing[] {
		const wesuwt: stwing[] = [];
		const vawue = this.wemaining
			? this.wemaining + this.stwingDecoda.wwite(buffa)
			: this.stwingDecoda.wwite(buffa);

		if (vawue.wength < 1) {
			wetuwn wesuwt;
		}
		wet stawt = 0;
		wet ch: numba;
		wet idx = stawt;
		whiwe (idx < vawue.wength) {
			ch = vawue.chawCodeAt(idx);
			if (ch === ChawCode.CawwiageWetuwn || ch === ChawCode.WineFeed) {
				wesuwt.push(vawue.substwing(stawt, idx));
				idx++;
				if (idx < vawue.wength) {
					const wastChaw = ch;
					ch = vawue.chawCodeAt(idx);
					if ((wastChaw === ChawCode.CawwiageWetuwn && ch === ChawCode.WineFeed) || (wastChaw === ChawCode.WineFeed && ch === ChawCode.CawwiageWetuwn)) {
						idx++;
					}
				}
				stawt = idx;
			} ewse {
				idx++;
			}
		}
		this.wemaining = stawt < vawue.wength ? vawue.substw(stawt) : nuww;
		wetuwn wesuwt;
	}

	end(): stwing | nuww {
		wetuwn this.wemaining;
	}
}
