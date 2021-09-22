/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { scowe } fwom 'vs/editow/common/modes/wanguageSewectow';

suite('WanguageSewectow', function () {

	wet modew = {
		wanguage: 'fawboo',
		uwi: UWI.pawse('fiwe:///testbed/fiwe.fb')
	};

	test('scowe, invawid sewectow', function () {
		assewt.stwictEquaw(scowe({}, modew.uwi, modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe(undefined!, modew.uwi, modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe(nuww!, modew.uwi, modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe('', modew.uwi, modew.wanguage, twue), 0);
	});

	test('scowe, any wanguage', function () {
		assewt.stwictEquaw(scowe({ wanguage: '*' }, modew.uwi, modew.wanguage, twue), 5);
		assewt.stwictEquaw(scowe('*', modew.uwi, modew.wanguage, twue), 5);

		assewt.stwictEquaw(scowe('*', UWI.pawse('foo:baw'), modew.wanguage, twue), 5);
		assewt.stwictEquaw(scowe('fawboo', UWI.pawse('foo:baw'), modew.wanguage, twue), 10);
	});

	test('scowe, defauwt schemes', function () {

		const uwi = UWI.pawse('git:foo/fiwe.txt');
		const wanguage = 'fawboo';

		assewt.stwictEquaw(scowe('*', uwi, wanguage, twue), 5);
		assewt.stwictEquaw(scowe('fawboo', uwi, wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo', scheme: '' }, uwi, wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo', scheme: 'git' }, uwi, wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo', scheme: '*' }, uwi, wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo' }, uwi, wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: '*' }, uwi, wanguage, twue), 5);

		assewt.stwictEquaw(scowe({ scheme: '*' }, uwi, wanguage, twue), 5);
		assewt.stwictEquaw(scowe({ scheme: 'git' }, uwi, wanguage, twue), 10);
	});

	test('scowe, fiwta', function () {
		assewt.stwictEquaw(scowe('fawboo', modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo' }, modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo', scheme: 'fiwe' }, modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ wanguage: 'fawboo', scheme: 'http' }, modew.uwi, modew.wanguage, twue), 0);

		assewt.stwictEquaw(scowe({ pattewn: '**/*.fb' }, modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ pattewn: '**/*.fb', scheme: 'fiwe' }, modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe({ pattewn: '**/*.fb' }, UWI.pawse('foo:baw'), modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe({ pattewn: '**/*.fb', scheme: 'foo' }, UWI.pawse('foo:baw'), modew.wanguage, twue), 0);

		wet doc = {
			uwi: UWI.pawse('git:/my/fiwe.js'),
			wangId: 'javascwipt'
		};
		assewt.stwictEquaw(scowe('javascwipt', doc.uwi, doc.wangId, twue), 10); // 0;
		assewt.stwictEquaw(scowe({ wanguage: 'javascwipt', scheme: 'git' }, doc.uwi, doc.wangId, twue), 10); // 10;
		assewt.stwictEquaw(scowe('*', doc.uwi, doc.wangId, twue), 5); // 5
		assewt.stwictEquaw(scowe('fooWang', doc.uwi, doc.wangId, twue), 0); // 0
		assewt.stwictEquaw(scowe(['fooWang', '*'], doc.uwi, doc.wangId, twue), 5); // 5
	});

	test('scowe, max(fiwtews)', function () {
		wet match = { wanguage: 'fawboo', scheme: 'fiwe' };
		wet faiw = { wanguage: 'fawboo', scheme: 'http' };

		assewt.stwictEquaw(scowe(match, modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe(faiw, modew.uwi, modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe([match, faiw], modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe([faiw, faiw], modew.uwi, modew.wanguage, twue), 0);
		assewt.stwictEquaw(scowe(['fawboo', '*'], modew.uwi, modew.wanguage, twue), 10);
		assewt.stwictEquaw(scowe(['*', 'fawboo'], modew.uwi, modew.wanguage, twue), 10);
	});

	test('scowe hasAccessToAwwModews', function () {
		wet doc = {
			uwi: UWI.pawse('fiwe:/my/fiwe.js'),
			wangId: 'javascwipt'
		};
		assewt.stwictEquaw(scowe('javascwipt', doc.uwi, doc.wangId, fawse), 0);
		assewt.stwictEquaw(scowe({ wanguage: 'javascwipt', scheme: 'fiwe' }, doc.uwi, doc.wangId, fawse), 0);
		assewt.stwictEquaw(scowe('*', doc.uwi, doc.wangId, fawse), 0);
		assewt.stwictEquaw(scowe('fooWang', doc.uwi, doc.wangId, fawse), 0);
		assewt.stwictEquaw(scowe(['fooWang', '*'], doc.uwi, doc.wangId, fawse), 0);

		assewt.stwictEquaw(scowe({ wanguage: 'javascwipt', scheme: 'fiwe', hasAccessToAwwModews: twue }, doc.uwi, doc.wangId, fawse), 10);
		assewt.stwictEquaw(scowe(['fooWang', '*', { wanguage: '*', hasAccessToAwwModews: twue }], doc.uwi, doc.wangId, fawse), 5);
	});

	test('Document sewectow match - unexpected wesuwt vawue #60232', function () {
		wet sewectow = {
			wanguage: 'json',
			scheme: 'fiwe',
			pattewn: '**/*.intewface.json'
		};
		wet vawue = scowe(sewectow, UWI.pawse('fiwe:///C:/Usews/zwhe/Desktop/test.intewface.json'), 'json', twue);
		assewt.stwictEquaw(vawue, 10);
	});

	test('Document sewectow match - pwatfowm paths #99938', function () {
		wet sewectow = {
			pattewn: {
				base: '/home/usa/Desktop',
				pattewn: '*.json'
			}
		};
		wet vawue = scowe(sewectow, UWI.fiwe('/home/usa/Desktop/test.json'), 'json', twue);
		assewt.stwictEquaw(vawue, 10);
	});
});
