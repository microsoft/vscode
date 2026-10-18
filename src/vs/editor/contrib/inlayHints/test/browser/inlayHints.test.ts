/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { InlayHintsProvider } from '../../../../common/languages.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { InlayHintsFragments } from '../../browser/inlayHints.js';

suite('InlayHintsFragments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	for (const hasChangeEvent of [false, true]) {
		test(`empty results ${hasChangeEvent ? 'with' : 'without'} change events are disposed`, async () => {
			const model = store.add(createTextModel('value'));
			const registry = new LanguageFeatureRegistry<InlayHintsProvider>();
			const list = { hints: [], dispose: sinon.spy() };
			store.add(list);
			store.add(registry.register('*', {
				onDidChangeInlayHints: hasChangeEvent ? Event.None : undefined,
				provideInlayHints: () => list
			}));
			const fragments = store.add(await InlayHintsFragments.create(registry, model, [model.getFullModelRange()], CancellationToken.None));
			assert.strictEqual(list.dispose.callCount, hasChangeEvent ? 0 : 1);
			fragments.dispose();
			assert.strictEqual(list.dispose.callCount, 1);
		});
	}

	for (const reason of ['cancellation', 'model disposal'] as const) {
		test(`disposes collected lists after ${reason} during a request`, async () => {
			const model = store.add(createTextModel('value'));
			const tokenSource = store.add(new CancellationTokenSource());
			const registry = new LanguageFeatureRegistry<InlayHintsProvider>();
			const pending = new DeferredPromise<void>();
			const lists = [0, 1].map(() => {
				const list = { hints: [{ label: 'hint', position: { lineNumber: 1, column: 1 } }], dispose: sinon.spy() };
				return store.add(list);
			});
			for (const list of lists) {
				store.add(registry.register('*', {
					provideInlayHints: async () => {
						await pending.p;
						return list;
					}
				}));
			}
			const fragments = InlayHintsFragments.create(registry, model, [new Range(1, 1, 1, 6)], tokenSource.token);
			if (reason === 'cancellation') {
				tokenSource.cancel();
			} else {
				model.dispose();
			}
			await pending.complete();
			await assert.rejects(fragments, isCancellationError);
			assert.deepStrictEqual(lists.map(list => list.dispose.callCount), [1, 1]);
		});
	}
});
