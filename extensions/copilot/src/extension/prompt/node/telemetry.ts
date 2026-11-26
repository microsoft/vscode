/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequestModeInstructions, TextDocument } from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ITelemetryService, multiplexProperties, TelemetryProperties } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { Conversation } from '../common/conversation';

export type ConversationalBaseTelemetryData = ConversationalTelemetryData<{ messageId: string }, { promptTokenLen: number; messageCharLen: number }>;

export function createTelemetryWithId(): ConversationalBaseTelemetryData {
	const uniqueId = generateUuid();
	const baseTelemetry = TelemetryData.createAndMarkAsIssued({ messageId: uniqueId });
	return new ConversationalTelemetryData(baseTelemetry);
}

/**
 * Legacy telemetry compatibility allowlist of custom-provider agents that should still
 * be reported under their own name rather than the generic `custom` bucket.
 *
 * The Plan agent is contributed via a `ChatCustomAgentProvider`, so `isBuiltin` is `false`
 * even though it is shipped by Copilot. Downstream metrics (e.g. `chat_panel_plan_mode`) key
 * off the literal value `plan`, so it must be preserved here.
 */
const NAMED_CUSTOM_AGENT_MODES = new Set(['plan']);

/**
 * Resolves the mode name to report in telemetry for a request's mode instructions.
 *
 * Built-in modes (Ask, Edit, Agent) report their lowercased name. Custom-provider agents
 * report `custom`, except for those in {@link NAMED_CUSTOM_AGENT_MODES} which are reported
 * under their own name for backwards compatibility with downstream metrics.
 *
 * @returns the resolved mode name, or `undefined` when no mode instructions are present.
 */
export function getModeNameForTelemetry(modeInstructions: ChatRequestModeInstructions | undefined): string | undefined {
	if (!modeInstructions) {
		return undefined;
	}

	const modeName = modeInstructions.name.toLowerCase();
	if (modeInstructions.isBuiltin || NAMED_CUSTOM_AGENT_MODES.has(modeName)) {
		return modeName;
	}

	return 'custom';
}

export class ConversationalTelemetryData<P extends TelemetryProperties, M extends { [key: string]: number }> {

	public get properties(): P { return this.raw.properties as P; }
	public get measurements(): M { return this.raw.measurements as M; }

	constructor(
		public readonly raw: TelemetryData
	) { }

	markAsDisplayed(): void {
		this.raw.markAsDisplayed();
	}

	extendedBy<P2 extends TelemetryProperties, M2 extends { [key: string]: number }>(properties?: P2, measurements?: M2): ConversationalTelemetryData<P & P2, M & M2> {
		const newTelemetryData = this.raw.extendedBy(properties, measurements);
		return new ConversationalTelemetryData(newTelemetryData);
	}
}

export function extendUserMessageTelemetryData(
	conversation: Conversation,
	conversationId: string,
	location: ChatLocation,
	message: string,
	promptTokenLen: number,
	suggestion: string | undefined,
	baseTelemetry: ConversationalBaseTelemetryData
): ConversationalBaseTelemetryData {

	const properties: TelemetryProperties = {
		source: 'user',
		turnIndex: (conversation.turns.length - 1).toString(),
		conversationId,
		uiKind: ChatLocation.toString(location)
	};
	const measurements = {
		promptTokenLen: promptTokenLen,
		messageCharLen: message.length,
	};
	if (suggestion) {
		properties.suggestion = suggestion;
	}

	baseTelemetry = baseTelemetry.extendedBy(properties, measurements);

	return baseTelemetry;
}

export function sendUserMessageTelemetry(
	telemetryService: ITelemetryService,
	location: ChatLocation,
	requestId: string,
	message: string | undefined,
	offTopic: boolean | undefined,
	doc: TextDocumentSnapshot | undefined,
	baseTelemetry: ConversationalBaseTelemetryData,
	modeName: string,
): void {
	if (offTopic !== undefined) {
		baseTelemetry = baseTelemetry.extendedBy({ offTopic: offTopic.toString() });
	}
	baseTelemetry = baseTelemetry.extendedBy({ headerRequestId: requestId });
	sendConversationalMessageTelemetry(telemetryService, doc, location, message, { mode: modeName }, {}, baseTelemetry);
}

export function sendModelMessageTelemetry(
	telemetryService: ITelemetryService,
	conversation: Conversation,
	location: ChatLocation,
	appliedText: string,
	requestId: string,
	doc: TextDocumentSnapshot | undefined,
	baseTelemetry: ConversationalBaseTelemetryData,
	modeName: string,
): void {
	// Get the languages of code blocks within the message
	const codeBlockLanguages = getCodeBlocks(appliedText);

	sendConversationalMessageTelemetry(
		telemetryService,
		doc,
		location,
		appliedText,
		{
			source: 'model',
			turnIndex: conversation.turns.length.toString(),
			conversationId: conversation.sessionId,
			headerRequestId: requestId,
			uiKind: ChatLocation.toString(location),
			codeBlockLanguages: JSON.stringify({ ...codeBlockLanguages }),
			mode: modeName,
		},
		{ messageCharLen: appliedText.length, numCodeBlocks: codeBlockLanguages.length },
		baseTelemetry
	);
}

export function sendOffTopicMessageTelemetry(
	telemetryService: ITelemetryService,
	conversation: Conversation,
	location: ChatLocation,
	appliedText: string,
	userMessageId: string,
	doc: TextDocumentSnapshot | undefined,
	baseTelemetry: ConversationalBaseTelemetryData
): void {
	sendConversationalMessageTelemetry(
		telemetryService,
		doc,
		location,
		appliedText,
		{
			source: 'offTopic',
			turnIndex: conversation.turns.length.toString(),
			conversationId: conversation.sessionId,
			userMessageId: userMessageId,
			uiKind: ChatLocation.toString(location),
		},
		{ messageCharLen: appliedText.length },
		baseTelemetry
	);
}

const INLINE_REASONING_TAGS = [
	{ open: '<think>', close: '</think>' },
	{ open: '<thinking>', close: '</thinking>' },
	{ open: '<analysis>', close: '</analysis>' },
] as const;

interface IStructuredModelMessageText {
	readonly role: 'assistant';
	readonly content: string;
	readonly reasoning_text?: string;
}

function parseFenceMarker(text: string, lineStart: number): { char: string; length: number; lineEnd: number } | undefined {
	let i = lineStart;
	while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
		i++;
	}
	const ch = text[i];
	if (ch !== '`' && ch !== '~') {
		return undefined;
	}
	let end = i;
	while (end < text.length && text[end] === ch) {
		end++;
	}
	const length = end - i;
	if (length < 3) {
		return undefined;
	}
	const nl = text.indexOf('\n', end);
	const lineEnd = nl === -1 ? text.length : nl + 1;
	return { char: ch, length, lineEnd };
}

function isClosingFenceLine(text: string, lineStart: number, fenceChar: string, fenceLength: number): number | undefined {
	let i = lineStart;
	while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
		i++;
	}
	if (text[i] !== fenceChar) {
		return undefined;
	}
	let end = i;
	while (end < text.length && text[end] === fenceChar) {
		end++;
	}
	if (end - i < fenceLength) {
		return undefined;
	}
	while (end < text.length && (text[end] === ' ' || text[end] === '\t' || text[end] === '\r')) {
		end++;
	}
	if (end === text.length) {
		return text.length;
	}
	return text[end] === '\n' ? end + 1 : undefined;
}

function extractInlineReasoning(text: string): { content: string; reasoningText: string | undefined } {
	let pos = 0;
	let chunkStart = 0;
	let atLineStart = true;
	let activeFence: { char: string; length: number } | undefined;
	let foundTag = false;
	let hasNonWhitespaceContent = false;
	let nextThink = text.indexOf('<think', 0);
	let nextAnalysis = text.indexOf('<analysis>', 0);
	let nextNewline = text.indexOf('\n', 0);
	const contentParts: string[] = [];
	const reasoningParts: string[] = [];

	while (pos < text.length) {
		if (atLineStart) {
			if (activeFence) {
				const closedEnd = isClosingFenceLine(text, pos, activeFence.char, activeFence.length);
				if (closedEnd !== undefined) {
					activeFence = undefined;
					pos = closedEnd;
					atLineStart = true;
					continue;
				}
				if (nextNewline !== -1 && nextNewline < pos) {
					nextNewline = text.indexOf('\n', pos);
				}
				if (nextNewline === -1) {
					break;
				}
				pos = nextNewline + 1;
				atLineStart = true;
				continue;
			}
			const fence = parseFenceMarker(text, pos);
			if (fence) {
				activeFence = { char: fence.char, length: fence.length };
				pos = fence.lineEnd;
				atLineStart = true;
				continue;
			}
		}

		if (nextThink !== -1 && nextThink < pos) {
			nextThink = text.indexOf('<think', pos);
		}
		if (nextAnalysis !== -1 && nextAnalysis < pos) {
			nextAnalysis = text.indexOf('<analysis>', pos);
		}
		const nextTag = nextThink === -1
			? nextAnalysis
			: nextAnalysis === -1
				? nextThink
				: Math.min(nextThink, nextAnalysis);
		if (nextTag === -1) {
			break;
		}
		if (nextNewline !== -1 && nextNewline < pos) {
			nextNewline = text.indexOf('\n', pos);
		}
		if (nextNewline !== -1 && nextNewline < nextTag) {
			pos = nextNewline + 1;
			atLineStart = true;
			continue;
		}

		const matchedTag = INLINE_REASONING_TAGS.find(tag => text.startsWith(tag.open, nextTag));
		if (!matchedTag) {
			pos = nextTag + 1;
			atLineStart = false;
			continue;
		}

		foundTag = true;
		const before = text.slice(chunkStart, nextTag);
		if (before.length > 0 && (hasNonWhitespaceContent || before.trim().length > 0)) {
			contentParts.push(before);
			hasNonWhitespaceContent = true;
		}

		const innerStart = nextTag + matchedTag.open.length;
		const closeIdx = text.indexOf(matchedTag.close, innerStart);
		if (closeIdx === -1) {
			const inner = text.slice(innerStart).trim();
			if (inner) {
				reasoningParts.push(inner);
			}
			chunkStart = text.length;
			pos = text.length;
			break;
		}

		const inner = text.slice(innerStart, closeIdx).trim();
		if (inner) {
			reasoningParts.push(inner);
		}
		let afterClose = closeIdx + matchedTag.close.length;
		if (contentParts.length === 0) {
			let scan = afterClose;
			let lastNewlineEnd = -1;
			while (scan < text.length && (text[scan] === ' ' || text[scan] === '\t' || text[scan] === '\r' || text[scan] === '\n')) {
				if (text[scan] === '\n') {
					lastNewlineEnd = scan + 1;
				}
				scan++;
			}
			// Preserve leading indentation when a newline separates the closing tag from the
			// answer so indented fenced code blocks retain both indentation and line-start state.
			afterClose = lastNewlineEnd !== -1 ? lastNewlineEnd : scan;
		}
		chunkStart = afterClose;
		pos = afterClose;
		atLineStart = contentParts.length === 0 || pos === 0 || text[pos - 1] === '\n';
	}

	if (!foundTag) {
		return { content: text, reasoningText: undefined };
	}
	if (chunkStart < text.length) {
		contentParts.push(text.slice(chunkStart));
	}
	return {
		content: contentParts.join(''),
		reasoningText: reasoningParts.length > 0 ? reasoningParts.join('\n\n') : undefined,
	};
}

/**
 * Formats assistant text for restricted `conversation.messageText` telemetry into a
 * structured `{ role, content, reasoning_text? }` JSON payload.
 *
 * Uses a native substring scan fast path so messages without inline reasoning tags skip
 * line/fence parsing. Both closed and unclosed `<think>`, `<thinking>`, and `<analysis>`
 * blocks outside fenced code blocks are extracted into `reasoning_text` in linear time.
 */
export function formatModelMessageTextForTelemetry(content: string, wireReasoningText?: string): string {
	const trimmedWireReasoning = wireReasoningText?.trim();
	if (content.indexOf('<think') === -1 && content.indexOf('<analysis>') === -1) {
		const payload: IStructuredModelMessageText = trimmedWireReasoning
			? { role: 'assistant', content, reasoning_text: trimmedWireReasoning }
			: { role: 'assistant', content };
		return JSON.stringify(payload);
	}

	const extracted = extractInlineReasoning(content);
	const reasoningParts: string[] = [];
	if (trimmedWireReasoning) {
		reasoningParts.push(trimmedWireReasoning);
	}
	if (extracted.reasoningText) {
		reasoningParts.push(extracted.reasoningText);
	}
	const reasoningText = reasoningParts.length > 0 ? reasoningParts.join('\n\n') : undefined;
	const payload: IStructuredModelMessageText = reasoningText
		? { role: 'assistant', content: extracted.content, reasoning_text: reasoningText }
		: { role: 'assistant', content: extracted.content };
	return JSON.stringify(payload);
}

/**
 * Returns standard message telemetry synchronously and sends restricted message text asynchronously,
 * using the shared chunk format to preserve text beyond the per-property limit.
 */
export function sendConversationalMessageTelemetry(
	telemetryService: ITelemetryService,
	document: TextDocumentSnapshot | undefined,
	location: ChatLocation,
	messageText: string | undefined,
	properties: TelemetryProperties,
	measurements: { [key: string]: number },
	baseTelemetry: ConversationalBaseTelemetryData
): TelemetryData {

	const isModelMessage = (properties.source ?? baseTelemetry.raw.properties.source) === 'model';
	const enhancedProperties: { [key: string]: string } = {
		...(messageText ? { messageText: messageText } : {}),
		...properties,
	};

	if (document) {
		properties.languageId = document.languageId;
		measurements.documentLength = document.getText().length;
	}

	const standardTelemetryData = baseTelemetry.extendedBy(properties, measurements);
	const enhancedTelemetryLogger = baseTelemetry.extendedBy(enhancedProperties);

	// Telemetrize the message in standard and enhanced telemetry
	// Enhanced telemetry will not be sent if the user isn't opted in, same as for ghostText
	const prefix = telemetryPrefixForLocation(location);

	telemetryService.sendGHTelemetryEvent(`${prefix}.message`, standardTelemetryData.raw.properties, standardTelemetryData.raw.measurements);
	if (telemetryService.isRestrictedTelemetryActive === false) {
		return standardTelemetryData.raw;
	}
	void (async () => {
		try {
			await Promise.resolve();
			const rawProperties = isModelMessage && messageText
				? { ...enhancedTelemetryLogger.raw.properties, messageText: formatModelMessageTextForTelemetry(messageText) }
				: enhancedTelemetryLogger.raw.properties;
			const properties = await multiplexProperties(rawProperties);
			telemetryService.sendEnhancedGHTelemetryEvent(`${prefix}.messageText`, properties, enhancedTelemetryLogger.raw.measurements);
			telemetryService.sendInternalMSFTTelemetryEvent(`${prefix}.messageText`, properties, enhancedTelemetryLogger.raw.measurements);
		} catch (error) {
			telemetryService.sendGHTelemetryException(error, 'sendConversationalMessageTelemetry');
		}
	})();

	return standardTelemetryData.raw;
}

/** Create new telemetry data based on baseTelemetryData and send event with name */
export function sendUserActionTelemetry(
	telemetryService: ITelemetryService,
	document: TextDocument | TextDocumentSnapshot | undefined,
	properties: TelemetryProperties,
	measurements: { [key: string]: number },
	name: string,
	baseTelemetry?: TelemetryData
): TelemetryData {
	const telemetryData = baseTelemetry ?? TelemetryData.createAndMarkAsIssued();

	if (document) {
		properties.languageId = document.languageId;
		measurements.documentLength = document.getText().length;
	}

	const standardTelemetryData = telemetryData.extendedBy(properties, measurements);
	telemetryService.sendGHTelemetryEvent(name, standardTelemetryData.properties, standardTelemetryData.measurements);

	return standardTelemetryData;
}

function telemetryPrefixForLocation(location: ChatLocation): string {
	switch (location) {
		case ChatLocation.Editor:
			return 'inlineConversation';
		case ChatLocation.EditingSession:
			return 'editingSession';
		case ChatLocation.Panel:
		default:
			return 'conversation';
	}
}

export interface ICodeblockDetails {
	readonly languageId: string;
	readonly totalLines: number;
}

export function getCodeBlocks(text: string): ICodeblockDetails[] {
	const lines = text.split('\n');
	const codeBlocks: ICodeblockDetails[] = [];

	let codeBlockState: undefined | {
		readonly delimiter: string;
		readonly languageId: string;
		totalLines: number;
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (codeBlockState) {
			if (new RegExp(`^\\s*${codeBlockState.delimiter}\\s*$`).test(line)) {
				codeBlocks.push({
					languageId: codeBlockState.languageId,
					totalLines: codeBlockState.totalLines
				});
				codeBlockState = undefined;
			} else {
				codeBlockState.totalLines++;
			}
		} else {
			const match = line.match(/^(\s*)(`{3,}|~{3,})(\w*)/);
			if (match) {
				codeBlockState = {
					delimiter: match[2],
					languageId: match[3],
					totalLines: 0
				};
			}
		}
	}
	return codeBlocks;
}
