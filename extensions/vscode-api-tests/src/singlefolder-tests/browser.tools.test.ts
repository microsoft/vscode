/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import 'mocha';
import * as vscode from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

/**
 * Extracts all text content from a LanguageModelToolResult.
 */
function extractTextContent(result: vscode.LanguageModelToolResult): string {
	return result.content
		.filter((c): c is vscode.LanguageModelTextPart => c instanceof vscode.LanguageModelTextPart)
		.map(c => c.value)
		.join('\n');
}

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('chat - browser tools', () => {

	let clearNotificationsInterval: ReturnType<typeof setInterval> | undefined;

	setup(async () => {
		// Periodically clear notifications to prevent them from interrupting the browser.
		clearNotificationsInterval = setInterval(() => {
			vscode.commands.executeCommand('notifications.clearAll');
		}, 500);

		// Enable browser chat tools
		const browserConfig = vscode.workspace.getConfiguration('workbench.browser');
		await browserConfig.update('enableChatTools', true, vscode.ConfigurationTarget.Global);

		// Enable global auto-approve + skip the confirmation dialog via test-mode context key
		const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
		await chatToolsConfig.update('autoApprove', true, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', true);
	});

	teardown(async function () {
		if (clearNotificationsInterval) {
			clearInterval(clearNotificationsInterval);
			clearNotificationsInterval = undefined;
		}

		assertNoRpc();
		await closeAllEditors();

		const browserConfig = vscode.workspace.getConfiguration('workbench.browser');
		await browserConfig.update('enableChatTools', undefined, vscode.ConfigurationTarget.Global);

		const chatToolsConfig = vscode.workspace.getConfiguration('chat.tools.global');
		await chatToolsConfig.update('autoApprove', undefined, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'vscode.chat.tools.global.autoApprove.testMode', undefined);
	});

	async function invokeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
		const result = await vscode.lm.invokeTool(toolName, {
			input,
			toolInvocationToken: undefined,
		});
		return extractTextContent(result);
	}

	test('open_browser_page tool is registered', async function () {
		this.timeout(15000);

		let tool: vscode.LanguageModelToolInformation | undefined;
		for (let i = 0; i < 50; i++) {
			tool = vscode.lm.tools.find(t => t.name === 'open_browser_page');
			if (tool) {
				break;
			}
			await new Promise(r => setTimeout(r, 200));
		}
		assert.ok(tool, 'open_browser_page tool should be registered');
		assert.ok(tool.inputSchema, 'Tool should have an input schema');

		const schema = tool.inputSchema as { properties?: Record<string, unknown> };
		assert.ok(schema.properties?.['url'], 'Schema should have a url property');
	});

	test('open_browser_page opens a browser tab and returns a page ID', async function () {
		this.timeout(60000);

		const output = await invokeTool('open_browser_page', { url: 'about:blank' });

		assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
	});

	(vscode.env.remoteName ? test.skip : test)('Agent storage is shared, filtered, and isolated from persistent storage', async function () {
		this.timeout(60_000);

		const token = `${Date.now()}-${Math.random()}`;
		let agentReceivedCookie: string | undefined;
		let globalReceivedCookie: string | undefined;
		let workspaceReceivedCookie: string | undefined;
		let agentProbeReceived = false;
		let workspaceProbeReceived = false;
		const server = http.createServer();
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, resolve);
		});

		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const port = address.port;
		server.on('request', (request, response) => {
			if (request.url === '/set-global') {
				response.setHeader('Set-Cookie', `vscode-browser-global-smoke=${token}; Path=/; SameSite=Lax`);
				response.end('<title>global-cookie-set</title>');
				return;
			}

			if (request.url === '/set-workspace') {
				response.setHeader('Set-Cookie', `vscode-browser-workspace-smoke=${token}; Path=/; SameSite=Lax`);
				response.end(`<title>workspace-cookie-set</title><img src="http://localhost:${port}/workspace-probe">`);
				return;
			}

			if (request.url === '/set-agent') {
				response.setHeader('Set-Cookie', `vscode-browser-agent-smoke=${token}; Path=/; SameSite=Lax`);
				response.end(`<title>agent-cookie-set</title><img src="http://localhost:${port}/agent-probe">`);
				return;
			}

			if (request.url === '/check-agent') {
				agentReceivedCookie = request.headers.cookie;
				response.end('<title>agent-cookie-checked</title>');
				return;
			}

			if (request.url === '/check-global') {
				globalReceivedCookie = request.headers.cookie;
				response.end('<title>global-cookie-checked</title>');
				return;
			}

			if (request.url === '/check-workspace') {
				workspaceReceivedCookie = request.headers.cookie;
				response.end('<title>workspace-cookie-checked</title>');
				return;
			}

			if (request.url === '/agent-probe') {
				agentProbeReceived = true;
				response.end();
				return;
			}

			if (request.url === '/workspace-probe') {
				workspaceProbeReceived = true;
				response.end();
				return;
			}

			response.end('<title>unexpected-request</title>');
		});
		const browserConfig = vscode.workspace.getConfiguration('workbench.browser');
		const agentConfig = vscode.workspace.getConfiguration('chat.agent');

		try {
			await agentConfig.update('allowedNetworkDomains', ['*'], vscode.ConfigurationTarget.Global);
			await agentConfig.update('deniedNetworkDomains', ['localhost'], vscode.ConfigurationTarget.Global);
			await agentConfig.update('networkFilter', true, vscode.ConfigurationTarget.Global);

			await browserConfig.update('dataStorage', 'global', vscode.ConfigurationTarget.Global);
			const globalSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-global`);
			for (let i = 0; i < 100 && !globalSetTab.title.startsWith('global-cookie-set'); i++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.ok(globalSetTab.title.startsWith('global-cookie-set'), `Expected Global page to load, got title "${globalSetTab.title}"`);

			await browserConfig.update('dataStorage', 'workspace', vscode.ConfigurationTarget.Global);
			const workspaceSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-workspace`);
			for (let i = 0; i < 100 && (!workspaceSetTab.title.startsWith('workspace-cookie-set') || !workspaceProbeReceived); i++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.ok(workspaceSetTab.title.startsWith('workspace-cookie-set'), `Expected Workspace page to load, got title "${workspaceSetTab.title}"`);

			await browserConfig.update('dataStorage', 'agent', vscode.ConfigurationTarget.Global);
			const agentSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-agent`);

			for (let i = 0; i < 100 && !agentSetTab.title.startsWith('agent-cookie-set'); i++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.ok(agentSetTab.title.startsWith('agent-cookie-set'), `Expected Agent page to load, got title "${agentSetTab.title}"`);

			const output = await invokeTool('open_browser_page', {
				url: `http://127.0.0.1:${port}/check-agent`,
				forceNew: true,
			});

			await browserConfig.update('dataStorage', 'global', vscode.ConfigurationTarget.Global);
			const globalCheckTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/check-global`);
			for (let i = 0; i < 100 && !globalCheckTab.title.startsWith('global-cookie-checked'); i++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			await browserConfig.update('dataStorage', 'workspace', vscode.ConfigurationTarget.Global);
			const workspaceCheckTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/check-workspace`);
			for (let i = 0; i < 100 && !workspaceCheckTab.title.startsWith('workspace-cookie-checked'); i++) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			assert.deepStrictEqual({
				opened: /Page ID:/.test(output),
				agentSharedCookie: agentReceivedCookie?.includes(`vscode-browser-agent-smoke=${token}`) === true,
				agentReceivedGlobalCookie: agentReceivedCookie?.includes(`vscode-browser-global-smoke=${token}`) === true,
				agentReceivedWorkspaceCookie: agentReceivedCookie?.includes(`vscode-browser-workspace-smoke=${token}`) === true,
				agentBlockedRequest: !agentProbeReceived,
				globalLoaded: globalCheckTab.title.startsWith('global-cookie-checked'),
				globalSharedCookie: globalReceivedCookie?.includes(`vscode-browser-global-smoke=${token}`) === true,
				globalReceivedAgentCookie: globalReceivedCookie?.includes(`vscode-browser-agent-smoke=${token}`) === true,
				workspaceLoaded: workspaceCheckTab.title.startsWith('workspace-cookie-checked'),
				workspaceSharedCookie: workspaceReceivedCookie?.includes(`vscode-browser-workspace-smoke=${token}`) === true,
				workspaceReceivedAgentCookie: workspaceReceivedCookie?.includes(`vscode-browser-agent-smoke=${token}`) === true,
				workspaceAllowedRequest: workspaceProbeReceived,
			}, {
				opened: true,
				agentSharedCookie: true,
				agentReceivedGlobalCookie: false,
				agentReceivedWorkspaceCookie: false,
				agentBlockedRequest: true,
				globalLoaded: true,
				globalSharedCookie: true,
				globalReceivedAgentCookie: false,
				workspaceLoaded: true,
				workspaceSharedCookie: true,
				workspaceReceivedAgentCookie: false,
				workspaceAllowedRequest: true,
			});
		} finally {
			await browserConfig.update('dataStorage', undefined, vscode.ConfigurationTarget.Global);
			await agentConfig.update('networkFilter', undefined, vscode.ConfigurationTarget.Global);
			await agentConfig.update('allowedNetworkDomains', undefined, vscode.ConfigurationTarget.Global);
			await agentConfig.update('deniedNetworkDomains', undefined, vscode.ConfigurationTarget.Global);
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	});

	test('list_browser_pages returns pages opened through the browser tools', async function () {
		this.timeout(60000);

		const openOutput = await invokeTool('open_browser_page', { url: 'about:blank', forceNew: true });
		const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);

		const listOutput = await invokeTool('list_browser_pages', {});

		assert.match(listOutput, new RegExp(`^- \\[${pageId}\\]`, 'm'), `Expected list output to contain page ID "${pageId}", got: ${listOutput}`);
	});

	test('Open a page from the web', async function () {
		this.timeout(60000);

		const output = await invokeTool('open_browser_page', { url: 'https://google.com/' });

		assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
	});

	// Loads `file:///<workspaceFolder>/index.html`. Skipped in remote
	// workspaces: the workspace folder is a `vscode-remote://` URI so it
	// isn't added to the local `file://` trust allowlist.
	(vscode.env.remoteName ? test.skip : test)('basic browser tool interactions', async function () {
		this.timeout(60000);

		// Build a file:// URL to the test workspace's index.html
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(workspaceFolders && workspaceFolders.length > 0, 'Expected a workspace folder');
		const indexHtmlPath = path.join(workspaceFolders[0].uri.fsPath, 'index.html');
		const fileUrl = vscode.Uri.file(indexHtmlPath).toString();

		// Open the page
		const openOutput = await invokeTool('open_browser_page', { url: fileUrl });
		assert.match(openOutput, /Page ID:/, `Expected open output to contain "Page ID:", got: ${openOutput}`);

		// Extract the page ID from the output
		const pageIdMatch = openOutput.match(/Page ID:\s*(\S+)/);
		assert.ok(pageIdMatch, `Could not extract Page ID from: ${openOutput}`);
		const pageId = pageIdMatch[1];

		// Type a message into the input field
		const typeOutput = await invokeTool('type_in_page', {
			pageId,
			text: 'test message',
			selector: '#msgInput',
			element: 'message input',
		});
		assert.ok(typeOutput, 'Expected type output');

		// Click the "Send Message" button
		const clickOutput = await invokeTool('click_element', {
			pageId,
			selector: '#sendBtn',
			element: 'Send Message button',
		});
		assert.ok(clickOutput, 'Expected click output');

		// Wait for the worker to process the message and update the page
		const runOutput = await invokeTool('run_playwright_code', {
			pageId,
			code: `await page.waitForSelector('#output:text-is("test message")'); return "done";`,
		});
		assert.match(runOutput, /Result: "done"/, `Expected run_playwright_code output to contain result "done", got: ${runOutput}`);

		// Read the page to verify the output element was populated
		const readOutput = await invokeTool('read_page', { pageId });
		assert.ok(readOutput.includes('test message'), `Expected page to contain worker response "test message", got: ${readOutput}`);
	});
});
