/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserSessionFileAccess } from '../../electron-main/browserSessionFileAccess.js';

suite('BrowserSessionFileAccess', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const workspace = URI.file('/canvas-file-trust/workspace');
	const external = URI.file('/canvas-file-trust/explicitly-trusted');
	const outside = URI.file('/canvas-file-trust/private/index.html').toString();

	test('starts denied and leaves non-file network policy independent', () => {
		const access = new BrowserSessionFileAccess();
		assert.deepStrictEqual({
			file: access.getError(outside),
			http: access.getError('https://example.com/canvas'),
			empty: access.getError(''),
		}, {
			file: { url: outside, errorCode: -10, errorDescription: 'ERR_ACCESS_DENIED', fileAccessDenied: true },
			http: undefined,
			empty: undefined,
		});
	});

	test('trusted workspace and explicitly trusted outside folders include relative assets, not sibling prefixes', () => {
		const access = new BrowserSessionFileAccess();
		access.setTrustedFileRoots([workspace.fsPath, external.fsPath], false);
		const page = URI.joinPath(workspace, 'index.html').toString();
		const urls = [
			page,
			new URL('./assets/app.js', page).href,
			new URL('./assets/theme%20dark.css', page).href,
			URI.joinPath(external, 'index.html').toString(),
			URI.joinPath(external, 'images/icon.svg').toString(),
			new URL('../private/index.html', page).href,
			new URL('../workspace-other/index.html', page).href,
			'file:///canvas-file-trust/workspace/%2e%2e/private/index.html',
		];
		assert.deepStrictEqual(urls.map(url => access.isAllowed(url)), [true, true, true, true, true, false, false, false]);
	});

	test('denied protocol requests fail instead of rendering a successful forbidden page', async () => {
		const access = new BrowserSessionFileAccess();
		let forwarded = false;
		const response = await access.handleRequest(new Request(outside), async () => {
			forwarded = true;
			return new Response('must not be read');
		});
		assert.deepStrictEqual({ forwarded, type: response.type, status: response.status, body: await response.text() }, {
			forwarded: false, type: 'error', status: 0, body: '',
		});
	});

	test('allowed file forwarding preserves response content and errors', async () => {
		const access = new BrowserSessionFileAccess();
		access.setTrustedFileRoots([external.fsPath], false);
		const url = URI.joinPath(external, 'assets/theme.css').toString();
		const response = new Response('body { color: blue; }', { headers: { 'content-type': 'text/css' } });
		const result = await access.handleRequest(new Request(url), async () => response);
		const failure = new Error('Controlled missing file');
		await assert.rejects(access.handleRequest(new Request(url), async () => { throw failure; }), error => error === failure);
		assert.deepStrictEqual({ sameResponse: result === response, content: await result.text() }, {
			sameResponse: true, content: 'body { color: blue; }',
		});
	});

	test('revocation blocks the next request and only an explicit new root grant restores access', async () => {
		const access = new BrowserSessionFileAccess();
		const url = URI.joinPath(external, 'index.html').toString();
		access.setTrustedFileRoots([workspace.fsPath, external.fsPath], false);
		const before = access.isAllowed(url);
		access.setTrustedFileRoots([workspace.fsPath], false);
		let reads = 0;
		const denied = await access.handleRequest(new Request(url), async () => {
			reads++;
			return new Response('unexpected');
		});
		access.setTrustedFileRoots([workspace.fsPath, external.fsPath], false);
		assert.deepStrictEqual({ before, denied: denied.type, reads, granted: access.isAllowed(url) }, {
			before: true, denied: 'error', reads: 0, granted: true,
		});
	});

	test('revocation also cancels an in-flight response before delivering its body', async () => {
		const access = new BrowserSessionFileAccess();
		const response = new DeferredPromise<Response>();
		const url = URI.joinPath(external, 'index.html').toString();
		access.setTrustedFileRoots([external.fsPath], false);
		const pending = access.handleRequest(new Request(url), () => response.p);
		access.setTrustedFileRoots([], false);
		let cancelled = false;
		await response.complete(new Response(new ReadableStream({ cancel: () => { cancelled = true; } })));
		const result = await pending;
		assert.deepStrictEqual({ cancelled, type: result.type }, { cancelled: true, type: 'error' });
	});

	test('the existing explicit Workspace Trust disable flag can be removed again', () => {
		const access = new BrowserSessionFileAccess();
		access.setTrustedFileRoots([], true);
		const disabled = access.isAllowed(outside);
		access.setTrustedFileRoots([workspace.fsPath], false);
		assert.deepStrictEqual({ disabled, reenabled: access.isAllowed(outside) }, { disabled: true, reenabled: false });
	});
});
