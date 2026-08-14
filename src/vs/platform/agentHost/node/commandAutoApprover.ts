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
import { shouldRequireConfirmationForAutoApproveParse } from '../../terminal/common/autoApprove/autoApproveParseSafety.js';
import { gitAutoApproveRules } from '../../terminal/common/autoApprove/gitAutoApproveRules.js';
import { powershellAutoApproveRules } from '../../terminal/common/autoApprove/powershellAutoApproveRules.js';
import { SedFileWriteParser } from '../../terminal/common/autoApprove/sedFileWriteParser.js';
import { sortAutoApproveRules } from '../../terminal/common/autoApprove/sortAutoApproveRules.js';
import type { AgentHostTerminalAutoApproveRuleValue, AgentHostTerminalAutoApproveRules } from '../common/agentHostSchema.js';

/**
 * Redirect destinations that do not result in a write to an arbitrary file
 * on disk: the /dev sinks that discard output (`/dev/null`) or write back to
 * the same terminal (`/dev/stdout`, `/dev/stderr`, `/dev/tty`).
 */
const SAFE_POSIX_REDIRECT_TARGETS: ReadonlySet<string> = new Set([
	'/dev/null',
	'/dev/stdout',
	'/dev/stderr',
	'/dev/tty',
]);

/**
 * Returns true when the given redirection destination is known to be safe:
 * either the shell's null/output sink or a file-descriptor duplication target
 * like `&1` (used in `2>&1`).
 */
function isSafeRedirectDestination(dest: string, isPowerShell?: boolean): boolean {
	let cleaned = dest.trim();
	if (cleaned.length === 0) {
		return false;
	}
	// `$null` discards output in PowerShell like /dev/null; variable names are
	// case-insensitive. Quoted forms are strings rather than the null sink.
	if (isPowerShell && cleaned.toLowerCase() === '$null') {
		return true;
	}
	if ((cleaned.startsWith(`'`) && cleaned.endsWith(`'`)) ||
		(cleaned.startsWith('"') && cleaned.endsWith('"'))) {
		cleaned = cleaned.slice(1, -1);
	}
	// File-descriptor duplication: `&N`, optionally followed by `-` to close.
	if (/^&[0-9]+-?$/.test(cleaned)) {
		return true;
	}
	// PowerShell uses `$null` as its null sink. In particular, `/dev/null`
	// resolves as a filesystem path on Windows.
	return !isPowerShell && SAFE_POSIX_REDIRECT_TARGETS.has(cleaned);
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

function classifyFileRedirect(redirectText: string, isPowerShell?: boolean): FileRedirectClassification {
	if (!redirectText.includes('>')) {
		return { kind: 'read' };
	}
	const destMatch = redirectText.match(/(?:[0-9]+|&|\*)?>>?\|?\s*(.+)$/);
	if (!destMatch) {
		return { kind: 'unsafeWrite', dest: undefined };
	}
	const rawDest = destMatch[1].trim();
	if (isSafeRedirectDestination(rawDest, isPowerShell)) {
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
 * Matches a PowerShell command token of the form `-flag=` or `--flag=` at the
 * start of input or following whitespace. Used to work around a tree-sitter
 * PowerShell grammar limitation where POSIX-style `--flag=value` arguments
 * (e.g. `git log --format="a|b"`) are parsed as assignment expressions and
 * truncate the surrounding command. Mirrors the workbench's
 * `TreeSitterCommandParser` workaround.
 *
 * See https://github.com/microsoft/vscode/issues/294010
 * TODO: Remove once upstream tree-sitter PowerShell grammar is updated.
 */
const pwshFlagEqualsRegex = /(^|\s)(-{1,2}[\w-]+)=/g;

// TODO: Remove once upstream tree-sitter PowerShell grammar is updated.
function maskPwshFlagEquals(commandLine: string): string {
	return commandLine.replace(pwshFlagEqualsRegex, (_, pre, flag) => `${pre}${flag} `);
}

/**
 * Matches PowerShell redirects glued to their target (`2>$null`, `>out.txt`,
 * `*>>log.txt`). The grammar parses these as `generic_token` command arguments
 * rather than `redirection` nodes, which only cover the spaced form.
 */
const pwshNoSpaceRedirectRegex = /^[0-9*]?>>?/;

/**
 * Result of a command auto-approval check.
 * - `approved`: all sub-commands match allow rules and none are denied
 * - `denied`: at least one sub-command matches a deny rule
 * - `noMatch`: no rule matched — requires user confirmation
 */
export type CommandApprovalResult = 'approved' | 'denied' | 'noMatch';

/** Structured outcome of {@link CommandAutoApprover.evaluate}. */
export interface ICommandApprovalEvaluation {
	/** Final approval outcome, identical to {@link CommandAutoApprover.shouldAutoApprove}. */
	readonly result: CommandApprovalResult;
	/** Whether a missing allow rule is the only reason confirmation is required. */
	readonly autoApproveRuleResolvable: boolean;
}

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
	/**
	 * Shell grammar to parse the command line with. PowerShell commands are
	 * parsed with the PowerShell grammar. Sub-command rules are matched
	 * case-insensitively, like PowerShell itself; full-command rules retain
	 * their configured casing. Defaults to `bash`.
	 */
	readonly language?: 'bash' | 'powershell';
}

interface IAutoApproveRule {
	readonly regex: RegExp;
	/** Case-insensitive variant of {@link regex}, used for PowerShell matching. */
	readonly regexCaseInsensitive: RegExp;
}

interface IAutoApproveRules {
	readonly allowRules: IAutoApproveRule[];
	readonly denyRules: IAutoApproveRule[];
	readonly allowCommandLineRules: IAutoApproveRule[];
	readonly denyCommandLineRules: IAutoApproveRule[];
}

const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;
const sedFileWriteParser = new SedFileWriteParser();

interface ITreeSitterResources {
	readonly parserClass: typeof Parser;
	readonly queryClass: typeof Query;
	readonly bashLanguage: PromiseSettledResult<Language>;
	readonly powershellLanguage: PromiseSettledResult<Language>;
}

let treeSitterResourcesPromise: Promise<ITreeSitterResources> | undefined;

function getTreeSitterResources(): Promise<ITreeSitterResources> {
	// Parser.init and Language.load mutate process-global WASM state, so load them once.
	return treeSitterResourcesPromise ??= loadTreeSitterResources();
}

async function loadTreeSitterResources(): Promise<ITreeSitterResources> {
	const { default: TreeSitter } = await import('@vscode/tree-sitter-wasm');
	const moduleRoot = URI.joinPath(FileAccess.asFileUri(getAppNodeModulesPath()), '@vscode', 'tree-sitter-wasm', 'wasm');
	const wasmPath = URI.joinPath(moduleRoot, 'tree-sitter.wasm').fsPath;

	await TreeSitter.Parser.init({
		locateFile() {
			return wasmPath;
		}
	});

	const loadGrammar = async (fileName: string) => {
		const grammarWasm = await fs.promises.readFile(URI.joinPath(moduleRoot, fileName).fsPath);
		return TreeSitter.Language.load(new Uint8Array(grammarWasm.buffer, grammarWasm.byteOffset, grammarWasm.byteLength));
	};
	const [bashLanguage, powershellLanguage] = await Promise.allSettled([
		loadGrammar('tree-sitter-bash.wasm'),
		loadGrammar('tree-sitter-powershell.wasm'),
	]);

	return {
		parserClass: TreeSitter.Parser,
		queryClass: TreeSitter.Query,
		bashLanguage,
		powershellLanguage,
	};
}

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
	private _powershellLanguage: Language | undefined;
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
		return this.evaluate(commandLine, options).result;
	}

	/** Evaluates the command and reports whether adding a persistent allow rule could resolve the result. */
	evaluate(commandLine: string, options?: IShouldAutoApproveOptions): ICommandApprovalEvaluation {
		const trimmed = commandLine.trimStart();
		if (trimmed.length === 0) {
			return { result: 'approved', autoApproveRuleResolvable: false };
		}

		const rules = this._compileRules(options?.autoApproveRules);
		const isPowerShell = options?.language === 'powershell';

		if (this._matchesCommandLineRule(trimmed, rules.denyCommandLineRules)) {
			return { result: 'denied', autoApproveRuleResolvable: false };
		}

		const parsed = this._extractSubCommands(trimmed, isPowerShell);
		if (!parsed) {
			this._logService.trace('[CommandAutoApprover] Command line could not be analyzed, requiring confirmation');
			return { result: 'noMatch', autoApproveRuleResolvable: false };
		}

		const hasUnapprovedRedirect = () => parsed.unsafeWriteDests.some(dest => dest === undefined || !options?.isWriteDestApproved?.(dest));

		let result = this._matchSubCommands(parsed.subCommands, rules, isPowerShell);
		if (result !== 'denied' && this._matchesCommandLineRule(trimmed, rules.allowCommandLineRules)) {
			result = 'approved';
		}
		if (result === 'approved' && hasUnapprovedRedirect()) {
			this._logService.trace('[CommandAutoApprover] Write redirection to non-approved destination, requiring confirmation');
			return { result: 'noMatch', autoApproveRuleResolvable: false };
		}
		return { result, autoApproveRuleResolvable: result === 'noMatch' && !hasUnapprovedRedirect() };
	}

	private _matchSubCommands(subCommands: string[], rules: IAutoApproveRules, isPowerShell: boolean): CommandApprovalResult {
		let allApproved = true;
		for (const subCommand of subCommands) {
			if (sedFileWriteParser.canHandle(subCommand)) {
				return 'denied';
			}
			// Deny transient env var assignments
			if (transientEnvVarRegex.test(subCommand)) {
				return 'denied';
			}

			const result = this._matchSingleCommand(subCommand, rules, isPowerShell);
			if (result === 'denied') {
				return 'denied';
			}
			if (result !== 'approved') {
				allApproved = false;
			}
		}
		return allApproved ? 'approved' : 'noMatch';
	}

	private _matchSingleCommand(command: string, rules: IAutoApproveRules, isPowerShell: boolean): CommandApprovalResult {
		// Check deny rules first
		if (this._matchesRule(command, rules.denyRules, isPowerShell)) {
			return 'denied';
		}

		// Then check allow rules
		if (this._matchesRule(command, rules.allowRules, isPowerShell)) {
			return 'approved';
		}

		return 'noMatch';
	}

	private _matchesCommandLineRule(commandLine: string, rules: readonly IAutoApproveRule[]): boolean {
		return rules.some(rule => rule.regex.test(commandLine));
	}

	private _matchesRule(command: string, rules: readonly IAutoApproveRule[], isPowerShell?: boolean): boolean {
		for (const rule of rules) {
			// PowerShell rule matching is case-insensitive, like the shell itself.
			if ((isPowerShell ? rule.regexCaseInsensitive : rule.regex).test(command)) {
				return true;
			}
			// Ignore a leading ( for PowerShell commands: it's a command pattern
			// operating on the output of a command, e.g. `(Get-Content README.md) ...`.
			if (isPowerShell && command.startsWith('(') && rule.regexCaseInsensitive.test(command.slice(1))) {
				return true;
			}
		}
		return false;
	}

	// ---- Tree-sitter --------------------------------------------------------

	private _extractSubCommands(commandLine: string, isPowerShell: boolean): { subCommands: string[]; unsafeWriteDests: (string | undefined)[] } | undefined {
		const language = isPowerShell ? this._powershellLanguage : this._bashLanguage;
		if (!this._parser || !language || !this._queryClass) {
			return undefined;
		}

		try {
			this._parser.setLanguage(language);
			// The PowerShell grammar truncates commands around `--flag=value`
			// arguments, so they are masked before parsing (positions are
			// preserved) and capture text is sliced from the original.
			const masked = isPowerShell ? maskPwshFlagEquals(commandLine) : commandLine;
			const tree = this._parser.parse(masked);
			if (!tree) {
				return undefined;
			}

			try {
				if (shouldRequireConfirmationForAutoApproveParse(isPowerShell ? 'powershell' : 'bash', tree.rootNode.hasError)) {
					this._logService.trace('[CommandAutoApprover] PowerShell parse contains errors, requiring confirmation');
					return undefined;
				}
				// No-space PowerShell redirects (`2>$null`) parse as generic_token
				// command arguments rather than redirection nodes, so both are
				// captured and filtered by shape below. Assignments and method
				// invocations are captured so the command line can fail closed
				// when it contains code the rules cannot see.
				const query = new this._queryClass(language, isPowerShell
					? '(command) @command (redirection) @redirection (generic_token) @generic_token (assignment_expression) @unanalyzable (invokation_expression) @unanalyzable'
					: '(command) @command (file_redirect) @file_redirect (heredoc_redirect) @heredoc_redirect (herestring_redirect) @herestring_redirect (variable_assignment) @unanalyzable (declaration_command) @unanalyzable');
				const captures: QueryCapture[] = query.captures(tree.rootNode);
				const subCommands: string[] = [];
				const unsafeWriteDests: (string | undefined)[] = [];
				let unanalyzableType: string | undefined;
				for (const capture of captures) {
					const text = masked === commandLine ? capture.node.text : commandLine.substring(capture.node.startIndex, capture.node.endIndex);
					if (capture.name === 'command') {
						subCommands.push(text);
					} else if (capture.name === 'unanalyzable' && (capture.node.type !== 'variable_assignment' || capture.node.parent?.type !== 'command')) {
						unanalyzableType ??= capture.node.type;
					} else if (capture.name === 'file_redirect' || capture.name === 'redirection' || (capture.name === 'generic_token' && pwshNoSpaceRedirectRegex.test(text))) {
						// Writes to known-safe sinks (e.g. `> /dev/null`, `2>$null`)
						// and file-descriptor duplications (e.g. `2>&1`) are allowed.
						const cls = classifyFileRedirect(text, isPowerShell);
						if (cls.kind === 'unsafeWrite') {
							unsafeWriteDests.push(cls.dest);
						}
					} else if (capture.name === 'heredoc_redirect' || capture.name === 'herestring_redirect') {
						// Heredoc/herestring feed data into stdin; they do not write
						// files, so they are not treated as write redirects here.
					}
				}
				query.delete();

				if (unanalyzableType) {
					this._logService.trace(`[CommandAutoApprover] Command line contains an unanalyzable ${unanalyzableType}, requiring confirmation`);
					return undefined;
				}
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
			const resources = await getTreeSitterResources();

			if (this._store.isDisposed) {
				return;
			}

			const parser = new resources.parserClass();
			this._register(toDisposable(() => {
				try {
					parser.delete();
				} catch {
					// WASM memory may already be freed
				}
			}));

			this._parser = parser;
			this._queryClass = resources.queryClass;
			// A grammar that fails to load leaves its language undefined, so
			// commands for that shell fall back to `noMatch` and require
			// confirmation rather than auto-approving.
			if (resources.bashLanguage.status === 'fulfilled') {
				this._bashLanguage = resources.bashLanguage.value;
			} else {
				this._logService.warn('[CommandAutoApprover] Failed to load the bash grammar; bash commands will require confirmation', resources.bashLanguage.reason);
			}
			if (resources.powershellLanguage.status === 'fulfilled') {
				this._powershellLanguage = resources.powershellLanguage.value;
			} else {
				this._logService.warn('[CommandAutoApprover] Failed to load the PowerShell grammar; PowerShell commands will require confirmation', resources.powershellLanguage.reason);
			}
			this._logService.info(`[CommandAutoApprover] Tree-sitter initialized (bash=${this._bashLanguage ? 'available' : 'unavailable'}, powershell=${this._powershellLanguage ? 'available' : 'unavailable'})`);
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
			const rule = {
				regex,
				regexCaseInsensitive: regex.flags.includes('i') ? regex : new RegExp(regex.source, regex.flags + 'i'),
			};
			if (value === true) {
				allowRules.push(rule);
			} else if (value === false) {
				denyRules.push(rule);
			} else if (value && typeof value === 'object' && typeof value.approve === 'boolean') {
				if (value.approve) {
					if (value.matchCommandLine === true) {
						allowCommandLineRules.push(rule);
					} else {
						allowRules.push(rule);
					}
				} else {
					if (value.matchCommandLine === true) {
						denyCommandLineRules.push(rule);
					} else {
						denyRules.push(rule);
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
	...gitAutoApproveRules,

	// Docker readonly sub-commands
	'/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/': true,
	'/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/': true,
	'/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/': true,

	// PowerShell
	...powershellAutoApproveRules,

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
	// TODO: replace sed deny regexes with a shared script analyzer — https://github.com/microsoft/vscode/issues/329218
	sed: true,
	'/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/': false,
	'/^sed\\b.*s\\/.*\\/.*\\/[ew]/': false,
	// Quoted positional script whose first command is e/r/R/w/W. The opening quote is
	// captured so the closing quote must match it, and whitespace and `!` are allowed
	// around the optional address since sed ignores them. The option prefix also skips
	// the separate operand consumed by -l/--line-length.
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+([\'"])\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1)/': false,
	// Same dangerous commands after a `;` or `{` separator inside a quoted script.
	// Escaped characters are consumed before testing for the matching closing quote.
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+([\'"])(?:\\\\.|(?!\\1).)*[;{]\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1|[;}])/': false,
	// Unquoted positional script form (e.g. `sed 1e id`, `sed w file`, `sed /pat/e file`)
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|$)/': false,
	...sortAutoApproveRules,
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
