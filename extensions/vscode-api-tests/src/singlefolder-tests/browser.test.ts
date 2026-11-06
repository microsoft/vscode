/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as crypto from 'crypto';
import * as dgram from 'dgram';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { window, commands, ViewColumn, workspace } from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - browser', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	// #region window.browserTabs / activeBrowserTab

	test('browserTabs is an array', () => {
		assert.ok(Array.isArray(window.browserTabs));
	});

	test('activeBrowserTab is undefined when no browser tab is open', () => {
		assert.strictEqual(window.activeBrowserTab, undefined);
	});

	// #endregion

	// #region openBrowserTab

	test('openBrowserTab returns a BrowserTab with url, title, and icon', async () => {
		const tab = await window.openBrowserTab('about:blank');

		assert.ok(tab);
		assert.strictEqual(tab.url, 'about:blank');
		assert.ok(tab.title);
		assert.ok(tab.icon);
	});

	test('openBrowserTab adds tab to browserTabs', async () => {
		const before = window.browserTabs.length;
		await window.openBrowserTab('about:blank');
		assert.strictEqual(window.browserTabs.length, before + 1);
	});

	test('openBrowserTab with viewColumn.Beside', async () => {
		const tab = await window.openBrowserTab('about:blank', { viewColumn: ViewColumn.Beside });
		assert.ok(tab);
		assert.strictEqual(tab.url, 'about:blank');
	});

	test('openBrowserTab with preserveFocus', async () => {
		const tab = await window.openBrowserTab('about:blank', { preserveFocus: true });
		assert.ok(tab);
	});

	test('openBrowserTab with background', async () => {
		const tab = await window.openBrowserTab('about:blank', { background: true });
		assert.ok(tab);
	});

	// #endregion

	// #region BrowserTab.close

	test('BrowserTab.close removes the tab from browserTabs', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const countBefore = window.browserTabs.length;

		await tab.close();

		assert.strictEqual(window.browserTabs.length, countBefore - 1);
	});

	test('Closing via workbench.action.closeActiveEditor removes tab from browserTabs', async () => {
		const tab = await window.openBrowserTab('about:blank');
		assert.ok(window.browserTabs.includes(tab));

		const closed = new Promise<vscode.BrowserTab>(resolve => {
			const disposable = window.onDidCloseBrowserTab(t => {
				disposable.dispose();
				resolve(t);
			});
		});

		await commands.executeCommand('workbench.action.closeActiveEditor');
		const firedTab = await closed;
		assert.ok(firedTab);
		assert.ok(!window.browserTabs.includes(tab));
	});

	test('Can move a browser tab to a new group and close it successfully', async () => {
		const tab = await window.openBrowserTab('about:blank');
		assert.ok(window.browserTabs.includes(tab));

		await commands.executeCommand('workbench.action.moveEditorToNextGroup');

		await tab.close();
		assert.ok(!window.browserTabs.includes(tab));
	});

	// #endregion

	// #region onDidOpenBrowserTab

	test('onDidOpenBrowserTab fires when a tab is opened', async () => {
		const opened = new Promise<vscode.BrowserTab>(resolve => {
			const disposable = window.onDidOpenBrowserTab(tab => {
				disposable.dispose();
				resolve(tab);
			});
		});

		const tab = await window.openBrowserTab('about:blank');
		const firedTab = await opened;
		assert.strictEqual(firedTab.url, tab.url);
	});

	// #endregion

	// #region onDidCloseBrowserTab

	test('onDidCloseBrowserTab fires when a tab is closed', async () => {
		const tab = await window.openBrowserTab('about:blank');

		const closed = new Promise<vscode.BrowserTab>(resolve => {
			const disposable = window.onDidCloseBrowserTab(t => {
				disposable.dispose();
				resolve(t);
			});
		});

		await tab.close();
		const firedTab = await closed;
		assert.ok(firedTab);
	});

	// #endregion

	// #region activeBrowserTab / onDidChangeActiveBrowserTab

	test('activeBrowserTab is set after opening a tab', async () => {
		await window.openBrowserTab('about:blank');
		assert.ok(window.activeBrowserTab);
	});

	test('onDidChangeActiveBrowserTab fires when active tab changes', async () => {
		const changed = new Promise<vscode.BrowserTab | undefined>(resolve => {
			const disposable = window.onDidChangeActiveBrowserTab(tab => {
				disposable.dispose();
				resolve(tab);
			});
		});

		await window.openBrowserTab('about:blank');
		const activeTab = await changed;
		assert.ok(activeTab);
	});

	// #endregion

	// #region CDP sessions

	test('startCDPSession returns a session with expected API', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		assert.ok(session);
		assert.ok(session.onDidReceiveMessage);
		assert.ok(session.onDidClose);
		assert.ok(typeof session.sendMessage === 'function');
		assert.ok(typeof session.close === 'function');

		await session.close();
	});

	test('CDP sendMessage and onDidReceiveMessage round-trip', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		// openBrowserTab resolves before the tab's initial navigation commits (in remote
		// workspaces it first waits for the tunnel proxy), and until then CDP reports the
		// target's URL as ''. Track the URL from target events so we can wait for the commit.
		const urls = new Map<string, string>();
		let onUrlChanged: (() => void) | undefined;
		const responses = new Map<number, (msg: any) => void>();
		const listener = session.onDidReceiveMessage((msg: any) => {
			if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
				urls.set(msg.params.targetInfo.targetId, msg.params.targetInfo.url);
				onUrlChanged?.();
			} else if (typeof msg.id === 'number') {
				responses.get(msg.id)?.(msg);
			}
		});
		const send = async (id: number, method: string, params?: object) => {
			const response = new Promise<any>(resolve => responses.set(id, resolve));
			await session.sendMessage({ id, method, params });
			return response;
		};

		try {
			await send(1, 'Target.setDiscoverTargets', { discover: true });
			const msg = await send(2, 'Target.getTargets');
			assert.ok(msg.result);
			const targets: any[] = msg.result.targetInfos;
			assert.equal(targets.length, 1);

			const targetId: string = targets[0].targetId;
			if (!urls.has(targetId)) {
				urls.set(targetId, targets[0].url);
			}
			if (urls.get(targetId) !== 'about:blank') {
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error(`Browser target is still at '${urls.get(targetId)}' 10s after opening about:blank`)), 10_000);
					onUrlChanged = () => {
						if (urls.get(targetId) === 'about:blank') {
							clearTimeout(timeout);
							resolve();
						}
					};
				});
			}
			assert.equal(urls.get(targetId), 'about:blank');
		} finally {
			listener.dispose();
			await session.close();
		}
	});

	test('CDP session.close fires onDidClose', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		const closed = new Promise<void>(resolve => {
			const disposable = session.onDidClose(() => {
				disposable.dispose();
				resolve();
			});
		});

		await session.close();
		await closed;
	});

	// #endregion

	// #region remote network
	//
	// In a remote window, tabs load pages through a proxy to the remote. This
	// covers what only Chromium can: its proxying of WebSockets (always over
	// CONNECT), large responses, and that WebRTC sends no direct UDP. The test
	// resolver's remote is this machine, so its loopback is reachable either way.

	(vscode.env.remoteName ? test : test.skip)('remote network carries WebSockets and large responses without direct UDP', async function () {
		this.timeout(60_000);
		let udpPackets = 0;
		const udpServer = dgram.createSocket('udp4');
		udpServer.on('message', () => udpPackets++);
		await new Promise<void>((resolve, reject) => {
			udpServer.once('error', reject);
			udpServer.bind(0, '127.0.0.1', resolve);
		});
		const udpAddress = udpServer.address();
		const largeBytes = 8 * 1024 * 1024;
		const server = http.createServer(async (request, response) => {
			if (request.url === '/large') {
				response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(largeBytes), 'Cache-Control': 'no-store' });
				const chunk = Buffer.alloc(64 * 1024, 0x5a);
				for (let sent = 0; sent < largeBytes; sent += chunk.byteLength) {
					if (!response.write(chunk)) {
						await new Promise<void>(resolve => response.once('drain', resolve));
					}
				}
				response.end();
				return;
			}
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end(`<!DOCTYPE html><title>pending</title><script>
				const results = {};
				const done = (key, value) => {
					results[key] = value;
					if (Object.keys(results).length === 3) {
						document.title = 'ws:' + results.ws + ' large:' + results.large + ' rtc:' + results.rtc;
					}
				};
				const socket = new WebSocket('ws://' + location.host + '/socket');
				socket.onmessage = event => { done('ws', event.data); socket.close(); };
				socket.onerror = () => done('ws', 'error');
				fetch('/large').then(response => response.arrayBuffer()).then(buffer => done('large', buffer.byteLength), () => done('large', 'error'));
				// Gathering against a local STUN server would send it UDP unless WebRTC is confined to the proxy.
				const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${udpAddress.port}' }] });
				peer.createDataChannel('probe');
				const gathered = () => { if (!('rtc' in results)) { peer.close(); done('rtc', 'gathered'); } };
				peer.onicegatheringstatechange = () => peer.iceGatheringState === 'complete' && gathered();
				setTimeout(gathered, 3000);
				peer.createOffer().then(offer => peer.setLocalDescription(offer));
			</script>`);
		});
		// Accepts the WebSocket and sends a single 'ready' text frame.
		const upgraded = new Set<import('stream').Duplex>();
		server.on('upgrade', (request, socket) => {
			upgraded.add(socket);
			const accept = crypto.createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
			socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
			socket.write(Buffer.from([0x81, 5, ...Buffer.from('ready')]));
			socket.on('error', () => { });
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const browserConfig = workspace.getConfiguration('workbench.browser');
		const previousRemoteProxy = browserConfig.inspect<boolean>('enableRemoteProxy')?.globalValue;
		try {
			await browserConfig.update('enableRemoteProxy', true, vscode.ConfigurationTarget.Global);
			const tab = await window.openBrowserTab(`http://127.0.0.1:${address.port}/page`);
			for (let attempt = 0; !tab.title.startsWith('ws:'); attempt++) {
				if (attempt > 300) {
					throw new Error(`Timed out waiting for the page, last title: ${tab.title}`);
				}
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			// Remote tabs append their URL to the title.
			assert.deepStrictEqual({ title: tab.title.replace(/ \(.*\)$/, ''), udpPackets }, { title: `ws:ready large:${largeBytes} rtc:gathered`, udpPackets: 0 });
		} finally {
			await browserConfig.update('enableRemoteProxy', previousRemoteProxy, vscode.ConfigurationTarget.Global);
			upgraded.forEach(socket => socket.destroy());
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
			await new Promise<void>(resolve => udpServer.close(() => resolve()));
		}
	});

	// #endregion

	// #region trusted file:// loading
	//
	// Trust enforcement is exercised by writing a small harness HTML file
	// into the (trusted) workspace folder, opening it in a browser tab, and
	// letting it `fetch(?url=...)` whatever URL the test targets. The
	// harness writes `status:<code>` (or `error:<msg>`) to `document.title`,
	// which we observe via `tab.title`. The harness file itself is created
	// at test time so it doesn't pollute the shared test workspace.
	//
	// Skipped in remote workspaces: the test workspace lives on the remote
	// machine, so the locally-pushed trust list doesn't include its
	// folders and the harness page itself would be blocked.

	(vscode.env.remoteName ? suite.skip : suite)('trusted file:// loading', () => {
		const HARNESS_NAME = 'trust-harness.html';
		const HARNESS_CONTENT = `<!DOCTYPE html>
<html>
<head><title>idle</title></head>
<body>
<script>
(async function () {
	// Use the URL fragment rather than the query string — Chromium's
	// built-in \`file://\` loader rejects URLs with a \`?query\`, but
	// fragments are stripped before the file is read.
	const params = new URLSearchParams(location.hash.slice(1));
	const target = params.get('url');
	if (!target) {
		document.title = 'no-url';
		return;
	}
	try {
		const res = await fetch(target);
		document.title = 'status:' + res.status;
	} catch (err) {
		document.title = 'error:' + (err && err.message || err);
	}
})();
</script>
</body>
</html>`;

		let harnessUri: vscode.Uri | undefined;

		suiteSetup(async () => {
			const folders = workspace.workspaceFolders;
			assert.ok(folders && folders.length > 0, 'expected at least one workspace folder');
			harnessUri = vscode.Uri.joinPath(folders[0].uri, HARNESS_NAME);
			await fs.promises.writeFile(harnessUri.fsPath, HARNESS_CONTENT);
		});

		suiteTeardown(async () => {
			if (harnessUri) {
				await fs.promises.rm(harnessUri.fsPath, { force: true });
				harnessUri = undefined;
			}
		});

		async function fetchFromTrustedHarness(target: string): Promise<string> {
			assert.ok(harnessUri, 'harness must be initialized');
			const url = `${harnessUri.toString()}#url=${encodeURIComponent(target)}`;
			const tab = await window.openBrowserTab(url);

			// Poll `tab.title` for the harness's contract (`status:<n>` or
			// `error:<msg>`). The browser tab decorates the title with the
			// page URL, so callers should check by prefix.
			const deadline = Date.now() + 15_000;
			while (Date.now() < deadline) {
				if (tab.title.startsWith('status:') || tab.title.startsWith('error:')) {
					return tab.title;
				}
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			throw new Error(`Timed out waiting for trust-harness title to update (target=${target}, last title=${tab.title})`);
		}

		test.skip('file:// inside a trusted workspace folder loads', async function () {
			this.timeout(30_000);

			const folders = workspace.workspaceFolders!;
			const trustedTarget = vscode.Uri.joinPath(folders[0].uri, 'index.html').toString();

			const title = await fetchFromTrustedHarness(trustedTarget);
			assert.ok(title.startsWith('status:200'), `Expected status 200 for trusted file, got: ${title}`);
		});

		// Skipped: the test runner always launches with `--disable-workspace-trust`,
		// which makes the browser view trust all `file://` requests (see
		// `trustAllFiles` in `IBrowserViewWindowConfiguration`). Re-enable once the
		// test infrastructure supports running with Workspace Trust enabled.
		test.skip('file:// outside any trusted root is blocked with 403', async function () {
			this.timeout(30_000);

			const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-browser-trust-'));
			const untrustedFile = path.join(tempDir, 'untrusted.html');
			await fs.promises.writeFile(untrustedFile, '<!doctype html><body>should not be reachable</body>');

			try {
				const title = await fetchFromTrustedHarness(vscode.Uri.file(untrustedFile).toString());
				assert.ok(title.startsWith('status:403'), `Expected status 403 for untrusted file, got: ${title}`);
			} finally {
				await fs.promises.rm(tempDir, { recursive: true, force: true });
			}
		});
	});

	// #endregion
});
