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
import { INotificationService } from '../../../../platform/notification/common/notification.js';

export const AI_EDITOR_PANE_ID = 'workbench.editor.aiEditor';

// Safety category constants
const HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT';
const HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH';
const HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT';
const HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT';
const BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE';

export class AIEditorPane extends EditorPane {

	private root!: HTMLElement;
	private leftPane!: HTMLElement;
	private rightPane!: HTMLElement;
	private urlInput!: HTMLInputElement;
	private loadBtn!: HTMLButtonElement;
	private iframe!: HTMLIFrameElement;
	private webview!: HTMLElement;
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
		@INotificationService private readonly notificationService: INotificationService,
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


		// Add hover effect for button
		this._register(DOM.addDisposableListener(this.loadBtn, 'mouseenter', () => {
			this.loadBtn.style.background = 'var(--vscode-button-hoverBackground, #1177bb)';
		}));
		this._register(DOM.addDisposableListener(this.loadBtn, 'mouseleave', () => {
			this.loadBtn.style.background = 'var(--vscode-button-background, #0e639c)';
		}));

		urlRow.appendChild(this.urlInput);
		urlRow.appendChild(this.loadBtn);

		// Create iframe for web content display
		this.iframe = DOM.$('iframe', {
			style: 'flex:1 1 auto; border:1px solid var(--vscode-panel-border, #3c3c3c); border-radius:4px; background:var(--vscode-editor-background, #1e1e1e);',
			// Remove sandbox to allow full web functionality
			referrerPolicy: 'no-referrer-when-downgrade'
		}) as HTMLIFrameElement;

		// Create webview for better web content support (Electron only)
		this.webview = DOM.$('webview', {
			style: 'flex:1 1 auto; border:1px solid var(--vscode-panel-border, #3c3c3c); border-radius:4px; background:var(--vscode-editor-background, #1e1e1e); display:none;',
			nodeintegration: 'true',
			websecurity: 'false',
			allowpopups: 'true',
			disablewebsecurity: 'true',
			allowrunninginsecurecontent: 'true',
			experimentalFeatures: 'true'
		}) as HTMLElement;

		this.contentArea = DOM.$('div', {
			style: 'flex:1 1 auto; border:1px solid var(--vscode-panel-border, #3c3c3c); padding:12px; overflow:auto; white-space:pre-wrap; font-family:var(--vscode-editor-font-family, "Consolas", "Courier New", monospace); font-size:12px; line-height:1.4; background:var(--vscode-editor-background, #1e1e1e); color:var(--vscode-editor-foreground, #d4d4d4); border-radius:4px; display:none;'
		}, 'Web content will appear here...');

		this.leftPane.appendChild(webSectionTitle);
		this.leftPane.appendChild(urlRow);
		this.leftPane.appendChild(this.iframe);
		this.leftPane.appendChild(this.webview);
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

	}

	layout(dimension: DOM.Dimension): void {
		if (this.root) {
			this.root.style.width = `${dimension.width}px`;
			this.root.style.height = `${dimension.height}px`;
		}
	}

	private handleLoadUrl(): void {
		const url = this.urlInput.value.trim();
		if (!url) {
			this.showErrorNotification('Please enter a URL first');
			return;
		}
		try {
			const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
			this.loadWithAllMethods(normalized);
		} catch (e) {
			this.showErrorNotification(`Failed to load URL: ${(e as Error).message}`);
		}
	}

	private async loadWithAllMethods(url: string): Promise<void> {
		this.showSuccessNotification('Loading page with all available methods...');

		// Method 1: Try simple proxy first (most reliable)
		try {
			await this.trySimpleProxy(url);
			return;
		} catch (e) {
			console.log('Simple proxy failed, trying WebView...');
		}

		// Method 2: Try WebView (best for full functionality)
		try {
			await this.tryWebView(url);
			return;
		} catch (e) {
			console.log('WebView failed, trying fetch and inject...');
		}

		// Method 3: Try fetch and inject content (bypasses CSP completely)
		try {
			await this.tryFetchAndInject(url);
			return;
		} catch (e) {
			console.log('Fetch and inject failed, trying direct fetch...');
		}

		// Method 4: Try direct fetch without proxy
		try {
			await this.tryDirectFetch(url);
			return;
		} catch (e) {
			console.log('Direct fetch failed, trying iframe...');
		}

		// Method 5: Try iframe with different proxies
		try {
			await this.tryIframeWithProxies(url);
			return;
		} catch (e) {
			console.log('Iframe with proxies failed, trying direct...');
		}

		// Method 6: Try direct iframe
		try {
			await this.tryDirectIframe(url);
			return;
		} catch (e) {
			console.log('Direct iframe failed, trying text fallback...');
		}

		// Method 7: Fallback to text content
		this.showErrorNotification('All loading methods failed. Showing text content only.');
		await this.loadTextContent(url);
	}

	private async trySimpleProxy(url: string): Promise<void> {
		// Show iframe
		this.iframe.style.display = 'block';
		this.webview.style.display = 'none';
		this.contentArea.style.display = 'none';

		// Try the most reliable proxy services first
		const simpleProxies = [
			`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
			`https://corsproxy.io/?${encodeURIComponent(url)}`,
			`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
			`https://proxy.cors.sh/${url}`,
			`https://yacdn.org/proxy/${url}`,
			`https://cors-anywhere.herokuapp.com/${url}`
		];

		for (const proxyUrl of simpleProxies) {
			try {
				this.showSuccessNotification(`Trying simple proxy...`);

				// Set iframe src directly to proxy URL
				this.iframe.src = proxyUrl;

				// Wait for iframe to load
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error('Simple proxy timeout'));
					}, 15000); // Increased timeout

					this.iframe.onload = () => {
						clearTimeout(timeout);
						// Wait a bit more for resources to load
						setTimeout(() => {
							resolve();
						}, 2000);
					};

					this.iframe.onerror = () => {
						clearTimeout(timeout);
						reject(new Error('Simple proxy load failed'));
					};
				});

				this.showSuccessNotification('SUCCESS: Loaded with simple proxy!');
				return;

			} catch (e) {
				console.log(`Simple proxy failed: ${e}`);
			}
		}

		throw new Error('All simple proxies failed');
	}

	private async tryFetchAndInject(url: string): Promise<void> {
		// Show iframe
		this.iframe.style.display = 'block';
		this.webview.style.display = 'none';
		this.contentArea.style.display = 'none';

		// Try different proxy services with better error handling
		const proxies = [
			{ name: 'CORS Proxy', url: `https://corsproxy.io/?${encodeURIComponent(url)}` },
			{ name: 'AllOrigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
			{ name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` },
			{ name: 'ProxyCORS', url: `https://proxy.cors.sh/${url}` },
			{ name: 'CORS Anywhere', url: `https://cors-anywhere.herokuapp.com/${url}` },
			{ name: 'YACDN', url: `https://yacdn.org/proxy/${url}` },
			{ name: 'CORS Proxy 2', url: `https://cors-anywhere.herokuapp.com/${url}` }
		];

		for (const proxy of proxies) {
			try {
				this.showSuccessNotification(`Trying ${proxy.name}...`);

				const response = await fetch(proxy.url, {
					method: 'GET',
					headers: {
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.5',
						'Accept-Encoding': 'gzip, deflate, br',
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Cache-Control': 'no-cache',
						'Pragma': 'no-cache'
					}
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const html = await response.text();

				// Check if we got actual HTML content
				if (html.includes('500 Internal Server Error') || html.includes('nginx') || html.length < 100) {
					throw new Error('Proxy returned error page');
				}

				// Create a data URL with the HTML content
				const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

				// Set iframe src to data URL
				this.iframe.src = dataUrl;

				// Wait for iframe to load
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error('Data URL timeout'));
					}, 15000);

					this.iframe.onload = () => {
						clearTimeout(timeout);
						resolve();
					};

					this.iframe.onerror = () => {
						clearTimeout(timeout);
						reject(new Error('Data URL load failed'));
					};
				});

				this.showSuccessNotification(`SUCCESS: Loaded with ${proxy.name}!`);
				return;

			} catch (e) {
				console.log(`${proxy.name} failed: ${e}`);
			}
		}

		throw new Error('All fetch proxies failed');
	}

	private async tryDirectFetch(url: string): Promise<void> {
		// Show iframe
		this.iframe.style.display = 'block';
		this.webview.style.display = 'none';
		this.contentArea.style.display = 'none';

		try {
			this.showSuccessNotification('Trying direct fetch...');

			// Try direct fetch first
			const response = await fetch(url, {
				mode: 'cors',
				credentials: 'omit',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const html = await response.text();

			// Create a data URL with the HTML content
			const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

			// Set iframe src to data URL
			this.iframe.src = dataUrl;

			// Wait for iframe to load
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('Direct fetch timeout'));
				}, 10000);

				this.iframe.onload = () => {
					clearTimeout(timeout);
					resolve();
				};

				this.iframe.onerror = () => {
					clearTimeout(timeout);
					reject(new Error('Direct fetch load failed'));
				};
			});

			this.showSuccessNotification('SUCCESS: Loaded with direct fetch!');
			return;

		} catch (e) {
			throw new Error(`Direct fetch failed: ${e}`);
		}
	}

	private async tryWebView(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			// Show webview
			this.webview.style.display = 'block';
			this.iframe.style.display = 'none';
			this.contentArea.style.display = 'none';

			const timeout = setTimeout(() => {
				reject(new Error('WebView timeout'));
			}, 20000); // Increased timeout for better loading

			this.webview.addEventListener('did-finish-load', () => {
				clearTimeout(timeout);
				// Wait a bit more for resources to fully load
				setTimeout(() => {
					this.showSuccessNotification('SUCCESS: Loaded in WebView!');
					resolve();
				}, 3000);
			});

			this.webview.addEventListener('did-fail-load', () => {
				clearTimeout(timeout);
				reject(new Error('WebView load failed'));
			});

			// Try direct URL first (WebView can bypass many restrictions)
			(this.webview as HTMLElement & { src: string }).src = url;
		});
	}

	private async tryIframeWithProxies(url: string): Promise<void> {
		const proxies = [
			`https://corsproxy.io/?${encodeURIComponent(url)}`,
			`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
			`https://proxy.cors.sh/${url}`,
			`https://cors-anywhere.herokuapp.com/${url}`,
			`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
		];

		for (const proxyUrl of proxies) {
			try {
				await this.tryIframeWithUrl(proxyUrl);
				this.showSuccessNotification('SUCCESS: Loaded with proxy!');
				return;
			} catch (e) {
				console.log(`Proxy failed: ${proxyUrl}`);
			}
		}
		throw new Error('All proxies failed');
	}

	private async tryIframeWithUrl(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			// Show iframe
			this.iframe.style.display = 'block';
			this.webview.style.display = 'none';
			this.contentArea.style.display = 'none';

			const timeout = setTimeout(() => {
				reject(new Error('Iframe timeout'));
			}, 10000);

			this.iframe.onload = () => {
				clearTimeout(timeout);
				resolve();
			};

			this.iframe.onerror = () => {
				clearTimeout(timeout);
				reject(new Error('Iframe load failed'));
			};

			this.iframe.src = url;
		});
	}

	private async tryDirectIframe(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			// Show iframe
			this.iframe.style.display = 'block';
			this.webview.style.display = 'none';
			this.contentArea.style.display = 'none';

			const timeout = setTimeout(() => {
				reject(new Error('Direct iframe timeout'));
			}, 8000);

			this.iframe.onload = () => {
				clearTimeout(timeout);
				this.showSuccessNotification('SUCCESS: Loaded directly!');
				resolve();
			};

			this.iframe.onerror = () => {
				clearTimeout(timeout);
				reject(new Error('Direct iframe failed'));
			};

			this.iframe.src = url;
		});
	}


	private async loadTextContent(url: string): Promise<void> {
		try {
			// Show text area and hide other views
			this.contentArea.style.display = 'block';
			this.iframe.style.display = 'none';
			this.webview.style.display = 'none';

			this.contentArea.textContent = 'Loading text content...';
			const context = await this.requestService.request({ url }, CancellationToken.None);
			if (context.res.statusCode && context.res.statusCode >= 400) {
				this.contentArea.textContent = `Failed to load: ${context.res.statusCode}`;
				this.showErrorNotification(`HTTP Error: ${context.res.statusCode}`);
				return;
			}
			const text = await asText(context) ?? '';
			this.contentArea.textContent = text;
			this.showSuccessNotification('Text content loaded successfully!');
		} catch (e) {
			this.contentArea.textContent = `Unable to fetch page.\n${(e as Error).message || e}`;
			this.showErrorNotification(`Failed to load text content: ${(e as Error).message}`);
		}
	}

	private showSuccessNotification(message: string): void {
		this.notificationService.info(message);
	}

	private showErrorNotification(message: string): void {
		this.notificationService.error(message);
	}

	private async handleAskQuestion(): Promise<void> {
		const apiKey = this.apiKeyInput.value.trim();
		const question = this.questionInput.value.trim();
		if (!question) {
			this.showErrorNotification('Please enter a question first');
			return;
		}
		if (!apiKey) {
			this.showErrorNotification('Please enter your Gemini API key first');
			return;
		}

		this.answerArea.textContent = 'Thinking...';
		const websiteContext = this.urlInput.value.trim();

		try {
			const answer = await this.queryLLMPlaceholder(apiKey, websiteContext, question);
			this.answerArea.textContent = answer;
			this.showSuccessNotification('AI response generated successfully!');
		} catch (e) {
			this.answerArea.textContent = `Error: ${(e as Error).message}`;
			this.showErrorNotification(`AI request failed: ${(e as Error).message}`);
		}
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
						// Limit context length more aggressively to avoid token limits
						if (contextText.length > 1000) {
							contextText = contextText.substring(0, 1000) + '...';
						}
					}
				} catch (e) {
					// Ignore context fetch errors
				}
			}

			// Prepare prompt with length consideration
			const prompt = contextText
				? `Based on the following website content, please provide a concise answer:\n\nWebsite: ${websiteContext}\nContent: ${contextText}\n\nQuestion: ${question}\n\nPlease keep your answer brief and focused.`
				: `Please provide a concise answer to this question: ${question}`;

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
				maxOutputTokens: 2048,
			},
			safetySettings: [
				{
					category: HARM_CATEGORY_HARASSMENT,
					threshold: BLOCK_MEDIUM_AND_ABOVE
				},
				{
					category: HARM_CATEGORY_HATE_SPEECH,
					threshold: BLOCK_MEDIUM_AND_ABOVE
				},
				{
					category: HARM_CATEGORY_SEXUALLY_EXPLICIT,
					threshold: BLOCK_MEDIUM_AND_ABOVE
				},
				{
					category: HARM_CATEGORY_DANGEROUS_CONTENT,
					threshold: BLOCK_MEDIUM_AND_ABOVE
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

				if (candidate.finishReason === 'MAX_TOKENS') {
					throw new Error('Response was truncated due to token limit. Please ask a shorter question or reduce the website content length.');
				}

				if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
					return candidate.content.parts[0].text;
				}

				// If no parts but has content, return a message
				if (candidate.content && !candidate.content.parts) {
					throw new Error('Response received but no content parts found. This might be due to content filtering or token limits.');
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


