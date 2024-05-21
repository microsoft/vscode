import { webviewApi } from "@pearai/common";
import * as vscode from "vscode";
import { ApiKeyManager } from "../ai/ApiKeyManager";
import { WebviewContainer } from "../webview/WebviewContainer";
import { ChatModel } from "./ChatModel";

function getConfigSurfacePromptForOpenAIPlus(): boolean {
	return vscode.workspace
		.getConfiguration("pearai.openAI")
		.get<boolean>("surfacePromptForPlus", false);
}

export class ChatPanel implements vscode.WebviewViewProvider {
	public static readonly id = "pearai.chat";

	private readonly disposables: vscode.Disposable[] = [];

	private messageEmitter = new vscode.EventEmitter<unknown>();

	readonly onDidReceiveMessage = this.messageEmitter.event;

	private readonly extensionUri: vscode.Uri;

	private webviewPanel: WebviewContainer | undefined;
	private apiKeyManager: ApiKeyManager;

	private state: webviewApi.PanelState;

	constructor({
		extensionUri,
		apiKeyManager,
		hasOpenAIApiKey,
	}: {
		readonly extensionUri: vscode.Uri;
		apiKeyManager: ApiKeyManager;
		/** Needed since retrieving it is an async operation */
		hasOpenAIApiKey: boolean;
	}) {
		this.extensionUri = extensionUri;
		this.apiKeyManager = apiKeyManager;

		const surfacePromptForOpenAIPlus = getConfigSurfacePromptForOpenAIPlus();
		this.state = {
			type: "chat",
			selectedConversationId: undefined,
			conversations: [],
			hasOpenAIApiKey,
			surfacePromptForOpenAIPlus,
		};

		this.apiKeyManager.onUpdate(async () => {
			if (this.state?.type !== "chat") {
				return;
			}

			const hasOpenAIApiKey = await this.apiKeyManager.hasOpenAIApiKey();
			if (this.state.hasOpenAIApiKey === hasOpenAIApiKey) {
				return;
			}

			this.state.hasOpenAIApiKey = hasOpenAIApiKey;
			this.renderPanel();
		});
	}

	private async renderPanel() {
		return this.webviewPanel?.updateState(this.state);
	}

	async resolveWebviewView(webviewView: vscode.WebviewView) {
		this.webviewPanel = new WebviewContainer({
			panelId: "chat",
			isStateReloadingEnabled: false,
			webview: webviewView.webview,
			extensionUri: this.extensionUri,
		});

		const receiveMessageDisposable = this.webviewPanel.onDidReceiveMessage(
			(message: unknown) => {
				this.messageEmitter.fire(message);
			}
		);

		this.disposables.push(
			webviewView.onDidDispose(() => {
				receiveMessageDisposable.dispose();
				this.webviewPanel = undefined;
			})
		);

		this.disposables.push(
			webviewView.onDidChangeVisibility(async () => {
				if (webviewView.visible) {
					return this.renderPanel();
				}
			})
		);

		// not using await here, to avoid having an infinite load-in-progress indicator
		this.renderPanel();
	}

	async update(model: ChatModel) {
		const conversations: Array<webviewApi.Conversation> = [];
		for (const conversation of model.conversations) {
			conversations.push(await conversation.toWebviewConversation());
		}

		const surfacePromptForOpenAIPlus = getConfigSurfacePromptForOpenAIPlus();
		const hasOpenAIApiKey = await this.apiKeyManager.hasOpenAIApiKey();
		this.state = {
			type: "chat",
			selectedConversationId: model.selectedConversationId,
			conversations,
			hasOpenAIApiKey,
			surfacePromptForOpenAIPlus,
		};
		return this.renderPanel();
	}

	dispose() {
		this.disposables.forEach((disposable) => disposable.dispose());
	}
}
