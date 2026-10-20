/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { readWorkingSetVersion } from '../common/meta/agentWorkingSetFileMeta.js';
import type { InvokeChangesetOperationParams } from '../common/state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * The version of a file's Working Set changes that the client of an
 * operation showed (see `getWorkingSetFileVersion`), which the operation
 * must not go beyond: the one the request names, or, while a turn of
 * `session` records new edits, the one last published, which every client
 * was sent before any later one. Without a turn and a named version, the
 * operation covers the file's current changes.
 */
export function getShownWorkingSetVersion(stateManager: Pick<AgentHostStateManager, 'getChangesetState' | 'hasActiveTurn'>, params: InvokeChangesetOperationParams, resource: URI, session: ProtocolURI): string | undefined {
	const named = readWorkingSetVersion(params);
	if (named !== undefined || !stateManager.hasActiveTurn(session)) {
		return named;
	}
	const shown = stateManager.getChangesetState(params.channel)?.files.find(file => {
		const id = file.edit.after?.uri ?? file.edit.before?.uri;
		return id !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.parse(id), resource);
	});
	const version = shown && readWorkingSetVersion(shown);
	if (!version) {
		throw createChangedSinceShownError(resource);
	}
	return version;
}

/** The error of an operation on Working Set changes that were updated since the client showed them. */
export function createChangedSinceShownError(resource: URI): ProtocolError {
	return new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.workingSet.changedSinceShown', "The changes to '{0}' were updated after they were shown. Try again.", basename(resource)));
}
