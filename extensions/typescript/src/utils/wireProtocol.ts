/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import stream = require('stream');

let DefaultSize: number = 8192;
let ContentLength: string = 'Content-Length: ';
let ContentLengthSize: number = Buffer.byteLength(ContentLength, 'utf8');
let Blank: number = new Buffer(' ', 'utf8')[0];
let BackslashR: number = new Buffer('\r', 'utf8')[0];
let BackslashN: number = new Buffer('\n', 'utf8')[0];

class ProtocolBuffer {

	private index: number;
	private buffer: Buffer;

	constructor() {
		this.index = 0;
		this.buffer = new Buffer(DefaultSize);
	}

	public append(data: string | Buffer): void {
		let toAppend: Buffer | null = null;
		if (Buffer.isBuffer(data)) {
			toAppend = <Buffer>data;
		} else {
			toAppend = new Buffer(<string>data, 'utf8');
		}
		if (this.buffer.length - this.index >= toAppend.length) {
			toAppend.copy(this.buffer, this.index, 0, toAppend.length);
		} else {
			let newSize = (Math.ceil((this.index + toAppend.length) / DefaultSize) + 1) * DefaultSize;
			if (this.index === 0) {
				this.buffer = new Buffer(newSize);
				toAppend.copy(this.buffer, 0, 0, toAppend.length);
			} else {
				this.buffer = Buffer.concat([this.buffer.slice(0, this.index), toAppend], newSize);
			}
		}
		this.index += toAppend.length;
	}

	public tryReadContentLength(): number {
		let result = -1;
		let current = 0;
		// we are utf8 encoding...
		while (current < this.index && (this.buffer[current] === Blank || this.buffer[current] === BackslashR || this.buffer[current] === BackslashN)) {
			current++;
		}
		if (this.index < current + ContentLengthSize) {
			return result;
		}
		current += ContentLengthSize;
		let start = current;
		while (current < this.index && this.buffer[current] !== BackslashR) {
			current++;
		}
		if (current + 3 >= this.index || this.buffer[current + 1] !== BackslashN || this.buffer[current + 2] !== BackslashR || this.buffer[current + 3] !== BackslashN) {
			return result;
		}
		let data = this.buffer.toString('utf8', start, current);
		result = parseInt(data);
		this.buffer = this.buffer.slice(current + 4);
		this.index = this.index - (current + 4);
		return result;
	}

	public tryReadContent(length: number): string | null {
		if (this.index < length) {
			return null;
		}
		let result = this.buffer.toString('utf8', 0, length);
		let sourceStart = length;
		while (sourceStart < this.index && (this.buffer[sourceStart] === BackslashR || this.buffer[sourceStart] === BackslashN)) {
			sourceStart++;
		}
		this.buffer.copy(this.buffer, 0, sourceStart);
		this.index = this.index - sourceStart;
		return result;
	}

	public tryReadLine(): string | null {
		let end: number = 0;
		while (end < this.index && this.buffer[end] !== BackslashR && this.buffer[end] !== BackslashN) {
			end++;
		}
		if (end >= this.index) {
			return null;
		}
		let result = this.buffer.toString('utf8', 0, end);
		while (end < this.index && (this.buffer[end] === BackslashR || this.buffer[end] === BackslashN)) {
			end++;
		}
		if (this.index === end) {
			this.index = 0;
		} else {
			this.buffer.copy(this.buffer, 0, end);
			this.index = this.index - end;
		}
		return result;
	}

	public get numberOfBytes(): number {
		return this.index;
	}
}

export enum ReaderType {
	Length = 0,
	Line = 1
}

export interface ICallback<T> {
	(data: T): void;
}

export class Reader<T> {

	private readable: stream.Readable;
	private callback: ICallback<T>;
	private buffer: ProtocolBuffer;
	private nextMessageLength: number;

	public constructor(readable: stream.Readable, callback: ICallback<T>, type: ReaderType = ReaderType.Length) {
		this.readable = readable;
		this.buffer = new ProtocolBuffer();
		this.callback = callback;
		this.nextMessageLength = -1;
		if (type === ReaderType.Length) {
			this.readable.on('data', (data: Buffer) => {
				this.onLengthData(data);
			});
		} else if (type === ReaderType.Line) {
			this.readable.on('data', (data: Buffer) => {
				this.onLineData(data);
			});
		}
	}

	private onLengthData(data: Buffer): void {
		this.buffer.append(data);
		while (true) {
			if (this.nextMessageLength === -1) {
				this.nextMessageLength = this.buffer.tryReadContentLength();
				if (this.nextMessageLength === -1) {
					return;
				}
			}
			let msg = this.buffer.tryReadContent(this.nextMessageLength);
			if (msg === null) {
				return;
			}
			this.nextMessageLength = -1;
			let json = JSON.parse(msg);
			this.callback(json);
		}
	}

	private onLineData(data: Buffer): void {
		this.buffer.append(data);
		while (true) {
			let msg = this.buffer.tryReadLine();
			if (msg === null) {
				return;
			}
			this.callback(JSON.parse(msg));
		}
	}
}

export class Writer<T> {

	private writable: stream.Writable;

	public constructor(writable: stream.Writable) {
		this.writable = writable;
	}

	public write(msg: T): void {
		let json = JSON.stringify(msg);
		let buffer: string[] = [
			ContentLength,
			Buffer.byteLength(json, 'utf8').toString(),
			'\r\n\r\n',
			json,
			'\r\n'
		];
		this.writable.write(buffer.join(''), 'utf8');
	}
}