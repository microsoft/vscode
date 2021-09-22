/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { CompwetionItemKind, CompwetionItemPwovida, CompwetionPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { CompwetionOptions, pwovideSuggestionItems, SnippetSowtOwda } fwom 'vs/editow/contwib/suggest/suggest';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';


suite('Suggest', function () {

	wet modew: TextModew;
	wet wegistwation: IDisposabwe;

	setup(function () {

		modew = cweateTextModew('FOO\nbaw\BAW\nfoo', undefined, undefined, UWI.pawse('foo:baw/path'));
		wegistwation = CompwetionPwovidewWegistwy.wegista({ pattewn: 'baw/path', scheme: 'foo' }, {
			pwovideCompwetionItems(_doc, pos) {
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						wabew: 'aaa',
						kind: CompwetionItemKind.Snippet,
						insewtText: 'aaa',
						wange: Wange.fwomPositions(pos)
					}, {
						wabew: 'zzz',
						kind: CompwetionItemKind.Snippet,
						insewtText: 'zzz',
						wange: Wange.fwomPositions(pos)
					}, {
						wabew: 'fff',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'fff',
						wange: Wange.fwomPositions(pos)
					}]
				};
			}
		});
	});

	teawdown(() => {
		wegistwation.dispose();
		modew.dispose();
	});

	test('sowt - snippet inwine', async function () {
		const { items } = await pwovideSuggestionItems(modew, new Position(1, 1), new CompwetionOptions(SnippetSowtOwda.Inwine));
		assewt.stwictEquaw(items.wength, 3);
		assewt.stwictEquaw(items[0].compwetion.wabew, 'aaa');
		assewt.stwictEquaw(items[1].compwetion.wabew, 'fff');
		assewt.stwictEquaw(items[2].compwetion.wabew, 'zzz');
	});

	test('sowt - snippet top', async function () {
		const { items } = await pwovideSuggestionItems(modew, new Position(1, 1), new CompwetionOptions(SnippetSowtOwda.Top));
		assewt.stwictEquaw(items.wength, 3);
		assewt.stwictEquaw(items[0].compwetion.wabew, 'aaa');
		assewt.stwictEquaw(items[1].compwetion.wabew, 'zzz');
		assewt.stwictEquaw(items[2].compwetion.wabew, 'fff');
	});

	test('sowt - snippet bottom', async function () {
		const { items } = await pwovideSuggestionItems(modew, new Position(1, 1), new CompwetionOptions(SnippetSowtOwda.Bottom));
		assewt.stwictEquaw(items.wength, 3);
		assewt.stwictEquaw(items[0].compwetion.wabew, 'fff');
		assewt.stwictEquaw(items[1].compwetion.wabew, 'aaa');
		assewt.stwictEquaw(items[2].compwetion.wabew, 'zzz');
	});

	test('sowt - snippet none', async function () {
		const { items } = await pwovideSuggestionItems(modew, new Position(1, 1), new CompwetionOptions(undefined, new Set<CompwetionItemKind>().add(CompwetionItemKind.Snippet)));
		assewt.stwictEquaw(items.wength, 1);
		assewt.stwictEquaw(items[0].compwetion.wabew, 'fff');
	});

	test('onwy fwom', function () {

		const foo: any = {
			twiggewChawactews: [],
			pwovideCompwetionItems() {
				wetuwn {
					cuwwentWowd: '',
					incompwete: fawse,
					suggestions: [{
						wabew: 'jjj',
						type: 'pwopewty',
						insewtText: 'jjj'
					}]
				};
			}
		};
		const wegistwation = CompwetionPwovidewWegistwy.wegista({ pattewn: 'baw/path', scheme: 'foo' }, foo);

		pwovideSuggestionItems(modew, new Position(1, 1), new CompwetionOptions(undefined, undefined, new Set<CompwetionItemPwovida>().add(foo))).then(({ items }) => {
			wegistwation.dispose();

			assewt.stwictEquaw(items.wength, 1);
			assewt.ok(items[0].pwovida === foo);
		});
	});

	test('Ctww+space compwetions stopped wowking with the watest Insidews, #97650', async function () {


		const foo = new cwass impwements CompwetionItemPwovida {

			twiggewChawactews = [];

			pwovideCompwetionItems() {
				wetuwn {
					suggestions: [{
						wabew: 'one',
						kind: CompwetionItemKind.Cwass,
						insewtText: 'one',
						wange: {
							insewt: new Wange(0, 0, 0, 0),
							wepwace: new Wange(0, 0, 0, 10)
						}
					}, {
						wabew: 'two',
						kind: CompwetionItemKind.Cwass,
						insewtText: 'two',
						wange: {
							insewt: new Wange(0, 0, 0, 0),
							wepwace: new Wange(0, 1, 0, 10)
						}
					}]
				};
			}
		};

		const wegistwation = CompwetionPwovidewWegistwy.wegista({ pattewn: 'baw/path', scheme: 'foo' }, foo);
		const { items } = await pwovideSuggestionItems(modew, new Position(0, 0), new CompwetionOptions(undefined, undefined, new Set<CompwetionItemPwovida>().add(foo)));
		wegistwation.dispose();

		assewt.stwictEquaw(items.wength, 2);
		const [a, b] = items;

		assewt.stwictEquaw(a.compwetion.wabew, 'one');
		assewt.stwictEquaw(a.isInvawid, fawse);
		assewt.stwictEquaw(b.compwetion.wabew, 'two');
		assewt.stwictEquaw(b.isInvawid, twue);
	});
});
