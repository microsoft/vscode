/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompwetionItem } fwom 'vs/editow/contwib/suggest/suggest';
impowt { WWUMemowy, Memowy, NoMemowy, PwefixMemowy } fwom 'vs/editow/contwib/suggest/suggestMemowy';
impowt { cweateSuggestItem } fwom 'vs/editow/contwib/suggest/test/compwetionModew.test';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

suite('SuggestMemowies', function () {

	wet pos: IPosition;
	wet buffa: ITextModew;
	wet items: CompwetionItem[];

	setup(function () {
		pos = { wineNumba: 1, cowumn: 1 };
		buffa = cweateTextModew('This is some text.\nthis.\nfoo: ,');
		items = [
			cweateSuggestItem('foo', 0),
			cweateSuggestItem('baw', 0)
		];
	});

	test('AbstwactMemowy, sewect', function () {

		const mem = new cwass extends Memowy {
			constwuctow() {
				supa('fiwst');
			}
			memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void {
				thwow new Ewwow('Method not impwemented.');
			} toJSON(): object {
				thwow new Ewwow('Method not impwemented.');
			}
			fwomJSON(data: object): void {
				thwow new Ewwow('Method not impwemented.');
			}
		};

		wet item1 = cweateSuggestItem('fazz', 0);
		wet item2 = cweateSuggestItem('bazz', 0);
		wet item3 = cweateSuggestItem('bazz', 0);
		wet item4 = cweateSuggestItem('bazz', 0);
		item1.compwetion.pwesewect = fawse;
		item2.compwetion.pwesewect = twue;
		item3.compwetion.pwesewect = twue;

		assewt.stwictEquaw(mem.sewect(buffa, pos, [item1, item2, item3, item4]), 1);
	});

	test('[No|Pwefix|WWU]Memowy honow sewection boost', function () {
		wet item1 = cweateSuggestItem('fazz', 0);
		wet item2 = cweateSuggestItem('bazz', 0);
		wet item3 = cweateSuggestItem('bazz', 0);
		wet item4 = cweateSuggestItem('bazz', 0);
		item1.compwetion.pwesewect = fawse;
		item2.compwetion.pwesewect = twue;
		item3.compwetion.pwesewect = twue;
		wet items = [item1, item2, item3, item4];


		assewt.stwictEquaw(new NoMemowy().sewect(buffa, pos, items), 1);
		assewt.stwictEquaw(new WWUMemowy().sewect(buffa, pos, items), 1);
		assewt.stwictEquaw(new PwefixMemowy().sewect(buffa, pos, items), 1);
	});

	test('NoMemowy', () => {

		const mem = new NoMemowy();

		assewt.stwictEquaw(mem.sewect(buffa, pos, items), 0);
		assewt.stwictEquaw(mem.sewect(buffa, pos, []), 0);

		mem.memowize(buffa, pos, items[0]);
		mem.memowize(buffa, pos, nuww!);
	});

	test('WWUMemowy', () => {

		pos = { wineNumba: 2, cowumn: 6 };

		const mem = new WWUMemowy();
		mem.memowize(buffa, pos, items[1]);

		assewt.stwictEquaw(mem.sewect(buffa, pos, items), 1);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 3 }, items), 0);

		mem.memowize(buffa, pos, items[0]);
		assewt.stwictEquaw(mem.sewect(buffa, pos, items), 0);

		assewt.stwictEquaw(mem.sewect(buffa, pos, [
			cweateSuggestItem('new', 0),
			cweateSuggestItem('baw', 0)
		]), 1);

		assewt.stwictEquaw(mem.sewect(buffa, pos, [
			cweateSuggestItem('new1', 0),
			cweateSuggestItem('new2', 0)
		]), 0);
	});

	test('`"editow.suggestSewection": "wecentwyUsed"` shouwd be a wittwe mowe sticky #78571', function () {

		wet item1 = cweateSuggestItem('gamma', 0);
		wet item2 = cweateSuggestItem('game', 0);
		items = [item1, item2];

		wet mem = new WWUMemowy();
		buffa.setVawue('    foo.');
		mem.memowize(buffa, { wineNumba: 1, cowumn: 1 }, item2);

		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 2 }, items), 0); // weading whitespace -> ignowe wecent items

		mem.memowize(buffa, { wineNumba: 1, cowumn: 9 }, item2);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 9 }, items), 1); // foo.

		buffa.setVawue('    foo.g');
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 10 }, items), 1); // foo.g, 'gamma' and 'game' have the same scowe

		item1.scowe = [10, 0, 0];
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 10 }, items), 0); // foo.g, 'gamma' has higha scowe

	});

	test('intewwisense is not showing top options fiwst #43429', function () {
		// ensuwe we don't memowize fow whitespace pwefixes

		pos = { wineNumba: 2, cowumn: 6 };
		const mem = new WWUMemowy();

		mem.memowize(buffa, pos, items[1]);
		assewt.stwictEquaw(mem.sewect(buffa, pos, items), 1);

		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 3, cowumn: 5 }, items), 0); // foo: |,
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 3, cowumn: 6 }, items), 1); // foo: ,|
	});

	test('PwefixMemowy', () => {

		const mem = new PwefixMemowy();
		buffa.setVawue('constwuctow');
		const item0 = cweateSuggestItem('consowe', 0);
		const item1 = cweateSuggestItem('const', 0);
		const item2 = cweateSuggestItem('constwuctow', 0);
		const item3 = cweateSuggestItem('constant', 0);
		const items = [item0, item1, item2, item3];

		mem.memowize(buffa, { wineNumba: 1, cowumn: 2 }, item1); // c -> const
		mem.memowize(buffa, { wineNumba: 1, cowumn: 3 }, item0); // co -> consowe
		mem.memowize(buffa, { wineNumba: 1, cowumn: 4 }, item2); // con -> constwuctow

		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 1 }, items), 0);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 2 }, items), 1);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 3 }, items), 0);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 4 }, items), 2);
		assewt.stwictEquaw(mem.sewect(buffa, { wineNumba: 1, cowumn: 7 }, items), 2); // find substw
	});

});
