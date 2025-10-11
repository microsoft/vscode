/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export const AI_EDITOR_PANE_ID = 'workbench.editor.aiEditor';

export class AIEditorPane extends EditorPane {

	private root!: HTMLElement;
	private leftPane!: HTMLElement;
	private rightPane!: HTMLElement;
	private urlInput!: HTMLInputElement;
	private loadBtn!: HTMLButtonElement;
	private iframe!: HTMLIFrameElement;
	private contentArea!: HTMLElement;
	private apiKeyInput!: HTMLInputElement;
	private questionInput!: HTMLInputElement;
	private askBtn!: HTMLButtonElement;
	private answerArea!: HTMLElement;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super(AI_EDITOR_PANE_ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.renderBody(parent);
	}

	renderBody(container: HTMLElement): void {
		this.root = DOM.$('div', {
			class: 'ai-app-root',
			style: 'display:flex; width:100%; height:100%; overflow:hidden; background:var(--vscode-editor-background, #1e1e1e);'
		});

		this.leftPane = DOM.$('div', {
			class: 'ai-app-left',
			style: 'flex: 0 0 80%; height:100%; display:flex; flex-direction:column; gap:12px; padding:16px; box-sizing:border-box;'
		});

		this.rightPane = DOM.$('div', {
			class: 'ai-app-right',
			style: 'flex: 1 1 20%; height:100%; display:flex; flex-direction:column; gap:12px; padding:16px; box-sizing:border-box; border-left: 1px solid var(--vscode-panel-border, #3c3c3c); background:var(--vscode-sideBar-background, #252526);'
		});

		// Left pane - Web content section
		const webSectionTitle = DOM.$('div', {
			style: 'font-size:14px; font-weight:600; color:var(--vscode-foreground, #cccccc); margin-bottom:8px;'
		}, 'Web Content');

		const urlRow = DOM.$('div', {
			style: 'display:flex; gap:8px; align-items:center; margin-bottom:8px;'
		});

		this.urlInput = DOM.$('input', {
			type: 'text',
			placeholder: 'https://example.com',
			style: 'flex:1 1 auto; height:32px; padding:8px 12px; box-sizing:border-box; border:1px solid var(--vscode-input-border, #3c3c3c); background:var(--vscode-input-background, #3c3c3c); color:var(--vscode-input-foreground, #cccccc); border-radius:4px; font-size:13px;'
		}) as HTMLInputElement;

		this.loadBtn = DOM.$('button', {
			style: 'height:32px; padding:0 16px; cursor:pointer; background:var(--vscode-button-background, #0e639c); color:var(--vscode-button-foreground, #ffffff); border:1px solid var(--vscode-button-border, #0e639c); border-radius:4px; font-size:13px; font-weight:500; transition:background-color 0.2s;'
		}, 'Load') as HTMLButtonElement;

		const viewToggleBtn = DOM.$('button', {
			style: 'height:32px; padding:0 12px; cursor:pointer; background:var(--vscode-button-secondaryBackground, #3c3c3c); color:var(--vscode-button-secondaryForeground, #cccccc); border:1px solid var(--vscode-button-secondaryBorder, #3c3c3c); border-radius:4px; font-size:13px; font-weight:500; transition:background-color 0.2s;'
		}, 'Text View') as HTMLButtonElement;

		// Add hover effect for button
		this._register(DOM.addDisposableListener(this.loadBtn, 'mouseenter', () => {
			this.loadBtn.style.background = 'var(--vscode-button-hoverBackground, #1177bb)';
		}));
		this._register(DOM.addDisposableListener(this.loadBtn, 'mouseleave', () => {
			this.loadBtn.style.background = 'var(--vscode-button-background, #0e639c)';
		}));

		urlRow.appendChild(this.urlInput);
		urlRow.appendChild(this.loadBtn);
		urlRow.appendChild(viewToggleBtn);

		// Create iframe for web content display
		this.iframe = DOM.$('iframe', {
			style: 'flex:1 1 auto; border:1px solid var(--vscode-panel-border, #3c3c3c); border-radius:4px; background:var(--vscode-editor-background, #1e1e1e);',
			sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation'
		}) as HTMLIFrameElement;

		this.contentArea = DOM.$('div', {
			style: 'flex:1 1 auto; border:1px solid var(--vscode-panel-border, #3c3c3c); padding:12px; overflow:auto; white-space:pre-wrap; font-family:var(--vscode-editor-font-family, "Consolas", "Courier New", monospace); font-size:12px; line-height:1.4; background:var(--vscode-editor-background, #1e1e1e); color:var(--vscode-editor-foreground, #d4d4d4); border-radius:4px; display:none;'
		}, 'Web content will appear here...');

		this.leftPane.appendChild(webSectionTitle);
		this.leftPane.appendChild(urlRow);
		this.leftPane.appendChild(this.iframe);
		this.leftPane.appendChild(this.contentArea);

		// Right pane - AI Chat section
		const aiSectionTitle = DOM.$('div', {
			style: 'font-size:14px; font-weight:600; color:var(--vscode-foreground, #cccccc); margin-bottom:8px;'
		}, 'AI Assistant');

		this.answerArea = DOM.$('div', {
			style: 'flex:1 1 auto; overflow:auto; padding:12px; border:1px solid var(--vscode-panel-border, #3c3c3c); white-space:pre-wrap; background:var(--vscode-editor-background, #1e1e1e); color:var(--vscode-editor-foreground, #d4d4d4); border-radius:4px; font-size:12px; line-height:1.4; margin-bottom:12px;'
		}, 'AI responses will appear here. Enter your Gemini API key and ask a question!');

		const apiRow = DOM.$('div', {
			style: 'display:flex; flex-direction:column; gap:4px; margin-bottom:12px;'
		});

		this.apiKeyInput = DOM.$('input', {
			type: 'password',
			placeholder: 'Enter your Gemini API key...',
			style: 'height:32px; padding:8px 12px; box-sizing:border-box; border:1px solid var(--vscode-input-border, #3c3c3c); background:var(--vscode-input-background, #3c3c3c); color:var(--vscode-input-foreground, #cccccc); border-radius:4px; font-size:13px;'
		}) as HTMLInputElement;

		const apiKeyHelp = DOM.$('div', {
			style: 'font-size:11px; color:var(--vscode-descriptionForeground, #999999);'
		}, 'Get your free API key at: https://ai.google.dev/gemini-api/docs');

		apiRow.appendChild(this.apiKeyInput);
		apiRow.appendChild(apiKeyHelp);

		const askRow = DOM.$('div', {
			style: 'display:flex; gap:8px; align-items:center;'
		});

		this.questionInput = DOM.$('input', {
			type: 'text',
			placeholder: 'Ask about the website...',
			style: 'flex:1 1 auto; height:32px; padding:8px 12px; box-sizing:border-box; border:1px solid var(--vscode-input-border, #3c3c3c); background:var(--vscode-input-background, #3c3c3c); color:var(--vscode-input-foreground, #cccccc); border-radius:4px; font-size:13px;'
		}) as HTMLInputElement;

		this.askBtn = DOM.$('button', {
			style: 'height:32px; padding:0 16px; cursor:pointer; background:var(--vscode-button-background, #0e639c); color:var(--vscode-button-foreground, #ffffff); border:1px solid var(--vscode-button-border, #0e639c); border-radius:4px; font-size:13px; font-weight:500; transition:background-color 0.2s;'
		}, 'Ask') as HTMLButtonElement;

		// Add hover effect for ask button
		this._register(DOM.addDisposableListener(this.askBtn, 'mouseenter', () => {
			this.askBtn.style.background = 'var(--vscode-button-hoverBackground, #1177bb)';
		}));
		this._register(DOM.addDisposableListener(this.askBtn, 'mouseleave', () => {
			this.askBtn.style.background = 'var(--vscode-button-background, #0e639c)';
		}));

		askRow.appendChild(this.questionInput);
		askRow.appendChild(this.askBtn);

		this.rightPane.appendChild(aiSectionTitle);
		this.rightPane.appendChild(this.answerArea);
		this.rightPane.appendChild(apiRow);
		this.rightPane.appendChild(askRow);

		this.root.appendChild(this.leftPane);
		this.root.appendChild(this.rightPane);
		container.appendChild(this.root);

		this._register(DOM.addDisposableListener(this.loadBtn, 'click', () => this.handleLoadUrl()));
		this._register(DOM.addDisposableListener(this.urlInput, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { this.handleLoadUrl(); } }));
		this._register(DOM.addDisposableListener(this.askBtn, 'click', () => this.handleAskQuestion()));
		this._register(DOM.addDisposableListener(this.questionInput, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { this.handleAskQuestion(); } }));

		// Toggle between iframe and text view
		let isTextView = false;
		this._register(DOM.addDisposableListener(viewToggleBtn, 'click', () => {
			isTextView = !isTextView;
			if (isTextView) {
				this.iframe.style.display = 'none';
				this.contentArea.style.display = 'block';
				viewToggleBtn.textContent = 'Web View';
				// Load text content if not already loaded
				if (this.urlInput.value.trim()) {
					this.loadTextContent(this.urlInput.value.trim());
				}
			} else {
				this.iframe.style.display = 'block';
				this.contentArea.style.display = 'none';
				viewToggleBtn.textContent = 'Text View';
			}
		}));
	}

	layout(dimension: DOM.Dimension): void {
		if (this.root) {
			this.root.style.width = `${dimension.width}px`;
			this.root.style.height = `${dimension.height}px`;
		}
	}

	private handleLoadUrl(): void {
		const url = this.urlInput.value.trim();
		if (!url) { return; }
		try {
			const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
			this.tryNavigate(normalized);
		} catch {
			/* noop */
		}
	}

	private async tryNavigate(normalized: string): Promise<void> {
		// Always fetch content and display in text area
		await this.fallbackFetchIntoSrcdoc(normalized);
	}

	private async fallbackFetchIntoSrcdoc(url: string): Promise<void> {
		try {
			// Show iframe and hide text area
			this.iframe.style.display = 'block';
			this.contentArea.style.display = 'none';

			// Try direct iframe navigation first
			this.iframe.src = url;

			// Add load event listener
			this.iframe.onload = () => {
				this.showSuccessNotification('Web content loaded successfully!');
			};

			this.iframe.onerror = () => {
				// If iframe fails, fallback to text display
				this.iframe.style.display = 'none';
				this.contentArea.style.display = 'block';
				this.contentArea.textContent = 'Unable to load page in iframe. This might be due to X-Frame-Options or CSP restrictions.';
			};

		} catch (e) {
			// Fallback to text display
			this.iframe.style.display = 'none';
			this.contentArea.style.display = 'block';
			this.contentArea.textContent = `Unable to fetch page.\n${(e as Error).message || e}`;
		}
	}

	private async loadTextContent(url: string): Promise<void> {
		try {
			this.contentArea.textContent = 'Loading...';
			const context = await this.requestService.request({ url }, CancellationToken.None);
			if (context.res.statusCode && context.res.statusCode >= 400) {
				this.contentArea.textContent = `Failed to load: ${context.res.statusCode}`;
				return;
			}
			const text = await asText(context) ?? '';
			this.contentArea.textContent = text;
			this.showSuccessNotification('Text content loaded successfully!');
		} catch (e) {
			this.contentArea.textContent = `Unable to fetch page.\n${(e as Error).message || e}`;
		}
	}

	private showSuccessNotification(message: string): void {
		// Simple notification - you can enhance this with proper notification service
		const notification = DOM.$('div', {
			style: 'position:fixed; top:20px; right:20px; background:var(--vscode-notifications-background, #252526); color:var(--vscode-notifications-foreground, #cccccc); padding:12px; border-radius:4px; z-index:1000; border:1px solid var(--vscode-notifications-border, #3c3c3c);'
		}, message);
		DOM.getActiveWindow().document.body.appendChild(notification);
		setTimeout(() => {
			if (notification.parentNode) {
				notification.parentNode.removeChild(notification);
			}
		}, 3000);
	}

	private async handleAskQuestion(): Promise<void> {
		const apiKey = this.apiKeyInput.value.trim();
		const question = this.questionInput.value.trim();
		if (!question) { return; }
		this.answerArea.textContent = 'Thinking...';
		const websiteContext = this.urlInput.value.trim();
		const answer = await this.queryLLMPlaceholder(apiKey, websiteContext, question);
		this.answerArea.textContent = answer;
	}

	private async queryLLMPlaceholder(apiKey: string, websiteContext: string, question: string): Promise<string> {
		if (!apiKey) {
			return 'Please enter your Gemini API key to use the AI assistant.';
		}

		try {
			// Get website content if available
			let contextText = '';
			if (websiteContext) {
				try {
					const context = await this.requestService.request({ url: websiteContext }, CancellationToken.None);
					if (context.res.statusCode && context.res.statusCode < 400) {
						const text = await asText(context) ?? '';
						// Extract text content (remove HTML tags)
						contextText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
						// Limit context length
						if (contextText.length > 2000) {
							contextText = contextText.substring(0, 2000) + '...';
						}
					}
				} catch (e) {
					// Ignore context fetch errors
				}
			}

			// Prepare prompt
			const prompt = contextText
				? `Based on the following website content, please answer the question:\n\nWebsite: ${websiteContext}\nContent: ${contextText}\n\nQuestion: ${question}`
				: `Please answer this question: ${question}`;

			// Call Gemini API
			const response = await this.callGeminiAPI(apiKey, prompt);
			return response;

		} catch (error) {
			return `Error calling Gemini API: ${(error as Error).message}`;
		}
	}

	private async callGeminiAPI(apiKey: string, prompt: string): Promise<string> {
		const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
		
		const requestBody = {
			contents: [
				{
					parts: [
						{
							text: prompt
						}
					]
				}
			],
			generationConfig: {
				temperature: 0.7,
				topK: 40,
				topP: 0.95,
				maxOutputTokens: 1024,
			},
			safetySettings: [
				{
					category: "HARM_CATEGORY_HARASSMENT",
					threshold: "BLOCK_MEDIUM_AND_ABOVE"
				},
				{
					category: "HARM_CATEGORY_HATE_SPEECH",
					threshold: "BLOCK_MEDIUM_AND_ABOVE"
				},
				{
					category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
					threshold: "BLOCK_MEDIUM_AND_ABOVE"
				},
				{
					category: "HARM_CATEGORY_DANGEROUS_CONTENT",
					threshold: "BLOCK_MEDIUM_AND_ABOVE"
				}
			]
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': apiKey
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorText = await response.text();
				let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
				try {
					const errorData = JSON.parse(errorText);
					errorMessage = errorData.error?.message || errorMessage;
				} catch (e) {
					// Use the text response if JSON parsing fails
					errorMessage = errorText || errorMessage;
				}
				throw new Error(errorMessage);
			}

			const data = await response.json();
			
			// Debug: Log the response structure
			console.log('Gemini API Response:', JSON.stringify(data, null, 2));
			
			// Check for blocked content
			if (data.candidates && data.candidates.length > 0) {
				const candidate = data.candidates[0];
				
				if (candidate.finishReason === 'SAFETY') {
					throw new Error('Response blocked by safety filters. Please try rephrasing your question.');
				}
				
				if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
					return candidate.content.parts[0].text;
				}
			}
			
			// Check for errors in response
			if (data.error) {
				throw new Error(`Gemini API Error: ${data.error.message || 'Unknown error'}`);
			}
			
			throw new Error('No valid response generated from Gemini API. Please check your API key and try again.');
			
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Network error: ${error}`);
		}
	}
}


