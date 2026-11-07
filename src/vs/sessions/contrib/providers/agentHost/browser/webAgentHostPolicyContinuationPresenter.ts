/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IAgentHostPolicyContinuationPresenter } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostPolicyContinuation.js';

/**
 * The web Agents window has no local agent host provider to open a continued
 * conversation in. Registering this presenter keeps the shared policy
 * continuation service constructible, so chat views can still be created.
 */
export class WebAgentHostPolicyContinuationPresenter implements IAgentHostPolicyContinuationPresenter {
	declare readonly _serviceBrand: undefined;

	async open(): Promise<void> {
		throw new Error(localize('agentHost.policyContinuation.webUnavailable', "Continuing this conversation in Copilot isn't available in the browser. Open it in VS Code instead."));
	}
}
