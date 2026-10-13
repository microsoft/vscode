/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams, InitializeResult, ReconnectParams } from '../../state/protocol/common/commands.js';
import { isObject } from '../../../../../base/common/types.js';
import { ROOT_STATE_URI, type RootState } from '../../state/sessionState.js';

export const AgentHostSessionUrisCapabilityMetaKey = 'vscode.ahpSessionUris';
export const AgentHostNativeImplementationMetaKey = 'vscode.agentHost';

/** Older native hosts identify their hosting VS Code CLI through the root's hostBuild payload. */
export function isNativeAgentHost(result: InitializeResult | undefined, root?: RootState): boolean {
	if (result?._meta?.[AgentHostNativeImplementationMetaKey] === true) {
		return true;
	}
	const rootSnapshot = result?.snapshots?.find(snapshot => snapshot.resource === ROOT_STATE_URI);
	const state: unknown = root ?? rootSnapshot?.state;
	if (!isMetadataRecord(state) || !isMetadataRecord(state._meta)) {
		return false;
	}
	const build = state._meta.hostBuild;
	return isMetadataRecord(build) && typeof build.version === 'string' && build.version.length > 0;
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

/** Declares support for mixed immutable session resources with a separate provider identity. */
export function supportsAgentHostSessionUris(peer: Pick<InitializeParams | InitializeResult | ReconnectParams, '_meta'> | undefined): boolean {
	return peer?._meta?.[AgentHostSessionUrisCapabilityMetaKey] === true;
}
