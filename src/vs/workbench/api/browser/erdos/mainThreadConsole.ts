import { IErdosConsoleInstance } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

export class MainThreadConsole {
	constructor(
		private readonly _console: IErdosConsoleInstance
	) {
	}

	getLanguageId(): string {
		return this._console.runtimeMetadata.languageId;
	}

	pasteText(text: string): void {
		this._console.pasteText(text);
	}
}

