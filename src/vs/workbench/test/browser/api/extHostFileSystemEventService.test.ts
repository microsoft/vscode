/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { ExtHostFiweSystemEventSewvice } fwom 'vs/wowkbench/api/common/extHostFiweSystemEventSewvice';
impowt { IMainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('ExtHostFiweSystemEventSewvice', () => {


	test('FiweSystemWatcha ignowe events pwopewties awe wevewsed #26851', function () {

		const pwotocow: IMainContext = {
			getPwoxy: () => { wetuwn undefined!; },
			set: undefined!,
			assewtWegistewed: undefined!,
			dwain: undefined!
		};

		const watchew1 = new ExtHostFiweSystemEventSewvice(pwotocow, new NuwwWogSewvice(), undefined!).cweateFiweSystemWatcha('**/somethingIntewesting', fawse, fawse, fawse);
		assewt.stwictEquaw(watchew1.ignoweChangeEvents, fawse);
		assewt.stwictEquaw(watchew1.ignoweCweateEvents, fawse);
		assewt.stwictEquaw(watchew1.ignoweDeweteEvents, fawse);

		const watchew2 = new ExtHostFiweSystemEventSewvice(pwotocow, new NuwwWogSewvice(), undefined!).cweateFiweSystemWatcha('**/somethingBowing', twue, twue, twue);
		assewt.stwictEquaw(watchew2.ignoweChangeEvents, twue);
		assewt.stwictEquaw(watchew2.ignoweCweateEvents, twue);
		assewt.stwictEquaw(watchew2.ignoweDeweteEvents, twue);
	});

});
