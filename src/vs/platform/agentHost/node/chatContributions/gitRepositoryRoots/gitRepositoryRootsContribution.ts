/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';

/** Retries cached non-repositories at turn boundaries, before checkpoint work. */
export class GitRepositoryRootsContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'gitRepositoryRoots';
	readonly order = 75;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): undefined {
		this._refresh(request.turnChannel);
		return undefined;
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'rejected' || turn.reason.kind === 'localCommand' || turn.reason.kind === 'error' && turn.reason.resumable) {
			return;
		}
		this._refresh(turn.channel);
	}

	private _refresh(channel: string): void {
		for (const directory of this._agentConfigService.getEffectiveWorkingDirectories(channel) ?? []) {
			void this._gitService.getRepositoryRoot(URI.parse(directory), { refreshIfNone: true }).catch(error => {
				this._logService.warn(`[GitRepositoryRoots] Failed to refresh repository root for ${directory}`, error);
			});
		}
	}
}
