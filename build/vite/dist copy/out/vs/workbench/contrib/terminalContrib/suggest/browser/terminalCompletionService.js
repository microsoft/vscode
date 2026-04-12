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
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { env as processEnv } from '../../../../../base/common/process.js';
import { timeout } from '../../../../../base/common/async.js';
import { gitBashToWindowsPath, windowsToGitBashPath } from './terminalGitBashHelpers.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { match } from '../../../../../base/common/glob.js';
import { isString } from '../../../../../base/common/types.js';
export const ITerminalCompletionService = createDecorator('terminalCompletionService');
/**
 * Represents a collection of {@link CompletionItem completion items} to be presented
 * in the terminal.
 */
export class TerminalCompletionList {
    /**
     * Creates a new completion list.
     *
     * @param items The completion items.
     * @param isIncomplete The list is not complete.
     */
    constructor(items, resourceOptions) {
        this.items = items;
        this.resourceOptions = resourceOptions;
    }
}
let TerminalCompletionService = class TerminalCompletionService extends Disposable {
    get providers() {
        return this._providersGenerator();
    }
    *_providersGenerator() {
        for (const providerMap of this._providers.values()) {
            for (const provider of providerMap.values()) {
                yield provider;
            }
        }
    }
    /** Overrides the environment for testing purposes. */
    set processEnv(env) { this._processEnv = env; }
    constructor(_configurationService, _fileService, _labelService, _logService) {
        super();
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._labelService = _labelService;
        this._logService = _logService;
        this._providers = new Map();
        this._onDidChangeProviders = this._register(new Emitter());
        this.onDidChangeProviders = this._onDidChangeProviders.event;
        this._processEnv = processEnv;
    }
    registerTerminalCompletionProvider(extensionIdentifier, id, provider, ...triggerCharacters) {
        let extMap = this._providers.get(extensionIdentifier);
        if (!extMap) {
            extMap = new Map();
            this._providers.set(extensionIdentifier, extMap);
        }
        provider.triggerCharacters = triggerCharacters;
        provider.id = id;
        extMap.set(id, provider);
        this._onDidChangeProviders.fire();
        return toDisposable(() => {
            const extMap = this._providers.get(extensionIdentifier);
            if (extMap) {
                extMap.delete(id);
                if (extMap.size === 0) {
                    this._providers.delete(extensionIdentifier);
                }
            }
            this._onDidChangeProviders.fire();
        });
    }
    async provideCompletions(promptValue, cursorPosition, allowFallbackCompletions, shellType, capabilities, token, triggerCharacter, skipExtensionCompletions, explicitlyInvoked) {
        this._logService.trace('TerminalCompletionService#provideCompletions');
        if (!this._providers || !this._providers.values || cursorPosition < 0) {
            return undefined;
        }
        let providers;
        if (triggerCharacter) {
            const providersToRequest = [];
            for (const provider of this.providers) {
                if (!provider.triggerCharacters) {
                    continue;
                }
                for (const char of provider.triggerCharacters) {
                    if (promptValue.substring(0, cursorPosition)?.endsWith(char)) {
                        providersToRequest.push(provider);
                        break;
                    }
                }
            }
            providers = providersToRequest;
        }
        else {
            providers = [...this._providers.values()].flatMap(providerMap => [...providerMap.values()]);
        }
        if (skipExtensionCompletions) {
            providers = providers.filter(p => p.isBuiltin);
            return this._collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked);
        }
        providers = this._getEnabledProviders(providers);
        if (!providers.length) {
            return;
        }
        return this._collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked);
    }
    _getEnabledProviders(providers) {
        const providerConfig = this._configurationService.getValue("terminal.integrated.suggest.providers" /* TerminalSuggestSettingId.Providers */);
        return providers.filter(p => {
            const providerId = p.id;
            return providerId && (!Object.prototype.hasOwnProperty.call(providerConfig, providerId) || providerConfig[providerId] !== false);
        });
    }
    async _collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked) {
        this._logService.trace('TerminalCompletionService#_collectCompletions');
        const completionPromises = providers.map(async (provider) => {
            if (provider.shellTypes && shellType && !provider.shellTypes.includes(shellType)) {
                return undefined;
            }
            const timeoutMs = explicitlyInvoked ? 30000 : 5000;
            let timedOut = false;
            let completions;
            try {
                completions = await Promise.race([
                    provider.provideCompletions(promptValue, cursorPosition, token).then(result => {
                        this._logService.trace(`TerminalCompletionService#_collectCompletions provider ${provider.id} finished`);
                        return result;
                    }),
                    (async () => { await timeout(timeoutMs); timedOut = true; return undefined; })()
                ]);
            }
            catch (e) {
                this._logService.trace(`[TerminalCompletionService] Exception from provider '${provider.id}':`, e);
                return undefined;
            }
            if (timedOut) {
                this._logService.trace(`[TerminalCompletionService] Provider '${provider.id}' timed out after ${timeoutMs}ms. promptValue='${promptValue}', cursorPosition=${cursorPosition}, explicitlyInvoked=${explicitlyInvoked}`);
                return undefined;
            }
            if (!completions) {
                return undefined;
            }
            const completionItems = Array.isArray(completions) ? completions : completions.items ?? [];
            this._logService.trace(`TerminalCompletionService#_collectCompletions amend ${completionItems.length} completion items`);
            if (shellType === "pwsh" /* GeneralShellType.PowerShell */) {
                for (const completion of completionItems) {
                    const start = completion.replacementRange ? completion.replacementRange[0] : 0;
                    completion.isFileOverride ??= completion.kind === TerminalCompletionItemKind.Method && start === 0;
                }
            }
            if (provider.isBuiltin) {
                //TODO: why is this needed?
                for (const item of completionItems) {
                    item.provider ??= provider.id;
                }
            }
            if (Array.isArray(completions)) {
                return completionItems;
            }
            if (completions.resourceOptions) {
                const resourceCompletions = await this.resolveResources(completions.resourceOptions, promptValue, cursorPosition, `core:path:ext:${provider.id}`, capabilities, shellType);
                this._logService.trace(`TerminalCompletionService#_collectCompletions dedupe`);
                if (resourceCompletions) {
                    const labels = new Set(completionItems.map(c => c.label));
                    for (const item of resourceCompletions) {
                        // Ensure no duplicates such as .
                        if (!labels.has(item.label)) {
                            completionItems.push(item);
                        }
                    }
                }
                this._logService.trace(`TerminalCompletionService#_collectCompletions dedupe done`);
            }
            return completionItems;
        });
        const results = await Promise.all(completionPromises);
        this._logService.trace('TerminalCompletionService#_collectCompletions done');
        return results.filter(result => !!result).flat();
    }
    async resolveResources(resourceOptions, promptValue, cursorPosition, provider, capabilities, shellType) {
        this._logService.trace(`TerminalCompletionService#resolveResources`);
        const useWindowsStylePath = resourceOptions.pathSeparator === '\\';
        if (useWindowsStylePath) {
            // for tests, make sure the right path separator is used
            promptValue = promptValue.replaceAll(/[\\/]/g, resourceOptions.pathSeparator);
        }
        // Files requested implies folders requested since the file could be in any folder. We could
        // provide diagnostics when a folder is provided where a file is expected.
        const showDirectories = (resourceOptions.showDirectories || resourceOptions.showFiles) ?? false;
        const showFiles = resourceOptions.showFiles ?? false;
        const globPattern = resourceOptions.globPattern ?? undefined;
        if (!showDirectories && !showFiles) {
            return;
        }
        const resourceCompletions = [];
        const cursorPrefix = promptValue.substring(0, cursorPosition);
        // Determine if we're completing the command (first word) vs an argument
        // We're in command position if there are no unescaped spaces before cursor
        const wordsBeforeCursor = cursorPrefix.split(/(?<!\\) /);
        const isCommandPosition = wordsBeforeCursor.length <= 1 && !cursorPrefix.endsWith(' ');
        // TODO: Leverage Fig's tokens array here?
        // The last word (or argument). When the cursor is following a space it will be the empty
        // string
        let lastWord = cursorPrefix.endsWith(' ') ? '' : cursorPrefix.split(/(?<!\\) /).at(-1) ?? '';
        // Ignore prefixes in the word that look like setting an environment variable
        const matchEnvVarPrefix = lastWord.match(/^[a-zA-Z_]+=(?<rhs>.+)$/);
        if (matchEnvVarPrefix?.groups?.rhs) {
            lastWord = matchEnvVarPrefix.groups.rhs;
        }
        // Get the nearest folder path from the prefix. This ignores everything after the `/` as
        // they are what triggers changes in the directory.
        let lastSlashIndex;
        if (useWindowsStylePath) {
            // TODO: Flesh out escaped path logic, it currently only partially works
            let lastBackslashIndex = -1;
            for (let i = lastWord.length - 1; i >= 0; i--) {
                if (lastWord[i] === '\\') {
                    if (i === lastWord.length - 1 || lastWord[i + 1] !== ' ') {
                        lastBackslashIndex = i;
                        break;
                    }
                }
            }
            lastSlashIndex = Math.max(lastBackslashIndex, lastWord.lastIndexOf('/'));
        }
        else {
            lastSlashIndex = lastWord.lastIndexOf(resourceOptions.pathSeparator);
        }
        // The _complete_ folder of the last word. For example if the last word is `./src/file`,
        // this will be `./src/`. This also always ends in the path separator if it is not the empty
        // string and path separators are normalized on Windows.
        let lastWordFolder = lastSlashIndex === -1 ? '' : lastWord.slice(0, lastSlashIndex + 1);
        if (useWindowsStylePath) {
            lastWordFolder = lastWordFolder.replaceAll('/', '\\');
        }
        // Determine the current folder being shown
        const lastWordFolderHasDotPrefix = !!lastWordFolder.match(/^\.\.?[\\\/]/);
        const lastWordFolderHasTildePrefix = !!lastWordFolder.match(/^~[\\\/]?/);
        const isAbsolutePath = getIsAbsolutePath(shellType, resourceOptions.pathSeparator, lastWordFolder, useWindowsStylePath);
        const type = lastWordFolderHasTildePrefix ? 'tilde' : isAbsolutePath ? 'absolute' : 'relative';
        const cwd = URI.revive(resourceOptions.cwd);
        let lastWordFolderResource;
        if (type === 'relative' && lastWordFolder.length > 0) {
            // If the typed folder matches the tail of cwd (common when the extension already
            // resolved the path, such as `./src/vs/`), reuse cwd to avoid duplicating segments.
            const normalizedFolder = (useWindowsStylePath ? lastWordFolder.replaceAll('\\', '/') : lastWordFolder).replaceAll('\\ ', ' ');
            const hasDotPrefix = normalizedFolder.startsWith('./');
            if (hasDotPrefix) {
                const stripped = normalizedFolder.replace(/^\.\/+/, '').replace(/\/+$/, '');
                if (stripped) {
                    const cwdParts = cwd.path.replace(/\/+$/, '').split('/');
                    const strippedParts = stripped.split('/');
                    const tailMatches = strippedParts.length <= cwdParts.length && strippedParts.every((part, idx) => cwdParts[cwdParts.length - strippedParts.length + idx] === part);
                    if (tailMatches) {
                        try {
                            await this._fileService.stat(cwd);
                            lastWordFolderResource = cwd;
                        }
                        catch {
                            return undefined;
                        }
                    }
                }
                else {
                    // `./` by itself means the current directory, use cwd directly to avoid
                    // trailing slash issues with URI.joinPath on some remote file systems.
                    try {
                        await this._fileService.stat(cwd);
                        lastWordFolderResource = cwd;
                    }
                    catch {
                        return undefined;
                    }
                }
            }
            // Otherwise resolve the folder relative to cwd.
            if (!lastWordFolderResource) {
                const folderToResolve = URI.joinPath(cwd, normalizedFolder);
                try {
                    await this._fileService.stat(folderToResolve);
                    lastWordFolderResource = folderToResolve;
                }
                catch {
                    return undefined;
                }
            }
        }
        else if (type === 'relative') {
            lastWordFolderResource = cwd;
        }
        if (type === 'relative' && !lastWordFolderResource) {
            try {
                await this._fileService.stat(cwd);
                lastWordFolderResource = cwd;
            }
            catch {
                return undefined;
            }
        }
        switch (type) {
            case 'tilde': {
                const home = this._getHomeDir(useWindowsStylePath, capabilities);
                if (home) {
                    lastWordFolderResource = URI.joinPath(createUriFromLocalPath(cwd, home), lastWordFolder.slice(1).replaceAll('\\ ', ' '));
                }
                if (!lastWordFolderResource) {
                    // Use less strong wording here as it's not as strong of a concept on Windows
                    // and could be misleading
                    if (lastWord.match(/^~[\\\/]$/)) {
                        lastWordFolderResource = useWindowsStylePath ? 'Home directory' : '$HOME';
                    }
                }
                break;
            }
            case 'absolute': {
                if (shellType === "gitbash" /* WindowsShellType.GitBash */) {
                    lastWordFolderResource = createUriFromLocalPath(cwd, gitBashToWindowsPath(lastWordFolder, this._processEnv.SystemDrive));
                }
                else {
                    lastWordFolderResource = createUriFromLocalPath(cwd, lastWordFolder.replaceAll('\\ ', ' '));
                }
                break;
            }
            case 'relative': {
                lastWordFolderResource ??= cwd;
                break;
            }
        }
        // Assemble completions based on the resource of lastWordFolder. Note that on Windows the
        // path separators are normalized to `\`.
        if (!lastWordFolderResource) {
            return undefined;
        }
        // Early exit with basic completion if we don't know the resource
        if (isString(lastWordFolderResource)) {
            resourceCompletions.push({
                label: lastWordFolder,
                provider,
                kind: TerminalCompletionItemKind.Folder,
                detail: lastWordFolderResource,
                replacementRange: [cursorPosition - lastWord.length, cursorPosition]
            });
            return resourceCompletions;
        }
        const stat = await this._fileService.resolve(lastWordFolderResource, {
            resolveMetadata: true,
            resolveSingleChildDescendants: true
        });
        if (!stat?.children) {
            return;
        }
        // Add current directory. This should be shown at the top because it will be an exact
        // match and therefore highlight the detail, plus it improves the experience when
        // runOnEnter is used.
        //
        // - (relative) `|`       -> `.`
        //   this does not have the trailing `/` intentionally as it's common to complete the
        //   current working directory and we do not want to complete `./` when `runOnEnter` is
        //   used.
        // - (relative) `./src/|` -> `./src/`
        // - (absolute) `/src/|`  -> `/src/`
        // - (tilde)    `~/|`     -> `~/`
        // - (tilde)    `~/src/|` -> `~/src/`
        this._logService.trace(`TerminalCompletionService#resolveResources cwd`);
        if (showDirectories) {
            let label;
            switch (type) {
                case 'tilde': {
                    label = lastWordFolder;
                    break;
                }
                case 'absolute': {
                    label = lastWordFolder;
                    break;
                }
                case 'relative': {
                    label = '.';
                    if (lastWordFolder.length > 0) {
                        label = addPathRelativePrefix(lastWordFolder, resourceOptions, lastWordFolderHasDotPrefix);
                    }
                    break;
                }
            }
            resourceCompletions.push({
                label,
                provider,
                kind: TerminalCompletionItemKind.Folder,
                detail: getFriendlyPath(this._labelService, lastWordFolderResource, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
                replacementRange: [cursorPosition - lastWord.length, cursorPosition]
            });
        }
        // Add all direct children files or folders
        //
        // - (relative) `cd ./src/`  -> `cd ./src/folder1/`, ...
        // - (absolute) `cd c:/src/` -> `cd c:/src/folder1/`, ...
        // - (tilde)    `cd ~/src/`  -> `cd ~/src/folder1/`, ...
        this._logService.trace(`TerminalCompletionService#resolveResources direct children`);
        await Promise.all(stat.children.map(child => (async () => {
            let kind;
            let detail = undefined;
            if (showDirectories && child.isDirectory) {
                if (child.isSymbolicLink) {
                    kind = TerminalCompletionItemKind.SymbolicLinkFolder;
                }
                else {
                    kind = TerminalCompletionItemKind.Folder;
                }
            }
            else if (showFiles && child.isFile) {
                // When completing the command (first word) on Unix, only show executable files
                if (isCommandPosition && !useWindowsStylePath) {
                    if (!child.executable) {
                        return;
                    }
                }
                if (child.isSymbolicLink) {
                    kind = TerminalCompletionItemKind.SymbolicLinkFile;
                }
                else {
                    kind = TerminalCompletionItemKind.File;
                }
            }
            if (kind === undefined) {
                return;
            }
            let label = lastWordFolder;
            if (label.length > 0 && !label.endsWith(resourceOptions.pathSeparator)) {
                label += resourceOptions.pathSeparator;
            }
            label += child.name;
            if (type === 'relative') {
                label = addPathRelativePrefix(label, resourceOptions, lastWordFolderHasDotPrefix);
            }
            if (child.isDirectory && !label.endsWith(resourceOptions.pathSeparator)) {
                label += resourceOptions.pathSeparator;
            }
            label = escapeTerminalCompletionLabel(label, shellType, resourceOptions.pathSeparator);
            if (child.isFile && globPattern) {
                const filePath = child.resource.fsPath;
                const ignoreCase = !this._fileService.hasCapability(child.resource, 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
                const matches = match(globPattern, filePath, { ignoreCase });
                if (!matches) {
                    return;
                }
            }
            // Try to resolve symlink target for symbolic links
            if (child.isSymbolicLink) {
                try {
                    const realpath = await this._fileService.realpath(child.resource);
                    if (realpath && !isEqual(child.resource, realpath)) {
                        detail = `${getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType)} -> ${getFriendlyPath(this._labelService, realpath, resourceOptions.pathSeparator, kind, shellType)}`;
                    }
                }
                catch (error) {
                    // Ignore errors resolving symlink targets - they may be dangling links
                }
            }
            resourceCompletions.push({
                label,
                provider,
                kind,
                detail: detail ?? getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType),
                replacementRange: [cursorPosition - lastWord.length, cursorPosition]
            });
        })()));
        // Support $CDPATH specially for the `cd` command only
        //
        // - (relative) `|` -> `/foo/vscode` (CDPATH has /foo which contains vscode folder)
        this._logService.trace(`TerminalCompletionService#resolveResources CDPATH`);
        if (type === 'relative' && showDirectories) {
            if (promptValue.startsWith('cd ')) {
                const config = this._configurationService.getValue("terminal.integrated.suggest.cdPath" /* TerminalSuggestSettingId.CdPath */);
                if (config === 'absolute' || config === 'relative') {
                    const cdPath = this._getEnvVar('CDPATH', capabilities);
                    if (cdPath) {
                        const cdPathEntries = cdPath.split(useWindowsStylePath ? ';' : ':');
                        for (const cdPathEntry of cdPathEntries) {
                            try {
                                const fileStat = await this._fileService.resolve(createUriFromLocalPath(cwd, cdPathEntry), { resolveSingleChildDescendants: true });
                                if (fileStat?.children) {
                                    for (const child of fileStat.children) {
                                        if (!child.isDirectory) {
                                            continue;
                                        }
                                        const useRelative = config === 'relative';
                                        const kind = TerminalCompletionItemKind.Folder;
                                        const label = useRelative
                                            ? basename(child.resource.fsPath)
                                            : shellType === "gitbash" /* WindowsShellType.GitBash */
                                                ? windowsToGitBashPath(child.resource.fsPath)
                                                : getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType);
                                        const detail = useRelative
                                            ? `CDPATH ${getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType)}`
                                            : `CDPATH`;
                                        resourceCompletions.push({
                                            label,
                                            provider,
                                            kind,
                                            detail,
                                            replacementRange: [cursorPosition - lastWord.length, cursorPosition]
                                        });
                                    }
                                }
                            }
                            catch { /* ignore */ }
                        }
                    }
                }
            }
        }
        // Add parent directory to the bottom of the list because it's not as useful as other suggestions
        //
        // - (relative) `|` -> `../`
        // - (relative) `./src/|` -> `./src/../`
        this._logService.trace(`TerminalCompletionService#resolveResources parent dir`);
        if (type === 'relative' && showDirectories) {
            let label = `..${resourceOptions.pathSeparator}`;
            if (lastWordFolder.length > 0) {
                label = addPathRelativePrefix(lastWordFolder + label, resourceOptions, lastWordFolderHasDotPrefix);
            }
            const parentDir = URI.joinPath(lastWordFolderResource, '..' + resourceOptions.pathSeparator);
            resourceCompletions.push({
                label,
                provider,
                kind: TerminalCompletionItemKind.Folder,
                detail: getFriendlyPath(this._labelService, parentDir, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
                replacementRange: [cursorPosition - lastWord.length, cursorPosition]
            });
        }
        // Add tilde for home directory for relative paths when there is no path separator in the
        // input.
        //
        // - (relative) `|` -> `~`
        this._logService.trace(`TerminalCompletionService#resolveResources tilde`);
        if (type === 'relative' && !lastWordFolder.match(/[\\\/]/)) {
            let homeResource;
            const home = this._getHomeDir(useWindowsStylePath, capabilities);
            if (home) {
                homeResource = createUriFromLocalPath(cwd, home);
            }
            if (!homeResource) {
                // Use less strong wording here as it's not as strong of a concept on Windows
                // and could be misleading
                homeResource = useWindowsStylePath ? 'Home directory' : '$HOME';
            }
            resourceCompletions.push({
                label: '~',
                provider,
                kind: TerminalCompletionItemKind.Folder,
                detail: isString(homeResource) ? homeResource : getFriendlyPath(this._labelService, homeResource, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
                replacementRange: [cursorPosition - lastWord.length, cursorPosition]
            });
        }
        this._logService.trace(`TerminalCompletionService#resolveResources done`);
        return resourceCompletions;
    }
    _getEnvVar(key, capabilities) {
        const env = capabilities.get(5 /* TerminalCapability.ShellEnvDetection */)?.env?.value;
        if (env) {
            return env[key];
        }
        return this._processEnv[key];
    }
    _getHomeDir(useWindowsStylePath, capabilities) {
        return useWindowsStylePath ? this._getEnvVar('USERPROFILE', capabilities) : this._getEnvVar('HOME', capabilities);
    }
};
TerminalCompletionService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IFileService),
    __param(2, ILabelService),
    __param(3, ITerminalLogService)
], TerminalCompletionService);
export { TerminalCompletionService };
function getFriendlyPath(labelService, uri, pathSeparator, kind, shellType) {
    let path = labelService.getUriLabel(uri, { noPrefix: true });
    // Normalize line endings for folders
    const sep = shellType === "gitbash" /* WindowsShellType.GitBash */ ? '\\' : pathSeparator;
    if (kind === TerminalCompletionItemKind.Folder && !path.endsWith(sep)) {
        path += sep;
    }
    return path;
}
/**
 * Normalize suggestion to add a ./ prefix to the start of the path if there isn't one already. We
 * may want to change this behavior in the future to go with whatever format the user has.
 */
function addPathRelativePrefix(text, resourceOptions, lastWordFolderHasDotPrefix) {
    if (!lastWordFolderHasDotPrefix) {
        if (text.startsWith(resourceOptions.pathSeparator)) {
            return `.${text}`;
        }
        return `.${resourceOptions.pathSeparator}${text}`;
    }
    return text;
}
/**
 * Escapes special characters in a file/folder label for shell completion.
 * This ensures that characters like [, ], etc. are properly escaped.
 */
export function escapeTerminalCompletionLabel(label, shellType, pathSeparator) {
    // Only escape for bash/zsh/fish; PowerShell and cmd have different rules
    if (shellType === undefined || shellType === "pwsh" /* GeneralShellType.PowerShell */ || shellType === "cmd" /* WindowsShellType.CommandPrompt */) {
        return label;
    }
    return label.replace(/[\[\]\(\)'"\\\`\*\?;|&<>]/g, '\\$&');
}
function getIsAbsolutePath(shellType, pathSeparator, lastWord, useWindowsStylePath) {
    if (shellType === "gitbash" /* WindowsShellType.GitBash */) {
        return lastWord.startsWith(pathSeparator) || /^[a-zA-Z]:\//.test(lastWord);
    }
    return useWindowsStylePath ? /^[a-zA-Z]:[\\\/]/.test(lastWord) : lastWord.startsWith(pathSeparator);
}
/**
 * Creates a URI from an absolute path, preserving the scheme and authority from the cwd.
 * For local file:// URIs, uses URI.file() which handles Windows path normalization.
 * For remote URIs (e.g., vscode-remote://wsl+Ubuntu), preserves the remote context.
 */
function createUriFromLocalPath(cwd, absolutePath) {
    if (cwd.scheme === 'file') {
        return URI.file(absolutePath);
    }
    return cwd.with({ path: absolutePath });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21wbGV0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvdGVybWluYWxDb21wbGV0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQWtDLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVoRyxPQUFPLEVBQW9CLG1CQUFtQixFQUF1QyxNQUFNLHFEQUFxRCxDQUFDO0FBRWpKLE9BQU8sRUFBRSwwQkFBMEIsRUFBNEIsTUFBTSw2QkFBNkIsQ0FBQztBQUNuRyxPQUFPLEVBQUUsR0FBRyxJQUFJLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN6RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlF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