/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation, raceTimeout, RunOnceScheduler, Sequencer } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostShellToolInitScriptEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { createShellInitScript, type IShellInitScript, type ShellInitScriptShell } from '../../../../../../platform/agentHost/common/shellInitScript.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentVariableService } from '../../../../terminal/common/environmentVariable.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

const PYTHON_ENV_EXTENSION_ID = 'ms-python.vscode-python-envs';
// Only the variable matching the tool shell: the extension publishes
// shell-specific activation, so no cross-shell fallback is read.
const PYTHON_ACTIVATION_VARIABLES: readonly string[] = isWindows
	? ['VSCODE_PYTHON_PWSH_ACTIVATE']
	: ['VSCODE_PYTHON_BASH_ACTIVATE'];
const TOOL_SHELL: ShellInitScriptShell = isWindows ? 'powershell' : 'bash';
const SHELL_INIT_PUBLICATION_TIMEOUT_MS = 10_000;

export const IAgentHostShellInitSynchronizer = createDecorator<IAgentHostShellInitSynchronizer>('agentHostShellInitSynchronizer');

export interface IAgentHostShellInitSynchronizer {
	readonly _serviceBrand: undefined;
	register(session: URI, subscription: IAgentSubscription<SessionState>): IDisposable;
	reconcile(session: URI, token: CancellationToken): Promise<void>;
}

interface IRegistration {
	readonly subscription: IAgentSubscription<SessionState>;
	readonly store: DisposableStore;
	readonly scheduler: RunOnceScheduler;
	readonly sequencer: Sequencer;
	schemaReady: boolean;
	pendingPublication: { readonly serialized: string; readonly desired: readonly IShellInitScript[]; readonly applied: DeferredPromise<ActionEnvelope | undefined> } | undefined;
}

/**
 * Publishes one combined profile-loading and Python-activation script for each
 * session. Script text travels in session config; the agent host owns the file.
 */
export class AgentHostShellInitSynchronizer extends Disposable implements IAgentHostShellInitSynchronizer {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IRegistration>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(this._environmentVariableService.onDidChangeCollections(() => this._scheduleAll()));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._scheduleAll()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostShellToolInitScriptEnabledSettingId)) {
				this._scheduleAll();
			}
		}));
	}

	register(session: URI, subscription: IAgentSubscription<SessionState>): IDisposable {
		// Remote-development windows can run a host on a different OS, so the
		// renderer cannot safely choose Bash versus PowerShell for them.
		if (this._environmentService.remoteAuthority) {
			return Disposable.None;
		}
		const key = session.toString();
		this._registrations.get(key)?.store.dispose();

		const store = new DisposableStore();
		const scheduler = store.add(new RunOnceScheduler(() => { void this._enqueuePublish(key); }, 0));
		const registration: IRegistration = {
			subscription,
			store,
			scheduler,
			sequencer: new Sequencer(),
			schemaReady: this._supportsShellInit(subscription.value),
			pendingPublication: undefined,
		};
		this._registrations.set(key, registration);
		store.add(subscription.onDidChange(state => {
			// Session config echoes are shared across windows. Once the schema is
			// ready, local inputs and pre-turn reconcile own publication; reacting
			// to every echo can make two qualifying windows alternate forever.
			if (!registration.schemaReady && this._supportsShellInit(state)) {
				registration.schemaReady = true;
				scheduler.schedule();
			}
		}));
		store.add(subscription.onDidApplyAction(envelope => {
			const pending = registration.pendingPublication;
			if (pending
				&& envelope.action.type === ActionType.SessionConfigChanged
				&& structuralEquals(envelope.action.config[SessionConfigKey.ShellInitSnippets], pending.desired)
			) {
				pending.applied.complete(envelope);
			}
		}));
		store.add(toDisposable(() => {
			void registration.pendingPublication?.applied.complete(undefined);
			if (this._registrations.get(key) === registration) {
				this._registrations.delete(key);
			}
		}));
		scheduler.schedule();
		return store;
	}

	reconcile(session: URI, token: CancellationToken): Promise<void> {
		const key = session.toString();
		const registration = this._registrations.get(key);
		registration?.scheduler.cancel();
		return this._enqueuePublish(key, token);
	}

	private _scheduleAll(): void {
		for (const registration of this._registrations.values()) {
			registration.scheduler.schedule();
		}
	}

	private _supportsShellInit(state: SessionState | Error | undefined): state is SessionState {
		return !!state && !(state instanceof Error) && !!state.config?.schema.properties[SessionConfigKey.ShellInitSnippets];
	}

	private _enqueuePublish(key: string, token?: CancellationToken): Promise<void> {
		const registration = this._registrations.get(key);
		const queued = registration?.sequencer.queue(() => this._publish(key, token)) ?? Promise.resolve();
		return token ? raceCancellation(queued, token).then(() => { }) : queued;
	}

	private async _publish(key: string, token?: CancellationToken): Promise<void> {
		const registration = this._registrations.get(key);
		const state = registration?.subscription.value;
		if (!state || state instanceof Error || !state.config?.schema.properties[SessionConfigKey.ShellInitSnippets]) {
			return;
		}

		const enabled = this._configurationService.getValue<boolean>(AgentHostShellToolInitScriptEnabledSettingId) === true;
		const folder = enabled ? this._resolveFolder(state) : undefined;
		// A non-empty script belongs to the window that owns the session folder.
		// The application-scoped disabled value is authoritative from any local
		// window, including the Agents window.
		if (enabled && !folder) {
			return;
		}
		const desired = enabled && folder ? [createShellInitScript(TOOL_SHELL, this._readPythonActivation(folder))] : [];
		const serialized = JSON.stringify(desired);
		const pending = registration.pendingPublication;
		if (pending?.serialized === serialized) {
			if (token) {
				await this._awaitPublication(registration, pending, token);
			}
			return;
		}
		const confirmed = registration.subscription.verifiedValue?.config?.values[SessionConfigKey.ShellInitSnippets] as readonly IShellInitScript[] | undefined;
		if (structuralEquals(confirmed, desired) || (!desired.length && confirmed === undefined)) {
			return;
		}

		const action = {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.ShellInitSnippets]: desired },
		} as const;
		const publication = {
			serialized,
			desired,
			applied: new DeferredPromise<ActionEnvelope | undefined>(),
		};
		registration.pendingPublication = publication;
		void publication.applied.p.then(() => {
			if (registration.pendingPublication === publication) {
				registration.pendingPublication = undefined;
			}
		});
		this._agentHostService.dispatch(key, action);
		await this._awaitPublication(registration, publication, token);
	}

	private async _awaitPublication(registration: IRegistration, publication: NonNullable<IRegistration['pendingPublication']>, token?: CancellationToken): Promise<void> {
		const bounded = raceTimeout(publication.applied.p, SHELL_INIT_PUBLICATION_TIMEOUT_MS);
		const envelope = token ? await raceCancellation(bounded, token) : await bounded;
		if (registration.pendingPublication === publication) {
			registration.pendingPublication = undefined;
		}
		if (token && envelope === undefined && !token.isCancellationRequested) {
			throw new Error('Timed out waiting for Agent Host to apply shell init config.');
		}
		if (token && envelope?.rejectionReason) {
			throw new Error(`Agent Host rejected shell init config: ${envelope.rejectionReason}`);
		}
	}

	private _readPythonActivation(folder: IWorkspaceFolder): string | undefined {
		const variables = this._environmentVariableService.mergedCollection.getVariableMap({ workspaceFolder: folder });
		for (const name of PYTHON_ACTIVATION_VARIABLES) {
			const value = variables.get(name)?.find(mutator => mutator.extensionIdentifier === PYTHON_ENV_EXTENSION_ID)?.value;
			if (value?.trim()) {
				return value;
			}
		}
		return undefined;
	}

	private _resolveFolder(state: SessionState): IWorkspaceFolder | undefined {
		for (const value of [state.project?.uri, ...(state.workingDirectories ?? [])]) {
			if (value) {
				const folder = this._workspaceContextService.getWorkspaceFolder(URI.parse(value));
				if (folder) {
					return folder;
				}
			}
		}
		return undefined;
	}
}

registerSingleton(IAgentHostShellInitSynchronizer, AgentHostShellInitSynchronizer, InstantiationType.Delayed);
