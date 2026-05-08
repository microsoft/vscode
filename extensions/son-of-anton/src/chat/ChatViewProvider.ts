/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatSession } from './ChatPanel';
import { LlmClient } from 'son-of-anton-core/llm/LlmClient';
import { ToolRegistry } from '../tools/registry';
import { AgentBridge } from './AgentBridge';
import { WorkspaceContextProvider } from './WorkspaceContextProvider';
import { CostReporter } from '../monitoring/CostReporter';
import { ConversationStore } from './ConversationStore';
import { CheckpointManager } from 'son-of-anton-core/checkpoint/CheckpointManager';
import { CredentialBroker } from 'son-of-anton-core/auth/CredentialBroker';
import { TaskBoardModel } from '../board/TaskBoardModel';
import { WriteSnapshotStore } from './WriteSnapshotStore';

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
		private readonly conversationStore: ConversationStore,
		private readonly llmClient: LlmClient,
		private readonly toolRegistry: ToolRegistry,
		private readonly agentBridge?: AgentBridge,
		private readonly workspaceContext?: WorkspaceContextProvider,
		private readonly costReporter?: CostReporter,
		private readonly checkpointManager?: CheckpointManager,
		private readonly credentialBroker?: CredentialBroker,
		private readonly taskBoardModel?: TaskBoardModel,
		private readonly writeSnapshotStore?: WriteSnapshotStore,
	) { }

	resolveWebviewView(view: vscode.WebviewView): void {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};

		// Pick the most recent conversation as the initial — the store handles
		// the empty-store case by minting a fresh conversation, so the chat
		// always boots with something to show. VS Code may dispose+recreate
		// this view (e.g. on a different sidebar tab being activated), and
		// we want subsequent reloads to also pick up the most recent state.
		const list = this.conversationStore.list();
		const initialConversationId = list.length > 0 ? list[0].id : undefined;

		this.session = new ChatSession(
			view.webview,
			this.context.extensionUri,
			this.conversationStore,
			this.llmClient,
			this.toolRegistry,
			this.agentBridge,
			this.workspaceContext,
			this.costReporter,
			initialConversationId,
			this.checkpointManager,
			this.context.secrets,
			this.credentialBroker,
			this.taskBoardModel,
			this.writeSnapshotStore,
		);

		view.onDidDispose(() => {
			this.session?.dispose();
			this.session = undefined;
		});
	}

	/**
	 * Switch the active session to the given conversation. Called by the
	 * `sota.openConversation` command when the user clicks an entry in the
	 * History sidebar; the host reveals the chat view first so the message
	 * has somewhere to land.
	 */
	openConversation(id: string): void {
		this.session?.switchConversation(id);
	}
}
