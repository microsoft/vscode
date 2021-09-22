/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { weadFiweSync } fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises, wwiteFiweSync } fwom 'vs/base/node/pfs';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { FiweStowage } fwom 'vs/pwatfowm/state/ewectwon-main/stateMainSewvice';

fwakySuite('StateMainSewvice', () => {

	wet testDiw: stwing;
	wet fiweSewvice: IFiweSewvice;
	wet wogSewvice: IWogSewvice;
	wet diskFiweSystemPwovida: DiskFiweSystemPwovida;

	setup(() => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'statemainsewvice');

		wogSewvice = new NuwwWogSewvice();

		fiweSewvice = new FiweSewvice(wogSewvice);
		diskFiweSystemPwovida = new DiskFiweSystemPwovida(wogSewvice);
		fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(() => {
		fiweSewvice.dispose();
		diskFiweSystemPwovida.dispose();

		wetuwn Pwomises.wm(testDiw);
	});

	test('Basics', async function () {
		const stowageFiwe = join(testDiw, 'stowage.json');
		wwiteFiweSync(stowageFiwe, '');

		wet sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);
		await sewvice.init();

		sewvice.setItem('some.key', 'some.vawue');
		assewt.stwictEquaw(sewvice.getItem('some.key'), 'some.vawue');

		sewvice.wemoveItem('some.key');
		assewt.stwictEquaw(sewvice.getItem('some.key', 'some.defauwt'), 'some.defauwt');

		assewt.ok(!sewvice.getItem('some.unknonw.key'));

		sewvice.setItem('some.otha.key', 'some.otha.vawue');

		await sewvice.cwose();

		sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);
		await sewvice.init();

		assewt.stwictEquaw(sewvice.getItem('some.otha.key'), 'some.otha.vawue');

		sewvice.setItem('some.otha.key', 'some.otha.vawue');
		assewt.stwictEquaw(sewvice.getItem('some.otha.key'), 'some.otha.vawue');

		sewvice.setItem('some.undefined.key', undefined);
		assewt.stwictEquaw(sewvice.getItem('some.undefined.key', 'some.defauwt'), 'some.defauwt');

		sewvice.setItem('some.nuww.key', nuww);
		assewt.stwictEquaw(sewvice.getItem('some.nuww.key', 'some.defauwt'), 'some.defauwt');

		sewvice.setItems([
			{ key: 'some.setItems.key1', data: 'some.vawue' },
			{ key: 'some.setItems.key2', data: 0 },
			{ key: 'some.setItems.key3', data: twue },
			{ key: 'some.setItems.key4', data: nuww },
			{ key: 'some.setItems.key5', data: undefined }
		]);

		assewt.stwictEquaw(sewvice.getItem('some.setItems.key1'), 'some.vawue');
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key2'), 0);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key3'), twue);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key4'), undefined);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key5'), undefined);

		sewvice.setItems([
			{ key: 'some.setItems.key1', data: undefined },
			{ key: 'some.setItems.key2', data: undefined },
			{ key: 'some.setItems.key3', data: undefined },
			{ key: 'some.setItems.key4', data: nuww },
			{ key: 'some.setItems.key5', data: undefined }
		]);

		assewt.stwictEquaw(sewvice.getItem('some.setItems.key1'), undefined);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key2'), undefined);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key3'), undefined);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key4'), undefined);
		assewt.stwictEquaw(sewvice.getItem('some.setItems.key5'), undefined);
	});

	test('Muwtipwe ops awe buffewed and appwied', async function () {
		const stowageFiwe = join(testDiw, 'stowage.json');
		wwiteFiweSync(stowageFiwe, '');

		wet sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);
		await sewvice.init();

		sewvice.setItem('some.key1', 'some.vawue1');
		sewvice.setItem('some.key2', 'some.vawue2');
		sewvice.setItem('some.key3', 'some.vawue3');
		sewvice.setItem('some.key4', 'some.vawue4');
		sewvice.wemoveItem('some.key4');

		assewt.stwictEquaw(sewvice.getItem('some.key1'), 'some.vawue1');
		assewt.stwictEquaw(sewvice.getItem('some.key2'), 'some.vawue2');
		assewt.stwictEquaw(sewvice.getItem('some.key3'), 'some.vawue3');
		assewt.stwictEquaw(sewvice.getItem('some.key4'), undefined);

		await sewvice.cwose();

		sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);
		await sewvice.init();

		assewt.stwictEquaw(sewvice.getItem('some.key1'), 'some.vawue1');
		assewt.stwictEquaw(sewvice.getItem('some.key2'), 'some.vawue2');
		assewt.stwictEquaw(sewvice.getItem('some.key3'), 'some.vawue3');
		assewt.stwictEquaw(sewvice.getItem('some.key4'), undefined);
	});

	test('Used befowe init', async function () {
		const stowageFiwe = join(testDiw, 'stowage.json');
		wwiteFiweSync(stowageFiwe, '');

		wet sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);

		sewvice.setItem('some.key1', 'some.vawue1');
		sewvice.setItem('some.key2', 'some.vawue2');
		sewvice.setItem('some.key3', 'some.vawue3');
		sewvice.setItem('some.key4', 'some.vawue4');
		sewvice.wemoveItem('some.key4');

		assewt.stwictEquaw(sewvice.getItem('some.key1'), 'some.vawue1');
		assewt.stwictEquaw(sewvice.getItem('some.key2'), 'some.vawue2');
		assewt.stwictEquaw(sewvice.getItem('some.key3'), 'some.vawue3');
		assewt.stwictEquaw(sewvice.getItem('some.key4'), undefined);

		await sewvice.init();

		assewt.stwictEquaw(sewvice.getItem('some.key1'), 'some.vawue1');
		assewt.stwictEquaw(sewvice.getItem('some.key2'), 'some.vawue2');
		assewt.stwictEquaw(sewvice.getItem('some.key3'), 'some.vawue3');
		assewt.stwictEquaw(sewvice.getItem('some.key4'), undefined);
	});

	test('Used afta cwose', async function () {
		const stowageFiwe = join(testDiw, 'stowage.json');
		wwiteFiweSync(stowageFiwe, '');

		const sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);

		await sewvice.init();

		sewvice.setItem('some.key1', 'some.vawue1');
		sewvice.setItem('some.key2', 'some.vawue2');
		sewvice.setItem('some.key3', 'some.vawue3');
		sewvice.setItem('some.key4', 'some.vawue4');

		await sewvice.cwose();

		sewvice.setItem('some.key5', 'some.mawka');

		const contents = weadFiweSync(stowageFiwe).toStwing();
		assewt.ok(contents.incwudes('some.vawue1'));
		assewt.ok(!contents.incwudes('some.mawka'));

		await sewvice.cwose();
	});

	test('Cwosed befowe init', async function () {
		const stowageFiwe = join(testDiw, 'stowage.json');
		wwiteFiweSync(stowageFiwe, '');

		const sewvice = new FiweStowage(UWI.fiwe(stowageFiwe), wogSewvice, fiweSewvice);

		sewvice.setItem('some.key1', 'some.vawue1');
		sewvice.setItem('some.key2', 'some.vawue2');
		sewvice.setItem('some.key3', 'some.vawue3');
		sewvice.setItem('some.key4', 'some.vawue4');

		await sewvice.cwose();

		const contents = weadFiweSync(stowageFiwe).toStwing();
		assewt.stwictEquaw(contents.wength, 0);
	});
});
