import * as vscode from "vscode";
import { AIClient } from "./ai/AIClient";
import { ApiKeyManager } from "./ai/ApiKeyManager";
import { ChatController } from "./chat/ChatController";
import { ChatModel } from "./chat/ChatModel";
import { ChatPanel } from "./chat/ChatPanel";
import { ConversationTypesProvider } from "./conversation/ConversationTypesProvider";
import { DiffEditorManager } from "./diff/DiffEditorManager";
import { indexRepository } from "./index/indexRepository";
import { getVSCodeLogLevel, LoggerUsingVSCodeOutput } from "./logger";

export const activate = async (context: vscode.ExtensionContext) => {
	const apiKeyManager = new ApiKeyManager({
		secretStorage: context.secrets,
	});

	const mainOutputChannel = vscode.window.createOutputChannel("PearAI");
	const indexOutputChannel = vscode.window.createOutputChannel("PearAI Index");

	const vscodeLogger = new LoggerUsingVSCodeOutput({
		outputChannel: mainOutputChannel,
		level: getVSCodeLogLevel(),
	});
	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("pearai.logger.level")) {
			vscodeLogger.setLevel(getVSCodeLogLevel());
		}
	});

	const hasOpenAIApiKey = await apiKeyManager.hasOpenAIApiKey();
	const chatPanel = new ChatPanel({
		extensionUri: context.extensionUri,
		apiKeyManager,
		hasOpenAIApiKey,
	});

	const chatModel = new ChatModel();

	const conversationTypesProvider = new ConversationTypesProvider({
		extensionUri: context.extensionUri,
	});

	await conversationTypesProvider.loadConversationTypes();

	const ai = new AIClient({
		apiKeyManager,
		logger: vscodeLogger,
	});

	const chatController = new ChatController({
		chatPanel,
		chatModel,
		ai,
		diffEditorManager: new DiffEditorManager({
			extensionUri: context.extensionUri,
		}),
		getConversationType(id: string) {
			return conversationTypesProvider.getConversationType(id);
		},
		basicChatTemplateId: "chat-en",
	});

	chatPanel.onDidReceiveMessage(
		chatController.receivePanelMessage.bind(chatController)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("pearai.chat", chatPanel),
		vscode.commands.registerCommand(
			"pearai.enterOpenAIApiKey",
			apiKeyManager.enterOpenAIApiKey.bind(apiKeyManager)
		),
		vscode.commands.registerCommand("pearai.clearOpenAIApiKey", async () => {
			await apiKeyManager.clearOpenAIApiKey();
			vscode.window.showInformationMessage("OpenAI API key cleared.");
		}),

		vscode.commands.registerCommand("pearai.startConversation", (templateId) =>
			chatController.createConversation(templateId)
		),

		vscode.commands.registerCommand("pearai.diagnoseErrors", () => {
			chatController.createConversation("diagnose-errors");
		}),
		vscode.commands.registerCommand("pearai.explainCode", () => {
			chatController.createConversation("explain-code");
		}),
		vscode.commands.registerCommand("pearai.findBugs", () => {
			chatController.createConversation("find-bugs");
		}),
		vscode.commands.registerCommand("pearai.generateCode", () => {
			chatController.createConversation("generate-code");
		}),
		vscode.commands.registerCommand("pearai.generateUnitTest", () => {
			chatController.createConversation("generate-unit-test");
		}),
		vscode.commands.registerCommand("pearai.startChat", () => {
			chatController.createConversation("chat-en");
		}),
		vscode.commands.registerCommand("pearai.editCode", () => {
			chatController.createConversation("edit-code");
		}),
		vscode.commands.registerCommand("pearai.touchBar.startChat", () => {
			chatController.createConversation("chat-en");
		}),
		vscode.commands.registerCommand("pearai.showChatPanel", async () => {
			await chatController.showChatPanel();
		}),
		vscode.commands.registerCommand("pearai.getStarted", async () => {
			await vscode.commands.executeCommand("workbench.action.openWalkthrough", {
				category: `pearai.pearai-extension#pearai`,
			});
		}),
		vscode.commands.registerCommand("pearai.reloadTemplates", async () => {
			await conversationTypesProvider.loadConversationTypes();
			vscode.window.showInformationMessage("PearAI templates reloaded.");
		}),

		vscode.commands.registerCommand("pearai.showLogs", () => {
			mainOutputChannel.show(true);
		}),

		vscode.commands.registerCommand("pearai.indexRepository", () => {
			indexRepository({
				ai: ai,
				outputChannel: indexOutputChannel,
			});
		})
	);

	return Object.freeze({
		async registerTemplate({ template }: { template: string }) {
			conversationTypesProvider.registerExtensionTemplate({ template });
			await conversationTypesProvider.loadConversationTypes();
		},
	});
};

export const deactivate = async () => {
	// noop
};
