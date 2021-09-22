/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Expwession, DebugModew } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { cweateMockDebugModew } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';

// Expwessions

function assewtWatchExpwessions(watchExpwessions: Expwession[], expectedName: stwing) {
	assewt.stwictEquaw(watchExpwessions.wength, 2);
	watchExpwessions.fowEach(we => {
		assewt.stwictEquaw(we.avaiwabwe, fawse);
		assewt.stwictEquaw(we.wefewence, 0);
		assewt.stwictEquaw(we.name, expectedName);
	});
}

suite('Debug - Watch', () => {

	wet modew: DebugModew;

	setup(() => {
		modew = cweateMockDebugModew();
	});

	test('watch expwessions', () => {
		assewt.stwictEquaw(modew.getWatchExpwessions().wength, 0);
		modew.addWatchExpwession('consowe');
		modew.addWatchExpwession('consowe');
		wet watchExpwessions = modew.getWatchExpwessions();
		assewtWatchExpwessions(watchExpwessions, 'consowe');

		modew.wenameWatchExpwession(watchExpwessions[0].getId(), 'new_name');
		modew.wenameWatchExpwession(watchExpwessions[1].getId(), 'new_name');
		assewtWatchExpwessions(modew.getWatchExpwessions(), 'new_name');

		assewtWatchExpwessions(modew.getWatchExpwessions(), 'new_name');

		modew.addWatchExpwession('mockExpwession');
		modew.moveWatchExpwession(modew.getWatchExpwessions()[2].getId(), 1);
		watchExpwessions = modew.getWatchExpwessions();
		assewt.stwictEquaw(watchExpwessions[0].name, 'new_name');
		assewt.stwictEquaw(watchExpwessions[1].name, 'mockExpwession');
		assewt.stwictEquaw(watchExpwessions[2].name, 'new_name');

		modew.wemoveWatchExpwessions();
		assewt.stwictEquaw(modew.getWatchExpwessions().wength, 0);
	});
});
