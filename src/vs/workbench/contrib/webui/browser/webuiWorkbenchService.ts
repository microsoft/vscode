/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebUIService, WebUIOptions } from '../../../../platform/webui/common/webuiService.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { WebUIMessage, IResponseMessage, IInitializeMessage } from '../common/webuiProtocol.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class WebUIWorkbenchService implements IWebUIService {
	readonly _serviceBrand: undefined;

	constructor(
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.logService.info('[WebUI] Service constructed');
	}

	async openChat(options?: WebUIOptions): Promise<void> {
		this.logService.info('[WebUI] openChat called');
		const endpoint = this.configurationService.getValue<string>('webui.endpoint') || 'http://localhost:3000';
		try {
			this.logService.info('[WebUI] Creating webview...');
			const webviewInput = this.webviewWorkbenchService.openWebview(
				{
					title: 'AI Chat',
					options: {
						retainContextWhenHidden: options?.retainContextWhenHidden ?? true,
						enableFindWidget: true
					},
					contentOptions: {
						allowScripts: true,
						localResourceRoots: [],
						enableCommandUris: true
					},
					extension: undefined
				},
				'chatWebview',
				'AI Chat',
				{ preserveFocus: false }
			);
			this.logService.info('[WebUI] Webview created successfully');

			webviewInput.webview.onMessage(async (e: any) => {
				this.logService.info('WebUIWorkbenchService: Received message', e);
				const message = e as WebUIMessage;
				switch (message.type) {
					case 'ready':
						try {
							const initMessage: IInitializeMessage = {
								type: 'initialize',
								payload: {
									version: '1.0.0',
									features: {
										commands: true
									}
								}
							};
							await webviewInput.webview.postMessage(initMessage);
						} catch (err) {
							console.error('Failed to send initialize message:', err);
						}
						break;
					case 'command':
						try {
							const { command, args } = message.payload;
							const result = await this.commandService.executeCommand(command, ...(args || []));
							const response: IResponseMessage = {
								type: 'response',
								requestId: message.requestId,
								payload: { result }
							};
							await webviewInput.webview.postMessage(response);
						} catch (err) {
							const errorResponse: IResponseMessage = {
								type: 'response',
								requestId: message.requestId,
								payload: { error: err.message }
							};
							await webviewInput.webview.postMessage(errorResponse);
						}
						break;
					case 'error':
						console.error('Webview error:', message.payload.message, message.payload.stack);
						break;
				}
			});

			this.logService.info('WebUIWorkbenchService: Setting HTML content');
			await webviewInput.webview.setHtml(`<!DOCTYPE html>
				<html>
					<head>
						<meta charset="UTF-8">
						<meta http-equiv="Content-Security-Policy" content="
							default-src 'none';
							script-src 'unsafe-inline' 'unsafe-eval';
							connect-src ${endpoint};
							frame-src ${endpoint};
							style-src 'unsafe-inline';">
						<meta name="viewport" content="width=device-width, initial-scale=1.0">
						<style>
							body, html {
								margin: 0;
								padding: 0;
								height: 100vh;
								overflow: hidden;
							}
							iframe {
								width: 100%;
								height: 100vh;
								border: none;
								display: block;
							}
						</style>
						<script>
							const vscode = acquireVsCodeApi();
							window.addEventListener('message', event => {
								vscode.postMessage(event.data);
							});
							vscode.postMessage({ type: 'ready' });
						</script>
					</head>
					<body>
						<iframe src="${endpoint}"></iframe>
					</body>
				</html>`);
			this.logService.info('WebUIWorkbenchService: HTML content set');
		} catch (error) {
			this.logService.error('[WebUI] Failed to create webview:', error);
			throw error;
		}
	}
}
