/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostClientConnectionKind, agentHostClientConnectionKindValidator, readClientConnectionKind, telemetryLevelToAgentHostValue, toAgentHostClientMeta } from '../../common/agentHostTelemetry.js';

suite('AgentHostTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('connection kind validation and client metadata share the bounded vocabulary', () => {
		const values = ['local', 'direct_websocket', 'dev_tunnel', 'dev_container', 'ssh', 'wsl', 'remote_extension_host', 'web_pub_sub', 'mission_control', 'unknown'];
		assert.deepStrictEqual(values.map(value => ({
			validated: agentHostClientConnectionKindValidator.validate(value).content,
			fromMeta: readClientConnectionKind({ 'vscode.clientConnectionKind': value }),
		})), values.map(value => ({ validated: value, fromMeta: value })));
	});

	test('unrecognized connection kinds cannot expose environment identities', () => {
		const values = [undefined, null, '', 'private-host-name', 'https://private-host', {}, 1];
		assert.deepStrictEqual(values.map(value => ({
			validated: agentHostClientConnectionKindValidator.validate(value).content,
			fromMeta: readClientConnectionKind({ 'vscode.clientConnectionKind': value }),
		})), values.map(() => ({ validated: undefined, fromMeta: AgentHostClientConnectionKind.Unknown })));
	});

	test('telemetryLevelToAgentHostValue always produces a launch argument', () => {
		assert.deepStrictEqual([
			telemetryLevelToAgentHostValue(TelemetryLevel.USAGE),
			telemetryLevelToAgentHostValue(TelemetryLevel.ERROR),
			telemetryLevelToAgentHostValue(TelemetryLevel.CRASH),
			telemetryLevelToAgentHostValue(TelemetryLevel.NONE),
			telemetryLevelToAgentHostValue(undefined),
		], [
			TelemetryConfiguration.ON,
			TelemetryConfiguration.ERROR,
			TelemetryConfiguration.CRASH,
			TelemetryConfiguration.OFF,
			TelemetryConfiguration.OFF,
		]);
	});

	test('Dev Container connection kind round trips through client metadata', () => {
		const meta = toAgentHostClientMeta(
			AgentHostClientConnectionKind.DevContainer,
			TelemetryLevel.USAGE,
			undefined,
			undefined,
		);

		assert.deepStrictEqual({
			meta,
			connectionKind: readClientConnectionKind(meta),
		}, {
			meta: {
				'vscode.telemetryLevel': TelemetryConfiguration.ON,
				'vscode.clientConnectionKind': AgentHostClientConnectionKind.DevContainer,
			},
			connectionKind: AgentHostClientConnectionKind.DevContainer,
		});

		test('Mission Control connection kind round trips through client metadata', () => {
			assert.strictEqual(readClientConnectionKind(toAgentHostClientMeta(AgentHostClientConnectionKind.MissionControl, TelemetryLevel.USAGE, undefined, undefined)), AgentHostClientConnectionKind.MissionControl);
		});
	});
});
