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
import { Emitter } from '../../../../base/common/event.js';

interface IChatData {
	data: IChatVariableData;
	resolver: IChatVariableResolver;
}

/**
 * TODO: @legomushroom
 */
export interface ICodec<T, K> {
	/**
	 * Encode a readable stream of `T`s into a readable stream of `K`s.
	 */
	encode: (value: streams.ReadableStream<K>) => streams.ReadableStream<T>;

	/**
	 * Encode a readable stream of `T`s into a readable stream of `K`s.
	 */
	decode: (value: streams.ReadableStream<T>) => streams.ReadableStream<K>;
}

// /*
//  * TODO: @legomushroom
//  */
// const variableToEntry(value: IChatRequestVariableValue): IChatRequestVariableEntry | undefined {
// 	if (!value) {
// 		return undefined;
// 	}

// 	return { id: data.data.id, modelDescription: data.data.modelDescription, name: part.variableName, range: part.range, value, references, fullName: data.data.fullName, icon: data.data.icon };
// }

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
interface IFileEntry {
	/**
	 * TODO: @legomushroom
	 */
	range: Range;
}

/**
 * TODO: @legomushroom
 */
interface IFileText extends IFileEntry {
	/**
	 * TODO: @legomushroom
	 */
	text: string;
}

/**
 * TODO: @legomushroom
 */
interface IFileReference extends IFileEntry {
	/**
	 * TODO: @legomushroom
	 */
	reference: IChatRequestVariableEntry;
}

interface IPartialFileEntry {
	/**
	 * TODO: @legomushroom
	 */
	entryType: 'text' | 'reference';

	/**
	 * TODO: @legomushroom
	 */
	range: Range;

	/**
	 * TODO: @legomushroom
	 */
	text: string;
}

/**
 * TODO: @legomushroom
 */
type TFileContentsEntry = IFileReference | IFileText;

type TStreamListenerNames = 'data' | 'error' | 'end';

/**
 * TODO: @legomushroom
 */
export const todo = (message: string = 'Not implemented.'): never => {
	throw new Error(`TODO: ${message}`);
};

abstract class DecoderBase<T, K = VSBuffer> extends Disposable implements streams.ReadableStream<T> {
	protected readonly _onData = this._register(new Emitter<T>());
	protected readonly _onError = this._register(new Emitter<Error>());
	protected readonly _onEnd = this._register(new Emitter<void>());

	private readonly _listeners: Map<TStreamListenerNames, Map<Function, IDisposable>> = new Map();

	constructor(
		protected readonly stream: streams.ReadableStream<K>,
	) {
		super();

		this.onStreamData = this.onStreamData.bind(this);
		this.onStreamError = this.onStreamError.bind(this);
		this.onStreamEnd = this.onStreamEnd.bind(this);

		stream.on('data', this.onStreamData);
		stream.on('error', this.onStreamError);
		stream.on('end', this.onStreamEnd);
	}

	on(event: 'data', callback: (data: T) => void): void;
	on(event: 'error', callback: (err: Error) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: TStreamListenerNames, callback: unknown): void {
		if (event === 'data') {
			return this.addDataListener(callback as (data: T) => void);
		}

		if (event === 'error') {
			return this.addErrorListener(callback as (error: Error) => void);
		}

		if (event === 'end') {
			return this.addEndListener(callback as () => void);
		}

		throw new Error(`Invalid event name: ${event}`);
	}

	/**
	 * TODO: @legomushroom
	 */
	public addDataListener(callback: (data: T) => void): void {
		let currentListeners = this._listeners.get('data');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('data', currentListeners);
		}

		currentListeners.set(callback, this._onData.event(callback));
	}

	/**
	 * TODO: @legomushroom
	 */
	public addErrorListener(callback: (error: Error) => void): void {
		let currentListeners = this._listeners.get('error');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('error', currentListeners);
		}

		currentListeners.set(callback, this._onError.event(callback));
	}

	/**
	 * TODO: @legomushroom
	 */
	public addEndListener(callback: () => void): void {
		let currentListeners = this._listeners.get('end');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('end', currentListeners);
		}

		currentListeners.set(callback, this._onEnd.event(callback));
	}

	/**
	 * Remove all existing event listeners.
	 */
	public removeAllListeners(): void {
		// remove listeners set up by this class
		this.stream.removeListener('data', this.onStreamData);
		this.stream.removeListener('error', this.onStreamError);
		this.stream.removeListener('end', this.onStreamEnd);

		// remove listeners set up by external consumers
		for (const [name, listeners] of this._listeners.entries()) {
			this._listeners.delete(name);
			for (const [listener, disposable] of listeners) {
				disposable.dispose();
				listeners.delete(listener);
			}
		}
	}

	pause(): void {
		this.stream.pause();
	}

	resume(): void {
		this.stream.resume();
	}

	destroy(): void {
		this.dispose();
	}

	removeListener(event: string, callback: Function): void {
		for (const [nameName, listeners] of this._listeners.entries()) {
			if (nameName !== event) {
				continue;
			}

			for (const [listener, disposable] of listeners) {
				if (listener !== callback) {
					continue;
				}

				disposable.dispose();
				listeners.delete(listener);
			}
		}
	}

	public override dispose(): void {
		this.stream.destroy();
		this.removeAllListeners();
		super.dispose();
	}

	/**
	 * TODO: @legomushroom
	 */
	protected abstract onStreamData(data: K): void;

	/**
	 * TODO: @legomushroom
	 */
	protected abstract onStreamError(error: Error): void;

	/**
	 * TODO: @legomushroom
	 */
	protected abstract onStreamEnd(): void;
}

export class Token { }

/**
 * TODO: @legomushroom
 */
export class Line extends Token {
	constructor(
		public readonly text: string,
	) {
		super();
	}
}

/**
 * TODO: @legomushroom
 */
export class LinesCodecDecoder extends DecoderBase<Line> implements streams.ReadableStream<Line> {
	private currentChunk: string = '';

	constructor(
		stream: streams.ReadableStream<VSBuffer>,
	) {
		super(stream);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(chunk: VSBuffer): void {
		this.currentChunk += chunk.toString();

		// TODO: legomushroom: handle `\r\n` too?
		const maybeLines = this.currentChunk.split('\n');

		// iterate over all lines, emitting `line` objects for each of them and
		// shorten the `currentChunk` value accordingly
		for (let i = 0; i < maybeLines.length - 1; i++) {
			const line = maybeLines[i];
			const maybeNextLine = maybeLines[i + 1];

			// if there is a next line present, then we can emit the current one
			if (maybeNextLine !== undefined) {
				this.emitLine(line);

				continue;
			}

			// if the next line is `undefined`, and the current line is `empty`, we
			// can emit it right away because the `currentChunk` string must have had
			// the `\n` delimiter at the end
			if (line === '') {
				this.emitLine(line);

				continue;
			}

			// there is no next line, but we don't know if the `line` is a full line yet,
			// so we need to wait for some more data to arrive to be sure;
			// this can happen only for the last line in the chunk tho, so assert that here
			// TODO: @legomushroom - emit an `Error` instead?
			assert(
				i === maybeLines.length - 1,
				`The loop must break only on the last line in the chunk, did on ${i}th iteration instead.`,
			);

			break;
		}
	}

	/**
	 * Emit a provided line to the output stream and shorten
	 * the `currentChunk` accordingly.
	 */
	private emitLine(line: string): void {
		this._onData.fire(new Line(line));
		this.currentChunk = this.currentChunk.slice(line.length + 1);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamError(error: Error): void {
		this._onError.fire(error);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamEnd(): void {
		// if the `currentChunk` is not empty when the input stream ends,
		// emit the `currentChunk` contents as the last available line
		// before firing the `onEnd` event
		if (this.currentChunk) {
			this.emitLine(this.currentChunk);
		}

		this._onEnd.fire();
	}
}


/**
 * A token that represent a generic continuous text without `spaces` or `new lines`.
 */
export class Text extends Token {
	constructor(
		public readonly text: string,
	) {
		super();
	}
}

/**
 * A token that represent a `space`.
 */
export class Space extends Token { }

/**
 * A token that represent a `new line`.
 */
export class NewLine extends Token { }

/**
 * TODO: @legomushroom
 */
export type TSimpleToken = Text | Space | NewLine;

/**
 * A decoder that can decode a stream of `Line`s into a stream of `Text`, `Space` and `NewLine` tokens.
 */
export class SimpleTokensCodecDecoder extends DecoderBase<TSimpleToken, Line> implements streams.ReadableStream<TSimpleToken> {
	constructor(
		stream: streams.ReadableStream<Line>,
	) {
		super(stream);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamData(line: Line): void {
		// if an empty line is received, emit a `NewLine` token
		if (line.text === '') {
			this._onData.fire(new NewLine());
			return;
		}

		todo('@legomushroom - split by spaces and emit the `Text` and `Space` tokens');
	}


	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamError(error: Error): void {
		// TODO: @legomushroom - move to the base class instead?
		this._onError.fire(error);
	}

	/**
	 * TODO: @legomushroom
	 */
	protected override onStreamEnd(): void {
		todo();
	}
}

/**
 * TODO: @legomushroom
 */
class FileContentsCodec extends Disposable implements ICodec<VSBuffer, TFileContentsEntry> {
	public encode(value: streams.ReadableStream<TFileContentsEntry>): streams.ReadableStream<VSBuffer> {
		throw new Error('Method not implemented.');
	}

	public decode(value: streams.ReadableStream<VSBuffer>): streams.ReadableStream<TFileContentsEntry> {
		throw new Error('Method not implemented.');
	}
}

/**
 * TODO: @legomushroom
 */
class FileReferencesCodec extends Disposable implements ICodec<VSBuffer, IChatRequestVariableEntry> {
	public encode(value: streams.ReadableStream<IChatRequestVariableEntry>): streams.ReadableStream<VSBuffer> {
		throw new Error('Method not implemented.');
	}

	public decode(value: streams.ReadableStream<VSBuffer>): streams.ReadableStream<IChatRequestVariableEntry> {
		throw new Error('Method not implemented.');
	}
}

/**
 * TODO: @legomushroom
 */
class DynamicVariableResolver extends Disposable {
	constructor(
		private readonly fileService: IFileService,
	) {
		super();
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
			const fileStream = await this.fileService.readFileStream(fileUri);
			const chunks = [];

			// this._register();

			// TODO: @legomushroom - add to disposables
			fileStream.value.on('data', (chunk) => { });

			// while (fileStream.value.read()) {
			// 	chunks.push(chunk);
			// }

			// // streams.consumeReadable<FileContent>(fileStream, chunks => {
			// // 	return new FileContent();
			// // });

			// fileStream.value
			// TODO: find references in the file
			// TODO: recursivelly resolve nested file references
		} catch (error) {
			// TODO: @legomushroom - add logging / telemetry
			return [];
		}

		throw new Error('Method not implemented.');
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
