/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken, CancellationTokenSource, CancellationTokenPool } from '../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('CancellationToken', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('None', () => {
        assert.strictEqual(CancellationToken.None.isCancellationRequested, false);
        assert.strictEqual(typeof CancellationToken.None.onCancellationRequested, 'function');
    });
    test('cancel before token', function () {
        const source = new CancellationTokenSource();
        assert.strictEqual(source.token.isCancellationRequested, false);
        source.cancel();
        assert.strictEqual(source.token.isCancellationRequested, true);
        return new Promise(resolve => {
            source.token.onCancellationRequested(() => resolve());
        });
    });
    test('cancel happens only once', function () {
        const source = new CancellationTokenSource();
        assert.strictEqual(source.token.isCancellationRequested, false);
        let cancelCount = 0;
        function onCancel() {
            cancelCount += 1;
        }
        store.add(source.token.onCancellationRequested(onCancel));
        source.cancel();
        source.cancel();
        assert.strictEqual(cancelCount, 1);
    });
    test('cancel calls all listeners', function () {
        let count = 0;
        const source = new CancellationTokenSource();
        store.add(source.token.onCancellationRequested(() => count++));
        store.add(source.token.onCancellationRequested(() => count++));
        store.add(source.token.onCancellationRequested(() => count++));
        source.cancel();
        assert.strictEqual(count, 3);
    });
    test('token stays the same', function () {
        let source = new CancellationTokenSource();
        let token = source.token;
        assert.ok(token === source.token); // doesn't change on get
        source.cancel();
        assert.ok(token === source.token); // doesn't change after cancel
        source.cancel();
        assert.ok(token === source.token); // doesn't change after 2nd cancel
        source = new CancellationTokenSource();
        source.cancel();
        token = source.token;
        assert.ok(token === source.token); // doesn't change on get
    });
    test('dispose calls no listeners', function () {
        let count = 0;
        const source = new CancellationTokenSource();
        store.add(source.token.onCancellationRequested(() => count++));
        source.dispose();
        source.cancel();
        assert.strictEqual(count, 0);
    });
    test('dispose calls no listeners (unless told to cancel)', function () {
        let count = 0;
        const source = new CancellationTokenSource();
        store.add(source.token.onCancellationRequested(() => count++));
        source.dispose(true);
        // source.cancel();
        assert.strictEqual(count, 1);
    });
    test('dispose does not cancel', function () {
        const source = new CancellationTokenSource();
        source.dispose();
        assert.strictEqual(source.token.isCancellationRequested, false);
    });
    test('parent cancels child', function () {
        const parent = new CancellationTokenSource();
        const child = new CancellationTokenSource(parent.token);
        let count = 0;
        store.add(child.token.onCancellationRequested(() => count++));
        parent.cancel();
        assert.strictEqual(count, 1);
        assert.strictEqual(child.token.isCancellationRequested, true);
        assert.strictEqual(parent.token.isCancellationRequested, true);
        child.dispose();
        parent.dispose();
    });
});
suite('CancellationTokenPool', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('empty pool token is not cancelled', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        assert.strictEqual(pool.token.isCancellationRequested, false);
    });
    test('pool token cancels when all tokens are cancelled', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source1 = new CancellationTokenSource();
        const source2 = new CancellationTokenSource();
        const source3 = new CancellationTokenSource();
        pool.add(source1.token);
        pool.add(source2.token);
        pool.add(source3.token);
        assert.strictEqual(pool.token.isCancellationRequested, false);
        source1.cancel();
        assert.strictEqual(pool.token.isCancellationRequested, false);
        source2.cancel();
        assert.strictEqual(pool.token.isCancellationRequested, false);
        source3.cancel();
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source1.dispose();
        source2.dispose();
        source3.dispose();
    });
    test('pool token fires cancellation event when all tokens are cancelled', function () {
        return new Promise(resolve => {
            const pool = new CancellationTokenPool();
            store.add(pool);
            const source1 = new CancellationTokenSource();
            const source2 = new CancellationTokenSource();
            pool.add(source1.token);
            pool.add(source2.token);
            store.add(pool.token.onCancellationRequested(() => resolve()));
            source1.cancel();
            source2.cancel();
            source1.dispose();
            source2.dispose();
        });
    });
    test('adding already cancelled token counts immediately', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source1 = new CancellationTokenSource();
        const source2 = new CancellationTokenSource();
        source1.cancel(); // Cancel before adding to pool
        pool.add(source1.token);
        assert.strictEqual(pool.token.isCancellationRequested, true); // 1 of 1 cancelled, so pool is cancelled
        pool.add(source2.token); // Adding after pool is done should have no effect
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source2.cancel(); // This should have no effect since pool is already done
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source1.dispose();
        source2.dispose();
    });
    test('adding single already cancelled token cancels pool immediately', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source = new CancellationTokenSource();
        source.cancel();
        pool.add(source.token);
        assert.strictEqual(pool.token.isCancellationRequested, true); // 1 of 1 cancelled
        source.dispose();
    });
    test('adding token after pool is done has no effect', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source1 = new CancellationTokenSource();
        const source2 = new CancellationTokenSource();
        pool.add(source1.token);
        source1.cancel(); // Pool should be done now
        assert.strictEqual(pool.token.isCancellationRequested, true);
        // Adding another token should have no effect
        pool.add(source2.token);
        source2.cancel();
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source1.dispose();
        source2.dispose();
    });
    test('single token pool behaviour', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source = new CancellationTokenSource();
        pool.add(source.token);
        assert.strictEqual(pool.token.isCancellationRequested, false);
        source.cancel();
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source.dispose();
    });
    test('pool with only cancelled tokens', function () {
        const pool = new CancellationTokenPool();
        store.add(pool);
        const source1 = new CancellationTokenSource();
        const source2 = new CancellationTokenSource();
        source1.cancel();
        source2.cancel();
        pool.add(source1.token);
        pool.add(source2.token);
        assert.strictEqual(pool.token.isCancellationRequested, true);
        source1.dispose();
        source2.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FuY2VsbGF0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2NhbmNlbGxhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqSCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLG1CQUFtQixFQUFFO0lBRTFCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7UUFDakIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLGlCQUFpQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN2RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRTtRQUUzQixNQUFNLE1BQU0sR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUVoQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFL0QsT0FBTyxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRTtZ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