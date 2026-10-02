/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';

suite('SessionComparisonModelSelection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('one model supports two to ten independent attempts', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		const initial = selection.attemptModelIds.get();
		selection.setCount(10);
		assert.deepStrictEqual({ initial, maximum: selection.attemptModelIds.get(), count: selection.state.get()?.count?.value }, {
			initial: ['model', 'model'], maximum: Array(10).fill('model'), count: 10,
		});
		for (const count of [1, 11, 2.5, NaN, Infinity]) {
			assert.throws(() => selection.setCount(count), /integer between 2 and 10/);
		}
	});

	test('multiple models run once each and are capped at ten', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		for (let index = 0; index < 11; index++) {
			selection.select(`model-${index}`);
		}
		assert.deepStrictEqual({
			attempts: selection.attemptModelIds.get(),
			count: selection.state.get()?.count,
			next: selection.state.get()?.canGoNext,
		}, { attempts: Array.from({ length: 10 }, (_, index) => `model-${index}`), count: undefined, next: true });
	});

	test('skipping Judge finishes an attempts-only comparison', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		assert.throws(() => selection.next(), /not ready/);
		selection.select('model');
		selection.next();
		selection.finish();
		assert.deepStrictEqual({
			page: selection.state.get()?.title,
			next: selection.state.get()?.canGoNext,
			configured: selection.configured.get(),
			judge: selection.judgeModelId.get(),
			synthesizer: selection.synthesizerModelId.get(),
		}, { page: 'Judge', next: false, configured: true, judge: undefined, synthesizer: undefined });
	});

	test('Judge and Synthesizer selections survive back navigation', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		selection.next();
		selection.select('judge');
		selection.next();
		selection.select('synthesizer');
		selection.back();
		selection.back();
		selection.next();
		selection.next();
		selection.finish();
		assert.deepStrictEqual({
			models: selection.attemptModelIds.get(),
			judge: selection.judgeModelId.get(),
			synthesizer: selection.synthesizerModelId.get(),
			configured: selection.configured.get(),
		}, { models: ['model', 'model'], judge: 'judge', synthesizer: 'synthesizer', configured: true });
	});

	test('Synthesizer can be skipped, and removing Judge clears Synthesizer', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		selection.next();
		selection.select('judge');
		selection.next();
		selection.finish();
		const withoutSynthesizer = selection.synthesizerModelId.get();
		selection.select('synthesizer');
		selection.back();
		selection.select('judge');
		assert.deepStrictEqual({
			withoutSynthesizer, judge: selection.judgeModelId.get(),
			synthesizer: selection.synthesizerModelId.get(), canFinish: selection.state.get()?.canFinish,
		}, { withoutSynthesizer: undefined, judge: undefined, synthesizer: undefined, canFinish: true });
	});

	test('unavailable models invalidate setup and disabled feature hides workflow', () => {
		const available = observableValue('available', true);
		const selection = store.add(new SessionComparisonModelSelection(available));
		selection.start();
		selection.select('one');
		selection.select('two');
		selection.next();
		selection.finish();
		selection.retainModels(new Set(['two']));
		const retained = { attempts: selection.attemptModelIds.get(), configured: selection.configured.get(), page: selection.state.get()?.title };
		available.set(false, undefined);
		assert.deepStrictEqual({ retained, enabled: selection.enabled.get(), state: selection.state.get() }, {
			retained: { attempts: ['two', 'two'], configured: false, page: 'Attempts' }, enabled: true, state: undefined,
		});
	});
});
