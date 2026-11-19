/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

interface PatternOption {
	readonly group: readonly string[];
	readonly message?: string;
	readonly caseSensitive?: boolean;
	readonly allowTypeImports?: boolean;
}

interface RestrictedPattern {
	readonly matches: (importSource: string) => boolean;
	readonly message: string | undefined;
	readonly allowTypeImports: boolean;
}

interface GitignoreRule {
	readonly regex: RegExp;
	readonly negated: boolean;
	readonly directoryOnly: boolean;
}

/** Converts one line of a `.gitignore` file to a rule, or returns `undefined` for blank lines and comments. */
function parseGitignoreLine(line: string, caseSensitive: boolean): GitignoreRule | undefined {
	let pattern = line.replace(/(?<!\\)\s+$/, '');
	if (!pattern || pattern.startsWith('#')) {
		return undefined;
	}
	const negated = pattern.startsWith('!');
	if (negated) {
		pattern = pattern.slice(1);
	}
	const directoryOnly = pattern.endsWith('/');
	if (directoryOnly) {
		pattern = pattern.slice(0, -1);
	}
	// A pattern with a separator matches relative to the root, otherwise at any level.
	const anchored = pattern.includes('/');
	if (pattern.startsWith('/')) {
		pattern = pattern.slice(1);
	}

	const segments = pattern.split('/');
	let source = '';
	segments.forEach((segment, i) => {
		const isLast = i === segments.length - 1;
		if (segment === '**') {
			// `**/` matches any directories, `/**` everything inside, `/**/` zero or more directories.
			source += isLast ? '.*' : '(?:.*/)?';
			return;
		}
		source += segmentToRegex(segment) + (isLast ? '' : '/');
	});
	source = (anchored ? '^' : '^(?:.*/)?') + source + '$';
	return { regex: new RegExp(source, caseSensitive ? 'u' : 'iu'), negated, directoryOnly };
}

function segmentToRegex(segment: string): string {
	let source = '';
	for (let i = 0; i < segment.length; i++) {
		const char = segment[i];
		if (char === '\\' && i + 1 < segment.length) {
			source += escapeRegex(segment[++i]);
		} else if (char === '*') {
			source += '[^/]*';
		} else if (char === '?') {
			source += '[^/]';
		} else if (char === '[') {
			const close = segment.indexOf(']', i + 2);
			if (close === -1) {
				source += '\\[';
			} else {
				const range = segment.slice(i + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\');
				source += `[${range}]`;
				i = close;
			}
		} else {
			source += escapeRegex(char);
		}
	}
	return source;
}

function escapeRegex(text: string): string {
	return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/**
 * Creates a matcher with `.gitignore` semantics for a group of patterns: a path is matched if the last pattern that
 * matches it is not negated, or if one of its parent directories is matched.
 */
function createGitignoreMatcher(group: readonly string[], caseSensitive: boolean): (path: string) => boolean {
	const rules = group.map(line => parseGitignoreLine(line, caseSensitive)).filter(rule => rule !== undefined);
	const isMatched = (path: string, isDirectory: boolean): boolean => {
		let matched = false;
		for (const rule of rules) {
			if (rule.negated === matched && (isDirectory || !rule.directoryOnly) && rule.regex.test(path)) {
				matched = !rule.negated;
			}
		}
		return matched;
	};
	return path => {
		const segments = path.split('/');
		for (let i = 1; i < segments.length; i++) {
			if (isMatched(segments.slice(0, i).join('/'), true)) {
				return true;
			}
		}
		return isMatched(path, false);
	};
}

function parsePatterns(options: readonly unknown[]): RestrictedPattern[] {
	const [option] = options as readonly ({ patterns?: readonly (string | PatternOption)[]; paths?: unknown } | undefined)[];
	if (options.length !== 1 || typeof option !== 'object' || option.paths !== undefined || !Array.isArray(option.patterns)) {
		throw new Error('no-restricted-imports: only the option `{ patterns }` is supported');
	}
	const patterns = option.patterns;
	// An array of strings is one group of patterns.
	const groups: readonly PatternOption[] = patterns.every(pattern => typeof pattern === 'string')
		? [{ group: patterns as readonly string[] }]
		: patterns.map(pattern => {
			if (typeof pattern === 'string' || !Array.isArray(pattern.group)
				|| Object.keys(pattern).some(key => !['group', 'message', 'caseSensitive', 'allowTypeImports'].includes(key))) {
				throw new Error('no-restricted-imports: only patterns with `group`, `message`, `caseSensitive` and `allowTypeImports` are supported');
			}
			return pattern;
		});
	return groups.map(group => ({
		matches: createGitignoreMatcher(group.group, !!group.caseSensitive),
		message: group.message,
		allowTypeImports: !!group.allowTypeImports,
	}));
}

type ImportNode = ESTree.ImportDeclaration | ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration | ESTree.TSImportEqualsDeclaration;

function isTypeOnly(node: ImportNode): boolean {
	switch (node.type) {
		case 'ImportDeclaration':
			return node.importKind === 'type'
				|| (node.specifiers.length > 0 && node.specifiers.every(specifier => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type'));
		case 'ExportNamedDeclaration':
			return node.exportKind === 'type'
				|| (node.specifiers.length > 0 && node.specifiers.every(specifier => specifier.exportKind === 'type'));
		case 'ExportAllDeclaration':
			return node.exportKind === 'type';
		case 'TSImportEqualsDeclaration':
			return node.importKind === 'type';
	}
}

/**
 * The `no-restricted-imports` rule of typescript-eslint, for the `patterns` option with groups of `.gitignore`-style
 * patterns: reports imports, re-exports and `import x = require()` declarations of matching modules, except type-only
 * ones when the pattern allows type imports. Dynamic `import()` is not checked.
 */
export default new class NoRestrictedImports implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: { description: 'Disallow specified modules when loaded by `import`' },
		messages: {
			patterns: '\'{{importSource}}\' import is restricted from being used by a pattern.',
			patternWithCustomMessage: '\'{{importSource}}\' import is restricted from being used by a pattern. {{customMessage}}',
		},
		schema: false,
	};

	create(context: Context): Visitor {
		const patterns = parsePatterns(context.options);

		const check = (node: ImportNode, source: string): void => {
			const importSource = source.trim();
			for (const pattern of patterns) {
				if (!pattern.matches(importSource) || (pattern.allowTypeImports && isTypeOnly(node))) {
					continue;
				}
				context.report({
					node,
					messageId: pattern.message ? 'patternWithCustomMessage' : 'patterns',
					data: { importSource, customMessage: pattern.message },
				});
			}
		};

		return {
			ImportDeclaration(node: ESTree.ImportDeclaration) {
				check(node, node.source.value);
			},
			ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
				if (node.source) {
					check(node, node.source.value);
				}
			},
			ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
				check(node, node.source.value);
			},
			TSImportEqualsDeclaration(node: ESTree.TSImportEqualsDeclaration) {
				if (node.moduleReference.type === 'TSExternalModuleReference') {
					check(node, node.moduleReference.expression.value);
				}
			},
		};
	}
};
