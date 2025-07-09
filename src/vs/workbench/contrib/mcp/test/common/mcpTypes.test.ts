/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpResourceURI } from '../../common/mcpTypes.js';
import * as assert from 'assert';

suite('MCP Types', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('McpResourceURI - round trips', () => {
		const roundTrip = (uri: string) => {
			const from = McpResourceURI.fromServer({ label: '', id: 'my-id' }, uri);
			const to = McpResourceURI.toServer(from);
			assert.strictEqual(to.definitionId, 'my-id');
			assert.strictEqual(to.resourceURL.toString(), uri, `expected to round trip ${uri}`);
		};

		roundTrip('file:///path/to/file.txt');
		roundTrip('custom-scheme://my-path/to/resource.txt');
		roundTrip('custom-scheme://my-path');
		roundTrip('custom-scheme://my-path/');
		roundTrip('custom-scheme://my-path/?with=query&params=here');

		roundTrip('custom-scheme:///my-path');
		roundTrip('custom-scheme:///my-path/foo/?with=query&params=here');
	});
});
