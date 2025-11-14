/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalCapability, type ITerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { GeneralShellType, ITerminalLogService, TerminalShellType, WindowsShellType } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalSuggestSettingId } from '../common/terminalSuggestConfiguration.js';
import { TerminalCompletionItemKind, type ITerminalCompletion } from './terminalCompletionItem.js';
import { env as processEnv } from '../../../../../base/common/process.js';
import type { IProcessEnvironment } from '../../../../../base/common/platform.js';
import { timeout } from '../../../../../base/common/async.js';
import { gitBashToWindowsPath, windowsToGitBashPath } from './terminalGitBashHelpers.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IRelativePattern, match } from '../../../../../base/common/glob.js';

export const ITerminalCompletionService = createDecorator<ITerminalCompletionService>('terminalCompletionService');

/**
 * Represents a collection of {@link CompletionItem completion items} to be presented
 * in the terminal.
 */
export class TerminalCompletionList<ITerminalCompletion> {

	/**
	 * Resources should be shown in the completions list
	 */
	resourceOptions?: TerminalCompletionResourceOptions;

	/**
	 * The completion items.
	 */
	items?: ITerminalCompletion[];

	/**
	 * Creates a new completion list.
	 *
	 * @param items The completion items.
	 * @param isIncomplete The list is not complete.
	 */
	constructor(items?: ITerminalCompletion[], resourceOptions?: TerminalCompletionResourceOptions) {
		this.items = items;
		this.resourceOptions = resourceOptions;
	}
}

export interface TerminalCompletionResourceOptions {
	showFiles?: boolean;
	showDirectories?: boolean;
	globPattern?: string | IRelativePattern;
	cwd: UriComponents;
	pathSeparator: string;
}


export interface ITerminalCompletionProvider {
	id: string;
	shellTypes?: TerminalShellType[];
	provideCompletions(value: string, cursorPosition: number, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined>;
	triggerCharacters?: string[];
	isBuiltin?: boolean;
}

export interface ITerminalCompletionService {
	_serviceBrand: undefined;
	readonly providers: IterableIterator<ITerminalCompletionProvider>;
	readonly onDidChangeProviders: Event<void>;
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider, ...triggerCharacters: string[]): IDisposable;
	provideCompletions(promptValue: string, cursorPosition: number, allowFallbackCompletions: boolean, shellType: TerminalShellType | undefined, capabilities: ITerminalCapabilityStore, token: CancellationToken, triggerCharacter?: boolean, skipExtensionCompletions?: boolean, explicitlyInvoked?: boolean): Promise<ITerminalCompletion[] | undefined>;
}

export class TerminalCompletionService extends Disposable implements ITerminalCompletionService {
	declare _serviceBrand: undefined;
	private readonly _providers: Map</*ext id*/string, Map</*provider id*/string, ITerminalCompletionProvider>> = new Map();

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	get providers(): IterableIterator<ITerminalCompletionProvider> {
		return this._providersGenerator();
	}

	private *_providersGenerator(): IterableIterator<ITerminalCompletionProvider> {
		for (const providerMap of this._providers.values()) {
			for (const provider of providerMap.values()) {
				yield provider;
			}
		}
	}

	/** Overrides the environment for testing purposes. */
	set processEnv(env: IProcessEnvironment) { this._processEnv = env; }
	private _processEnv = processEnv;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super();
	}

	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider, ...triggerCharacters: string[]): IDisposable {
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

	async provideCompletions(promptValue: string, cursorPosition: number, allowFallbackCompletions: boolean, shellType: TerminalShellType | undefined, capabilities: ITerminalCapabilityStore, token: CancellationToken, triggerCharacter?: boolean, skipExtensionCompletions?: boolean, explicitlyInvoked?: boolean): Promise<ITerminalCompletion[] | undefined> {
		this._logService.trace('TerminalCompletionService#provideCompletions');
		if (!this._providers || !this._providers.values || cursorPosition < 0) {
			return undefined;
		}

		let providers;
		if (triggerCharacter) {
			const providersToRequest: ITerminalCompletionProvider[] = [];
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
		} else {
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

	protected _getEnabledProviders(providers: ITerminalCompletionProvider[]): ITerminalCompletionProvider[] {
		const providerConfig: { [key: string]: boolean } = this._configurationService.getValue(TerminalSuggestSettingId.Providers);
		return providers.filter(p => {
			const providerId = p.id;
			return providerId && (!Object.prototype.hasOwnProperty.call(providerConfig, providerId) || providerConfig[providerId] !== false);
		});
	}

	private async _collectCompletions(providers: ITerminalCompletionProvider[], shellType: TerminalShellType | undefined, promptValue: string, cursorPosition: number, allowFallbackCompletions: boolean, capabilities: ITerminalCapabilityStore, token: CancellationToken, explicitlyInvoked?: boolean): Promise<ITerminalCompletion[] | undefined> {
		this._logService.trace('TerminalCompletionService#_collectCompletions');
		const completionPromises = providers.map(async provider => {
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
			} catch (e) {
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
			if (shellType === GeneralShellType.PowerShell) {
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

	async resolveResources(resourceOptions: TerminalCompletionResourceOptions, promptValue: string, cursorPosition: number, provider: string, capabilities: ITerminalCapabilityStore, shellType?: TerminalShellType): Promise<ITerminalCompletion[] | undefined> {
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

		const resourceCompletions: ITerminalCompletion[] = [];
		const cursorPrefix = promptValue.substring(0, cursorPosition);

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
		let lastSlashIndex: number;
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
		} else {
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
		let lastWordFolderResource: URI | string | undefined;
		const lastWordFolderHasDotPrefix = !!lastWordFolder.match(/^\.\.?[\\\/]/);
		const lastWordFolderHasTildePrefix = !!lastWordFolder.match(/^~[\\\/]?/);
		const isAbsolutePath = getIsAbsolutePath(shellType, resourceOptions.pathSeparator, lastWordFolder, useWindowsStylePath);
		const type = lastWordFolderHasTildePrefix ? 'tilde' : isAbsolutePath ? 'absolute' : 'relative';
		const cwd = URI.revive(resourceOptions.cwd);

		switch (type) {
			case 'tilde': {
				const home = this._getHomeDir(useWindowsStylePath, capabilities);
				if (home) {
					lastWordFolderResource = URI.joinPath(URI.file(home), lastWordFolder.slice(1).replaceAll('\\ ', ' '));
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
				if (shellType === WindowsShellType.GitBash) {
					lastWordFolderResource = URI.file(gitBashToWindowsPath(lastWordFolder, this._processEnv.SystemDrive));
				} else {
					lastWordFolderResource = URI.file(lastWordFolder.replaceAll('\\ ', ' '));
				}
				break;
			}
			case 'relative': {
				lastWordFolderResource = cwd;
				break;
			}
		}

		// Assemble completions based on the resource of lastWordFolder. Note that on Windows the
		// path separators are normalized to `\`.
		if (!lastWordFolderResource) {
			return undefined;
		}

		// Early exit with basic completion if we don't know the resource
		if (typeof lastWordFolderResource === 'string') {
			resourceCompletions.push({
				label: lastWordFolder,
				provider,
				kind: TerminalCompletionItemKind.Folder,
				detail: lastWordFolderResource,
				replacementRange: [cursorPosition - lastWord.length, cursorPosition]
			});
			return resourceCompletions;
		}

		const stat = await this._fileService.resolve(lastWordFolderResource, { resolveSingleChildDescendants: true });
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
			let label: string;
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
			let kind: TerminalCompletionItemKind | undefined;
			let detail: string | undefined = undefined;
			if (showDirectories && child.isDirectory) {
				if (child.isSymbolicLink) {
					kind = TerminalCompletionItemKind.SymbolicLinkFolder;
				} else {
					kind = TerminalCompletionItemKind.Folder;
				}
			} else if (showFiles && child.isFile) {
				if (child.isSymbolicLink) {
					kind = TerminalCompletionItemKind.SymbolicLinkFile;
				} else {
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
				const ignoreCase = !this._fileService.hasCapability(child.resource, FileSystemProviderCapabilities.PathCaseSensitive);
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
				} catch (error) {
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
				const config = this._configurationService.getValue(TerminalSuggestSettingId.CdPath);
				if (config === 'absolute' || config === 'relative') {
					const cdPath = this._getEnvVar('CDPATH', capabilities);
					if (cdPath) {
						const cdPathEntries = cdPath.split(useWindowsStylePath ? ';' : ':');
						for (const cdPathEntry of cdPathEntries) {
							try {
								const fileStat = await this._fileService.resolve(URI.file(cdPathEntry), { resolveSingleChildDescendants: true });
								if (fileStat?.children) {
									for (const child of fileStat.children) {
										if (!child.isDirectory) {
											continue;
										}
										const useRelative = config === 'relative';
										const kind = TerminalCompletionItemKind.Folder;
										const label = useRelative
											? basename(child.resource.fsPath)
											: shellType === WindowsShellType.GitBash
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
							} catch { /* ignore */ }
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
			const parentDir = URI.joinPath(cwd, '..' + resourceOptions.pathSeparator);
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
			let homeResource: URI | string | undefined;
			const home = this._getHomeDir(useWindowsStylePath, capabilities);
			if (home) {
				homeResource = URI.joinPath(URI.file(home), lastWordFolder.slice(1).replaceAll('\\ ', ' '));
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
				detail: typeof homeResource === 'string' ? homeResource : getFriendlyPath(this._labelService, homeResource, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
				replacementRange: [cursorPosition - lastWord.length, cursorPosition]
			});
		}

		this._logService.trace(`TerminalCompletionService#resolveResources done`);
		return resourceCompletions;
	}

	private _getEnvVar(key: string, capabilities: ITerminalCapabilityStore): string | undefined {
		const env = capabilities.get(TerminalCapability.ShellEnvDetection)?.env?.value as { [key: string]: string | undefined };
		if (env) {
			return env[key];
		}
		return this._processEnv[key];
	}

	private _getHomeDir(useWindowsStylePath: boolean, capabilities: ITerminalCapabilityStore): string | undefined {
		return useWindowsStylePath ? this._getEnvVar('USERPROFILE', capabilities) : this._getEnvVar('HOME', capabilities);
	}
}

function getFriendlyPath(labelService: ILabelService, uri: URI, pathSeparator: string, kind: TerminalCompletionItemKind, shellType?: TerminalShellType): string {
	let path = labelService.getUriLabel(uri, { noPrefix: true });
	// Normalize line endings for folders
	const sep = shellType === WindowsShellType.GitBash ? '\\' : pathSeparator;
	if (kind === TerminalCompletionItemKind.Folder && !path.endsWith(sep)) {
		path += sep;
	}
	return path;
}

/**
 * Normalize suggestion to add a ./ prefix to the start of the path if there isn't one already. We
 * may want to change this behavior in the future to go with whatever format the user has.
 */
function addPathRelativePrefix(text: string, resourceOptions: Pick<TerminalCompletionResourceOptions, 'pathSeparator'>, lastWordFolderHasDotPrefix: boolean): string {
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
export function escapeTerminalCompletionLabel(label: string, shellType: TerminalShellType | undefined, pathSeparator: string): string {
	// Only escape for bash/zsh/fish; PowerShell and cmd have different rules
	if (shellType === undefined || shellType === GeneralShellType.PowerShell || shellType === WindowsShellType.CommandPrompt) {
		return label;
	}
	return label.replace(/[\[\]\(\)'"\\\`\*\?;|&<>]/g, '\\$&');
}

function getIsAbsolutePath(shellType: TerminalShellType | undefined, pathSeparator: string, lastWord: string, useWindowsStylePath: boolean): boolean {
	if (shellType === WindowsShellType.GitBash) {
		return lastWord.startsWith(pathSeparator) || /^[a-zA-Z]:\//.test(lastWord);
	}
	return useWindowsStylePath ? /^[a-zA-Z]:[\\\/]/.test(lastWord) : lastWord.startsWith(pathSeparator);
}
