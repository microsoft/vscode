/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ChatPromptCodec } from '../codecs/chatPromptCodec.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { assert } from '../../../../../../base/common/assert.js';
import { IPromptFileReference, IResolveError } from './types.js';
import { ChatPromptDecoder } from '../codecs/chatPromptDecoder.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { IPromptContentsProvider } from '../contentProviders/types.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { basename, extUri } from '../../../../../../base/common/resources.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
import { ObservableDisposable } from '../../../../../../base/common/observableDisposable.js';
import { FilePromptContentProvider } from '../contentProviders/filePromptContentsProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { OpenFailed, NotPromptFile, RecursiveReference, FolderReference, ParseError, FailedToResolveContentsStream } from '../../promptFileReferenceErrors.js';
import { PromptVariableWithData } from '../codecs/tokens/promptVariable.js';
import { FileReference } from '../codecs/tokens/fileReference.js';

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
export type TErrorCondition = OpenFailed | RecursiveReference | FolderReference | NotPromptFile;

/**
 * Base prompt parser class that provides a common interface for all
 * prompt parsers that are responsible for parsing chat prompt syntax.
 */
export abstract class BasePromptParser<T extends IPromptContentsProvider> extends ObservableDisposable {
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
	 * Whether file references resolution failed.
	 * Set to `undefined` if the `resolve` method hasn't been ever called yet.
	 */
	public get resolveFailed(): boolean | undefined {
		if (!this.firstParseResult.gotFirstResult) {
			return undefined;
		}

		return !!this._errorCondition;
	}

	/**
	 * The promise is resolved when at least one parse result (a stream or
	 * an error) has been received from the prompt contents provider.
	 */
	private firstParseResult = new FirstParseResult();

	/**
	 * Returned promise is resolved when the parser process is settled.
	 * The settled state means that the prompt parser stream exists and
	 * has ended, or an error condition has been set in case of failure.
	 *
	 * Furthermore, this function can be called multiple times and will
	 * block until the latest prompt contents parsing logic is settled
	 * (e.g., for every `onContentChanged` event of the prompt source).
	 */
	public async settled(): Promise<this> {
		assert(
			this.started,
			'Cannot wait on the parser that did not start yet.',
		);

		await this.firstParseResult.promise;

		if (this.errorCondition) {
			return this;
		}

		assertDefined(
			this.stream,
			'No stream reference found.',
		);

		await this.stream.settled;

		return this;
	}

	/**
	 * Same as {@linkcode settled} but also waits for all possible
	 * nested child prompt references and their children to be settled.
	 */
	public async allSettled(): Promise<this> {
		await this.settled();

		await Promise.allSettled(
			this.references.map((reference) => {
				return reference.allSettled();
			}),
		);

		return this;
	}

	constructor(
		private readonly promptContentsProvider: T,
		seenReferences: string[] = [],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
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
			this._onUpdate.fire();
			this.firstParseResult.complete();

			return this;
		}

		// we don't care if reading the file fails below, hence can add the path
		// of the current reference to the `seenReferences` set immediately, -
		// even if the file doesn't exist, we would never end up in the recursion
		seenReferences.push(this.uri.path);

		this._register(
			this.promptContentsProvider.onContentChanged((streamOrError) => {
				// process the received message
				this.onContentsChanged(streamOrError, seenReferences);

				// indicate that we've received at least one `onContentChanged` event
				this.firstParseResult.complete();
			}),
		);
	}

	/**
	 * The latest received stream of prompt tokens, if any.
	 */
	private stream: ChatPromptDecoder | undefined;

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
		// dispose and cleanup the previously received stream
		// object or an error condition, if any received yet
		this.stream?.dispose();
		delete this.stream;
		delete this._errorCondition;

		// dispose all currently existing references
		this.disposeReferences();

		// if an error received, set up the error condition and stop
		if (streamOrError instanceof ParseError) {
			this._errorCondition = streamOrError;
			this._onUpdate.fire();

			return;
		}

		// decode the byte stream to a stream of prompt tokens
		this.stream = ChatPromptCodec.decode(streamOrError);

		// on error or stream end, dispose the stream and fire the update event
		this.stream.on('error', this.onStreamEnd.bind(this, this.stream));
		this.stream.on('end', this.onStreamEnd.bind(this, this.stream));

		// when some tokens received, process and store the references
		this.stream.on('data', (token) => {
			if (token instanceof PromptVariableWithData) {
				try {
					this.onReference(FileReference.from(token), [...seenReferences]);
				} catch (error) {
					// no-op
				}
			}

			// note! the `isURL` is a simple check and needs to be improved to truly
			// 		 handle only file references, ignoring broken URLs or references
			if (token instanceof MarkdownLink && !token.isURL) {
				this.onReference(token, [...seenReferences]);
			}
		});

		// calling `start` on a disposed stream throws, so we warn and return instead
		if (this.stream.disposed) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri)}] cannot start stream that has been already disposed, aborting`,
			);

			return;
		}

		// start receiving data on the stream
		this.stream.start();
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
		_stream: ChatPromptDecoder,
		error?: Error,
	): this {
		if (error) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri)}] received an error on the chat prompt decoder stream: ${error}`,
			);
		}

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
	 * Private attribute to track if the {@linkcode start}
	 * method has been already called at least once.
	 */
	private started: boolean = false;

	/**
	 * Start the prompt parser.
	 */
	public start(): this {
		// if already started, nothing to do
		if (this.started) {
			return this;
		}
		this.started = true;


		// if already in the error state that could be set
		// in the constructor, then nothing to do
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
				const { errorCondition } = reference;

				// include all references without errors
				if (!errorCondition) {
					return true;
				}

				// filter out folder references from the list
				if (errorCondition instanceof FolderReference) {
					return false;
				}

				// include non-prompt file references
				return (errorCondition instanceof NotPromptFile);
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

				return errorCondition && !(errorCondition instanceof NotPromptFile);
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
	 * @param error Error object that extends {@link ParseError}.
	 * @returns Error message.
	 */
	protected getErrorMessage<TError extends ParseError>(error: TError): string {
		if (error instanceof OpenFailed) {
			return `${errorMessages.fileOpenFailed} '${error.uri.path}'.`;
		}

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
	 * Check if the current reference points to a prompt snippet file.
	 */
	public get isPromptSnippet(): boolean {
		return isPromptFile(this.uri);
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
		this.stream?.dispose();
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
		@ILogService logService: ILogService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		const provider = initService.createInstance(FilePromptContentProvider, fileUri);

		super(provider, seenReferences, initService, logService);
	}

	/**
	 * Get the range of the `link` part of the reference.
	 */
	public get linkRange(): IRange | undefined {
		// `#file:` references
		if (this.token instanceof FileReference) {
			return this.token.dataRange;
		}

		// `markdown link` references
		if (this.token instanceof MarkdownLink) {
			return this.token.linkRange;
		}

		return undefined;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		const prefix = (this.token instanceof FileReference)
			? `${this.token.name}:`
			: 'md-link:';

		return `${prefix}${this.uri.path}`;
	}

	/**
	 * @inheritdoc
	 */
	protected override getErrorMessage(error: ParseError): string {
		// if failed to open a file, return appropriate message and the file path
		if (error instanceof OpenFailed) {
			return `${errorMessages.fileOpenFailed} '${error.uri.path}'.`;
		}

		return super.getErrorMessage(error);
	}
}

/**
 * A tiny utility object that helps us to track existence
 * of at least one parse result from the content provider.
 */
class FirstParseResult extends DeferredPromise<void> {
	/**
	 * Private attribute to track if we have
	 * received at least one result.
	 */
	private _gotResult = false;

	/**
	 * Whether we've received at least one result.
	 */
	public get gotFirstResult(): boolean {
		return this._gotResult;
	}

	/**
	 * Get underlying promise reference.
	 */
	public get promise(): Promise<void> {
		return this.p;
	}

	/**
	 * Complete the underlying promise.
	 */
	public override complete() {
		this._gotResult = true;
		return super.complete(void 0);
	}
}
