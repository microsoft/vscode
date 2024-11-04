/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export const ITerminalCompletionService = createDecorator<ITerminalCompletionService>('terminalCompletionService');
export interface ISimpleTerminalCompletion {
	/**
	 * The completion's label which appears on the left beside the icon.
	 */
	label: string;
	/**
	 * The completion's icon to show on the left of the suggest widget.
	 */
	icon?: ThemeIcon;
	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;
	/**
	 * Whether the completion is a file. Files with the same score will be sorted against each other
	 * first by extension length and then certain extensions will get a boost based on the OS.
	 */
	isFile?: boolean;
	/**
	 * Whether the completion is a directory.
	 */
	isDirectory?: boolean;
	/**
	 * Whether the completion is a keyword.
	 */
	isKeyword?: boolean;
}

export interface ICompletionProviderResult {
	items: ISimpleTerminalCompletion[]; replacementIndex?: number; replacementLength?: number;
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
	provideCompletions(value: string): Promise<ICompletionProviderResult | undefined>;
}

export interface ITerminalCompletionService {
	_serviceBrand: undefined;
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider): IDisposable;
	provideCompletions(promptValue: string, shellType: TerminalShellType): Promise<ICompletionProviderResult[] | undefined>;
}

// TODO: make name consistent
export class TerminalCompletionService extends Disposable implements ITerminalCompletionService {
	declare _serviceBrand: undefined;
	private readonly _providers: Map</*ext id*/string, Map</*provider id*/string, ITerminalCompletionProvider>> = new Map();

	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider): IDisposable {
		let extMap = this._providers.get(extensionIdentifier);
		if (!extMap) {
			extMap = new Map();
			this._providers.set(extensionIdentifier, extMap);
		}
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

	async provideCompletions(value: string, shellType: TerminalShellType): Promise<ICompletionProviderResult[] | undefined> {
		const result: ICompletionProviderResult[] = [];
		for (const providers of this._providers.values()) {
			for (const provider of providers.values()) {
				if (provider.shellTypes && !provider.shellTypes.includes(shellType)) {
					continue;
				}
				const completions = await provider.provideCompletions(value);
				if (completions) {
					result.push(completions);
				}
			}
		}
		return result.length > 0 ? result : undefined;
	}
}
