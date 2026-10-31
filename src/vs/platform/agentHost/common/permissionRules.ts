/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match } from '../../../base/common/glob.js';
import { Schemas } from '../../../base/common/network.js';
import { posix } from '../../../base/common/path.js';
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../base/common/strings.js';
import { isStringArray } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { isUrlApproved, type IUrlApprovalSettings } from '../../url/common/urlApprovalPatterns.js';
import { AgentPermissionKind } from './agent.js';

/** Where a host-issued permission grant is recorded when its confirmation option is selected. */
export const enum PermissionGrantScope {
	Session = 'session',
	/** Local VS Code clients also mirror WebFetch and Shell grants into their settings. */
	Host = 'host',
}

const SESSION_GRANT_OPTION_PREFIX = 'allow-session-rules:';
const HOST_GRANT_OPTION_PREFIX = 'allow-always-rules:';
const shellRegexSpecifier = /^\/(?<pattern>.*)\/(?<flags>[dgimsuvy]*)$/;

/** Encodes a grant into a confirmation option id. */
export function permissionGrantOptionId(scope: PermissionGrantScope, rules: readonly string[]): string {
	return (scope === PermissionGrantScope.Session ? SESSION_GRANT_OPTION_PREFIX : HOST_GRANT_OPTION_PREFIX) + JSON.stringify(rules);
}

/** Decodes a confirmation option id produced by {@link permissionGrantOptionId}; `undefined` for any other id or malformed payload. */
export function parsePermissionGrantOptionId(id: string): { readonly scope: PermissionGrantScope; readonly rules: readonly string[] } | undefined {
	const prefix = [SESSION_GRANT_OPTION_PREFIX, HOST_GRANT_OPTION_PREFIX].find(prefix => id.startsWith(prefix));
	if (!prefix) {
		return undefined;
	}
	try {
		const rules: unknown = JSON.parse(id.slice(prefix.length));
		return isStringArray(rules) ? { scope: prefix === SESSION_GRANT_OPTION_PREFIX ? PermissionGrantScope.Session : PermissionGrantScope.Host, rules } : undefined;
	} catch {
		return undefined;
	}
}

/** Converts a WebFetch rule into a VS Code URL-approval pattern, defaulting omitted schemes to HTTPS. */
export function webFetchRuleToUrlPattern(rule: string): string | undefined {
	const parsed = parsePermissionRule(rule);
	if (parsed?.tool !== 'WebFetch') {
		return undefined;
	}
	if (parsed.specifier === undefined) {
		return '*';
	}
	return normalizeWebFetchPattern(parsed.specifier);
}

/**
 * Converts request decisions into sorted, deduplicated WebFetch permissions.
 * Host ask rules override allows, failing closed where VS Code's first-match ordering would differ.
 */
export function urlApprovalsToWebFetchRules(approvals: Record<string, boolean | IUrlApprovalSettings>): { readonly allow: string[]; readonly ask: string[] } {
	const allow = new Set<string>();
	const ask = new Set<string>();
	for (const [pattern, settings] of Object.entries(approvals)) {
		const approved = typeof settings === 'boolean' ? settings : settings?.approveRequest;
		if (approved !== true && approved !== false) {
			continue;
		}
		(approved ? allow : ask).add(pattern === '*' ? 'WebFetch' : webFetchRule(pattern.replace(/^https:\/\//i, '')));
	}
	return { allow: [...allow].sort(), ask: [...ask].sort() };
}

/** Whether a permission rule targets WebFetch, regardless of its specifier. */
export function isWebFetchRule(rule: string): boolean {
	return parsePermissionRule(rule)?.tool === 'WebFetch';
}

function normalizeWebFetchPattern(pattern: string): string {
	return /^[^./:]*:\/\//.test(pattern) ? pattern : `${Schemas.https}://${pattern}`;
}

/** Host permission details, independent of provider-specific tool names. */
export interface IPermissionRequest {
	readonly kind: AgentPermissionKind | undefined;
	readonly toolName: string;
	readonly shellLanguage?: 'bash' | 'powershell';
	readonly url?: string;
	/** Absolute filesystem path for read/write requests. */
	readonly path?: string;
}

/** Project root and cwd are both the session's primary working directory; directories are absolute filesystem paths. */
export interface IPermissionRuleContext {
	readonly workingDirectory?: string;
	readonly homeDirectory: string;
	readonly ignorePathCase?: boolean;
}

interface IParsedPermissionRule {
	readonly tool: string;
	readonly specifier?: string;
}

/** Matches a complete request or bare Shell rule; scoped shell specifiers use the sub-command and command-line matchers. */
export function matchesPermissionRule(rule: string, request: IPermissionRequest, context: IPermissionRuleContext): boolean {
	const parsed = parsePermissionRule(rule);
	if (!parsed) {
		return false;
	}

	switch (parsed.tool) {
		case 'Shell':
			return request.kind === AgentPermissionKind.Shell && parsed.specifier === undefined;
		case 'WebFetch':
			return request.kind === AgentPermissionKind.Url && (parsed.specifier === undefined || matchesWebFetch(parsed.specifier, request.url));
		case 'Read':
		case 'Edit':
			return request.kind === (parsed.tool === 'Read' ? AgentPermissionKind.Read : AgentPermissionKind.Write)
				&& (parsed.specifier === undefined || matchesPath(parsed.specifier, request.path, context));
		default:
			return parsed.specifier === undefined && parsed.tool === request.toolName;
	}
}

/** Matches a trimmed sub-command using exact text, wildcards, or /regex/flags; PowerShell ignores case. */
export function matchesShellSubCommand(rule: string, subCommand: string, language: 'bash' | 'powershell'): boolean {
	const parsed = parsePermissionRule(rule);
	return parsed?.tool === 'Shell'
		&& !parsed.specifier?.startsWith('commandLine:')
		&& (parsed.specifier === undefined || matchesShellSpecifier(parsed.specifier, subCommand, language));
}

/** Matches Shell(commandLine:<specifier>) against the full trimmed line using wildcards or /regex/flags. */
export function matchesShellCommandLine(rule: string, commandLine: string, language: 'bash' | 'powershell'): boolean {
	const parsed = parsePermissionRule(rule);
	return parsed?.tool === 'Shell' && parsed.specifier?.startsWith('commandLine:') === true
		&& matchesShellSpecifier(parsed.specifier.slice('commandLine:'.length), commandLine, language);
}

function matchesShellSpecifier(specifier: string, command: string, language: 'bash' | 'powershell'): boolean {
	if (!specifier) {
		return false;
	}
	const match = shellRegexSpecifier.exec(specifier);
	if (match?.groups) {
		try {
			const flags = match.groups.flags;
			const regex = new RegExp(match.groups.pattern, language === 'powershell' && !flags.includes('i') ? flags + 'i' : flags);
			return (regex.source === '.*' || !regExpLeadsToEndlessLoop(regex)) && regex.test(command.trim());
		} catch {
			return false;
		}
	}
	const pattern = specifier.endsWith(':*') ? `${specifier.slice(0, -2)} *` : specifier;
	const isPrefix = pattern.endsWith(' *') && pattern.indexOf('*') === pattern.length - 1;
	const expression = isPrefix
		? `${escapeRegExpCharacters(pattern.slice(0, -2))}(?: .*)?`
		: pattern.split('*').map(escapeRegExpCharacters).join('.*');
	return new RegExp(`^${expression}$`, language === 'powershell' ? 'is' : 's').test(command.trim());
}

/** Builds a shell-prefix pattern for a scoped grant, including the bare prefix command. */
export function shellPrefixRule(prefix: string): string {
	const command = prefix.trim();
	return command.startsWith('commandLine:')
		? `Shell(${new RegExp(`^${escapeRegExpCharacters(command)}(?: .*)?$`, 's')})`
		: `Shell(${command} *)`;
}

/** Builds an exact shell grant, refusing empty text, wildcards, or unbalanced literal parentheses. */
export function shellExactRule(subCommand: string): string | undefined {
	const command = subCommand.trim();
	if (!command || command.includes('*') || !hasBalancedParentheses(command)) {
		return undefined;
	}
	return command.startsWith('commandLine:') || shellRegexSpecifier.test(command)
		? `Shell(${new RegExp(`^${escapeRegExpCharacters(command)}$`)})`
		: `Shell(${command})`;
}

/** Builds a WebFetch URL-pattern grant; scheme-less patterns default to HTTPS. */
export function webFetchRule(pattern: string): string {
	return `WebFetch(${pattern})`;
}

/** Builds an absolute file or recursive directory grant, refusing glob characters and unbalanced parentheses. */
export function pathRule(tool: 'Read' | 'Edit', absolutePath: string, recursive: boolean): string | undefined {
	const normalized = normalizePath(absolutePath);
	if (!isAbsolutePath(normalized) || /[*?\[\]{}]/.test(absolutePath) || !hasBalancedParentheses(absolutePath)) {
		return undefined;
	}
	const specifier = recursive ? posix.join(normalized, '**') : normalized;
	return `${tool}(${normalized.startsWith('/') ? '/' : '//'}${specifier})`;
}

/** The first opening and final closing parentheses delimit a specifier; nested parentheses remain literal. */
function parsePermissionRule(rule: string): IParsedPermissionRule | undefined {
	const value = rule.trim();
	const opening = value.indexOf('(');
	const tool = opening === -1 ? value : value.slice(0, opening);
	if (!tool || /[\s()]/.test(tool)) {
		return undefined;
	}
	if (opening === -1) {
		return { tool };
	}
	if (!value.endsWith(')')) {
		return undefined;
	}

	const specifier = value.slice(opening + 1, -1);
	const isShellRegex = tool === 'Shell' && (specifier.startsWith('/') || specifier.startsWith('commandLine:/'));
	if (!specifier.trim() || (!isShellRegex && !hasBalancedParentheses(specifier))) {
		return undefined;
	}
	return { tool, specifier: specifier === '*' ? undefined : specifier };
}

function hasBalancedParentheses(value: string): boolean {
	let depth = 0;
	for (const character of value) {
		if (character === '(') {
			depth++;
		} else if (character === ')' && --depth < 0) {
			return false;
		}
	}
	return depth === 0;
}

function matchesWebFetch(specifier: string, url: string | undefined): boolean {
	if (!url) {
		return false;
	}
	try {
		return isUrlApproved(URI.parse(url), { [normalizeWebFetchPattern(specifier)]: true }, true);
	} catch {
		return false;
	}
}

/** Paths are lexically normalized with POSIX separators, without resolving symlinks. */
function matchesPath(specifier: string, path: string | undefined, context: IPermissionRuleContext): boolean {
	if (!path) {
		return false;
	}
	const candidate = normalizePath(path);
	if (!isAbsolutePath(candidate)) {
		return false;
	}

	let pattern = specifier.replace(/\\/g, '/');
	if (pattern.startsWith('//')) {
		pattern = pattern.slice(1);
		if (/^\/[a-z]:\//i.test(pattern)) {
			pattern = pattern.slice(1);
		}
	} else if (pattern.startsWith('~/')) {
		const home = normalizePath(context.homeDirectory);
		if (!isAbsolutePath(home)) {
			return false;
		}
		pattern = posix.join(home, pattern.slice(2));
	} else if (!/^[a-z]:\//i.test(pattern)) {
		const workingDirectory = context.workingDirectory && normalizePath(context.workingDirectory);
		if (!workingDirectory || !isAbsolutePath(workingDirectory)) {
			return false;
		}
		pattern = posix.join(workingDirectory, pattern.startsWith('/') ? pattern.slice(1) : pattern);
	}

	const absolutePattern = normalizePath(pattern);
	const hasGlob = ['*', '?', '[', '{'].some(character => absolutePattern.includes(character));
	return hasGlob ? match(absolutePattern, candidate, { ignoreCase: context.ignorePathCase })
		: context.ignorePathCase ? absolutePattern.toLowerCase() === candidate.toLowerCase() : absolutePattern === candidate;
}

function normalizePath(path: string): string {
	return posix.normalize(path.replace(/\\/g, '/'));
}

function isAbsolutePath(path: string): boolean {
	return path.startsWith('/') || /^[a-z]:\//i.test(path);
}
