/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ITelemetryService, TelemetryProperties } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { Conversation } from '../common/conversation';

export type ConversationalBaseTelemetryData = ConversationalTelemetryData<{ messageId: string }, { promptTokenLen: number; messageCharLen: number }>;

export function createTelemetryWithId(): ConversationalBaseTelemetryData {
	const uniqueId = generateUuid();
	const baseTelemetry = TelemetryData.createAndMarkAsIssued({ messageId: uniqueId });
	return new ConversationalTelemetryData(baseTelemetry);
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

/** Create new telemetry data based on baseTelemetryData and send `conversation.message` event  */
export function sendConversationalMessageTelemetry(
	telemetryService: ITelemetryService,
	document: TextDocumentSnapshot | undefined,
	location: ChatLocation,
	messageText: string | undefined,
	properties: TelemetryProperties,
	measurements: { [key: string]: number },
	baseTelemetry: ConversationalBaseTelemetryData
): TelemetryData {

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
	telemetryService.sendEnhancedGHTelemetryEvent(`${prefix}.messageText`, enhancedTelemetryLogger.raw.properties, enhancedTelemetryLogger.raw.measurements);
	telemetryService.sendInternalMSFTTelemetryEvent(`${prefix}.messageText`, enhancedTelemetryLogger.raw.properties, enhancedTelemetryLogger.raw.measurements);

	return standardTelemetryData.raw;
}

export function sendSuggestionShownTelemetryData(
	telemetryService: ITelemetryService,
	suggestion: string,
	messageId: string,
	suggestionId: string,
	doc: TextDocument | TextDocumentSnapshot | undefined
): TelemetryData {
	const telemetryData = sendUserActionTelemetry(
		telemetryService,
		doc,
		{
			suggestion: suggestion,
			messageId: messageId,
			suggestionId: suggestionId,
		},
		{},
		'conversation.suggestionShown'
	);
	return telemetryData;
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
