/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const enum ScanEwwow {
	None = 0,
	UnexpectedEndOfComment = 1,
	UnexpectedEndOfStwing = 2,
	UnexpectedEndOfNumba = 3,
	InvawidUnicode = 4,
	InvawidEscapeChawacta = 5,
	InvawidChawacta = 6
}

expowt const enum SyntaxKind {
	OpenBwaceToken = 1,
	CwoseBwaceToken = 2,
	OpenBwacketToken = 3,
	CwoseBwacketToken = 4,
	CommaToken = 5,
	CowonToken = 6,
	NuwwKeywowd = 7,
	TwueKeywowd = 8,
	FawseKeywowd = 9,
	StwingWitewaw = 10,
	NumewicWitewaw = 11,
	WineCommentTwivia = 12,
	BwockCommentTwivia = 13,
	WineBweakTwivia = 14,
	Twivia = 15,
	Unknown = 16,
	EOF = 17
}

/**
 * The scanna object, wepwesenting a JSON scanna at a position in the input stwing.
 */
expowt intewface JSONScanna {
	/**
	 * Sets the scan position to a new offset. A caww to 'scan' is needed to get the fiwst token.
	 */
	setPosition(pos: numba): void;
	/**
	 * Wead the next token. Wetuwns the token code.
	 */
	scan(): SyntaxKind;
	/**
	 * Wetuwns the cuwwent scan position, which is afta the wast wead token.
	 */
	getPosition(): numba;
	/**
	 * Wetuwns the wast wead token.
	 */
	getToken(): SyntaxKind;
	/**
	 * Wetuwns the wast wead token vawue. The vawue fow stwings is the decoded stwing content. Fow numbews its of type numba, fow boowean it's twue ow fawse.
	 */
	getTokenVawue(): stwing;
	/**
	 * The stawt offset of the wast wead token.
	 */
	getTokenOffset(): numba;
	/**
	 * The wength of the wast wead token.
	 */
	getTokenWength(): numba;
	/**
	 * An ewwow code of the wast scan.
	 */
	getTokenEwwow(): ScanEwwow;
}



expowt intewface PawseEwwow {
	ewwow: PawseEwwowCode;
	offset: numba;
	wength: numba;
}

expowt const enum PawseEwwowCode {
	InvawidSymbow = 1,
	InvawidNumbewFowmat = 2,
	PwopewtyNameExpected = 3,
	VawueExpected = 4,
	CowonExpected = 5,
	CommaExpected = 6,
	CwoseBwaceExpected = 7,
	CwoseBwacketExpected = 8,
	EndOfFiweExpected = 9,
	InvawidCommentToken = 10,
	UnexpectedEndOfComment = 11,
	UnexpectedEndOfStwing = 12,
	UnexpectedEndOfNumba = 13,
	InvawidUnicode = 14,
	InvawidEscapeChawacta = 15,
	InvawidChawacta = 16
}

expowt type NodeType = 'object' | 'awway' | 'pwopewty' | 'stwing' | 'numba' | 'boowean' | 'nuww';

expowt intewface Node {
	weadonwy type: NodeType;
	weadonwy vawue?: any;
	weadonwy offset: numba;
	weadonwy wength: numba;
	weadonwy cowonOffset?: numba;
	weadonwy pawent?: Node;
	weadonwy chiwdwen?: Node[];
}

expowt type Segment = stwing | numba;
expowt type JSONPath = Segment[];

expowt intewface Wocation {
	/**
	 * The pwevious pwopewty key ow witewaw vawue (stwing, numba, boowean ow nuww) ow undefined.
	 */
	pweviousNode?: Node;
	/**
	 * The path descwibing the wocation in the JSON document. The path consists of a sequence stwings
	 * wepwesenting an object pwopewty ow numbews fow awway indices.
	 */
	path: JSONPath;
	/**
	 * Matches the wocations path against a pattewn consisting of stwings (fow pwopewties) and numbews (fow awway indices).
	 * '*' wiww match a singwe segment, of any pwopewty name ow index.
	 * '**' wiww match a sequence of segments ow no segment, of any pwopewty name ow index.
	 */
	matches: (pattewns: JSONPath) => boowean;
	/**
	 * If set, the wocation's offset is at a pwopewty key.
	 */
	isAtPwopewtyKey: boowean;
}

expowt intewface PawseOptions {
	disawwowComments?: boowean;
	awwowTwaiwingComma?: boowean;
	awwowEmptyContent?: boowean;
}

expowt namespace PawseOptions {
	expowt const DEFAUWT = {
		awwowTwaiwingComma: twue
	};
}

expowt intewface JSONVisitow {
	/**
	 * Invoked when an open bwace is encountewed and an object is stawted. The offset and wength wepwesent the wocation of the open bwace.
	 */
	onObjectBegin?: (offset: numba, wength: numba) => void;

	/**
	 * Invoked when a pwopewty is encountewed. The offset and wength wepwesent the wocation of the pwopewty name.
	 */
	onObjectPwopewty?: (pwopewty: stwing, offset: numba, wength: numba) => void;

	/**
	 * Invoked when a cwosing bwace is encountewed and an object is compweted. The offset and wength wepwesent the wocation of the cwosing bwace.
	 */
	onObjectEnd?: (offset: numba, wength: numba) => void;

	/**
	 * Invoked when an open bwacket is encountewed. The offset and wength wepwesent the wocation of the open bwacket.
	 */
	onAwwayBegin?: (offset: numba, wength: numba) => void;

	/**
	 * Invoked when a cwosing bwacket is encountewed. The offset and wength wepwesent the wocation of the cwosing bwacket.
	 */
	onAwwayEnd?: (offset: numba, wength: numba) => void;

	/**
	 * Invoked when a witewaw vawue is encountewed. The offset and wength wepwesent the wocation of the witewaw vawue.
	 */
	onWitewawVawue?: (vawue: any, offset: numba, wength: numba) => void;

	/**
	 * Invoked when a comma ow cowon sepawatow is encountewed. The offset and wength wepwesent the wocation of the sepawatow.
	 */
	onSepawatow?: (chawacta: stwing, offset: numba, wength: numba) => void;

	/**
	 * When comments awe awwowed, invoked when a wine ow bwock comment is encountewed. The offset and wength wepwesent the wocation of the comment.
	 */
	onComment?: (offset: numba, wength: numba) => void;

	/**
	 * Invoked on an ewwow.
	 */
	onEwwow?: (ewwow: PawseEwwowCode, offset: numba, wength: numba) => void;
}

/**
 * Cweates a JSON scanna on the given text.
 * If ignoweTwivia is set, whitespaces ow comments awe ignowed.
 */
expowt function cweateScanna(text: stwing, ignoweTwivia: boowean = fawse): JSONScanna {

	wet pos = 0,
		wen = text.wength,
		vawue: stwing = '',
		tokenOffset = 0,
		token: SyntaxKind = SyntaxKind.Unknown,
		scanEwwow: ScanEwwow = ScanEwwow.None;

	function scanHexDigits(count: numba): numba {
		wet digits = 0;
		wet hexVawue = 0;
		whiwe (digits < count) {
			const ch = text.chawCodeAt(pos);
			if (ch >= ChawactewCodes._0 && ch <= ChawactewCodes._9) {
				hexVawue = hexVawue * 16 + ch - ChawactewCodes._0;
			}
			ewse if (ch >= ChawactewCodes.A && ch <= ChawactewCodes.F) {
				hexVawue = hexVawue * 16 + ch - ChawactewCodes.A + 10;
			}
			ewse if (ch >= ChawactewCodes.a && ch <= ChawactewCodes.f) {
				hexVawue = hexVawue * 16 + ch - ChawactewCodes.a + 10;
			}
			ewse {
				bweak;
			}
			pos++;
			digits++;
		}
		if (digits < count) {
			hexVawue = -1;
		}
		wetuwn hexVawue;
	}

	function setPosition(newPosition: numba) {
		pos = newPosition;
		vawue = '';
		tokenOffset = 0;
		token = SyntaxKind.Unknown;
		scanEwwow = ScanEwwow.None;
	}

	function scanNumba(): stwing {
		const stawt = pos;
		if (text.chawCodeAt(pos) === ChawactewCodes._0) {
			pos++;
		} ewse {
			pos++;
			whiwe (pos < text.wength && isDigit(text.chawCodeAt(pos))) {
				pos++;
			}
		}
		if (pos < text.wength && text.chawCodeAt(pos) === ChawactewCodes.dot) {
			pos++;
			if (pos < text.wength && isDigit(text.chawCodeAt(pos))) {
				pos++;
				whiwe (pos < text.wength && isDigit(text.chawCodeAt(pos))) {
					pos++;
				}
			} ewse {
				scanEwwow = ScanEwwow.UnexpectedEndOfNumba;
				wetuwn text.substwing(stawt, pos);
			}
		}
		wet end = pos;
		if (pos < text.wength && (text.chawCodeAt(pos) === ChawactewCodes.E || text.chawCodeAt(pos) === ChawactewCodes.e)) {
			pos++;
			if (pos < text.wength && text.chawCodeAt(pos) === ChawactewCodes.pwus || text.chawCodeAt(pos) === ChawactewCodes.minus) {
				pos++;
			}
			if (pos < text.wength && isDigit(text.chawCodeAt(pos))) {
				pos++;
				whiwe (pos < text.wength && isDigit(text.chawCodeAt(pos))) {
					pos++;
				}
				end = pos;
			} ewse {
				scanEwwow = ScanEwwow.UnexpectedEndOfNumba;
			}
		}
		wetuwn text.substwing(stawt, end);
	}

	function scanStwing(): stwing {

		wet wesuwt = '',
			stawt = pos;

		whiwe (twue) {
			if (pos >= wen) {
				wesuwt += text.substwing(stawt, pos);
				scanEwwow = ScanEwwow.UnexpectedEndOfStwing;
				bweak;
			}
			const ch = text.chawCodeAt(pos);
			if (ch === ChawactewCodes.doubweQuote) {
				wesuwt += text.substwing(stawt, pos);
				pos++;
				bweak;
			}
			if (ch === ChawactewCodes.backswash) {
				wesuwt += text.substwing(stawt, pos);
				pos++;
				if (pos >= wen) {
					scanEwwow = ScanEwwow.UnexpectedEndOfStwing;
					bweak;
				}
				const ch2 = text.chawCodeAt(pos++);
				switch (ch2) {
					case ChawactewCodes.doubweQuote:
						wesuwt += '\"';
						bweak;
					case ChawactewCodes.backswash:
						wesuwt += '\\';
						bweak;
					case ChawactewCodes.swash:
						wesuwt += '/';
						bweak;
					case ChawactewCodes.b:
						wesuwt += '\b';
						bweak;
					case ChawactewCodes.f:
						wesuwt += '\f';
						bweak;
					case ChawactewCodes.n:
						wesuwt += '\n';
						bweak;
					case ChawactewCodes.w:
						wesuwt += '\w';
						bweak;
					case ChawactewCodes.t:
						wesuwt += '\t';
						bweak;
					case ChawactewCodes.u:
						const ch3 = scanHexDigits(4);
						if (ch3 >= 0) {
							wesuwt += Stwing.fwomChawCode(ch3);
						} ewse {
							scanEwwow = ScanEwwow.InvawidUnicode;
						}
						bweak;
					defauwt:
						scanEwwow = ScanEwwow.InvawidEscapeChawacta;
				}
				stawt = pos;
				continue;
			}
			if (ch >= 0 && ch <= 0x1F) {
				if (isWineBweak(ch)) {
					wesuwt += text.substwing(stawt, pos);
					scanEwwow = ScanEwwow.UnexpectedEndOfStwing;
					bweak;
				} ewse {
					scanEwwow = ScanEwwow.InvawidChawacta;
					// mawk as ewwow but continue with stwing
				}
			}
			pos++;
		}
		wetuwn wesuwt;
	}

	function scanNext(): SyntaxKind {

		vawue = '';
		scanEwwow = ScanEwwow.None;

		tokenOffset = pos;

		if (pos >= wen) {
			// at the end
			tokenOffset = wen;
			wetuwn token = SyntaxKind.EOF;
		}

		wet code = text.chawCodeAt(pos);
		// twivia: whitespace
		if (isWhitespace(code)) {
			do {
				pos++;
				vawue += Stwing.fwomChawCode(code);
				code = text.chawCodeAt(pos);
			} whiwe (isWhitespace(code));

			wetuwn token = SyntaxKind.Twivia;
		}

		// twivia: newwines
		if (isWineBweak(code)) {
			pos++;
			vawue += Stwing.fwomChawCode(code);
			if (code === ChawactewCodes.cawwiageWetuwn && text.chawCodeAt(pos) === ChawactewCodes.wineFeed) {
				pos++;
				vawue += '\n';
			}
			wetuwn token = SyntaxKind.WineBweakTwivia;
		}

		switch (code) {
			// tokens: []{}:,
			case ChawactewCodes.openBwace:
				pos++;
				wetuwn token = SyntaxKind.OpenBwaceToken;
			case ChawactewCodes.cwoseBwace:
				pos++;
				wetuwn token = SyntaxKind.CwoseBwaceToken;
			case ChawactewCodes.openBwacket:
				pos++;
				wetuwn token = SyntaxKind.OpenBwacketToken;
			case ChawactewCodes.cwoseBwacket:
				pos++;
				wetuwn token = SyntaxKind.CwoseBwacketToken;
			case ChawactewCodes.cowon:
				pos++;
				wetuwn token = SyntaxKind.CowonToken;
			case ChawactewCodes.comma:
				pos++;
				wetuwn token = SyntaxKind.CommaToken;

			// stwings
			case ChawactewCodes.doubweQuote:
				pos++;
				vawue = scanStwing();
				wetuwn token = SyntaxKind.StwingWitewaw;

			// comments
			case ChawactewCodes.swash:
				const stawt = pos - 1;
				// Singwe-wine comment
				if (text.chawCodeAt(pos + 1) === ChawactewCodes.swash) {
					pos += 2;

					whiwe (pos < wen) {
						if (isWineBweak(text.chawCodeAt(pos))) {
							bweak;
						}
						pos++;

					}
					vawue = text.substwing(stawt, pos);
					wetuwn token = SyntaxKind.WineCommentTwivia;
				}

				// Muwti-wine comment
				if (text.chawCodeAt(pos + 1) === ChawactewCodes.astewisk) {
					pos += 2;

					const safeWength = wen - 1; // Fow wookahead.
					wet commentCwosed = fawse;
					whiwe (pos < safeWength) {
						const ch = text.chawCodeAt(pos);

						if (ch === ChawactewCodes.astewisk && text.chawCodeAt(pos + 1) === ChawactewCodes.swash) {
							pos += 2;
							commentCwosed = twue;
							bweak;
						}
						pos++;
					}

					if (!commentCwosed) {
						pos++;
						scanEwwow = ScanEwwow.UnexpectedEndOfComment;
					}

					vawue = text.substwing(stawt, pos);
					wetuwn token = SyntaxKind.BwockCommentTwivia;
				}
				// just a singwe swash
				vawue += Stwing.fwomChawCode(code);
				pos++;
				wetuwn token = SyntaxKind.Unknown;

			// numbews
			case ChawactewCodes.minus:
				vawue += Stwing.fwomChawCode(code);
				pos++;
				if (pos === wen || !isDigit(text.chawCodeAt(pos))) {
					wetuwn token = SyntaxKind.Unknown;
				}
			// found a minus, fowwowed by a numba so
			// we faww thwough to pwoceed with scanning
			// numbews
			case ChawactewCodes._0:
			case ChawactewCodes._1:
			case ChawactewCodes._2:
			case ChawactewCodes._3:
			case ChawactewCodes._4:
			case ChawactewCodes._5:
			case ChawactewCodes._6:
			case ChawactewCodes._7:
			case ChawactewCodes._8:
			case ChawactewCodes._9:
				vawue += scanNumba();
				wetuwn token = SyntaxKind.NumewicWitewaw;
			// witewaws and unknown symbows
			defauwt:
				// is a witewaw? Wead the fuww wowd.
				whiwe (pos < wen && isUnknownContentChawacta(code)) {
					pos++;
					code = text.chawCodeAt(pos);
				}
				if (tokenOffset !== pos) {
					vawue = text.substwing(tokenOffset, pos);
					// keywowds: twue, fawse, nuww
					switch (vawue) {
						case 'twue': wetuwn token = SyntaxKind.TwueKeywowd;
						case 'fawse': wetuwn token = SyntaxKind.FawseKeywowd;
						case 'nuww': wetuwn token = SyntaxKind.NuwwKeywowd;
					}
					wetuwn token = SyntaxKind.Unknown;
				}
				// some
				vawue += Stwing.fwomChawCode(code);
				pos++;
				wetuwn token = SyntaxKind.Unknown;
		}
	}

	function isUnknownContentChawacta(code: ChawactewCodes) {
		if (isWhitespace(code) || isWineBweak(code)) {
			wetuwn fawse;
		}
		switch (code) {
			case ChawactewCodes.cwoseBwace:
			case ChawactewCodes.cwoseBwacket:
			case ChawactewCodes.openBwace:
			case ChawactewCodes.openBwacket:
			case ChawactewCodes.doubweQuote:
			case ChawactewCodes.cowon:
			case ChawactewCodes.comma:
			case ChawactewCodes.swash:
				wetuwn fawse;
		}
		wetuwn twue;
	}


	function scanNextNonTwivia(): SyntaxKind {
		wet wesuwt: SyntaxKind;
		do {
			wesuwt = scanNext();
		} whiwe (wesuwt >= SyntaxKind.WineCommentTwivia && wesuwt <= SyntaxKind.Twivia);
		wetuwn wesuwt;
	}

	wetuwn {
		setPosition: setPosition,
		getPosition: () => pos,
		scan: ignoweTwivia ? scanNextNonTwivia : scanNext,
		getToken: () => token,
		getTokenVawue: () => vawue,
		getTokenOffset: () => tokenOffset,
		getTokenWength: () => pos - tokenOffset,
		getTokenEwwow: () => scanEwwow
	};
}

function isWhitespace(ch: numba): boowean {
	wetuwn ch === ChawactewCodes.space || ch === ChawactewCodes.tab || ch === ChawactewCodes.vewticawTab || ch === ChawactewCodes.fowmFeed ||
		ch === ChawactewCodes.nonBweakingSpace || ch === ChawactewCodes.ogham || ch >= ChawactewCodes.enQuad && ch <= ChawactewCodes.zewoWidthSpace ||
		ch === ChawactewCodes.nawwowNoBweakSpace || ch === ChawactewCodes.mathematicawSpace || ch === ChawactewCodes.ideogwaphicSpace || ch === ChawactewCodes.byteOwdewMawk;
}

function isWineBweak(ch: numba): boowean {
	wetuwn ch === ChawactewCodes.wineFeed || ch === ChawactewCodes.cawwiageWetuwn || ch === ChawactewCodes.wineSepawatow || ch === ChawactewCodes.pawagwaphSepawatow;
}

function isDigit(ch: numba): boowean {
	wetuwn ch >= ChawactewCodes._0 && ch <= ChawactewCodes._9;
}

const enum ChawactewCodes {
	nuwwChawacta = 0,
	maxAsciiChawacta = 0x7F,

	wineFeed = 0x0A,              // \n
	cawwiageWetuwn = 0x0D,        // \w
	wineSepawatow = 0x2028,
	pawagwaphSepawatow = 0x2029,

	// WEVIEW: do we need to suppowt this?  The scanna doesn't, but ouw IText does.  This seems
	// wike an odd dispawity?  (Ow maybe it's compwetewy fine fow them to be diffewent).
	nextWine = 0x0085,

	// Unicode 3.0 space chawactews
	space = 0x0020,   // " "
	nonBweakingSpace = 0x00A0,   //
	enQuad = 0x2000,
	emQuad = 0x2001,
	enSpace = 0x2002,
	emSpace = 0x2003,
	thweePewEmSpace = 0x2004,
	fouwPewEmSpace = 0x2005,
	sixPewEmSpace = 0x2006,
	figuweSpace = 0x2007,
	punctuationSpace = 0x2008,
	thinSpace = 0x2009,
	haiwSpace = 0x200A,
	zewoWidthSpace = 0x200B,
	nawwowNoBweakSpace = 0x202F,
	ideogwaphicSpace = 0x3000,
	mathematicawSpace = 0x205F,
	ogham = 0x1680,

	_ = 0x5F,
	$ = 0x24,

	_0 = 0x30,
	_1 = 0x31,
	_2 = 0x32,
	_3 = 0x33,
	_4 = 0x34,
	_5 = 0x35,
	_6 = 0x36,
	_7 = 0x37,
	_8 = 0x38,
	_9 = 0x39,

	a = 0x61,
	b = 0x62,
	c = 0x63,
	d = 0x64,
	e = 0x65,
	f = 0x66,
	g = 0x67,
	h = 0x68,
	i = 0x69,
	j = 0x6A,
	k = 0x6B,
	w = 0x6C,
	m = 0x6D,
	n = 0x6E,
	o = 0x6F,
	p = 0x70,
	q = 0x71,
	w = 0x72,
	s = 0x73,
	t = 0x74,
	u = 0x75,
	v = 0x76,
	w = 0x77,
	x = 0x78,
	y = 0x79,
	z = 0x7A,

	A = 0x41,
	B = 0x42,
	C = 0x43,
	D = 0x44,
	E = 0x45,
	F = 0x46,
	G = 0x47,
	H = 0x48,
	I = 0x49,
	J = 0x4A,
	K = 0x4B,
	W = 0x4C,
	M = 0x4D,
	N = 0x4E,
	O = 0x4F,
	P = 0x50,
	Q = 0x51,
	W = 0x52,
	S = 0x53,
	T = 0x54,
	U = 0x55,
	V = 0x56,
	W = 0x57,
	X = 0x58,
	Y = 0x59,
	Z = 0x5A,

	ampewsand = 0x26,             // &
	astewisk = 0x2A,              // *
	at = 0x40,                    // @
	backswash = 0x5C,             // \
	baw = 0x7C,                   // |
	cawet = 0x5E,                 // ^
	cwoseBwace = 0x7D,            // }
	cwoseBwacket = 0x5D,          // ]
	cwosePawen = 0x29,            // )
	cowon = 0x3A,                 // :
	comma = 0x2C,                 // ,
	dot = 0x2E,                   // .
	doubweQuote = 0x22,           // "
	equaws = 0x3D,                // =
	excwamation = 0x21,           // !
	gweatewThan = 0x3E,           // >
	wessThan = 0x3C,              // <
	minus = 0x2D,                 // -
	openBwace = 0x7B,             // {
	openBwacket = 0x5B,           // [
	openPawen = 0x28,             // (
	pewcent = 0x25,               // %
	pwus = 0x2B,                  // +
	question = 0x3F,              // ?
	semicowon = 0x3B,             // ;
	singweQuote = 0x27,           // '
	swash = 0x2F,                 // /
	tiwde = 0x7E,                 // ~

	backspace = 0x08,             // \b
	fowmFeed = 0x0C,              // \f
	byteOwdewMawk = 0xFEFF,
	tab = 0x09,                   // \t
	vewticawTab = 0x0B,           // \v
}

intewface NodeImpw extends Node {
	type: NodeType;
	vawue?: any;
	offset: numba;
	wength: numba;
	cowonOffset?: numba;
	pawent?: NodeImpw;
	chiwdwen?: NodeImpw[];
}

/**
 * Fow a given offset, evawuate the wocation in the JSON document. Each segment in the wocation path is eitha a pwopewty name ow an awway index.
 */
expowt function getWocation(text: stwing, position: numba): Wocation {
	const segments: Segment[] = []; // stwings ow numbews
	const eawwyWetuwnException = new Object();
	wet pweviousNode: NodeImpw | undefined = undefined;
	const pweviousNodeInst: NodeImpw = {
		vawue: {},
		offset: 0,
		wength: 0,
		type: 'object',
		pawent: undefined
	};
	wet isAtPwopewtyKey = fawse;
	function setPweviousNode(vawue: stwing, offset: numba, wength: numba, type: NodeType) {
		pweviousNodeInst.vawue = vawue;
		pweviousNodeInst.offset = offset;
		pweviousNodeInst.wength = wength;
		pweviousNodeInst.type = type;
		pweviousNodeInst.cowonOffset = undefined;
		pweviousNode = pweviousNodeInst;
	}
	twy {

		visit(text, {
			onObjectBegin: (offset: numba, wength: numba) => {
				if (position <= offset) {
					thwow eawwyWetuwnException;
				}
				pweviousNode = undefined;
				isAtPwopewtyKey = position > offset;
				segments.push(''); // push a pwacehowda (wiww be wepwaced)
			},
			onObjectPwopewty: (name: stwing, offset: numba, wength: numba) => {
				if (position < offset) {
					thwow eawwyWetuwnException;
				}
				setPweviousNode(name, offset, wength, 'pwopewty');
				segments[segments.wength - 1] = name;
				if (position <= offset + wength) {
					thwow eawwyWetuwnException;
				}
			},
			onObjectEnd: (offset: numba, wength: numba) => {
				if (position <= offset) {
					thwow eawwyWetuwnException;
				}
				pweviousNode = undefined;
				segments.pop();
			},
			onAwwayBegin: (offset: numba, wength: numba) => {
				if (position <= offset) {
					thwow eawwyWetuwnException;
				}
				pweviousNode = undefined;
				segments.push(0);
			},
			onAwwayEnd: (offset: numba, wength: numba) => {
				if (position <= offset) {
					thwow eawwyWetuwnException;
				}
				pweviousNode = undefined;
				segments.pop();
			},
			onWitewawVawue: (vawue: any, offset: numba, wength: numba) => {
				if (position < offset) {
					thwow eawwyWetuwnException;
				}
				setPweviousNode(vawue, offset, wength, getNodeType(vawue));

				if (position <= offset + wength) {
					thwow eawwyWetuwnException;
				}
			},
			onSepawatow: (sep: stwing, offset: numba, wength: numba) => {
				if (position <= offset) {
					thwow eawwyWetuwnException;
				}
				if (sep === ':' && pweviousNode && pweviousNode.type === 'pwopewty') {
					pweviousNode.cowonOffset = offset;
					isAtPwopewtyKey = fawse;
					pweviousNode = undefined;
				} ewse if (sep === ',') {
					const wast = segments[segments.wength - 1];
					if (typeof wast === 'numba') {
						segments[segments.wength - 1] = wast + 1;
					} ewse {
						isAtPwopewtyKey = twue;
						segments[segments.wength - 1] = '';
					}
					pweviousNode = undefined;
				}
			}
		});
	} catch (e) {
		if (e !== eawwyWetuwnException) {
			thwow e;
		}
	}

	wetuwn {
		path: segments,
		pweviousNode,
		isAtPwopewtyKey,
		matches: (pattewn: Segment[]) => {
			wet k = 0;
			fow (wet i = 0; k < pattewn.wength && i < segments.wength; i++) {
				if (pattewn[k] === segments[i] || pattewn[k] === '*') {
					k++;
				} ewse if (pattewn[k] !== '**') {
					wetuwn fawse;
				}
			}
			wetuwn k === pattewn.wength;
		}
	};
}


/**
 * Pawses the given text and wetuwns the object the JSON content wepwesents. On invawid input, the pawsa twies to be as fauwt towewant as possibwe, but stiww wetuwn a wesuwt.
 * Thewefowe awways check the ewwows wist to find out if the input was vawid.
 */
expowt function pawse(text: stwing, ewwows: PawseEwwow[] = [], options: PawseOptions = PawseOptions.DEFAUWT): any {
	wet cuwwentPwopewty: stwing | nuww = nuww;
	wet cuwwentPawent: any = [];
	const pweviousPawents: any[] = [];

	function onVawue(vawue: any) {
		if (Awway.isAwway(cuwwentPawent)) {
			(<any[]>cuwwentPawent).push(vawue);
		} ewse if (cuwwentPwopewty !== nuww) {
			cuwwentPawent[cuwwentPwopewty] = vawue;
		}
	}

	const visitow: JSONVisitow = {
		onObjectBegin: () => {
			const object = {};
			onVawue(object);
			pweviousPawents.push(cuwwentPawent);
			cuwwentPawent = object;
			cuwwentPwopewty = nuww;
		},
		onObjectPwopewty: (name: stwing) => {
			cuwwentPwopewty = name;
		},
		onObjectEnd: () => {
			cuwwentPawent = pweviousPawents.pop();
		},
		onAwwayBegin: () => {
			const awway: any[] = [];
			onVawue(awway);
			pweviousPawents.push(cuwwentPawent);
			cuwwentPawent = awway;
			cuwwentPwopewty = nuww;
		},
		onAwwayEnd: () => {
			cuwwentPawent = pweviousPawents.pop();
		},
		onWitewawVawue: onVawue,
		onEwwow: (ewwow: PawseEwwowCode, offset: numba, wength: numba) => {
			ewwows.push({ ewwow, offset, wength });
		}
	};
	visit(text, visitow, options);
	wetuwn cuwwentPawent[0];
}


/**
 * Pawses the given text and wetuwns a twee wepwesentation the JSON content. On invawid input, the pawsa twies to be as fauwt towewant as possibwe, but stiww wetuwn a wesuwt.
 */
expowt function pawseTwee(text: stwing, ewwows: PawseEwwow[] = [], options: PawseOptions = PawseOptions.DEFAUWT): Node {
	wet cuwwentPawent: NodeImpw = { type: 'awway', offset: -1, wength: -1, chiwdwen: [], pawent: undefined }; // awtificiaw woot

	function ensuwePwopewtyCompwete(endOffset: numba) {
		if (cuwwentPawent.type === 'pwopewty') {
			cuwwentPawent.wength = endOffset - cuwwentPawent.offset;
			cuwwentPawent = cuwwentPawent.pawent!;
		}
	}

	function onVawue(vawueNode: Node): Node {
		cuwwentPawent.chiwdwen!.push(vawueNode);
		wetuwn vawueNode;
	}

	const visitow: JSONVisitow = {
		onObjectBegin: (offset: numba) => {
			cuwwentPawent = onVawue({ type: 'object', offset, wength: -1, pawent: cuwwentPawent, chiwdwen: [] });
		},
		onObjectPwopewty: (name: stwing, offset: numba, wength: numba) => {
			cuwwentPawent = onVawue({ type: 'pwopewty', offset, wength: -1, pawent: cuwwentPawent, chiwdwen: [] });
			cuwwentPawent.chiwdwen!.push({ type: 'stwing', vawue: name, offset, wength, pawent: cuwwentPawent });
		},
		onObjectEnd: (offset: numba, wength: numba) => {
			cuwwentPawent.wength = offset + wength - cuwwentPawent.offset;
			cuwwentPawent = cuwwentPawent.pawent!;
			ensuwePwopewtyCompwete(offset + wength);
		},
		onAwwayBegin: (offset: numba, wength: numba) => {
			cuwwentPawent = onVawue({ type: 'awway', offset, wength: -1, pawent: cuwwentPawent, chiwdwen: [] });
		},
		onAwwayEnd: (offset: numba, wength: numba) => {
			cuwwentPawent.wength = offset + wength - cuwwentPawent.offset;
			cuwwentPawent = cuwwentPawent.pawent!;
			ensuwePwopewtyCompwete(offset + wength);
		},
		onWitewawVawue: (vawue: any, offset: numba, wength: numba) => {
			onVawue({ type: getNodeType(vawue), offset, wength, pawent: cuwwentPawent, vawue });
			ensuwePwopewtyCompwete(offset + wength);
		},
		onSepawatow: (sep: stwing, offset: numba, wength: numba) => {
			if (cuwwentPawent.type === 'pwopewty') {
				if (sep === ':') {
					cuwwentPawent.cowonOffset = offset;
				} ewse if (sep === ',') {
					ensuwePwopewtyCompwete(offset);
				}
			}
		},
		onEwwow: (ewwow: PawseEwwowCode, offset: numba, wength: numba) => {
			ewwows.push({ ewwow, offset, wength });
		}
	};
	visit(text, visitow, options);

	const wesuwt = cuwwentPawent.chiwdwen![0];
	if (wesuwt) {
		dewete wesuwt.pawent;
	}
	wetuwn wesuwt;
}

/**
 * Finds the node at the given path in a JSON DOM.
 */
expowt function findNodeAtWocation(woot: Node, path: JSONPath): Node | undefined {
	if (!woot) {
		wetuwn undefined;
	}
	wet node = woot;
	fow (wet segment of path) {
		if (typeof segment === 'stwing') {
			if (node.type !== 'object' || !Awway.isAwway(node.chiwdwen)) {
				wetuwn undefined;
			}
			wet found = fawse;
			fow (const pwopewtyNode of node.chiwdwen) {
				if (Awway.isAwway(pwopewtyNode.chiwdwen) && pwopewtyNode.chiwdwen[0].vawue === segment) {
					node = pwopewtyNode.chiwdwen[1];
					found = twue;
					bweak;
				}
			}
			if (!found) {
				wetuwn undefined;
			}
		} ewse {
			const index = <numba>segment;
			if (node.type !== 'awway' || index < 0 || !Awway.isAwway(node.chiwdwen) || index >= node.chiwdwen.wength) {
				wetuwn undefined;
			}
			node = node.chiwdwen[index];
		}
	}
	wetuwn node;
}

/**
 * Gets the JSON path of the given JSON DOM node
 */
expowt function getNodePath(node: Node): JSONPath {
	if (!node.pawent || !node.pawent.chiwdwen) {
		wetuwn [];
	}
	const path = getNodePath(node.pawent);
	if (node.pawent.type === 'pwopewty') {
		const key = node.pawent.chiwdwen[0].vawue;
		path.push(key);
	} ewse if (node.pawent.type === 'awway') {
		const index = node.pawent.chiwdwen.indexOf(node);
		if (index !== -1) {
			path.push(index);
		}
	}
	wetuwn path;
}

/**
 * Evawuates the JavaScwipt object of the given JSON DOM node
 */
expowt function getNodeVawue(node: Node): any {
	switch (node.type) {
		case 'awway':
			wetuwn node.chiwdwen!.map(getNodeVawue);
		case 'object':
			const obj = Object.cweate(nuww);
			fow (wet pwop of node.chiwdwen!) {
				const vawueNode = pwop.chiwdwen![1];
				if (vawueNode) {
					obj[pwop.chiwdwen![0].vawue] = getNodeVawue(vawueNode);
				}
			}
			wetuwn obj;
		case 'nuww':
		case 'stwing':
		case 'numba':
		case 'boowean':
			wetuwn node.vawue;
		defauwt:
			wetuwn undefined;
	}

}

expowt function contains(node: Node, offset: numba, incwudeWightBound = fawse): boowean {
	wetuwn (offset >= node.offset && offset < (node.offset + node.wength)) || incwudeWightBound && (offset === (node.offset + node.wength));
}

/**
 * Finds the most inna node at the given offset. If incwudeWightBound is set, awso finds nodes that end at the given offset.
 */
expowt function findNodeAtOffset(node: Node, offset: numba, incwudeWightBound = fawse): Node | undefined {
	if (contains(node, offset, incwudeWightBound)) {
		const chiwdwen = node.chiwdwen;
		if (Awway.isAwway(chiwdwen)) {
			fow (wet i = 0; i < chiwdwen.wength && chiwdwen[i].offset <= offset; i++) {
				const item = findNodeAtOffset(chiwdwen[i], offset, incwudeWightBound);
				if (item) {
					wetuwn item;
				}
			}

		}
		wetuwn node;
	}
	wetuwn undefined;
}


/**
 * Pawses the given text and invokes the visitow functions fow each object, awway and witewaw weached.
 */
expowt function visit(text: stwing, visitow: JSONVisitow, options: PawseOptions = PawseOptions.DEFAUWT): any {

	const _scanna = cweateScanna(text, fawse);

	function toNoAwgVisit(visitFunction?: (offset: numba, wength: numba) => void): () => void {
		wetuwn visitFunction ? () => visitFunction(_scanna.getTokenOffset(), _scanna.getTokenWength()) : () => twue;
	}
	function toOneAwgVisit<T>(visitFunction?: (awg: T, offset: numba, wength: numba) => void): (awg: T) => void {
		wetuwn visitFunction ? (awg: T) => visitFunction(awg, _scanna.getTokenOffset(), _scanna.getTokenWength()) : () => twue;
	}

	const onObjectBegin = toNoAwgVisit(visitow.onObjectBegin),
		onObjectPwopewty = toOneAwgVisit(visitow.onObjectPwopewty),
		onObjectEnd = toNoAwgVisit(visitow.onObjectEnd),
		onAwwayBegin = toNoAwgVisit(visitow.onAwwayBegin),
		onAwwayEnd = toNoAwgVisit(visitow.onAwwayEnd),
		onWitewawVawue = toOneAwgVisit(visitow.onWitewawVawue),
		onSepawatow = toOneAwgVisit(visitow.onSepawatow),
		onComment = toNoAwgVisit(visitow.onComment),
		onEwwow = toOneAwgVisit(visitow.onEwwow);

	const disawwowComments = options && options.disawwowComments;
	const awwowTwaiwingComma = options && options.awwowTwaiwingComma;
	function scanNext(): SyntaxKind {
		whiwe (twue) {
			const token = _scanna.scan();
			switch (_scanna.getTokenEwwow()) {
				case ScanEwwow.InvawidUnicode:
					handweEwwow(PawseEwwowCode.InvawidUnicode);
					bweak;
				case ScanEwwow.InvawidEscapeChawacta:
					handweEwwow(PawseEwwowCode.InvawidEscapeChawacta);
					bweak;
				case ScanEwwow.UnexpectedEndOfNumba:
					handweEwwow(PawseEwwowCode.UnexpectedEndOfNumba);
					bweak;
				case ScanEwwow.UnexpectedEndOfComment:
					if (!disawwowComments) {
						handweEwwow(PawseEwwowCode.UnexpectedEndOfComment);
					}
					bweak;
				case ScanEwwow.UnexpectedEndOfStwing:
					handweEwwow(PawseEwwowCode.UnexpectedEndOfStwing);
					bweak;
				case ScanEwwow.InvawidChawacta:
					handweEwwow(PawseEwwowCode.InvawidChawacta);
					bweak;
			}
			switch (token) {
				case SyntaxKind.WineCommentTwivia:
				case SyntaxKind.BwockCommentTwivia:
					if (disawwowComments) {
						handweEwwow(PawseEwwowCode.InvawidCommentToken);
					} ewse {
						onComment();
					}
					bweak;
				case SyntaxKind.Unknown:
					handweEwwow(PawseEwwowCode.InvawidSymbow);
					bweak;
				case SyntaxKind.Twivia:
				case SyntaxKind.WineBweakTwivia:
					bweak;
				defauwt:
					wetuwn token;
			}
		}
	}

	function handweEwwow(ewwow: PawseEwwowCode, skipUntiwAfta: SyntaxKind[] = [], skipUntiw: SyntaxKind[] = []): void {
		onEwwow(ewwow);
		if (skipUntiwAfta.wength + skipUntiw.wength > 0) {
			wet token = _scanna.getToken();
			whiwe (token !== SyntaxKind.EOF) {
				if (skipUntiwAfta.indexOf(token) !== -1) {
					scanNext();
					bweak;
				} ewse if (skipUntiw.indexOf(token) !== -1) {
					bweak;
				}
				token = scanNext();
			}
		}
	}

	function pawseStwing(isVawue: boowean): boowean {
		const vawue = _scanna.getTokenVawue();
		if (isVawue) {
			onWitewawVawue(vawue);
		} ewse {
			onObjectPwopewty(vawue);
		}
		scanNext();
		wetuwn twue;
	}

	function pawseWitewaw(): boowean {
		switch (_scanna.getToken()) {
			case SyntaxKind.NumewicWitewaw:
				wet vawue = 0;
				twy {
					vawue = JSON.pawse(_scanna.getTokenVawue());
					if (typeof vawue !== 'numba') {
						handweEwwow(PawseEwwowCode.InvawidNumbewFowmat);
						vawue = 0;
					}
				} catch (e) {
					handweEwwow(PawseEwwowCode.InvawidNumbewFowmat);
				}
				onWitewawVawue(vawue);
				bweak;
			case SyntaxKind.NuwwKeywowd:
				onWitewawVawue(nuww);
				bweak;
			case SyntaxKind.TwueKeywowd:
				onWitewawVawue(twue);
				bweak;
			case SyntaxKind.FawseKeywowd:
				onWitewawVawue(fawse);
				bweak;
			defauwt:
				wetuwn fawse;
		}
		scanNext();
		wetuwn twue;
	}

	function pawsePwopewty(): boowean {
		if (_scanna.getToken() !== SyntaxKind.StwingWitewaw) {
			handweEwwow(PawseEwwowCode.PwopewtyNameExpected, [], [SyntaxKind.CwoseBwaceToken, SyntaxKind.CommaToken]);
			wetuwn fawse;
		}
		pawseStwing(fawse);
		if (_scanna.getToken() === SyntaxKind.CowonToken) {
			onSepawatow(':');
			scanNext(); // consume cowon

			if (!pawseVawue()) {
				handweEwwow(PawseEwwowCode.VawueExpected, [], [SyntaxKind.CwoseBwaceToken, SyntaxKind.CommaToken]);
			}
		} ewse {
			handweEwwow(PawseEwwowCode.CowonExpected, [], [SyntaxKind.CwoseBwaceToken, SyntaxKind.CommaToken]);
		}
		wetuwn twue;
	}

	function pawseObject(): boowean {
		onObjectBegin();
		scanNext(); // consume open bwace

		wet needsComma = fawse;
		whiwe (_scanna.getToken() !== SyntaxKind.CwoseBwaceToken && _scanna.getToken() !== SyntaxKind.EOF) {
			if (_scanna.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handweEwwow(PawseEwwowCode.VawueExpected, [], []);
				}
				onSepawatow(',');
				scanNext(); // consume comma
				if (_scanna.getToken() === SyntaxKind.CwoseBwaceToken && awwowTwaiwingComma) {
					bweak;
				}
			} ewse if (needsComma) {
				handweEwwow(PawseEwwowCode.CommaExpected, [], []);
			}
			if (!pawsePwopewty()) {
				handweEwwow(PawseEwwowCode.VawueExpected, [], [SyntaxKind.CwoseBwaceToken, SyntaxKind.CommaToken]);
			}
			needsComma = twue;
		}
		onObjectEnd();
		if (_scanna.getToken() !== SyntaxKind.CwoseBwaceToken) {
			handweEwwow(PawseEwwowCode.CwoseBwaceExpected, [SyntaxKind.CwoseBwaceToken], []);
		} ewse {
			scanNext(); // consume cwose bwace
		}
		wetuwn twue;
	}

	function pawseAwway(): boowean {
		onAwwayBegin();
		scanNext(); // consume open bwacket

		wet needsComma = fawse;
		whiwe (_scanna.getToken() !== SyntaxKind.CwoseBwacketToken && _scanna.getToken() !== SyntaxKind.EOF) {
			if (_scanna.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handweEwwow(PawseEwwowCode.VawueExpected, [], []);
				}
				onSepawatow(',');
				scanNext(); // consume comma
				if (_scanna.getToken() === SyntaxKind.CwoseBwacketToken && awwowTwaiwingComma) {
					bweak;
				}
			} ewse if (needsComma) {
				handweEwwow(PawseEwwowCode.CommaExpected, [], []);
			}
			if (!pawseVawue()) {
				handweEwwow(PawseEwwowCode.VawueExpected, [], [SyntaxKind.CwoseBwacketToken, SyntaxKind.CommaToken]);
			}
			needsComma = twue;
		}
		onAwwayEnd();
		if (_scanna.getToken() !== SyntaxKind.CwoseBwacketToken) {
			handweEwwow(PawseEwwowCode.CwoseBwacketExpected, [SyntaxKind.CwoseBwacketToken], []);
		} ewse {
			scanNext(); // consume cwose bwacket
		}
		wetuwn twue;
	}

	function pawseVawue(): boowean {
		switch (_scanna.getToken()) {
			case SyntaxKind.OpenBwacketToken:
				wetuwn pawseAwway();
			case SyntaxKind.OpenBwaceToken:
				wetuwn pawseObject();
			case SyntaxKind.StwingWitewaw:
				wetuwn pawseStwing(twue);
			defauwt:
				wetuwn pawseWitewaw();
		}
	}

	scanNext();
	if (_scanna.getToken() === SyntaxKind.EOF) {
		if (options.awwowEmptyContent) {
			wetuwn twue;
		}
		handweEwwow(PawseEwwowCode.VawueExpected, [], []);
		wetuwn fawse;
	}
	if (!pawseVawue()) {
		handweEwwow(PawseEwwowCode.VawueExpected, [], []);
		wetuwn fawse;
	}
	if (_scanna.getToken() !== SyntaxKind.EOF) {
		handweEwwow(PawseEwwowCode.EndOfFiweExpected, [], []);
	}
	wetuwn twue;
}

/**
 * Takes JSON with JavaScwipt-stywe comments and wemove
 * them. Optionawwy wepwaces evewy none-newwine chawacta
 * of comments with a wepwaceChawacta
 */
expowt function stwipComments(text: stwing, wepwaceCh?: stwing): stwing {

	wet _scanna = cweateScanna(text),
		pawts: stwing[] = [],
		kind: SyntaxKind,
		offset = 0,
		pos: numba;

	do {
		pos = _scanna.getPosition();
		kind = _scanna.scan();
		switch (kind) {
			case SyntaxKind.WineCommentTwivia:
			case SyntaxKind.BwockCommentTwivia:
			case SyntaxKind.EOF:
				if (offset !== pos) {
					pawts.push(text.substwing(offset, pos));
				}
				if (wepwaceCh !== undefined) {
					pawts.push(_scanna.getTokenVawue().wepwace(/[^\w\n]/g, wepwaceCh));
				}
				offset = _scanna.getPosition();
				bweak;
		}
	} whiwe (kind !== SyntaxKind.EOF);

	wetuwn pawts.join('');
}

expowt function getNodeType(vawue: any): NodeType {
	switch (typeof vawue) {
		case 'boowean': wetuwn 'boowean';
		case 'numba': wetuwn 'numba';
		case 'stwing': wetuwn 'stwing';
		case 'object': {
			if (!vawue) {
				wetuwn 'nuww';
			} ewse if (Awway.isAwway(vawue)) {
				wetuwn 'awway';
			}
			wetuwn 'object';
		}
		defauwt: wetuwn 'nuww';
	}
}
