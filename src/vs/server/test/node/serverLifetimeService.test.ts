/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { IServerLifetimeOptions, ServerLifetimeService } from '../../node/serverLifetimeService.js';

suite('ServerLifetimeService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function create(opts: IServerLifetimeOptions = {}): ServerLifetimeService {
		return ds.add(new ServerLifetimeService(opts, new NullLogService()));
	}

	test('starts with no active consumers', () => {
		const service = create();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('active() marks a consumer and dispose releases it', () => {
		const service = create();
		const d = service.active('test');
		assert.strictEqual(service.hasActiveConsumers, true);
		d.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('multiple active consumers require all to dispose', () => {
		const service = create();
		const d1 = service.active('a');
		const d2 = service.active('b');
		assert.strictEqual(service.hasActiveConsumers, true);
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('same consumer name counted multiple times', () => {
		const service = create();
		const d1 = service.active('ext');
		const d2 = service.active('ext');
		assert.strictEqual(service.hasActiveConsumers, true);
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('dispose is idempotent', () => {
		const service = create();
		const d1 = service.active('a');
		const d2 = service.active('a');
		d1.dispose();
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});
});
