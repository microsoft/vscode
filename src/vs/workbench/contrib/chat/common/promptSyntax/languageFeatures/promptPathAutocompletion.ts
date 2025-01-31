/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IPromptFileReference } from '../parsers/types.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { dirname, extUri } from '../../../../../../base/common/resources.js';
import { assert, assertNever } from '../../../../../../base/common/assert.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { PROMPT_SNIPPET_FILE_EXTENSION } from '../contentProviders/promptContentsProviderBase.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../../common/contributions.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../../editor/common/languages.js';

/**
 * TODO: @legomushroom - auto re-trigger on folder selection
 * TODO: @legomushroom - test absolute paths more
 */

/**
 * TODO: @legomushroom
 */
const findFileReference = (
	references: readonly IPromptFileReference[],
	position: Position,
): IPromptFileReference | undefined => {
	for (const reference of references) {
		const { range } = reference;
		if (range.startLineNumber !== position.lineNumber) {
			continue;
		}

		if (range.endColumn !== position.column) {
			continue;
		}

		// TODO: @legomushroom - check that reference is the `#file:` one
		if (reference.type !== 'file') {
			return undefined;
		}

		return reference;
	}

	return undefined;
};

/**
 * TODO: @legomushroom
 */
type TFilesystemCompletionItem = CompletionItem & { kind: CompletionItemKind.File | CompletionItemKind.Folder };

/**
 * TODO: @legomushroom
 */
const getReplacementRange = (
	fileReference: IPromptFileReference,
): IRange => {
	return {
		...fileReference.range,
		startColumn: fileReference.range.endColumn,
		endColumn: fileReference.range.endColumn,
	};
};

type TFolderSuggestion = Omit<TFilesystemCompletionItem, 'insertText'> & { label: string };

/**
 * TODO: @legomushroom
 */
const getFolderSuggestions = async (
	uri: URI,
	fileReference: IPromptFileReference,
	fileService: IFileService,
): Promise<TFolderSuggestion[]> => {
	// TODO: @legomushroom - the range does not really belong to this function
	const range = getReplacementRange(fileReference);

	const { children } = await fileService.resolve(uri);
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
			range,
			kind,
			sortText,
		});
	}

	return suggestions;
};

/**
 * TODO: @legomushroom
 */
const getFirstFolderSuggestions = async (
	character: ':' | '.',
	fileFolderUri: URI,
	fileReference: IPromptFileReference,
	fileService: IFileService,
): Promise<TFilesystemCompletionItem[]> => {
	const { linkRange } = fileReference;

	// when character is `:`, there must be no link present yet
	// otherwise the `:` was used in the middle of the link hence
	// we don't want to provide suggestions for that
	if (character === ':' && linkRange !== undefined) {
		return [];
	}

	if (character === '.' && linkRange === undefined) {
		return [];
	}

	const suggestions = await getFolderSuggestions(fileFolderUri, fileReference, fileService);
	const range = getReplacementRange(fileReference);

	// when character is `.` we want to also replace it, because
	// all the `insertText`s already have the dot at the start
	const replacementRange = (character !== '.')
		? range
		: {
			...range,
			startColumn: range.endColumn - 1,
		};

	return [
		{
			label: '..',
			kind: CompletionItemKind.Folder,
			insertText: '..',
			range: replacementRange,
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
					range: replacementRange,
					label: `./${suggestion.label}${suffix}`,
					// we use the `./` prefix for consistency
					insertText: `./${suggestion.label}${suffix}`, // TODO: @legomushroom - this won't work on windows?
				};
			}),
	];
};

/**
 * TODO: @legomushroom
 */
const getNonFirstFolderSuggestions = async (
	fileFolderUri: URI,
	fileReference: IPromptFileReference,
	fileService: IFileService,
): Promise<TFilesystemCompletionItem[]> => {
	const { linkRange, uri } = fileReference;

	if (linkRange === undefined) {
		return [];
	}

	const currenFolder = extUri.resolvePath(fileFolderUri, uri.path);
	const suggestions = await getFolderSuggestions(currenFolder, fileReference, fileService);
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
			};
		});
};

/**
 * TODO: @legomushroom
 */
const getSuggestions = async (
	character: TTriggerCharacter,
	fileFolderUri: URI,
	fileReference: IPromptFileReference,
	fileService: IFileService,
): Promise<TFilesystemCompletionItem[]> => {
	if (character === ':' || character === '.') {
		return getFirstFolderSuggestions(character, fileFolderUri, fileReference, fileService);
	}

	if (character === '/') {
		return getNonFirstFolderSuggestions(fileFolderUri, fileReference, fileService);
	}

	assertNever(
		character,
		`Unexpected trigger character '${character}'.`,
	);
};

/**
 * Prompt files language selector.
 * TODO: @legomushroom - move to a common constant
 */
const languageSelector = {
	pattern: `**/*${PROMPT_SNIPPET_FILE_EXTENSION}`,
};

/**
 * TODO: @legomushroom
 */
type TTriggerCharacter = ':' | '.' | '/';

/**
 * TODO: @legomushroom
 */
function assertOneOf<TType, TSubtype extends TType>(
	character: TType,
	validCharacters: readonly TSubtype[],
	errorPrefix: string,
): asserts character is TSubtype {
	// note! its ok to type cast here because `TSubtype` is a subtype of `TType`
	assert(
		validCharacters.includes(character as TSubtype),
		`${errorPrefix}: Expected '${character}' to be one of [${validCharacters.join(', ')}].`,
	);
}

/**
 * Provides link references for prompt files.
 */
export class PromptPathAutocompletion extends Disposable implements CompletionItemProvider {
	/**
	 * TODO: @legomushroom
	 */
	public readonly _debugDisplayName: string = 'PromptPathAutocompletion';

	/**
	 * TODO: @legomushroom
	 */
	public readonly triggerCharacters: TTriggerCharacter[] = [':', '.', '/'];

	/**
	 * Cache of text model content prompt parsers.
	 */
	private readonly parserProvider: ObjectCache<TextModelPromptParser, ITextModel>;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly initService: IInstantiationService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
	) {
		super();

		this.languageService.completionProvider.register(languageSelector, this);
		this.parserProvider = this._register(new ObjectCache(this.createParser.bind(this)));
	}

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

		const parser = this.parserProvider.get(model);
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

		const suggestions = await getSuggestions(
			triggerCharacter,
			dirname(model.uri),
			fileReference,
			this.fileService,
		);

		return {
			suggestions,
			incomplete: false,
		};
	}

	// TODO: @legomushroom - this should be a part of a common global singleton
	private createParser(
		model: ITextModel,
	): TextModelPromptParser & { disposed: false } {
		const parser: TextModelPromptParser = this.initService.createInstance(
			TextModelPromptParser,
			model,
			[],
		);

		parser.assertNotDisposed(
			'Created prompt parser must not be disposed.',
		);

		return parser;
	}
}

// register the provider as a workbench contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(PromptPathAutocompletion, LifecyclePhase.Eventually);
