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

import { LANGUAGE_SELECTOR } from '../constants.js';
import { IPromptsService } from '../service/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IPromptFileReference } from '../parsers/types.js';
import { assertOneOf } from '../../../../../../base/common/types.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { assert, assertNever } from '../../../../../../base/common/assert.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../../common/contributions.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';

/**
 * Type for a filesystem completion item - the one that has its {@link CompletionItem.kind kind} set
 * to either {@link CompletionItemKind.File} or {@link CompletionItemKind.Folder}.
 */
type TFilesystemCompletionItem = CompletionItem & { kind: CompletionItemKind.File | CompletionItemKind.Folder };

/**
 * Type for a "raw" folder suggestion. Unlike the full completion item,
 * this one does not have `insertText` and `range` properties which are
 * meant to be added later.
 */
type TFolderSuggestion = Omit<TFilesystemCompletionItem, 'insertText' | 'range'> & { label: string };

/**
 * Type for trigger characters handled by this autocompletion provider.
 */
type TTriggerCharacter = ':' | '.' | '/';

/**
 * Finds a file reference that suites the provided `position`.
 */
const findFileReference = (
	references: readonly IPromptFileReference[],
	position: Position,
): IPromptFileReference | undefined => {
	for (const reference of references) {
		const { range } = reference;

		// ignore any other types of references
		if (reference.type !== 'file') {
			return undefined;
		}

		// TODO: @lego - put this back?
		// // this ensures that we handle only the `#file:` references for now
		// if (!reference.text.startsWith(FileReference.TOKEN_START)) {
		// 	return undefined;
		// }

		// reference must match the provided position
		const { startLineNumber, endColumn } = range;
		if ((startLineNumber !== position.lineNumber) || (endColumn !== position.column)) {
			continue;
		}

		return reference;
	}

	return undefined;
};

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
	public readonly triggerCharacters: TTriggerCharacter[] = [':', '.', '/'];

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPromptsService private readonly promptSyntaxService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
	) {
		super();

		this._register(this.languageService.completionProvider.register(LANGUAGE_SELECTOR, this));
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

		const { triggerCharacter } = context;

		// it must always have been triggered by a character
		if (!triggerCharacter) {
			return undefined;
		}

		assertOneOf(
			triggerCharacter,
			this.triggerCharacters,
			`Prompt path autocompletion provider`,
		);

		const parser = this.promptSyntaxService.getSyntaxParserFor(model);
		assert(
			!parser.disposed,
			'Prompt parser must not be disposed.',
		);

		// start the parser in case it was not started yet,
		// and wait for it to settle to a final result
		const { references } = await parser
			.start()
			.settled();

		// validate that the cancellation was not yet requested
		assert(
			!token.isCancellationRequested,
			new CancellationError(),
		);

		const fileReference = findFileReference(references, position);
		if (!fileReference) {
			return undefined;
		}

		const modelDirname = dirname(model.uri);

		// in the case of the '.' trigger character, we must check if this is the first
		// dot in the link path, otherwise the dot could be a part of a folder name
		if (triggerCharacter === ':' || (triggerCharacter === '.' && fileReference.path === '.')) {
			return {
				suggestions: await this.getFirstFolderSuggestions(
					triggerCharacter,
					modelDirname,
					fileReference,
				),
			};
		}

		if (triggerCharacter === '/' || triggerCharacter === '.') {
			return {
				suggestions: await this.getNonFirstFolderSuggestions(
					triggerCharacter,
					modelDirname,
					fileReference,
				),
			};
		}

		assertNever(
			triggerCharacter,
			`Unexpected trigger character '${triggerCharacter}'.`,
		);
	}

	/**
	 * Gets "raw" folder suggestions. Unlike the full completion items,
	 * these ones do not have `insertText` and `range` properties which
	 * are meant to be added by the caller later on.
	 */
	private async getFolderSuggestions(
		uri: URI,
	): Promise<TFolderSuggestion[]> {
		const { children } = await this.fileService.resolve(uri);
		const suggestions: TFolderSuggestion[] = [];

		// no `children` - no suggestions
		if (!children) {
			return suggestions;
		}

		for (const child of children) {
			const kind = child.isDirectory
				? CompletionItemKind.Folder
				: CompletionItemKind.File;

			const sortText = child.isDirectory
				? '1'
				: '2';

			suggestions.push({
				label: child.name,
				kind,
				sortText,
			});
		}

		return suggestions;
	}

	/**
	 * Gets suggestions for a first folder/file name in the path. E.g., the one
	 * that follows immediately after the `:` character of the `#file:` variable.
	 *
	 * The main difference between this and "subsequent" folder cases is that in
	 * the beginning of the path the suggestions also contain the `..` item and
	 * the `./` normalization prefix for relative paths.
	 *
	 * See also {@link getNonFirstFolderSuggestions}.
	 */
	private async getFirstFolderSuggestions(
		character: ':' | '.',
		fileFolderUri: URI,
		fileReference: IPromptFileReference,
	): Promise<TFilesystemCompletionItem[]> {
		const { linkRange } = fileReference;

		// when character is `:`, there must be no link present yet
		// otherwise the `:` was used in the middle of the link hence
		// we don't want to provide suggestions for that
		if (character === ':' && linkRange !== undefined) {
			return [];
		}

		// otherwise when the `.` character is present, it is inside the link part
		// of the reference, hence we always expect the link range to be present
		if (character === '.' && linkRange === undefined) {
			return [];
		}

		const suggestions = await this.getFolderSuggestions(fileFolderUri);

		// replacement range of the suggestions
		// when character is `.` we want to also replace it, because we add
		// the `./` at the beginning of all the relative paths
		const startColumnOffset = (character === '.') ? 1 : 0;
		const range = {
			...fileReference.range,
			endColumn: fileReference.range.endColumn,
			startColumn: fileReference.range.endColumn - startColumnOffset,
		};

		return [
			{
				label: '..',
				kind: CompletionItemKind.Folder,
				insertText: '..',
				range,
				sortText: '0',
			},
			...suggestions
				.map((suggestion) => {
					// add space at the end of file names since no completions
					// that follow the file name are expected anymore
					const suffix = (suggestion.kind === CompletionItemKind.File)
						? ' '
						: '';

					return {
						...suggestion,
						range,
						label: `./${suggestion.label}${suffix}`,
						// we use the `./` prefix for consistency
						insertText: `./${suggestion.label}${suffix}`,
					};
				}),
		];
	}

	/**
	 * Gets suggestions for a folder/file name that follows after the first one.
	 * See also {@link getFirstFolderSuggestions}.
	 */
	private async getNonFirstFolderSuggestions(
		character: '/' | '.',
		fileFolderUri: URI,
		fileReference: IPromptFileReference,
	): Promise<TFilesystemCompletionItem[]> {
		const { linkRange, path } = fileReference;

		if (linkRange === undefined) {
			return [];
		}

		const currenFolder = extUri.resolvePath(fileFolderUri, path);
		let suggestions = await this.getFolderSuggestions(currenFolder);

		// when trigger character was a `.`, which is we know is inside
		// the folder/file name in the path, filter out to only items
		// that start with the dot instead of showing all of them
		if (character === '.') {
			suggestions = suggestions.filter((suggestion) => {
				return suggestion.label.startsWith('.');
			});
		}

		// replacement range of the suggestions
		// when character is `.` we want to also replace it too
		const startColumnOffset = (character === '.') ? 1 : 0;
		const range = {
			...fileReference.range,
			endColumn: fileReference.range.endColumn,
			startColumn: fileReference.range.endColumn - startColumnOffset,
		};

		return suggestions
			.map((suggestion) => {
				// add space at the end of file names since no completions
				// that follow the file name are expected anymore
				const suffix = (suggestion.kind === CompletionItemKind.File)
					? ' '
					: '';

				return {
					...suggestion,
					insertText: `${suggestion.label}${suffix}`,
					range,
				};
			});
	}
}

/**
 * We restrict this provider to `Unix` machines for now because of
 * the filesystem paths differences on `Windows` operating system.
 *
 * Notes on `Windows` support:
 * 	- we add the `./` for the first path component, which may not work on `Windows`
 * 	- the first path component of the absolute paths must be a drive letter
 */
if (!isWindows) {
	// register the provider as a workbench contribution
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
		.registerWorkbenchContribution(PromptPathAutocompletion, LifecyclePhase.Eventually);
}
