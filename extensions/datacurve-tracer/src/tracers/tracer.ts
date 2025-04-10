import { ITracer, IRecorder } from '../types';
import * as vscode from 'vscode';
import { ThoughtsTracker } from './thoughtsTracker';

export abstract class Tracer implements ITracer {
	protected traceRecorder: IRecorder;
	protected thoughtsTracker?: ThoughtsTracker;
	disposables: vscode.Disposable[];
	context: vscode.ExtensionContext;

	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker,
	) {
		this.context = context;
		this.traceRecorder = traceRecorder;
		this.thoughtsTracker = thoughtsTracker;
		this.disposables = [];
		this.initializeDisposables();
	}

	abstract initializeDisposables(): void;

	register(): void {
		for (const disposable of this.disposables) {
			this.context.subscriptions.push(disposable);
		}
	}

	/**
	 * Signal to the ThoughtsTracker that a countable action has occurred
	 * @param actionId The ID of the action that occurred
	 * @param document Optional document associated with the action
	 */
	protected signalAction(
		actionId: string,
		document?: vscode.TextDocument,
	): void {
		if (this.thoughtsTracker) {
			this.thoughtsTracker.recordAction(actionId, document);
		}
	}

	public dispose(): void {
		this.disposeDisposables();
	}

	protected disposeDisposables(): void {
		this.disposables.forEach((d) => d.dispose());
	}
}
