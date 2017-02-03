/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { TokenSelectionSupport } from 'vs/editor/contrib/smartSelect/common/tokenSelectionSupport';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

class MockJSMode extends MockMode {

	private static _id = new LanguageIdentifier('mockJSMode', 3);

	constructor() {
		super(MockJSMode._id);

		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEnterRules: [
				{
					// e.g. /** | */
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					afterText: /^\s*\*\/$/,
					action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
				},
				{
					// e.g. /** ...|
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					action: { indentAction: IndentAction.None, appendText: ' * ' }
				},
				{
					// e.g.  * ...|
					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
					action: { indentAction: IndentAction.None, appendText: '* ' }
				},
				{
					// e.g.  */|
					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
					action: { indentAction: IndentAction.None, removeText: 1 }
				},
				{
					// e.g.  *-----*/|
					beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
					action: { indentAction: IndentAction.None, removeText: 1 }
				}
			]
		}));
	}
}

suite('TokenSelectionSupport', () => {

	let modelService: ModelServiceImpl = null;
	let tokenSelectionSupport: TokenSelectionSupport;
	let mode: MockJSMode = null;

	setup(() => {
		modelService = new ModelServiceImpl(null, new TestConfigurationService());
		tokenSelectionSupport = new TokenSelectionSupport(modelService);
		mode = new MockJSMode();
	});

	teardown(() => {
		modelService.dispose();
		mode.dispose();
	});

	function assertGetRangesToPosition(text: string[], lineNumber: number, column: number, ranges: Range[]): void {
		let uri = URI.file('test.js');
		modelService.createModel(text.join('\n'), mode, uri);

		let actual = tokenSelectionSupport.getRangesToPositionSync(uri, {
			lineNumber: lineNumber,
			column: column
		});

		let actualStr = actual.map(r => new Range(r.range.startLineNumber, r.range.startColumn, r.range.endLineNumber, r.range.endColumn).toString());
		let desiredStr = ranges.map(r => String(r));

		assert.deepEqual(actualStr, desiredStr);

		modelService.destroyModel(uri);
	}

	test('getRangesToPosition #1', () => {

		assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			'\t\treturn (bar + (2 * foo))',
			'\t}',
			'}'
		], 3, 20, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(3, 1, 4, 2),
				new Range(3, 1, 3, 27),
				new Range(3, 10, 3, 27),
				new Range(3, 11, 3, 26),
				new Range(3, 17, 3, 26),
				new Range(3, 18, 3, 25),
				// new Range(3, 19, 3, 20)
			]);
	});
});