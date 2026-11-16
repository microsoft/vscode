/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostKeepAwakeClaim } from '../../common/agentHostKeepAwake.js';

suite('AgentHostKeepAwakeClaim', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a newer event wins over the initial snapshot and exit clears the claim', async () => {
		const changed = store.add(new Emitter<boolean>());
		const exit = store.add(new Emitter<void>());
		const seed = new DeferredPromise<boolean>();
		const values: boolean[] = [];
		store.add(new AgentHostKeepAwakeClaim({ onDidChangeKeepAwakeWork: changed.event, getKeepAwakeWork: () => seed.p },
			exit.event, busy => values.push(busy), error => assert.fail(String(error))));
		changed.fire(true);
		await seed.complete(false);
		await seed.p;
		exit.fire();
		changed.fire(true);
		assert.deepStrictEqual(values, [true, false]);
	});

	test('a late initial snapshot cannot resurrect a disposed process claim', async () => {
		const changed = store.add(new Emitter<boolean>());
		const exit = store.add(new Emitter<void>());
		const seed = new DeferredPromise<boolean>();
		const values: boolean[] = [];
		const claim = store.add(new AgentHostKeepAwakeClaim({ onDidChangeKeepAwakeWork: changed.event, getKeepAwakeWork: () => seed.p },
			exit.event, busy => values.push(busy), error => assert.fail(String(error))));
		exit.fire();
		claim.dispose();
		await seed.complete(true);
		await seed.p;
		assert.deepStrictEqual(values, [false]);
	});
});
