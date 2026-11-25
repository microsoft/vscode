/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ipcRenderer } from 'electron';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createManagedRemoteResourceRequestHandler } from '../../electron-main/managedRemoteResourceProtocol.js';

suite('ProtocolMainService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRequest(authority: string): GlobalRequest {
		return new Request(URI.from({
			scheme: Schemas.vscodeManagedRemoteResource,
			authority,
			path: '/resource.txt',
		}).toString());
	}

	async function summarize(response: GlobalResponse) {
		return {
			statusCode: response.status,
			data: await response.text(),
			mimeType: response.headers.get('Content-Type'),
		};
	}

	test('loads workbench requests with an empty referrer', async () => {
		const requested: URI[] = [];
		const handler = createManagedRemoteResourceRequestHandler(async url => {
			requested.push(url);
			return {
				statusCode: 200,
				body: Buffer.from('content').toString('base64'),
				mimeType: 'text/plain',
			};
		}, store.add(new NullLogService()));

		const response = await handler(createRequest('window:7'));

		assert.deepStrictEqual({
			response: await summarize(response),
			requested: requested.map(url => url.toString()),
		}, {
			response: {
				statusCode: 200,
				data: 'content',
				mimeType: 'text/plain',
			},
			requested: ['vscode-managed-remote-resource://window:7/resource.txt'],
		});
	});

	test('returns buffer data for error responses', async () => {
		let requestCount = 0;
		const handler = createManagedRemoteResourceRequestHandler(async () => {
			requestCount++;
			throw new Error('failed');
		}, store.add(new NullLogService()));

		const notFound = await handler(createRequest('invalid'));
		const failed = await handler(createRequest('window:7'));

		assert.deepStrictEqual({
			notFound: await summarize(notFound),
			failed: await summarize(failed),
			requestCount,
		}, {
			notFound: {
				statusCode: 404,
				data: 'Not found',
				mimeType: 'text/plain;charset=UTF-8',
			},
			failed: {
				statusCode: 500,
				data: '',
				mimeType: null,
			},
			requestCount: 1,
		});
	});

	test('loads vscode-remote-resource with workbench CORS headers', async function () {
		this.timeout(15_000);
		const response = await ipcRenderer.invoke('vscode:test-remote-resource');

		assert.deepStrictEqual(response, {
			loaded: true,
			requestHeaders: {
				origin: 'vscode-file://vscode-app',
				secFetchMode: 'cors',
			},
		});
	});

	test('opts trusted editor and Agents shell documents into JavaScript stack sampling', async () => {
		const roots = {
			appRoot: URI.file('/stack-policy-test/app').fsPath,
			extensionsPath: URI.file('/stack-policy-test/extensions').fsPath,
			globalStorageHome: URI.file('/stack-policy-test/storage').fsPath,
			workspaceStorageHome: URI.file('/stack-policy-test/workspaces').fsPath,
		};
		const cases = [
			{ path: join(roots.appRoot, 'out/vs/code/electron-browser/workbench/workbench.html'), expected: true },
			{ path: join(roots.appRoot, 'out/vs/code/electron-browser/workbench/workbench-dev.html'), expected: true },
			{ path: join(roots.appRoot, 'out/vs/sessions/electron-browser/sessions.html'), expected: true },
			{ path: join(roots.appRoot, 'out/vs/sessions/electron-browser/sessions-dev.html'), expected: true },
			{ path: join(roots.appRoot, 'out/vs/sessions/electron-browser/other.html'), expected: false },
			{ path: join(roots.extensionsPath, 'extension/sessions.html'), expected: false },
			{ path: join(roots.globalStorageHome, 'sessions-dev.html'), expected: false },
			{ path: join(roots.appRoot, 'extensions/example/sessions.html'), expected: false },
		];
		const results = await Promise.all(cases.map(async testCase => {
			const response: { status: number; headers?: Record<string, string>; errors: string[] } = await ipcRenderer.invoke(
				'vscode:test-file-resource', FileAccess.uriToBrowserUri(URI.file(testCase.path)).toString(true), roots);
			return { status: response.status, policy: response.headers?.['Document-Policy'], errors: response.errors };
		}));
		assert.deepStrictEqual(results, cases.map(testCase => ({
			status: 200, policy: testCase.expected ? 'include-js-call-stacks-in-crash-reports' : undefined, errors: [],
		})));
	});

	test('collects a JavaScript stack from an Agents shell document', async function () {
		this.timeout(15_000);
		const roots = {
			appRoot: URI.file('/stack-sampling-test/app').fsPath,
			extensionsPath: URI.file('/stack-sampling-test/extensions').fsPath,
			globalStorageHome: URI.file('/stack-sampling-test/storage').fsPath,
			workspaceStorageHome: URI.file('/stack-sampling-test/workspaces').fsPath,
		};
		const resource = URI.file(join(roots.appRoot, 'out/vs/sessions/electron-browser/sessions-dev.html'));
		const response: { stack: string } = await ipcRenderer.invoke('vscode:test-file-resource', FileAccess.uriToBrowserUri(resource).toString(true), roots, { sampleStack: true });
		assert.ok(response.stack.includes('stackSamplingProbe'), `Expected the sampled JavaScript frame, got ${response.stack}`);
	});
});
