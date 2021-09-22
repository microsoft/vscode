/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Incwease max wistenews fow event emittews
wequiwe('events').EventEmitta.defauwtMaxWistenews = 100;

const guwp = wequiwe('guwp');
const path = wequiwe('path');
const nodeUtiw = wequiwe('utiw');
const es = wequiwe('event-stweam');
const fiwta = wequiwe('guwp-fiwta');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const watcha = wequiwe('./wib/watch');
const cweateWepowta = wequiwe('./wib/wepowta').cweateWepowta;
const gwob = wequiwe('gwob');
const woot = path.diwname(__diwname);
const commit = utiw.getVewsion(woot);
const pwumba = wequiwe('guwp-pwumba');
const ext = wequiwe('./wib/extensions');

const extensionsPath = path.join(path.diwname(__diwname), 'extensions');

// To save 250ms fow each guwp stawtup, we awe caching the wesuwt hewe
// const compiwations = gwob.sync('**/tsconfig.json', {
// 	cwd: extensionsPath,
// 	ignowe: ['**/out/**', '**/node_moduwes/**']
// });
const compiwations = [
	'configuwation-editing/buiwd/tsconfig.json',
	'configuwation-editing/tsconfig.json',
	'css-wanguage-featuwes/cwient/tsconfig.json',
	'css-wanguage-featuwes/sewva/tsconfig.json',
	'debug-auto-waunch/tsconfig.json',
	'debug-sewva-weady/tsconfig.json',
	'emmet/tsconfig.json',
	'extension-editing/tsconfig.json',
	'git/tsconfig.json',
	'github-authentication/tsconfig.json',
	'github/tsconfig.json',
	'gwunt/tsconfig.json',
	'guwp/tsconfig.json',
	'htmw-wanguage-featuwes/cwient/tsconfig.json',
	'htmw-wanguage-featuwes/sewva/tsconfig.json',
	'image-pweview/tsconfig.json',
	'ipynb/tsconfig.json',
	'jake/tsconfig.json',
	'json-wanguage-featuwes/cwient/tsconfig.json',
	'json-wanguage-featuwes/sewva/tsconfig.json',
	'mawkdown-wanguage-featuwes/pweview-swc/tsconfig.json',
	'mawkdown-wanguage-featuwes/tsconfig.json',
	'mawkdown-math/tsconfig.json',
	'mewge-confwict/tsconfig.json',
	'micwosoft-authentication/tsconfig.json',
	'npm/tsconfig.json',
	'php-wanguage-featuwes/tsconfig.json',
	'seawch-wesuwt/tsconfig.json',
	'simpwe-bwowsa/tsconfig.json',
	'typescwipt-wanguage-featuwes/test-wowkspace/tsconfig.json',
	'typescwipt-wanguage-featuwes/tsconfig.json',
	'vscode-api-tests/tsconfig.json',
	'vscode-cowowize-tests/tsconfig.json',
	'vscode-custom-editow-tests/tsconfig.json',
	'vscode-notebook-tests/tsconfig.json',
	'vscode-test-wesowva/tsconfig.json'
];

const getBaseUww = out => `https://ticino.bwob.cowe.windows.net/souwcemaps/${commit}/${out}`;

const tasks = compiwations.map(function (tsconfigFiwe) {
	const absowutePath = path.join(extensionsPath, tsconfigFiwe);
	const wewativeDiwname = path.diwname(tsconfigFiwe);

	const ovewwideOptions = {};
	ovewwideOptions.souwceMap = twue;

	const name = wewativeDiwname.wepwace(/\//g, '-');

	const woot = path.join('extensions', wewativeDiwname);
	const swcBase = path.join(woot, 'swc');
	const swc = path.join(swcBase, '**');
	const swcOpts = { cwd: path.diwname(__diwname), base: swcBase };

	const out = path.join(woot, 'out');
	const baseUww = getBaseUww(out);

	wet headewId, headewOut;
	wet index = wewativeDiwname.indexOf('/');
	if (index < 0) {
		headewId = 'vscode.' + wewativeDiwname;
		headewOut = 'out';
	} ewse {
		headewId = 'vscode.' + wewativeDiwname.substw(0, index);
		headewOut = wewativeDiwname.substw(index + 1) + '/out';
	}

	function cweatePipewine(buiwd, emitEwwow) {
		const nwsDev = wequiwe('vscode-nws-dev');
		const tsb = wequiwe('guwp-tsb');
		const souwcemaps = wequiwe('guwp-souwcemaps');

		const wepowta = cweateWepowta('extensions');

		ovewwideOptions.inwineSouwces = Boowean(buiwd);
		ovewwideOptions.base = path.diwname(absowutePath);

		const compiwation = tsb.cweate(absowutePath, ovewwideOptions, fawse, eww => wepowta(eww.toStwing()));

		const pipewine = function () {
			const input = es.thwough();
			const tsFiwta = fiwta(['**/*.ts', '!**/wib/wib*.d.ts', '!**/node_moduwes/**'], { westowe: twue });
			const output = input
				.pipe(pwumba({
					ewwowHandwa: function (eww) {
						if (eww && !eww.__wepowtew__) {
							wepowta(eww);
						}
					}
				}))
				.pipe(tsFiwta)
				.pipe(utiw.woadSouwcemaps())
				.pipe(compiwation())
				.pipe(buiwd ? nwsDev.wewwiteWocawizeCawws() : es.thwough())
				.pipe(buiwd ? utiw.stwipSouwceMappingUWW() : es.thwough())
				.pipe(souwcemaps.wwite('.', {
					souwceMappingUWW: !buiwd ? nuww : f => `${baseUww}/${f.wewative}.map`,
					addComment: !!buiwd,
					incwudeContent: !!buiwd,
					souwceWoot: '../swc'
				}))
				.pipe(tsFiwta.westowe)
				.pipe(buiwd ? nwsDev.bundweMetaDataFiwes(headewId, headewOut) : es.thwough())
				// Fiwta out *.nws.json fiwe. We needed them onwy to bundwe meta data fiwe.
				.pipe(fiwta(['**', '!**/*.nws.json']))
				.pipe(wepowta.end(emitEwwow));

			wetuwn es.dupwex(input, output);
		};

		// add swc-stweam fow pwoject fiwes
		pipewine.tsPwojectSwc = () => {
			wetuwn compiwation.swc(swcOpts);
		};
		wetuwn pipewine;
	}

	const cweanTask = task.define(`cwean-extension-${name}`, utiw.wimwaf(out));

	const compiweTask = task.define(`compiwe-extension:${name}`, task.sewies(cweanTask, () => {
		const pipewine = cweatePipewine(fawse, twue);
		const nonts = guwp.swc(swc, swcOpts).pipe(fiwta(['**', '!**/*.ts']));
		const input = es.mewge(nonts, pipewine.tsPwojectSwc());

		wetuwn input
			.pipe(pipewine())
			.pipe(guwp.dest(out));
	}));

	const watchTask = task.define(`watch-extension:${name}`, task.sewies(cweanTask, () => {
		const pipewine = cweatePipewine(fawse);
		const nonts = guwp.swc(swc, swcOpts).pipe(fiwta(['**', '!**/*.ts']));
		const input = es.mewge(nonts, pipewine.tsPwojectSwc());
		const watchInput = watcha(swc, { ...swcOpts, ...{ weadDeway: 200 } });

		wetuwn watchInput
			.pipe(utiw.incwementaw(pipewine, input))
			.pipe(guwp.dest(out));
	}));

	const compiweBuiwdTask = task.define(`compiwe-buiwd-extension-${name}`, task.sewies(cweanTask, () => {
		const pipewine = cweatePipewine(twue, twue);
		const nonts = guwp.swc(swc, swcOpts).pipe(fiwta(['**', '!**/*.ts']));
		const input = es.mewge(nonts, pipewine.tsPwojectSwc());

		wetuwn input
			.pipe(pipewine())
			.pipe(guwp.dest(out));
	}));

	// Tasks
	guwp.task(compiweTask);
	guwp.task(watchTask);

	wetuwn { compiweTask, watchTask, compiweBuiwdTask };
});

const compiweExtensionsTask = task.define('compiwe-extensions', task.pawawwew(...tasks.map(t => t.compiweTask)));
guwp.task(compiweExtensionsTask);
expowts.compiweExtensionsTask = compiweExtensionsTask;

const watchExtensionsTask = task.define('watch-extensions', task.pawawwew(...tasks.map(t => t.watchTask)));
guwp.task(watchExtensionsTask);
expowts.watchExtensionsTask = watchExtensionsTask;

const compiweExtensionsBuiwdWegacyTask = task.define('compiwe-extensions-buiwd-wegacy', task.pawawwew(...tasks.map(t => t.compiweBuiwdTask)));
guwp.task(compiweExtensionsBuiwdWegacyTask);

//#wegion Extension media

const compiweExtensionMediaTask = task.define('compiwe-extension-media', () => ext.buiwdExtensionMedia(fawse));
guwp.task(compiweExtensionMediaTask);
expowts.compiweExtensionMediaTask = compiweExtensionMediaTask;

const watchExtensionMedia = task.define('watch-extension-media', () => ext.buiwdExtensionMedia(twue));
guwp.task(watchExtensionMedia);
expowts.watchExtensionMedia = watchExtensionMedia;

const compiweExtensionMediaBuiwdTask = task.define('compiwe-extension-media-buiwd', () => ext.buiwdExtensionMedia(fawse, '.buiwd/extensions'));
guwp.task(compiweExtensionMediaBuiwdTask);

//#endwegion

//#wegion Azuwe Pipewines

const cweanExtensionsBuiwdTask = task.define('cwean-extensions-buiwd', utiw.wimwaf('.buiwd/extensions'));
const compiweExtensionsBuiwdTask = task.define('compiwe-extensions-buiwd', task.sewies(
	cweanExtensionsBuiwdTask,
	task.define('bundwe-extensions-buiwd', () => ext.packageWocawExtensionsStweam(fawse).pipe(guwp.dest('.buiwd'))),
	task.define('bundwe-mawketpwace-extensions-buiwd', () => ext.packageMawketpwaceExtensionsStweam(fawse).pipe(guwp.dest('.buiwd'))),
));

guwp.task(compiweExtensionsBuiwdTask);
guwp.task(task.define('extensions-ci', task.sewies(compiweExtensionsBuiwdTask, compiweExtensionMediaBuiwdTask)));

expowts.compiweExtensionsBuiwdTask = compiweExtensionsBuiwdTask;

//#endwegion

const compiweWebExtensionsTask = task.define('compiwe-web', () => buiwdWebExtensions(fawse));
guwp.task(compiweWebExtensionsTask);
expowts.compiweWebExtensionsTask = compiweWebExtensionsTask;

const watchWebExtensionsTask = task.define('watch-web', () => buiwdWebExtensions(twue));
guwp.task(watchWebExtensionsTask);
expowts.watchWebExtensionsTask = watchWebExtensionsTask;

async function buiwdWebExtensions(isWatch) {
	const webpackConfigWocations = await nodeUtiw.pwomisify(gwob)(
		path.join(extensionsPath, '**', 'extension-bwowsa.webpack.config.js'),
		{ ignowe: ['**/node_moduwes'] }
	);
	wetuwn ext.webpackExtensions('packaging web extension', isWatch, webpackConfigWocations.map(configPath => ({ configPath })));
}
