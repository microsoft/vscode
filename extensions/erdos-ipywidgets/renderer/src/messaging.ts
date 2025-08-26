import { RendererContext } from 'vscode-notebook-renderer';
import { Disposable } from 'vscode-notebook-renderer/events';
import { FromWebviewMessage, ToWebviewMessage } from '../../../../src/vs/workbench/services/languageRuntime/common/erdosIPyWidgetsWebviewMessages';

export class Messaging {
	constructor(private readonly _context: RendererContext<any>) { }

	postMessage(message: FromWebviewMessage): void {
		if (!this._context.postMessage) {
			throw new Error('Messaging is not supported in this context.');
		}
		this._context.postMessage(message);
	}

	onDidReceiveMessage(listener: (e: ToWebviewMessage) => any): Disposable {
		if (!this._context.onDidReceiveMessage) {
			throw new Error('Messaging is not supported in this context.');
		}
		return this._context.onDidReceiveMessage(listener as any);
	}
}

