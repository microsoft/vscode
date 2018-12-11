/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { MockMode, StaticLanguageSelector } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { TokenTreeSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/tokenTree';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { BracketSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/bracketSelections';

class TestTextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: any;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI): string {
		const filesConfiguration = this.configurationService.getValue<{ eol: string }>('files');
		if (filesConfiguration && filesConfiguration.eol) {
			if (filesConfiguration.eol !== 'auto') {
				return filesConfiguration.eol;
			}
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}

class MockJSMode extends MockMode {

	private static readonly _id = new LanguageIdentifier('mockJSMode', 3);

	constructor() {
		super(MockJSMode._id);

		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEnterRules: javascriptOnEnterRules
		}));
	}
}

suite('SmartSelect', () => {

	let modelService: ModelServiceImpl;
	let mode: MockJSMode;

	setup(() => {
		const configurationService = new TestConfigurationService();
		modelService = new ModelServiceImpl(new MarkerService(), configurationService, new TestTextResourcePropertiesService(configurationService));
		mode = new MockJSMode();
	});

	teardown(() => {
		modelService.dispose();
		mode.dispose();
	});

	function assertGetRangesToPosition(text: string[], lineNumber: number, column: number, ranges: Range[]): void {
		let uri = URI.file('test.js');
		let model = modelService.createModel(text.join('\n'), new StaticLanguageSelector(mode.getLanguageIdentifier()), uri);

		let actual = new TokenTreeSelectionRangeProvider().provideSelectionRanges(model, new Position(lineNumber, column));


		let actualStr = actual.map(r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn).toString());
		let desiredStr = ranges.reverse().map(r => String(r));

		assert.deepEqual(actualStr, desiredStr);

		modelService.destroyModel(uri);
	}

	test('getRangesToPosition #1', () => {

		return assertGetRangesToPosition([
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

	test('getRangesToPosition #56886. Skip empty lines correctly.', () => {

		return assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			'',
			'\t}',
			'}'
		], 3, 1, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3)
			]);
	});

	test('getRangesToPosition #56886. Do not skip lines with only whitespaces.', () => {

		return assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			' ',
			'\t}',
			'}'
		], 3, 1, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(3, 1, 4, 2),
				new Range(3, 1, 3, 2)
			]);
	});

	test('getRangesToPosition #40658. Cursor at first position inside brackets should select line inside.', () => {

		return assertGetRangesToPosition([
			' [ ]',
			' { } ',
			'( ) '
		], 2, 3, [
				new Range(1, 1, 3, 5),
				new Range(2, 1, 2, 6),
				new Range(2, 2, 2, 5),
				new Range(2, 3, 2, 4)
			]);
	});

	test('getRangesToPosition #40658. Cursor in empty brackets should reveal brackets first.', () => {

		return assertGetRangesToPosition([
			' [] ',
			' { } ',
			'  ( ) '
		], 1, 3, [
				new Range(1, 1, 3, 7),
				new Range(1, 1, 1, 5),
				new Range(1, 2, 1, 4)
			]);
	});

	test('getRangesToPosition #40658. Tokens before bracket will be revealed first.', () => {

		return assertGetRangesToPosition([
			'  [] ',
			' { } ',
			'selectthis( ) '
		], 3, 11, [
				new Range(1, 1, 3, 15),
				new Range(3, 1, 3, 15),
				new Range(3, 1, 3, 11)
			]);
	});

	// -- bracket selections

	async function assertRanges(value: string, ...expected: IRange[]): Promise<void> {

		let model = modelService.createModel(value, new StaticLanguageSelector(mode.getLanguageIdentifier()), URI.parse('fake:lang'));
		let pos = model.getPositionAt(value.indexOf('I'));
		let provider = new BracketSelectionRangeProvider();
		let ranges = await provider.provideSelectionRanges(model, pos);
		modelService.destroyModel(model.uri);

		assert.equal(expected.length, ranges.length);
		for (const range of ranges) {
			let exp = expected.shift() || null;
			assert.ok(Range.equalsRange(range, exp), `A=${range} <> E=${exp}`);
		}
	}

	test('bracket selection', async () => {
		await assertRanges('(I)',
			new Range(1, 2, 1, 3), new Range(1, 1, 1, 4)
		);

		await assertRanges('[[[](I)]]',
			new Range(1, 6, 1, 7), new Range(1, 5, 1, 8), // ()
			new Range(1, 3, 1, 8), new Range(1, 2, 1, 9), // [[]()]
			new Range(1, 2, 1, 9), new Range(1, 1, 1, 10), // [[[]()]]
		);

		await assertRanges('[a[](I)a]',
			new Range(1, 6, 1, 7), new Range(1, 5, 1, 8),
			new Range(1, 2, 1, 9), new Range(1, 1, 1, 10),
		);

		// no bracket
		await assertRanges('fofofIfofo');

		// empty
		await assertRanges('[[[]()]]I');
		await assertRanges('I[[[]()]]');

		// edge
		await assertRanges('[I[[]()]]', new Range(1, 2, 1, 9), new Range(1, 1, 1, 10));
		await assertRanges('[[[]()]I]', new Range(1, 2, 1, 9), new Range(1, 1, 1, 10));

		await assertRanges('aaa(aaa)bbb(bIb)ccc(ccc)', new Range(1, 13, 1, 16), new Range(1, 12, 1, 17));
		await assertRanges('(aaa(aaa)bbb(bIb)ccc(ccc))', new Range(1, 14, 1, 17), new Range(1, 13, 1, 18), new Range(1, 2, 1, 26), new Range(1, 1, 1, 27));
	});

	test('bracket with leading/trailing', async () => {

		await assertRanges('for(a of b){\n  foo(I);\n}',
			new Range(2, 7, 2, 8), new Range(2, 6, 2, 9),
			new Range(1, 13, 3, 1), new Range(1, 12, 3, 2),
			new Range(1, 1, 3, 2), new Range(1, 1, 3, 2),
		);

		await assertRanges('for(a of b)\n{\n  foo(I);\n}',
			new Range(3, 7, 3, 8), new Range(3, 6, 3, 9),
			new Range(2, 2, 4, 1), new Range(2, 1, 4, 2),
			new Range(1, 1, 4, 2), new Range(1, 1, 4, 2),
		);
	});
});
