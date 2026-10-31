/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { toAgentCanvasRegistry } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IAppliedClientAction } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostSessionStateStore } from '../../../common/agentHostSessionStateStore.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { createAgentChatContext } from '../../agentChatContext.js';
import { IAgentHostAuthenticationService } from '../../agentHostAuthenticationService.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Materializes a requested Canvas registry and publishes the authoritative replacement. */
export class CanvasRegistryContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'canvasRegistry';
	readonly order = 100;
	private readonly _materializations = new Map<string, Promise<void>>();

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidApplyClientAction(applied: IAppliedClientAction): void {
		if (applied.action.type !== ActionType.ChatCanvasRegistryRequested) {
			return;
		}
		const existing = this._materializations.get(applied.channel);
		if (existing) {
			return;
		}
		const materialization = this._materialize(applied).finally(() => {
			if (this._materializations.get(applied.channel) === materialization) {
				this._materializations.delete(applied.channel);
			}
		});
		this._materializations.set(applied.channel, materialization);
		void materialization.catch(error => this._logService.error(`[CanvasRegistryContribution] Failed to materialize Canvas registry for ${applied.channel}`, error));
	}

	private async _materialize(applied: IAppliedClientAction): Promise<void> {
		const session = URI.parse(applied.session);
		const chat = URI.parse(applied.channel);
		const provider = this._providerService.getProviderForChat(session, chat);
		if (!provider) {
			return;
		}
		const context = createAgentChatContext(
			this._stateManager,
			this._authenticationService,
			session,
			chat,
			this._stateManager.resolveChatStorageResource(applied.session, applied.channel),
			this._sessionStateStore.peek(session),
		);
		const operationContext = {
			...context,
			...(applied.credentials ? { credentials: applied.credentials } : {}),
		};
		if (provider.materializeSessionCanvases) {
			await provider.materializeSessionCanvases(session, chat, operationContext);
			return;
		}
		const canvases = await provider.listSessionCanvases?.(session, chat, operationContext);
		if (canvases === undefined) {
			return;
		}
		const canvasRegistry = toAgentCanvasRegistry(canvases);
		if (!equals(this._stateManager.getChatState(applied.channel)?.canvasRegistry, canvasRegistry)) {
			this._stateManager.dispatchServerAction(applied.channel, {
				type: ActionType.ChatCanvasRegistryChanged,
				canvasRegistry,
			});
		}
	}

	override dispose(): void {
		this._materializations.clear();
		super.dispose();
	}
}
