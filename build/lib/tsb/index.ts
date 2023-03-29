/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Vinyl from 'vinyl';
import * as through from 'through';
import * as builder from './builder';
import * as ts from 'typescript';
import { Readable, Writable, Duplex } from 'stream';
import { dirname } from 'path';
import { strings } from './utils';
import { readFileSync, statSync } from 'fs';
import * as log from 'fancy-log';
import colors = require('ansi-colors');
import { ITranspiler, SwcTranspiler, TscTranspiler } from './transpiler';

export interface IncrementalCompiler {
	(token?: any): Readable & Writable;
	src(opts?: { cwd?: string; base?: string }): Readable;
}

class EmptyDuplex extends Duplex {
	_write(_chunk: any, _encoding: string, callback: (err?: Error) => void): void { callback(); }
	_read() { this.push(null); }
}

function createNullCompiler(): IncrementalCompiler {
	const result: IncrementalCompiler = function () { return new EmptyDuplex(); };
	result.src = () => new EmptyDuplex();
	return result;
}

const _defaultOnError = (err: string) => console.log(JSON.stringify(err, null, 4));

export function create(
	projectPath: string,
	existingOptions: Partial<ts.CompilerOptions>,
	config: { verbose?: boolean; transpileOnly?: boolean; transpileOnlyIncludesDts?: boolean; transpileWithSwc?: boolean },
	onError: (message: string) => void = _defaultOnError
): IncrementalCompiler {

	function printDiagnostic(diag: ts.Diagnostic | Error): void {

		if (diag instanceof Error) {
			onError(diag.message);
		} else if (!diag.file || !diag.start) {
			onError(ts.flattenDiagnosticMessageText(diag.messageText, '\n'));
		} else {
			const lineAndCh = diag.file.getLineAndCharacterOfPosition(diag.start);
			onError(strings.format('{0}({1},{2}): {3}',
				diag.file.fileName,
				lineAndCh.line + 1,
				lineAndCh.character + 1,
				ts.flattenDiagnosticMessageText(diag.messageText, '\n'))
			);
		}
	}

	const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
	if (parsed.error) {
		printDiagnostic(parsed.error);
		return createNullCompiler();
	}

	const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(projectPath), existingOptions);
	if (cmdLine.errors.length > 0) {
		cmdLine.errors.forEach(printDiagnostic);
		return createNullCompiler();
	}

	function logFn(topic: string, message: string): void {
		if (config.verbose) {
			log(colors.cyan(topic), message);
		}
	}

	// FULL COMPILE stream doing transpile, syntax and semantic diagnostics
	function createCompileStream(builder: builder.ITypeScriptBuilder, token?: builder.CancellationToken): Readable & Writable {

		return through(function (this: through.ThroughStream, file: Vinyl) {
			// give the file to the compiler
			if (file.isStream()) {
				this.emit('error', 'no support for streams');
				return;
			}
			builder.file(file);

		}, function (this: { queue(a: any): void }) {
			// start the compilation process
			builder.build(
				file => this.queue(file),
				printDiagnostic,
				token
			).catch(e => console.error(e)).then(() => this.queue(null));
		});
	}

	// TRANSPILE ONLY stream doing just TS to JS conversion
	function createTranspileStream(transpiler: ITranspiler): Readable & Writable {
		return through(function (this: through.ThroughStream & { queue(a: any): void }, file: Vinyl) {
			// give the file to the compiler
			if (file.isStream()) {
				this.emit('error', 'no support for streams');
				return;
			}
			if (!file.contents) {
				return;
			}
			if (!config.transpileOnlyIncludesDts && file.path.endsWith('.d.ts')) {
				return;
			}

			if (!transpiler.onOutfile) {
				transpiler.onOutfile = file => this.queue(file);
			}

			transpiler.transpile(file);

		}, function (this: { queue(a: any): void }) {
			transpiler.join().then(() => {
				this.queue(null);
				transpiler.onOutfile = undefined;
			});
		});
	}


	let result: IncrementalCompiler;
	if (config.transpileOnly) {
		const transpiler = !config.transpileWithSwc
			? new TscTranspiler(logFn, printDiagnostic, projectPath, cmdLine)
			: new SwcTranspiler(logFn, printDiagnostic, projectPath, cmdLine);
		result = <any>(() => createTranspileStream(transpiler));
	} else {
		const _builder = builder.createTypeScriptBuilder({ logFn }, projectPath, cmdLine);
		result = <any>((token: builder.CancellationToken) => createCompileStream(_builder, token));
	}

	result.src = (opts?: { cwd?: string; base?: string }) => {
		let _pos = 0;
		const _fileNames = cmdLine.fileNames.slice(0);
		return new class extends Readable {
			constructor() {
				super({ objectMode: true });
			}
			_read() {
				let more: boolean = true;
				let path: string;
				for (; more && _pos < _fileNames.length; _pos++) {
					path = _fileNames[_pos];
					more = this.push(new Vinyl({
						path,
						contents: readFileSync(path),
						stat: statSync(path),
						cwd: opts && opts.cwd,
						base: opts && opts.base || dirname(projectPath)
					}));
				}
				if (_pos >= _fileNames.length) {
					this.push(null);
				}
			}
		};
	};

	return <IncrementalCompiler>result;
}
