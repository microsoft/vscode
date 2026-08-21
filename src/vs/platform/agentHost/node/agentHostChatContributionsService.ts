/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionHost, IAgentHostChatContributions, IOutgoingTurn, ITurnEnd } from '../common/agentHostChatContributionsService.js';

export class AgentHostChatContributions extends Disposable implements IAgentHostChatContributions {
	declare readonly _serviceBrand: undefined;

	private readonly _contributionRegistrations = this._register(new DisposableMap<IAgentHostChatContribution>());
	private readonly _contributionIndices = new Map<IAgentHostChatContribution, number>();
	private _nextContributionIndex = 0;
	private _host: IAgentHostChatContributionHost | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerContribution(contribution: IAgentHostChatContribution): IDisposable {
		if (this._contributionRegistrations.has(contribution)) {
			throw new Error('Chat contribution already registered');
		}
		this._contributionIndices.set(contribution, this._nextContributionIndex++);
		this._contributionRegistrations.set(contribution, toDisposable(() => {
			this._contributionIndices.delete(contribution);
			contribution.dispose();
		}));
		return toDisposable(() => this._contributionRegistrations.deleteAndDispose(contribution));
	}

	registerHost(host: IAgentHostChatContributionHost): IDisposable {
		if (this._host !== undefined) {
			throw new Error('Chat contribution host already registered');
		}
		this._host = host;
		return toDisposable(() => {
			if (this._host === host) {
				this._host = undefined;
			}
		});
	}

	getHost(): IAgentHostChatContributionHost | undefined {
		return this._host;
	}

	turnEnd(turn: ITurnEnd): void {
		for (const contribution of this._getOrderedContributions()) {
			if (!contribution.onTurnEnd) {
				continue;
			}
			try {
				contribution.onTurnEnd(turn);
			} catch (err) {
				this._logContributionFailure(contribution, err);
			}
		}
	}

	async contributeSend(turn: IOutgoingTurn): Promise<readonly string[]> {
		const instructions: string[] = [];
		for (const contribution of this._getOrderedContributions()) {
			if (!contribution.contributeSend) {
				continue;
			}
			try {
				const result = await contribution.contributeSend(turn);
				if (result?.instructions) {
					instructions.push(...result.instructions);
				}
			} catch (err) {
				this._logContributionFailure(contribution, err);
			}
		}
		return instructions;
	}

	private _getOrderedContributions(): readonly IAgentHostChatContribution[] {
		return [...this._contributionRegistrations.keys()].sort((a, b) =>
			(a.order ?? 0) - (b.order ?? 0) || this._contributionIndices.get(a)! - this._contributionIndices.get(b)!
		);
	}

	private _logContributionFailure(contribution: IAgentHostChatContribution, err: unknown): void {
		this._logService.error(`[AgentHostChatContributions] Contribution '${contribution.id}' failed: ${err instanceof Error ? err.message : String(err)}`, err);
	}
}
