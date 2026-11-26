/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getClosedCodeFenceInfo } from '../../../common/widget/codeFence.js';

suite('getClosedCodeFenceInfo', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the info string of a closed fence, and nothing for a fence that is still open', () => {
		assert.deepStrictEqual([
			'```vscode-ui\n<Text>A</Text>\n```',
			'~~~~ vscode-ui v1 \r\n<Text>A</Text>\r\n~~~~~\n\n',
			'   ```\ncode\n   ```',
			'```vscode-ui\n<Text>A</Text>',
			'```vscode-ui\n<Text>A</Text>\n``',
			'````vscode-ui\n<Text>A</Text>\n```',
			'```vscode-ui\n<Text>A</Text>\n~~~',
			'```vscode-ui\n<Text>A</Text>\n    ```',
			'```vscode-ui\n<Text>A</Text>\n``` trailing',
			'```vscode-ui```',
			'',
			undefined,
		].map(raw => getClosedCodeFenceInfo(raw)), [
			'vscode-ui',
			'vscode-ui v1',
			'',
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});
});
