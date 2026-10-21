/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { readWorkingSetVersion } from '../common/meta/agentWorkingSetFileMeta.js';
import type { InvokeChangesetOperationParams } from '../common/state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/** Active-turn decisions must name the version displayed by the client; idle versionless requests retain legacy behavior. */
export function getShownWorkingSetVersion(stateManager: Pick<AgentHostStateManager, 'hasActiveTurn'>, params: InvokeChangesetOperationParams, resource: URI, session: ProtocolURI): string | undefined {
	const named = readWorkingSetVersion(params);
	if (named !== undefined || !stateManager.hasActiveTurn(session)) {
		return named;
	}
	throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.workingSet.versionRequired', "Keeping or undoing changes to '{0}' while the agent works requires a client that sends the displayed file version. Try again after the turn finishes.", basename(resource)));
}

/** The error of an operation on Working Set changes that were updated since the client showed them. */
export function createChangedSinceShownError(resource: URI): ProtocolError {
	return new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.workingSet.changedSinceShown', "The changes to '{0}' were updated after they were shown. Try again.", basename(resource)));
}
