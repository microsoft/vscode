/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptReference, Raw } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { getTextPart, roleToString } from '../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isAutoModel } from '../../../platform/endpoint/node/autoChatEndpoint';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData as PlatformTelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { getCachedSha256Hash } from '../../../util/common/crypto';
import { isNotebookCellOrNotebookChatInput } from '../../../util/common/notebooks';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { isBYOKModel } from '../../byok/node/openAIEndpoint';
import { Intent, agentsToCommands } from '../../common/constants';
import { DiagnosticsTelemetryData, findDiagnosticsTelemetry } from '../../inlineChat/node/diagnosticsTelemetry';
import { InteractionOutcome } from '../../inlineChat/node/promptCraftingTypes';
import { AgentIntent } from '../../intents/node/agentIntent';
import { EditCodeIntent } from '../../intents/node/editCodeIntent';
import { getCustomInstructionTelemetry } from '../../prompts/node/panel/customInstructions';
import { PATCH_PREFIX } from '../../tools/node/applyPatch/parseApplyPatch';
import { ChatVariablesCollection, parseSlashCommand } from '../common/chatVariablesCollection';
import { Conversation } from '../common/conversation';
import { IToolCall, IToolCallRound } from '../common/intents';
import { IDocumentContext } from './documentContext';
import { IIntent, TelemetryData } from './intents';
import { RepoInfoTelemetry } from './repoInfoTelemetry';
import { ConversationalBaseTelemetryData, ConversationalTelemetryData, createTelemetryWithId, extendUserMessageTelemetryData, getCodeBlocks, sendModelMessageTelemetry, sendOffTopicMessageTelemetry, sendUserActionTelemetry, sendUserMessageTelemetry } from './telemetry';

// #region: internal telemetry for responses

type ResponseInternalTelemetryProperties = {
	chatLocation: 'inline' | 'panel';
	intent: string;
	request: string;
	response: string;
	baseModel: string;
	apiType: string | undefined;
};

// EVENT: interactiveSessionResponse
type ResponseInternalPanelTelemetryProperties = ResponseInternalTelemetryProperties & {
	chatLocation: 'panel';
	requestId: string;

	// shareable but NOT
	isParticipantDetected: string;
	sessionId: string;
};

// EVENT: interactiveSessionResponse
type ResponseInternalPanelTelemetryMeasurements = {
	turnNumber: number;
};

// EVENT: interactiveSessionResponse
type ResponseInternalInlineTelemetryProperties = ResponseInternalTelemetryProperties & {
	chatLocation: 'inline';

	// shareable but NOT
	conversationId: string;
	requestId: string;
	responseType: ChatFetchResponseType;

	// editor-specific
	problems: string;
	selectionProblems: string;
	diagnosticCodes: string;
	selectionDiagnosticCodes: string;
	diagnosticsProvider: string;
	language: string;
};

// EVENT: interactiveSessionResponse
type ResponseInternalInlineTelemetryMeasurements = {
	isNotebook: number;
	turnNumber: number;
};

// #endregion

// #region: internal telemetry for requests

// EVENT: interactiveSessionMessage

type RequestInternalPanelTelemetryProperties = {
	chatLocation: 'panel';
	sessionId: string;
	requestId: string;
	baseModel: string;
	apiType: string | undefined;
	intent: string;
	isParticipantDetected: string;
	detectedIntent: string;
	contextTypes: string;
	query: string;
};

// EVENT: interactiveSessionRequest

type RequestInternalInlineTelemetryProperties = {
	chatLocation: 'inline';
	conversationId: string;
	requestId: string;
	intent: string;
	language: string;
	prompt: string;
	model: string;
	apiType: string | undefined;
};

type RequestInternalInlineTelemetryMeasurements = {
	isNotebook: number;
	turnNumber: number;
};

// #endregion


//#region public telemetry for requests

// EVENT: panel.request

type RequestTelemetryProperties = {
	command: string;
	contextTypes: string;
	promptTypes: string;
	conversationId: string;
	requestId: string;

	responseType: string;
	languageId: string | undefined;
	model: string;
	apiType: string | undefined;
	toolCounts: string;
};

type RequestPanelTelemetryProperties = RequestTelemetryProperties & {
	responseId: string;
	codeBlocks: string;
	isParticipantDetected: string;
	mode: string;
	parentRequestId: string | undefined;
	vscodeRequestId: string | undefined;
	slashCommand: string;
	isSystemInitiated: string;
};

type RequestTelemetryMeasurements = {
	promptTokenCount: number;
	timeToRequest: number;
	timeToFirstToken: number;
	timeToComplete: number;
	responseTokenCount: number;
	messageTokenCount: number;
	numToolCalls: number;
	availableToolCount: number;
	toolTokenCount: number;
	isBYOK: number;
	isAuto: number;
};

type RequestPanelTelemetryMeasurements = RequestTelemetryMeasurements & {
	turn: number;
	round: number;
	textBlocks: number;
	links: number;
	maybeOffTopic: number;
	userPromptCount: number;
	summarizationEnabled: number;
};

// EVENT: inline.request

type RequestInlineTelemetryProperties = RequestTelemetryProperties & {
	languageId: string;
	replyType: string;
	diagnosticsProvider: string;
	diagnosticCodes: string;
	selectionDiagnosticCodes: string;
	outcomeAnnotations: string;
};

type RequestInlineTelemetryMeasurements = RequestTelemetryMeasurements & {
	firstTurn: number;
	isNotebook: number;
	withIntentDetection: number;
	implicitCommand: number;
	attemptCount: number;
	selectionLineCount: number;
	wholeRangeLineCount: number;
	editCount: number;
	editLineCount: number;
	markdownCharCount: number;
	problemsCount: number;
	selectionProblemsCount: number;
	diagnosticsCount: number;
	selectionDiagnosticsCount: number;
};

//#endregion

const builtinSlashCommands = new Set(
	Object.values(agentsToCommands).flatMap(commands => commands ? Object.keys(commands) : [])
);

function getSlashCommandForTelemetry(request: vscode.ChatRequest, extensionUri: URI): string {
	// Built-in slash commands (explain, fix, tests, etc.) are safe to send as plain text
	if (request.command && builtinSlashCommands.has(request.command)) {
		return request.command;
	}

	// Parse the query for /command and match against prompt file references
	const match = parseSlashCommand(request.prompt, new ChatVariablesCollection(request.references));
	if (!match) {
		return '';
	}

	// Extension-provided prompt files are safe to send as plain text
	if (URI.isUri(match.variable.value) && extUriBiasedIgnorePathCase.isEqualOrParent(match.variable.value, extensionUri)) {
		return match.command;
	}

	// User-defined prompt file slash commands may contain PII — hash them
	return getCachedSha256Hash(match.command);
}

export class ChatTelemetryBuilder {

	public readonly baseUserTelemetry: ConversationalBaseTelemetryData;

	private readonly _repoInfoTelemetry: RepoInfoTelemetry;

	public get telemetryMessageId() {
		return this.baseUserTelemetry.properties.messageId;
	}

	constructor(
		private readonly _startTime: number,
		private readonly _sessionId: string,
		private readonly _documentContext: IDocumentContext | undefined,
		private readonly _firstTurn: boolean,
		private readonly _request: vscode.ChatRequest,
		telemetryMessageId: string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.baseUserTelemetry = telemetryMessageId
			? new ConversationalTelemetryData(PlatformTelemetryData.createAndMarkAsIssued({ messageId: telemetryMessageId }))
			: createTelemetryWithId();
		// Repo info telemetry is held here as the begin event should be sent only by the first PanelChatTelemetry instance created for a user request.
		// and a new PanelChatTelemetry instance is created per step in the request.
		this._repoInfoTelemetry = this.instantiationService.createInstance(RepoInfoTelemetry, this.baseUserTelemetry.properties.messageId);
	}

	public makeRequest(intent: IIntent, location: ChatLocation.Editor, conversation: Conversation, messages: Raw.ChatMessage[], promptTokenLength: number, references: readonly PromptReference[], endpoint: IChatEndpoint, telemetryData: readonly TelemetryData[], availableToolCount: number, toolTokenCount: number): InlineChatTelemetry;
	public makeRequest(intent: IIntent, location: ChatLocation, conversation: Conversation, messages: Raw.ChatMessage[], promptTokenLength: number, references: readonly PromptReference[], endpoint: IChatEndpoint, telemetryData: readonly TelemetryData[], availableToolCount: number, toolTokenCount: number): PanelChatTelemetry;
	public makeRequest(intent: IIntent, location: ChatLocation, conversation: Conversation, messages: Raw.ChatMessage[], promptTokenLength: number, references: readonly PromptReference[], endpoint: IChatEndpoint, telemetryData: readonly TelemetryData[], availableToolCount: number, toolTokenCount: number): InlineChatTelemetry | PanelChatTelemetry {

		if (location === ChatLocation.Editor) {
			return this.instantiationService.createInstance(InlineChatTelemetry,
				this._sessionId,
				this._documentContext!,
				this._firstTurn,
				this._request,
				this._startTime,
				this.baseUserTelemetry,
				conversation,
				intent,
				messages,
				references,
				endpoint,
				promptTokenLength,
				telemetryData,
				availableToolCount,
				toolTokenCount,
				this._repoInfoTelemetry
			);
		} else {
			return this.instantiationService.createInstance(PanelChatTelemetry,
				this._sessionId,
				this._documentContext!,
				this._firstTurn,
				this._request,
				this._startTime,
				this.baseUserTelemetry,
				conversation,
				intent,
				messages,
				references,
				endpoint,
				promptTokenLength,
				telemetryData,
				availableToolCount,
				toolTokenCount,
				this._repoInfoTelemetry
			);
		}
	}
}

export abstract class ChatTelemetry<C extends IDocumentContext | undefined = IDocumentContext | undefined> {

	protected readonly _userTelemetry: ConversationalBaseTelemetryData;

	protected readonly _requestStartTime: number = Date.now();
	protected _firstTokenTime: number = 0;

	protected _addedLinkCount = 0;
	protected _markdownCharCount: number = 0;
	protected _editCount: number = 0;
	protected _editLineCount: number = 0;

	// todo@connor4312: temporary event to track occurences of patches in response
	// text, ref https://github.com/microsoft/vscode-copilot/issues/16608
	private _didSeePatchInResponse = false;
	private _lastMarkdownLine = '';

	public get telemetryMessageId(): string {
		return this._userTelemetry.properties.messageId;
	}

	public get editCount(): number {
		return this._editCount;
	}

	public get editLineCount(): number {
		return this._editLineCount;
	}

	public get sessionId(): string {
		return this._sessionId;
	}

	constructor(
		protected readonly _location: ChatLocation,
		protected readonly _sessionId: string,
		protected readonly _documentContext: C,
		protected readonly _firstTurn: boolean,
		protected readonly _request: vscode.ChatRequest,
		protected readonly _startTime: number,
		baseUserTelemetry: ConversationalBaseTelemetryData,
		protected readonly _conversation: Conversation,
		protected readonly _intent: IIntent,
		protected readonly _messages: Raw.ChatMessage[],
		protected readonly _references: readonly PromptReference[],
		protected readonly _endpoint: IChatEndpoint,
		promptTokenLength: number,
		protected readonly _genericTelemetryData: readonly TelemetryData[],
		protected readonly _availableToolCount: number,
		protected readonly _toolTokenCount: number,
		protected readonly _repoInfoTelemetry: RepoInfoTelemetry,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
	) {
		// Extend the base user telemetry with message and prompt information.
		// We don't send this telemetry yet, but we will need it later to include the off topic scores.
		this._userTelemetry = extendUserMessageTelemetryData(
			this._conversation,
			this._sessionId,
			this._location,
			this._request.prompt,
			promptTokenLength,
			// this._tokenizer.countMessagesTokens(this._messages),
			this._intent.id,
			baseUserTelemetry
		);

		// we are in a super-ctor and use a microtask to give sub-classes a change to initialize properties
		// that might be used in their _sendInternalRequestTelemetryEvent-method
		queueMicrotask(() => this._sendInternalRequestTelemetryEvent());
	}

	public markReceivedToken(): void {
		if (this._firstTokenTime === 0) {
			this._firstTokenTime = Date.now();
		}
	}

	public markAddedLinks(n: number): void {
		this._addedLinkCount += n;
	}

	public markEmittedMarkdown(str: vscode.MarkdownString) {
		this._markdownCharCount += str.value.length;
		this._lastMarkdownLine += str.value;
		if (this._lastMarkdownLine.includes(PATCH_PREFIX.trim())) {
			this._didSeePatchInResponse = true;
		}

		const i = this._lastMarkdownLine.lastIndexOf('\n');
		this._lastMarkdownLine = this._lastMarkdownLine.slice(i + 1);
	}

	public markEmittedEdits(uri: vscode.Uri, edits: vscode.TextEdit[]) {
		this._editCount += edits.length;
		this._editLineCount += edits.reduce((acc, edit) => acc + edit.newText.split('\n').length, 0);
	}

	public async sendTelemetry(requestId: string, responseType: ChatFetchResponseType, response: string, interactionOutcome: InteractionOutcome, toolCalls: IToolCall[]): Promise<void> {
		// We can send the user message telemetry event now that the response is returned, including off-topic prediction.
		sendUserMessageTelemetry(
			this._telemetryService,
			this._location,
			requestId,
			this._request.prompt,
			responseType === ChatFetchResponseType.OffTopic ? true : false,
			this._documentContext?.document,
			this._userTelemetry,
			this._getModeNameForTelemetry(),
		);

		if (responseType === ChatFetchResponseType.OffTopic) {
			sendOffTopicMessageTelemetry(
				this._telemetryService,
				this._conversation,
				this._location,
				this._request.prompt,
				this.telemetryMessageId, // That's the message id of the user message
				this._documentContext?.document,
				this._userTelemetry
			);
		}

		if (responseType === ChatFetchResponseType.Success) {
			sendModelMessageTelemetry(
				this._telemetryService,
				this._conversation,
				this._location,
				response,
				this.telemetryMessageId, // That's the message id of the user message
				this._documentContext?.document,
				this._userTelemetry.extendedBy({ replyType: interactionOutcome.kind }),
				this._getModeNameForTelemetry()
			);
		}

		await this._sendResponseTelemetryEvent(responseType, response, interactionOutcome, toolCalls);
		this._sendResponseInternalTelemetryEvent(responseType, response);


		// todo@connor4312: temporary event to track occurences of patches in response
		// text, ref https://github.com/microsoft/vscode-copilot/issues/16608
		if (this._didSeePatchInResponse) {
			/* __GDPR__
				"applyPatch.inResponse" : {
					"owner": "digitarald",
					"comment": "Metadata about an inline response from the model",
					"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is used in the endpoint." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('applyPatch.inResponse', {
				model: this._endpoint.model
			});
		}
	}

	protected _getModeNameForTelemetry(): string {
		return this._request.modeInstructions2 ? (this._request.modeInstructions2.isBuiltin ? this._request.modeInstructions2.name.toLowerCase() : 'custom') :
			this._intent.id === AgentIntent.ID ? 'agent' :
				(this._intent.id === EditCodeIntent.ID) ? 'edit' :
					(this._intent.id === Intent.InlineChat) ? 'inlineChatIntent' :
						'ask';
	}

	public sendToolCallingTelemetry(toolCallRounds: IToolCallRound[], availableTools: readonly vscode.LanguageModelToolInformation[], responseType: ChatFetchResponseType | 'cancelled' | 'maxToolCalls'): void {
		if (availableTools.length === 0) {
			return;
		}

		const toolCounts = toolCallRounds.reduce((acc, round) => {
			round.toolCalls.forEach(call => {
				acc[call.name] = (acc[call.name] || 0) + 1;
			});
			return acc;
		}, {} as Record<string, number>);

		const invalidToolCallCount = toolCallRounds.reduce((acc, round) => {
			if (round.toolInputRetry > 0) {
				acc++;
			}
			return acc;
		}, 0);

		let totalToolCalls = 0;
		let parallelToolCallRounds = 0;
		let parallelToolCallsTotal = 0;
		for (const round of toolCallRounds) {
			const count = round.toolCalls.length;
			totalToolCalls += count;
			if (count > 1) {
				parallelToolCallRounds++;
				parallelToolCallsTotal += count;
			}
		}

		const toolCallProperties = {
			intentId: this._intent.id,
			conversationId: this._conversation.sessionId,
			requestId: this.telemetryMessageId,
			responseType,
			toolCounts: JSON.stringify(toolCounts),
			model: this._endpoint.model
		};

		const toolCallMeasurements = {
			numRequests: toolCallRounds.length, // This doesn't include cancelled requests
			turnIndex: this._conversation.turns.length,
			sessionDuration: Date.now() - this._conversation.turns[0].startTime,
			turnDuration: Date.now() - this._conversation.getLatestTurn().startTime,
			promptTokenCount: this._userTelemetry.measurements.promptTokenLen,
			messageCharLen: this._userTelemetry.measurements.messageCharLen,
			availableToolCount: availableTools.length,
			toolTokenCount: this._toolTokenCount,
			invalidToolCallCount,
			totalToolCalls,
			parallelToolCallRounds,
			parallelToolCallsTotal
		};

		/* __GDPR__
			"toolCallDetails" : {
				"owner": "roblourens",
				"comment": "Records information about tool calls during a request.",
				"intentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the invoked intent." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current turn request." },
				"numRequests": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The total number of requests made" },
				"turnIndex": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The conversation turn index" },
				"toolCounts": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": false, "comment": "The number of times each tool was used" },
				"sessionDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time since the session started" },
				"turnDuration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time since the turn started" },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens were in the last generated prompt." },
				"messageCharLen": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many characters were in the user message." },
				"availableToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How number of tools that were available." },
				"toolTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens were used by tool definitions." },
				"responseType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the final response was successful or how it failed." },
				"invalidToolCallCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of tool call rounds that had an invalid tool call." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used for the request." },
				"totalToolCalls": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of tool calls across all rounds." },
				"parallelToolCallRounds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of rounds where the model called multiple tools in parallel." },
				"parallelToolCallsTotal": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of tool calls that were part of a parallel round." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('toolCallDetails', toolCallProperties, toolCallMeasurements);

		this._telemetryService.sendInternalMSFTTelemetryEvent('toolCallDetailsInternal', {
			...toolCallProperties,
			messageId: this.telemetryMessageId,
			availableTools: JSON.stringify(availableTools.map(tool => tool.name))
		}, toolCallMeasurements);

		this._telemetryService.sendEnhancedGHTelemetryEvent('toolCallDetailsExternal', {
			...toolCallProperties,
			messageId: this.telemetryMessageId,
			availableTools: JSON.stringify(availableTools.map(tool => tool.name))
		}, toolCallMeasurements);

		// Send internal repo info telemetry at the end of the tool loop
		this._repoInfoTelemetry.sendEndTelemetry();
	}

	protected abstract _sendInternalRequestTelemetryEvent(): void;

	protected abstract _sendResponseTelemetryEvent(responseType: ChatFetchResponseType, response: string, interactionOutcome: InteractionOutcome, toolCalls?: IToolCall[]): Promise<void>;

	protected abstract _sendResponseInternalTelemetryEvent(responseType: ChatFetchResponseType, response: string): void;

	protected _getTelemetryData<T extends TelemetryData>(ctor: new (...args: any[]) => T): T | undefined {
		return <T>this._genericTelemetryData.find(d => d instanceof ctor);
	}

}

export class PanelChatTelemetry extends ChatTelemetry<IDocumentContext | undefined> {

	constructor(
		sessionId: string,
		documentContext: IDocumentContext | undefined,
		firstTurn: boolean,
		request: vscode.ChatRequest,
		startTime: number,
		baseUserTelemetry: ConversationalBaseTelemetryData,
		conversation: Conversation,
		intent: IIntent,
		messages: Raw.ChatMessage[],
		references: readonly PromptReference[],
		endpoint: IChatEndpoint,
		promptTokenLength: number,
		genericTelemetryData: readonly TelemetryData[],
		availableToolCount: number,
		toolTokenCount: number,
		repoInfoTelemetry: RepoInfoTelemetry,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
	) {
		super(ChatLocation.Panel,
			sessionId,
			documentContext,
			firstTurn,
			request,
			startTime,
			baseUserTelemetry,
			conversation,
			intent,
			messages,
			references,
			endpoint,
			promptTokenLength,
			genericTelemetryData,
			availableToolCount,
			toolTokenCount,
			repoInfoTelemetry,
			telemetryService
		);
	}

	protected override _sendInternalRequestTelemetryEvent(): void {


		// Capture the created prompt in internal telemetry
		this._telemetryService.sendInternalMSFTTelemetryEvent('interactiveSessionMessage', {
			chatLocation: 'panel',
			sessionId: this._sessionId,
			requestId: this.telemetryMessageId,
			baseModel: this._endpoint.model,
			apiType: this._endpoint.apiType,
			intent: this._intent.id,
			isParticipantDetected: String(this._request.isParticipantDetected),
			detectedIntent: this._request.enableCommandDetection ? this._intent?.id : 'none',
			contextTypes: 'none', // TODO this is defunct
			query: this._request.prompt
		} satisfies RequestInternalPanelTelemetryProperties, {
			turnNumber: this._conversation.turns.length,
		} satisfies ResponseInternalPanelTelemetryMeasurements);

		// Send the begin telemetry for repo info, this uses the same repo info telemetry instance held by the builder class
		// as the begin event need to be sent only once per user request and PanelChatTelemetry is recreated per step. The class is
		// guarded to only send one time.
		this._repoInfoTelemetry.sendBeginTelemetryIfNeeded();
	}

	protected override async _sendResponseTelemetryEvent(responseType: ChatFetchResponseType, response: string, interactionOutcome: InteractionOutcome, toolCalls: IToolCall[] = []): Promise<void> {


		const turn = this._conversation.getLatestTurn();
		const roundIndex = turn.rounds.length - 1;

		const codeBlocks = response ? getCodeBlocks(response) : [];
		const codeBlockLanguages = codeBlocks.map(block => block.languageId);

		// TBD@digitarald: This is a first cheap way to detect off-topic LLM responses.
		const offTopicHints = ['programming-related tasks', 'programming related questions', 'software development topics', 'related to programming', 'expertise is limited', 'sorry, i can\'t assist with that'];
		let maybeOffTopic = 0;
		if (responseType === ChatFetchResponseType.Success && !response.trim().includes('\n')) {
			// Check responseMessage
			if (offTopicHints.some(flag => response.toLowerCase().includes(flag))) {
				maybeOffTopic = 1;
			}
		}

		const toolCounts = toolCalls.reduce((acc, call) => {
			acc[call.name] = (acc[call.name] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		const messageTokenCount = await this._endpoint.acquireTokenizer().tokenLength(turn.request.message);
		const promptTokenCount = await this._endpoint.acquireTokenizer().countMessagesTokens(this._messages);
		const responseTokenCount = await this._endpoint.acquireTokenizer().tokenLength(response) ?? 0;

		/* __GDPR__
			"panel.request" : {
				"owner": "digitarald",
				"comment": "Metadata about one message turn in a chat conversation.",
				"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The command which was used in providing the response." },
				"contextTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The context parts which were used in providing the response." },
				"promptTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The prompt types and their length which were used in providing the response." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for this message request." },
				"responseId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for this message response." },
				"responseType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the response was successful or how it failed." },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language of the active editor." },
				"codeBlocks": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Code block languages in the response." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is used in the endpoint." },
				"apiType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The API type used in the endpoint- responses or chatCompletions" },
				"turn": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many turns have been made in the conversation." },
				"round": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The current round index of the turn." },
				"textBlocks": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "For text-only responses (no code), how many paragraphs were in the response." },
				"links": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Symbol and file links in the response.", "isMeasurement": true },
				"maybeOffTopic": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "If the response sounds like it got rejected due to the request being off-topic." },
				"messageTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many characters were in the user message." },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many characters were in the generated prompt." },
				"userPromptCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many user messages were in the generated prompt." },
				"responseTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many characters were in the response." },
				"timeToRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to start the final request." },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to get the first token." },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to complete the request." },
				"codeGenInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions are in the request." },
				"codeGenInstructionsLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whats the length of the code generation instructions that were added to request." },
				"codeGenInstructionsFilteredCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions were filtered." },
				"codeGenInstructionFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instruction files were read." },
				"codeGenInstructionSettingsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions originated from settings." },
				"toolCounts": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": false, "comment": "The number of times each tool was used" },
				"numToolCalls": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The total number of tool calls" },
				"availableToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How number of tools that were available." },
				"toolTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens were used by tool definitions." },
				"summarizationEnabled" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Whether summarization is enabled (the default) or disabled (via user setting)" },
				"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the request was for a BYOK model" },
				"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the request was for an Auto model" },
				"mode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat mode used for this request (e.g., ask, edit, agent, custom)." },
				"parentRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The parent request id if this request is from a subagent." },
				"vscodeRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The VS Code chat request id, for joining with VS Code telemetry events." },
				"slashCommand": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The slash command used by the user, if any (e.g. troubleshoot, explain). Empty if no slash command was used." },
				"isSystemInitiated": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was system-initiated (e.g. terminal completion notification) rather than user-typed." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('panel.request', {
			command: this._intent.id,
			contextTypes: 'none', // TODO this is defunct
			promptTypes: this._messages.map(msg => `${msg.role}${'name' in msg && msg.name ? `-${msg.name}` : ''}:${getTextPart(msg.content).length}`).join(','),
			conversationId: this._sessionId,
			requestId: turn.id,
			responseId: turn.id, // SAME as fetchResult.requestId ,
			responseType,
			languageId: this._documentContext?.document.languageId,
			codeBlocks: codeBlockLanguages.join(','),
			model: this._endpoint.model,
			apiType: this._endpoint.apiType,
			isParticipantDetected: String(this._request.isParticipantDetected),
			toolCounts: JSON.stringify(toolCounts),
			mode: this._getModeNameForTelemetry(),
			parentRequestId: this._request.parentRequestId,
			vscodeRequestId: this._request.id,
			slashCommand: getSlashCommandForTelemetry(this._request, URI.from(this._extensionContext.extensionUri)),
			isSystemInitiated: String(!!this._request.isSystemInitiated)
		} satisfies RequestPanelTelemetryProperties, {
			turn: this._conversation.turns.length,
			round: roundIndex,
			textBlocks: codeBlocks.length ? -1 : response.split(/\n{2,}/).length ?? 0,
			links: this._addedLinkCount,
			maybeOffTopic: maybeOffTopic,
			messageTokenCount,
			promptTokenCount,
			userPromptCount: this._messages.filter(msg => msg.role === Raw.ChatRole.User).length,
			responseTokenCount,
			timeToRequest: this._requestStartTime - this._startTime,
			timeToFirstToken: this._firstTokenTime ? this._firstTokenTime - this._startTime : -1,
			timeToComplete: Date.now() - this._startTime,
			...getCustomInstructionTelemetry(turn.references),
			numToolCalls: toolCalls.length,
			availableToolCount: this._availableToolCount,
			toolTokenCount: this._toolTokenCount,
			summarizationEnabled: this._configurationService.getConfig(ConfigKey.SummarizeAgentConversationHistory) ? 1 : 0,
			isBYOK: isBYOKModel(this._endpoint),
			isAuto: isAutoModel(this._endpoint)
		} satisfies RequestPanelTelemetryMeasurements);

		const modeName = this._getModeNameForTelemetry();
		sendUserActionTelemetry(
			this._telemetryService,
			undefined,
			{
				command: this._intent.id,
				conversationId: this._sessionId,
				requestId: turn.id,
				responseType,
				languageId: this._documentContext?.document.languageId ?? '',
				model: this._endpoint.model,
				isParticipantDetected: String(this._request.isParticipantDetected),
				toolCounts: JSON.stringify(toolCounts),
				mode: modeName,
				codeBlocks: JSON.stringify(codeBlocks),
				vscodeRequestId: this._request.id,
			},
			{
				isAgent: this._intent.id === AgentIntent.ID ? 1 : 0,
				turn: this._conversation.turns.length,
				round: roundIndex,
				textBlocks: codeBlocks.length ? -1 : response.split(/\n{2,}/).length ?? 0,
				links: this._addedLinkCount,
				maybeOffTopic,
				messageTokenCount,
				promptTokenCount,
				userPromptCount: this._messages.filter(msg => msg.role === Raw.ChatRole.User).length,
				responseTokenCount,
				timeToRequest: this._requestStartTime - this._startTime,
				timeToFirstToken: this._firstTokenTime ? this._firstTokenTime - this._startTime : -1,
				timeToComplete: Date.now() - this._startTime,
				numToolCalls: toolCalls.length,
				availableToolCount: this._availableToolCount,
			},
			'panel_request'
		);
	}

	protected override _sendResponseInternalTelemetryEvent(_responseType: ChatFetchResponseType, response: string): void {

		this._telemetryService.sendInternalMSFTTelemetryEvent('interactiveSessionResponse', {
			// shared
			chatLocation: 'panel',
			requestId: this.telemetryMessageId,
			intent: this._intent.id,
			request: this._request.prompt,
			response: response ?? '',
			baseModel: this._endpoint.model,
			apiType: this._endpoint.apiType,

			// shareable but NOT
			isParticipantDetected: String(this._request.isParticipantDetected),
			sessionId: this._sessionId,
		} satisfies ResponseInternalPanelTelemetryProperties, {
			turnNumber: this._conversation.turns.length,
		} satisfies ResponseInternalPanelTelemetryMeasurements);
	}
}

export class InlineChatTelemetry extends ChatTelemetry<IDocumentContext> {

	private readonly _diagnosticsTelemetryData: {
		fileDiagnosticsTelemetry: DiagnosticsTelemetryData;
		selectionDiagnosticsTelemetry: DiagnosticsTelemetryData;
		diagnosticsProvider: string;
	};

	private get _isNotebookDocument(): number {
		return isNotebookCellOrNotebookChatInput(this._documentContext.document.uri) ? 1 : 0;
	}

	constructor(
		sessionId: string,
		documentContext: IDocumentContext,
		firstTurn: boolean,
		request: vscode.ChatRequest,
		startTime: number,
		baseUserTelemetry: ConversationalBaseTelemetryData,
		conversation: Conversation,
		intent: IIntent,
		messages: Raw.ChatMessage[],
		references: readonly PromptReference[],
		endpoint: IChatEndpoint,
		promptTokenLength: number,
		genericTelemetryData: readonly TelemetryData[],
		availableToolCount: number,
		toolTokenCount: number,
		repoInfoTelemetry: RepoInfoTelemetry,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILanguageDiagnosticsService private readonly _languageDiagnosticsService: ILanguageDiagnosticsService,
	) {
		super(ChatLocation.Editor,
			sessionId,
			documentContext,
			firstTurn,
			request,
			startTime,
			baseUserTelemetry,
			conversation,
			intent,
			messages,
			references,
			endpoint,
			promptTokenLength,
			genericTelemetryData,
			availableToolCount,
			toolTokenCount,
			repoInfoTelemetry,
			telemetryService
		);

		this._diagnosticsTelemetryData = findDiagnosticsTelemetry(this._documentContext.selection, this._languageDiagnosticsService.getDiagnostics(this._documentContext.document.uri));
	}

	protected override _sendInternalRequestTelemetryEvent(): void {
		// Capture the created prompt in internal telemetry
		this._telemetryService.sendInternalMSFTTelemetryEvent('interactiveSessionRequest', {
			conversationId: this._sessionId,
			requestId: this.telemetryMessageId,
			chatLocation: 'inline',
			intent: this._intent.id,
			language: this._documentContext.document.languageId,
			prompt: this._messages.map(m => `${roleToString(m.role).toUpperCase()}:\n${m.content}`).join('\n---\n'),
			model: this._endpoint.model,
			apiType: this._endpoint.apiType
		} satisfies RequestInternalInlineTelemetryProperties, {
			isNotebook: this._isNotebookDocument,
			turnNumber: this._conversation.turns.length,
		} satisfies RequestInternalInlineTelemetryMeasurements);
	}

	protected override async _sendResponseTelemetryEvent(responseType: ChatFetchResponseType, response: string, interactionOutcome: InteractionOutcome, toolCalls: IToolCall[] = []): Promise<void> {

		const toolCounts = toolCalls.reduce((acc, call) => {
			acc[call.name] = (acc[call.name] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		/* __GDPR__
			"inline.request" : {
				"owner": "digitarald",
				"comment": "Metadata about an inline response from the model",
				"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The command which was used in providing the response." },
				"contextTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The context parts which were used in providing the response." },
				"promptTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The prompt types and their length which were used in providing the response." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the conversation." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for this message request." },
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language of the current document." },
				"responseType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The result type of the response." },
				"replyType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How response is shown in the interface." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is used in the endpoint." },
				"apiType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The API type used in the endpoint- responses or chatCompletions" },
				"diagnosticsProvider": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The diagnostics provider." },
				"diagnosticCodes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The diagnostics codes in the file." },
				"selectionDiagnosticCodes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The selected diagnostics codes." },
				"firstTurn": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether this is the first turn in the conversation." },
				"isNotebook": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether this is a notebook document." },
				"messageTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens are in the rest of the query, without the command." },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens are in the overall prompt." },
				"responseTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens were in the response." },
				"implicitCommand": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the command was implictly detected or provided by the user." },
				"attemptCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many times the user has retried." },
				"selectionLineCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many lines are in the current selection." },
				"wholeRangeLineCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many lines are in the expanded whole range." },
				"editCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many edits are suggested." },
				"editLineCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many lines are in all suggested edits." },
				"markdownCharCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many characters were emitted as markdown to vscode in the response stream." },
				"problemsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many problems are in the current document." },
				"selectionProblemsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many problems are in the current selected code." },
				"diagnosticsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many diagnostic codes are in the current ." },
				"selectionDiagnosticsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many diagnostic codes are in the code at the selection." },
				"outcomeAnnotations": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Annotations about the outcome of the request." },
				"timeToRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to start the final request." },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to get the first token." },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to complete the request." },
				"codeGenInstructionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions are in the request." },
				"codeGenInstructionsLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The length of the code generation instructions that were added to request." },
				"codeGenInstructionsFilteredCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions were filtered." },
				"codeGenInstructionFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instruction files were read." },
				"codeGenInstructionSettingsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many code generation instructions originated from settings." },
				"toolCounts": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": false, "comment": "The number of times each tool was used" },
				"numToolCalls": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The total number of tool calls" },
				"availableToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How number of tools that were available." },
				"toolTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many tokens were used by tool definitions." },
				"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the request was for a BYOK model" },
				"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the request was for an Auto model" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('inline.request', {
			command: this._intent.id,
			contextTypes: 'none',// TODO@jrieken intentResult.contexts.map(part => part.kind).join(',') ?? 'none',
			promptTypes: this._messages.map(msg => `${msg.role}${'name' in msg && msg.name ? `-${msg.name}` : ''}:${getTextPart(msg.content).length}`).join(','),
			conversationId: this._sessionId,
			requestId: this.telemetryMessageId,
			languageId: this._documentContext.document.languageId,
			responseType: responseType,
			replyType: interactionOutcome.kind,
			model: this._endpoint.model,
			apiType: this._endpoint.apiType,
			diagnosticsProvider: this._diagnosticsTelemetryData.diagnosticsProvider,
			diagnosticCodes: this._diagnosticsTelemetryData.fileDiagnosticsTelemetry.diagnosticCodes,
			selectionDiagnosticCodes: this._diagnosticsTelemetryData.selectionDiagnosticsTelemetry.diagnosticCodes,
			outcomeAnnotations: interactionOutcome.annotations?.map(a => a.label).join(','),
			toolCounts: JSON.stringify(toolCounts),
		} satisfies RequestInlineTelemetryProperties, {
			firstTurn: this._firstTurn ? 1 : 0,
			isNotebook: this._isNotebookDocument,
			withIntentDetection: this._request.enableCommandDetection ? 1 : 0,
			messageTokenCount: await this._endpoint.acquireTokenizer().tokenLength(this._request.prompt),
			promptTokenCount: await this._endpoint.acquireTokenizer().countMessagesTokens(this._messages),
			responseTokenCount: responseType === ChatFetchResponseType.Success ? await this._endpoint.acquireTokenizer().tokenLength(response) : -1,
			implicitCommand: (!this._request.prompt.trim().startsWith(`/${this._intent.id}`) ? 1 : 0),
			attemptCount: this._request.attempt || 0,
			selectionLineCount: Math.abs(this._documentContext.selection.end.line - this._documentContext.selection.start.line) + 1,
			wholeRangeLineCount: Math.abs(this._documentContext.wholeRange.end.line - this._documentContext.wholeRange.start.line) + 1,
			editCount: this._editCount > 0 ? this._editCount : -1,
			editLineCount: this._editLineCount > 0 ? this._editLineCount : -1,
			markdownCharCount: this._markdownCharCount,
			problemsCount: this._diagnosticsTelemetryData.fileDiagnosticsTelemetry.problemsCount,
			selectionProblemsCount: this._diagnosticsTelemetryData.selectionDiagnosticsTelemetry.problemsCount,
			diagnosticsCount: this._diagnosticsTelemetryData.fileDiagnosticsTelemetry.diagnosticsCount,
			selectionDiagnosticsCount: this._diagnosticsTelemetryData.selectionDiagnosticsTelemetry.diagnosticsCount,
			timeToRequest: this._requestStartTime - this._startTime,
			timeToFirstToken: this._firstTokenTime ? this._firstTokenTime - this._startTime : -1,
			timeToComplete: Date.now() - this._startTime,
			...getCustomInstructionTelemetry(this._references),
			numToolCalls: toolCalls.length,
			availableToolCount: this._availableToolCount,
			toolTokenCount: this._toolTokenCount,
			isBYOK: isBYOKModel(this._endpoint),
			isAuto: isAutoModel(this._endpoint)
		} satisfies RequestInlineTelemetryMeasurements);
	}

	protected override  _sendResponseInternalTelemetryEvent(responseType: ChatFetchResponseType, response: string): void {
		this._telemetryService.sendInternalMSFTTelemetryEvent('interactiveSessionResponse', {
			chatLocation: 'inline',
			intent: this._intent.id,
			request: this._request.prompt,
			response,
			conversationId: this._sessionId,
			requestId: this.telemetryMessageId,
			baseModel: this._endpoint.model,
			apiType: this._endpoint.apiType,
			responseType,
			problems: this._diagnosticsTelemetryData.fileDiagnosticsTelemetry.problems,
			selectionProblems: this._diagnosticsTelemetryData.selectionDiagnosticsTelemetry.problems,
			diagnosticCodes: this._diagnosticsTelemetryData.fileDiagnosticsTelemetry.diagnosticCodes,
			selectionDiagnosticCodes: this._diagnosticsTelemetryData.selectionDiagnosticsTelemetry.diagnosticCodes,
			diagnosticsProvider: this._diagnosticsTelemetryData.diagnosticsProvider,
			language: this._documentContext.document.languageId,
		} satisfies ResponseInternalInlineTelemetryProperties, {
			isNotebook: this._isNotebookDocument,
			turnNumber: this._conversation.turns.length,
		} satisfies ResponseInternalInlineTelemetryMeasurements);
	}
}
