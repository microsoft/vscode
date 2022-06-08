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
	verbose: boolean = false,
	onError: (message: string) => void = _defaultOnError
): IncrementalCompiler {

	function printDiagnostic(diag: ts.Diagnostic): void {

		if (!diag.file || !diag.start) {
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

	const _builder = builder.createTypeScriptBuilder({ verbose }, projectPath, cmdLine);

	function createStream(token?: builder.CancellationToken): Readable & Writable {

		return through(function (this: through.ThroughStream, file: Vinyl) {
			// give the file to the compiler
			if (file.isStream()) {
				this.emit('error', 'no support for streams');
				return;
			}
			_builder.file(file);

		}, function (this: { queue(a: any): void }) {
			// start the compilation process
			_builder.build(
				file => this.queue(file),
				printDiagnostic,
				token
			).catch(e => console.error(e)).then(() => this.queue(null));
		});
	}

	const result = (token: builder.CancellationToken) => createStream(token);
	result.src = (opts?: { cwd?: string; base?: string }) => {
		let _pos = 0;
		let _fileNames = cmdLine.fileNames.slice(0);
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
