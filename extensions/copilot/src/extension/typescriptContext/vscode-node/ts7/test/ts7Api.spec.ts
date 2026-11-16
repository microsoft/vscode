/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import type { API } from '@typescript/native/async';
import type { TypeScriptSDK } from '@typescript/native/vscode';
import { afterAll, afterEach, suite, test } from 'vitest';
import * as vscode from 'vscode';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { DeferredPromise } from '../../../../../util/vs/base/common/async';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { TypeScript7Connection } from '../ts7Api';

suite('TypeScript 7 connection', () => {
	const store = new DisposableStore();

	afterEach(() => store.clear());
	afterAll(() => store.dispose());

	test('connects only to language servers that provide the TypeScript 7.1 API', async () => {
		const servers: [string, TypeScriptSDK | undefined][] = [
			['7.1 prerelease', createSdk('7.1.0-dev.20261105.1')],
			['7.1 without patch version', createSdk('7.1')],
			['8.0', createSdk('8.0.0')],
			['7.0', createSdk('7.0.2')],
			['unrecognized version', createSdk('v7.1.0')],
			['build from source', createSdk('local')],
			['extension without SDK', undefined],
		];

		const actual = [];
		for (const [server, sdk] of servers) {
			const logService = new RecordingLogService();
			const extensionApi = new TestExtensionApi();
			extensionApi.initialize(sdk);
			const connection = store.add(new TypeScript7Connection(logService, () => [{ activate: async () => extensionApi }], new TestConnector().connect));
			const connected = await connection.getApi() !== undefined;
			await connection.getApi();
			actual.push({ server, connected, warnings: logService.warnings });
		}

		const warning = (reason: string) => `TypeScript 7 support requires a language server with the TypeScript 7.1 API, but ${reason}.`;
		assert.deepStrictEqual(actual, [
			{ server: '7.1 prerelease', connected: true, warnings: [] },
			{ server: '7.1 without patch version', connected: true, warnings: [] },
			{ server: '8.0', connected: true, warnings: [] },
			{ server: '7.0', connected: false, warnings: [warning('the language server is version 7.0.2')] },
			{ server: 'unrecognized version', connected: false, warnings: [warning('the language server is version v7.1.0')] },
			{ server: 'build from source', connected: false, warnings: [warning('the language server version is unknown')] },
			{ server: 'extension without SDK', connected: false, warnings: [warning('the TypeScript 7 extension is too old')] },
		]);
	});

	test('skips extensions without an API and reconnects whenever the language server initializes again', async () => {
		const logService = new RecordingLogService();
		const extensionApi = new TestExtensionApi();
		const connector = new TestConnector();
		const sdkOnlyExtension = { activate: async () => undefined };
		const connection = store.add(new TypeScript7Connection(logService, () => [sdkOnlyExtension, { activate: async () => extensionApi }], connector.connect));
		let reconnects = 0;
		store.add(connection.onDidReconnect(() => reconnects++));
		const steps: { connected: boolean; reconnects: number }[] = [];
		const step = async () => {
			steps.push({ connected: await connection.getApi() !== undefined, reconnects });
		};

		extensionApi.initialize(createSdk('7.1.0', 'first'));
		await step();
		extensionApi.initialize(createSdk('7.1.0', 'second'));
		await step();
		extensionApi.initialize(createSdk('7.0.2', 'third'));
		await step();

		assert.deepStrictEqual({ steps, connected: connector.connected, closed: connector.closed, warnings: logService.warnings.length }, {
			steps: [
				{ connected: true, reconnects: 0 },
				{ connected: true, reconnects: 1 },
				{ connected: false, reconnects: 2 },
			],
			connected: ['first', 'second'],
			closed: ['first', 'second'],
			warnings: 1,
		});
	});

	test('tells callers that found no API to get it again when the language server initializes', async () => {
		const extensionApi = new TestExtensionApi();
		const connector = new TestConnector();
		const connection = store.add(new TypeScript7Connection(new RecordingLogService(), () => [{ activate: async () => extensionApi }], connector.connect));
		// Like the registration of the TypeScript context provider, which checks once and again when told to.
		let retry: Promise<API<true> | undefined> | undefined;
		store.add(connection.onDidReconnect(() => {
			retry = connection.getApi();
		}));

		const first = await connection.getApi();
		extensionApi.initialize(createSdk('7.1.0', 'late'));

		assert.deepStrictEqual({ first, retried: await retry !== undefined, connected: connector.connected }, {
			first: undefined,
			retried: true,
			connected: ['late'],
		});
	});

	test('retries with the latest language server when connecting to the previous one fails', async () => {
		const logService = new RecordingLogService();
		const extensionApi = new TestExtensionApi();
		const connector = new TestConnector();
		const connection = store.add(new TypeScript7Connection(logService, () => [{ activate: async () => extensionApi }], connector.connect));
		const connecting = new DeferredPromise<void>();
		const previousPipe = new DeferredPromise<string>();
		extensionApi.initialize({
			...createSdk('7.1.0'),
			initializeAPIConnection: () => {
				void connecting.complete();
				return previousPipe.p;
			},
		});
		let retry: Promise<API<true> | undefined> | undefined;
		store.add(connection.onDidReconnect(() => {
			retry = connection.getApi();
		}));

		const first = connection.getApi();
		await connecting.p;
		extensionApi.initialize(createSdk('7.1.0', 'latest'));
		void previousPipe.error(new Error('The selected TypeScript installation has changed.'));

		assert.deepStrictEqual({ first: await first !== undefined, retried: await retry !== undefined, connected: connector.connected, errors: logService.errors }, {
			first: true,
			retried: true,
			connected: ['latest'],
			errors: [],
		});
	});
});

function createSdk(version: string, pipe: string = version): TypeScriptSDK {
	return {
		version,
		packageJsonPath: undefined,
		isCurrent: () => true,
		initializeAPIConnection: async () => pipe,
		importModule: async () => {
			throw new Error('Copilot uses its own TypeScript 7 client');
		},
	};
}

/**
 * Like the TypeScript 7 extension, invokes new listeners immediately if the language server has already initialized.
 */
class TestExtensionApi {
	private readonly onDidInitialize = new vscode.EventEmitter<TypeScriptSDK | undefined>();
	private initialized: { sdk: TypeScriptSDK | undefined } | undefined;

	readonly onLanguageServerInitialized = (listener: (sdk: TypeScriptSDK | undefined) => void) => {
		const subscription = this.onDidInitialize.event(listener);
		if (this.initialized !== undefined) {
			listener(this.initialized.sdk);
		}
		return subscription;
	};

	initialize(sdk: TypeScriptSDK | undefined): void {
		this.initialized = { sdk };
		this.onDidInitialize.fire(sdk);
	}
}

class TestConnector {
	readonly connected: string[] = [];
	readonly closed: string[] = [];

	readonly connect = async (pipe: string): Promise<API<true>> => {
		this.connected.push(pipe);
		return { close: async () => { this.closed.push(pipe); } } as API<true>;
	};
}

class RecordingLogService extends TestLogService {
	readonly warnings: string[] = [];
	readonly errors: string[] = [];

	override warn(message: string): void {
		this.warnings.push(message);
	}

	override error(error: string | Error, message?: string): void {
		this.errors.push(message ?? String(error));
	}
}
