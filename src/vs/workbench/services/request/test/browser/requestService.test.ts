/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { BrowserRequestService } from '../../browser/requestService.js';

suite('BrowserRequestService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const store = new DisposableStore();
	let service: BrowserRequestService;
	let localCalls: number;
	let remoteCalls: number;
	let localFailure: string;
	const localError = new Error('Local response lost');
	const remoteError = new Error('Remote transport reached');

	// Keep the existing LogService constructor lifecycle issue separate from request-path leak checks.
	suiteSetup(() => {
		const connection = new class extends mock<IRemoteAgentConnection>() {
			override async withChannel(): Promise<never> {
				remoteCalls++;
				throw remoteError;
			}
		}();
		const remote = new class extends mock<IRemoteAgentService>() {
			override getConnection() { return connection; }
		}();
		service = store.add(new class extends BrowserRequestService {
			protected override async logAndRequest(_options: IRequestOptions, _request: () => Promise<IRequestContext>): Promise<IRequestContext> {
				localCalls++;
				if (localFailure === 'exception') {
					throw localError;
				}
				return { res: { statusCode: 405, headers: {} }, stream: bufferToStream(VSBuffer.fromString('')) };
			}
		}(remote, new TestConfigurationService(), store.add(new NullLoggerService())));
	});
	suiteTeardown(() => store.dispose());

	for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
		for (const failure of ['exception', '405']) {
			for (const disableRemoteFallback of [undefined, true]) {
				test(`${method} ${failure}: remote fallback ${disableRemoteFallback ? 'disabled' : 'default'}`, async () => {
					localCalls = 0;
					remoteCalls = 0;
					localFailure = failure;
					const response = service.request({ type: method, url: 'https://example.com', callSite: 'test', disableRemoteFallback }, CancellationToken.None);
					if (disableRemoteFallback && failure === '405') {
						assert.strictEqual((await response).res.statusCode, 405);
					} else {
						await assert.rejects(response, error => error === (disableRemoteFallback ? localError : remoteError));
					}
					assert.deepStrictEqual({ localCalls, remoteCalls }, { localCalls: 1, remoteCalls: disableRemoteFallback ? 0 : 1 });
				});
			}
		}
	}
});
