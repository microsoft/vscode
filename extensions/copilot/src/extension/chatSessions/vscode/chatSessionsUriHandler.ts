/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { getGithubRepoIdFromFetchUrl, IGitService } from '../../../platform/git/common/gitService';
import { API, Repository } from '../../../platform/git/vscode/git';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { EXTENSION_ID } from '../../common/constants';
import { getRepoId } from './copilotCodingAgentUtils';

export const GHPR_EXTENSION_ID = 'GitHub.vscode-pull-request-github';
const PENDING_CHAT_SESSION_STORAGE_KEY = 'github.copilot.pendingChatSession';

export enum UriHandlerPaths {
	OpenSession = '/openAgentSession',
	External_OpenPullRequestWebview = '/open-pull-request-webview',
}

export const UriHandlers = {
	[UriHandlerPaths.OpenSession]: EXTENSION_ID,
	[UriHandlerPaths.External_OpenPullRequestWebview]: GHPR_EXTENSION_ID
};

interface PendingChatSession {
	type: string;
	id: string;
	url: string;
	branch: string;
	timestamp: number;
}

export type CustomUriHandler = vscode.UriHandler & { canHandleUri(uri: vscode.Uri): boolean };

export class ChatSessionsUriHandler extends Disposable implements CustomUriHandler {
	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@IGitService private readonly _gitService: IGitService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly _logService: ILogService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
	}

	async handleUri(uri: vscode.Uri): Promise<void> {
		switch (uri.path) {
			case UriHandlerPaths.OpenSession:
				{
					const params = new URLSearchParams(uri.query);
					const type = params.get('type');
					const prId = params.get('id');
					const url = decodeURIComponent(params.get('url') || '');
					const branch = decodeURIComponent(params.get('branch') || '');
					/* __GDPR__
						"copilot.codingAgent.deeplink" : {
							"owner": "rebornix",
							"comment": "Reports when the ChatSessionsUriHandler handles a URI to open a chat session",
							"sessionType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of chat session" },
							"hasId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the session has an ID" }
						}
					*/
					this._telemetryService.sendTelemetryEvent('copilot.codingAgent.deeplink', { microsoft: true, github: false }, {
						sessionType: type || 'unknown',
						hasId: prId ? 'true' : 'false',
					});
					if (type?.startsWith('copilot') && prId) {
						// For now we hardcode it to this type, eventually the full type should come in the URI
						return this._openGitHubSession('copilot-cloud-agent', prId, url, branch);
					}
				}
		}
	}

	private async waitAndGetGlobalState(): Promise<PendingChatSession | undefined> {
		let timeout = 500;
		let state = undefined;
		while (!state && timeout > 0) {
			state = this._extensionContext.globalState.get<PendingChatSession>(PENDING_CHAT_SESSION_STORAGE_KEY);
			await new Promise(resolve => setTimeout(resolve, 100));
			timeout -= 100;
		}
		return state;
	}

	private async _openGitHubSession(type: string, id: string, url: string | null, branch: string | null): Promise<void> {
		const gitAPI = this._gitExtensionService.getExtensionApi();
		if (gitAPI && url && branch) {
			// Check if we already have this repo open in the workspace
			const existingRepo = this._getAlreadyOpenWorkspace(gitAPI, url);
			if (existingRepo) {
				// Repo is already open, no need to clone
				await this.openPendingSession({ repo: existingRepo, branch, id, type });
				return;
			}

			// We're going to need a window reload, save the info to global state
			const pendingSession = {
				type,
				id,
				url,
				branch,
				timestamp: Date.now()
			};
			await this._extensionContext.globalState.update(PENDING_CHAT_SESSION_STORAGE_KEY, pendingSession);
			const pendingSessionUri = vscode.Uri.joinPath(this._extensionContext.globalStorageUri, '.pendingSession');
			try {
				this.fileSystemService.writeFile(pendingSessionUri, Buffer.from(`${id}\n${Date.now()}`, 'utf-8'));
			} catch {
			}

			// Check if we have workspaces associated with this repo
			const uri = vscode.Uri.parse(url);
			const cachedWorkspaces: vscode.Uri[] | null = await gitAPI.getRepositoryWorkspace(uri);

			let folderToOpen: vscode.Uri | null = null;
			if (!cachedWorkspaces || (cachedWorkspaces && cachedWorkspaces.length > 1)) {
				const selectFolderItem: vscode.QuickPickItem & { uri?: vscode.Uri } = {
					label: 'Select Directory...',
					description: 'Choose a directory to open',
					uri: undefined
				};
				const cloneRepoItem: vscode.QuickPickItem & { uri?: vscode.Uri } = {
					label: 'Clone Repository and Open',
					description: 'Clone the repository to a new local folder and open it',
					uri: undefined
				};

				const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [selectFolderItem];
				items.push({
					label: '',
					kind: vscode.QuickPickItemKind.Separator
				});
				items.push(cloneRepoItem);

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select how to open the repository',
					ignoreFocusOut: true,
					title: 'Open Repository'
				});

				if (selected) {
					if (selected === selectFolderItem) {
						const selectedFolder = await vscode.window.showOpenDialog({
							canSelectFiles: false,
							canSelectFolders: true,
							canSelectMany: false,
							openLabel: 'Select Directory',
							title: 'Select directory to open'
						});
						if (selectedFolder && selectedFolder.length > 0) {
							folderToOpen = selectedFolder[0];
						}
					} else if (selected === cloneRepoItem) {
						folderToOpen = await gitAPI.clone(vscode.Uri.parse(url), { postCloneAction: 'none', ref: branch });
					}
				}
			} else {
				folderToOpen = cachedWorkspaces[0];
			}
			if (!folderToOpen) {
				return;
			}

			// Reuse the window if there are no folders open
			const forceReuseWindow = ((vscode.workspace.workspaceFile === undefined) && (vscode.workspace.workspaceFolders === undefined));
			vscode.commands.executeCommand('vscode.openFolder', folderToOpen, { forceReuseWindow });
			return;
		}

		this.openPendingSession();
	}

	public canHandleUri(uri: vscode.Uri): boolean {
		return Object.values(UriHandlerPaths).includes(uri.path as UriHandlerPaths);
	}

	/**
	 * Check for pending chat sessions that were saved before cloning and opening workspace.
	 * This should be called when the extension activates in a new workspace.
	 */
	public async openPendingSession(details?: {
		repo: Repository;
		branch: string;
		id: string;
		type: string;
	}): Promise<void> {
		let repository: Repository | undefined;
		let branchName: string = '';
		let prId: string = '';
		let type: string = '';
		if (!details) {
			const pendingSession = await this.waitAndGetGlobalState();
			if (!pendingSession) {
				return;
			}
			// Check if the pending session is recent (within 10 minutes)
			const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
			if (pendingSession.timestamp > tenMinutesAgo) {
				// Clear expired pending session
				const gitAPI = await this.waitForGitExtensionAPI(this._gitExtensionService);
				if (!gitAPI) {
					return;
				}
				repository = this._getAlreadyOpenWorkspace(gitAPI, pendingSession.url);
				branchName = pendingSession.branch;
				prId = pendingSession.id;
				type = pendingSession.type;
			} else {
				this._logService.warn('Found pending sessions but they have expired at ' + new Date(pendingSession.timestamp).toISOString());
			}
		} else {
			repository = details.repo;
			branchName = details.branch;
			prId = details.id;
			type = details.type;
		}
		// Return if we still don't have the details.
		if (!repository || !branchName || !prId || !type) {
			return;
		}

		await repository.fetch({ ref: branchName });
		const repoNwo = getGithubRepoIdFromFetchUrl(repository.rootUri.toString());
		const repoIds = await getRepoId(this._gitService);
		const repoId = repoIds?.filter(r => r.org === repoNwo?.org && r.repo === repoNwo?.repo);
		if (!repoId || repoId.length === 0) {
			return;
		}
		const pullRequests = await this._octoKitService.getOpenPullRequestsForUser(repoId[0].org, repoId[0].repo, { createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } });
		const pullRequest = pullRequests.find(pr => pr.id === prId);
		if (!pullRequest) {
			return;
		}
		const uri = vscode.Uri.from({ scheme: 'copilot-cloud-agent', path: '/' + pullRequest.number.toString() });
		await this._extensionContext.globalState.update(PENDING_CHAT_SESSION_STORAGE_KEY, undefined);
		await vscode.commands.executeCommand('vscode.open', uri);

	}

	private async waitForGitExtensionAPI(gitExtensionService: IGitExtensionService): Promise<API | undefined> {
		let timeout = 5000;
		let api = gitExtensionService.getExtensionApi();
		while (!api || api.state === 'uninitialized') {
			api = gitExtensionService.getExtensionApi();
			await new Promise(resolve => setTimeout(resolve, 100));
			timeout -= 100;
			if (timeout <= 0) {
				break;
			}
		}
		return api;
	}

	private _getAlreadyOpenWorkspace(gitApi: API, cloneUri: string): Repository | undefined {
		const normalizedCloneUri = this._normalizeGitUri(cloneUri);
		for (const repo of gitApi.repositories) {
			// Check all remotes for this repository
			if (repo.kind === 'repository') {
				const remotes = repo.state.remotes;
				for (const remote of remotes) {
					for (const url of remote.fetchUrl ? [remote.fetchUrl] : []) {
						const normalizedRemoteUri = this._normalizeGitUri(url);
						if (normalizedRemoteUri === normalizedCloneUri) {
							return repo;
						}
					}
				}
			}
		}

		return undefined;
	}

	private _normalizeGitUri(uri: string): string {
		return uri.toLowerCase()
			.replace(/\.git$/, '')
			// Normalize SSH shorthand to HTTPS for both github.com and ghe.com
			.replace(/^[\w\-]+@([\w.\-]+):/, 'https://$1/')
			// Strip the host prefix for github.com and ghe.com to get just owner/repo
			.replace(/^https:\/\/(?:[\w\-]+\.)*(?:github\.com|ghe\.com)\//, '')
			.replace(/\/$/, '');
	}
}