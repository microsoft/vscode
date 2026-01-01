/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { visit, type JSONVisitor } from '../../../../../../../base/common/json.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { extUri } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import type { TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../../nls.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';

/**
 * Regex patterns to match npm/yarn/pnpm run commands and extract the script name.
 * Uses named capture groups: 'command' for the package manager, 'scriptName' for the script.
 */
const npmRunPatterns = [
	// npm run <script>
	// npm run-script <script>
	/^(?<command>npm)\s+(?:run(?:-script)?)\s+(?<scriptName>[^\s&|;]+)/i,
	// yarn <script>
	// yarn run <script>
	/^(?<command>yarn)\s+(?:run\s+)?(?<scriptName>[^\s&|;]+)/i,
	// pnpm <script>
	// pnpm run <script>
	/^(?<command>pnpm)\s+(?:run\s+)?(?<scriptName>[^\s&|;]+)/i,
];

/**
 * Yarn built-in commands that should not be treated as script names.
 * Note: 'test' is omitted since it's commonly a user script, and 'yarn test'
 * is often used to run the 'test' script from package.json.
 */
const yarnBuiltinCommands = new Set([
	'add', 'audit', 'autoclean', 'bin', 'cache', 'check', 'config',
	'create', 'dedupe', 'dlx', 'exec', 'explain', 'generate-lock-entry',
	'global', 'help', 'import', 'info', 'init', 'install', 'licenses',
	'link', 'list', 'login', 'logout', 'node', 'outdated', 'owner',
	'pack', 'patch', 'patch-commit', 'plugin', 'policies', 'publish',
	'rebuild', 'remove', 'run', 'search', 'set', 'stage', 'tag', 'team',
	'unlink', 'unplug', 'up', 'upgrade', 'upgrade-interactive',
	'version', 'versions', 'why', 'workspace', 'workspaces',
]);

/**
 * pnpm built-in commands that should not be treated as script names.
 * Note: 'test' is omitted since it's commonly a user script, and 'pnpm test'
 * is often used to run the 'test' script from package.json.
 */
const pnpmBuiltinCommands = new Set([
	'add', 'audit', 'bin', 'config', 'dedupe', 'deploy', 'dlx', 'doctor',
	'env', 'exec', 'fetch', 'import', 'init', 'install', 'install-test',
	'licenses', 'link', 'list', 'ln', 'ls', 'outdated', 'pack', 'patch',
	'patch-commit', 'patch-remove', 'prune', 'publish', 'rb', 'rebuild',
	'remove', 'rm', 'root', 'run', 'server', 'setup', 'store',
	'un', 'uninstall', 'unlink', 'up', 'update', 'why',
]);

interface IPackageJsonScripts {
	uri: URI;
	scripts: Set<string>;
}

export class CommandLineNpmScriptAutoApproveAnalyzer extends Disposable implements ICommandLineAnalyzer {

	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		private readonly _log: (message: string, ...args: unknown[]) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	async analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		// Check if the feature is enabled
		const isNpmScriptAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts) === true;
		if (!isNpmScriptAutoApproveEnabled) {
			return { isAutoApproveAllowed: true };
		}

		// Check if auto-approve is enabled
		const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
		const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
		if (!isAutoApproveEnabled || !isAutoApproveWarningAccepted) {
			return { isAutoApproveAllowed: true };
		}

		// Parse sub-commands
		let subCommands: string[] | undefined;
		try {
			subCommands = await this._treeSitterCommandParser.extractSubCommands(options.treeSitterLanguage, options.commandLine);
			this._log('Parsed sub-commands for npm script check', subCommands);
		} catch (e) {
			this._log('Failed to parse sub-commands for npm script check');
			return { isAutoApproveAllowed: true };
		}

		if (!subCommands || subCommands.length === 0) {
			return { isAutoApproveAllowed: true };
		}

		// Extract script names from npm/yarn/pnpm run commands
		const scriptNamesToCheck = this._extractScriptNames(subCommands);
		if (scriptNamesToCheck.length === 0) {
			return { isAutoApproveAllowed: true };
		}

		this._log('Script names to check', scriptNamesToCheck);

		// Find and parse package.json
		const packageJsonScripts = await this._getPackageJsonScripts(options.cwd);
		if (!packageJsonScripts) {
			this._log('No package.json found or no scripts section');
			return { isAutoApproveAllowed: true };
		}

		this._log('Found package.json scripts', Array.from(packageJsonScripts.scripts));

		// Check if all script names exist in package.json
		const allScriptsExist = scriptNamesToCheck.every(script => packageJsonScripts.scripts.has(script));
		if (!allScriptsExist) {
			const missingScripts = scriptNamesToCheck.filter(script => !packageJsonScripts.scripts.has(script));
			this._log('Some scripts not found in package.json', missingScripts);
			return { isAutoApproveAllowed: true };
		}

		this._log('All scripts found in package.json, auto-approving');

		// All scripts exist - auto approve
		const scriptsList = scriptNamesToCheck.length === 1
			? `\`${scriptNamesToCheck[0]}\``
			: scriptNamesToCheck.map(s => `\`${s}\``).join(', ');

		return {
			isAutoApproved: true,
			isAutoApproveAllowed: true,
			autoApproveInfo: new MarkdownString(
				localize('autoApprove.npmScript', 'Auto approved as {0} is defined in package.json', scriptsList)
			),
		};
	}

	/**
	 * Extracts script names from npm/yarn/pnpm run commands.
	 */
	private _extractScriptNames(subCommands: string[]): string[] {
		const scriptNames: string[] = [];

		for (const subCommand of subCommands) {
			const trimmedCommand = subCommand.trim();

			for (const pattern of npmRunPatterns) {
				const match = trimmedCommand.match(pattern);
				if (match?.groups?.scriptName) {
					const { command, scriptName } = match.groups;

					// Check if this is a yarn/pnpm shorthand that matches a built-in command
					if (command.toLowerCase() === 'yarn' && yarnBuiltinCommands.has(scriptName.toLowerCase())) {
						continue;
					}
					if (command.toLowerCase() === 'pnpm' && pnpmBuiltinCommands.has(scriptName.toLowerCase())) {
						continue;
					}

					scriptNames.push(scriptName);
					break; // Only match one pattern per sub-command
				}
			}
		}

		return scriptNames;
	}

	/**
	 * Checks if a URI is within any workspace folder.
	 */
	private _isWithinWorkspace(uri: URI): boolean {
		const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
		return workspaceFolders.some(folder => extUri.isEqualOrParent(uri, folder.uri));
	}

	/**
	 * Finds and parses package.json to get the scripts section.
	 * Only looks within the workspace for security.
	 */
	private async _getPackageJsonScripts(cwd: URI | undefined): Promise<IPackageJsonScripts | undefined> {
		// Try cwd first, but only if it's within the workspace
		if (cwd && this._isWithinWorkspace(cwd)) {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			const scripts = await this._readPackageJsonScripts(packageJsonUri);
			if (scripts) {
				return { uri: packageJsonUri, scripts };
			}
		}

		// Fall back to workspace folder roots
		const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
		for (const folder of workspaceFolders) {
			const packageJsonUri = URI.joinPath(folder.uri, 'package.json');
			const scripts = await this._readPackageJsonScripts(packageJsonUri);
			if (scripts) {
				return { uri: packageJsonUri, scripts };
			}
		}

		return undefined;
	}

	/**
	 * Reads and parses the scripts section from a package.json file.
	 */
	private async _readPackageJsonScripts(packageJsonUri: URI): Promise<Set<string> | undefined> {
		try {
			const exists = await this._fileService.exists(packageJsonUri);
			if (!exists) {
				return undefined;
			}

			const content = await this._fileService.readFile(packageJsonUri);
			const text = content.value.toString();

			return this._parsePackageJsonScripts(text);
		} catch (e) {
			this._log('Failed to read package.json', packageJsonUri.toString(), e);
			return undefined;
		}
	}

	/**
	 * Parses the scripts section from package.json content using jsonc-parser.
	 */
	private _parsePackageJsonScripts(content: string): Set<string> | undefined {
		const scripts = new Set<string>();
		let inScripts = false;
		let level = 0;

		const visitor: JSONVisitor = {
			onError() {
				// Ignore parse errors
			},
			onObjectBegin() {
				level++;
			},
			onObjectEnd() {
				if (inScripts && level === 2) {
					inScripts = false;
				}
				level--;
			},
			onObjectProperty(property: string) {
				if (level === 1 && property === 'scripts') {
					inScripts = true;
				} else if (inScripts && level === 2) {
					scripts.add(property);
				}
			},
		};

		visit(content, visitor);

		return scripts.size > 0 ? scripts : undefined;
	}
}
