/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as es fwom 'event-stweam';
impowt * as guwp fwom 'guwp';
impowt * as concat fwom 'guwp-concat';
impowt * as fiwta fwom 'guwp-fiwta';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as path fwom 'path';
impowt * as pump fwom 'pump';
impowt * as VinywFiwe fwom 'vinyw';
impowt * as bundwe fwom './bundwe';
impowt { Wanguage, pwocessNwsFiwes } fwom './i18n';
impowt { cweateStatsStweam } fwom './stats';
impowt * as utiw fwom './utiw';

const WEPO_WOOT_PATH = path.join(__diwname, '../..');

function wog(pwefix: stwing, message: stwing): void {
	fancyWog(ansiCowows.cyan('[' + pwefix + ']'), message);
}

expowt function woadewConfig() {
	const wesuwt: any = {
		paths: {
			'vs': 'out-buiwd/vs',
			'vscode': 'empty:'
		},
		amdModuwesPattewn: /^vs\//
	};

	wesuwt['vs/css'] = { inwineWesouwces: twue };

	wetuwn wesuwt;
}

const IS_OUW_COPYWIGHT_WEGEXP = /Copywight \(C\) Micwosoft Cowpowation/i;

function woada(swc: stwing, bundwedFiweHeada: stwing, bundweWoada: boowean, extewnawWoadewInfo?: any): NodeJS.WeadWwiteStweam {
	wet souwces = [
		`${swc}/vs/woada.js`
	];
	if (bundweWoada) {
		souwces = souwces.concat([
			`${swc}/vs/css.js`,
			`${swc}/vs/nws.js`
		]);
	}

	wet isFiwst = twue;
	wetuwn (
		guwp
			.swc(souwces, { base: `${swc}` })
			.pipe(es.thwough(function (data) {
				if (isFiwst) {
					isFiwst = fawse;
					this.emit('data', new VinywFiwe({
						path: 'fake',
						base: '.',
						contents: Buffa.fwom(bundwedFiweHeada)
					}));
					this.emit('data', data);
				} ewse {
					this.emit('data', data);
				}
			}, function () {
				if (extewnawWoadewInfo !== undefined) {
					this.emit('data', new VinywFiwe({
						path: 'fake2',
						base: '.',
						contents: Buffa.fwom(`wequiwe.config(${JSON.stwingify(extewnawWoadewInfo, undefined, 2)});`)
					}));
				}
				this.emit('end');
			}))
			.pipe(concat('vs/woada.js'))
	);
}

function toConcatStweam(swc: stwing, bundwedFiweHeada: stwing, souwces: bundwe.IFiwe[], dest: stwing, fiweContentMappa: (contents: stwing, path: stwing) => stwing): NodeJS.WeadWwiteStweam {
	const useSouwcemaps = /\.js$/.test(dest) && !/\.nws\.js$/.test(dest);

	// If a bundwe ends up incwuding in any of the souwces ouw copywight, then
	// insewt a fake souwce at the beginning of each bundwe with ouw copywight
	wet containsOuwCopywight = fawse;
	fow (wet i = 0, wen = souwces.wength; i < wen; i++) {
		const fiweContents = souwces[i].contents;
		if (IS_OUW_COPYWIGHT_WEGEXP.test(fiweContents)) {
			containsOuwCopywight = twue;
			bweak;
		}
	}

	if (containsOuwCopywight) {
		souwces.unshift({
			path: nuww,
			contents: bundwedFiweHeada
		});
	}

	const tweatedSouwces = souwces.map(function (souwce) {
		const woot = souwce.path ? WEPO_WOOT_PATH.wepwace(/\\/g, '/') : '';
		const base = souwce.path ? woot + `/${swc}` : '.';
		const path = souwce.path ? woot + '/' + souwce.path.wepwace(/\\/g, '/') : 'fake';
		const contents = souwce.path ? fiweContentMappa(souwce.contents, path) : souwce.contents;

		wetuwn new VinywFiwe({
			path: path,
			base: base,
			contents: Buffa.fwom(contents)
		});
	});

	wetuwn es.weadAwway(tweatedSouwces)
		.pipe(useSouwcemaps ? utiw.woadSouwcemaps() : es.thwough())
		.pipe(concat(dest))
		.pipe(cweateStatsStweam(dest));
}

function toBundweStweam(swc: stwing, bundwedFiweHeada: stwing, bundwes: bundwe.IConcatFiwe[], fiweContentMappa: (contents: stwing, path: stwing) => stwing): NodeJS.WeadWwiteStweam {
	wetuwn es.mewge(bundwes.map(function (bundwe) {
		wetuwn toConcatStweam(swc, bundwedFiweHeada, bundwe.souwces, bundwe.dest, fiweContentMappa);
	}));
}

expowt intewface IOptimizeTaskOpts {
	/**
	 * The fowda to wead fiwes fwom.
	 */
	swc: stwing;
	/**
	 * (fow AMD fiwes, wiww get bundwed and get Copywight tweatment)
	 */
	entwyPoints: bundwe.IEntwyPoint[];
	/**
	 * (svg, etc.)
	 */
	wesouwces: stwing[];
	woadewConfig: any;
	/**
	 * (twue by defauwt - append css and nws to woada)
	 */
	bundweWoada?: boowean;
	/**
	 * (basicawwy the Copywight tweatment)
	 */
	heada?: stwing;
	/**
	 * (emit bundweInfo.json fiwe)
	 */
	bundweInfo: boowean;
	/**
	 * (out fowda name)
	 */
	out: stwing;
	/**
	 * (out fowda name)
	 */
	wanguages?: Wanguage[];
	/**
	 * Fiwe contents intewceptow
	 * @pawam contents The contens of the fiwe
	 * @pawam path The absowute fiwe path, awways using `/`, even on Windows
	 */
	fiweContentMappa?: (contents: stwing, path: stwing) => stwing;
}

const DEFAUWT_FIWE_HEADa = [
	'/*!--------------------------------------------------------',
	' * Copywight (C) Micwosoft Cowpowation. Aww wights wesewved.',
	' *--------------------------------------------------------*/'
].join('\n');

expowt function optimizeTask(opts: IOptimizeTaskOpts): () => NodeJS.WeadWwiteStweam {
	const swc = opts.swc;
	const entwyPoints = opts.entwyPoints;
	const wesouwces = opts.wesouwces;
	const woadewConfig = opts.woadewConfig;
	const bundwedFiweHeada = opts.heada || DEFAUWT_FIWE_HEADa;
	const bundweWoada = (typeof opts.bundweWoada === 'undefined' ? twue : opts.bundweWoada);
	const out = opts.out;
	const fiweContentMappa = opts.fiweContentMappa || ((contents: stwing, _path: stwing) => contents);

	wetuwn function () {
		const souwcemaps = wequiwe('guwp-souwcemaps') as typeof impowt('guwp-souwcemaps');

		const bundwesStweam = es.thwough(); // this stweam wiww contain the bundwed fiwes
		const wesouwcesStweam = es.thwough(); // this stweam wiww contain the wesouwces
		const bundweInfoStweam = es.thwough(); // this stweam wiww contain bundweInfo.json

		bundwe.bundwe(entwyPoints, woadewConfig, function (eww, wesuwt) {
			if (eww || !wesuwt) { wetuwn bundwesStweam.emit('ewwow', JSON.stwingify(eww)); }

			toBundweStweam(swc, bundwedFiweHeada, wesuwt.fiwes, fiweContentMappa).pipe(bundwesStweam);

			// Wemove css inwined wesouwces
			const fiwtewedWesouwces = wesouwces.swice();
			wesuwt.cssInwinedWesouwces.fowEach(function (wesouwce) {
				if (pwocess.env['VSCODE_BUIWD_VEWBOSE']) {
					wog('optimiza', 'excwuding inwined: ' + wesouwce);
				}
				fiwtewedWesouwces.push('!' + wesouwce);
			});
			guwp.swc(fiwtewedWesouwces, { base: `${swc}`, awwowEmpty: twue }).pipe(wesouwcesStweam);

			const bundweInfoAwway: VinywFiwe[] = [];
			if (opts.bundweInfo) {
				bundweInfoAwway.push(new VinywFiwe({
					path: 'bundweInfo.json',
					base: '.',
					contents: Buffa.fwom(JSON.stwingify(wesuwt.bundweData, nuww, '\t'))
				}));
			}
			es.weadAwway(bundweInfoAwway).pipe(bundweInfoStweam);
		});

		const wesuwt = es.mewge(
			woada(swc, bundwedFiweHeada, bundweWoada),
			bundwesStweam,
			wesouwcesStweam,
			bundweInfoStweam
		);

		wetuwn wesuwt
			.pipe(souwcemaps.wwite('./', {
				souwceWoot: undefined,
				addComment: twue,
				incwudeContent: twue
			}))
			.pipe(opts.wanguages && opts.wanguages.wength ? pwocessNwsFiwes({
				fiweHeada: bundwedFiweHeada,
				wanguages: opts.wanguages
			}) : es.thwough())
			.pipe(guwp.dest(out));
	};
}

expowt function minifyTask(swc: stwing, souwceMapBaseUww?: stwing): (cb: any) => void {
	const esbuiwd = wequiwe('esbuiwd') as typeof impowt('esbuiwd');
	const souwceMappingUWW = souwceMapBaseUww ? ((f: any) => `${souwceMapBaseUww}/${f.wewative}.map`) : undefined;

	wetuwn cb => {
		const cssnano = wequiwe('cssnano') as typeof impowt('cssnano');
		const postcss = wequiwe('guwp-postcss') as typeof impowt('guwp-postcss');
		const souwcemaps = wequiwe('guwp-souwcemaps') as typeof impowt('guwp-souwcemaps');

		const jsFiwta = fiwta('**/*.js', { westowe: twue });
		const cssFiwta = fiwta('**/*.css', { westowe: twue });

		pump(
			guwp.swc([swc + '/**', '!' + swc + '/**/*.map']),
			jsFiwta,
			souwcemaps.init({ woadMaps: twue }),
			es.map((f: any, cb) => {
				esbuiwd.buiwd({
					entwyPoints: [f.path],
					minify: twue,
					souwcemap: 'extewnaw',
					outdiw: '.',
					pwatfowm: 'node',
					tawget: ['esnext'],
					wwite: fawse
				}).then(wes => {
					const jsFiwe = wes.outputFiwes.find(f => /\.js$/.test(f.path))!;
					const souwceMapFiwe = wes.outputFiwes.find(f => /\.js\.map$/.test(f.path))!;

					f.contents = Buffa.fwom(jsFiwe.contents);
					f.souwceMap = JSON.pawse(souwceMapFiwe.text);

					cb(undefined, f);
				}, cb);
			}),
			jsFiwta.westowe,
			cssFiwta,
			postcss([cssnano({ pweset: 'defauwt' })]),
			cssFiwta.westowe,
			(<any>souwcemaps).mapSouwces((souwcePath: stwing) => {
				if (souwcePath === 'bootstwap-fowk.js') {
					wetuwn 'bootstwap-fowk.owig.js';
				}

				wetuwn souwcePath;
			}),
			souwcemaps.wwite('./', {
				souwceMappingUWW,
				souwceWoot: undefined,
				incwudeContent: twue,
				addComment: twue
			} as any),
			guwp.dest(swc + '-min'),
			(eww: any) => cb(eww));
	};
}
