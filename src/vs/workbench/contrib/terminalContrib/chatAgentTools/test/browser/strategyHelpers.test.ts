/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { type IDisposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { getPreferredOutputStartMarker, setupRecreatingStartMarker } from '../../browser/executeStrategy/strategyHelpers.js';

class TestMarker implements IXtermMarker {
	private static _idPool = 0;
	readonly id = TestMarker._idPool++;
	isDisposed = false;
	private readonly _listeners = new Set<() => void>();

	line: number;

	constructor(line: number) {
		this.line = line;
	}

	dispose(): void {
		if (this.isDisposed) {
			return;
		}
		this.isDisposed = true;
		this.line = -1;
		for (const listener of this._listeners) {
			listener();
		}
	}

	onDispose(listener: () => void): IDisposable {
		this._listeners.add(listener);
		return {
			dispose: () => this._listeners.delete(listener)
		};
	}
}

suite('Execute Strategy Helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('setupRecreatingStartMarker should preserve earliest boundary when recreation moves forward', () => {
		const store = new DisposableStore();
		const startMarker = new MutableDisposable<IXtermMarker>();
		const firstMarker = new TestMarker(10);
		const recreatedMarker = new TestMarker(50);
		let markerFactoryCallCount = 0;
		const createdMarkers: Array<IXtermMarker | undefined> = [];

		setupRecreatingStartMarker(
			{ raw: { registerMarker: () => markerFactoryCallCount++ === 0 ? firstMarker : recreatedMarker } },
			startMarker,
			marker => createdMarkers.push(marker),
			store
		);

		strictEqual(startMarker.value, firstMarker);
		firstMarker.dispose();
		strictEqual(startMarker.value, undefined, 'Disposed marker should be cleared when forward recreation is skipped');
		strictEqual(createdMarkers.length, 2, 'Undefined marker event should fire when disposed marker is cleared');
		strictEqual(createdMarkers[1], undefined, 'Cleared marker event should fire undefined');

		store.dispose();
	});

	test('getPreferredOutputStartMarker should fall back to command marker over a later disposed start marker', () => {
		const disposedStartMarker = new TestMarker(50);
		disposedStartMarker.dispose();
		const commandMarker = new TestMarker(20);

		const selected = getPreferredOutputStartMarker(disposedStartMarker, commandMarker, undefined);

		strictEqual(selected, commandMarker);
	});

	test('getPreferredOutputStartMarker should select earliest marker', () => {
		const startMarker = new TestMarker(30);
		const commandMarker = new TestMarker(25);
		const executedMarker = new TestMarker(15);

		const selected = getPreferredOutputStartMarker(startMarker, commandMarker, executedMarker);

		strictEqual(selected, executedMarker);
	});
});
