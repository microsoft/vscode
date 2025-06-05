/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const gulp = require('gulp');
const path = require('path');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const es = require('event-stream');
const File = require('vinyl');
const i18n = require('./lib/i18n');
const standalone = require('./lib/standalone');
const cp = require('child_process');
const compilation = require('./lib/compilation');
const monacoapi = require('./lib/monaco-api');
const fs = require('fs');
const filter = require('gulp-filter');

const root = path.dirname(__dirname);
const sha1 = getVersion(root);
const semver = require('./monaco/package.json').version;
const headerVersion = semver + '(' + sha1 + ')';

const BUNDLED_FILE_HEADER = [
	'/*!-----------------------------------------------------------',
	' * Copyright (c) Microsoft Corporation. All rights reserved.',
	' * Version: ' + headerVersion,
	' * Released under the MIT license',
	' * https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

const extractEditorSrcTask = task.define('extract-editor-src', () => {
	const apiusages = monacoapi.execute().usageContent;
	const extrausages = fs.readFileSync(path.join(root, 'build', 'monaco', 'monaco.usage.recipe')).toString();
	standalone.extractEditor({
		sourcesRoot: path.join(root, 'src'),
		entryPoints: [
			'vs/editor/editor.main',
			'vs/editor/editor.worker.start',
			'vs/editor/common/services/editorWebWorkerMain',
		],
		inlineEntryPoints: [
			apiusages,
			extrausages
		],
		typings: [],
		shakeLevel: 2, // 0-Files, 1-InnerFile, 2-ClassMembers
		importIgnorePattern: /\.css$/,
		destRoot: path.join(root, 'out-editor-src'),
		tsOutDir: '../out-monaco-editor-core/esm/vs',
		redirects: {
			'@vscode/tree-sitter-wasm': '../node_modules/@vscode/tree-sitter-wasm/wasm/web-tree-sitter',
		}
	});
});

const compileEditorESMTask = task.define('compile-editor-esm', () => {

	const src = 'out-editor-src';
	const out = 'out-monaco-editor-core/esm';

	const compile = compilation.createCompile(src, { build: true, emitError: true, transpileOnly: false, preserveEnglish: true });
	const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });

	return (
		srcPipe
			.pipe(compile())
			.pipe(i18n.processNlsFiles({
				out,
				fileHeader: BUNDLED_FILE_HEADER,
				languages: i18n.defaultLanguages,
			}))
			.pipe(filter(['**', '!**/inlineEntryPoint*', '!**/tsconfig.json', '!**/loader.js']))
			.pipe(gulp.dest(out))
	);
});

/**
 * @param {string} contents
 */
function toExternalDTS(contents) {
	const lines = contents.split(/\r\n|\r|\n/);
	let killNextCloseCurlyBrace = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

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

		if (line.indexOf('declare let MonacoEnvironment') === 0) {
			lines[i] = `declare global {\n    let MonacoEnvironment: Environment | undefined;\n}`;
		}

		if (line.indexOf('\tMonacoEnvironment?') === 0) {
			lines[i] = `    MonacoEnvironment?: Environment | undefined;`;
		}
	}
	return lines.join('\n').replace(/\n\n\n+/g, '\n\n');
}

const finalEditorResourcesTask = task.define('final-editor-resources', () => {
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
				const json = JSON.parse(data.contents.toString());
				json.private = false;
				data.contents = Buffer.from(JSON.stringify(json, null, '  '));
				this.emit('data', data);
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// version.txt
		gulp.src('build/monaco/version.txt')
			.pipe(es.through(function (data) {
				data.contents = Buffer.from(`monaco-editor-core: https://github.com/microsoft/vscode/tree/${sha1}`);
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
	);
});

gulp.task('extract-editor-src',
	task.series(
		util.rimraf('out-editor-src'),
		extractEditorSrcTask
	)
);

gulp.task('editor-distro',
	task.series(
		task.parallel(
			util.rimraf('out-editor-src'),
			util.rimraf('out-monaco-editor-core'),
		),
		extractEditorSrcTask,
		compileEditorESMTask,
		finalEditorResourcesTask
	)
);

gulp.task('monacodts', task.define('monacodts', () => {
	const result = monacoapi.execute();
	fs.writeFileSync(result.filePath, result.content);
	fs.writeFileSync(path.join(root, 'src/vs/editor/common/standalone/standaloneEnums.ts'), result.enums);
	return Promise.resolve(true);
}));

//#region monaco type checking

/**
 * @param {boolean} watch
 */
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
			const errors = [];
			const reporter = createReporter('monaco');

			/** @type {NodeJS.ReadWriteStream | undefined} */
			let report;
			const magic = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g; // https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings

			child.stdout.on('data', data => {
				let str = String(data);
				str = str.replace(magic, '').trim();
				if (str.indexOf('Starting compilation') >= 0 || str.indexOf('File change detected') >= 0) {
					errors.length = 0;
					report = reporter.end(false);

				} else if (str.indexOf('Compilation complete') >= 0) {
					// @ts-ignore
					report.end();

				} else if (str) {
					const match = /(.*\(\d+,\d+\): )(.*: )(.*)/.exec(str);
					if (match) {
						// trying to massage the message so that it matches the gulp-tsb error messages
						// e.g. src/vs/base/common/strings.ts(663,5): error TS2322: Type '1234' is not assignable to type 'string'.
						const fullpath = path.join(root, match[1]);
						const message = match[3];
						reporter(fullpath + message);
					} else {
						reporter(str);
					}
				}
			});
			child.on('exit', resolve);
			child.on('error', reject);
		});
	};
}

const monacoTypecheckWatchTask = task.define('monaco-typecheck-watch', createTscCompileTask(true));
exports.monacoTypecheckWatchTask = monacoTypecheckWatchTask;

const monacoTypecheckTask = task.define('monaco-typecheck', createTscCompileTask(false));
exports.monacoTypecheckTask = monacoTypecheckTask;

//#endregion
