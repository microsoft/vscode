/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';

export interface ISemanticTokensFullAreaDto {
	line: number;
	type: 'full';
	data: Uint32Array;
}

export interface ISemanticTokensDeltaAreaDto {
	line: number;
	type: 'delta';
	oldIndex: number;
}

export interface ISemanticTokensDto {
	id: number;
	areas: (ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto)[];
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
	let areas: (ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto)[] = [];
	for (let i = 0; i < areasCount; i++) {
		offset = decodeArea(buff, offset, areas);
	}
	return {
		id: id,
		areas: areas
	};
}

function encodeArea(area: ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto, buff: VSBuffer, offset: number): number {
	buff.writeUInt8(area.type === 'full' ? EncodedSemanticTokensAreaType.Full : EncodedSemanticTokensAreaType.Delta, offset); offset += 1;
	buff.writeUInt32BE(area.line, offset); offset += 4;
	if (area.type === 'full') {
		buff.writeUInt32BE(area.data.byteLength, offset); offset += 4;
		buff.set(VSBuffer.wrap(area.data), offset); offset += area.data.byteLength;
	} else {
		buff.writeUInt32BE(area.oldIndex, offset); offset += 4;
	}
	return offset;
}

function encodedAreaSize(area: ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto): number {
	let result = 0;
	result += 1; // type
	result += 4; // line
	if (area.type === 'full') {
		result += 4; // data byte length
		result += area.data.byteLength;
		return result;
	} else {
		result += 4; // old index
		return result;
	}
}

function decodeArea(buff: VSBuffer, offset: number, areas: (ISemanticTokensFullAreaDto | ISemanticTokensDeltaAreaDto)[]): number {
	const type: EncodedSemanticTokensAreaType = buff.readUInt8(offset); offset += 1;
	const line = buff.readUInt32BE(offset); offset += 4;
	if (type === EncodedSemanticTokensAreaType.Full) {
		const dataByteLength = buff.readUInt32BE(offset); offset += 4;
		const data = buff.slice(offset, offset + dataByteLength); offset += dataByteLength;
		const buffer = data.buffer;
		const bufferByteOffset = buffer.byteOffset;
		const bufferByteLength = buffer.byteLength;
		areas.push({
			type: 'full',
			line: line,
			data: new Uint32Array(buffer, bufferByteOffset, bufferByteLength / 4)
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
