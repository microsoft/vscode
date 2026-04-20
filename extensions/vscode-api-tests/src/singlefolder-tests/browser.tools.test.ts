/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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

	test('Open a page from the web', async function () {
		this.timeout(60000);

		const output = await invokeTool('open_browser_page', { url: 'https://google.com/' });

		assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
	});

	test('basic browser tool interactions', async function () {
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
