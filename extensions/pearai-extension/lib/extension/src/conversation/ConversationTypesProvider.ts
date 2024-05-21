import * as vscode from "vscode";
import { ConversationType } from "./ConversationType";
import { loadConversationFromFile } from "./template/loadPearAITemplateFromFile";
import { loadPearAITemplatesFromWorkspace } from "./template/loadPearAITemplatesFromWorkspace";
import { parsePearAITemplate } from "./template/parsePearAITemplate";

export class ConversationTypesProvider {
	private readonly extensionUri: vscode.Uri;
	private readonly extensionTemplates: string[] = [];
	private readonly conversationTypes = new Map<string, ConversationType>();

	constructor({ extensionUri }: { extensionUri: vscode.Uri }) {
		this.extensionUri = extensionUri;
	}

	getConversationType(id: string) {
		return this.conversationTypes.get(id);
	}

	getConversationTypes() {
		return [...this.conversationTypes.values()];
	}

	registerExtensionTemplate({ template }: { template: string }) {
		this.extensionTemplates.push(template);
	}

	async loadConversationTypes() {
		this.conversationTypes.clear();

		await this.loadBuiltInTemplates();
		this.loadExtensionTemplates();
		await this.loadWorkspaceTemplates();
	}

	private async loadBuiltInTemplates() {
		const builtInConversationTypes = [
			await this.loadBuiltinTemplate("chat", "chat-en.rdt.md"),
			await this.loadBuiltinTemplate("task", "diagnose-errors.rdt.md"),
			await this.loadBuiltinTemplate("task", "document-code.rdt.md"),
			await this.loadBuiltinTemplate("task", "edit-code.rdt.md"),
			await this.loadBuiltinTemplate("task", "explain-code.rdt.md"),
			await this.loadBuiltinTemplate("task", "explain-code-w-context.rdt.md"),
			await this.loadBuiltinTemplate("task", "find-bugs.rdt.md"),
			await this.loadBuiltinTemplate("task", "generate-code.rdt.md"),
			await this.loadBuiltinTemplate("task", "generate-unit-test.rdt.md"),
			await this.loadBuiltinTemplate("task", "improve-readability.rdt.md"),
		];

		for (const conversationType of builtInConversationTypes) {
			this.conversationTypes.set(conversationType.id, conversationType);
		}
	}

	private async loadBuiltinTemplate(...path: string[]) {
		const fileUri = vscode.Uri.joinPath(this.extensionUri, "template", ...path);
		const result = await loadConversationFromFile(fileUri);

		if (result.type === "error") {
			throw new Error(
				`Failed to load chat template '${fileUri.toString()}': ${result.error}`
			);
		}

		return new ConversationType({
			template: result.template,
			source: "built-in",
		});
	}

	private loadExtensionTemplates() {
		for (const templateText of this.extensionTemplates) {
			try {
				const result = parsePearAITemplate(templateText);

				if (result.type === "error") {
					vscode.window.showErrorMessage("Could not load extension template");
					continue;
				}

				const template = result.template;
				this.conversationTypes.set(
					template.id,
					new ConversationType({
						template,
						source: "extension",
					})
				);
			} catch (error) {
				vscode.window.showErrorMessage("Could not load extension template");
			}
		}
	}

	private async loadWorkspaceTemplates() {
		const workspaceTemplateLoadingResults =
			await loadPearAITemplatesFromWorkspace();
		for (const loadingResult of workspaceTemplateLoadingResults) {
			if (loadingResult.type === "error") {
				vscode.window.showErrorMessage(
					`Error loading conversation template from ${loadingResult.file.path}: ${loadingResult.error}`
				);

				continue;
			}

			if (loadingResult.template.isEnabled === false) {
				continue;
			}

			const type = new ConversationType({
				template: loadingResult.template,
				source: "local-workspace",
			});
			this.conversationTypes.set(type.id, type);
		}
	}
}
