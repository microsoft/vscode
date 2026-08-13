/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createRetainedChangesetFilesObs } from '../../common/state/changesetFiles.js';
import { ChangesetFile, ChangesetState, ChangesetStatus } from '../../common/state/sessionState.js';

suite('createRetainedChangesetFilesObs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains files while loading and clears them when unavailable or failed', () => {
		const initialFiles: ChangesetFile[] = [];
		const readyFiles: ChangesetFile[] = [];
		const replacementFiles: ChangesetFile[] = [];
		const state = observableValue<ChangesetState | Error | undefined | null>(store, undefined);
		const files = createRetainedChangesetFilesObs(store, constObservable(state));
		const snapshots: string[] = [];
		const record = () => {
			const value = files.get();
			snapshots.push(
				value === undefined ? 'undefined'
					: value === initialFiles ? 'initial'
						: value === readyFiles ? 'ready'
							: value === replacementFiles ? 'replacement'
								: 'cleared'
			);
		};

		record();
		state.set({ status: ChangesetStatus.Computing, files: initialFiles }, undefined);
		record();
		state.set({ status: ChangesetStatus.Ready, files: readyFiles }, undefined);
		record();
		state.set({ status: ChangesetStatus.Computing, files: replacementFiles }, undefined);
		record();
		state.set(undefined, undefined);
		record();
		state.set(null, undefined);
		record();
		state.set({ status: ChangesetStatus.Ready, files: replacementFiles }, undefined);
		record();
		state.set(new Error('failed'), undefined);
		record();

		assert.deepStrictEqual(snapshots, [
			'undefined',
			'initial',
			'ready',
			'ready',
			'ready',
			'cleared',
			'replacement',
			'cleared',
		]);
	});
});
