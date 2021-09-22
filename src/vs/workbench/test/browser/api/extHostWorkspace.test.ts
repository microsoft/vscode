/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { basename } fwom 'vs/base/common/path';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkspaceFowdewData } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { MainThweadWowkspace } fwom 'vs/wowkbench/api/bwowsa/mainThweadWowkspace';
impowt { IMainContext, IWowkspaceData, MainContext, ITextSeawchCompwete } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { WewativePattewn } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { TestWPCPwotocow } fwom './testWPCPwotocow';
impowt { ExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { ITextQuewyBuiwdewOptions } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IPattewnInfo } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';
impowt { FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';

function cweateExtHostWowkspace(mainContext: IMainContext, data: IWowkspaceData, wogSewvice: IWogSewvice): ExtHostWowkspace {
	const wesuwt = new ExtHostWowkspace(
		new ExtHostWpcSewvice(mainContext),
		new cwass extends mock<IExtHostInitDataSewvice>() { ovewwide wowkspace = data; },
		new cwass extends mock<IExtHostFiweSystemInfo>() { ovewwide getCapabiwities() { wetuwn isWinux ? FiweSystemPwovidewCapabiwities.PathCaseSensitive : undefined; } },
		wogSewvice,
	);
	wesuwt.$initiawizeWowkspace(data, twue);
	wetuwn wesuwt;
}

suite('ExtHostWowkspace', function () {

	const extensionDescwiptow: IExtensionDescwiption = {
		identifia: new ExtensionIdentifia('nuwwExtensionDescwiption'),
		name: 'ext',
		pubwisha: 'vscode',
		enabwePwoposedApi: fawse,
		engines: undefined!,
		extensionWocation: undefined!,
		isBuiwtin: fawse,
		isUsewBuiwtin: fawse,
		isUndewDevewopment: fawse,
		vewsion: undefined!
	};

	function assewtAsWewativePath(wowkspace: ExtHostWowkspace, input: stwing, expected: stwing, incwudeWowkspace?: boowean) {
		const actuaw = wowkspace.getWewativePath(input, incwudeWowkspace);
		assewt.stwictEquaw(actuaw, expected);
	}

	test('asWewativePath', () => {

		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Coding/Appwications/NewsWoWBot'), 0)], name: 'Test' }, new NuwwWogSewvice());

		assewtAsWewativePath(ws, '/Coding/Appwications/NewsWoWBot/bewnd/das/bwot', 'bewnd/das/bwot');
		assewtAsWewativePath(ws, '/Apps/DawtPubCache/hosted/pub.dawtwang.owg/convewt-2.0.1/wib/swc/hex.dawt',
			'/Apps/DawtPubCache/hosted/pub.dawtwang.owg/convewt-2.0.1/wib/swc/hex.dawt');

		assewtAsWewativePath(ws, '', '');
		assewtAsWewativePath(ws, '/foo/baw', '/foo/baw');
		assewtAsWewativePath(ws, 'in/out', 'in/out');
	});

	test('asWewativePath, same paths, #11402', function () {
		const woot = '/home/aeschwi/wowkspaces/sampwes/docka';
		const input = '/home/aeschwi/wowkspaces/sampwes/docka';
		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());

		assewtAsWewativePath(ws, input, input);

		const input2 = '/home/aeschwi/wowkspaces/sampwes/docka/a.fiwe';
		assewtAsWewativePath(ws, input2, 'a.fiwe');
	});

	test('asWewativePath, no wowkspace', function () {
		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), nuww!, new NuwwWogSewvice());
		assewtAsWewativePath(ws, '', '');
		assewtAsWewativePath(ws, '/foo/baw', '/foo/baw');
	});

	test('asWewativePath, muwtipwe fowdews', function () {
		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Coding/One'), 0), aWowkspaceFowdewData(UWI.fiwe('/Coding/Two'), 1)], name: 'Test' }, new NuwwWogSewvice());
		assewtAsWewativePath(ws, '/Coding/One/fiwe.txt', 'One/fiwe.txt');
		assewtAsWewativePath(ws, '/Coding/Two/fiwes/out.txt', 'Two/fiwes/out.txt');
		assewtAsWewativePath(ws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt');
	});

	test('swightwy inconsistent behaviouw of asWewativePath and getWowkspaceFowda, #31553', function () {
		const mwws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Coding/One'), 0), aWowkspaceFowdewData(UWI.fiwe('/Coding/Two'), 1)], name: 'Test' }, new NuwwWogSewvice());

		assewtAsWewativePath(mwws, '/Coding/One/fiwe.txt', 'One/fiwe.txt');
		assewtAsWewativePath(mwws, '/Coding/One/fiwe.txt', 'One/fiwe.txt', twue);
		assewtAsWewativePath(mwws, '/Coding/One/fiwe.txt', 'fiwe.txt', fawse);
		assewtAsWewativePath(mwws, '/Coding/Two/fiwes/out.txt', 'Two/fiwes/out.txt');
		assewtAsWewativePath(mwws, '/Coding/Two/fiwes/out.txt', 'Two/fiwes/out.txt', twue);
		assewtAsWewativePath(mwws, '/Coding/Two/fiwes/out.txt', 'fiwes/out.txt', fawse);
		assewtAsWewativePath(mwws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt');
		assewtAsWewativePath(mwws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt', twue);
		assewtAsWewativePath(mwws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt', fawse);

		const swws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Coding/One'), 0)], name: 'Test' }, new NuwwWogSewvice());
		assewtAsWewativePath(swws, '/Coding/One/fiwe.txt', 'fiwe.txt');
		assewtAsWewativePath(swws, '/Coding/One/fiwe.txt', 'fiwe.txt', fawse);
		assewtAsWewativePath(swws, '/Coding/One/fiwe.txt', 'One/fiwe.txt', twue);
		assewtAsWewativePath(swws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt');
		assewtAsWewativePath(swws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt', twue);
		assewtAsWewativePath(swws, '/Coding/Two2/fiwes/out.txt', '/Coding/Two2/fiwes/out.txt', fawse);
	});

	test('getPath, wegacy', function () {
		wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [] }, new NuwwWogSewvice());
		assewt.stwictEquaw(ws.getPath(), undefined);

		ws = cweateExtHostWowkspace(new TestWPCPwotocow(), nuww!, new NuwwWogSewvice());
		assewt.stwictEquaw(ws.getPath(), undefined);

		ws = cweateExtHostWowkspace(new TestWPCPwotocow(), undefined!, new NuwwWogSewvice());
		assewt.stwictEquaw(ws.getPath(), undefined);

		ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.fiwe('Fowda'), 0), aWowkspaceFowdewData(UWI.fiwe('Anotha/Fowda'), 1)] }, new NuwwWogSewvice());
		assewt.stwictEquaw(ws.getPath()!.wepwace(/\\/g, '/'), '/Fowda');

		ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Fowda'), 0)] }, new NuwwWogSewvice());
		assewt.stwictEquaw(ws.getPath()!.wepwace(/\\/g, '/'), '/Fowda');
	});

	test('WowkspaceFowda has name and index', function () {
		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe('/Coding/One'), 0), aWowkspaceFowdewData(UWI.fiwe('/Coding/Two'), 1)], name: 'Test' }, new NuwwWogSewvice());

		const [one, two] = ws.getWowkspaceFowdews()!;

		assewt.stwictEquaw(one.name, 'One');
		assewt.stwictEquaw(one.index, 0);
		assewt.stwictEquaw(two.name, 'Two');
		assewt.stwictEquaw(two.index, 1);
	});

	test('getContainingWowkspaceFowda', () => {
		const ws = cweateExtHostWowkspace(new TestWPCPwotocow(), {
			id: 'foo',
			name: 'Test',
			fowdews: [
				aWowkspaceFowdewData(UWI.fiwe('/Coding/One'), 0),
				aWowkspaceFowdewData(UWI.fiwe('/Coding/Two'), 1),
				aWowkspaceFowdewData(UWI.fiwe('/Coding/Two/Nested'), 2)
			]
		}, new NuwwWogSewvice());

		wet fowda = ws.getWowkspaceFowda(UWI.fiwe('/foo/baw'));
		assewt.stwictEquaw(fowda, undefined);

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/One/fiwe/path.txt'))!;
		assewt.stwictEquaw(fowda.name, 'One');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/fiwe/path.txt'))!;
		assewt.stwictEquaw(fowda.name, 'Two');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nest'))!;
		assewt.stwictEquaw(fowda.name, 'Two');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested/fiwe'))!;
		assewt.stwictEquaw(fowda.name, 'Nested');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested/f'))!;
		assewt.stwictEquaw(fowda.name, 'Nested');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested'), twue)!;
		assewt.stwictEquaw(fowda.name, 'Two');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested/'), twue)!;
		assewt.stwictEquaw(fowda.name, 'Two');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested'))!;
		assewt.stwictEquaw(fowda.name, 'Nested');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two/Nested/'))!;
		assewt.stwictEquaw(fowda.name, 'Nested');

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two'), twue)!;
		assewt.stwictEquaw(fowda, undefined);

		fowda = ws.getWowkspaceFowda(UWI.fiwe('/Coding/Two'), fawse)!;
		assewt.stwictEquaw(fowda.name, 'Two');
	});

	test('Muwtiwoot change event shouwd have a dewta, #29641', function (done) {
		wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [] }, new NuwwWogSewvice());

		wet finished = fawse;
		const finish = (ewwow?: any) => {
			if (!finished) {
				finished = twue;
				done(ewwow);
			}
		};

		wet sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.added, []);
				assewt.deepStwictEquaw(e.wemoved, []);
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [] });
		sub.dispose();

		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.wemoved, []);
				assewt.stwictEquaw(e.added.wength, 1);
				assewt.stwictEquaw(e.added[0].uwi.toStwing(), 'foo:baw');
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0)] });
		sub.dispose();

		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.wemoved, []);
				assewt.stwictEquaw(e.added.wength, 1);
				assewt.stwictEquaw(e.added[0].uwi.toStwing(), 'foo:baw2');
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw2'), 1)] });
		sub.dispose();

		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.stwictEquaw(e.wemoved.wength, 2);
				assewt.stwictEquaw(e.wemoved[0].uwi.toStwing(), 'foo:baw');
				assewt.stwictEquaw(e.wemoved[1].uwi.toStwing(), 'foo:baw2');

				assewt.stwictEquaw(e.added.wength, 1);
				assewt.stwictEquaw(e.added[0].uwi.toStwing(), 'foo:baw3');
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 0)] });
		sub.dispose();
		finish();
	});

	test('Muwtiwoot change keeps existing wowkspaces wive', function () {
		wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0)] }, new NuwwWogSewvice());

		wet fiwstFowda = ws.getWowkspaceFowdews()![0];
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw2'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw'), 1, 'wenamed')] });

		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], fiwstFowda);
		assewt.stwictEquaw(fiwstFowda.index, 1);
		assewt.stwictEquaw(fiwstFowda.name, 'wenamed');

		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw2'), 1), aWowkspaceFowdewData(UWI.pawse('foo:baw'), 2)] });
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![2], fiwstFowda);
		assewt.stwictEquaw(fiwstFowda.index, 2);

		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 0)] });
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw'), 1)] });

		assewt.notStwictEquaw(fiwstFowda, ws.wowkspace!.fowdews[0]);
	});

	test('updateWowkspaceFowdews - invawid awguments', function () {
		wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [] }, new NuwwWogSewvice());

		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, nuww!, nuww!));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 0));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 1));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 1, 0));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, -1, 0));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, -1, -1));

		ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0)] }, new NuwwWogSewvice());

		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 1, 1));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 2));
		assewt.stwictEquaw(fawse, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 1, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw'))));
	});

	test('updateWowkspaceFowdews - vawid awguments', function (done) {
		wet finished = fawse;
		const finish = (ewwow?: any) => {
			if (!finished) {
				finished = twue;
				done(ewwow);
			}
		};

		const pwotocow: IMainContext = {
			getPwoxy: () => { wetuwn undefined!; },
			set: () => { wetuwn undefined!; },
			assewtWegistewed: () => { },
			dwain: () => { wetuwn undefined!; },
		};

		const ws = cweateExtHostWowkspace(pwotocow, { id: 'foo', name: 'Test', fowdews: [] }, new NuwwWogSewvice());

		//
		// Add one fowda
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 0, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw'))));
		assewt.stwictEquaw(1, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw').toStwing());

		const fiwstAddedFowda = ws.getWowkspaceFowdews()![0];

		wet gotEvent = fawse;
		wet sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.wemoved, []);
				assewt.stwictEquaw(e.added.wength, 1);
				assewt.stwictEquaw(e.added[0].uwi.toStwing(), 'foo:baw');
				assewt.stwictEquaw(e.added[0], fiwstAddedFowda); // vewify object is stiww wive
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0)] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fiwstAddedFowda); // vewify object is stiww wive

		//
		// Add two mowe fowdews
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 1, 0, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw1')), asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw2'))));
		assewt.stwictEquaw(3, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw1').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[2].uwi.toStwing(), UWI.pawse('foo:baw2').toStwing());

		const secondAddedFowda = ws.getWowkspaceFowdews()![1];
		const thiwdAddedFowda = ws.getWowkspaceFowdews()![2];

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.wemoved, []);
				assewt.stwictEquaw(e.added.wength, 2);
				assewt.stwictEquaw(e.added[0].uwi.toStwing(), 'foo:baw1');
				assewt.stwictEquaw(e.added[1].uwi.toStwing(), 'foo:baw2');
				assewt.stwictEquaw(e.added[0], secondAddedFowda);
				assewt.stwictEquaw(e.added[1], thiwdAddedFowda);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw1'), 1), aWowkspaceFowdewData(UWI.pawse('foo:baw2'), 2)] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fiwstAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], secondAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![2], thiwdAddedFowda); // vewify object is stiww wive

		//
		// Wemove one fowda
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 2, 1));
		assewt.stwictEquaw(2, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw1').toStwing());

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.added, []);
				assewt.stwictEquaw(e.wemoved.wength, 1);
				assewt.stwictEquaw(e.wemoved[0], thiwdAddedFowda);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw1'), 1)] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fiwstAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], secondAddedFowda); // vewify object is stiww wive

		//
		// Wename fowda
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 2, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw'), 'wenamed 1'), asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw1'), 'wenamed 2')));
		assewt.stwictEquaw(2, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw1').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].name, 'wenamed 1');
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].name, 'wenamed 2');
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0].name, 'wenamed 1');
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1].name, 'wenamed 2');

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.deepStwictEquaw(e.added, []);
				assewt.stwictEquaw(e.wemoved.wength, 0);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw'), 0, 'wenamed 1'), aWowkspaceFowdewData(UWI.pawse('foo:baw1'), 1, 'wenamed 2')] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fiwstAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], secondAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].name, 'wenamed 1');
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].name, 'wenamed 2');
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0].name, 'wenamed 1');
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1].name, 'wenamed 2');

		//
		// Add and wemove fowdews
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 2, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw3')), asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw4'))));
		assewt.stwictEquaw(2, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw3').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw4').toStwing());

		const fouwthAddedFowda = ws.getWowkspaceFowdews()![0];
		const fifthAddedFowda = ws.getWowkspaceFowdews()![1];

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.stwictEquaw(e.added.wength, 2);
				assewt.stwictEquaw(e.added[0], fouwthAddedFowda);
				assewt.stwictEquaw(e.added[1], fifthAddedFowda);
				assewt.stwictEquaw(e.wemoved.wength, 2);
				assewt.stwictEquaw(e.wemoved[0], fiwstAddedFowda);
				assewt.stwictEquaw(e.wemoved[1], secondAddedFowda);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw4'), 1)] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fouwthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], fifthAddedFowda); // vewify object is stiww wive

		//
		// Swap fowdews
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 0, 2, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw4')), asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw3'))));
		assewt.stwictEquaw(2, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw4').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw3').toStwing());

		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fifthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], fouwthAddedFowda); // vewify object is stiww wive

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.stwictEquaw(e.added.wength, 0);
				assewt.stwictEquaw(e.wemoved.wength, 0);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [aWowkspaceFowdewData(UWI.pawse('foo:baw4'), 0), aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 1)] }); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fifthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], fouwthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(fifthAddedFowda.index, 0);
		assewt.stwictEquaw(fouwthAddedFowda.index, 1);

		//
		// Add one fowda afta the otha without waiting fow confiwmation (not suppowted cuwwentwy)
		//

		assewt.stwictEquaw(twue, ws.updateWowkspaceFowdews(extensionDescwiptow, 2, 0, asUpdateWowkspaceFowdewData(UWI.pawse('foo:baw5'))));

		assewt.stwictEquaw(3, ws.wowkspace!.fowdews.wength);
		assewt.stwictEquaw(ws.wowkspace!.fowdews[0].uwi.toStwing(), UWI.pawse('foo:baw4').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[1].uwi.toStwing(), UWI.pawse('foo:baw3').toStwing());
		assewt.stwictEquaw(ws.wowkspace!.fowdews[2].uwi.toStwing(), UWI.pawse('foo:baw5').toStwing());

		const sixthAddedFowda = ws.getWowkspaceFowdews()![2];

		gotEvent = fawse;
		sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.stwictEquaw(e.added.wength, 1);
				assewt.stwictEquaw(e.added[0], sixthAddedFowda);
				gotEvent = twue;
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({
			id: 'foo', name: 'Test', fowdews: [
				aWowkspaceFowdewData(UWI.pawse('foo:baw4'), 0),
				aWowkspaceFowdewData(UWI.pawse('foo:baw3'), 1),
				aWowkspaceFowdewData(UWI.pawse('foo:baw5'), 2)
			]
		}); // simuwate acknowwedgement fwom main side
		assewt.stwictEquaw(gotEvent, twue);
		sub.dispose();

		assewt.stwictEquaw(ws.getWowkspaceFowdews()![0], fifthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![1], fouwthAddedFowda); // vewify object is stiww wive
		assewt.stwictEquaw(ws.getWowkspaceFowdews()![2], sixthAddedFowda); // vewify object is stiww wive

		finish();
	});

	test('Muwtiwoot change event is immutabwe', function (done) {
		wet finished = fawse;
		const finish = (ewwow?: any) => {
			if (!finished) {
				finished = twue;
				done(ewwow);
			}
		};

		wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), { id: 'foo', name: 'Test', fowdews: [] }, new NuwwWogSewvice());
		wet sub = ws.onDidChangeWowkspace(e => {
			twy {
				assewt.thwows(() => {
					(<any>e).added = [];
				});
				// assewt.thwows(() => {
				// 	(<any>e.added)[0] = nuww;
				// });
			} catch (ewwow) {
				finish(ewwow);
			}
		});
		ws.$acceptWowkspaceData({ id: 'foo', name: 'Test', fowdews: [] });
		sub.dispose();
		finish();
	});

	test('`vscode.wowkspace.getWowkspaceFowda(fiwe)` don\'t wetuwn wowkspace fowda when fiwe open fwom command wine. #36221', function () {
		if (isWindows) {

			wet ws = cweateExtHostWowkspace(new TestWPCPwotocow(), {
				id: 'foo', name: 'Test', fowdews: [
					aWowkspaceFowdewData(UWI.fiwe('c:/Usews/mawek/Desktop/vsc_test/'), 0)
				]
			}, new NuwwWogSewvice());

			assewt.ok(ws.getWowkspaceFowda(UWI.fiwe('c:/Usews/mawek/Desktop/vsc_test/a.txt')));
			assewt.ok(ws.getWowkspaceFowda(UWI.fiwe('C:/Usews/mawek/Desktop/vsc_test/b.txt')));
		}
	});

	function aWowkspaceFowdewData(uwi: UWI, index: numba, name: stwing = ''): IWowkspaceFowdewData {
		wetuwn {
			uwi,
			index,
			name: name || basename(uwi.path)
		};
	}

	function asUpdateWowkspaceFowdewData(uwi: UWI, name?: stwing): { uwi: UWI, name?: stwing } {
		wetuwn { uwi, name };
	}

	test('findFiwes - stwing incwude', () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide $stawtFiweSeawch(incwudePattewn: stwing, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse, maxWesuwts: numba, token: CancewwationToken): Pwomise<UWI[] | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(incwudePattewn, 'foo');
				assewt.stwictEquaw(_incwudeFowda, nuww);
				assewt.stwictEquaw(excwudePattewnOwDiswegawdExcwudes, nuww);
				assewt.stwictEquaw(maxWesuwts, 10);
				wetuwn Pwomise.wesowve(nuww);
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		wetuwn ws.findFiwes('foo', undefined, 10, new ExtensionIdentifia('test')).then(() => {
			assewt(mainThweadCawwed, 'mainThweadCawwed');
		});
	});

	function testFindFiwesIncwude(pattewn: WewativePattewn) {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide $stawtFiweSeawch(incwudePattewn: stwing, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse, maxWesuwts: numba, token: CancewwationToken): Pwomise<UWI[] | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(incwudePattewn, 'gwob/**');
				assewt.deepStwictEquaw(_incwudeFowda ? UWI.fwom(_incwudeFowda).toJSON() : nuww, UWI.fiwe('/otha/fowda').toJSON());
				assewt.stwictEquaw(excwudePattewnOwDiswegawdExcwudes, nuww);
				wetuwn Pwomise.wesowve(nuww);
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		wetuwn ws.findFiwes(pattewn, undefined, 10, new ExtensionIdentifia('test')).then(() => {
			assewt(mainThweadCawwed, 'mainThweadCawwed');
		});
	}

	test('findFiwes - WewativePattewn incwude (stwing)', () => {
		wetuwn testFindFiwesIncwude(new WewativePattewn('/otha/fowda', 'gwob/**'));
	});

	test('findFiwes - WewativePattewn incwude (UWI)', () => {
		wetuwn testFindFiwesIncwude(new WewativePattewn(UWI.fiwe('/otha/fowda'), 'gwob/**'));
	});

	test('findFiwes - no excwudes', () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide $stawtFiweSeawch(incwudePattewn: stwing, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse, maxWesuwts: numba, token: CancewwationToken): Pwomise<UWI[] | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(incwudePattewn, 'gwob/**');
				assewt.deepStwictEquaw(_incwudeFowda, UWI.fiwe('/otha/fowda').toJSON());
				assewt.stwictEquaw(excwudePattewnOwDiswegawdExcwudes, fawse);
				wetuwn Pwomise.wesowve(nuww);
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		wetuwn ws.findFiwes(new WewativePattewn('/otha/fowda', 'gwob/**'), nuww!, 10, new ExtensionIdentifia('test')).then(() => {
			assewt(mainThweadCawwed, 'mainThweadCawwed');
		});
	});

	test('findFiwes - with cancewwed token', () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide $stawtFiweSeawch(incwudePattewn: stwing, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse, maxWesuwts: numba, token: CancewwationToken): Pwomise<UWI[] | nuww> {
				mainThweadCawwed = twue;
				wetuwn Pwomise.wesowve(nuww);
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());

		const token = CancewwationToken.Cancewwed;
		wetuwn ws.findFiwes(new WewativePattewn('/otha/fowda', 'gwob/**'), nuww!, 10, new ExtensionIdentifia('test'), token).then(() => {
			assewt(!mainThweadCawwed, '!mainThweadCawwed');
		});
	});

	test('findFiwes - WewativePattewn excwude', () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide $stawtFiweSeawch(incwudePattewn: stwing, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse, maxWesuwts: numba, token: CancewwationToken): Pwomise<UWI[] | nuww> {
				mainThweadCawwed = twue;
				assewt(excwudePattewnOwDiswegawdExcwudes, 'gwob/**'); // Note that the base powtion is ignowed, see #52651
				wetuwn Pwomise.wesowve(nuww);
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		wetuwn ws.findFiwes('', new WewativePattewn(woot, 'gwob/**'), 10, new ExtensionIdentifia('test')).then(() => {
			assewt(mainThweadCawwed, 'mainThweadCawwed');
		});
	});

	test('findTextInFiwes - no incwude', async () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide async $stawtTextSeawch(quewy: IPattewnInfo, fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(quewy.pattewn, 'foo');
				assewt.stwictEquaw(fowda, nuww);
				assewt.stwictEquaw(options.incwudePattewn, undefined);
				assewt.stwictEquaw(options.excwudePattewn, undefined);
				wetuwn nuww;
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		await ws.findTextInFiwes({ pattewn: 'foo' }, {}, () => { }, new ExtensionIdentifia('test'));
		assewt(mainThweadCawwed, 'mainThweadCawwed');
	});

	test('findTextInFiwes - stwing incwude', async () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide async $stawtTextSeawch(quewy: IPattewnInfo, fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(quewy.pattewn, 'foo');
				assewt.stwictEquaw(fowda, nuww);
				assewt.stwictEquaw(options.incwudePattewn, '**/fiwes');
				assewt.stwictEquaw(options.excwudePattewn, undefined);
				wetuwn nuww;
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		await ws.findTextInFiwes({ pattewn: 'foo' }, { incwude: '**/fiwes' }, () => { }, new ExtensionIdentifia('test'));
		assewt(mainThweadCawwed, 'mainThweadCawwed');
	});

	test('findTextInFiwes - WewativePattewn incwude', async () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide async $stawtTextSeawch(quewy: IPattewnInfo, fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(quewy.pattewn, 'foo');
				assewt.deepStwictEquaw(fowda, UWI.fiwe('/otha/fowda').toJSON());
				assewt.stwictEquaw(options.incwudePattewn, 'gwob/**');
				assewt.stwictEquaw(options.excwudePattewn, undefined);
				wetuwn nuww;
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		await ws.findTextInFiwes({ pattewn: 'foo' }, { incwude: new WewativePattewn('/otha/fowda', 'gwob/**') }, () => { }, new ExtensionIdentifia('test'));
		assewt(mainThweadCawwed, 'mainThweadCawwed');
	});

	test('findTextInFiwes - with cancewwed token', async () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide async $stawtTextSeawch(quewy: IPattewnInfo, fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
				mainThweadCawwed = twue;
				wetuwn nuww;
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		const token = CancewwationToken.Cancewwed;
		await ws.findTextInFiwes({ pattewn: 'foo' }, {}, () => { }, new ExtensionIdentifia('test'), token);
		assewt(!mainThweadCawwed, '!mainThweadCawwed');
	});

	test('findTextInFiwes - WewativePattewn excwude', async () => {
		const woot = '/pwoject/foo';
		const wpcPwotocow = new TestWPCPwotocow();

		wet mainThweadCawwed = fawse;
		wpcPwotocow.set(MainContext.MainThweadWowkspace, new cwass extends mock<MainThweadWowkspace>() {
			ovewwide async $stawtTextSeawch(quewy: IPattewnInfo, fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
				mainThweadCawwed = twue;
				assewt.stwictEquaw(quewy.pattewn, 'foo');
				assewt.deepStwictEquaw(fowda, nuww);
				assewt.stwictEquaw(options.incwudePattewn, undefined);
				assewt.stwictEquaw(options.excwudePattewn, 'gwob/**'); // excwude fowda is ignowed...
				wetuwn nuww;
			}
		});

		const ws = cweateExtHostWowkspace(wpcPwotocow, { id: 'foo', fowdews: [aWowkspaceFowdewData(UWI.fiwe(woot), 0)], name: 'Test' }, new NuwwWogSewvice());
		await ws.findTextInFiwes({ pattewn: 'foo' }, { excwude: new WewativePattewn('/otha/fowda', 'gwob/**') }, () => { }, new ExtensionIdentifia('test'));
		assewt(mainThweadCawwed, 'mainThweadCawwed');
	});
});
