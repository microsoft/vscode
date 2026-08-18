/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatPermissionDomainId } from './chatPermissions.js';

/**
 * Display-only helpers for the runtime's permission rule syntax.
 *
 * These functions split a rule string into the parts a row renders and nothing more. They MUST NOT
 * be used to decide whether a rule matches an operation: the runtime owns matching (glob
 * compilation, shell sub-command analysis, URL normalization, workspace-root resolution), and
 * duplicating any of it here would create a second, silently divergent authority.
 */

/** A rule string split into its renderable parts. */
export interface IParsedPermissionRuleText {
	/** The rule family exactly as authored, e.g. `Shell`. */
	readonly kind: string;
	/** The argument between the parentheses, absent for a bare family rule. */
	readonly argument?: string;
	/** The domain the family belongs to, or `undefined` for a family this client cannot render. */
	readonly domain?: ChatPermissionDomainId;
}

/**
 * Rule families the runtime accepts, mapped to the domain that displays them. Anything absent is a
 * family the runtime would reject or that has no domain yet; such rules are surfaced as unknown
 * rather than dropped, so an unexpected policy is visible instead of silently missing.
 *
 * This is the *read* side of the grammar and so accepts the aliases the runtime tolerates but never
 * emits — `Bash` and `PowerShell` for shell, `Edit` for write — because an administrator may author
 * them by hand. The canonical families VS Code itself *sends* are enumerated by `ManagedRuleFamily`
 * in `platform/agentHost/common/agentHostManagedRules.ts`; keep the two in sync when the runtime's
 * `parse_managed_rule` grammar changes.
 */
const RULE_FAMILY_DOMAINS = new Map<string, ChatPermissionDomainId>([
	['shell', ChatPermissionDomainId.Terminal],
	['bash', ChatPermissionDomainId.Terminal],
	['powershell', ChatPermissionDomainId.Terminal],
	['read', ChatPermissionDomainId.Files],
	['edit', ChatPermissionDomainId.Files],
	['write', ChatPermissionDomainId.Files],
	['domain', ChatPermissionDomainId.Network],
]);

/**
 * Splits `Kind(argument)` or a bare `Kind` into its parts. Returns `undefined` when the text is not
 * shaped like a rule at all, so a malformed entry can be reported rather than rendered as if it
 * were meaningful.
 */
export function parsePermissionRuleText(text: string): IParsedPermissionRuleText | undefined {
	const trimmed = text.trim();
	if (!trimmed) {
		return undefined;
	}

	const open = trimmed.indexOf('(');
	if (open === -1) {
		return { kind: trimmed, domain: RULE_FAMILY_DOMAINS.get(trimmed.toLowerCase()) };
	}

	if (!trimmed.endsWith(')')) {
		return undefined;
	}
	const kind = trimmed.slice(0, open);
	const argument = trimmed.slice(open + 1, -1);
	if (!kind || !argument) {
		return undefined;
	}
	return { kind, argument, domain: RULE_FAMILY_DOMAINS.get(kind.toLowerCase()) };
}

/**
 * Path-argument roots the runtime recognizes, longest prefix first so `//` is matched before `/`.
 * Used only to render a human-readable location next to a pattern.
 */
const PATH_ROOT_LABELS: readonly (readonly [prefix: string, root: PermissionPathRoot])[] = [
	['//', 'filesystem'],
	['~/', 'home'],
	['./', 'workingDirectory'],
	['/', 'workspace'],
];

/** Where a file rule's pattern is anchored. */
export type PermissionPathRoot = 'filesystem' | 'home' | 'workingDirectory' | 'workspace' | 'relative';

/** Splits a file rule argument into its anchor and the pattern beneath it, for display. */
export function splitPermissionPathArgument(argument: string): { readonly root: PermissionPathRoot; readonly pattern: string } {
	for (const [prefix, root] of PATH_ROOT_LABELS) {
		if (argument.startsWith(prefix)) {
			return { root, pattern: argument.slice(prefix.length) };
		}
	}
	return { root: 'relative', pattern: argument };
}

/** Renders a rule back into its canonical `Kind(argument)` form for tooltips and copy actions. */
export function formatPermissionRuleText(kind: string, argument: string | undefined): string {
	return argument === undefined ? kind : `${kind}(${argument})`;
}
