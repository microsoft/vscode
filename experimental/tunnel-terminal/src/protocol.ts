/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const protocolVersion = 2;
export const maxMessageBytes = 1024 * 1024;
export const maxInputLength = 16 * 1024;
export const maxBufferedBytes = 1024 * 1024;
export const outputHighWatermark = 64 * 1024;
export const outputLowWatermark = 16 * 1024;

export type ClientMessage =
	| { type: 'start'; version: 2; cols: number; rows: number }
	| { type: 'input'; data: string }
	| { type: 'resize'; cols: number; rows: number }
	| { type: 'ack'; chars: number };

export type ServerMessage =
	| { type: 'pairing'; version: 2; code: string }
	| { type: 'ready'; version: 2 }
	| { type: 'data'; data: string }
	| { type: 'exit'; exitCode: number }
	| { type: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isDimension(value: unknown): value is number {
	return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 1000;
}

export function parseClientMessage(text: string): ClientMessage {
	const value: unknown = JSON.parse(text);
	if (isRecord(value)) {
		switch (value.type) {
			case 'start':
				if (value.version === protocolVersion && isDimension(value.cols) && isDimension(value.rows)) {
					return { type: 'start', version: protocolVersion, cols: value.cols, rows: value.rows };
				}
				break;
			case 'resize':
				if (isDimension(value.cols) && isDimension(value.rows)) {
					return { type: 'resize', cols: value.cols, rows: value.rows };
				}
				break;
			case 'input':
				if (typeof value.data === 'string' && value.data.length <= maxInputLength) {
					return { type: 'input', data: value.data };
				}
				break;
			case 'ack':
				if (typeof value.chars === 'number' && Number.isSafeInteger(value.chars) && value.chars > 0) {
					return { type: 'ack', chars: value.chars };
				}
				break;
		}
	}
	throw new Error('Invalid terminal client message.');
}

export function parseServerMessage(text: string): ServerMessage {
	const value: unknown = JSON.parse(text);
	if (isRecord(value)) {
		switch (value.type) {
			case 'pairing':
				if (value.version === protocolVersion && typeof value.code === 'string' && /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value.code)) {
					return { type: 'pairing', version: protocolVersion, code: value.code };
				}
				break;
			case 'ready':
				if (value.version === protocolVersion) {
					return { type: 'ready', version: protocolVersion };
				}
				break;
			case 'data':
				if (typeof value.data === 'string') {
					return { type: 'data', data: value.data };
				}
				break;
			case 'exit':
				if (typeof value.exitCode === 'number' && Number.isSafeInteger(value.exitCode) && value.exitCode >= 0) {
					return { type: 'exit', exitCode: value.exitCode };
				}
				break;
			case 'error':
				if (typeof value.message === 'string') {
					return { type: 'error', message: value.message };
				}
				break;
		}
	}
	throw new Error('Invalid terminal server message.');
}
