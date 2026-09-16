/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OpenerService } from '../../../../editor/browser/services/openerService.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { NullCommandService } from '../../../../platform/commands/test/common/nullCommandService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { MainThreadWindow } from '../../browser/mainThreadWindow.js';

suite('MainThreadWindow', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOpenerService() {
		return new OpenerService(store.add(new TestCodeEditorService(new TestThemeService())), NullCommandService);
	}

	function asExternalUri(openerService: OpenerService, uri: URI) {
		const mainThreadWindow = { openerService } as unknown as MainThreadWindow;
		return MainThreadWindow.prototype.$asExternalUri.call(mainThreadWindow, uri, { allowTunneling: false });
	}

	test('returns unresolved http uris unchanged', async function () {
		const openerService = createOpenerService();
		const uri = URI.parse('https://example.com/path');

		const result = await asExternalUri(openerService, uri);

		assert.strictEqual(URI.from(result).toString(), uri.toString());
	});

	test('propagates external uri resolver errors', async function () {
		const openerService = createOpenerService();
		const expectedError = new Error('resolver failed');
		store.add(openerService.registerExternalUriResolver({
			async resolveExternalUri() {
				throw expectedError;
			}
		}));

		await assert.rejects(asExternalUri(openerService, URI.parse('https://example.com/path')), error => error === expectedError);
	});
});
