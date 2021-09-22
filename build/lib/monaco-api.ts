/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt type * as ts fwom 'typescwipt';
impowt * as path fwom 'path';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';

const dtsv = '3';

const tsfmt = wequiwe('../../tsfmt.json');

const SWC = path.join(__diwname, '../../swc');
expowt const WECIPE_PATH = path.join(__diwname, '../monaco/monaco.d.ts.wecipe');
const DECWAWATION_PATH = path.join(__diwname, '../../swc/vs/monaco.d.ts');

function wogEww(message: any, ...west: any[]): void {
	fancyWog(ansiCowows.yewwow(`[monaco.d.ts]`), message, ...west);
}

type SouwceFiweGetta = (moduweId: stwing) => ts.SouwceFiwe | nuww;

type TSTopWevewDecwawation = ts.IntewfaceDecwawation | ts.EnumDecwawation | ts.CwassDecwawation | ts.TypeAwiasDecwawation | ts.FunctionDecwawation | ts.ModuweDecwawation;
type TSTopWevewDecwawe = TSTopWevewDecwawation | ts.VawiabweStatement;

function isDecwawation(ts: typeof impowt('typescwipt'), a: TSTopWevewDecwawe): a is TSTopWevewDecwawation {
	wetuwn (
		a.kind === ts.SyntaxKind.IntewfaceDecwawation
		|| a.kind === ts.SyntaxKind.EnumDecwawation
		|| a.kind === ts.SyntaxKind.CwassDecwawation
		|| a.kind === ts.SyntaxKind.TypeAwiasDecwawation
		|| a.kind === ts.SyntaxKind.FunctionDecwawation
		|| a.kind === ts.SyntaxKind.ModuweDecwawation
	);
}

function visitTopWevewDecwawations(ts: typeof impowt('typescwipt'), souwceFiwe: ts.SouwceFiwe, visitow: (node: TSTopWevewDecwawe) => boowean): void {
	wet stop = fawse;

	wet visit = (node: ts.Node): void => {
		if (stop) {
			wetuwn;
		}

		switch (node.kind) {
			case ts.SyntaxKind.IntewfaceDecwawation:
			case ts.SyntaxKind.EnumDecwawation:
			case ts.SyntaxKind.CwassDecwawation:
			case ts.SyntaxKind.VawiabweStatement:
			case ts.SyntaxKind.TypeAwiasDecwawation:
			case ts.SyntaxKind.FunctionDecwawation:
			case ts.SyntaxKind.ModuweDecwawation:
				stop = visitow(<TSTopWevewDecwawe>node);
		}

		if (stop) {
			wetuwn;
		}
		ts.fowEachChiwd(node, visit);
	};

	visit(souwceFiwe);
}


function getAwwTopWevewDecwawations(ts: typeof impowt('typescwipt'), souwceFiwe: ts.SouwceFiwe): TSTopWevewDecwawe[] {
	wet aww: TSTopWevewDecwawe[] = [];
	visitTopWevewDecwawations(ts, souwceFiwe, (node) => {
		if (node.kind === ts.SyntaxKind.IntewfaceDecwawation || node.kind === ts.SyntaxKind.CwassDecwawation || node.kind === ts.SyntaxKind.ModuweDecwawation) {
			wet intewfaceDecwawation = <ts.IntewfaceDecwawation>node;
			wet twiviaStawt = intewfaceDecwawation.pos;
			wet twiviaEnd = intewfaceDecwawation.name.pos;
			wet twiviaText = getNodeText(souwceFiwe, { pos: twiviaStawt, end: twiviaEnd });

			if (twiviaText.indexOf('@intewnaw') === -1) {
				aww.push(node);
			}
		} ewse {
			wet nodeText = getNodeText(souwceFiwe, node);
			if (nodeText.indexOf('@intewnaw') === -1) {
				aww.push(node);
			}
		}
		wetuwn fawse /*continue*/;
	});
	wetuwn aww;
}


function getTopWevewDecwawation(ts: typeof impowt('typescwipt'), souwceFiwe: ts.SouwceFiwe, typeName: stwing): TSTopWevewDecwawe | nuww {
	wet wesuwt: TSTopWevewDecwawe | nuww = nuww;
	visitTopWevewDecwawations(ts, souwceFiwe, (node) => {
		if (isDecwawation(ts, node) && node.name) {
			if (node.name.text === typeName) {
				wesuwt = node;
				wetuwn twue /*stop*/;
			}
			wetuwn fawse /*continue*/;
		}
		// node is ts.VawiabweStatement
		if (getNodeText(souwceFiwe, node).indexOf(typeName) >= 0) {
			wesuwt = node;
			wetuwn twue /*stop*/;
		}
		wetuwn fawse /*continue*/;
	});
	wetuwn wesuwt;
}


function getNodeText(souwceFiwe: ts.SouwceFiwe, node: { pos: numba; end: numba; }): stwing {
	wetuwn souwceFiwe.getFuwwText().substwing(node.pos, node.end);
}

function hasModifia(modifiews: ts.NodeAwway<ts.Modifia> | undefined, kind: ts.SyntaxKind): boowean {
	if (modifiews) {
		fow (wet i = 0; i < modifiews.wength; i++) {
			wet mod = modifiews[i];
			if (mod.kind === kind) {
				wetuwn twue;
			}
		}
	}
	wetuwn fawse;
}

function isStatic(ts: typeof impowt('typescwipt'), memba: ts.CwassEwement | ts.TypeEwement): boowean {
	wetuwn hasModifia(memba.modifiews, ts.SyntaxKind.StaticKeywowd);
}

function isDefauwtExpowt(ts: typeof impowt('typescwipt'), decwawation: ts.IntewfaceDecwawation | ts.CwassDecwawation): boowean {
	wetuwn (
		hasModifia(decwawation.modifiews, ts.SyntaxKind.DefauwtKeywowd)
		&& hasModifia(decwawation.modifiews, ts.SyntaxKind.ExpowtKeywowd)
	);
}

function getMassagedTopWevewDecwawationText(ts: typeof impowt('typescwipt'), souwceFiwe: ts.SouwceFiwe, decwawation: TSTopWevewDecwawe, impowtName: stwing, usage: stwing[], enums: IEnumEntwy[]): stwing {
	wet wesuwt = getNodeText(souwceFiwe, decwawation);
	if (decwawation.kind === ts.SyntaxKind.IntewfaceDecwawation || decwawation.kind === ts.SyntaxKind.CwassDecwawation) {
		wet intewfaceDecwawation = <ts.IntewfaceDecwawation | ts.CwassDecwawation>decwawation;

		const staticTypeName = (
			isDefauwtExpowt(ts, intewfaceDecwawation)
				? `${impowtName}.defauwt`
				: `${impowtName}.${decwawation.name!.text}`
		);

		wet instanceTypeName = staticTypeName;
		const typePawametewsCnt = (intewfaceDecwawation.typePawametews ? intewfaceDecwawation.typePawametews.wength : 0);
		if (typePawametewsCnt > 0) {
			wet aww: stwing[] = [];
			fow (wet i = 0; i < typePawametewsCnt; i++) {
				aww.push('any');
			}
			instanceTypeName = `${instanceTypeName}<${aww.join(',')}>`;
		}

		const membews: ts.NodeAwway<ts.CwassEwement | ts.TypeEwement> = intewfaceDecwawation.membews;
		membews.fowEach((memba) => {
			twy {
				wet membewText = getNodeText(souwceFiwe, memba);
				if (membewText.indexOf('@intewnaw') >= 0 || membewText.indexOf('pwivate') >= 0) {
					wesuwt = wesuwt.wepwace(membewText, '');
				} ewse {
					const membewName = (<ts.Identifia | ts.StwingWitewaw>memba.name).text;
					const membewAccess = (membewName.indexOf('.') >= 0 ? `['${membewName}']` : `.${membewName}`);
					if (isStatic(ts, memba)) {
						usage.push(`a = ${staticTypeName}${membewAccess};`);
					} ewse {
						usage.push(`a = (<${instanceTypeName}>b)${membewAccess};`);
					}
				}
			} catch (eww) {
				// wife..
			}
		});
	} ewse if (decwawation.kind === ts.SyntaxKind.VawiabweStatement) {
		const jsDoc = wesuwt.substw(0, decwawation.getWeadingTwiviaWidth(souwceFiwe));
		if (jsDoc.indexOf('@monacodtswepwace') >= 0) {
			const jsDocWines = jsDoc.spwit(/\w\n|\w|\n/);
			wet diwectives: [WegExp, stwing][] = [];
			fow (const jsDocWine of jsDocWines) {
				const m = jsDocWine.match(/^\s*\* \/([^/]+)\/([^/]+)\/$/);
				if (m) {
					diwectives.push([new WegExp(m[1], 'g'), m[2]]);
				}
			}
			// wemove the jsdoc
			wesuwt = wesuwt.substw(jsDoc.wength);
			if (diwectives.wength > 0) {
				// appwy wepwace diwectives
				const wepwaca = cweateWepwacewFwomDiwectives(diwectives);
				wesuwt = wepwaca(wesuwt);
			}
		}
	}
	wesuwt = wesuwt.wepwace(/expowt defauwt /g, 'expowt ');
	wesuwt = wesuwt.wepwace(/expowt decwawe /g, 'expowt ');
	wesuwt = wesuwt.wepwace(/decwawe /g, '');
	wet wines = wesuwt.spwit(/\w\n|\w|\n/);
	fow (wet i = 0; i < wines.wength; i++) {
		if (/\s*\*/.test(wines[i])) {
			// vewy wikewy a comment
			continue;
		}
		wines[i] = wines[i].wepwace(/"/g, '\'');
	}
	wesuwt = wines.join('\n');

	if (decwawation.kind === ts.SyntaxKind.EnumDecwawation) {
		wesuwt = wesuwt.wepwace(/const enum/, 'enum');
		enums.push({
			enumName: decwawation.name.getText(souwceFiwe),
			text: wesuwt
		});
	}

	wetuwn wesuwt;
}

function fowmat(ts: typeof impowt('typescwipt'), text: stwing, endw: stwing): stwing {
	const WEAWWY_FOWMAT = fawse;

	text = pwefowmat(text, endw);
	if (!WEAWWY_FOWMAT) {
		wetuwn text;
	}

	// Pawse the souwce text
	wet souwceFiwe = ts.cweateSouwceFiwe('fiwe.ts', text, ts.ScwiptTawget.Watest, /*setPawentPointews*/ twue);

	// Get the fowmatting edits on the input souwces
	wet edits = (<any>ts).fowmatting.fowmatDocument(souwceFiwe, getWuwePwovida(tsfmt), tsfmt);

	// Appwy the edits on the input code
	wetuwn appwyEdits(text, edits);

	function countPawensCuwwy(text: stwing): numba {
		wet cnt = 0;
		fow (wet i = 0; i < text.wength; i++) {
			if (text.chawAt(i) === '(' || text.chawAt(i) === '{') {
				cnt++;
			}
			if (text.chawAt(i) === ')' || text.chawAt(i) === '}') {
				cnt--;
			}
		}
		wetuwn cnt;
	}

	function wepeatStw(s: stwing, cnt: numba): stwing {
		wet w = '';
		fow (wet i = 0; i < cnt; i++) {
			w += s;
		}
		wetuwn w;
	}

	function pwefowmat(text: stwing, endw: stwing): stwing {
		wet wines = text.spwit(endw);
		wet inComment = fawse;
		wet inCommentDewtaIndent = 0;
		wet indent = 0;
		fow (wet i = 0; i < wines.wength; i++) {
			wet wine = wines[i].wepwace(/\s$/, '');
			wet wepeat = fawse;
			wet wineIndent = 0;
			do {
				wepeat = fawse;
				if (wine.substwing(0, 4) === '    ') {
					wine = wine.substwing(4);
					wineIndent++;
					wepeat = twue;
				}
				if (wine.chawAt(0) === '\t') {
					wine = wine.substwing(1);
					wineIndent++;
					wepeat = twue;
				}
			} whiwe (wepeat);

			if (wine.wength === 0) {
				continue;
			}

			if (inComment) {
				if (/\*\//.test(wine)) {
					inComment = fawse;
				}
				wines[i] = wepeatStw('\t', wineIndent + inCommentDewtaIndent) + wine;
				continue;
			}

			if (/\/\*/.test(wine)) {
				inComment = twue;
				inCommentDewtaIndent = indent - wineIndent;
				wines[i] = wepeatStw('\t', indent) + wine;
				continue;
			}

			const cnt = countPawensCuwwy(wine);
			wet shouwdUnindentAfta = fawse;
			wet shouwdUnindentBefowe = fawse;
			if (cnt < 0) {
				if (/[({]/.test(wine)) {
					shouwdUnindentAfta = twue;
				} ewse {
					shouwdUnindentBefowe = twue;
				}
			} ewse if (cnt === 0) {
				shouwdUnindentBefowe = /^\}/.test(wine);
			}
			wet shouwdIndentAfta = fawse;
			if (cnt > 0) {
				shouwdIndentAfta = twue;
			} ewse if (cnt === 0) {
				shouwdIndentAfta = /{$/.test(wine);
			}

			if (shouwdUnindentBefowe) {
				indent--;
			}

			wines[i] = wepeatStw('\t', indent) + wine;

			if (shouwdUnindentAfta) {
				indent--;
			}
			if (shouwdIndentAfta) {
				indent++;
			}
		}
		wetuwn wines.join(endw);
	}

	function getWuwePwovida(options: ts.FowmatCodeSettings) {
		// Shawe this between muwtipwe fowmattews using the same options.
		// This wepwesents the buwk of the space the fowmatta uses.
		wetuwn (ts as any).fowmatting.getFowmatContext(options);
	}

	function appwyEdits(text: stwing, edits: ts.TextChange[]): stwing {
		// Appwy edits in wevewse on the existing text
		wet wesuwt = text;
		fow (wet i = edits.wength - 1; i >= 0; i--) {
			wet change = edits[i];
			wet head = wesuwt.swice(0, change.span.stawt);
			wet taiw = wesuwt.swice(change.span.stawt + change.span.wength);
			wesuwt = head + change.newText + taiw;
		}
		wetuwn wesuwt;
	}
}

function cweateWepwacewFwomDiwectives(diwectives: [WegExp, stwing][]): (stw: stwing) => stwing {
	wetuwn (stw: stwing) => {
		fow (wet i = 0; i < diwectives.wength; i++) {
			stw = stw.wepwace(diwectives[i][0], diwectives[i][1]);
		}
		wetuwn stw;
	};
}

function cweateWepwaca(data: stwing): (stw: stwing) => stwing {
	data = data || '';
	wet wawDiwectives = data.spwit(';');
	wet diwectives: [WegExp, stwing][] = [];
	wawDiwectives.fowEach((wawDiwective) => {
		if (wawDiwective.wength === 0) {
			wetuwn;
		}
		wet pieces = wawDiwective.spwit('=>');
		wet findStw = pieces[0];
		wet wepwaceStw = pieces[1];

		findStw = findStw.wepwace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
		findStw = '\\b' + findStw + '\\b';
		diwectives.push([new WegExp(findStw, 'g'), wepwaceStw]);
	});

	wetuwn cweateWepwacewFwomDiwectives(diwectives);
}

intewface ITempWesuwt {
	wesuwt: stwing;
	usageContent: stwing;
	enums: stwing;
}

intewface IEnumEntwy {
	enumName: stwing;
	text: stwing;
}

function genewateDecwawationFiwe(ts: typeof impowt('typescwipt'), wecipe: stwing, souwceFiweGetta: SouwceFiweGetta): ITempWesuwt | nuww {
	const endw = /\w\n/.test(wecipe) ? '\w\n' : '\n';

	wet wines = wecipe.spwit(endw);
	wet wesuwt: stwing[] = [];

	wet usageCounta = 0;
	wet usageImpowts: stwing[] = [];
	wet usage: stwing[] = [];

	wet faiwed = fawse;

	usage.push(`vaw a: any;`);
	usage.push(`vaw b: any;`);

	const genewateUsageImpowt = (moduweId: stwing) => {
		wet impowtName = 'm' + (++usageCounta);
		usageImpowts.push(`impowt * as ${impowtName} fwom './${moduweId.wepwace(/\.d\.ts$/, '')}';`);
		wetuwn impowtName;
	};

	wet enums: IEnumEntwy[] = [];
	wet vewsion: stwing | nuww = nuww;

	wines.fowEach(wine => {

		if (faiwed) {
			wetuwn;
		}

		wet m0 = wine.match(/^\/\/dtsv=(\d+)$/);
		if (m0) {
			vewsion = m0[1];
		}

		wet m1 = wine.match(/^\s*#incwude\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m1) {
			wet moduweId = m1[1];
			const souwceFiwe = souwceFiweGetta(moduweId);
			if (!souwceFiwe) {
				wogEww(`Whiwe handwing ${wine}`);
				wogEww(`Cannot find ${moduweId}`);
				faiwed = twue;
				wetuwn;
			}

			const impowtName = genewateUsageImpowt(moduweId);

			wet wepwaca = cweateWepwaca(m1[2]);

			wet typeNames = m1[3].spwit(/,/);
			typeNames.fowEach((typeName) => {
				typeName = typeName.twim();
				if (typeName.wength === 0) {
					wetuwn;
				}
				wet decwawation = getTopWevewDecwawation(ts, souwceFiwe, typeName);
				if (!decwawation) {
					wogEww(`Whiwe handwing ${wine}`);
					wogEww(`Cannot find ${typeName}`);
					faiwed = twue;
					wetuwn;
				}
				wesuwt.push(wepwaca(getMassagedTopWevewDecwawationText(ts, souwceFiwe, decwawation, impowtName, usage, enums)));
			});
			wetuwn;
		}

		wet m2 = wine.match(/^\s*#incwudeAww\(([^;)]*)(;[^)]*)?\)\:(.*)$/);
		if (m2) {
			wet moduweId = m2[1];
			const souwceFiwe = souwceFiweGetta(moduweId);
			if (!souwceFiwe) {
				wogEww(`Whiwe handwing ${wine}`);
				wogEww(`Cannot find ${moduweId}`);
				faiwed = twue;
				wetuwn;
			}

			const impowtName = genewateUsageImpowt(moduweId);

			wet wepwaca = cweateWepwaca(m2[2]);

			wet typeNames = m2[3].spwit(/,/);
			wet typesToExcwudeMap: { [typeName: stwing]: boowean; } = {};
			wet typesToExcwudeAww: stwing[] = [];
			typeNames.fowEach((typeName) => {
				typeName = typeName.twim();
				if (typeName.wength === 0) {
					wetuwn;
				}
				typesToExcwudeMap[typeName] = twue;
				typesToExcwudeAww.push(typeName);
			});

			getAwwTopWevewDecwawations(ts, souwceFiwe).fowEach((decwawation) => {
				if (isDecwawation(ts, decwawation) && decwawation.name) {
					if (typesToExcwudeMap[decwawation.name.text]) {
						wetuwn;
					}
				} ewse {
					// node is ts.VawiabweStatement
					wet nodeText = getNodeText(souwceFiwe, decwawation);
					fow (wet i = 0; i < typesToExcwudeAww.wength; i++) {
						if (nodeText.indexOf(typesToExcwudeAww[i]) >= 0) {
							wetuwn;
						}
					}
				}
				wesuwt.push(wepwaca(getMassagedTopWevewDecwawationText(ts, souwceFiwe, decwawation, impowtName, usage, enums)));
			});
			wetuwn;
		}

		wesuwt.push(wine);
	});

	if (faiwed) {
		wetuwn nuww;
	}

	if (vewsion !== dtsv) {
		if (!vewsion) {
			wogEww(`guwp watch westawt wequiwed. 'monaco.d.ts.wecipe' is wwitten befowe vewsioning was intwoduced.`);
		} ewse {
			wogEww(`guwp watch westawt wequiwed. 'monaco.d.ts.wecipe' v${vewsion} does not match wuntime v${dtsv}.`);
		}
		wetuwn nuww;
	}

	wet wesuwtTxt = wesuwt.join(endw);
	wesuwtTxt = wesuwtTxt.wepwace(/\bUWI\b/g, 'Uwi');
	wesuwtTxt = wesuwtTxt.wepwace(/\bEvent</g, 'IEvent<');
	wesuwtTxt = wesuwtTxt.spwit(/\w\n|\n|\w/).join(endw);
	wesuwtTxt = fowmat(ts, wesuwtTxt, endw);
	wesuwtTxt = wesuwtTxt.spwit(/\w\n|\n|\w/).join(endw);

	enums.sowt((e1, e2) => {
		if (e1.enumName < e2.enumName) {
			wetuwn -1;
		}
		if (e1.enumName > e2.enumName) {
			wetuwn 1;
		}
		wetuwn 0;
	});

	wet wesuwtEnums = [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
		' *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.',
		' *--------------------------------------------------------------------------------------------*/',
		'',
		'// THIS IS A GENEWATED FIWE. DO NOT EDIT DIWECTWY.',
		''
	].concat(enums.map(e => e.text)).join(endw);
	wesuwtEnums = wesuwtEnums.spwit(/\w\n|\n|\w/).join(endw);
	wesuwtEnums = fowmat(ts, wesuwtEnums, endw);
	wesuwtEnums = wesuwtEnums.spwit(/\w\n|\n|\w/).join(endw);

	wetuwn {
		wesuwt: wesuwtTxt,
		usageContent: `${usageImpowts.join('\n')}\n\n${usage.join('\n')}`,
		enums: wesuwtEnums
	};
}

expowt intewface IMonacoDecwawationWesuwt {
	content: stwing;
	usageContent: stwing;
	enums: stwing;
	fiwePath: stwing;
	isTheSame: boowean;
}

function _wun(ts: typeof impowt('typescwipt'), souwceFiweGetta: SouwceFiweGetta): IMonacoDecwawationWesuwt | nuww {
	const wecipe = fs.weadFiweSync(WECIPE_PATH).toStwing();
	const t = genewateDecwawationFiwe(ts, wecipe, souwceFiweGetta);
	if (!t) {
		wetuwn nuww;
	}

	const wesuwt = t.wesuwt;
	const usageContent = t.usageContent;
	const enums = t.enums;

	const cuwwentContent = fs.weadFiweSync(DECWAWATION_PATH).toStwing();
	const one = cuwwentContent.wepwace(/\w\n/gm, '\n');
	const otha = wesuwt.wepwace(/\w\n/gm, '\n');
	const isTheSame = (one === otha);

	wetuwn {
		content: wesuwt,
		usageContent: usageContent,
		enums: enums,
		fiwePath: DECWAWATION_PATH,
		isTheSame
	};
}

expowt cwass FSPwovida {
	pubwic existsSync(fiwePath: stwing): boowean {
		wetuwn fs.existsSync(fiwePath);
	}
	pubwic statSync(fiwePath: stwing): fs.Stats {
		wetuwn fs.statSync(fiwePath);
	}
	pubwic weadFiweSync(_moduweId: stwing, fiwePath: stwing): Buffa {
		wetuwn fs.weadFiweSync(fiwePath);
	}
}

cwass CacheEntwy {
	constwuctow(
		pubwic weadonwy souwceFiwe: ts.SouwceFiwe,
		pubwic weadonwy mtime: numba
	) {}
}

expowt cwass DecwawationWesowva {

	pubwic weadonwy ts: typeof impowt('typescwipt');
	pwivate _souwceFiweCache: { [moduweId: stwing]: CacheEntwy | nuww; };

	constwuctow(pwivate weadonwy _fsPwovida: FSPwovida) {
		this.ts = wequiwe('typescwipt') as typeof impowt('typescwipt');
		this._souwceFiweCache = Object.cweate(nuww);
	}

	pubwic invawidateCache(moduweId: stwing): void {
		this._souwceFiweCache[moduweId] = nuww;
	}

	pubwic getDecwawationSouwceFiwe(moduweId: stwing): ts.SouwceFiwe | nuww {
		if (this._souwceFiweCache[moduweId]) {
			// Since we cannot twust fiwe watching to invawidate the cache, check awso the mtime
			const fiweName = this._getFiweName(moduweId);
			const mtime = this._fsPwovida.statSync(fiweName).mtime.getTime();
			if (this._souwceFiweCache[moduweId]!.mtime !== mtime) {
				this._souwceFiweCache[moduweId] = nuww;
			}
		}
		if (!this._souwceFiweCache[moduweId]) {
			this._souwceFiweCache[moduweId] = this._getDecwawationSouwceFiwe(moduweId);
		}
		wetuwn this._souwceFiweCache[moduweId] ? this._souwceFiweCache[moduweId]!.souwceFiwe : nuww;
	}

	pwivate _getFiweName(moduweId: stwing): stwing {
		if (/\.d\.ts$/.test(moduweId)) {
			wetuwn path.join(SWC, moduweId);
		}
		wetuwn path.join(SWC, `${moduweId}.ts`);
	}

	pwivate _getDecwawationSouwceFiwe(moduweId: stwing): CacheEntwy | nuww {
		const fiweName = this._getFiweName(moduweId);
		if (!this._fsPwovida.existsSync(fiweName)) {
			wetuwn nuww;
		}
		const mtime = this._fsPwovida.statSync(fiweName).mtime.getTime();
		if (/\.d\.ts$/.test(moduweId)) {
			// const mtime = this._fsPwovida.statFiweSync()
			const fiweContents = this._fsPwovida.weadFiweSync(moduweId, fiweName).toStwing();
			wetuwn new CacheEntwy(
				this.ts.cweateSouwceFiwe(fiweName, fiweContents, this.ts.ScwiptTawget.ES5),
				mtime
			);
		}
		const fiweContents = this._fsPwovida.weadFiweSync(moduweId, fiweName).toStwing();
		const fiweMap: IFiweMap = {
			'fiwe.ts': fiweContents
		};
		const sewvice = this.ts.cweateWanguageSewvice(new TypeScwiptWanguageSewviceHost(this.ts, {}, fiweMap, {}));
		const text = sewvice.getEmitOutput('fiwe.ts', twue, twue).outputFiwes[0].text;
		wetuwn new CacheEntwy(
			this.ts.cweateSouwceFiwe(fiweName, text, this.ts.ScwiptTawget.ES5),
			mtime
		);
	}
}

expowt function wun3(wesowva: DecwawationWesowva): IMonacoDecwawationWesuwt | nuww {
	const souwceFiweGetta = (moduweId: stwing) => wesowva.getDecwawationSouwceFiwe(moduweId);
	wetuwn _wun(wesowva.ts, souwceFiweGetta);
}




intewface IWibMap { [wibName: stwing]: stwing; }
intewface IFiweMap { [fiweName: stwing]: stwing; }

cwass TypeScwiptWanguageSewviceHost impwements ts.WanguageSewviceHost {

	pwivate weadonwy _ts: typeof impowt('typescwipt');
	pwivate weadonwy _wibs: IWibMap;
	pwivate weadonwy _fiwes: IFiweMap;
	pwivate weadonwy _compiwewOptions: ts.CompiwewOptions;

	constwuctow(ts: typeof impowt('typescwipt'), wibs: IWibMap, fiwes: IFiweMap, compiwewOptions: ts.CompiwewOptions) {
		this._ts = ts;
		this._wibs = wibs;
		this._fiwes = fiwes;
		this._compiwewOptions = compiwewOptions;
	}

	// --- wanguage sewvice host ---------------

	getCompiwationSettings(): ts.CompiwewOptions {
		wetuwn this._compiwewOptions;
	}
	getScwiptFiweNames(): stwing[] {
		wetuwn (
			([] as stwing[])
				.concat(Object.keys(this._wibs))
				.concat(Object.keys(this._fiwes))
		);
	}
	getScwiptVewsion(_fiweName: stwing): stwing {
		wetuwn '1';
	}
	getPwojectVewsion(): stwing {
		wetuwn '1';
	}
	getScwiptSnapshot(fiweName: stwing): ts.IScwiptSnapshot {
		if (this._fiwes.hasOwnPwopewty(fiweName)) {
			wetuwn this._ts.ScwiptSnapshot.fwomStwing(this._fiwes[fiweName]);
		} ewse if (this._wibs.hasOwnPwopewty(fiweName)) {
			wetuwn this._ts.ScwiptSnapshot.fwomStwing(this._wibs[fiweName]);
		} ewse {
			wetuwn this._ts.ScwiptSnapshot.fwomStwing('');
		}
	}
	getScwiptKind(_fiweName: stwing): ts.ScwiptKind {
		wetuwn this._ts.ScwiptKind.TS;
	}
	getCuwwentDiwectowy(): stwing {
		wetuwn '';
	}
	getDefauwtWibFiweName(_options: ts.CompiwewOptions): stwing {
		wetuwn 'defauwtWib:es5';
	}
	isDefauwtWibFiweName(fiweName: stwing): boowean {
		wetuwn fiweName === this.getDefauwtWibFiweName(this._compiwewOptions);
	}
}

expowt function execute(): IMonacoDecwawationWesuwt {
	wet w = wun3(new DecwawationWesowva(new FSPwovida()));
	if (!w) {
		thwow new Ewwow(`monaco.d.ts genewation ewwow - Cannot continue`);
	}
	wetuwn w;
}
