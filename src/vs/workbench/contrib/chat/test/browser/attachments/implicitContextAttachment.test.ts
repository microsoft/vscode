/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isImplicitContextAlreadyAttached } from '../../../browser/attachments/implicitContextAttachment.js';
import { IChatRequestStringVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

suite('ImplicitContextAttachment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches refreshed string context by resource URI', () => {
		const uri = URI.parse('pr://github/microsoft/vscode/195');
		const attachment: IChatRequestStringVariableEntry = {
			kind: 'string',
			id: 'vscode.implicit.string',
			name: '#195 Support for adding, editing, and deleting comments',
			value: 'pull request context',
			uri,
			handle: 1,
		};

		assert.deepStrictEqual({
			refreshedHandle: isImplicitContextAlreadyAttached([attachment], uri, undefined, 2),
			differentResource: isImplicitContextAlreadyAttached([attachment], URI.parse('pr://github/microsoft/vscode/196'), undefined, 2),
		}, {
			refreshedHandle: true,
			differentResource: false,
		});
	});
});
