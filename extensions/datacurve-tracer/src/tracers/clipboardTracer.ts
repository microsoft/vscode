import * as vscode from 'vscode';
import { IRecorder } from '../types';
import { Tracer } from './tracer';
import { ThoughtsTracker } from './thoughtsTracker';
import { createClipboardCopyAction } from '../utils/typedTracers';

/**
 * ClipboardTracer class is responsible for recording clipboard related events.
 */
export class ClipboardTracer extends Tracer {
	private previousClipboardText: string;
	/**
	 * Poll interval for clipboard content in milliseconds
	 */
	private pollInterval: number;

	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker,
	) {
		super(context, traceRecorder, thoughtsTracker);
		this.previousClipboardText = '';

		// Load configuration settings
		const config = vscode.workspace.getConfiguration(
			'datacurve-tracer.clipboard',
		);
		this.pollInterval = config.get('pollInterval', 1000);

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(
			(e) => {
				if (e.affectsConfiguration('datacurve-tracer.clipboard')) {
					const newConfig = vscode.workspace.getConfiguration(
						'datacurve-tracer.clipboard',
					);
					this.pollInterval = newConfig.get('pollInterval', 1000);
				}
			},
			null,
			this.disposables,
		);

		this.pollClipboard();
	}

	initializeDisposables() {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) =>
				this.onDidChangeTextDocument(event),
			),
		);
	}

	// This method is called whenever the text in a document is changed.
	// The idea is that if the clipboard text is pasted into a document, this event will be triggered.
	private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
		if (
			event.contentChanges.length > 0 &&
			event.contentChanges[0].text === this.previousClipboardText
		) {
			this.traceRecorder.record({
				action_id: 'clipboardPaste',
				event: { text: event.contentChanges[0].text },
			});
		}
	}

	/**
	 * Polls the clipboard for content
	 */
	private pollClipboard(): void {
		try {
			vscode.env.clipboard.readText().then((text) => {
				if (text && text !== this.previousClipboardText) {
					this.previousClipboardText = text;
					// Use the createClipboardCopyAction helper to create a properly typed action
					const action = createClipboardCopyAction(text);
					this.traceRecorder.record(action);
				}
				setTimeout(() => this.pollClipboard(), this.pollInterval);
			});
		} catch (error) {
			console.error('Error polling clipboard:', error);
			setTimeout(() => this.pollClipboard(), this.pollInterval);
		}
	}

	dispose(): void {
		this.disposeDisposables();
		this.traceRecorder.dispose();
	}
}
