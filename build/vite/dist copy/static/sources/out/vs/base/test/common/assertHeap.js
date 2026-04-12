/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let currentTest;
const snapshotsToAssert = [];
setup(function () {
    currentTest = this.currentTest;
});
suiteTeardown(async () => {
    await Promise.all(snapshotsToAssert.map(async (snap) => {
        const counts = await snap.counts;
        const asserts = Object.entries(snap.opts.classes);
        if (asserts.length !== counts.length) {
            throw new Error(`expected class counts to equal assertions length for ${snap.test}`);
        }
        for (const [i, [name, doAssert]] of asserts.entries()) {
            try {
                doAssert(counts[i]);
            }
            catch (e) {
                throw new Error(`Unexpected number of ${name} instances (${counts[i]}) after "${snap.test}":\n\n${e.message}\n\nSnapshot saved at: ${snap.file}`);
            }
        }
    }));
    snapshotsToAssert.length = 0;
});
const snapshotMinTime = 20_000;
/**
 * Takes a heap snapshot, and asserts the state of classes in memory. This
 * works in Node and the Electron sandbox, but is a no-op in the browser.
 * Snapshots are process asynchronously and will report failures at the end of
 * the suite.
 *
 * This method should be used sparingly (e.g. once at the end of a suite to
 * ensure nothing leaked before), as gathering a heap snapshot is fairly
 * slow, at least until V8 11.5.130 (https://v8.dev/blog/speeding-up-v8-heap-snapshots).
 *
 * Takes options containing a mapping of class names, and assertion functions
 * to run on the number of retained instances of that class. For example:
 *
 * ```ts
 * assertSnapshot({
 *	classes: {
 *		ShouldNeverLeak: count => assert.strictEqual(count, 0),
 *		SomeSingleton: count => assert(count <= 1),
 *	}
 *});
 * ```
 */
export async function assertHeap(opts) {
    if (!currentTest) {
        throw new Error('assertSnapshot can only be used when a test is running');
    }
    // snapshotting can take a moment, ensure the test timeout is decently long
    // so it doesn't immediately fail.
    if (currentTest.timeout() < snapshotMinTime) {
        currentTest.timeout(snapshotMinTime);
    }
    if (typeof __analyzeSnapshotInTests === 'undefined') {
        return; // running in browser, no-op
    }
    const { done, file } = await __analyzeSnapshotInTests(currentTest.fullTitle(), Object.keys(opts.classes));
    snapshotsToAssert.push({ counts: done, file, test: currentTest.fullTitle(), opts });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXJ0SGVhcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vYXNzZXJ0SGVhcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxJQUFJLFdBQW1DLENBQUM7QUFFeEMsTUFBTSxpQkFBaUIsR0FBZ0csRUFBRSxDQUFDO0FBRTFILEtBQUssQ0FBQztJQUNMLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ2hDLENBQUMsQ0FBQyxDQUFDO0FBRUgsYUFBYSxDQUFDLEtBQUssSUFBSSxFQUFFO0lBQ3hCLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLElBQUksRUFBQyxFQUFFO1FBQ3BELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUVqQyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEQsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN0RixDQUFDO1FBRUQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDdkQsSUFBSSxDQUFDO2dCQUNKLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQixDQUFDO1lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDWixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixJQUFJLGVBQWUsTUFBTSxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLE9BQU8sMEJBQTBCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ25KLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDOUIsQ0FBQyxDQUFDLENBQUM7QUFNSCxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUM7QUFFL0I7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXFCRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQTRCO0lBQzVELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVELDJFQUEyRTtJQUMzRSxrQ0FBa0M7SUFDbEMsSUFBSSxXQUFXLENBQUMsT0FBTyxFQUFFLEdBQUcsZUFBZSxFQUFFLENBQUM7UUFDN0MsV0FBVyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxPQUFPLHdCQUF3QixLQUFLLFdBQVcsRUFBRSxDQUFDO1FBQ3JELE9BQU8sQ0FBQyw0QkFBNEI7SUFDckMsQ0FBQztJQUVELE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSx3QkFBd0IsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUMxRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFDckYsQ0FBQyJ9