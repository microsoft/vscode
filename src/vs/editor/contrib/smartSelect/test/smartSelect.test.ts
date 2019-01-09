/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { LanguageIdentifier, SelectionRangeProvider } from 'vs/editor/common/modes';
import { MockMode, StaticLanguageSelector } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { BracketSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/bracketSelections';
import { provideSelectionRanges } from 'vs/editor/contrib/smartSelect/smartSelect';
import { CancellationToken } from 'vs/base/common/cancellation';

class TestTextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: any;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI | undefined): string {
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
		modelService = new ModelServiceImpl(configurationService, new TestTextResourcePropertiesService(configurationService));
		mode = new MockJSMode();
	});

	teardown(() => {
		modelService.dispose();
		mode.dispose();
	});

	async function assertGetRangesToPosition(text: string[], lineNumber: number, column: number, ranges: Range[]): Promise<void> {
		let uri = URI.file('test.js');
		let model = modelService.createModel(text.join('\n'), new StaticLanguageSelector(mode.getLanguageIdentifier()), uri);
		let actual = await provideSelectionRanges(model, new Position(lineNumber, column), CancellationToken.None);
		let actualStr = actual!.map(r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn).toString());
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
				new Range(1, 1, 5, 2), // all
				new Range(1, 21, 5, 2), // {} outside
				new Range(1, 22, 5, 1), // {} inside
				new Range(2, 1, 4, 3),
				new Range(2, 2, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(2, 12, 4, 2),
				new Range(3, 1, 3, 27), // line w/ triva
				new Range(3, 3, 3, 27), // line w/o triva
				new Range(3, 10, 3, 27), // () outside
				new Range(3, 11, 3, 26), // () inside
				new Range(3, 17, 3, 26), // () outside
				new Range(3, 18, 3, 25), // () inside
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
				new Range(1, 22, 5, 1),
				new Range(2, 1, 4, 3),
				new Range(2, 2, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(2, 12, 4, 2),
				new Range(3, 1, 3, 1),
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
				new Range(1, 1, 5, 2), // all
				new Range(1, 21, 5, 2), // {} outside
				new Range(1, 22, 5, 1), // {} inside
				new Range(2, 1, 4, 3),
				new Range(2, 2, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(2, 12, 4, 2),
				new Range(3, 1, 3, 2) // line w/ triva
			]);
	});

	test('getRangesToPosition #40658. Cursor at first position inside brackets should select line inside.', () => {

		return assertGetRangesToPosition([
			' [ ]',
			' { } ',
			'( ) '
		], 2, 3, [
				new Range(1, 1, 3, 5),
				new Range(2, 1, 2, 6), // line w/ triava
				new Range(2, 2, 2, 5), // {} inside, line w/o triva
				new Range(2, 3, 2, 4) // {} inside
			]);
	});

	test('getRangesToPosition #40658. Cursor in empty brackets should reveal brackets first.', () => {

		return assertGetRangesToPosition([
			' [] ',
			' { } ',
			'  ( ) '
		], 1, 3, [
				new Range(1, 1, 3, 7), // all
				new Range(1, 1, 1, 5), // line w/ trival
				new Range(1, 2, 1, 4), // [] outside, line w/o trival
				new Range(1, 3, 1, 3), // [] inside
			]);
	});

	test('getRangesToPosition #40658. Tokens before bracket will be revealed first.', () => {

		return assertGetRangesToPosition([
			'  [] ',
			' { } ',
			'selectthis( ) '
		], 3, 11, [
				new Range(1, 1, 3, 15), // all
				new Range(3, 1, 3, 15), // line w/ trivia
				new Range(3, 1, 3, 14), // line w/o trivia
				new Range(3, 1, 3, 11) // word
			]);
	});

	// -- bracket selections

	async function assertRanges(provider: SelectionRangeProvider, value: string, ...expected: IRange[]): Promise<void> {

		let model = modelService.createModel(value, new StaticLanguageSelector(mode.getLanguageIdentifier()), URI.parse('fake:lang'));
		let pos = model.getPositionAt(value.indexOf('I'));
		let ranges = await provider.provideSelectionRanges(model, pos, CancellationToken.None);
		modelService.destroyModel(model.uri);

		assert.equal(expected.length, ranges!.length);
		for (const range of ranges!) {
			let exp = expected.shift() || null;
			assert.ok(Range.equalsRange(range.range, exp), `A=${range} <> E=${exp}`);
		}
	}

	test('bracket selection', async () => {
		await assertRanges(new BracketSelectionRangeProvider(), '(I)',
			new Range(1, 2, 1, 3), new Range(1, 1, 1, 4)
		);

		await assertRanges(new BracketSelectionRangeProvider(), '[[[](I)]]',
			new Range(1, 6, 1, 7), new Range(1, 5, 1, 8), // ()
			new Range(1, 3, 1, 8), new Range(1, 2, 1, 9), // [[]()]
			new Range(1, 2, 1, 9), new Range(1, 1, 1, 10), // [[[]()]]
		);

		await assertRanges(new BracketSelectionRangeProvider(), '[a[](I)a]',
			new Range(1, 6, 1, 7), new Range(1, 5, 1, 8),
			new Range(1, 2, 1, 9), new Range(1, 1, 1, 10),
		);

		// no bracket
		await assertRanges(new BracketSelectionRangeProvider(), 'fofofIfofo');

		// empty
		await assertRanges(new BracketSelectionRangeProvider(), '[[[]()]]I');
		await assertRanges(new BracketSelectionRangeProvider(), 'I[[[]()]]');

		// edge
		await assertRanges(new BracketSelectionRangeProvider(), '[I[[]()]]', new Range(1, 2, 1, 9), new Range(1, 1, 1, 10));
		await assertRanges(new BracketSelectionRangeProvider(), '[[[]()]I]', new Range(1, 2, 1, 9), new Range(1, 1, 1, 10));

		await assertRanges(new BracketSelectionRangeProvider(), 'aaa(aaa)bbb(bIb)ccc(ccc)', new Range(1, 13, 1, 16), new Range(1, 12, 1, 17));
		await assertRanges(new BracketSelectionRangeProvider(), '(aaa(aaa)bbb(bIb)ccc(ccc))', new Range(1, 14, 1, 17), new Range(1, 13, 1, 18), new Range(1, 2, 1, 26), new Range(1, 1, 1, 27));
	});

	test('bracket with leading/trailing', async () => {

		await assertRanges(new BracketSelectionRangeProvider(), 'for(a of b){\n  foo(I);\n}',
			new Range(2, 7, 2, 8), new Range(2, 6, 2, 9),
			new Range(1, 13, 3, 1), new Range(1, 12, 3, 2),
			new Range(1, 1, 3, 2), new Range(1, 1, 3, 2),
		);

		await assertRanges(new BracketSelectionRangeProvider(), 'for(a of b)\n{\n  foo(I);\n}',
			new Range(3, 7, 3, 8), new Range(3, 6, 3, 9),
			new Range(2, 2, 4, 1), new Range(2, 1, 4, 2),
			new Range(1, 1, 4, 2), new Range(1, 1, 4, 2),
		);
	});
});
