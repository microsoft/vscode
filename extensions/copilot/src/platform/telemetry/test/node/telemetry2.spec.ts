/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IEnvService } from '../../../env/common/envService';
import { createPlatformServices } from '../../../test/node/services';
import { ITelemetryUserConfig, TelemetryUserConfigImpl, createTrackingIdGetter } from '../../common/telemetry';
import { TelemetryData } from '../../common/telemetryData';

suite('Telemetry unit tests', function () {
	test('Can create telemetry user config with values', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const config = instantiationService.createInstance(TelemetryUserConfigImpl, 'trackingId', true);

		assert.strictEqual(config.trackingId, 'trackingId');
		assert.ok(config.optedIn);
	});

	test('Telemetry user config has undefined tracking id', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const config = instantiationService.createInstance(TelemetryUserConfigImpl, undefined, undefined);

		assert.strictEqual(config.trackingId, undefined);
	});

	test('Telemetry user config uses trackingId', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const config = instantiationService.createInstance(TelemetryUserConfigImpl, 'trackingId', undefined);

		assert.strictEqual(config.trackingId, 'trackingId');
	});

	test('Telemetry user config updates on token change', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const config = instantiationService.createInstance(TelemetryUserConfigImpl, undefined, undefined);
		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=0123456789abcdef0123456789abcdef;rt=1;ssc=0;dom=org1.com;ol=org1,org2',
			organization_list: ['org1', 'org2'],
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		accessor.get(ICopilotTokenStore).copilotToken = copilotToken;

		assert.strictEqual(config.trackingId, '0123456789abcdef0123456789abcdef');
		assert.strictEqual(config.organizationsList, 'org1,org2');
		assert.ok(config.optedIn);
	});

	test('Telemetry user config updates on token change and opts out', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const config = instantiationService.createInstance(TelemetryUserConfigImpl, undefined, undefined);
		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=0123456789abcdef0123456789abcdef;rt=0;ssc=0;dom=org1.com;ol=org1,org2',
			username: 'fake',
			copilot_plan: 'unknown'
		}));

		accessor.get(ICopilotTokenStore).copilotToken = copilotToken;

		assert.ok(!config.optedIn);
	});

	test('Telemetry user config updates enterprise_list on token change', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const config = instantiationService.createInstance(TelemetryUserConfigImpl, undefined, undefined);
		const copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=0123456789abcdef0123456789abcdef;rt=1;ssc=0;dom=org1.com;ol=org1,org2',
			organization_list: ['org1', 'org2'],
			enterprise_list: [12345, 67890],
			username: 'fake',
			copilot_plan: 'enterprise',
		}));

		accessor.get(ICopilotTokenStore).copilotToken = copilotToken;

		assert.strictEqual(config.trackingId, '0123456789abcdef0123456789abcdef');
		assert.strictEqual(config.organizationsList, 'org1,org2');
		assert.strictEqual(config.enterpriseList, '12345,67890');
		assert.ok(config.optedIn);
	});

	test('TelemetryData includes enterprise_list in config properties', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const configService = accessor.get(IConfigurationService);
		const envService = accessor.get(IEnvService);

		const telemetryUserConfig: ITelemetryUserConfig = {
			_serviceBrand: undefined,
			trackingId: 'test-tracking-id',
			organizationsList: 'org1,org2',
			enterpriseList: '12345,67890',
			optedIn: true,
		};

		const telemetryData = TelemetryData.createAndMarkAsIssued({}, {});
		telemetryData.extendWithConfigProperties(configService, envService, telemetryUserConfig);

		// Note: keys use dots before sanitizeKeys() is called
		assert.strictEqual(telemetryData.properties['copilot.trackingId'], 'test-tracking-id');
		assert.strictEqual(telemetryData.properties['organizations_list'], 'org1,org2');
		assert.strictEqual(telemetryData.properties['enterprise_list'], '12345,67890');
	});

	test('TelemetryData omits enterprise_list when undefined', async function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const configService = accessor.get(IConfigurationService);
		const envService = accessor.get(IEnvService);

		const telemetryUserConfig: ITelemetryUserConfig = {
			_serviceBrand: undefined,
			trackingId: 'test-tracking-id',
			organizationsList: 'org1,org2',
			enterpriseList: undefined,
			optedIn: true,
		};

		const telemetryData = TelemetryData.createAndMarkAsIssued({}, {});
		telemetryData.extendWithConfigProperties(configService, envService, telemetryUserConfig);

		// Note: keys use dots before sanitizeKeys() is called
		assert.strictEqual(telemetryData.properties['copilot.trackingId'], 'test-tracking-id');
		assert.strictEqual(telemetryData.properties['organizations_list'], 'org1,org2');
		assert.strictEqual(telemetryData.properties['enterprise_list'], undefined);
	});

	test('createTrackingIdGetter returns undefined when no token is available', function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const tokenStore = accessor.get(ICopilotTokenStore);

		const getTrackingId = createTrackingIdGetter(tokenStore);

		assert.strictEqual(getTrackingId(), undefined);
	});

	test('createTrackingIdGetter eagerly reads existing token', function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const tokenStore = accessor.get(ICopilotTokenStore);
		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=abc123;rt=1',
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		const getTrackingId = createTrackingIdGetter(tokenStore);

		assert.strictEqual(getTrackingId(), 'abc123');
	});

	test('createTrackingIdGetter updates on token store change', function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const tokenStore = accessor.get(ICopilotTokenStore);

		const getTrackingId = createTrackingIdGetter(tokenStore);
		assert.strictEqual(getTrackingId(), undefined);

		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=abc123;rt=1',
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		assert.strictEqual(getTrackingId(), 'abc123');
	});

	test('createTrackingIdGetter preserves cached value when token is cleared', function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const tokenStore = accessor.get(ICopilotTokenStore);

		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=abc123;rt=1',
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		const getTrackingId = createTrackingIdGetter(tokenStore);
		assert.strictEqual(getTrackingId(), 'abc123');

		// Simulate token reset (e.g. 401 error)
		tokenStore.copilotToken = undefined;

		assert.strictEqual(getTrackingId(), 'abc123');
	});

	test('createTrackingIdGetter updates cached value on token refresh', function () {
		const accessor = createPlatformServices().createTestingAccessor();
		const tokenStore = accessor.get(ICopilotTokenStore);

		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=abc123;rt=1',
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		const getTrackingId = createTrackingIdGetter(tokenStore);
		assert.strictEqual(getTrackingId(), 'abc123');

		// Simulate token refresh with new token (same tid, as expected)
		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=def456;rt=1',
			username: 'fake',
			copilot_plan: 'unknown',
		}));

		assert.strictEqual(getTrackingId(), 'def456');
	});
});
