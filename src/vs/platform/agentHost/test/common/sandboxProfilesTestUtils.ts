/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import type { IAgentConnection } from '../../common/agentService.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { ActionType } from '../../common/state/protocol/actions.js';
import type { RootState } from '../../common/state/sessionState.js';

/**
 * An agent host connection that, like the real host, merges each
 * `root/configChanged` into its config values and advertises the sandbox
 * schema, optionally without the sandbox profile key. Every client sharing an
 * instance sees the same host state.
 */
export class TestSandboxProfilesHost extends mock<IAgentConnection>() {
	private readonly _onDidChange = new Emitter<RootState>();
	private _state: RootState;

	constructor(advertiseProfiles = true) {
		super();
		const properties = { ...sandboxConfigSchema.toProtocol().properties };
		if (!advertiseProfiles) {
			delete properties[AgentHostSandboxConfigKey.SandboxProfile];
		}
		this._state = { agents: [], config: { schema: { type: 'object', properties }, values: {} } };
	}

	override readonly rootState = (() => {
		const self = this;
		return { get value() { return self._state; }, get verifiedValue() { return self._state; }, onDidChange: this._onDidChange.event, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
	})();

	override dispatch(_channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
		if (action.type === ActionType.RootConfigChanged) {
			this._state = { ...this._state, config: { ...this._state.config!, values: { ...this._state.config!.values, ...action.config } } };
			this._onDidChange.fire(this._state);
		}
	}

	/** The host's current root config values. */
	get values(): Record<string, unknown> {
		return this._state.config!.values;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
