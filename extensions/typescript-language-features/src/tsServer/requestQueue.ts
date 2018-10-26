/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Proto from '../protocol';

export interface RequestItem {
	readonly request: Proto.Request;
	readonly expectsResponse: boolean;
	readonly isAsync: boolean;
	readonly lowPriority?: boolean;
}

export class RequestQueue {
	private readonly queue: RequestItem[] = [];
	private sequenceNumber: number = 0;

	public get length(): number {
		return this.queue.length;
	}

	public push(item: RequestItem): void {
		// insert before existing lowPriority requestItems in the queue.
		if (!item.lowPriority && this.length) {
			for (let i = this.length - 1; i > -1; i--) {
				if (!this.queue[i].lowPriority) {
					this.queue.splice(i + 1, 0, item);
					return;
				}
			}
			//if all of the items are lowPriority insert at top
			this.queue.unshift(item);
			return;
		}
		//if none is low priority just push to end
		this.queue.push(item);
	}

	public shift(): RequestItem | undefined {
		return this.queue.shift();
	}

	public tryCancelPendingRequest(seq: number): boolean {
		for (let i = 0; i < this.queue.length; i++) {
			if (this.queue[i].request.seq === seq) {
				this.queue.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	public createRequest(command: string, args: any): Proto.Request {
		return {
			seq: this.sequenceNumber++,
			type: 'request',
			command: command,
			arguments: args
		};
	}
}