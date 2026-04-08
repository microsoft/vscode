/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { hash } from '../../../util/vs/base/common/hash';
import { LRUCache } from '../../../util/vs/base/common/map';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { toTextParts } from '../../chat/common/globalStringUtils';
import { ILogService } from '../../log/common/logService';
import { ITelemetryService, multiplexProperties } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { APIJsonData, CAPIChatMessage, ChatCompletion, rawMessageToCAPI } from '../common/openai';
import { FinishedCompletion, convertToAPIJsonData } from './stream';

// TODO @lramos15 - Find a better file for this, since this file is for the chat stream and should not be telemetry related
export function sendEngineMessagesLengthTelemetry(telemetryService: ITelemetryService, messages: CAPIChatMessage[], telemetryData: TelemetryData, isOutput: boolean, logService?: ILogService) {
	const messageType = isOutput ? 'output' : 'input';

	// Get the unique model call ID - it should already be set in the base telemetryData
	const modelCallId = telemetryData.properties.modelCallId as string;
	if (!modelCallId) {
		// This shouldn't happen if the ID was properly generated at request start
		logService?.warn('[TELEMETRY] modelCallId not found in telemetryData, input/output messages cannot be linked');
		return;
	}

	// Create messages with content and tool_calls arguments replaced by length
	const messagesWithLength = messages.map(msg => {
		const processedMsg: any = {
			...msg, // This preserves ALL existing fields including tool_calls, tool_call_id, copilot_references, etc.
			content: typeof msg.content === 'string'
				? msg.content.length
				: Array.isArray(msg.content)
					? msg.content.reduce((total: number, part: any) => {
						if (typeof part === 'string') {
							return total + part.length;
						}
						if (part.type === 'text') {
							return total + (part.text?.length || 0);
						}
						return total;
					}, 0)
					: 0,
		};

		// Process tool_calls if present
		if ('tool_calls' in msg && msg.tool_calls && Array.isArray(msg.tool_calls)) {
			processedMsg.tool_calls = msg.tool_calls.map((toolCall: any) => ({
				...toolCall,
				function: toolCall.function ? {
					...toolCall.function,
					arguments: typeof toolCall.function.arguments === 'string'
						? toolCall.function.arguments.length
						: toolCall.function.arguments
				} : toolCall.function
			}));
		}

		return processedMsg;
	});

	// Process properties to replace request.option.tools.* field values with their length
	const processedProperties: { [key: string]: string } = {};
	for (const [key, value] of Object.entries(telemetryData.properties)) {
		if (key.startsWith('request.option.tools')) {
			// Replace the content with its length
			if (typeof value === 'string') {
				// If it's a string, it might be a JSON array, try to parse it
				try {
					const parsed = JSON.parse(value);
					if (Array.isArray(parsed)) {
						processedProperties[key] = parsed.length.toString();
					} else {
						processedProperties[key] = value.length.toString();
					}
				} catch {
					// If parsing fails, just use string length
					processedProperties[key] = value.length.toString();
				}
			} else if (Array.isArray(value)) {
				processedProperties[key] = (value as any[]).length.toString();
			} else {
				processedProperties[key] = '0';
			}
		} else {
			processedProperties[key] = value;
		}
	}

	const telemetryDataWithPrompt = TelemetryData.createAndMarkAsIssued({
		...processedProperties,
		messagesJson: JSON.stringify(messagesWithLength),
		message_direction: messageType,
		modelCallId: modelCallId, // Include at telemetry event level too
	}, telemetryData.measurements);

	telemetryService.sendEnhancedGHTelemetryEvent('engine.messages.length', multiplexProperties(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
	telemetryService.sendInternalMSFTTelemetryEvent('engine.messages.length', multiplexProperties(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
}

// LRU cache from message hash to UUID to ensure same content gets same UUID (limit: 1000 entries)
const messageHashToUuid = new LRUCache<string, string>(1000);

// LRU cache from request options hash to requestOptionsId to ensure same options get same ID (limit: 500 entries)
const requestOptionsHashToId = new LRUCache<string, string>(500);

// LRU cache to track headerRequestId to requestTurn mapping for temporal location tracking along main agent flow (limit: 1000 entries)
const headerRequestIdTracker = new LRUCache<string, number>(1000);

// Track most recent conversation headerRequestId for linking supplementary calls
const mainHeaderRequestIdTracker: { headerRequestId: string | null } = {
	headerRequestId: null
};

// Track conversation turns for model.request.added events (limit: 100 entries)
const conversationTracker = new LRUCache<string, number>(100);

/**
 * Updates the headerRequestIdTracker with the given headerRequestId.
 * If the headerRequestId already exists, increments its requestTurn.
 * If it doesn't exist, adds it with requestTurn = 1.
 * Returns the current requestTurn for the headerRequestId.
 */
function updateHeaderRequestIdTracker(headerRequestId: string): number {
	const currentTurn = headerRequestIdTracker.get(headerRequestId);
	if (currentTurn !== undefined) {
		// HeaderRequestId exists, increment turn
		const newTurn = currentTurn + 1;
		headerRequestIdTracker.set(headerRequestId, newTurn);
		return newTurn;
	} else {
		// New headerRequestId, set turn to 1
		headerRequestIdTracker.set(headerRequestId, 1);
		return 1;
	}
}

/**
 * Updates the conversationTracker with the given conversationId.
 * If the conversationId already exists, increments its turn.
 * If it doesn't exist, adds it with turn = 1.
 * Returns the current conversationTurn for the conversationId.
 */
function updateConversationTracker(conversationId: string): number {
	const currentTurn = conversationTracker.get(conversationId);
	if (currentTurn !== undefined) {
		// ConversationId exists, increment turn
		const newTurn = currentTurn + 1;
		conversationTracker.set(conversationId, newTurn);
		return newTurn;
	} else {
		// New conversationId, set turn to 1
		conversationTracker.set(conversationId, 1);
		return 1;
	}
}

// ===== MODEL TELEMETRY FUNCTIONS =====
// These functions send 'model...' events and are grouped together for better organization

function sendModelRequestOptionsTelemetry(telemetryService: ITelemetryService, telemetryData: TelemetryData, logService?: ILogService): string | undefined {
	// Extract all request.option.* properties
	const requestOptions: { [key: string]: string } = {};
	for (const [key, value] of Object.entries(telemetryData.properties)) {
		if (key.startsWith('request.option.')) {
			requestOptions[key] = value;
		}
	}

	// Only process if there are request options
	if (Object.keys(requestOptions).length === 0) {
		return undefined;
	}

	// Extract context properties
	const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';
	const headerRequestId = telemetryData.properties.headerRequestId || 'unknown';

	// Create a hash of the request options to detect duplicates
	const requestOptionsHash = hash(requestOptions).toString();

	// Get existing requestOptionsId for this content, or generate a new one
	let requestOptionsId = requestOptionsHashToId.get(requestOptionsHash);
	if (!requestOptionsId) {
		// This is a new set of request options, generate ID and send the event
		requestOptionsId = generateUuid();
		requestOptionsHashToId.set(requestOptionsHash, requestOptionsId);
	} else {
		// Skip sending model.request.options.added if this exact request options have already been logged
		return requestOptionsId;
	}

	// Convert request options to JSON string for chunking
	const requestOptionsJsonString = JSON.stringify(requestOptions);
	const maxChunkSize = 8000;

	// Split request options JSON into chunks of 8000 characters or less
	const chunks: string[] = [];
	for (let i = 0; i < requestOptionsJsonString.length; i += maxChunkSize) {
		chunks.push(requestOptionsJsonString.substring(i, i + maxChunkSize));
	}

	// Send one telemetry event per chunk
	for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
		const requestOptionsData = TelemetryData.createAndMarkAsIssued({
			requestOptionsId,
			conversationId,
			headerRequestId,
			requestOptionsJson: chunks[chunkIndex], // Store chunk of request options JSON
			chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
			totalChunks: chunks.length.toString(), // Total number of chunks for this request
		}, telemetryData.measurements); // Include measurements from original telemetryData

		telemetryService.sendInternalMSFTTelemetryEvent('model.request.options.added', requestOptionsData.properties, requestOptionsData.measurements);
	}

	return requestOptionsId;
}

function sendNewRequestAddedTelemetry(telemetryService: ITelemetryService, telemetryData: TelemetryData, logService?: ILogService): void {
	// This function captures user-level request context (username, session info, user preferences, etc.)
	// It's called once per unique user request (identified by headerRequestId)
	// It excludes message content and request options which are captured separately

	// Extract headerRequestId to check for uniqueness
	const headerRequestId = telemetryData.properties.headerRequestId;
	if (!headerRequestId) {
		return;
	}

	// Check if this is a conversation mode (has conversationId) or supplementary mode
	// This must be done BEFORE the duplicate check to ensure tracker is always updated
	const conversationId = telemetryData.properties.conversationId;
	if (conversationId) {
		// Conversation mode: update tracker with current headerRequestId
		mainHeaderRequestIdTracker.headerRequestId = headerRequestId;
	}

	// Check if we've already processed this headerRequestId
	if (headerRequestIdTracker.has(headerRequestId)) {
		return;
	}

	// Update conversation tracker and get conversation turn only for new headerRequestIds
	let conversationTurn: number | undefined;
	if (conversationId) {
		conversationTurn = updateConversationTracker(conversationId);
	}

	// Filter out properties that start with "message" or "request.option" and exclude modelCallId
	const filteredProperties: { [key: string]: string } = {};
	for (const [key, value] of Object.entries(telemetryData.properties)) {
		if (!key.startsWith('message') && !key.startsWith('request.option') && key !== 'modelCallId') {
			filteredProperties[key] = value;
		}
	}

	// Add conversationTurn if conversationId is present
	if (conversationTurn !== undefined) {
		filteredProperties.conversationTurn = conversationTurn.toString();
	}

	// For supplementary mode: add conversation linking fields if we have tracked data
	if (!conversationId && mainHeaderRequestIdTracker.headerRequestId) {
		const mostRecentTurn = headerRequestIdTracker.get(mainHeaderRequestIdTracker.headerRequestId);
		filteredProperties.mostRecentConversationHeaderRequestId = mainHeaderRequestIdTracker.headerRequestId;
		if (mostRecentTurn !== undefined) {
			filteredProperties.mostRecentConversationHeaderRequestIdTurn = mostRecentTurn.toString();
		}
	}

	// Create telemetry data for the request
	const requestData = TelemetryData.createAndMarkAsIssued(filteredProperties, telemetryData.measurements);

	telemetryService.sendInternalMSFTTelemetryEvent('model.request.added', requestData.properties, requestData.measurements);
}

function sendIndividualMessagesTelemetry(telemetryService: ITelemetryService, messages: CAPIChatMessage[], telemetryData: TelemetryData, messageDirection: 'input' | 'output', logService?: ILogService): Array<{ uuid: string; headerRequestId: string }> {
	const messageData: Array<{ uuid: string; headerRequestId: string }> = [];

	for (const message of messages) {
		// Extract context properties with fallbacks
		const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';
		const headerRequestId = telemetryData.properties.headerRequestId || 'unknown';

		// Create a hash of the message content AND headerRequestId to detect duplicates
		// Including headerRequestId ensures same message content with different headerRequestIds gets separate UUIDs
		const messageHash = hash({
			role: message.role,
			content: message.content,
			headerRequestId: headerRequestId, // Include headerRequestId in hash for proper deduplication
			...(('tool_calls' in message && message.tool_calls) && { tool_calls: message.tool_calls }),
			...(('tool_call_id' in message && message.tool_call_id) && { tool_call_id: message.tool_call_id })
		}).toString();

		// Get existing UUID for this message content + headerRequestId combination, or generate a new one
		let messageUuid = messageHashToUuid.get(messageHash);

		if (!messageUuid) {
			// This is a new message, generate UUID and send the event
			messageUuid = generateUuid();
			messageHashToUuid.set(messageHash, messageUuid);
		} else {
			// Always collect UUIDs and headerRequestIds for model call tracking
			messageData.push({ uuid: messageUuid, headerRequestId });

			// Skip sending model.message.added if this exact message has already been logged
			continue;
		}

		// Always collect UUIDs and headerRequestIds for model call tracking
		messageData.push({ uuid: messageUuid, headerRequestId });

		// Convert message to JSON string for chunking
		const messageJsonString = JSON.stringify(message);
		const maxChunkSize = 8000;

		// Split messageJson into chunks of 8000 characters or less
		const chunks: string[] = [];
		for (let i = 0; i < messageJsonString.length; i += maxChunkSize) {
			chunks.push(messageJsonString.substring(i, i + maxChunkSize));
		}

		// Send one telemetry event per chunk
		for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
			const messageData = TelemetryData.createAndMarkAsIssued({
				messageUuid,
				messageDirection,
				conversationId,
				headerRequestId,
				messageJson: chunks[chunkIndex], // Store chunk of message JSON
				chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
				totalChunks: chunks.length.toString(), // Total number of chunks for this message
			}, telemetryData.measurements); // Include measurements from original telemetryData

			telemetryService.sendInternalMSFTTelemetryEvent('model.message.added', messageData.properties, messageData.measurements);
		}
	}

	return messageData; // Return collected message data with UUIDs and headerRequestIds
}

function sendModelCallTelemetry(telemetryService: ITelemetryService, messageData: Array<{ uuid: string; headerRequestId: string }>, telemetryData: TelemetryData, messageDirection: 'input' | 'output', logService?: ILogService) {
	// Get the unique model call ID
	const modelCallId = telemetryData.properties.modelCallId as string;
	if (!modelCallId) {
		return;
	}

	// For input calls, process request options and get requestOptionsId
	let requestOptionsId: string | undefined;
	if (messageDirection === 'input') {
		requestOptionsId = sendModelRequestOptionsTelemetry(telemetryService, telemetryData, logService);
	}

	// Extract trajectory context
	const conversationId = telemetryData.properties.conversationId || telemetryData.properties.sessionId || 'unknown';

	// Group messages by headerRequestId
	const messagesByHeaderRequestId = new Map<string, string[]>();

	for (const item of messageData) {
		if (!messagesByHeaderRequestId.has(item.headerRequestId)) {
			messagesByHeaderRequestId.set(item.headerRequestId, []);
		}
		messagesByHeaderRequestId.get(item.headerRequestId)!.push(item.uuid);
	}

	// Send separate telemetry events for each headerRequestId
	for (const [headerRequestId, messageUuids] of messagesByHeaderRequestId) {
		const eventName = messageDirection === 'input' ? 'model.modelCall.input' : 'model.modelCall.output';

		// Update headerRequestIdTracker and get requestTurn only for input events
		let requestTurn: number | undefined;
		if (messageDirection === 'input') {
			requestTurn = updateHeaderRequestIdTracker(headerRequestId);
		}

		// Convert messageUuids to JSON string for chunking
		const messageUuidsJsonString = JSON.stringify(messageUuids);
		const maxChunkSize = 8000;

		// Split messageUuids JSON into chunks of 8000 characters or less
		const chunks: string[] = [];
		for (let i = 0; i < messageUuidsJsonString.length; i += maxChunkSize) {
			chunks.push(messageUuidsJsonString.substring(i, i + maxChunkSize));
		}

		// Send one telemetry event per chunk
		for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
			const parentToolCallId = telemetryData.properties.parentToolCallId;
			const modelCallData = TelemetryData.createAndMarkAsIssued({
				modelCallId,
				conversationId, // Trajectory identifier linking main and supplementary calls
				headerRequestId, // Specific to this set of messages
				messageDirection,
				messageUuids: chunks[chunkIndex], // Store chunk of messageUuids JSON
				chunkIndex: chunkIndex.toString(), // 0-based chunk index for ordering
				totalChunks: chunks.length.toString(), // Total number of chunks for this headerRequestId
				messageCount: messageUuids.length.toString(),
				...(requestTurn !== undefined && { requestTurn: requestTurn.toString() }), // Add requestTurn only for input calls
				...(requestOptionsId && { requestOptionsId }), // Add requestOptionsId for input calls
				...(telemetryData.properties.turnIndex && { turnIndex: telemetryData.properties.turnIndex }), // Add turnIndex from original telemetryData
				...(parentToolCallId && { parentToolCallId }), // Link subagent calls to parent tool invocation
			}, telemetryData.measurements); // Include measurements from original telemetryData

			telemetryService.sendInternalMSFTTelemetryEvent(eventName, modelCallData.properties, modelCallData.measurements);
		}
	}
}

function sendModelTelemetryEvents(telemetryService: ITelemetryService, messages: CAPIChatMessage[], telemetryData: TelemetryData, isOutput: boolean, logService?: ILogService): void {
	// Skip model telemetry events for XtabProvider and api.* message sources
	const messageSource = telemetryData.properties.messageSource as string;
	if (messageSource === 'XtabProvider' || (messageSource && messageSource.startsWith('api.'))) {
		return;
	}

	// Send model.request.added event for user input requests (once per headerRequestId)
	// This captures user-level context (username, session info, etc.) for the user's request
	// Note: This is different from model-level context which is captured in model.modelCall events
	if (!isOutput) {
		sendNewRequestAddedTelemetry(telemetryService, telemetryData, logService);
	}

	// Skip input message telemetry for retry requests to avoid duplicates
	// Retry requests are identified by the presence of retryAfterFilterCategory property
	const isRetryRequest = telemetryData.properties.retryAfterFilterCategory !== undefined;
	if (!isOutput && isRetryRequest) {
		return;
	}

	// Send individual message telemetry for deduplication tracking and collect UUIDs with their headerRequestIds
	const messageData = sendIndividualMessagesTelemetry(telemetryService, messages, telemetryData, isOutput ? 'output' : 'input', logService);

	// Send model call telemetry grouped by headerRequestId (separate events for different headerRequestIds)
	// For input calls, this also handles request options deduplication
	// Always send model call telemetry regardless of whether messages are new or duplicates to ensure every model invocation is tracked
	sendModelCallTelemetry(telemetryService, messageData, telemetryData, isOutput ? 'output' : 'input', logService);
}

// ===== END MODEL TELEMETRY FUNCTIONS =====

export function sendEngineMessagesTelemetry(telemetryService: ITelemetryService, messages: CAPIChatMessage[], telemetryData: TelemetryData, isOutput: boolean, logService?: ILogService) {
	const telemetryDataWithPrompt = telemetryData.extendedBy({
		messagesJson: JSON.stringify(messages),
	});
	telemetryService.sendEnhancedGHTelemetryEvent('engine.messages', multiplexProperties(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);
	// Commenting this out to test a new deduplicated way to collect the same information using sendModelTelemetryEvents()
	// TO DO remove this line completely if the new way allows for complete reconstruction of entire message arrays with much lower drop rate
	//telemetryService.sendInternalMSFTTelemetryEvent('engine.messages', multiplexProperties(telemetryDataWithPrompt.properties), telemetryDataWithPrompt.measurements);

	// Send all model telemetry events (model.request.added, model.message.added, model.modelCall.input/output, model.request.options.added)
	// Comment out the line below to disable the new deduplicated model telemetry events
	sendModelTelemetryEvents(telemetryService, messages, telemetryData, isOutput, logService);

	// Also send length-only telemetry
	sendEngineMessagesLengthTelemetry(telemetryService, messages, telemetryData, isOutput, logService);
}

export function sendResponsesApiCompactionTelemetry(
	telemetryService: ITelemetryService,
	properties: {
		outcome: 'compaction_returned' | 'threshold_met_no_compaction';
		headerRequestId: string;
		gitHubRequestId: string;
		model: string;
	},
	measurements: {
		compactThreshold?: number;
		promptTokens: number;
		totalTokens: number;
	}
): void {
	/* __GDPR__
		"responsesApi.compactionOutcome" : {
			"owner": "dileepy",
			"comment": "Tracks server-side Responses API compaction outcomes.",
			"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the server returned a compaction item or exceeded the threshold without returning one." },
			"headerRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Request ID from the response headers." },
			"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "GitHub request ID from the response headers if present." },
			"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Model identifier reported by the response." },
			"compactThreshold": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Compaction threshold configured for the request." },
			"promptTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Prompt token count reported by the response." },
			"totalTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total token count reported by the response." }
		}
	*/
	telemetryService.sendGHTelemetryEvent('responsesApi.compactionOutcome', {
		outcome: properties.outcome,
		headerRequestId: properties.headerRequestId,
		gitHubRequestId: properties.gitHubRequestId,
		model: properties.model,
	}, {
		compactThreshold: measurements.compactThreshold,
		promptTokens: measurements.promptTokens,
		totalTokens: measurements.totalTokens,
	});
}

export function prepareChatCompletionForReturn(
	telemetryService: ITelemetryService,
	logService: ILogService,
	c: FinishedCompletion,
	telemetryData: TelemetryData
): ChatCompletion {
	let messageContent = c.solution.text.join('');

	let blockFinished = false;
	if (c.finishOffset !== undefined) {
		// Trim solution to finishOffset returned by finishedCb
		logService.debug(`message ${c.index}: early finish at offset ${c.finishOffset}`);
		messageContent = messageContent.substring(0, c.finishOffset);
		blockFinished = true;
	}

	logService.info(`message ${c.index} returned. finish reason: [${c.reason}]`);
	logService.debug(
		`message ${c.index} details: finishOffset: [${c.finishOffset}] completionId: [{${c.requestId.completionId}}] created: [{${c.requestId.created}}]`
	);
	const jsonData: APIJsonData = convertToAPIJsonData(c.solution);
	const message: Raw.ChatMessage = {
		role: Raw.ChatRole.Assistant,
		content: toTextParts(messageContent),
	};

	// Create enhanced message for telemetry with usage information
	const telemetryMessage = rawMessageToCAPI(message);

	// Add request metadata to telemetry data
	telemetryData.extendWithRequestId(c.requestId);

	// Add usage information to telemetryData if available
	let telemetryDataWithUsage = telemetryData;
	if (c.usage) {
		telemetryDataWithUsage = telemetryData.extendedBy({}, {
			promptTokens: c.usage.prompt_tokens,
			completionTokens: c.usage.completion_tokens,
			totalTokens: c.usage.total_tokens
		});
	}

	sendEngineMessagesTelemetry(telemetryService, [telemetryMessage], telemetryDataWithUsage, true, logService);
	return {
		message: message,
		choiceIndex: c.index,
		requestId: c.requestId,
		blockFinished: blockFinished,
		finishReason: c.reason,
		filterReason: c.filterReason,
		error: c.error,
		tokens: jsonData.tokens,
		model: c.solution.model,
		usage: c.usage,
		telemetryData: telemetryDataWithUsage,
	};
}
