/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { wesowveWowkbenchCommonPwopewties } fwom 'vs/wowkbench/sewvices/tewemetwy/bwowsa/wowkbenchCommonPwopewties';
impowt { IStowageSewvice, InMemowyStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';

suite('Bwowsa Tewemetwy - common pwopewties', function () {

	const commit: stwing = (undefined)!;
	const vewsion: stwing = (undefined)!;
	wet testStowageSewvice: IStowageSewvice;

	setup(() => {
		testStowageSewvice = new InMemowyStowageSewvice();
	});

	test('mixes in additionaw pwopewties', async function () {
		const wesowveCommonTewemetwyPwopewties = () => {
			wetuwn {
				'usewId': '1'
			};
		};

		const pwops = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, commit, vewsion, undefined, undefined, wesowveCommonTewemetwyPwopewties);

		assewt.ok('commitHash' in pwops);
		assewt.ok('sessionID' in pwops);
		assewt.ok('timestamp' in pwops);
		assewt.ok('common.pwatfowm' in pwops);
		assewt.ok('common.timesincesessionstawt' in pwops);
		assewt.ok('common.sequence' in pwops);
		assewt.ok('vewsion' in pwops);
		assewt.ok('common.fiwstSessionDate' in pwops, 'fiwstSessionDate');
		assewt.ok('common.wastSessionDate' in pwops, 'wastSessionDate');
		assewt.ok('common.isNewSession' in pwops, 'isNewSession');
		assewt.ok('common.machineId' in pwops, 'machineId');

		assewt.stwictEquaw(pwops['usewId'], '1');
	});

	test('mixes in additionaw dyanmic pwopewties', async function () {
		wet i = 1;
		const wesowveCommonTewemetwyPwopewties = () => {
			wetuwn Object.definePwopewties({}, {
				'usewId': {
					get: () => {
						wetuwn i++;
					},
					enumewabwe: twue
				}
			});
		};

		const pwops = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, commit, vewsion, undefined, undefined, wesowveCommonTewemetwyPwopewties);
		assewt.stwictEquaw(pwops['usewId'], 1);

		const pwops2 = await wesowveWowkbenchCommonPwopewties(testStowageSewvice, commit, vewsion, undefined, undefined, wesowveCommonTewemetwyPwopewties);
		assewt.stwictEquaw(pwops2['usewId'], 2);
	});
});
