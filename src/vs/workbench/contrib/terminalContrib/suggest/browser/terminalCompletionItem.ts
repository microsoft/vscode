/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { basename } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { CompletionItem, CompletionItemKind, CompletionItemProvider } from '../../../../../editor/common/languages.js';
import { ISimpleCompletion, SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Method = 2,
	Alias = 3,
	Argument = 4,
	Option = 5,
	OptionValue = 6,
	Flag = 7,
	SymbolicLinkFile = 8,
	SymbolicLinkFolder = 9,
	// Kinds only for core
	InlineSuggestion = 100,
	InlineSuggestionAlwaysOnTop = 101,
}

// Maps CompletionItemKind from language server based completion to TerminalCompletionItemKind
export function mapLspKindToTerminalKind(lspKind: CompletionItemKind): TerminalCompletionItemKind {
	// TODO: Add more types for different [LSP providers](https://github.com/microsoft/vscode/issues/249480)

	switch (lspKind) {
		case CompletionItemKind.File:
			return TerminalCompletionItemKind.File;
		case CompletionItemKind.Folder:
			return TerminalCompletionItemKind.Folder;
		case CompletionItemKind.Method:
			return TerminalCompletionItemKind.Method;
		case CompletionItemKind.Text:
			return TerminalCompletionItemKind.Argument; // consider adding new type?
		case CompletionItemKind.Variable:
			return TerminalCompletionItemKind.Argument; // ""
		case CompletionItemKind.EnumMember:
			return TerminalCompletionItemKind.OptionValue; // ""
		case CompletionItemKind.Keyword:
			return TerminalCompletionItemKind.Alias;
		default:
			return TerminalCompletionItemKind.Method;
	}
}

export interface ITerminalCompletion extends ISimpleCompletion {
	/**
	 * A custom string that should be input into the terminal when selecting this completion. This
	 * is only required if the label is not what's being input.
	 */
	inputData?: string;

	/**
	 * The kind of terminal completion item.
	 */
	kind?: TerminalCompletionItemKind;

	/**
	 * A flag that can be used to override the kind check and treat this completion as a file when
	 * it comes to sorting. For some pwsh completions come through as methods despite being files,
	 * this makes sure they're sorted correctly.
	 */
	isFileOverride?: boolean;

	/**
	 * Whether the completion is a keyword.
	 */
	isKeyword?: boolean;

	/**
	 * Unresolved completion item from the language server provider/
	 */
	_unresolvedItem?: CompletionItem;

	/**
	 * Provider that can resolve this item
	 */
	_resolveProvider?: CompletionItemProvider;

}

export class TerminalCompletionItem extends SimpleCompletionItem {
	/**
	 * {@link labelLow} without the file extension.
	 */
	labelLowExcludeFileExt: string;

	/**
	 * The lowercase label, when the completion is a file or directory this has  normalized path
	 * separators (/) on Windows and no trailing separator for directories.
	 */
	labelLowNormalizedPath: string;

	/**
	 * The file extension part from {@link labelLow}.
	 */
	fileExtLow: string = '';

	/**
	 * A penalty that applies to completions that are comprised of only punctuation characters or
	 * that applies to files or folders starting with the underscore character.
	 */
	punctuationPenalty: 0 | 1 = 0;

	/**
	 * Completion items details (such as docs) can be lazily resolved when focused.
	 */
	resolveCache?: Promise<void>;

	constructor(
		override readonly completion: ITerminalCompletion
	) {
		super(completion);

		// ensure lower-variants (perf)
		this.labelLowExcludeFileExt = this.labelLow;
		this.labelLowNormalizedPath = this.labelLow;

		// HACK: Treat branch as a path separator, otherwise they get filtered out. Hard code the
		// documentation for now, but this would be better to come in through a `kind`
		// See https://github.com/microsoft/vscode/issues/255864
		if (isFile(completion) || completion.documentation === 'Branch') {
			if (isWindows) {
				this.labelLow = this.labelLow.replaceAll('/', '\\');
			}
		}

		if (isFile(completion)) {
			// Don't include dotfiles as extensions when sorting
			const extIndex = this.labelLow.lastIndexOf('.');
			if (extIndex > 0) {
				this.labelLowExcludeFileExt = this.labelLow.substring(0, extIndex);
				this.fileExtLow = this.labelLow.substring(extIndex + 1);
			}
		}

		if (isFile(completion) || completion.kind === TerminalCompletionItemKind.Folder) {
			if (isWindows) {
				this.labelLowNormalizedPath = this.labelLow.replaceAll('\\', '/');
			}
			if (completion.kind === TerminalCompletionItemKind.Folder) {
				this.labelLowNormalizedPath = this.labelLowNormalizedPath.replace(/\/$/, '');
			}
		}

		this.punctuationPenalty = shouldPenalizeForPunctuation(this.labelLowExcludeFileExt) ? 1 : 0;
	}

	/**
	 * Resolves the completion item's details lazily when needed.
	 */
	async resolve(token: CancellationToken): Promise<void> {

		if (this.resolveCache) {
			return this.resolveCache;
		}

		const unresolvedItem = this.completion._unresolvedItem;
		const provider = this.completion._resolveProvider;

		if (!unresolvedItem || !provider || !provider.resolveCompletionItem) {
			return;
		}

		this.resolveCache = (async () => {
			try {
				const resolved = await provider.resolveCompletionItem!(unresolvedItem, token);
				if (resolved) {
					// Update the completion with resolved details
					if (resolved.detail) {
						this.completion.detail = resolved.detail;
					}
					if (resolved.documentation) {
						this.completion.documentation = resolved.documentation;
					}
				}
			} catch (error) {
				return;
			}
		})();

		return this.resolveCache;
	}

}

function isFile(completion: ITerminalCompletion): boolean {
	return !!(completion.kind === TerminalCompletionItemKind.File || completion.isFileOverride);
}

function shouldPenalizeForPunctuation(label: string): boolean {
	return basename(label).startsWith('_') || /^[\[\]\{\}\(\)\.,;:!?\/\\\-_@#~*%^=$]+$/.test(label);
}
