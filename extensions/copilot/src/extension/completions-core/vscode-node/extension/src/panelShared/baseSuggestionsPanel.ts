/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationTokenSource,
	Disposable,
	Event,
	EventEmitter,
	TextDocument,
	Uri,
	WebviewPanel,
	WorkspaceEdit,
	commands,
	workspace,
} from 'vscode';
import { IVSCodeExtensionContext } from '../../../../../../platform/extContext/common/extensionContext';
import { debounce } from '../../../../../../util/common/debounce';
import { BasePanelCompletion, ISuggestionsPanel, PanelConfig } from './basePanelTypes';
import { Highlighter } from './highlighter';
import { getNonce, pluralize } from './utils';

//import { IPCitationDetail } from '#lib/citationManager';
interface IPCitationDetail {
	license: string;
	url: string;
}

export interface SuggestionsPanelManagerInterface {
	activeWebviewPanel: BaseSuggestionsPanel<BasePanelCompletion> | undefined;
	decrementPanelCount(): void;
}

export interface SolutionContent {
	htmlSnippet: string;
	citation?: { message: string; url: string };
	[key: string]: unknown; // Allow additional properties for panel-specific content
}

export interface BaseWebviewMessage {
	command: string;
}

interface AcceptSolutionMessage extends BaseWebviewMessage {
	command: 'acceptSolution';
	solutionIndex: number;
}

interface FocusSolutionMessage extends BaseWebviewMessage {
	command: 'focusSolution';
	solutionIndex: number;
}

interface SubmitFeedbackMessage extends BaseWebviewMessage {
	command: 'submitFeedback';
	solutionIndex: number;
	feedback: string;
}

interface RefreshMessage extends BaseWebviewMessage {
	command: 'refresh';
}

interface WebviewReadyMessage extends BaseWebviewMessage {
	command: 'webviewReady';
}

export type WebviewMessage =
	| AcceptSolutionMessage
	| FocusSolutionMessage
	| SubmitFeedbackMessage
	| RefreshMessage
	| WebviewReadyMessage;

export abstract class BaseSuggestionsPanel<TPanelCompletion extends BasePanelCompletion> implements ISuggestionsPanel {
	private _disposables: Disposable[] = [];
	#items: TPanelCompletion[] = [];
	#batchItems: TPanelCompletion[] = [];
	#percentage = 0;
	#highlighter: Thenable<Highlighter>;
	private _focusedSolution: TPanelCompletion | undefined;
	private _isDisposed: boolean = false;
	#documentUri: Uri;
	#cts = new CancellationTokenSource();

	private _onDidDispose = new EventEmitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	get cancellationToken() {
		return this.#cts.token;
	}

	constructor(
		readonly webviewPanel: WebviewPanel,
		document: TextDocument,
		protected suggestionsPanelManager: SuggestionsPanelManagerInterface,
		protected readonly config: PanelConfig,
		@IVSCodeExtensionContext protected readonly contextService: IVSCodeExtensionContext,
	) {
		webviewPanel.onDidDispose(() => this._dispose(), null, this._disposables);
		webviewPanel.webview.html = this._getWebviewContent();
		this.#documentUri = document.uri;

		this.#highlighter = Highlighter.create(document.languageId);

		workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.colorTheme')) {
				return this.render();
			}
		});

		webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
			// First lest the subclass handle custom messages
			if ((await this.handleCustomMessage(message)) === true) {
				return;
			}
			switch (message.command) {
				case 'focusSolution':
					this._focusedSolution = this.#items[message.solutionIndex];
					return;
				case 'webviewReady':
					// Send the config to the webview
					void this.postMessage({
						command: 'updateConfig',
						config: {
							renderingMode: this.config.renderingMode,
							shuffleSolutions: this.config.shuffleSolutions,
						},
					});
					return;
			}
		}, undefined);

		webviewPanel.onDidChangeViewState(e => {
			if (e.webviewPanel?.visible) {
				this.suggestionsPanelManager.activeWebviewPanel = this;
			}
		});
	}

	protected async handleCustomMessage(message: BaseWebviewMessage): Promise<boolean> {
		return Promise.resolve(false);
	}
	protected abstract renderSolutionContent(item: TPanelCompletion, baseContent: SolutionContent): SolutionContent;

	private _buildExtensionUri(...path: string[]): Uri {
		const extensionPath = Uri.joinPath(this.contextService.extensionUri, ...path);
		return this.webviewPanel.webview.asWebviewUri(extensionPath);
	}

	private _getWebviewContent() {
		const nonce = getNonce();
		const scriptUri = this._buildExtensionUri('dist', this.config.webviewScriptName);

		return `
		<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<meta
						http-equiv="Content-Security-Policy"
						content="default-src 'none'; font-src ${this.webviewPanel.webview.cspSource}; style-src 'unsafe-inline' ${this.webviewPanel.webview.cspSource}; script-src 'nonce-${nonce}';"
					/>
					<title>${this.config.panelTitle}</title>
					<style>
						.solutionHeading {
							margin-top: 40px;
						}
						pre:focus-visible {
							border: 1px solid var(--vscode-focusBorder);
							outline: none;
						}
						pre {
							margin-bottom: 6px;
							display: block;
							padding: 9.5px;
							line-height: 1.42857143;
							word-break: break-all;
							word-wrap: break-word;
							border: 1px solid #ccc;
							border-radius: 4px;
							border: 1px solid var(--vscode-notebook-cellBorderColor);
							white-space: pre-wrap;
							font-size: var(--vscode-editor-font-size);
						}
						pre.shiki {
							padding: 0.5em 0.7em;
							margin-top: 1em;
							margin-bottom: 1em;
							border-radius: 4px;
						}
						code {
							background-color: transparent;
						}
					</style>
				</head>
				<body>
					<h2>${this.config.panelTitle}</h2>
					<div id="loadingContainer" aria-live="assertive" aria-atomic="true">
						<label for="progress-bar">Loading suggestions:</label>
						<progress id="progress-bar" max="100" value="0"></progress>
					</div>
					<div id="solutionsContainer" aria-busy="true" aria-describedby="progress-bar"></div>
					<script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
				</body>
			</html>
		`;
	}

	onWorkDone({ percentage }: { percentage: number }) {
		this.#percentage = percentage;
		void this.render();
	}

	onItem(item: TPanelCompletion) {
		// If rendering mode is 'batch', we collect items and render them later
		// Otherwise, we render immediately
		if (this.config.renderingMode === 'batch') {
			this.#batchItems.push(item);
		} else {
			this.#items.push(item);
			void this.render();
		}
	}

	clearSolutions() {
		// Cancel any ongoing operations
		this.#cts.cancel();
		// Create a new cancellation token source for the next operation
		this.#cts = new CancellationTokenSource();

		// Clear all solutions and reset state
		this.#items = [];
		this.#batchItems = [];
		this._focusedSolution = undefined;
		this.#percentage = 0;
		void this.render();
	}

	onFinished() {
		this.#percentage = 100;

		// If we have batch items, add them to the main items list, shuffle if needed, and render
		if (this.#batchItems.length > 0) {
			this.#items.push(...this.#batchItems);

			if (this.config.shuffleSolutions) {
				this.#items = this.#items.sort(() => Math.random() - 0.5);
			}

			this.#batchItems = [];
		}

		void this.render();
	}

	protected async acceptSolution(solution: TPanelCompletion, closePanel: boolean = true) {
		if (this._isDisposed === false && solution?.range) {
			const edit = new WorkspaceEdit();
			edit.replace(this.#documentUri, solution.range, solution.insertText);
			await workspace.applyEdit(edit);
			this.#cts.cancel();
			if (closePanel) {
				await commands.executeCommand('workbench.action.closeActiveEditor');
			}
			await solution.postInsertionCallback();
		}
	}

	protected items(): TPanelCompletion[] {
		return this.#items;
	}

	async acceptFocusedSolution() {
		const solution = this._focusedSolution;
		if (solution) {
			return this.acceptSolution(solution);
		}
	}

	protected async renderSolutions() {
		const highlighter = await this.#highlighter;
		const content = this.#items.map(item => {
			const firstCitation = item.copilotAnnotations?.ip_code_citations?.[0];
			const details = firstCitation?.details.citations as IPCitationDetail[] | undefined;
			let renderedCitatation: { message: string; url: string } | undefined;
			if (details && details.length > 0) {
				const licensesSet = new Set(details.map(d => d.license));
				if (licensesSet.has('NOASSERTION')) {
					licensesSet.delete('NOASSERTION');
					licensesSet.add('unknown');
				}
				const allLicenses = Array.from(licensesSet).sort();
				const licenseString = allLicenses.length === 1 ? allLicenses[0] : `[${allLicenses.join(', ')}]`;
				renderedCitatation = {
					message: `Similar code with ${pluralize(allLicenses.length, 'license type')} ${licenseString} detected.`,
					url: details[0].url,
				};
			}

			const baseContent = {
				htmlSnippet: highlighter.createSnippet(item.insertText.trim()),
				citation: renderedCitatation,
			};

			return this.renderSolutionContent(item, baseContent);
		});

		const message = this.createSolutionsMessage(content, this.#percentage);
		await this.postMessage(message);
	}

	// Subclasses must implement this to create their specific message format
	protected abstract createSolutionsMessage(content: SolutionContent[], percentage: number): unknown;

	render = debounce(10, () => this.renderSolutions());

	postMessage(message: unknown) {
		if (this._isDisposed === false) {
			return this.webviewPanel.webview.postMessage(message);
		}
	}

	private _dispose() {
		this._isDisposed = true;
		this._onDidDispose.fire();
		this.suggestionsPanelManager.decrementPanelCount();
		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
		this._onDidDispose.dispose();
	}
}
