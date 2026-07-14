/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { AgentHostOpus48PromptEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';

/**
 * Forwards the `chat.agentHost.opus48Prompt.enabled` VS Code setting into the
 * **local** agent host's root config (`opus48Prompt`) so
 * {@link CopilotSessionLauncher} can read it at session launch via
 * `getRootValue`. Gated on `chat.agentHost.enabled`.
 *
 * `AgentHostTerminalContribution` has a more elaborate, multi-key version of
 * this forwarding for its terminal keys; this contribution intentionally stays
 * single-key and self-contained. It still respects the two correctness
 * constraints that forwarding into the shared root config requires:
 *  - schema gate + hydration retry: only dispatch once the host advertises the
 *    key (its `rootState` may hydrate after this contribution starts); and
 *  - cross-window loop guard: only push on the setting changing, the schema
 *    first appearing, or an agent-host (re)start — never on value-only
 *    root-state changes, which another window's write would otherwise bounce
 *    back and forth forever (#314385).
 */
export class AgentHostCopilotPromptContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostCopilotPrompt';

	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());

	/** Whether the host has advertised the `opus48Prompt` key in its schema yet. */
	private _schemaSeen = false;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();
		this._updateEnabled();
	}

	private _updateEnabled(): void {
		if (this._agentHostEnablementService.enabled) {
			if (!this._conditionalListeners.value) {
				const store = new DisposableStore();
				store.add(this._agentHostService.onAgentHostStart(() => this._push()));
				store.add(this._configurationService.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(AgentHostOpus48PromptEnabledSettingId)) {
						this._push();
					}
				}));
				store.add(this._agentHostService.rootState.onDidChange(() => this._onRootStateChanged()));
				this._schemaSeen = this._schemaHasKey();
				this._conditionalListeners.value = store;
				this._push();
			}
		} else {
			this._schemaSeen = false;
			this._conditionalListeners.value = undefined;
		}
	}

	private _onRootStateChanged(): void {
		if (this._schemaHasKey()) {
			// Push only on the schema's first appearance (hydration), not on
			// value-only changes — see the class doc for the cross-window rationale.
			if (!this._schemaSeen) {
				this._schemaSeen = true;
				this._push();
			}
		} else {
			this._schemaSeen = false;
		}
	}

	private _schemaHasKey(): boolean {
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		return !!rootState.config?.schema.properties[AgentHostConfigKey.Opus48Prompt];
	}

	private _push(): void {
		if (!this._schemaHasKey()) {
			return;
		}
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return;
		}
		const value = this._configurationService.getValue<boolean>(AgentHostOpus48PromptEnabledSettingId) === true;
		if (rootState.config.values[AgentHostConfigKey.Opus48Prompt] === value) {
			return;
		}
		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AgentHostConfigKey.Opus48Prompt]: value },
		});
	}
}
