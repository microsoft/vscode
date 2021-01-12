/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProcessDataEvent, IProcessDataWithAckEvent } from 'vs/workbench/contrib/terminal/common/terminal';

interface TerminalDataBuffer extends IDisposable {
	data: (string | IProcessDataWithAckEvent)[];
	timeoutId: any;
}

export class TerminalDataBufferer implements IDisposable {
	private readonly _terminalBufferMap = new Map<number, TerminalDataBuffer>();

	constructor(private readonly _callback: (id: number, data: string | IProcessDataWithAckEvent) => void) {
	}

	dispose() {
		for (const buffer of this._terminalBufferMap.values()) {
			buffer.dispose();
		}
	}

	startBuffering(id: number, event: Event<string | IProcessDataEvent | IProcessDataWithAckEvent>, throttleBy: number = 5): IDisposable {
		let disposable: IDisposable;
		disposable = event((e: string | IProcessDataEvent | IProcessDataWithAckEvent) => {
			const data = (typeof e === 'string' || 'ackId' in e ? e : e.data);
			let buffer = this._terminalBufferMap.get(id);
			if (buffer) {
				buffer.data.push(data);

				return;
			}

			const timeoutId = setTimeout(() => this._flushBuffer(id), throttleBy);
			buffer = {
				data: [data],
				timeoutId: timeoutId,
				dispose: () => {
					clearTimeout(timeoutId);
					this._flushBuffer(id);
					disposable.dispose();
				}
			};
			this._terminalBufferMap.set(id, buffer);
		});
		return disposable;
	}

	stopBuffering(id: number) {
		const buffer = this._terminalBufferMap.get(id);
		if (buffer) {
			buffer.dispose();
		}
	}

	private _flushBuffer(id: number): void {
		const buffer = this._terminalBufferMap.get(id);
		if (buffer) {
			this._terminalBufferMap.delete(id);
			// TODO: This should batch string events together still
			// this._callback(id, buffer.data.join(''));
			for (let b of buffer.data) {
				this._callback(id, b);
			}
		}
	}
}
