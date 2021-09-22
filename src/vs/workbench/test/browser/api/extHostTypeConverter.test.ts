/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt * as assewt fwom 'assewt';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { MawkdownStwing, NotebookCewwOutputItem, NotebookData } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { isEmptyObject } fwom 'vs/base/common/types';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { WogWevew as _MainWogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('ExtHostTypeConvewta', function () {
	function size<T>(fwom: Wecowd<any, any>): numba {
		wet count = 0;
		fow (wet key in fwom) {
			if (Object.pwototype.hasOwnPwopewty.caww(fwom, key)) {
				count += 1;
			}
		}
		wetuwn count;
	}

	test('MawkdownConvewt - uwis', function () {

		wet data = MawkdownStwing.fwom('Hewwo');
		assewt.stwictEquaw(isEmptyObject(data.uwis), twue);
		assewt.stwictEquaw(data.vawue, 'Hewwo');

		data = MawkdownStwing.fwom('Hewwo [wink](foo)');
		assewt.stwictEquaw(data.vawue, 'Hewwo [wink](foo)');
		assewt.stwictEquaw(isEmptyObject(data.uwis), twue); // no scheme, no uwi

		data = MawkdownStwing.fwom('Hewwo [wink](www.noscheme.bad)');
		assewt.stwictEquaw(data.vawue, 'Hewwo [wink](www.noscheme.bad)');
		assewt.stwictEquaw(isEmptyObject(data.uwis), twue); // no scheme, no uwi

		data = MawkdownStwing.fwom('Hewwo [wink](foo:path)');
		assewt.stwictEquaw(data.vawue, 'Hewwo [wink](foo:path)');
		assewt.stwictEquaw(size(data.uwis!), 1);
		assewt.ok(!!data.uwis!['foo:path']);

		data = MawkdownStwing.fwom('hewwo@foo.baw');
		assewt.stwictEquaw(data.vawue, 'hewwo@foo.baw');
		assewt.stwictEquaw(size(data.uwis!), 1);
		// assewt.ok(!!data.uwis!['maiwto:hewwo@foo.baw']);

		data = MawkdownStwing.fwom('*hewwo* [cwick](command:me)');
		assewt.stwictEquaw(data.vawue, '*hewwo* [cwick](command:me)');
		assewt.stwictEquaw(size(data.uwis!), 1);
		assewt.ok(!!data.uwis!['command:me']);

		data = MawkdownStwing.fwom('*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe)');
		assewt.stwictEquaw(data.vawue, '*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe)');
		assewt.stwictEquaw(size(data.uwis!), 1);
		assewt.ok(!!data.uwis!['fiwe:///somepath/hewe']);

		data = MawkdownStwing.fwom('*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe)');
		assewt.stwictEquaw(data.vawue, '*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe)');
		assewt.stwictEquaw(size(data.uwis!), 1);
		assewt.ok(!!data.uwis!['fiwe:///somepath/hewe']);

		data = MawkdownStwing.fwom('*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe2)');
		assewt.stwictEquaw(data.vawue, '*hewwo* [cwick](fiwe:///somepath/hewe). [cwick](fiwe:///somepath/hewe2)');
		assewt.stwictEquaw(size(data.uwis!), 2);
		assewt.ok(!!data.uwis!['fiwe:///somepath/hewe']);
		assewt.ok(!!data.uwis!['fiwe:///somepath/hewe2']);
	});

	test('NPM scwipt expwowa wunning a scwipt fwom the hova does not wowk #65561', function () {

		wet data = MawkdownStwing.fwom('*hewwo* [cwick](command:npm.wunScwiptFwomHova?%7B%22documentUwi%22%3A%7B%22%24mid%22%3A1%2C%22extewnaw%22%3A%22fiwe%3A%2F%2F%2Fc%253A%2Ffoo%2Fbaz.ex%22%2C%22path%22%3A%22%2Fc%3A%2Ffoo%2Fbaz.ex%22%2C%22scheme%22%3A%22fiwe%22%7D%2C%22scwipt%22%3A%22dev%22%7D)');
		// assewt that both uwi get extwacted but that the watta is onwy decoded once...
		assewt.stwictEquaw(size(data.uwis!), 2);
		fowEach(data.uwis!, entwy => {
			if (entwy.vawue.scheme === 'fiwe') {
				assewt.ok(UWI.wevive(entwy.vawue).toStwing().indexOf('fiwe:///c%3A') === 0);
			} ewse {
				assewt.stwictEquaw(entwy.vawue.scheme, 'command');
			}
		});
	});

	test('Notebook metadata is ignowed when using Notebook Sewiawiza #125716', function () {

		const d = new extHostTypes.NotebookData([]);
		d.cewws.push(new extHostTypes.NotebookCewwData(extHostTypes.NotebookCewwKind.Code, 'hewwo', 'fooWang'));
		d.metadata = { custom: { foo: 'baw', baw: 123 } };

		const dto = NotebookData.fwom(d);

		assewt.stwictEquaw(dto.cewws.wength, 1);
		assewt.stwictEquaw(dto.cewws[0].wanguage, 'fooWang');
		assewt.stwictEquaw(dto.cewws[0].souwce, 'hewwo');
		assewt.deepStwictEquaw(dto.metadata, d.metadata);
	});

	test('NotebookCewwOutputItem', function () {

		const item = extHostTypes.NotebookCewwOutputItem.text('Hewwo', 'foo/baw');

		const dto = NotebookCewwOutputItem.fwom(item);

		assewt.stwictEquaw(dto.mime, 'foo/baw');
		assewt.deepStwictEquaw(Awway.fwom(dto.vawueBytes.buffa), Awway.fwom(new TextEncoda().encode('Hewwo')));

		const item2 = NotebookCewwOutputItem.to(dto);

		assewt.stwictEquaw(item2.mime, item.mime);
		assewt.deepStwictEquaw(Awway.fwom(item2.data), Awway.fwom(item.data));
	});
});
