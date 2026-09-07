/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AssignmentContextFilter } from '../../common/assignmentContextFilter.js';
import { IAssignmentFilter } from '../../common/assignmentService.js';

const FILTERED_OUT_IDS_STORAGE_KEY = 'workbench.assignment.filteredOutAssignmentContextIds';

suite('AssignmentContextFilter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: IStorageService;

	setup(() => {
		storageService = disposables.add(new InMemoryStorageService());
	});

	function createContextFilter(): AssignmentContextFilter {
		return disposables.add(new AssignmentContextFilter(storageService));
	}

	/** Creates a filter whose exclusion predicate can be swapped at runtime. */
	function createFilter(id: string, initialExclude: (assignment: string) => boolean, store: DisposableStore): { filter: IAssignmentFilter; setExclude(fn: (assignment: string) => boolean): void } {
		const onDidChange = store.add(new Emitter<void>());
		let excludeFn = initialExclude;
		return {
			filter: { id, exclude: assignment => excludeFn(assignment), onDidChange: onDidChange.event },
			setExclude(fn) {
				excludeFn = fn;
				onDidChange.fire();
			}
		};
	}

	function readCache(): Record<string, string[]> | undefined {
		const raw = storageService.get(FILTERED_OUT_IDS_STORAGE_KEY, StorageScope.APPLICATION);
		return raw ? JSON.parse(raw) : undefined;
	}

	test('persists filtered-out ids keyed by filter id and removes them from the context', () => {
		const store = disposables.add(new DisposableStore());
		const contextFilter = createContextFilter();
		contextFilter.addFilter(createFilter('onboarding', a => a === 'onb-test1', store).filter);

		const result = contextFilter.filter('onb-test1;onb-test2;keep');

		assert.strictEqual(result, 'onb-test2;keep');
		assert.deepStrictEqual(readCache(), { onboarding: ['onb-test1'] });
	});

	test('honors cached ids across reload before the owning filter is registered', () => {
		// Simulate a previous session that persisted a filtered-out id.
		storageService.store(FILTERED_OUT_IDS_STORAGE_KEY, JSON.stringify({ onboarding: ['onb-test1'] }), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const contextFilter = createContextFilter();

		assert.strictEqual(contextFilter.filter('onb-test1;keep'), 'keep');
	});

	test('registering a filter drops only its own cached state and preserves other filters', () => {
		storageService.store(FILTERED_OUT_IDS_STORAGE_KEY, JSON.stringify({ onboarding: ['onb-test1'], unification: ['cmp-ext-a'] }), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const store = disposables.add(new DisposableStore());
		const contextFilter = createContextFilter();
		// The onboarding filter is registered but no longer excludes onb-test1.
		contextFilter.addFilter(createFilter('onboarding', () => false, store).filter);

		const result = contextFilter.filter('onb-test1;cmp-ext-a;keep');

		// onb-test1 is no longer excluded (its filter took over), but cmp-ext-a stays excluded
		// because the unification filter has not been registered yet.
		assert.strictEqual(result, 'onb-test1;keep');
		assert.deepStrictEqual(readCache(), { unification: ['cmp-ext-a'] });
	});

	test('removes an id from storage once it is no longer filtered out', () => {
		const store = disposables.add(new DisposableStore());
		const contextFilter = createContextFilter();
		const onboarding = createFilter('onboarding', a => a === 'onb-test1', store);
		contextFilter.addFilter(onboarding.filter);

		contextFilter.filter('onb-test1;keep');
		assert.deepStrictEqual(readCache(), { onboarding: ['onb-test1'] });

		// The gate opens: the filter no longer excludes the id.
		onboarding.setExclude(() => false);

		assert.strictEqual(contextFilter.filter('onb-test1;keep'), 'onb-test1;keep');
		assert.strictEqual(readCache(), undefined);
	});

	test('tracks multiple registered filters independently', () => {
		const store = disposables.add(new DisposableStore());
		const contextFilter = createContextFilter();
		contextFilter.addFilter(createFilter('onboarding', a => a.startsWith('onb-'), store).filter);
		contextFilter.addFilter(createFilter('unification', a => a.startsWith('cmp-'), store).filter);

		const result = contextFilter.filter('onb-a;cmp-b;keep');

		assert.strictEqual(result, 'keep');
		assert.deepStrictEqual(readCache(), { onboarding: ['onb-a'], unification: ['cmp-b'] });
	});

	test('fires onDidChange when a filter is added and when a filter changes', () => {
		const store = disposables.add(new DisposableStore());
		const contextFilter = createContextFilter();
		let changes = 0;
		disposables.add(contextFilter.onDidChange(() => changes++));

		const onboarding = createFilter('onboarding', () => false, store);
		contextFilter.addFilter(onboarding.filter);
		onboarding.setExclude(a => a === 'onb-test1');

		assert.strictEqual(changes, 2);
	});
});
