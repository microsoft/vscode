/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, assertDefined } from '../../../../base/common/assert.js';
import * as streams from '../../../../base/common/stream.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatAgentLocation } from '../common/chatAgents.js';
import { IChatModel, IChatRequestVariableData, IChatRequestVariableEntry } from '../common/chatModel.js';
import { ChatRequestDynamicVariablePart, ChatRequestToolPart, ChatRequestVariablePart, IParsedChatRequest } from '../common/chatParserTypes.js';
import { IChatContentReference } from '../common/chatService.js';
import { IChatRequestVariableValue, IChatVariableData, IChatVariableResolver, IChatVariableResolverProgress, IChatVariablesService, IDynamicVariable } from '../common/chatVariables.js';
import { IChatWidgetService, showChatView, showEditsView } from './chat.js';
import { ChatDynamicVariableModel } from './contrib/chatDynamicVariables.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ICodec } from '../../../common/codecs/types/ICodec.js';
import { BaseDecoder } from '../../../common/codecs/baseDecoder.js';

interface IChatData {
	data: IChatVariableData;
	resolver: IChatVariableResolver;
}

/*
 * TODO: @legomushroom
 */
const runJobsAndGetSuccesses = async (jobs: Promise<IChatRequestVariableEntry | null>[]): Promise<IChatRequestVariableEntry[]> => {
	return (await Promise.allSettled(jobs))
		// filter out `failed` and `empty` ones
		.filter((result) => {
			return result.status !== 'rejected' && result.value !== null;
		})
		// map to the promise value
		.map((result) => {
			// must always be true because of the filter logic above
			assert(
				result.status === 'fulfilled',
				`Failed to resolve variables: unexpected promise result status "${result.status}".`,
			);
			assert(
				result.value !== null,
				`Failed to resolve variables: promise result must not be null.`,
			);

			return result.value;
		});
};


/*
 * TODO: @legomushroom
 */
const runJobsAndGetSuccesses2 = async (jobs: Promise<IChatRequestVariableEntry[] | null>[]): Promise<IChatRequestVariableEntry[]> => {
	return (await Promise.allSettled(jobs))
		// filter out `failed` and `empty` ones
		.filter((result) => {
			return result.status !== 'rejected' && result.value !== null;
		})
		// map to the promise value
		.flatMap((result) => {
			// must always be true because of the filter logic above
			assert(
				result.status === 'fulfilled',
				`Failed to resolve variables: unexpected promise result status "${result.status}".`,
			);
			assert(
				result.value !== null,
				`Failed to resolve variables: promise result must not be null.`,
			);

			return result.value;
		});
};

/**
 * TODO: @legomushroom
 */
export const todo = (message: string = 'TODO: implement this'): never => {
	throw new Error(`TODO: ${message}`);
};

/**
 * TODO: @legomushroom
 */
export const unimplemented = (message: string = 'Not implemented.'): never => {
	return todo(message);
};

/**
 * Base class for all tokens.
 */
export class Token {
	constructor(
		public readonly range: Range,
	) {
	}
}

/**
 * Token representing a line of text.
 */
export class Line extends Token {
	constructor(
		// the line index
		// Note! 1-based indexing
		lineNumber: number,
		// the line contents
		public readonly text: string,
	) {
		assert(
			!isNaN(lineNumber),
			`The line number must not be a NaN.`,
		);

		assert(
			lineNumber > 0,
			`The line number must be >= 1, got "${lineNumber}".`,
		);

		super(
			new Range(
				lineNumber,
				1,
				lineNumber,
				text.length + 1,
			),
		);
	}
}

/**
 * TODO: @legomushroom
 */
export class LinesCodecDecoder extends BaseDecoder<Line> implements streams.ReadableStream<Line> {
	// TODO: @legomushroom
	private currentChunk: string = '';

	// TODO: @legomushroom
	private lastEmittedLineIndex: number = -1;

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(chunk: VSBuffer): void {
		this.currentChunk += chunk.toString();

		// TODO: legomushroom: handle `\r\n` too?
		const lines = this.currentChunk.split('\n');

		// iterate over all lines, emitting `line` objects for each of them,
		// then shorten the `currentChunk` buffer value accordingly
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const maybeNextLine = lines[i + 1];

			// the next line is `undefined` and the current line is `empty`, so we can emit
			// an empty line here, because the original text had a `\n` at this position
			if (line === '') {
				this.emitLine(i, line);

				continue;
			}

			// if there is a next line present, then we can emit the current one
			if (maybeNextLine !== undefined) {
				this.emitLine(i, line);

				continue;
			}

			// there is no next line, but we don't know if the `line` is a full line yet,
			// so we need to wait for some more data to arrive to be sure;
			// this can happen only for the last line in the chunk tho, so assert that here
			// TODO: @legomushroom - emit an `Error` instead?
			assert(
				i === lines.length - 1,
				`The loop must break only on the last line in the chunk, did on ${i}th iteration instead.`,
			);

			break;
		}
	}

	/**
	 * Emit a provided line to the output stream then
	 * shorten the `currentChunk` buffer accordingly.
	 */
	private emitLine(
		lineIndex: number,
		line: string,
	): void {
		// lineIndex is 0-based, but lineNumber is 1-based
		const lineNumber = lineIndex + 1;
		this._onData.fire(new Line(lineNumber, line));

		// store the last emitted line index so we can use it when we need
		// to send the remaining line in the `onStreamEnd` method
		this.lastEmittedLineIndex = lineIndex;

		// TODO: @legomushroom - when `\r\n` is handled, should it be `+ 2` at that point?
		this.currentChunk = this.currentChunk.slice(line.length + 1);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamError(error: Error): void {
		// TODO: @legomushroom - add LinesCodec specific error logic here or delete the override
		super.onStreamError(error);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamEnd(): void {
		// if the `currentChunk` is not empty when the input stream ends,
		// emit the `currentChunk` buffer as the last available line token
		// before firing the `onEnd` event on this stream
		if (this.currentChunk) {
			this.emitLine(
				this.lastEmittedLineIndex + 1,
				this.currentChunk,
			);
		}

		super.onStreamEnd();
	}
}

/**
 * A token that represent a word - a set of continuous
 * characters without `spaces` or `new lines`.
 */
export class Word extends Token {
	constructor(
		/**
		 * The word range.
		 */
		range: Range,
		/**
		 * The string value of the word.
		 */
		public readonly value: string,
	) {
		super(range);
	}

	// TODO: @legomushroom
	public static newOnLine(
		// string value of the word,
		value: string,
		// TODO: @legomushroom
		line: Line,
		// TODO: @legomushroom
		atColumnNumber: number,
	): Space {
		const { range } = line;

		const endPosition = new Position(range.startLineNumber, atColumnNumber + value.length);

		return new Space(Range.fromPositions(
			range.getStartPosition(),
			endPosition,
		));
	}
}

/**
 * A token that represent a `space`.
 */
export class Space extends Token {
	// TODO: @legomushroom
	public static newOnLine(
		// TODO: @legomushroom
		line: Line,
		// TODO: @legomushroom
		atColumnNumber: number,
	): Space {
		const { range } = line;

		// the space token length is 1, hence `+ 1`
		const endPosition = new Position(range.startLineNumber, atColumnNumber + 1);

		return new Space(Range.fromPositions(
			range.getStartPosition(),
			endPosition,
		));
	}
}

/**
 * A token that represent a `new line`.
 */
export class NewLine extends Token { }

/**
 * TODO: @legomushroom
 */
export type TSimpleToken = Word | Space | NewLine;

/**
 * A decoder that can decode a stream of `Line`s into a stream of `Word`, `Space` and `NewLine` tokens.
 */
export class SimpleTokensCodecDecoder extends BaseDecoder<TSimpleToken, Line> implements streams.ReadableStream<TSimpleToken> {
	private lastEmittedToken?: TSimpleToken;

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(line: Line): void {
		// if an empty line is received, emit a `NewLine` token
		// TODO: @legomushroom - we should do this for non-empty lines too
		if (line.text === '') {
			const newLine = new NewLine(line.range);
			this._onData.fire(newLine);
			this.lastEmittedToken = newLine;
			return;
		}

		// split the line by spaces and emit the `Word` and `Space` tokens
		const tokens = line.text.split(' ');
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const maybeNextToken = tokens[i + 1];

			// Get end column number of the last emitted token, if any.
			const endColumn = this.lastEmittedToken
				? this.lastEmittedToken.range.endColumn
				: 1;

			// calculate the token to emit to the output stream
			const tokenToEmit: TSimpleToken = token === ''
				// if the token is empty, emit a `Space` token
				// because we've split the original string by ` `(space)
				? Space.newOnLine(line, endColumn)
				// token does contain some text, so emit a `Word` token
				: Word.newOnLine(token, line, endColumn);

			this.emitToken(tokenToEmit);

			// if there is a next token that is not space(empty), also emit
			// a `Space` token, because all words are separated by spaces
			if (maybeNextToken) {
				const space = Space.newOnLine(
					line,
					tokenToEmit.range.endColumn,
				);
				this.emitToken(space);
			}
		}
	}

	// Emit specified token to the output stream and
	// update the `lastEmittedToken` reference.
	private emitToken(token: TSimpleToken): void {
		this._onData.fire(token);
		this.lastEmittedToken = token;
	}
}

/**
 * TODO: @legomushroom
 */
export interface IPromptFileReference {
	// Full reference string.
	text: string;

	// The range of the reference.
	range: Range;

	// Parsed out URI of the reference.
	uri: URI;
}

// TODO: @legomushroom
export type TPromptToken = IPromptFileReference;

// TODO: @legomushroom
export const FILE_REFERENCE_TOKEN: string = '#file:';

/**
 * TODO: @legomushroom
 */
export class PromptFileReference extends Token implements IPromptFileReference {
	constructor(
		/**
		 * TODO: @legomushroom - add variable descriptions
		*/
		range: Range,
		public readonly text: string,
		public readonly uri: URI,
	) {
		super(range);
	}

	/**
	 * TODO: @legomushroom
	 */
	public static fromGenericWord(word: Word): PromptFileReference {
		const { value } = word;

		assert(
			value.startsWith(FILE_REFERENCE_TOKEN),
			`The reference must start with "${FILE_REFERENCE_TOKEN}", got ${value}.`,
		);

		const maybeReference = value.split(FILE_REFERENCE_TOKEN);

		assert(
			maybeReference.length === 2,
			`The expected reference format is "${FILE_REFERENCE_TOKEN}:filesystem-path", got ${value}.`,
		);

		const [first, second] = maybeReference;

		assert(
			first === '',
			`The reference must start with "${FILE_REFERENCE_TOKEN}", got ${first}.`,
		);

		assert(
			// Note! this accounts for both cases when second is `undefined` or `empty`
			// 		 and we don't care about rest of the "falsy" cases here
			!!second,
			`The reference path must be defined, got ${second}.`,
		);

		return new PromptFileReference(
			word.range,
			value,
			URI.file(second), // TODO: @legomushroom - validate the URI?
		);
	}
}

/**
 * TODO: @legomushroom
 */
export class PromptSyntaxCodecDecoder extends BaseDecoder<TPromptToken, TSimpleToken> implements streams.ReadableStream<TPromptToken> {
	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(simpleToken: TSimpleToken): void {
		// handle the word tokens only
		if (!(simpleToken instanceof Word)) {
			return;
		}

		// handle file references only for now
		const { value } = simpleToken;
		if (!value.startsWith(FILE_REFERENCE_TOKEN)) {
			return;
		}

		this._onData.fire(PromptFileReference.fromGenericWord(simpleToken));
	}
}

/**
 * TODO: @legomushroom
 */
export class PromptSyntaxCodec extends Disposable implements ICodec<VSBuffer, TPromptToken> {
	public encode(_: streams.ReadableStream<TPromptToken>): streams.ReadableStream<VSBuffer> {
		return unimplemented('`PromptSyntaxCodec` does not implement the `encode` method');
	}

	public decode(stream: streams.ReadableStream<VSBuffer>): streams.ReadableStream<TPromptToken> {
		// create the decoder instance as a chain of more trivial decoders
		const decoder = new PromptSyntaxCodecDecoder(
			new SimpleTokensCodecDecoder(
				new LinesCodecDecoder(stream),
			),
		);

		// register to child disposables and return the decoder instance
		return this._register(decoder);
	}
}

// /**
//  * TODO: @legomushroom
//  */
// export class ChatReference extends Disposable {
// 	/**
// 	 * TODO: @legomushroom
// 	 */
// 	private readonly children: ChatReference[] = [];

// 	constructor(
// 		private readonly mainReference: ChatRequestDynamicVariablePart,
// 	) {
// 		super();
// 	}
// }

/**
 * TODO: @legomushroom
 */
class DynamicVariableResolver extends Disposable {
	constructor(
		private readonly fileService: IFileService,
	) {
		super();
		// TODO: @legomushroom - remove
		console.log(this.fileService);
	}

	/**
	 * Resolve the provided dynamic variable.
	 */
	public async resolve(
		dynamicVariable: ChatRequestDynamicVariablePart,
	): Promise<IChatRequestVariableEntry[]> {
		const mainEntry = this.createVariableEntry(dynamicVariable);
		// If the dynamic variable is not a file reference with specific file
		// extension, we can just return it as is
		if (!this.shouldResolveNestedFileReferences(dynamicVariable)) {
			return [mainEntry];
		}

		const { data } = dynamicVariable;

		assertDefined(
			data,
			`Failed to resolve nested file references: "dynamicVariable" does not have a data property.`,
		);
		assert(
			data instanceof URI,
			`Failed to resolve nested file references: "dynamicVariable" must be a URI, got ${data}.`,
		);

		return [
			...(await this.resolveNestedFileReferences(data)),
			mainEntry,
		];
	}

	/**
	 * Resolve nested file references that the file may contain.
	 */
	private async resolveNestedFileReferences(
		fileUri: URI,
	): Promise<IChatRequestVariableEntry[]> {
		try {
			// TODO: @legomushroom - remove
			console.log(fileUri);
			// const fileStream = await this.fileService.readFileStream(fileUri);
			// const promptSyntaxCodec = this._register(new PromptSyntaxCodec());


			// const promptTokensStream = promptSyntaxCodec.decode(fileStream.value);
			// streams.consumeReadable<TPromptToken>(promptTokensStream, token => {
			// 	return new FileContent();
			// });

			// while (fileStream.value.read()) {
			// 	chunks.push(chunk);
			// }

			// fileStream.value
			// TODO: find references in the file
			// TODO: recursivelly resolve nested file references
		} catch (error) {
			// TODO: @legomushroom - add logging / telemetry
			return [];
		}

		return unimplemented();
	}

	/**
	 * If the dynamic variable is a file reference and has a specific file extension,
	 * we need to resolve nested file references that the file may contain.
	 */
	private shouldResolveNestedFileReferences(
		dynamicVariable: ChatRequestDynamicVariablePart,
	): boolean {
		if (!dynamicVariable.isFile) {
			return false;
		}

		// TODO: @legomushroom add more file extensions
		return dynamicVariable.referenceText.endsWith('.copilot-prompt');
	}

	/**
	 * Convert a `ChatRequestDynamicVariablePart` into `IChatRequestVariableEntry`.
	 */
	private createVariableEntry(
		dynamicVariable: ChatRequestDynamicVariablePart,
	): IChatRequestVariableEntry {
		return {
			id: dynamicVariable.id,
			name: dynamicVariable.referenceText,
			range: dynamicVariable.range,
			value: dynamicVariable.data,
			fullName: dynamicVariable.fullName,
			icon: dynamicVariable.icon,
			isFile: dynamicVariable.isFile,
		};
	}
}

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private readonly _resolver = new Map<string, IChatData>();
	private readonly dynamicVariableResolver: DynamicVariableResolver;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IViewsService private readonly viewsService: IViewsService,
		@IFileService fileService: IFileService,
	) {
		this.dynamicVariableResolver = new DynamicVariableResolver(fileService);
	}

	async resolveVariables(
		prompt: IParsedChatRequest,
		attachedContextVariables: IChatRequestVariableEntry[] | undefined,
		model: IChatModel,
		progress: (part: IChatVariableResolverProgress) => void,
		token: CancellationToken,
	): Promise<IChatRequestVariableData> {
		const resolvedVariableJobs: Promise<IChatRequestVariableEntry[] | null>[] = prompt.parts
			.map(async (part) => {
				if (part instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(part.variableName.toLowerCase());
					if (data) {
						const references: IChatContentReference[] = [];
						const variableProgressCallback = (item: IChatVariableResolverProgress) => {
							if (item.kind === 'reference') {
								references.push(item);
								return;
							}
							progress(item);
						};

						try {
							const value = await data.resolver(prompt.text, part.variableArg, model, variableProgressCallback, token);

							if (!value) {
								return null;
							}

							return [{
								id: data.data.id,
								modelDescription: data.data.modelDescription,
								name: part.variableName,
								range: part.range,
								value,
								references,
								fullName: data.data.fullName,
								icon: data.data.icon,
							}];
						} catch (error) {
							onUnexpectedExternalError(error);

							throw error;
						}
					}
				}

				if (part instanceof ChatRequestDynamicVariablePart) {
					return await this.dynamicVariableResolver.resolve(part);
					// {
					// 	id: part.id,
					// 	name: part.referenceText,
					// 	range: part.range,
					// 	value: part.data,
					// 	fullName: part.fullName,
					// 	icon: part.icon,
					// 	isFile: part.isFile,
					// };
				}

				if (part instanceof ChatRequestToolPart) {
					return [{
						id: part.toolId,
						name: part.toolName,
						range: part.range,
						value: undefined,
						isTool: true,
						icon: ThemeIcon.isThemeIcon(part.icon) ? part.icon : undefined,
						fullName: part.displayName,
					}];
				}

				return null;
			});

		const resolvedAttachedContextJobs: Promise<IChatRequestVariableEntry | null>[] = (attachedContextVariables || [])
			.map(async (attachment) => {
				const data = this._resolver.get(attachment.name?.toLowerCase());
				if (data) {
					const references: IChatContentReference[] = [];
					const variableProgressCallback = (item: IChatVariableResolverProgress) => {
						if (item.kind === 'reference') {
							references.push(item);
							return;
						}
						progress(item);
					};

					try {
						const value = await data.resolver(prompt.text, '', model, variableProgressCallback, token);
						if (!value) {
							return null;
						}

						return {
							id: data.data.id,
							modelDescription: data.data.modelDescription,
							name: attachment.name,
							fullName: attachment.fullName,
							range: attachment.range,
							value,
							references,
							icon: attachment.icon,
						};
					} catch (error) {
						onUnexpectedExternalError(error);

						throw error;
					}
				}

				if (attachment.isDynamic || attachment.isTool) {
					return attachment;
				}

				return null;
			});

		// run all jobs in parallel
		const [resolvedVariables, resolvedAttachedContext] = await Promise.all([
			runJobsAndGetSuccesses2(resolvedVariableJobs),
			runJobsAndGetSuccesses(resolvedAttachedContextJobs),
		]);

		// "reverse" resolved variables making the high index to go
		// first so that an upcoming replacement is simple
		resolvedVariables
			.sort((left, right) => {
				assertDefined(
					left.range,
					`Failed to sort resolved variables: "left" variable does not have a range.`,
				);

				assertDefined(
					right.range,
					`Failed to sort resolved variables: "right" variable does not have a range.`,
				);

				return right.range.start - left.range.start;
			});

		return {
			variables: [
				...resolvedVariables,
				...resolvedAttachedContext,
			],
		};
	}

	async resolveVariable(variableName: string, promptText: string, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableValue | undefined> {
		const data = this._resolver.get(variableName.toLowerCase());
		if (!data) {
			return undefined;
		}

		return (await data.resolver(promptText, undefined, model, progress, token));
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariable(name: string): IChatVariableData | undefined {
		return this._resolver.get(name.toLowerCase())?.data;
	}

	getVariables(location: ChatAgentLocation): Iterable<Readonly<IChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => {
			// TODO@jrieken this is improper and should be know from the variable registeration data
			return location !== ChatAgentLocation.Editor || !new Set(['selection', 'editor']).has(data.name);
		});
	}

	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		return model.variables;
	}

	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		const key = data.name.toLowerCase();
		if (this._resolver.has(key)) {
			throw new Error(`A chat variable with the name '${data.name}' already exists.`);
		}
		this._resolver.set(key, { data, resolver });
		return toDisposable(() => {
			this._resolver.delete(key);
		});
	}

	async attachContext(name: string, value: string | URI | Location, location: ChatAgentLocation) {
		if (location !== ChatAgentLocation.Panel && location !== ChatAgentLocation.EditingSession) {
			return;
		}

		const widget = location === ChatAgentLocation.EditingSession
			? await showEditsView(this.viewsService)
			: (this.chatWidgetService.lastFocusedWidget ?? await showChatView(this.viewsService));
		if (!widget || !widget.viewModel) {
			return;
		}

		const key = name.toLowerCase();
		if (key === 'file' && typeof value !== 'string') {
			const uri = URI.isUri(value) ? value : value.uri;
			const range = 'range' in value ? value.range : undefined;
			widget.attachmentModel.addFile(uri, range);
			return;
		}

		const resolved = this._resolver.get(key);
		if (!resolved) {
			return;
		}

		widget.attachmentModel.addContext({ ...resolved.data, value });
	}
}
