/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
	getClaimsFromJWT,
	getDefaultMetadataForUrl,
	getMetadataWithDefaultValues,
	isAuthorizationAuthorizeResponse,
	isAuthorizationDeviceResponse,
	isAuthorizationDeviceTokenErrorResponse,
	isAuthorizationDynamicClientRegistrationResponse,
	isAuthorizationProtectedResourceMetadata,
	isAuthorizationServerMetadata,
	isAuthorizationTokenResponse,
	isDynamicClientRegistrationResponse,
	parseWWWAuthenticateHeader,
	fetchDynamicRegistration,
	IAuthorizationJWTClaims,
	IAuthorizationServerMetadata,
	DEFAULT_AUTH_FLOW_PORT
} from '../../common/oauth.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { encodeBase64, VSBuffer } from '../../common/buffer.js';

suite('OAuth', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	suite('Type Guards', () => {
		test('isAuthorizationProtectedResourceMetadata should correctly identify protected resource metadata', () => {
			// Valid metadata
			assert.strictEqual(isAuthorizationProtectedResourceMetadata({ resource: 'https://example.com' }), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationProtectedResourceMetadata(null), false);
			assert.strictEqual(isAuthorizationProtectedResourceMetadata(undefined), false);
			assert.strictEqual(isAuthorizationProtectedResourceMetadata({}), false);
			assert.strictEqual(isAuthorizationProtectedResourceMetadata('not an object'), false);
		});

		test('isAuthorizationServerMetadata should correctly identify server metadata', () => {
			// Valid metadata
			assert.strictEqual(isAuthorizationServerMetadata({
				issuer: 'https://example.com',
				response_types_supported: ['code']
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationServerMetadata(null), false);
			assert.strictEqual(isAuthorizationServerMetadata(undefined), false);
			assert.strictEqual(isAuthorizationServerMetadata({}), false);
			assert.strictEqual(isAuthorizationServerMetadata({ response_types_supported: ['code'] }), false);
			assert.strictEqual(isAuthorizationServerMetadata('not an object'), false);
		});

		test('isAuthorizationDynamicClientRegistrationResponse should correctly identify registration response', () => {
			// Valid response
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({
				client_id: 'client-123',
				client_name: 'Test Client'
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(null), false);
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(undefined), false);
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({}), false);
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_id: 'missing-name' }), false);
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_name: 'missing-id' }), false);
			assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse('not an object'), false);
		});

		test('isAuthorizationAuthorizeResponse should correctly identify authorization response', () => {
			// Valid response
			assert.strictEqual(isAuthorizationAuthorizeResponse({
				code: 'auth-code-123',
				state: 'state-123'
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationAuthorizeResponse(null), false);
			assert.strictEqual(isAuthorizationAuthorizeResponse(undefined), false);
			assert.strictEqual(isAuthorizationAuthorizeResponse({}), false);
			assert.strictEqual(isAuthorizationAuthorizeResponse({ code: 'missing-state' }), false);
			assert.strictEqual(isAuthorizationAuthorizeResponse({ state: 'missing-code' }), false);
			assert.strictEqual(isAuthorizationAuthorizeResponse('not an object'), false);
		});

		test('isAuthorizationTokenResponse should correctly identify token response', () => {
			// Valid response
			assert.strictEqual(isAuthorizationTokenResponse({
				access_token: 'token-123',
				token_type: 'Bearer'
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationTokenResponse(null), false);
			assert.strictEqual(isAuthorizationTokenResponse(undefined), false);
			assert.strictEqual(isAuthorizationTokenResponse({}), false);
			assert.strictEqual(isAuthorizationTokenResponse({ access_token: 'missing-type' }), false);
			assert.strictEqual(isAuthorizationTokenResponse({ token_type: 'missing-token' }), false);
			assert.strictEqual(isAuthorizationTokenResponse('not an object'), false);
		});

		test('isDynamicClientRegistrationResponse should correctly identify client registration response', () => {
			// Valid response
			assert.strictEqual(isDynamicClientRegistrationResponse({
				client_id: 'client-123',
				client_name: 'Test Client'
			}), true);

			// Invalid cases
			assert.strictEqual(isDynamicClientRegistrationResponse(null), false);
			assert.strictEqual(isDynamicClientRegistrationResponse(undefined), false);
			assert.strictEqual(isDynamicClientRegistrationResponse({}), false);
			assert.strictEqual(isDynamicClientRegistrationResponse({ client_id: 'missing-name' }), false);
			assert.strictEqual(isDynamicClientRegistrationResponse({ client_name: 'missing-id' }), false);
			assert.strictEqual(isDynamicClientRegistrationResponse('not an object'), false);
		});

		test('isAuthorizationDeviceResponse should correctly identify device authorization response', () => {
			// Valid response
			assert.strictEqual(isAuthorizationDeviceResponse({
				device_code: 'device-code-123',
				user_code: 'ABCD-EFGH',
				verification_uri: 'https://example.com/verify',
				expires_in: 1800
			}), true);

			// Valid response with optional fields
			assert.strictEqual(isAuthorizationDeviceResponse({
				device_code: 'device-code-123',
				user_code: 'ABCD-EFGH',
				verification_uri: 'https://example.com/verify',
				verification_uri_complete: 'https://example.com/verify?user_code=ABCD-EFGH',
				expires_in: 1800,
				interval: 5
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationDeviceResponse(null), false);
			assert.strictEqual(isAuthorizationDeviceResponse(undefined), false);
			assert.strictEqual(isAuthorizationDeviceResponse({}), false);
			assert.strictEqual(isAuthorizationDeviceResponse({ device_code: 'missing-others' }), false);
			assert.strictEqual(isAuthorizationDeviceResponse({ user_code: 'missing-others' }), false);
			assert.strictEqual(isAuthorizationDeviceResponse({ verification_uri: 'missing-others' }), false);
			assert.strictEqual(isAuthorizationDeviceResponse({ expires_in: 1800 }), false);
			assert.strictEqual(isAuthorizationDeviceResponse({
				device_code: 'device-code-123',
				user_code: 'ABCD-EFGH',
				verification_uri: 'https://example.com/verify'
				// Missing expires_in
			}), false);
			assert.strictEqual(isAuthorizationDeviceResponse('not an object'), false);
		});

		test('isAuthorizationDeviceTokenErrorResponse should correctly identify device token error response', () => {
			// Valid error response
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({
				error: 'authorization_pending',
				error_description: 'The authorization request is still pending'
			}), true);

			// Valid error response with different error codes
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({
				error: 'slow_down',
				error_description: 'Polling too fast'
			}), true);

			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({
				error: 'access_denied',
				error_description: 'The user denied the request'
			}), true);

			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({
				error: 'expired_token',
				error_description: 'The device code has expired'
			}), true);

			// Valid response with optional error_uri
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({
				error: 'invalid_request',
				error_description: 'The request is missing a required parameter',
				error_uri: 'https://example.com/error'
			}), true);

			// Invalid cases
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse(null), false);
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse(undefined), false);
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({}), false);
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({ error: 'missing-description' }), false);
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse({ error_description: 'missing-error' }), false);
			assert.strictEqual(isAuthorizationDeviceTokenErrorResponse('not an object'), false);
		});
	});

	suite('Utility Functions', () => {
		test('getDefaultMetadataForUrl should return correct default endpoints', () => {
			const authorizationServer = new URL('https://auth.example.com');
			const metadata = getDefaultMetadataForUrl(authorizationServer);

			assert.strictEqual(metadata.issuer, 'https://auth.example.com/');
			assert.strictEqual(metadata.authorization_endpoint, 'https://auth.example.com/authorize');
			assert.strictEqual(metadata.token_endpoint, 'https://auth.example.com/token');
			assert.strictEqual(metadata.registration_endpoint, 'https://auth.example.com/register');
			assert.deepStrictEqual(metadata.response_types_supported, ['code', 'id_token', 'id_token token']);
		});

		test('getMetadataWithDefaultValues should fill in missing endpoints', () => {
			const minimal: IAuthorizationServerMetadata = {
				issuer: 'https://auth.example.com',
				response_types_supported: ['code']
			};

			const complete = getMetadataWithDefaultValues(minimal);

			assert.strictEqual(complete.issuer, 'https://auth.example.com');
			assert.strictEqual(complete.authorization_endpoint, 'https://auth.example.com/authorize');
			assert.strictEqual(complete.token_endpoint, 'https://auth.example.com/token');
			assert.strictEqual(complete.registration_endpoint, 'https://auth.example.com/register');
			assert.deepStrictEqual(complete.response_types_supported, ['code']);
		});

		test('getMetadataWithDefaultValues should preserve custom endpoints', () => {
			const custom: IAuthorizationServerMetadata = {
				issuer: 'https://auth.example.com',
				authorization_endpoint: 'https://auth.example.com/custom-authorize',
				token_endpoint: 'https://auth.example.com/custom-token',
				registration_endpoint: 'https://auth.example.com/custom-register',
				response_types_supported: ['code', 'token']
			};

			const complete = getMetadataWithDefaultValues(custom);

			assert.strictEqual(complete.authorization_endpoint, 'https://auth.example.com/custom-authorize');
			assert.strictEqual(complete.token_endpoint, 'https://auth.example.com/custom-token');
			assert.strictEqual(complete.registration_endpoint, 'https://auth.example.com/custom-register');
		});
	});

	suite('Parsing Functions', () => {
		test('parseWWWAuthenticateHeader should correctly parse simple header', () => {
			const result = parseWWWAuthenticateHeader('Bearer');
			assert.strictEqual(result.scheme, 'Bearer');
			assert.deepStrictEqual(result.params, {});
		});

		test('parseWWWAuthenticateHeader should correctly parse header with parameters', () => {
			const result = parseWWWAuthenticateHeader('Bearer realm="api", error="invalid_token", error_description="The access token expired"');

			assert.strictEqual(result.scheme, 'Bearer');
			assert.deepStrictEqual(result.params, {
				realm: 'api',
				error: 'invalid_token',
				error_description: 'The access token expired'
			});
		});

		test('getClaimsFromJWT should correctly parse a JWT token', () => {
			// Create a sample JWT with known payload
			const payload: IAuthorizationJWTClaims = {
				jti: 'id123',
				sub: 'user123',
				iss: 'https://example.com',
				aud: 'client123',
				exp: 1716239022,
				iat: 1716235422,
				name: 'Test User'
			};

			// Create fake but properly formatted JWT
			const header = { alg: 'HS256', typ: 'JWT' };
			const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
			const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)));
			const fakeSignature = 'fake-signature';
			const token = `${encodedHeader}.${encodedPayload}.${fakeSignature}`;

			const claims = getClaimsFromJWT(token);
			assert.deepStrictEqual(claims, payload);
		});

		test('getClaimsFromJWT should throw for invalid JWT format', () => {
			// Test with wrong number of parts - should throw "Invalid JWT token format"
			assert.throws(() => getClaimsFromJWT('only.two'), /Invalid JWT token format.*three parts/);
			assert.throws(() => getClaimsFromJWT('one'), /Invalid JWT token format.*three parts/);
			assert.throws(() => getClaimsFromJWT('has.four.parts.here'), /Invalid JWT token format.*three parts/);
		});

		test('getClaimsFromJWT should throw for invalid header content', () => {
			// Create JWT with invalid header
			const encodedHeader = encodeBase64(VSBuffer.fromString('not-json'));
			const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify({ sub: 'test' })));
			const token = `${encodedHeader}.${encodedPayload}.signature`;

			assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
		});

		test('getClaimsFromJWT should throw for invalid payload content', () => {
			// Create JWT with valid header but invalid payload
			const header = { alg: 'HS256', typ: 'JWT' };
			const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
			const encodedPayload = encodeBase64(VSBuffer.fromString('not-json'));
			const token = `${encodedHeader}.${encodedPayload}.signature`;

			assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
		});
	});

	suite('Network Functions', () => {
		let sandbox: sinon.SinonSandbox;
		let fetchStub: sinon.SinonStub;

		setup(() => {
			sandbox = sinon.createSandbox();
			fetchStub = sandbox.stub(globalThis, 'fetch');
		});

		teardown(() => {
			sandbox.restore();
		});

		test('fetchDynamicRegistration should make correct request and parse response', async () => {
			// Setup successful response
			const mockResponse = {
				client_id: 'generated-client-id',
				client_name: 'Test Client',
				client_uri: 'https://code.visualstudio.com'
			};

			fetchStub.resolves({
				ok: true,
				json: async () => mockResponse
			} as Response);

			const result = await fetchDynamicRegistration(
				'https://auth.example.com/register',
				'Test Client'
			);

			// Verify fetch was called correctly
			assert.strictEqual(fetchStub.callCount, 1);
			const [url, options] = fetchStub.firstCall.args;
			assert.strictEqual(url, 'https://auth.example.com/register');
			assert.strictEqual(options.method, 'POST');
			assert.strictEqual(options.headers['Content-Type'], 'application/json');

			// Verify request body
			const requestBody = JSON.parse(options.body as string);
			assert.strictEqual(requestBody.client_name, 'Test Client');
			assert.strictEqual(requestBody.client_uri, 'https://code.visualstudio.com');
			assert.deepStrictEqual(requestBody.grant_types, ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code']);
			assert.deepStrictEqual(requestBody.response_types, ['code']);
			assert.deepStrictEqual(requestBody.redirect_uris, [
				'https://insiders.vscode.dev/redirect',
				'https://vscode.dev/redirect',
				'http://localhost/',
				'http://127.0.0.1/',
				`http://localhost:${DEFAULT_AUTH_FLOW_PORT}/`,
				`http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
			]);

			// Verify response is processed correctly
			assert.deepStrictEqual(result, mockResponse);
		});

		test('fetchDynamicRegistration should throw error on non-OK response', async () => {
			fetchStub.resolves({
				ok: false,
				statusText: 'Bad Request'
			} as Response);

			await assert.rejects(
				async () => await fetchDynamicRegistration('https://auth.example.com/register', 'Test Client'),
				/Registration failed: Bad Request/
			);
		});

		test('fetchDynamicRegistration should throw error on invalid response format', async () => {
			fetchStub.resolves({
				ok: true,
				json: async () => ({ invalid: 'response' }) // Missing required fields
			} as Response);

			await assert.rejects(
				async () => await fetchDynamicRegistration('https://auth.example.com/register', 'Test Client'),
				/Invalid authorization dynamic client registration response/
			);
		});
	});
});
