/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import { parsePermissionRuleText } from './chatPermissionRuleSyntax.js';
import { ChatPermissionEffect, ChatPermissionScope, IChatPermissionRule } from './chatPermissions.js';

/**
 * Reads permission rules out of a raw managed-settings document for display.
 *
 * A managed-settings document is the JSON an administrator authored, as delivered by one channel
 * (the GitHub server, a file on disk, or native MDM). This module only *reads* it: it performs no
 * merge across channels and no precedence, because the runtime composes `deny`/`ask` as a union
 * and `allow` as an intersection, and re-deriving that here would create a second authority that
 * silently disagrees with the one doing the enforcing.
 */

/** The managed `permissions` slice of a managed-settings document. */
interface IManagedPermissionsSlice {
	readonly disableBypassPermissionsMode?: unknown;
	readonly deny?: unknown;
	readonly ask?: unknown;
	readonly allow?: unknown;
}

/** Reads the `permissions` object out of a raw managed-settings document, if it has one. */
export function readManagedPermissionsSlice(document: unknown): IManagedPermissionsSlice | undefined {
	if (!isObject(document)) {
		return undefined;
	}
	const permissions = (document as Record<string, unknown>).permissions;
	return isObject(permissions) ? permissions as IManagedPermissionsSlice : undefined;
}

/** The bypass restriction an administrator declared, if any. */
export function readDeclaredBypassRestriction(slice: IManagedPermissionsSlice | undefined): 'disable' | 'allowAutoOnly' | undefined {
	const mode = slice?.disableBypassPermissionsMode;
	if (mode === 'disable') {
		return 'disable';
	}
	// Part of the runtime's managed-settings schema and enforced by its permission engine, though
	// the bundled SDK typings still declare only `disable`.
	return mode === 'allow-auto-only' ? 'allowAutoOnly' : undefined;
}

/**
 * Whether the document declares any allow list. Needed because an allow list that is intersected
 * away is meaningfully different from one that was never declared.
 */
export function declaresAllowList(slice: IManagedPermissionsSlice | undefined): boolean {
	return Array.isArray(slice?.allow);
}

/**
 * Converts the rule lists of one managed-settings document into display rules, keyed by
 * `idPrefix` so rules from different channels do not collide.
 *
 * Rules whose family this client cannot place are skipped: managed enforcement is unaffected, and
 * the diagnostics report carries the raw policy for anyone who needs it.
 */
export function collectManagedPermissionRules(slice: IManagedPermissionsSlice | undefined, idPrefix: string): IChatPermissionRule[] {
	if (!slice) {
		return [];
	}
	const rules: IChatPermissionRule[] = [];
	collectInto(slice.deny, ChatPermissionEffect.Deny, idPrefix, rules);
	collectInto(slice.ask, ChatPermissionEffect.Ask, idPrefix, rules);
	collectInto(slice.allow, ChatPermissionEffect.Allow, idPrefix, rules);
	return rules;
}

function collectInto(value: unknown, effect: ChatPermissionEffect, idPrefix: string, into: IChatPermissionRule[]): void {
	if (!Array.isArray(value)) {
		return;
	}
	for (const entry of value) {
		if (typeof entry !== 'string') {
			continue;
		}
		const parsed = parsePermissionRuleText(entry);
		if (!parsed?.domain) {
			continue;
		}
		into.push({
			id: `${idPrefix}:${effect}:${entry}`,
			domain: parsed.domain,
			kind: parsed.kind,
			...(parsed.argument === undefined ? {} : { argument: parsed.argument }),
			effect,
			scope: ChatPermissionScope.Managed,
			editable: false,
		});
	}
}

/** Removes rules that repeat one already collected, so a rule delivered twice renders once. */
export function dedupeRulesByContent(rules: readonly IChatPermissionRule[]): IChatPermissionRule[] {
	const seen = new Set<string>();
	const result: IChatPermissionRule[] = [];
	for (const rule of rules) {
		const key = `${rule.effect}:${rule.kind}:${rule.argument ?? ''}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(rule);
	}
	return result;
}
