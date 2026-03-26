/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISessionData, ISessionWorkspace, SessionStatus } from '../../sessions/common/sessionData.js';
import { ISendRequestOptions, ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from '../../sessions/browser/sessionsProvider.js';
import { IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';

const CopilotCLISessionType: ISessionType = {
	id: AgentSessionProviders.AgentHostCopilot,
	label: localize('copilotCLI', "Copilot"),
	icon: Codicon.copilot,
	requiresWorkspaceTrust: true,
};

/**
 * A sessions provider for a single agent on a remote agent host connection.
 * One instance is created per agent discovered on a connection.
 */
export class RemoteAgentHostSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly sessionTypes: readonly ISessionType[];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	readonly browseActions: readonly ISessionsBrowseAction[];

	constructor(
		private readonly _address: string,
		_connectionName: string | undefined,
		_agentProvider: string,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
	) {
		super();

		const sanitized = agentHostAuthority(_address);
		const displayName = _connectionName || `${_agentProvider} (${_address})`;

		this.id = `agenthost-${sanitized}-${_agentProvider}`;
		this.label = displayName;

		this.sessionTypes = [CopilotCLISessionType];

		this.browseActions = [{
			label: localize('folders', "Folders"),
			icon: Codicon.remote,
			providerId: this.id,
			execute: () => this._browseForFolder(),
		}];
	}

	// -- Workspaces --

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		return {
			label: repositoryUri.path.split('/').pop() || repositoryUri.path,
			icon: Codicon.remote,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
		};
	}

	// -- Sessions --

	getSessionTypes(_session: ISessionData): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISessionData[] {
		// Sessions are managed by the existing AgentHostSessionListController
		// This will be populated when the list controller is integrated
		return [];
	}

	// -- Session Lifecycle --

	createNewSession(workspace: ISessionWorkspace): ISessionData {
		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}
		const resource = URI.from({ scheme: this.sessionTypes[0]?.id ?? 'agenthost', path: `/untitled-${generateUuid()}` });
		// Create a minimal ISessionData for the new session
		return {
			sessionId: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: this.sessionTypes[0]?.id ?? 'agenthost',
			icon: Codicon.remote,
			createdAt: new Date(),
			workspace: observableValue(this, {
				label: workspaceUri.path.split('/').pop() || workspaceUri.path,
				icon: Codicon.remote,
				repositories: [{ uri: workspaceUri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
			}),
			title: observableValue(this, ''),
			updatedAt: observableValue(this, new Date()),
			status: observableValue(this, SessionStatus.Untitled),
			changes: observableValue<readonly IChatSessionFileChange[]>(this, []),
			modelId: observableValue(this, undefined),
			mode: observableValue(this, undefined),
			loading: observableValue(this, false),
			isArchived: observableValue(this, false),
			isRead: observableValue(this, true),
			description: observableValue(this, undefined),
			lastTurnEnd: observableValue(this, undefined),
			pullRequestUri: observableValue(this, undefined),
			pullRequestStateIcon: observableValue(this, undefined),

		};
	}

	setSessionType(_sessionId: string, _type: ISessionType): ISessionData {
		throw new Error('Remote agent host sessions do not support changing session type');
	}

	setModel(_sessionId: string, _modelId: string): void {
		// No-op for remote agent host sessions
	}

	// -- Session Actions --

	async archiveSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support archiving
	}

	async unarchiveSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support unarchiving
	}

	async deleteSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support deletion
	}

	async renameSession(_sessionId: string, _title: string): Promise<void> {
		// Agent host sessions don't support renaming
	}

	setRead(_sessionId: string, _read: boolean): void {
		// Agent host sessions don't track read state
	}

	async sendRequest(_sessionId: string, sendOptions: ISendRequestOptions): Promise<ISessionData> {
		// Agent host session send is handled separately
		throw new Error('Remote agent host sessions do not support sending requests through the sessions provider');
	}

	// -- Private --

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		const authority = agentHostAuthority(this._address);
		const defaultUri = agentHostUri(authority, '/');

		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectRemoteFolder', "Select Folder on {0}", this.label),
				availableFileSystems: [AGENT_HOST_SCHEME],
				defaultUri,
			});
			if (selected?.[0]) {
				const uri = selected[0];
				const label = uri.path.split('/').pop() || uri.path;
				return {
					label,
					icon: Codicon.remote,
					repositories: [{ uri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
				};
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}
}
