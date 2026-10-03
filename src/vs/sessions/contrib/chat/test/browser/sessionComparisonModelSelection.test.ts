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

	function selectAttempts(selection: SessionComparisonModelSelection, ...modelIds: string[]): void {
		for (const modelId of modelIds) {
			selection.select(modelId);
		}
	}

	test('Done and Next are offered only for two to ten models', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		const actions = () => {
			const state = selection.state.get();
			return { selected: state?.selectedModelIds.length, canFinish: state?.canFinish, canGoNext: state?.canGoNext, count: state?.count };
		};
		const none = actions();
		selection.select('model-0');
		const one = actions();
		assert.throws(() => selection.next(), /not ready/);
		assert.throws(() => selection.finish(), /not ready/);
		selection.select('model-1');
		const two = actions();
		for (let index = 2; index < 11; index++) {
			selection.select(`model-${index}`);
		}
		const capped = actions();
		assert.deepStrictEqual({ none, one, two, capped }, {
			none: { selected: 0, canFinish: false, canGoNext: false, count: undefined },
			one: { selected: 1, canFinish: false, canGoNext: false, count: undefined },
			two: { selected: 2, canFinish: true, canGoNext: true, count: undefined },
			capped: { selected: 10, canFinish: true, canGoNext: true, count: undefined },
		});
	});

	test('multiple models run once each and are capped at ten', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		for (let index = 0; index < 11; index++) {
			selection.select(`model-${index}`);
		}
		selection.finish();
		assert.deepStrictEqual(selection.attemptModelIds.get(), Array.from({ length: 10 }, (_, index) => `model-${index}`));
	});

	test('Done finishes from any step and keeps what was chosen so far', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selectAttempts(selection, 'one', 'two');
		selection.finish();
		const attemptsOnly = {
			state: selection.state.get(), summary: selection.summary.get(), configured: selection.configured.get(),
			judge: selection.judgeModelId.get(), synthesizer: selection.synthesizerModelId.get(),
		};
		selection.start();
		selection.next();
		const judgeWithoutChoice = { canFinish: selection.state.get()?.canFinish, canGoNext: selection.state.get()?.canGoNext };
		selection.select('judge');
		const judgeWithChoice = { canFinish: selection.state.get()?.canFinish, canGoNext: selection.state.get()?.canGoNext };
		selection.finish();
		assert.deepStrictEqual({
			attemptsOnly, judgeWithoutChoice, judgeWithChoice,
			judge: selection.judgeModelId.get(), synthesizer: selection.synthesizerModelId.get(),
		}, {
			attemptsOnly: { state: undefined, summary: '2 Attempts', configured: true, judge: undefined, synthesizer: undefined },
			judgeWithoutChoice: { canFinish: true, canGoNext: false },
			judgeWithChoice: { canFinish: true, canGoNext: true },
			judge: 'judge', synthesizer: undefined,
		});
	});

	test('Judge and Synthesizer selections survive back navigation', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selectAttempts(selection, 'one', 'two');
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
		}, { models: ['one', 'two'], judge: 'judge', synthesizer: 'synthesizer', configured: true });
	});

	test('Synthesizer can be skipped, and removing Judge clears Synthesizer', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selectAttempts(selection, 'one', 'two');
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
		selectAttempts(selection, 'one', 'two');
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
		selectAttempts(selection, 'one', 'two', 'three');
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
			attempts: ['one', 'two', 'three'], judge: 'judge', synthesizer: 'synthesizer',
		});
	});

	test('clears an invalid comparison once configuration finishes resolving', () => {
		const available = observableValue('available', true);
		const resolving = observableValue('resolving', false);
		const selection = store.add(new SessionComparisonModelSelection(available, resolving));
		selection.start();
		selectAttempts(selection, 'one', 'two');
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
			selectAttempts(selection, 'one', 'two');
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
		selectAttempts(selection, 'one', 'two');
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
		selectAttempts(selection, 'one', 'two');
		selection.next();
		selection.select('judge');
		selection.next();
		selection.select('synthesizer');
		selection.finish();

		selection.start();
		selectAttempts(selection, 'three', 'one');
		selection.next();
		selection.select('judge');
		const during = {
			configured: selection.configured.get(), attempts: selection.attemptModelIds.get(),
			judge: selection.judgeModelId.get(), synthesizer: selection.synthesizerModelId.get(), summary: selection.summary.get(),
		};
		selection.cancel();
		selection.start();
		const reopened = selection.state.get()?.selectedModelIds;

		selection.select('three');
		selection.next();
		selection.next();
		selection.finish();
		assert.deepStrictEqual({
			during, reopened,
			attempts: selection.attemptModelIds.get(), summary: selection.summary.get(), state: selection.state.get(),
		}, {
			during: { configured: true, attempts: ['one', 'two'], judge: 'judge', synthesizer: 'synthesizer', summary: '2 Attempts' },
			reopened: ['one', 'two'],
			attempts: ['one', 'two', 'three'], summary: '3 Attempts', state: undefined,
		});
	});

	test('reset clears both committed and working selections', () => {
		const selection = store.add(new SessionComparisonModelSelection(constObservable(true)));
		selection.start();
		selectAttempts(selection, 'one', 'two');
		selection.finish();
		selection.start();
		selection.reset();
		assert.deepStrictEqual({
			enabled: selection.enabled.get(), summary: selection.summary.get(), state: selection.state.get(), attempts: selection.attemptModelIds.get(),
		}, { enabled: false, summary: undefined, state: undefined, attempts: [] });
	});
});
