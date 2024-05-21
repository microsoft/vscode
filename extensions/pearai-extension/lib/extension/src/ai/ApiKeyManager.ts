import * as vscode from "vscode";

const OPEN_AI_API_KEY_SECRET_KEY = "pearai.openAI.apiKey";

type UpdateEvent = "clear key" | "set key";

export class ApiKeyManager {
	private readonly secretStorage: vscode.SecretStorage;
	private messageEmitter = new vscode.EventEmitter<UpdateEvent>();
	private messageHandler: vscode.Disposable | undefined;

	constructor({ secretStorage }: { secretStorage: vscode.SecretStorage }) {
		this.secretStorage = secretStorage;
	}

	async clearOpenAIApiKey(): Promise<void> {
		await this.secretStorage.delete(OPEN_AI_API_KEY_SECRET_KEY);
		this.messageEmitter.fire("clear key");
	}

	async getOpenAIApiKey(): Promise<string | undefined> {
		return this.secretStorage.get(OPEN_AI_API_KEY_SECRET_KEY);
	}

	async hasOpenAIApiKey(): Promise<boolean> {
		const key = await this.getOpenAIApiKey();
		return key !== undefined;
	}

	onUpdate: vscode.Event<UpdateEvent> = (listener, thisArg, disposables) => {
		// We only want to execute the last listener to apply the latest change.
		this.messageHandler?.dispose();
		this.messageHandler = this.messageEmitter.event(
			listener,
			thisArg,
			disposables
		);
		return this.messageHandler;
	};

	private async storeApiKey(apiKey: string): Promise<void> {
		return this.secretStorage.store(OPEN_AI_API_KEY_SECRET_KEY, apiKey);
	}

	async enterOpenAIApiKey() {
		await this.clearOpenAIApiKey();

		const apiKey = await vscode.window.showInputBox({
			title: "Enter your Open AI API key",
			ignoreFocusOut: true,
			placeHolder: "Open AI API key",
		});

		if (apiKey == null) {
			return; // user aborted input
		}

		await this.storeApiKey(apiKey);

		this.messageEmitter.fire("set key");
		vscode.window.showInformationMessage("OpenAI API key stored.");
	}
}
