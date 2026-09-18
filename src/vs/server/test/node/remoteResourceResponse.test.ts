/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getRemoteResourceResponseHeaders } from '../../node/remoteResourceResponse.js';

suite('Remote resource response', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows trusted workbench and configured web endpoint origins', () => {
		const allowedWebEndpointOrigin = 'https://example.vscode-cdn.net';
		const getHeaders = (origin: string | undefined) => getRemoteResourceResponseHeaders(origin, candidate => candidate === allowedWebEndpointOrigin);

		assert.deepStrictEqual({
			nativeWorkbench: getHeaders('vscode-file://vscode-app')['Access-Control-Allow-Origin'],
			webEndpoint: getHeaders(allowedWebEndpointOrigin)['Access-Control-Allow-Origin'],
			webview: getHeaders('vscode-webview://01234567-89ab-cdef-0123-456789abcdef')['Access-Control-Allow-Origin'],
			untrusted: getHeaders('https://example.com')['Access-Control-Allow-Origin'],
			vary: getHeaders(undefined).Vary,
		}, {
			nativeWorkbench: 'vscode-file://vscode-app',
			webEndpoint: allowedWebEndpointOrigin,
			webview: undefined,
			untrusted: undefined,
			vary: 'Origin',
		});
	});
});
