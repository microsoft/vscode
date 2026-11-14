/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import minimatch from 'minimatch';
import { posix, relative, resolve } from 'path';
import { createImportRuleListener } from './utils.ts';

interface Zone {
	readonly target: string | readonly string[];
	readonly from: string | readonly string[];
	readonly except?: readonly string[];
	readonly message?: string;
}

interface Options {
	readonly zones: readonly Zone[];
	readonly basePath?: string;
}

/**
 * Tests a `/`-separated path that is relative to the repository root.
 */
type PathMatcher = (path: string) => boolean;

interface Restriction {
	readonly isRestricted: PathMatcher;
	readonly isException: PathMatcher;
}

interface CompiledZone {
	readonly isTarget: PathMatcher;
	readonly restrictions: readonly Restriction[];
	readonly message: string | undefined;
}

const repositoryRoot = resolve(import.meta.dirname, '..');

// ESLint passes a new `context.options` array for every file, but the option objects in it are reused.
const compiledZonesCache = new WeakMap<Options, readonly CompiledZone[]>();

const stringOrStrings = {
	anyOf: [
		{ type: 'string' },
		{ type: 'array', items: { type: 'string' }, minItems: 1 },
	],
};

/**
 * Replaces `import/no-restricted-paths`, with the same options: in files that match a zone's `target`, imports that
 * resolve to a path matching one of the zone's `from` paths, and none of its `except` paths, are reported.
 *
 * Unlike `import/no-restricted-paths`, imports are not resolved through the filesystem, which could not resolve
 * extensionless TypeScript imports. Relative specifiers are resolved by path arithmetic instead, and bare specifiers,
 * such as packages and tsconfig path aliases, are not checked.
 */
export default new class NoRestrictedZoneImports implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'problem',
		messages: {
			restricted: 'Unexpected path "{{specifier}}" imported in restricted zone.{{suffix}}',
		},
		docs: {
			description: 'Disallow imports from restricted paths into the files of a zone.',
		},
		schema: [{
			type: 'object',
			properties: {
				zones: {
					type: 'array',
					minItems: 1,
					items: {
						type: 'object',
						properties: {
							target: stringOrStrings,
							from: stringOrStrings,
							except: { type: 'array', items: { type: 'string' } },
							message: { type: 'string' },
						},
						required: ['target', 'from'],
						additionalProperties: false,
					},
				},
				basePath: { type: 'string' },
			},
			required: ['zones'],
			additionalProperties: false,
		}],
	};

	create(context: Context): Visitor {
		// `Options` has no index signature, so it doesn't overlap with JSON values
		const options = context.options[0] as unknown as Options | undefined;
		if (!options) {
			return {};
		}

		const filename = toRepositoryPath(context.physicalFilename);
		const zones = compileZones(options).filter(zone => zone.isTarget(filename));
		if (zones.length === 0) {
			return {};
		}

		const directory = posix.dirname(filename);
		const checkImport = (node: ESTree.Node | null | undefined): void => {
			if (node?.type !== 'Literal' || typeof node.value !== 'string' || !node.loc || !isRelative(node.value)) {
				return;
			}
			const path = posix.join(directory, node.value);
			for (const zone of zones) {
				if (zone.restrictions.some(restriction => restriction.isRestricted(path) && !restriction.isException(path))) {
					context.report({
						loc: node.loc,
						messageId: 'restricted',
						data: { specifier: node.value, suffix: zone.message ? ` ${zone.message}` : '' },
					});
				}
			}
		};

		return {
			...createImportRuleListener(node => checkImport(node)),
			ImportExpression: (node: ESTree.ImportExpression) => checkImport(node.source),
			CallExpression: (node: ESTree.CallExpression) => {
				if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1) {
					checkImport(node.arguments[0]);
				}
			},
		};
	}
};

function compileZones(options: Options): readonly CompiledZone[] {
	let zones = compiledZonesCache.get(options);
	if (!zones) {
		const basePath = resolve(repositoryRoot, options.basePath ?? '');
		zones = options.zones.map(zone => ({
			isTarget: matchesAny(asArray(zone.target).map(target => createMatcher(target, toRepositoryPath(basePath, target)))),
			restrictions: asArray(zone.from).map(from => ({
				isRestricted: createMatcher(from, toRepositoryPath(basePath, from)),
				// As in `import/no-restricted-paths`, the exceptions to a directory are relative to that directory.
				isException: matchesAny((zone.except ?? []).map(except => createMatcher(except, isGlob(from) ? toRepositoryPath(basePath, except) : toRepositoryPath(basePath, from, except)))),
			})),
			message: zone.message,
		}));
		compiledZonesCache.set(options, zones);
	}
	return zones;
}

/**
 * Returns a matcher for a glob pattern or, when `pattern` contains no glob characters, for the path itself and
 * everything below it.
 */
function createMatcher(pattern: string, path: string): PathMatcher {
	if (isGlob(pattern)) {
		const glob = new minimatch.Minimatch(path);
		return candidate => glob.match(candidate);
	}
	if (path === '') {
		return candidate => candidate !== '..' && !candidate.startsWith('../');
	}
	return candidate => candidate === path || candidate.startsWith(`${path}/`);
}

function matchesAny(matchers: readonly PathMatcher[]): PathMatcher {
	return path => matchers.some(matcher => matcher(path));
}

function isGlob(pattern: string): boolean {
	return /[*?[\]{}()!]/.test(pattern);
}

function isRelative(specifier: string): boolean {
	return /^\.\.?(?:\/|$)/.test(specifier);
}

/**
 * Resolves the given paths, relative to the repository root, and returns the result relative to the repository root
 * with `/` separators.
 */
function toRepositoryPath(...paths: string[]): string {
	return relative(repositoryRoot, resolve(repositoryRoot, ...paths)).replace(/\\/g, '/');
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
	return Array.isArray(value) ? value : [value as T];
}
