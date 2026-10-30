/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters } from '../../../base/common/strings.js';

const regexSpecifier = /^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/;

/** Converts configured terminal rules into sorted, deduplicated Shell allow and ask permissions. */
export function terminalRulesToShellPermissions(rules: Record<string, boolean | null | { approve: boolean; matchCommandLine?: boolean }>): { readonly allow: string[]; readonly ask: string[] } {
	const allow = new Set<string>();
	const ask = new Set<string>();
	for (const [key, value] of Object.entries(rules)) {
		const specifier = regexSpecifier.test(key) ? key : `${key} *`;
		const matchCommandLine = typeof value === 'object' && value?.matchCommandLine === true;
		const rule = `Shell(${matchCommandLine ? 'commandLine:' : ''}${specifier})`;
		const approved = value === true || (typeof value === 'object' && value?.approve === true);
		(approved ? allow : ask).add(rule);
	}
	return { allow: [...allow].sort(), ask: [...ask].sort() };
}

/** Converts a scoped Shell allow grant into an equivalent user terminal rule. */
export function shellRuleToTerminalRule(rule: string): { readonly key: string; readonly value: boolean | { approve: boolean; matchCommandLine: true } } | undefined {
	const specifier = getShellSpecifier(rule);
	if (specifier === undefined || specifier === '') {
		return undefined;
	}
	const matchCommandLine = specifier.startsWith('commandLine:');
	const pattern = matchCommandLine ? specifier.slice('commandLine:'.length) : specifier;
	if (!pattern.trim()) {
		return undefined;
	}
	const isPrefix = pattern.endsWith(' *') && pattern.indexOf('*') === pattern.length - 1;
	const key = regexSpecifier.test(pattern) ? pattern
		: isPrefix ? pattern.slice(0, -2)
			: `/^${pattern.split('*').map(escapeRegExpCharacters).join('.*')}$/` + (pattern.includes('*') ? 's' : '');
	return { key, value: matchCommandLine ? { approve: true, matchCommandLine: true } : true };
}

/** Whether a permission rule targets Shell, including unrestricted Shell rules. */
export function isShellRule(rule: string): boolean {
	return getShellSpecifier(rule) !== undefined;
}

function getShellSpecifier(rule: string): string | undefined {
	const value = rule.trim();
	if (value === 'Shell') {
		return '';
	}
	const specifier = /^Shell\((?<specifier>[\s\S]+)\)$/.exec(value)?.groups?.specifier;
	return specifier?.trim() ? specifier : undefined;
}
