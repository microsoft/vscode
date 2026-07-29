/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';

export const AGENT_HOST_VOICE_MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

export function isAgentHostVoiceMessageWithinLimit(message: string): boolean {
	let byteLength = 0;
	for (let index = 0; index < message.length; index++) {
		const codeUnit = message.charCodeAt(index);
		if (codeUnit < 0x80) {
			byteLength++;
		} else if (codeUnit < 0x800) {
			byteLength += 2;
		} else if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF && index + 1 < message.length) {
			const nextCodeUnit = message.charCodeAt(index + 1);
			if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
				byteLength += 4;
				index++;
			} else {
				byteLength += 3;
			}
		} else {
			byteLength += 3;
		}
		if (byteLength > AGENT_HOST_VOICE_MAX_MESSAGE_BYTES) {
			return false;
		}
	}
	return true;
}

export interface IAgentHostVoiceCloseEvent {
	readonly code: number;
	readonly reason: string;
}

/**
 * Narrow VS Code extension surface for relaying the Voice backend through an
 * already-authenticated Agent Host connection.
 */
export interface IAgentHostVoiceRelay {
	readonly onDidReceiveVoiceMessage: Event<string>;
	readonly onDidCloseVoiceConnection: Event<IAgentHostVoiceCloseEvent>;
	connectVoice(): Promise<void>;
	sendVoiceMessage(message: string): void;
	disconnectVoice(): Promise<void>;
}

export function isAgentHostVoiceRelay(connection: object): connection is IAgentHostVoiceRelay {
	const candidate = connection as Partial<IAgentHostVoiceRelay>;
	return typeof candidate.connectVoice === 'function'
		&& typeof candidate.sendVoiceMessage === 'function'
		&& typeof candidate.disconnectVoice === 'function'
		&& typeof candidate.onDidReceiveVoiceMessage === 'function'
		&& typeof candidate.onDidCloseVoiceConnection === 'function';
}
