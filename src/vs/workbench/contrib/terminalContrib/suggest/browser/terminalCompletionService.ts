/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalSettingId, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';
import { ISimpleCompletion } from '../../../../services/suggest/browser/simpleCompletionItem.js';
import { ITerminalSuggestConfiguration, terminalSuggestConfigSection } from '../common/terminalSuggestConfiguration.js';

export const ITerminalCompletionService = createDecorator<ITerminalCompletionService>('terminalCompletionService');

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Flag = 2,
	Method = 3,
	Argument = 4
}

export interface ITerminalCompletion extends ISimpleCompletion {
	kind?: TerminalCompletionItemKind;
}


/**
 * Represents a collection of {@link CompletionItem completion items} to be presented
 * in the editor.
 */
export class TerminalCompletionList<ITerminalCompletion> {

	/**
	 * Resources should be shown in the completions list
	 */
	resourceRequestConfig?: TerminalResourceRequestConfig;

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
	constructor(items?: ITerminalCompletion[], resourceRequestConfig?: TerminalResourceRequestConfig) {
		this.items = items;
		this.resourceRequestConfig = resourceRequestConfig;
	}
}

export interface TerminalResourceRequestConfig {
	filesRequested?: boolean;
	foldersRequested?: boolean;
	cwd?: string;
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
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider, ...triggerCharacters: string[]): IDisposable;
	provideCompletions(promptValue: string, cursorPosition: number, shellType: TerminalShellType, token: CancellationToken, triggerCharacter?: boolean): Promise<ITerminalCompletion[] | undefined>;
}

export class TerminalCompletionService extends Disposable implements ITerminalCompletionService {
	declare _serviceBrand: undefined;
	private readonly _providers: Map</*ext id*/string, Map</*provider id*/string, ITerminalCompletionProvider>> = new Map();

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

	constructor(@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService
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
		return toDisposable(() => {
			const extMap = this._providers.get(extensionIdentifier);
			if (extMap) {
				extMap.delete(id);
				if (extMap.size === 0) {
					this._providers.delete(extensionIdentifier);
				}
			}
		});
	}

	async provideCompletions(promptValue: string, cursorPosition: number, shellType: TerminalShellType, token: CancellationToken, triggerCharacter?: boolean): Promise<ITerminalCompletion[] | undefined> {
		if (!this._providers || !this._providers.values) {
			return undefined;
		}

		const extensionCompletionsEnabled = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).enableExtensionCompletions;
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

		if (!extensionCompletionsEnabled) {
			providers = providers.filter(p => p.isBuiltin);
		}

		return this._collectCompletions(providers, shellType, promptValue, cursorPosition, token);
	}

	private async _collectCompletions(providers: ITerminalCompletionProvider[], shellType: TerminalShellType, promptValue: string, cursorPosition: number, token: CancellationToken): Promise<ITerminalCompletion[] | undefined> {
		const completionPromises = providers.map(async provider => {
			if (provider.shellTypes && !provider.shellTypes.includes(shellType)) {
				return undefined;
			}
			const completions: ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined = await provider.provideCompletions(promptValue, cursorPosition, token);
			if (!completions) {
				return undefined;
			}
			const devModeEnabled = this._configurationService.getValue(TerminalSettingId.DevMode);
			const completionItems = Array.isArray(completions) ? completions : completions.items ?? [];

			const itemsWithModifiedLabels = completionItems.map(completion => {
				if (devModeEnabled && !completion.detail?.includes(provider.id)) {
					completion.detail = `(${provider.id}) ${completion.detail ?? ''}`;
				}
				return completion;
			});

			if (Array.isArray(completions)) {
				return itemsWithModifiedLabels;
			} else if (completions.resourceRequestConfig) {
				const resourceCompletions = await this._resolveResources(completions.resourceRequestConfig, cursorPosition);
				if (resourceCompletions) {
					itemsWithModifiedLabels?.push(...resourceCompletions);
				}
				return itemsWithModifiedLabels;
			}
			return;
		});


		const results = await Promise.all(completionPromises);
		return results.filter(result => !!result).flat();
	}
	private async _resolveResources(resourceRequestConfig: TerminalResourceRequestConfig, cursorPosition: number): Promise<ITerminalCompletion[] | undefined> {
		const cwd = resourceRequestConfig.cwd;
		if (!cwd) {
			return;
		}
		const result: ITerminalCompletion[] = [];
		const foldersRequested = resourceRequestConfig.foldersRequested;
		const filesRequested = resourceRequestConfig.filesRequested;

		if (foldersRequested) {
			const folders = await this._getResources(cwd, true);
			result.push(...folders.map(folder => ({
				label: folder,
				kind: TerminalCompletionItemKind.Folder,
				replacementIndex: cursorPosition,
				replacementLength: folder.length
			})));
		}
		if (filesRequested) {
			const files = await this._getResources(cwd, false);
			result.push(...files.map(file => ({
				label: file,
				kind: TerminalCompletionItemKind.File,
				replacementIndex: cursorPosition,
				replacementLength: file.length
			})));
		}
		return result.length ? result : undefined;
	}

	private async _getResources(resource: string, folders: boolean): Promise<string[]> {
		const uri = URI.parse(resource);
		const resources = [uri];
		const paths = [];
		const stats = await this._fileService.resolveAll(resources.map(r => ({ resource: r, options: { resolveSingleChildDescendants: true } })));
		if (folders) {
			const result = stats.filter(stat => stat && stat.stat?.isDirectory);
			for (const r of result) {
				if (r.success) {
					for (const child of r.stat?.children ?? []) {
						if (folders ? child.isDirectory : child.isFile) {
							// make label relative to the cwd
							paths.push('.' + child.resource.fsPath.replace(uri.fsPath, ''));
						}
					}
				}
			}
		}
		return paths;
	}
}

