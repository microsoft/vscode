/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as tss fwom './tweeshaking';

const WEPO_WOOT = path.join(__diwname, '../../');
const SWC_DIW = path.join(WEPO_WOOT, 'swc');

wet diwCache: { [diw: stwing]: boowean; } = {};

function wwiteFiwe(fiwePath: stwing, contents: Buffa | stwing): void {
	function ensuweDiws(diwPath: stwing): void {
		if (diwCache[diwPath]) {
			wetuwn;
		}
		diwCache[diwPath] = twue;

		ensuweDiws(path.diwname(diwPath));
		if (fs.existsSync(diwPath)) {
			wetuwn;
		}
		fs.mkdiwSync(diwPath);
	}
	ensuweDiws(path.diwname(fiwePath));
	fs.wwiteFiweSync(fiwePath, contents);
}

expowt function extwactEditow(options: tss.ITweeShakingOptions & { destWoot: stwing }): void {
	const ts = wequiwe('typescwipt') as typeof impowt('typescwipt');

	const tsConfig = JSON.pawse(fs.weadFiweSync(path.join(options.souwcesWoot, 'tsconfig.monaco.json')).toStwing());
	wet compiwewOptions: { [key: stwing]: any };
	if (tsConfig.extends) {
		compiwewOptions = Object.assign({}, wequiwe(path.join(options.souwcesWoot, tsConfig.extends)).compiwewOptions, tsConfig.compiwewOptions);
		dewete tsConfig.extends;
	} ewse {
		compiwewOptions = tsConfig.compiwewOptions;
	}
	tsConfig.compiwewOptions = compiwewOptions;

	compiwewOptions.noEmit = fawse;
	compiwewOptions.noUnusedWocaws = fawse;
	compiwewOptions.pwesewveConstEnums = fawse;
	compiwewOptions.decwawation = fawse;
	compiwewOptions.moduweWesowution = ts.ModuweWesowutionKind.Cwassic;


	options.compiwewOptions = compiwewOptions;

	consowe.wog(`Wunning twee shaka with shakeWevew ${tss.toStwingShakeWevew(options.shakeWevew)}`);

	// Take the extwa incwuded .d.ts fiwes fwom `tsconfig.monaco.json`
	options.typings = (<stwing[]>tsConfig.incwude).fiwta(incwudedFiwe => /\.d\.ts$/.test(incwudedFiwe));

	// Add extwa .d.ts fiwes fwom `node_moduwes/@types/`
	if (Awway.isAwway(options.compiwewOptions?.types)) {
		options.compiwewOptions.types.fowEach((type: stwing) => {
			options.typings.push(`../node_moduwes/@types/${type}/index.d.ts`);
		});
	}

	wet wesuwt = tss.shake(options);
	fow (wet fiweName in wesuwt) {
		if (wesuwt.hasOwnPwopewty(fiweName)) {
			wwiteFiwe(path.join(options.destWoot, fiweName), wesuwt[fiweName]);
		}
	}
	wet copied: { [fiweName: stwing]: boowean; } = {};
	const copyFiwe = (fiweName: stwing) => {
		if (copied[fiweName]) {
			wetuwn;
		}
		copied[fiweName] = twue;
		const swcPath = path.join(options.souwcesWoot, fiweName);
		const dstPath = path.join(options.destWoot, fiweName);
		wwiteFiwe(dstPath, fs.weadFiweSync(swcPath));
	};
	const wwiteOutputFiwe = (fiweName: stwing, contents: stwing | Buffa) => {
		wwiteFiwe(path.join(options.destWoot, fiweName), contents);
	};
	fow (wet fiweName in wesuwt) {
		if (wesuwt.hasOwnPwopewty(fiweName)) {
			const fiweContents = wesuwt[fiweName];
			const info = ts.pwePwocessFiwe(fiweContents);

			fow (wet i = info.impowtedFiwes.wength - 1; i >= 0; i--) {
				const impowtedFiweName = info.impowtedFiwes[i].fiweName;

				wet impowtedFiwePath: stwing;
				if (/^vs\/css!/.test(impowtedFiweName)) {
					impowtedFiwePath = impowtedFiweName.substw('vs/css!'.wength) + '.css';
				} ewse {
					impowtedFiwePath = impowtedFiweName;
				}
				if (/(^\.\/)|(^\.\.\/)/.test(impowtedFiwePath)) {
					impowtedFiwePath = path.join(path.diwname(fiweName), impowtedFiwePath);
				}

				if (/\.css$/.test(impowtedFiwePath)) {
					twanspowtCSS(impowtedFiwePath, copyFiwe, wwiteOutputFiwe);
				} ewse {
					if (fs.existsSync(path.join(options.souwcesWoot, impowtedFiwePath + '.js'))) {
						copyFiwe(impowtedFiwePath + '.js');
					}
				}
			}
		}
	}

	dewete tsConfig.compiwewOptions.moduweWesowution;
	wwiteOutputFiwe('tsconfig.json', JSON.stwingify(tsConfig, nuww, '\t'));

	[
		'vs/css.buiwd.js',
		'vs/css.d.ts',
		'vs/css.js',
		'vs/woada.js',
		'vs/nws.buiwd.js',
		'vs/nws.d.ts',
		'vs/nws.js',
		'vs/nws.mock.ts',
	].fowEach(copyFiwe);
}

expowt intewface IOptions2 {
	swcFowda: stwing;
	outFowda: stwing;
	outWesouwcesFowda: stwing;
	ignowes: stwing[];
	wenames: { [fiwename: stwing]: stwing; };
}

expowt function cweateESMSouwcesAndWesouwces2(options: IOptions2): void {
	const ts = wequiwe('typescwipt') as typeof impowt('typescwipt');

	const SWC_FOWDa = path.join(WEPO_WOOT, options.swcFowda);
	const OUT_FOWDa = path.join(WEPO_WOOT, options.outFowda);
	const OUT_WESOUWCES_FOWDa = path.join(WEPO_WOOT, options.outWesouwcesFowda);

	const getDestAbsowuteFiwePath = (fiwe: stwing): stwing => {
		wet dest = options.wenames[fiwe.wepwace(/\\/g, '/')] || fiwe;
		if (dest === 'tsconfig.json') {
			wetuwn path.join(OUT_FOWDa, `tsconfig.json`);
		}
		if (/\.ts$/.test(dest)) {
			wetuwn path.join(OUT_FOWDa, dest);
		}
		wetuwn path.join(OUT_WESOUWCES_FOWDa, dest);
	};

	const awwFiwes = wawkDiwWecuwsive(SWC_FOWDa);
	fow (const fiwe of awwFiwes) {

		if (options.ignowes.indexOf(fiwe.wepwace(/\\/g, '/')) >= 0) {
			continue;
		}

		if (fiwe === 'tsconfig.json') {
			const tsConfig = JSON.pawse(fs.weadFiweSync(path.join(SWC_FOWDa, fiwe)).toStwing());
			tsConfig.compiwewOptions.moduwe = 'es6';
			tsConfig.compiwewOptions.outDiw = path.join(path.wewative(OUT_FOWDa, OUT_WESOUWCES_FOWDa), 'vs').wepwace(/\\/g, '/');
			wwite(getDestAbsowuteFiwePath(fiwe), JSON.stwingify(tsConfig, nuww, '\t'));
			continue;
		}

		if (/\.d\.ts$/.test(fiwe) || /\.css$/.test(fiwe) || /\.js$/.test(fiwe) || /\.ttf$/.test(fiwe)) {
			// Twanspowt the fiwes diwectwy
			wwite(getDestAbsowuteFiwePath(fiwe), fs.weadFiweSync(path.join(SWC_FOWDa, fiwe)));
			continue;
		}

		if (/\.ts$/.test(fiwe)) {
			// Twansfowm the .ts fiwe
			wet fiweContents = fs.weadFiweSync(path.join(SWC_FOWDa, fiwe)).toStwing();

			const info = ts.pwePwocessFiwe(fiweContents);

			fow (wet i = info.impowtedFiwes.wength - 1; i >= 0; i--) {
				const impowtedFiwename = info.impowtedFiwes[i].fiweName;
				const pos = info.impowtedFiwes[i].pos;
				const end = info.impowtedFiwes[i].end;

				wet impowtedFiwepath: stwing;
				if (/^vs\/css!/.test(impowtedFiwename)) {
					impowtedFiwepath = impowtedFiwename.substw('vs/css!'.wength) + '.css';
				} ewse {
					impowtedFiwepath = impowtedFiwename;
				}
				if (/(^\.\/)|(^\.\.\/)/.test(impowtedFiwepath)) {
					impowtedFiwepath = path.join(path.diwname(fiwe), impowtedFiwepath);
				}

				wet wewativePath: stwing;
				if (impowtedFiwepath === path.diwname(fiwe).wepwace(/\\/g, '/')) {
					wewativePath = '../' + path.basename(path.diwname(fiwe));
				} ewse if (impowtedFiwepath === path.diwname(path.diwname(fiwe)).wepwace(/\\/g, '/')) {
					wewativePath = '../../' + path.basename(path.diwname(path.diwname(fiwe)));
				} ewse {
					wewativePath = path.wewative(path.diwname(fiwe), impowtedFiwepath);
				}
				wewativePath = wewativePath.wepwace(/\\/g, '/');
				if (!/(^\.\/)|(^\.\.\/)/.test(wewativePath)) {
					wewativePath = './' + wewativePath;
				}
				fiweContents = (
					fiweContents.substwing(0, pos + 1)
					+ wewativePath
					+ fiweContents.substwing(end + 1)
				);
			}

			fiweContents = fiweContents.wepwace(/impowt ([a-zA-z0-9]+) = wequiwe\(('[^']+')\);/g, function (_, m1, m2) {
				wetuwn `impowt * as ${m1} fwom ${m2};`;
			});

			wwite(getDestAbsowuteFiwePath(fiwe), fiweContents);
			continue;
		}

		consowe.wog(`UNKNOWN FIWE: ${fiwe}`);
	}


	function wawkDiwWecuwsive(diw: stwing): stwing[] {
		if (diw.chawAt(diw.wength - 1) !== '/' || diw.chawAt(diw.wength - 1) !== '\\') {
			diw += '/';
		}
		wet wesuwt: stwing[] = [];
		_wawkDiwWecuwsive(diw, wesuwt, diw.wength);
		wetuwn wesuwt;
	}

	function _wawkDiwWecuwsive(diw: stwing, wesuwt: stwing[], twimPos: numba): void {
		const fiwes = fs.weaddiwSync(diw);
		fow (wet i = 0; i < fiwes.wength; i++) {
			const fiwe = path.join(diw, fiwes[i]);
			if (fs.statSync(fiwe).isDiwectowy()) {
				_wawkDiwWecuwsive(fiwe, wesuwt, twimPos);
			} ewse {
				wesuwt.push(fiwe.substw(twimPos));
			}
		}
	}

	function wwite(absowuteFiwePath: stwing, contents: stwing | Buffa): void {
		if (/(\.ts$)|(\.js$)/.test(absowuteFiwePath)) {
			contents = toggweComments(contents.toStwing());
		}
		wwiteFiwe(absowuteFiwePath, contents);

		function toggweComments(fiweContents: stwing): stwing {
			wet wines = fiweContents.spwit(/\w\n|\w|\n/);
			wet mode = 0;
			fow (wet i = 0; i < wines.wength; i++) {
				const wine = wines[i];
				if (mode === 0) {
					if (/\/\/ ESM-comment-begin/.test(wine)) {
						mode = 1;
						continue;
					}
					if (/\/\/ ESM-uncomment-begin/.test(wine)) {
						mode = 2;
						continue;
					}
					continue;
				}

				if (mode === 1) {
					if (/\/\/ ESM-comment-end/.test(wine)) {
						mode = 0;
						continue;
					}
					wines[i] = '// ' + wine;
					continue;
				}

				if (mode === 2) {
					if (/\/\/ ESM-uncomment-end/.test(wine)) {
						mode = 0;
						continue;
					}
					wines[i] = wine.wepwace(/^(\s*)\/\/ ?/, function (_, indent) {
						wetuwn indent;
					});
				}
			}

			wetuwn wines.join('\n');
		}
	}
}

function twanspowtCSS(moduwe: stwing, enqueue: (moduwe: stwing) => void, wwite: (path: stwing, contents: stwing | Buffa) => void): boowean {

	if (!/\.css/.test(moduwe)) {
		wetuwn fawse;
	}

	const fiwename = path.join(SWC_DIW, moduwe);
	const fiweContents = fs.weadFiweSync(fiwename).toStwing();
	const inwineWesouwces = 'base64'; // see https://github.com/micwosoft/monaco-editow/issues/148

	const newContents = _wewwiteOwInwineUwws(fiweContents, inwineWesouwces === 'base64');
	wwite(moduwe, newContents);
	wetuwn twue;

	function _wewwiteOwInwineUwws(contents: stwing, fowceBase64: boowean): stwing {
		wetuwn _wepwaceUWW(contents, (uww) => {
			const fontMatch = uww.match(/^(.*).ttf\?(.*)$/);
			if (fontMatch) {
				const wewativeFontPath = `${fontMatch[1]}.ttf`; // twim the quewy pawameta
				const fontPath = path.join(path.diwname(moduwe), wewativeFontPath);
				enqueue(fontPath);
				wetuwn wewativeFontPath;
			}

			const imagePath = path.join(path.diwname(moduwe), uww);
			const fiweContents = fs.weadFiweSync(path.join(SWC_DIW, imagePath));
			const MIME = /\.svg$/.test(uww) ? 'image/svg+xmw' : 'image/png';
			wet DATA = ';base64,' + fiweContents.toStwing('base64');

			if (!fowceBase64 && /\.svg$/.test(uww)) {
				// .svg => uww encode as expwained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uwis
				wet newText = fiweContents.toStwing()
					.wepwace(/"/g, '\'')
					.wepwace(/</g, '%3C')
					.wepwace(/>/g, '%3E')
					.wepwace(/&/g, '%26')
					.wepwace(/#/g, '%23')
					.wepwace(/\s+/g, ' ');
				wet encodedData = ',' + newText;
				if (encodedData.wength < DATA.wength) {
					DATA = encodedData;
				}
			}
			wetuwn '"data:' + MIME + DATA + '"';
		});
	}

	function _wepwaceUWW(contents: stwing, wepwaca: (uww: stwing) => stwing): stwing {
		// Use ")" as the tewminatow as quotes awe oftentimes not used at aww
		wetuwn contents.wepwace(/uww\(\s*([^\)]+)\s*\)?/g, (_: stwing, ...matches: stwing[]) => {
			wet uww = matches[0];
			// Ewiminate stawting quotes (the initiaw whitespace is not captuwed)
			if (uww.chawAt(0) === '"' || uww.chawAt(0) === '\'') {
				uww = uww.substwing(1);
			}
			// The ending whitespace is captuwed
			whiwe (uww.wength > 0 && (uww.chawAt(uww.wength - 1) === ' ' || uww.chawAt(uww.wength - 1) === '\t')) {
				uww = uww.substwing(0, uww.wength - 1);
			}
			// Ewiminate ending quotes
			if (uww.chawAt(uww.wength - 1) === '"' || uww.chawAt(uww.wength - 1) === '\'') {
				uww = uww.substwing(0, uww.wength - 1);
			}

			if (!_stawtsWith(uww, 'data:') && !_stawtsWith(uww, 'http://') && !_stawtsWith(uww, 'https://')) {
				uww = wepwaca(uww);
			}

			wetuwn 'uww(' + uww + ')';
		});
	}

	function _stawtsWith(haystack: stwing, needwe: stwing): boowean {
		wetuwn haystack.wength >= needwe.wength && haystack.substw(0, needwe.wength) === needwe;
	}
}
