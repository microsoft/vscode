/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Publishes the shell init scripts a session's built-in shell tool should
 * source, as per-session agent-host config.
 *
 * ## Why
 *
 * The SDK's built-in shell tool runs each command in a fresh, no-rc shell. That
 * shell inherits exported environment variables from the agent host process,
 * but nothing else: shell *functions* (`conda activate`) and per-workspace
 * Python activation never reach it. Commands then run against whatever
 * interpreter happens to be first on `PATH`.
 *
 * ## What is published
 *
 * Script text, not paths. The workbench knows which environment a session
 * should use; the agent host owns where files live and what the sandbox
 * permits. Sending text keeps that split intact.
 *
 * Two snippets, each behind its own setting:
 *
 * - **user profile** — loads the user's shell profile, so shell functions
 *   installed by tools such as conda exist.
 * - **python env** — activates the workspace's selected interpreter, read from
 *   the environment-variable collection the Python Environments extension
 *   publishes. That collection is folder-scoped, so a multi-root workspace can
 *   hold a different interpreter per folder.
 *
 * ## Scoping
 *
 * A session has one working directory, so it resolves to one folder, the same
 * way a terminal resolves to the folder containing its cwd. Sessions isolated
 * in a worktree resolve through their originating project, since a worktree
 * path is not a workspace folder and the interpreter was selected against the
 * project.
 *
 * ## Dispatch discipline
 *
 * Config is only dispatched when the value actually changes. The agent host's
 * session config is shared across windows, so re-dispatching an equal value
 * would let two windows overwrite each other indefinitely.
 */

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostShellToolLoadUserProfileSettingId, AgentHostShellToolPythonActivationSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { createPythonActivationSnippets, createUserProfileSnippets, type IShellInitSnippet, type ShellInitSnippetShell } from '../../../../../../platform/agentHost/common/shellInitSnippets.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentVariableService } from '../../../../terminal/common/environmentVariable.js';

/** Extension allowed to publish Python activation; mirrors the guard in core. */
const PYTHON_ENV_EXTENSION_ID = 'ms-python.vscode-python-envs';

/**
 * Activation variables published by the Python Environments extension, most
 * preferred first for the shell the tool actually spawns.
 *
 * The runtime always spawns bash on POSIX and PowerShell on Windows, never the
 * user's login shell, so only those two are useful. The zsh variable is a safe
 * fallback for bash because the extension emits identical text for both: plain
 * `source <path>` / `conda activate` with no zsh-specific syntax. Fish and cmd
 * are never used — their syntax would not parse.
 */
const PYTHON_ACTIVATION_VARIABLES: readonly string[] = isWindows
	? ['VSCODE_PYTHON_PWSH_ACTIVATE']
	: ['VSCODE_PYTHON_BASH_ACTIVATE', 'VSCODE_PYTHON_ZSH_ACTIVATE'];

/** Shell the SDK built-in shell tool spawns on this platform. */
const TOOL_SHELL: ShellInitSnippetShell = isWindows ? 'powershell' : 'bash';

export const IAgentHostShellInitSynchronizer = createDecorator<IAgentHostShellInitSynchronizer>('agentHostShellInitSynchronizer');

/** A live session whose shell init scripts should track the workspace. */
export interface IAgentHostShellInitRegistration {
	readonly session: URI;
	/** Authoritative session state, used for the advertised schema and current values. */
	readonly subscription: IAgentSubscription<SessionState>;
}

export interface IAgentHostShellInitSynchronizer {
	readonly _serviceBrand: undefined;

	/**
	 * Starts publishing shell init scripts for `registration` until the returned
	 * disposable is disposed.
	 */
	register(registration: IAgentHostShellInitRegistration): IDisposable;
}

interface IRegistrationEntry extends IAgentHostShellInitRegistration {
	readonly store: DisposableStore;
	/** Coalesces bursts of triggers into a single pass. */
	readonly scheduler: RunOnceScheduler;
}

export class AgentHostShellInitSynchronizer extends Disposable implements IAgentHostShellInitSynchronizer {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IRegistrationEntry>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._environmentVariableService.onDidChangeCollections(() => this._scheduleAll()));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._scheduleAll()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostShellToolPythonActivationSettingId)
				|| event.affectsConfiguration(AgentHostShellToolLoadUserProfileSettingId)) {
				this._scheduleAll();
			}
		}));
	}

	register(registration: IAgentHostShellInitRegistration): IDisposable {
		const key = registration.session.toString();
		this._registrations.get(key)?.store.dispose();

		const store = new DisposableStore();
		// A short delay collapses the burst of state changes that follows a
		// session becoming ready into one publish.
		const scheduler = store.add(new RunOnceScheduler(() => this._publish(key), 0));
		const entry: IRegistrationEntry = { ...registration, store, scheduler };
		this._registrations.set(key, entry);

		// The session's own state carries both the advertised config schema and
		// the value already published, so it must re-run when either arrives.
		store.add(registration.subscription.onDidChange(() => scheduler.schedule()));
		store.add(toDisposable(() => {
			if (this._registrations.get(key) === entry) {
				this._registrations.delete(key);
			}
		}));
		scheduler.schedule();
		return store;
	}

	private _scheduleAll(): void {
		for (const entry of this._registrations.values()) {
			entry.scheduler.schedule();
		}
	}

	/** Recomputes this session's snippets and dispatches them when they changed. */
	private _publish(key: string): void {
		const entry = this._registrations.get(key);
		if (!entry) {
			return;
		}
		const state = entry.subscription.value;
		if (!state || state instanceof Error || !state.config) {
			return;
		}
		// Older or third-party agent hosts do not understand the key. Dispatching
		// it anyway would be silently dropped by the session reducer.
		if (!state.config.schema.properties[SessionConfigKey.ShellInitSnippets]) {
			return;
		}
		const desired = this._computeSnippets(state);
		const current = state.config.values[SessionConfigKey.ShellInitSnippets];
		if (structuralEquals(current as readonly IShellInitSnippet[] | undefined, desired)) {
			return;
		}
		// Never publish an empty list to a session that never had one: that would
		// be a no-op write which another window would then race to undo.
		if (!desired.length && current === undefined) {
			return;
		}
		this._logService.trace(`[ShellInit] Publishing ${desired.length} snippet(s) for ${key}`);
		this._agentHostService.dispatch(key, {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.ShellInitSnippets]: desired },
		});
	}

	private _computeSnippets(state: SessionState): IShellInitSnippet[] {
		const snippets: IShellInitSnippet[] = [];
		// Profile loading first: it installs the shell functions that an
		// activation command may rely on, matching the order VS Code's own shell
		// integration uses.
		if (this._configurationService.getValue<boolean>(AgentHostShellToolLoadUserProfileSettingId) !== false) {
			snippets.push(...createUserProfileSnippets(TOOL_SHELL));
		}
		if (this._configurationService.getValue<boolean>(AgentHostShellToolPythonActivationSettingId) !== false) {
			snippets.push(...createPythonActivationSnippets(TOOL_SHELL, this._readPythonActivation(state)));
		}
		return snippets;
	}

	/**
	 * Reads the activation command the Python extension published for this
	 * session's folder, or `undefined` when there is none.
	 */
	private _readPythonActivation(state: SessionState): string | undefined {
		const folder = this._resolveFolder(state);
		if (!folder) {
			return undefined;
		}
		const variables = this._environmentVariableService.mergedCollection.getVariableMap({ workspaceFolder: folder });
		for (const name of PYTHON_ACTIVATION_VARIABLES) {
			// Only the Python extension may publish these. Core enforces the same
			// ownership when building terminal environments; repeat it here
			// because this value is turned into an executable script.
			const value = variables.get(name)?.find(mutator => mutator.extensionIdentifier === PYTHON_ENV_EXTENSION_ID)?.value;
			if (value?.trim()) {
				return value;
			}
		}
		return undefined;
	}

	/**
	 * The workspace folder whose interpreter this session should use.
	 *
	 * Prefers the session's originating project over its working directory: a
	 * worktree-isolated session runs in a checkout that is not a workspace
	 * folder, and the interpreter was selected against the project it came from.
	 * Activation commands carry absolute paths, so the project's environment is
	 * still the right one from inside a worktree.
	 */
	private _resolveFolder(state: SessionState): IWorkspaceFolder | undefined {
		// Protocol URIs are serialized strings, not `URI` instances.
		const candidates: readonly (string | undefined)[] = [state.project?.uri, ...(state.workingDirectories ?? [])];
		for (const candidate of candidates) {
			if (!candidate) {
				continue;
			}
			const folder = this._workspaceContextService.getWorkspaceFolder(URI.parse(candidate));
			if (folder) {
				return folder;
			}
		}
		// A single-folder workspace is unambiguous even when the session's own
		// paths do not resolve, e.g. a session resumed in a fresh window.
		const folders = this._workspaceContextService.getWorkspace().folders;
		return folders.length === 1 ? folders[0] : undefined;
	}
}

registerSingleton(IAgentHostShellInitSynchronizer, AgentHostShellInitSynchronizer, InstantiationType.Delayed);
