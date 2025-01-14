/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { extUri } from '../../../../base/common/resources.js';
import { ChatPromptCodec } from './codecs/chatPromptCodec/chatPromptCodec.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { TrackedDisposable } from '../../../../base/common/trackedDisposable.js';
import { IPromptFileReference, IPromptContentsProvider, TPromptPart } from './basePromptTypes.js';
import { FilePromptContentProvider } from './promptContentProviders/filePromptContentsProvider.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { MarkdownLink } from '../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { FileOpenFailed, NonPromptSnippetFile, RecursiveReference, ParseError } from './promptFileReferenceErrors.js';

/**
 * TODO: @legomushroom - move to the correct place
 */

/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = FileOpenFailed | RecursiveReference | NonPromptSnippetFile;

/**
 * File extension for the prompt snippets.
 */
export const PROMP_SNIPPET_FILE_EXTENSION: string = '.prompt.md';

/**
 * Configuration key for the prompt snippets feature.
 */
const PROMPT_SNIPPETS_CONFIG_KEY: string = 'chat.experimental.prompt-snippets';

/**
 * Base prompt parser class that provides a common interface for all
 * prompt parsers that are responsible for parsing chat prompt syntax.
 */
export abstract class BasePromptParser<T extends IPromptContentsProvider> extends TrackedDisposable {

	/**
	 * List of file references in the current branch of the file reference tree.
	 */
	private readonly _references: PromptFileReference[] = [];

	/**
	 * The event is fired when lines or their content change.
	 */
	private readonly _onUpdate = this._register(new Emitter<void>());

	/**
	 * Subscribe to the `onUpdate` event that is fired when prompt tokens are updated.
	 * @param callback The callback function to be called on updates.
	 */
	public onUpdate(callback: () => void): this {
		this._register(this._onUpdate.event(callback));

		return this;
	}

	private _errorCondition?: ParseError;

	/**
	 * If file reference resolution fails, this attribute will be set
	 * to an error instance that describes the error condition.
	 */
	public get errorCondition(): ParseError | undefined {
		return this._errorCondition;
	}

	/**
	 * Whether file reference resolution was attempted at least once.
	 */
	private _resolveAttempted: boolean = false;

	/**
	 * Whether file references resolution failed.
	 * Set to `undefined` if the `resolve` method hasn't been ever called yet.
	 */
	public get resolveFailed(): boolean | undefined {
		if (!this._resolveAttempted) {
			return undefined;
		}

		return !!this._errorCondition;
	}

	constructor(
		private readonly promptContentsProvider: T,
		seenReferences: string[] = [],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configService: IConfigurationService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);
		this._register(promptContentsProvider);

		// to prevent infinite file recursion, we keep track of all references in
		// the current branch of the file reference tree and check if the current
		// file reference has been already seen before
		if (seenReferences.includes(this.uri.path)) {
			seenReferences.push(this.uri.path);

			this._errorCondition = new RecursiveReference(this.uri, seenReferences);
			this._resolveAttempted = true;
			this._onUpdate.fire();

			return this;
		}

		// we don't care if reading the file fails below, hence can add the path
		// of the current reference to the `seenReferences` set immediately, -
		// even if the file doesn't exist, we would never end up in the recursion
		seenReferences.push(this.uri.path);

		this._register(
			this.promptContentsProvider.onContentChanged((streamOrError) => {
				this._resolveAttempted = true;

				// dispose all existing references
				this.disposeReferences();

				// if an error received, set up the error condition and stop
				if (streamOrError instanceof ParseError) {
					this._errorCondition = streamOrError;
					this._onUpdate.fire();

					return;
				}

				const stream = ChatPromptCodec.decode(streamOrError);
				stream.on('error', (error) => {
					// TODO: @legomushroom - handle the error?
					stream.dispose();
				});

				stream.on('end', () => {
					stream.dispose();
				});

				stream.on('data', (token) => {
					if (token instanceof FileReference) {
						this.onReference(token, [...seenReferences]);
					}

					// note! the `isURL` is a simple check and needs to be improved
					// 		 to truly handle only prompt snippet file references
					if (token instanceof MarkdownLink && !token.isURL) {
						this.onReference(token, [...seenReferences]);
					}
				});

				stream.start();
			}),
		);
	}

	/**
	 * Handle a new reference token inside prompt contents.
	 */
	private onReference(
		token: FileReference | MarkdownLink,
		seenReferences: string[],
	): this {
		const fileReference = this.instantiationService
			.createInstance(PromptFileReference, token, this.dirname, seenReferences);

		this._references.push(fileReference);

		fileReference.onUpdate(this._onUpdate.fire);
		fileReference.start();

		this._onUpdate.fire();

		return this;
	}

	/**
	 * Dispose all currently held references.
	 */
	private disposeReferences() {
		for (const reference of [...this._references]) {
			reference.dispose();
		}

		this._references.length = 0;
	}

	/**
	 * Start the prompt parser.
	 */
	public start(): this {
		// if already in error state, nothing to do
		if (this.errorCondition) {
			return this;
		}

		this.promptContentsProvider.start();

		return this;
	}

	/**
	 * Associated URI of the prompt.
	 */
	public get uri(): URI {
		return this.promptContentsProvider.uri;
	}

	/**
	 * Get the parent folder of the file reference.
	 */
	public get dirname() {
		return URI.joinPath(this.uri, '..');
	}

	/**
	 * Check if the prompt snippets feature is enabled.
	 * @see {@link PROMPT_SNIPPETS_CONFIG_KEY}
	 */
	public static promptSnippetsEnabled(
		configService: IConfigurationService,
	): boolean {
		const value = configService.getValue(PROMPT_SNIPPETS_CONFIG_KEY);

		if (!value) {
			return false;
		}

		if (typeof value === 'string') {
			return value.trim().toLowerCase() === 'true';
		}

		return !!value;
	}

	/**
	 * Get a list of immediate child references of the prompt.
	 */
	public get references(): readonly TPromptPart[] {
		return [...this._references];
	}

	/**
	 * Get a list of all references of the prompt, including
	 * all possible nested references its children may contain.
	 */
	public get allReferences(): readonly TPromptPart[] {
		const result: TPromptPart[] = [];

		for (const reference of this.references) {
			result.push(reference);

			if (reference.type === 'file-reference') {
				result.push(...reference.allReferences);
			}
		}

		return result;
	}

	/**
	 * TODO: @legomushroom
	 */
	public get allValidFileReferenceUris(): readonly URI[] {
		const result: TPromptPart[] = [];

		for (const fileReference of this.validFileReferences) {
			result.push(fileReference);
			result.push(...fileReference.validFileReferences);
		}

		return result.map(child => child.uri);
	}

	/**
	 * Get list of all valid file references.
	 */
	public get validFileReferences(): readonly IPromptFileReference[] {
		return this.references
			// TODO: @legomushroom
			// // skip the root reference itself (this variable)
			// .slice(1)
			// filter out unresolved references
			.filter((reference) => {
				if (reference.resolveFailed) {
					return false;
				}

				return reference.type === 'file-reference';
			});
	}

	/**
	 * Get list of all valid child references as URIs.
	 */
	public get validFileReferenceUris(): readonly URI[] {
		return this.validFileReferences
			.map(child => child.uri);
	}

	/**
	 * Check if the current reference points to a given resource.
	 */
	public sameUri(otherUri: URI): boolean {
		return this.uri.toString() === otherUri.toString();
	}

	/**
	 * Check if the provided URI points to a prompt snippet.
	 */
	public static isPromptSnippet(uri: URI): boolean {
		return uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION);
	}

	/**
	 * Check if the current reference points to a prompt snippet file.
	 */
	public get isPromptSnippet(): boolean {
		return BasePromptParser.isPromptSnippet(this.uri);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `prompt:${this.uri.path}`;
	}

	/**
	 * @inheritdoc
	 */
	public override dispose() {
		if (this.disposed) {
			return;
		}

		this.disposeReferences();
		this._onUpdate.fire();

		super.dispose();
	}
}

/**
 * Prompt file reference object represents any file reference inside prompt
 * text contents. For instanve the file variable(`#file:/path/to/file.md`)
 * or a markdown link(`[#file:file.md](/path/to/file.md)`).
 */
export class PromptFileReference extends BasePromptParser<FilePromptContentProvider> implements IPromptFileReference {
	public readonly type = 'file-reference';

	public readonly range = this.token.range;
	public readonly path: string = this.token.path;
	public readonly text: string = this.token.text;

	constructor(
		public readonly token: FileReference | MarkdownLink,
		dirname: URI,
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		const provider = initService.createInstance(FilePromptContentProvider, fileUri);

		super(provider, seenReferences, initService, configService);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		const prefix = (this.token instanceof FileReference)
			? FileReference.TOKEN_START
			: 'md-link:';

		return `${prefix}${this.uri.path}`;
	}
}
