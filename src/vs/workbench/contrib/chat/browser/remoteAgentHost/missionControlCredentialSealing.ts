/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHostEncryptionKey } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import type { IMissionControlCredentialSealingRequest } from '../../../../../platform/agentHost/common/agentService.js';

/** Matches the live recipient against independently authenticated MC metadata, including its algorithm and purpose. */
export function isMissionControlRecipientTrusted(request: IMissionControlCredentialSealingRequest, trustedKeys: readonly IHostEncryptionKey[] | undefined): boolean {
	return trustedKeys?.some(key => key.key_id === request.key.key_id && key.public_key === request.key.public_key
		&& key.use === request.key.use && key.algorithm === request.key.algorithm) === true;
}

/** Refuses relay-supplied recipient keys unless the authenticated MC descriptor advertises the exact same key. */
export function verifyMissionControlRecipient(request: IMissionControlCredentialSealingRequest, trustedKeys: readonly IHostEncryptionKey[] | undefined): void {
	if (!isMissionControlRecipientTrusted(request, trustedKeys)) {
		throw new Error('Mission Control recipient key does not match the authenticated environment.');
	}
}
