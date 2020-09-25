/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { LocalFileAccess, Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';

suite('network', () => {

	test('LocalFileAccess', () => {

		// fromModuleId()
		const fromModuleId = LocalFileAccess.fromModuleId('vs/base/test/node/network.test');
		assert.equal(fromModuleId.scheme, Schemas.vscodeFileResource);

		// rewrite(): throws for non-file URIs
		let error: Error | undefined = undefined;
		try {
			LocalFileAccess.rewrite(URI.parse('some:value'));
		} catch (e) {
			error = e;
		}
		assert.ok(error);

		// restore(): throws for non-vscode-file URIs
		error = undefined;
		try {
			LocalFileAccess.restore(URI.parse('some:value'));
		} catch (e) {
			error = e;
		}
		assert.ok(error);

		// rewrite() & restore(): simple, without authority
		let originalFileUri = URI.file(__filename);
		let rewrittenUri = LocalFileAccess.rewrite(originalFileUri);
		assert.ok(rewrittenUri.authority.length > 0);
		let restoredUri = LocalFileAccess.restore(rewrittenUri);
		assert.equal(restoredUri.authority.length, 0);
		assert(isEqual(originalFileUri, restoredUri));

		// rewrite() & restore(): with authority
		originalFileUri = URI.file(__filename).with({ authority: 'test-authority' });
		rewrittenUri = LocalFileAccess.rewrite(originalFileUri);
		assert.equal(rewrittenUri.authority, originalFileUri.authority);
		restoredUri = LocalFileAccess.restore(rewrittenUri);
		assert(isEqual(originalFileUri, restoredUri));
	});
});
