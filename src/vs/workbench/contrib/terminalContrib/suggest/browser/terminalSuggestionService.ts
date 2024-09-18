/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { CompletionItemLabel } from '../../../../../editor/common/languages.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export const ITerminalCompletionService = createDecorator<ITerminalCompletionService>('terminalCompletionService');


export interface ITerminalCompletion {

	/**
	 * The label of this completion item. By default
	 * this is also the text that is inserted when selecting
	 * this completion.
	 */
	label: string | CompletionItemLabel;

	/**
	 * The kind of this completion item. Based on the kind,
	 * an icon is chosen.
	 */
	kind?: TerminalCompletionItemKind;

	/**
	 * A human-readable string with additional information
	 * about this item.
	 */
	detail?: string;

	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | MarkdownString;
}


export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Flag = 2,
}

export interface ITerminalCompletionProvider {
	provideCompletions(value: string, shellType: TerminalShellType): Promise<ITerminalCompletion[] | undefined>;
}

export interface ITerminalCompletionService {
	_serviceBrand: undefined;
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider): IDisposable;
	provideCompletions(promptValue: string, shellType: TerminalShellType): Promise<ITerminalCompletion[] | undefined>;
}

export class TerminalSuggestionService extends Disposable implements ITerminalCompletionService {
	declare _serviceBrand: undefined;
	private readonly _providers: Map</*ext id*/string, Map</*provider id*/string, ITerminalCompletionProvider>> = new Map();

	constructor(
	) {
		super();
	}
	registerTerminalCompletionProvider(extensionIdentifier: string, id: string, provider: ITerminalCompletionProvider): IDisposable {
		let extMap = this._providers.get(extensionIdentifier);
		if (!extMap) {
			extMap = new Map();
			this._providers.set(extensionIdentifier, extMap);
		}
		extMap.set(id, provider);
		return toDisposable(() => this._providers.delete(id));
	}

	async provideCompletions(value: string, shellType: TerminalShellType): Promise<ITerminalCompletion[] | undefined> {
		const result: ITerminalCompletion[] = [];
		for (const providers of this._providers.values()) {
			for (const provider of providers.values()) {
				const completions = await provider.provideCompletions(value, shellType);
				if (completions) {
					result.push(...completions);
				}
			}
		}
		return result.length > 0 ? result : undefined;
	}
}
