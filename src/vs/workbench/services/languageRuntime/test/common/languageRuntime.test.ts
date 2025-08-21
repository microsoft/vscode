/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { raceTimeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogger } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { LanguageRuntimeService } from '../../common/languageRuntime.js';
import { ILanguageRuntimeMetadata, LanguageStartupBehavior } from '../../common/languageRuntimeService.js';

suite('Erdos - LanguageRuntimeService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogger());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
	});

	test('register and unregister a runtime', async () => {
		const languageRuntimeService = disposables.add(instantiationService.createInstance(LanguageRuntimeService));

		assert.strictEqual(languageRuntimeService.registeredRuntimes.length, 0);

		const metadata = <ILanguageRuntimeMetadata>{
			runtimeId: 'testRuntimeId',
			languageId: 'testLanguageId',
		};

		const didRegisterRuntime = new Promise<void>((resolve) => {
			const disposable = languageRuntimeService.onDidRegisterRuntime((e) => {
				if (e.runtimeId === metadata.runtimeId) {
					disposable.dispose();
					resolve();
				}
			});
		});

		const runtimeDisposable = languageRuntimeService.registerRuntime(metadata);

		let timedOut = false;
		await raceTimeout(didRegisterRuntime, 10, () => timedOut = true);
		assert(!timedOut, 'Awaiting onDidRegisterRuntime event timed out');

		assert.deepStrictEqual(languageRuntimeService.registeredRuntimes, [metadata]);

		languageRuntimeService.unregisterRuntime(metadata.runtimeId);

		assert.strictEqual(languageRuntimeService.registeredRuntimes.length, 0);

		runtimeDisposable.dispose();
	});

	test('ensure a runtime that is disabled in configuration cannot be registered', async () => {
		const disabledLanguageId = 'disabledLanguage';

		const configService = new TestConfigurationService();

		configService.setUserConfiguration('interpreters', {
			startupBehavior: LanguageStartupBehavior.Disabled
		});

		instantiationService.stub(IConfigurationService, configService);

		const languageRuntimeService = disposables.add(instantiationService.createInstance(LanguageRuntimeService));

		const metadata = <ILanguageRuntimeMetadata>{
			runtimeId: 'disabledRuntimeId',
			languageId: disabledLanguageId
		};

		assert.throws(() => {
			languageRuntimeService.registerRuntime(metadata);
		});

		assert.strictEqual(languageRuntimeService.registeredRuntimes.length, 0);
	});
});
