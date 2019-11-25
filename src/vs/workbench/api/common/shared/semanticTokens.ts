/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';

export interface ISemanticTokensFullAreaDto {
	type: 'full';
	line: number;
	data: Uint32Array;
}

export interface ISemanticTokensDeltaAreaDto {
	type: 'delta';
	line: number;
	oldIndex: number;
}

export type ISemanticTokensAreaDto = ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto;

export interface ISemanticTokensDto {
	id: number;
	areas: ISemanticTokensAreaDto[];
}

const enum EncodedSemanticTokensAreaType {
	Full = 1,
	Delta = 2
}

export function encodeSemanticTokensDto(semanticTokens: ISemanticTokensDto): VSBuffer {
	const buff = VSBuffer.alloc(encodedSize(semanticTokens));
	let offset = 0;
	buff.writeUInt32BE(semanticTokens.id, offset); offset += 4;
	buff.writeUInt32BE(semanticTokens.areas.length, offset); offset += 4;
	for (let i = 0; i < semanticTokens.areas.length; i++) {
		offset = encodeArea(semanticTokens.areas[i], buff, offset);
	}
	return buff;
}

function encodedSize(semanticTokens: ISemanticTokensDto): number {
	let result = 0;
	result += 4; // etag
	result += 4; // area count
	for (let i = 0; i < semanticTokens.areas.length; i++) {
		result += encodedAreaSize(semanticTokens.areas[i]);
	}
	return result;
}

export function decodeSemanticTokensDto(buff: VSBuffer): ISemanticTokensDto {
	let offset = 0;
	const id = buff.readUInt32BE(offset); offset += 4;
	const areasCount = buff.readUInt32BE(offset); offset += 4;
	let areas: ISemanticTokensAreaDto[] = [];
	for (let i = 0; i < areasCount; i++) {
		offset = decodeArea(buff, offset, areas);
	}
	return {
		id: id,
		areas: areas
	};
}

function encodeArea(area: ISemanticTokensAreaDto, buff: VSBuffer, offset: number): number {
	buff.writeUInt8(area.type === 'full' ? EncodedSemanticTokensAreaType.Full : EncodedSemanticTokensAreaType.Delta, offset); offset += 1;
	buff.writeUInt32BE(area.line + 1, offset); offset += 4;
	if (area.type === 'full') {
		const tokens = area.data;
		const tokenCount = (tokens.length / 5) | 0;
		buff.writeUInt32BE(tokenCount, offset); offset += 4;
		// here we are explicitly iterating an writing the ints again to ensure writing the desired endianness.
		for (let i = 0; i < tokenCount; i++) {
			const tokenOffset = 5 * i;
			buff.writeUInt32BE(tokens[tokenOffset], offset); offset += 4;
			buff.writeUInt32BE(tokens[tokenOffset + 1], offset); offset += 4;
			buff.writeUInt32BE(tokens[tokenOffset + 2], offset); offset += 4;
			buff.writeUInt32BE(tokens[tokenOffset + 3], offset); offset += 4;
			buff.writeUInt32BE(tokens[tokenOffset + 4], offset); offset += 4;
		}
		// buff.set(VSBuffer.wrap(uint8), offset); offset += area.data.byteLength;
	} else {
		buff.writeUInt32BE(area.oldIndex, offset); offset += 4;
	}
	return offset;
}

function encodedAreaSize(area: ISemanticTokensAreaDto): number {
	let result = 0;
	result += 1; // type
	result += 4; // line
	if (area.type === 'full') {
		const tokens = area.data;
		const tokenCount = (tokens.length / 5) | 0;
		result += 4; // token count
		result += tokenCount * 5 * 4;
		return result;
	} else {
		result += 4; // old index
		return result;
	}
}

function decodeArea(buff: VSBuffer, offset: number, areas: ISemanticTokensAreaDto[]): number {
	const type: EncodedSemanticTokensAreaType = buff.readUInt8(offset); offset += 1;
	const line = buff.readUInt32BE(offset); offset += 4;
	if (type === EncodedSemanticTokensAreaType.Full) {
		// here we are explicitly iterating and reading the ints again to ensure reading the desired endianness.
		const tokenCount = buff.readUInt32BE(offset); offset += 4;
		const data = new Uint32Array(5 * tokenCount);
		for (let i = 0; i < tokenCount; i++) {
			const destOffset = 5 * i;
			data[destOffset] = buff.readUInt32BE(offset); offset += 4;
			data[destOffset + 1] = buff.readUInt32BE(offset); offset += 4;
			data[destOffset + 2] = buff.readUInt32BE(offset); offset += 4;
			data[destOffset + 3] = buff.readUInt32BE(offset); offset += 4;
			data[destOffset + 4] = buff.readUInt32BE(offset); offset += 4;
		}
		areas.push({
			type: 'full',
			line: line,
			data: data
		});
		return offset;
	} else {
		const oldIndex = buff.readUInt32BE(offset); offset += 4;
		areas.push({
			type: 'delta',
			line: line,
			oldIndex: oldIndex
		});
		return offset;
	}
}
