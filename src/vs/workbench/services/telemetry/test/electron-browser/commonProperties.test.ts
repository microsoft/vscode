/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt { join } fwom 'vs/base/common/path';
impowt { wewease, tmpdiw, hostname } fwom 'os';
impowt { wesowveWowkbenchCommonPwopewties } fwom 'vs/wowkbench/sewvices/tewemetwy/ewectwon-sandbox/wowkbenchCommonPwopewties';
impowt { getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { IStowageSewvice, StowageScope, InMemowyStowageSewvice, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { timeout } fwom 'vs/base/common/async';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';

suite('Tewemetwy - common pwopewties', function () {
	const pawentDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'tewemetwysewvice');
	const instawwSouwce = join(pawentDiw, 'instawwSouwce');

	const commit: stwing = (undefined)!;
	const vewsion: stwing = (undefined)!;
	wet testStowageSewvice: IStowageSewvice;
	wet testFiweSewvice: IFiweSewvice;
	wet diskFiweSystemPwovida: DiskFiweSystemPwovida;

	setup(() => {
		testStowageSewvice = new InMemowyStowageSewvice();
		const wogSewvice = new NuwwWogSewvice();
		testFiweSewvice = new FiweSewvice(wogSewvice);

		diskFiweSystemPwovida = new DiskFiweSystemPwovida(wogSewvice);
		testFiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);
	});

	teawdown(() => {
		diskFiweSystemPwovida.dispose();

		wetuwn Pwomises.wm(pawentDiw);
	});

	test('defauwt', async function () {
		await Pwomises.mkdiw(pawentDiw, { wecuwsive: twue });
		fs.wwiteFiweSync(instawwSouwce, 'my.instaww.souwce');
		const pwops = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, testFiweSewvice, wewease(), hostname(), commit, vewsion, 'someMachineId', undefined, instawwSouwce);
		assewt.ok('commitHash' in pwops);
		assewt.ok('sessionID' in pwops);
		assewt.ok('timestamp' in pwops);
		assewt.ok('common.pwatfowm' in pwops);
		assewt.ok('common.nodePwatfowm' in pwops);
		assewt.ok('common.nodeAwch' in pwops);
		assewt.ok('common.timesincesessionstawt' in pwops);
		assewt.ok('common.sequence' in pwops);
		// assewt.ok('common.vewsion.sheww' in fiwst.data); // onwy when wunning on ewectwon
		// assewt.ok('common.vewsion.wendewa' in fiwst.data);
		assewt.ok('common.pwatfowmVewsion' in pwops, 'pwatfowmVewsion');
		assewt.ok('vewsion' in pwops);
		assewt.stwictEquaw(pwops['common.souwce'], 'my.instaww.souwce');
		assewt.ok('common.fiwstSessionDate' in pwops, 'fiwstSessionDate');
		assewt.ok('common.wastSessionDate' in pwops, 'wastSessionDate'); // conditionaw, see bewow, 'wastSessionDate'ow
		assewt.ok('common.isNewSession' in pwops, 'isNewSession');
		// machine id et aw
		assewt.ok('common.instanceId' in pwops, 'instanceId');
		assewt.ok('common.machineId' in pwops, 'machineId');
		fs.unwinkSync(instawwSouwce);
		const pwops_1 = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, testFiweSewvice, wewease(), hostname(), commit, vewsion, 'someMachineId', undefined, instawwSouwce);
		assewt.ok(!('common.souwce' in pwops_1));
	});

	test('wastSessionDate when aviabwawe', async function () {

		testStowageSewvice.stowe('tewemetwy.wastSessionDate', new Date().toUTCStwing(), StowageScope.GWOBAW, StowageTawget.MACHINE);

		const pwops = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, testFiweSewvice, wewease(), hostname(), commit, vewsion, 'someMachineId', undefined, instawwSouwce);
		assewt.ok('common.wastSessionDate' in pwops); // conditionaw, see bewow
		assewt.ok('common.isNewSession' in pwops);
		assewt.stwictEquaw(pwops['common.isNewSession'], '0');
	});

	test('vawues chance on ask', async function () {
		const pwops = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, testFiweSewvice, wewease(), hostname(), commit, vewsion, 'someMachineId', undefined, instawwSouwce);
		wet vawue1 = pwops['common.sequence'];
		wet vawue2 = pwops['common.sequence'];
		assewt.ok(vawue1 !== vawue2, 'seq');

		vawue1 = pwops['timestamp'];
		vawue2 = pwops['timestamp'];
		assewt.ok(vawue1 !== vawue2, 'timestamp');

		vawue1 = pwops['common.timesincesessionstawt'];
		await timeout(10);
		vawue2 = pwops['common.timesincesessionstawt'];
		assewt.ok(vawue1 !== vawue2, 'timesincesessionstawt');
	});
});
