/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class BrowserComponent extends Disposable {
	private readonly _container: HTMLElement;
	private readonly _urlInput: HTMLInputElement;
	private readonly _webview: HTMLElement;
	private _currentUrl: string = '';

	constructor(
		container: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._container = container;
		this._urlInput = this.createUrlInput();
		this._webview = this.createWebview();
		this.setupEventListeners();
	}

	private createUrlInput(): HTMLInputElement {
		const urlContainer = append(this._container, $('.url-container'));
		const urlInput = append(urlContainer, $('input.url-input')) as HTMLInputElement;
		urlInput.type = 'text';
		urlInput.placeholder = 'Enter website URL (e.g., https://vnexpress.net)';
		urlInput.value = 'https://vnexpress.net';
		
		const goButton = append(urlContainer, $('button.go-button'));
		goButton.textContent = 'Go';
		goButton.type = 'button';

		// Add styles
		urlContainer.style.cssText = `
			display: flex;
			padding: 8px;
			background: var(--vscode-editor-background);
			border-bottom: 1px solid var(--vscode-panel-border);
		`;
		
		urlInput.style.cssText = `
			flex: 1;
			padding: 6px 12px;
			border: 1px solid var(--vscode-input-border);
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 3px 0 0 3px;
			outline: none;
		`;
		
		goButton.style.cssText = `
			padding: 6px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: 1px solid var(--vscode-button-border);
			border-left: none;
			border-radius: 0 3px 3px 0;
			cursor: pointer;
		`;

		return urlInput;
	}

	private createWebview(): HTMLElement {
		const webview = append(this._container, $('.webview-container'));
		webview.style.cssText = `
			flex: 1;
			display: flex;
			flex-direction: column;
			background: var(--vscode-editor-background);
		`;

		// Create iframe for web content
		const iframe = append(webview, $('iframe.webview-iframe')) as HTMLIFrameElement;
		iframe.style.cssText = `
			width: 100%;
			height: 100%;
			border: none;
			background: white;
		`;
		iframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups', 'allow-presentation');

		return webview;
	}

	private setupEventListeners(): void {
		// Handle Enter key in URL input
		this._register(addDisposableListener(this._urlInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				this.navigateToUrl();
			}
		}));

		// Handle Go button click
		const goButton = this._urlInput.parentElement?.querySelector('.go-button') as HTMLButtonElement;
		if (goButton) {
			this._register(addDisposableListener(goButton, EventType.CLICK, () => {
				this.navigateToUrl();
			}));
		}
	}

	private navigateToUrl(): void {
		const url = this._urlInput.value.trim();
		if (!url) return;

		// Add protocol if missing
		let fullUrl = url;
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			fullUrl = 'https://' + url;
		}

		this._currentUrl = fullUrl;
		this.loadUrl(fullUrl);
	}

	private loadUrl(url: string): void {
		const iframe = this._container.querySelector('.webview-iframe') as HTMLIFrameElement;
		if (iframe) {
			try {
				iframe.src = url;
			} catch (error) {
				console.error('Failed to load URL:', error);
				// Show error message
				this.showError('Failed to load URL: ' + url);
			}
		}
	}

	private showError(message: string): void {
		const webview = this._container.querySelector('.webview-container') as HTMLElement;
		if (webview) {
			webview.innerHTML = `
				<div style="
					display: flex;
					align-items: center;
					justify-content: center;
					height: 100%;
					color: var(--vscode-errorForeground);
					font-family: var(--vscode-font-family);
				">
					${message}
				</div>
			`;
		}
	}

	public getCurrentUrl(): string {
		return this._currentUrl;
	}

	public getWebContent(): string {
		const iframe = this._container.querySelector('.webview-iframe') as HTMLIFrameElement;
		if (iframe && iframe.contentDocument) {
			return iframe.contentDocument.documentElement.outerHTML;
		}
		return '';
	}

	public getWebText(): string {
		const iframe = this._container.querySelector('.webview-iframe') as HTMLIFrameElement;
		if (iframe && iframe.contentDocument) {
			return iframe.contentDocument.body?.textContent || '';
		}
		return '';
	}

	public layout(dimension: { width: number; height: number }): void {
		// The webview will automatically resize with flex layout
	}
}
