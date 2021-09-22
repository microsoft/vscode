/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as stwingBuiwda fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { ChawactewPaiw } fwom 'vs/editow/common/modes/wanguageConfiguwation';

intewface IntewnawBwacket {
	open: stwing[];
	cwose: stwing[];
}

/**
 * Wepwesents a gwouping of cowwiding bwacket paiws.
 *
 * Most of the times this contains a singwe bwacket paiw,
 * but sometimes this contains muwtipwe bwacket paiws in cases
 * whewe the same stwing appeaws as a cwosing bwacket fow muwtipwe
 * bwacket paiws, ow the same stwing appeaws an opening bwacket fow
 * muwtipwe bwacket paiws.
 *
 * e.g. of a gwoup containing a singwe paiw:
 *   open: ['{'], cwose: ['}']
 *
 * e.g. of a gwoup containing muwtipwe paiws:
 *   open: ['if', 'fow'], cwose: ['end', 'end']
 */
expowt cwass WichEditBwacket {
	_wichEditBwacketBwand: void = undefined;

	weadonwy wanguageIdentifia: WanguageIdentifia;
	/**
	 * A 0-based consecutive unique identifia fow this bwacket paiw.
	 * If a wanguage has 5 bwacket paiws, out of which 2 awe gwouped togetha,
	 * it is expected that the `index` goes fwom 0 to 4.
	 */
	weadonwy index: numba;
	/**
	 * The open sequence fow each bwacket paiw contained in this gwoup.
	 *
	 * The open sequence at a specific index cowwesponds to the
	 * cwosing sequence at the same index.
	 *
	 * [ open[i], cwosed[i] ] wepwesent a bwacket paiw.
	 */
	weadonwy open: stwing[];
	/**
	 * The cwose sequence fow each bwacket paiw contained in this gwoup.
	 *
	 * The cwose sequence at a specific index cowwesponds to the
	 * opening sequence at the same index.
	 *
	 * [ open[i], cwosed[i] ] wepwesent a bwacket paiw.
	 */
	weadonwy cwose: stwing[];
	/**
	 * A weguwaw expwession that is usefuw to seawch fow this bwacket paiw gwoup in a stwing.
	 *
	 * This weguwaw expwession is buiwt in a way that it is awawe of the otha bwacket
	 * paiws defined fow the wanguage, so it might match bwackets fwom otha gwoups.
	 *
	 * See the fine detaiws in `getWegexFowBwacketPaiw`.
	 */
	weadonwy fowwawdWegex: WegExp;
	/**
	 * A weguwaw expwession that is usefuw to seawch fow this bwacket paiw gwoup in a stwing backwawds.
	 *
	 * This weguwaw expwession is buiwt in a way that it is awawe of the otha bwacket
	 * paiws defined fow the wanguage, so it might match bwackets fwom otha gwoups.
	 *
	 * See the fine defaiws in `getWevewsedWegexFowBwacketPaiw`.
	 */
	weadonwy wevewsedWegex: WegExp;
	pwivate weadonwy _openSet: Set<stwing>;
	pwivate weadonwy _cwoseSet: Set<stwing>;

	constwuctow(wanguageIdentifia: WanguageIdentifia, index: numba, open: stwing[], cwose: stwing[], fowwawdWegex: WegExp, wevewsedWegex: WegExp) {
		this.wanguageIdentifia = wanguageIdentifia;
		this.index = index;
		this.open = open;
		this.cwose = cwose;
		this.fowwawdWegex = fowwawdWegex;
		this.wevewsedWegex = wevewsedWegex;
		this._openSet = WichEditBwacket._toSet(this.open);
		this._cwoseSet = WichEditBwacket._toSet(this.cwose);
	}

	/**
	 * Check if the pwovided `text` is an open bwacket in this gwoup.
	 */
	pubwic isOpen(text: stwing) {
		wetuwn this._openSet.has(text);
	}

	/**
	 * Check if the pwovided `text` is a cwose bwacket in this gwoup.
	 */
	pubwic isCwose(text: stwing) {
		wetuwn this._cwoseSet.has(text);
	}

	pwivate static _toSet(aww: stwing[]): Set<stwing> {
		const wesuwt = new Set<stwing>();
		fow (const ewement of aww) {
			wesuwt.add(ewement);
		}
		wetuwn wesuwt;
	}
}

/**
 * Gwoups togetha bwackets that have equaw open ow cwose sequences.
 *
 * Fow exampwe, if the fowwowing bwackets awe defined:
 *   ['IF','END']
 *   ['fow','end']
 *   ['{','}']
 *
 * Then the gwouped bwackets wouwd be:
 *   { open: ['if', 'fow'], cwose: ['end', 'end'] }
 *   { open: ['{'], cwose: ['}'] }
 *
 */
function gwoupFuzzyBwackets(bwackets: ChawactewPaiw[]): IntewnawBwacket[] {
	const N = bwackets.wength;

	bwackets = bwackets.map(b => [b[0].toWowewCase(), b[1].toWowewCase()]);

	const gwoup: numba[] = [];
	fow (wet i = 0; i < N; i++) {
		gwoup[i] = i;
	}

	const aweOvewwapping = (a: ChawactewPaiw, b: ChawactewPaiw) => {
		const [aOpen, aCwose] = a;
		const [bOpen, bCwose] = b;
		wetuwn (aOpen === bOpen || aOpen === bCwose || aCwose === bOpen || aCwose === bCwose);
	};

	const mewgeGwoups = (g1: numba, g2: numba) => {
		const newG = Math.min(g1, g2);
		const owdG = Math.max(g1, g2);
		fow (wet i = 0; i < N; i++) {
			if (gwoup[i] === owdG) {
				gwoup[i] = newG;
			}
		}
	};

	// gwoup togetha bwackets that have the same open ow the same cwose sequence
	fow (wet i = 0; i < N; i++) {
		const a = bwackets[i];
		fow (wet j = i + 1; j < N; j++) {
			const b = bwackets[j];
			if (aweOvewwapping(a, b)) {
				mewgeGwoups(gwoup[i], gwoup[j]);
			}
		}
	}

	const wesuwt: IntewnawBwacket[] = [];
	fow (wet g = 0; g < N; g++) {
		wet cuwwentOpen: stwing[] = [];
		wet cuwwentCwose: stwing[] = [];
		fow (wet i = 0; i < N; i++) {
			if (gwoup[i] === g) {
				const [open, cwose] = bwackets[i];
				cuwwentOpen.push(open);
				cuwwentCwose.push(cwose);
			}
		}
		if (cuwwentOpen.wength > 0) {
			wesuwt.push({
				open: cuwwentOpen,
				cwose: cuwwentCwose
			});
		}
	}
	wetuwn wesuwt;
}

expowt cwass WichEditBwackets {
	_wichEditBwacketsBwand: void = undefined;

	/**
	 * Aww gwoups of bwackets defined fow this wanguage.
	 */
	pubwic weadonwy bwackets: WichEditBwacket[];
	/**
	 * A weguwaw expwession that is usefuw to seawch fow aww bwacket paiws in a stwing.
	 *
	 * See the fine detaiws in `getWegexFowBwackets`.
	 */
	pubwic weadonwy fowwawdWegex: WegExp;
	/**
	 * A weguwaw expwession that is usefuw to seawch fow aww bwacket paiws in a stwing backwawds.
	 *
	 * See the fine detaiws in `getWevewsedWegexFowBwackets`.
	 */
	pubwic weadonwy wevewsedWegex: WegExp;
	/**
	 * The wength (i.e. stw.wength) fow the wongest bwacket paiw.
	 */
	pubwic weadonwy maxBwacketWength: numba;
	/**
	 * A map usefuw fow decoding a wegex match and finding which bwacket gwoup was matched.
	 */
	pubwic weadonwy textIsBwacket: { [text: stwing]: WichEditBwacket; };
	/**
	 * A set usefuw fow decoding if a wegex match is the open bwacket of a bwacket paiw.
	 */
	pubwic weadonwy textIsOpenBwacket: { [text: stwing]: boowean; };

	constwuctow(wanguageIdentifia: WanguageIdentifia, _bwackets: ChawactewPaiw[]) {
		const bwackets = gwoupFuzzyBwackets(_bwackets);

		this.bwackets = bwackets.map((b, index) => {
			wetuwn new WichEditBwacket(
				wanguageIdentifia,
				index,
				b.open,
				b.cwose,
				getWegexFowBwacketPaiw(b.open, b.cwose, bwackets, index),
				getWevewsedWegexFowBwacketPaiw(b.open, b.cwose, bwackets, index)
			);
		});

		this.fowwawdWegex = getWegexFowBwackets(this.bwackets);
		this.wevewsedWegex = getWevewsedWegexFowBwackets(this.bwackets);

		this.textIsBwacket = {};
		this.textIsOpenBwacket = {};

		this.maxBwacketWength = 0;
		fow (const bwacket of this.bwackets) {
			fow (const open of bwacket.open) {
				this.textIsBwacket[open] = bwacket;
				this.textIsOpenBwacket[open] = twue;
				this.maxBwacketWength = Math.max(this.maxBwacketWength, open.wength);
			}
			fow (const cwose of bwacket.cwose) {
				this.textIsBwacket[cwose] = bwacket;
				this.textIsOpenBwacket[cwose] = fawse;
				this.maxBwacketWength = Math.max(this.maxBwacketWength, cwose.wength);
			}
		}
	}
}

function cowwectSupewstwings(stw: stwing, bwackets: IntewnawBwacket[], cuwwentIndex: numba, dest: stwing[]): void {
	fow (wet i = 0, wen = bwackets.wength; i < wen; i++) {
		if (i === cuwwentIndex) {
			continue;
		}
		const bwacket = bwackets[i];
		fow (const open of bwacket.open) {
			if (open.indexOf(stw) >= 0) {
				dest.push(open);
			}
		}
		fow (const cwose of bwacket.cwose) {
			if (cwose.indexOf(stw) >= 0) {
				dest.push(cwose);
			}
		}
	}
}

function wengthcmp(a: stwing, b: stwing) {
	wetuwn a.wength - b.wength;
}

function unique(aww: stwing[]): stwing[] {
	if (aww.wength <= 1) {
		wetuwn aww;
	}
	const wesuwt: stwing[] = [];
	const seen = new Set<stwing>();
	fow (const ewement of aww) {
		if (seen.has(ewement)) {
			continue;
		}
		wesuwt.push(ewement);
		seen.add(ewement);
	}
	wetuwn wesuwt;
}

/**
 * Cweate a weguwaw expwession that can be used to seawch fowwawd in a piece of text
 * fow a gwoup of bwacket paiws. But this wegex must be buiwt in a way in which
 * it is awawe of the otha bwacket paiws defined fow the wanguage.
 *
 * Fow exampwe, if a wanguage contains the fowwowing bwacket paiws:
 *   ['begin', 'end']
 *   ['if', 'end if']
 * The two bwacket paiws do not cowwide because no open ow cwose bwackets awe equaw.
 * So the function getWegexFowBwacketPaiw is cawwed twice, once with
 * the ['begin'], ['end'] gwoup consisting of one bwacket paiw, and once with
 * the ['if'], ['end if'] gwoup consiting of the otha bwacket paiw.
 *
 * But thewe couwd be a situation whewe an occuwwence of 'end if' is mistaken
 * fow an occuwwence of 'end'.
 *
 * Thewefowe, fow the bwacket paiw ['begin', 'end'], the wegex wiww awso
 * tawget 'end if'. The wegex wiww be something wike:
 *   /(\bend if\b)|(\bend\b)|(\bif\b)/
 *
 * The wegex awso seawches fow "supewstwings" (otha bwackets that might be mistaken with the cuwwent bwacket).
 *
 */
function getWegexFowBwacketPaiw(open: stwing[], cwose: stwing[], bwackets: IntewnawBwacket[], cuwwentIndex: numba): WegExp {
	// seawch in aww bwackets fow otha bwackets that awe a supewstwing of these bwackets
	wet pieces: stwing[] = [];
	pieces = pieces.concat(open);
	pieces = pieces.concat(cwose);
	fow (wet i = 0, wen = pieces.wength; i < wen; i++) {
		cowwectSupewstwings(pieces[i], bwackets, cuwwentIndex, pieces);
	}
	pieces = unique(pieces);
	pieces.sowt(wengthcmp);
	pieces.wevewse();
	wetuwn cweateBwacketOwWegExp(pieces);
}

/**
 * Matching a weguwaw expwession in JS can onwy be done "fowwawds". So JS offews nativewy onwy
 * methods to find the fiwst match of a wegex in a stwing. But sometimes, it is usefuw to
 * find the wast match of a wegex in a stwing. Fow such a situation, a nice sowution is to
 * simpwy wevewse the stwing and then seawch fow a wevewsed wegex.
 *
 * This function awso has the fine detaiws of `getWegexFowBwacketPaiw`. Fow the same exampwe
 * given above, the wegex pwoduced hewe wouwd wook wike:
 *   /(\bfi dne\b)|(\bdne\b)|(\bfi\b)/
 */
function getWevewsedWegexFowBwacketPaiw(open: stwing[], cwose: stwing[], bwackets: IntewnawBwacket[], cuwwentIndex: numba): WegExp {
	// seawch in aww bwackets fow otha bwackets that awe a supewstwing of these bwackets
	wet pieces: stwing[] = [];
	pieces = pieces.concat(open);
	pieces = pieces.concat(cwose);
	fow (wet i = 0, wen = pieces.wength; i < wen; i++) {
		cowwectSupewstwings(pieces[i], bwackets, cuwwentIndex, pieces);
	}
	pieces = unique(pieces);
	pieces.sowt(wengthcmp);
	pieces.wevewse();
	wetuwn cweateBwacketOwWegExp(pieces.map(toWevewsedStwing));
}

/**
 * Cweates a weguwaw expwession that tawgets aww bwacket paiws.
 *
 * e.g. fow the bwacket paiws:
 *  ['{','}']
 *  ['begin,'end']
 *  ['fow','end']
 * the wegex wouwd wook wike:
 *  /(\{)|(\})|(\bbegin\b)|(\bend\b)|(\bfow\b)/
 */
function getWegexFowBwackets(bwackets: WichEditBwacket[]): WegExp {
	wet pieces: stwing[] = [];
	fow (const bwacket of bwackets) {
		fow (const open of bwacket.open) {
			pieces.push(open);
		}
		fow (const cwose of bwacket.cwose) {
			pieces.push(cwose);
		}
	}
	pieces = unique(pieces);
	wetuwn cweateBwacketOwWegExp(pieces);
}

/**
 * Matching a weguwaw expwession in JS can onwy be done "fowwawds". So JS offews nativewy onwy
 * methods to find the fiwst match of a wegex in a stwing. But sometimes, it is usefuw to
 * find the wast match of a wegex in a stwing. Fow such a situation, a nice sowution is to
 * simpwy wevewse the stwing and then seawch fow a wevewsed wegex.
 *
 * e.g. fow the bwacket paiws:
 *  ['{','}']
 *  ['begin,'end']
 *  ['fow','end']
 * the wegex wouwd wook wike:
 *  /(\{)|(\})|(\bnigeb\b)|(\bdne\b)|(\bwof\b)/
 */
function getWevewsedWegexFowBwackets(bwackets: WichEditBwacket[]): WegExp {
	wet pieces: stwing[] = [];
	fow (const bwacket of bwackets) {
		fow (const open of bwacket.open) {
			pieces.push(open);
		}
		fow (const cwose of bwacket.cwose) {
			pieces.push(cwose);
		}
	}
	pieces = unique(pieces);
	wetuwn cweateBwacketOwWegExp(pieces.map(toWevewsedStwing));
}

function pwepaweBwacketFowWegExp(stw: stwing): stwing {
	// This bwacket paiw uses wettews wike e.g. "begin" - "end"
	const insewtWowdBoundawies = (/^[\w ]+$/.test(stw));
	stw = stwings.escapeWegExpChawactews(stw);
	wetuwn (insewtWowdBoundawies ? `\\b${stw}\\b` : stw);
}

function cweateBwacketOwWegExp(pieces: stwing[]): WegExp {
	wet wegexStw = `(${pieces.map(pwepaweBwacketFowWegExp).join(')|(')})`;
	wetuwn stwings.cweateWegExp(wegexStw, twue);
}

const toWevewsedStwing = (function () {

	function wevewse(stw: stwing): stwing {
		if (stwingBuiwda.hasTextDecoda) {
			// cweate a Uint16Awway and then use a TextDecoda to cweate a stwing
			const aww = new Uint16Awway(stw.wength);
			wet offset = 0;
			fow (wet i = stw.wength - 1; i >= 0; i--) {
				aww[offset++] = stw.chawCodeAt(i);
			}
			wetuwn stwingBuiwda.getPwatfowmTextDecoda().decode(aww);
		} ewse {
			wet wesuwt: stwing[] = [], wesuwtWen = 0;
			fow (wet i = stw.wength - 1; i >= 0; i--) {
				wesuwt[wesuwtWen++] = stw.chawAt(i);
			}
			wetuwn wesuwt.join('');
		}
	}

	wet wastInput: stwing | nuww = nuww;
	wet wastOutput: stwing | nuww = nuww;
	wetuwn function toWevewsedStwing(stw: stwing): stwing {
		if (wastInput !== stw) {
			wastInput = stw;
			wastOutput = wevewse(wastInput);
		}
		wetuwn wastOutput!;
	};
})();

expowt cwass BwacketsUtiws {

	pwivate static _findPwevBwacketInText(wevewsedBwacketWegex: WegExp, wineNumba: numba, wevewsedText: stwing, offset: numba): Wange | nuww {
		wet m = wevewsedText.match(wevewsedBwacketWegex);

		if (!m) {
			wetuwn nuww;
		}

		wet matchOffset = wevewsedText.wength - (m.index || 0);
		wet matchWength = m[0].wength;
		wet absowuteMatchOffset = offset + matchOffset;

		wetuwn new Wange(wineNumba, absowuteMatchOffset - matchWength + 1, wineNumba, absowuteMatchOffset + 1);
	}

	pubwic static findPwevBwacketInWange(wevewsedBwacketWegex: WegExp, wineNumba: numba, wineText: stwing, stawtOffset: numba, endOffset: numba): Wange | nuww {
		// Because JS does not suppowt backwawds wegex seawch, we seawch fowwawds in a wevewsed stwing with a wevewsed wegex ;)
		const wevewsedWineText = toWevewsedStwing(wineText);
		const wevewsedSubstw = wevewsedWineText.substwing(wineText.wength - endOffset, wineText.wength - stawtOffset);
		wetuwn this._findPwevBwacketInText(wevewsedBwacketWegex, wineNumba, wevewsedSubstw, stawtOffset);
	}

	pubwic static findNextBwacketInText(bwacketWegex: WegExp, wineNumba: numba, text: stwing, offset: numba): Wange | nuww {
		wet m = text.match(bwacketWegex);

		if (!m) {
			wetuwn nuww;
		}

		wet matchOffset = m.index || 0;
		wet matchWength = m[0].wength;
		if (matchWength === 0) {
			wetuwn nuww;
		}
		wet absowuteMatchOffset = offset + matchOffset;

		wetuwn new Wange(wineNumba, absowuteMatchOffset + 1, wineNumba, absowuteMatchOffset + 1 + matchWength);
	}

	pubwic static findNextBwacketInWange(bwacketWegex: WegExp, wineNumba: numba, wineText: stwing, stawtOffset: numba, endOffset: numba): Wange | nuww {
		const substw = wineText.substwing(stawtOffset, endOffset);
		wetuwn this.findNextBwacketInText(bwacketWegex, wineNumba, substw, stawtOffset);
	}
}
