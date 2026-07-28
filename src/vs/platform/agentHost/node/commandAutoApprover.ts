/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Language, Parser, Query, QueryCapture } from '@vscode/tree-sitter-wasm';
import * as fs from 'fs';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { getAppNodeModulesPath } from './appNodeModules.js';
import { ILogService } from '../../log/common/log.js';
import type { AgentHostTerminalAutoApproveRuleValue, AgentHostTerminalAutoApproveRules } from '../common/agentHostSchema.js';

/**
 * Redirect destinations that do not result in a write to an arbitrary file
 * on disk: the /dev sinks that discard output (`/dev/null`) or write back to
 * the same terminal (`/dev/stdout`, `/dev/stderr`, `/dev/tty`).
 */
const SAFE_REDIRECT_TARGETS: ReadonlySet<string> = new Set([
	'/dev/null',
	'/dev/stdout',
	'/dev/stderr',
	'/dev/tty',
]);

/**
 * Returns true when the given redirection destination is known to be safe:
 * either a known-safe /dev sink or a file-descriptor duplication target
 * like `&1` (used in `2>&1`).
 */
function isSafeRedirectDestination(dest: string): boolean {
	let cleaned = dest.trim();
	if (cleaned.length === 0) {
		return false;
	}
	if ((cleaned.startsWith(`'`) && cleaned.endsWith(`'`)) ||
		(cleaned.startsWith('"') && cleaned.endsWith('"'))) {
		cleaned = cleaned.slice(1, -1);
	}
	// File-descriptor duplication: `&N`, optionally followed by `-` to close.
	if (/^&[0-9]+-?$/.test(cleaned)) {
		return true;
	}
	return SAFE_REDIRECT_TARGETS.has(cleaned);
}

/**
 * Classification of a tree-sitter `file_redirect` node.
 * - `read`: input-only redirect (`<`, `<&N`) — never writes.
 * - `safeWrite`: write to a known-safe sink (`/dev/null`, fd duplication, ...).
 * - `unsafeWrite`: write to an arbitrary destination. The destination string
 *   (with surrounding quotes stripped) is included when it could be parsed,
 *   so the caller may decide whether the target is acceptable.
 */
type FileRedirectClassification =
	| { kind: 'read' }
	| { kind: 'safeWrite' }
	| { kind: 'unsafeWrite'; dest: string | undefined };

function classifyFileRedirect(redirectText: string): FileRedirectClassification {
	if (!redirectText.includes('>')) {
		return { kind: 'read' };
	}
	const destMatch = redirectText.match(/(?:[0-9]+|&)?>>?\|?\s*(.+)$/);
	if (!destMatch) {
		return { kind: 'unsafeWrite', dest: undefined };
	}
	const rawDest = destMatch[1].trim();
	if (isSafeRedirectDestination(rawDest)) {
		return { kind: 'safeWrite' };
	}
	let dest = rawDest;
	if ((dest.startsWith(`'`) && dest.endsWith(`'`)) ||
		(dest.startsWith('"') && dest.endsWith('"'))) {
		dest = dest.slice(1, -1);
	}
	return { kind: 'unsafeWrite', dest };
}

/**
 * Result of a command auto-approval check.
 * - `approved`: all sub-commands match allow rules and none are denied
 * - `denied`: at least one sub-command matches a deny rule
 * - `noMatch`: no rule matched — requires user confirmation
 */
export type CommandApprovalResult = 'approved' | 'denied' | 'noMatch';

/** Options for {@link CommandAutoApprover.shouldAutoApprove}. */
export interface IShouldAutoApproveOptions {
	/**
	 * Predicate that decides whether a write redirection to the given
	 * destination is acceptable. Called once per write-redirect destination
	 * found in the command line; the destination is the raw string the user
	 * typed (with surrounding quotes stripped). The predicate is responsible
	 * for resolving relative paths and applying its own policy.
	 *
	 * When omitted, any write redirect to a destination outside the known-safe
	 * sinks (e.g. `/dev/null`) downgrades the result to `noMatch`.
	 */
	readonly isWriteDestApproved?: (dest: string) => boolean;
	/**
	 * Effective VS Code `chat.tools.terminal.autoApprove` rules forwarded from
	 * the renderer. When omitted, the agent host falls back to its bundled
	 * default rules for compatibility with older clients.
	 */
	readonly autoApproveRules?: AgentHostTerminalAutoApproveRules;
}

interface IAutoApproveRule {
	readonly regex: RegExp;
}

interface IAutoApproveRules {
	readonly allowRules: IAutoApproveRule[];
	readonly denyRules: IAutoApproveRule[];
	readonly allowCommandLineRules: IAutoApproveRule[];
	readonly denyCommandLineRules: IAutoApproveRule[];
}

const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;

/**
 * Auto-approves or denies shell commands based on terminal auto-approve rules.
 *
 * Uses tree-sitter to parse compound commands (`foo && bar`) into
 * sub-commands that are individually checked against allow/deny lists.
 * The rules are normally forwarded from VS Code's
 * `chat.tools.terminal.autoApprove` setting. A bundled default table is kept
 * as a compatibility fallback for clients that have not forwarded rules yet.
 *
 * Tree-sitter is initialized eagerly; call {@link initialize} and await the
 * result before using {@link shouldAutoApprove} to guarantee synchronous
 * parsing. If tree-sitter fails to load or parse the command,
 * {@link shouldAutoApprove} returns `noMatch` so the user is prompted for
 * confirmation rather than auto-approving based on the command name alone.
 */
export class CommandAutoApprover extends Disposable {

	private _fallbackRules: IAutoApproveRules | undefined;
	private _cachedRuleConfig: AgentHostTerminalAutoApproveRules | undefined;
	private _cachedRules: IAutoApproveRules | undefined;
	private _parser: Parser | undefined;
	private _bashLanguage: Language | undefined;
	private _queryClass: typeof Query | undefined;
	private readonly _initPromise: Promise<void>;

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._initPromise = this._initTreeSitter();
	}

	/**
	 * Returns a promise that resolves once tree-sitter WASM has been loaded.
	 * Await this before processing any events to guarantee that
	 * {@link shouldAutoApprove} can parse commands synchronously.
	 */
	initialize(): Promise<void> {
		return this._initPromise;
	}

	/**
	 * Synchronously check whether the given command line should be auto-approved.
	 * Uses tree-sitter (if loaded) to parse compound commands into sub-commands.
	 *
	 * When the command contains write redirections, `options.isWriteDestApproved`
	 * is consulted for each destination. If every destination is approved by the
	 * predicate, write redirections do not block auto-approval.
	 */
	shouldAutoApprove(commandLine: string, options?: IShouldAutoApproveOptions): CommandApprovalResult {
		const trimmed = commandLine.trimStart();
		if (trimmed.length === 0) {
			return 'approved';
		}

		const rules = this._compileRules(options?.autoApproveRules);

		const parsed = this._extractSubCommands(trimmed);
		if (!parsed) {
			this._logService.trace('[CommandAutoApprover] Tree-sitter unavailable, requiring confirmation');
			return 'noMatch';
		}

		if (this._matchesRule(trimmed, rules.denyCommandLineRules)) {
			return 'denied';
		}

		let result = this._matchSubCommands(parsed.subCommands, rules);
		if (result !== 'denied' && this._matchesRule(trimmed, rules.allowCommandLineRules)) {
			result = 'approved';
		}
		if (result === 'approved' && parsed.unsafeWriteDests.length > 0) {
			for (const dest of parsed.unsafeWriteDests) {
				if (dest === undefined || !options?.isWriteDestApproved?.(dest)) {
					this._logService.trace('[CommandAutoApprover] Write redirection to non-approved destination, requiring confirmation');
					return 'noMatch';
				}
			}
		}
		return result;
	}

	private _matchSubCommands(subCommands: string[], rules: IAutoApproveRules): CommandApprovalResult {
		let allApproved = true;
		for (const subCommand of subCommands) {
			// Deny transient env var assignments
			if (transientEnvVarRegex.test(subCommand)) {
				return 'denied';
			}

			const result = this._matchSingleCommand(subCommand, rules);
			if (result === 'denied') {
				return 'denied';
			}
			if (result !== 'approved') {
				allApproved = false;
			}
		}
		return allApproved ? 'approved' : 'noMatch';
	}

	private _matchSingleCommand(command: string, rules: IAutoApproveRules): CommandApprovalResult {
		// Check deny rules first
		if (this._matchesRule(command, rules.denyRules)) {
			return 'denied';
		}

		// Then check allow rules
		if (this._matchesRule(command, rules.allowRules)) {
			return 'approved';
		}

		return 'noMatch';
	}

	private _matchesRule(command: string, rules: readonly IAutoApproveRule[]): boolean {
		for (const rule of rules) {
			if (rule.regex.test(command)) {
				return true;
			}
		}
		return false;
	}

	// ---- Tree-sitter --------------------------------------------------------

	private _extractSubCommands(commandLine: string): { subCommands: string[]; unsafeWriteDests: (string | undefined)[] } | undefined {
		if (!this._parser || !this._bashLanguage || !this._queryClass) {
			return undefined;
		}

		try {
			this._parser.setLanguage(this._bashLanguage);
			const tree = this._parser.parse(commandLine);
			if (!tree) {
				return undefined;
			}

			try {
				const query = new this._queryClass(this._bashLanguage, '(command) @command (file_redirect) @file_redirect (heredoc_redirect) @heredoc_redirect (herestring_redirect) @herestring_redirect');
				const captures: QueryCapture[] = query.captures(tree.rootNode);
				const subCommands: string[] = [];
				const unsafeWriteDests: (string | undefined)[] = [];
				for (const capture of captures) {
					if (capture.name === 'command') {
						subCommands.push(capture.node.text);
					} else if (capture.name === 'file_redirect') {
						// Writes to known-safe sinks (e.g. `> /dev/null`) and
						// file-descriptor duplications (e.g. `2>&1`) are allowed.
						const cls = classifyFileRedirect(capture.node.text);
						if (cls.kind === 'unsafeWrite') {
							unsafeWriteDests.push(cls.dest);
						}
					} else if (capture.name === 'heredoc_redirect' || capture.name === 'herestring_redirect') {
						// Heredoc/herestring feed data into stdin; they do not write
						// files, so they are not treated as write redirects here.
					}
				}
				query.delete();
				return subCommands.length > 0 || unsafeWriteDests.length > 0 ? { subCommands, unsafeWriteDests } : undefined;
			} finally {
				tree.delete();
			}
		} catch (err) {
			this._logService.warn('[CommandAutoApprover] Tree-sitter parsing failed', err);
			return undefined;
		}
	}

	private async _initTreeSitter(): Promise<void> {
		try {
			const { default: TreeSitter } = (await import('@vscode/tree-sitter-wasm'));

			if (this._store.isDisposed) {
				return;
			}

			// Resolve WASM files from node_modules. In the desktop app the `.wasm`
			// files are unpacked next to the ASAR archive (`node_modules.asar.unpacked`),
			// while in dev and on the server (which has no ASAR) they live in a plain
			// `node_modules`.
			const moduleRoot = URI.joinPath(FileAccess.asFileUri(getAppNodeModulesPath()), '@vscode', 'tree-sitter-wasm', 'wasm');
			const wasmPath = URI.joinPath(moduleRoot, 'tree-sitter.wasm').fsPath;

			await TreeSitter.Parser.init({
				locateFile() {
					return wasmPath;
				}
			});

			if (this._store.isDisposed) {
				return;
			}

			const parser = new TreeSitter.Parser();
			this._register(toDisposable(() => {
				try {
					parser.delete();
				} catch {
					// WASM memory may already be freed
				}
			}));

			// Load bash grammar
			const bashWasmPath = URI.joinPath(moduleRoot, 'tree-sitter-bash.wasm').fsPath;
			const bashWasm = await fs.promises.readFile(bashWasmPath);

			if (this._store.isDisposed) {
				return;
			}

			const bashLanguage = await TreeSitter.Language.load(new Uint8Array(bashWasm.buffer, bashWasm.byteOffset, bashWasm.byteLength));

			if (this._store.isDisposed) {
				return;
			}

			this._parser = parser;
			this._bashLanguage = bashLanguage;
			this._queryClass = TreeSitter.Query;
			this._logService.info('[CommandAutoApprover] Tree-sitter initialized successfully');
		} catch (err) {
			this._logService.warn('[CommandAutoApprover] Failed to initialize tree-sitter', err);
		}
	}

	// ---- Rules --------------------------------------------------------------

	private _compileRules(ruleConfig: AgentHostTerminalAutoApproveRules | undefined): IAutoApproveRules {
		if (!ruleConfig) {
			if (!this._fallbackRules) {
				this._fallbackRules = this._compileRuleEntries(DEFAULT_TERMINAL_AUTO_APPROVE_RULES);
			}
			return this._fallbackRules;
		}

		if (this._cachedRuleConfig === ruleConfig && this._cachedRules) {
			return this._cachedRules;
		}

		this._cachedRuleConfig = ruleConfig;
		this._cachedRules = this._compileRuleEntries(ruleConfig);
		return this._cachedRules;
	}

	private _compileRuleEntries(ruleConfig: Readonly<Record<string, AgentHostTerminalAutoApproveRuleValue>>): IAutoApproveRules {
		const allowRules: IAutoApproveRule[] = [];
		const denyRules: IAutoApproveRule[] = [];
		const allowCommandLineRules: IAutoApproveRule[] = [];
		const denyCommandLineRules: IAutoApproveRule[] = [];

		for (const [key, value] of Object.entries(ruleConfig)) {
			const regex = convertAutoApproveEntryToRegex(key);
			if (value === true) {
				allowRules.push({ regex });
			} else if (value === false) {
				denyRules.push({ regex });
			} else if (value && typeof value === 'object' && typeof value.approve === 'boolean') {
				if (value.approve) {
					if (value.matchCommandLine === true) {
						allowCommandLineRules.push({ regex });
					} else {
						allowRules.push({ regex });
					}
				} else {
					if (value.matchCommandLine === true) {
						denyCommandLineRules.push({ regex });
					} else {
						denyRules.push({ regex });
					}
				}
			}
		}

		return { allowRules, denyRules, allowCommandLineRules, denyCommandLineRules };
	}
}

// ---- Regex conversion -------------------------------------------------------

function convertAutoApproveEntryToRegex(value: string): RegExp {
	// If wrapped in `/`, treat as regex
	const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
	const regexPattern = regexMatch?.groups?.pattern;
	if (regexPattern) {
		let flags = regexMatch.groups?.flags;
		if (flags) {
			flags = flags.replaceAll('g', '');
		}

		if (regexPattern === '.*') {
			return new RegExp(regexPattern);
		}

		try {
			const regex = new RegExp(regexPattern, flags || undefined);
			if (regExpLeadsToEndlessLoop(regex)) {
				return neverMatchRegex;
			}
			return regex;
		} catch {
			return neverMatchRegex;
		}
	}

	if (value === '') {
		return neverMatchRegex;
	}

	let sanitizedValue: string;

	// Match both path separators if it looks like a path
	if (value.includes('/') || value.includes('\\')) {
		let pattern = value.replace(/[/\\]/g, '%%PATH_SEP%%');
		pattern = escapeRegExpCharacters(pattern);
		pattern = pattern.replace(/%%PATH_SEP%%*/g, '[/\\\\]');
		sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
	} else {
		sanitizedValue = escapeRegExpCharacters(value);
	}

	return new RegExp(`^${sanitizedValue}\\b`);
}

// ---- Default rules ----------------------------------------------------------
//
// Compatibility fallback for clients that do not forward the VS Code
// `chat.tools.terminal.autoApprove` setting.
// TODO: Remove this fallback once all agent-host clients are guaranteed to
// forward `chat.tools.terminal.autoApprove` before shell approvals run.

const DEFAULT_TERMINAL_AUTO_APPROVE_RULES: Readonly<Record<string, AgentHostTerminalAutoApproveRuleValue>> = {
	// Safe readonly commands
	cd: true,
	echo: true,
	ls: true,
	dir: true,
	pwd: true,
	cat: true,
	head: true,
	tail: true,
	findstr: true,
	wc: true,
	tr: true,
	cut: true,
	cmp: true,
	which: true,
	basename: true,
	dirname: true,
	realpath: true,
	readlink: true,
	stat: true,
	file: true,
	od: true,
	du: true,
	df: true,
	sleep: true,
	nl: true,

	grep: true,

	// Safe git sub-commands
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/': false,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/': false,

	// Docker readonly sub-commands
	'/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/': true,
	'/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/': true,
	'/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/': true,

	// PowerShell
	'Get-ChildItem': true,
	'Get-Content': true,
	'Get-Date': true,
	'Get-Random': true,
	'Get-Location': true,
	'Set-Location': true,
	'Write-Host': true,
	'Write-Output': true,
	'Out-String': true,
	'Split-Path': true,
	'Join-Path': true,
	'Start-Sleep': true,
	'Where-Object': true,
	'/^Select-[a-z0-9]/i': true,
	'/^Measure-[a-z0-9]/i': true,
	'/^Compare-[a-z0-9]/i': true,
	'/^Format-[a-z0-9]/i': true,
	'/^Sort-[a-z0-9]/i': true,

	// Package manager read-only commands
	'/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/': true,
	'/^npm\\s+config\\s+(list|get)\\b/': true,
	'/^npm\\s+pkg\\s+get\\b/': true,
	'/^npm\\s+audit$/': true,
	'/^npm\\s+cache\\s+verify\\b/': true,
	'/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/': true,
	'/^yarn\\s+licenses\\b/': true,
	'/^yarn\\s+audit\\b(?!.*\\bfix\\b)/': true,
	'/^yarn\\s+config\\s+(list|get)\\b/': true,
	'/^yarn\\s+cache\\s+dir\\b/': true,
	'/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/': true,
	'/^pnpm\\s+licenses\\b/': true,
	'/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/': true,
	'/^pnpm\\s+config\\s+(list|get)\\b/': true,

	// Safe lockfile-only installs
	'npm ci': true,
	'/^yarn\\s+install\\s+--frozen-lockfile\\b/': true,
	'/^pnpm\\s+install\\s+--frozen-lockfile\\b/': true,

	// Safe commands with dangerous arg blocking
	column: true,
	'/^column\\b.*\\s-c\\s+[0-9]{4,}/': false,
	date: true,
	'/^date\\b.*\\s(-s|--set)\\b/': false,
	find: true,
	'/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/': false,
	rg: true,
	'/^rg\\b.*\\s(--pre|--hostname-bin)\\b/': false,
	sed: true,
	'/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/': false,
	'/^sed\\b.*s\\/.*\\/.*\\/[ew]/': false,
	'/^sed\\b.*;W/': false,
	sort: true,
	'/^sort\\b.*\\s-(o|S)\\b/': false,
	tree: true,
	'/^tree\\b.*\\s-o\\b/': false,
	'/^xxd$/': true,
	'/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/': true,

	// Dangerous commands
	rm: false,
	rmdir: false,
	del: false,
	'Remove-Item': false,
	ri: false,
	rd: false,
	erase: false,
	dd: false,
	kill: false,
	ps: false,
	top: false,
	'Stop-Process': false,
	spps: false,
	taskkill: false,
	'taskkill.exe': false,
	curl: false,
	wget: false,
	'Invoke-RestMethod': false,
	'Invoke-WebRequest': false,
	irm: false,
	iwr: false,
	chmod: false,
	chown: false,
	'Set-ItemProperty': false,
	sp: false,
	'Set-Acl': false,
	jq: false,
	xargs: false,
	eval: false,
	'Invoke-Expression': false,
	iex: false,
};
