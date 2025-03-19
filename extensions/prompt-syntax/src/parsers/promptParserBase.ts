/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Uri } from 'vscode';
import { basename } from 'path';
import { Emitter } from 'vscode-jsonrpc';
import { URI, Utils as extUri } from 'vscode-uri';

import { TopError } from './topError';
import { isPromptFile } from '../constants';
import { FileContentsProvider } from './contentProviders';
import { IContentsProvider } from './contentProviders/types';
import { MarkdownLink } from '../codecs/markdownCodec/tokens';
import { assertDefined, assertNever } from '../utils/asserts';
import { PromptCodec } from '../codecs/promptCodec/promptCodec';
import { PromptDecoder } from '../codecs/promptCodec/promptDecoder';
import { IFileSystemService, ILogService } from '../services/types';
import { FileReference, PromptVariableWithData } from '../codecs/promptCodec/tokens';
import { IPromptFileReference, IPromptReference, IResolveError, ITopError } from './types';
import { ResolveError, OpenFailed, RecursiveReference, FolderReference, NotPromptFile } from './errors';
import { DeferredPromise, IRange, ObservableDisposable, VSBuffer, type ReadableStream } from '../utils/vscode';

/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = OpenFailed | RecursiveReference | FolderReference | NotPromptFile;

/**
 * Base prompt parser class that provides a common interface for all
 * prompt parsers that are responsible for parsing chat prompt syntax.
 */
export abstract class PromptParserBase<T extends IContentsProvider> extends ObservableDisposable {
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

	private _errorCondition?: ResolveError;

	/**
	 * If file reference resolution fails, this attribute will be set
	 * to an error instance that describes the error condition.
	 */
	public get errorCondition(): ResolveError | undefined {
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
		protected readonly filesystemService: IFileSystemService,
		protected readonly logService: ILogService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);
		this._register(promptContentsProvider);

		// to prevent infinite file recursion, we keep track of all references in
		// the current branch of the file reference tree and check if the current
		// file reference has been already seen before
		if (seenReferences.includes(this.uri.path)) {
			seenReferences.push(this.uri.path);

			this._errorCondition = new RecursiveReference(
				this.uri,
				seenReferences,
			);
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
	private stream: PromptDecoder | undefined;

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
		streamOrError: ReadableStream<VSBuffer> | ResolveError,
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
		if (streamOrError instanceof ResolveError) {
			this._errorCondition = streamOrError;
			this._onUpdate.fire();

			return;
		}

		// decode the byte stream to a stream of prompt tokens
		this.stream = PromptCodec.decode(streamOrError);

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
				`[prompt parser][${basename(this.uri.fsPath)}] cannot start stream that has been already disposed, aborting`,
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
		const fileReference = new PromptFileReference(
			token,
			this.dirname,
			seenReferences,
			this.filesystemService,
			this.logService,
		);

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
		_stream: PromptDecoder,
		error?: Error,
	): this {
		if (error) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri.fsPath)}] received an error on the chat prompt decoder stream: ${error}`,
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
		return Uri.joinPath(this.uri, '..');
	}

	/**
	 * Get a list of immediate child references of the prompt.
	 */
	public get references(): readonly IPromptReference[] {
		return [...this._references];
	}

	/**
	 * Get a list of all references of the prompt, including
	 * all possible nested references its children may have.
	 */
	public get allReferences(): readonly IPromptReference[] {
		const result: IPromptReference[] = [];

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
	public get allValidReferences(): readonly IPromptReference[] {
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
	 * Get list of errors for the direct links of the current reference.
	 */
	public get errors(): readonly ResolveError[] {
		const childErrors: ResolveError[] = [];

		for (const reference of this.references) {
			const { errorCondition } = reference;

			if (errorCondition && (!(errorCondition instanceof NotPromptFile))) {
				childErrors.push(errorCondition);
			}
		}

		return childErrors;
	}

	/**
	 * List of all errors that occurred while resolving the current
	 * reference including all possible errors of nested children.
	 */
	public get allErrors(): readonly IResolveError[] {
		const result: IResolveError[] = [];

		for (const reference of this.references) {
			const { errorCondition } = reference;

			if (errorCondition && (!(errorCondition instanceof NotPromptFile))) {
				result.push({
					originalError: errorCondition,
					parentUri: this.uri,
				});
			}

			// recursively collect all possible errors of its children
			result.push(...reference.allErrors);
		}

		return result;
	}

	/**
	 * The top most error of the current reference or any of its
	 * possible child reference errors.
	 */
	public get topError(): ITopError | undefined {
		if (this.errorCondition) {
			return new TopError({
				errorSubject: 'root',
				errorsCount: 1,
				originalError: this.errorCondition,
			});
		}

		const childErrors: ResolveError[] = [...this.errors];
		const nestedErrors: IResolveError[] = [];
		for (const reference of this.references) {
			nestedErrors.push(...reference.allErrors);
		}

		if (childErrors.length === 0 && nestedErrors.length === 0) {
			return undefined;
		}

		const firstDirectChildError = childErrors[0];
		const firstNestedChildError = nestedErrors[0];
		const hasDirectChildError = (firstDirectChildError !== undefined);

		const firstChildError = (hasDirectChildError)
			? {
				originalError: firstDirectChildError,
				parentUri: this.uri,
			}
			: firstNestedChildError;

		const totalErrorsCount = childErrors.length + nestedErrors.length;

		const subject = (hasDirectChildError)
			? 'child'
			: 'indirect-child';

		return new TopError({
			errorSubject: subject,
			originalError: firstChildError.originalError,
			parentUri: firstChildError.parentUri,
			errorsCount: totalErrorsCount,
		});
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
 * text contents. For instance the file variable(`#file:/path/to/file.md`)
 * or a markdown link(`[#file:file.md](/path/to/file.md)`).
 */
// TODO: @legomushroom - add unit tests
export class PromptFileReference extends PromptParserBase<FileContentsProvider> implements IPromptFileReference {
	public readonly type = 'file';

	public readonly range = this.token.range;
	public readonly path: string = this.token.path;
	public readonly text: string = this.token.text;

	constructor(
		public readonly token: FileReference | MarkdownLink,
		dirname: URI,
		seenReferences: string[] = [],
		filesystemService: IFileSystemService,
		logService: ILogService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		const provider = new FileContentsProvider(fileUri, filesystemService, logService);

		super(provider, seenReferences, filesystemService, logService);
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
	 * Subtype of a file reference, - either a prompt `#file` variable,
	 * or a `markdown link` reference (`[caption](/path/to/file.md)`).
	 */
	public get subtype(): 'prompt' | 'markdown' {
		if (this.token instanceof FileReference) {
			return 'prompt';
		}

		if (this.token instanceof MarkdownLink) {
			return 'markdown';
		}

		assertNever(
			this.token,
			`Unknown token type '${this.token}'.`,
		);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `prompt-reference/${this.token}`;
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
