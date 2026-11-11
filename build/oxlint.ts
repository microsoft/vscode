/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { statSync } from 'fs';
import { createRequire } from 'module';
import { availableParallelism } from 'os';
import path from 'path';
import { parseArgs } from 'util';
import { getChangedFilesScope, getLintScope, typeAwareLintFolders } from './lib/changedFiles.ts';

// Runs oxlint with the rules of eslint.config.js (see oxlint.config.ts) and reports in ESLint's compact format, with
// ESLint's rule names, which the editor and disable directives use. oxlint runs JS plugin rules on one thread per
// process, so a large run is split into processes by folder. The extensions that use rules with type information run
// in a separate process with `--type-aware`, so that only that process builds TypeScript programs.

const root = path.dirname(import.meta.dirname);
const oxlintBin = path.join(path.dirname(createRequire(import.meta.url).resolve('oxlint/package.json')), 'bin', 'oxlint');

/** Below this length a command line fits on every platform (Windows allows 32,767 characters). */
const maxArgumentsLength = 24_000;

/** Files per process below which starting another process costs more than it saves. */
const minFilesPerProcess = 500;

interface IOxlintDiagnostic {
	readonly message: string;
	readonly code?: string;
	readonly severity: 'warning' | 'error' | string;
	readonly filename: string;
	readonly labels?: readonly { readonly span: { readonly line: number; readonly column: number } }[];
}

interface IOxlintOutput {
	readonly diagnostics: readonly IOxlintDiagnostic[];
	readonly number_of_files: number;
}

interface IWeightedFile {
	readonly path: string;
	readonly weight: number;
}

/**
 * Returns the ESLint name of the rule that an oxlint diagnostic code such as `eslint(no-var)`, `typescript(no-explicit-any)`
 * or `local(code-layering)` names.
 */
export function toEslintRuleId(code: string | undefined): string | undefined {
	const match = code ? /^(?<plugin>.+)\((?<rule>.+)\)$/.exec(code) : null;
	if (!match?.groups) {
		return code || undefined;
	}
	const { plugin, rule } = match.groups;
	switch (plugin) {
		case 'eslint': return rule;
		case 'typescript': return `@typescript-eslint/${rule}`;
		default: return `${plugin}/${rule}`;
	}
}

function isInFolder(file: string, folder: string): boolean {
	return file.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}

/**
 * Splits complete folders of files into `count` groups of paths of about the same size. A path is a folder when all of
 * its files are in the group, so that command lines stay short; folders that contain one of `excludedFolders` are
 * never passed whole, because their excluded files are linted elsewhere.
 */
export function splitByFolder(files: readonly IWeightedFile[], count: number, excludedFolders: readonly string[]): string[][] {
	interface IFolder { readonly path: string; weight: number; readonly folders: Map<string, IFolder>; readonly files: IWeightedFile[] }
	const top: IFolder = { path: '', weight: 0, folders: new Map(), files: [] };
	for (const file of files) {
		const segments = file.path.split('/');
		let folder = top;
		folder.weight += file.weight;
		for (const segment of segments.slice(0, -1)) {
			let child = folder.folders.get(segment);
			if (!child) {
				child = { path: folder.path ? `${folder.path}/${segment}` : segment, weight: 0, folders: new Map(), files: [] };
				folder.folders.set(segment, child);
			}
			child.weight += file.weight;
			folder = child;
		}
		folder.files.push(file);
	}

	// Chunks of at most a quarter of a group's share let the groups balance.
	const maxChunk = top.weight / (count * 4);
	const chunks: IWeightedFile[] = [];
	const visit = (folder: IFolder) => {
		const containsExcluded = excludedFolders.some(excluded => isInFolder(excluded, folder.path) || excluded.replace(/\/$/, '') === folder.path);
		if (folder !== top && folder.weight <= maxChunk && !containsExcluded) {
			chunks.push({ path: folder.path, weight: folder.weight });
			return;
		}
		folder.folders.forEach(visit);
		chunks.push(...folder.files);
	};
	visit(top);

	const groups = Array.from({ length: count }, () => ({ paths: [] as string[], weight: 0 }));
	for (const chunk of chunks.sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path))) {
		const lightest = groups.reduce((min, group) => group.weight < min.weight ? group : min);
		lightest.paths.push(chunk.path);
		lightest.weight += chunk.weight;
	}
	return groups.map(group => group.paths.sort()).filter(paths => paths.length > 0);
}

/**
 * Splits a list of files into at least `count` groups (fewer if there are fewer files) of about the same length,
 * whose command lines stay below `maxLength` characters unless a single path is longer.
 */
export function splitFiles(files: readonly string[], count: number, maxLength = maxArgumentsLength): string[][] {
	const length = files.reduce((sum, file) => sum + file.length + 1, 0);
	const groupCount = Math.min(files.length, Math.max(count, Math.ceil(length / maxLength)));
	const groups = Array.from({ length: groupCount }, () => ({ paths: [] as string[], length: 0 }));
	for (const file of files) {
		let lightest = groups.reduce((min, group) => group.length < min.length ? group : min);
		if (lightest.paths.length > 0 && lightest.length + file.length + 1 > maxLength) {
			lightest = { paths: [], length: 0 };
			groups.push(lightest);
		}
		lightest.paths.push(file);
		lightest.length += file.length + 1;
	}
	return groups.map(group => group.paths);
}

function runOxlint(args: readonly string[]): Promise<IOxlintOutput & { readonly duration: number }> {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [oxlintBin, '--format', 'json', '--no-error-on-unmatched-pattern', ...args], { cwd: root });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', data => stdout += data);
		child.stderr.on('data', data => stderr += data);
		child.on('error', reject);
		child.on('close', code => {
			try {
				resolve({ ...JSON.parse(stdout), duration: Date.now() - started });
			} catch {
				reject(new Error(`oxlint exited with ${code}: ${stderr || stdout}`));
			}
		});
	});
}

async function listFiles(paths: readonly string[]): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [oxlintBin, '--debug=files', '--no-error-on-unmatched-pattern', ...paths], { cwd: root });
		let stdout = '';
		child.stdout.on('data', data => stdout += data);
		child.on('error', reject);
		child.on('close', code => code === 0 ? resolve(stdout.split(/\r?\n/).filter(Boolean).map(file => file.replace(/\\/g, '/'))) : reject(new Error(`oxlint --debug=files exited with ${code}`)));
	});
}

async function runAll<T>(tasks: readonly (() => Promise<T>)[], concurrency: number): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
		while (next < tasks.length) {
			const index = next++;
			results[index] = await tasks[index]();
		}
	}));
	return results;
}

/**
 * Formats diagnostics like ESLint's compact formatter, with ESLint's rule names, which the editor's problem matchers
 * and disable directives use.
 */
export function formatCompact(diagnostics: readonly IOxlintDiagnostic[], cwd: string): string {
	const lines = diagnostics.map(diagnostic => {
		const { line, column } = diagnostic.labels?.[0]?.span ?? { line: 0, column: 0 };
		const rule = toEslintRuleId(diagnostic.code);
		const severity = diagnostic.severity === 'error' ? 'Error' : 'Warning';
		return { file: path.resolve(cwd, diagnostic.filename), line, column, text: `line ${line}, col ${column}, ${severity} - ${diagnostic.message}${rule ? ` (${rule})` : ''}` };
	});
	lines.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
	return lines.map(line => `${line.file}: ${line.text}`).join('\n');
}

function plural(count: number, noun: string, nouns = `${noun}s`): string {
	return `${count} ${count === 1 ? noun : nouns}`;
}

/**
 * Lints like `pnpm run oxlint` with the given arguments, prints the problems, and returns how many there are.
 */
export async function oxlint(args: readonly string[]): Promise<number> {
	const started = Date.now();
	const { values, positionals } = parseArgs({
		args: Array.from(args),
		options: { 'changed-since': { type: 'string' }, 'processes': { type: 'string' } },
		allowPositionals: true,
	});
	const changedSince = values['changed-since'];
	if (changedSince !== undefined && positionals.length > 0) {
		throw new Error('Pass either files to lint or --changed-since, not both.');
	}
	const maxProcesses = values.processes ? Number(values.processes) : Math.min(8, availableParallelism());
	if (!Number.isInteger(maxProcesses) || maxProcesses < 1) {
		throw new Error('--processes requires a positive number.');
	}

	// The paths of each process: oxlint applies the ignore patterns of the configuration to all of them.
	const runs: { readonly args: string[] }[] = [];
	let description: string;
	const scope = changedSince !== undefined ? getChangedFilesScope(changedSince, getLintScope) : undefined;
	if (positionals.length === 0 && (!scope || scope.kind === 'full')) {
		description = scope ? `the full repository because ${scope.reason}` : 'the full repository';
		const files = await listFiles(['.']);
		const typeAware = typeAwareLintFolders.filter(folder => files.some(file => isInFolder(file, folder)));
		const weighted = files.filter(file => !typeAware.some(folder => isInFolder(file, folder))).map(file => ({ path: file, weight: statSync(path.join(root, file)).size }));
		runs.push(...splitByFolder(weighted, maxProcesses, typeAware).map(paths => ({ args: paths })));
		if (typeAware.length) {
			runs.push({ args: ['--type-aware', ...typeAware] });
		}
	} else {
		const files = scope?.kind === 'files' ? Array.from(scope.files) : (await Promise.all(splitFiles(positionals, 1).map(paths => listFiles(paths)))).flat();
		description = scope?.kind === 'files' ? `${plural(files.length, 'file')} (${scope.reason})` : plural(positionals.length, 'requested target');
		const typeAwareFiles = new Set(files.filter(file => typeAwareLintFolders.some(folder => isInFolder(file, folder))));
		const otherFiles = files.filter(file => !typeAwareFiles.has(file));
		const processes = Math.min(maxProcesses, Math.ceil(otherFiles.length / minFilesPerProcess));
		if (otherFiles.length) {
			runs.push(...splitFiles(otherFiles, processes).map(paths => ({ args: paths })));
		}
		if (typeAwareFiles.size) {
			runs.push(...splitFiles(Array.from(typeAwareFiles), 1).map(paths => ({ args: ['--type-aware', ...paths] })));
		}
	}

	console.log(`oxlint: checking ${description}.`);
	if (runs.length === 0) {
		return 0;
	}
	const outputs = await runAll(runs.map(run => () => runOxlint(run.args)), maxProcesses + 1);
	const diagnostics = outputs.flatMap(output => output.diagnostics);
	if (diagnostics.length) {
		console.log(formatCompact(diagnostics, root));
		console.log(`\n${plural(diagnostics.length, 'problem')}`);
	}
	const fileCount = outputs.reduce((sum, output) => sum + output.number_of_files, 0);
	const slowest = Math.max(...outputs.map(output => output.duration));
	console.log(`oxlint: checked ${plural(fileCount, 'file')} in ${Date.now() - started}ms with ${plural(runs.length, 'process', 'processes')} (the slowest took ${slowest}ms).`);
	return diagnostics.length;
}

if (import.meta.main) {
	oxlint(process.argv.slice(2)).then(problems => {
		if (problems) {
			throw new Error(`oxlint failed with ${problems} warnings and/or errors`);
		}
	}).catch(err => {
		console.error();
		console.error(err);
		// Not process.exit(), which would truncate output that is still being written to a pipe.
		process.exitCode = 1;
	});
}
