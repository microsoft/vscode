import * as vscode from "vscode";
import { AIClient } from "../ai/AIClient";
import { DiffEditorManager } from "../diff/DiffEditorManager";
import { Conversation } from "./Conversation";
import { DiffData } from "./DiffData";
import { PearAITemplate } from "./template/PearAITemplate";

export type CreateConversationResult =
	| {
			type: "success";
			conversation: Conversation;
			shouldImmediatelyAnswer: boolean;
	  }
	| {
			type: "unavailable";
			display?: undefined;
	  }
	| {
			type: "unavailable";
			display: "info" | "error";
			message: string;
	  };

export class ConversationType {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly source: "built-in" | "local-workspace" | "extension";
	readonly variables: PearAITemplate["variables"];

	private template: PearAITemplate;

	constructor({
		template,
		source,
	}: {
		template: PearAITemplate;
		source: ConversationType["source"];
	}) {
		this.template = template;

		this.id = template.id;
		this.label = template.label;
		this.description = template.description;
		this.source = source;
		this.variables = template.variables;
	}

	get tags(): PearAITemplate["tags"] {
		return this.template.tags;
	}

	async createConversation({
		conversationId,
		ai,
		updateChatPanel,
		initVariables,
		diffEditorManager,
	}: {
		conversationId: string;
		ai: AIClient;
		updateChatPanel: () => Promise<void>;
		initVariables: Record<string, unknown>;
		diffEditorManager: DiffEditorManager;
	}): Promise<CreateConversationResult> {
		return {
			type: "success",
			conversation: new Conversation({
				id: conversationId,
				initVariables,
				ai: ai,
				updateChatPanel,
				template: this.template,
				diffEditorManager,
				diffData: await this.getDiffData(),
			}),
			shouldImmediatelyAnswer: this.template.initialMessage != null,
		};
	}

	hasDiffCompletionHandler(): boolean {
		const template = this.template;
		return (
			template.initialMessage?.completionHandler?.type ===
				"active-editor-diff" ||
			template.response.completionHandler?.type === "active-editor-diff"
		);
	}

	async getDiffData(): Promise<undefined | DiffData> {
		if (!this.hasDiffCompletionHandler()) {
			return undefined;
		}

		const activeEditor = vscode.window.activeTextEditor;

		if (activeEditor == null) {
			throw new Error("active editor required");
		}

		const document = activeEditor.document;
		const range = activeEditor.selection;
		const selectedText = document.getText(range);

		if (selectedText.trim().length === 0) {
			throw new Error("no selection");
		}

		const filename = document.fileName.split("/").pop();

		if (filename == undefined) {
			throw new Error("no filename");
		}

		return {
			filename,
			language: document.languageId,
			selectedText,
			range,
			editor: activeEditor,
		};
	}
}
