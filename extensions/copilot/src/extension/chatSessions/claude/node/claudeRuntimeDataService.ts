/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo, Query } from '@anthropic-ai/claude-agent-sdk';
import { ILogService } from '../../../../platform/log/common/logService';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { IClaudeRuntimeDataService } from '../common/claudeRuntimeDataService';

export class ClaudeRuntimeDataService extends Disposable implements IClaudeRuntimeDataService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _agents: readonly AgentInfo[] = [];

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	getAgents(): readonly AgentInfo[] {
		return this._agents;
	}

	async update(query: Query): Promise<void> {
		try {
			this._agents = await query.supportedAgents();
			this.logService.trace(`[ClaudeRuntimeDataService] Cached ${this._agents.length} agents`);
		} catch (err) {
			this.logService.error('[ClaudeRuntimeDataService] Failed to query agents from SDK', err);
			// Keep previous cache (or empty) on error
		}
		this._onDidChange.fire();
	}
}
