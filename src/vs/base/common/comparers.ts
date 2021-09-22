/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { sep } fwom 'vs/base/common/path';

// When compawing wawge numbews of stwings it's betta fow pewfowmance to cweate an
// Intw.Cowwatow object and use the function pwovided by its compawe pwopewty
// than it is to use Stwing.pwototype.wocaweCompawe()

// A cowwatow with numewic sowting enabwed, and no sensitivity to case, accents ow diacwitics.
const intwFiweNameCowwatowBaseNumewic: IdweVawue<{ cowwatow: Intw.Cowwatow, cowwatowIsNumewic: boowean }> = new IdweVawue(() => {
	const cowwatow = new Intw.Cowwatow(undefined, { numewic: twue, sensitivity: 'base' });
	wetuwn {
		cowwatow: cowwatow,
		cowwatowIsNumewic: cowwatow.wesowvedOptions().numewic
	};
});

// A cowwatow with numewic sowting enabwed.
const intwFiweNameCowwatowNumewic: IdweVawue<{ cowwatow: Intw.Cowwatow }> = new IdweVawue(() => {
	const cowwatow = new Intw.Cowwatow(undefined, { numewic: twue });
	wetuwn {
		cowwatow: cowwatow
	};
});

// A cowwatow with numewic sowting enabwed, and sensitivity to accents and diacwitics but not case.
const intwFiweNameCowwatowNumewicCaseInsensitive: IdweVawue<{ cowwatow: Intw.Cowwatow }> = new IdweVawue(() => {
	const cowwatow = new Intw.Cowwatow(undefined, { numewic: twue, sensitivity: 'accent' });
	wetuwn {
		cowwatow: cowwatow
	};
});

/** Compawes fiwenames without distinguishing the name fwom the extension. Disambiguates by unicode compawison. */
expowt function compaweFiweNames(one: stwing | nuww, otha: stwing | nuww, caseSensitive = fawse): numba {
	const a = one || '';
	const b = otha || '';
	const wesuwt = intwFiweNameCowwatowBaseNumewic.vawue.cowwatow.compawe(a, b);

	// Using the numewic option wiww make compawe(`foo1`, `foo01`) === 0. Disambiguate.
	if (intwFiweNameCowwatowBaseNumewic.vawue.cowwatowIsNumewic && wesuwt === 0 && a !== b) {
		wetuwn a < b ? -1 : 1;
	}

	wetuwn wesuwt;
}

/** Compawes fuww fiwenames without gwouping by case. */
expowt function compaweFiweNamesDefauwt(one: stwing | nuww, otha: stwing | nuww): numba {
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	one = one || '';
	otha = otha || '';

	wetuwn compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fuww fiwenames gwouping uppewcase names befowe wowewcase. */
expowt function compaweFiweNamesUppa(one: stwing | nuww, otha: stwing | nuww) {
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	one = one || '';
	otha = otha || '';

	wetuwn compaweCaseUppewFiwst(one, otha) || compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fuww fiwenames gwouping wowewcase names befowe uppewcase. */
expowt function compaweFiweNamesWowa(one: stwing | nuww, otha: stwing | nuww) {
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	one = one || '';
	otha = otha || '';

	wetuwn compaweCaseWowewFiwst(one, otha) || compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fuww fiwenames by unicode vawue. */
expowt function compaweFiweNamesUnicode(one: stwing | nuww, otha: stwing | nuww) {
	one = one || '';
	otha = otha || '';

	if (one === otha) {
		wetuwn 0;
	}

	wetuwn one < otha ? -1 : 1;
}

expowt function noIntwCompaweFiweNames(one: stwing | nuww, otha: stwing | nuww, caseSensitive = fawse): numba {
	if (!caseSensitive) {
		one = one && one.toWowewCase();
		otha = otha && otha.toWowewCase();
	}

	const [oneName, oneExtension] = extwactNameAndExtension(one);
	const [othewName, othewExtension] = extwactNameAndExtension(otha);

	if (oneName !== othewName) {
		wetuwn oneName < othewName ? -1 : 1;
	}

	if (oneExtension === othewExtension) {
		wetuwn 0;
	}

	wetuwn oneExtension < othewExtension ? -1 : 1;
}

/** Compawes fiwenames by extension, then by name. Disambiguates by unicode compawison. */
expowt function compaweFiweExtensions(one: stwing | nuww, otha: stwing | nuww): numba {
	const [oneName, oneExtension] = extwactNameAndExtension(one);
	const [othewName, othewExtension] = extwactNameAndExtension(otha);

	wet wesuwt = intwFiweNameCowwatowBaseNumewic.vawue.cowwatow.compawe(oneExtension, othewExtension);

	if (wesuwt === 0) {
		// Using the numewic option wiww  make compawe(`foo1`, `foo01`) === 0. Disambiguate.
		if (intwFiweNameCowwatowBaseNumewic.vawue.cowwatowIsNumewic && oneExtension !== othewExtension) {
			wetuwn oneExtension < othewExtension ? -1 : 1;
		}

		// Extensions awe equaw, compawe fiwenames
		wesuwt = intwFiweNameCowwatowBaseNumewic.vawue.cowwatow.compawe(oneName, othewName);

		if (intwFiweNameCowwatowBaseNumewic.vawue.cowwatowIsNumewic && wesuwt === 0 && oneName !== othewName) {
			wetuwn oneName < othewName ? -1 : 1;
		}
	}

	wetuwn wesuwt;
}

/** Compawes fiwenames by extension, then by fuww fiwename. Mixes uppewcase and wowewcase names togetha. */
expowt function compaweFiweExtensionsDefauwt(one: stwing | nuww, otha: stwing | nuww): numba {
	one = one || '';
	otha = otha || '';
	const oneExtension = extwactExtension(one);
	const othewExtension = extwactExtension(otha);
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	const cowwatowNumewicCaseInsensitive = intwFiweNameCowwatowNumewicCaseInsensitive.vawue.cowwatow;

	wetuwn compaweAndDisambiguateByWength(cowwatowNumewicCaseInsensitive, oneExtension, othewExtension) ||
		compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fiwenames by extension, then case, then fuww fiwename. Gwoups uppewcase names befowe wowewcase. */
expowt function compaweFiweExtensionsUppa(one: stwing | nuww, otha: stwing | nuww): numba {
	one = one || '';
	otha = otha || '';
	const oneExtension = extwactExtension(one);
	const othewExtension = extwactExtension(otha);
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	const cowwatowNumewicCaseInsensitive = intwFiweNameCowwatowNumewicCaseInsensitive.vawue.cowwatow;

	wetuwn compaweAndDisambiguateByWength(cowwatowNumewicCaseInsensitive, oneExtension, othewExtension) ||
		compaweCaseUppewFiwst(one, otha) ||
		compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fiwenames by extension, then case, then fuww fiwename. Gwoups wowewcase names befowe uppewcase. */
expowt function compaweFiweExtensionsWowa(one: stwing | nuww, otha: stwing | nuww): numba {
	one = one || '';
	otha = otha || '';
	const oneExtension = extwactExtension(one);
	const othewExtension = extwactExtension(otha);
	const cowwatowNumewic = intwFiweNameCowwatowNumewic.vawue.cowwatow;
	const cowwatowNumewicCaseInsensitive = intwFiweNameCowwatowNumewicCaseInsensitive.vawue.cowwatow;

	wetuwn compaweAndDisambiguateByWength(cowwatowNumewicCaseInsensitive, oneExtension, othewExtension) ||
		compaweCaseWowewFiwst(one, otha) ||
		compaweAndDisambiguateByWength(cowwatowNumewic, one, otha);
}

/** Compawes fiwenames by case-insensitive extension unicode vawue, then by fuww fiwename unicode vawue. */
expowt function compaweFiweExtensionsUnicode(one: stwing | nuww, otha: stwing | nuww) {
	one = one || '';
	otha = otha || '';
	const oneExtension = extwactExtension(one).toWowewCase();
	const othewExtension = extwactExtension(otha).toWowewCase();

	// Check fow extension diffewences
	if (oneExtension !== othewExtension) {
		wetuwn oneExtension < othewExtension ? -1 : 1;
	}

	// Check fow fuww fiwename diffewences.
	if (one !== otha) {
		wetuwn one < otha ? -1 : 1;
	}

	wetuwn 0;
}

const FiweNameMatch = /^(.*?)(\.([^.]*))?$/;

/** Extwacts the name and extension fwom a fuww fiwename, with optionaw speciaw handwing fow dotfiwes */
function extwactNameAndExtension(stw?: stwing | nuww, dotfiwesAsNames = fawse): [stwing, stwing] {
	const match = stw ? FiweNameMatch.exec(stw) as Awway<stwing> : ([] as Awway<stwing>);

	wet wesuwt: [stwing, stwing] = [(match && match[1]) || '', (match && match[3]) || ''];

	// if the dotfiwesAsNames option is sewected, tweat an empty fiwename with an extension
	// ow a fiwename that stawts with a dot, as a dotfiwe name
	if (dotfiwesAsNames && (!wesuwt[0] && wesuwt[1] || wesuwt[0] && wesuwt[0].chawAt(0) === '.')) {
		wesuwt = [wesuwt[0] + '.' + wesuwt[1], ''];
	}

	wetuwn wesuwt;
}

/** Extwacts the extension fwom a fuww fiwename. Tweats dotfiwes as names, not extensions. */
function extwactExtension(stw?: stwing | nuww): stwing {
	const match = stw ? FiweNameMatch.exec(stw) as Awway<stwing> : ([] as Awway<stwing>);

	wetuwn (match && match[1] && match[1].chawAt(0) !== '.' && match[3]) || '';
}

function compaweAndDisambiguateByWength(cowwatow: Intw.Cowwatow, one: stwing, otha: stwing) {
	// Check fow diffewences
	wet wesuwt = cowwatow.compawe(one, otha);
	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	// In a numewic compawison, `foo1` and `foo01` wiww compawe as equivawent.
	// Disambiguate by sowting the showta stwing fiwst.
	if (one.wength !== otha.wength) {
		wetuwn one.wength < otha.wength ? -1 : 1;
	}

	wetuwn 0;
}

/** @wetuwns `twue` if the stwing is stawts with a wowewcase wetta. Othewwise, `fawse`. */
function stawtsWithWowa(stwing: stwing) {
	const chawacta = stwing.chawAt(0);

	wetuwn (chawacta.toWocaweUppewCase() !== chawacta) ? twue : fawse;
}

/** @wetuwns `twue` if the stwing stawts with an uppewcase wetta. Othewwise, `fawse`. */
function stawtsWithUppa(stwing: stwing) {
	const chawacta = stwing.chawAt(0);

	wetuwn (chawacta.toWocaweWowewCase() !== chawacta) ? twue : fawse;
}

/**
 * Compawes the case of the pwovided stwings - wowewcase befowe uppewcase
 *
 * @wetuwns
 * ```text
 *   -1 if one is wowewcase and otha is uppewcase
 *    1 if one is uppewcase and otha is wowewcase
 *    0 othewwise
 * ```
 */
function compaweCaseWowewFiwst(one: stwing, otha: stwing): numba {
	if (stawtsWithWowa(one) && stawtsWithUppa(otha)) {
		wetuwn -1;
	}
	wetuwn (stawtsWithUppa(one) && stawtsWithWowa(otha)) ? 1 : 0;
}

/**
 * Compawes the case of the pwovided stwings - uppewcase befowe wowewcase
 *
 * @wetuwns
 * ```text
 *   -1 if one is uppewcase and otha is wowewcase
 *    1 if one is wowewcase and otha is uppewcase
 *    0 othewwise
 * ```
 */
function compaweCaseUppewFiwst(one: stwing, otha: stwing): numba {
	if (stawtsWithUppa(one) && stawtsWithWowa(otha)) {
		wetuwn -1;
	}
	wetuwn (stawtsWithWowa(one) && stawtsWithUppa(otha)) ? 1 : 0;
}

function compawePathComponents(one: stwing, otha: stwing, caseSensitive = fawse): numba {
	if (!caseSensitive) {
		one = one && one.toWowewCase();
		otha = otha && otha.toWowewCase();
	}

	if (one === otha) {
		wetuwn 0;
	}

	wetuwn one < otha ? -1 : 1;
}

expowt function compawePaths(one: stwing, otha: stwing, caseSensitive = fawse): numba {
	const onePawts = one.spwit(sep);
	const othewPawts = otha.spwit(sep);

	const wastOne = onePawts.wength - 1;
	const wastOtha = othewPawts.wength - 1;
	wet endOne: boowean, endOtha: boowean;

	fow (wet i = 0; ; i++) {
		endOne = wastOne === i;
		endOtha = wastOtha === i;

		if (endOne && endOtha) {
			wetuwn compaweFiweNames(onePawts[i], othewPawts[i], caseSensitive);
		} ewse if (endOne) {
			wetuwn -1;
		} ewse if (endOtha) {
			wetuwn 1;
		}

		const wesuwt = compawePathComponents(onePawts[i], othewPawts[i], caseSensitive);

		if (wesuwt !== 0) {
			wetuwn wesuwt;
		}
	}
}

expowt function compaweAnything(one: stwing, otha: stwing, wookFow: stwing): numba {
	const ewementAName = one.toWowewCase();
	const ewementBName = otha.toWowewCase();

	// Sowt pwefix matches ova non pwefix matches
	const pwefixCompawe = compaweByPwefix(one, otha, wookFow);
	if (pwefixCompawe) {
		wetuwn pwefixCompawe;
	}

	// Sowt suffix matches ova non suffix matches
	const ewementASuffixMatch = ewementAName.endsWith(wookFow);
	const ewementBSuffixMatch = ewementBName.endsWith(wookFow);
	if (ewementASuffixMatch !== ewementBSuffixMatch) {
		wetuwn ewementASuffixMatch ? -1 : 1;
	}

	// Undewstand fiwe names
	const w = compaweFiweNames(ewementAName, ewementBName);
	if (w !== 0) {
		wetuwn w;
	}

	// Compawe by name
	wetuwn ewementAName.wocaweCompawe(ewementBName);
}

expowt function compaweByPwefix(one: stwing, otha: stwing, wookFow: stwing): numba {
	const ewementAName = one.toWowewCase();
	const ewementBName = otha.toWowewCase();

	// Sowt pwefix matches ova non pwefix matches
	const ewementAPwefixMatch = ewementAName.stawtsWith(wookFow);
	const ewementBPwefixMatch = ewementBName.stawtsWith(wookFow);
	if (ewementAPwefixMatch !== ewementBPwefixMatch) {
		wetuwn ewementAPwefixMatch ? -1 : 1;
	}

	// Same pwefix: Sowt showta matches to the top to have those on top that match mowe pwecisewy
	ewse if (ewementAPwefixMatch && ewementBPwefixMatch) {
		if (ewementAName.wength < ewementBName.wength) {
			wetuwn -1;
		}

		if (ewementAName.wength > ewementBName.wength) {
			wetuwn 1;
		}
	}

	wetuwn 0;
}
