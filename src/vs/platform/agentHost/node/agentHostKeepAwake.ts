/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { agentHostKeepAwakeConfiguration, AgentHostKeepAwakeConfigKey, AgentHostKeepAwakeMode, platformRootSchema } from '../common/agentHostSchema.js';
import { ActionType } from '../common/state/sessionActions.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

/**
 * Owns this host's idle-sleep inhibition, independently of any connected window.
 * The backend owns OS facilities and any asynchronous acquisition/cleanup.
 */
export class AgentHostKeepAwake extends Disposable {
	static readonly RELEASE_DELAY = 2 * 60 * 1000;

	private readonly _hold = this._register(new MutableDisposable<IDisposable>());
	private readonly _release = this._register(new RunOnceScheduler(() => this._hold.clear(), AgentHostKeepAwake.RELEASE_DELAY));
	private _mode: AgentHostKeepAwakeMode | undefined;

	constructor(
		private readonly _acquire: (allowOnBattery: boolean) => IDisposable,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this._register(_configurationService.onDidRootConfigChange(() => this._update()));
		this._register(_stateManager.onDidChangeSessionActiveTurn(() => this._update()));
		this._register(_stateManager.onDidRemoveSession(() => this._update()));
		this._register(_stateManager.onDidEmitEnvelope(({ action }) => {
			// Aggregate session status can hide running peers behind a chat needing input.
			if (action.type === ActionType.SessionChatUpdated || action.type === ActionType.SessionChatRemoved) {
				this._update();
			}
		}));
		this._update();
	}

	private _update(): void {
		const mode = this._configurationService.getRootValue(platformRootSchema, AgentHostKeepAwakeConfigKey) ?? agentHostKeepAwakeConfiguration.default;
		if (mode !== this._mode) {
			this._release.cancel();
			this._hold.clear();
			this._mode = mode;
		}
		if (mode !== AgentHostKeepAwakeMode.Never && this._stateManager.hasRunningChats) {
			this._release.cancel();
			this._hold.value ??= this._acquire(mode === AgentHostKeepAwakeMode.Always);
		} else if (this._hold.value && !this._release.isScheduled()) {
			this._release.schedule();
		}
	}
}
