/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';

suite('SessionComparisonModelSelection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('one model supports two to ten independent attempts', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		const initial = selection.state.get()?.summary;
		selection.setCount(10);
		const count = selection.state.get()?.count?.value;
		for (const count of [1, 11, 2.5, NaN, Infinity]) {
			assert.throws(() => selection.setCount(count), /integer between 2 and 10/);
		}
		selection.next();
		selection.finish();
		assert.deepStrictEqual({ initial, maximum: selection.attemptModelIds.get(), count }, {
			initial: '2 Attempts', maximum: Array(10).fill('model'), count: 10,
		});
	});

	test('multiple models run once each and are capped at ten', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		for (let index = 0; index < 11; index++) {
			selection.select(`model-${index}`);
		}
		const draft = { count: selection.state.get()?.count, next: selection.state.get()?.canGoNext };
		selection.next();
		selection.finish();
		assert.deepStrictEqual({
			attempts: selection.attemptModelIds.get(),
			...draft,
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
			state: selection.state.get(),
			summary: selection.summary.get(),
			configured: selection.configured.get(),
			judge: selection.judgeModelId.get(),
			synthesizer: selection.synthesizerModelId.get(),
		}, { state: undefined, summary: '2 Attempts', configured: true, judge: undefined, synthesizer: undefined });
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
		selection.start();
		selection.next();
		selection.next();
		selection.select('synthesizer');
		selection.back();
		selection.select('judge');
		const canFinish = selection.state.get()?.canFinish;
		selection.finish();
		assert.deepStrictEqual({
			withoutSynthesizer, judge: selection.judgeModelId.get(),
			synthesizer: selection.synthesizerModelId.get(), canFinish,
		}, { withoutSynthesizer: undefined, judge: undefined, synthesizer: undefined, canFinish: true });
	});

	test('unavailable committed models return the composer to single-model sending', () => {
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
			retained: { attempts: [], configured: false, page: undefined }, enabled: false, state: undefined,
		});
	});

	test('preserves comparison selections while draft configuration resolves', () => {
		const resolving = observableValue('resolving', false);
		const available = derived(reader => !resolving.read(reader));
		const selection = store.add(new SessionComparisonModelSelection(available, resolving));
		selection.start();
		selection.select('attempt');
		selection.setCount(3);
		selection.next();
		selection.select('judge');
		selection.next();
		selection.select('synthesizer');
		selection.finish();

		resolving.set(true, undefined);
		const during = { enabled: selection.enabled.get(), configured: selection.configured.get(), available: selection.available.get() };
		resolving.set(false, undefined);
		assert.deepStrictEqual({
			during,
			enabled: selection.enabled.get(), configured: selection.configured.get(), available: selection.available.get(),
			attempts: selection.attemptModelIds.get(), judge: selection.judgeModelId.get(), synthesizer: selection.synthesizerModelId.get(),
		}, {
			during: { enabled: true, configured: true, available: false },
			enabled: true, configured: true, available: true,
			attempts: ['attempt', 'attempt', 'attempt'], judge: 'judge', synthesizer: 'synthesizer',
		});
	});

	test('clears an invalid comparison once configuration finishes resolving', () => {
		const available = observableValue('available', true);
		const resolving = observableValue('resolving', false);
		const selection = store.add(new SessionComparisonModelSelection(available, resolving));
		selection.start();
		selection.select('attempt');
		selection.next();
		selection.finish();
		resolving.set(true, undefined);
		available.set(false, undefined);
		const enabledWhileResolving = selection.enabled.get();
		resolving.set(false, undefined);
		assert.deepStrictEqual({
			enabledWhileResolving, enabled: selection.enabled.get(), attempts: selection.attemptModelIds.get(),
		}, { enabledWhileResolving: true, enabled: false, attempts: [] });
	});

	for (const configured of [false, true]) {
		test(`unavailable workflow resets setup and does not revive it (configured: ${configured})`, () => {
			const available = observableValue('available', true);
			const selection = store.add(new SessionComparisonModelSelection(available));
			selection.start();
			selection.select('attempt');
			selection.next();
			selection.select('judge');
			selection.next();
			selection.select('synthesizer');
			if (configured) {
				selection.finish();
			}
			available.set(false, undefined);
			assert.throws(() => selection.start(), /not available/);
			available.set(true, undefined);
			assert.deepStrictEqual({
				enabled: selection.enabled.get(),
				configured: selection.configured.get(),
				attempts: selection.attemptModelIds.get(),
				judge: selection.judgeModelId.get(),
				synthesizer: selection.synthesizerModelId.get(),
				state: selection.state.get(),
			}, {
				enabled: false, configured: false, attempts: [], judge: undefined, synthesizer: undefined, state: undefined,
			});
		});
	}

	test('first-time setup stays uncommitted and cancellation does not resume unfinished work', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		selection.setCount(5);
		selection.next();
		selection.select('judge');
		const during = { enabled: selection.enabled.get(), summary: selection.summary.get(), attempts: selection.attemptModelIds.get() };
		selection.cancel();
		const closed = selection.state.get();
		selection.start();
		assert.deepStrictEqual({
			during, closed,
			reopened: selection.state.get()?.selectedModelIds,
			configured: selection.configured.get(),
		}, { during: { enabled: false, summary: undefined, attempts: [] }, closed: undefined, reopened: [], configured: false });
	});

	test('editing a comparison preserves committed choices until Done and cancellation restores them', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('original');
		selection.next();
		selection.select('judge');
		selection.next();
		selection.select('synthesizer');
		selection.finish();

		selection.start();
		selection.select('replacement');
		selection.select('original');
		selection.setCount(4);
		selection.next();
		selection.select('judge');
		const during = {
			configured: selection.configured.get(), attempts: selection.attemptModelIds.get(),
			judge: selection.judgeModelId.get(), synthesizer: selection.synthesizerModelId.get(), summary: selection.summary.get(),
		};
		selection.cancel();
		selection.start();
		assert.deepStrictEqual({
			during, reopened: selection.state.get()?.selectedModelIds, count: selection.state.get()?.count?.value,
		}, {
			during: { configured: true, attempts: ['original', 'original'], judge: 'judge', synthesizer: 'synthesizer', summary: '2 Attempts' },
			reopened: ['original'], count: 2,
		});

		selection.setCount(3);
		selection.next();
		selection.next();
		selection.finish();
		assert.deepStrictEqual({
			attempts: selection.attemptModelIds.get(), summary: selection.summary.get(), state: selection.state.get(),
		}, { attempts: ['original', 'original', 'original'], summary: '3 Attempts', state: undefined });
	});

	test('reset clears both committed and working selections', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selection.select('model');
		selection.next();
		selection.finish();
		selection.start();
		selection.reset();
		assert.deepStrictEqual({
			enabled: selection.enabled.get(), summary: selection.summary.get(), state: selection.state.get(), attempts: selection.attemptModelIds.get(),
		}, { enabled: false, summary: undefined, state: undefined, attempts: [] });
	});
});
