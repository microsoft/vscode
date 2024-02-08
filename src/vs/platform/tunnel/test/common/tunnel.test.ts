/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { extractLocalHostUriMetaDataForPortMapping } from 'vs/platform/tunnel/common/tunnel';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


suite('Tunnel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function portMappingDoTest(res: { address: string; port: number } | undefined, expectedAddress?: string, expectedPort?: number) {
		assert.strictEqual(!expectedAddress, !res);
		assert.strictEqual(res?.address, expectedAddress);
		assert.strictEqual(res?.port, expectedPort);
	}

	function portMappingTest(uri: string, expectedAddress?: string, expectedPort?: number) {
		for (const checkQuery of [true, false]) {
			portMappingDoTest(extractLocalHostUriMetaDataForPortMapping(URI.parse(uri), { checkQuery }), expectedAddress, expectedPort);
		}
	}

	function portMappingTestQuery(uri: string, expectedAddress?: string, expectedPort?: number) {
		portMappingDoTest(extractLocalHostUriMetaDataForPortMapping(URI.parse(uri)), expectedAddress, expectedPort);
		portMappingDoTest(extractLocalHostUriMetaDataForPortMapping(URI.parse(uri), { checkQuery: false }), undefined, undefined);
	}

	test('portMapping', () => {
		portMappingTest('file:///foo.bar/baz');
		portMappingTest('http://foo.bar:1234');
		portMappingTest('http://localhost:8080', 'localhost', 8080);
		portMappingTest('https://localhost:443', 'localhost', 443);
		portMappingTest('http://127.0.0.1:3456', '127.0.0.1', 3456);
		portMappingTest('http://0.0.0.0:7654', '0.0.0.0', 7654);
		portMappingTest('http://localhost:8080/path?foo=bar', 'localhost', 8080);
		portMappingTest('http://localhost:8080/path?foo=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8080);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081&url2=http%3A%2F%2Flocalhost%3A8082', 'localhost', 8081);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Fmicrosoft.com%2Fbad&url2=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
	});
});
