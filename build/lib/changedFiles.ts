/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import minimatch from 'minimatch';
import path from 'path';
import { eslintFilter } from '../filters.ts';

const root = path.dirname(path.dirname(import.meta.dirname));

/**
 * A file that a change adds, modifies or deletes. The path is relative to the repository root.
 */
export interface IChangedFile {
	readonly path: string;
	readonly deleted: boolean;
}

/**
 * The files a check covers: every file, or only the listed ones.
 */
export type CheckScope =
	| { readonly kind: 'full'; readonly reason: string }
	| { readonly kind: 'files'; readonly files: readonly string[]; readonly reason: string };

/**
 * Files that configure or implement ESLint for every file, so changing one lints the full repository.
 * Entries ending in `/` match a folder; other entries match a file.
 */
const eslintFullCheckPaths = [
	// Read by eslint.config.js.
	'.eslint-ignore',
	'.eslint-allowed-javascript-files',
	'.eslint-allowed-bracket-notation-files',
	'.eslint-plugin-local/',
	'extensions/copilot/.eslintplugin/',
	// The plugin and parser versions. local/code-amd-node-module also reads package.json.
	'package.json',
	'package-lock.json',
	// The versions of the packages that the Copilot rules in extensions/copilot/.eslintplugin/ import.
	'extensions/copilot/package.json',
	'extensions/copilot/package-lock.json',
	// Read by local/code-translation-remind.
	'build/lib/i18n.resources.json',
	'build/filters.ts',
	'build/eslint.ts',
	'build/lib/changedFiles.ts',
];

/** ESLint uses the closest configuration file to each linted file. */
const eslintConfigFile = /(^|\/)eslint\.config\.[cm]?[jt]s$/;

/**
 * Extensions that eslint.config.js lints with type information (`parserOptions.project`). A change to one file can
 * change the type-aware results in other files, so a change to these extensions lints all of their files.
 */
export const typeAwareLintFolders = [
	'extensions/markdown-language-features/',
	'extensions/mermaid-markdown-features/',
	'extensions/simple-browser/',
	'extensions/typescript-language-features/',
];

/** Files that the type information of the type-aware extensions depends on. */
const typeAwareLintInputs = [
	...typeAwareLintFolders,
	'src/vscode-dts/',
	'extensions/tsconfig.base.json',
	'extensions/package.json',
	'extensions/package-lock.json',
];

/**
 * Files that configure or implement the hygiene checks, so changing one checks the full repository.
 * Entries ending in `/` match a folder; other entries match a file.
 */
const hygieneFullCheckPaths = [
	'build/hygiene.ts',
	'build/gulpfile.hygiene.ts',
	'build/filters.ts',
	'build/lib/formatter.ts',
	'build/stylelint.ts',
	'build/lib/stylelint/',
	// The TypeScript version that checks formatting.
	'package-lock.json',
	'build/lib/changedFiles.ts',
];

/** Formatting settings apply to every file in the folder that contains them. */
const formattingSettingsFile = /(^|\/)tsfmt\.json$/;

function matchesAny(file: string, paths: readonly string[]): boolean {
	return paths.some(p => p.endsWith('/') ? file.startsWith(p) : file === p);
}

/**
 * Creates a predicate for a gulp-filter style list of globs: a path matches when the last glob that matches it is
 * not negated. Dot folders match, like they do when ESLint expands the same globs.
 */
function createGlobFilter(globs: readonly string[]): (file: string) => boolean {
	const matchers = globs.map(glob => {
		const negated = glob.startsWith('!');
		return { negated, matcher: new minimatch.Minimatch(negated ? glob.slice(1) : glob, { dot: true }) };
	});
	return file => {
		let matched = false;
		for (const { negated, matcher } of matchers) {
			if (matched === negated && matcher.match(file)) {
				matched = !negated;
			}
		}
		return matched;
	};
}

const isEslintTarget = createGlobFilter(eslintFilter);

function git(args: readonly string[]): string {
	const result = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
	}
	return result.stdout;
}

/**
 * Parses the output of `git diff --name-status --no-renames -z`.
 */
export function parseNameStatus(output: string): IChangedFile[] {
	const fields = output.split('\0');
	const files: IChangedFile[] = [];
	for (let i = 0; i + 1 < fields.length && fields[i]; i += 2) {
		files.push({ path: fields[i + 1], deleted: fields[i] === 'D' });
	}
	return files;
}

/**
 * Lists the files that differ between `base` and `HEAD`. A rename is listed as a deletion and an addition, so the
 * checks see both paths.
 */
export function getChangedFiles(base: string): IChangedFile[] {
	return parseNameStatus(git(['diff', '--name-status', '--no-renames', '-z', base, 'HEAD', '--']));
}

function listTrackedFiles(folders: readonly string[]): string[] {
	return git(['ls-files', '-z', '--', ...folders]).split('\0').filter(file => !!file);
}

/**
 * Returns the files ESLint needs to check for the given changes, or the full scope when a change can affect the
 * results of unchanged files.
 */
export function getEslintScope(changes: readonly IChangedFile[], listFiles: (folders: readonly string[]) => readonly string[] = listTrackedFiles): CheckScope {
	const fullCheckChange = changes.find(change => eslintConfigFile.test(change.path) || matchesAny(change.path, eslintFullCheckPaths));
	if (fullCheckChange) {
		return { kind: 'full', reason: `${fullCheckChange.path} changed` };
	}

	const files = new Set(changes.filter(change => !change.deleted).map(change => change.path));
	let reason = 'changed files';
	const typeAwareChange = changes.find(change => matchesAny(change.path, typeAwareLintInputs));
	if (typeAwareChange) {
		listFiles(typeAwareLintFolders).forEach(file => files.add(file));
		reason = `changed files, plus the extensions linted with type information because ${typeAwareChange.path} changed`;
	}

	return { kind: 'files', files: Array.from(files).filter(isEslintTarget).sort(), reason };
}

/**
 * Returns the files the hygiene checks need to check for the given changes, or the full scope when the checks
 * themselves change.
 */
export function getHygieneScope(changes: readonly IChangedFile[]): CheckScope {
	const fullCheckChange = changes.find(change => formattingSettingsFile.test(change.path) || matchesAny(change.path, hygieneFullCheckPaths));
	if (fullCheckChange) {
		return { kind: 'full', reason: `${fullCheckChange.path} changed` };
	}

	return { kind: 'files', files: changes.filter(change => !change.deleted).map(change => change.path).sort(), reason: 'changed files' };
}

/**
 * Returns the scope of a check for the files that changed between `base` and `HEAD`. Falls back to the full scope
 * when git cannot list the changes, for example when a shallow clone does not contain `base`.
 */
export function getChangedFilesScope(base: string, getScope: (changes: readonly IChangedFile[]) => CheckScope): CheckScope {
	let changes: IChangedFile[];
	try {
		changes = getChangedFiles(base);
	} catch (error) {
		return { kind: 'full', reason: `the files changed since ${base} could not be listed: ${error instanceof Error ? error.message : String(error)}` };
	}
	return getScope(changes);
}
