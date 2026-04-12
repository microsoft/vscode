/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../browser/progressIndicator.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
class TestProgressBar extends ProgressBar {
    constructor() {
        super(...arguments);
        this.fTotal = 0;
        this.fWorked = 0;
        this.fInfinite = false;
        this.fDone = false;
    }
    infinite() {
        this.fDone = null;
        this.fInfinite = true;
        return this;
    }
    total(total) {
        this.fDone = null;
        this.fTotal = total;
        return this;
    }
    hasTotal() {
        return !!this.fTotal;
    }
    worked(worked) {
        this.fDone = null;
        if (this.fWorked) {
            this.fWorked += worked;
        }
        else {
            this.fWorked = worked;
        }
        return this;
    }
    done() {
        this.fDone = true;
        this.fInfinite = null;
        this.fWorked = null;
        this.fTotal = null;
        return this;
    }
    stop() {
        return this.done();
    }
    show() { }
    hide() { }
}
suite('Progress Indicator', () => {
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    test('ScopedProgressIndicator', async () => {
        const testProgressBar = disposables.add(new TestProgressBar(document.createElement('div')));
        const progressScope = disposables.add(new class extends AbstractProgressScope {
            constructor() { super('test.scopeId', true); }
            testOnScopeOpened(scopeId) { super.onScopeOpened(scopeId); }
            testOnScopeClosed(scopeId) { super.onScopeClosed(scopeId); }
        }());
        const testObject = disposables.add(new ScopedProgressIndicator(testProgressBar, progressScope));
        // Active: Show (Infinite)
        let fn = testObject.show(true);
        assert.strictEqual(true, testProgressBar.fInfinite);
        fn.done();
        assert.strictEqual(true, testProgressBar.fDone);
        // Active: Show (Total / Worked)
        fn = testObject.show(100);
        assert.strictEqual(false, !!testProgressBar.fInfinite);
        assert.strictEqual(100, testProgressBar.fTotal);
        fn.worked(20);
        assert.strictEqual(20, testProgressBar.fWorked);
        fn.total(80);
        assert.strictEqual(80, testProgressBar.fTotal);
        fn.done();
        assert.strictEqual(true, testProgressBar.fDone);
        // Inactive: Show (Infinite)
        progressScope.testOnScopeClosed('test.scopeId');
        testObject.show(true);
        assert.strictEqual(false, !!testProgressBar.fInfinite);
        progressScope.testOnScopeOpened('test.scopeId');
        assert.strictEqual(true, testProgressBar.fInfinite);
        // Inactive: Show (Total / Worked)
        progressScope.testOnScopeClosed('test.scopeId');
        fn = testObject.show(100);
        fn.total(80);
        fn.worked(20);
        assert.strictEqual(false, !!testProgressBar.fTotal);
        progressScope.testOnScopeOpened('test.scopeId');
        assert.strictEqual(20, testProgressBar.fWorked);
        assert.strictEqual(80, testProgressBar.fTotal);
        // Acive: Show While
        let p = Promise.resolve(null);
        await testObject.showWhile(p);
        assert.strictEqual(true, testProgressBar.fDone);
        progressScope.testOnScopeClosed('test.scopeId');
        p = Promise.resolve(null);
        await testObject.showWhile(p);
        assert.strictEqual(true, testProgressBar.fDone);
        progressScope.testOnScopeOpened('test.scopeId');
        assert.strictEqual(true, testProgressBar.fDone);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NJbmRpY2F0b3IudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcm9ncmVzcy90ZXN0L2Jyb3dzZXIvcHJvZ3Jlc3NJbmRpY2F0b3IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUV4RixNQUFNLGVBQWdCLFNBQVEsV0FBVztJQUF6Qzs7UUFDQyxXQUFNLEdBQVcsQ0FBQyxDQUFDO1FBQ25CLFlBQU8sR0FBVyxDQUFDLENBQUM7UUFDcEIsY0FBUyxHQUFZLEtBQUssQ0FBQztRQUMzQixVQUFLLEdBQVksS0FBSyxDQUFDO0lBaUR4QixDQUFDO0lBL0NTLFFBQVE7UUFDaEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFFdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRVEsS0FBSyxDQUFDLEtBQWE7UUFDM0IsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFcEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRVEsUUFBUTtRQUNoQixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3RCLENBQUM7SUFFUSxNQUFN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