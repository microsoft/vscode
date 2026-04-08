/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TsCodeWelcomePage } from './tsCodeWelcomePage.js';

/**
 * Extract the private _buildHtml method for testing HTML content.
 * We subclass TsCodeWelcomePage to expose it without needing DI.
 */
class TestableTsCodeWelcomePage extends TsCodeWelcomePage {
	public getHtml(): string {
		return (this as any)._buildHtml();
	}
}

suite('TsCodeWelcomePage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Create a minimal stub instance that bypasses DI by directly constructing
	 * with mock services. We only need to test the HTML generation logic.
	 */
	function createPageInstance(): TestableTsCodeWelcomePage {
		// Mock IWebviewService
		const mockWebviewService: any = {
			createWebviewOverlay: () => ({
				claim: () => { },
				release: () => { },
				layoutWebviewOverElement: () => { },
				setHtml: () => { },
				onMessage: { event: () => { } },
				onDidDispose: { event: () => { } },
				dispose: () => { },
				postMessage: () => Promise.resolve(true),
			}),
		};

		// Mock IWorkbenchLayoutService
		const mockLayoutService: any = {
			mainContainer: document.createElement('div'),
		};

		// Mock ITsCodeAuthService
		const mockAuthService: any = {
			onDidNeedLogin: { event: (_cb: any) => ({ dispose: () => { } }) },
			onDidLogin: { event: (_cb: any) => ({ dispose: () => { } }) },
			onDidStartOAuth: { event: (_cb: any) => ({ dispose: () => { } }) },
			onDidLoginError: { event: (_cb: any) => ({ dispose: () => { } }) },
			onDidSecurityError: { event: (_cb: any) => ({ dispose: () => { } }) },
			startOAuthFlow: () => Promise.resolve(),
		};

		// Bypass DI by directly calling the constructor with mock services
		const page = new (TestableTsCodeWelcomePage as any)(
			mockWebviewService,
			mockLayoutService,
			mockAuthService,
		) as TestableTsCodeWelcomePage;

		return page;
	}

	test('HTML contains brand name "TSCode"', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('TSCode'), 'HTML should contain brand name "TSCode"');
		page.dispose();
	});

	test('HTML contains title "欢迎使用 TSCode"', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('欢迎使用 TSCode'), 'HTML should contain title "欢迎使用 TSCode"');
		page.dispose();
	});

	test('HTML contains login button with label "登录"', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('登录'), 'HTML should contain login button label "登录"');
		page.dispose();
	});

	test('HTML contains vscode.postMessage with type login', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(
			html.includes("type: 'login'") || html.includes('type:"login"') || html.includes("{ type: 'login' }"),
			'HTML should post message with type "login" when login button is clicked'
		);
		page.dispose();
	});

	test('HTML has dark background color #1e1e1e', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('#1e1e1e'), 'HTML should have dark background color #1e1e1e');
		page.dispose();
	});

	test('HTML contains waiting state text', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('正在等待授权'), 'HTML should contain waiting state text');
		page.dispose();
	});

	test('HTML contains acquireVsCodeApi call', () => {
		const page = createPageInstance();
		const html = page.getHtml();
		assert.ok(html.includes('acquireVsCodeApi'), 'HTML should call acquireVsCodeApi for webview messaging');
		page.dispose();
	});
});
