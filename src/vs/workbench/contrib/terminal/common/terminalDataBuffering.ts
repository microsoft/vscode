/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

interface TerminalDataBuffer extends IDisposable {
	data: string[];
	timeoutId: any;
}

export class TerminalDataBufferer implements IDisposable {
	private readonly _terminalBufferMap = new Map<number, TerminalDataBuffer>();

	dispose() {
		for (const buffer of this._terminalBufferMap.values()) {
			buffer.dispose();
		}
	}

	startBuffering(id: number, event: Event<string>, callback: (id: number, data: string) => void, throttleBy: number = 5): IDisposable {
		let disposable: IDisposable;
		disposable = event((e: string) => {
			let buffer = this._terminalBufferMap.get(id);
			if (buffer) {
				buffer.data.push(e);

				return;
			}

			const timeoutId = setTimeout(() => {
				this._terminalBufferMap.delete(id);
				callback(id, buffer!.data.join(''));
			}, throttleBy);
			buffer = {
				data: [e],
				timeoutId: timeoutId,
				dispose: () => {
					clearTimeout(timeoutId);
					this._terminalBufferMap.delete(id);
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
}
