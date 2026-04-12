/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { MarkdownString } from '../../../../../../../../base/common/htmlContent.js';
import { visit } from '../../../../../../../../base/common/json.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { localize } from '../../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../../../platform/workspace/common/workspace.js';
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
let NpmScriptAutoApprover = class NpmScriptAutoApprover extends Disposable {
    constructor(_configurationService, _fileService, _uriIdentityService, _workspaceContextService) {
        super();
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._uriIdentityService = _uriIdentityService;
        this._workspaceContextService = _workspaceContextService;
    }
    /**
     * Checks if a single command is an npm/yarn/pnpm script that exists in package.json.
     * Returns auto-approve result if the command is a valid script.
     */
    async isCommandAutoApproved(command, cwd) {
        // Check if the feature is enabled
        const isNpmScriptAutoApproveEnabled = this._configurationService.getValue("chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts */) === true;
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
            autoApproveInfo: new MarkdownString(localize('autoApprove.npmScript', 'Auto approved as {0} is defined in package.json', `\`${scriptName}\``)),
        };
    }
    /**
     * Extracts script name from an npm/yarn/pnpm run command.
     */
    _extractScriptName(command) {
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
    _isWithinWorkspace(uri) {
        const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
        return workspaceFolders.some((folder) => this._uriIdentityService.extUri.isEqualOrParent(uri, folder.uri));
    }
    /**
     * Finds and parses package.json to get the scripts section.
     * Only looks within the workspace for security.
     */
    async _getPackageJsonScripts(cwd) {
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
    async _readPackageJsonScripts(packageJsonUri) {
        try {
            const exists = await this._fileService.exists(packageJsonUri);
            if (!exists) {
                return undefined;
            }
            const content = await this._fileService.readFile(packageJsonUri);
            const text = content.value.toString();
            return this._parsePackageJsonScripts(text);
        }
        catch {
            return undefined;
        }
    }
    /**
     * Parses the scripts section from package.json content using jsonc-parser.
     */
    _parsePackageJsonScripts(content) {
        const scripts = new Set();
        let inScripts = false;
        let level = 0;
        const visitor = {
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
            onObjectProperty(property) {
                if (level === 1 && property === 'scripts') {
                    inScripts = true;
                }
                else if (inScripts && level === 2) {
                    scripts.add(property);
                }
            },
        };
        visit(content, visitor);
        return scripts.size > 0 ? scripts : undefined;
    }
};
NpmScriptAutoApprover = __decorate([
    __param(0, IConfigurationService),
    __param(1, IFileService),
    __param(2, IUriIdentityService),
    __param(3, IWorkspaceContextService)
], NpmScriptAutoApprover);
export { NpmScriptAutoApprover };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnBtU2NyaXB0QXV0b0FwcHJvdmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9hdXRvQXBwcm92ZS9ucG1TY3JpcHRBdXRvQXBwcm92ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBd0IsTUFBTSxvREFBb0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsS0FBSyxFQUFvQixNQUFNLDZDQUE2QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDekcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBQy9HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsd0JBQXdCLEVBQXlCLE1BQU0sZ0VBQWdFLENBQUM7QUFHakk7OztHQUdHO0FBQ0gsTUFBTSxjQUFjLEdBQUc7SUFDdEIsbUJBQW1CO0lBQ25CLDBCQUEwQjtJQUMxQixvRUFBb0U7SUFDcEUsa0VBQWtFO0lBQ2xFLDZEQUE2RDtJQUM3RCw4REFBOEQ7SUFDOUQsZ0JBQWdCO0lBQ2hCLG9CQUFvQjtJQUNwQiwwREFBMEQ7SUFDMUQsZ0JBQWdCO0lBQ2hCLG9CQUFvQjtJQUNwQiwwREFBMEQ7Q0FDMUQsQ0FBQztBQUVGOzs7O0dBSUc7QUFDSCxN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