/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as Sinon from 'sinon';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsCopilotTokenManager } from '../../auth/copilotTokenManager';
import {
	ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider
} from '../../config';
import { ICompletionsFetcherService, Response } from '../../networking';
import { ConnectionState } from '../../snippy/connectionState';
import { ErrorMessages, ErrorReasons, FormattedSnippyError } from '../../snippy/errorCreator';
import * as Network from '../../snippy/network';
import { createLibTestingContext } from '../../test/context';
import { FakeFetcher, createFakeJsonResponse } from '../../test/fetcher';

const testEndpoints: Record<
	string,
	{ response: Record<string, string>; status: number; expected: Record<string, string> }
> = {
	'400': {
		status: 400,
		response: { code: 'invalid_argument', msg: 'source too short' },
		expected: {
			reason: ErrorReasons.BadArguments,
			msg: 'source too short',
		},
	},
	'401': {
		status: 401,
		response: { error: 'unauthorized' },
		expected: {
			reason: ErrorReasons.Unauthorized,
			msg: ErrorMessages[ErrorReasons.Unauthorized],
		},
	},
	'402': {
		status: 402,
		response: { code: 'payment required', msg: '' },
		expected: {
			reason: ErrorReasons.Unknown,
			msg: 'unknown error',
		},
	},
	'404': {
		status: 404,
		response: { code: 'bad_route', msg: 'no handler for path' },
		expected: {
			reason: ErrorReasons.NotFound,
			msg: 'no handler for path',
		},
	},
	'429': {
		status: 429,
		response: { code: 'rate_limited', msg: 'rate limit' },
		expected: {
			reason: ErrorReasons.RateLimit,
			msg: ErrorMessages[ErrorReasons.RateLimit],
		},
	},
	'500': {
		status: 500,
		response: { error: 'Internal error' },
		expected: {
			reason: ErrorReasons.InternalError,
			msg: ErrorMessages[ErrorReasons.InternalError],
		},
	},
	'503': {
		status: 503,
		response: { error: 'Network error' },
		expected: {
			reason: ErrorReasons.InternalError,
			msg: ErrorMessages[ErrorReasons.InternalError],
		},
	},
};

class SnippyFetcher extends FakeFetcher {
	constructor() {
		super();
	}

	fetch(url: string): Promise<Response> {
		const endpoint = url.split('/').pop()!;
		const testCase = testEndpoints[endpoint] || testEndpoints['404'];

		return Promise.resolve(createFakeJsonResponse(testCase.status, testCase.response));
	}
}

suite('snippy network primitive', function () {
	let accessor: ServicesAccessor;
	let originalConfigProvider: InMemoryConfigProvider;

	setup(function () {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsFetcherService, new SnippyFetcher());
		accessor = serviceCollection.createTestingAccessor();
		originalConfigProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
	});

	teardown(function () {
		ConnectionState.setConnected();
		originalConfigProvider.clearOverrides();
	});

	suite('error handling', function () {
		test.skip('should return a 401 error object when token is invalid', async function () {
			//setStaticSessionTokenManager(ctx, undefined);
			const tokenManager = accessor.get(ICompletionsCopilotTokenManager);
			tokenManager.resetToken();

			const response: FormattedSnippyError = await Network.call(accessor, '', { method: 'GET' });

			assert.strictEqual(response.kind, 'failure');
			assert.strictEqual(response.code, 401);
			assert.strictEqual(response.reason, ErrorReasons.Unauthorized);
			assert.strictEqual(response.msg, ErrorMessages[ErrorReasons.Unauthorized]);
		});
		test('should return a 600 error object when connection is retrying', async function () {
			ConnectionState.setRetrying();

			const response: FormattedSnippyError = await Network.call(accessor, '', { method: 'GET' });

			assert.strictEqual(response.kind, 'failure');
			assert.strictEqual(response.code, 600);
			assert.strictEqual(response.reason, ErrorReasons.ConnectionError);
			assert.strictEqual(response.msg, 'Attempting to reconnect to the public code matching service.');
		});

		test('should return a 601 error object when connection is offline', async function () {
			ConnectionState.setDisconnected();

			const response: FormattedSnippyError = await Network.call(accessor, '', { method: 'GET' });

			assert.strictEqual(response.kind, 'failure');
			assert.strictEqual(response.code, 601);
			assert.strictEqual(response.reason, ErrorReasons.ConnectionError);
			assert.strictEqual(response.msg, 'The public code matching service is offline.');
		});

		test('should return the expect payload for various error codes', async function () {
			const testCases = Object.entries(testEndpoints);
			// Internal errors put CodeQuote into retry mode, so we need to stub that behavior out.
			const stub = Sinon.stub(ConnectionState, 'enableRetry').callsFake(() => { });

			for (const [endpoint, data] of testCases) {
				const response: FormattedSnippyError = await Network.call(accessor, endpoint, { method: 'GET' });

				assert.strictEqual(response.kind, 'failure');
				assert.strictEqual(response.code, data.status);
				assert.strictEqual(response.reason, data.expected.reason);
				assert.strictEqual(response.msg, data.expected.msg);
			}

			stub.restore();
		});
	});

	suite('`call` behavior', function () {
		const sandbox = Sinon.createSandbox();
		let networkStub: Sinon.SinonStub<Parameters<ICompletionsFetcherService['fetch']>>;

		setup(function () {
			networkStub = Sinon.stub(accessor.get(ICompletionsFetcherService), 'fetch');
			networkStub.returns(Promise.resolve(createFakeJsonResponse(200, '{}')));
		});

		teardown(function () {
			sandbox.restore();
		});

		test.skip('uses alternative endpoint when specified', async function () {
			const overrides = new Map<string, unknown>();
			const domainOverride = 'https://fake.net.biz/';
			overrides.set(ConfigKey.DebugSnippyOverrideUrl, domainOverride);

			originalConfigProvider.setOverrides(overrides);

			await Network.call(accessor, '', { method: 'GET' });

			assert.ok(networkStub.getCall(0).args[0].startsWith(domainOverride));
		});

		test('uses the correct snippy twirp endpoint', async function () {
			await Network.call(accessor, 'endpoint/snippy', { method: 'GET' });
			const url = networkStub.getCall(0).args[0];
			assert.ok(url.includes('endpoint/snippy'));
		});

		test('supplies editor information to snippy', async function () {
			await Network.call(accessor, '', { method: 'GET' });

			const headers = networkStub.getCall(0).args[1].headers ?? {};
			const headerKeys = Object.keys(headers);

			assert.ok(headerKeys.includes('Editor-Version'));
			assert.ok(headerKeys.includes('Editor-Plugin-Version'));
		});
	});
});
