/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import { suite, test } from 'node:test';
import * as ts from 'typescript';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const agentHostEntryPoints = [
	'src/vs/platform/agentHost/node/agentHostMain.ts',
	'src/vs/platform/agentHost/node/agentHostServerMain.ts',
];
const excludedLiteralDynamicImports = new Set([
	// Test-only provider loaded by the standalone server's --enable-mock-agent option.
	literalDynamicImportKey(
		path.join(repositoryRoot, 'src/vs/platform/agentHost/node/agentHostServerMain.ts'),
		'../test/node/mockAgent.js'
	),
	// Built products use the downloaded SDK path; the bare package import is a dev fallback.
	literalDynamicImportKey(
		path.join(repositoryRoot, 'src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts'),
		'@anthropic-ai/claude-agent-sdk'
	),
]);

suite('Agent Host dependencies', () => {
	test('runtime packages are included in the remote server', () => {
		const remotePackageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'remote/package.json'), 'utf8')) as {
			dependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		const packagedDependencies = new Set([
			...Object.keys(remotePackageJson.dependencies ?? {}),
			...Object.keys(remotePackageJson.optionalDependencies ?? {}),
		]);
		const runtimeImports = collectRuntimePackageImports(
			agentHostEntryPoints.map(entryPoint => path.join(repositoryRoot, entryPoint))
		);
		const missingDependencies = [...runtimeImports]
			.filter(([packageName]) => !packagedDependencies.has(packageName))
			.map(([packageName, importers]) => `${packageName}: ${[...importers].sort().map(importer => path.relative(repositoryRoot, importer)).join(', ')}`)
			.sort();

		assert.deepStrictEqual(missingDependencies, []);
	});

	test('collects literal dynamic imports with narrow exclusions', () => {
		const regularSource = ts.createSourceFile(
			path.join(repositoryRoot, 'src/regular.ts'),
			`import('node-pty'); import(\`ws\`); import('node-addon-api', { with: { type: 'json' } }); import('../test/node/mockAgent.js'); import('@anthropic-ai/claude-agent-sdk'); import(variable);`,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);
		const mockAgentServerSource = ts.createSourceFile(
			path.join(repositoryRoot, 'src/vs/platform/agentHost/node/agentHostServerMain.ts'),
			`import('../test/node/mockAgent.js'); import('node-pty');`,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);
		const claudeSdkServiceSource = ts.createSourceFile(
			path.join(repositoryRoot, 'src/vs/platform/agentHost/node/claude/claudeAgentSdkService.ts'),
			`import('@anthropic-ai/claude-agent-sdk'); import('node-pty');`,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);

		assert.deepStrictEqual({
			regular: getRuntimeModuleSpecifiers(regularSource),
			mockAgentServer: getRuntimeModuleSpecifiers(mockAgentServerSource),
			claudeSdkService: getRuntimeModuleSpecifiers(claudeSdkServiceSource),
		}, {
			regular: ['node-pty', 'ws', 'node-addon-api', '../test/node/mockAgent.js', '@anthropic-ai/claude-agent-sdk'],
			mockAgentServer: ['node-pty'],
			claudeSdkService: ['node-pty'],
		});
	});
});

function collectRuntimePackageImports(entryPoints: readonly string[]): Map<string, Set<string>> {
	const pendingFiles = [...entryPoints];
	const visitedFiles = new Set<string>();
	const packageImports = new Map<string, Set<string>>();
	const builtInModules = new Set([...builtinModules, ...builtinModules.map(moduleName => `node:${moduleName}`)]);

	while (pendingFiles.length > 0) {
		const file = pendingFiles.pop()!;
		if (visitedFiles.has(file)) {
			continue;
		}
		visitedFiles.add(file);

		const sourceFile = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		for (const moduleSpecifier of getRuntimeModuleSpecifiers(sourceFile)) {
			if (moduleSpecifier.startsWith('.')) {
				const importedFile = resolveSourceImport(file, moduleSpecifier);
				if (importedFile) {
					pendingFiles.push(importedFile);
				}
				continue;
			}

			if (builtInModules.has(moduleSpecifier)) {
				continue;
			}

			const packageName = getPackageName(moduleSpecifier);
			let importers = packageImports.get(packageName);
			if (!importers) {
				importers = new Set<string>();
				packageImports.set(packageName, importers);
			}
			importers.add(file);
		}
	}

	return packageImports;
}

function getRuntimeModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
	const moduleSpecifiers: string[] = [];
	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && isRuntimeImport(statement)) {
			moduleSpecifiers.push(statement.moduleSpecifier.text);
		} else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
			moduleSpecifiers.push(statement.moduleSpecifier.text);
		}
	}

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			if (
				node.expression.kind === ts.SyntaxKind.ImportKeyword
				&& node.arguments.length > 0
				&& ts.isStringLiteralLike(node.arguments[0])
			) {
				const moduleSpecifier = node.arguments[0].text;
				if (!excludedLiteralDynamicImports.has(literalDynamicImportKey(sourceFile.fileName, moduleSpecifier))) {
					moduleSpecifiers.push(moduleSpecifier);
				}
			} else if (
				ts.isIdentifier(node.expression)
				&& (node.expression.text === 'require' || node.expression.text === 'nativeRequire')
				&& node.arguments.length === 1
				&& ts.isStringLiteralLike(node.arguments[0])
			) {
				moduleSpecifiers.push(node.arguments[0].text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	return moduleSpecifiers;
}

function isRuntimeImport(statement: ts.ImportDeclaration): boolean {
	const clause = statement.importClause;
	if (!clause) {
		return true;
	}
	if (clause.isTypeOnly) {
		return false;
	}
	if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) {
		return true;
	}
	return clause.namedBindings.elements.some(element => !element.isTypeOnly);
}

function resolveSourceImport(importer: string, moduleSpecifier: string): string | undefined {
	const unresolvedPath = path.resolve(path.dirname(importer), moduleSpecifier);
	const candidates = [
		unresolvedPath,
		unresolvedPath.replace(/\.js$/, '.ts'),
		unresolvedPath.replace(/\.js$/, '.tsx'),
		path.join(unresolvedPath, 'index.ts'),
	];
	return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function getPackageName(moduleSpecifier: string): string {
	const segments = moduleSpecifier.split('/');
	return moduleSpecifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function literalDynamicImportKey(importer: string, moduleSpecifier: string): string {
	return `${path.relative(repositoryRoot, importer)}\0${moduleSpecifier}`;
}
