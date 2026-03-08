// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { chromium, Browser, Page, BrowserContext } from 'playwright';

const PORT = parseInt(process.env.MCP_PLAYWRIGHT_PORT ?? '3105', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'localhost,127.0.0.1').split(',');

/**
 * Manages a singleton Playwright browser instance with multiple page contexts.
 */
class BrowserManager {
	private browser: Browser | null = null;
	private context: BrowserContext | null = null;
	private page: Page | null = null;

	async ensureBrowser(): Promise<Page> {
		if (!this.browser || !this.browser.isConnected()) {
			this.browser = await chromium.launch({
				headless: true,
				args: ['--no-sandbox', '--disable-setuid-sandbox'],
			});
			this.context = await this.browser.newContext({
				viewport: { width: 1280, height: 720 },
			});
			this.page = await this.context.newPage();
		}
		if (!this.page || this.page.isClosed()) {
			this.page = await this.context!.newPage();
		}
		return this.page;
	}

	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.context = null;
			this.page = null;
		}
	}

	/**
	 * Validate that a URL is allowed (localhost only by default).
	 */
	isAllowedUrl(url: string): boolean {
		try {
			const parsed = new URL(url);
			return ALLOWED_ORIGINS.some(origin =>
				parsed.hostname === origin || parsed.hostname.endsWith(`.${origin}`)
			);
		} catch {
			return false;
		}
	}
}

const browserManager = new BrowserManager();

function createServer(): McpServer {
	const server = new McpServer({
		name: 'son-of-anton-playwright',
		version: '1.0.0',
	});

	server.tool(
		'navigate',
		'Navigate the browser to a URL. Restricted to localhost by default.',
		{
			url: z.string().describe('The URL to navigate to'),
			waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional()
				.describe('When to consider navigation complete (default: load)'),
		},
		async ({ url, waitUntil }) => {
			if (!browserManager.isAllowedUrl(url)) {
				return errorResponse('navigate', new Error(`URL not allowed. Only these origins are permitted: ${ALLOWED_ORIGINS.join(', ')}`));
			}
			try {
				const page = await browserManager.ensureBrowser();
				await page.goto(url, { waitUntil: waitUntil ?? 'load', timeout: 30000 });
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({ url: page.url(), title: await page.title() }),
					}],
				};
			} catch (error) {
				return errorResponse('navigate', error);
			}
		}
	);

	server.tool(
		'screenshot',
		'Capture a screenshot of the current page or a specific element.',
		{
			selector: z.string().optional().describe('CSS selector to screenshot a specific element'),
			fullPage: z.boolean().optional().describe('Capture the full scrollable page (default: false)'),
		},
		async ({ selector, fullPage }) => {
			try {
				const page = await browserManager.ensureBrowser();
				let buffer: Buffer;

				if (selector) {
					const element = page.locator(selector).first();
					buffer = await element.screenshot({ type: 'png' }) as Buffer;
				} else {
					buffer = await page.screenshot({
						type: 'png',
						fullPage: fullPage ?? false,
					}) as Buffer;
				}

				return {
					content: [{
						type: 'image' as const,
						data: buffer.toString('base64'),
						mimeType: 'image/png',
					}],
				};
			} catch (error) {
				return errorResponse('screenshot', error);
			}
		}
	);

	server.tool(
		'click',
		'Click an element identified by its accessible role and name, or by text content.',
		{
			role: z.enum([
				'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem',
				'textbox', 'combobox', 'listbox', 'option', 'heading',
			]).optional().describe('ARIA role of the element'),
			name: z.string().optional().describe('Accessible name of the element'),
			text: z.string().optional().describe('Visible text content to click'),
			selector: z.string().optional().describe('CSS selector (fallback, prefer role/name)'),
		},
		async ({ role, name, text, selector }) => {
			try {
				const page = await browserManager.ensureBrowser();

				if (role && name) {
					await page.getByRole(role as Parameters<Page['getByRole']>[0], { name }).click();
				} else if (text) {
					await page.getByText(text, { exact: false }).first().click();
				} else if (selector) {
					await page.locator(selector).first().click();
				} else {
					return errorResponse('click', new Error('Provide role+name, text, or selector'));
				}

				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ clicked: true }) }],
				};
			} catch (error) {
				return errorResponse('click', error);
			}
		}
	);

	server.tool(
		'type',
		'Type text into a form field identified by label, placeholder, or role.',
		{
			label: z.string().optional().describe('The field label'),
			placeholder: z.string().optional().describe('The field placeholder text'),
			role: z.enum(['textbox', 'combobox', 'searchbox']).optional().describe('ARIA role'),
			name: z.string().optional().describe('Accessible name (used with role)'),
			selector: z.string().optional().describe('CSS selector (fallback)'),
			text: z.string().describe('Text to type into the field'),
			clear: z.boolean().optional().describe('Clear the field before typing (default: true)'),
		},
		async ({ label, placeholder, role, name, selector, text, clear }) => {
			try {
				const page = await browserManager.ensureBrowser();
				let locator;

				if (label) {
					locator = page.getByLabel(label);
				} else if (placeholder) {
					locator = page.getByPlaceholder(placeholder);
				} else if (role && name) {
					locator = page.getByRole(role as Parameters<Page['getByRole']>[0], { name });
				} else if (selector) {
					locator = page.locator(selector);
				} else {
					return errorResponse('type', new Error('Provide label, placeholder, role+name, or selector'));
				}

				if (clear !== false) {
					await locator.clear();
				}
				await locator.fill(text);

				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ typed: true, text }) }],
				};
			} catch (error) {
				return errorResponse('type', error);
			}
		}
	);

	server.tool(
		'read_content',
		'Read the text content of the page or a specific element.',
		{
			selector: z.string().optional().describe('CSS selector to read a specific element'),
			maxLength: z.number().optional().describe('Maximum characters to return (default: 50000)'),
		},
		async ({ selector, maxLength }) => {
			try {
				const page = await browserManager.ensureBrowser();
				let content: string;

				if (selector) {
					content = await page.locator(selector).first().textContent() ?? '';
				} else {
					content = await page.textContent('body') ?? '';
				}

				const limit = maxLength ?? 50000;
				const truncated = content.length > limit
					? content.slice(0, limit) + '\n... [truncated]'
					: content;

				return {
					content: [{ type: 'text' as const, text: truncated }],
				};
			} catch (error) {
				return errorResponse('read_content', error);
			}
		}
	);

	server.tool(
		'get_accessibility_tree',
		'Return the page accessibility tree. Agents use this for semantic navigation.',
		{
			root: z.string().optional().describe('CSS selector for the root element (default: entire page)'),
		},
		async ({ root }) => {
			try {
				const page = await browserManager.ensureBrowser();
				const snapshot = await page.accessibility.snapshot({
					root: root ? await page.$(root) ?? undefined : undefined,
				});

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(snapshot, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('get_accessibility_tree', error);
			}
		}
	);

	server.tool(
		'run_playwright_code',
		'Execute arbitrary Playwright code for complex interactions. Code receives a `page` variable.',
		{
			code: z.string().describe('Playwright code to execute. Has access to `page` (Page) variable.'),
			timeout: z.number().optional().describe('Execution timeout in ms (default: 30000, max: 60000)'),
		},
		async ({ code, timeout }) => {
			try {
				const page = await browserManager.ensureBrowser();
				const timeoutMs = Math.min(timeout ?? 30000, 60000);

				// Execute the code in a controlled context
				const fn = new Function('page', `return (async () => { ${code} })();`);
				const result = await Promise.race([
					fn(page),
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error('Execution timed out')), timeoutMs)
					),
				]);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({ result: result ?? 'completed' }, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('run_playwright_code', error);
			}
		}
	);

	server.tool(
		'wait_for',
		'Wait for a condition: element visible, network idle, or custom selector.',
		{
			condition: z.enum(['visible', 'hidden', 'networkidle', 'selector'])
				.describe('Type of condition to wait for'),
			selector: z.string().optional().describe('CSS selector (required for visible/hidden/selector)'),
			timeout: z.number().optional().describe('Wait timeout in ms (default: 10000)'),
		},
		async ({ condition, selector, timeout }) => {
			try {
				const page = await browserManager.ensureBrowser();
				const timeoutMs = timeout ?? 10000;

				switch (condition) {
					case 'visible':
						if (!selector) {
							return errorResponse('wait_for', new Error('selector required for visible condition'));
						}
						await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
						break;
					case 'hidden':
						if (!selector) {
							return errorResponse('wait_for', new Error('selector required for hidden condition'));
						}
						await page.locator(selector).first().waitFor({ state: 'hidden', timeout: timeoutMs });
						break;
					case 'networkidle':
						await page.waitForLoadState('networkidle', { timeout: timeoutMs });
						break;
					case 'selector':
						if (!selector) {
							return errorResponse('wait_for', new Error('selector required'));
						}
						await page.waitForSelector(selector, { timeout: timeoutMs });
						break;
				}

				return {
					content: [{ type: 'text' as const, text: JSON.stringify({ waited: true, condition }) }],
				};
			} catch (error) {
				return errorResponse('wait_for', error);
			}
		}
	);

	return server;
}

function errorResponse(tool: string, error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: 'text' as const, text: JSON.stringify({ error: true, tool, message }, null, 2) }],
		isError: true,
	};
}

// --- HTTP server ---
const mcpServer = createServer();
const activeTransports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'mcp-playwright' }));
		return;
	}

	if (url.pathname === '/sse') {
		const transport = new SSEServerTransport('/messages', res);
		activeTransports.set(transport.sessionId, transport);
		res.on('close', () => activeTransports.delete(transport.sessionId));
		await mcpServer.connect(transport);
		return;
	}

	if (url.pathname === '/messages' && req.method === 'POST') {
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId || !activeTransports.has(sessionId)) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
			return;
		}
		await activeTransports.get(sessionId)!.handlePostMessage(req, res);
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
	await browserManager.close();
	httpServer.close();
});

httpServer.listen(PORT, () => {
	console.log(`[mcp-playwright] Listening on port ${PORT}`);
});
