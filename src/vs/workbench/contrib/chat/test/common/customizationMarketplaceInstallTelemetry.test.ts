/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { getAvailableCustomizationMarketplaceInstallTelemetryContext, getCustomizationMarketplaceInstallTelemetryContext, runCustomizationMarketplaceInstallWithTelemetry } from '../../common/customizationMarketplaceInstallTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		if (eventName && data) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('Customization marketplace install telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('maps every validated installation kind to bounded categories', () => {
		assert.deepStrictEqual([
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'skill', repository: 'owner/repository', ref: 'main', path: 'skills/demo' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'mcp', name: 'server', version: '1.0.0' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'mcpGallery', name: 'server', registry: 'default', registryUrl: 'https://registry.example' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'plugin', repository: 'owner/repository', ref: 'main', path: 'plugins/demo' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'configuredPlugin' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'providerPlugin', name: 'azure', marketplace: 'awesome-copilot' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'providerCatalog', resourceKind: 'skill', selectionId: 'selection' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'providerCatalog', resourceKind: 'mcp', selectionId: 'selection' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'providerCatalog', resourceKind: 'plugin', selectionId: 'selection' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', { kind: 'copilotConnector', name: 'mail' }),
			getCustomizationMarketplaceInstallTelemetryContext('marketplace', undefined),
			getAvailableCustomizationMarketplaceInstallTelemetryContext('mcpServer'),
			getAvailableCustomizationMarketplaceInstallTelemetryContext('plugin'),
		], [
			{ surface: 'marketplace', customizationType: 'skill', installKind: 'skill' },
			{ surface: 'marketplace', customizationType: 'mcpServer', installKind: 'mcp' },
			{ surface: 'marketplace', customizationType: 'mcpServer', installKind: 'mcpGallery' },
			{ surface: 'marketplace', customizationType: 'plugin', installKind: 'plugin' },
			{ surface: 'marketplace', customizationType: 'plugin', installKind: 'configuredPlugin' },
			{ surface: 'marketplace', customizationType: 'plugin', installKind: 'providerPlugin' },
			{ surface: 'marketplace', customizationType: 'skill', installKind: 'providerCatalog' },
			{ surface: 'marketplace', customizationType: 'mcpServer', installKind: 'providerCatalog' },
			{ surface: 'marketplace', customizationType: 'plugin', installKind: 'providerCatalog' },
			{ surface: 'marketplace', customizationType: 'connector', installKind: 'copilotConnector' },
			{ surface: 'marketplace', customizationType: 'unknown', installKind: 'unknown' },
			{ surface: 'available', customizationType: 'mcpServer', installKind: 'mcpGallery' },
			{ surface: 'available', customizationType: 'plugin', installKind: 'configuredPlugin' },
		]);
	});

	test('reports success, error, and cancellation across both surfaces without error content', async () => {
		const telemetryService = new TestTelemetryService();
		await runCustomizationMarketplaceInstallWithTelemetry(
			telemetryService,
			{ surface: 'marketplace', customizationType: 'skill', installKind: 'skill' },
			async () => { },
		);
		await assert.rejects(runCustomizationMarketplaceInstallWithTelemetry(
			telemetryService,
			{ surface: 'available', customizationType: 'plugin', installKind: 'configuredPlugin' },
			async () => { throw new Error('private installation error'); },
		), /private installation error/);
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(runCustomizationMarketplaceInstallWithTelemetry(
			telemetryService,
			{ surface: 'marketplace', customizationType: 'mcpServer', installKind: 'mcpGallery' },
			async () => { throw new Error('private cancellation error'); },
			cancellation.token,
		), /private cancellation error/);

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			...event,
			data: { ...event.data, durationMs: typeof event.data.durationMs === 'number' },
		})), [{
			name: 'chatCustomizationMarketplace.install',
			data: {
				surface: 'marketplace',
				customizationType: 'skill',
				installKind: 'skill',
				outcome: 'success',
				durationMs: true,
			},
		}, {
			name: 'chatCustomizationMarketplace.install',
			data: {
				surface: 'available',
				customizationType: 'plugin',
				installKind: 'configuredPlugin',
				outcome: 'error',
				durationMs: true,
			},
		}, {
			name: 'chatCustomizationMarketplace.install',
			data: {
				surface: 'marketplace',
				customizationType: 'mcpServer',
				installKind: 'mcpGallery',
				outcome: 'cancelled',
				durationMs: true,
			},
		}]);
	});
});
