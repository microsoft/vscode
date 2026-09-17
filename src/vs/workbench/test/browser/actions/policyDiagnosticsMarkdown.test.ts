/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { markdownDetails, markdownJsonBlock, markdownTable } from '../../../browser/actions/policyDiagnosticsMarkdown.js';

suite('Policy diagnostics Markdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders escaped tables and collapsed details', () => {
		const output = markdownTable(
			['Property', 'Value'],
			[
				['pipe|name', 'line 1\n- line 2 <script>*'],
				['bracket[one]', 'A & B']
			]
		) + markdownDetails('Raw <settings> & values', markdownJsonBlock({ value: 'raw' }));

		assert.deepStrictEqual(output.split('\n'), [
			'| Property | Value |',
			'| --- | --- |',
			'| pipe\\|name | line 1<br>\\- line 2 &lt;script&gt;\\* |',
			'| bracket\\[one\\] | A &amp; B |',
			'',
			'<details>',
			'<summary>Raw &lt;settings&gt; &amp; values</summary>',
			'',
			'```json',
			'{',
			'  "value": "raw"',
			'}',
			'```',
			'',
			'</details>',
			'',
			''
		]);
	});
});
