/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ModelSelection } from '../common/state/protocol/state.js';

/** Opaque provider-data payload for a concrete chat's resumable SDK backing. */
export interface IPersistedChat {
	readonly sdkSessionId: string;
	readonly model?: ModelSelection;
}

export function encodeProviderData(backing: IPersistedChat): string {
	return JSON.stringify(backing);
}

export function decodeProviderData(providerData: string): IPersistedChat | undefined {
	try {
		const value = JSON.parse(providerData) as { sdkSessionId?: unknown; model?: unknown };
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const { sdkSessionId, model } = value;
		if (typeof sdkSessionId !== 'string' || !sdkSessionId) {
			return undefined;
		}
		const validModel = model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string'
			? model as ModelSelection
			: undefined;
		return { sdkSessionId, ...(validModel ? { model: validModel } : {}) };
	} catch {
		return undefined;
	}
}
