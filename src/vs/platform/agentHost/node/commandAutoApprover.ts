/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Language, Parser, Query, QueryCapture } from '@vscode/tree-sitter-wasm';
import * as fs from 'fs';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { getAppNodeModulesUri } from './appNodeModules.js';
import { ILogService } from '../../log/common/log.js';
import { convertAutoApproveEntryToRegex } from '../../terminal/common/autoApprove/autoApproveEntryToRegex.js';
import { shouldRequireConfirmationForAutoApproveParse } from '../../terminal/common/autoApprove/autoApproveParseSafety.js';
import { defaultTerminalAutoApproveRules } from '../../terminal/common/autoApprove/defaultAutoApproveRules.js';
import { SedFileWriteParser } from '../../terminal/common/autoApprove/sedFileWriteParser.js';

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
	const isQuoted = (cleaned.startsWith(`'`) && cleaned.endsWith(`'`)) ||
		(cleaned.startsWith('"') && cleaned.endsWith('"'));
	if (isQuoted) {
		cleaned = cleaned.slice(1, -1);
	}
	// File-descriptor duplication: `&N`, optionally followed by `-` to close.
	if (!isQuoted && /^&[0-9]+-?$/.test(cleaned)) {
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
	let rawDest = destMatch[1].trim();
	// `>& word` sends stdout and stderr to `word` unless it names a file descriptor.
	const combinedRedirect = /^&(?![0-9]+-?$|-$)\s*(.+)$/.exec(rawDest);
	if (combinedRedirect) {
		rawDest = combinedRedirect[1];
	}
	if (isSafeRedirectDestination(rawDest, isPowerShell)) {
		return { kind: 'safeWrite' };
	}
	const fullyQuoted = /^'[^']*'$/.test(rawDest) || /^"(?:[^"\\]|\\.)*"$/.test(rawDest);
	if (/[*?\[]/.test(rawDest) && (isPowerShell || !fullyQuoted)) {
		return { kind: 'unsafeWrite', dest: undefined };
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
 * - `approved`: explicit permissions or implicit defaults approve every sub-command
 * - `denied`: an implicit false rule or safety guard requires confirmation, not outright rejection
 * - `noMatch`: an ask rule, missing allow, redirect, or parse failure requires confirmation
 */
export type CommandApprovalResult = 'approved' | 'denied' | 'noMatch';

/** Structured outcome of {@link CommandAutoApprover.evaluate}. */
export interface ICommandApprovalEvaluation {
	/** Final approval outcome, identical to {@link CommandAutoApprover.shouldAutoApprove}. */
	readonly result: CommandApprovalResult;
	/** Whether an explicit ask rule prevents persistent allow grants from resolving the confirmation. */
	readonly hasAskRule?: boolean;
	/** Whether a safety guard blocks approval independently of configured rules. */
	readonly hasUnsafeSubCommand?: boolean;
	/** Parsed sub-commands, or undefined when the command could not be analyzed. */
	readonly subCommands?: readonly string[];
	/** Parsed sub-commands that neither explicit permissions nor implicit defaults approved. */
	readonly unapprovedSubCommands?: readonly string[];
}

/** Options for {@link CommandAutoApprover.shouldAutoApprove}. */
export interface IShouldAutoApproveOptions {
	/** Explicit permission decision, taking precedence over implicit defaults for this sub-command. */
	readonly classify?: (subCommand: string) => 'allow' | 'ask' | undefined;
	/** Explicit full-command decision; an allow covers the whole line unless another rule asks. */
	readonly classifyCommandLine?: (commandLine: string) => 'allow' | 'ask' | undefined;
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
	/** Implicit terminal rules; omitted uses shared defaults and an empty object disables them. */
	readonly defaultRules?: typeof defaultTerminalAutoApproveRules;
	/**
	 * Shell grammar to parse the command line with. PowerShell commands are
	 * parsed with the PowerShell grammar. Sub-command rules are matched
	 * case-insensitively, like PowerShell itself. Defaults to `bash`.
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
	const moduleRoot = URI.joinPath(getAppNodeModulesUri(), '@vscode', 'tree-sitter-wasm', 'wasm');
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
 * Parses shell commands with tree-sitter and applies explicit allow/ask decisions before shared implicit defaults.
 * Parse failures and unsafe writes always require confirmation; await {@link initialize} before synchronous evaluation.
 */
export class CommandAutoApprover extends Disposable {

	private _cachedRuleConfig: typeof defaultTerminalAutoApproveRules | undefined;
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

	/** Evaluates explicit permissions and implicit defaults while retaining parsed commands for scoped grants. */
	evaluate(commandLine: string, options?: IShouldAutoApproveOptions): ICommandApprovalEvaluation {
		const trimmed = commandLine.trim();
		if (trimmed.length === 0) {
			return { result: 'approved' };
		}

		const rules = this._compileRules(options?.defaultRules ?? defaultTerminalAutoApproveRules);
		const isPowerShell = options?.language === 'powershell';
		const commandLineDecision = options?.classifyCommandLine?.(trimmed);
		const defaultCommandLineDenied = rules.denyCommandLineRules.some(rule => rule.regex.test(trimmed));
		const defaultCommandLineAllowed = rules.allowCommandLineRules.some(rule => rule.regex.test(trimmed));
		const parsed = this._extractSubCommands(trimmed, isPowerShell);
		if (!parsed) {
			this._logService.trace('[CommandAutoApprover] Command line could not be analyzed, requiring confirmation');
			return { result: !commandLineDecision && defaultCommandLineDenied ? 'denied' : 'noMatch' };
		}

		const unapprovedSubCommands: string[] = [];
		let denied = false;
		let hasUnsafeSubCommand = false;
		let hasAskRule = commandLineDecision === 'ask';
		for (const subCommand of parsed.subCommands) {
			const decision = options?.classify?.(subCommand);
			hasAskRule ||= decision === 'ask';
			let result: CommandApprovalResult;
			if (sedFileWriteParser.canHandle(subCommand) || transientEnvVarRegex.test(subCommand)) {
				hasUnsafeSubCommand = true;
				result = 'denied';
			} else if (decision === 'ask' || commandLineDecision === 'ask') {
				result = 'noMatch';
			} else if (decision === 'allow' || commandLineDecision === 'allow') {
				result = 'approved';
			} else {
				result = defaultCommandLineDenied ? 'denied' : this._matchSingleCommand(subCommand, rules, isPowerShell);
				if (result !== 'denied' && defaultCommandLineAllowed) {
					result = 'approved';
				}
			}
			denied ||= result === 'denied';
			if (result !== 'approved') {
				unapprovedSubCommands.push(subCommand);
			}
		}
		let result: CommandApprovalResult = denied ? 'denied' : hasAskRule || unapprovedSubCommands.length ? 'noMatch' : 'approved';
		if (result === 'approved' && parsed.unsafeWriteDests.some(dest => dest === undefined || !options?.isWriteDestApproved?.(dest))) {
			this._logService.trace('[CommandAutoApprover] Write redirection to non-approved destination, requiring confirmation');
			result = 'noMatch';
		}
		return {
			result,
			...(hasAskRule ? { hasAskRule: true } : {}),
			...(hasUnsafeSubCommand ? { hasUnsafeSubCommand: true } : {}),
			subCommands: parsed.subCommands,
			unapprovedSubCommands,
		};
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

	private _compileRules(ruleConfig: typeof defaultTerminalAutoApproveRules): IAutoApproveRules {
		if (this._cachedRuleConfig === ruleConfig && this._cachedRules) {
			return this._cachedRules;
		}
		this._cachedRuleConfig = ruleConfig;
		this._cachedRules = this._compileRuleEntries(ruleConfig);
		return this._cachedRules;
	}

	private _compileRuleEntries(ruleConfig: typeof defaultTerminalAutoApproveRules): IAutoApproveRules {
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
