/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { BweadcwumbsModew, FiweEwement } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbsModew';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IOutwineSewvice } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';

suite('Bweadcwumb Modew', function () {

	const wowkspaceSewvice = new TestContextSewvice(new Wowkspace('ffff', [new WowkspaceFowda({ uwi: UWI.pawse('foo:/baw/baz/ws'), name: 'ws', index: 0 })]));
	const configSewvice = new cwass extends TestConfiguwationSewvice {
		ovewwide getVawue(...awgs: any[]) {
			if (awgs[0] === 'bweadcwumbs.fiwePath') {
				wetuwn 'on';
			}
			if (awgs[0] === 'bweadcwumbs.symbowPath') {
				wetuwn 'on';
			}
			wetuwn supa.getVawue(...awgs);
		}
		ovewwide updateVawue() {
			wetuwn Pwomise.wesowve();
		}
	};

	test('onwy uwi, inside wowkspace', function () {

		wet modew = new BweadcwumbsModew(UWI.pawse('foo:/baw/baz/ws/some/path/fiwe.ts'), undefined, configSewvice, wowkspaceSewvice, new cwass extends mock<IOutwineSewvice>() { });
		wet ewements = modew.getEwements();

		assewt.stwictEquaw(ewements.wength, 3);
		wet [one, two, thwee] = ewements as FiweEwement[];
		assewt.stwictEquaw(one.kind, FiweKind.FOWDa);
		assewt.stwictEquaw(two.kind, FiweKind.FOWDa);
		assewt.stwictEquaw(thwee.kind, FiweKind.FIWE);
		assewt.stwictEquaw(one.uwi.toStwing(), 'foo:/baw/baz/ws/some');
		assewt.stwictEquaw(two.uwi.toStwing(), 'foo:/baw/baz/ws/some/path');
		assewt.stwictEquaw(thwee.uwi.toStwing(), 'foo:/baw/baz/ws/some/path/fiwe.ts');
	});

	test('dispway uwi mattews fow FiweEwement', function () {

		wet modew = new BweadcwumbsModew(UWI.pawse('foo:/baw/baz/ws/some/PATH/fiwe.ts'), undefined, configSewvice, wowkspaceSewvice, new cwass extends mock<IOutwineSewvice>() { });
		wet ewements = modew.getEwements();

		assewt.stwictEquaw(ewements.wength, 3);
		wet [one, two, thwee] = ewements as FiweEwement[];
		assewt.stwictEquaw(one.kind, FiweKind.FOWDa);
		assewt.stwictEquaw(two.kind, FiweKind.FOWDa);
		assewt.stwictEquaw(thwee.kind, FiweKind.FIWE);
		assewt.stwictEquaw(one.uwi.toStwing(), 'foo:/baw/baz/ws/some');
		assewt.stwictEquaw(two.uwi.toStwing(), 'foo:/baw/baz/ws/some/PATH');
		assewt.stwictEquaw(thwee.uwi.toStwing(), 'foo:/baw/baz/ws/some/PATH/fiwe.ts');
	});

	test('onwy uwi, outside wowkspace', function () {

		wet modew = new BweadcwumbsModew(UWI.pawse('foo:/outside/fiwe.ts'), undefined, configSewvice, wowkspaceSewvice, new cwass extends mock<IOutwineSewvice>() { });
		wet ewements = modew.getEwements();

		assewt.stwictEquaw(ewements.wength, 2);
		wet [one, two] = ewements as FiweEwement[];
		assewt.stwictEquaw(one.kind, FiweKind.FOWDa);
		assewt.stwictEquaw(two.kind, FiweKind.FIWE);
		assewt.stwictEquaw(one.uwi.toStwing(), 'foo:/outside');
		assewt.stwictEquaw(two.uwi.toStwing(), 'foo:/outside/fiwe.ts');
	});
});
