/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPyWidgetClientInstance } from '../../common/languageRuntimeIPyWidgetClient.js';
import { TestRuntimeClientInstance } from './testRuntimeClientInstance.js';
import { TestIPyWidgetsWebviewMessaging } from './testIPyWidgetsWebviewMessaging.js';
import { RuntimeClientType, RuntimeClientState } from '../../common/languageRuntimeClientInstance.js';

class TestLogService {
	trace() { }
	debug() { }
	info() { }
	warn() { }
	error() { }
}

suite('IPyWidgetClientInstance', () => {
	test('should handle webview messages correctly', async () => {
		const client = new TestRuntimeClientInstance('test-client', RuntimeClientType.IPyWidget);
		const messaging = new TestIPyWidgetsWebviewMessaging();
		const logService = new TestLogService();
		const rpcMethods = ['test_method'];

		client.rpcHandler = async () => ({ data: { result: 'success' } });

		const ipyClient = new IPyWidgetClientInstance(client, messaging, logService as any, rpcMethods);

		const message = {
			type: 'comm_msg' as const,
			comm_id: 'test-client',
			msg_id: 'msg-1',
			data: { method: 'test_method', params: [] },
		};

		messaging.sendMessage(message);

		await new Promise(resolve => setTimeout(resolve, 10));

		ipyClient.dispose();
	});

	test('should close when client is disposed', (done) => {
		const client = new TestRuntimeClientInstance('test-client', RuntimeClientType.IPyWidget);
		const messaging = new TestIPyWidgetsWebviewMessaging();
		const logService = new TestLogService();
		const rpcMethods: string[] = [];

		const ipyClient = new IPyWidgetClientInstance(client, messaging, logService as any, rpcMethods);

		ipyClient.onDidClose(() => {
			done();
		});

		client.setClientState(RuntimeClientState.Closed);
	});
});
