/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const gulp = require('gulp');
const path = require('path');
const util = require('./lib/util');
const common = require('./lib/optimize');
const es = require('event-stream');
const File = require('vinyl');
const i18n = require('./lib/i18n');
const standalone = require('./lib/standalone');
const cp = require('child_process');
const compilation = require('./lib/compilation');
const monacoapi = require('./monaco/api');
const fs = require('fs');

var root = path.dirname(__dirname);
var sha1 = util.getVersion(root);
var semver = require('./monaco/package.json').version;
var headerVersion = semver + '(' + sha1 + ')';

// Build

var editorEntryPoints = [
	{
		name: 'vs/editor/editor.main',
		include: [],
		exclude: ['vs/css', 'vs/nls'],
		prepend: ['out-editor-build/vs/css.js', 'out-editor-build/vs/nls.js'],
	},
	{
		name: 'vs/base/common/worker/simpleWorker',
		include: ['vs/editor/common/services/editorSimpleWorker'],
		prepend: ['vs/loader.js'],
		append: ['vs/base/worker/workerMain'],
		dest: 'vs/base/worker/workerMain.js'
	}
];

var editorResources = [
	'out-build/vs/{base,editor}/**/*.{svg,png}',
	'!out-build/vs/base/browser/ui/splitview/**/*',
	'!out-build/vs/base/browser/ui/toolbar/**/*',
	'!out-build/vs/base/browser/ui/octiconLabel/**/*',
	'!out-build/vs/workbench/**',
	'!**/test/**'
];

var editorOtherSources = [
];

var BUNDLED_FILE_HEADER = [
	'/*!-----------------------------------------------------------',
	' * Copyright (c) Microsoft Corporation. All rights reserved.',
	' * Version: ' + headerVersion,
	' * Released under the MIT license',
	' * https://github.com/Microsoft/vscode/blob/master/LICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

const languages = i18n.defaultLanguages.concat([]);  // i18n.defaultLanguages.concat(process.env.VSCODE_QUALITY !== 'stable' ? i18n.extraLanguages : []);

gulp.task('clean-editor-src', util.rimraf('out-editor-src'));
gulp.task('extract-editor-src', ['clean-editor-src'], function () {
	console.log(`If the build fails, consider tweaking shakeLevel below to a lower value.`);
	const apiusages = monacoapi.execute().usageContent;
	const extrausages = fs.readFileSync(path.join(root, 'build', 'monaco', 'monaco.usage.recipe')).toString();
	standalone.extractEditor({
		sourcesRoot: path.join(root, 'src'),
		entryPoints: [
			'vs/editor/editor.main',
			'vs/editor/editor.worker',
			'vs/base/worker/workerMain',
		],
		inlineEntryPoints: [
			apiusages,
			extrausages
		],
		typings: [
			'typings/lib.ie11_safe_es6.d.ts',
			'typings/thenable.d.ts',
			'typings/es6-promise.d.ts',
			'typings/require-monaco.d.ts',
			'vs/monaco.d.ts'
		],
		libs: [
			`lib.es5.d.ts`,
			`lib.dom.d.ts`,
			`lib.webworker.importscripts.d.ts`
		],
		redirects: {
			'vs/base/browser/ui/octiconLabel/octiconLabel': 'vs/base/browser/ui/octiconLabel/octiconLabel.mock',
		},
		shakeLevel: 2, // 0-Files, 1-InnerFile, 2-ClassMembers
		importIgnorePattern: /(^vs\/css!)|(promise-polyfill\/polyfill)/,
		destRoot: path.join(root, 'out-editor-src')
	});
});

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('clean-editor-build', util.rimraf('out-editor-build'));
gulp.task('compile-editor-build', ['clean-editor-build', 'extract-editor-src'], compilation.compileTask('out-editor-src', 'out-editor-build', true));

gulp.task('clean-optimized-editor', util.rimraf('out-editor'));
gulp.task('optimize-editor', ['clean-optimized-editor', 'compile-editor-build'], common.optimizeTask({
	src: 'out-editor-build',
	entryPoints: editorEntryPoints,
	otherSources: editorOtherSources,
	resources: editorResources,
	loaderConfig: {
		paths: {
			'vs': 'out-editor-build/vs',
			'vs/css': 'out-editor-build/vs/css.build',
			'vs/nls': 'out-editor-build/vs/nls.build',
			'vscode': 'empty:'
		}
	},
	bundleLoader: false,
	header: BUNDLED_FILE_HEADER,
	bundleInfo: true,
	out: 'out-editor',
	languages: languages
}));

gulp.task('clean-minified-editor', util.rimraf('out-editor-min'));
gulp.task('minify-editor', ['clean-minified-editor', 'optimize-editor'], common.minifyTask('out-editor'));

gulp.task('clean-editor-esm', util.rimraf('out-editor-esm'));
gulp.task('extract-editor-esm', ['clean-editor-esm', 'clean-editor-distro', 'extract-editor-src'], function () {
	standalone.createESMSourcesAndResources2({
		srcFolder: './out-editor-src',
		outFolder: './out-editor-esm',
		outResourcesFolder: './out-monaco-editor-core/esm',
		ignores: [
			'inlineEntryPoint:0.ts',
			'inlineEntryPoint:1.ts',
			'vs/loader.js',
			'vs/nls.ts',
			'vs/nls.build.js',
			'vs/nls.d.ts',
			'vs/css.js',
			'vs/css.build.js',
			'vs/css.d.ts',
			'vs/base/worker/workerMain.ts',
		],
		renames: {
			'vs/nls.mock.ts': 'vs/nls.ts'
		}
	});
});
gulp.task('compile-editor-esm', ['extract-editor-esm', 'clean-editor-distro'], function () {
	if (process.platform === 'win32') {
		const result = cp.spawnSync(`..\\node_modules\\.bin\\tsc.cmd`, {
			cwd: path.join(__dirname, '../out-editor-esm')
		});
		console.log(result.stdout.toString());
		console.log(result.stderr.toString());
	} else {
		const result = cp.spawnSync(`node`, [`../node_modules/.bin/tsc`], {
			cwd: path.join(__dirname, '../out-editor-esm')
		});
		console.log(result.stdout.toString());
		console.log(result.stderr.toString());
	}
});

function toExternalDTS(contents) {
	let lines = contents.split('\n');
	let killNextCloseCurlyBrace = false;
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];

		if (killNextCloseCurlyBrace) {
			if ('}' === line) {
				lines[i] = '';
				killNextCloseCurlyBrace = false;
				continue;
			}

			if (line.indexOf('    ') === 0) {
				lines[i] = line.substr(4);
			} else if (line.charAt(0) === '\t') {
				lines[i] = line.substr(1);
			}

			continue;
		}

		if ('declare namespace monaco {' === line) {
			lines[i] = '';
			killNextCloseCurlyBrace = true;
			continue;
		}

		if (line.indexOf('declare namespace monaco.') === 0) {
			lines[i] = line.replace('declare namespace monaco.', 'export namespace ');
		}
	}
	return lines.join('\n');
}

gulp.task('clean-editor-distro', util.rimraf('out-monaco-editor-core'));
gulp.task('editor-distro', ['clean-editor-distro', 'compile-editor-esm', 'minify-editor', 'optimize-editor'], function () {
	return es.merge(
		// other assets
		es.merge(
			gulp.src('build/monaco/LICENSE'),
			gulp.src('build/monaco/ThirdPartyNotices.txt'),
			gulp.src('src/vs/monaco.d.ts')
		).pipe(gulp.dest('out-monaco-editor-core')),

		// place the .d.ts in the esm folder
		gulp.src('src/vs/monaco.d.ts')
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/monaco\.d\.ts/, 'editor.api.d.ts'),
					base: data.base,
					contents: Buffer.from(toExternalDTS(data.contents.toString()))
				}));
			}))
			.pipe(gulp.dest('out-monaco-editor-core/esm/vs/editor')),

		// package.json
		gulp.src('build/monaco/package.json')
			.pipe(es.through(function (data) {
				var json = JSON.parse(data.contents.toString());
				json.private = false;
				data.contents = Buffer.from(JSON.stringify(json, null, '  '));
				this.emit('data', data);
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// README.md
		gulp.src('build/monaco/README-npm.md')
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/README-npm\.md/, 'README.md'),
					base: data.base,
					contents: data.contents
				}));
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// dev folder
		es.merge(
			gulp.src('out-editor/**/*')
		).pipe(gulp.dest('out-monaco-editor-core/dev')),

		// min folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function (path) {
			// no map files
			return !/(\.js\.map$)|(nls\.metadata\.json$)|(bundleInfo\.json$)/.test(path);
		})).pipe(es.through(function (data) {
			// tweak the sourceMappingURL
			if (!/\.js$/.test(data.path)) {
				this.emit('data', data);
				return;
			}

			var relativePathToMap = path.relative(path.join(data.relative), path.join('min-maps', data.relative + '.map'));

			var strContents = data.contents.toString();
			var newStr = '//# sourceMappingURL=' + relativePathToMap.replace(/\\/g, '/');
			strContents = strContents.replace(/\/\/\# sourceMappingURL=[^ ]+$/, newStr);

			data.contents = Buffer.from(strContents);
			this.emit('data', data);
		})).pipe(gulp.dest('out-monaco-editor-core/min')),

		// min-maps folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function (path) {
			// no map files
			return /\.js\.map$/.test(path);
		})).pipe(gulp.dest('out-monaco-editor-core/min-maps'))
	);
});

gulp.task('analyze-editor-distro', function () {
	// @ts-ignore
	var bundleInfo = require('../out-editor/bundleInfo.json');
	var graph = bundleInfo.graph;
	var bundles = bundleInfo.bundles;

	var inverseGraph = {};
	Object.keys(graph).forEach(function (module) {
		var dependencies = graph[module];
		dependencies.forEach(function (dep) {
			inverseGraph[dep] = inverseGraph[dep] || [];
			inverseGraph[dep].push(module);
		});
	});

	var detailed = {};
	Object.keys(bundles).forEach(function (entryPoint) {
		var included = bundles[entryPoint];
		var includedMap = {};
		included.forEach(function (included) {
			includedMap[included] = true;
		});

		var explanation = [];
		included.map(function (included) {
			if (included.indexOf('!') >= 0) {
				return;
			}

			var reason = (inverseGraph[included] || []).filter(function (mod) {
				return !!includedMap[mod];
			});
			explanation.push({
				module: included,
				reason: reason
			});
		});

		detailed[entryPoint] = explanation;
	});

	console.log(JSON.stringify(detailed, null, '\t'));
});

function filterStream(testFunc) {
	return es.through(function (data) {
		if (!testFunc(data.relative)) {
			return;
		}
		this.emit('data', data);
	});
}


//#region monaco type checking

function createTscCompileTask(watch) {
	return () => {
		const createReporter = require('./lib/reporter').createReporter;

		return new Promise((resolve, reject) => {
			const args = ['./node_modules/.bin/tsc', '-p', './src/tsconfig.monaco.json', '--noEmit'];
			if (watch) {
				args.push('-w');
			}
			const child = cp.spawn(`node`, args, {
				cwd: path.join(__dirname, '..'),
				// stdio: [null, 'pipe', 'inherit']
			});
			let errors = [];
			let reporter = createReporter();
			let report;
			let magic = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; // https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings

			child.stdout.on('data', data => {
				let str = String(data);
				str = str.replace(magic, '').trim();
				if (str.indexOf('Starting compilation') >= 0 || str.indexOf('File change detected') >= 0) {
					errors.length = 0;
					report = reporter.end(false);

				} else if (str.indexOf('Compilation complete') >= 0) {
					report.end();

				} else if (str) {
					let match = /(.*\(\d+,\d+\): )(.*: )(.*)/.exec(str);
					if (match) {
						// trying to massage the message so that it matches the gulp-tsb error messages
						// e.g. src/vs/base/common/strings.ts(663,5): error TS2322: Type '1234' is not assignable to type 'string'.
						let fullpath = path.join(root, match[1]);
						let message = match[3];
						// @ts-ignore
						reporter(fullpath + message);
					} else {
						// @ts-ignore
						reporter(str);
					}
				}
			});
			child.on('exit', resolve);
			child.on('error', reject);
		});
	};
}

gulp.task('monaco-typecheck-watch', createTscCompileTask(true));
gulp.task('monaco-typecheck', createTscCompileTask(false));

//#endregion
