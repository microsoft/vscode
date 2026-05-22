/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalGroupService, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionTaskRunner } from '../../chat/browser/sessionTaskRunner.js';
import { resolveTaskCommand } from '../../chat/browser/taskCommand.js';
import { ITaskEntry, ISessionsTasksService } from '../../chat/browser/sessionsTasksService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

const LOG_PREFIX = '[AgentHostSessionTaskRunner]';

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
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ILogService private readonly _logService: ILogService,
	) { }

	canRun(session: ISession): boolean {
		return this._getAddress(session) !== undefined;
	}

	async runTask(task: ITaskEntry, session: ISession): Promise<void> {
		const address = this._getAddress(session);
		if (!address) {
			return;
		}

		const allTasks = await this._sessionsTasksService.getAllTasks(session);
		const byLabel = new Map<string, ITaskEntry>();
		for (const entry of allTasks) {
			byLabel.set(entry.task.label, entry.task);
		}

		const command = resolveTaskCommand(task, { lookup: label => byLabel.get(label) });
		if (!command) {
			this._logService.trace(`${LOG_PREFIX} Skipping task '${task.label}' — no command could be resolved.`);
			return;
		}

		const cwd = this._getCwd(session);
		const instance = await this._agentHostTerminalService.createTerminalForEntry(address, {
			cwd,
			name: localize('agentHostSessionTaskTerminalName', "Task: {0}", task.label),
		});
		if (!instance) {
			this._logService.warn(`${LOG_PREFIX} Failed to create terminal for task '${task.label}' on '${address}'.`);
			return;
		}

		this._terminalService.setActiveInstance(instance);
		await this._terminalGroupService.showPanel(true);
		await instance.sendText(command, /*shouldExecute*/ true);
	}

	private _getAddress(session: ISession): string | undefined {
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.remoteAddress ?? '__local__';
	}

	private _getCwd(session: ISession): URI | undefined {
		const folder = session.workspace.get()?.folders[0];
		const cwd = folder?.workingDirectory ?? folder?.root;
		if (!cwd) {
			return undefined;
		}
		// Agent-host workspaces use the `agent-host:` scheme; unwrap to the
		// underlying file path so the host can chdir into it directly. Local
		// agent-host sessions use file URIs as-is (the host shares the local
		// filesystem). For any other scheme (e.g. `vscode-vfs://`) we don't
		// know how to translate the path on the remote, so omit cwd and let
		// the host fall back to its default working directory.
		if (cwd.scheme === AGENT_HOST_SCHEME) {
			return fromAgentHostUri(cwd);
		}
		if (cwd.scheme === Schemas.file) {
			return cwd;
		}
		return undefined;
	}
}
