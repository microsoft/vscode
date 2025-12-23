/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import minimatch from 'minimatch';

//
// #############################################################################################
//
// A custom typescript checker for the specific task of detecting the use of certain types in a
// layer that does not allow such use.
//
// Make changes to below RULES to lift certain files from these checks only if absolutely needed
//
// NOTE: Most layer checks are done via tsconfig.<layer>.json files.
//
// #############################################################################################
//

// Types that are defined in a common layer but are known to be only
// available in native environments should not be allowed in browser
const NATIVE_TYPES = [
	'NativeParsedArgs',
	'INativeEnvironmentService',
	'AbstractNativeEnvironmentService',
	'INativeWindowConfiguration',
	'ICommonNativeHostService',
	'INativeHostService',
	'IMainProcessService',
	'INativeBrowserElementsService',
];

const RULES: IRule[] = [

	// Tests: skip
	{
		target: '**/vs/**/test/**',
		skip: true // -> skip all test files
	},

	// Common: vs/platform services that can access native types
	{
		target: `**/vs/platform/{${[
			'environment/common/*.ts',
			'window/common/window.ts',
			'native/common/native.ts',
			'native/common/nativeHostService.ts',
			'browserElements/common/browserElements.ts',
			'browserElements/common/nativeBrowserElementsService.ts'
		].join(',')}}`,
		disallowedTypes: [/* Ignore native types that are defined from here */],
	},

	// Common: vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts
	{
		target: '**/vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts',
		disallowedTypes: NATIVE_TYPES,
	},

	// Common
	{
		target: '**/vs/**/common/**',
		disallowedTypes: NATIVE_TYPES,
	},

	// Common
	{
		target: '**/vs/**/worker/**',
		disallowedTypes: NATIVE_TYPES,
	},

	// Browser
	{
		target: '**/vs/**/browser/**',
		disallowedTypes: NATIVE_TYPES,
	},

	// Electron (main, utility)
	{
		target: '**/vs/**/{electron-main,electron-utility}/**',
		disallowedTypes: [
			'ipcMain' // not allowed, use validatedIpcMain instead
		]
	}
];

const TS_CONFIG_PATH = join(import.meta.dirname, '../../', 'src', 'tsconfig.json');

interface IRule {
	target: string;
	skip?: boolean;
	disallowedTypes?: string[];
}

let hasErrors = false;

function checkFile(program: ts.Program, sourceFile: ts.SourceFile, rule: IRule) {
	checkNode(sourceFile);

	function checkNode(node: ts.Node): void {
		if (node.kind !== ts.SyntaxKind.Identifier) {
			return ts.forEachChild(node, checkNode); // recurse down
		}

		const checker = program.getTypeChecker();
		const symbol = checker.getSymbolAtLocation(node);

		if (!symbol) {
			return;
		}

		let text = symbol.getName();
		let _parentSymbol: any = symbol;

		while (_parentSymbol.parent) {
			_parentSymbol = _parentSymbol.parent;
		}

		const parentSymbol = _parentSymbol as ts.Symbol;
		text = parentSymbol.getName();

		if (rule.disallowedTypes?.some(disallowed => disallowed === text)) {
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
			console.log(`[build/checker/layersChecker.ts]: Reference to type '${text}' violates layer '${rule.target}' (${sourceFile.fileName} (${line + 1},${character + 1}). Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);

			hasErrors = true;
			return;
		}
	}
}

function createProgram(tsconfigPath: string): ts.Program {
	const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

	const configHostParser: ts.ParseConfigHost = { fileExists: existsSync, readDirectory: ts.sys.readDirectory, readFile: file => readFileSync(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
	const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, resolve(dirname(tsconfigPath)), { noEmit: true });

	const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);

	return ts.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
}

//
// Create program and start checking
//
const program = createProgram(TS_CONFIG_PATH);

for (const sourceFile of program.getSourceFiles()) {
	for (const rule of RULES) {
		if (minimatch.match([sourceFile.fileName], rule.target).length > 0) {
			if (!rule.skip) {
				checkFile(program, sourceFile, rule);
			}

			break;
		}
	}
}

if (hasErrors) {
	process.exit(1);
}
