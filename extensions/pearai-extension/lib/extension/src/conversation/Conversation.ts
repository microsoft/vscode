import { webviewApi } from "@pearai/common";
import Handlebars from "handlebars";
import * as vscode from "vscode";
import { AIClient } from "../ai/AIClient";
import { DiffEditor } from "../diff/DiffEditor";
import { DiffEditorManager } from "../diff/DiffEditorManager";
import { DiffData } from "./DiffData";
import { resolveVariables } from "./input/resolveVariables";
import { executeRetrievalAugmentation } from "./retrieval-augmentation/executeRetrievalAugmentation";
import { Prompt, PearAITemplate } from "./template/PearAITemplate";

Handlebars.registerHelper({
	eq: (v1, v2) => v1 === v2,
	neq: (v1, v2) => v1 !== v2,
	lt: (v1, v2) => v1 < v2,
	gt: (v1, v2) => v1 > v2,
	lte: (v1, v2) => v1 <= v2,
	gte: (v1, v2) => v1 >= v2,
});

export class Conversation {
	readonly id: string;
	protected readonly ai: AIClient;
	protected state: webviewApi.MessageExchangeContent["state"];
	protected error: webviewApi.Error | undefined;
	protected readonly messages: webviewApi.Message[];
	protected readonly updateChatPanel: () => Promise<void>;

	protected readonly initVariables: Record<string, unknown>;

	private readonly template: PearAITemplate;

	private temporaryEditorContent: string | undefined;
	private temporaryEditorDocument: vscode.TextDocument | undefined;
	private temporaryEditor: vscode.TextEditor | undefined;

	private diffContent: string | undefined;
	private diffEditor: DiffEditor | undefined;
	private readonly diffData: DiffData | undefined;
	private readonly diffEditorManager: DiffEditorManager;

	constructor({
		id,
		initVariables,
		ai,
		updateChatPanel,
		template,
		diffEditorManager,
		diffData,
	}: {
		id: string;
		initVariables: Record<string, unknown>;
		ai: AIClient;
		updateChatPanel: () => Promise<void>;
		template: PearAITemplate;
		diffEditorManager: DiffEditorManager;
		diffData: DiffData | undefined;
	}) {
		this.id = id;
		this.ai = ai;
		this.updateChatPanel = updateChatPanel;
		this.messages = [];
		this.initVariables = initVariables;

		this.template = template;
		this.diffEditorManager = diffEditorManager;
		this.diffData = diffData;

		this.state =
			template.initialMessage == null
				? { type: "userCanReply" }
				: {
						type: "waitingForBotAnswer",
						botAction: template.initialMessage.placeholder ?? "Answering",
					};
	}

	async getTitle() {
		const header = this.template.header;

		try {
			const firstMessageContent = this.messages[0]?.content;

			if (
				header.useFirstMessageAsTitle === true &&
				firstMessageContent != null
			) {
				return firstMessageContent;
			}

			return await this.evaluateTemplate(header.title);
		} catch (error: unknown) {
			console.error(error);
			return header.title; // not evaluated
		}
	}

	isTitleMessage(): boolean {
		return this.template.header.useFirstMessageAsTitle ?? false
			? this.messages.length > 0
			: false;
	}

	getCodicon(): string {
		return this.template.header.icon.value;
	}

	async insertPromptIntoEditor(): Promise<void> {
		const prompt =
			this.messages[0] == null && this.template.initialMessage != null
				? this.template.initialMessage
				: this.template.response;
		const variables = await this.resolveVariablesAtMessageTime();
		const text = await this.evaluateTemplate(prompt.template, variables);
		const document = await vscode.workspace.openTextDocument({
			language: "markdown",
			content: text,
		});
		await vscode.window.showTextDocument(document);
	}

	async exportMarkdown(): Promise<void> {
		const document = await vscode.workspace.openTextDocument({
			language: "markdown",
			content: this.getMarkdownExport(),
		});
		await vscode.window.showTextDocument(document);
	}

	private getMarkdownExport(): string {
		return this.messages
			.flatMap(({ author, content }) => [
				author === "bot" ? "# Answer" : "# Question",
				content,
			])
			.join("\n\n");
	}

	private async resolveVariablesAtMessageTime() {
		return resolveVariables(this.template.variables, {
			time: "message",
			messages: this.messages,
		});
	}

	private async evaluateTemplate(
		template: string,
		variables?: Record<string, unknown>
	): Promise<string> {
		if (variables == null) {
			variables = await this.resolveVariablesAtMessageTime();
		}

		// special variable: temporaryEditorContent
		if (this.temporaryEditorContent != undefined) {
			variables.temporaryEditorContent = this.temporaryEditorContent;
		}

		return Handlebars.compile(template, {
			noEscape: true,
		})({
			...this.initVariables,
			...variables,
		});
	}

	private async executeChat() {
		try {
			const prompt =
				this.messages[0] == null && this.template.initialMessage != null
					? this.template.initialMessage
					: this.template.response;

			const variables = await this.resolveVariablesAtMessageTime();

			// if the prompt has a retrieval augmentation, execute it:
			const retrievalAugmentation = prompt.retrievalAugmentation;
			if (retrievalAugmentation != null) {
				variables[retrievalAugmentation.variableName] =
					await executeRetrievalAugmentation({
						retrievalAugmentation,
						variables,
						initVariables: this.initVariables,
						ai: this.ai,
					});
			}

			const stream = await this.ai.streamText({
				prompt: await this.evaluateTemplate(prompt.template, variables),
				maxTokens: prompt.maxTokens,
				stop: prompt.stop,
				temperature: prompt.temperature,
			});

			let responseUntilNow = "";
			for await (const chunk of stream) {
				responseUntilNow += chunk;
				this.handlePartialCompletion(responseUntilNow, prompt);
			}

			// handle full completion (to allow for cleanup):
			await this.handleCompletion(responseUntilNow, prompt);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			console.log(error);
			await this.setError(error?.message ?? "Unknown error");
		}
	}

	private async handlePartialCompletion(
		partialCompletion: string,
		prompt: Prompt
	) {
		const completionHandler = prompt.completionHandler ?? {
			type: "message",
		};

		const completionHandlerType = completionHandler.type;

		const trimmedCompletion = partialCompletion.trim();

		switch (completionHandlerType) {
			case "update-temporary-editor": {
				this.temporaryEditorContent = trimmedCompletion;

				const language = completionHandler.language;

				await this.updateTemporaryEditor(
					language != null ? await this.evaluateTemplate(language) : undefined
				);
				break;
			}
			case "active-editor-diff": {
				this.diffContent = trimmedCompletion;

				await this.updateDiff();
				break;
			}
			case "message": {
				await this.updatePartialBotMessage({
					content: trimmedCompletion,
				});
				break;
			}
			default: {
				const exhaustiveCheck: never = completionHandlerType;
				throw new Error(`unsupported property: ${exhaustiveCheck}`);
			}
		}
	}

	private async handleCompletion(completionContent: string, prompt: Prompt) {
		const completionHandler = prompt.completionHandler ?? {
			type: "message",
		};

		const completionHandlerType = completionHandler.type;
		const trimmedCompletion = completionContent.trim();

		switch (completionHandlerType) {
			case "update-temporary-editor": {
				this.temporaryEditorContent = trimmedCompletion;

				await this.addBotMessage({
					content: completionHandler.botMessage,
				});

				const language = completionHandler.language;

				await this.updateTemporaryEditor(
					language != null ? await this.evaluateTemplate(language) : undefined
				);
				break;
			}
			case "active-editor-diff": {
				this.diffContent = trimmedCompletion;

				await this.addBotMessage({
					content: "Edit generated",
					responsePlaceholder: "Describe how you want to change the code…",
				});

				await this.updateDiff();
				break;
			}
			case "message": {
				await this.addBotMessage({
					content: trimmedCompletion,
				});
				break;
			}
			default: {
				const exhaustiveCheck: never = completionHandlerType;
				throw new Error(`unsupported property: ${exhaustiveCheck}`);
			}
		}
	}

	private async updateTemporaryEditor(language: string | undefined) {
		const temporaryEditorContent = this.temporaryEditorContent;

		if (temporaryEditorContent == undefined) {
			return;
		}

		// introduce local variable to ensure that testDocument is defined:
		const temporaryEditorDocument =
			this.temporaryEditorDocument ??
			(await vscode.workspace.openTextDocument({
				language,
				content: temporaryEditorContent,
			}));

		this.temporaryEditorDocument = temporaryEditorDocument;

		if (this.temporaryEditor == undefined) {
			this.temporaryEditor = await vscode.window.showTextDocument(
				temporaryEditorDocument
			);
		} else {
			const currentText = this.temporaryEditor.document.getText();

			let commonPrefix = 0;
			for (let i = 0; i < currentText.length; i++) {
				if (currentText[i] !== temporaryEditorContent[i]) {
					break;
				}
				commonPrefix++;
			}

			this.temporaryEditor.edit((edit: vscode.TextEditorEdit) => {
				edit.replace(
					new vscode.Range(
						temporaryEditorDocument.positionAt(commonPrefix),
						temporaryEditorDocument.positionAt(
							temporaryEditorDocument.getText().length
						)
					),
					temporaryEditorContent.substring(commonPrefix)
				);
			});
		}
	}

	private async updateDiff() {
		const editContent = this.diffContent;
		const diffData = this.diffData;

		if (editContent == undefined || diffData == undefined) {
			return;
		}

		// edit the file content with the editContent:
		const document = diffData.editor.document;
		const originalContent = document.getText();
		const prefix = originalContent.substring(
			0,
			document.offsetAt(diffData.range.start)
		);
		const suffix = originalContent.substring(
			document.offsetAt(diffData.range.end)
		);

		// calculate the minimum number of leading whitespace characters per line in the selected text:
		const minLeadingWhitespace = diffData.selectedText
			.split("\n")
			.map((line) => line.match(/^\s*/)?.[0] ?? "")
			.filter((line) => line.length > 0)
			.reduce((min, line) => Math.min(min, line.length), Infinity);

		// calculate the minimum number of leading whitespace characters per line in the new text:
		const minLeadingWhitespaceNew = editContent
			.split("\n")
			.map((line) => line.match(/^\s*/)?.[0] ?? "")
			.filter((line) => line.length > 0)
			.reduce((min, line) => Math.min(min, line.length), Infinity);

		// add leading whitespace to each line in the new text to match the original text:
		const editContentWithAdjustedWhitespace = editContent
			.split("\n")
			.map((line) => {
				const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
				const relativeIndent =
					leadingWhitespace.length - minLeadingWhitespaceNew;
				const newIndent = Math.max(0, minLeadingWhitespace + relativeIndent);
				return (
					(newIndent < Infinity ? " ".repeat(newIndent) : "") +
					line.substring(leadingWhitespace.length)
				);
			})
			.join("\n");

		// diff the original file content with the edited file content:
		const editedFileContent = `${prefix}${editContentWithAdjustedWhitespace}${suffix}`;

		if (this.diffEditor == undefined) {
			this.diffEditor = this.diffEditorManager.createDiffEditor({
				title: `${this.template.label} (${diffData.filename})`,
				editorColumn: diffData.editor.viewColumn ?? vscode.ViewColumn.One,
				conversationId: this.id,
			});
		}

		this.diffEditor.onDidReceiveMessage(async (rawMessage) => {
			const message = webviewApi.outgoingMessageSchema.parse(rawMessage);

			if (message.type === "reportError") {
				this.setError(message.error);
				return;
			}

			if (message.type !== "applyDiff") {
				return;
			}

			const edit = new vscode.WorkspaceEdit();
			edit.replace(
				document.uri,
				diffData.range,
				editContentWithAdjustedWhitespace
			);
			await vscode.workspace.applyEdit(edit);

			const tabGroups = vscode.window.tabGroups;
			const allTabs: vscode.Tab[] = tabGroups.all
				.map((tabGroup) => tabGroup.tabs)
				.flat();

			const tab = allTabs.find((tab) => {
				return (
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(tab.input as any).viewType ===
					`mainThreadWebview-pearai.diff.${this.id}`
				);
			});

			if (tab != undefined) {
				await tabGroups.close(tab);
			}

			this.diffEditor = undefined;
		});

		await this.diffEditor.updateDiff({
			oldCode: originalContent,
			newCode: editedFileContent,
			languageId: document.languageId,
		});
	}

	async retry() {
		this.state = { type: "waitingForBotAnswer" };
		await this.dismissError();

		await this.executeChat();
	}

	async answer(userMessage?: string) {
		if (userMessage != undefined) {
			await this.addUserMessage({ content: userMessage });
		}

		await this.executeChat();
	}

	protected async addUserMessage({
		content,
		botAction,
	}: {
		content: string;
		botAction?: string;
	}) {
		this.messages.push({ author: "user", content });
		this.state = { type: "waitingForBotAnswer", botAction };
		await this.updateChatPanel();
	}

	protected async addBotMessage({
		content,
		responsePlaceholder,
	}: {
		content: string;
		responsePlaceholder?: string;
	}) {
		this.messages.push({ author: "bot", content });
		this.state = { type: "userCanReply", responsePlaceholder };
		await this.updateChatPanel();
	}

	protected async updatePartialBotMessage({ content }: { content: string }) {
		this.state = { type: "botAnswerStreaming", partialAnswer: content };
		await this.updateChatPanel();
	}

	private async setError(error: webviewApi.Error) {
		this.error = error;
		await this.updateChatPanel();
	}

	async dismissError() {
		this.error = undefined;
		await this.updateChatPanel();
	}

	async toWebviewConversation(): Promise<webviewApi.Conversation> {
		const chatInterface = this.template.chatInterface ?? "message-exchange";

		return {
			id: this.id,
			header: {
				title: await this.getTitle(),
				isTitleMessage: this.isTitleMessage(),
				codicon: this.getCodicon(),
			},
			content:
				chatInterface === "message-exchange"
					? {
							type: "messageExchange",
							messages: this.isTitleMessage()
								? this.messages.slice(1)
								: this.messages,
							state: this.state,
							error: this.error,
						}
					: {
							type: "instructionRefinement",
							instruction: "", // TODO last user message?
							state: this.refinementInstructionState(),
							error: this.error,
						},
		};
	}

	private refinementInstructionState(): webviewApi.InstructionRefinementContent["state"] {
		const { type } = this.state;
		switch (type) {
			case "botAnswerStreaming":
			case "waitingForBotAnswer":
				return {
					type: "waitingForBotAnswer",
				};

			case "userCanReply":
				return {
					type: "userCanRefineInstruction",
				};

			default: {
				const exhaustiveCheck: never = type;
				throw new Error(`unsupported type: ${exhaustiveCheck}`);
			}
		}
	}
}
