/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { AbstractProgressScope, ScopedProgressIndicator } from 'vs/workbench/services/progress/browser/progressIndicator';

class TestProgressBar {
	fTotal: number = 0;
	fWorked: number = 0;
	fInfinite: boolean = false;
	fDone: boolean = false;

	infinite() {
		this.fDone = null!;
		this.fInfinite = true;

		return this;
	}

	total(total: number) {
		this.fDone = null!;
		this.fTotal = total;

		return this;
	}

	hasTotal() {
		return !!this.fTotal;
	}

	worked(worked: number) {
		this.fDone = null!;

		if (this.fWorked) {
			this.fWorked += worked;
		} else {
			this.fWorked = worked;
		}

		return this;
	}

	done() {
		this.fDone = true;

		this.fInfinite = null!;
		this.fWorked = null!;
		this.fTotal = null!;

		return this;
	}

	stop() {
		return this.done();
	}

	show(): void { }

	hide(): void { }
}

suite('Progress Indicator', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('ScopedProgressIndicator', async () => {
		const testProgressBar = new TestProgressBar();
		const progressScope = disposables.add(new class extends AbstractProgressScope {
			constructor() { super('test.scopeId', true); }
			testOnScopeOpened(scopeId: string) { super.onScopeOpened(scopeId); }
			testOnScopeClosed(scopeId: string): void { super.onScopeClosed(scopeId); }
		}());
		const testObject = disposables.add(new ScopedProgressIndicator((<any>testProgressBar), progressScope));

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
