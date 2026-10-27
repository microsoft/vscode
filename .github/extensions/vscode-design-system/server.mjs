/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSystem, validateView } from './system.mjs';
import { loadFixtureCatalog } from './fixtures.mjs';
import { readProvenance } from './provenance.mjs';

const assets = new Map([
	['/canvas.css', ['text/css', 'canvas.css']],
]);
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function createPanel(root, readFixtures = loadFixtureCatalog, onCatalog = () => {}) {
	let view = { section: 'principles', theme: 'Dark 2026', compareTheme: 'Light 2026', controlId: 'button', fixtureId: '', query: '', explorerUrl: '', anchor: '', expandedNodes: [] };
	let catalog;
	let catalogVersion = 0;
	let publicOrigin;
	const subscribers = new Set();
	const broadcast = kind => {
		for (const response of subscribers) {
			response.write(`data: ${JSON.stringify({ kind, view })}\n\n`);
		}
	};
	const panel = {
		get view() { return { ...view, expandedNodes: [...view.expandedNodes] }; },
		get url() { return `http://127.0.0.1:${server.address().port}`; },
		setPublicOrigin(origin) { publicOrigin = origin; },
		sourcesChanged(fixturesChanged = false) {
			if (fixturesChanged) {
				catalog = undefined;
				catalogVersion++;
			}
			broadcast('sources');
		},
		async readCatalog(refresh = false) {
			if (!catalog || refresh) {
				const version = ++catalogVersion;
				catalog = readFixtures(root, view.explorerUrl).then(result => {
					if (version === catalogVersion) {
						onCatalog(result);
					}
					return result;
				});
			}
			const requested = catalog;
			try {
				return await requested;
			} catch (error) {
				if (catalog === requested) {
					catalog = undefined;
				}
				throw error;
			}
		},
		setView(patch, navigate = true) {
			const next = validateView(patch, view, loadSystem(root));
			if (next.explorerUrl !== view.explorerUrl) {
				catalog = undefined;
				catalogVersion++;
			}
			view = next;
			broadcast(navigate ? 'navigate' : 'view');
			return panel.view;
		},
		async listen() {
			await new Promise((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', () => {
					server.removeListener('error', reject);
					resolve();
				});
			});
		},
		async close() {
			for (const response of subscribers) {
				response.end();
			}
			await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		},
	};
	const server = http.createServer(async (request, response) => {
		const send = (status, type, body) => {
			response.writeHead(status, {
				'Content-Type': `${type}${type.startsWith('text/') || type === 'application/json' ? '; charset=utf-8' : ''}`,
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src http://localhost:* http://127.0.0.1:*; base-uri 'none'; form-action 'none'",
			});
			response.end(body);
		};
		try {
			const host = new URL(panel.url).host;
			if (request.headers.host !== host) {
				send(403, 'text/plain', 'Invalid host');
				return;
			}
			const url = new URL(request.url, panel.url);
			if (request.method === 'POST' && url.pathname === '/api/view') {
				if (![panel.url, publicOrigin].includes(request.headers.origin) || !request.headers.origin || request.headers['content-type'] !== 'application/json') {
					send(403, 'text/plain', 'Same-origin JSON required');
					return;
				}
				let body = '';
				for await (const chunk of request) {
					body += chunk;
					if (Buffer.byteLength(body) > 4096) {
						send(413, 'text/plain', 'View state exceeds 4096 bytes');
						return;
					}
				}
				try {
					const patch = JSON.parse(body);
					validateView(patch, view, loadSystem(root));
					send(200, 'application/json', JSON.stringify(panel.setView(patch, false)));
				} catch (error) {
					if (!(error instanceof SyntaxError) && !/Expected section|Unknown section|Component Explorer URL|Invalid URL/.test(error.message)) {
						throw error;
					}
					send(400, 'text/plain', error.message);
				}
				return;
			}
			if (request.method !== 'GET') {
				send(405, 'text/plain', 'Method not allowed');
				return;
			}
			if (url.pathname === '/') {
				send(200, 'text/plain', 'Live design-system source API. Browse the Storybook URL printed by npm run dev.');
			} else if (url.pathname === '/api/system') {
				send(200, 'application/json', JSON.stringify({ ...loadSystem(root, view.theme, view.compareTheme), provenance: readProvenance(root), view }));
			} else if (url.pathname === '/api/fixtures') {
				send(200, 'application/json', JSON.stringify(await panel.readCatalog(url.searchParams.get('refresh') === 'true')));
			} else if (url.pathname === '/codicon.ttf') {
				send(200, 'font/ttf', readFileSync(path.join(root, 'node_modules/@vscode/codicons/dist/codicon.ttf')));
			} else if (url.pathname === '/api/events') {
				if (request.headers.origin && ![panel.url, publicOrigin].includes(request.headers.origin)) {
					send(403, 'text/plain', 'Same-origin events required');
					return;
				}
				response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
				response.write(': connected\n\n');
				subscribers.add(response);
				response.on('close', () => subscribers.delete(response));
			} else if (url.pathname === '/source') {
				const file = url.searchParams.get('file');
				if (!loadSystem(root, view.theme, view.compareTheme).sourceFiles.includes(file)) {
					send(404, 'text/plain', 'Source is not in the design-system inventory');
					return;
				}
				const text = readFileSync(path.join(root, file), 'utf8');
				const lines = text.split('\n').map((line, index) => `<span id="L${index + 1}"><a href="#L${index + 1}">${index + 1}</a> ${escape(line)}</span>`).join('\n');
				send(200, 'text/html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(file)}</title><link rel="stylesheet" href="/canvas.css"><body class="design-reference source"><h1>${escape(file)}</h1><pre>${lines}</pre></body></html>`);
			} else if (assets.has(url.pathname)) {
				const [type, file] = assets.get(url.pathname);
				send(200, type, readFileSync(new URL(file, import.meta.url)));
			} else {
				send(404, 'text/plain', 'Not found');
			}
		} catch (error) {
			send(500, 'text/plain', `Couldn't load the design system: ${error.message}`);
		}
	});
	return panel;
}
