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
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISessionData, SessionStatus } from '../../sessions/common/sessionData.js';
import { SessionWorkspace } from '../../sessions/common/sessionWorkspace.js';
import { ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from '../../sessions/browser/sessionsProvider.js';
import { IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { agentHostAuthority } from './remoteAgentHost.contribution.js';
import { AGENT_HOST_FS_SCHEME, agentHostUri } from './agentHostFileSystemProvider.js';

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
		const sessionTypeId = `remote-${sanitized}-${_agentProvider}`;
		const displayName = _connectionName || `${_agentProvider} (${_address})`;

		this.id = `agenthost-${sanitized}-${_agentProvider}`;
		this.label = displayName;

		this.sessionTypes = [{
			id: sessionTypeId,
			label: displayName,
			icon: Codicon.remote,
		}];

		this.browseActions = [{
			label: localize('browseRemote', "Browse {0}...", displayName),
			icon: Codicon.remote,
			providerId: this.id,
			execute: () => this._browseForFolder(),
		}];
	}

	// ── Workspaces ──

	getWorkspaces(): SessionWorkspace[] {
		// Remote agent host workspaces are browsed on demand, not stored
		return [];
	}

	// ── Sessions ──

	getSessions(): ISessionData[] {
		// Sessions are managed by the existing AgentHostSessionListController
		// This will be populated when the list controller is integrated
		return [];
	}

	// ── Session Lifecycle ──

	createNewSession(type: ISessionType, resource: URI, workspace?: SessionWorkspace): ISessionData {
		// Create a minimal ISessionData for the new session
		return {
			sessionId: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: type.id,
			icon: Codicon.remote,
			createdAt: new Date(),
			workspace: observableValue(this, workspace ? {
				label: workspace.uri.path.split('/').pop() || workspace.uri.path,
				icon: Codicon.remote,
				repositories: [{ uri: workspace.uri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
			} : undefined),
			title: observableValue(this, ''),
			updatedAt: observableValue(this, new Date()),
			status: observableValue(this, SessionStatus.Untitled),
			changes: observableValue<readonly IChatSessionFileChange[]>(this, []),
		};
	}

	// ── Session Actions ──

	async archiveSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support archiving
	}

	async deleteSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support deletion
	}

	async renameSession(_sessionId: string, _title: string): Promise<void> {
		// Agent host sessions don't support renaming
	}

	// ── Active Session ──

	setActiveSession(_session: ISessionData): void {
		// Remote agent host sets its own context keys here if needed
	}

	clearActiveSession(): void {
		// No-op
	}

	// ── Private ──

	private async _browseForFolder(): Promise<SessionWorkspace | undefined> {
		const authority = agentHostAuthority(this._address);
		const defaultUri = agentHostUri(authority, '/');

		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectRemoteFolder', "Select Folder on {0}", this.label),
				availableFileSystems: [AGENT_HOST_FS_SCHEME],
				defaultUri,
			});
			if (selected?.[0]) {
				return new SessionWorkspace(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}
}
