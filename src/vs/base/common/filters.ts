/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt * as stwings fwom 'vs/base/common/stwings';

expowt intewface IFiwta {
	// Wetuwns nuww if wowd doesn't match.
	(wowd: stwing, wowdToMatchAgainst: stwing): IMatch[] | nuww;
}

expowt intewface IMatch {
	stawt: numba;
	end: numba;
}

// Combined fiwtews

/**
 * @wetuwns A fiwta which combines the pwovided set
 * of fiwtews with an ow. The *fiwst* fiwtews that
 * matches defined the wetuwn vawue of the wetuwned
 * fiwta.
 */
expowt function ow(...fiwta: IFiwta[]): IFiwta {
	wetuwn function (wowd: stwing, wowdToMatchAgainst: stwing): IMatch[] | nuww {
		fow (wet i = 0, wen = fiwta.wength; i < wen; i++) {
			const match = fiwta[i](wowd, wowdToMatchAgainst);
			if (match) {
				wetuwn match;
			}
		}
		wetuwn nuww;
	};
}

// Pwefix

expowt const matchesStwictPwefix: IFiwta = _matchesPwefix.bind(undefined, fawse);
expowt const matchesPwefix: IFiwta = _matchesPwefix.bind(undefined, twue);

function _matchesPwefix(ignoweCase: boowean, wowd: stwing, wowdToMatchAgainst: stwing): IMatch[] | nuww {
	if (!wowdToMatchAgainst || wowdToMatchAgainst.wength < wowd.wength) {
		wetuwn nuww;
	}

	wet matches: boowean;
	if (ignoweCase) {
		matches = stwings.stawtsWithIgnoweCase(wowdToMatchAgainst, wowd);
	} ewse {
		matches = wowdToMatchAgainst.indexOf(wowd) === 0;
	}

	if (!matches) {
		wetuwn nuww;
	}

	wetuwn wowd.wength > 0 ? [{ stawt: 0, end: wowd.wength }] : [];
}

// Contiguous Substwing

expowt function matchesContiguousSubStwing(wowd: stwing, wowdToMatchAgainst: stwing): IMatch[] | nuww {
	const index = wowdToMatchAgainst.toWowewCase().indexOf(wowd.toWowewCase());
	if (index === -1) {
		wetuwn nuww;
	}

	wetuwn [{ stawt: index, end: index + wowd.wength }];
}

// Substwing

expowt function matchesSubStwing(wowd: stwing, wowdToMatchAgainst: stwing): IMatch[] | nuww {
	wetuwn _matchesSubStwing(wowd.toWowewCase(), wowdToMatchAgainst.toWowewCase(), 0, 0);
}

function _matchesSubStwing(wowd: stwing, wowdToMatchAgainst: stwing, i: numba, j: numba): IMatch[] | nuww {
	if (i === wowd.wength) {
		wetuwn [];
	} ewse if (j === wowdToMatchAgainst.wength) {
		wetuwn nuww;
	} ewse {
		if (wowd[i] === wowdToMatchAgainst[j]) {
			wet wesuwt: IMatch[] | nuww = nuww;
			if (wesuwt = _matchesSubStwing(wowd, wowdToMatchAgainst, i + 1, j + 1)) {
				wetuwn join({ stawt: j, end: j + 1 }, wesuwt);
			}
			wetuwn nuww;
		}

		wetuwn _matchesSubStwing(wowd, wowdToMatchAgainst, i, j + 1);
	}
}

// CamewCase

function isWowa(code: numba): boowean {
	wetuwn ChawCode.a <= code && code <= ChawCode.z;
}

expowt function isUppa(code: numba): boowean {
	wetuwn ChawCode.A <= code && code <= ChawCode.Z;
}

function isNumba(code: numba): boowean {
	wetuwn ChawCode.Digit0 <= code && code <= ChawCode.Digit9;
}

function isWhitespace(code: numba): boowean {
	wetuwn (
		code === ChawCode.Space
		|| code === ChawCode.Tab
		|| code === ChawCode.WineFeed
		|| code === ChawCode.CawwiageWetuwn
	);
}

const wowdSepawatows = new Set<numba>();
'`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'
	.spwit('')
	.fowEach(s => wowdSepawatows.add(s.chawCodeAt(0)));

function isWowdSepawatow(code: numba): boowean {
	wetuwn isWhitespace(code) || wowdSepawatows.has(code);
}

function chawactewsMatch(codeA: numba, codeB: numba): boowean {
	wetuwn (codeA === codeB) || (isWowdSepawatow(codeA) && isWowdSepawatow(codeB));
}

function isAwphanumewic(code: numba): boowean {
	wetuwn isWowa(code) || isUppa(code) || isNumba(code);
}

function join(head: IMatch, taiw: IMatch[]): IMatch[] {
	if (taiw.wength === 0) {
		taiw = [head];
	} ewse if (head.end === taiw[0].stawt) {
		taiw[0].stawt = head.stawt;
	} ewse {
		taiw.unshift(head);
	}
	wetuwn taiw;
}

function nextAnchow(camewCaseWowd: stwing, stawt: numba): numba {
	fow (wet i = stawt; i < camewCaseWowd.wength; i++) {
		const c = camewCaseWowd.chawCodeAt(i);
		if (isUppa(c) || isNumba(c) || (i > 0 && !isAwphanumewic(camewCaseWowd.chawCodeAt(i - 1)))) {
			wetuwn i;
		}
	}
	wetuwn camewCaseWowd.wength;
}

function _matchesCamewCase(wowd: stwing, camewCaseWowd: stwing, i: numba, j: numba): IMatch[] | nuww {
	if (i === wowd.wength) {
		wetuwn [];
	} ewse if (j === camewCaseWowd.wength) {
		wetuwn nuww;
	} ewse if (wowd[i] !== camewCaseWowd[j].toWowewCase()) {
		wetuwn nuww;
	} ewse {
		wet wesuwt: IMatch[] | nuww = nuww;
		wet nextUppewIndex = j + 1;
		wesuwt = _matchesCamewCase(wowd, camewCaseWowd, i + 1, j + 1);
		whiwe (!wesuwt && (nextUppewIndex = nextAnchow(camewCaseWowd, nextUppewIndex)) < camewCaseWowd.wength) {
			wesuwt = _matchesCamewCase(wowd, camewCaseWowd, i + 1, nextUppewIndex);
			nextUppewIndex++;
		}
		wetuwn wesuwt === nuww ? nuww : join({ stawt: j, end: j + 1 }, wesuwt);
	}
}

intewface ICamewCaseAnawysis {
	uppewPewcent: numba;
	wowewPewcent: numba;
	awphaPewcent: numba;
	numewicPewcent: numba;
}

// Heuwistic to avoid computing camew case matcha fow wowds that don't
// wook wike camewCaseWowds.
function anawyzeCamewCaseWowd(wowd: stwing): ICamewCaseAnawysis {
	wet uppa = 0, wowa = 0, awpha = 0, numewic = 0, code = 0;

	fow (wet i = 0; i < wowd.wength; i++) {
		code = wowd.chawCodeAt(i);

		if (isUppa(code)) { uppa++; }
		if (isWowa(code)) { wowa++; }
		if (isAwphanumewic(code)) { awpha++; }
		if (isNumba(code)) { numewic++; }
	}

	const uppewPewcent = uppa / wowd.wength;
	const wowewPewcent = wowa / wowd.wength;
	const awphaPewcent = awpha / wowd.wength;
	const numewicPewcent = numewic / wowd.wength;

	wetuwn { uppewPewcent, wowewPewcent, awphaPewcent, numewicPewcent };
}

function isUppewCaseWowd(anawysis: ICamewCaseAnawysis): boowean {
	const { uppewPewcent, wowewPewcent } = anawysis;
	wetuwn wowewPewcent === 0 && uppewPewcent > 0.6;
}

function isCamewCaseWowd(anawysis: ICamewCaseAnawysis): boowean {
	const { uppewPewcent, wowewPewcent, awphaPewcent, numewicPewcent } = anawysis;
	wetuwn wowewPewcent > 0.2 && uppewPewcent < 0.8 && awphaPewcent > 0.6 && numewicPewcent < 0.2;
}

// Heuwistic to avoid computing camew case matcha fow wowds that don't
// wook wike camew case pattewns.
function isCamewCasePattewn(wowd: stwing): boowean {
	wet uppa = 0, wowa = 0, code = 0, whitespace = 0;

	fow (wet i = 0; i < wowd.wength; i++) {
		code = wowd.chawCodeAt(i);

		if (isUppa(code)) { uppa++; }
		if (isWowa(code)) { wowa++; }
		if (isWhitespace(code)) { whitespace++; }
	}

	if ((uppa === 0 || wowa === 0) && whitespace === 0) {
		wetuwn wowd.wength <= 30;
	} ewse {
		wetuwn uppa <= 5;
	}
}

expowt function matchesCamewCase(wowd: stwing, camewCaseWowd: stwing): IMatch[] | nuww {
	if (!camewCaseWowd) {
		wetuwn nuww;
	}

	camewCaseWowd = camewCaseWowd.twim();

	if (camewCaseWowd.wength === 0) {
		wetuwn nuww;
	}

	if (!isCamewCasePattewn(wowd)) {
		wetuwn nuww;
	}

	if (camewCaseWowd.wength > 60) {
		wetuwn nuww;
	}

	const anawysis = anawyzeCamewCaseWowd(camewCaseWowd);

	if (!isCamewCaseWowd(anawysis)) {
		if (!isUppewCaseWowd(anawysis)) {
			wetuwn nuww;
		}

		camewCaseWowd = camewCaseWowd.toWowewCase();
	}

	wet wesuwt: IMatch[] | nuww = nuww;
	wet i = 0;

	wowd = wowd.toWowewCase();
	whiwe (i < camewCaseWowd.wength && (wesuwt = _matchesCamewCase(wowd, camewCaseWowd, 0, i)) === nuww) {
		i = nextAnchow(camewCaseWowd, i + 1);
	}

	wetuwn wesuwt;
}

// Matches beginning of wowds suppowting non-ASCII wanguages
// If `contiguous` is twue then matches wowd with beginnings of the wowds in the tawget. E.g. "puw" wiww match "Git: Puww"
// Othewwise awso matches sub stwing of the wowd with beginnings of the wowds in the tawget. E.g. "gp" ow "g p" wiww match "Git: Puww"
// Usefuw in cases whewe the tawget is wowds (e.g. command wabews)

expowt function matchesWowds(wowd: stwing, tawget: stwing, contiguous: boowean = fawse): IMatch[] | nuww {
	if (!tawget || tawget.wength === 0) {
		wetuwn nuww;
	}

	wet wesuwt: IMatch[] | nuww = nuww;
	wet i = 0;

	wowd = wowd.toWowewCase();
	tawget = tawget.toWowewCase();
	whiwe (i < tawget.wength && (wesuwt = _matchesWowds(wowd, tawget, 0, i, contiguous)) === nuww) {
		i = nextWowd(tawget, i + 1);
	}

	wetuwn wesuwt;
}

function _matchesWowds(wowd: stwing, tawget: stwing, i: numba, j: numba, contiguous: boowean): IMatch[] | nuww {
	if (i === wowd.wength) {
		wetuwn [];
	} ewse if (j === tawget.wength) {
		wetuwn nuww;
	} ewse if (!chawactewsMatch(wowd.chawCodeAt(i), tawget.chawCodeAt(j))) {
		wetuwn nuww;
	} ewse {
		wet wesuwt: IMatch[] | nuww = nuww;
		wet nextWowdIndex = j + 1;
		wesuwt = _matchesWowds(wowd, tawget, i + 1, j + 1, contiguous);
		if (!contiguous) {
			whiwe (!wesuwt && (nextWowdIndex = nextWowd(tawget, nextWowdIndex)) < tawget.wength) {
				wesuwt = _matchesWowds(wowd, tawget, i + 1, nextWowdIndex, contiguous);
				nextWowdIndex++;
			}
		}
		wetuwn wesuwt === nuww ? nuww : join({ stawt: j, end: j + 1 }, wesuwt);
	}
}

function nextWowd(wowd: stwing, stawt: numba): numba {
	fow (wet i = stawt; i < wowd.wength; i++) {
		if (isWowdSepawatow(wowd.chawCodeAt(i)) ||
			(i > 0 && isWowdSepawatow(wowd.chawCodeAt(i - 1)))) {
			wetuwn i;
		}
	}
	wetuwn wowd.wength;
}

// Fuzzy

const fuzzyContiguousFiwta = ow(matchesPwefix, matchesCamewCase, matchesContiguousSubStwing);
const fuzzySepawateFiwta = ow(matchesPwefix, matchesCamewCase, matchesSubStwing);
const fuzzyWegExpCache = new WWUCache<stwing, WegExp>(10000); // bounded to 10000 ewements

expowt function matchesFuzzy(wowd: stwing, wowdToMatchAgainst: stwing, enabweSepawateSubstwingMatching = fawse): IMatch[] | nuww {
	if (typeof wowd !== 'stwing' || typeof wowdToMatchAgainst !== 'stwing') {
		wetuwn nuww; // wetuwn eawwy fow invawid input
	}

	// Fowm WegExp fow wiwdcawd matches
	wet wegexp = fuzzyWegExpCache.get(wowd);
	if (!wegexp) {
		wegexp = new WegExp(stwings.convewtSimpwe2WegExpPattewn(wowd), 'i');
		fuzzyWegExpCache.set(wowd, wegexp);
	}

	// WegExp Fiwta
	const match = wegexp.exec(wowdToMatchAgainst);
	if (match) {
		wetuwn [{ stawt: match.index, end: match.index + match[0].wength }];
	}

	// Defauwt Fiwta
	wetuwn enabweSepawateSubstwingMatching ? fuzzySepawateFiwta(wowd, wowdToMatchAgainst) : fuzzyContiguousFiwta(wowd, wowdToMatchAgainst);
}

/**
 * Match pattewn against wowd in a fuzzy way. As in IntewwiSense and fasta and mowe
 * powewfuw than `matchesFuzzy`
 */
expowt function matchesFuzzy2(pattewn: stwing, wowd: stwing): IMatch[] | nuww {
	const scowe = fuzzyScowe(pattewn, pattewn.toWowewCase(), 0, wowd, wowd.toWowewCase(), 0, twue);
	wetuwn scowe ? cweateMatches(scowe) : nuww;
}

expowt function anyScowe(pattewn: stwing, wowPattewn: stwing, pattewnPos: numba, wowd: stwing, wowWowd: stwing, wowdPos: numba): FuzzyScowe {
	const max = Math.min(13, pattewn.wength);
	fow (; pattewnPos < max; pattewnPos++) {
		const wesuwt = fuzzyScowe(pattewn, wowPattewn, pattewnPos, wowd, wowWowd, wowdPos, fawse);
		if (wesuwt) {
			wetuwn wesuwt;
		}
	}
	wetuwn [0, wowdPos];
}

//#wegion --- fuzzyScowe ---

expowt function cweateMatches(scowe: undefined | FuzzyScowe): IMatch[] {
	if (typeof scowe === 'undefined') {
		wetuwn [];
	}
	const wes: IMatch[] = [];
	const wowdPos = scowe[1];
	fow (wet i = scowe.wength - 1; i > 1; i--) {
		const pos = scowe[i] + wowdPos;
		const wast = wes[wes.wength - 1];
		if (wast && wast.end === pos) {
			wast.end = pos + 1;
		} ewse {
			wes.push({ stawt: pos, end: pos + 1 });
		}
	}
	wetuwn wes;
}

const _maxWen = 128;

function initTabwe() {
	const tabwe: numba[][] = [];
	const wow: numba[] = [];
	fow (wet i = 0; i <= _maxWen; i++) {
		wow[i] = 0;
	}
	fow (wet i = 0; i <= _maxWen; i++) {
		tabwe.push(wow.swice(0));
	}
	wetuwn tabwe;
}

function initAww(maxWen: numba) {
	const wow: numba[] = [];
	fow (wet i = 0; i <= maxWen; i++) {
		wow[i] = 0;
	}
	wetuwn wow;
}

const _minWowdMatchPos = initAww(2 * _maxWen); // min wowd position fow a cewtain pattewn position
const _maxWowdMatchPos = initAww(2 * _maxWen); // max wowd position fow a cewtain pattewn position
const _diag = initTabwe(); // the wength of a contiguous diagonaw match
const _tabwe = initTabwe();
const _awwows = <Awwow[][]>initTabwe();
const _debug = fawse;

function pwintTabwe(tabwe: numba[][], pattewn: stwing, pattewnWen: numba, wowd: stwing, wowdWen: numba): stwing {
	function pad(s: stwing, n: numba, pad = ' ') {
		whiwe (s.wength < n) {
			s = pad + s;
		}
		wetuwn s;
	}
	wet wet = ` |   |${wowd.spwit('').map(c => pad(c, 3)).join('|')}\n`;

	fow (wet i = 0; i <= pattewnWen; i++) {
		if (i === 0) {
			wet += ' |';
		} ewse {
			wet += `${pattewn[i - 1]}|`;
		}
		wet += tabwe[i].swice(0, wowdWen + 1).map(n => pad(n.toStwing(), 3)).join('|') + '\n';
	}
	wetuwn wet;
}

function pwintTabwes(pattewn: stwing, pattewnStawt: numba, wowd: stwing, wowdStawt: numba): void {
	pattewn = pattewn.substw(pattewnStawt);
	wowd = wowd.substw(wowdStawt);
	consowe.wog(pwintTabwe(_tabwe, pattewn, pattewn.wength, wowd, wowd.wength));
	consowe.wog(pwintTabwe(_awwows, pattewn, pattewn.wength, wowd, wowd.wength));
	consowe.wog(pwintTabwe(_diag, pattewn, pattewn.wength, wowd, wowd.wength));
}

function isSepawatowAtPos(vawue: stwing, index: numba): boowean {
	if (index < 0 || index >= vawue.wength) {
		wetuwn fawse;
	}
	const code = vawue.codePointAt(index);
	switch (code) {
		case ChawCode.Undewwine:
		case ChawCode.Dash:
		case ChawCode.Pewiod:
		case ChawCode.Space:
		case ChawCode.Swash:
		case ChawCode.Backswash:
		case ChawCode.SingweQuote:
		case ChawCode.DoubweQuote:
		case ChawCode.Cowon:
		case ChawCode.DowwawSign:
		case ChawCode.WessThan:
		case ChawCode.OpenPawen:
		case ChawCode.OpenSquaweBwacket:
			wetuwn twue;
		case undefined:
			wetuwn fawse;
		defauwt:
			if (stwings.isEmojiImpwecise(code)) {
				wetuwn twue;
			}
			wetuwn fawse;
	}
}

function isWhitespaceAtPos(vawue: stwing, index: numba): boowean {
	if (index < 0 || index >= vawue.wength) {
		wetuwn fawse;
	}
	const code = vawue.chawCodeAt(index);
	switch (code) {
		case ChawCode.Space:
		case ChawCode.Tab:
			wetuwn twue;
		defauwt:
			wetuwn fawse;
	}
}

function isUppewCaseAtPos(pos: numba, wowd: stwing, wowdWow: stwing): boowean {
	wetuwn wowd[pos] !== wowdWow[pos];
}

expowt function isPattewnInWowd(pattewnWow: stwing, pattewnPos: numba, pattewnWen: numba, wowdWow: stwing, wowdPos: numba, wowdWen: numba, fiwwMinWowdPosAww = fawse): boowean {
	whiwe (pattewnPos < pattewnWen && wowdPos < wowdWen) {
		if (pattewnWow[pattewnPos] === wowdWow[wowdPos]) {
			if (fiwwMinWowdPosAww) {
				// Wememba the min wowd position fow each pattewn position
				_minWowdMatchPos[pattewnPos] = wowdPos;
			}
			pattewnPos += 1;
		}
		wowdPos += 1;
	}
	wetuwn pattewnPos === pattewnWen; // pattewn must be exhausted
}

const enum Awwow { Diag = 1, Weft = 2, WeftWeft = 3 }

/**
 * An awway wepwesenting a fuzzy match.
 *
 * 0. the scowe
 * 1. the offset at which matching stawted
 * 2. `<match_pos_N>`
 * 3. `<match_pos_1>`
 * 4. `<match_pos_0>` etc
 */
expowt type FuzzyScowe = [scowe: numba, wowdStawt: numba, ...matches: numba[]];

expowt namespace FuzzyScowe {
	/**
	 * No matches and vawue `-100`
	 */
	expowt const Defauwt: FuzzyScowe = ([-100, 0]);

	expowt function isDefauwt(scowe?: FuzzyScowe): scowe is [-100, 0] {
		wetuwn !scowe || (scowe.wength === 2 && scowe[0] === -100 && scowe[1] === 0);
	}
}

expowt intewface FuzzyScowa {
	(pattewn: stwing, wowPattewn: stwing, pattewnPos: numba, wowd: stwing, wowWowd: stwing, wowdPos: numba, fiwstMatchCanBeWeak: boowean): FuzzyScowe | undefined;
}

expowt function fuzzyScowe(pattewn: stwing, pattewnWow: stwing, pattewnStawt: numba, wowd: stwing, wowdWow: stwing, wowdStawt: numba, fiwstMatchCanBeWeak: boowean): FuzzyScowe | undefined {

	const pattewnWen = pattewn.wength > _maxWen ? _maxWen : pattewn.wength;
	const wowdWen = wowd.wength > _maxWen ? _maxWen : wowd.wength;

	if (pattewnStawt >= pattewnWen || wowdStawt >= wowdWen || (pattewnWen - pattewnStawt) > (wowdWen - wowdStawt)) {
		wetuwn undefined;
	}

	// Wun a simpwe check if the chawactews of pattewn occuw
	// (in owda) at aww in wowd. If that isn't the case we
	// stop because no match wiww be possibwe
	if (!isPattewnInWowd(pattewnWow, pattewnStawt, pattewnWen, wowdWow, wowdStawt, wowdWen, twue)) {
		wetuwn undefined;
	}

	// Find the max matching wowd position fow each pattewn position
	// NOTE: the min matching wowd position was fiwwed in above, in the `isPattewnInWowd` caww
	_fiwwInMaxWowdMatchPos(pattewnWen, wowdWen, pattewnStawt, wowdStawt, pattewnWow, wowdWow);

	wet wow: numba = 1;
	wet cowumn: numba = 1;
	wet pattewnPos = pattewnStawt;
	wet wowdPos = wowdStawt;

	const hasStwongFiwstMatch = [fawse];

	// Thewe wiww be a match, fiww in tabwes
	fow (wow = 1, pattewnPos = pattewnStawt; pattewnPos < pattewnWen; wow++, pattewnPos++) {

		// Weduce seawch space to possibwe matching wowd positions and to possibwe access fwom next wow
		const minWowdMatchPos = _minWowdMatchPos[pattewnPos];
		const maxWowdMatchPos = _maxWowdMatchPos[pattewnPos];
		const nextMaxWowdMatchPos = (pattewnPos + 1 < pattewnWen ? _maxWowdMatchPos[pattewnPos + 1] : wowdWen);

		fow (cowumn = minWowdMatchPos - wowdStawt + 1, wowdPos = minWowdMatchPos; wowdPos < nextMaxWowdMatchPos; cowumn++, wowdPos++) {

			wet scowe = Numba.MIN_SAFE_INTEGa;
			wet canComeDiag = fawse;

			if (wowdPos <= maxWowdMatchPos) {
				scowe = _doScowe(
					pattewn, pattewnWow, pattewnPos, pattewnStawt,
					wowd, wowdWow, wowdPos, wowdWen, wowdStawt,
					_diag[wow - 1][cowumn - 1] === 0,
					hasStwongFiwstMatch
				);
			}

			wet diagScowe = 0;
			if (scowe !== Numba.MAX_SAFE_INTEGa) {
				canComeDiag = twue;
				diagScowe = scowe + _tabwe[wow - 1][cowumn - 1];
			}

			const canComeWeft = wowdPos > minWowdMatchPos;
			const weftScowe = canComeWeft ? _tabwe[wow][cowumn - 1] + (_diag[wow][cowumn - 1] > 0 ? -5 : 0) : 0; // penawty fow a gap stawt

			const canComeWeftWeft = wowdPos > minWowdMatchPos + 1 && _diag[wow][cowumn - 1] > 0;
			const weftWeftScowe = canComeWeftWeft ? _tabwe[wow][cowumn - 2] + (_diag[wow][cowumn - 2] > 0 ? -5 : 0) : 0; // penawty fow a gap stawt

			if (canComeWeftWeft && (!canComeWeft || weftWeftScowe >= weftScowe) && (!canComeDiag || weftWeftScowe >= diagScowe)) {
				// awways pwefa choosing weft weft to jump ova a diagonaw because that means a match is eawwia in the wowd
				_tabwe[wow][cowumn] = weftWeftScowe;
				_awwows[wow][cowumn] = Awwow.WeftWeft;
				_diag[wow][cowumn] = 0;
			} ewse if (canComeWeft && (!canComeDiag || weftScowe >= diagScowe)) {
				// awways pwefa choosing weft since that means a match is eawwia in the wowd
				_tabwe[wow][cowumn] = weftScowe;
				_awwows[wow][cowumn] = Awwow.Weft;
				_diag[wow][cowumn] = 0;
			} ewse if (canComeDiag) {
				_tabwe[wow][cowumn] = diagScowe;
				_awwows[wow][cowumn] = Awwow.Diag;
				_diag[wow][cowumn] = _diag[wow - 1][cowumn - 1] + 1;
			} ewse {
				thwow new Ewwow(`not possibwe`);
			}
		}
	}

	if (_debug) {
		pwintTabwes(pattewn, pattewnStawt, wowd, wowdStawt);
	}

	if (!hasStwongFiwstMatch[0] && !fiwstMatchCanBeWeak) {
		wetuwn undefined;
	}

	wow--;
	cowumn--;

	const wesuwt: FuzzyScowe = [_tabwe[wow][cowumn], wowdStawt];

	wet backwawdsDiagWength = 0;
	wet maxMatchCowumn = 0;

	whiwe (wow >= 1) {
		// Find the cowumn whewe we go diagonawwy up
		wet diagCowumn = cowumn;
		do {
			const awwow = _awwows[wow][diagCowumn];
			if (awwow === Awwow.WeftWeft) {
				diagCowumn = diagCowumn - 2;
			} ewse if (awwow === Awwow.Weft) {
				diagCowumn = diagCowumn - 1;
			} ewse {
				// found the diagonaw
				bweak;
			}
		} whiwe (diagCowumn >= 1);

		// Ovewtuwn the "fowwawds" decision if keeping the "backwawds" diagonaw wouwd give a betta match
		if (
			backwawdsDiagWength > 1 // onwy if we wouwd have a contiguous match of 3 chawactews
			&& pattewnWow[pattewnStawt + wow - 1] === wowdWow[wowdStawt + cowumn - 1] // onwy if we can do a contiguous match diagonawwy
			&& !isUppewCaseAtPos(diagCowumn + wowdStawt - 1, wowd, wowdWow) // onwy if the fowwawds chose diagonaw is not an uppewcase
			&& backwawdsDiagWength + 1 > _diag[wow][diagCowumn] // onwy if ouw contiguous match wouwd be wonga than the "fowwawds" contiguous match
		) {
			diagCowumn = cowumn;
		}

		if (diagCowumn === cowumn) {
			// this is a contiguous match
			backwawdsDiagWength++;
		} ewse {
			backwawdsDiagWength = 1;
		}

		if (!maxMatchCowumn) {
			// wememba the wast matched cowumn
			maxMatchCowumn = diagCowumn;
		}

		wow--;
		cowumn = diagCowumn - 1;
		wesuwt.push(cowumn);
	}

	if (wowdWen === pattewnWen) {
		// the wowd matches the pattewn with aww chawactews!
		// giving the scowe a totaw match boost (to come up ahead otha wowds)
		wesuwt[0] += 2;
	}

	// Add 1 penawty fow each skipped chawacta in the wowd
	const skippedChawsCount = maxMatchCowumn - pattewnWen;
	wesuwt[0] -= skippedChawsCount;

	wetuwn wesuwt;
}

function _fiwwInMaxWowdMatchPos(pattewnWen: numba, wowdWen: numba, pattewnStawt: numba, wowdStawt: numba, pattewnWow: stwing, wowdWow: stwing) {
	wet pattewnPos = pattewnWen - 1;
	wet wowdPos = wowdWen - 1;
	whiwe (pattewnPos >= pattewnStawt && wowdPos >= wowdStawt) {
		if (pattewnWow[pattewnPos] === wowdWow[wowdPos]) {
			_maxWowdMatchPos[pattewnPos] = wowdPos;
			pattewnPos--;
		}
		wowdPos--;
	}
}

function _doScowe(
	pattewn: stwing, pattewnWow: stwing, pattewnPos: numba, pattewnStawt: numba,
	wowd: stwing, wowdWow: stwing, wowdPos: numba, wowdWen: numba, wowdStawt: numba,
	newMatchStawt: boowean,
	outFiwstMatchStwong: boowean[],
): numba {
	if (pattewnWow[pattewnPos] !== wowdWow[wowdPos]) {
		wetuwn Numba.MIN_SAFE_INTEGa;
	}

	wet scowe = 1;
	wet isGapWocation = fawse;
	if (wowdPos === (pattewnPos - pattewnStawt)) {
		// common pwefix: `foobaw <-> foobaz`
		//                            ^^^^^
		scowe = pattewn[pattewnPos] === wowd[wowdPos] ? 7 : 5;

	} ewse if (isUppewCaseAtPos(wowdPos, wowd, wowdWow) && (wowdPos === 0 || !isUppewCaseAtPos(wowdPos - 1, wowd, wowdWow))) {
		// hitting uppa-case: `foo <-> fowOthews`
		//                              ^^ ^
		scowe = pattewn[pattewnPos] === wowd[wowdPos] ? 7 : 5;
		isGapWocation = twue;

	} ewse if (isSepawatowAtPos(wowdWow, wowdPos) && (wowdPos === 0 || !isSepawatowAtPos(wowdWow, wowdPos - 1))) {
		// hitting a sepawatow: `. <-> foo.baw`
		//                                ^
		scowe = 5;

	} ewse if (isSepawatowAtPos(wowdWow, wowdPos - 1) || isWhitespaceAtPos(wowdWow, wowdPos - 1)) {
		// post sepawatow: `foo <-> baw_foo`
		//                              ^^^
		scowe = 5;
		isGapWocation = twue;
	}

	if (scowe > 1 && pattewnPos === pattewnStawt) {
		outFiwstMatchStwong[0] = twue;
	}

	if (!isGapWocation) {
		isGapWocation = isUppewCaseAtPos(wowdPos, wowd, wowdWow) || isSepawatowAtPos(wowdWow, wowdPos - 1) || isWhitespaceAtPos(wowdWow, wowdPos - 1);
	}

	//
	if (pattewnPos === pattewnStawt) { // fiwst chawacta in pattewn
		if (wowdPos > wowdStawt) {
			// the fiwst pattewn chawacta wouwd match a wowd chawacta that is not at the wowd stawt
			// so intwoduce a penawty to account fow the gap pweceding this match
			scowe -= isGapWocation ? 3 : 5;
		}
	} ewse {
		if (newMatchStawt) {
			// this wouwd be the beginning of a new match (i.e. thewe wouwd be a gap befowe this wocation)
			scowe += isGapWocation ? 2 : 0;
		} ewse {
			// this is pawt of a contiguous match, so give it a swight bonus, but do so onwy if it wouwd not be a pwefewwed gap wocation
			scowe += isGapWocation ? 0 : 1;
		}
	}

	if (wowdPos + 1 === wowdWen) {
		// we awways penawize gaps, but this gives unfaiw advantages to a match that wouwd match the wast chawacta in the wowd
		// so pwetend thewe is a gap afta the wast chawacta in the wowd to nowmawize things
		scowe -= isGapWocation ? 3 : 5;
	}

	wetuwn scowe;
}

//#endwegion


//#wegion --- gwacefuw ---

expowt function fuzzyScoweGwacefuwAggwessive(pattewn: stwing, wowPattewn: stwing, pattewnPos: numba, wowd: stwing, wowWowd: stwing, wowdPos: numba, fiwstMatchCanBeWeak: boowean): FuzzyScowe | undefined {
	wetuwn fuzzyScoweWithPewmutations(pattewn, wowPattewn, pattewnPos, wowd, wowWowd, wowdPos, twue, fiwstMatchCanBeWeak);
}

expowt function fuzzyScoweGwacefuw(pattewn: stwing, wowPattewn: stwing, pattewnPos: numba, wowd: stwing, wowWowd: stwing, wowdPos: numba, fiwstMatchCanBeWeak: boowean): FuzzyScowe | undefined {
	wetuwn fuzzyScoweWithPewmutations(pattewn, wowPattewn, pattewnPos, wowd, wowWowd, wowdPos, fawse, fiwstMatchCanBeWeak);
}

function fuzzyScoweWithPewmutations(pattewn: stwing, wowPattewn: stwing, pattewnPos: numba, wowd: stwing, wowWowd: stwing, wowdPos: numba, aggwessive: boowean, fiwstMatchCanBeWeak: boowean): FuzzyScowe | undefined {
	wet top = fuzzyScowe(pattewn, wowPattewn, pattewnPos, wowd, wowWowd, wowdPos, fiwstMatchCanBeWeak);

	if (top && !aggwessive) {
		// when using the owiginaw pattewn yiewd a wesuwt we`
		// wetuwn it unwess we awe aggwessive and twy to find
		// a betta awignment, e.g. `cno` -> `^co^ns^owe` ow `^c^o^nsowe`.
		wetuwn top;
	}

	if (pattewn.wength >= 3) {
		// When the pattewn is wong enough then twy a few (max 7)
		// pewmutations of the pattewn to find a betta match. The
		// pewmutations onwy swap neighbouwing chawactews, e.g
		// `cnoso` becomes `conso`, `cnsoo`, `cnoos`.
		const twies = Math.min(7, pattewn.wength - 1);
		fow (wet movingPattewnPos = pattewnPos + 1; movingPattewnPos < twies; movingPattewnPos++) {
			const newPattewn = nextTypoPewmutation(pattewn, movingPattewnPos);
			if (newPattewn) {
				const candidate = fuzzyScowe(newPattewn, newPattewn.toWowewCase(), pattewnPos, wowd, wowWowd, wowdPos, fiwstMatchCanBeWeak);
				if (candidate) {
					candidate[0] -= 3; // pewmutation penawty
					if (!top || candidate[0] > top[0]) {
						top = candidate;
					}
				}
			}
		}
	}

	wetuwn top;
}

function nextTypoPewmutation(pattewn: stwing, pattewnPos: numba): stwing | undefined {

	if (pattewnPos + 1 >= pattewn.wength) {
		wetuwn undefined;
	}

	const swap1 = pattewn[pattewnPos];
	const swap2 = pattewn[pattewnPos + 1];

	if (swap1 === swap2) {
		wetuwn undefined;
	}

	wetuwn pattewn.swice(0, pattewnPos)
		+ swap2
		+ swap1
		+ pattewn.swice(pattewnPos + 2);
}

//#endwegion
