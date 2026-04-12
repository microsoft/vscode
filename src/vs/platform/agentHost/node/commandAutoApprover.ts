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
import { ILogService } from '../../log/common/log.js';

/** Pattern that detects compound commands (&&, ||, ;, |, backtick, $()) */
const compoundCommandPattern = /&&|\|\||[;|]|`|\$\(/;

/**
 * Result of a command auto-approval check.
 * - `approved`: all sub-commands match allow rules and none are denied
 * - `denied`: at least one sub-command matches a deny rule
 * - `noMatch`: no rule matched — requires user confirmation
 */
export type CommandApprovalResult = 'approved' | 'denied' | 'noMatch';

interface IAutoApproveRule {
	readonly regex: RegExp;
}

const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;

/**
 * Auto-approves or denies shell commands based on default rules.
 *
 * Uses tree-sitter to parse compound commands (`foo && bar`) into
 * sub-commands that are individually checked against allow/deny lists.
 * The default rules mirror the VS Code `chat.tools.terminal.autoApprove`
 * setting defaults.
 *
 * Tree-sitter is initialized eagerly; call {@link initialize} and await the
 * result before using {@link shouldAutoApprove} to guarantee synchronous
 * parsing. If tree-sitter failed to load, compound commands fall back to
 * `noMatch` (user confirmation required).
 */
export class CommandAutoApprover extends Disposable {

	private _allowRules: IAutoApproveRule[] | undefined;
	private _denyRules: IAutoApproveRule[] | undefined;
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
	 */
	shouldAutoApprove(commandLine: string): CommandApprovalResult {
		const trimmed = commandLine.trimStart();
		if (trimmed.length === 0) {
			return 'approved';
		}

		this._ensureRules();

		// Try to extract sub-commands via tree-sitter
		const subCommands = this._extractSubCommands(trimmed);
		if (subCommands && subCommands.length > 0) {
			return this._matchSubCommands(subCommands);
		}

		// Fallback: if this looks like a compound command but tree-sitter
		// failed to parse it, require user confirmation rather than risking
		// auto-approving a dangerous sub-command.
		if (compoundCommandPattern.test(trimmed)) {
			this._logService.trace('[CommandAutoApprover] Compound command without tree-sitter, requiring confirmation');
			return 'noMatch';
		}

		// Simple single command — match against rules
		return this._matchCommandLine(trimmed);
	}

	private _matchSubCommands(subCommands: string[]): CommandApprovalResult {
		let allApproved = true;
		for (const subCommand of subCommands) {
			// Deny transient env var assignments
			if (transientEnvVarRegex.test(subCommand)) {
				return 'denied';
			}

			const result = this._matchSingleCommand(subCommand);
			if (result === 'denied') {
				return 'denied';
			}
			if (result !== 'approved') {
				allApproved = false;
			}
		}
		return allApproved ? 'approved' : 'noMatch';
	}

	private _matchCommandLine(commandLine: string): CommandApprovalResult {
		if (transientEnvVarRegex.test(commandLine)) {
			return 'denied';
		}
		return this._matchSingleCommand(commandLine);
	}

	private _matchSingleCommand(command: string): CommandApprovalResult {
		// Check deny rules first
		for (const rule of this._denyRules!) {
			if (rule.regex.test(command)) {
				return 'denied';
			}
		}

		// Then check allow rules
		for (const rule of this._allowRules!) {
			if (rule.regex.test(command)) {
				return 'approved';
			}
		}

		return 'noMatch';
	}

	// ---- Tree-sitter --------------------------------------------------------

	private _extractSubCommands(commandLine: string): string[] | undefined {
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
				const query = new this._queryClass(this._bashLanguage, '(command) @command');
				const captures: QueryCapture[] = query.captures(tree.rootNode);
				const subCommands = captures.map(c => c.node.text);
				query.delete();
				return subCommands.length > 0 ? subCommands : undefined;
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

			// Resolve WASM files from node_modules
			const moduleRoot = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm');
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

	private _ensureRules(): void {
		if (this._allowRules && this._denyRules) {
			return;
		}

		const allowRules: IAutoApproveRule[] = [];
		const denyRules: IAutoApproveRule[] = [];

		for (const [key, value] of Object.entries(DEFAULT_TERMINAL_AUTO_APPROVE_RULES)) {
			const regex = convertAutoApproveEntryToRegex(key);
			if (value === true) {
				allowRules.push({ regex });
			} else if (value === false) {
				denyRules.push({ regex });
			}
		}

		this._allowRules = allowRules;
		this._denyRules = denyRules;
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
// These mirror the VS Code `chat.tools.terminal.autoApprove` setting defaults.
// Kept in sync manually — the actual setting will be wired up later.

const DEFAULT_TERMINAL_AUTO_APPROVE_RULES: Readonly<Record<string, boolean>> = {
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
