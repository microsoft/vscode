/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export const ITerminalCompletionService = createDecorator<ITerminalCompletionService>('terminalCompletionService');

export class TerminalCompletionItem {
	label: string;
	icon?: ThemeIcon | undefined;
	detail?: string | undefined;
	isFile?: boolean | undefined;
	isDirectory?: boolean | undefined;
	isKeyword?: boolean | undefined;
	fileArgument?: boolean | undefined;
	folderArgument?: boolean | undefined;
	replacementIndex: number;
	replacementLength: number;

	constructor(label: string, icon?: ThemeIcon, detail?: string, isFile?: boolean, isDirectory?: boolean, isKeyword?: boolean, fileArgument?: boolean, folderArgument?: boolean, replacementIndex?: number, replacementLength?: number) {
		this.label = label;
		this.icon = icon;
		this.detail = detail;
		this.isFile = isFile;
		this.isDirectory = isDirectory;
		this.isKeyword = isKeyword;
		this.fileArgument = fileArgument;
		this.folderArgument = folderArgument;
		this.replacementIndex = replacementIndex ?? 0;
		this.replacementLength = replacementLength ?? 0;
	}
}

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Flag = 2,
	Method = 3
}

// TODO: Make this generic; pwsh native one should implement this
export interface ITerminalCompletionProvider {
	// TODO: Trigger chat props? etc.
	shellTypes?: TerminalShellType[];
	provideCompletions(value: string, cursorPosition: number): Promise<TerminalCompletionItem[] | undefined>;
	triggerCharacters?: string[];
}

export interface ITerminalCompletionService {
	_serviceBrand: undefined;
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider, ...triggerCharacters: string[]): IDisposable;
	provideCompletions(promptValue: string, cursorPosition: number, shellType: TerminalShellType): Promise<TerminalCompletionItem[] | undefined>;
}

// TODO: make name consistent
export class TerminalCompletionService extends Disposable implements ITerminalCompletionService {
	declare _serviceBrand: undefined;
	private readonly _providers: Map</*ext id*/string, Map</*provider id*/string, ITerminalCompletionProvider>> = new Map();

	constructor(@IConfigurationService private readonly _configurationService: IConfigurationService) {
		super();
	}

	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider, ...triggerCharacters: string[]): IDisposable {
		let extMap = this._providers.get(extensionIdentifier);
		if (!extMap) {
			extMap = new Map();
			this._providers.set(extensionIdentifier, extMap);
		}
		provider.triggerCharacters = triggerCharacters;
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

	async provideCompletions(promptValue: string, cursorPosition: number, shellType: TerminalShellType): Promise<TerminalCompletionItem[] | undefined> {
		const completionItems: TerminalCompletionItem[] = [];

		if (!this._providers || !this._providers.values) {
			return undefined;
		}

		for (const providerMap of this._providers.values()) {
			for (const [extensionId, provider] of providerMap) {
				if (provider.shellTypes && !provider.shellTypes.includes(shellType)) {
					continue;
				}
				const completions = await provider.provideCompletions(promptValue, cursorPosition);
				const devModeEnabled = this._configurationService.getValue('terminal.integrated.developer.devMode');
				if (completions) {
					for (const completion of completions) {
						if (devModeEnabled && !completion.detail?.includes(extensionId)) {
							completion.detail = `(${extensionId}) ${completion.detail ?? ''}`;
						}
						completionItems.push(completion);
					}
				}
			}
		}
		return completionItems.length > 0 ? completionItems : undefined;
	}
}
