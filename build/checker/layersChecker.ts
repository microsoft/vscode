/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
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
];

export const RULES: IRule[] = [

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
			'ipc/common/mainProcessService.ts'
		].join(',')}}`,
		disallowedTypes: [/* Ignore native types that are defined from here */],
	},

	// Common: vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts
	{
		target: '**/vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts',
		disallowedTypes: NATIVE_TYPES,
	},

	// Browser view preload script
	{
		target: '**/vs/platform/browserView/electron-browser/preload-browserView.ts',
		disallowedTypes: NATIVE_TYPES,
	},

	// Validated IPC wrapper
	{
		target: '**/vs/base/parts/ipc/electron-main/ipcMain.ts',
		disallowedTypes: [],
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

export interface IRule {
	target: string;
	skip?: boolean;
	disallowedTypes?: string[];
}

export interface ILayerViolation {
	type: string;
	target: string;
	fileName: string;
	line: number;
	character: number;
}

function checkFile(checker: ts.TypeChecker, sourceFile: ts.SourceFile, rule: IRule, violations: ILayerViolation[]): void {
	if (!rule.disallowedTypes?.length) {
		return;
	}

	const disallowedTypes = new Set(rule.disallowedTypes);
	const candidateNames = new Set(disallowedTypes);

	collectAliases(sourceFile);
	checkNode(sourceFile);

	function collectAliases(node: ts.Node): void {
		if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && disallowedTypes.has((node.propertyName ?? node.name).text)) {
			candidateNames.add(node.name.text);
		}

		ts.forEachChild(node, collectAliases);
	}

	function checkNode(node: ts.Node): void {
		if (!ts.isIdentifier(node)) {
			return ts.forEachChild(node, checkNode); // recurse down
		}

		if (!candidateNames.has(node.text) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
			return;
		}

		const symbol = checker.getSymbolAtLocation(node);

		if (!symbol) {
			return;
		}

		const type = findDisallowedType(checker, symbol, disallowedTypes);
		if (type) {
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
			violations.push({
				type,
				target: rule.target,
				fileName: sourceFile.fileName,
				line: line + 1,
				character: character + 1,
			});
		}
	}
}

function findDisallowedType(checker: ts.TypeChecker, symbol: ts.Symbol, disallowedTypes: Set<string>): string | undefined {
	const seen = new Set<ts.Symbol>();
	let current: ts.Symbol | undefined = symbol;

	while (current && !seen.has(current)) {
		seen.add(current);

		const name = current.getName();
		if (disallowedTypes.has(name)) {
			return name;
		}

		if (current.flags & ts.SymbolFlags.Alias) {
			current = checker.getAliasedSymbol(current);
		} else {
			current = getContainingSymbol(checker, current);
		}
	}

	return undefined;
}

function getContainingSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol | undefined {
	for (const declaration of symbol.declarations ?? []) {
		const container = declaration.parent;
		if (ts.isClassDeclaration(container) || ts.isClassExpression(container) || ts.isInterfaceDeclaration(container) || ts.isEnumDeclaration(container) || ts.isModuleDeclaration(container)) {
			if (container.name) {
				return checker.getSymbolAtLocation(container.name);
			}
		}
	}

	return undefined;
}

export function getRule(fileName: string, rootPath: string, rules: readonly IRule[]): IRule | undefined {
	const relativeFileName = relative(rootPath, fileName).replaceAll('\\', '/');
	return rules.find(rule => minimatch(relativeFileName, rule.target));
}

export function createProgram(tsconfigPath: string, rules: readonly IRule[]): ts.Program {
	const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

	const configHostParser: ts.ParseConfigHost = { fileExists: existsSync, readDirectory: ts.sys.readDirectory, readFile: file => readFileSync(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
	const rootPath = resolve(dirname(tsconfigPath));
	const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, rootPath, { noEmit: true });
	const rootFileNames = tsConfigParsed.fileNames.filter(fileName => !getRule(fileName, rootPath, rules)?.skip);

	const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);

	return ts.createProgram(rootFileNames, tsConfigParsed.options, compilerHost);
}

export function checkProgram(program: ts.Program, rootPath: string, rules: readonly IRule[]): ILayerViolation[] {
	const checker = program.getTypeChecker();
	const violations: ILayerViolation[] = [];

	for (const sourceFile of program.getSourceFiles()) {
		const rule = getRule(sourceFile.fileName, rootPath, rules);
		if (rule && !rule.skip) {
			checkFile(checker, sourceFile, rule, violations);
		}
	}

	return violations;
}

export function runLayerChecker(tsconfigPath: string, rules: readonly IRule[]): number {
	const rootPath = resolve(dirname(tsconfigPath));
	const program = createProgram(tsconfigPath, rules);
	const violations = checkProgram(program, rootPath, rules);

	for (const violation of violations) {
		console.log(`[build/checker/layersChecker.ts]: Reference to type '${violation.type}' violates layer '${violation.target}' (${violation.fileName}:${violation.line}:${violation.character}). Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);
	}

	return violations.length;
}

if (import.meta.main) {
	process.exitCode = runLayerChecker(TS_CONFIG_PATH, RULES) ? 1 : 0;
}
