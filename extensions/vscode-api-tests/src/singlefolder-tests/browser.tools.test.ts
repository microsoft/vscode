/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import 'mocha';
import * as vscode from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

const allowedPageMarker = 'ALLOWED_BROWSER_PAGE_MARKER';
const deniedFrameMarker = 'DENIED_BROWSER_FRAME_MARKER';
const complexPageMarker = 'COMPLEX_PAGE_READY_MARKER';

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
	let allowedServer: http.Server;
	let allowedPort: number;
	let deniedServer: http.Server;
	let deniedPort: number;
	let deniedRequestCount: number;

	setup(async function () {
		this.timeout(15000);

		deniedRequestCount = 0;
		deniedServer = http.createServer((_request, response) => {
			deniedRequestCount++;
			response.setHeader('Content-Type', 'text/html');
			response.end(`<html><body>${deniedFrameMarker}</body></html>`);
		});
		deniedPort = await listen(deniedServer, '127.0.0.1');

		allowedServer = http.createServer((request, response) => {
			switch (request.url) {
				case '/hidden-iframe':
					response.setHeader('Content-Type', 'text/html');
					response.end(`<html><body>${allowedPageMarker}<iframe style="position:absolute;width:1px;height:1px;opacity:0" src="http://127.0.0.1:${deniedPort}/private"></iframe></body></html>`);
					break;
				case '/redirect-to-denied':
					response.writeHead(302, { Location: `http://127.0.0.1:${deniedPort}/redirected-private` });
					response.end();
					break;
				case '/complex':
					response.setHeader('Content-Type', 'text/html');
					response.end(`<!DOCTYPE html>
						<html>
							<head><link rel="stylesheet" href="/style.css"></head>
							<body>
								<div id="status">loading</div>
								<img id="test-image" src="/image.png">
								<iframe src="/allowed-frame"></iframe>
								<script src="/complex.js"></script>
							</body>
						</html>`);
					break;
				case '/style.css':
					response.setHeader('Content-Type', 'text/css');
					response.end('body { --complex-page-style: loaded; }');
					break;
				case '/complex.js':
					response.setHeader('Content-Type', 'text/javascript');
					response.end(`
						const worker = new Worker('/worker.js');
						const workerResult = new Promise(resolve => worker.onmessage = event => resolve(event.data));
						const imageResult = new Promise(resolve => {
							const image = document.getElementById('test-image');
							if (image.complete) {
								resolve('image-loaded');
							} else {
								image.onload = () => resolve('image-loaded');
							}
						});
						Promise.all([
							fetch('/data').then(response => response.text()),
							workerResult,
							imageResult,
						]).then(([fetchResult, workerMarker, imageMarker]) => {
							const styleMarker = getComputedStyle(document.body).getPropertyValue('--complex-page-style').trim();
							document.getElementById('status').textContent =
								'${complexPageMarker} ' + fetchResult + ' ' + workerMarker + ' ' + imageMarker + ' style-' + styleMarker;
						});
					`);
					break;
				case '/worker.js':
					response.setHeader('Content-Type', 'text/javascript');
					response.end(`postMessage('worker-loaded');`);
					break;
				case '/data':
					response.setHeader('Content-Type', 'text/plain');
					response.end('fetch-loaded');
					break;
				case '/image.png':
					response.setHeader('Content-Type', 'image/png');
					response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
					break;
				case '/allowed-frame':
					response.setHeader('Content-Type', 'text/html');
					response.end('<html><body>allowed-frame-loaded</body></html>');
					break;
				default:
					response.writeHead(404);
					response.end();
			}
		});
		allowedPort = await listen(allowedServer, 'localhost');

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

		await setNetworkPolicy(undefined);
		await closeServer(allowedServer);
		await closeServer(deniedServer);
	});

	function listen(server: http.Server, host: string): Promise<number> {
		return new Promise((resolve, reject) => {
			server.listen(0, host, () => resolve((server.address() as AddressInfo).port));
			server.on('error', reject);
		});
	}

	function closeServer(server: http.Server): Promise<void> {
		server.closeAllConnections();
		return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}

	async function setNetworkPolicy(enabled: true | undefined): Promise<void> {
		const configuration = vscode.workspace.getConfiguration();
		if (enabled) {
			await configuration.update('chat.agent.allowedNetworkDomains', ['http://localhost'], vscode.ConfigurationTarget.Global);
			await configuration.update('chat.agent.deniedNetworkDomains', ['http://127.0.0.1'], vscode.ConfigurationTarget.Global);
			await configuration.update('chat.agent.networkFilter', true, vscode.ConfigurationTarget.Global);
		} else {
			await configuration.update('chat.agent.networkFilter', undefined, vscode.ConfigurationTarget.Global);
			await configuration.update('chat.agent.allowedNetworkDomains', undefined, vscode.ConfigurationTarget.Global);
			await configuration.update('chat.agent.deniedNetworkDomains', undefined, vscode.ConfigurationTarget.Global);
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}

	async function invokeToolResult(toolName: string, input: Record<string, unknown>): Promise<vscode.LanguageModelToolResult> {
		return vscode.lm.invokeTool(toolName, {
			input,
			toolInvocationToken: undefined,
		});
	}

	async function invokeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
		const result = await invokeToolResult(toolName, input);
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

	test('browser tools network policy blocks denied hidden iframe content from read_page', async function () {
		this.timeout(60000);
		await setNetworkPolicy(true);

		const openOutput = await invokeTool('open_browser_page', {
			url: `http://localhost:${allowedPort}/hidden-iframe`,
			forceNew: true,
		});
		const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);

		const readOutput = await invokeTool('read_page', { pageId });

		assert.deepStrictEqual({
			deniedRequestCount,
			openContainsAllowedMarker: openOutput.includes(allowedPageMarker),
			readContainsAllowedMarker: readOutput.includes(allowedPageMarker),
			openContainsDeniedMarker: openOutput.includes(deniedFrameMarker),
			readContainsDeniedMarker: readOutput.includes(deniedFrameMarker),
			readContainsDeniedUrl: readOutput.includes('127.0.0.1'),
		}, {
			deniedRequestCount: 0,
			openContainsAllowedMarker: true,
			readContainsAllowedMarker: true,
			openContainsDeniedMarker: false,
			readContainsDeniedMarker: false,
			readContainsDeniedUrl: false,
		});
	});

	test('browser tools network policy blocks screenshot_page after redirect to denied host', async function () {
		this.timeout(60000);
		await setNetworkPolicy(true);

		const openOutput = await invokeTool('open_browser_page', {
			url: `http://localhost:${allowedPort}/redirect-to-denied`,
			forceNew: true,
		});
		const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);

		const readOutput = await invokeTool('read_page', { pageId });
		const screenshotResult = await invokeToolResult('screenshot_page', { pageId });
		const screenshotText = extractTextContent(screenshotResult);
		const dataPartCount = screenshotResult.content.filter(part => part instanceof vscode.LanguageModelDataPart).length;

		assert.deepStrictEqual({
			readWasBlocked: readOutput.includes('blocked by network domain policy'),
			screenshotWasBlocked: screenshotText.includes('blocked by network domain policy'),
			dataPartCount,
		}, {
			readWasBlocked: true,
			screenshotWasBlocked: true,
			dataPartCount: 0,
		});
	});

	test('browser tools network policy blocks screenshot_page when a denied frame is present', async function () {
		this.timeout(60000);
		await setNetworkPolicy(true);

		const openOutput = await invokeTool('open_browser_page', {
			url: `http://localhost:${allowedPort}/hidden-iframe`,
			forceNew: true,
		});
		const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);

		const screenshotResult = await invokeToolResult('screenshot_page', { pageId });
		const screenshotText = extractTextContent(screenshotResult);
		const dataPartCount = screenshotResult.content.filter(part => part instanceof vscode.LanguageModelDataPart).length;

		assert.deepStrictEqual({
			screenshotWasBlocked: screenshotText.includes('blocked by network domain policy'),
			dataPartCount,
		}, {
			screenshotWasBlocked: true,
			dataPartCount: 0,
		});
	});

	test('browser tools network policy preserves complex allowed page loading', async function () {
		this.timeout(60000);
		await setNetworkPolicy(true);

		const openOutput = await invokeTool('open_browser_page', {
			url: `http://localhost:${allowedPort}/complex`,
			forceNew: true,
		});
		const pageId = openOutput.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, `Could not extract Page ID from: ${openOutput}`);

		await invokeTool('run_playwright_code', {
			pageId,
			code: `await page.waitForSelector('#status:text-is("${complexPageMarker} fetch-loaded worker-loaded image-loaded style-loaded")'); return "ready";`,
		});
		const readOutput = await invokeTool('read_page', { pageId });

		assert.deepStrictEqual({
			complexPageReady: readOutput.includes(complexPageMarker),
			fetchLoaded: readOutput.includes('fetch-loaded'),
			workerLoaded: readOutput.includes('worker-loaded'),
			imageLoaded: readOutput.includes('image-loaded'),
			styleLoaded: readOutput.includes('style-loaded'),
			allowedFrameLoaded: readOutput.includes('allowed-frame-loaded'),
		}, {
			complexPageReady: true,
			fetchLoaded: true,
			workerLoaded: true,
			imageLoaded: true,
			styleLoaded: true,
			allowedFrameLoaded: true,
		});
	});
});
