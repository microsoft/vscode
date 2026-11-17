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
		// A mapping of only template conditions holds steps, while a step can also have conditional properties
		if (entries.every(([key]) => key.startsWith('${{'))) {
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

/** A path that a command names relative to the sources directory, as Azure Pipelines (`$(Build.SourcesDirectory)`) or scripts (`$BUILD_SOURCESDIRECTORY`) name it. */
const sourcesDirectoryPrefix = String.raw`(\$\(Build\.SourcesDirectory\)\/|\$(?:env:)?BUILD_SOURCESDIRECTORY\/)?`;

/**
 * The folders in which a step installs dependencies with pnpm, one per installation: the folder that the command
 * changes to (`cd build && pnpm install`, `pnpm -C build install`), or the step's working directory.
 */
function installDirectories(step: Record<string, unknown>): string[] {
	const directory = workingDirectoryOf(step);
	const changesTo = new RegExp(String.raw`\bcd\s+["']?${sourcesDirectoryPrefix}([\w./-]+)["']?\s*(?:&&|;)[^\n]*?\bpnpm\s+(?:install|i)\b`);
	const runsIn = new RegExp(String.raw`\bpnpm\s+(?:-C|--dir)\s+["']?${sourcesDirectoryPrefix}([\w./-]+)["']?\s+(?:install|i)\b`);
	return scriptOf(step).split('\n').filter(line => /\bpnpm\s+(?:(?:-C|--dir)\s+\S+\s+)?(?:install|i)\b/.test(line)).map(line => {
		const [, sourcesDirectory, folder] = changesTo.exec(line) ?? runsIn.exec(line) ?? [];
		return folder ? path.resolve(sourcesDirectory ? repositoryRoot : directory, folder) : directory;
	});
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
			const installs = steps.flatMap(installDirectories);
			if (!installs.length || !installs.every(directory => directory === path.join(repositoryRoot, 'build'))) {
				continue;
			}
			for (const step of steps) {
				const script = scriptOf(step);
				const directory = workingDirectoryOf(step);
				for (const [, sourcesDirectory, relative] of script.matchAll(nodeScript)) {
					files.set(path.relative(repositoryRoot, path.resolve(sourcesDirectory ? repositoryRoot : directory, relative)).replaceAll('\\', '/'), pipeline);
				}
				for (const match of script.matchAll(/\bnode\s+(?:-e|-p|--eval|--print)\s+(?:'(?<single>[^']*)'|"(?<double>(?:[^"\\]|\\.)*)")/g)) {
					inline.push({ code: match.groups!.single ?? match.groups!.double.replace(/\\(.)/g, '$1'), directory, label: `node -e in ${pipeline}` });
				}
			}
		}
	}
	return { files, inline };
}

/**
 * A build script that a command runs with node: a path below build/, relative to the working directory or to
 * the sources directory, which Azure Pipelines names `$(Build.SourcesDirectory)` and scripts `$BUILD_SOURCESDIRECTORY`.
 */
const nodeScript = /\bnode\s+(?:--\s+)?["']?(\$\(Build\.SourcesDirectory\)\/|\$(?:env:)?BUILD_SOURCESDIRECTORY\/)?((?:\.\.\/)*build\/[\w./-]+\.(?:ts|mts|js|mjs))\b/g;

/** The runtime module specifiers of a file or inline script: type-only imports and exports are erased. */
function runtimeSpecifiers(fileName: string, code: string): string[] {
	const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
	const specifiers: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0])
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
 * The build files reachable from the entry scripts (paths relative to the repository) and inline scripts, through
 * their imports and the build scripts that they run with node, and the bare imports of each, with its importer.
 */
export function walkBuildImports(entries: Iterable<string>, inline: readonly IInlineScript[] = []): { files: Set<string>; imports: { name: string; importer: string }[] } {
	const imports: { name: string; importer: string }[] = [];
	const files = new Set<string>();
	const pending = [...entries].map(entry => path.join(repositoryRoot, entry));
	const check = (code: string, specifiers: string[], directory: string, importer: string) => {
		for (const specifier of specifiers) {
			if (specifier.startsWith('.')) {
				const target = path.resolve(directory, specifier);
				if (/\.(?:ts|mts|js|mjs|cjs)$/.test(target) && existsSync(target)) {
					pending.push(target);
				}
			} else if (!isBuiltin(specifier)) {
				imports.push({ name: packageName(specifier), importer });
			}
		}
		// A child process, such as `$`node build/azure-pipelines/common/sign.ts …`` of codesign.ts, runs in the sources directory
		for (const [, , relative] of code.matchAll(nodeScript)) {
			pending.push(path.join(repositoryRoot, relative.replace(/^(?:\.\.\/)+/, '')));
		}
	};
	for (const { code, directory, label } of inline) {
		check(code, runtimeSpecifiers('inline.mts', code), directory, label);
	}
	while (pending.length) {
		const file = pending.pop()!;
		const relative = path.relative(repositoryRoot, file).replaceAll('\\', '/');
		if (files.has(relative)) {
			continue;
		}
		files.add(relative);
		assert.ok(existsSync(file), `${relative} doesn't exist`);
		const code = readFileSync(file, 'utf8');
		check(code, runtimeSpecifiers(file, code), path.dirname(file), relative);
	}
	return { files, imports };
}

/** Each bare import reachable from the entry scripts and inline scripts that build/package.json doesn't declare, with its importer. */
export function undeclaredBuildImports(entries: Iterable<string>, declared: ReadonlySet<string>, inline: readonly IInlineScript[] = []): string[] {
	return [...new Set(walkBuildImports(entries, inline).imports.filter(({ name }) => !declared.has(name)).map(({ name, importer }) => `${name} (imported by ${importer})`))].sort();
}

suite('scripts of build-only product build jobs', () => {
	const buildPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'build/package.json'), 'utf8'));
	const declared = new Set<string>(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(field => Object.keys(buildPackage[field] ?? {})));

	test('are found in the pipelines that install only build dependencies, their step templates and child processes', () => {
		const { files, inline } = buildOnlyScripts();
		for (const script of ['build/darwin/create-universal-app.ts', 'build/darwin/verify-macho.ts', 'build/azure-pipelines/common/publish.ts', 'build/azure-pipelines/common/runWithTimeout.ts', 'build/azure-pipelines/common/installPnpm.ts', 'build/azure-pipelines/publish-types/check-version.ts', 'build/azure-pipelines/publish-types/update-types.ts']) {
			assert.ok(files.has(script), `${script} isn't found in a build-only job`);
		}
		assert.ok(inline.some(({ code, directory }) => code.includes('install-sysroot.ts') && existsSync(path.resolve(directory, '../build/linux/debian/install-sysroot.ts'))), 'the inline sysroot script of cli/cli-compile.yml isn\'t found in a build-only job');
		const reachable = walkBuildImports(files.keys(), inline).files;
		for (const script of ['build/linux/debian/install-sysroot.ts', 'build/azure-pipelines/common/sign.ts']) {
			assert.ok(reachable.has(script), `${script} isn't reached from a build-only job`);
		}
	});

	test('import only packages that build/package.json declares', () => {
		const { files, inline } = buildOnlyScripts();
		assert.deepStrictEqual(undeclaredBuildImports(files.keys(), declared, inline), [],
			'A script that a build-only job runs imports a package that build/package.json doesn\'t declare. Add it to build/package.json; the root node_modules isn\'t installed in that job.');
	});

	test('finds the folder of each installation of a step', () => {
		const build = path.join(repositoryRoot, 'build');
		assert.deepStrictEqual([
			{ script: '(cd build && pnpm install --frozen-lockfile)\nnode build/a.ts' },
			{ script: 'pnpm -C build install' },
			{ bash: 'cd $BUILD_SOURCESDIRECTORY/build; pnpm i' },
			{ script: 'pnpm install', workingDirectory: '$(Build.SourcesDirectory)/build' },
			{ script: 'pnpm install' },
		].flatMap(installDirectories), [build, build, build, build, repositoryRoot]);
	});

	test('reports an import that only the root declares', () => {
		const withoutMinimatch = new Set([...declared].filter(name => name !== 'minimatch'));
		assert.ok(undeclaredBuildImports(['build/darwin/create-universal-app.ts'], withoutMinimatch).includes('minimatch (imported by build/darwin/create-universal-app.ts)'));
	});

	test('reports the imports of an inline script, also with backtick literals, and walks the files that it imports', () => {
		const inline = [{ code: 'import "fancy-package"; await import(`backtick-package`); require(`required-package`); import "../build/darwin/create-universal-app.ts";', directory: path.join(repositoryRoot, 'cli'), label: 'node -e in a test' }];
		const problems = undeclaredBuildImports([], new Set(), inline);
		assert.ok(problems.includes('fancy-package (imported by node -e in a test)'), problems.join('\n'));
		assert.ok(problems.includes('backtick-package (imported by node -e in a test)'), problems.join('\n'));
		assert.ok(problems.includes('required-package (imported by node -e in a test)'), problems.join('\n'));
		assert.ok(problems.includes('minimatch (imported by build/darwin/create-universal-app.ts)'), problems.join('\n'));
	});
});
