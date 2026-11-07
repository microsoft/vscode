/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MainThreadCustomTextEditorNavigation } from '../../browser/mainThreadCustomTextEditorNavigation.js';
import { ExtHostCustomEditorsShape } from '../../common/extHost.protocol.js';

suite('MainThreadCustomTextEditorNavigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const range = new Range(1, 1, 1, 3);

	function createNavigation() {
		const calls: unknown[] = [];
		const captures = new Map<number, DeferredPromise<void>>();
		let revealToken: CancellationToken | undefined;
		let reveal: Promise<void> = Promise.resolve();
		let focuses = 0;
		const proxy = new class extends mock<ExtHostCustomEditorsShape>() {
			override async $revealCustomTextEditorRange(handle: string, range: Range, selection: Selection | undefined, preserveFocus: boolean, token: CancellationToken) {
				calls.push({ handle, range, selection, preserveFocus });
				revealToken = token;
				await reveal;
			}
			override $captureCustomTextEditorViewState(_handle: string, stateId: number): Promise<void> {
				const capture = new DeferredPromise<void>();
				captures.set(stateId, capture);
				return capture.p;
			}
			override async $restoreCustomTextEditorViewState(handle: string, stateId: number): Promise<void> { calls.push({ restore: handle, stateId }); }
			override $releaseCustomTextEditorViewState(handle: string, stateId: number): void { calls.push({ release: handle, stateId }); }
			override $disposeCustomTextEditorNavigation(handle: string): void { calls.push({ dispose: handle }); }
		};
		const model = store.add(createTextModel('hello'));
		const navigation = store.add(new MainThreadCustomTextEditorNavigation(model, undefined, 'panel', proxy, () => focuses++));
		return { navigation, calls, captures, focuses: () => focuses, revealToken: () => revealToken, setReveal: (value: Promise<void>) => { reveal = value; } };
	}

	test('preview preserves focus and reveal focuses the originating panel', async () => {
		const fixture = createNavigation();
		await fixture.navigation.revealRange(range, undefined, true, CancellationToken.None);
		assert.strictEqual(fixture.focuses(), 0);
		const selection = new Selection(1, 1, 1, 3);
		await fixture.navigation.revealRange(range, selection, false, CancellationToken.None);
		assert.deepStrictEqual(fixture.calls, [
			{ handle: 'panel', range, selection: undefined, preserveFocus: true },
			{ handle: 'panel', range, selection, preserveFocus: false }
		]);
		assert.strictEqual(fixture.focuses(), 1);
	});

	test('canceled requests do not reveal and disposal cancels in-flight reveal', async () => {
		const fixture = createNavigation();
		await fixture.navigation.revealRange(range, undefined, true, CancellationToken.Cancelled);
		assert.deepStrictEqual(fixture.calls, []);
		const pending = new DeferredPromise<void>();
		fixture.setReveal(pending.p);
		const reveal = fixture.navigation.revealRange(range, undefined, false, CancellationToken.None);
		fixture.navigation.dispose();
		assert.strictEqual(fixture.revealToken()?.isCancellationRequested, true);
		await pending.complete();
		await reveal;
		assert.strictEqual(fixture.focuses(), 0);
	});

	test('restore waits for asynchronous capture', async () => {
		const fixture = createNavigation();
		const state = fixture.navigation.captureViewState();
		state.dispose();
		assert.deepStrictEqual(fixture.calls, []);
		await fixture.captures.get(0)!.complete();
		await timeout(0);
		assert.deepStrictEqual(fixture.calls, [{ restore: 'panel', stateId: 0 }]);
	});

	test('committing a heading releases captures instead of restoring preview state', async () => {
		const fixture = createNavigation();
		const state = fixture.navigation.captureViewState();
		await fixture.navigation.revealRange(range, new Selection(1, 1, 1, 1), true, CancellationToken.None);
		await fixture.captures.get(0)!.complete();
		state.dispose();
		await timeout(0);
		assert.deepStrictEqual(fixture.calls, [
			{ release: 'panel', stateId: 0 },
			{ handle: 'panel', range, selection: new Selection(1, 1, 1, 1), preserveFocus: true }
		]);
	});

	test('disposal invalidates captures and prevents late restoration', async () => {
		const fixture = createNavigation();
		const state = fixture.navigation.captureViewState();
		fixture.navigation.dispose();
		await fixture.captures.get(0)!.complete();
		state.dispose();
		await timeout(0);
		assert.deepStrictEqual(fixture.calls, [{ dispose: 'panel' }]);
	});

	test('a restore waiting for capture cannot overwrite a newer heading navigation', async () => {
		const fixture = createNavigation();
		const state = fixture.navigation.captureViewState();
		state.dispose();
		await fixture.navigation.revealRange(range, new Selection(1, 1, 1, 1), true, CancellationToken.None);
		await fixture.captures.get(0)!.complete();
		await timeout(0);
		assert.deepStrictEqual(fixture.calls, [
			{ release: 'panel', stateId: 0 },
			{ handle: 'panel', range, selection: new Selection(1, 1, 1, 1), preserveFocus: true }
		]);
	});

	test('a restore waiting for capture is invalidated when the editor is disposed', async () => {
		const fixture = createNavigation();
		const state = fixture.navigation.captureViewState();
		state.dispose();
		fixture.navigation.dispose();
		await fixture.captures.get(0)!.complete();
		await timeout(0);
		assert.deepStrictEqual(fixture.calls, [{ dispose: 'panel' }]);
	});

	test('selection changes are instance-local and stop after disposal', () => {
		const first = createNavigation();
		const second = createNavigation();
		let changes = 0;
		store.add(first.navigation.onDidChangeSelection(() => changes++));
		const selection = new Selection(1, 2, 1, 4);
		first.navigation.updateSelection(selection);
		assert.strictEqual(first.navigation.selection, selection);
		assert.strictEqual(second.navigation.selection, undefined);
		first.navigation.updateSelection(undefined);
		first.navigation.dispose();
		first.navigation.updateSelection(selection);
		assert.strictEqual(changes, 2);
	});
});
