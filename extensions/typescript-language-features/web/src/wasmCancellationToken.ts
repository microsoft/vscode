/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as ts from 'typescript/lib/tsserverlibrary';

export class WasmCancellationToken implements ts.server.ServerCancellationToken {
	shouldCancel: (() => boolean) | undefined;
	currentRequestId: number | undefined = undefined;

	setRequest(requestId: number) {
		this.currentRequestId = requestId;
	}

	resetRequest(requestId: number) {
		if (requestId === this.currentRequestId) {
			this.currentRequestId = undefined;
		} else {
			throw new Error(`Mismatched request id, expected ${this.currentRequestId} but got ${requestId}`);
		}
	}

	isCancellationRequested(): boolean {
		return this.currentRequestId !== undefined && !!this.shouldCancel && this.shouldCancel();
	}
}
