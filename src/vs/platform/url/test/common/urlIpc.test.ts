/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Client, IClientRouter, IConnectionHub } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { URLHandlerRouter } from '../../common/urlIpc.js';

suite('URLHandlerRouter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes a URI only to the window its windowId names', async () => {
		const fallback: Client<string> = { ctx: 'fallback' };
		const next: IClientRouter<string> = {
			routeCall: () => Promise.resolve(fallback),
			routeEvent: () => Promise.resolve(fallback)
		};
		const hub: IConnectionHub<string> = {
			connections: ['window:10', 'window:1', 'window:21'].map(ctx => ({ ctx })) as IConnectionHub<string>['connections'],
			onDidAddConnection: Event.None,
			onDidRemoveConnection: Event.None
		};
		const router = new URLHandlerRouter(next, new NullLogService());

		const routed = await Promise.all(['1', '2', '10'].map(windowId =>
			router.routeCall(hub, 'handleURL', [URI.parse(`vscode://publisher.extension/callback?windowId=${windowId}`).toJSON()])
		));

		assert.deepStrictEqual(routed.map(client => client.ctx), ['window:1', 'fallback', 'window:10']);
	});
});
