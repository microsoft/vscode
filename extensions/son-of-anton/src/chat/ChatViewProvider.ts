/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatSession } from './ChatPanel';
import { LlmClient } from '../llm/LlmClient';
import { ToolRegistry } from '../tools/registry';
import { AgentBridge } from './AgentBridge';
import { WorkspaceContextProvider } from './WorkspaceContextProvider';

/**
 * Hosts the chat experience inside an activity-bar sidebar view container,
 * mirroring the placement and ergonomics users expect from a first-class chat
 * surface (rather than an editor-area panel).
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly VIEW_ID = 'sota.chatView';

	private session: ChatSession | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly llmClient: LlmClient,
		private readonly toolRegistry: ToolRegistry,
		private readonly agentBridge?: AgentBridge,
		private readonly workspaceContext?: WorkspaceContextProvider,
	) { }

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};

		this.session = new ChatSession(
			view.webview,
			this.context.extensionUri,
			this.context.workspaceState,
			this.llmClient,
			this.toolRegistry,
			this.agentBridge,
			this.workspaceContext,
		);

		view.onDidDispose(() => {
			this.session?.dispose();
			this.session = undefined;
		});
	}
}
