/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from '../../../../../../base/common/platform.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostCustomTerminalToolEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../../../../workbench/common/contributions.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../../../../../../workbench/contrib/terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/** Terminal settings whose change should re-resolve the agent host shell. */
const AGENT_HOST_SHELL_DEPENDENT_SETTINGS = [
	TerminalSettingId.AgentHostProfileLinux,
	TerminalSettingId.AgentHostProfileMacOs,
	TerminalSettingId.AgentHostProfileWindows,
	TerminalSettingId.DefaultProfileLinux,
	TerminalSettingId.DefaultProfileMacOs,
	TerminalSettingId.DefaultProfileWindows,
	TerminalSettingId.ProfilesLinux,
	TerminalSettingId.ProfilesMacOs,
	TerminalSettingId.ProfilesWindows,
];

/**
 * A single agent-host root-config key managed by this contribution.
 *
 * The shared machinery in {@link AgentHostTerminalContribution} handles the
 * schema gate, the value-equality guard, the dispatch, and the
 * hydration-retry. A descriptor only has to say *what* its value is and *when*
 * to recompute it - adding a new managed key is one entry, no copy/paste.
 */
interface IManagedRootConfigKey {
	/** The root-config key this descriptor owns. */
	readonly key: AgentHostConfigKey;

	/**
	 * Compute the desired value for {@link key}. Return `undefined` to skip the
	 * push (e.g. the value can't be resolved yet). May be async.
	 */
	computeValue(): unknown | Promise<unknown>;

	/**
	 * Wire up the events / settings whose change should re-push this key.
	 * Disposables go in `store`; call `push` to trigger a re-push.
	 */
	registerTriggers(store: DisposableStore, push: () => void): void;
}

/**
 * Registers local agent host terminal entries with
 * {@link IAgentHostTerminalService} so they appear in the terminal dropdown.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _localEntry = this._register(new MutableDisposable());
	private readonly _conditionalListeners = this._register(new MutableDisposable<DisposableStore>());

	/** Declarative table of the root-config keys we manage. */
	private readonly _managedKeys: readonly IManagedRootConfigKey[];

	/**
	 * Managed keys whose schema the host has already advertised. Used to re-push
	 * only when a key's schema *first* appears (hydration) rather than on every
	 * root-state change - see {@link _onRootStateChanged}.
	 */
	private readonly _schemaSeen = new Set<AgentHostConfigKey>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
	) {
		super();

		this._managedKeys = [
			{
				key: AgentHostConfigKey.DefaultShell,
				computeValue: () => this._resolveDefaultShell(),
				registerTriggers: (store, push) => {
					store.add(this._configurationService.onDidChangeConfiguration(e => {
						if (AGENT_HOST_SHELL_DEPENDENT_SETTINGS.some(s => e.affectsConfiguration(s))) {
							push();
						}
					}));
					store.add(this._terminalProfileService.onDidChangeAvailableProfiles(() => push()));
				},
			},
			{
				key: AgentHostConfigKey.EnableCustomTerminalTool,
				computeValue: () => this._configurationService.getValue<boolean>(AgentHostCustomTerminalToolEnabledSettingId) === true,
				registerTriggers: (store, push) => {
					store.add(this._configurationService.onDidChangeConfiguration(e => {
						if (e.affectsConfiguration(AgentHostCustomTerminalToolEnabledSettingId)) {
							push();
						}
					}));
				},
			},
		];

		this._updateEnabled();
	}

	private _updateEnabled(): void {
		if (this._agentHostEnablementService.enabled) {
			if (!this._conditionalListeners.value) {
				const store = new DisposableStore();
				store.add(this._agentHostService.onAgentHostStart(() => this._reconcile()));
				for (const entry of this._managedKeys) {
					entry.registerTriggers(store, () => this._push(entry));
				}
				// Re-push only when the host's root-config *schema* first
				// advertises a key we manage. The initial push from
				// `_reconcile()` may race an undefined `rootState.value` (schema
				// not yet hydrated); this retries once the schema arrives.
				//
				// We deliberately do NOT re-push on every root-state change: the
				// local agent host's root config is shared across windows, so
				// reacting to *value* changes pushed by another window would
				// start an infinite update war - each window forcing its own
				// value back over the other's. See #314385 follow-up.
				store.add(this._agentHostService.rootState.onDidChange(() => this._onRootStateChanged()));
				// Seed the schema-seen set from the current state so the
				// immediate `_reconcile()` below counts as the initial push for
				// whatever keys are already advertised.
				this._schemaSeen.clear();
				for (const entry of this._managedKeys) {
					if (this._schemaHasKey(entry.key)) {
						this._schemaSeen.add(entry.key);
					}
				}
				this._conditionalListeners.value = store;
				this._reconcile();
			}
		} else {
			this._schemaSeen.clear();
			this._conditionalListeners.value = undefined;
			this._localEntry.value = undefined;
		}
	}

	private _reconcile(): void {
		if (!this._localEntry.value) {
			this._localEntry.value = this._agentHostTerminalService.registerEntry({
				name: localize('agentHostTerminal.local', "Local"),
				address: '__local__',
				getConnection: () => this._agentHostService,
			});
		}
		for (const entry of this._managedKeys) {
			this._push(entry);
		}
	}

	/**
	 * Push managed values only for keys whose schema has just transitioned from
	 * absent to present (host root-config hydration). Value-only changes - e.g.
	 * another window writing a different value into the shared root config - are
	 * intentionally ignored so multiple windows don't fight in an infinite loop.
	 */
	private _onRootStateChanged(): void {
		for (const entry of this._managedKeys) {
			if (this._schemaHasKey(entry.key)) {
				if (!this._schemaSeen.has(entry.key)) {
					this._schemaSeen.add(entry.key);
					this._push(entry);
				}
			} else {
				this._schemaSeen.delete(entry.key);
			}
		}
	}

	private _schemaHasKey(key: AgentHostConfigKey): boolean {
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		return !!rootState.config?.schema.properties[key];
	}

	/**
	 * Shared push pipeline for a managed root-config key:
	 *
	 * 1. No-op if the host's root-config schema doesn't advertise the key -
	 *    protects older / third-party agent hosts from receiving keys they
	 *    don't understand. The push is retried automatically when `rootState`
	 *    hydrates (see {@link _onRootStateChanged}).
	 * 2. Compute the desired value (may be async); `undefined` skips the push.
	 * 3. Skip if the host already holds that value (avoids redundant dispatches
	 *    and, critically, breaks cross-window update loops - see #314385).
	 *
	 * Local agent host only. Remote agent hosts (via
	 * `IRemoteAgentHostService.connections`) are intentionally not fanned out
	 * to: e.g. the resolved shell path is local-machine-shaped (a Windows path)
	 * and not necessarily valid on the remote machine. Remote operators should
	 * configure such values server-side via the remote's
	 * `agent-host-config.json`. See
	 * https://github.com/microsoft/vscode/issues/313160 follow-ups.
	 */
	private async _push(entry: IManagedRootConfigKey): Promise<void> {
		if (!this._schemaHasKey(entry.key)) {
			return;
		}

		let value: unknown;
		try {
			value = await entry.computeValue();
		} catch {
			return;
		}
		if (value === undefined) {
			return;
		}

		// Re-check after the await: a host restart / schema refresh may have
		// landed while we resolved. Re-run the schema gate (not just a config
		// existence check) so we never dispatch a key the *current* schema no
		// longer advertises - protects older / 3rd-party hosts.
		if (!this._schemaHasKey(entry.key)) {
			return;
		}
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return;
		}
		if (rootState.config.values[entry.key] === value) {
			return;
		}

		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [entry.key]: value },
		});
	}

	/**
	 * Resolve the agent host terminal profile (with `defaultProfile.<os>`
	 * fallback) so its host-managed shells inherit the user's preferred terminal
	 * binary. Returns `undefined` when no usable path can be resolved.
	 */
	private async _resolveDefaultShell(): Promise<string | undefined> {
		let profile;
		try {
			profile = await this._terminalProfileResolverService.getDefaultProfile({
				remoteAuthority: undefined,
				os: OS,
				allowAgentHostShell: true,
			});
		} catch {
			return undefined;
		}
		return profile.path || undefined;
	}
}
