/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Notes on what to implement next:
 *   - re-trigger suggestions dialog on `folder` selection because the `#file:` references take
 *     `file` paths, therefore a "folder" completion is never final
 *   - provide the same suggestions that the `#file:` variables in the chat input have, e.g.,
 *     recently used files, related files, etc.
 *   - support markdown links; markdown extension does sometimes provide the paths completions, but
 *     the prompt completions give more options (e.g., recently used files, related files, etc.)
 *   - add `Windows` support
 */

import { IPromptsService } from '../service/promptsService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR } from '../promptTypes.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { IPromptFileReference, TPromptReference } from '../parsers/types.js';
import { assert } from '../../../../../../base/common/assert.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';
import { Range } from '../../../../../../editor/common/core/range.js';

/**
 * Finds a file reference that suites the provided `position`.
 */
function findFileReference(references: readonly TPromptReference[], position: Position): IPromptFileReference | undefined {
	for (const reference of references) {
		const { range } = reference;

		// this ensures that we handle only the `#file:` references for now
		if (reference.type === 'file' && reference.subtype === 'prompt' && range.containsPosition(position)) {
			return reference;
		}
	}

	return undefined;
}

/**
 * Provides reference paths autocompletion for the `#file:` variables inside prompts.
 */
export class PromptPathAutocompletion extends Disposable implements CompletionItemProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptPathAutocompletion';

	/**
	 * List of trigger characters handled by this provider.
	 */
	public readonly triggerCharacters = [':', '.', '/'];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,

	) {
		super();

		this._register(this.languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	/**
	 * The main function of this provider that calculates
	 * completion items based on the provided arguments.
	 */
	public async provideCompletionItems(
		model: ITextModel,
		position: Position,
		context: CompletionContext,
		token: CancellationToken,
	): Promise<CompletionList | undefined> {
		assert(
			!token.isCancellationRequested,
			new CancellationError(),
		);

		const parser = this.promptsService.getSyntaxParserFor(model);
		assert(
			parser.isDisposed === false,
			'Prompt parser must not be disposed.',
		);

		// start the parser in case it was not started yet,
		// and wait for it to settle to a final result
		const completed = await parser.start(token).settled();
		if (!completed || token.isCancellationRequested) {
			return undefined;
		}
		const { references, uri } = parser;

		const fileReference = findFileReference(references, position);
		if (!fileReference) {
			return undefined;
		}
		const linkRange = fileReference.linkRange ? Range.lift(fileReference.linkRange) : new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		if (!linkRange.containsPosition(position)) {
			return undefined;
		}
		const linkUntilPosition = model.getValueInRange(linkRange.setEndPosition(position.lineNumber, position.column));
		let i = 0;
		for (i = linkUntilPosition.length - 1; i >= 0; i--) {
			const ch = linkUntilPosition.charAt(i);
			if (ch === '/' || ch === '\\') {
				break;
			}
		}
		const linkUntilSlash = linkUntilPosition.substring(0, i + 1);
		const currentFolder = extUri.resolvePath(dirname(uri), linkUntilSlash);

		const suggestions = await this.getFolderSuggestions(currentFolder, linkRange, linkUntilSlash);
		return { suggestions };
	}

	private async getFolderSuggestions(uri: URI, range: Range, linkUntilSlash: string): Promise<CompletionItem[]> {
		const { children } = await this.fileService.resolve(uri);
		const suggestions: CompletionItem[] = [];

		// no `children` - no suggestions
		if (!children) {
			return suggestions;
		}

		if (!linkUntilSlash) {
			linkUntilSlash = './';
		} else if (!linkUntilSlash.endsWith('/')) {
			linkUntilSlash += '/';
		}

		for (const child of children) {
			const kind = child.isDirectory
				? CompletionItemKind.Folder
				: CompletionItemKind.File;

			const sortText = child.isDirectory
				? '1'
				: '2';

			const insertText = linkUntilSlash + child.name;

			suggestions.push({
				label: child.name,
				kind,
				sortText,
				range,
				insertText: insertText + (child.isDirectory ? '/' : ' '),
				filterText: insertText,
			});
		}

		suggestions.push({
			label: '..',
			kind: CompletionItemKind.Folder,
			insertText: linkUntilSlash + '../',
			range,
			sortText: '0',
			filterText: linkUntilSlash,
		});

		return suggestions;
	}
}
