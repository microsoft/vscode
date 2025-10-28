/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatEditorOptions } from './chatEditor.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { isExportableSessionData } from '../common/chatModel.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

// Parse GitHub URL to extract repository information
// Expected format: https://github.com/{owner}/{repo}/blob/{branch}/{path}
// Or: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
interface IGitHubInfo {
	owner: string;
	repo: string;
	branch: string;
	path: string;
	rawUrl: string;
}

function parseGitHubUrl(url: string): IGitHubInfo | null {
	try {
		const uri = URI.parse(url);
		
		// Handle raw.githubusercontent.com URLs
		if (uri.authority === 'raw.githubusercontent.com') {
			const parts = uri.path.split('/').filter(p => p);
			if (parts.length >= 3) {
				const owner = parts[0];
				const repo = parts[1];
				const branch = parts[2];
				const path = parts.slice(3).join('/');
				return {
					owner,
					repo,
					branch,
					path,
					rawUrl: url
				};
			}
		}
		
		// Handle github.com/blob URLs
		if (uri.authority === 'github.com') {
			const parts = uri.path.split('/').filter(p => p);
			if (parts.length >= 4 && parts[2] === 'blob') {
				const owner = parts[0];
				const repo = parts[1];
				const branch = parts[3];
				const path = parts.slice(4).join('/');
				const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
				return {
					owner,
					repo,
					branch,
					path,
					rawUrl
				};
			}
		}
		
		return null;
	} catch {
		return null;
	}
}

export class ChatShareUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.chatShareUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IRequestService private readonly requestService: IRequestService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		// Handle vscode://github.copilot-chat?open-chat=<URL>
		if (uri.authority !== 'github.copilot-chat') {
			return false;
		}

		const query = decodeURIComponent(uri.query);
		if (!query || !query.startsWith('open-chat=')) {
			return false;
		}

		const chatUrl = query.substring('open-chat='.length);
		
		try {
			// Verify we're in a workspace
			const workspace = this.workspaceContextService.getWorkspace();
			if (!workspace.folders || workspace.folders.length === 0) {
				this.notificationService.error(localize('chat.share.open.noWorkspace', "Opening a shared chat requires an open workspace"));
				return true;
			}

			const workspaceFolder = workspace.folders[0];

			// Parse the chat URL - it could be a relative path or a full GitHub URL
			let chatContent: string;
			let requiresBranchSwitch: string | null = null;

			// Try to parse as GitHub URL
			const githubInfo = parseGitHubUrl(chatUrl);
			
			if (githubInfo) {
				// It's a GitHub URL - fetch the content from the raw URL
				const result = await this.requestService.request({ type: 'GET', url: githubInfo.rawUrl }, CancellationToken.None);
				if (result.res.statusCode !== 200) {
					this.notificationService.error(localize('chat.share.open.fetchFailed', "Failed to fetch chat from URL: {0}", chatUrl));
					return true;
				}
				const responseData = await streamToBuffer(result.stream);
				chatContent = responseData.toString();
				
				// Check if we need to switch branches
				// For now, we'll just note the required branch
				requiresBranchSwitch = githubInfo.branch;
			} else if (chatUrl.startsWith('http://') || chatUrl.startsWith('https://')) {
				// It's a full URL but not a GitHub URL - just fetch it
				const result = await this.requestService.request({ type: 'GET', url: chatUrl }, CancellationToken.None);
				if (result.res.statusCode !== 200) {
					this.notificationService.error(localize('chat.share.open.fetchFailed', "Failed to fetch chat from URL: {0}", chatUrl));
					return true;
				}
				const responseData = await streamToBuffer(result.stream);
				chatContent = responseData.toString();
			} else {
				// It's a relative path - read from the workspace
				const chatFilePath = joinPath(workspaceFolder.uri, chatUrl);
				
				// Check if file exists
				try {
					const stat = await this.fileService.resolve(chatFilePath);
					if (!stat) {
						this.notificationService.error(localize('chat.share.open.notFound', "Chat file not found: {0}", chatUrl));
						return true;
					}
				} catch (err) {
					this.notificationService.error(localize('chat.share.open.notFound', "Chat file not found: {0}", chatUrl));
					return true;
				}

				const content = await this.fileService.readFile(chatFilePath);
				chatContent = content.value.toString();
			}

			// If branch switching is required, ask the user
			if (requiresBranchSwitch) {
				const switchBranch = localize('chat.share.switchBranch', "Switch Branch");
				const continueAnyway = localize('chat.share.continueAnyway', "Continue Anyway");
				const selection = await this.dialogService.show(
					2, // Info
					localize('chat.share.branchMismatch', "This chat was shared from branch '{0}'. Would you like to switch to that branch?", requiresBranchSwitch),
					[switchBranch, continueAnyway]
				);
				
				if (selection.choice === 0) {
					// User wants to switch branches
					try {
						await this.commandService.executeCommand('git.checkout', requiresBranchSwitch);
					} catch (err) {
						this.notificationService.warn(localize('chat.share.branchSwitchFailed', "Failed to switch to branch '{0}': {1}", requiresBranchSwitch, String(err)));
					}
				}
			}

			// Parse and validate the chat data
			const data = JSON.parse(chatContent);
			if (!isExportableSessionData(data)) {
				this.notificationService.error(localize('chat.share.open.invalidData', "Invalid chat session data"));
				return true;
			}

			// Import the chat
			const options: IChatEditorOptions = { target: { data }, pinned: true };
			await this.editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options });

			// Reload the window to ensure chat properly displays
			await this.hostService.reload();

			return true;

		} catch (error) {
			this.notificationService.error(localize('chat.share.open.error', "Error opening shared chat: {0}", String(error)));
			return true;
		}
	}
}
