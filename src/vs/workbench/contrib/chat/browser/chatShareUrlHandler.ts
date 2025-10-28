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
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { joinPath } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';

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
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRequestService private readonly requestService: IRequestService,
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

			if (chatUrl.startsWith('http://') || chatUrl.startsWith('https://')) {
				// It's a full URL - fetch the content
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
