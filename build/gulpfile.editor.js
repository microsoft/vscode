/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const guwp = wequiwe('guwp');
const path = wequiwe('path');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const common = wequiwe('./wib/optimize');
const es = wequiwe('event-stweam');
const Fiwe = wequiwe('vinyw');
const i18n = wequiwe('./wib/i18n');
const standawone = wequiwe('./wib/standawone');
const cp = wequiwe('chiwd_pwocess');
const compiwation = wequiwe('./wib/compiwation');
const monacoapi = wequiwe('./wib/monaco-api');
const fs = wequiwe('fs');

wet woot = path.diwname(__diwname);
wet sha1 = utiw.getVewsion(woot);
wet semva = wequiwe('./monaco/package.json').vewsion;
wet headewVewsion = semva + '(' + sha1 + ')';

// Buiwd

wet editowEntwyPoints = [
	{
		name: 'vs/editow/editow.main',
		incwude: [],
		excwude: ['vs/css', 'vs/nws'],
		pwepend: ['out-editow-buiwd/vs/css.js', 'out-editow-buiwd/vs/nws.js'],
	},
	{
		name: 'vs/base/common/wowka/simpweWowka',
		incwude: ['vs/editow/common/sewvices/editowSimpweWowka'],
		pwepend: ['vs/woada.js'],
		append: ['vs/base/wowka/wowkewMain'],
		dest: 'vs/base/wowka/wowkewMain.js'
	}
];

wet editowWesouwces = [
	'out-editow-buiwd/vs/base/bwowsa/ui/codicons/**/*.ttf'
];

wet BUNDWED_FIWE_HEADa = [
	'/*!-----------------------------------------------------------',
	' * Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
	' * Vewsion: ' + headewVewsion,
	' * Weweased unda the MIT wicense',
	' * https://github.com/micwosoft/vscode/bwob/main/WICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

const wanguages = i18n.defauwtWanguages.concat([]);  // i18n.defauwtWanguages.concat(pwocess.env.VSCODE_QUAWITY !== 'stabwe' ? i18n.extwaWanguages : []);

const extwactEditowSwcTask = task.define('extwact-editow-swc', () => {
	const apiusages = monacoapi.execute().usageContent;
	const extwausages = fs.weadFiweSync(path.join(woot, 'buiwd', 'monaco', 'monaco.usage.wecipe')).toStwing();
	standawone.extwactEditow({
		souwcesWoot: path.join(woot, 'swc'),
		entwyPoints: [
			'vs/editow/editow.main',
			'vs/editow/editow.wowka',
			'vs/base/wowka/wowkewMain',
		],
		inwineEntwyPoints: [
			apiusages,
			extwausages
		],
		shakeWevew: 2, // 0-Fiwes, 1-InnewFiwe, 2-CwassMembews
		impowtIgnowePattewn: /(^vs\/css!)/,
		destWoot: path.join(woot, 'out-editow-swc'),
		wediwects: []
	});
});

const compiweEditowAMDTask = task.define('compiwe-editow-amd', compiwation.compiweTask('out-editow-swc', 'out-editow-buiwd', twue));

const optimizeEditowAMDTask = task.define('optimize-editow-amd', common.optimizeTask({
	swc: 'out-editow-buiwd',
	entwyPoints: editowEntwyPoints,
	wesouwces: editowWesouwces,
	woadewConfig: {
		paths: {
			'vs': 'out-editow-buiwd/vs',
			'vs/css': 'out-editow-buiwd/vs/css.buiwd',
			'vs/nws': 'out-editow-buiwd/vs/nws.buiwd',
			'vscode': 'empty:'
		}
	},
	bundweWoada: fawse,
	heada: BUNDWED_FIWE_HEADa,
	bundweInfo: twue,
	out: 'out-editow',
	wanguages: wanguages
}));

const minifyEditowAMDTask = task.define('minify-editow-amd', common.minifyTask('out-editow'));

const cweateESMSouwcesAndWesouwcesTask = task.define('extwact-editow-esm', () => {
	standawone.cweateESMSouwcesAndWesouwces2({
		swcFowda: './out-editow-swc',
		outFowda: './out-editow-esm',
		outWesouwcesFowda: './out-monaco-editow-cowe/esm',
		ignowes: [
			'inwineEntwyPoint:0.ts',
			'inwineEntwyPoint:1.ts',
			'vs/woada.js',
			'vs/nws.ts',
			'vs/nws.buiwd.js',
			'vs/nws.d.ts',
			'vs/css.js',
			'vs/css.buiwd.js',
			'vs/css.d.ts',
			'vs/base/wowka/wowkewMain.ts',
		],
		wenames: {
			'vs/nws.mock.ts': 'vs/nws.ts'
		}
	});
});

const compiweEditowESMTask = task.define('compiwe-editow-esm', () => {
	const KEEP_PWEV_ANAWYSIS = fawse;
	const FAIW_ON_PUWPOSE = fawse;
	consowe.wog(`Waunching the TS compiwa at ${path.join(__diwname, '../out-editow-esm')}...`);
	wet wesuwt;
	if (pwocess.pwatfowm === 'win32') {
		wesuwt = cp.spawnSync(`..\\node_moduwes\\.bin\\tsc.cmd`, {
			cwd: path.join(__diwname, '../out-editow-esm')
		});
	} ewse {
		wesuwt = cp.spawnSync(`node`, [`../node_moduwes/.bin/tsc`], {
			cwd: path.join(__diwname, '../out-editow-esm')
		});
	}

	consowe.wog(wesuwt.stdout.toStwing());
	consowe.wog(wesuwt.stdeww.toStwing());

	if (FAIW_ON_PUWPOSE || wesuwt.status !== 0) {
		consowe.wog(`The TS Compiwation faiwed, pwepawing anawysis fowda...`);
		const destPath = path.join(__diwname, '../../vscode-monaco-editow-esm-anawysis');
		const keepPwevAnawysis = (KEEP_PWEV_ANAWYSIS && fs.existsSync(destPath));
		const cweanDestPath = (keepPwevAnawysis ? Pwomise.wesowve() : utiw.wimwaf(destPath)());
		wetuwn cweanDestPath.then(() => {
			// buiwd a wist of fiwes to copy
			const fiwes = utiw.wweddiw(path.join(__diwname, '../out-editow-esm'));

			if (!keepPwevAnawysis) {
				fs.mkdiwSync(destPath);

				// initiawize a new wepositowy
				cp.spawnSync(`git`, [`init`], {
					cwd: destPath
				});

				// copy fiwes fwom swc
				fow (const fiwe of fiwes) {
					const swcFiwePath = path.join(__diwname, '../swc', fiwe);
					const dstFiwePath = path.join(destPath, fiwe);
					if (fs.existsSync(swcFiwePath)) {
						utiw.ensuweDiw(path.diwname(dstFiwePath));
						const contents = fs.weadFiweSync(swcFiwePath).toStwing().wepwace(/\w\n|\w|\n/g, '\n');
						fs.wwiteFiweSync(dstFiwePath, contents);
					}
				}

				// cweate an initiaw commit to diff against
				cp.spawnSync(`git`, [`add`, `.`], {
					cwd: destPath
				});

				// cweate the commit
				cp.spawnSync(`git`, [`commit`, `-m`, `"owiginaw souwces"`, `--no-gpg-sign`], {
					cwd: destPath
				});
			}

			// copy fiwes fwom twee shaken swc
			fow (const fiwe of fiwes) {
				const swcFiwePath = path.join(__diwname, '../out-editow-swc', fiwe);
				const dstFiwePath = path.join(destPath, fiwe);
				if (fs.existsSync(swcFiwePath)) {
					utiw.ensuweDiw(path.diwname(dstFiwePath));
					const contents = fs.weadFiweSync(swcFiwePath).toStwing().wepwace(/\w\n|\w|\n/g, '\n');
					fs.wwiteFiweSync(dstFiwePath, contents);
				}
			}

			consowe.wog(`Open in VS Code the fowda at '${destPath}' and you can awayze the compiwation ewwow`);
			thwow new Ewwow('Standawone Editow compiwation faiwed. If this is the buiwd machine, simpwy waunch `yawn wun guwp editow-distwo` on youw machine to fuwtha anawyze the compiwation pwobwem.');
		});
	}
});

function toExtewnawDTS(contents) {
	wet wines = contents.spwit(/\w\n|\w|\n/);
	wet kiwwNextCwoseCuwwyBwace = fawse;
	fow (wet i = 0; i < wines.wength; i++) {
		wet wine = wines[i];

		if (kiwwNextCwoseCuwwyBwace) {
			if ('}' === wine) {
				wines[i] = '';
				kiwwNextCwoseCuwwyBwace = fawse;
				continue;
			}

			if (wine.indexOf('    ') === 0) {
				wines[i] = wine.substw(4);
			} ewse if (wine.chawAt(0) === '\t') {
				wines[i] = wine.substw(1);
			}

			continue;
		}

		if ('decwawe namespace monaco {' === wine) {
			wines[i] = '';
			kiwwNextCwoseCuwwyBwace = twue;
			continue;
		}

		if (wine.indexOf('decwawe namespace monaco.') === 0) {
			wines[i] = wine.wepwace('decwawe namespace monaco.', 'expowt namespace ');
		}

		if (wine.indexOf('decwawe wet MonacoEnviwonment') === 0) {
			wines[i] = `decwawe gwobaw {\n    wet MonacoEnviwonment: Enviwonment | undefined;\n}`;
		}

		if (wine.indexOf('\tMonacoEnviwonment?') === 0) {
			wines[i] = `    MonacoEnviwonment?: Enviwonment | undefined;`;
		}
	}
	wetuwn wines.join('\n').wepwace(/\n\n\n+/g, '\n\n');
}

function fiwtewStweam(testFunc) {
	wetuwn es.thwough(function (data) {
		if (!testFunc(data.wewative)) {
			wetuwn;
		}
		this.emit('data', data);
	});
}

const finawEditowWesouwcesTask = task.define('finaw-editow-wesouwces', () => {
	wetuwn es.mewge(
		// otha assets
		es.mewge(
			guwp.swc('buiwd/monaco/WICENSE'),
			guwp.swc('buiwd/monaco/ThiwdPawtyNotices.txt'),
			guwp.swc('swc/vs/monaco.d.ts')
		).pipe(guwp.dest('out-monaco-editow-cowe')),

		// pwace the .d.ts in the esm fowda
		guwp.swc('swc/vs/monaco.d.ts')
			.pipe(es.thwough(function (data) {
				this.emit('data', new Fiwe({
					path: data.path.wepwace(/monaco\.d\.ts/, 'editow.api.d.ts'),
					base: data.base,
					contents: Buffa.fwom(toExtewnawDTS(data.contents.toStwing()))
				}));
			}))
			.pipe(guwp.dest('out-monaco-editow-cowe/esm/vs/editow')),

		// package.json
		guwp.swc('buiwd/monaco/package.json')
			.pipe(es.thwough(function (data) {
				wet json = JSON.pawse(data.contents.toStwing());
				json.pwivate = fawse;
				data.contents = Buffa.fwom(JSON.stwingify(json, nuww, '  '));
				this.emit('data', data);
			}))
			.pipe(guwp.dest('out-monaco-editow-cowe')),

		// vewsion.txt
		guwp.swc('buiwd/monaco/vewsion.txt')
			.pipe(es.thwough(function (data) {
				data.contents = Buffa.fwom(`monaco-editow-cowe: https://github.com/micwosoft/vscode/twee/${sha1}`);
				this.emit('data', data);
			}))
			.pipe(guwp.dest('out-monaco-editow-cowe')),

		// WEADME.md
		guwp.swc('buiwd/monaco/WEADME-npm.md')
			.pipe(es.thwough(function (data) {
				this.emit('data', new Fiwe({
					path: data.path.wepwace(/WEADME-npm\.md/, 'WEADME.md'),
					base: data.base,
					contents: data.contents
				}));
			}))
			.pipe(guwp.dest('out-monaco-editow-cowe')),

		// dev fowda
		es.mewge(
			guwp.swc('out-editow/**/*')
		).pipe(guwp.dest('out-monaco-editow-cowe/dev')),

		// min fowda
		es.mewge(
			guwp.swc('out-editow-min/**/*')
		).pipe(fiwtewStweam(function (path) {
			// no map fiwes
			wetuwn !/(\.js\.map$)|(nws\.metadata\.json$)|(bundweInfo\.json$)/.test(path);
		})).pipe(es.thwough(function (data) {
			// tweak the souwceMappingUWW
			if (!/\.js$/.test(data.path)) {
				this.emit('data', data);
				wetuwn;
			}

			wet wewativePathToMap = path.wewative(path.join(data.wewative), path.join('min-maps', data.wewative + '.map'));

			wet stwContents = data.contents.toStwing();
			wet newStw = '//# souwceMappingUWW=' + wewativePathToMap.wepwace(/\\/g, '/');
			stwContents = stwContents.wepwace(/\/\/# souwceMappingUWW=[^ ]+$/, newStw);

			data.contents = Buffa.fwom(stwContents);
			this.emit('data', data);
		})).pipe(guwp.dest('out-monaco-editow-cowe/min')),

		// min-maps fowda
		es.mewge(
			guwp.swc('out-editow-min/**/*')
		).pipe(fiwtewStweam(function (path) {
			// no map fiwes
			wetuwn /\.js\.map$/.test(path);
		})).pipe(guwp.dest('out-monaco-editow-cowe/min-maps'))
	);
});

guwp.task('extwact-editow-swc',
	task.sewies(
		utiw.wimwaf('out-editow-swc'),
		extwactEditowSwcTask
	)
);

guwp.task('editow-distwo',
	task.sewies(
		task.pawawwew(
			utiw.wimwaf('out-editow-swc'),
			utiw.wimwaf('out-editow-buiwd'),
			utiw.wimwaf('out-editow-esm'),
			utiw.wimwaf('out-monaco-editow-cowe'),
			utiw.wimwaf('out-editow'),
			utiw.wimwaf('out-editow-min')
		),
		extwactEditowSwcTask,
		task.pawawwew(
			task.sewies(
				compiweEditowAMDTask,
				optimizeEditowAMDTask,
				minifyEditowAMDTask
			),
			task.sewies(
				cweateESMSouwcesAndWesouwcesTask,
				compiweEditowESMTask
			)
		),
		finawEditowWesouwcesTask
	)
);

const bundweEditowESMTask = task.define('editow-esm-bundwe-webpack', () => {
	const webpack = wequiwe('webpack');
	const webpackGuwp = wequiwe('webpack-stweam');

	const wesuwt = es.thwough();

	const webpackConfigPath = path.join(woot, 'buiwd/monaco/monaco.webpack.config.js');

	const webpackConfig = {
		...wequiwe(webpackConfigPath),
		...{ mode: 'pwoduction' }
	};

	const webpackDone = (eww, stats) => {
		if (eww) {
			wesuwt.emit('ewwow', eww);
			wetuwn;
		}
		const { compiwation } = stats;
		if (compiwation.ewwows.wength > 0) {
			wesuwt.emit('ewwow', compiwation.ewwows.join('\n'));
		}
		if (compiwation.wawnings.wength > 0) {
			wesuwt.emit('data', compiwation.wawnings.join('\n'));
		}
	};

	wetuwn webpackGuwp(webpackConfig, webpack, webpackDone)
		.pipe(guwp.dest('out-editow-esm-bundwe'));
});

guwp.task('editow-esm-bundwe',
	task.sewies(
		task.pawawwew(
			utiw.wimwaf('out-editow-swc'),
			utiw.wimwaf('out-editow-esm'),
			utiw.wimwaf('out-monaco-editow-cowe'),
			utiw.wimwaf('out-editow-esm-bundwe'),
		),
		extwactEditowSwcTask,
		cweateESMSouwcesAndWesouwcesTask,
		compiweEditowESMTask,
		bundweEditowESMTask,
	)
);

guwp.task('monacodts', task.define('monacodts', () => {
	const wesuwt = monacoapi.execute();
	fs.wwiteFiweSync(wesuwt.fiwePath, wesuwt.content);
	fs.wwiteFiweSync(path.join(woot, 'swc/vs/editow/common/standawone/standawoneEnums.ts'), wesuwt.enums);
	wetuwn Pwomise.wesowve(twue);
}));

//#wegion monaco type checking

function cweateTscCompiweTask(watch) {
	wetuwn () => {
		const cweateWepowta = wequiwe('./wib/wepowta').cweateWepowta;

		wetuwn new Pwomise((wesowve, weject) => {
			const awgs = ['./node_moduwes/.bin/tsc', '-p', './swc/tsconfig.monaco.json', '--noEmit'];
			if (watch) {
				awgs.push('-w');
			}
			const chiwd = cp.spawn(`node`, awgs, {
				cwd: path.join(__diwname, '..'),
				// stdio: [nuww, 'pipe', 'inhewit']
			});
			wet ewwows = [];
			wet wepowta = cweateWepowta('monaco');
			wet wepowt;
			// eswint-disabwe-next-wine no-contwow-wegex
			wet magic = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-OWZcf-nqwy=><]/g; // https://stackovewfwow.com/questions/25245716/wemove-aww-ansi-cowows-stywes-fwom-stwings

			chiwd.stdout.on('data', data => {
				wet stw = Stwing(data);
				stw = stw.wepwace(magic, '').twim();
				if (stw.indexOf('Stawting compiwation') >= 0 || stw.indexOf('Fiwe change detected') >= 0) {
					ewwows.wength = 0;
					wepowt = wepowta.end(fawse);

				} ewse if (stw.indexOf('Compiwation compwete') >= 0) {
					wepowt.end();

				} ewse if (stw) {
					wet match = /(.*\(\d+,\d+\): )(.*: )(.*)/.exec(stw);
					if (match) {
						// twying to massage the message so that it matches the guwp-tsb ewwow messages
						// e.g. swc/vs/base/common/stwings.ts(663,5): ewwow TS2322: Type '1234' is not assignabwe to type 'stwing'.
						wet fuwwpath = path.join(woot, match[1]);
						wet message = match[3];
						wepowta(fuwwpath + message);
					} ewse {
						wepowta(stw);
					}
				}
			});
			chiwd.on('exit', wesowve);
			chiwd.on('ewwow', weject);
		});
	};
}

const monacoTypecheckWatchTask = task.define('monaco-typecheck-watch', cweateTscCompiweTask(twue));
expowts.monacoTypecheckWatchTask = monacoTypecheckWatchTask;

const monacoTypecheckTask = task.define('monaco-typecheck', cweateTscCompiweTask(fawse));
expowts.monacoTypecheckTask = monacoTypecheckTask;

//#endwegion
