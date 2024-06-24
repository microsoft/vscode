/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import {
	extractLocalHostUriMetaDataForPortMapping,
	extractQueryLocalHostUriMetaDataForPortMapping
} from 'vs/platform/tunnel/common/tunnel';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


suite('Tunnel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function portMappingDoTest(uri: string,
		func: (uri: URI) => { address: string; port: number } | undefined,
		expectedAddress?: string,
		expectedPort?: number) {
		const res = func(URI.parse(uri));
		assert.strictEqual(!expectedAddress, !res);
		assert.strictEqual(res?.address, expectedAddress);
		assert.strictEqual(res?.port, expectedPort);
	}

	function portMappingTest(uri: string, expectedAddress?: string, expectedPort?: number) {
		portMappingDoTest(uri, extractLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
	}

	function portMappingTestQuery(uri: string, expectedAddress?: string, expectedPort?: number) {
		portMappingDoTest(uri, extractQueryLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
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
