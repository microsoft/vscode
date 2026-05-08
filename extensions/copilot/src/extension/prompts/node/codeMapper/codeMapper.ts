/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import type { ChatErrorDetails, MappedEditsResponseStream, NotebookCell, NotebookDocument, Uri } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { FetchStreamSource, IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse, getErrorDetailsFromChatFetchError, getFilteredMessage } from '../../../../platform/chat/common/commonTypes';
import { getTextPart, toTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IDiffService } from '../../../../platform/diff/common/diffService';
import { NotebookDocumentSnapshot } from '../../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../../platform/endpoint/node/chatEndpoint';
import { Proxy4oEndpoint } from '../../../../platform/endpoint/node/proxy4oEndpoint';
import { ProxyInstantApplyShortEndpoint } from '../../../../platform/endpoint/node/proxyInstantApplyShortEndpoint';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IEditLogService } from '../../../../platform/multiFileEdit/common/editLogService';
import { IMultiFileEditInternalTelemetryService } from '../../../../platform/multiFileEdit/common/multiFileEditQualityTelemetry';
import { Completion } from '../../../../platform/nesFetch/common/completionsAPI';
import { CompletionsFetchError } from '../../../../platform/nesFetch/common/completionsFetchService';
import { FinishedCallback, IResponseDelta } from '../../../../platform/networking/common/fetch';
import { FilterReason } from '../../../../platform/networking/common/openai';
import { IAlternativeNotebookContentEditGenerator, NotebookEditGenerationTelemtryOptions, NotebookEditGenrationSource } from '../../../../platform/notebook/common/alternativeContentEditGenerator';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, multiplexProperties } from '../../../../platform/telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../../platform/tokenizer/node/tokenizer';
import { getLanguageForResource } from '../../../../util/common/languages';
import { getFenceForCodeBlock, languageIdToMDCodeBlockLang } from '../../../../util/common/markdown';
import { ITokenizer } from '../../../../util/common/tokenizer';
import { equals } from '../../../../util/vs/base/common/arrays';
import { assertNever } from '../../../../util/vs/base/common/assert';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { NotebookEdit, Position, Range, TextEdit } from '../../../../vscodeTypes';
import { OutcomeAnnotation, OutcomeAnnotationLabel } from '../../../inlineChat/node/promptCraftingTypes';
import { Lines, LinesEdit } from '../../../prompt/node/editGeneration';
import { LineOfText, PartialAsyncTextReader } from '../../../prompt/node/streamingEdits';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { EXISTING_CODE_MARKER } from '../panel/codeBlockFormattingRules';
import { CodeMapperFullRewritePrompt, CodeMapperPatchRewritePrompt, CodeMapperPromptProps } from './codeMapperPrompt';
import { ICodeMapperTelemetryInfo } from './codeMapperService';
import { findEdit, getCodeBlock, iterateSectionsForResponse, Marker, Patch, Section } from './patchEditGeneration';


export type ICodeMapperDocument = TextDocumentSnapshot | NotebookDocumentSnapshot;

export async function processFullRewriteNotebook(document: NotebookDocument, inputStream: string | AsyncIterable<LineOfText>, outputStream: MappedEditsResponseStream, alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator, telemetryOptions: NotebookEditGenerationTelemtryOptions, token: CancellationToken): Promise<void> {
	for await (const edit of processFullRewriteNotebookEdits(document, inputStream, alternativeNotebookEditGenerator, telemetryOptions, token)) {
		if (Array.isArray(edit)) {
			outputStream.textEdit(edit[0], edit[1]);
		} else {
			outputStream.notebookEdit(document.uri, edit); // changed this.outputStream to outputStream
		}
	}

	return undefined;
}

export type CellOrNotebookEdit = NotebookEdit | [Uri, TextEdit[]];

export async function* processFullRewriteNotebookEdits(document: NotebookDocument, inputStream: string | AsyncIterable<LineOfText>, alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator, telemetryOptions: NotebookEditGenerationTelemtryOptions, token: CancellationToken): AsyncIterable<CellOrNotebookEdit> {
	// emit start of notebook
	const cellMap = new ResourceMap<NotebookCell>();
	for await (const edit of alternativeNotebookEditGenerator.generateNotebookEdits(document, inputStream, telemetryOptions, token)) {
		if (Array.isArray(edit)) {
			const cellUri = edit[0];
			const cell = cellMap.get(cellUri) || document.getCells().find(cell => isEqual(cell.document.uri, cellUri));
			if (cell) {
				cellMap.set(cellUri, cell);
				if (edit[1].length === 1 && edit[1][0].range.isSingleLine && cell.document.lineCount > edit[1][0].range.start.line) {
					if (cell.document.lineAt(edit[1][0].range.start.line).text === edit[1][0].newText) {
						continue;
					}
				}
				yield [cellUri, edit[1]];
			}
		} else {
			yield edit;
		}
	}

	return undefined;
}

export async function processFullRewriteNewNotebook(uri: URI, source: string, outputStream: MappedEditsResponseStream, alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator, telemetryOptions: NotebookEditGenerationTelemtryOptions, token: CancellationToken): Promise<void> {
	for await (const edit of alternativeNotebookEditGenerator.generateNotebookEdits(uri, source, telemetryOptions, token)) {
		if (!Array.isArray(edit)) {
			outputStream.notebookEdit(uri, edit);
		}
	}

	return undefined;
}

function emitCodeLine(line: string, uri: Uri, existingDocument: TextDocumentSnapshot | undefined, outputStream: MappedEditsResponseStream, pushedLines: string[], token: CancellationToken) {
	if (token.isCancellationRequested) {
		return undefined;
	}

	const lineCount = existingDocument ? existingDocument.lineCount : 0;
	const currentLineIndex = pushedLines.length;
	pushedLines.push(line);

	if (currentLineIndex < lineCount) {
		// this line exists in the doc => replace it
		const currentLineLength = existingDocument ? existingDocument.lineAt(currentLineIndex).text.length : 0;
		outputStream.textEdit(uri, [TextEdit.replace(new Range(currentLineIndex, 0, currentLineIndex, currentLineLength), line)]);
	} else {
		// we are at the end of the document
		const addedText = currentLineIndex === 0 ? line : `\n` + line;
		outputStream.textEdit(uri, [TextEdit.replace(new Range(currentLineIndex, 0, currentLineIndex, 0), addedText)]);
	}
}

async function processFullRewriteStream(uri: Uri, existingDocument: TextDocumentSnapshot | undefined, inputStream: AsyncIterable<LineOfText>, outputStream: MappedEditsResponseStream, token: CancellationToken, pushedLines: string[] = []) {
	for await (const line of inputStream) {
		emitCodeLine(line.value, uri, existingDocument, outputStream, pushedLines, token);
	}

	return pushedLines;
}

async function handleTrailingLines(uri: Uri, existingDocument: TextDocumentSnapshot | undefined, outputStream: MappedEditsResponseStream, pushedLines: string[], token: CancellationToken): Promise<void> {
	const lineCount = existingDocument ? existingDocument.lineCount : 0;
	const initialTrailingEmptyLineCount = existingDocument ? getTrailingDocumentEmptyLineCount(existingDocument) : 0;

	// The LLM does not want to produce trailing newlines
	// Here we try to maintain the exact same tralining newlines count as the original document had
	const pushedTrailingEmptyLineCount = getTrailingArrayEmptyLineCount(pushedLines);
	for (let i = pushedTrailingEmptyLineCount; i < initialTrailingEmptyLineCount; i++) {
		emitCodeLine('', uri, existingDocument, outputStream, pushedLines, token);
	}

	// Make sure we delete everything after the changed lines
	const currentLineIndex = pushedLines.length;
	if (currentLineIndex < lineCount) {
		const from = currentLineIndex === 0 ? new Position(0, 0) : new Position(currentLineIndex - 1, pushedLines[pushedLines.length - 1].length);
		outputStream.textEdit(uri, [TextEdit.delete(new Range(from, new Position(lineCount, 0)))]);
	}
}

async function processFullRewriteResponseCode(uri: Uri, existingDocument: TextDocumentSnapshot | undefined, inputStream: AsyncIterable<LineOfText>, outputStream: MappedEditsResponseStream, token: CancellationToken): Promise<void> {
	const pushedLines = await processFullRewriteStream(uri, existingDocument, inputStream, outputStream, token);

	if (token.isCancellationRequested) {
		return;
	}

	await handleTrailingLines(uri, existingDocument, outputStream, pushedLines, token);
}

/**
 * Extract a fenced code block from a reply and emit the lines in the code block one-by-one.
 */
function extractCodeBlock(inputStream: AsyncIterable<IResponsePart>, token: CancellationToken): AsyncIterable<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		const fence = '```';
		const textStream = AsyncIterableObject.map(inputStream, part => part.delta.text);
		const reader = new PartialAsyncTextReader(textStream[Symbol.asyncIterator]());

		let inCodeBlock = false;
		while (!reader.endOfStream) {
			// Skip everything until we hit a fence
			if (token.isCancellationRequested) {
				break;
			}
			const line = await reader.readLine();
			if (line.startsWith(fence) && inCodeBlock) {
				// Done reading code block, stop reading
				inCodeBlock = false;
				break;
			} else if (line.startsWith(fence)) {
				inCodeBlock = true;
			} else if (inCodeBlock) {
				emitter.emitOne(new LineOfText(line));
			}
		}
	});
}

export async function processPatchResponse(uri: URI, originalText: string | undefined, inputStream: AsyncIterable<IResponsePart>, outputStream: MappedEditsResponseStream, token: CancellationToken): Promise<void> {
	let documentLines = originalText ? Lines.fromString(originalText) : [];
	function processAndEmitPatch(patch: Patch) {
		// Make sure it's valid, otherwise emit
		if (equals(patch.find, patch.replace)) {
			return;
		}
		const res = findEdit(documentLines, getCodeBlock(patch.find), getCodeBlock(patch.replace), 0);

		if (res instanceof LinesEdit) {
			outputStream.textEdit(uri, res.toTextEdit());
			documentLines = res.apply(documentLines);
		}
	}

	let original, filePath;
	const otherSections: Section[] = [];
	for await (const section of iterateSectionsForResponse(inputStream)) {
		switch (section.marker) {
			case undefined:
				break;
			case Marker.FILEPATH:
				filePath = section.content.join('\n').trim();
				break;
			case Marker.FIND:
				original = section.content;
				break;
			case Marker.REPLACE: {
				if (section.content && original && filePath) {
					processAndEmitPatch({ filePath, find: original, replace: section.content });
				}
				break;
			}
			case Marker.COMPLETE:
				break;
			default:
				otherSections.push(section);
				break;
		}
	}
}

export interface ICodeMapperNewDocument {
	readonly createNew: true;
	readonly codeBlock: string;
	readonly markdownBeforeBlock: string | undefined;
	readonly uri: Uri;
	readonly existingDocument: ICodeMapperDocument | undefined;
	readonly workingSet: ICodeMapperDocument[];
}

export interface ICodeMapperExistingDocument {
	readonly createNew: false;
	readonly codeBlock: string;
	readonly markdownBeforeBlock: string | undefined;
	readonly uri: Uri;
	readonly existingDocument: ICodeMapperDocument;
	readonly location?: string;
}

export type ICodeMapperRequestInput = ICodeMapperNewDocument | ICodeMapperExistingDocument;

export function isNewDocument(input: ICodeMapperRequestInput): input is ICodeMapperNewDocument {
	return input.createNew;
}

interface IFullRewritePrompt {
	readonly prompt: string;
	readonly messages: Raw.ChatMessage[];

	readonly requestId: string;

	readonly languageId: string;

	readonly speculation: string;
	readonly stopTokens: string[];

	readonly promptTokenCount: number;
	readonly speculationTokenCount: number;

	readonly endpoint: ChatEndpoint;
	readonly tokenizer: ITokenizer;
}

interface ICompletedRequest {
	readonly startTime: number;
	readonly firstTokenTime: number;
	readonly responseText: string;
	readonly requestId: string;
}

export class CodeMapper {

	static closingXmlTag = 'copilot-edited-file';
	private shortContextLimit: number;

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITokenizerProvider private readonly tokenizerProvider: ITokenizerProvider,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditLogService private readonly editLogService: IEditLogService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IDiffService private readonly diffService: IDiffService,
		@IMultiFileEditInternalTelemetryService private readonly multiFileEditInternalTelemetryService: IMultiFileEditInternalTelemetryService,
		@IAlternativeNotebookContentEditGenerator private readonly alternativeNotebookEditGenerator: IAlternativeNotebookContentEditGenerator,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@INotebookService private readonly notebookService: INotebookService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		this.shortContextLimit = configurationService.getExperimentBasedConfig<number>(ConfigKey.Advanced.InstantApplyShortContextLimit, experimentationService) ?? 8000;
	}

	private async getGpt4oProxyEndpoint(): Promise<Proxy4oEndpoint> {
		await this.experimentationService.hasTreatments();
		return this.instantiationService.createInstance(Proxy4oEndpoint);
	}

	private async getShortIAEndpoint(): Promise<ProxyInstantApplyShortEndpoint> {
		await this.experimentationService.hasTreatments();
		return this.instantiationService.createInstance(ProxyInstantApplyShortEndpoint);
	}

	public async mapCode(request: ICodeMapperRequestInput, resultStream: MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: CancellationToken): Promise<CodeMapperOutcome | undefined> {

		const fastEdit = await this.mapCodeUsingFastEdit(request, resultStream, telemetryInfo, token);
		if (!(fastEdit instanceof CodeMapperRefusal)) {
			return fastEdit;
		}
		// continue with "slow rewrite endpoint" when fast rewriting was not possible
		// use copilot base as fallback
		const chatEndpoint = await this.endpointProvider.getChatEndpoint('copilot-base');

		// Only attempt a full file rewrite if the original document fits into 3/4 of the max output token limit, leaving space for the model to add code. The limit is currently a flat 4K tokens from CAPI across all our models.
		// If there are multiple input documents, pick the longest one to base the limit on
		const longestDocumentContext = isNewDocument(request) ? request.workingSet.reduce<ICodeMapperDocument | undefined>((prev, curr) => (prev && (prev.getText().length > curr.getText().length)) ? prev : curr, undefined) : request.existingDocument;
		const doFullRewrite = longestDocumentContext ? await chatEndpoint.acquireTokenizer().tokenLength(longestDocumentContext.getText()) < (4096 / 4 * 3) : true;

		const existingDocument = request.existingDocument;

		const fetchStreamSource = new FetchStreamSource();

		const cb: FinishedCallback = async (text: string, index: number, delta: IResponseDelta) => {
			fetchStreamSource.update(text, delta);
			return undefined;
		};
		let responsePromise: Promise<void> | undefined;
		if (doFullRewrite) {
			if (existingDocument && existingDocument instanceof NotebookDocumentSnapshot) { // TODO@joyceerhl: Handle notebook document response processing
				const telemtryOptions: NotebookEditGenerationTelemtryOptions = {
					source: NotebookEditGenrationSource.codeMapperEditNotebook,
					requestId: undefined,
					model: chatEndpoint.model
				};
				responsePromise = processFullRewriteNotebook(existingDocument.document, extractCodeBlock(fetchStreamSource.stream, token), resultStream, this.alternativeNotebookEditGenerator, telemtryOptions, token);
			} else {
				responsePromise = processFullRewriteResponseCode(request.uri, existingDocument, extractCodeBlock(fetchStreamSource.stream, token), resultStream, token);
			}
		} else {
			responsePromise = processPatchResponse(request.uri, existingDocument?.getText(), fetchStreamSource.stream, resultStream, token);
		}

		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			chatEndpoint,
			doFullRewrite ? CodeMapperFullRewritePrompt : CodeMapperPatchRewritePrompt,
			{ request } satisfies CodeMapperPromptProps
		);

		const prompt = await promptRenderer.render(undefined, token);
		if (token.isCancellationRequested) {
			return undefined;
		}
		const fetchResult = await chatEndpoint.makeChatRequest(
			'codeMapper',
			prompt.messages,
			cb,
			token,
			ChatLocation.Other,
			undefined,
			{ temperature: 0 }
		);

		fetchStreamSource.resolve();
		await responsePromise; // Make sure we push all text edits to the response stream

		let result: CodeMapperOutcome;

		const createOutcome = (annotations: OutcomeAnnotation[], errorDetails: ChatErrorDetails | undefined): CodeMapperOutcome => {
			return ({ errorDetails, annotations, telemetry: { requestId: String(telemetryInfo?.chatRequestId), speculationRequestId: fetchResult.requestId, requestSource: String(telemetryInfo?.chatRequestSource), mapper: doFullRewrite ? 'full' : 'patch' } });
		};
		if (fetchResult.type === ChatFetchResponseType.Success) {
			result = createOutcome([], undefined);
		} else {
			if (fetchResult.type === ChatFetchResponseType.Canceled) {
				return undefined;
			}
			const outageStatus = await this.octoKitService.getGitHubOutageStatus();
			const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, this.authenticationService.copilotToken?.copilotPlan, outageStatus);
			result = createOutcome([{ label: errorDetails.message, message: `request ${fetchResult.type}`, severity: 'error' }], errorDetails);
		}
		if (result.annotations.length || result.errorDetails) {
			this.logService.info(`[code mapper] Problems generating edits: ${result.annotations.map(a => `${a.message} [${a.label}]`).join(', ')}, ${result.errorDetails?.message}`);
		}
		return result;
	}

	//#region Full file rewrite with speculation / predicted outputs

	private async buildPrompt(request: ICodeMapperRequestInput, token: CancellationToken): Promise<IFullRewritePrompt> {
		let endpoint: ChatEndpoint = await this.getGpt4oProxyEndpoint();
		const tokenizer = this.tokenizerProvider.acquireTokenizer(endpoint);
		const requestId = generateUuid();

		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			CodeMapperFullRewritePrompt,
			{ request, shouldTrimCodeBlocks: true } satisfies CodeMapperPromptProps
		);
		const uri = request.uri;

		const promptRendererResult = await promptRenderer.render(undefined, token);
		const fence = isNewDocument(request) ? '```' : getFenceForCodeBlock(request.existingDocument.getText());
		const languageId = isNewDocument(request) ? getLanguageForResource(uri).languageId : request.existingDocument.languageId;
		const speculation = isNewDocument(request) ? '' : request.existingDocument.getText();
		const messages: Raw.ChatMessage[] = [{
			role: Raw.ChatRole.User,
			content: [toTextPart(promptRendererResult.messages.reduce((prev, curr) => {
				const content = getTextPart(curr.content);
				if (curr.role === Raw.ChatRole.System) {
					const currentContent = content.endsWith('\n') ? content : `${content}\n`;
					return `${prev}<SYSTEM>\n${currentContent}</SYSTEM>\n\n\n`;
				}
				return prev + content;
			}, ''))]
		}];
		const prompt = promptRendererResult.messages.reduce((prev, curr) => {
			const content = getTextPart(curr.content);
			if (curr.role === Raw.ChatRole.System) {
				const currentContent = content.endsWith('\n') ? content : `${content}\n`;
				return `${prev}<SYSTEM>\n${currentContent}\nEnd your response with </${CodeMapper.closingXmlTag}>.\n</SYSTEM>\n\n\n`;
			}
			return prev + content;
		}, '').trimEnd() + `\n\n\nThe resulting document:\n<${CodeMapper.closingXmlTag}>\n${fence}${languageIdToMDCodeBlockLang(languageId)}\n`;

		if (prompt.length < this.shortContextLimit) {
			endpoint = await this.getShortIAEndpoint();
		}

		const promptTokenCount = await tokenizer.tokenLength(prompt);
		const speculationTokenCount = await tokenizer.tokenLength(speculation);
		const stopTokens = [`${fence}\n</${CodeMapper.closingXmlTag}>`, `${fence}\r\n</${CodeMapper.closingXmlTag}>`, `</${CodeMapper.closingXmlTag}>`];

		return { prompt, requestId, messages, speculation, stopTokens, promptTokenCount, speculationTokenCount, endpoint, tokenizer, languageId };
	}

	private async logDoneInfo(request: ICodeMapperRequestInput, prompt: IFullRewritePrompt, response: ICompletedRequest, telemetryInfo: CodeMapperOutcomeTelemetry, mapper: string, annotations: OutcomeAnnotation[]) {
		if (this.telemetryService instanceof NullTelemetryService) {
			// noo need to make all the computation
			return;
		}

		const { speculation, tokenizer, promptTokenCount, speculationTokenCount } = prompt;
		const { firstTokenTime, startTime, responseText, requestId } = response;

		const timeToFirstToken = firstTokenTime === -1 ? -1 : firstTokenTime - startTime;
		const timeToComplete = Date.now() - startTime;
		this.logService.info(`srequest done: ${timeToComplete}ms, chatRequestId: [${telemetryInfo?.requestId}], speculationRequestId: [${requestId}]`);
		const isNoopEdit = responseText.trim() === speculation.trim();

		const { addedLines, removedLines } = await computeAdditionsAndDeletions(this.diffService, speculation, responseText);

		/* __GDPR__
			"speculation.response.success" : {
				"owner": "alexdima",
				"comment": "Report quality details for a successful speculative response.",
				"chatRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"chatRequestSource": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source of the current turn request" },
				"isNoopEdit": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the response text is identical to the speculation." },
				"speculationRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"containsElidedCodeComments": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the response text contains elided code comments." },
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The model used for this speculation request" },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens", "isMeasurement": true },
				"speculationTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of speculation tokens", "isMeasurement": true },
				"responseTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of response tokens", "isMeasurement": true },
				"addedLines": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of lines added", "isMeasurement": true },
				"removedLines": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of lines removed", "isMeasurement": true },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether this is a notebook", "isMeasurement": true },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token", "isMeasurement": true },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to complete the request", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('speculation.response.success', {
			chatRequestId: telemetryInfo?.requestId,
			chatRequestSource: telemetryInfo?.requestSource,
			speculationRequestId: requestId,
			isNoopEdit: String(isNoopEdit),
			containsElidedCodeComments: String(responseText.includes(EXISTING_CODE_MARKER)),
			model: mapper
		}, {
			promptTokenCount,
			speculationTokenCount,
			responseTokenCount: await tokenizer.tokenLength(responseText),
			timeToFirstToken,
			timeToComplete,
			addedLines,
			removedLines,
			isNotebook: this.notebookService.hasSupportedNotebooks(request.uri) ? 1 : 0
		});
		if (isNoopEdit) {
			const message = 'Speculative response is identical to speculation, srequest: ' + requestId + ',  URI: ' + request.uri.toString();
			annotations.push({ label: OutcomeAnnotationLabel.NOOP_EDITS, message, severity: 'error' });
		}
	}

	private async logError(request: ICodeMapperRequestInput, prompt: IFullRewritePrompt, response: Omit<ICompletedRequest, 'responseText'>, telemetryInfo: CodeMapperOutcomeTelemetry, mapper: string, errorMessage: string, error?: Error) {
		const { promptTokenCount, speculationTokenCount } = prompt;
		const { startTime, requestId } = response;

		this.logService.error(`srequest failed: ${Date.now() - startTime}ms, chatRequestId: [${telemetryInfo?.requestId}], speculationRequestId: [${requestId}] error: [${errorMessage}]`);
		if (error) {
			this.logService.error(error);
		}
		/* __GDPR__
			"speculation.response.error" : {
				"owner": "alexdima",
				"comment": "Report quality issue for when a speculative response failed.",
				"errorMessage": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The name of the error" },
				"chatRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"speculationRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the speculation request" },
				"chatRequestSource": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source of the current turn request" },
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The model used for this speculation request" },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens", "isMeasurement": true },
				"speculationTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of speculation tokens", "isMeasurement": true },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether this is a notebook", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('speculation.response.error', {
			errorMessage,
			chatRequestId: telemetryInfo?.requestId,
			chatRequestSource: telemetryInfo?.requestSource,
			speculationRequestId: requestId,
			model: mapper
		}, {
			promptTokenCount,
			speculationTokenCount,
			isNotebook: this.notebookService.hasSupportedNotebooks(request.uri) ? 1 : 0
		});
	}

	private async mapCodeUsingFastEdit(request: ICodeMapperRequestInput, resultStream: MappedEditsResponseStream, telemetryInfo: ICodeMapperTelemetryInfo | undefined, token: CancellationToken): Promise<CodeMapperOutcome | CodeMapperRefusal> {
		// When generating edits for notebooks that are from location=panel, do not use fast edit.
		// location = panel, is when user is applying code displayed in chat panel into notebook.
		// Fast apply doesn't work well when we have only a part of the code and no code markers.
		if (!request.createNew && request.location === 'panel' && this.notebookService.hasSupportedNotebooks(request.uri)) {
			this.logService.error(`srequest | refuse | SD | refusing notebook from Panel | [codeMapper]`);
			return new CodeMapperRefusal();
		}

		const combinedDocumentLength = isNewDocument(request) ? request.workingSet.reduce((prev, curr) => prev + curr.getText().length, 0) : request.existingDocument.getText().length;

		const promptLimit = 256_000; // (256K is roughly 64k tokens) and documents longer than this will surely not fit
		if (combinedDocumentLength > promptLimit) {
			this.logService.error(`srequest | refuse | SD | refusing huge document | [codeMapper]`);
			return new CodeMapperRefusal();
		}

		const builtPrompt = await this.buildPrompt(request, token);
		const { promptTokenCount, speculation, requestId, endpoint } = builtPrompt;

		// `prompt` includes the whole document, the codeblock and some prosa. we leave space
		// for the document again and the whole codeblock (assuming it's all insertions)
		// const codeBlockTokenCount = promptTokenCount - speculationTokenCount;
		// if (promptTokenCount > 128_000 - speculationTokenCount - codeBlockTokenCount) {

		if (promptTokenCount > 64_000) {
			this.logService.error(`srequest | refuse | SD | exceeds token limit | [codeMapper]`);
			return new CodeMapperRefusal();
		}

		const mapper = endpoint.model;
		const outcomeCorrelationTelemetry: CodeMapperOutcomeTelemetry = {
			requestId: String(telemetryInfo?.chatRequestId),
			requestSource: String(telemetryInfo?.chatRequestSource),
			chatRequestModel: String(telemetryInfo?.chatRequestModel),
			speculationRequestId: requestId,
			mapper,
		};

		const res = await this.fetchNativePredictedOutputs(request, builtPrompt, resultStream, outcomeCorrelationTelemetry, token, true);

		if (isCodeMapperOutcome(res)) {
			return res;
		}

		const { allResponseText, finishReason, annotations, firstTokenTime, startTime } = res;

		try {
			this.ensureFinishReasonStopOrThrow(requestId, finishReason);
			const response = { responseText: allResponseText.join(''), startTime, firstTokenTime, requestId };
			await this.logDoneInfo(request, builtPrompt, response, outcomeCorrelationTelemetry, mapper, annotations);
			if (telemetryInfo?.chatRequestId) {
				const prompt = JSON.stringify(builtPrompt.messages);
				this.editLogService.logSpeculationRequest(telemetryInfo.chatRequestId, request.uri, prompt, speculation, response.responseText);
				this.multiFileEditInternalTelemetryService.storeEditPrompt({ prompt, uri: request.uri, isAgent: telemetryInfo.isAgent, document: request.existingDocument?.document }, { chatRequestId: telemetryInfo.chatRequestId, chatSessionId: telemetryInfo.chatSessionId, speculationRequestId: requestId, mapper });
			}
			return { annotations, telemetry: outcomeCorrelationTelemetry };
		} catch (err) {
			const annotations: OutcomeAnnotation[] = [{ label: err.message, message: `request failed`, severity: 'error' }];
			let errorDetails: ChatErrorDetails | undefined;
			if (err instanceof CompletionsFetchError) {
				if (err.type === 'stop_content_filter') {
					errorDetails = {
						message: getFilteredMessage(FilterReason.Prompt),
						responseIsFiltered: true
					};
				} else if (err.type === 'stop_length') {
					errorDetails = {
						message: l10n.t(`Sorry, the response hit the length limit. Please rephrase your prompt.`)
					};
				}
				this.logError(request, builtPrompt, { startTime, firstTokenTime, requestId }, outcomeCorrelationTelemetry, mapper, err.type);
			} else {
				this.logError(request, builtPrompt, { startTime, firstTokenTime, requestId }, outcomeCorrelationTelemetry, mapper, err.message, err);
			}
			errorDetails = errorDetails ?? {
				message: l10n.t(`Sorry, your request failed. Please try again. Request id: {0}`, requestId)
			};
			return { errorDetails, annotations, telemetry: outcomeCorrelationTelemetry };
		}
	}

	private async sendModelResponseInternalAndEnhancedTelemetry(useGPT4oProxy: boolean, builtPrompt: IFullRewritePrompt, result: ISuccessfulRewriteInfo, outcomeTelemetry: CodeMapperOutcomeTelemetry, mapper: string) {
		const payload = {
			headerRequestId: builtPrompt.requestId,
			baseModel: outcomeTelemetry.chatRequestModel,
			providerId: mapper,
			languageId: builtPrompt.languageId,
			messageText: useGPT4oProxy ? JSON.stringify(builtPrompt.messages) : builtPrompt.prompt,
			completionTextJson: result.allResponseText.join(''),
		};
		this.telemetryService.sendEnhancedGHTelemetryEvent('fastApply/successfulEdit', multiplexProperties(payload));
		this.telemetryService.sendInternalMSFTTelemetryEvent('fastApply/successfulEdit', payload);
	}

	private async fetchNativePredictedOutputs(request: ICodeMapperRequestInput, builtPrompt: IFullRewritePrompt, resultStream: MappedEditsResponseStream, outcomeTelemetry: CodeMapperOutcomeTelemetry, token: CancellationToken, applyEdits: boolean): Promise<CodeMapperOutcome | ISuccessfulRewriteInfo> {
		const { messages, speculation, requestId, endpoint } = builtPrompt;
		const startTime = Date.now();

		const fetchResult = await this.fetchAndContinueOnLengthError(endpoint, messages, speculation, request, resultStream, token, applyEdits);

		if (fetchResult.result.type !== ChatFetchResponseType.Success) {
			this.logError(request, builtPrompt, { startTime, firstTokenTime: fetchResult.firstTokenTime, requestId }, outcomeTelemetry, builtPrompt.endpoint.model, fetchResult.result.type);
			return {
				annotations: fetchResult.annotations,
				telemetry: outcomeTelemetry,
				errorDetails: { message: fetchResult.result.reason }
			};
		}

		const res = { allResponseText: fetchResult.allResponseText, firstTokenTime: fetchResult.firstTokenTime, startTime, finishReason: Completion.FinishReason.Stop, annotations: fetchResult.annotations, requestId };
		this.sendModelResponseInternalAndEnhancedTelemetry(true, builtPrompt, res, outcomeTelemetry, builtPrompt.endpoint.model);
		return res;
	}

	private async fetchAndContinueOnLengthError(endpoint: ChatEndpoint, promptMessages: Raw.ChatMessage[], speculation: string, request: ICodeMapperRequestInput, resultStream: MappedEditsResponseStream, token: CancellationToken, applyEdits: boolean): Promise<ISpeculationFetchResult> {
		const allResponseText: string[] = [];
		let responseLength = 0;
		let firstTokenTime: number = -1;

		const existingDocument = request.existingDocument;
		const documentLength = existingDocument ? existingDocument.getText().length : 0;
		const uri = request.uri;
		const maxLength = documentLength + request.codeBlock.length + 1000; // add 1000 to be safe

		//const { codeBlock, uri, documentContext, markdownBeforeBlock } = codemapperRequestInput;
		const pushedLines: string[] = [];
		const fetchStreamSource = new FetchStreamSource();
		const textStream = fetchStreamSource.stream.map((part) => part.delta.text);

		let processPromise: Promise<unknown> | undefined;
		if (applyEdits) {
			processPromise = existingDocument instanceof NotebookDocumentSnapshot
				? processFullRewriteNotebook(existingDocument.document, readLineByLine(textStream, token), resultStream, this.alternativeNotebookEditGenerator, { source: NotebookEditGenrationSource.codeMapperFastApply, model: endpoint.model, requestId: undefined }, token) // corrected parameter passing
				: processFullRewriteStream(uri, existingDocument, readLineByLine(textStream, token), resultStream, token, pushedLines);
		} else {
			processPromise = textStream.toPromise();
		}

		while (true) {
			const result = await endpoint.makeChatRequest(
				'editingSession/speculate',
				promptMessages,
				async (text, _, delta) => {
					if (firstTokenTime === -1) {
						firstTokenTime = Date.now();
					}
					fetchStreamSource.update(text, delta);
					allResponseText.push(delta.text);
					responseLength += delta.text.length;
					return undefined;
				},
				token,
				ChatLocation.EditingSession,
				undefined,
				{ stream: true, temperature: 0, prediction: { type: 'content', content: speculation } }
			);


			if (result.type === ChatFetchResponseType.Length) {
				if (responseLength > maxLength) {
					fetchStreamSource.resolve();
					await processPromise; // Flush all received text as edits to the response stream
					this.logCodemapperLoopTelemetry(request, result, uri, endpoint.model, documentLength, responseLength, true);
					return {
						result, firstTokenTime, allResponseText, annotations: [{
							label: 'codemapper loop', message: `Code mapper might be in a loop: Rewritten length: ${responseLength}, Document length: ${documentLength}, Code block length ${request.codeBlock.length}`, severity: 'error'
						}]
					};
				}

				const promptRenderer = PromptRenderer.create(
					this.instantiationService,
					endpoint,
					CodeMapperFullRewritePrompt,
					{ request, shouldTrimCodeBlocks: true, inProgressRewriteContent: result.truncatedValue } satisfies CodeMapperPromptProps
				);
				const response = await promptRenderer.render(undefined, token);
				promptMessages = response.messages;
			} else if (result.type === ChatFetchResponseType.Success) {
				fetchStreamSource.resolve();
				await processPromise; // Flush all received text as edits to the response stream

				if (applyEdits && (!existingDocument || existingDocument instanceof TextDocumentSnapshot)) {
					await handleTrailingLines(uri, existingDocument, resultStream, pushedLines, token);
				}
				this.logCodemapperLoopTelemetry(request, result, uri, endpoint.model, documentLength, responseLength, false);
				return { result, firstTokenTime, allResponseText, annotations: [] };
			} else {
				// error or cancelled
				fetchStreamSource.resolve();
				await processPromise; // Flush all received text as edits to the response stream

				return { result, firstTokenTime, allResponseText: [], annotations: [] };
			}

		}
	}

	private logCodemapperLoopTelemetry(request: ICodeMapperRequestInput, result: ChatResponse, uri: Uri, model: string, documentLength: number, responseLength: number, hasLoop: boolean) {
		/* __GDPR__
			"speculation.response.loop" : {
				"owner": "joyceerhl",
				"comment": "Report when the model appears to have gone into a loop.",
				"hasLoop": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the model appears to have gone into a loop." },
				"speculationRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"languageId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The language id of the document" },
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The model used for this speculation request" },
				"documentLength": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Length of original file", "isMeasurement": true },
				"rewrittenLength": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Length of original file", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('speculation.response.loop', {
			speculationRequestId: result.requestId,
			languageId: isNewDocument(request) ? getLanguageForResource(uri).languageId : request.existingDocument.languageId,
			model,
			hasLoop: String(hasLoop)
		}, {
			documentLength,
			rewrittenLength: responseLength
		});
	}

	private ensureFinishReasonStopOrThrow(requestId: string, finishReason: Completion.FinishReason | undefined) {
		switch (finishReason) {
			case undefined:
				break;
			case Completion.FinishReason.ContentFilter:
				throw new CompletionsFetchError('stop_content_filter', requestId, 'Content filter');
			case Completion.FinishReason.Length:
				throw new CompletionsFetchError('stop_length', requestId, 'Length limit');
			case Completion.FinishReason.Stop:
				break; // No error for 'Stop' finish reason
			default:
				assertNever(finishReason);
		}
	}

	//#endregion
}

function readLineByLine(source: AsyncIterable<string>, token: CancellationToken): AsyncIterable<LineOfText> {
	return new AsyncIterableObject<LineOfText>(async (emitter) => {
		const reader = new PartialAsyncTextReader(source[Symbol.asyncIterator]());
		let previousLineWasEmpty = false; // avoid emitting a trailing empty line all the time
		while (!reader.endOfStream) {
			// Skip everything until we hit a fence
			if (token.isCancellationRequested) {
				break;
			}
			const line = (await reader.readLine()).replace(/\r$/g, '');

			if (previousLineWasEmpty) {
				// Emit the previous held back empty line
				emitter.emitOne(new LineOfText(''));
			}

			if (line === '') {
				// Hold back empty lines and emit them with the next iteration
				previousLineWasEmpty = true;
			} else {
				previousLineWasEmpty = false;
				emitter.emitOne(new LineOfText(line));
			}
		}
	});
}

export interface ISuccessfulRewriteInfo {
	allResponseText: string[];
	firstTokenTime: number;
	startTime: number;
	finishReason: Completion.FinishReason;
	annotations: OutcomeAnnotation[];
}

function isCodeMapperOutcome(thing: unknown): thing is CodeMapperOutcome {
	return typeof thing === 'object' && !!thing && 'annotations' in thing && 'telemetry' in thing;
}

export interface CodeMapperOutcome {
	readonly errorDetails?: ChatErrorDetails;
	readonly annotations: OutcomeAnnotation[];
	readonly telemetry?: CodeMapperOutcomeTelemetry;
}

export interface CodeMapperOutcomeTelemetry {
	readonly requestId: string;
	readonly requestSource: string;
	readonly chatRequestModel?: string;
	readonly speculationRequestId: string;
	readonly mapper: 'fast' | 'fast-lora' | 'full' | 'patch' | string;
}

class CodeMapperRefusal {

}

interface ISpeculationFetchResult {
	result: ChatResponse;
	firstTokenTime: number;
	allResponseText: string[];
	annotations: OutcomeAnnotation[];
}

function getTrailingDocumentEmptyLineCount(document: TextDocumentSnapshot): number {
	let trailingEmptyLines = 0;
	for (let i = document.lineCount - 1; i >= 0; i--) {
		const line = document.lineAt(i);
		if (line.text.trim() === '') {
			trailingEmptyLines++;
		} else {
			break;
		}
	}
	return trailingEmptyLines;
}

export function getTrailingArrayEmptyLineCount(lines: readonly string[]): number {
	let trailingEmptyLines = 0;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].trim() === '') {
			trailingEmptyLines++;
		} else {
			break;
		}
	}
	return trailingEmptyLines;
}

async function computeAdditionsAndDeletions(diffService: IDiffService, original: string, modified: string): Promise<{ addedLines: number; removedLines: number }> {
	const diffResult = await diffService.computeDiff(original, modified, {
		ignoreTrimWhitespace: true,
		maxComputationTimeMs: 10000,
		computeMoves: false
	});

	let addedLines = 0;
	let removedLines = 0;
	for (const change of diffResult.changes) {
		removedLines += change.original.endLineNumberExclusive - change.original.startLineNumber;
		addedLines += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
	}

	return { addedLines, removedLines };
}
