/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { localize } from '../../../../nls.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { FromWebviewMessage, IClickedDataUrlMessage } from '../../notebook/browser/view/renderers/webviewMessages.js';
import { IScopedRendererMessaging } from '../../notebook/common/notebookRendererMessagingService.js';
import { INotebookOutputWebview } from './notebookOutputWebviewService.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';
import { INotebookLoggingService } from '../../notebook/common/notebookLoggingService.js';

interface NotebookOutputWebviewOptions {
	readonly id: string;
	readonly sessionId: string;
	readonly webview: IOverlayWebview;
	rendererMessaging?: IScopedRendererMessaging;
}

export class NotebookOutputWebview extends Disposable implements INotebookOutputWebview {

	private readonly _onDidInitialize = this._register(new Emitter<void>());
	private readonly _onDidRender = this._register(new Emitter<void>);

	readonly id: string;
	readonly sessionId: string;
	readonly webview: IOverlayWebview;

	onDidInitialize = this._onDidInitialize.event;

	onDidRender = this._onDidRender.event;

	constructor(
		{
			id,
			sessionId,
			webview,
			rendererMessaging,
		}: NotebookOutputWebviewOptions,
		@IFileDialogService private _fileDialogService: IFileDialogService,
		@IFileService private _fileService: IFileService,
		@IWorkspaceContextService private _workspaceContextService: IWorkspaceContextService,
		@ILogService private _logService: ILogService,
		@INotebookLoggingService private _notebookLogService: INotebookLoggingService,
		@INotificationService private _notificationService: INotificationService,
	) {
		super();

		this._register(webview);

		this.id = id;
		this.sessionId = sessionId;
		this.webview = webview;

		if (rendererMessaging) {
			this._register(rendererMessaging);
			rendererMessaging.receiveMessageHandler = async (rendererId, message) => {
				this.webview.postMessage({
					__vscode_notebook_message: true,
					type: 'customRendererMessage',
					rendererId,
					message,
				});

				return true;
			};
		}

		this._register(webview.onMessage(e => {
			const data: FromWebviewMessage | { readonly __vscode_notebook_message: undefined } = e.message;

			if (!data.__vscode_notebook_message) {
				return;
			}

			switch (data.type) {
				case 'initialized':
					this._onDidInitialize.fire();
					break;
				case 'customRendererMessage':
					rendererMessaging?.postMessage(data.rendererId, data.message);
					break;
				case 'logRendererDebugMessage':
					this._notebookLogService.debug(
						'NotebookOutputWebview',
						`${this.sessionId} (${this.id}) - ` +
							data.message +
							data.data ? ' ' + JSON.stringify(data.data, null, 4) : ''
					);
					break;
				case 'erdosRenderComplete':
					this._onDidRender.fire();
					break;
				case 'clicked-data-url':
					this._downloadData(data);
					break;
			}

		}));
	}

	private async _downloadData(payload: IClickedDataUrlMessage): Promise<void> {
		try {

			if (typeof payload.data !== 'string') {
				return;
			}

			const [splitStart, splitData] = payload.data.split(';base64,');
			if (!splitData || !splitStart) {
				return;
			}

			const defaultDir = this._workspaceContextService.getWorkspace().folders[0]?.uri ?? await this._fileDialogService.defaultFilePath();
			let defaultName: string;
			if (payload.downloadName) {
				defaultName = payload.downloadName;
			} else {
				const mimeType = splitStart.replace(/^data:/, '');
				const candidateExtension = mimeType && getExtensionForMimeType(mimeType);
				defaultName = candidateExtension ? `download${candidateExtension}` : 'download';
			}

			const defaultUri = joinPath(defaultDir, defaultName);
			const newFileUri = await this._fileDialogService.showSaveDialog({
				defaultUri
			});
			if (!newFileUri) {
				return;
			}

			let buff: VSBuffer;
			try {
				buff = decodeBase64(splitData);
			} catch (e) {
				throw new Error(localize("base64DecodeError", "Failed to decode base64 data: {0}", e.message));
			}

			await this._fileService.writeFile(newFileUri, buff);
		} catch (error) {
			this._logService.error('Failed to download file', error);
			this._notificationService.error(
				localize('failedToDownloadFile', 'Failed to download file: {}', error.message)
			);
		}
	}
}