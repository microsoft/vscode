/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import * as platform from 'vs/base/common/platform';

export interface IFullSemanticTokensDto {
	id: number;
	type: 'full';
	data: Uint32Array;
}

export interface IDeltaSemanticTokensDto {
	id: number;
	type: 'delta';
	deltas: { start: number; deleteCount: number; data?: Uint32Array; }[];
}

export type ISemanticTokensDto = IFullSemanticTokensDto | IDeltaSemanticTokensDto;

const enum EncodedSemanticTokensType {
	Full = 1,
	Delta = 2
}

function toUint8Array(arr: Uint32Array): Uint8Array {
	return new Uint8Array(arr.buffer, arr.byteOffset, arr.length * 4);
}

function toUint32Array(arr: Uint8Array, byteOffset: number, length: number): Uint32Array {
	return new Uint32Array(arr.buffer, arr.byteOffset + byteOffset, length);
}

export function encodeSemanticTokensDto(semanticTokens: ISemanticTokensDto): VSBuffer {
	const isLittleEndian = platform.isLittleEndian();
	const buff = VSBuffer.alloc(encodeSemanticTokensDtoSize(semanticTokens));
	let offset = 0;
	buff.writeUInt32LE(semanticTokens.id, offset); offset += 4;
	if (semanticTokens.type === 'full') {
		buff.writeUInt32LE(EncodedSemanticTokensType.Full, offset); offset += 4;
		buff.writeUInt32LE(semanticTokens.data.length, offset); offset += 4;
		if (isLittleEndian) {
			const uint8Arr = toUint8Array(semanticTokens.data);
			buff.set(uint8Arr, offset); offset += uint8Arr.length;
		} else {
			for (const uint of semanticTokens.data) {
				buff.writeUInt32LE(uint, offset); offset += 4;
			}
		}
	} else {
		buff.writeUInt32LE(EncodedSemanticTokensType.Delta, offset); offset += 4;
		buff.writeUInt32LE(semanticTokens.deltas.length, offset); offset += 4;
		for (const delta of semanticTokens.deltas) {
			buff.writeUInt32LE(delta.start, offset); offset += 4;
			buff.writeUInt32LE(delta.deleteCount, offset); offset += 4;
			if (delta.data) {
				buff.writeUInt32LE(delta.data.length, offset); offset += 4;
				if (isLittleEndian) {
					const uint8Arr = toUint8Array(delta.data);
					buff.set(uint8Arr, offset); offset += uint8Arr.length;
				} else {
					for (const uint of delta.data) {
						buff.writeUInt32LE(uint, offset); offset += 4;
					}
				}
			} else {
				buff.writeUInt32LE(0, offset); offset += 4;
			}
		}
	}
	return buff;
}

function encodeSemanticTokensDtoSize(semanticTokens: ISemanticTokensDto): number {
	let result = 0;
	result += 4; // id
	result += 4; // type
	if (semanticTokens.type === 'full') {
		result += 4; // data length
		result += semanticTokens.data.byteLength;
	} else {
		result += 4; // delta count
		for (const delta of semanticTokens.deltas) {
			result += 4; // start
			result += 4; // deleteCount
			result += 4; // data length
			if (delta.data) {
				result += delta.data.byteLength;
			}
		}
	}
	return result;
}

export function decodeSemanticTokensDto(buff: VSBuffer): ISemanticTokensDto {
	const isLittleEndian = platform.isLittleEndian();
	let offset = 0;
	const id = buff.readUInt32LE(offset); offset += 4;
	const type: EncodedSemanticTokensType = buff.readUInt32LE(offset); offset += 4;
	if (type === EncodedSemanticTokensType.Full) {
		const length = buff.readUInt32LE(offset); offset += 4;
		let data: Uint32Array;
		if (isLittleEndian) {
			data = toUint32Array(buff.buffer, offset, length); offset += 4 * length;
		} else {
			data = new Uint32Array(length);
			for (let j = 0; j < length; j++) {
				data[j] = buff.readUInt32LE(offset); offset += 4;
			}
		}
		return {
			id: id,
			type: 'full',
			data: data
		};
	}
	const deltaCount = buff.readUInt32LE(offset); offset += 4;
	let deltas: { start: number; deleteCount: number; data?: Uint32Array; }[] = [];
	for (let i = 0; i < deltaCount; i++) {
		const start = buff.readUInt32LE(offset); offset += 4;
		const deleteCount = buff.readUInt32LE(offset); offset += 4;
		const length = buff.readUInt32LE(offset); offset += 4;
		let data: Uint32Array | undefined;
		if (length > 0) {
			if (isLittleEndian) {
				data = toUint32Array(buff.buffer, offset, length); offset += 4 * length;
			} else {
				data = new Uint32Array(length);
				for (let j = 0; j < length; j++) {
					data[j] = buff.readUInt32LE(offset); offset += 4;
				}
			}
		}
		deltas[i] = { start, deleteCount, data };
	}
	return {
		id: id,
		type: 'delta',
		deltas: deltas
	};
}
