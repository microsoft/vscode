/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TopError } from './topError.js';
import { ChatModeKind } from '../../constants.js';
import { TMetadata } from './promptHeader/headerBase.js';
import { ModeHeader } from './promptHeader/modeHeader.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptToken } from '../codecs/tokens/promptToken.js';
import * as path from '../../../../../../base/common/path.js';
import { ChatPromptCodec } from '../codecs/chatPromptCodec.js';
import { FileReference } from '../codecs/tokens/fileReference.js';
import { ChatPromptDecoder } from '../codecs/chatPromptDecoder.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { InstructionsHeader } from './promptHeader/instructionsHeader.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { PromptVariableWithData } from '../codecs/tokens/promptVariable.js';
import type { IPromptContentsProvider } from '../contentProviders/types.js';
import type { TPromptReference, ITopError } from './types.js';
import { type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { assert, assertNever } from '../../../../../../base/common/assert.js';
import { basename, dirname, joinPath } from '../../../../../../base/common/resources.js';
import { BaseToken } from '../codecs/base/baseToken.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { type IRange, Range } from '../../../../../../editor/common/core/range.js';
import { PromptHeader, type TPromptMetadata } from './promptHeader/promptHeader.js';
import { ObservableDisposable } from '../utils/observableDisposable.js';
import { INSTRUCTIONS_LANGUAGE_ID, MODE_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../promptTypes.js';
import { LinesDecoder } from '../codecs/base/linesCodec/linesDecoder.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownLink } from '../codecs/base/markdownCodec/tokens/markdownLink.js';
import { MarkdownToken } from '../codecs/base/markdownCodec/tokens/markdownToken.js';
import { FrontMatterHeader } from '../codecs/base/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { OpenFailed, NotPromptFile, RecursiveReference, FolderReference, ResolveError } from '../../promptFileReferenceErrors.js';
import { type IPromptContentsProviderOptions } from '../contentProviders/promptContentsProviderBase.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../../../base/common/network.js';

/**
 * Options of the {@link BasePromptParser} class.
 */
export interface IBasePromptParserOptions {
}

export type IPromptParserOptions = IBasePromptParserOptions & IPromptContentsProviderOptions;


/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = OpenFailed | RecursiveReference | FolderReference | NotPromptFile;

/**
 * Base prompt parser class that provides a common interface for all
 * prompt parsers that are responsible for parsing chat prompt syntax.
 */
export class BasePromptParser<TContentsProvider extends IPromptContentsProvider> extends ObservableDisposable {
	/**
	 * Options passed to the constructor.
	 */
	protected readonly options: IBasePromptParserOptions;

	/**
	 * List of all tokens that were parsed from the prompt contents so far.
	 */
	public get tokens(): readonly BaseToken[] {
		return [...this.receivedTokens];
	}
	/**
	 * Private field behind the readonly {@link tokens} property.
	 */
	private receivedTokens: BaseToken[] = [];

	/**
	 * List of file references in the current branch of the file reference tree.
	 */
	private readonly _references: TPromptReference[] = [];

	/**
	 * Reference to the prompt header object that holds metadata associated
	 * with the prompt.
	 */
	private promptHeader?: PromptHeader | InstructionsHeader | ModeHeader | undefined;

	/**
	 * Reference to the prompt header object that holds metadata associated
	 * with the prompt.
	 */
	public get header(): PromptHeader | InstructionsHeader | ModeHeader | undefined {
		return this.promptHeader;
	}

	/**
	 * Get contents of the prompt body.
	 */
	public async getBody(): Promise<string> {
		const startLineNumber = (this.header !== undefined)
			? this.header.range.endLineNumber + 1
			: 1;

		const decoder = new LinesDecoder(
			await this.promptContentsProvider.contents,
		);

		const tokens = (await decoder.consumeAll())
			.filter(({ range }) => {
				return (range.startLineNumber >= startLineNumber);
			});

		return BaseToken.render(tokens);
	}

	/**
	 * The event is fired when lines or their content change.
	 */
	private readonly _onUpdate = this._register(new Emitter<void>());
	/**
	 * Subscribe to the event that is fired the parser state or contents
	 * changes, including changes in the possible prompt child references.
	 */
	public readonly onUpdate = this._onUpdate.event;

	/**
	 * Event that is fired when the current prompt parser is settled.
	 */
	private readonly _onSettled = this._register(new Emitter<Error | undefined>());

	/**
	 * Event that is fired when the current prompt parser is settled.
	 */
	public onSettled(
		callback: (error?: Error) => void,
	): IDisposable {
		const disposable = this._onSettled.event(callback);
		const streamEnded = (this.stream?.ended && (this.stream.isDisposed === false));

		// if already in the error state or stream has already ended,
		// invoke the callback immediately but asynchronously
		if (streamEnded || this.errorCondition) {
			setTimeout(callback.bind(undefined, this.errorCondition));

			return disposable;
		}

		return disposable;
	}

	/**
	 * If failed to parse prompt contents, this property has
	 * an error object that describes the failure reason.
	 */
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
	private readonly firstParseResult = new FirstParseResult();

	/**
	 * Returned promise is resolved when the parser process is settled.
	 * The settled state means that the prompt parser stream exists and
	 * has ended, or an error condition has been set in case of failure.
	 *
	 * Furthermore, this function can be called multiple times and will
	 * block until the latest prompt contents parsing logic is settled
	 * (e.g., for every `onContentChanged` event of the prompt source).
	 */
	public async settled(): Promise<boolean> {
		assert(
			this.started,
			'Cannot wait on the parser that did not start yet.',
		);

		await this.firstParseResult.promise;

		if (this.errorCondition) {
			return false;
		}

		// by the time when the `firstParseResult` promise is resolved,
		// this object may have been already disposed, hence noop
		if (this.isDisposed) {
			return false;
		}

		assertDefined(
			this.stream,
			'No stream reference found.',
		);

		const completed = await this.stream.settled;

		// if prompt header exists, also wait for it to be settled
		if (this.promptHeader) {
			const headerCompleted = await this.promptHeader.settled;
			if (!headerCompleted) {
				return false;
			}
		}

		return completed;
	}

	constructor(
		private readonly promptContentsProvider: TContentsProvider,
		options: IBasePromptParserOptions,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService private readonly envService: IWorkbenchEnvironmentService,
		@ILogService protected readonly logService: ILogService,
	) {
		super();

		this.options = options;

		this._register(
			this.promptContentsProvider.onContentChanged((streamOrError) => {
				// process the received message
				this.onContentsChanged(streamOrError);

				// indicate that we've received at least one `onContentChanged` event
				this.firstParseResult.end();
			}),
		);

		// dispose self when contents provider is disposed
		this._register(
			this.promptContentsProvider.onDispose(this.dispose.bind(this)),
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
		streamOrError: VSBufferReadableStream | ResolveError
	): void {
		// dispose and cleanup the previously received stream
		// object or an error condition, if any received yet
		this.stream?.dispose();
		delete this.stream;
		delete this._errorCondition;
		this.receivedTokens = [];

		// cleanup current prompt header object
		this.promptHeader?.dispose();
		delete this.promptHeader;

		// dispose all currently existing references
		this.disposeReferences();

		// if an error received, set up the error condition and stop
		if (streamOrError instanceof ResolveError) {
			this._errorCondition = streamOrError;
			this._onUpdate.fire();

			// when error received fire the 'onSettled' event immediately
			this._onSettled.fire(streamOrError);

			return;
		}

		// decode the byte stream to a stream of prompt tokens
		this.stream = ChatPromptCodec.decode(streamOrError);

		/**
		 * !NOTE! The order of event subscriptions below is critical here because
		 *        the `data` event is also starts the stream, hence changing
		 *        the order of event subscriptions can lead to race conditions.
		 *        See {@link ReadableStreamEvents} for more info.
		 */

		// on error or stream end, dispose the stream and fire the update event
		this.stream.on('error', this.onStreamEnd.bind(this, this.stream));
		this.stream.on('end', this.onStreamEnd.bind(this, this.stream));

		// when some tokens received, process and store the references
		this.stream.on('data', (token) => {
			// store all markdown and prompt token references
			if ((token instanceof MarkdownToken) || (token instanceof PromptToken)) {
				this.receivedTokens.push(token);
			}

			// if a prompt header token received, create a new prompt header instance
			if (token instanceof FrontMatterHeader) {
				return this.createHeader(token);
			}

			// try to convert a prompt variable with data token into a file reference
			if (token instanceof PromptVariableWithData) {
				try {
					this.handleLinkToken(FileReference.from(token));
				} catch (error) {
					// the `FileReference.from` call might throw if the `PromptVariableWithData` token
					// can not be converted into a valid `#file` reference, hence we ignore the error
				}
			}

			// note! the `isURL` is a simple check and needs to be improved to truly
			// 		 handle only file references, ignoring broken URLs or references
			if (token instanceof MarkdownLink && !token.isURL) {
				this.handleLinkToken(token);
			}
		});

		// calling `start` on a disposed stream throws, so we warn and return instead
		if (this.stream.isDisposed) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri)}] cannot start stream that has been already disposed, aborting`,
			);

			return;
		}

		// start receiving data on the stream
		this.stream.start();
	}

	/**
	 * Create header object base on the target prompt file language ID.
	 * The language ID is important here, because it defines what type
	 * of metadata is valid for a prompt file and what type of related
	 * diagnostics we would show to the user.
	 */
	private createHeader(headerToken: FrontMatterHeader): void {
		const { languageId } = this.promptContentsProvider;

		if (languageId === PROMPT_LANGUAGE_ID) {
			this.promptHeader = new PromptHeader(headerToken, languageId);
		}

		if (languageId === INSTRUCTIONS_LANGUAGE_ID) {
			this.promptHeader = new InstructionsHeader(headerToken, languageId);
		}

		if (languageId === MODE_LANGUAGE_ID) {
			this.promptHeader = new ModeHeader(headerToken, languageId);
		}

		this.promptHeader?.start();
	}

	/**
	 * Handle a new reference token inside prompt contents.
	 */
	private handleLinkToken(token: FileReference | MarkdownLink): this {

		let referenceUri: URI;
		if (path.isAbsolute(token.path)) {
			referenceUri = URI.file(token.path);
			if (this.envService.remoteAuthority) {
				referenceUri = referenceUri.with({
					scheme: Schemas.vscodeRemote,
					authority: this.envService.remoteAuthority,
				});
			}
		} else {
			referenceUri = joinPath(dirname(this.uri), token.path);
		}
		this._references.push(new PromptReference(referenceUri, token));

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
		// decoders can fire the 'end' event also when they are get disposed,
		// but because we dispose them when a new stream is received, we can
		// safely ignore the event in this case
		if (stream.isDisposed === true) {
			return this;
		}

		if (error) {
			this.logService.warn(
				`[prompt parser][${basename(this.uri)}] received an error on the chat prompt decoder stream: ${error}`,
			);
		}

		this._onUpdate.fire();
		this._onSettled.fire(error);

		return this;
	}


	private disposeReferences(): void {


		this._references.length = 0;
	}

	/**
	 * Private attribute to track if the {@link start}
	 * method has been already called at least once.
	 */
	private started: boolean = false;

	/**
	 * Start the prompt parser.
	 */
	public start(token?: CancellationToken): this {
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

		this.promptContentsProvider.start(token);
		return this;
	}

	/**
	 * Associated URI of the prompt.
	 */
	public get uri(): URI {
		return this.promptContentsProvider.uri;
	}

	/**
	 * Get a list of immediate child references of the prompt.
	 */
	public get references(): readonly TPromptReference[] {
		return [...this._references];
	}

	/**
	 * Valid metadata records defined in the prompt header.
	 */
	public get metadata(): TMetadata | null {
		const { promptType } = this.promptContentsProvider;
		if (promptType === 'non-prompt') {
			return null;
		}

		if (this.header === undefined) {
			return { promptType };
		}

		if (this.header instanceof InstructionsHeader || this.header instanceof ModeHeader) {
			return { promptType, ...this.header.metadata };
		}

		const { tools, mode, description, model } = this.header.metadata;

		const result: Partial<TPromptMetadata> = {};

		if (description !== undefined) {
			result.description = description;
		}

		if (tools !== undefined && mode !== ChatModeKind.Ask && mode !== ChatModeKind.Edit) {
			result.tools = tools;
			result.mode = ChatModeKind.Agent;
		} else if (mode !== undefined) {
			result.mode = mode;
		}

		if (model !== undefined) {
			result.model = model;
		}

		return { promptType, ...result };
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

		return undefined;
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
	public override dispose(): void {
		if (this.isDisposed) {
			return;
		}

		this.disposeReferences();

		this.stream?.dispose();
		delete this.stream;

		this.promptHeader?.dispose();
		delete this.promptHeader;

		super.dispose();
	}
}

/**
 * Prompt reference object represents any reference inside prompt text
 * contents. For instance the file variable(`#file:/path/to/file.md`) or
 * a markdown link(`[#file:file.md](/path/to/file.md)`).
 */
export class PromptReference implements TPromptReference {


	constructor(
		public readonly uri: URI,
		public readonly token: FileReference | MarkdownLink,
	) {
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
	 * Type of the reference, - either a prompt `#file` variable,
	 * or a `markdown link` reference (`[caption](/path/to/file.md)`).
	 */
	public get type(): 'file' {
		if (this.token instanceof FileReference) {
			return 'file';
		}

		if (this.token instanceof MarkdownLink) {
			return 'file';
		}

		assertNever(
			this.token,
			`Unknown token type '${this.token}'.`,
		);
	}

	/**
	 * Subtype of the reference, - either a prompt `#file` variable,
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

	public get range(): Range {
		return this.token.range;
	}

	public get path(): string {
		return this.token.path;
	}

	public get text(): string {
		return this.token.text;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public toString(): string {
		return `prompt-reference/${this.type}:${this.subtype}/${this.token}`;
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
	public end(): void {
		this._gotResult = true;
		super.complete(void 0)
			.catch(() => {
				// the complete method is never fails
				// so we can ignore the error here
			});

		return;
	}
}
