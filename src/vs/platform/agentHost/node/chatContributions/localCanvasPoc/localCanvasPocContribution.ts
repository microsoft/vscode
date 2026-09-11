/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { LocalCanvasPoc } from '../../copilot/localCanvasPoc.js';
import { localCanvasPocWorkspaceMessage } from '../../../common/localCanvasPoc.js';

/** Keeps cached automation turns and local commands inside the opted-in demo workspace. */
export class LocalCanvasPocContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'localCanvasPoc';
	readonly order = 25;
	protected readonly _poc = LocalCanvasPoc.forCurrentHost();

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		if (!this._poc) {
			return undefined;
		}
		const directories = this._stateManager.getSessionState(request.session)?.workingDirectories?.map(directory => URI.parse(directory));
		if (!this._poc.allows(directories?.[0], directories?.slice(1))) {
			return { kind: 'reject', error: { errorType: 'localCanvasPocWorkspace', message: localCanvasPocWorkspaceMessage(this._poc.workspace, directories) }, stage: 'validation' };
		}
		return undefined;
	}
}
