/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UrlFinder } from '../../browser/urlFinder.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { IDebugService } from '../../../debug/common/debug.js';

// Wait time for debounce tests - should be greater than the UrlFinder debounce timeout (500ms)
const DEBOUNCE_WAIT_MS = 600;

// Mock implementations for testing
class MockTerminalInstance implements IDisposable {
	private readonly _onData = new Emitter<string>();
	readonly onData = this._onData.event;
	readonly title = 'test-terminal';

	fireData(data: string): void {
		this._onData.fire(data);
	}

	dispose(): void {
		this._onData.dispose();
	}
}

suite('UrlFinder', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createMockTerminalService(instances: ITerminalInstance[], localStore: DisposableStore): ITerminalService {
		const onDidCreateInstance = localStore.add(new Emitter<ITerminalInstance>());
		const onDidDisposeInstance = localStore.add(new Emitter<ITerminalInstance>());
		return {
			instances,
			onDidCreateInstance: onDidCreateInstance.event,
			onDidDisposeInstance: onDidDisposeInstance.event,
		} as unknown as ITerminalService;
	}

	function createMockDebugService(localStore: DisposableStore): IDebugService {
		const onDidNewSession = localStore.add(new Emitter<never>());
		const onDidEndSession = localStore.add(new Emitter<never>());
		return {
			onDidNewSession: onDidNewSession.event,
			onDidEndSession: onDidEndSession.event,
		} as unknown as IDebugService;
	}

	test('should debounce terminal data processing', async () => {
		const store = ds.add(new DisposableStore());
		const mockInstance = store.add(new MockTerminalInstance());
		const terminalService = createMockTerminalService([mockInstance as unknown as ITerminalInstance], store);
		const debugService = createMockDebugService(store);

		const urlFinder = store.add(new UrlFinder(terminalService, debugService));

		const matchedUrls: { host: string; port: number }[] = [];
		store.add(urlFinder.onDidMatchLocalUrl((url: { host: string; port: number }) => matchedUrls.push(url)));

		// Fire data events rapidly - data is accumulated and processed together after debounce
		mockInstance.fireData('http://localhost:3000/\n');
		mockInstance.fireData('http://127.0.0.1:8080/\n');

		// Initially, no matches should be processed (debounced)
		assert.strictEqual(matchedUrls.length, 0, 'URLs should not be processed immediately');

		// Wait for debounce timeout
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

		// Both URLs should be processed after debounce
		assert.strictEqual(matchedUrls.length, 2, 'Both URLs should be processed after debounce');
		assert.strictEqual(matchedUrls[0].host, 'localhost');
		assert.strictEqual(matchedUrls[0].port, 3000);
		assert.strictEqual(matchedUrls[1].host, '127.0.0.1');
		assert.strictEqual(matchedUrls[1].port, 8080);
	});

	test('should skip processing when data exceeds threshold', async () => {
		const store = ds.add(new DisposableStore());
		const mockInstance = store.add(new MockTerminalInstance());
		const terminalService = createMockTerminalService([mockInstance as unknown as ITerminalInstance], store);
		const debugService = createMockDebugService(store);

		const urlFinder = store.add(new UrlFinder(terminalService, debugService));

		const matchedUrls: { host: string; port: number }[] = [];
		store.add(urlFinder.onDidMatchLocalUrl((url: { host: string; port: number }) => matchedUrls.push(url)));

		// Fire a valid URL
		mockInstance.fireData('http://localhost:3000/');

		// Then flood with lots of data (simulating high-throughput like games)
		// Generate 10001 characters to exceed the 10000 character threshold (uses > comparison)
		const largeData = 'x'.repeat(10001);
		mockInstance.fireData(largeData);

		// Wait for debounce timeout
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

		// URL should not be processed because total data exceeded threshold
		assert.strictEqual(matchedUrls.length, 0, 'URLs should not be processed when data exceeds threshold');
	});

	test('should find localhost URLs', async () => {
		const store = ds.add(new DisposableStore());
		const mockInstance = store.add(new MockTerminalInstance());
		const terminalService = createMockTerminalService([mockInstance as unknown as ITerminalInstance], store);
		const debugService = createMockDebugService(store);

		const urlFinder = store.add(new UrlFinder(terminalService, debugService));

		const matchedUrls: { host: string; port: number }[] = [];
		store.add(urlFinder.onDidMatchLocalUrl((url: { host: string; port: number }) => matchedUrls.push(url)));

		mockInstance.fireData('Server running at http://localhost:3000/');

		// Wait for debounce timeout
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

		assert.strictEqual(matchedUrls.length, 1);
		assert.strictEqual(matchedUrls[0].host, 'localhost');
		assert.strictEqual(matchedUrls[0].port, 3000);
	});

	test('should find 127.0.0.1 URLs', async () => {
		const store = ds.add(new DisposableStore());
		const mockInstance = store.add(new MockTerminalInstance());
		const terminalService = createMockTerminalService([mockInstance as unknown as ITerminalInstance], store);
		const debugService = createMockDebugService(store);

		const urlFinder = store.add(new UrlFinder(terminalService, debugService));

		const matchedUrls: { host: string; port: number }[] = [];
		store.add(urlFinder.onDidMatchLocalUrl((url: { host: string; port: number }) => matchedUrls.push(url)));

		mockInstance.fireData('https://127.0.0.1:5001/api');

		// Wait for debounce timeout
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

		assert.strictEqual(matchedUrls.length, 1);
		assert.strictEqual(matchedUrls[0].host, '127.0.0.1');
		assert.strictEqual(matchedUrls[0].port, 5001);
	});

	test('should find 0.0.0.0 URLs', async () => {
		const store = ds.add(new DisposableStore());
		const mockInstance = store.add(new MockTerminalInstance());
		const terminalService = createMockTerminalService([mockInstance as unknown as ITerminalInstance], store);
		const debugService = createMockDebugService(store);

		const urlFinder = store.add(new UrlFinder(terminalService, debugService));

		const matchedUrls: { host: string; port: number }[] = [];
		store.add(urlFinder.onDidMatchLocalUrl((url: { host: string; port: number }) => matchedUrls.push(url)));

		mockInstance.fireData('http://0.0.0.0:4000');

		// Wait for debounce timeout
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

		assert.strictEqual(matchedUrls.length, 1);
		assert.strictEqual(matchedUrls[0].host, '0.0.0.0');
		assert.strictEqual(matchedUrls[0].port, 4000);
	});
});
