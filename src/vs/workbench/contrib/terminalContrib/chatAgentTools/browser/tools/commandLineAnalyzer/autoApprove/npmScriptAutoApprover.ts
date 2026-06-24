/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, type IMarkdownString } from '../../../../../../../../base/common/htmlContent.js';
import { visit, type JSONVisitor } from '../../../../../../../../base/common/json.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { localize } from '../../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../../../../../platform/workspace/common/workspace.js';
import { TerminalChatAgentToolsSettingId } from '../../../../common/terminalChatAgentToolsConfiguration.js';

/**
 * Regex patterns to match npm/yarn/pnpm run commands and extract the script name.
 * Uses named capture groups: 'command' for the package manager, 'scriptName' for the script.
 */
const npmRunPatterns = [
	// npm run <script>
	// npm run-script <script>
	/^(?<command>npm)\s+(?:run(?:-script)?)\s+(?<scriptName>[^\s&|;]+)/i,
	// npm test, npm start, npm stop, npm restart (shorthand commands)
	// See https://docs.npmjs.com/cli/v10/commands/npm-run-script
	/^(?<command>npm)\s+(?<scriptName>test|start|stop|restart)\b/i,
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

export interface INpmScriptAutoApproveResult {
	isAutoApproved: boolean;
	scriptName?: string;
	autoApproveInfo?: IMarkdownString;
}

export class NpmScriptAutoApprover extends Disposable {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	/**
	 * Checks if a single command is an npm/yarn/pnpm script that exists in package.json.
	 * Returns auto-approve result if the command is a valid script.
	 */
	async isCommandAutoApproved(command: string, cwd: URI | undefined): Promise<INpmScriptAutoApproveResult> {
		// Check if the feature is enabled
		const isNpmScriptAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts) === true;
		if (!isNpmScriptAutoApproveEnabled) {
			return { isAutoApproved: false };
		}

		// Extract script name from the command
		const scriptName = this._extractScriptName(command);
		if (!scriptName) {
			return { isAutoApproved: false };
		}

		// Find and parse package.json
		const packageJsonScripts = await this._getPackageJsonScripts(cwd);
		if (!packageJsonScripts) {
			return { isAutoApproved: false };
		}

		// Check if script exists in package.json
		if (!packageJsonScripts.scripts.has(scriptName)) {
			return { isAutoApproved: false };
		}

		// Script exists - auto approve
		return {
			isAutoApproved: true,
			scriptName,
			autoApproveInfo: new MarkdownString(
				localize('autoApprove.npmScript', 'Auto approved as {0} is defined in package.json', `\`${scriptName}\``)
			),
		};
	}

	/**
	 * Extracts script name from an npm/yarn/pnpm run command.
	 */
	private _extractScriptName(command: string): string | undefined {
		const trimmedCommand = command.trim();

		for (const pattern of npmRunPatterns) {
			const match = trimmedCommand.match(pattern);
			if (match?.groups?.scriptName) {
				const { command: pkgManager, scriptName } = match.groups;

				// Check if this is a yarn/pnpm shorthand that matches a built-in command
				if (pkgManager.toLowerCase() === 'yarn' && yarnBuiltinCommands.has(scriptName.toLowerCase())) {
					continue;
				}
				if (pkgManager.toLowerCase() === 'pnpm' && pnpmBuiltinCommands.has(scriptName.toLowerCase())) {
					continue;
				}

				return scriptName;
			}
		}

		return undefined;
	}

	/**
	 * Checks if a URI is within any workspace folder.
	 */
	private _isWithinWorkspace(uri: URI): boolean {
		const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
		return workspaceFolders.some((folder: IWorkspaceFolder) => this._uriIdentityService.extUri.isEqualOrParent(uri, folder.uri));
	}

	/**
	 * Finds and parses package.json to get the scripts section.
	 * Only looks within the workspace for security.
	 */
	private async _getPackageJsonScripts(cwd: URI | undefined): Promise<IPackageJsonScripts | undefined> {
		// Only look in cwd if it's within the workspace
		if (!cwd || !this._isWithinWorkspace(cwd)) {
			return undefined;
		}

		const packageJsonUri = URI.joinPath(cwd, 'package.json');
		const scripts = await this._readPackageJsonScripts(packageJsonUri);
		if (scripts) {
			return { uri: packageJsonUri, scripts };
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
		} catch {
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
