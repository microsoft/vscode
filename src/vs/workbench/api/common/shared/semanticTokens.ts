/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';

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

export function encodeSemanticTokensDto(semanticTokens: ISemanticTokensDto): VSBuffer {
	const buff = VSBuffer.alloc(encodedSize2(semanticTokens));
	let offset = 0;
	buff.writeUInt32BE(semanticTokens.id, offset); offset += 4;
	if (semanticTokens.type === 'full') {
		buff.writeUInt8(EncodedSemanticTokensType.Full, offset); offset += 1;
		buff.writeUInt32BE(semanticTokens.data.length, offset); offset += 4;
		for (const uint of semanticTokens.data) {
			buff.writeUInt32BE(uint, offset); offset += 4;
		}
	} else {
		buff.writeUInt8(EncodedSemanticTokensType.Delta, offset); offset += 1;
		buff.writeUInt32BE(semanticTokens.deltas.length, offset); offset += 4;
		for (const delta of semanticTokens.deltas) {
			buff.writeUInt32BE(delta.start, offset); offset += 4;
			buff.writeUInt32BE(delta.deleteCount, offset); offset += 4;
			if (delta.data) {
				buff.writeUInt32BE(delta.data.length, offset); offset += 4;
				for (const uint of delta.data) {
					buff.writeUInt32BE(uint, offset); offset += 4;
				}
			} else {
				buff.writeUInt32BE(0, offset); offset += 4;
			}
		}
	}
	return buff;
}

function encodedSize2(semanticTokens: ISemanticTokensDto): number {
	let result = 0;
	result += 4; // id
	result += 1; // type
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
	let offset = 0;
	const id = buff.readUInt32BE(offset); offset += 4;
	const type: EncodedSemanticTokensType = buff.readUInt8(offset); offset += 1;
	if (type === EncodedSemanticTokensType.Full) {
		const length = buff.readUInt32BE(offset); offset += 4;
		const data = new Uint32Array(length);
		for (let j = 0; j < length; j++) {
			data[j] = buff.readUInt32BE(offset); offset += 4;
		}
		return {
			id: id,
			type: 'full',
			data: data
		};
	}
	const deltaCount = buff.readUInt32BE(offset); offset += 4;
	let deltas: { start: number; deleteCount: number; data?: Uint32Array; }[] = [];
	for (let i = 0; i < deltaCount; i++) {
		const start = buff.readUInt32BE(offset); offset += 4;
		const deleteCount = buff.readUInt32BE(offset); offset += 4;
		const length = buff.readUInt32BE(offset); offset += 4;
		let data: Uint32Array | undefined;
		if (length > 0) {
			data = new Uint32Array(length);
			for (let j = 0; j < length; j++) {
				data[j] = buff.readUInt32BE(offset); offset += 4;
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
