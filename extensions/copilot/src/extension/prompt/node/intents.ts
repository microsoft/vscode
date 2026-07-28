/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MetadataMap, Raw, RenderPromptResult } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { PositionOffsetTransformer } from '../../../platform/editing/common/positionOffsetTransformer';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { AsyncIterableObject, AsyncIterableSource } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { TextEdit } from '../../../vscodeTypes';
import { ISessionTurnStorage, OutcomeAnnotation } from '../../inlineChat/node/promptCraftingTypes';
import { IContributedLinkifierFactory } from '../../linkify/common/linkifyService';
import { StreamPipe, forEachStreamed } from '../../prompts/node/inline/utils/streaming';
import { ContributedToolName } from '../../tools/common/toolNames';
import { ChatVariablesCollection } from '../common/chatVariablesCollection';
import { Conversation, PromptMetadata, Turn } from '../common/conversation';
import { IBuildPromptContext } from '../common/intents';
import { ChatTelemetryBuilder } from './chatParticipantTelemetry';
import { IDocumentContext } from './documentContext';
import { AsyncReader, ClassifiedTextPiece, IStreamingEditsStrategy, IStreamingTextPieceClassifier, StreamingEditsResult, TextPieceKind, streamLines } from './streamingEdits';

export interface IIntentSlashCommandInfo {

	// TODO@jrieken REMOVE, implicit via existence of commandInfo
	readonly hiddenFromUser?: boolean;
	readonly allowsEmptyArgs?: boolean; // True by default
	readonly defaultEnablement?: boolean; // True by default

	readonly toolEquivalent?: ContributedToolName;
}

export interface IIntentInvocationContext {

	/**
	 * The locations where this intent can be invoked: panel and or inline
	 */
	readonly location: ChatLocation;

	/**
	 * The document context to use
	 */
	readonly documentContext?: IDocumentContext;

	readonly request: vscode.ChatRequest;

	readonly slashCommand?: vscode.ChatCommand;
}

export interface IIntent {

	/**
	 * The id of this intent, without a leading slash.
	 */
	readonly id: string;


	/**
	 * The description of this intent, used for the help command.
	 */
	readonly description: string;

	/**
	 * The locations where this intent can be invoked: panel and or inline
	 */
	readonly locations: ChatLocation[];

	/**
	 * How this is wired up to the slash command system. *Note* that `undefined` means default wiring is used.
	 */
	readonly commandInfo?: IIntentSlashCommandInfo;

	/**
	 * Whether this intent is listed as a capability in the prompt. Defaults to true.
	 */
	readonly isListedCapability?: boolean;

	/**
	 * This intent is invoked, return an invocation object that will be used to craft the prompt and to process the
	 * response. The passed context must be used to the entire invocation
	 *
	 */
	invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation>;

	/**
	 * Handle a request. Note that when defined `invoke` isn't called anymore, e.g return
	 * the `NullIntentInvocation` or throw an error.
	 */
	handleRequest?(
		conversation: Conversation,
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		token: CancellationToken,
		documentContext: IDocumentContext | undefined,
		agentName: string,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
		yieldRequested: () => boolean,
	): Promise<vscode.ChatResult>;
}


/**
 * An error type that can be thrown from {@link IIntent.invoke} to signal an
 * ordinary error to the user.
 *
 * note: this is only treated specially in stests at the moment
 */
export class IntentError extends Error {
	public readonly errorDetails: vscode.ChatErrorDetails;

	constructor(
		error: string | vscode.ChatErrorDetails,
	) {
		super(typeof error === 'string' ? error : error.message);
		this.errorDetails = typeof error === 'string' ? { message: error } : error;
	}
}

export interface IntentLinkificationOptions {
	readonly disable?: boolean;
	readonly additionaLinkifiers?: readonly IContributedLinkifierFactory[];
}


export const nullRenderPromptResult = (): RenderPromptResult => ({
	hasIgnoredFiles: false,
	messages: [],
	omittedReferences: [],
	references: [],
	tokenCount: 0,
	metadata: promptResultMetadata([]),
});

export const promptResultMetadata = (metadata: PromptMetadata[]): MetadataMap => ({
	get<T extends PromptMetadata>(key: new (...args: any[]) => T): T | undefined {
		return metadata.find(m => m instanceof key) as T | undefined;
	},
	getAll<T extends PromptMetadata>(key: new (...args: any[]) => T): T[] {
		return metadata.filter(m => m instanceof key) as T[];
	}
});

/**
 * Generic marker type of telemetry data that can be passed
 * along in an opaque way
 */
export class TelemetryData extends PromptMetadata {

	override toString(): string {
		return `[TelemetryData](${super.toString()})`;
	}
}

export interface IBuildPromptResult extends RenderPromptResult {

	telemetryData?: readonly TelemetryData[];
}


export interface IIntentInvocation extends Partial<IResponseProcessor> {

	/**
	 * The intent that was invoked (owns this invocation)
	 */
	readonly intent: IIntent;

	/**
	 * The location for this invocation.
	 */
	readonly location: ChatLocation;

	/**
	 * The endpoint for this invocation.
	 */
	readonly endpoint: IChatEndpoint;

	/**
	 * Tools that should should be made available to the invocation. If not
	 * provided, the default {@link IToolsService.getEnabledTools} will be used
	 * with no specific filter.
	 */
	getAvailableTools?(): vscode.LanguageModelToolInformation[] | Promise<vscode.LanguageModelToolInformation[]> | undefined;

	/**
	 * Build the prompt which is a system and different user messages.
	 */
	buildPrompt(
		context: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>,
		token: vscode.CancellationToken
	): Promise<IBuildPromptResult>;

	/**
	 * ONLY: panel
	 *
	 * Called when a request with confirmation data is made, and handles the request. The PromptCrafter/ResponseProcessor will not be called in this scenario.
	 */
	confirmationHandler?(acceptedConfirmationData: any[] | undefined, rejectedConfirmationData: any[] | undefined, progress: vscode.ChatResponseStream): Promise<void>;

	readonly linkification?: IntentLinkificationOptions;

	readonly codeblocksRepresentEdits?: boolean;

	modifyErrorDetails?(errorDetails: vscode.ChatErrorDetails, response: ChatResponse): vscode.ChatErrorDetails;

	getAdditionalVariables?(context: IBuildPromptContext): ChatVariablesCollection | undefined;
}

export class NullIntentInvocation implements IIntentInvocation {

	constructor(
		readonly intent: IIntent,
		readonly location: ChatLocation,
		readonly endpoint: IChatEndpoint
	) { }

	async buildPrompt(): Promise<RenderPromptResult> {
		return nullRenderPromptResult();
	}
}

export interface IResponseProcessorContext {
	/**
	 * The chat session id
	 */
	readonly chatSessionId: string;

	/**
	 * The current running turn
	 */
	readonly turn: Turn;

	/**
	 * The messages that have been sent with the LLM request
	 */
	readonly messages: readonly Raw.ChatMessage[];

	/**
	 * Record annotations that occurred when processing the LLM reply.
	 */
	addAnnotations(annotations: OutcomeAnnotation[]): void;

	/**
	 * Store in inline chat session storage.
	 * ONLY: inline
	 */
	storeInInlineSession(store: ISessionTurnStorage): void;
}

export interface IResponseProcessor {
	/**
	 * Process a response as it streams in from the LLM.
	 *
	 * Anything reported to the progress object will be shown to the user in the UI.
	 * This allows processing the response as it streams in and selectively reporting it to the user.
	 *
	 * The LLM request will be cancelled when returning early (before the input stream finishes).
	 *
	 * @param context Context allowing to get more information about the request or to store more information generated during response processing
	 * @param inputStream The stream containing the LLM response
	 * @param outputStream The stream to report the processed response to the user
	 * @param token A cancellation token
	 */
	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<vscode.ChatResult | void>;
}

export class ReplyInterpreterMetaData extends PromptMetadata {
	constructor(public readonly replyInterpreter: ReplyInterpreter) {
		super();
	}
}

export interface ReplyInterpreter {
	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void>;
}

export class StreamingMarkdownReplyInterpreter implements ReplyInterpreter {
	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		for await (const part of inputStream) {
			outputStream.markdown(part.delta.text);
		}
	}
}

export class NoopReplyInterpreter implements ReplyInterpreter {
	async processResponse(): Promise<void> {
		return undefined;
	}
}

export function applyEdits(text: string, edits: TextEdit[]): string {
	const transformer = new PositionOffsetTransformer(text);
	const offsetEdits = edits.map(e => {
		const offsetRange = transformer.toOffsetRange(e.range);
		return ({
			startOffset: offsetRange.start,
			endOffset: offsetRange.endExclusive,
			text: e.newText
		});
	});

	// sort is stable: does not change the order of edits that start at the same offset
	offsetEdits.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

	for (let i = offsetEdits.length - 1; i >= 0; i--) {
		const edit = offsetEdits[i];
		text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
	}

	return text;
}

export type LeadingMarkdownStreaming = StreamPipe<string>;
export const LeadingMarkdownStreaming = {
	Mute: StreamPipe.discard<string>(),
	Emit: StreamPipe.identity<string>(),
};

export const enum EarlyStopping {
	None,
	StopAfterFirstCodeBlock,
}

export class StreamingEditsController {

	private readonly _responseStream = new AsyncIterableSource<string>();
	private _lastLength: number = 0;
	private _leftFirstCodeBlock = false;
	private _streamingPromise: Promise<StreamingEditsResult>;

	constructor(
		private readonly _outputStream: vscode.ChatResponseStream,
		private readonly _leadingMarkdownStreamPipe: StreamPipe<string>,
		private readonly _earlyStopping: EarlyStopping,
		textPieceClassifier: IStreamingTextPieceClassifier,
		streamingEditsStrategy: IStreamingEditsStrategy,
	) {
		const textPieceStream = textPieceClassifier(this._responseStream.asyncIterable);
		this._streamingPromise = this._process(textPieceStream, streamingEditsStrategy);
	}

	private async _process(textPieceStream: AsyncIterableObject<ClassifiedTextPiece>, streamingEditsStrategy: IStreamingEditsStrategy): Promise<StreamingEditsResult> {
		const leadingMarkdown = new AsyncIterableSource<string>();

		const processedMarkdown = this._leadingMarkdownStreamPipe(leadingMarkdown.asyncIterable);
		forEachStreamed(processedMarkdown, item => this._outputStream.markdown(item));

		const firstCodeBlockText = new AsyncIterableSource<string>();
		const firstCodeBlockLines = streamLines(firstCodeBlockText.asyncIterable);
		const streamingEditsPromise = streamingEditsStrategy.processStream(firstCodeBlockLines);

		const textPieceStreamWithoutDelimiters = textPieceStream.filter(piece => piece.kind !== TextPieceKind.Delimiter);
		const reader = new AsyncReader(textPieceStreamWithoutDelimiters[Symbol.asyncIterator]());

		// Read all the markdown pieces until the first code block
		await reader.readWhile(
			piece => piece.kind === TextPieceKind.OutsideCodeBlock,
			piece => leadingMarkdown.emitOne(piece.value)
		);
		leadingMarkdown.resolve();

		// Read the first code block
		await reader.readWhile(
			piece => piece.kind === TextPieceKind.InsideCodeBlock,
			piece => firstCodeBlockText.emitOne(piece.value)
		);

		this._leftFirstCodeBlock = true;

		// Finish reading the rest of the text
		await reader.consumeToEnd();

		firstCodeBlockText.resolve();

		return streamingEditsPromise;
	}

	public update(newText: string): { shouldFinish: boolean } {
		if (this._earlyStopping === EarlyStopping.StopAfterFirstCodeBlock && this._leftFirstCodeBlock) {
			// stop was requested!
			return { shouldFinish: true };
		}

		const chunk = newText.slice(this._lastLength);
		this._lastLength = newText.length;
		this._responseStream.emitOne(chunk);
		return { shouldFinish: false };
	}

	public async finish(): Promise<StreamingEditsResult> {
		this._responseStream.resolve();
		return await this._streamingPromise;
	}
}
