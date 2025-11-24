/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import fs from 'fs';
import gulp from 'gulp';
import path from 'path';
import * as monacodts from './monaco-api.ts';
import * as nls from './nls.ts';
import { createReporter } from './reporter.ts';
import * as util from './util.ts';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import os from 'os';
import File from 'vinyl';
import * as task from './task.ts';
import { Mangler } from './mangle/index.ts';
import type { RawSourceMap } from 'source-map';
import ts from 'typescript';
import watch from './watch/index.ts';
import bom from 'gulp-bom';
import * as tsb from './tsb/index.ts';
import sourcemaps from 'gulp-sourcemaps';


// --- gulp-tsb: compile and transpile --------------------------------

const reporter = createReporter();

function getTypeScriptCompilerOptions(src: string): ts.CompilerOptions {
	const rootDir = path.join(import.meta.dirname, `../../${src}`);
	const options: ts.CompilerOptions = {};
	options.verbose = false;
	options.sourceMap = true;
	if (process.env['VSCODE_NO_SOURCEMAP']) { // To be used by developers in a hurry
		options.sourceMap = false;
	}
	options.rootDir = rootDir;
	options.baseUrl = rootDir;
	options.sourceRoot = util.toFileUri(rootDir);
	options.newLine = /\r\n/.test(fs.readFileSync(import.meta.filename, 'utf8')) ? 0 : 1;
	return options;
}

interface ICompileTaskOptions {
	readonly build: boolean;
	readonly emitError: boolean;
	readonly transpileOnly: boolean | { esbuild: boolean };
	readonly preserveEnglish: boolean;
}

export function createCompile(src: string, { build, emitError, transpileOnly, preserveEnglish }: ICompileTaskOptions) {
	const projectPath = path.join(import.meta.dirname, '../../', src, 'tsconfig.json');
	const overrideOptions = { ...getTypeScriptCompilerOptions(src), inlineSources: Boolean(build) };
	if (!build) {
		overrideOptions.inlineSourceMap = true;
	}

	const compilation = tsb.create(projectPath, overrideOptions, {
		verbose: false,
		transpileOnly: Boolean(transpileOnly),
		transpileWithEsbuild: typeof transpileOnly !== 'boolean' && transpileOnly.esbuild
	}, err => reporter(err));

	function pipeline(token?: util.ICancellationToken) {

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
			.pipe(util.$if(build, nls.nls({ preserveEnglish })))
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

export function transpileTask(src: string, out: string, esbuild?: boolean): task.StreamTask {

	const task = () => {

		const transpile = createCompile(src, { build: false, emitError: true, transpileOnly: { esbuild: !!esbuild }, preserveEnglish: false });
		const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });

		return srcPipe
			.pipe(transpile())
			.pipe(gulp.dest(out));
	};

	task.taskName = `transpile-${path.basename(src)}`;
	return task;
}

export function compileTask(src: string, out: string, build: boolean, options: { disableMangle?: boolean; preserveEnglish?: boolean } = {}): task.StreamTask {

	const task = () => {

		if (os.totalmem() < 4_000_000_000) {
			throw new Error('compilation requires 4GB of RAM');
		}

		const compile = createCompile(src, { build, emitError: true, transpileOnly: false, preserveEnglish: !!options.preserveEnglish });
		const srcPipe = gulp.src(`${src}/**`, { base: `${src}` });
		const generator = new MonacoGenerator(false);
		if (src === 'src') {
			generator.execute();
		}

		// mangle: TypeScript to TypeScript
		let mangleStream = es.through();
		if (build && !options.disableMangle) {
			let ts2tsMangler: Mangler | undefined = new Mangler(compile.projectPath, (...data) => fancyLog(ansiColors.blue('[mangler]'), ...data), { mangleExports: true, manglePrivateFields: true });
			const newContentsByFileName = ts2tsMangler.computeNewFileContents(new Set(['saveState']));
			mangleStream = es.through(async function write(data: File & { sourceMap?: RawSourceMap }) {
				type TypeScriptExt = typeof ts & { normalizePath(path: string): string };
				const tsNormalPath = (ts as TypeScriptExt).normalizePath(data.path);
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
				ts2tsMangler = undefined;
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

export function watchTask(out: string, build: boolean, srcPath: string = 'src'): task.StreamTask {

	const task = () => {
		const compile = createCompile(srcPath, { build, emitError: false, transpileOnly: false, preserveEnglish: false });

		const src = gulp.src(`${srcPath}/**`, { base: srcPath });
		const watchSrc = watch(`${srcPath}/**`, { base: srcPath, readDelay: 200 });

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

const REPO_SRC_FOLDER = path.join(import.meta.dirname, '../../src');

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

	private _executeSoonTimer: NodeJS.Timeout | null = null;
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

	private _log(message: any, ...rest: unknown[]): void {
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
		const src = fs.readFileSync('src/vs/platform/extensions/common/extensionsApiProposals.ts', 'utf-8');
		const match = /\r?\n/m.exec(src);
		eol = match ? match[0] : os.EOL;
	} catch {
		eol = os.EOL;
	}

	const pattern = /vscode\.proposed\.([a-zA-Z\d]+)\.d\.ts$/;
	const versionPattern = /^\s*\/\/\s*version\s*:\s*(\d+)\s*$/mi;
	const proposals = new Map<string, { proposal: string; version?: number }>();

	const input = es.through();
	const output = input
		.pipe(util.filter((f: File) => pattern.test(f.path)))
		.pipe(es.through((f: File) => {
			const name = path.basename(f.path);
			const match = pattern.exec(name);

			if (!match) {
				return;
			}

			const proposalName = match[1];

			const contents = f.contents!.toString('utf8');
			const versionMatch = versionPattern.exec(contents);
			const version = versionMatch ? versionMatch[1] : undefined;

			proposals.set(proposalName, {
				proposal: `https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${proposalName}.d.ts`,
				version: version ? parseInt(version) : undefined
			});
		}, function () {
			const names = [...proposals.keys()].sort();
			const contents = [
				'/*---------------------------------------------------------------------------------------------',
				' *  Copyright (c) Microsoft Corporation. All rights reserved.',
				' *  Licensed under the MIT License. See License.txt in the project root for license information.',
				' *--------------------------------------------------------------------------------------------*/',
				'',
				'// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.',
				'',
				'const _allApiProposals = {',
				`${names.map(proposalName => {
					const proposal = proposals.get(proposalName)!;
					return `\t${proposalName}: {${eol}\t\tproposal: '${proposal.proposal}',${eol}${proposal.version ? `\t\tversion: ${proposal.version}${eol}` : ''}\t}`;
				}).join(`,${eol}`)}`,
				'};',
				'export const allApiProposals = Object.freeze<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>(_allApiProposals);',
				'export type ApiProposalName = keyof typeof _allApiProposals;',
				'',
			].join(eol);

			this.emit('data', new File({
				path: 'vs/platform/extensions/common/extensionsApiProposals.ts',
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
