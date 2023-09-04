/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import * as fs from 'fs';
import * as gulp from 'gulp';
import * as path from 'path';
import * as monacodts from './monaco-api';
import * as nls from './nls';
import { createReporter } from './reporter';
import * as util from './util';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as os from 'os';
import ts = require('typescript');
import * as File from 'vinyl';
import * as task from './task';
import { Mangler } from './mangle/index';
import { RawSourceMap } from 'source-map';
const watch = require('./watch');


// --- gulp-tsb: compile and transpile --------------------------------

const reporter = createReporter();

function getTypeScriptCompilerOptions(src: string): ts.CompilerOptions {
	const rootDir = path.join(__dirname, `../../${src}`);
	const options: ts.CompilerOptions = {};
	options.verbose = false;
	options.sourceMap = true;
	if (process.env['VSCODE_NO_SOURCEMAP']) { // To be used by developers in a hurry
		options.sourceMap = false;
	}
	options.rootDir = rootDir;
	options.baseUrl = rootDir;
	options.sourceRoot = util.toFileUri(rootDir);
	options.newLine = /\r\n/.test(fs.readFileSync(__filename, 'utf8')) ? 0 : 1;
	return options;
}

function createCompile(src: string, build: boolean, emitError: boolean, transpileOnly: boolean | { swc: boolean }) {
	const tsb = require('./tsb') as typeof import('./tsb');
	const sourcemaps = require('gulp-sourcemaps') as typeof import('gulp-sourcemaps');


	const projectPath = path.join(__dirname, '../../', src, 'tsconfig.json');
	const overrideOptions = { ...getTypeScriptCompilerOptions(src), inlineSources: Boolean(build) };
	if (!build) {
		overrideOptions.inlineSourceMap = true;
	}

	const compilation = tsb.create(projectPath, overrideOptions, {
		verbose: false,
		transpileOnly: Boolean(transpileOnly),
		transpileWithSwc: typeof transpileOnly !== 'boolean' && transpileOnly.swc
	}, err => reporter(err));

	function pipeline(token?: util.ICancellationToken) {
		const bom = require('gulp-bom') as typeof import('gulp-bom');

		const tsFilter = util.filter(data => /\.ts$/.test(data.path));
		const isUtf8Test = (f: File) => /(\/|\\)test(\/|\\).*utf8/.test(f.path);
		const isRuntimeJs = (f: File) => f.path.endsWith('.js') && !f.path.includes('fixtures');
		const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));

		const input = es.through();
		const output = input
			.pipe(util.$if(isUtf8Test, bom())) // this is required to preserve BOM in test files that loose it otherwise
			.pipe(util.$if(!build && isRuntimeJs, util.appendOwnPathSourceURL()))
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(compilation(token))
			.pipe(noDeclarationsFilter)
			.pipe(util.$if(build, nls.nls()))
			.pipe(noDeclarationsFilter.restore)
			.pipe(util.$if(!transpileOnly, sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: overrideOptions.sourceRoot
			})))
			.pipe(tsFilter.restore)
			.pipe(reporter.end(!!emitError));

		return es.duplex(input, output);
	}
	pipeline.tsProjectSrc = () => {
		return compilation.src({ base: src });
	};
	pipeline.projectPath = projectPath;
	return pipeline;
}

export function transpileTask(src: string, out: string, swc: boolean): task.StreamTask {

	const task = () => {

		const transpile = createCompile(src, false, true, { swc });
		const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });

		return srcPipe
			.pipe(transpile())
			.pipe(gulp.dest(out));
	};

	task.taskName = `transpile-${path.basename(src)}`;
	return task;
}

export function compileTask(src: string, out: string, build: boolean, options: { disableMangle?: boolean } = {}): task.StreamTask {

	const task = () => {

		if (os.totalmem() < 4_000_000_000) {
			throw new Error('compilation requires 4GB of RAM');
		}

		const compile = createCompile(src, build, true, false);
		const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
		const generator = new MonacoGenerator(false);
		if (src === 'src') {
			generator.execute();
		}

		// mangle: TypeScript to TypeScript
		let mangleStream = es.through();
		if (build && !options.disableMangle) {
			let ts2tsMangler = new Mangler(compile.projectPath, (...data) => fancyLog(ansiColors.blue('[mangler]'), ...data), { mangleExports: true, manglePrivateFields: true });
			const newContentsByFileName = ts2tsMangler.computeNewFileContents(new Set(['saveState']));
			mangleStream = es.through(async function write(data: File & { sourceMap?: RawSourceMap }) {
				type TypeScriptExt = typeof ts & { normalizePath(path: string): string };
				const tsNormalPath = (<TypeScriptExt>ts).normalizePath(data.path);
				const newContents = (await newContentsByFileName).get(tsNormalPath);
				if (newContents !== undefined) {
					data.contents = Buffer.from(newContents.out);
					data.sourceMap = newContents.sourceMap && JSON.parse(newContents.sourceMap);
				}
				this.push(data);
			}, async function end() {
				// free resources
				(await newContentsByFileName).clear();

				this.push(null);
				(<any>ts2tsMangler) = undefined;
			});
		}

		return srcPipe
			.pipe(mangleStream)
			.pipe(generator.stream)
			.pipe(compile())
			.pipe(gulp.dest(out));
	};

	task.taskName = `compile-${path.basename(src)}`;
	return task;
}

export function watchTask(out: string, build: boolean): task.StreamTask {

	const task = () => {
		const compile = createCompile('src', build, false, false);

		const src = gulp.src('src/**', { base: 'src' });
		const watchSrc = watch('src/**', { base: 'src', readDelay: 200 });

		const generator = new MonacoGenerator(true);
		generator.execute();

		return watchSrc
			.pipe(generator.stream)
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out));
	};
	task.taskName = `watch-${path.basename(out)}`;
	return task;
}

const REPO_SRC_FOLDER = path.join(__dirname, '../../src');

class MonacoGenerator {
	private readonly _isWatch: boolean;
	public readonly stream: NodeJS.ReadWriteStream;

	private readonly _watchedFiles: { [filePath: string]: boolean };
	private readonly _fsProvider: monacodts.FSProvider;
	private readonly _declarationResolver: monacodts.DeclarationResolver;

	constructor(isWatch: boolean) {
		this._isWatch = isWatch;
		this.stream = es.through();
		this._watchedFiles = {};
		const onWillReadFile = (moduleId: string, filePath: string) => {
			if (!this._isWatch) {
				return;
			}
			if (this._watchedFiles[filePath]) {
				return;
			}
			this._watchedFiles[filePath] = true;

			fs.watchFile(filePath, () => {
				this._declarationResolver.invalidateCache(moduleId);
				this._executeSoon();
			});
		};
		this._fsProvider = new class extends monacodts.FSProvider {
			public readFileSync(moduleId: string, filePath: string): Buffer {
				onWillReadFile(moduleId, filePath);
				return super.readFileSync(moduleId, filePath);
			}
		};
		this._declarationResolver = new monacodts.DeclarationResolver(this._fsProvider);

		if (this._isWatch) {
			fs.watchFile(monacodts.RECIPE_PATH, () => {
				this._executeSoon();
			});
		}
	}

	private _executeSoonTimer: NodeJS.Timer | null = null;
	private _executeSoon(): void {
		if (this._executeSoonTimer !== null) {
			clearTimeout(this._executeSoonTimer);
			this._executeSoonTimer = null;
		}
		this._executeSoonTimer = setTimeout(() => {
			this._executeSoonTimer = null;
			this.execute();
		}, 20);
	}

	private _run(): monacodts.IMonacoDeclarationResult | null {
		const r = monacodts.run3(this._declarationResolver);
		if (!r && !this._isWatch) {
			// The build must always be able to generate the monaco.d.ts
			throw new Error(`monaco.d.ts generation error - Cannot continue`);
		}
		return r;
	}

	private _log(message: any, ...rest: any[]): void {
		fancyLog(ansiColors.cyan('[monaco.d.ts]'), message, ...rest);
	}

	public execute(): void {
		const startTime = Date.now();
		const result = this._run();
		if (!result) {
			// nothing really changed
			return;
		}
		if (result.isTheSame) {
			return;
		}

		fs.writeFileSync(result.filePath, result.content);
		fs.writeFileSync(path.join(REPO_SRC_FOLDER, 'vs/editor/common/standalone/standaloneEnums.ts'), result.enums);
		this._log(`monaco.d.ts is changed - total time took ${Date.now() - startTime} ms`);
		if (!this._isWatch) {
			this.stream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
		}
	}
}

function generateApiProposalNames() {
	let eol: string;

	try {
		const src = fs.readFileSync('src/vs/workbench/services/extensions/common/extensionsApiProposals.ts', 'utf-8');
		const match = /\r?\n/m.exec(src);
		eol = match ? match[0] : os.EOL;
	} catch {
		eol = os.EOL;
	}

	const pattern = /vscode\.proposed\.([a-zA-Z]+)\.d\.ts$/;
	const proposalNames = new Set<string>();

	const input = es.through();
	const output = input
		.pipe(util.filter((f: File) => pattern.test(f.path)))
		.pipe(es.through((f: File) => {
			const name = path.basename(f.path);
			const match = pattern.exec(name);

			if (match) {
				proposalNames.add(match[1]);
			}
		}, function () {
			const names = [...proposalNames.values()].sort();
			const contents = [
				'/*---------------------------------------------------------------------------------------------',
				' *  Copyright (c) Microsoft Corporation. All rights reserved.',
				' *  Licensed under the MIT License. See License.txt in the project root for license information.',
				' *--------------------------------------------------------------------------------------------*/',
				'',
				'// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
				'',
				'export const allApiProposals = Object.freeze({',
				`${names.map(name => `\t${name}: 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${name}.d.ts'`).join(`,${eol}`)}`,
				'});',
				'export type ApiProposalName = keyof typeof allApiProposals;',
				'',
			].join(eol);

			this.emit('data', new File({
				path: 'vs/workbench/services/extensions/common/extensionsApiProposals.ts',
				contents: Buffer.from(contents)
			}));
			this.emit('end');
		}));

	return es.duplex(input, output);
}

const apiProposalNamesReporter = createReporter('api-proposal-names');

export const compileApiProposalNamesTask = task.define('compile-api-proposal-names', () => {
	return gulp.src('src/vscode-dts/**')
		.pipe(generateApiProposalNames())
		.pipe(gulp.dest('src'))
		.pipe(apiProposalNamesReporter.end(true));
});

export const watchApiProposalNamesTask = task.define('watch-api-proposal-names', () => {
	const task = () => gulp.src('src/vscode-dts/**')
		.pipe(generateApiProposalNames())
		.pipe(apiProposalNamesReporter.end(true));

	return watch('src/vscode-dts/**', { readDelay: 200 })
		.pipe(util.debounce(task))
		.pipe(gulp.dest('src'));
});
