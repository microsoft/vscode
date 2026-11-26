/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import * as path from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils.ts';

const REPO_ROOT = path.normalize(path.join(import.meta.dirname, '../'));

const matchers = new Map<string, minimatch.IMinimatch>();

function getMatcher(pattern: string): minimatch.IMinimatch {
	let matcher = matchers.get(pattern);
	if (!matcher) {
		matcher = new minimatch.Minimatch(pattern);
		matchers.set(pattern, matcher);
	}
	return matcher;
}

/**
 * Same as `minimatch(path, pattern)`, but compiles each pattern only once.
 */
function match(path: string, pattern: string): boolean {
	return getMatcher(pattern).match(path);
}

const literalStartsCache = new Map<string, string[][] | null>();

/**
 * Returns `false` when `pattern` can't match the path split into `segments` like minimatch splits it, because a literal
 * segment at the start of the pattern is different. This is a cheap pre-check that avoids most calls to `match`.
 */
function mayMatch(segments: readonly string[], pattern: string): boolean {
	let literalStarts = literalStartsCache.get(pattern);
	if (literalStarts === undefined) {
		const matcher = getMatcher(pattern);
		// minimatch compares the leading string parts of each alternative of the pattern with the path segments verbatim
		literalStarts = matcher.negate || matcher.comment || matcher.empty ? null : matcher.set.map((parts: unknown[]) => {
			const end = parts.findIndex(part => typeof part !== 'string');
			return (end === -1 ? parts : parts.slice(0, end)) as string[];
		});
		literalStartsCache.set(pattern, literalStarts);
	}
	return !literalStarts || literalStarts.some(literals => literals.every((literal, i) => segments[i] === literal));
}

interface ConditionalPattern {
	when?: 'hasBrowser' | 'hasNode' | 'hasElectron' | 'test';
	pattern: string;
}

interface RawImportPatternsConfig {
	target: string;
	layer?: 'common' | 'worker' | 'browser' | 'electron-browser' | 'node' | 'electron-utility' | 'electron-main';
	test?: boolean;
	restrictions: string | (string | ConditionalPattern)[];
}

interface LayerAllowRule {
	when: 'hasBrowser' | 'hasNode' | 'hasElectron' | 'test';
	allow: string[];
}

type RawOption = RawImportPatternsConfig | LayerAllowRule;

function isLayerAllowRule(option: RawOption): option is LayerAllowRule {
	return !!((option as LayerAllowRule).when && (option as LayerAllowRule).allow);
}

interface ImportPatternsConfig {
	target: string;
	restrictions: string[];
}

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			badImport: 'Imports violates \'{{restrictions}}\' restrictions. See https://github.com/microsoft/vscode/wiki/Source-Code-Organization',
			badFilename: 'Missing definition in `code-import-patterns` for this file. Define rules at https://github.com/microsoft/vscode/blob/main/eslint.config.js',
			badAbsolute: 'Imports have to be relative to support ESM',
			badExtension: 'Imports have to end with `.js` or `.css` to support ESM',
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		},
		schema: false,
	};

	create(context: Context): Visitor {
		// Option interfaces have no index signature, so they don't overlap with JSON values
		const options = context.options as unknown as readonly RawOption[];
		const configs = this._processOptions(options);
		const relativeFilename = getRelativeFilename(context);
		const segments = relativeFilename.split(/\/+/);

		for (const config of configs) {
			if (mayMatch(segments, config.target) && match(relativeFilename, config.target)) {
				const targetIsVS = /^src\/vs\//.test(relativeFilename);
				const relativeDirname = path.posix.dirname(relativeFilename);
				return createImportRuleListener((node, value) => this._checkImport(context, config, targetIsVS, relativeDirname, node, value));
			}
		}

		context.report({
			loc: { line: 1, column: 0 },
			messageId: 'badFilename'
		});

		return {};
	}

	// ESLint passes a new `context.options` array for every file, but the option objects in it are reused.
	private _optionsCache = new WeakMap<RawOption, ImportPatternsConfig[]>();

	private _processOptions(options: readonly RawOption[]): ImportPatternsConfig[] {
		const cacheKey = options[0];
		const cached = cacheKey && this._optionsCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		type Layer = 'common' | 'worker' | 'browser' | 'electron-browser' | 'node' | 'electron-utility' | 'electron-main';

		interface ILayerRule {
			layer: Layer;
			deps: string;
			isBrowser?: boolean;
			isNode?: boolean;
			isElectron?: boolean;
		}

		function orSegment(variants: Layer[]): string {
			return (variants.length === 1 ? variants[0] : `{${variants.join(',')}}`);
		}

		const layerRules: ILayerRule[] = [
			{ layer: 'common', deps: orSegment(['common']) },
			{ layer: 'worker', deps: orSegment(['common', 'worker']) },
			{ layer: 'browser', deps: orSegment(['common', 'browser']), isBrowser: true },
			{ layer: 'electron-browser', deps: orSegment(['common', 'browser', 'electron-browser']), isBrowser: true },
			{ layer: 'node', deps: orSegment(['common', 'node']), isNode: true },
			{ layer: 'electron-utility', deps: orSegment(['common', 'node', 'electron-utility']), isNode: true, isElectron: true },
			{ layer: 'electron-main', deps: orSegment(['common', 'node', 'electron-utility', 'electron-main']), isNode: true, isElectron: true },
		];

		let browserAllow: string[] = [];
		let nodeAllow: string[] = [];
		let electronAllow: string[] = [];
		let testAllow: string[] = [];
		for (const option of options) {
			if (isLayerAllowRule(option)) {
				if (option.when === 'hasBrowser') {
					browserAllow = option.allow.slice(0);
				} else if (option.when === 'hasNode') {
					nodeAllow = option.allow.slice(0);
				} else if (option.when === 'hasElectron') {
					electronAllow = option.allow.slice(0);
				} else if (option.when === 'test') {
					testAllow = option.allow.slice(0);
				}
			}
		}

		function findLayer(layer: Layer): ILayerRule | null {
			for (const layerRule of layerRules) {
				if (layerRule.layer === layer) {
					return layerRule;
				}
			}
			return null;
		}

		function generateConfig(layerRule: ILayerRule, target: string, rawRestrictions: (string | ConditionalPattern)[]): [ImportPatternsConfig, ImportPatternsConfig] {
			const restrictions: string[] = [];
			const testRestrictions: string[] = [...testAllow];

			if (layerRule.isBrowser) {
				restrictions.push(...browserAllow);
			}

			if (layerRule.isNode) {
				restrictions.push(...nodeAllow);
			}

			if (layerRule.isElectron) {
				restrictions.push(...electronAllow);
			}

			for (const rawRestriction of rawRestrictions) {
				let importPattern: string;
				let when: 'hasBrowser' | 'hasNode' | 'hasElectron' | 'test' | undefined = undefined;
				if (typeof rawRestriction === 'string') {
					importPattern = rawRestriction;
				} else {
					importPattern = rawRestriction.pattern;
					when = rawRestriction.when;
				}
				if (typeof when === 'undefined'
					|| (when === 'hasBrowser' && layerRule.isBrowser)
					|| (when === 'hasNode' && layerRule.isNode)
					|| (when === 'hasElectron' && layerRule.isElectron)
				) {
					restrictions.push(importPattern.replace(/\/\~$/, `/${layerRule.deps}/**`));
					testRestrictions.push(importPattern.replace(/\/\~$/, `/test/${layerRule.deps}/**`));
				} else if (when === 'test') {
					testRestrictions.push(importPattern.replace(/\/\~$/, `/${layerRule.deps}/**`));
					testRestrictions.push(importPattern.replace(/\/\~$/, `/test/${layerRule.deps}/**`));
				}
			}

			testRestrictions.push(...restrictions);

			return [
				{
					target: target.replace(/\/\~$/, `/${layerRule.layer}/**`),
					restrictions: restrictions
				},
				{
					target: target.replace(/\/\~$/, `/test/${layerRule.layer}/**`),
					restrictions: testRestrictions
				}
			];
		}

		const configs: ImportPatternsConfig[] = [];
		for (const option of options) {
			if (isLayerAllowRule(option)) {
				continue;
			}
			const target = option.target;
			const targetIsVS = /^src\/vs\//.test(target);
			const restrictions = (typeof option.restrictions === 'string' ? [option.restrictions] : option.restrictions).slice(0);

			if (targetIsVS) {
				// Always add "vs/nls" and "vs/amdX"
				restrictions.push('vs/nls.js');
				restrictions.push('vs/amdX.js'); // TODO@jrieken remove after ESM is real
			}

			if (targetIsVS && option.layer) {
				// single layer => simple substitution for /~
				const layerRule = findLayer(option.layer);
				if (layerRule) {
					const [config, testConfig] = generateConfig(layerRule, target, restrictions);
					if (option.test) {
						configs.push(testConfig);
					} else {
						configs.push(config);
					}
				}
			} else if (targetIsVS && /\/\~$/.test(target)) {
				// generate all layers
				for (const layerRule of layerRules) {
					const [config, testConfig] = generateConfig(layerRule, target, restrictions);
					configs.push(config);
					configs.push(testConfig);
				}
			} else {
				configs.push({ target, restrictions: restrictions.filter(r => typeof r === 'string') as string[] });
			}
		}
		if (cacheKey) {
			this._optionsCache.set(cacheKey, configs);
		}
		return configs;
	}

	private _checkImport(context: Context, config: ImportPatternsConfig, targetIsVS: boolean, relativeDirname: string, node: ESTree.Node, importPath: string) {
		if (targetIsVS) {

			// ESM: check for import ending with ".js" or ".css"
			if (importPath[0] === '.' && !importPath.endsWith('.js') && !importPath.endsWith('.css')) {
				context.report({
					loc: node.loc,
					messageId: 'badExtension',
				});
			}

			// check for import being relative
			if (importPath.startsWith('vs/')) {
				context.report({
					loc: node.loc,
					messageId: 'badAbsolute',
				});
			}
		}

		// resolve relative paths
		if (importPath[0] === '.') {
			importPath = path.posix.join(relativeDirname, importPath);
			if (/^src\/vs\//.test(importPath)) {
				// resolve using base url
				importPath = importPath.substring('src/'.length);
			}
		}

		if (!isAllowedImport(config, importPath)) {
			// None of the restrictions matched
			context.report({
				loc: node.loc,
				messageId: 'badImport',
				data: {
					restrictions: config.restrictions.join(' or ')
				}
			});
		}
	}
};

// The configs are reused across files, and so are most of the paths they import.
const allowedImportsCache = new WeakMap<ImportPatternsConfig, Map<string, boolean>>();

/**
 * Returns whether `importPath` matches any of the restrictions of `config`.
 */
function isAllowedImport(config: ImportPatternsConfig, importPath: string): boolean {
	let allowedImports = allowedImportsCache.get(config);
	if (!allowedImports) {
		allowedImports = new Map();
		allowedImportsCache.set(config, allowedImports);
	}
	let allowed = allowedImports.get(importPath);
	if (allowed === undefined) {
		allowed = config.restrictions.some(pattern => match(importPath, pattern));
		allowedImports.set(importPath, allowed);
	}
	return allowed;
}

/**
 * Returns the filename relative to the project root and using `/` as separators
 */
function getRelativeFilename(context: Context): string {
	const filename = path.normalize(context.filename);
	return filename.substring(REPO_ROOT.length).replace(/\\/g, '/');
}
