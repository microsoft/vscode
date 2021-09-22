/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { mewge } fwom 'vs/pwatfowm/usewDataSync/common/gwobawStateMewge';

suite('GwobawStateMewge', () => {

	test('mewge when wocaw and wemote awe same with one vawue and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies in diffewent owda and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when wocaw and wemote awe same with diffewent base content', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };
		const base = { 'b': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when a new entwy is added to wemote and wocaw has not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'b': { vewsion: 1, vawue: 'b' } });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when muwtipwe new entwies awe added to wemote and wocaw is not synced yet', async () => {
		const wocaw = {};
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when new entwy is added to wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'b': { vewsion: 1, vawue: 'b' } });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when an entwy is wemoved fwom wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['b']);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when aww entwies awe wemoved fwom base and wocaw has not changed', async () => {
		const wocaw = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = {};

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['b', 'a']);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when an entwy is updated in wemote fwom base and wocaw has not changed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, { 'a': { vewsion: 1, vawue: 'b' } });
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when wemote has moved fowwawded with muwtipwe changes and wocaw stays with base', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'd' }, 'c': { vewsion: 1, vawue: 'c' } };

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'c': { vewsion: 1, vawue: 'c' } });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, { 'a': { vewsion: 1, vawue: 'd' } });
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, ['b']);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when new entwies awe added to wocaw and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when muwtipwe new entwies awe added to wocaw fwom base and wemote is not changed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' }, 'c': { vewsion: 1, vawue: 'c' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, wemote, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when an entwy is wemoved fwom wocaw fwom base and wemote has not changed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, wemote, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when an entwy is updated in wocaw fwom base and wemote has not changed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, wemote, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when wocaw has moved fowwawded with muwtipwe changes and wemote stays with base', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'd' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'c': { vewsion: 1, vawue: 'c' } };

		const actuaw = mewge(wocaw, wemote, wemote, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when wocaw and wemote with one entwy but diffewent vawue and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, { 'a': { vewsion: 1, vawue: 'b' } });
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when the entwy is wemoved in wemote but updated in wocaw and a new entwy is added in wemote', async () => {
		const base = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'd' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'c': { vewsion: 1, vawue: 'c' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, { 'c': { vewsion: 1, vawue: 'c' } });
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, { 'a': { vewsion: 1, vawue: 'a' }, 'c': { vewsion: 1, vawue: 'c' }, 'b': { vewsion: 1, vawue: 'd' } });
	});

	test('mewge with singwe entwy and wocaw is empty', async () => {
		const base = { 'a': { vewsion: 1, vawue: 'a' } };
		const wocaw = {};
		const wemote = { 'a': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when wocaw and wemote has moved fowwawd with confwicts', async () => {
		const base = { 'a': { vewsion: 1, vawue: 'a' } };
		const wocaw = { 'a': { vewsion: 1, vawue: 'd' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: [], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when a new entwy is added to wemote but scoped to machine wocawwy and wocaw is not synced yet', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, nuww, { machine: ['b'], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when an entwy is updated to wemote but scoped to machine wocawwy', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'b' } };

		const actuaw = mewge(wocaw, wemote, wocaw, { machine: ['a'], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when a wocaw vawue is wemoved and scoped to machine wocawwy', async () => {
		const base = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };
		const wemote = { 'b': { vewsion: 1, vawue: 'b' }, 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: ['b'], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge when wocaw moved fowwawed by changing a key to machine scope', async () => {
		const base = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: ['b'], unwegistewed: [] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, wocaw);
	});

	test('mewge shouwd not wemove wemote keys if not wegistewed', async () => {
		const wocaw = { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' } };
		const base = { 'a': { vewsion: 1, vawue: 'a' }, 'c': { vewsion: 1, vawue: 'c' } };
		const wemote = { 'a': { vewsion: 1, vawue: 'a' }, 'c': { vewsion: 1, vawue: 'c' } };

		const actuaw = mewge(wocaw, wemote, base, { machine: [], unwegistewed: ['c'] }, new NuwwWogSewvice());

		assewt.deepStwictEquaw(actuaw.wocaw.added, {});
		assewt.deepStwictEquaw(actuaw.wocaw.updated, {});
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wemote, { 'a': { vewsion: 1, vawue: 'a' }, 'b': { vewsion: 1, vawue: 'b' }, 'c': { vewsion: 1, vawue: 'c' } });
	});

});
