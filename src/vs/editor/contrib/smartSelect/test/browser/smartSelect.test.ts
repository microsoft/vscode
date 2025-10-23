/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../common/core/position.js';
import { IRange, Range } from '../../../../common/core/range.js';
import { SelectionRangeProvider } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { IModelService } from '../../../../common/services/model.js';
import { BracketSelectionRangeProvider } from '../../browser/bracketSelections.js';
import { provideSelectionRanges } from '../../browser/smartSelect.js';
import { WordSelectionRangeProvider } from '../../browser/wordSelections.js';
import { createModelServices } from '../../../../test/common/testTextModel.js';
import { javascriptOnEnterRules } from '../../../../test/common/modes/supports/onEnterRules.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { ILanguageSelection, ILanguageService } from '../../../../common/languages/language.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

class StaticLanguageSelector implements ILanguageSelection {
	readonly onDidChange: Event<string> = Event.None;
	constructor(public readonly languageId: string) { }
}

suite('SmartSelect', () => {

	const OriginalBracketSelectionRangeProviderMaxDuration = BracketSelectionRangeProvider._maxDuration;

	suiteSetup(() => {
		BracketSelectionRangeProvider._maxDuration = 5000; // 5 seconds
	});

	suiteTeardown(() => {
		BracketSelectionRangeProvider._maxDuration = OriginalBracketSelectionRangeProviderMaxDuration;
	});

	const languageId = 'mockJSMode';
	let disposables: DisposableStore;
	let modelService: IModelService;
	const providers = new LanguageFeatureRegistry<SelectionRangeProvider>();

	setup(() => {
		disposables = new DisposableStore();
		const instantiationService = createModelServices(disposables);
		modelService = instantiationService.get(IModelService);
		const languagConfigurationService = instantiationService.get(ILanguageConfigurationService);
		const languageService = instantiationService.get(ILanguageService);
		disposables.add(languageService.registerLanguage({ id: languageId }));
		disposables.add(languagConfigurationService.register(languageId, {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],
			onEnterRules: javascriptOnEnterRules,
			wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\=\+\[\{\]\}\\\;\:\'\"\,\.\<\>\/\?\s]+)/g
		}));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function assertGetRangesToPosition(text: string[], lineNumber: number, column: number, ranges: Range[], selectLeadingAndTrailingWhitespace = true): Promise<void> {
		const uri = URI.file('test.js');
		const model = modelService.createModel(text.join('\n'), new StaticLanguageSelector(languageId), uri);
		const [actual] = await provideSelectionRanges(providers, model, [new Position(lineNumber, column)], { selectLeadingAndTrailingWhitespace, selectSubwords: true }, CancellationToken.None);
		const actualStr = actual.map(r => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn).toString());
		const desiredStr = ranges.reverse().map(r => String(r));

		assert.deepStrictEqual(actualStr, desiredStr, `\nA: ${actualStr} VS \nE: ${desiredStr}`);
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
			new Range(2, 1, 4, 3), // block
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

	test('config: selectLeadingAndTrailingWhitespace', async () => {

		await assertGetRangesToPosition([
			'aaa',
			'\tbbb',
			''
		], 2, 3, [
			new Range(1, 1, 3, 1), // all
			new Range(2, 1, 2, 5), // line w/ triva
			new Range(2, 2, 2, 5), // bbb
		], true);

		await assertGetRangesToPosition([
			'aaa',
			'\tbbb',
			''
		], 2, 3, [
			new Range(1, 1, 3, 1), // all
			new Range(2, 2, 2, 5), // () inside
		], false);
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
			new Range(2, 1, 4, 3),
			new Range(2, 2, 4, 3),
			new Range(2, 11, 4, 3),
			new Range(2, 12, 4, 2),
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
			new Range(2, 1, 4, 3),
			new Range(2, 2, 4, 3),
			new Range(2, 11, 4, 3),
			new Range(2, 12, 4, 2),
			new Range(3, 1, 3, 2), // block
			new Range(3, 1, 3, 2) // empty line
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
		const index = value.indexOf('|');
		value = value.replace('|', ''); // CodeQL [SM02383] js/incomplete-sanitization this is purpose only the first | character

		const model = modelService.createModel(value, new StaticLanguageSelector(languageId), URI.parse('fake:lang'));
		const pos = model.getPositionAt(index);
		const all = await provider.provideSelectionRanges(model, [pos], CancellationToken.None);
		const ranges = all![0];

		modelService.destroyModel(model.uri);

		assert.strictEqual(expected.length, ranges.length);
		for (const range of ranges) {
			const exp = expected.shift() || null;
			assert.ok(Range.equalsRange(range.range, exp), `A=${range.range} <> E=${exp}`);
		}
	}

	test('bracket selection', async () => {
		await assertRanges(new BracketSelectionRangeProvider(), '(|)',
			new Range(1, 2, 1, 2), new Range(1, 1, 1, 3)
		);

		await assertRanges(new BracketSelectionRangeProvider(), '[[[](|)]]',
			new Range(1, 6, 1, 6), new Range(1, 5, 1, 7), // ()
			new Range(1, 3, 1, 7), new Range(1, 2, 1, 8), // [[]()]
			new Range(1, 2, 1, 8), new Range(1, 1, 1, 9), // [[[]()]]
		);

		await assertRanges(new BracketSelectionRangeProvider(), '[a[](|)a]',
			new Range(1, 6, 1, 6), new Range(1, 5, 1, 7),
			new Range(1, 2, 1, 8), new Range(1, 1, 1, 9),
		);

		// no bracket
		await assertRanges(new BracketSelectionRangeProvider(), 'fofof|fofo');

		// empty
		await assertRanges(new BracketSelectionRangeProvider(), '[[[]()]]|');
		await assertRanges(new BracketSelectionRangeProvider(), '|[[[]()]]');

		// edge
		await assertRanges(new BracketSelectionRangeProvider(), '[|[[]()]]', new Range(1, 2, 1, 8), new Range(1, 1, 1, 9));
		await assertRanges(new BracketSelectionRangeProvider(), '[[[]()]|]', new Range(1, 2, 1, 8), new Range(1, 1, 1, 9));

		await assertRanges(new BracketSelectionRangeProvider(), 'aaa(aaa)bbb(b|b)ccc(ccc)', new Range(1, 13, 1, 15), new Range(1, 12, 1, 16));
		await assertRanges(new BracketSelectionRangeProvider(), '(aaa(aaa)bbb(b|b)ccc(ccc))', new Range(1, 14, 1, 16), new Range(1, 13, 1, 17), new Range(1, 2, 1, 25), new Range(1, 1, 1, 26));
	});

	test('bracket with leading/trailing', async () => {

		await assertRanges(new BracketSelectionRangeProvider(), 'for(a of b){\n  foo(|);\n}',
			new Range(2, 7, 2, 7), new Range(2, 6, 2, 8),
			new Range(1, 13, 3, 1), new Range(1, 12, 3, 2),
			new Range(1, 1, 3, 2), new Range(1, 1, 3, 2),
		);

		await assertRanges(new BracketSelectionRangeProvider(), 'for(a of b)\n{\n  foo(|);\n}',
			new Range(3, 7, 3, 7), new Range(3, 6, 3, 8),
			new Range(2, 2, 4, 1), new Range(2, 1, 4, 2),
			new Range(1, 1, 4, 2), new Range(1, 1, 4, 2),
		);
	});

	test('in-word ranges', async () => {

		await assertRanges(new WordSelectionRangeProvider(), 'f|ooBar',
			new Range(1, 1, 1, 4), // foo
			new Range(1, 1, 1, 7), // fooBar
			new Range(1, 1, 1, 7), // doc
		);

		await assertRanges(new WordSelectionRangeProvider(), 'f|oo_Ba',
			new Range(1, 1, 1, 4),
			new Range(1, 1, 1, 7),
			new Range(1, 1, 1, 7),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'f|oo-Ba',
			new Range(1, 1, 1, 4),
			new Range(1, 1, 1, 7),
			new Range(1, 1, 1, 7),
		);
	});

	test('in-word ranges with selectSubwords=false', async () => {

		await assertRanges(new WordSelectionRangeProvider(false), 'f|ooBar',
			new Range(1, 1, 1, 7),
			new Range(1, 1, 1, 7),
		);

		await assertRanges(new WordSelectionRangeProvider(false), 'f|oo_Ba',
			new Range(1, 1, 1, 7),
			new Range(1, 1, 1, 7),
		);

		await assertRanges(new WordSelectionRangeProvider(false), 'f|oo-Ba',
			new Range(1, 1, 1, 7),
			new Range(1, 1, 1, 7),
		);
	});

	test('Default selection should select current word/hump first in camelCase #67493', async function () {

		await assertRanges(new WordSelectionRangeProvider(), 'Abs|tractSmartSelect',
			new Range(1, 1, 1, 9),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'AbstractSma|rtSelect',
			new Range(1, 9, 1, 14),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Abstrac-Sma|rt-elect',
			new Range(1, 9, 1, 14),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Abstrac_Sma|rt_elect',
			new Range(1, 9, 1, 14),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Abstrac_Sma|rt-elect',
			new Range(1, 9, 1, 14),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Abstrac_Sma|rtSelect',
			new Range(1, 9, 1, 14),
			new Range(1, 1, 1, 20),
			new Range(1, 1, 1, 20),
		);
	});

	test('Smart select: only add line ranges if they\'re contained by the next range #73850', async function () {

		const reg = providers.register('*', {
			provideSelectionRanges() {
				return [[
					{ range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 11 } },
					{ range: { startLineNumber: 1, startColumn: 10, endLineNumber: 3, endColumn: 2 } },
					{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 } },
				]];
			}
		});

		await assertGetRangesToPosition(['type T = {', '\tx: number', '}'], 1, 10, [
			new Range(1, 1, 3, 2), // all
			new Range(1, 10, 3, 2), // { ... }
			new Range(1, 10, 1, 11), // {
		]);

		reg.dispose();
	});

	test('Expand selection in words with underscores is inconsistent #90589', async function () {

		await assertRanges(new WordSelectionRangeProvider(), 'Hel|lo_World',
			new Range(1, 1, 1, 6),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello_Wo|rld',
			new Range(1, 7, 1, 12),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello|_World',
			new Range(1, 1, 1, 6),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello_|World',
			new Range(1, 7, 1, 12),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello|-World',
			new Range(1, 1, 1, 6),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello-|World',
			new Range(1, 7, 1, 12),
			new Range(1, 1, 1, 12),
			new Range(1, 1, 1, 12),
		);

		await assertRanges(new WordSelectionRangeProvider(), 'Hello|World',
			new Range(1, 6, 1, 11),
			new Range(1, 1, 1, 11),
			new Range(1, 1, 1, 11),
		);
	});
});
