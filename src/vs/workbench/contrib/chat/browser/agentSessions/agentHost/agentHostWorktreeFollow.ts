/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { logSettingExperimentTrigger } from '../../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewHostService } from '../../chatViewHost.js';
import { IAgentSessionsService } from '../agentSessionsService.js';

/**
 * Moves the folder of a window with a single local folder to where the chat that the user brings up works, while
 * `chat.editorWindow.enableWorktree` is on: to the working directory of a local agent host session, such as a worktree, and
 * back to the folder's own location for a local chat. A chat that the view restores, such as as the window starts, moves
 * nothing; nor does a chat of another kind, such as a cloud session.
 */
export class AgentHostWorktreeFollowContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostWorktreeFollow';

	/** The agent host session that the user brought up, until its working directory is known. */
	private _pending: URI | undefined;
	/** Waits for the working directory of {@link _pending} as the sessions update. */
	private readonly _sessionsListener = this._register(new MutableDisposable());

	constructor(
		@IChatViewHostService chatViewHostService: IChatViewHostService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceEditingService private readonly _workspaceEditingService: IWorkspaceEditingService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			return;
		}
		this._register(autorun(reader => {
			const shown = chatViewHostService.shownSession.read(reader);
			this._pending = undefined;
			this._sessionsListener.clear();
			if (shown?.reason === 'open') {
				this._follow(shown.resource);
			}
		}));
	}

	/** Moves the window's folder to where the chat of `resource` works, once that is known. */
	private _follow(resource: URI): void {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!folder || !primary || !this._folderLocationService.canSetLocation(folder) || isUntitledChatSession(resource)) {
			return;
		}

		let target: URI;
		if (LocalChatSessionUri.isLocalSession(resource)) {
			target = primary;
		} else if (isLocalAgentHostTarget(resource.scheme)) {
			const path = this._agentSessionsService.getSession(resource)?.metadata?.workingDirectoryPath;
			if (typeof path !== 'string' || !path) {
				// Not listed with its working directory yet, such as a session that its first request just started
				this._pending = resource;
				this._sessionsListener.value ??= this._agentSessionsService.model.onDidChangeSessions(() => {
					if (this._pending) {
						const pending = this._pending;
						this._pending = undefined;
						this._sessionsListener.clear();
						this._follow(pending);
					}
				});
				return;
			}
			target = URI.file(path);
		} else {
			return;
		}

		if (extUriBiasedIgnorePathCase.isEqual(target, folder.uri)) {
			return;
		}
		// The folder would move here: the same moment with the setting on and off
		logSettingExperimentTrigger(this._telemetryService, ChatConfiguration.EditorWindowEnableWorktree);
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree)) {
			return;
		}
		this._workspaceEditingService.setFolderLocation(target, { reason: 'user', folder: folder.uri }).catch(error => {
			// Such as a working directory that is not a location of the folder
			this._logService.trace(`[AgentHostWorktreeFollow] Did not move the folder to ${target.toString()}`, error);
		});
	}
}

registerWorkbenchContribution2(AgentHostWorktreeFollowContribution.ID, AgentHostWorktreeFollowContribution, WorkbenchPhase.AfterRestored);
