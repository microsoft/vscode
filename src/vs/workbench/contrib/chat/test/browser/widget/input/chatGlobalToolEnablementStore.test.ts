/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ChatGlobalToolEnablementStore } from '../../../../browser/widget/input/chatGlobalToolEnablementStore.js';

suite('ChatGlobalToolEnablementStore', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSut(storageService = store.add(new InMemoryStorageService())) {
		return { storageService, sut: store.add(new ChatGlobalToolEnablementStore(storageService)) };
	}

	test('default state is empty (everything enabled by absence)', () => {
		const { sut } = createSut();
		assert.deepStrictEqual(sut.state.get(), { toolSets: new Map(), tools: new Map() });
	});

	test('setToolSetEnabled(false) records an explicit override; (true) clears it', () => {
		const { sut } = createSut();
		sut.setToolSetEnabled('setA', false);
		assert.deepStrictEqual(sut.state.get().toolSets, new Map([['setA', false]]));
		sut.setToolSetEnabled('setA', true);
		assert.deepStrictEqual(sut.state.get().toolSets, new Map());
	});

	test('setToolSetEnabled is a no-op when already at the target state', () => {
		const { sut } = createSut();
		// Enabling an absent set leaves the (default-enabled) map empty.
		sut.setToolSetEnabled('setA', true);
		assert.deepStrictEqual(sut.state.get().toolSets, new Map());
		// Disabling twice keeps a single explicit `false` entry.
		sut.setToolSetEnabled('setA', false);
		sut.setToolSetEnabled('setA', false);
		assert.deepStrictEqual(sut.state.get().toolSets, new Map([['setA', false]]));
	});

	test('setToolSetEnabled preserves per-tool entries', () => {
		const { sut } = createSut();
		sut.setState({ toolSets: new Map(), tools: new Map([['t1', false]]) });
		sut.setToolSetEnabled('setA', false);
		assert.deepStrictEqual(sut.state.get(), { toolSets: new Map([['setA', false]]), tools: new Map([['t1', false]]) });
	});

	test('setState replaces the whole snapshot', () => {
		const { sut } = createSut();
		const next = { toolSets: new Map([['setA', false]]), tools: new Map([['t1', false]]) };
		sut.setState(next);
		assert.deepStrictEqual(sut.state.get(), next);
	});

	test('state persists across instances backed by the same storage', () => {
		const storageService = store.add(new InMemoryStorageService());
		const { sut: first } = createSut(storageService);
		first.setState({ toolSets: new Map([['setA', false]]), tools: new Map([['t1', false]]) });

		const { sut: second } = createSut(storageService);
		assert.deepStrictEqual(second.state.get(), { toolSets: new Map([['setA', false]]), tools: new Map([['t1', false]]) });
	});
});
