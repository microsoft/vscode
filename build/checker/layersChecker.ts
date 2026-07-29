/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API, SymbolFlags, type Checker, type Project, type Symbol as TypeScriptSymbol } from '@typescript/native/unstable/sync';
import type { Identifier, Node, SourceFile } from '@typescript/native/unstable/ast';
import { isExportSpecifier, isIdentifier, isImportSpecifier, isPropertyAccessExpression } from '@typescript/native/unstable/ast/is';
import { join, relative } from 'path';
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

const TS_CONFIG_PATH = join(import.meta.dirname, 'tsconfig.semantic.json');
const SOURCE_ROOT = join(import.meta.dirname, '../../src');
const GO_MEMORY_LIMIT = '3GiB';

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

function checkFile(checker: Checker, sourceFile: SourceFile, rule: IRule): ILayerViolation[] {
	if (!rule.disallowedTypes?.length) {
		return [];
	}

	const disallowedTypes = new Set(rule.disallowedTypes);
	const candidateNames = new Set(disallowedTypes);
	const candidates: Identifier[] = [];

	collectAliases(sourceFile);
	collectCandidates(sourceFile);

	const symbols = checker.getSymbolAtLocation(candidates);
	const violations: ILayerViolation[] = [];

	for (let index = 0; index < symbols.length; index++) {
		const symbol = symbols[index];
		if (!symbol) {
			continue;
		}

		const type = findDisallowedType(checker, symbol, disallowedTypes);
		if (type) {
			const node = candidates[index];
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

	return violations;

	function collectAliases(node: Node): void {
		if ((isImportSpecifier(node) || isExportSpecifier(node)) && isIdentifier(node.name)) {
			const importedName = node.propertyName ?? node.name;
			if (isIdentifier(importedName) && disallowedTypes.has(importedName.text)) {
				candidateNames.add(node.name.text);
			}
		}

		node.forEachChild(collectAliases);
	}

	function collectCandidates(node: Node): void {
		if (!isIdentifier(node)) {
			return node.forEachChild(collectCandidates);
		}

		if (candidateNames.has(node.text) || (isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
			candidates.push(node);
		}
	}
}

function findDisallowedType(checker: Checker, symbol: TypeScriptSymbol, disallowedTypes: Set<string>): string | undefined {
	const seen = new Set<TypeScriptSymbol>();
	let current: TypeScriptSymbol | undefined = symbol;

	while (current && !seen.has(current)) {
		seen.add(current);

		if (disallowedTypes.has(current.name)) {
			return current.name;
		}

		current = current.flags & SymbolFlags.Alias
			? checker.getAliasedSymbol(current)
			: current.getParent();
	}

	return undefined;
}

export function getRule(fileName: string, rootPath: string, rules: readonly IRule[]): IRule | undefined {
	const relativeFileName = relative(rootPath, fileName).replaceAll('\\', '/');
	return rules.find(rule => minimatch(relativeFileName, rule.target));
}

export function checkProject(project: Project, rootPath: string, rules: readonly IRule[], clearSourceFileCache: () => void): ILayerViolation[] {
	const violations: ILayerViolation[] = [];

	for (const fileName of project.program.getSourceFileNames()) {
		const rule = getRule(fileName, rootPath, rules);
		if (!rule || rule.skip || !rule.disallowedTypes?.length) {
			continue;
		}

		const sourceFile = project.program.getSourceFile(fileName);
		if (!sourceFile) {
			throw new Error(`Native TypeScript did not return source file '${fileName}'.`);
		}

		try {
			violations.push(...checkFile(project.checker, sourceFile, rule));
		} finally {
			clearSourceFileCache();
		}
	}

	return violations;
}

export function checkLayerViolations(tsconfigPath: string, rootPath: string, rules: readonly IRule[]): ILayerViolation[] {
	const previousGoMemoryLimit = process.env.GOMEMLIMIT;
	process.env.GOMEMLIMIT ??= GO_MEMORY_LIMIT;

	const api = new API({ cwd: rootPath });
	try {
		const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
		try {
			const project = snapshot.getProject(tsconfigPath);
			if (!project) {
				throw new Error(`Native TypeScript did not open project '${tsconfigPath}'.`);
			}

			return checkProject(project, rootPath, rules, () => api.clearSourceFileCache());
		} finally {
			snapshot.dispose();
		}
	} finally {
		api.close();
		if (previousGoMemoryLimit === undefined) {
			delete process.env.GOMEMLIMIT;
		} else {
			process.env.GOMEMLIMIT = previousGoMemoryLimit;
		}
	}
}

export function runLayerChecker(tsconfigPath: string, rootPath: string, rules: readonly IRule[]): number {
	const violations = checkLayerViolations(tsconfigPath, rootPath, rules);

	for (const violation of violations) {
		console.log(`[build/checker/layersChecker.ts]: Reference to type '${violation.type}' violates layer '${violation.target}' (${violation.fileName}:${violation.line}:${violation.character}). Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);
	}

	return violations.length;
}

if (import.meta.main) {
	process.exitCode = runLayerChecker(TS_CONFIG_PATH, SOURCE_ROOT, RULES) ? 1 : 0;
}
