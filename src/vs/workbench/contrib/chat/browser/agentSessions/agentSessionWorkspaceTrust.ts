/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';

/**
 * Requests trust for the folder an agent session will execute against.
 */
export async function requestAgentSessionTargetWorkspaceTrust(
	workingDirectory: URI | undefined,
	workspaceContextService: Pick<IWorkspaceContextService, 'getWorkspaceFolder'>,
	workspaceTrustRequestService: Pick<IWorkspaceTrustRequestService, 'requestWorkspaceTrust' | 'requestResourcesTrust'>,
): Promise<boolean> {
	const message = localize('agentSession.workspaceTrust', "AI features are currently only supported in trusted workspaces.");
	if (!workingDirectory || workspaceContextService.getWorkspaceFolder(workingDirectory)) {
		return !!await workspaceTrustRequestService.requestWorkspaceTrust({ message });
	}

	return !!await workspaceTrustRequestService.requestResourcesTrust({ uri: workingDirectory, message });
}
