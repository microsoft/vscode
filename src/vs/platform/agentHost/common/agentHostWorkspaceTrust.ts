/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentHostWorkspaceTrust } from './agentHostSchema.js';

/** Whether a resource is covered by the Workspace Trust state supplied by VS Code. */
export function isAgentHostWorkspaceTrusted(resource: URI, trust: IAgentHostWorkspaceTrust | undefined): boolean {
	if (trust === undefined) {
		return false;
	}
	if (!trust.enabled) {
		return true;
	}
	return trust.trustedUris.some(uri => {
		try {
			return extUriBiasedIgnorePathCase.isEqualOrParent(resource, URI.parse(uri));
		} catch {
			return false;
		}
	});
}
