/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Construction and validation of Copilot SDK managed permission rules.
 *
 * The SDK parses every rule it receives with a strict grammar, and a single
 * malformed rule rejects the **entire** managed permissions document rather
 * than just the offending entry. Because VS Code sends this document as part of
 * session create/resume, an untranslatable rule derived from a user's settings
 * would fail the session outright. Everything this bridge emits therefore goes
 * through {@link buildManagedRule}, which returns `undefined` for anything the
 * SDK would reject so the caller can drop it and continue.
 *
 * The grammar mirrored here is `parse_managed_rule` in the agent runtime
 * (`src/runtime/src/permissions/managed.rs`).
 */

/**
 * Rule families the SDK understands. Any other family is a parse error for the
 * whole document, so there is deliberately no escape hatch for arbitrary tool
 * names — see `parse_managed_rule`'s "Unsupported managed permission rule
 * family" branch.
 */
export const enum ManagedRuleFamily {
	/** Shell/terminal commands. Matches `Bash` and `PowerShell` on the SDK side too. */
	Shell = 'Shell',
	/** File reads. */
	Read = 'Read',
	/** File writes. The SDK treats `Edit` as an alias. */
	Write = 'Write',
	/** Network access, matched as a URL pattern. */
	Domain = 'Domain',
}

/**
 * A rule with no argument, which matches **every** request in its family — the
 * SDK's matchers return `true` as soon as the family matches and the argument is
 * absent. This is the only correct way to express "all of X"; an argument of
 * `*` is *not* a universal wildcard for {@link ManagedRuleFamily.Domain},
 * because domain arguments are normalized as URL patterns whose only wildcard
 * form is a `*.host` subdomain match.
 */
export function buildManagedFamilyRule(family: ManagedRuleFamily): string {
	return family;
}

/**
 * Builds a single managed permission rule, or returns `undefined` when the
 * argument cannot be expressed in the SDK grammar.
 *
 * Callers must treat `undefined` as "this restriction is not translatable" and
 * skip it — never fall back to a broader rule, which would silently over-restrict.
 */
export function buildManagedRule(family: ManagedRuleFamily, argument: string): string | undefined {
	// Deliberately not trimmed: the SDK parser treats the raw argument as
	// significant, so `Shell( *)` is rejected for having no command prefix.
	// Trimming here would turn that into a valid match-everything rule.
	if (!argument.trim() || !isValidRuleArgument(argument)) {
		return undefined;
	}
	switch (family) {
		case ManagedRuleFamily.Shell:
			return isValidShellArgument(argument) ? `${family}(${argument})` : undefined;
		case ManagedRuleFamily.Read:
		case ManagedRuleFamily.Write:
			return isValidPathArgument(argument) ? `${family}(${normalizePathSeparators(argument)})` : undefined;
		case ManagedRuleFamily.Domain:
			return isValidDomainArgument(argument) ? `${family}(${argument})` : undefined;
	}
}

/**
 * Structural constraints `parse_rule` applies to every argument regardless of
 * family: a rule is delimited by the first `(` and a trailing `)`, so an
 * argument containing `)` would truncate the parse.
 */
function isValidRuleArgument(argument: string): boolean {
	return !argument.includes(')') && !argument.includes('\n');
}

/**
 * The SDK rewrites a trailing `" *"` into a command-boundary match, so
 * `Shell(git *)` matches `git` and `git status` but not `gitea`. A bare `" *"`
 * with no command prefix is rejected there, so it is rejected here.
 */
function isValidShellArgument(argument: string): boolean {
	if (argument === '*') {
		return true;
	}
	const prefix = argument.endsWith(' *') ? argument.slice(0, -2).trimEnd() : argument;
	return prefix.length > 0;
}

/**
 * Path arguments are compiled as globs with `literal_separator` enabled and
 * backslash escaping disabled. The runtime's glob engine has no negation
 * syntax, so a VS Code pattern such as `!foo/**` — legal in
 * `base/common/glob.ts` — must be rejected rather than passed through, where it
 * would fail `validate_glob` and reject the whole document.
 */
function isValidPathArgument(argument: string): boolean {
	if (argument.startsWith('!')) {
		return false;
	}
	// Unbalanced brace alternation fails to compile in the runtime's glob engine.
	let depth = 0;
	for (const char of argument) {
		if (char === '{') {
			depth++;
		} else if (char === '}') {
			if (--depth < 0) {
				return false;
			}
		}
	}
	return depth === 0;
}

/** The runtime normalizes Windows separators before compiling the glob. */
function normalizePathSeparators(argument: string): string {
	return argument.replace(/\\/g, '/');
}

/**
 * Domain arguments are normalized by parsing them as a URL (with an implicit
 * `https://` when no scheme is present), so anything without a host — or
 * carrying shell-substitution syntax the runtime refuses — cannot be expressed.
 */
function isValidDomainArgument(argument: string): boolean {
	if (argument.includes('$(') || argument.includes('${') || argument.includes('`')) {
		return false;
	}
	const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(argument);
	if (!hasScheme && argument.includes('//')) {
		return false;
	}
	// A bare `*` parses as a host but matches nothing; the family rule is the
	// correct way to express "all domains".
	if (argument === '*') {
		return false;
	}
	try {
		const url = new URL(hasScheme ? argument : `https://${argument}`);
		return url.hostname.length > 0;
	} catch {
		return false;
	}
}
