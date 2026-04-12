/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore, DisposableTracker, setDisposableTracker } from '../../common/lifecycle.js';
import { join } from '../../common/path.js';
import { isWindows } from '../../common/platform.js';
import { URI } from '../../common/uri.js';
export function toResource(path) {
    if (isWindows) {
        return URI.file(join('C:\\', btoa(this.test.fullTitle()), path));
    }
    return URI.file(join('/', btoa(this.test.fullTitle()), path));
}
export function suiteRepeat(n, description, callback) {
    for (let i = 0; i < n; i++) {
        suite(`${description} (iteration ${i})`, callback);
    }
}
export function testRepeat(n, description, callback) {
    for (let i = 0; i < n; i++) {
        test(`${description} (iteration ${i})`, callback);
    }
}
export async function assertThrowsAsync(block, message = 'Missing expected exception') {
    try {
        await block();
    }
    catch {
        return;
    }
    const err = message instanceof Error ? message : new Error(message);
    throw err;
}
/**
 * Use this function to ensure that all disposables are cleaned up at the end of each test in the current suite.
 *
 * Use `markAsSingleton` if disposable singletons are created lazily that are allowed to outlive the test.
 * Make sure that the singleton properly registers all child disposables so that they are excluded too.
 *
 * @returns A {@link DisposableStore} that can optionally be used to track disposables in the test.
 * This will be automatically disposed on test teardown.
*/
export function ensureNoDisposablesAreLeakedInTestSuite() {
    let tracker;
    let store;
    setup(() => {
        store = new DisposableStore();
        tracker = new DisposableTracker();
        setDisposableTracker(tracker);
    });
    teardown(function () {
        store.dispose();
        setDisposableTracker(null);
        if (this.currentTest?.state !== 'failed') {
            const result = tracker.computeLeakingDisposables();
            if (result) {
                console.error(result.details);
                throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
            }
        }
    });
    // Wrap store as the suite function is called before it's initialized
    const testContext = {
        add(o) {
            return store.add(o);
        }
    };
    return testContext;
}
export function throwIfDisposablesAreLeaked(body, logToConsole = true) {
    const tracker = new DisposableTracker();
    setDisposableTracker(tracker);
    body();
    setDisposableTracker(null);
    computeLeakingDisposables(tracker, logToConsole);
}
export async function throwIfDisposablesAreLeakedAsync(body) {
    const tracker = new DisposableTracker();
    setDisposableTracker(tracker);
    await body();
    setDisposableTracker(null);
    computeLeakingDisposables(tracker);
}
function computeLeakingDisposables(tracker, logToConsole = true) {
    const result = tracker.computeLeakingDisposables();
    if (result) {
        if (logToConsole) {
            console.error(result.details);
        }
        throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQWUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNsSCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDNUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUkxQyxNQUFNLFVBQVUsVUFBVSxDQUFZLElBQVk7SUFDakQsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUNmLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9ELENBQUM7QUFFRCxNQUFNLFVBQVUsV0FBVyxDQUFDLENBQVMsRUFBRSxXQUFtQixFQUFFLFFBQTZCO0lBQ3hGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUM1QixLQUFLLENBQUMsR0FBRyxXQUFXLGVBQWUsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDcEQsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFN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