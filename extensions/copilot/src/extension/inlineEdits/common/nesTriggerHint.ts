/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum NesTriggerReason {
	SelectionChange = 'selectionChange',
	ActiveDocumentSwitch = 'activeDocumentSwitch',
}

interface NesChangeHintPayload {
	readonly uuid: string;
	readonly reason: NesTriggerReason;
}

export interface NesChangeHint {
	readonly data: NesChangeHintPayload;
}

export namespace NesChangeHint {
	export function is(obj: unknown): obj is NesChangeHint {
		if (typeof obj !== 'object' || obj === null) {
			return false;
		}
		const maybeChangeHint = obj as NesChangeHint;
		return (
			typeof maybeChangeHint.data === 'object' &&
			maybeChangeHint.data !== null &&
			typeof (maybeChangeHint.data as NesChangeHintPayload).uuid === 'string' &&
			Object.values(NesTriggerReason).includes((maybeChangeHint.data as NesChangeHintPayload).reason)
		);
	}
}

