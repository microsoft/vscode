/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../util/common/test/testUtils';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { BundledClaudeAgentSdkLoaderService } from '../../node/bundledClaudeAgentSdkLoaderService';
import { VsCodeClaudeAgentSdkLoaderService } from '../claudeAgentSdkLoaderService';
import { RoutingClaudeAgentSdkLoaderService } from '../routingClaudeAgentSdkLoaderService';

describe('RoutingClaudeAgentSdkLoaderService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let configurationService: InMemoryConfigurationService;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		configurationService = store.add(new InMemoryConfigurationService(store.add(new DefaultsOnlyConfigurationService())));

		const serviceCollection = store.add(createExtensionUnitTestingServices(store));
		serviceCollection.define(IConfigurationService, configurationService);
		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
	});

	it('uses BundledClaudeAgentSdkLoaderService when useSdkExtension is false (default)', () => {
		const router = instantiationService.createInstance(RoutingClaudeAgentSdkLoaderService);
		expect(router.inner).toBeInstanceOf(BundledClaudeAgentSdkLoaderService);
	});

	it('uses VsCodeClaudeAgentSdkLoaderService when useSdkExtension is true', async () => {
		await configurationService.setConfig(ConfigKey.ClaudeAgentUseSdkExtension, true);
		const router = instantiationService.createInstance(RoutingClaudeAgentSdkLoaderService);
		expect(router.inner).toBeInstanceOf(VsCodeClaudeAgentSdkLoaderService);
	});

	it('forwards isAvailable to the chosen inner loader', () => {
		const router = instantiationService.createInstance(RoutingClaudeAgentSdkLoaderService);
		expect(router.isAvailable).toBe(router.inner.isAvailable);
	});

	it('captures the loader choice at construction (flipping the setting later does not swap)', async () => {
		const router = instantiationService.createInstance(RoutingClaudeAgentSdkLoaderService);
		const initialInner = router.inner;
		expect(initialInner).toBeInstanceOf(BundledClaudeAgentSdkLoaderService);

		await configurationService.setConfig(ConfigKey.ClaudeAgentUseSdkExtension, true);

		expect(router.inner).toBe(initialInner);
	});
});
