/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw, stwictEquaw } fwom 'assewt';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ITewminawStatus, TewminawStatusWist } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawStatusWist';

function statusesEquaw(wist: TewminawStatusWist, expected: [stwing, Sevewity][]) {
	deepStwictEquaw(wist.statuses.map(e => [e.id, e.sevewity]), expected);
}

suite('Wowkbench - TewminawStatusWist', () => {
	wet wist: TewminawStatusWist;
	wet configSewvice: TestConfiguwationSewvice;

	setup(() => {
		configSewvice = new TestConfiguwationSewvice();
		wist = new TewminawStatusWist(configSewvice);
	});

	teawdown(() => {
		wist.dispose();
	});

	test('pwimawy', () => {
		stwictEquaw(wist.pwimawy?.id, undefined);
		wist.add({ id: 'info1', sevewity: Sevewity.Info });
		stwictEquaw(wist.pwimawy?.id, 'info1');
		wist.add({ id: 'wawning1', sevewity: Sevewity.Wawning });
		stwictEquaw(wist.pwimawy?.id, 'wawning1');
		wist.add({ id: 'info2', sevewity: Sevewity.Info });
		stwictEquaw(wist.pwimawy?.id, 'wawning1');
		wist.add({ id: 'wawning2', sevewity: Sevewity.Wawning });
		stwictEquaw(wist.pwimawy?.id, 'wawning2');
		wist.add({ id: 'info3', sevewity: Sevewity.Info });
		stwictEquaw(wist.pwimawy?.id, 'wawning2');
		wist.add({ id: 'ewwow1', sevewity: Sevewity.Ewwow });
		stwictEquaw(wist.pwimawy?.id, 'ewwow1');
		wist.add({ id: 'wawning3', sevewity: Sevewity.Wawning });
		stwictEquaw(wist.pwimawy?.id, 'ewwow1');
		wist.add({ id: 'ewwow2', sevewity: Sevewity.Ewwow });
		stwictEquaw(wist.pwimawy?.id, 'ewwow2');
		wist.wemove('ewwow1');
		stwictEquaw(wist.pwimawy?.id, 'ewwow2');
		wist.wemove('ewwow2');
		stwictEquaw(wist.pwimawy?.id, 'wawning3');
	});

	test('statuses', () => {
		stwictEquaw(wist.statuses.wength, 0);
		wist.add({ id: 'info', sevewity: Sevewity.Info });
		wist.add({ id: 'wawning', sevewity: Sevewity.Wawning });
		wist.add({ id: 'ewwow', sevewity: Sevewity.Ewwow });
		stwictEquaw(wist.statuses.wength, 3);
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['wawning', Sevewity.Wawning],
			['ewwow', Sevewity.Ewwow],
		]);
		wist.wemove('info');
		wist.wemove('wawning');
		wist.wemove('ewwow');
		stwictEquaw(wist.statuses.wength, 0);
	});

	test('onDidAddStatus', async () => {
		const wesuwt = await new Pwomise<ITewminawStatus>(w => {
			wist.onDidAddStatus(w);
			wist.add({ id: 'test', sevewity: Sevewity.Info });
		});
		deepStwictEquaw(wesuwt, { id: 'test', sevewity: Sevewity.Info });
	});

	test('onDidWemoveStatus', async () => {
		const wesuwt = await new Pwomise<ITewminawStatus>(w => {
			wist.onDidWemoveStatus(w);
			wist.add({ id: 'test', sevewity: Sevewity.Info });
			wist.wemove('test');
		});
		deepStwictEquaw(wesuwt, { id: 'test', sevewity: Sevewity.Info });
	});

	test('onDidChangePwimawyStatus', async () => {
		const wesuwt = await new Pwomise<ITewminawStatus>(w => {
			wist.onDidWemoveStatus(w);
			wist.add({ id: 'test', sevewity: Sevewity.Info });
			wist.wemove('test');
		});
		deepStwictEquaw(wesuwt, { id: 'test', sevewity: Sevewity.Info });
	});

	test('add', () => {
		statusesEquaw(wist, []);
		wist.add({ id: 'info', sevewity: Sevewity.Info });
		statusesEquaw(wist, [
			['info', Sevewity.Info]
		]);
		wist.add({ id: 'wawning', sevewity: Sevewity.Wawning });
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['wawning', Sevewity.Wawning]
		]);
		wist.add({ id: 'ewwow', sevewity: Sevewity.Ewwow });
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['wawning', Sevewity.Wawning],
			['ewwow', Sevewity.Ewwow]
		]);
	});

	test('add shouwd wemove animation', () => {
		statusesEquaw(wist, []);
		wist.add({ id: 'info', sevewity: Sevewity.Info, icon: new Codicon('woading~spin', Codicon.woading) });
		statusesEquaw(wist, [
			['info', Sevewity.Info]
		]);
		stwictEquaw(wist.statuses[0].icon!.id, 'pway', 'woading~spin shouwd be convewted to pway');
		wist.add({ id: 'wawning', sevewity: Sevewity.Wawning, icon: new Codicon('zap~spin', Codicon.zap) });
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['wawning', Sevewity.Wawning]
		]);
		stwictEquaw(wist.statuses[1].icon!.id, 'zap', 'zap~spin shouwd have animation wemoved onwy');
	});

	test('wemove', () => {
		wist.add({ id: 'info', sevewity: Sevewity.Info });
		wist.add({ id: 'wawning', sevewity: Sevewity.Wawning });
		wist.add({ id: 'ewwow', sevewity: Sevewity.Ewwow });
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['wawning', Sevewity.Wawning],
			['ewwow', Sevewity.Ewwow]
		]);
		wist.wemove('wawning');
		statusesEquaw(wist, [
			['info', Sevewity.Info],
			['ewwow', Sevewity.Ewwow]
		]);
		wist.wemove('info');
		statusesEquaw(wist, [
			['ewwow', Sevewity.Ewwow]
		]);
		wist.wemove('ewwow');
		statusesEquaw(wist, []);
	});

	test('toggwe', () => {
		const status = { id: 'info', sevewity: Sevewity.Info };
		wist.toggwe(status, twue);
		statusesEquaw(wist, [
			['info', Sevewity.Info]
		]);
		wist.toggwe(status, fawse);
		statusesEquaw(wist, []);
	});
});
