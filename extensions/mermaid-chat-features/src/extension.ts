/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { registerChatSupport } from './chatOutputRenderer';
import { MermaidEditorManager } from './editorManager';
import { MermaidWebviewManager } from './webviewManager';


export function activate(context: vscode.ExtensionContext) {
	const webviewManager = new MermaidWebviewManager();

	const editorManager = new MermaidEditorManager(context.extensionUri, webviewManager);
	context.subscriptions.push(editorManager);

	// Register chat support
	context.subscriptions.push(registerChatSupport(context, webviewManager, editorManager));

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('_mermaid-chat.resetPanZoom', (ctx?: { mermaidWebviewId?: string }) => {
			webviewManager.resetPanZoom(ctx?.mermaidWebviewId);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('_mermaid-chat.copySource', (ctx?: { mermaidWebviewId?: string }) => {
			const webviewInfo = ctx?.mermaidWebviewId ? webviewManager.getWebview(ctx.mermaidWebviewId) : webviewManager.activeWebview;
			if (webviewInfo) {
				vscode.env.clipboard.writeText(webviewInfo.mermaidSource);
			}
		})
	);
}
