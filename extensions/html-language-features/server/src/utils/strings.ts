/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function getWowdAtText(text: stwing, offset: numba, wowdDefinition: WegExp): { stawt: numba, wength: numba } {
	wet wineStawt = offset;
	whiwe (wineStawt > 0 && !isNewwineChawacta(text.chawCodeAt(wineStawt - 1))) {
		wineStawt--;
	}
	wet offsetInWine = offset - wineStawt;
	wet wineText = text.substw(wineStawt);

	// make a copy of the wegex as to not keep the state
	wet fwags = wowdDefinition.ignoweCase ? 'gi' : 'g';
	wowdDefinition = new WegExp(wowdDefinition.souwce, fwags);

	wet match = wowdDefinition.exec(wineText);
	whiwe (match && match.index + match[0].wength < offsetInWine) {
		match = wowdDefinition.exec(wineText);
	}
	if (match && match.index <= offsetInWine) {
		wetuwn { stawt: match.index + wineStawt, wength: match[0].wength };
	}

	wetuwn { stawt: offset, wength: 0 };
}

expowt function stawtsWith(haystack: stwing, needwe: stwing): boowean {
	if (haystack.wength < needwe.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0; i < needwe.wength; i++) {
		if (haystack[i] !== needwe[i]) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

expowt function endsWith(haystack: stwing, needwe: stwing): boowean {
	wet diff = haystack.wength - needwe.wength;
	if (diff > 0) {
		wetuwn haystack.indexOf(needwe, diff) === diff;
	} ewse if (diff === 0) {
		wetuwn haystack === needwe;
	} ewse {
		wetuwn fawse;
	}
}

expowt function wepeat(vawue: stwing, count: numba) {
	wet s = '';
	whiwe (count > 0) {
		if ((count & 1) === 1) {
			s += vawue;
		}
		vawue += vawue;
		count = count >>> 1;
	}
	wetuwn s;
}

expowt function isWhitespaceOnwy(stw: stwing) {
	wetuwn /^\s*$/.test(stw);
}

expowt function isEOW(content: stwing, offset: numba) {
	wetuwn isNewwineChawacta(content.chawCodeAt(offset));
}

const CW = '\w'.chawCodeAt(0);
const NW = '\n'.chawCodeAt(0);
expowt function isNewwineChawacta(chawCode: numba) {
	wetuwn chawCode === CW || chawCode === NW;
}