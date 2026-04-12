/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
/** Pattern that detects compound commands (&&, ||, ;, |, backtick, $()) */
const compoundCommandPattern = /&&|\|\||[;|]|`|\$\(/;
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
    constructor(_logService) {
        super();
        this._logService = _logService;
        this._initPromise = this._initTreeSitter();
    }
    /**
     * Returns a promise that resolves once tree-sitter WASM has been loaded.
     * Await this before processing any events to guarantee that
     * {@link shouldAutoApprove} can parse commands synchronously.
     */
    initialize() {
        return this._initPromise;
    }
    /**
     * Synchronously check whether the given command line should be auto-approved.
     * Uses tree-sitter (if loaded) to parse compound commands into sub-commands.
     */
    shouldAutoApprove(commandLine) {
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
    _matchSubCommands(subCommands) {
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
    _matchCommandLine(commandLine) {
        if (transientEnvVarRegex.test(commandLine)) {
            return 'denied';
        }
        return this._matchSingleCommand(commandLine);
    }
    _matchSingleCommand(command) {
        // Check deny rules first
        for (const rule of this._denyRules) {
            if (rule.regex.test(command)) {
                return 'denied';
            }
        }
        // Then check allow rules
        for (const rule of this._allowRules) {
            if (rule.regex.test(command)) {
                return 'approved';
            }
        }
        return 'noMatch';
    }
    // ---- Tree-sitter --------------------------------------------------------
    _extractSubCommands(commandLine) {
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
                const captures = query.captures(tree.rootNode);
                const subCommands = captures.map(c => c.node.text);
                query.delete();
                return subCommands.length > 0 ? subCommands : undefined;
            }
            finally {
                tree.delete();
            }
        }
        catch (err) {
            this._logService.warn('[CommandAutoApprover] Tree-sitter parsing failed', err);
            return undefined;
        }
    }
    async _initTreeSitter() {
        try {
            const TreeSitter = await import('@vscode/tree-sitter-wasm');
            // Resolve WASM files from node_modules
            const moduleRoot = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm');
            const wasmPath = URI.joinPath(moduleRoot, 'tree-sitter.wasm').fsPath;
            await TreeSitter.Parser.init({
                locateFile() {
                    return wasmPath;
                }
            });
            const parser = new TreeSitter.Parser();
            this._register(toDisposable(() => parser.delete()));
            // Load bash grammar
            const bashWasmPath = URI.joinPath(moduleRoot, 'tree-sitter-bash.wasm').fsPath;
            const bashWasm = await fs.promises.readFile(bashWasmPath);
            const bashLanguage = await TreeSitter.Language.load(new Uint8Array(bashWasm.buffer, bashWasm.byteOffset, bashWasm.byteLength));
            this._parser = parser;
            this._bashLanguage = bashLanguage;
            this._queryClass = TreeSitter.Query;
            this._logService.info('[CommandAutoApprover] Tree-sitter initialized successfully');
        }
        catch (err) {
            this._logService.warn('[CommandAutoApprover] Failed to initialize tree-sitter', err);
        }
    }
    // ---- Rules --------------------------------------------------------------
    _ensureRules() {
        if (this._allowRules && this._denyRules) {
            return;
        }
        const allowRules = [];
        const denyRules = [];
        for (const [key, value] of Object.entries(DEFAULT_TERMINAL_AUTO_APPROVE_RULES)) {
            const regex = convertAutoApproveEntryToRegex(key);
            if (value === true) {
                allowRules.push({ regex });
            }
            else if (value === false) {
                denyRules.push({ regex });
            }
        }
        this._allowRules = allowRules;
        this._denyRules = denyRules;
    }
}
// ---- Regex conversion -------------------------------------------------------
function convertAutoApproveEntryToRegex(value) {
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
        }
        catch {
            return neverMatchRegex;
        }
    }
    if (value === '') {
        return neverMatchRegex;
    }
    let sanitizedValue;
    // Match both path separators if it looks like a path
    if (value.includes('/') || value.includes('\\')) {
        let pattern = value.replace(/[/\\]/g, '%%PATH_SEP%%');
        pattern = escapeRegExpCharacters(pattern);
        pattern = pattern.replace(/%%PATH_SEP%%*/g, '[/\\\\]');
        sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
    }
    else {
        sanitizedValue = escapeRegExpCharacters(value);
    }
    return new RegExp(`^${sanitizedValue}\\b`);
}
// ---- Default rules ----------------------------------------------------------
//
// These mirror the VS Code `chat.tools.terminal.autoApprove` setting defaults.
// Kept in sync manually — the actual setting will be wired up later.
const DEFAULT_TERMINAL_AUTO_APPROVE_RULES = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZEF1dG9BcHByb3Zlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvbW1hbmRBdXRvQXBwcm92ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR2xELDJFQUEyRTtBQUMzRSxNQUFNLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO0FBY3JELE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQztBQUNqQyxNQUFNLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDO0FBRW5EOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxVQUFVO0lBU2xELFlBQ2tCLFdBQXdCO1FBRXpDLEtBQUssRUFBRSxDQUFDO1FBRlMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFHekMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxVQUFVO1FBQ1QsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzFCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxpQkFBaUIsQ0FBQyxXQUFtQjtRQUNwQyxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDeEMsSUFBSSxPQUFPLENBQUMsTUFBTSxL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