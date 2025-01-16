/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ChatPromptCodec } from '../codecs/chatPromptCodec.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IPromptFileReference, IResolveError } from './types.js';
import { FileReference } from '../codecs/tokens/fileReference.js';
import { ChatPromptDecoder } from '../codecs/chatPromptDecoder.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { IPromptContentsProvider } from '../contentProviders/types.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { basename, extUri } from '../../../../../../base/common/resources.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { TrackedDisposable } from '../../../../../../base/common/trackedDisposable.js';
import { FilePromptContentProvider } from '../contentProviders/filePromptContentsProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { FileOpenFailed, NonPromptSnippetFile, RecursiveReference, ParseError, FailedToResolveContentsStream } from '../../promptFileReferenceErrors.js';

/**
 * Well-known localized error messages.
 */
const errorMessages = {
	recursion: localize('chatPromptInstructionsRecursiveReference', 'Recursive reference found'),
	fileOpenFailed: localize('chatPromptInstructionsFileOpenFailed', 'Failed to open file'),
	streamOpenFailed: localize('chatPromptInstructionsStreamOpenFailed', 'Failed to open contents stream'),
	brokenChild: localize('chatPromptInstructionsBrokenReference', 'Contains a broken reference that will be ignored'),
};

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
		@ILogService protected readonly logService: ILogService,
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

		let currentStream: VSBufferReadableStream | undefined;
		this._register(
			this.promptContentsProvider.onContentChanged((streamOrError) => {
				// destroy previously received stream
				currentStream?.destroy();

				if (!(streamOrError instanceof ParseError)) {
					// save the current stream object so it can be destroyed when/if
					// a new stream is received
					currentStream = streamOrError;
				}

				// process the the received message
				this.onContentsChanged(streamOrError, seenReferences);
			}),
		);
	}

	/**
	 * Handler the event event that is triggered when prompt contents change.
	 *
	 * @param streamOrError Either a binary stream of file contents, or an error object
	 * 						that was generated during the reference resolve attempt.
	 * @param seenReferences List of parent references that we've have already seen
	 * 					 	during the process of traversing the references tree. It's
	 * 						used to prevent the tree navigation to fall into an infinite
	 * 						references recursion.
	 */
	private onContentsChanged(
		streamOrError: VSBufferReadableStream | ParseError,
		seenReferences: string[],
	): void {
		// set the flag indicating that reference resolution was attempted
		this._resolveAttempted = true;

		// dispose all currently existing references
		this.disposeReferences();

		// if an error received, set up the error condition and stop
		if (streamOrError instanceof ParseError) {
			this._errorCondition = streamOrError;
			this._onUpdate.fire();

			return;
		}

		// cleanup existing error condition (if any)
		delete this._errorCondition;

		// decode the byte stream to a stream of prompt tokens
		const stream = ChatPromptCodec.decode(streamOrError);

		// on error or stream end, dispose the stream and fire the update event
		stream.on('error', this.onStreamEnd.bind(this, stream));
		stream.on('end', this.onStreamEnd.bind(this, stream));

		// when some tokens received, process and store the references
		stream.on('data', (token) => {
			if (token instanceof FileReference) {
				this.onReference(token, [...seenReferences]);
			}

			// note! the `isURL` is a simple check and needs to be improved to truly
			// 		 handle only file references, ignoring broken URLs or references
			if (token instanceof MarkdownLink && !token.isURL) {
				this.onReference(token, [...seenReferences]);
			}
		});

		// calling `start` on a disposed stream throws, so we warn and return instead
		if (stream.disposed) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri)}] cannot start stream that has been already disposed, aborting`,
			);

			return;
		}

		// start receiving data on the stream
		stream.start();
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
	 * Handle the `stream` end event.
	 *
	 * @param stream The stream that has ended.
	 * @param error Optional error object if stream ended with an error.
	 */
	private onStreamEnd(
		stream: ChatPromptDecoder,
		error?: Error,
	): this {
		stream.dispose();

		this.logService.warn(
			`[prompt parser][${basename(this.uri)}]} received an error on the chat prompt decoder stream: ${error}`,
		);

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
	public get references(): readonly IPromptFileReference[] {
		return [...this._references];
	}

	/**
	 * Get a list of all references of the prompt, including
	 * all possible nested references its children may have.
	 */
	public get allReferences(): readonly IPromptFileReference[] {
		const result: IPromptFileReference[] = [];

		for (const reference of this.references) {
			result.push(reference);

			if (reference.type === 'file') {
				result.push(...reference.allReferences);
			}
		}

		return result;
	}

	/**
	 * Get list of all valid references.
	 */
	public get allValidReferences(): readonly IPromptFileReference[] {
		return this.allReferences
			// filter out unresolved references
			.filter((reference) => {
				return !reference.resolveFailed;
			});
	}

	/**
	 * Get list of all valid child references as URIs.
	 */
	public get allValidReferencesUris(): readonly URI[] {
		return this.allValidReferences
			.map(child => child.uri);
	}

	/**
	 * List of all errors that occurred while resolving the current
	 * reference including all possible errors of nested children.
	 */
	public get allErrors(): ParseError[] {
		const result: ParseError[] = [];

		// collect error conditions of all child references
		const childErrorConditions = this
			// get entire reference tree
			.allReferences
			// filter out children without error conditions or
			// the ones that are non-prompt snippet files
			.filter((childReference) => {
				const { errorCondition } = childReference;

				return errorCondition && !(errorCondition instanceof NonPromptSnippetFile);
			})
			// map to error condition objects
			.map((childReference): ParseError => {
				const { errorCondition } = childReference;

				// `must` always be `true` because of the `filter` call above
				assertDefined(
					errorCondition,
					`Error condition must be present for '${childReference.uri.path}'.`,
				);

				return errorCondition;
			});
		result.push(...childErrorConditions);

		return result;
	}

	/**
	 * The top most error of the current reference or any of its
	 * possible child reference errors.
	 */
	public get topError(): IResolveError | undefined {
		// get all errors, including error of this object
		const errors = [];
		if (this.errorCondition) {
			errors.push(this.errorCondition);
		}
		errors.push(...this.allErrors);

		// if no errors, nothing to do
		if (errors.length === 0) {
			return undefined;
		}


		// if the first error is the error of the root reference,
		// then return it as an `error` otherwise use `warning`
		const [firstError, ...restErrors] = errors;
		const isRootError = (firstError === this.errorCondition);

		// if a child error - the error is somewhere in the nested references tree,
		// then use message prefix to highlight that this is not a root error
		const prefix = (!isRootError)
			? `${errorMessages.brokenChild}: `
			: '';

		const moreSuffix = restErrors.length > 0
			? `\n-\n +${restErrors.length} more error${restErrors.length > 1 ? 's' : ''}`
			: '';

		const errorMessage = this.getErrorMessage(firstError);
		return {
			isRootError,
			message: `${prefix}${errorMessage}${moreSuffix}`,
		};
	}

	/**
	 * Get message for the provided error condition object.
	 *
	 * @param error Error object.
	 * @returns Error message.
	 */
	protected getErrorMessage(error: ParseError): string {
		// if failed to resolve prompt contents stream, return
		// the approprivate message and the prompt path
		if (error instanceof FailedToResolveContentsStream) {
			return `${errorMessages.streamOpenFailed} '${error.uri.path}'.`;
		}

		// if a recursion, provide the entire recursion path so users
		// can use it for the debugging purposes
		if (error instanceof RecursiveReference) {
			const { recursivePath } = error;

			const recursivePathString = recursivePath
				.map((path) => {
					return basename(URI.file(path));
				})
				.join(' -> ');

			return `${errorMessages.recursion}:\n${recursivePathString}`;
		}

		return error.message;
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
	public readonly type = 'file';

	public readonly range = this.token.range;
	public readonly path: string = this.token.path;
	public readonly text: string = this.token.text;

	constructor(
		public readonly token: FileReference | MarkdownLink,
		dirname: URI,
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		const provider = initService.createInstance(FilePromptContentProvider, fileUri);

		super(provider, seenReferences, initService, configService, logService);
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

	/**
	 * @inheritdoc
	 */
	protected override getErrorMessage(error: ParseError): string {
		// if failed to open a file, return approprivate message and the file path
		if (error instanceof FileOpenFailed) {
			return `${errorMessages.fileOpenFailed} '${error.uri.path}'.`;
		}

		return super.getErrorMessage(error);
	}
}
