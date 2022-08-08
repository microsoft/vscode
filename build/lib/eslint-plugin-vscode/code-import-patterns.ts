/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/experimental-utils';
import * as path from 'path';
import minimatch from 'minimatch';
import { createImportRuleListener } from './utils';

const REPO_ROOT = path.normalize(path.join(__dirname, '../../../'));

interface ConditionalPattern {
	when?: 'hasBrowser' | 'hasNode' | 'test';
	pattern: string;
}

interface RawImportPatternsConfig {
	target: string;
	layer?: 'common' | 'worker' | 'browser' | 'electron-sandbox' | 'node' | 'electron-browser' | 'electron-main';
	test?: boolean;
	restrictions: string | (string | ConditionalPattern)[];
}

interface LayerAllowRule {
	when: 'hasBrowser' | 'hasNode' | 'test';
	allow: string[];
}

type RawOption = RawImportPatternsConfig | LayerAllowRule;

function isLayerAllowRule(option: RawOption): option is LayerAllowRule {
	return !!((<LayerAllowRule>option).when && (<LayerAllowRule>option).allow);
}

interface ImportPatternsConfig {
	target: string;
	restrictions: string[];
}

export = new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			badImport: 'Imports violates \'{{restrictions}}\' restrictions. See https://github.com/microsoft/vscode/wiki/Source-Code-Organization',
			badFilename: 'Missing definition in `code-import-patterns` for this file. Define rules at https://github.com/microsoft/vscode/blob/main/.eslintrc.json'
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		}
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const options = <RawOption[]>context.options;
		const configs = this._processOptions(options);
		const relativeFilename = getRelativeFilename(context);

		for (const config of configs) {
			if (minimatch(relativeFilename, config.target)) {
				return createImportRuleListener((node, value) => this._checkImport(context, config, node, value));
			}
		}

		context.report({
			loc: { line: 1, column: 0 },
			messageId: 'badFilename'
		});

		return {};
	}

	private _optionsCache = new WeakMap<RawOption[], ImportPatternsConfig[]>();

	private _processOptions(options: RawOption[]): ImportPatternsConfig[] {
		if (this._optionsCache.has(options)) {
			return this._optionsCache.get(options)!;
		}

		type Layer = 'common' | 'worker' | 'browser' | 'electron-sandbox' | 'node' | 'electron-browser' | 'electron-main';

		interface ILayerRule {
			layer: Layer;
			deps: string;
			isBrowser?: boolean;
			isNode?: boolean;
		}

		function orSegment(variants: Layer[]): string {
			return (variants.length === 1 ? variants[0] : `{${variants.join(',')}}`);
		}

		const layerRules: ILayerRule[] = [
			{ layer: 'common', deps: orSegment(['common']) },
			{ layer: 'worker', deps: orSegment(['common', 'worker']) },
			{ layer: 'browser', deps: orSegment(['common', 'browser']), isBrowser: true },
			{ layer: 'electron-sandbox', deps: orSegment(['common', 'browser', 'electron-sandbox']), isBrowser: true },
			{ layer: 'node', deps: orSegment(['common', 'node']), isNode: true },
			{ layer: 'electron-browser', deps: orSegment(['common', 'browser', 'node', 'electron-sandbox', 'electron-browser']), isBrowser: true, isNode: true },
			{ layer: 'electron-main', deps: orSegment(['common', 'node', 'electron-main']), isNode: true },
		];

		let browserAllow: string[] = [];
		let nodeAllow: string[] = [];
		let testAllow: string[] = [];
		for (const option of options) {
			if (isLayerAllowRule(option)) {
				if (option.when === 'hasBrowser') {
					browserAllow = option.allow.slice(0);
				} else if (option.when === 'hasNode') {
					nodeAllow = option.allow.slice(0);
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

			for (const rawRestriction of rawRestrictions) {
				let importPattern: string;
				let when: 'hasBrowser' | 'hasNode' | 'test' | undefined = undefined;
				if (typeof rawRestriction === 'string') {
					importPattern = rawRestriction;
				} else {
					importPattern = rawRestriction.pattern;
					when = rawRestriction.when;
				}
				if (typeof when === 'undefined'
					|| (when === 'hasBrowser' && layerRule.isBrowser)
					|| (when === 'hasNode' && layerRule.isNode)
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
				// Always add "vs/nls"
				restrictions.push('vs/nls');
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
				configs.push({ target, restrictions: <string[]>restrictions.filter(r => typeof r === 'string') });
			}
		}
		this._optionsCache.set(options, configs);
		return configs;
	}

	private _checkImport(context: eslint.Rule.RuleContext, config: ImportPatternsConfig, node: TSESTree.Node, importPath: string) {

		// resolve relative paths
		if (importPath[0] === '.') {
			const relativeFilename = getRelativeFilename(context);
			importPath = path.posix.join(path.posix.dirname(relativeFilename), importPath);
			if (/^src\/vs\//.test(importPath)) {
				// resolve using AMD base url
				importPath = importPath.substring('src/'.length);
			}
		}

		const restrictions = config.restrictions;

		let matched = false;
		for (const pattern of restrictions) {
			if (minimatch(importPath, pattern)) {
				matched = true;
				break;
			}
		}

		if (!matched) {
			// None of the restrictions matched
			context.report({
				loc: node.loc,
				messageId: 'badImport',
				data: {
					restrictions: restrictions.join(' or ')
				}
			});
		}
	}
};

/**
 * Returns the filename relative to the project root and using `/` as separators
 */
function getRelativeFilename(context: eslint.Rule.RuleContext): string {
	const filename = path.normalize(context.getFilename());
	return filename.substring(REPO_ROOT.length).replace(/\\/g, '/');
}
