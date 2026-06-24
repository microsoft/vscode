/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Schemas } from '../../../../base/common/network.js';
import { OS } from '../../../../base/common/platform.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { TerminalExitReason } from '../../../../platform/terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalGroupService, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionTaskRunner } from '../../chat/browser/sessionTaskRunner.js';
import { osToTaskTargetOS, resolveTaskCommand } from '../../chat/browser/taskCommand.js';
import { ITaskEntry, ISessionsTasksService } from '../../chat/browser/sessionsTasksService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IConfigurationResolverService } from '../../../../workbench/services/configurationResolver/common/configurationResolver.js';
import { IWorkspaceFolderData } from '../../../../platform/workspace/common/workspace.js';
import { basename } from '../../../../base/common/resources.js';

const LOG_PREFIX = '[AgentHostSessionTaskRunner]';

/**
 * Sentinel address used for the local agent host (which runs on the same
 * machine as the renderer). Remote hosts use their `remoteAddress` instead.
 */
const LOCAL_AGENT_HOST_ADDRESS = '__local__';

/**
 * Task runner for sessions backed by an agent host (local or remote). Resolves
 * the task into a shell command via {@link resolveTaskCommand} and dispatches
 * it through an agent-host terminal created by
 * {@link IAgentHostTerminalService.createTerminalForEntry}.
 */
export class AgentHostSessionTaskRunner implements ISessionTaskRunner {

	readonly id = 'agentHost';
	readonly priority = 100;

	constructor(
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ISessionsTasksService private readonly _sessionsTasksService: ISessionsTasksService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ILogService private readonly _logService: ILogService,
	) { }

	canRun(session: ISession): boolean {
		return this._getAddress(session) !== undefined;
	}

	async runTask(task: ITaskEntry, session: ISession): Promise<IDisposable | undefined> {
		const address = this._getAddress(session);
		if (!address) {
			return undefined;
		}

		const allTasks = await this._sessionsTasksService.getAllTasks(session);
		const byLabel = new Map<string, ITaskEntry>();
		for (const entry of allTasks) {
			byLabel.set(entry.task.label, entry.task);
		}

		const cwd = this._getCwd(session);
		const command = await resolveTaskCommand(task, {
			// Local host shares the renderer's OS, so use it to pick OS-specific
			// overrides; remote host OS is unknown, so fall back to the default.
			targetOS: address === LOCAL_AGENT_HOST_ADDRESS ? osToTaskTargetOS(OS) : undefined,
			lookup: label => byLabel.get(label),
			resolveVariables: this._createVariableResolver(address, cwd),
		});
		if (!command) {
			this._logService.trace(`${LOG_PREFIX} Skipping task '${task.label}' — no command could be resolved.`);
			return undefined;
		}

		const instance = await this._agentHostTerminalService.createTerminalForEntry(address, {
			cwd,
			name: localize('agentHostSessionTaskTerminalName', "Task: {0}", task.label),
		});
		if (!instance) {
			this._logService.warn(`${LOG_PREFIX} Failed to create terminal for task '${task.label}' on '${address}'.`);
			return undefined;
		}

		this._terminalService.setActiveInstance(instance);
		await this._terminalGroupService.showPanel(true);
		await instance.sendText(command, /*shouldExecute*/ true);

		return toDisposable(() => {
			instance.dispose(TerminalExitReason.User);
		});
	}

	private _getAddress(session: ISession): string | undefined {
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.remoteAddress ?? LOCAL_AGENT_HOST_ADDRESS;
	}

	private _getCwd(session: ISession): URI | undefined {
		const folder = session.workspace.get()?.folders[0];
		const cwd = folder?.workingDirectory ?? folder?.root;
		if (!cwd) {
			return undefined;
		}
		// Unwrap vscode-agent-host URIs to a host file path; pass file URIs through; omit unknown schemes.
		if (cwd.scheme === AGENT_HOST_SCHEME) {
			return fromAgentHostUri(cwd);
		}
		if (cwd.scheme === Schemas.file) {
			return cwd;
		}
		return undefined;
	}

	/**
	 * Builds the `${workspaceFolder}` resolver for a task, or `undefined` when
	 * there is no working directory. Remote hosts only get a literal
	 * `${workspaceFolder}` substitution (their OS may differ from the
	 * renderer's); local hosts use the full resolver.
	 */
	private _createVariableResolver(address: string, cwd: URI | undefined): ((value: string) => Promise<string>) | undefined {
		if (!cwd) {
			return undefined;
		}
		if (address !== LOCAL_AGENT_HOST_ADDRESS) {
			// Use the POSIX URI path, not fsPath, so separators are correct on the remote host.
			return value => Promise.resolve(value.replaceAll('${workspaceFolder}', cwd.path));
		}
		return async value => {
			try {
				return await this._configurationResolverService.resolveAsync(this._toFolderData(cwd), value);
			} catch {
				// Leave the string unchanged if a variable can't be resolved here (e.g. ${command:}/${input:}).
				return value;
			}
		};
	}

	private _toFolderData(cwd: URI): IWorkspaceFolderData {
		return { uri: cwd, name: basename(cwd), index: 0 };
	}
}
