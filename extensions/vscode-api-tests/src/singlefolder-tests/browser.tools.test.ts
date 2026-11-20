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

	async function waitForCondition(predicate: () => boolean | Promise<boolean>, attempts = 200, delayMs = 50): Promise<void> {
		for (let i = 0; i < attempts && !await predicate(); i++) {
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
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

	test('queued alert confirm and prompt dialogs can be answered by agents', async function () {
		this.timeout(60_000);
		await waitForCondition(() => vscode.lm.tools.some(tool => tool.name === 'open_browser_page'));
		const output = await invokeTool('open_browser_page', { url: 'about:blank', forceNew: true });
		const pageId = output.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, output);
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
		const alert = await invokeTool('run_playwright_code', {
			pageId, code: 'await page.evaluate(() => { window.dialogResults = [alert("Queued alert"), confirm("Queued confirm"), prompt("Queued prompt", "initial text")]; });',
		});
		assert.match(alert, /Active alert dialog: "Queued alert"/);
		const confirm = await invokeTool('handle_dialog', { pageId, acceptModal: true });
		assert.match(confirm, /Active confirm dialog: "Queued confirm"/);
		const prompt = await invokeTool('handle_dialog', { pageId, acceptModal: false });
		assert.match(prompt, /Active prompt dialog: "Queued prompt"/);
		await invokeTool('handle_dialog', { pageId, acceptModal: true, promptText: 'agent answer' });
		const result = await invokeTool('run_playwright_code', { pageId, code: 'return await page.evaluate(() => window.dialogResults);' });
		assert.match(result, /\[null,false,"agent answer"\]/);
	});

	test('Playwright dialog listeners can answer prompts in child frames', async function () {
		this.timeout(60_000);
		await waitForCondition(() => vscode.lm.tools.some(tool => tool.name === 'open_browser_page'));
		const output = await invokeTool('open_browser_page', { url: 'about:blank', forceNew: true });
		const pageId = output.match(/Page ID:\s*(\S+)/)?.[1];
		assert.ok(pageId, output);
		await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
		await invokeTool('run_playwright_code', {
			pageId,
			code: `page.on('dialog', dialog => dialog.accept(dialog.defaultValue() + ' answered'));
				await page.setContent('<iframe srcdoc="<script>parent.dialogResult = prompt(\\'Frame prompt\\', \\'frame default\\')</script>"></iframe>');`,
		});

		let result = '';
		await waitForCondition(async () => {
			result = await invokeTool('run_playwright_code', {
				pageId, code: 'return await page.evaluate(() => window.dialogResult);',
			});
			return result.includes('frame default answered');
		});
		assert.match(result, /frame default answered/);
	});

	test('click and typing tools can handle dialogs in main, opaque, and nested frames', async function () {
		this.timeout(90_000);
		await waitForCondition(() => vscode.lm.tools.some(tool => tool.name === 'click_element'));
		const frameBody = '<input id="message" aria-label="Message" value="Frame"><button id="alert" onclick="alert(message.value)">Alert</button><button id="confirm" onclick="confirm(message.value)">Confirm</button><button id="prompt" onclick="window.promptResult=prompt(message.value)">Prompt</button>';
		const frame = (id: string, body: string, sandbox = '') => `<iframe id="${id}" ${sandbox} style="width:100%;height:180px" srcdoc="${body.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`;
		const html = `<html><body>${frameBody}
			${frame('same', frameBody)}
			${frame('opaque', frameBody, 'sandbox="allow-scripts allow-modals"')}
			${frame('outer', frameBody + frame('nested', frameBody))}
			${frame('blocked', frameBody, 'sandbox="allow-scripts"')}
		</body></html>`;
		const server = http.createServer((_request, response) => {
			response.setHeader('Content-Type', 'text/html');
			response.end(html);
		});
		try {
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			const output = await invokeTool('open_browser_page', { url: `http://127.0.0.1:${address.port}`, forceNew: true });
			const pageId = output.match(/Page ID:\s*(\S+)/)?.[1];
			assert.ok(pageId, output);
			const enterFrame = ' >> internal:control=enter-frame >> ';
			// Keep native input visible; the queue/listener tests above cover pages without a visible host.
			const answerDialog = async (action: string, promptText?: string): Promise<string> => {
				const handled = await invokeTool('handle_dialog', { pageId, acceptModal: true, promptText });
				assert.ok(!handled.includes('No active modal dialog') && !handled.includes('Timeout'), handled);
				const deferredResultId = action.match(/\[deferredResultId=(?<id>[^\]]+)\]/)?.groups?.id;
				if (!deferredResultId) {
					return action;
				}
				const completed = await invokeTool('run_playwright_code', { pageId, deferredResultId });
				assert.ok(!completed.includes('Timeout') && !completed.includes('Active ') && !completed.includes('[deferredResultId='), completed);
				return completed;
			};
			for (const prefix of ['', '#same' + enterFrame, '#opaque' + enterFrame, '#outer' + enterFrame, '#outer' + enterFrame + '#nested' + enterFrame]) {
				// The test DialogService auto-accepts visible confirms; hidden queue tests cover confirm.
				const clicked = await invokeTool('click_element', { pageId, selector: prefix + '#alert', element: 'alert' });
				assert.ok(clicked.includes('Active alert dialog:'), clicked);
				await answerDialog(clicked);
				const typed = await invokeTool('type_in_page', { pageId, selector: prefix + '#message', element: 'Message', text: 'Typed after handling' });
				assert.ok(!typed.includes('Timeout'), typed);
				const pressed = await invokeTool('type_in_page', { pageId, selector: prefix + '#alert', element: 'Alert', key: 'Enter' });
				assert.ok(pressed.includes('Active alert dialog:'), pressed);
				await answerDialog(pressed);
			}
			const blocked = await invokeTool('click_element', { pageId, selector: '#blocked' + enterFrame + '#alert', element: 'Sandboxed alert' });
			assert.ok(!blocked.includes('Active alert dialog:') && !blocked.includes('Timeout'), blocked);
			const sandboxed = await invokeTool('run_playwright_code', {
				pageId,
				code: `const dialogs = [];
					const dismiss = dialog => { dialogs.push(dialog.type()); return dialog.dismiss(); };
					page.on('dialog', dismiss);
					try {
						const frame = await (await page.locator('#blocked').elementHandle()).contentFrame();
						return { results: await frame.evaluate(() => [prompt('Blocked prompt'), window.__vscode_helpers.prompt('Blocked helper')]), dialogs };
					} finally { page.off('dialog', dismiss); }`,
			});
			assert.ok(!sandboxed.includes('Active prompt dialog:'), sandboxed);
			assert.ok(sandboxed.includes('{'), sandboxed);
			const sandboxedResult = JSON.parse(sandboxed.slice(sandboxed.indexOf('{'), sandboxed.lastIndexOf('}') + 1));
			assert.deepStrictEqual(sandboxedResult, { results: [null, null], dialogs: [] });
			const allowed = await invokeTool('click_element', { pageId, selector: '#opaque' + enterFrame + '#prompt', element: 'Sandboxed prompt with allow-modals' });
			assert.match(allowed, /Active prompt dialog:/);
			await answerDialog(allowed, 'Allowed answer');
			await invokeTool('run_playwright_code', {
				pageId, code: `await page.locator('#message').focus();`,
			});
			const interrupted = await invokeTool('run_playwright_code', {
				pageId,
				code: `const frame = await (await page.locator('#opaque').elementHandle()).contentFrame();
					const dialogs = [];
					const observe = dialog => { dialogs.push(dialog.type()); };
					page.on('dialog', observe);
					try {
						const parentBefore = await page.evaluate(() => ({ focused: document.hasFocus(), active: document.activeElement.id }));
						return { focus: await frame.evaluate(() => {
							const before = { focused: document.hasFocus(), active: document.activeElement.id };
							if (before.focused !== false || before.active !== '') {
								throw new Error('Expected the inactive frame body to be active without frame focus: ' + JSON.stringify(before));
							}
							const result = prompt('Focus check');
							return { before, after: { focused: document.hasFocus(), active: document.activeElement.id }, result, previous: window.promptResult };
						}), parentBefore, parentAfter: await page.evaluate(() => ({ focused: document.hasFocus(), active: document.activeElement.id })), dialogs };
					} finally { page.off('dialog', observe); }`,
			});
			assert.match(interrupted, /Active prompt dialog: "Focus check"/);
			assert.match(interrupted, /\[deferredResultId=/);
			const focus = await answerDialog(interrupted, 'Focus answer');
			assert.match(focus, /"result":\s*"Focus answer"/);
			assert.match(focus, /"previous":\s*"Allowed answer"/);
			assert.match(focus, /"dialogs":\s*\["prompt"\]/);
			const focusResult: { focus: { before: { focused: boolean; active: string }; after: { focused: boolean; active: string } }; parentBefore: { focused: boolean; active: string }; parentAfter: { focused: boolean; active: string } } = JSON.parse(focus.slice(focus.indexOf('{'), focus.lastIndexOf('}') + 1));
			assert.deepStrictEqual({ before: focusResult.focus.before, after: focusResult.focus.after, parentBefore: focusResult.parentBefore, parentAfter: focusResult.parentAfter }, {
				before: { focused: false, active: '' },
				after: { focused: false, active: '' },
				parentBefore: { focused: true, active: 'message' },
				parentAfter: { focused: true, active: 'message' },
			});
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
				server.closeAllConnections();
			});
		}
	});

	for (const type of ['alert', 'confirm', 'prompt'] as const) {
		test(`removing a child frame cancels its pending ${type}`, async function () {
			this.timeout(60_000);
			await waitForCondition(() => vscode.lm.tools.some(tool => tool.name === 'open_browser_page'));
			let release: http.ServerResponse | undefined;
			const server = http.createServer((request, response) => {
				response.setHeader('Content-Type', 'text/html');
				if (request.url === '/frame') {
					response.end(`<script>${type}("Removed frame ${type}", "initial")</script>`);
				} else if (request.url === '/release') {
					release = response;
				} else {
					const address = server.address();
					assert.ok(address && typeof address !== 'string');
					response.end(`<title>frame cleanup</title><iframe src="http://localhost:${address.port}/frame"></iframe><script>fetch('/release').then(() => { document.querySelector('iframe').remove(); document.title = 'frame removed'; });</script>`);
				}
			});
			try {
				await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
				const address = server.address();
				assert.ok(address && typeof address !== 'string');
				const output = await invokeTool('open_browser_page', { url: 'about:blank', forceNew: true });
				const pageId = output.match(/Page ID:\s*(\S+)/)?.[1];
				assert.ok(pageId, output);
				await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
				const navigation = await invokeTool('run_playwright_code', { pageId, code: `await page.goto('http://127.0.0.1:${address.port}');` });
				assert.ok(navigation.includes(`Active ${type} dialog: "Removed frame ${type}"`), navigation);
				await waitForCondition(() => !!release);
				assert.ok(release);
				release.end('remove');
				let result = '';
				await waitForCondition(async () => {
					result = await invokeTool('run_playwright_code', { pageId, code: 'return await page.evaluate(() => document.querySelector("iframe") === null);' });
					return result.includes('Result: true') && !result.includes(`Active ${type} dialog`);
				});
				assert.match(result, /Result: true/);
			} finally {
				await new Promise<void>((resolve, reject) => {
					server.close(error => error ? reject(error) : resolve());
					server.closeAllConnections();
				});
			}
		});
	}

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
		const agentNetworkConfig = vscode.workspace.getConfiguration('chat.agent.sandbox.network');

		try {
			await agentNetworkConfig.update('allowedDomains', ['*'], vscode.ConfigurationTarget.Global);
			await agentNetworkConfig.update('deniedDomains', ['localhost'], vscode.ConfigurationTarget.Global);
			await agentConfig.update('networkFilter', true, vscode.ConfigurationTarget.Global);

			await browserConfig.update('dataStorage', 'global', vscode.ConfigurationTarget.Global);
			const globalSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-global`);
			await waitForCondition(() => globalSetTab.title.startsWith('global-cookie-set'));
			assert.ok(globalSetTab.title.startsWith('global-cookie-set'), `Expected Global page to load, got title "${globalSetTab.title}"`);

			await browserConfig.update('dataStorage', 'workspace', vscode.ConfigurationTarget.Global);
			const workspaceSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-workspace`);
			await waitForCondition(() => workspaceSetTab.title.startsWith('workspace-cookie-set') && workspaceProbeReceived);
			assert.ok(workspaceSetTab.title.startsWith('workspace-cookie-set'), `Expected Workspace page to load, got title "${workspaceSetTab.title}"`);

			await browserConfig.update('dataStorage', 'agent', vscode.ConfigurationTarget.Global);
			const agentSetTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/set-agent`);

			await waitForCondition(() => agentSetTab.title.startsWith('agent-cookie-set'), 600);
			assert.ok(agentSetTab.title.startsWith('agent-cookie-set'), `Expected Agent page to load, got title "${agentSetTab.title}"`);

			const output = await invokeTool('open_browser_page', {
				url: `http://127.0.0.1:${port}/check-agent`,
				forceNew: true,
			});

			await browserConfig.update('dataStorage', 'global', vscode.ConfigurationTarget.Global);
			const globalCheckTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/check-global`);
			await waitForCondition(() => globalCheckTab.title.startsWith('global-cookie-checked'));

			await browserConfig.update('dataStorage', 'workspace', vscode.ConfigurationTarget.Global);
			const workspaceCheckTab = await vscode.window.openBrowserTab(`http://127.0.0.1:${port}/check-workspace`);
			await waitForCondition(() => workspaceCheckTab.title.startsWith('workspace-cookie-checked'));

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
			await agentNetworkConfig.update('allowedDomains', undefined, vscode.ConfigurationTarget.Global);
			await agentNetworkConfig.update('deniedDomains', undefined, vscode.ConfigurationTarget.Global);
			await Promise.all(vscode.window.browserTabs.map(tab => tab.close()));
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
				server.closeAllConnections();
			});
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

	test('Open a page over HTTP', async function () {
		this.timeout(60000);

		// Serve from the extension host so remote runs also exercise the browser's remote proxy.
		const server = http.createServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			response.end('<!DOCTYPE html><title>Browser tool test</title><h1>Browser tool HTTP fixture</h1>');
		});
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});

			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			const output = await invokeTool('open_browser_page', { url: `http://127.0.0.1:${address.port}/` });

			assert.match(output, /Page ID:/, `Expected output to contain "Page ID:", got: ${output}`);
			assert.match(output, /Browser tool HTTP fixture/, `Expected output to contain the served page content, got: ${output}`);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
				server.closeAllConnections();
			});
		}
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
