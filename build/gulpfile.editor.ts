/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp, filter } from './lib/gulp/facade.ts';
import path from 'path';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/gulp/task.ts';
import es from 'event-stream';
import File from 'vinyl';
import * as i18n from './lib/i18n.ts';
import * as standalone from './lib/standalone.ts';
import * as cp from 'child_process';
import * as compilation from './lib/compilation.ts';
import * as monacoapi from './lib/monaco-api.ts';
import * as fs from 'fs';
import { createReporter } from './lib/reporter.ts';
import monacoPackage from './monaco/package.json' with { type: 'json' };
import { paths } from './folders.ts';

const root = path.dirname(import.meta.dirname);
const sha1 = getVersion(root);
const semver = monacoPackage.version;
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
	// Ensure codicon.ttf is copied from node_modules (needed when node_modules is cached and postinstall doesn't run)
	const codiconSource = paths.nodeModules.vscodeCodiconsTtf.absPath;
	const codiconDest = paths.src.codiconTtf.absPath;
	if (fs.existsSync(codiconSource)) {
		fs.mkdirSync(path.dirname(codiconDest), { recursive: true });
		fs.copyFileSync(codiconSource, codiconDest);
	}

	const apiusages = monacoapi.execute().usageContent;
	const extrausages = fs.readFileSync(paths.build.monaco.usageRecipe.absPath).toString();
	standalone.extractEditor({
		sourcesRoot: paths.src.absPath,
		entryPoints: [
			'vs/editor/editor.main.ts',
			'vs/editor/editor.worker.start.ts',
			'vs/editor/common/services/editorWebWorkerMain.ts',
		],
		inlineEntryPoints: [
			apiusages,
			extrausages
		],
		typings: [],
		additionalFilesToCopyOut: [
			'vs/base/browser/dompurify/dompurify.js',
			'vs/base/common/marked/marked.js',
		],
		shakeLevel: 2, // 0-Files, 1-InnerFile, 2-ClassMembers
		importIgnorePattern: /\.css$/,
		destRoot: paths.outEditorSrc.absPath,
		tsOutDir: `../${paths.outMonacoEditorCore.rootRelPath}/esm/vs`,
	});
});

const compileEditorESMTask = task.define('compile-editor-esm', () => {

	const src = paths.outEditorSrc.rootRelPath;
	const out = `${paths.outMonacoEditorCore.rootRelPath}/esm`;

	const compile = compilation.createCompile(src, { build: true, emitError: true, transpileOnly: false, preserveEnglish: true });
	const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });

	return (
		srcPipe
			.pipe(compile())
			.pipe(i18n.processNlsFiles({
				out,
				fileHeader: BUNDLED_FILE_HEADER,
				languages: [...i18n.defaultLanguages, ...i18n.extraLanguages],
			}))
			.pipe(filter(['**', '!**/inlineEntryPoint*', '!**/tsconfig.json']))
			.pipe(gulp.dest(out))
	);
});

function toExternalDTS(contents: string) {
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

		if (line.indexOf('declare var MonacoEnvironment') === 0) {
			lines[i] = `declare global {\n    var MonacoEnvironment: Environment | undefined;\n}`;
		}
	}
	return lines.join('\n').replace(/\n\n\n+/g, '\n\n');
}

const finalEditorResourcesTask = task.define('final-editor-resources', () => {
	return es.merge(
		// other assets
		es.merge(
			gulp.src(paths.build.monaco.license.rootRelPath),
			gulp.src(paths.build.monaco.thirdPartyNotices.rootRelPath),
			gulp.src(paths.src.monacoDts.rootRelPath)
		).pipe(gulp.dest(paths.outMonacoEditorCore.rootRelPath)),

		// place the .d.ts in the esm folder
		gulp.src(paths.src.monacoDts.rootRelPath)
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/monaco\.d\.ts/, 'editor.api.d.ts'),
					base: data.base,
					contents: Buffer.from(toExternalDTS(data.contents.toString()))
				}));
			}))
			.pipe(gulp.dest(`${paths.outMonacoEditorCore.rootRelPath}/esm/vs/editor`)),

		// package.json
		gulp.src(paths.build.monaco.packageJson.rootRelPath)
			.pipe(es.through(function (data) {
				const json = JSON.parse(data.contents.toString());
				json.private = false;

				let markedVersion;
				let dompurifyVersion;
				try {
					const markedManifestPath = paths.src.markedCgmanifest.absPath;
					const dompurifyManifestPath = paths.src.dompurifyCgmanifest.absPath;

					const markedManifest = JSON.parse(fs.readFileSync(markedManifestPath, 'utf8'));
					const dompurifyManifest = JSON.parse(fs.readFileSync(dompurifyManifestPath, 'utf8'));

					markedVersion = markedManifest.registrations[0].version;
					dompurifyVersion = dompurifyManifest.registrations[0].version;

					if (!markedVersion || !dompurifyVersion) {
						throw new Error('Unable to read versions from cgmanifest.json files');
					}
				} catch (error) {
					throw new Error(`Failed to read cgmanifest.json files for monaco-editor-core dependencies: ${error.message}`);
				}

				setUnsetField(json, 'dependencies', {
					'marked': markedVersion,
					'dompurify': dompurifyVersion
				});

				data.contents = Buffer.from(JSON.stringify(json, null, '  '));
				this.emit('data', data);
			}))
			.pipe(gulp.dest(paths.outMonacoEditorCore.rootRelPath)),

		// version.txt
		gulp.src(paths.build.monaco.versionTxt.rootRelPath)
			.pipe(es.through(function (data) {
				data.contents = Buffer.from(`monaco-editor-core: https://github.com/microsoft/vscode/tree/${sha1}`);
				this.emit('data', data);
			}))
			.pipe(gulp.dest(paths.outMonacoEditorCore.rootRelPath)),

		// README.md
		gulp.src(paths.build.monaco.readmeNpm.rootRelPath)
			.pipe(es.through(function (data) {
				this.emit('data', new File({
					path: data.path.replace(/README-npm\.md/, 'README.md'),
					base: data.base,
					contents: data.contents
				}));
			}))
			.pipe(gulp.dest(paths.outMonacoEditorCore.rootRelPath)),
	);
});

task.task('extract-editor-src',
	task.series(
		util.rimraf(paths.outEditorSrc.rootRelPath),
		extractEditorSrcTask
	)
);

task.task('editor-distro',
	task.series(
		task.parallel(
			util.rimraf(paths.outEditorSrc.rootRelPath),
			util.rimraf(paths.outMonacoEditorCore.rootRelPath),
		),
		extractEditorSrcTask,
		compileEditorESMTask,
		finalEditorResourcesTask
	)
);

task.task('monacodts', task.define('monacodts', () => {
	const result = monacoapi.execute();
	fs.writeFileSync(result.filePath, result.content);
	fs.writeFileSync(paths.src.standaloneEnums.absPath, result.enums);
	return Promise.resolve(true);
}));

//#region monaco type checking

function createTscCompileTask(watch: boolean) {
	return () => {
		return new Promise((resolve, reject) => {
			const args = ['./node_modules/.bin/tsc', '-p', paths.src.tsconfigMonaco.rootRelPath, '--noEmit'];
			if (watch) {
				args.push('-w');
			}
			const child = cp.spawn(`node`, args, {
				cwd: path.join(import.meta.dirname, '..'),
				// stdio: [null, 'pipe', 'inherit']
			});
			const errors: string[] = [];
			const reporter = createReporter('monaco');

			let report: NodeJS.ReadWriteStream | undefined;
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

export const monacoTypecheckWatchTask = task.define('monaco-typecheck-watch', createTscCompileTask(true));

export const monacoTypecheckTask = task.define('monaco-typecheck', createTscCompileTask(false));

//#endregion
/**
 * Sets a field on an object only if it's not already set, otherwise throws an error
 * @param obj The object to modify
 * @param field The field name to set
 * @param value The value to set
 */
function setUnsetField(obj: Record<string, unknown>, field: string, value: unknown) {
	if (obj[field] !== undefined) {
		throw new Error(`Field "${field}" is already set (but was expected to not be).`);
	}
	obj[field] = value;
}
