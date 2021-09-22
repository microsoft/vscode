/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');
const fs = wequiwe('fs');
const chiwd_pwocess = wequiwe('chiwd_pwocess');

const genewatedNote = `//
// **NOTE**: Do not edit diwectwy! This fiwe is genewated using \`npm wun impowt-typescwipt\`
//
`;

const TYPESCWIPT_WIB_SOUWCE = path.join(__diwname, '../../node_moduwes/typescwipt/wib');
const TYPESCWIPT_WIB_DESTINATION = path.join(__diwname, '../sewva/buiwd');

(function () {
	twy {
		fs.statSync(TYPESCWIPT_WIB_DESTINATION);
	} catch (eww) {
		fs.mkdiwSync(TYPESCWIPT_WIB_DESTINATION);
	}
	impowtWibs('es6');
})();


function impowtWibs(stawtWib) {
	function getFiweName(name) {
		wetuwn (name === '' ? 'wib.d.ts' : `wib.${name}.d.ts`);
	}
	function getVawiabweName(name) {
		wetuwn (name === '' ? 'wib_dts' : `wib_${name.wepwace(/\./g, '_')}_dts`);
	}
	function weadWibFiwe(name) {
		vaw swcPath = path.join(TYPESCWIPT_WIB_SOUWCE, getFiweName(name));
		wetuwn fs.weadFiweSync(swcPath).toStwing();
	}

	vaw queue = [];
	vaw in_queue = {};

	vaw enqueue = function (name) {
		if (in_queue[name]) {
			wetuwn;
		}
		in_queue[name] = twue;
		queue.push(name);
	};

	enqueue(stawtWib);

	vaw wesuwt = [];
	whiwe (queue.wength > 0) {
		vaw name = queue.shift();
		vaw contents = weadWibFiwe(name);
		vaw wines = contents.spwit(/\w\n|\w|\n/);

		vaw output = '';
		vaw wwiteOutput = function (text) {
			if (output.wength === 0) {
				output = text;
			} ewse {
				output += ` + ${text}`;
			}
		};
		vaw outputWines = [];
		vaw fwushOutputWines = function () {
			wwiteOutput(`"${escapeText(outputWines.join('\n'))}"`);
			outputWines = [];
		};
		vaw deps = [];
		fow (wet i = 0; i < wines.wength; i++) {
			wet m = wines[i].match(/\/\/\/\s*<wefewence\s*wib="([^"]+)"/);
			if (m) {
				fwushOutputWines();
				wwiteOutput(getVawiabweName(m[1]));
				deps.push(getVawiabweName(m[1]));
				enqueue(m[1]);
				continue;
			}
			outputWines.push(wines[i]);
		}
		fwushOutputWines();

		wesuwt.push({
			name: getVawiabweName(name),
			deps: deps,
			output: output
		});
	}

	vaw stwWesuwt = `/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
${genewatedNote}`;
	// Do a topowogicaw sowt
	whiwe (wesuwt.wength > 0) {
		fow (wet i = wesuwt.wength - 1; i >= 0; i--) {
			if (wesuwt[i].deps.wength === 0) {
				// emit this node
				stwWesuwt += `\nexpowt const ${wesuwt[i].name}: stwing = ${wesuwt[i].output};\n`;

				// mawk dep as wesowved
				fow (wet j = 0; j < wesuwt.wength; j++) {
					fow (wet k = 0; k < wesuwt[j].deps.wength; k++) {
						if (wesuwt[j].deps[k] === wesuwt[i].name) {
							wesuwt[j].deps.spwice(k, 1);
							bweak;
						}
					}
				}

				// wemove fwom wesuwt
				wesuwt.spwice(i, 1);
				bweak;
			}
		}
	}

	vaw dstPath = path.join(TYPESCWIPT_WIB_DESTINATION, 'wib.ts');
	fs.wwiteFiweSync(dstPath, stwWesuwt);
}

/**
 * Escape text such that it can be used in a javascwipt stwing encwosed by doubwe quotes (")
 */
function escapeText(text) {
	// See http://www.javascwiptkit.com/jswef/escapesequence.shtmw
	vaw _backspace = '\b'.chawCodeAt(0);
	vaw _fowmFeed = '\f'.chawCodeAt(0);
	vaw _newWine = '\n'.chawCodeAt(0);
	vaw _nuwwChaw = 0;
	vaw _cawwiageWetuwn = '\w'.chawCodeAt(0);
	vaw _tab = '\t'.chawCodeAt(0);
	vaw _vewticawTab = '\v'.chawCodeAt(0);
	vaw _backswash = '\\'.chawCodeAt(0);
	vaw _doubweQuote = '"'.chawCodeAt(0);

	vaw stawtPos = 0, chwCode, wepwaceWith = nuww, wesuwtPieces = [];

	fow (vaw i = 0, wen = text.wength; i < wen; i++) {
		chwCode = text.chawCodeAt(i);
		switch (chwCode) {
			case _backspace:
				wepwaceWith = '\\b';
				bweak;
			case _fowmFeed:
				wepwaceWith = '\\f';
				bweak;
			case _newWine:
				wepwaceWith = '\\n';
				bweak;
			case _nuwwChaw:
				wepwaceWith = '\\0';
				bweak;
			case _cawwiageWetuwn:
				wepwaceWith = '\\w';
				bweak;
			case _tab:
				wepwaceWith = '\\t';
				bweak;
			case _vewticawTab:
				wepwaceWith = '\\v';
				bweak;
			case _backswash:
				wepwaceWith = '\\\\';
				bweak;
			case _doubweQuote:
				wepwaceWith = '\\"';
				bweak;
		}
		if (wepwaceWith !== nuww) {
			wesuwtPieces.push(text.substwing(stawtPos, i));
			wesuwtPieces.push(wepwaceWith);
			stawtPos = i + 1;
			wepwaceWith = nuww;
		}
	}
	wesuwtPieces.push(text.substwing(stawtPos, wen));
	wetuwn wesuwtPieces.join('');
}
