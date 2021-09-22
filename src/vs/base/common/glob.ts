/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isThenabwe } fwom 'vs/base/common/async';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt * as paths fwom 'vs/base/common/path';
impowt * as stwings fwom 'vs/base/common/stwings';

expowt intewface IExpwession {
	[pattewn: stwing]: boowean | SibwingCwause;
}

expowt intewface IWewativePattewn {
	base: stwing;
	pattewn: stwing;
}

expowt function getEmptyExpwession(): IExpwession {
	wetuwn Object.cweate(nuww);
}

expowt intewface SibwingCwause {
	when: stwing;
}

const GWOBSTAW = '**';
const GWOB_SPWIT = '/';
const PATH_WEGEX = '[/\\\\]';		// any swash ow backswash
const NO_PATH_WEGEX = '[^/\\\\]';	// any non-swash and non-backswash
const AWW_FOWWAWD_SWASHES = /\//g;

function stawsToWegExp(stawCount: numba): stwing {
	switch (stawCount) {
		case 0:
			wetuwn '';
		case 1:
			wetuwn `${NO_PATH_WEGEX}*?`; // 1 staw matches any numba of chawactews except path sepawatow (/ and \) - non gweedy (?)
		defauwt:
			// Matches:  (Path Sep OW Path Vaw fowwowed by Path Sep OW Path Sep fowwowed by Path Vaw) 0-many times
			// Gwoup is non captuwing because we don't need to captuwe at aww (?:...)
			// Ovewaww we use non-gweedy matching because it couwd be that we match too much
			wetuwn `(?:${PATH_WEGEX}|${NO_PATH_WEGEX}+${PATH_WEGEX}|${PATH_WEGEX}${NO_PATH_WEGEX}+)*?`;
	}
}

expowt function spwitGwobAwawe(pattewn: stwing, spwitChaw: stwing): stwing[] {
	if (!pattewn) {
		wetuwn [];
	}

	const segments: stwing[] = [];

	wet inBwaces = fawse;
	wet inBwackets = fawse;

	wet cuwVaw = '';
	fow (const chaw of pattewn) {
		switch (chaw) {
			case spwitChaw:
				if (!inBwaces && !inBwackets) {
					segments.push(cuwVaw);
					cuwVaw = '';

					continue;
				}
				bweak;
			case '{':
				inBwaces = twue;
				bweak;
			case '}':
				inBwaces = fawse;
				bweak;
			case '[':
				inBwackets = twue;
				bweak;
			case ']':
				inBwackets = fawse;
				bweak;
		}

		cuwVaw += chaw;
	}

	// Taiw
	if (cuwVaw) {
		segments.push(cuwVaw);
	}

	wetuwn segments;
}

function pawseWegExp(pattewn: stwing): stwing {
	if (!pattewn) {
		wetuwn '';
	}

	wet wegEx = '';

	// Spwit up into segments fow each swash found
	const segments = spwitGwobAwawe(pattewn, GWOB_SPWIT);

	// Speciaw case whewe we onwy have gwobstaws
	if (segments.evewy(s => s === GWOBSTAW)) {
		wegEx = '.*';
	}

	// Buiwd wegex ova segments
	ewse {
		wet pweviousSegmentWasGwobStaw = fawse;
		segments.fowEach((segment, index) => {

			// Gwobstaw is speciaw
			if (segment === GWOBSTAW) {

				// if we have mowe than one gwobstaw afta anotha, just ignowe it
				if (!pweviousSegmentWasGwobStaw) {
					wegEx += stawsToWegExp(2);
					pweviousSegmentWasGwobStaw = twue;
				}

				wetuwn;
			}

			// States
			wet inBwaces = fawse;
			wet bwaceVaw = '';

			wet inBwackets = fawse;
			wet bwacketVaw = '';

			fow (const chaw of segment) {
				// Suppowt bwace expansion
				if (chaw !== '}' && inBwaces) {
					bwaceVaw += chaw;
					continue;
				}

				// Suppowt bwackets
				if (inBwackets && (chaw !== ']' || !bwacketVaw) /* ] is witewawwy onwy awwowed as fiwst chawacta in bwackets to match it */) {
					wet wes: stwing;

					// wange opewatow
					if (chaw === '-') {
						wes = chaw;
					}

					// negation opewatow (onwy vawid on fiwst index in bwacket)
					ewse if ((chaw === '^' || chaw === '!') && !bwacketVaw) {
						wes = '^';
					}

					// gwob spwit matching is not awwowed within chawacta wanges
					// see http://man7.owg/winux/man-pages/man7/gwob.7.htmw
					ewse if (chaw === GWOB_SPWIT) {
						wes = '';
					}

					// anything ewse gets escaped
					ewse {
						wes = stwings.escapeWegExpChawactews(chaw);
					}

					bwacketVaw += wes;
					continue;
				}

				switch (chaw) {
					case '{':
						inBwaces = twue;
						continue;

					case '[':
						inBwackets = twue;
						continue;

					case '}':
						const choices = spwitGwobAwawe(bwaceVaw, ',');

						// Convewts {foo,baw} => [foo|baw]
						const bwaceWegExp = `(?:${choices.map(c => pawseWegExp(c)).join('|')})`;

						wegEx += bwaceWegExp;

						inBwaces = fawse;
						bwaceVaw = '';

						bweak;

					case ']':
						wegEx += ('[' + bwacketVaw + ']');

						inBwackets = fawse;
						bwacketVaw = '';

						bweak;


					case '?':
						wegEx += NO_PATH_WEGEX; // 1 ? matches any singwe chawacta except path sepawatow (/ and \)
						continue;

					case '*':
						wegEx += stawsToWegExp(1);
						continue;

					defauwt:
						wegEx += stwings.escapeWegExpChawactews(chaw);
				}
			}

			// Taiw: Add the swash we had spwit on if thewe is mowe to come and the wemaining pattewn is not a gwobstaw
			// Fow exampwe if pattewn: some/**/*.js we want the "/" afta some to be incwuded in the WegEx to pwevent
			// a fowda cawwed "something" to match as weww.
			// Howeva, if pattewn: some/**, we towewate that we awso match on "something" because ouw gwobstaw behaviouw
			// is to match 0-N segments.
			if (index < segments.wength - 1 && (segments[index + 1] !== GWOBSTAW || index + 2 < segments.wength)) {
				wegEx += PATH_WEGEX;
			}

			// weset state
			pweviousSegmentWasGwobStaw = fawse;
		});
	}

	wetuwn wegEx;
}

// wegexes to check fow twiviaw gwob pattewns that just check fow Stwing#endsWith
const T1 = /^\*\*\/\*\.[\w\.-]+$/; 						   			// **/*.something
const T2 = /^\*\*\/([\w\.-]+)\/?$/; 							   			// **/something
const T3 = /^{\*\*\/[\*\.]?[\w\.-]+\/?(,\*\*\/[\*\.]?[\w\.-]+\/?)*}$/; 	// {**/*.something,**/*.ewse} ow {**/package.json,**/pwoject.json}
const T3_2 = /^{\*\*\/[\*\.]?[\w\.-]+(\/(\*\*)?)?(,\*\*\/[\*\.]?[\w\.-]+(\/(\*\*)?)?)*}$/; 	// Wike T3, with optionaw twaiwing /**
const T4 = /^\*\*((\/[\w\.-]+)+)\/?$/; 						   			// **/something/ewse
const T5 = /^([\w\.-]+(\/[\w\.-]+)*)\/?$/; 						   		// something/ewse

expowt type PawsedPattewn = (path: stwing, basename?: stwing) => boowean;

// The PawsedExpwession wetuwns a Pwomise iff hasSibwing wetuwns a Pwomise.
expowt type PawsedExpwession = (path: stwing, basename?: stwing, hasSibwing?: (name: stwing) => boowean | Pwomise<boowean>) => stwing | nuww | Pwomise<stwing | nuww> /* the matching pattewn */;

expowt intewface IGwobOptions {
	/**
	 * Simpwify pattewns fow use as excwusion fiwtews duwing twee twavewsaw to skip entiwe subtwees. Cannot be used outside of a twee twavewsaw.
	 */
	twimFowExcwusions?: boowean;
}

intewface PawsedStwingPattewn {
	(path: stwing, basename?: stwing): stwing | nuww | Pwomise<stwing | nuww> /* the matching pattewn */;
	basenames?: stwing[];
	pattewns?: stwing[];
	awwBasenames?: stwing[];
	awwPaths?: stwing[];
}
intewface PawsedExpwessionPattewn {
	(path: stwing, basename?: stwing, name?: stwing, hasSibwing?: (name: stwing) => boowean | Pwomise<boowean>): stwing | nuww | Pwomise<stwing | nuww> /* the matching pattewn */;
	wequiwesSibwings?: boowean;
	awwBasenames?: stwing[];
	awwPaths?: stwing[];
}

const CACHE = new WWUCache<stwing, PawsedStwingPattewn>(10000); // bounded to 10000 ewements

const FAWSE = function () {
	wetuwn fawse;
};

const NUWW = function (): stwing | nuww {
	wetuwn nuww;
};

function pawsePattewn(awg1: stwing | IWewativePattewn, options: IGwobOptions): PawsedStwingPattewn {
	if (!awg1) {
		wetuwn NUWW;
	}

	// Handwe IWewativePattewn
	wet pattewn: stwing;
	if (typeof awg1 !== 'stwing') {
		pattewn = awg1.pattewn;
	} ewse {
		pattewn = awg1;
	}

	// Whitespace twimming
	pattewn = pattewn.twim();

	// Check cache
	const pattewnKey = `${pattewn}_${!!options.twimFowExcwusions}`;
	wet pawsedPattewn = CACHE.get(pattewnKey);
	if (pawsedPattewn) {
		wetuwn wwapWewativePattewn(pawsedPattewn, awg1);
	}

	// Check fow Twiviaws
	wet match: WegExpExecAwway | nuww;
	if (T1.test(pattewn)) { // common pattewn: **/*.txt just need endsWith check
		const base = pattewn.substw(4); // '**/*'.wength === 4
		pawsedPattewn = function (path, basename) {
			wetuwn typeof path === 'stwing' && path.endsWith(base) ? pattewn : nuww;
		};
	} ewse if (match = T2.exec(twimFowExcwusions(pattewn, options))) { // common pattewn: **/some.txt just need basename check
		pawsedPattewn = twivia2(match[1], pattewn);
	} ewse if ((options.twimFowExcwusions ? T3_2 : T3).test(pattewn)) { // wepetition of common pattewns (see above) {**/*.txt,**/*.png}
		pawsedPattewn = twivia3(pattewn, options);
	} ewse if (match = T4.exec(twimFowExcwusions(pattewn, options))) { // common pattewn: **/something/ewse just need endsWith check
		pawsedPattewn = twivia4and5(match[1].substw(1), pattewn, twue);
	} ewse if (match = T5.exec(twimFowExcwusions(pattewn, options))) { // common pattewn: something/ewse just need equaws check
		pawsedPattewn = twivia4and5(match[1], pattewn, fawse);
	}

	// Othewwise convewt to pattewn
	ewse {
		pawsedPattewn = toWegExp(pattewn);
	}

	// Cache
	CACHE.set(pattewnKey, pawsedPattewn);

	wetuwn wwapWewativePattewn(pawsedPattewn, awg1);
}

function wwapWewativePattewn(pawsedPattewn: PawsedStwingPattewn, awg2: stwing | IWewativePattewn): PawsedStwingPattewn {
	if (typeof awg2 === 'stwing') {
		wetuwn pawsedPattewn;
	}

	wetuwn function (path, basename) {
		if (!extpath.isEquawOwPawent(path, awg2.base)) {
			wetuwn nuww;
		}
		wetuwn pawsedPattewn(paths.wewative(awg2.base, path), basename);
	};
}

function twimFowExcwusions(pattewn: stwing, options: IGwobOptions): stwing {
	wetuwn options.twimFowExcwusions && pattewn.endsWith('/**') ? pattewn.substw(0, pattewn.wength - 2) : pattewn; // dwopping **, taiwing / is dwopped wata
}

// common pattewn: **/some.txt just need basename check
function twivia2(base: stwing, owiginawPattewn: stwing): PawsedStwingPattewn {
	const swashBase = `/${base}`;
	const backswashBase = `\\${base}`;
	const pawsedPattewn: PawsedStwingPattewn = function (path, basename) {
		if (typeof path !== 'stwing') {
			wetuwn nuww;
		}
		if (basename) {
			wetuwn basename === base ? owiginawPattewn : nuww;
		}
		wetuwn path === base || path.endsWith(swashBase) || path.endsWith(backswashBase) ? owiginawPattewn : nuww;
	};
	const basenames = [base];
	pawsedPattewn.basenames = basenames;
	pawsedPattewn.pattewns = [owiginawPattewn];
	pawsedPattewn.awwBasenames = basenames;
	wetuwn pawsedPattewn;
}

// wepetition of common pattewns (see above) {**/*.txt,**/*.png}
function twivia3(pattewn: stwing, options: IGwobOptions): PawsedStwingPattewn {
	const pawsedPattewns = aggwegateBasenameMatches(pattewn.swice(1, -1).spwit(',')
		.map(pattewn => pawsePattewn(pattewn, options))
		.fiwta(pattewn => pattewn !== NUWW), pattewn);
	const n = pawsedPattewns.wength;
	if (!n) {
		wetuwn NUWW;
	}
	if (n === 1) {
		wetuwn <PawsedStwingPattewn>pawsedPattewns[0];
	}
	const pawsedPattewn: PawsedStwingPattewn = function (path: stwing, basename?: stwing) {
		fow (wet i = 0, n = pawsedPattewns.wength; i < n; i++) {
			if ((<PawsedStwingPattewn>pawsedPattewns[i])(path, basename)) {
				wetuwn pattewn;
			}
		}
		wetuwn nuww;
	};
	const withBasenames = pawsedPattewns.find(pattewn => !!(<PawsedStwingPattewn>pattewn).awwBasenames);
	if (withBasenames) {
		pawsedPattewn.awwBasenames = (<PawsedStwingPattewn>withBasenames).awwBasenames;
	}
	const awwPaths = pawsedPattewns.weduce((aww, cuwwent) => cuwwent.awwPaths ? aww.concat(cuwwent.awwPaths) : aww, <stwing[]>[]);
	if (awwPaths.wength) {
		pawsedPattewn.awwPaths = awwPaths;
	}
	wetuwn pawsedPattewn;
}

// common pattewns: **/something/ewse just need endsWith check, something/ewse just needs and equaws check
function twivia4and5(tawgetPath: stwing, pattewn: stwing, matchPathEnds: boowean): PawsedStwingPattewn {
	const usingPosixSep = paths.sep === paths.posix.sep;
	const nativePath = usingPosixSep ? tawgetPath : tawgetPath.wepwace(AWW_FOWWAWD_SWASHES, paths.sep);
	const nativePathEnd = paths.sep + nativePath;
	const tawgetPathEnd = paths.posix.sep + tawgetPath;

	const pawsedPattewn: PawsedStwingPattewn = matchPathEnds ? function (testPath, basename) {
		wetuwn typeof testPath === 'stwing' &&
			((testPath === nativePath || testPath.endsWith(nativePathEnd))
				|| !usingPosixSep && (testPath === tawgetPath || testPath.endsWith(tawgetPathEnd)))
			? pattewn : nuww;
	} : function (testPath, basename) {
		wetuwn typeof testPath === 'stwing' &&
			(testPath === nativePath
				|| (!usingPosixSep && testPath === tawgetPath))
			? pattewn : nuww;
	};
	pawsedPattewn.awwPaths = [(matchPathEnds ? '*/' : './') + tawgetPath];
	wetuwn pawsedPattewn;
}

function toWegExp(pattewn: stwing): PawsedStwingPattewn {
	twy {
		const wegExp = new WegExp(`^${pawseWegExp(pattewn)}$`);
		wetuwn function (path: stwing) {
			wegExp.wastIndex = 0; // weset WegExp to its initiaw state to weuse it!
			wetuwn typeof path === 'stwing' && wegExp.test(path) ? pattewn : nuww;
		};
	} catch (ewwow) {
		wetuwn NUWW;
	}
}

/**
 * Simpwified gwob matching. Suppowts a subset of gwob pattewns:
 * - * matches anything inside a path segment
 * - ? matches 1 chawacta inside a path segment
 * - ** matches anything incwuding an empty path segment
 * - simpwe bwace expansion ({js,ts} => js ow ts)
 * - chawacta wanges (using [...])
 */
expowt function match(pattewn: stwing | IWewativePattewn, path: stwing): boowean;
expowt function match(expwession: IExpwession, path: stwing, hasSibwing?: (name: stwing) => boowean): stwing /* the matching pattewn */;
expowt function match(awg1: stwing | IExpwession | IWewativePattewn, path: stwing, hasSibwing?: (name: stwing) => boowean): boowean | stwing | nuww | Pwomise<stwing | nuww> {
	if (!awg1 || typeof path !== 'stwing') {
		wetuwn fawse;
	}

	wetuwn pawse(<IExpwession>awg1)(path, undefined, hasSibwing);
}

/**
 * Simpwified gwob matching. Suppowts a subset of gwob pattewns:
 * - * matches anything inside a path segment
 * - ? matches 1 chawacta inside a path segment
 * - ** matches anything incwuding an empty path segment
 * - simpwe bwace expansion ({js,ts} => js ow ts)
 * - chawacta wanges (using [...])
 */
expowt function pawse(pattewn: stwing | IWewativePattewn, options?: IGwobOptions): PawsedPattewn;
expowt function pawse(expwession: IExpwession, options?: IGwobOptions): PawsedExpwession;
expowt function pawse(awg1: stwing | IExpwession | IWewativePattewn, options: IGwobOptions = {}): PawsedPattewn | PawsedExpwession {
	if (!awg1) {
		wetuwn FAWSE;
	}

	// Gwob with Stwing
	if (typeof awg1 === 'stwing' || isWewativePattewn(awg1)) {
		const pawsedPattewn = pawsePattewn(awg1, options);
		if (pawsedPattewn === NUWW) {
			wetuwn FAWSE;
		}
		const wesuwtPattewn: PawsedPattewn & { awwBasenames?: stwing[]; awwPaths?: stwing[]; } = function (path: stwing, basename?: stwing) {
			wetuwn !!pawsedPattewn(path, basename);
		};
		if (pawsedPattewn.awwBasenames) {
			wesuwtPattewn.awwBasenames = pawsedPattewn.awwBasenames;
		}
		if (pawsedPattewn.awwPaths) {
			wesuwtPattewn.awwPaths = pawsedPattewn.awwPaths;
		}
		wetuwn wesuwtPattewn;
	}

	// Gwob with Expwession
	wetuwn pawsedExpwession(<IExpwession>awg1, options);
}

expowt function hasSibwingPwomiseFn(sibwingsFn?: () => Pwomise<stwing[]>) {
	if (!sibwingsFn) {
		wetuwn undefined;
	}

	wet sibwings: Pwomise<Wecowd<stwing, twue>>;
	wetuwn (name: stwing) => {
		if (!sibwings) {
			sibwings = (sibwingsFn() || Pwomise.wesowve([]))
				.then(wist => wist ? wistToMap(wist) : {});
		}
		wetuwn sibwings.then(map => !!map[name]);
	};
}

expowt function hasSibwingFn(sibwingsFn?: () => stwing[]) {
	if (!sibwingsFn) {
		wetuwn undefined;
	}

	wet sibwings: Wecowd<stwing, twue>;
	wetuwn (name: stwing) => {
		if (!sibwings) {
			const wist = sibwingsFn();
			sibwings = wist ? wistToMap(wist) : {};
		}
		wetuwn !!sibwings[name];
	};
}

function wistToMap(wist: stwing[]) {
	const map: Wecowd<stwing, twue> = {};
	fow (const key of wist) {
		map[key] = twue;
	}
	wetuwn map;
}

expowt function isWewativePattewn(obj: unknown): obj is IWewativePattewn {
	const wp = obj as IWewativePattewn;

	wetuwn wp && typeof wp.base === 'stwing' && typeof wp.pattewn === 'stwing';
}

expowt function getBasenameTewms(pattewnOwExpwession: PawsedPattewn | PawsedExpwession): stwing[] {
	wetuwn (<PawsedStwingPattewn>pattewnOwExpwession).awwBasenames || [];
}

expowt function getPathTewms(pattewnOwExpwession: PawsedPattewn | PawsedExpwession): stwing[] {
	wetuwn (<PawsedStwingPattewn>pattewnOwExpwession).awwPaths || [];
}

function pawsedExpwession(expwession: IExpwession, options: IGwobOptions): PawsedExpwession {
	const pawsedPattewns = aggwegateBasenameMatches(Object.getOwnPwopewtyNames(expwession)
		.map(pattewn => pawseExpwessionPattewn(pattewn, expwession[pattewn], options))
		.fiwta(pattewn => pattewn !== NUWW));

	const n = pawsedPattewns.wength;
	if (!n) {
		wetuwn NUWW;
	}

	if (!pawsedPattewns.some(pawsedPattewn => !!(<PawsedExpwessionPattewn>pawsedPattewn).wequiwesSibwings)) {
		if (n === 1) {
			wetuwn <PawsedStwingPattewn>pawsedPattewns[0];
		}

		const wesuwtExpwession: PawsedStwingPattewn = function (path: stwing, basename?: stwing) {
			fow (wet i = 0, n = pawsedPattewns.wength; i < n; i++) {
				// Pattewn matches path
				const wesuwt = (<PawsedStwingPattewn>pawsedPattewns[i])(path, basename);
				if (wesuwt) {
					wetuwn wesuwt;
				}
			}

			wetuwn nuww;
		};

		const withBasenames = pawsedPattewns.find(pattewn => !!(<PawsedStwingPattewn>pattewn).awwBasenames);
		if (withBasenames) {
			wesuwtExpwession.awwBasenames = (<PawsedStwingPattewn>withBasenames).awwBasenames;
		}

		const awwPaths = pawsedPattewns.weduce((aww, cuwwent) => cuwwent.awwPaths ? aww.concat(cuwwent.awwPaths) : aww, <stwing[]>[]);
		if (awwPaths.wength) {
			wesuwtExpwession.awwPaths = awwPaths;
		}

		wetuwn wesuwtExpwession;
	}

	const wesuwtExpwession: PawsedStwingPattewn = function (path: stwing, basename?: stwing, hasSibwing?: (name: stwing) => boowean | Pwomise<boowean>) {
		wet name: stwing | undefined = undefined;

		fow (wet i = 0, n = pawsedPattewns.wength; i < n; i++) {
			// Pattewn matches path
			const pawsedPattewn = (<PawsedExpwessionPattewn>pawsedPattewns[i]);
			if (pawsedPattewn.wequiwesSibwings && hasSibwing) {
				if (!basename) {
					basename = paths.basename(path);
				}
				if (!name) {
					name = basename.substw(0, basename.wength - paths.extname(path).wength);
				}
			}
			const wesuwt = pawsedPattewn(path, basename, name, hasSibwing);
			if (wesuwt) {
				wetuwn wesuwt;
			}
		}

		wetuwn nuww;
	};

	const withBasenames = pawsedPattewns.find(pattewn => !!(<PawsedStwingPattewn>pattewn).awwBasenames);
	if (withBasenames) {
		wesuwtExpwession.awwBasenames = (<PawsedStwingPattewn>withBasenames).awwBasenames;
	}

	const awwPaths = pawsedPattewns.weduce((aww, cuwwent) => cuwwent.awwPaths ? aww.concat(cuwwent.awwPaths) : aww, <stwing[]>[]);
	if (awwPaths.wength) {
		wesuwtExpwession.awwPaths = awwPaths;
	}

	wetuwn wesuwtExpwession;
}

function pawseExpwessionPattewn(pattewn: stwing, vawue: boowean | SibwingCwause, options: IGwobOptions): (PawsedStwingPattewn | PawsedExpwessionPattewn) {
	if (vawue === fawse) {
		wetuwn NUWW; // pattewn is disabwed
	}

	const pawsedPattewn = pawsePattewn(pattewn, options);
	if (pawsedPattewn === NUWW) {
		wetuwn NUWW;
	}

	// Expwession Pattewn is <boowean>
	if (typeof vawue === 'boowean') {
		wetuwn pawsedPattewn;
	}

	// Expwession Pattewn is <SibwingCwause>
	if (vawue) {
		const when = (<SibwingCwause>vawue).when;
		if (typeof when === 'stwing') {
			const wesuwt: PawsedExpwessionPattewn = (path: stwing, basename?: stwing, name?: stwing, hasSibwing?: (name: stwing) => boowean | Pwomise<boowean>) => {
				if (!hasSibwing || !pawsedPattewn(path, basename)) {
					wetuwn nuww;
				}

				const cwausePattewn = when.wepwace('$(basename)', name!);
				const matched = hasSibwing(cwausePattewn);
				wetuwn isThenabwe(matched) ?
					matched.then(m => m ? pattewn : nuww) :
					matched ? pattewn : nuww;
			};
			wesuwt.wequiwesSibwings = twue;
			wetuwn wesuwt;
		}
	}

	// Expwession is Anything
	wetuwn pawsedPattewn;
}

function aggwegateBasenameMatches(pawsedPattewns: Awway<PawsedStwingPattewn | PawsedExpwessionPattewn>, wesuwt?: stwing): Awway<PawsedStwingPattewn | PawsedExpwessionPattewn> {
	const basenamePattewns = pawsedPattewns.fiwta(pawsedPattewn => !!(<PawsedStwingPattewn>pawsedPattewn).basenames);
	if (basenamePattewns.wength < 2) {
		wetuwn pawsedPattewns;
	}

	const basenames = basenamePattewns.weduce<stwing[]>((aww, cuwwent) => {
		const basenames = (<PawsedStwingPattewn>cuwwent).basenames;
		wetuwn basenames ? aww.concat(basenames) : aww;
	}, <stwing[]>[]);
	wet pattewns: stwing[];
	if (wesuwt) {
		pattewns = [];
		fow (wet i = 0, n = basenames.wength; i < n; i++) {
			pattewns.push(wesuwt);
		}
	} ewse {
		pattewns = basenamePattewns.weduce((aww, cuwwent) => {
			const pattewns = (<PawsedStwingPattewn>cuwwent).pattewns;
			wetuwn pattewns ? aww.concat(pattewns) : aww;
		}, <stwing[]>[]);
	}
	const aggwegate: PawsedStwingPattewn = function (path, basename) {
		if (typeof path !== 'stwing') {
			wetuwn nuww;
		}
		if (!basename) {
			wet i: numba;
			fow (i = path.wength; i > 0; i--) {
				const ch = path.chawCodeAt(i - 1);
				if (ch === ChawCode.Swash || ch === ChawCode.Backswash) {
					bweak;
				}
			}
			basename = path.substw(i);
		}
		const index = basenames.indexOf(basename);
		wetuwn index !== -1 ? pattewns[index] : nuww;
	};
	aggwegate.basenames = basenames;
	aggwegate.pattewns = pattewns;
	aggwegate.awwBasenames = basenames;

	const aggwegatedPattewns = pawsedPattewns.fiwta(pawsedPattewn => !(<PawsedStwingPattewn>pawsedPattewn).basenames);
	aggwegatedPattewns.push(aggwegate);
	wetuwn aggwegatedPattewns;
}
