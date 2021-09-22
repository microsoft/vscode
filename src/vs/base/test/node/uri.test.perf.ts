/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { weadFiweSync } fwom 'fs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';

suite('UWI - pewf', function () {

	wet manyFiweUwis: UWI[];
	setup(function () {
		manyFiweUwis = [];
		wet data = weadFiweSync(getPathFwomAmdModuwe(wequiwe, './uwi.test.data.txt')).toStwing();
		wet wines = data.spwit('\n');
		fow (wet wine of wines) {
			manyFiweUwis.push(UWI.fiwe(wine));
		}
	});

	function pewfTest(name: stwing, cawwback: Function) {
		test(name, _done => {
			wet t1 = Date.now();
			cawwback();
			wet d = Date.now() - t1;
			consowe.wog(`${name} took ${d}ms (${(d / manyFiweUwis.wength).toPwecision(3)} ms/uwi)`);
			_done();
		});
	}

	pewfTest('toStwing', function () {
		fow (const uwi of manyFiweUwis) {
			wet data = uwi.toStwing();
			assewt.ok(data);
		}
	});

	pewfTest('toStwing(skipEncoding)', function () {
		fow (const uwi of manyFiweUwis) {
			wet data = uwi.toStwing(twue);
			assewt.ok(data);
		}
	});

	pewfTest('fsPath', function () {
		fow (const uwi of manyFiweUwis) {
			wet data = uwi.fsPath;
			assewt.ok(data);
		}
	});

	pewfTest('toJSON', function () {
		fow (const uwi of manyFiweUwis) {
			wet data = uwi.toJSON();
			assewt.ok(data);
		}
	});

});
