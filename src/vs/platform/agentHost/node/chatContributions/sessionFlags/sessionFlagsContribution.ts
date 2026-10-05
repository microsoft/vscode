/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { createSessionMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AH_META_AUTO_ARCHIVED_AT_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY } from '../../../common/state/sessionState.js';
import { getPersistedSessionConfigValues } from '../../../common/sessionConfigKeys.js';
import { readSessionSandboxState } from '../../../common/meta/agentSandboxStateMeta.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { persistSessionMetadata } from '../../shared/persistSessionMetadata.js';

const sandboxEnabledKey = createSessionMementoKey<boolean | undefined>('sandboxEnabled', () => undefined);

/**
 * Persists host-owned read state, archived state, and merged config values that must survive a
 * restart. It uses `onDidDispatchAction` rather than `onDidApplyClientAction` because the client and host both dispatch
 * these changes.
 */
export class SessionFlagsContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionFlags';
	readonly order = 700;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		let sandboxChanged = false;
		if (dispatched.action.type === ActionType.SessionMetaChanged && !dispatched.rejectionReason) {
			const enabled = readSessionSandboxState({ _meta: dispatched.action._meta })?.enabled;
			const previous = this._context.memento(sandboxEnabledKey, dispatched.session);
			sandboxChanged = previous.get() !== enabled;
			previous.set(enabled, undefined);
		}
		if (dispatched.action.type === ActionType.SessionConfigChanged || sandboxChanged) {
			const state = this._stateManager.getSessionState(dispatched.channel);
			const values = state?.config?.values;
			if (values) {
				persistSessionMetadata(this._sessionDataService, this._logService, dispatched.channel, 'configValues', JSON.stringify(getPersistedSessionConfigValues(values, readSessionSandboxState(state)?.enabled)));
			}
		}
		// Persisting here rather than in `handleAction` covers client- and
		// server-dispatched changes alike, so no dispatch path can skip it.
		// Rejected actions never reached state and must not be written.
		if (!dispatched.rejectionReason) {
			if (dispatched.action.type === ActionType.SessionIsReadChanged) {
				persistSessionMetadata(this._sessionDataService, this._logService, dispatched.channel, AH_META_IS_READ_DB_KEY, dispatched.action.isRead ? 'true' : '');
			} else if (dispatched.action.type === ActionType.SessionIsArchivedChanged) {
				persistSessionMetadata(this._sessionDataService, this._logService, dispatched.channel, AH_META_IS_ARCHIVED_DB_KEY, dispatched.action.isArchived ? 'true' : '');
				if (!dispatched.action.isArchived) {
					persistSessionMetadata(this._sessionDataService, this._logService, dispatched.channel, AH_META_AUTO_ARCHIVED_AT_DB_KEY, '');
				}
			}
		}
	}
}
