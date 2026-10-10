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
	fTotal: number = 0;
	fWorked: number = 0;
	fInfinite: boolean = false;
	fDone: boolean = false;
	fShowDelay: number | undefined = undefined;

	override infinite() {
		this.fDone = null!;
		this.fInfinite = true;

		return this;
	}

	override total(total: number) {
		this.fDone = null!;
		this.fTotal = total;

		return this;
	}

	override hasTotal() {
		return !!this.fTotal;
	}

	override worked(worked: number) {
		this.fDone = null!;

		if (this.fWorked) {
			this.fWorked += worked;
		} else {
			this.fWorked = worked;
		}

		return this;
	}

	override done() {
		this.fDone = true;

		this.fInfinite = null!;
		this.fWorked = null!;
		this.fTotal = null!;

		return this;
	}

	override stop() {
		return this.done();
	}

	override show(delay?: number): void {
		this.fShowDelay = delay;
	}

	override hide(): void { }
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
			testOnScopeOpened(scopeId: string) { super.onScopeOpened(scopeId); }
			testOnScopeClosed(scopeId: string): void { super.onScopeClosed(scopeId); }
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

	test('ScopedProgressIndicator - showWhile keeps start time and delay for replay', async () => {
		const testProgressBar = disposables.add(new TestProgressBar(document.createElement('div')));
		const progressScope = disposables.add(new class extends AbstractProgressScope {
			constructor() { super('test.scopeId', false); }
			testOnScopeOpened(scopeId: string) { super.onScopeOpened(scopeId); }
			testOnScopeClosed(scopeId: string): void { super.onScopeClosed(scopeId); }
		}());
		const testObject = disposables.add(new ScopedProgressIndicator(testProgressBar, progressScope));

		let resolvePromise!: () => void;
		const promise = new Promise<void>(resolve => { resolvePromise = resolve; });

		const startTime = Date.now();
		const showWhileDone = testObject.showWhile(promise, 5000);

		// Inactive scope: nothing is shown yet
		assert.strictEqual(false, !!testProgressBar.fInfinite);

		// The state keeps delay and wall clock start for replay computation.
		const state = (testObject as unknown as { progressState: { whileStart: number; whileDelay: number } }).progressState;
		assert.strictEqual(5000, state.whileDelay);
		assert.strictEqual(true, state.whileStart >= startTime && state.whileStart <= Date.now(), `unexpected whileStart: ${state.whileStart}`);

		// Reactivation replays the progress with the remaining delay
		progressScope.testOnScopeOpened('test.scopeId');
		assert.strictEqual(true, !!testProgressBar.fInfinite);
		assert.strictEqual(true, typeof testProgressBar.fShowDelay === 'number' && testProgressBar.fShowDelay > 3000 && testProgressBar.fShowDelay <= 5000, `unexpected show delay: ${testProgressBar.fShowDelay}`);

		resolvePromise();
		await showWhileDone;
		assert.strictEqual(true, testProgressBar.fDone);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
