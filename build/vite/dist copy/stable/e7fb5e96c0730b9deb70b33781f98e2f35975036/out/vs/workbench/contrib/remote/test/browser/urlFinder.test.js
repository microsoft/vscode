/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { UrlFinder } from '../../browser/urlFinder.js';
// Wait time for debounce tests - should be greater than the UrlFinder debounce timeout (500ms)
const DEBOUNCE_WAIT_MS = 600;
// Mock implementations for testing
class MockTerminalInstance {
    constructor() {
        this._onData = new Emitter();
        this.onData = this._onData.event;
        this.title = 'test-terminal';
    }
    fireData(data) {
        this._onData.fire(data);
    }
    dispose() {
        this._onData.dispose();
    }
}
suite('UrlFinder', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    function createMockTerminalService(instances, localStore) {
        const onDidCreateInstance = localStore.add(new Emitter());
        const onDidDisposeInstance = localStore.add(new Emitter());
        return {
            instances,
            onDidCreateInstance: onDidCreateInstance.event,
            onDidDisposeInstance: onDidDisposeInstance.event,
        };
    }
    function createMockDebugService(localStore) {
        const onDidNewSession = localStore.add(new Emitter());
        const onDidEndSession = localStore.add(new Emitter());
        return {
            onDidNewSession: onDidNewSession.event,
            onDidEndSession: onDidEndSession.event,
        };
    }
    test('should debounce terminal data processing', async () => {
        const store = ds.add(new DisposableStore());
        const mockInstance = store.add(new MockTerminalInstance());
        const terminalService = createMockTerminalService([mockInstance], store);
        const debugService = createMockDebugService(store);
        const urlFinder = store.add(new UrlFinder(terminalService, debugService));
        const matchedUrls = [];
        store.add(urlFinder.onDidMatchLocalUrl((url) => matchedUrls.push(url)));
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
        const terminalService = createMockTerminalService([mockInstance], store);
        const debugService = createMockDebugService(store);
        const urlFinder = store.add(new UrlFinder(terminalService, debugService));
        const matchedUrls = [];
        store.add(urlFinder.onDidMatchLocalUrl((url) => matchedUrls.push(url)));
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
        const terminalService = createMockTerminalService([mockInstance], store);
        const debugService = createMockDebugService(store);
        const urlFinder = store.add(new UrlFinder(terminalService, debugService));
        const matchedUrls = [];
        store.add(urlFinder.onDidMatchLocalUrl((url) => matchedUrls.push(url)));
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
        const terminalService = createMockTerminalService([mockInstance], store);
        const debugService = createMockDebugService(store);
        const urlFinder = store.add(new UrlFinder(terminalService, debugService));
        const matchedUrls = [];
        store.add(urlFinder.onDidMatchLocalUrl((url) => matchedUrls.push(url)));
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
        const terminalService = createMockTerminalService([mockInstance], store);
        const debugService = createMockDebugService(store);
        const urlFinder = store.add(new UrlFinder(terminalService, debugService));
        const matchedUrls = [];
        store.add(urlFinder.onDidMatchLocalUrl((url) => matchedUrls.push(url)));
        mockInstance.fireData('http://0.0.0.0:4000');
        // Wait for debounce timeout
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));
        assert.strictEqual(matchedUrls.length, 1);
        assert.strictEqual(matchedUrls[0].host, '0.0.0.0');
        assert.strictEqual(matchedUrls[0].port, 4000);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsRmluZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9yZW1vdGUvdGVzdC9icm93c2VyL3VybEZpbmRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl2RCwrRkFBK0Y7QUFDL0YsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLENBQUM7QUFFN0IsbUNBQW1DO0FBQ25DLE1BQU0sb0JBQW9CO0lBQTFCO1FBQ2tCLFlBQU8sR0FBRyxJQUFJLE9BQU8sRUFBVSxDQUFDO1FBQ3hDLFdBQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUM1QixVQUFLLEdBQUcsZUFBZSxDQUFDO0lBU2xDLENBQUM7SUFQQSxRQUFRLENBQUMsSUFBWTtRQUNwQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDeEIsQ0FBQztDQUNEO0FBRUQsS0FBSyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7SUFDdkIsTUFBTSxFQUFFLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVyRCxTQUFTLHlCQUF5QixDQUFDLFNBQThCLEVBQUUsVUFBMkI7UUFDN0YsTUFBTSxtQkFBbUIsR0FBRyxVQUFV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