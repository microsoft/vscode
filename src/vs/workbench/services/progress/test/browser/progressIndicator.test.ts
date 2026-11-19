/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractProgressScope, EditorProgressIndicator, ScopedProgressIndicator } from '../../browser/progressIndicator.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';

class TestProgressBar extends ProgressBar {
	fTotal: number = 0;
	fWorked: number = 0;
	fInfinite: boolean = false;
	fDone: boolean = false;
	fShowDelay: number | undefined = undefined;
	fShowCount = 0;

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
		this.fShowCount++;
	}

	override hide(): void { }
}

suite('Progress Indicator', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('EditorProgressIndicator - only the reporter that showed the progress last hides it, until the active editor changes', async () => {
		const testProgressBar = disposables.add(new TestProgressBar(document.createElement('div')));
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		const group = upcastPartial<IEditorGroupView>({ isEmpty: false, onDidModelChange: onDidModelChange.event });
		const testObject = disposables.add(new EditorProgressIndicator(testProgressBar, group));
		const shown = () => !testProgressBar.fDone;

		const opening = testObject.show(true);
		const loading = testObject.show(true);
		opening.done();
		const afterReplacedDone = shown();
		loading.done();
		const afterLatestDone = shown();
		testObject.show(true);
		const searching = testObject.show(true);
		searching.done();
		const afterLatestDoneWithReplacedNotDone = shown();
		let resolveWhile!: () => void;
		const showWhileDone = testObject.showWhile(new Promise<void>(resolve => { resolveWhile = resolve; }));
		const reporting = testObject.show(true);
		resolveWhile();
		await showWhileDone;
		const afterReplacedShowWhileDone = shown();
		onDidModelChange.fire({ kind: GroupModelChangeKind.EDITOR_ACTIVE });
		const afterActiveEditorChange = shown();
		const next = testObject.show(true);
		reporting.done();
		const afterDoneOfPreviousEditor = shown();
		next.done();

		assert.deepStrictEqual({ afterReplacedDone, afterLatestDone, afterLatestDoneWithReplacedNotDone, afterReplacedShowWhileDone, afterActiveEditorChange, afterDoneOfPreviousEditor }, {
			afterReplacedDone: true,
			afterLatestDone: false,
			afterLatestDoneWithReplacedNotDone: false,
			afterReplacedShowWhileDone: true,
			afterActiveEditorChange: false,
			afterDoneOfPreviousEditor: true,
		});
	});

	test('EditorProgressIndicator - does not show an infinite progress again while it shows, so as not to restart its accessibility signal, but does while it is yet to show', () => {
		const testProgressBar = disposables.add(new TestProgressBar(document.createElement('div')));
		const group = upcastPartial<IEditorGroupView>({ isEmpty: false, onDidModelChange: Event.None });
		const testObject = disposables.add(new EditorProgressIndicator(testProgressBar, group));
		const shows = () => testProgressBar.fShowCount;

		testObject.show(true);
		testObject.show(true, 200);
		const replacedWhileShowing = shows();
		testObject.showWhile(new Promise<void>(() => { }));
		const replacedByShowWhile = shows();
		testObject.show(true).done();
		const done = shows();
		testObject.show(true, 500);
		testObject.show(true, 1000);
		const replacedWhileYetToShow = shows();
		testObject.show(true);
		const replacedWhileYetToShowRightAway = shows();
		testObject.show(100);
		testObject.show(true);
		const afterTotal = shows();

		assert.deepStrictEqual({ replacedWhileShowing, replacedByShowWhile, done, replacedWhileYetToShow, replacedWhileYetToShowRightAway, afterTotal }, {
			replacedWhileShowing: 1,
			replacedByShowWhile: 1,
			done: 1,
			replacedWhileYetToShow: 3,
			replacedWhileYetToShowRightAway: 4,
			afterTotal: 6,
		});
	});

	test('EditorProgressIndicator - a reporter that another replaced reports no more work', () => {
		const testProgressBar = disposables.add(new TestProgressBar(document.createElement('div')));
		const group = upcastPartial<IEditorGroupView>({ isEmpty: false, onDidModelChange: Event.None });
		const testObject = disposables.add(new EditorProgressIndicator(testProgressBar, group));

		const replaced = testObject.show(100);
		testObject.show(true).done();
		replaced.total(50);
		replaced.worked(1);
		const afterReplacedReported = { done: testProgressBar.fDone, total: testProgressBar.fTotal, worked: testProgressBar.fWorked, infinite: testProgressBar.fInfinite };
		replaced.done();

		assert.deepStrictEqual(afterReplacedReported, { done: true, total: null, worked: null, infinite: null });
	});

});
