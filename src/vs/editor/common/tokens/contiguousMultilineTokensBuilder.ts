/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readUInt32BE, writeUInt32BE } from '../../../base/common/buffer.js';
import { ContiguousMultilineTokens } from './contiguousMultilineTokens.js';

export class ContiguousMultilineTokensBuilder {

	public static deserialize(buff: Uint8Array): ContiguousMultilineTokens[] {
		let offset = 0;
		const count = readUInt32BE(buff, offset); offset += 4;
		const result: ContiguousMultilineTokens[] = [];
		for (let i = 0; i < count; i++) {
			offset = ContiguousMultilineTokens.deserialize(buff, offset, result);
		}
		return result;
	}

	private readonly _tokens: ContiguousMultilineTokens[];

	constructor() {
		this._tokens = [];
	}

	public add(lineNumber: number, lineTokens: Uint32Array): void {
		if (this._tokens.length > 0) {
			const last = this._tokens[this._tokens.length - 1];
			if (last.endLineNumber + 1 === lineNumber) {
				// append
				last.appendLineTokens(lineTokens);
				return;
			}
		}
		this._tokens.push(new ContiguousMultilineTokens(lineNumber, [lineTokens]));
	}

	public finalize(): ContiguousMultilineTokens[] {
		return this._tokens;
	}

	public serialize(): Uint8Array {
		const size = this._serializeSize();
		const result = new Uint8Array(size);
		this._serialize(result);
		return result;
	}

	private _serializeSize(): number {
		let result = 0;
		result += 4; // 4 bytes for the count
		for (let i = 0; i < this._tokens.length; i++) {
			result += this._tokens[i].serializeSize();
		}
		return result;
	}

	private _serialize(destination: Uint8Array): void {
		let offset = 0;
		writeUInt32BE(destination, this._tokens.length, offset); offset += 4;
		for (let i = 0; i < this._tokens.length; i++) {
			offset = this._tokens[i].serialize(destination, offset);
		}
	}
}
