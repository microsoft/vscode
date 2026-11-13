/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'module';
import path from 'path';
import type * as ts from 'typescript';

//
// Runs the security rules of tsec over src/tsconfig.tsec.json. The tsec command line also type
// checks the whole program first, which takes most of its time and repeats the type check of
// the compilation, so this script runs only the rules.
//

/** The tsec modules, and the TypeScript that tsec resolves. */
const tsecRequire = createRequire(path.join(import.meta.dirname, '..', '..', 'node_modules', 'tsec', 'package.json'));
const typescript: typeof ts = tsecRequire('typescript');
const { performCheck }: { performCheck(program: ts.Program, host: ts.CompilerHost): ts.Diagnostic[] } = tsecRequire('./lib/packages/tsec/build.js');
const { createCompilerHost }: { createCompilerHost(config: ts.ParsedCommandLine): ts.CompilerHost } = tsecRequire('./lib/packages/tsec/compiler_host.js');
const { createDiagnosticsReporter }: { createDiagnosticsReporter(options: ts.CompilerOptions): (diagnostics: readonly ts.Diagnostic[], withSummary: boolean) => number } = tsecRequire('./lib/packages/tsec/report.js');

const configPath = path.join(import.meta.dirname, '..', '..', 'src', 'tsconfig.tsec.json');
const config = typescript.getParsedCommandLineOfConfigFile(configPath, {}, {
	...typescript.sys,
	onUnRecoverableConfigFileDiagnostic: diagnostic => {
		throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
	},
});
if (!config) {
	throw new Error(`Could not read ${configPath}.`);
}

const host = createCompilerHost(config);
const program = typescript.createProgram(config.fileNames, config.options, host);
const diagnostics = [...config.errors, ...performCheck(program, host)];
const errorCount = createDiagnosticsReporter(config.options)(typescript.sortAndDeduplicateDiagnostics(diagnostics), /*withSummary*/ true);
process.exitCode = errorCount === 0 ? 0 : 1;
