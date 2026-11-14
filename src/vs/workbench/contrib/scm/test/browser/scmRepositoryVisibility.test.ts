/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeys } from '../../browser/scmViewPane.js';
import { ISCMProvider, ISCMRepository } from '../../common/scm.js';

suite('SCM repository visibility context keys', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function repository(providerId: string): ISCMRepository {
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = providerId;
		}();
		return new class extends mock<ISCMRepository>() {
			override readonly provider = provider;
		}();
	}

	test('does not register metadata for per-repository context keys', () => {
		const key = ContextKeys.RepositoryVisibility(repository('visibility-metadata-test'));

		assert.strictEqual([...RawContextKey.all()].some(info => info.key === key.key), false);
	});

	test('removes a repository visibility key when its owner resets it', () => {
		const service = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const context = service.getContextValuesContainer(service.contextId);
		const rawKey = ContextKeys.RepositoryVisibility(repository('visibility-reset-test'));
		const key = rawKey.bindTo(service);
		key.set(true);
		assert.strictEqual(Object.hasOwn(context.value, rawKey.key), true);

		key.reset();

		assert.strictEqual(Object.hasOwn(context.value, rawKey.key), false);
	});

	test('preserves visible and hidden expressions while a repository is active', () => {
		const service = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const rawKey = ContextKeys.RepositoryVisibility(repository('visibility-expression-test'));
		const key = rawKey.bindTo(service);

		key.set(false);
		assert.strictEqual(service.contextMatchesRules(rawKey.isEqualTo(false)), true);
		assert.strictEqual(service.contextMatchesRules(rawKey.isEqualTo(true)), false);
		key.set(true);
		assert.strictEqual(service.contextMatchesRules(rawKey.isEqualTo(false)), false);
		assert.strictEqual(service.contextMatchesRules(rawKey.isEqualTo(true)), true);
	});
});
