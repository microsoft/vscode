/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../base/common/observable.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostPathStyle } from '../../common/agentHostPathStyle.js';
import type { IAgentConnection, IAgentHostNetworkDiagnosticsInfo } from '../../common/agentService.js';
import type { IAgentSubscription } from '../../common/state/agentSubscription.js';
import { PathStyle, type InitializeResult } from '../../common/state/protocol/common/commands.js';
import type { RootState } from '../../common/state/sessionState.js';

suite('AgentHostPathStyle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createConnection(options: {
		readonly pathStyle?: PathStyle;
		readonly platform?: string;
		readonly defaultDirectory?: string;
	}) {
		const initializeResult: InitializeResult = {
			protocolVersion: '1.0.0',
			serverSeq: 0,
			snapshots: [],
			...(options.pathStyle === undefined ? {} : { environment: { pathStyle: options.pathStyle } }),
			defaultDirectory: options.defaultDirectory,
		};
		return new class extends mock<IAgentConnection>() {
			override readonly clientId = 'test-client';
			override readonly rootState = new class extends mock<IAgentSubscription<RootState>>() {
				override readonly value: RootState = {
					agents: [],
					activeSessions: 0,
					_meta: options.platform === undefined ? undefined : {
						'vscode.agentHost.resources': { platform: options.platform },
					},
				};
			}();
			override readonly initializeResult = constObservable(initializeResult);
			networkDiagnosticsRequestCount = 0;

			override async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				this.networkDiagnosticsRequestCount++;
				throw new Error('Path semantics must not use network diagnostics');
			}
		}();
	}

	test('uses standard metadata authoritatively for both path styles', () => {
		const posix = createConnection({
			pathStyle: PathStyle.Posix,
			platform: 'windows',
			defaultDirectory: 'file:///C:/Users/test',
		});
		const windows = createConnection({
			pathStyle: PathStyle.Windows,
			platform: 'linux',
			defaultDirectory: 'file:///home/test',
		});

		assert.deepStrictEqual({
			posix: getAgentHostPathStyle(posix),
			windows: getAgentHostPathStyle(windows),
			diagnosticRequests: [posix.networkDiagnosticsRequestCount, windows.networkDiagnosticsRequestCount],
		}, {
			posix: PathStyle.Posix,
			windows: PathStyle.Windows,
			diagnosticRequests: [0, 0],
		});
	});

	test('supports older hosts with advertised resource platforms', () => {
		assert.deepStrictEqual(
			['windows', 'macos', 'linux'].map(platform => getAgentHostPathStyle(createConnection({ platform }))),
			[PathStyle.Windows, PathStyle.Posix, PathStyle.Posix],
		);
	});

	test('recognizes unmistakably Windows file defaults from older hosts', () => {
		assert.deepStrictEqual(
			['file:///C:/Users/test', 'file:///d:/code', 'file://server/share/home'].map(defaultDirectory => getAgentHostPathStyle(createConnection({ defaultDirectory }))),
			[PathStyle.Windows, PathStyle.Windows, PathStyle.Windows],
		);
	});

	test('does not substitute client semantics when metadata is absent', () => {
		const connection = createConnection({ defaultDirectory: 'file:///home/test' });

		assert.deepStrictEqual({
			pathStyle: getAgentHostPathStyle(connection),
			networkDiagnosticsRequestCount: connection.networkDiagnosticsRequestCount,
		}, {
			pathStyle: undefined,
			networkDiagnosticsRequestCount: 0,
		});
	});

	test('does not infer a connection-wide style when environment metadata explicitly omits it', () => {
		const connection = createConnection({
			platform: 'windows',
			defaultDirectory: 'file:///C:/Users/test',
		});
		connection.initializeResult.get()!.environment = {};

		assert.strictEqual(getAgentHostPathStyle(connection), undefined);
	});

	test('treats a non-conforming null environment as explicitly unknown', () => {
		const connection = createConnection({ platform: 'windows' });
		connection.initializeResult.get()!.environment = null as never;

		assert.strictEqual(getAgentHostPathStyle(connection), undefined);
	});
});
