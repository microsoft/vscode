/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { IRequestService } from '../../../request/common/request.js';
import { exchangeMarketplaceResourceToken, IMarketplaceProtectedResource } from '../../common/extensionGalleryManifest.js';

function jsonContext(statusCode: number, body: unknown): IRequestContext {
	return {
		res: { statusCode, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body)))
	};
}

class TestRequestService extends mock<IRequestService>() {
	readonly calls: { type: string; url: string }[] = [];
	constructor(private readonly handler: (options: IRequestOptions) => IRequestContext) {
		super();
	}
	override async request(options: IRequestOptions, _token: CancellationToken): Promise<IRequestContext> {
		this.calls.push({ type: options.type ?? 'GET', url: options.url ?? '' });
		return this.handler(options);
	}
	private gets(): number { return this.calls.filter(c => c.type === 'GET').length; }
	private posts(): number { return this.calls.filter(c => c.type === 'POST').length; }
	get getCount(): number { return this.gets(); }
	get postCount(): number { return this.posts(); }
}

suite('exchangeMarketplaceResourceToken', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const authorizationServer = 'https://as.example.com';
	const protectedResource: IMarketplaceProtectedResource = {
		authorizationServer,
		resource: 'https://marketplace.example.com',
		scopes: []
	};

	test('does not POST the token exchange when cancelled during authorization-server discovery', async () => {
		const cts = store.add(new CancellationTokenSource());
		const metadata = { issuer: authorizationServer, token_endpoint: `${authorizationServer}/token`, response_types_supported: ['code'] };
		const service = new TestRequestService(options => {
			if ((options.type ?? 'GET') === 'GET') {
				// Simulate a sign-out / account switch happening while the discovery GET is in flight.
				cts.cancel();
				return jsonContext(200, metadata);
			}
			return jsonContext(200, { access_token: 'exchanged' });
		});

		const result = await exchangeMarketplaceResourceToken(service, protectedResource, 'subject', () => true, cts.token);

		assert.deepStrictEqual(
			{ result, gets: service.getCount, posts: service.postCount },
			{ result: undefined, gets: 1, posts: 0 }
		);
	});

	test('does not exchange when the discovered issuer does not match the authorization server', async () => {
		const cts = store.add(new CancellationTokenSource());
		const mismatched = { issuer: 'https://evil.example.com', token_endpoint: 'https://evil.example.com/token', response_types_supported: ['code'] };
		const service = new TestRequestService(options => {
			if ((options.type ?? 'GET') === 'GET') {
				return jsonContext(200, mismatched);
			}
			return jsonContext(200, { access_token: 'exchanged' });
		});

		const result = await exchangeMarketplaceResourceToken(service, protectedResource, 'subject', () => true, cts.token);

		assert.deepStrictEqual(
			{ result, posts: service.postCount },
			{ result: undefined, posts: 0 }
		);
	});
});
