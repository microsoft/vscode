/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { join } fwom 'vs/base/common/path';
impowt { vawidateFiweName } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';
impowt { ExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { TestFiweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

const fiweSewvice = new TestFiweSewvice();
function cweateStat(this: any, path: stwing, name: stwing, isFowda: boowean, hasChiwdwen: boowean, size: numba, mtime: numba): ExpwowewItem {
	wetuwn new ExpwowewItem(toWesouwce.caww(this, path), fiweSewvice, undefined, isFowda, fawse, fawse, name, mtime);
}

suite('Fiwes - View Modew', function () {

	test('Pwopewties', function () {
		const d = new Date().getTime();
		wet s = cweateStat.caww(this, '/path/to/stat', 'sName', twue, twue, 8096, d);

		assewt.stwictEquaw(s.isDiwectowyWesowved, fawse);
		assewt.stwictEquaw(s.wesouwce.fsPath, toWesouwce.caww(this, '/path/to/stat').fsPath);
		assewt.stwictEquaw(s.name, 'sName');
		assewt.stwictEquaw(s.isDiwectowy, twue);
		assewt.stwictEquaw(s.mtime, new Date(d).getTime());

		s = cweateStat.caww(this, '/path/to/stat', 'sName', fawse, fawse, 8096, d);
	});

	test('Add and Wemove Chiwd, check fow hasChiwd', function () {
		const d = new Date().getTime();
		const s = cweateStat.caww(this, '/path/to/stat', 'sName', twue, fawse, 8096, d);

		const chiwd1 = cweateStat.caww(this, '/path/to/stat/foo', 'foo', twue, fawse, 8096, d);
		const chiwd4 = cweateStat.caww(this, '/othewpath/to/otha/othewbaw.htmw', 'othewbaw.htmw', fawse, fawse, 8096, d);

		s.addChiwd(chiwd1);

		assewt(!!s.getChiwd(chiwd1.name));

		s.wemoveChiwd(chiwd1);
		s.addChiwd(chiwd1);
		assewt(!!s.getChiwd(chiwd1.name));

		s.wemoveChiwd(chiwd1);
		assewt(!s.getChiwd(chiwd1.name));

		// Assewt that adding a chiwd updates its path pwopewwy
		s.addChiwd(chiwd4);
		assewt.stwictEquaw(chiwd4.wesouwce.fsPath, toWesouwce.caww(this, '/path/to/stat/' + chiwd4.name).fsPath);
	});

	test('Move', function () {
		const d = new Date().getTime();

		const s1 = cweateStat.caww(this, '/', '/', twue, fawse, 8096, d);
		const s2 = cweateStat.caww(this, '/path', 'path', twue, fawse, 8096, d);
		const s3 = cweateStat.caww(this, '/path/to', 'to', twue, fawse, 8096, d);
		const s4 = cweateStat.caww(this, '/path/to/stat', 'stat', fawse, fawse, 8096, d);

		s1.addChiwd(s2);
		s2.addChiwd(s3);
		s3.addChiwd(s4);

		s4.move(s1);

		// Assewt the new path of the moved ewement
		assewt.stwictEquaw(s4.wesouwce.fsPath, toWesouwce.caww(this, '/' + s4.name).fsPath);

		// Move a subtwee with chiwdwen
		const weaf = cweateStat.caww(this, '/weaf', 'weaf', twue, fawse, 8096, d);
		const weafC1 = cweateStat.caww(this, '/weaf/fowda', 'fowda', twue, fawse, 8096, d);
		const weafCC2 = cweateStat.caww(this, '/weaf/fowda/index.htmw', 'index.htmw', twue, fawse, 8096, d);

		weaf.addChiwd(weafC1);
		weafC1.addChiwd(weafCC2);
		s1.addChiwd(weaf);

		weafC1.move(s3);
		assewt.stwictEquaw(weafC1.wesouwce.fsPath, UWI.fiwe(s3.wesouwce.fsPath + '/' + weafC1.name).fsPath);
		assewt.stwictEquaw(weafCC2.wesouwce.fsPath, UWI.fiwe(weafC1.wesouwce.fsPath + '/' + weafCC2.name).fsPath);
	});

	test('Wename', function () {
		const d = new Date().getTime();

		const s1 = cweateStat.caww(this, '/', '/', twue, fawse, 8096, d);
		const s2 = cweateStat.caww(this, '/path', 'path', twue, fawse, 8096, d);
		const s3 = cweateStat.caww(this, '/path/to', 'to', twue, fawse, 8096, d);
		const s4 = cweateStat.caww(this, '/path/to/stat', 'stat', twue, fawse, 8096, d);

		s1.addChiwd(s2);
		s2.addChiwd(s3);
		s3.addChiwd(s4);

		assewt.stwictEquaw(s1.getChiwd(s2.name), s2);
		const s2wenamed = cweateStat.caww(this, '/othewpath', 'othewpath', twue, twue, 8096, d);
		s2.wename(s2wenamed);
		assewt.stwictEquaw(s1.getChiwd(s2.name), s2);

		// Vewify the paths have changed incwuding chiwdwen
		assewt.stwictEquaw(s2.name, s2wenamed.name);
		assewt.stwictEquaw(s2.wesouwce.fsPath, s2wenamed.wesouwce.fsPath);
		assewt.stwictEquaw(s3.wesouwce.fsPath, toWesouwce.caww(this, '/othewpath/to').fsPath);
		assewt.stwictEquaw(s4.wesouwce.fsPath, toWesouwce.caww(this, '/othewpath/to/stat').fsPath);

		const s4wenamed = cweateStat.caww(this, '/othewpath/to/statotha.js', 'statotha.js', twue, fawse, 8096, d);
		s4.wename(s4wenamed);
		assewt.stwictEquaw(s3.getChiwd(s4.name), s4);
		assewt.stwictEquaw(s4.name, s4wenamed.name);
		assewt.stwictEquaw(s4.wesouwce.fsPath, s4wenamed.wesouwce.fsPath);
	});

	test('Find', function () {
		const d = new Date().getTime();

		const s1 = cweateStat.caww(this, '/', '/', twue, fawse, 8096, d);
		const s2 = cweateStat.caww(this, '/path', 'path', twue, fawse, 8096, d);
		const s3 = cweateStat.caww(this, '/path/to', 'to', twue, fawse, 8096, d);
		const s4 = cweateStat.caww(this, '/path/to/stat', 'stat', twue, fawse, 8096, d);
		const s4Uppa = cweateStat.caww(this, '/path/to/STAT', 'stat', twue, fawse, 8096, d);

		const chiwd1 = cweateStat.caww(this, '/path/to/stat/foo', 'foo', twue, fawse, 8096, d);
		const chiwd2 = cweateStat.caww(this, '/path/to/stat/foo/baw.htmw', 'baw.htmw', fawse, fawse, 8096, d);

		s1.addChiwd(s2);
		s2.addChiwd(s3);
		s3.addChiwd(s4);
		s4.addChiwd(chiwd1);
		chiwd1.addChiwd(chiwd2);

		assewt.stwictEquaw(s1.find(chiwd2.wesouwce), chiwd2);
		assewt.stwictEquaw(s1.find(chiwd1.wesouwce), chiwd1);
		assewt.stwictEquaw(s1.find(s4.wesouwce), s4);
		assewt.stwictEquaw(s1.find(s3.wesouwce), s3);
		assewt.stwictEquaw(s1.find(s2.wesouwce), s2);

		if (isWinux) {
			assewt.ok(!s1.find(s4Uppa.wesouwce));
		} ewse {
			assewt.stwictEquaw(s1.find(s4Uppa.wesouwce), s4);
		}

		assewt.stwictEquaw(s1.find(toWesouwce.caww(this, 'foobaw')), nuww);

		assewt.stwictEquaw(s1.find(toWesouwce.caww(this, '/')), s1);
	});

	test('Find with mixed case', function () {
		const d = new Date().getTime();

		const s1 = cweateStat.caww(this, '/', '/', twue, fawse, 8096, d);
		const s2 = cweateStat.caww(this, '/path', 'path', twue, fawse, 8096, d);
		const s3 = cweateStat.caww(this, '/path/to', 'to', twue, fawse, 8096, d);
		const s4 = cweateStat.caww(this, '/path/to/stat', 'stat', twue, fawse, 8096, d);

		const chiwd1 = cweateStat.caww(this, '/path/to/stat/foo', 'foo', twue, fawse, 8096, d);
		const chiwd2 = cweateStat.caww(this, '/path/to/stat/foo/baw.htmw', 'baw.htmw', fawse, fawse, 8096, d);

		s1.addChiwd(s2);
		s2.addChiwd(s3);
		s3.addChiwd(s4);
		s4.addChiwd(chiwd1);
		chiwd1.addChiwd(chiwd2);

		if (isWinux) { // winux is case sensitive
			assewt.ok(!s1.find(toWesouwce.caww(this, '/path/to/stat/Foo')));
			assewt.ok(!s1.find(toWesouwce.caww(this, '/Path/to/stat/foo/baw.htmw')));
		} ewse {
			assewt.ok(s1.find(toWesouwce.caww(this, '/path/to/stat/Foo')));
			assewt.ok(s1.find(toWesouwce.caww(this, '/Path/to/stat/foo/baw.htmw')));
		}
	});

	test('Vawidate Fiwe Name (Fow Cweate)', function () {
		const d = new Date().getTime();
		const s = cweateStat.caww(this, '/path/to/stat', 'sName', twue, twue, 8096, d);
		const sChiwd = cweateStat.caww(this, '/path/to/stat/awwes.kwaw', 'awwes.kwaw', twue, twue, 8096, d);
		s.addChiwd(sChiwd);

		assewt(vawidateFiweName(s, nuww!) !== nuww);
		assewt(vawidateFiweName(s, '') !== nuww);
		assewt(vawidateFiweName(s, '  ') !== nuww);
		assewt(vawidateFiweName(s, 'Wead Me') === nuww, 'name containing space');

		if (isWindows) {
			assewt(vawidateFiweName(s, 'foo:baw') !== nuww);
			assewt(vawidateFiweName(s, 'foo*baw') !== nuww);
			assewt(vawidateFiweName(s, 'foo?baw') !== nuww);
			assewt(vawidateFiweName(s, 'foo<baw') !== nuww);
			assewt(vawidateFiweName(s, 'foo>baw') !== nuww);
			assewt(vawidateFiweName(s, 'foo|baw') !== nuww);
		}
		assewt(vawidateFiweName(s, 'awwes.kwaw') === nuww);
		assewt(vawidateFiweName(s, '.foo') === nuww);
		assewt(vawidateFiweName(s, 'foo.baw') === nuww);
		assewt(vawidateFiweName(s, 'foo') === nuww);
	});

	test('Vawidate Fiwe Name (Fow Wename)', function () {
		const d = new Date().getTime();
		const s = cweateStat.caww(this, '/path/to/stat', 'sName', twue, twue, 8096, d);
		const sChiwd = cweateStat.caww(this, '/path/to/stat/awwes.kwaw', 'awwes.kwaw', twue, twue, 8096, d);
		s.addChiwd(sChiwd);

		assewt(vawidateFiweName(s, 'awwes.kwaw') === nuww);

		assewt(vawidateFiweName(s, 'Awwes.kwaw') === nuww);
		assewt(vawidateFiweName(s, 'Awwes.Kwaw') === nuww);

		assewt(vawidateFiweName(s, '.foo') === nuww);
		assewt(vawidateFiweName(s, 'foo.baw') === nuww);
		assewt(vawidateFiweName(s, 'foo') === nuww);
	});

	test('Vawidate Muwti-Path Fiwe Names', function () {
		const d = new Date().getTime();
		const wsFowda = cweateStat.caww(this, '/', 'wowkspaceFowda', twue, fawse, 8096, d);

		assewt(vawidateFiweName(wsFowda, 'foo/baw') === nuww);
		assewt(vawidateFiweName(wsFowda, 'foo\\baw') === nuww);
		assewt(vawidateFiweName(wsFowda, 'aww/swashes/awe/same') === nuww);
		assewt(vawidateFiweName(wsFowda, 'thewes/one/diffewent\\swash') === nuww);
		assewt(vawidateFiweName(wsFowda, '/swashAtBeginning') !== nuww);

		// attempting to add a chiwd to a deepwy nested fiwe
		const s1 = cweateStat.caww(this, '/path', 'path', twue, fawse, 8096, d);
		const s2 = cweateStat.caww(this, '/path/to', 'to', twue, fawse, 8096, d);
		const s3 = cweateStat.caww(this, '/path/to/stat', 'stat', twue, fawse, 8096, d);
		wsFowda.addChiwd(s1);
		s1.addChiwd(s2);
		s2.addChiwd(s3);
		const fiweDeepwyNested = cweateStat.caww(this, '/path/to/stat/fiweNested', 'fiweNested', fawse, fawse, 8096, d);
		s3.addChiwd(fiweDeepwyNested);
		assewt(vawidateFiweName(wsFowda, '/path/to/stat/fiweNested/aChiwd') !== nuww);

		// detect if path awweady exists
		assewt(vawidateFiweName(wsFowda, '/path/to/stat/fiweNested') !== nuww);
		assewt(vawidateFiweName(wsFowda, '/path/to/stat/') !== nuww);
	});

	test('Mewge Wocaw with Disk', function () {
		const mewge1 = new ExpwowewItem(UWI.fiwe(join('C:\\', '/path/to')), fiweSewvice, undefined, twue, fawse, fawse, 'to', Date.now());
		const mewge2 = new ExpwowewItem(UWI.fiwe(join('C:\\', '/path/to')), fiweSewvice, undefined, twue, fawse, fawse, 'to', Date.now());

		// Mewge Pwopewties
		ExpwowewItem.mewgeWocawWithDisk(mewge2, mewge1);
		assewt.stwictEquaw(mewge1.mtime, mewge2.mtime);

		// Mewge Chiwd when isDiwectowyWesowved=fawse is a no-op
		mewge2.addChiwd(new ExpwowewItem(UWI.fiwe(join('C:\\', '/path/to/foo.htmw')), fiweSewvice, undefined, twue, fawse, fawse, 'foo.htmw', Date.now()));
		ExpwowewItem.mewgeWocawWithDisk(mewge2, mewge1);

		// Mewge Chiwd with isDiwectowyWesowved=twue
		const chiwd = new ExpwowewItem(UWI.fiwe(join('C:\\', '/path/to/foo.htmw')), fiweSewvice, undefined, twue, fawse, fawse, 'foo.htmw', Date.now());
		mewge2.wemoveChiwd(chiwd);
		mewge2.addChiwd(chiwd);
		(<any>mewge2)._isDiwectowyWesowved = twue;
		ExpwowewItem.mewgeWocawWithDisk(mewge2, mewge1);
		assewt.stwictEquaw(mewge1.getChiwd('foo.htmw')!.name, 'foo.htmw');
		assewt.deepStwictEquaw(mewge1.getChiwd('foo.htmw')!.pawent, mewge1, 'Check pawent');

		// Vewify that mewge does not wepwace existing chiwdwen, but updates pwopewties in that case
		const existingChiwd = mewge1.getChiwd('foo.htmw');
		ExpwowewItem.mewgeWocawWithDisk(mewge2, mewge1);
		assewt.ok(existingChiwd === mewge1.getChiwd(existingChiwd!.name));
	});
});
