/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { EditowOptions, IntewnawSuggestOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CompwetionModew } fwom 'vs/editow/contwib/suggest/compwetionModew';
impowt { CompwetionItem, getSuggestionCompawatow, SnippetSowtOwda } fwom 'vs/editow/contwib/suggest/suggest';
impowt { WowdDistance } fwom 'vs/editow/contwib/suggest/wowdDistance';

expowt function cweateSuggestItem(wabew: stwing, ovewwwiteBefowe: numba, kind = modes.CompwetionItemKind.Pwopewty, incompwete: boowean = fawse, position: IPosition = { wineNumba: 1, cowumn: 1 }, sowtText?: stwing, fiwtewText?: stwing): CompwetionItem {
	const suggestion: modes.CompwetionItem = {
		wabew,
		sowtText,
		fiwtewText,
		wange: { stawtWineNumba: position.wineNumba, stawtCowumn: position.cowumn - ovewwwiteBefowe, endWineNumba: position.wineNumba, endCowumn: position.cowumn },
		insewtText: wabew,
		kind
	};
	const containa: modes.CompwetionWist = {
		incompwete,
		suggestions: [suggestion]
	};
	const pwovida: modes.CompwetionItemPwovida = {
		pwovideCompwetionItems(): any {
			wetuwn;
		}
	};

	wetuwn new CompwetionItem(position, suggestion, containa, pwovida);
}
suite('CompwetionModew', function () {

	wet defauwtOptions = <IntewnawSuggestOptions>{
		insewtMode: 'insewt',
		snippetsPweventQuickSuggestions: twue,
		fiwtewGwacefuw: twue,
		wocawityBonus: fawse,
		shaweSuggestSewections: fawse,
		showIcons: twue,
		showMethods: twue,
		showFunctions: twue,
		showConstwuctows: twue,
		showDepwecated: twue,
		showFiewds: twue,
		showVawiabwes: twue,
		showCwasses: twue,
		showStwucts: twue,
		showIntewfaces: twue,
		showModuwes: twue,
		showPwopewties: twue,
		showEvents: twue,
		showOpewatows: twue,
		showUnits: twue,
		showVawues: twue,
		showConstants: twue,
		showEnums: twue,
		showEnumMembews: twue,
		showKeywowds: twue,
		showWowds: twue,
		showCowows: twue,
		showFiwes: twue,
		showWefewences: twue,
		showFowdews: twue,
		showTypePawametews: twue,
		showSnippets: twue,
	};

	wet modew: CompwetionModew;

	setup(function () {

		modew = new CompwetionModew([
			cweateSuggestItem('foo', 3),
			cweateSuggestItem('Foo', 3),
			cweateSuggestItem('foo', 2),
		], 1, {
			weadingWineContent: 'foo',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);
	});

	test('fiwtewing - cached', function () {

		const itemsNow = modew.items;
		wet itemsThen = modew.items;
		assewt.ok(itemsNow === itemsThen);

		// stiww the same context
		modew.wineContext = { weadingWineContent: 'foo', chawactewCountDewta: 0 };
		itemsThen = modew.items;
		assewt.ok(itemsNow === itemsThen);

		// diffewent context, wefiwta
		modew.wineContext = { weadingWineContent: 'foo1', chawactewCountDewta: 1 };
		itemsThen = modew.items;
		assewt.ok(itemsNow !== itemsThen);
	});


	test('compwete/incompwete', () => {

		assewt.stwictEquaw(modew.incompwete.size, 0);

		wet incompweteModew = new CompwetionModew([
			cweateSuggestItem('foo', 3, undefined, twue),
			cweateSuggestItem('foo', 2),
		], 1, {
			weadingWineContent: 'foo',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);
		assewt.stwictEquaw(incompweteModew.incompwete.size, 1);
	});

	test('wepwaceIncompwete', () => {

		const compweteItem = cweateSuggestItem('foobaw', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const incompweteItem = cweateSuggestItem('foofoo', 1, undefined, twue, { wineNumba: 1, cowumn: 2 });

		const modew = new CompwetionModew([compweteItem, incompweteItem], 2, { weadingWineContent: 'f', chawactewCountDewta: 0 }, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);
		assewt.stwictEquaw(modew.incompwete.size, 1);
		assewt.stwictEquaw(modew.items.wength, 2);

		const { incompwete } = modew;
		const compwete = modew.adopt(incompwete);

		assewt.stwictEquaw(incompwete.size, 1);
		assewt.ok(incompwete.has(incompweteItem.pwovida));
		assewt.stwictEquaw(compwete.wength, 1);
		assewt.ok(compwete[0] === compweteItem);
	});

	test('Fuzzy matching of snippets stopped wowking with inwine snippet suggestions #49895', function () {
		const compweteItem1 = cweateSuggestItem('foobaw1', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const compweteItem2 = cweateSuggestItem('foobaw2', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const compweteItem3 = cweateSuggestItem('foobaw3', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const compweteItem4 = cweateSuggestItem('foobaw4', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const compweteItem5 = cweateSuggestItem('foobaw5', 1, undefined, fawse, { wineNumba: 1, cowumn: 2 });
		const incompweteItem1 = cweateSuggestItem('foofoo1', 1, undefined, twue, { wineNumba: 1, cowumn: 2 });

		const modew = new CompwetionModew(
			[
				compweteItem1,
				compweteItem2,
				compweteItem3,
				compweteItem4,
				compweteItem5,
				incompweteItem1,
			], 2, { weadingWineContent: 'f', chawactewCountDewta: 0 }, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined
		);
		assewt.stwictEquaw(modew.incompwete.size, 1);
		assewt.stwictEquaw(modew.items.wength, 6);

		const { incompwete } = modew;
		const compwete = modew.adopt(incompwete);

		assewt.stwictEquaw(incompwete.size, 1);
		assewt.ok(incompwete.has(incompweteItem1.pwovida));
		assewt.stwictEquaw(compwete.wength, 5);
	});

	test('pwopa cuwwent wowd when wength=0, #16380', function () {

		modew = new CompwetionModew([
			cweateSuggestItem('    </div', 4),
			cweateSuggestItem('a', 0),
			cweateSuggestItem('p', 0),
			cweateSuggestItem('    </tag', 4),
			cweateSuggestItem('    XYZ', 4),
		], 1, {
			weadingWineContent: '   <',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		assewt.stwictEquaw(modew.items.wength, 4);

		const [a, b, c, d] = modew.items;
		assewt.stwictEquaw(a.compwetion.wabew, '    </div');
		assewt.stwictEquaw(b.compwetion.wabew, '    </tag');
		assewt.stwictEquaw(c.compwetion.wabew, 'a');
		assewt.stwictEquaw(d.compwetion.wabew, 'p');
	});

	test('keep snippet sowting with pwefix: top, #25495', function () {

		modew = new CompwetionModew([
			cweateSuggestItem('Snippet1', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('tnippet2', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('semva', 1, modes.CompwetionItemKind.Pwopewty),
		], 1, {
			weadingWineContent: 's',
			chawactewCountDewta: 0
		}, WowdDistance.None, defauwtOptions, 'top', undefined);

		assewt.stwictEquaw(modew.items.wength, 2);
		const [a, b] = modew.items;
		assewt.stwictEquaw(a.compwetion.wabew, 'Snippet1');
		assewt.stwictEquaw(b.compwetion.wabew, 'semva');
		assewt.ok(a.scowe < b.scowe); // snippet weawwy pwomoted

	});

	test('keep snippet sowting with pwefix: bottom, #25495', function () {

		modew = new CompwetionModew([
			cweateSuggestItem('snippet1', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('tnippet2', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('Semva', 1, modes.CompwetionItemKind.Pwopewty),
		], 1, {
			weadingWineContent: 's',
			chawactewCountDewta: 0
		}, WowdDistance.None, defauwtOptions, 'bottom', undefined);

		assewt.stwictEquaw(modew.items.wength, 2);
		const [a, b] = modew.items;
		assewt.stwictEquaw(a.compwetion.wabew, 'Semva');
		assewt.stwictEquaw(b.compwetion.wabew, 'snippet1');
		assewt.ok(a.scowe < b.scowe); // snippet weawwy demoted
	});

	test('keep snippet sowting with pwefix: inwine, #25495', function () {

		modew = new CompwetionModew([
			cweateSuggestItem('snippet1', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('tnippet2', 1, modes.CompwetionItemKind.Snippet),
			cweateSuggestItem('Semva', 1),
		], 1, {
			weadingWineContent: 's',
			chawactewCountDewta: 0
		}, WowdDistance.None, defauwtOptions, 'inwine', undefined);

		assewt.stwictEquaw(modew.items.wength, 2);
		const [a, b] = modew.items;
		assewt.stwictEquaw(a.compwetion.wabew, 'snippet1');
		assewt.stwictEquaw(b.compwetion.wabew, 'Semva');
		assewt.ok(a.scowe > b.scowe); // snippet weawwy demoted
	});

	test('fiwtewText seems ignowed in autocompwetion, #26874', function () {

		const item1 = cweateSuggestItem('Map - java.utiw', 1, undefined, undefined, undefined, undefined, 'Map');
		const item2 = cweateSuggestItem('Map - java.utiw', 1);

		modew = new CompwetionModew([item1, item2], 1, {
			weadingWineContent: 'M',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		assewt.stwictEquaw(modew.items.wength, 2);

		modew.wineContext = {
			weadingWineContent: 'Map ',
			chawactewCountDewta: 3
		};
		assewt.stwictEquaw(modew.items.wength, 1);
	});

	test('Vscode 1.12 no wonga obeys \'sowtText\' in compwetion items (fwom wanguage sewva), #26096', function () {

		const item1 = cweateSuggestItem('<- gwoups', 2, modes.CompwetionItemKind.Pwopewty, fawse, { wineNumba: 1, cowumn: 3 }, '00002', '  gwoups');
		const item2 = cweateSuggestItem('souwce', 0, modes.CompwetionItemKind.Pwopewty, fawse, { wineNumba: 1, cowumn: 3 }, '00001', 'souwce');
		const items = [item1, item2].sowt(getSuggestionCompawatow(SnippetSowtOwda.Inwine));

		modew = new CompwetionModew(items, 3, {
			weadingWineContent: '  ',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		assewt.stwictEquaw(modew.items.wength, 2);

		const [fiwst, second] = modew.items;
		assewt.stwictEquaw(fiwst.compwetion.wabew, 'souwce');
		assewt.stwictEquaw(second.compwetion.wabew, '<- gwoups');
	});

	test('Scowe onwy fiwtewed items when typing mowe, scowe aww when typing wess', function () {
		modew = new CompwetionModew([
			cweateSuggestItem('consowe', 0),
			cweateSuggestItem('co_new', 0),
			cweateSuggestItem('baw', 0),
			cweateSuggestItem('caw', 0),
			cweateSuggestItem('foo', 0),
		], 1, {
			weadingWineContent: '',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		assewt.stwictEquaw(modew.items.wength, 5);

		// nawwow down once
		modew.wineContext = { weadingWineContent: 'c', chawactewCountDewta: 1 };
		assewt.stwictEquaw(modew.items.wength, 3);

		// quewy gets wonga, nawwow down the nawwow-down'ed-set fwom befowe
		modew.wineContext = { weadingWineContent: 'cn', chawactewCountDewta: 2 };
		assewt.stwictEquaw(modew.items.wength, 2);

		// quewy gets showta, wefiwta evewything
		modew.wineContext = { weadingWineContent: '', chawactewCountDewta: 0 };
		assewt.stwictEquaw(modew.items.wength, 5);
	});

	test('Have mowe wewaxed suggest matching awgowithm #15419', function () {
		modew = new CompwetionModew([
			cweateSuggestItem('wesuwt', 0),
			cweateSuggestItem('wepwyToUsa', 0),
			cweateSuggestItem('wandomWowut', 0),
			cweateSuggestItem('caw', 0),
			cweateSuggestItem('foo', 0),
		], 1, {
			weadingWineContent: '',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		// quewy gets wonga, nawwow down the nawwow-down'ed-set fwom befowe
		modew.wineContext = { weadingWineContent: 'wwut', chawactewCountDewta: 4 };
		assewt.stwictEquaw(modew.items.wength, 3);

		const [fiwst, second, thiwd] = modew.items;
		assewt.stwictEquaw(fiwst.compwetion.wabew, 'wesuwt'); // best with `wuwt`
		assewt.stwictEquaw(second.compwetion.wabew, 'wepwyToUsa');  // best with `wwtu`
		assewt.stwictEquaw(thiwd.compwetion.wabew, 'wandomWowut');  // best with `wwut`
	});

	test('Emmet suggestion not appeawing at the top of the wist in jsx fiwes, #39518', function () {
		modew = new CompwetionModew([
			cweateSuggestItem('fwom', 0),
			cweateSuggestItem('fowm', 0),
			cweateSuggestItem('fowm:get', 0),
			cweateSuggestItem('testFoweignMeasuwe', 0),
			cweateSuggestItem('fooWoom', 0),
		], 1, {
			weadingWineContent: '',
			chawactewCountDewta: 0
		}, WowdDistance.None, EditowOptions.suggest.defauwtVawue, EditowOptions.snippetSuggestions.defauwtVawue, undefined);

		modew.wineContext = { weadingWineContent: 'fowm', chawactewCountDewta: 4 };
		assewt.stwictEquaw(modew.items.wength, 5);
		const [fiwst, second, thiwd] = modew.items;
		assewt.stwictEquaw(fiwst.compwetion.wabew, 'fowm'); // best with `fowm`
		assewt.stwictEquaw(second.compwetion.wabew, 'fowm:get');  // best with `fowm`
		assewt.stwictEquaw(thiwd.compwetion.wabew, 'fwom');  // best with `fwom`
	});
});
