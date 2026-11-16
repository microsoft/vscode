/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { suite, test } from 'node:test';
import { FAILSAFE_SCHEMA, load } from 'js-yaml';
import * as ts from 'typescript';

// Some product build jobs install only the dependencies of build/ (`pnpm install` in build/), for
// example the macOS universal job and Publish. A script they run must not import a package that only
// the root of the repository declares: the root's node_modules isn't there, so the import fails in an
// official build and nowhere else (see #347295, `minimatch` in create-universal-app.ts).

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const pipelinesFolder = path.join(repositoryRoot, 'build/azure-pipelines');

function listPipelineFiles(folder: string): string[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
		const file = path.join(folder, entry.name);
		return entry.isDirectory() ? listPipelineFiles(file) : entry.name.endsWith('.yml') ? [file] : [];
	});
}

function scriptOf(step: Record<string, unknown>): string {
	return ['script', 'bash', 'pwsh', 'powershell'].map(key => typeof step[key] === 'string' ? step[key] : '').join('\n');
}

/** The steps of each `steps:` list, with the steps of template conditions (`${{ if … }}:`) inlined. */
function stepLists(node: unknown, lists: Record<string, unknown>[][] = []): Record<string, unknown>[][] {
	const flatten = (steps: unknown[]): Record<string, unknown>[] => steps.flatMap(step => {
		if (!step || typeof step !== 'object' || Array.isArray(step)) {
			return [];
		}
		const entries = Object.entries(step);
		return entries.some(([key]) => key.startsWith('${{'))
			? entries.flatMap(([, value]) => Array.isArray(value) ? flatten(value) : [])
			: [step as Record<string, unknown>];
	});
	if (Array.isArray(node)) {
		node.forEach(child => stepLists(child, lists));
	} else if (node && typeof node === 'object') {
		const steps = (node as { steps?: unknown }).steps;
		if (Array.isArray(steps)) {
			lists.push(flatten(steps));
		}
		Object.values(node).forEach(child => stepLists(child, lists));
	}
	return lists;
}

/** The build scripts that run in step lists whose only dependency installation is in build/. */
function buildOnlyScripts(): Map<string, string> {
	const scripts = new Map<string, string>();
	for (const file of listPipelineFiles(pipelinesFolder)) {
		for (const steps of stepLists(load(readFileSync(file, 'utf8'), { schema: FAILSAFE_SCHEMA }))) {
			const installs = steps.filter(step => /\bpnpm (?:install|i)\b/.test(scriptOf(step)));
			if (!installs.length || !installs.every(step => `${(step as { workingDirectory?: unknown }).workingDirectory ?? ''}`.trim() === 'build')) {
				continue;
			}
			for (const step of steps) {
				for (const [, script] of scriptOf(step).matchAll(/\bnode\s+(?:--\s+)?(build\/[\w./-]+\.(?:ts|mts|js|mjs))\b/g)) {
					scripts.set(script, path.relative(repositoryRoot, file).replaceAll('\\', '/'));
				}
			}
		}
	}
	return scripts;
}

/** The runtime module specifiers of a file: type-only imports and exports are erased. */
function runtimeSpecifiers(file: string): string[] {
	const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const specifiers: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])
			&& (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
			specifiers.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return specifiers;
}

function packageName(specifier: string): string {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Each bare import reachable from the entry scripts that build/package.json doesn't declare, with its importer. */
export function undeclaredBuildImports(entries: Iterable<string>, declared: ReadonlySet<string>): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	const pending = [...entries].map(entry => path.join(repositoryRoot, entry));
	while (pending.length) {
		const file = pending.pop()!;
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		for (const specifier of runtimeSpecifiers(file)) {
			if (specifier.startsWith('.')) {
				const target = path.resolve(path.dirname(file), specifier);
				if (/\.(?:ts|mts|js|mjs|cjs)$/.test(target) && existsSync(target)) {
					pending.push(target);
				}
			} else if (!isBuiltin(specifier) && !declared.has(packageName(specifier))) {
				problems.push(`${packageName(specifier)} (imported by ${path.relative(repositoryRoot, file).replaceAll('\\', '/')})`);
			}
		}
	}
	return [...new Set(problems)].sort();
}

suite('scripts of build-only product build jobs', () => {
	const buildPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'build/package.json'), 'utf8'));
	const declared = new Set<string>(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(field => Object.keys(buildPackage[field] ?? {})));

	test('are found in the pipelines that install only build dependencies', () => {
		const scripts = buildOnlyScripts();
		for (const script of ['build/darwin/create-universal-app.ts', 'build/darwin/verify-macho.ts', 'build/azure-pipelines/common/publish.ts']) {
			assert.ok(scripts.has(script), `${script} isn't found in a build-only job`);
		}
	});

	test('import only packages that build/package.json declares', () => {
		assert.deepStrictEqual(undeclaredBuildImports(buildOnlyScripts().keys(), declared), [],
			'A script that a build-only job runs imports a package that build/package.json doesn\'t declare. Add it to build/package.json; the root node_modules isn\'t installed in that job.');
	});

	test('reports an import that only the root declares', () => {
		const withoutMinimatch = new Set([...declared].filter(name => name !== 'minimatch'));
		assert.ok(undeclaredBuildImports(['build/darwin/create-universal-app.ts'], withoutMinimatch).includes('minimatch (imported by build/darwin/create-universal-app.ts)'));
	});
});
