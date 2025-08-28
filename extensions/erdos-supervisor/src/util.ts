/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpError } from './kbclient/api';
import { Buffer } from 'buffer';
import * as vscode from 'vscode';

export function createUniqueId(): string {
	return Math.floor(Math.random() * 0x100000000).toString(16);
}

export function summarizeError(err: any): string {
	if (err instanceof HttpError) {
		return summarizeHttpError(err);
	} else if (err.errors) {
		return err.errors.map(summarizeError).join('\n\n');
	} else if (err instanceof Error) {
		return err.message;
	} else if (typeof err === 'string') {
		return err;
	}
	return JSON.stringify(err);
}

export function summarizeHttpError(err: HttpError): string {
	let result = '';

	if (err.response && err.response.url) {
		result += `${err.response.url}: `;
	}

	if (err.statusCode) {
		result += `HTTP ${err.statusCode}. `;
	}

	if (err.body) {
		if (err.body.message) {
			result += `${err.body.message}`;
		} else {
			if (typeof err.body === 'string') {
				result += err.body;
			} else {
				result += JSON.stringify(err.body);
			}
		}
	}
	return result;
}

function getMaxBufferSize(): number {
	const config = vscode.workspace.getConfiguration('kernelSupervisor');
	const maxSizeMB = config.get<number>('maxBufferSizeMB') ?? 10;
	return maxSizeMB * 1024 * 1024;
}

type VSBufferLike = {
	buffer: Buffer;
};

type SerializedDataValue = {
	data: unknown;
	buffers?: (Buffer | VSBufferLike | unknown)[];
	[key: string]: unknown;
};

type PayloadData = {
	value?: SerializedDataValue;
	[key: string]: unknown;
};

type PayloadStructure = {
	data?: PayloadData;
	[key: string]: unknown;
};

function isVSBufferLike(item: unknown): item is VSBufferLike {
	return (
		typeof item === 'object' &&
		item !== null &&
		'buffer' in item &&
		item.buffer instanceof Buffer
	);
}

type PayloadWithDataValue = PayloadStructure & {
	data: PayloadData & {
		value: SerializedDataValue;
	};
};

function isPayloadWithDataValue(payload: unknown): payload is PayloadWithDataValue {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'data' in payload &&
		typeof payload.data === 'object' &&
		payload.data !== null &&
		'value' in payload.data &&
		typeof payload.data.value === 'object' &&
		payload.data.value !== null
	);
}

function validateAndGetBufferInstance(item: unknown, maxSize: number): Buffer | undefined {
	let bufferInstance: Buffer | undefined;

	if (isVSBufferLike(item)) {
		if (item.buffer.length > maxSize) {
			console.warn(`Buffer exceeds size limit (${item.buffer.length} > ${maxSize} bytes)`);
			return undefined;
		}
		bufferInstance = item.buffer;
	} else if (item instanceof Buffer) {
		if (item.length > maxSize) {
			console.warn(`Buffer exceeds size limit (${item.length} > ${maxSize} bytes)`);
			return undefined;
		}
		bufferInstance = item;
	}

	return bufferInstance;
}

export function unpackSerializedObjectWithBuffers(payload: unknown): {
	content: unknown;
	buffers: string[];
} {
	if (isPayloadWithDataValue(payload)) {
		const maxSize = getMaxBufferSize();
		const { data: { value: dataValue }, ...otherPayloadProps } = payload;
		const potentialBuffers = dataValue.buffers;
		const buffers: string[] = [];

		if (Array.isArray(potentialBuffers)) {
			for (const item of potentialBuffers) {
				try {
					const bufferInstance = validateAndGetBufferInstance(item, maxSize);

					if (bufferInstance) {
						buffers.push(bufferInstance.toString('base64'));
					}
				} catch (e) {
					console.error('Error processing buffer:', e);
				}
			}
		}

		const content = { ...otherPayloadProps, data: dataValue.data };

		return { content, buffers };
	}

	return { content: payload, buffers: [] };
}

export function isEnumMember<T extends Record<string, unknown>>(value: unknown, enumObj: T): value is T[keyof T] {
	return Object.values(enumObj).includes(value as T[keyof T]);
}
