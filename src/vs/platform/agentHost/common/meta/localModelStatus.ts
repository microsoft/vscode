/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LOCAL_MODEL_STATUS_KEY, type ILocalModelRowMetaV1, type ILocalModelStatusV1 } from '../localModel.js';
import type { RootState } from '../state/protocol/state.js';
import type { IAgentMetadataSource } from './metadata.js';
import { readLocalModelRowMeta as readVSCodeLocalModelRowMeta, readLocalModelStatus } from './vscode/localModelStatus.js';

export { createLocalModelRowMeta, readLocalModelStatus } from './vscode/localModelStatus.js';

/** Reads the local-model status a host published as `vscode.localModel.status`; `undefined` (show no local-model UI) for hosts that don't implement it. */
export function readLocalModelStatusFromRootState(state: RootState | Error | undefined): ILocalModelStatusV1 | undefined {
	if (!state || state instanceof Error) {
		return undefined;
	}
	return readLocalModelStatus(state.config?.values[LOCAL_MODEL_STATUS_KEY]);
}

/** Reads the local-model identity of a direct-selection model row from its `_meta`. */
export function readLocalModelRowMeta(source: IAgentMetadataSource | undefined): ILocalModelRowMetaV1 | undefined {
	return readVSCodeLocalModelRowMeta(source?._meta);
}
