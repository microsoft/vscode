/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { reportCodexProviderSwitch } from '../../../node/codex/codexProviderSwitchTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];

	override publicLog2(name?: string, data?: ITelemetryData): void {
		this.events.push({ name, data });
	}
}

suite('CodexProviderSwitchTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const isDesktopThread of [false, true]) {
		test(`reports both subscription directions with desktop origin ${isDesktopThread}`, () => {
			const telemetryService = new TestTelemetryService();

			reportCodexProviderSwitch(telemetryService, 'openai', 'vscode-proxy', isDesktopThread);
			reportCodexProviderSwitch(telemetryService, 'vscode-proxy', 'openai', isDesktopThread);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread },
			}, {
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread },
			}]);
		});
	}

	test('never reports missing, custom, or unchanged providers', () => {
		const telemetryService = new TestTelemetryService();

		for (const [fromProvider, toProvider] of [
			[undefined, 'openai'],
			['vscode-proxy', undefined],
			[undefined, undefined],
			['', 'vscode-proxy'],
			['openai', ''],
			['custom-provider', 'vscode-proxy'],
			['openai', 'https://private-provider.example/api'],
			['openai', 'openai'],
			['vscode-proxy', 'vscode-proxy'],
		]) {
			reportCodexProviderSwitch(telemetryService, fromProvider, toProvider, true);
		}

		assert.deepStrictEqual(telemetryService.events, []);
	});
});
