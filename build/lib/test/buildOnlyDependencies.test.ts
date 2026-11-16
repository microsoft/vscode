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

/** The folder of the repository that a step runs in: Azure Pipelines runs steps in the sources folder by default. */
function workingDirectoryOf(step: Record<string, unknown>): string {
	const directory = `${step.workingDirectory ?? ''}`.trim().replace(/^\$\(Build\.SourcesDirectory\)\/?/, '');
	return directory.includes('$(') ? repositoryRoot : path.resolve(repositoryRoot, directory);
}

/**
 * The steps of each `steps:` list of a pipeline file, with the steps of template conditions (`${{ if … }}:`)
 * and of the step templates of this repository (`- template: x.yml@self`) inlined.
 */
function stepLists(file: string): Record<string, unknown>[][] {
	const lists: Record<string, unknown>[][] = [];
	const flatten = (steps: unknown[], file: string, templates: readonly string[]): Record<string, unknown>[] => steps.flatMap(step => {
		if (!step || typeof step !== 'object' || Array.isArray(step)) {
			return [];
		}
		const entries = Object.entries(step);
		if (entries.some(([key]) => key.startsWith('${{'))) {
			return entries.flatMap(([, value]) => Array.isArray(value) ? flatten(value, file, templates) : []);
		}
		const template = (step as { template?: unknown }).template;
		if (typeof template === 'string') {
			const [templatePath, repository = 'self'] = template.split('@');
			// The templates of extends parameters resolve relative to the repository
			const templateFile = [path.resolve(path.dirname(file), templatePath), path.join(repositoryRoot, templatePath)].find(candidate => existsSync(candidate) && !templatePath.startsWith('/')) ?? path.join(repositoryRoot, templatePath);
			if (repository !== 'self' || templatePath.includes('${{') || templates.includes(templateFile)) {
				return [];
			}
			const templateSteps = (load(readFileSync(templateFile, 'utf8'), { schema: FAILSAFE_SCHEMA }) as { steps?: unknown })?.steps;
			return Array.isArray(templateSteps) ? flatten(templateSteps, templateFile, [...templates, templateFile]) : [];
		}
		return [step as Record<string, unknown>];
	});
	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			node.forEach(visit);
		} else if (node && typeof node === 'object') {
			const steps = (node as { steps?: unknown }).steps;
			if (Array.isArray(steps)) {
				lists.push(flatten(steps, file, [file]));
			}
			Object.values(node).forEach(visit);
		}
	};
	visit(load(readFileSync(file, 'utf8'), { schema: FAILSAFE_SCHEMA }));
	return lists;
}

/** Code that a build-only job passes to `node -e` or `node -p`, and the folder that its relative imports resolve in. */
interface IInlineScript {
	readonly code: string;
	readonly directory: string;
	readonly label: string;
}

/**
 * The build scripts that run in step lists whose only dependency installation is in build/, by
 * their path relative to the repository, and the inline scripts of those step lists.
 */
function buildOnlyScripts(): { files: Map<string, string>; inline: IInlineScript[] } {
	const files = new Map<string, string>();
	const inline: IInlineScript[] = [];
	for (const file of listPipelineFiles(pipelinesFolder)) {
		const pipeline = path.relative(repositoryRoot, file).replaceAll('\\', '/');
		for (const steps of stepLists(file)) {
			const installs = steps.filter(step => /\bpnpm (?:install|i)\b/.test(scriptOf(step)));
			if (!installs.length || !installs.every(step => workingDirectoryOf(step) === path.join(repositoryRoot, 'build'))) {
				continue;
			}
			for (const step of steps) {
				const script = scriptOf(step);
				const directory = workingDirectoryOf(step);
				for (const [, relative] of script.matchAll(/\bnode\s+(?:--\s+)?((?:\.\.\/)*build\/[\w./-]+\.(?:ts|mts|js|mjs))\b/g)) {
					files.set(path.relative(repositoryRoot, path.resolve(directory, relative)).replaceAll('\\', '/'), pipeline);
				}
				for (const match of script.matchAll(/\bnode\s+(?:-e|-p|--eval|--print)\s+(?:'(?<single>[^']*)'|"(?<double>(?:[^"\\]|\\.)*)")/g)) {
					inline.push({ code: match.groups!.single ?? match.groups!.double.replace(/\\(.)/g, '$1'), directory, label: `node -e in ${pipeline}` });
				}
			}
		}
	}
	return { files, inline };
}
/** The runtime module specifiers of a file or inline script: type-only imports and exports are erased. */
function runtimeSpecifiers(fileName: string, code: string): string[] {
	const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
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
	// A shell variable in a specifier names a file that only the job knows
	return specifiers.filter(specifier => !specifier.includes('$'));
}

function packageName(specifier: string): string {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Each bare import reachable from the entry scripts (paths relative to the repository) and inline
 * scripts that build/package.json doesn't declare, with its importer.
 */
export function undeclaredBuildImports(entries: Iterable<string>, declared: ReadonlySet<string>, inline: readonly IInlineScript[] = []): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	const pending = [...entries].map(entry => path.join(repositoryRoot, entry));
	const check = (specifiers: string[], directory: string, importer: string) => {
		for (const specifier of specifiers) {
			if (specifier.startsWith('.')) {
				const target = path.resolve(directory, specifier);
				if (/\.(?:ts|mts|js|mjs|cjs)$/.test(target) && existsSync(target)) {
					pending.push(target);
				}
			} else if (!isBuiltin(specifier) && !declared.has(packageName(specifier))) {
				problems.push(`${packageName(specifier)} (imported by ${importer})`);
			}
		}
	};
	for (const { code, directory, label } of inline) {
		check(runtimeSpecifiers('inline.mts', code), directory, label);
	}
	while (pending.length) {
		const file = pending.pop()!;
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		assert.ok(existsSync(file), `${path.relative(repositoryRoot, file)} doesn't exist`);
		check(runtimeSpecifiers(file, readFileSync(file, 'utf8')), path.dirname(file), path.relative(repositoryRoot, file).replaceAll('\\', '/'));
	}
	return [...new Set(problems)].sort();
}
suite('scripts of build-only product build jobs', () => {
	const buildPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'build/package.json'), 'utf8'));
	const declared = new Set<string>(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(field => Object.keys(buildPackage[field] ?? {})));

	test('are found in the pipelines that install only build dependencies, and in their step templates', () => {
		const { files, inline } = buildOnlyScripts();
		for (const script of ['build/darwin/create-universal-app.ts', 'build/darwin/verify-macho.ts', 'build/azure-pipelines/common/publish.ts', 'build/azure-pipelines/common/runWithTimeout.ts']) {
			assert.ok(files.has(script), `${script} isn't found in a build-only job`);
		}
		assert.ok(inline.some(({ code, directory }) => code.includes('install-sysroot.ts') && existsSync(path.resolve(directory, '../build/linux/debian/install-sysroot.ts'))), 'the inline sysroot script of cli/cli-compile.yml isn\'t found in a build-only job');
	});

	test('import only packages that build/package.json declares', () => {
		const { files, inline } = buildOnlyScripts();
		assert.deepStrictEqual(undeclaredBuildImports(files.keys(), declared, inline), [],
			'A script that a build-only job runs imports a package that build/package.json doesn\'t declare. Add it to build/package.json; the root node_modules isn\'t installed in that job.');
	});
	test('reports an import that only the root declares', () => {
		const withoutMinimatch = new Set([...declared].filter(name => name !== 'minimatch'));
		assert.ok(undeclaredBuildImports(['build/darwin/create-universal-app.ts'], withoutMinimatch).includes('minimatch (imported by build/darwin/create-universal-app.ts)'));
	});

	test('reports an import of an inline script, and walks the files that it imports', () => {
		const inline = [{ code: 'import "fancy-package"; import "../build/darwin/create-universal-app.ts";', directory: path.join(repositoryRoot, 'cli'), label: 'node -e in a test' }];
		const problems = undeclaredBuildImports([], new Set(), inline);
		assert.ok(problems.includes('fancy-package (imported by node -e in a test)'), problems.join('\n'));
		assert.ok(problems.includes('minimatch (imported by build/darwin/create-universal-app.ts)'), problems.join('\n'));
	});
});
