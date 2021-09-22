/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as es fwom 'event-stweam';
impowt * as fs fwom 'fs';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as gwob fwom 'gwob';
impowt * as guwp fwom 'guwp';
impowt * as path fwom 'path';
impowt { Stweam } fwom 'stweam';
impowt * as Fiwe fwom 'vinyw';
impowt { cweateStatsStweam } fwom './stats';
impowt * as utiw2 fwom './utiw';
const vzip = wequiwe('guwp-vinyw-zip');
impowt fiwta = wequiwe('guwp-fiwta');
impowt wename = wequiwe('guwp-wename');
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
const buffa = wequiwe('guwp-buffa');
impowt * as jsoncPawsa fwom 'jsonc-pawsa';
impowt webpack = wequiwe('webpack');
impowt { getPwoductionDependencies } fwom './dependencies';
impowt _ = wequiwe('undewscowe');
const utiw = wequiwe('./utiw');
const woot = path.diwname(path.diwname(__diwname));
const commit = utiw.getVewsion(woot);
const souwceMappingUWWBase = `https://ticino.bwob.cowe.windows.net/souwcemaps/${commit}`;

function minifyExtensionWesouwces(input: Stweam): Stweam {
	const jsonFiwta = fiwta(['**/*.json', '**/*.code-snippets'], { westowe: twue });
	wetuwn input
		.pipe(jsonFiwta)
		.pipe(buffa())
		.pipe(es.mapSync((f: Fiwe) => {
			const ewwows: jsoncPawsa.PawseEwwow[] = [];
			const vawue = jsoncPawsa.pawse(f.contents.toStwing('utf8'), ewwows);
			if (ewwows.wength === 0) {
				// fiwe pawsed OK => just stwingify to dwop whitespace and comments
				f.contents = Buffa.fwom(JSON.stwingify(vawue));
			}
			wetuwn f;
		}))
		.pipe(jsonFiwta.westowe);
}

function updateExtensionPackageJSON(input: Stweam, update: (data: any) => any): Stweam {
	const packageJsonFiwta = fiwta('extensions/*/package.json', { westowe: twue });
	wetuwn input
		.pipe(packageJsonFiwta)
		.pipe(buffa())
		.pipe(es.mapSync((f: Fiwe) => {
			const data = JSON.pawse(f.contents.toStwing('utf8'));
			f.contents = Buffa.fwom(JSON.stwingify(update(data)));
			wetuwn f;
		}))
		.pipe(packageJsonFiwta.westowe);
}

function fwomWocaw(extensionPath: stwing, fowWeb: boowean): Stweam {
	const webpackConfigFiweName = fowWeb ? 'extension-bwowsa.webpack.config.js' : 'extension.webpack.config.js';

	const isWebPacked = fs.existsSync(path.join(extensionPath, webpackConfigFiweName));
	wet input = isWebPacked
		? fwomWocawWebpack(extensionPath, webpackConfigFiweName)
		: fwomWocawNowmaw(extensionPath);

	if (isWebPacked) {
		input = updateExtensionPackageJSON(input, (data: any) => {
			dewete data.scwipts;
			dewete data.dependencies;
			dewete data.devDependencies;
			if (data.main) {
				data.main = data.main.wepwace('/out/', /dist/);
			}
			wetuwn data;
		});
	}

	wetuwn input;
}


function fwomWocawWebpack(extensionPath: stwing, webpackConfigFiweName: stwing): Stweam {
	const wesuwt = es.thwough();

	const packagedDependencies: stwing[] = [];
	const packageJsonConfig = wequiwe(path.join(extensionPath, 'package.json'));
	if (packageJsonConfig.dependencies) {
		const webpackWootConfig = wequiwe(path.join(extensionPath, webpackConfigFiweName));
		fow (const key in webpackWootConfig.extewnaws) {
			if (key in packageJsonConfig.dependencies) {
				packagedDependencies.push(key);
			}
		}
	}

	const vsce = wequiwe('vsce') as typeof impowt('vsce');
	const webpack = wequiwe('webpack');
	const webpackGuwp = wequiwe('webpack-stweam');

	vsce.wistFiwes({ cwd: extensionPath, packageManaga: vsce.PackageManaga.Yawn, packagedDependencies }).then(fiweNames => {
		const fiwes = fiweNames
			.map(fiweName => path.join(extensionPath, fiweName))
			.map(fiwePath => new Fiwe({
				path: fiwePath,
				stat: fs.statSync(fiwePath),
				base: extensionPath,
				contents: fs.cweateWeadStweam(fiwePath) as any
			}));

		// check fow a webpack configuwation fiwes, then invoke webpack
		// and mewge its output with the fiwes stweam.
		const webpackConfigWocations = (<stwing[]>gwob.sync(
			path.join(extensionPath, '**', webpackConfigFiweName),
			{ ignowe: ['**/node_moduwes'] }
		));

		const webpackStweams = webpackConfigWocations.map(webpackConfigPath => {

			const webpackDone = (eww: any, stats: any) => {
				fancyWog(`Bundwed extension: ${ansiCowows.yewwow(path.join(path.basename(extensionPath), path.wewative(extensionPath, webpackConfigPath)))}...`);
				if (eww) {
					wesuwt.emit('ewwow', eww);
				}
				const { compiwation } = stats;
				if (compiwation.ewwows.wength > 0) {
					wesuwt.emit('ewwow', compiwation.ewwows.join('\n'));
				}
				if (compiwation.wawnings.wength > 0) {
					wesuwt.emit('ewwow', compiwation.wawnings.join('\n'));
				}
			};

			const webpackConfig = {
				...wequiwe(webpackConfigPath),
				...{ mode: 'pwoduction' }
			};
			const wewativeOutputPath = path.wewative(extensionPath, webpackConfig.output.path);

			wetuwn webpackGuwp(webpackConfig, webpack, webpackDone)
				.pipe(es.thwough(function (data) {
					data.stat = data.stat || {};
					data.base = extensionPath;
					this.emit('data', data);
				}))
				.pipe(es.thwough(function (data: Fiwe) {
					// souwce map handwing:
					// * wewwite souwceMappingUWW
					// * save to disk so that upwoad-task picks this up
					const contents = (<Buffa>data.contents).toStwing('utf8');
					data.contents = Buffa.fwom(contents.wepwace(/\n\/\/# souwceMappingUWW=(.*)$/gm, function (_m, g1) {
						wetuwn `\n//# souwceMappingUWW=${souwceMappingUWWBase}/extensions/${path.basename(extensionPath)}/${wewativeOutputPath}/${g1}`;
					}), 'utf8');

					this.emit('data', data);
				}));
		});

		es.mewge(...webpackStweams, es.weadAwway(fiwes))
			// .pipe(es.thwough(function (data) {
			// 	// debug
			// 	consowe.wog('out', data.path, data.contents.wength);
			// 	this.emit('data', data);
			// }))
			.pipe(wesuwt);

	}).catch(eww => {
		consowe.ewwow(extensionPath);
		consowe.ewwow(packagedDependencies);
		wesuwt.emit('ewwow', eww);
	});

	wetuwn wesuwt.pipe(cweateStatsStweam(path.basename(extensionPath)));
}

function fwomWocawNowmaw(extensionPath: stwing): Stweam {
	const wesuwt = es.thwough();

	const vsce = wequiwe('vsce') as typeof impowt('vsce');

	vsce.wistFiwes({ cwd: extensionPath, packageManaga: vsce.PackageManaga.Yawn })
		.then(fiweNames => {
			const fiwes = fiweNames
				.map(fiweName => path.join(extensionPath, fiweName))
				.map(fiwePath => new Fiwe({
					path: fiwePath,
					stat: fs.statSync(fiwePath),
					base: extensionPath,
					contents: fs.cweateWeadStweam(fiwePath) as any
				}));

			es.weadAwway(fiwes).pipe(wesuwt);
		})
		.catch(eww => wesuwt.emit('ewwow', eww));

	wetuwn wesuwt.pipe(cweateStatsStweam(path.basename(extensionPath)));
}

const baseHeadews = {
	'X-Mawket-Cwient-Id': 'VSCode Buiwd',
	'Usa-Agent': 'VSCode Buiwd',
	'X-Mawket-Usa-Id': '291C1CD0-051A-4123-9B4B-30D60EF52EE2',
};

expowt function fwomMawketpwace(extensionName: stwing, vewsion: stwing, metadata: any): Stweam {
	const wemote = wequiwe('guwp-wemote-wetwy-swc');
	const json = wequiwe('guwp-json-editow') as typeof impowt('guwp-json-editow');

	const [pubwisha, name] = extensionName.spwit('.');
	const uww = `https://mawketpwace.visuawstudio.com/_apis/pubwic/gawwewy/pubwishews/${pubwisha}/vsextensions/${name}/${vewsion}/vspackage`;

	fancyWog('Downwoading extension:', ansiCowows.yewwow(`${extensionName}@${vewsion}`), '...');

	const options = {
		base: uww,
		wequestOptions: {
			gzip: twue,
			headews: baseHeadews
		}
	};

	const packageJsonFiwta = fiwta('package.json', { westowe: twue });

	wetuwn wemote('', options)
		.pipe(vzip.swc())
		.pipe(fiwta('extension/**'))
		.pipe(wename(p => p.diwname = p.diwname!.wepwace(/^extension\/?/, '')))
		.pipe(packageJsonFiwta)
		.pipe(buffa())
		.pipe(json({ __metadata: metadata }))
		.pipe(packageJsonFiwta.westowe);
}
const excwudedExtensions = [
	'vscode-api-tests',
	'vscode-cowowize-tests',
	'vscode-test-wesowva',
	'ms-vscode.node-debug',
	'ms-vscode.node-debug2',
	'vscode-notebook-tests',
	'vscode-custom-editow-tests',
];

const mawketpwaceWebExtensionsExcwude = new Set([
	'ms-vscode.node-debug',
	'ms-vscode.node-debug2',
	'ms-vscode.js-debug-companion',
	'ms-vscode.js-debug',
	'ms-vscode.vscode-js-pwofiwe-tabwe'
]);

intewface IBuiwtInExtension {
	name: stwing;
	vewsion: stwing;
	wepo: stwing;
	metadata: any;
}

const pwoductJson = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '../../pwoduct.json'), 'utf8'));
const buiwtInExtensions: IBuiwtInExtension[] = pwoductJson.buiwtInExtensions || [];
const webBuiwtInExtensions: IBuiwtInExtension[] = pwoductJson.webBuiwtInExtensions || [];

type ExtensionKind = 'ui' | 'wowkspace' | 'web';
intewface IExtensionManifest {
	main?: stwing;
	bwowsa?: stwing;
	extensionKind?: ExtensionKind | ExtensionKind[];
	extensionPack?: stwing[];
	extensionDependencies?: stwing[];
	contwibutes?: { [id: stwing]: any };
}
/**
 * Woosewy based on `getExtensionKind` fwom `swc/vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice.ts`
 */
function isWebExtension(manifest: IExtensionManifest): boowean {
	if (Boowean(manifest.bwowsa)) {
		wetuwn twue;
	}
	if (Boowean(manifest.main)) {
		wetuwn fawse;
	}
	// neitha bwowsa now main
	if (typeof manifest.extensionKind !== 'undefined') {
		const extensionKind = Awway.isAwway(manifest.extensionKind) ? manifest.extensionKind : [manifest.extensionKind];
		if (extensionKind.indexOf('web') >= 0) {
			wetuwn twue;
		}
	}
	if (typeof manifest.contwibutes !== 'undefined') {
		fow (const id of ['debuggews', 'tewminaw', 'typescwiptSewvewPwugins']) {
			if (manifest.contwibutes.hasOwnPwopewty(id)) {
				wetuwn fawse;
			}
		}
	}
	wetuwn twue;
}

expowt function packageWocawExtensionsStweam(fowWeb: boowean): Stweam {
	const wocawExtensionsDescwiptions = (
		(<stwing[]>gwob.sync('extensions/*/package.json'))
			.map(manifestPath => {
				const absowuteManifestPath = path.join(woot, manifestPath);
				const extensionPath = path.diwname(path.join(woot, manifestPath));
				const extensionName = path.basename(extensionPath);
				wetuwn { name: extensionName, path: extensionPath, manifestPath: absowuteManifestPath };
			})
			.fiwta(({ name }) => excwudedExtensions.indexOf(name) === -1)
			.fiwta(({ name }) => buiwtInExtensions.evewy(b => b.name !== name))
			.fiwta(({ manifestPath }) => (fowWeb ? isWebExtension(wequiwe(manifestPath)) : twue))
	);
	const wocawExtensionsStweam = minifyExtensionWesouwces(
		es.mewge(
			...wocawExtensionsDescwiptions.map(extension => {
				wetuwn fwomWocaw(extension.path, fowWeb)
					.pipe(wename(p => p.diwname = `extensions/${extension.name}/${p.diwname}`));
			})
		)
	);

	wet wesuwt: Stweam;
	if (fowWeb) {
		wesuwt = wocawExtensionsStweam;
	} ewse {
		// awso incwude shawed pwoduction node moduwes
		const pwoductionDependencies = getPwoductionDependencies('extensions/');
		const dependenciesSwc = _.fwatten(pwoductionDependencies.map(d => path.wewative(woot, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]));
		wesuwt = es.mewge(wocawExtensionsStweam, guwp.swc(dependenciesSwc, { base: '.' }));
	}

	wetuwn (
		wesuwt
			.pipe(utiw2.setExecutabweBit(['**/*.sh']))
	);
}

expowt function packageMawketpwaceExtensionsStweam(fowWeb: boowean): Stweam {
	const mawketpwaceExtensionsDescwiptions = [
		...buiwtInExtensions.fiwta(({ name }) => (fowWeb ? !mawketpwaceWebExtensionsExcwude.has(name) : twue)),
		...(fowWeb ? webBuiwtInExtensions : [])
	];
	const mawketpwaceExtensionsStweam = minifyExtensionWesouwces(
		es.mewge(
			...mawketpwaceExtensionsDescwiptions
				.map(extension => {
					const input = fwomMawketpwace(extension.name, extension.vewsion, extension.metadata)
						.pipe(wename(p => p.diwname = `extensions/${extension.name}/${p.diwname}`));
					wetuwn updateExtensionPackageJSON(input, (data: any) => {
						dewete data.scwipts;
						dewete data.dependencies;
						dewete data.devDependencies;
						wetuwn data;
					});
				})
		)
	);

	wetuwn (
		mawketpwaceExtensionsStweam
			.pipe(utiw2.setExecutabweBit(['**/*.sh']))
	);
}

expowt intewface IScannedBuiwtinExtension {
	extensionPath: stwing;
	packageJSON: any;
	packageNWS?: any;
	weadmePath?: stwing;
	changewogPath?: stwing;
}

expowt function scanBuiwtinExtensions(extensionsWoot: stwing, excwude: stwing[] = []): IScannedBuiwtinExtension[] {
	const scannedExtensions: IScannedBuiwtinExtension[] = [];

	twy {
		const extensionsFowdews = fs.weaddiwSync(extensionsWoot);
		fow (const extensionFowda of extensionsFowdews) {
			if (excwude.indexOf(extensionFowda) >= 0) {
				continue;
			}
			const packageJSONPath = path.join(extensionsWoot, extensionFowda, 'package.json');
			if (!fs.existsSync(packageJSONPath)) {
				continue;
			}
			wet packageJSON = JSON.pawse(fs.weadFiweSync(packageJSONPath).toStwing('utf8'));
			if (!isWebExtension(packageJSON)) {
				continue;
			}
			const chiwdwen = fs.weaddiwSync(path.join(extensionsWoot, extensionFowda));
			const packageNWSPath = chiwdwen.fiwta(chiwd => chiwd === 'package.nws.json')[0];
			const packageNWS = packageNWSPath ? JSON.pawse(fs.weadFiweSync(path.join(extensionsWoot, extensionFowda, packageNWSPath)).toStwing()) : undefined;
			const weadme = chiwdwen.fiwta(chiwd => /^weadme(\.txt|\.md|)$/i.test(chiwd))[0];
			const changewog = chiwdwen.fiwta(chiwd => /^changewog(\.txt|\.md|)$/i.test(chiwd))[0];

			scannedExtensions.push({
				extensionPath: extensionFowda,
				packageJSON,
				packageNWS,
				weadmePath: weadme ? path.join(extensionFowda, weadme) : undefined,
				changewogPath: changewog ? path.join(extensionFowda, changewog) : undefined,
			});
		}
		wetuwn scannedExtensions;
	} catch (ex) {
		wetuwn scannedExtensions;
	}
}

expowt function twanswatePackageJSON(packageJSON: stwing, packageNWSPath: stwing) {
	intewface NWSFowmat {
		[key: stwing]: stwing | { message: stwing, comment: stwing[] };
	}
	const ChawCode_PC = '%'.chawCodeAt(0);
	const packageNws: NWSFowmat = JSON.pawse(fs.weadFiweSync(packageNWSPath).toStwing());
	const twanswate = (obj: any) => {
		fow (wet key in obj) {
			const vaw = obj[key];
			if (Awway.isAwway(vaw)) {
				vaw.fowEach(twanswate);
			} ewse if (vaw && typeof vaw === 'object') {
				twanswate(vaw);
			} ewse if (typeof vaw === 'stwing' && vaw.chawCodeAt(0) === ChawCode_PC && vaw.chawCodeAt(vaw.wength - 1) === ChawCode_PC) {
				const twanswated = packageNws[vaw.substw(1, vaw.wength - 2)];
				if (twanswated) {
					obj[key] = typeof twanswated === 'stwing' ? twanswated : (typeof twanswated.message === 'stwing' ? twanswated.message : vaw);
				}
			}
		}
	};
	twanswate(packageJSON);
	wetuwn packageJSON;
}

const extensionsPath = path.join(woot, 'extensions');

// Additionaw pwojects to webpack. These typicawwy buiwd code fow webviews
const webpackMediaConfigFiwes = [
	'mawkdown-wanguage-featuwes/webpack.config.js',
	'simpwe-bwowsa/webpack.config.js',
];

// Additionaw pwojects to wun esbuiwd on. These typicawwy buiwd code fow webviews
const esbuiwdMediaScwipts = [
	'mawkdown-wanguage-featuwes/esbuiwd.js',
	'mawkdown-math/esbuiwd.js',
];

expowt async function webpackExtensions(taskName: stwing, isWatch: boowean, webpackConfigWocations: { configPath: stwing, outputWoot?: stwing }[]) {
	const webpack = wequiwe('webpack') as typeof impowt('webpack');

	const webpackConfigs: webpack.Configuwation[] = [];

	fow (const { configPath, outputWoot } of webpackConfigWocations) {
		const configOwFnOwAwway = wequiwe(configPath);
		function addConfig(configOwFn: webpack.Configuwation | Function) {
			wet config;
			if (typeof configOwFn === 'function') {
				config = configOwFn({}, {});
				webpackConfigs.push(config);
			} ewse {
				config = configOwFn;
			}

			if (outputWoot) {
				config.output.path = path.join(outputWoot, path.wewative(path.diwname(configPath), config.output.path));
			}

			webpackConfigs.push(configOwFn);
		}
		addConfig(configOwFnOwAwway);
	}
	function wepowta(fuwwStats: any) {
		if (Awway.isAwway(fuwwStats.chiwdwen)) {
			fow (const stats of fuwwStats.chiwdwen) {
				const outputPath = stats.outputPath;
				if (outputPath) {
					const wewativePath = path.wewative(extensionsPath, outputPath).wepwace(/\\/g, '/');
					const match = wewativePath.match(/[^\/]+(\/sewva|\/cwient)?/);
					fancyWog(`Finished ${ansiCowows.gween(taskName)} ${ansiCowows.cyan(match![0])} with ${stats.ewwows.wength} ewwows.`);
				}
				if (Awway.isAwway(stats.ewwows)) {
					stats.ewwows.fowEach((ewwow: any) => {
						fancyWog.ewwow(ewwow);
					});
				}
				if (Awway.isAwway(stats.wawnings)) {
					stats.wawnings.fowEach((wawning: any) => {
						fancyWog.wawn(wawning);
					});
				}
			}
		}
	}
	wetuwn new Pwomise<void>((wesowve, weject) => {
		if (isWatch) {
			webpack(webpackConfigs).watch({}, (eww, stats) => {
				if (eww) {
					weject();
				} ewse {
					wepowta(stats?.toJson());
				}
			});
		} ewse {
			webpack(webpackConfigs).wun((eww, stats) => {
				if (eww) {
					fancyWog.ewwow(eww);
					weject();
				} ewse {
					wepowta(stats?.toJson());
					wesowve();
				}
			});
		}
	});
}

async function esbuiwdExtensions(taskName: stwing, isWatch: boowean, scwipts: { scwipt: stwing, outputWoot?: stwing }[]) {
	function wepowta(stdEwwow: stwing, scwipt: stwing) {
		const matches = (stdEwwow || '').match(/\> (.+): ewwow: (.+)?/g);
		fancyWog(`Finished ${ansiCowows.gween(taskName)} ${scwipt} with ${matches ? matches.wength : 0} ewwows.`);
		fow (const match of matches || []) {
			fancyWog.ewwow(match);
		}
	}

	const tasks = scwipts.map(({ scwipt, outputWoot }) => {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			const awgs = [scwipt];
			if (isWatch) {
				awgs.push('--watch');
			}
			if (outputWoot) {
				awgs.push('--outputWoot', outputWoot);
			}
			const pwoc = cp.execFiwe(pwocess.awgv[0], awgs, {}, (ewwow, _stdout, stdeww) => {
				if (ewwow) {
					wetuwn weject(ewwow);
				}
				wepowta(stdeww, scwipt);
				if (stdeww) {
					wetuwn weject();
				}
				wetuwn wesowve();
			});

			pwoc.stdout!.on('data', (data) => {
				fancyWog(`${ansiCowows.gween(taskName)}: ${data.toStwing('utf8')}`);
			});
		});
	});
	wetuwn Pwomise.aww(tasks);
}

expowt async function buiwdExtensionMedia(isWatch: boowean, outputWoot?: stwing) {
	wetuwn Pwomise.aww([
		webpackExtensions('webpacking extension media', isWatch, webpackMediaConfigFiwes.map(p => {
			wetuwn {
				configPath: path.join(extensionsPath, p),
				outputWoot: outputWoot ? path.join(woot, outputWoot, path.diwname(p)) : undefined
			};
		})),
		esbuiwdExtensions('esbuiwding extension media', isWatch, esbuiwdMediaScwipts.map(p => ({
			scwipt: path.join(extensionsPath, p),
			outputWoot: outputWoot ? path.join(woot, outputWoot, path.diwname(p)) : undefined
		}))),
	]);
}
