/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConsoleMessage, Page, Request, Response } from 'playwright';

/** Watches both the webview bootstrap and its resources, without logging URL credentials. */
export class WebviewDiagnostics {
	readonly failedResources: string[] = [];
	readonly diagnostics: string[] = [];
	private readonly failure: Promise<Error>;
	private reportFailure!: (error: Error) => void;

	constructor(private readonly page: Page, private readonly log: (message: string) => void) {
		this.failure = new Promise(resolve => this.reportFailure = resolve);
		page.on('response', this.onResponse);
		page.on('requestfailed', this.onRequestFailed);
		page.on('console', this.onConsole);
		page.on('pageerror', this.onPageError);
	}

	private readonly onResponse = (response: Response) => {
		if (response.status() >= 400 && this.isWebviewResource(response.url())) {
			this.recordFailure(`HTTP ${response.status()} ${this.safeUrl(response.url())}`);
		}
	};

	private readonly onRequestFailed = (request: Request) => {
		if (this.isWebviewResource(request.url())) {
			this.recordFailure(`${request.failure()?.errorText} ${this.safeUrl(request.url())}`);
		}
	};

	private readonly onConsole = (message: ConsoleMessage) => {
		if (message.type() === 'error') {
			const text = message.text();
			this.diagnostics.push(`Console error: ${text}`);
			if (text.startsWith('Webview fatal error:')) {
				this.reportFailure(new Error(text));
			}
		}
	};

	private readonly onPageError = (error: Error) => {
		this.diagnostics.push(`Page error: ${error.message}`);
	};

	private isWebviewResource(value: string): boolean {
		const url = new URL(value);
		return url.hostname.includes('.vscode-resource.')
			|| (url.hostname.endsWith('.vscode-cdn.net') && url.pathname.includes('/webview/browser/pre/'));
	}

	private safeUrl(value: string): string {
		if (!value) {
			return '<not navigated>';
		}
		const url = new URL(value);
		url.username = '';
		url.password = '';
		url.search = '';
		url.hash = '';
		return url.toString();
	}

	private recordFailure(message: string): void {
		this.failedResources.push(message);
		this.log(`Webview request failed: ${message}`);
		this.reportFailure(new Error(message));
	}

	/** Interrupt a render/load wait when the browser reports a resource or fatal bootstrap failure. */
	async waitFor<T>(operation: Promise<T>): Promise<T> {
		return Promise.race([operation, this.failure.then(error => { throw error; })]);
	}

	formatFailure(): string {
		return [
			'Markdown preview did not render.',
			`Failed webview resources: ${this.failedResources.join(', ') || 'none observed'}`,
			'For server-web artifact sanity, verify that the same commit\'s Web stage uploaded its webview assets before this test.',
			`Frames: ${this.page.frames().map(frame => this.safeUrl(frame.url())).join(', ')}`,
			...this.diagnostics.slice(0, 20),
		].join('\n');
	}

	dispose(): void {
		this.page.off('response', this.onResponse);
		this.page.off('requestfailed', this.onRequestFailed);
		this.page.off('console', this.onConsole);
		this.page.off('pageerror', this.onPageError);
	}
}
