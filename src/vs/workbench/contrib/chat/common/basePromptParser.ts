/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { extUri } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { assert, assertNever } from '../../../../base/common/assert.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { ChatPromptCodec } from './codecs/chatPromptCodec/chatPromptCodec.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { ChatPromptDecoder } from './codecs/chatPromptCodec/chatPromptDecoder.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
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
 * Represents a single line of a prompt.
 */
export class PromptLine extends Disposable {
	/**
	 * Tokens of the line.
	 */
	private _tokens: TPromptPart[] = [];

	/**
	 * The event is fired when the line is updated.
	 */
	private readonly _onUpdate = this._register(new Emitter<void>());

	/**
	 * Associated prompt decoder instance.
	 */
	private decoder: ChatPromptDecoder;

	constructor(
		public readonly lineToken: Line,
		public readonly dirname: URI,
		protected readonly seenReferences: string[] = [],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configService: IConfigurationService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);

		const stream = newWriteableStream<VSBuffer>(null);
		this.decoder = this._register(ChatPromptCodec.decode(stream));

		const { startLineNumber } = lineToken.range;
		this.decoder.onData((token) => {
			// because the decoder works on top of single line, we
			// need to update token's line number to the correct one
			token.withRange({
				startLineNumber: startLineNumber,
				endLineNumber: startLineNumber,
			});

			// if a file reference token, create a new file reference instance
			if (token instanceof FileReference || token instanceof MarkdownLink) {
				// TODO: @legomushroom - ensure that MD link is a file link
				const fileReference = this.instantiationService
					.createInstance(PromptFileReference, token, dirname, [...seenReferences]);

				this._tokens.push(fileReference);

				fileReference.onUpdate(this._onUpdate.fire);
				fileReference.start();

				this._onUpdate.fire(); // TODO: @legomushroom - do we need this?

				return;
			}

			// TODO: @legomushroom - better way to error out on unsupported token
			assertNever(
				token,
				`Unsupported token '${token}'.`,
			);
		});

		this.decoder.onError((error) => {
			// TODO: @legomushroom - handle the error
			console.log(`[line decoder] error: ${error}`);

			this._onUpdate.fire();
		});

		stream.write(VSBuffer.fromString(this.lineToken.text));
		stream.end();
	}

	/**
	 * Subscribe to line updates.
	 */
	public onUpdate(callback: () => void): void {
		this._register(this._onUpdate.event(callback));
	}

	/**
	 * Get tokens of the line.
	 */
	public get tokens(): readonly TPromptPart[] {
		return [...this._tokens];
	}

	/**
	 * TODO: @legomushroom
	 */
	public start(): this {
		// TODO: @legomushroom - handle the `onError` and `onEnd` events

		// TODO: @legomushroom - do we need this?
		this.decoder.start();

		return this;
	}

	/**
	 * @inheritdoc
	 */
	public override dispose(): void {
		this.decoder.dispose();

		for (const token of this._tokens) {
			// if token has a `dispose` function, call it
			if ('dispose' in token && typeof token.dispose === 'function') {
				token.dispose();
			}
		}

		super.dispose();
	}
}

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
 * TODO: @legomushroom
 */
export class BasePromptParser<T extends IPromptContentsProvider> extends Disposable {
	public disposed: boolean = false;

	/**
	 * Prompt lines.
	 */
	private readonly lines: DisposableMap<number, PromptLine> = this._register(new DisposableMap());

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

				// TODO: @legomushroom - dispose all lines?

				if (streamOrError instanceof ParseError) {
					this._errorCondition = streamOrError;

					return;
				}

				const stream = streamOrError;

				stream.on('data', (line) => {
					this.parseLine(line, [...seenReferences]);
				});

				stream.on('error', (error) => {
					// TODO: @legomushroom - handle the error?
					stream.destroy();
				});

				stream.on('end', () => {
					stream.destroy();
				});

				if (stream instanceof BaseDecoder) {
					stream.start();
				}
			}),
		);
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
	 * TODO: @legomushroom
	 */
	private disposeLine(
		lineNumber: number,
	): this {
		this.lines.deleteAndDispose(lineNumber);

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private parseLine(
		lineToken: Line,
		seenReferences: string[],
	): this {
		const { startLineNumber } = lineToken.range;

		this.disposeLine(startLineNumber);
		this._onUpdate.fire();

		// TODO: @legomushroom - how to better handle the error case?
		assert(
			!this.lines.has(startLineNumber),
			`Must not contain line ${startLineNumber}.`,
		);

		const line = this.instantiationService.createInstance(
			PromptLine,
			lineToken,
			this.dirname,
			[...seenReferences],
		);
		this.lines.set(startLineNumber, line);

		line.onUpdate(this._onUpdate.fire);
		line.start();

		// // TODO: @legomushroom - do we need this?
		// this._onUpdate.fire();

		return this;
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
	 * TODO: @legomushroom
	 */
	public get tokens(): readonly TPromptPart[] {
		const result = [];

		// TODO: @legomushroom
		// // then add self to the result
		// result.push(this);

		// get getTokensed children references
		for (const line of this.lines.values()) {
			result.push(...line.tokens);
		}

		return result;
	}

	/**
	 * TODO: @legomushroom
	 */
	public get tokensTree(): readonly TPromptPart[] {
		const result: TPromptPart[] = [];

		for (const token of this.tokens) {
			result.push(token);

			// TODO: @legomushroom - support `markdown links`
			if (token.type === 'file-reference') {
				result.push(...token.tokensTree);
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
		return this.tokens
			// TODO: @legomushroom
			// // skip the root reference itself (this variable)
			// .slice(1)
			// filter out unresolved references
			.filter((reference) => {
				if (reference.resolveFailed) {
					return false;
				}

				// TODO: @legomushroom
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

		this.disposed = true; // TODO: @legomushroom - reuse a common class?
		this.lines.clearAndDisposeAll();
		this._onUpdate.fire();

		super.dispose();
	}
}

/**
 * Prompt file reference object represents any file reference
 * inside prompt text  contents (e.g. `#file:/path/to/file.md`
 * or `[#file:file.md](/path/to/file.md)`).
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
		// TODO: @legomushroom - support `markdown links` too
		return `${FileReference.TOKEN_START}${this.uri.path}`;
	}
}
