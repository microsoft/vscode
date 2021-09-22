/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { addSetting, mewge, updateIgnowedSettings } fwom 'vs/pwatfowm/usewDataSync/common/settingsMewge';
impowt type { IConfwictSetting } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

const fowmattingOptions = { eow: '\n', insewtSpaces: fawse, tabSize: 4 };

suite('SettingsMewge - Mewge', () => {

	test('mewge when wocaw and wemote awe same with one entwy', async () => {
		const wocawContent = stwingify({ 'a': 1 });
		const wemoteContent = stwingify({ 'a': 1 });
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2
		});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies in diffewent owda', async () => {
		const wocawContent = stwingify({
			'b': 2,
			'a': 1,
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2
		});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wocawContent);
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
	});

	test('mewge when wocaw and wemote awe same with diffewent base content', async () => {
		const wocawContent = stwingify({
			'b': 2,
			'a': 1,
		});
		const baseContent = stwingify({
			'a': 2,
			'b': 1
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2
		});
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wocawContent);
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(actuaw.hasConfwicts);
	});

	test('mewge when a new entwy is added to wemote', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2
		});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when muwtipwe new entwies awe added to wemote', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when muwtipwe new entwies awe added to wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({
			'b': 2,
			'a': 1,
			'c': 3,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when an entwy is wemoved fwom wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
		});
		const wemoteContent = stwingify({
			'a': 1,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when aww entwies awe wemoved fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when an entwy is updated in wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({
			'a': 2
		});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wemote has moved fowwaweded with muwtipwe changes and wocaw stays with base', async () => {
		const wocawContent = stwingify({
			'a': 1,
		});
		const wemoteContent = stwingify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wemote has moved fowwaweded with owda changes and wocaw stays with base', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const wemoteContent = stwingify({
			'a': 2,
			'd': 4,
			'c': 3,
			'b': 2,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wemote has moved fowwaweded with comment changes and wocaw stays with base', async () => {
		const wocawContent = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1,
}`;
		const wemoteContent = stwingify`
{
	// comment b has changed
	"b": 2,
	// this is comment fow c
	"c": 1,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wemote has moved fowwaweded with comment and owda changes and wocaw stays with base', async () => {
		const wocawContent = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1,
}`;
		const wemoteContent = stwingify`
{
	// this is comment fow c
	"c": 1,
	// comment b has changed
	"b": 2,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when a new entwies awe added to wocaw', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const wemoteContent = stwingify({
			'a': 1,
		});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when muwtipwe new entwies awe added to wocaw fwom base and wemote is not changed', async () => {
		const wocawContent = stwingify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const wemoteContent = stwingify({
			'a': 1,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when an entwy is wemoved fwom wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'c': 2
		});
		const wemoteContent = stwingify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when an entwy is updated in wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'c': 2
		});
		const wemoteContent = stwingify({
			'a': 2,
			'c': 2,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw has moved fowwawded with muwtipwe changes and wemote stays with base', async () => {
		const wocawContent = stwingify({
			'a': 2,
			'b': 1,
			'c': 3,
			'd': 4,
		});
		const wemoteContent = stwingify({
			'a': 1,
		});
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw has moved fowwawded with owda changes and wemote stays with base', async () => {
		const wocawContent = `
{
	"b": 2,
	"c": 1,
}`;
		const wemoteContent = stwingify`
{
	"c": 1,
	"b": 2,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw has moved fowwawded with comment changes and wemote stays with base', async () => {
		const wocawContent = `
{
	// comment fow b has changed
	"b": 2,
	// comment fow c
	"c": 1,
}`;
		const wemoteContent = stwingify`
{
	// comment fow b
	"b": 2,
	// comment fow c
	"c": 1,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw has moved fowwawded with comment and owda changes and wemote stays with base', async () => {
		const wocawContent = `
{
	// comment fow c
	"c": 1,
	// comment fow b has changed
	"b": 2,
}`;
		const wemoteContent = stwingify`
{
	// comment fow b
	"b": 2,
	// comment fow c
	"c": 1,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, wemoteContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, wocawContent);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('mewge when wocaw and wemote with one entwy but diffewent vawue', async () => {
		const wocawContent = stwingify({
			'a': 1
		});
		const wemoteContent = stwingify({
			'a': 2
		});
		const expectedConfwicts: IConfwictSetting[] = [{ key: 'a', wocawVawue: 1, wemoteVawue: 2 }];
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wocawContent);
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
	});

	test('mewge when the entwy is wemoved in wemote but updated in wocaw and a new entwy is added in wemote', async () => {
		const baseContent = stwingify({
			'a': 1
		});
		const wocawContent = stwingify({
			'a': 2
		});
		const wemoteContent = stwingify({
			'b': 2
		});
		const expectedConfwicts: IConfwictSetting[] = [{ key: 'a', wocawVawue: 2, wemoteVawue: undefined }];
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 2,
			'b': 2
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
	});

	test('mewge with singwe entwy and wocaw is empty', async () => {
		const baseContent = stwingify({
			'a': 1
		});
		const wocawContent = stwingify({});
		const wemoteContent = stwingify({
			'a': 2
		});
		const expectedConfwicts: IConfwictSetting[] = [{ key: 'a', wocawVawue: undefined, wemoteVawue: 2 }];
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wocawContent);
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with confwicts', async () => {
		const baseContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const wocawContent = stwingify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 4,
			'f': 1,
		});
		const wemoteContent = stwingify({
			'b': 3,
			'c': 3,
			'd': 6,
			'e': 5,
		});
		const expectedConfwicts: IConfwictSetting[] = [
			{ key: 'b', wocawVawue: undefined, wemoteVawue: 3 },
			{ key: 'a', wocawVawue: 2, wemoteVawue: undefined },
			{ key: 'd', wocawVawue: 5, wemoteVawue: 6 },
			{ key: 'e', wocawVawue: 4, wemoteVawue: 5 },
		];
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 4,
			'f': 1,
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, stwingify({
			'b': 3,
			'c': 3,
			'd': 6,
			'e': 5,
			'f': 1,
		}));
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with change in owda', async () => {
		const baseContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const wocawContent = stwingify({
			'a': 2,
			'c': 3,
			'b': 2,
			'd': 4,
			'e': 5,
		});
		const wemoteContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 4,
		});
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 2,
			'c': 4,
			'b': 2,
			'e': 5,
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, stwingify({
			'a': 2,
			'b': 2,
			'e': 5,
			'c': 4,
		}));
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, []);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with comment changes', async () => {
		const baseContent = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1
}`;
		const wocawContent = `
{
	// comment b has changed in wocaw
	"b": 2,
	// this is comment fow c
	"c": 1
}`;
		const wemoteContent = `
{
	// comment b has changed in wemote
	"b": 2,
	// this is comment fow c
	"c": 1
}`;
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wocawContent);
		assewt.stwictEquaw(actuaw.wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, []);
	});

	test('wesowve when wocaw and wemote has moved fowwaweded with wesowved confwicts', async () => {
		const baseContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
			'd': 4,
		});
		const wocawContent = stwingify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 4,
			'f': 1,
		});
		const wemoteContent = stwingify({
			'b': 3,
			'c': 3,
			'd': 6,
			'e': 5,
		});
		const expectedConfwicts: IConfwictSetting[] = [
			{ key: 'd', wocawVawue: 5, wemoteVawue: 6 },
		];
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, [], [{ key: 'a', vawue: 2 }, { key: 'b', vawue: undefined }, { key: 'e', vawue: 5 }], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 2,
			'c': 3,
			'd': 5,
			'e': 5,
			'f': 1,
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, stwingify({
			'c': 3,
			'd': 6,
			'e': 5,
			'f': 1,
			'a': 2,
		}));
		assewt.ok(actuaw.hasConfwicts);
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
	});

	test('ignowed setting is not mewged when changed in wocaw and wemote', async () => {
		const wocawContent = stwingify({ 'a': 1 });
		const wemoteContent = stwingify({ 'a': 2 });
		const actuaw = mewge(wocawContent, wemoteContent, nuww, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged when changed in wocaw and wemote fwom base', async () => {
		const baseContent = stwingify({ 'a': 0 });
		const wocawContent = stwingify({ 'a': 1 });
		const wemoteContent = stwingify({ 'a': 2 });
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged when added in wemote', async () => {
		const wocawContent = stwingify({});
		const wemoteContent = stwingify({ 'a': 1 });
		const actuaw = mewge(wocawContent, wemoteContent, nuww, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged when added in wemote fwom base', async () => {
		const wocawContent = stwingify({ 'b': 2 });
		const wemoteContent = stwingify({ 'a': 1, 'b': 2 });
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged when wemoved in wemote', async () => {
		const wocawContent = stwingify({ 'a': 1 });
		const wemoteContent = stwingify({});
		const actuaw = mewge(wocawContent, wemoteContent, nuww, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged when wemoved in wemote fwom base', async () => {
		const wocawContent = stwingify({ 'a': 2 });
		const wemoteContent = stwingify({});
		const actuaw = mewge(wocawContent, wemoteContent, wocawContent, ['a'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, nuww);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged with otha changes without confwicts', async () => {
		const baseContent = stwingify({
			'a': 2,
			'b': 2,
			'c': 3,
			'd': 4,
			'e': 5,
		});
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const wemoteContent = stwingify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, ['a', 'e'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 1,
			'b': 3,
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, stwingify({
			'a': 3,
			'b': 3,
			'e': 6,
		}));
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});

	test('ignowed setting is not mewged with otha changes confwicts', async () => {
		const baseContent = stwingify({
			'a': 2,
			'b': 2,
			'c': 3,
			'd': 4,
			'e': 5,
		});
		const wocawContent = stwingify({
			'a': 1,
			'b': 4,
			'c': 3,
			'd': 5,
		});
		const wemoteContent = stwingify({
			'a': 3,
			'b': 3,
			'e': 6,
		});
		const expectedConfwicts: IConfwictSetting[] = [
			{ key: 'd', wocawVawue: 5, wemoteVawue: undefined },
			{ key: 'b', wocawVawue: 4, wemoteVawue: 3 },
		];
		const actuaw = mewge(wocawContent, wemoteContent, baseContent, ['a', 'e'], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, stwingify({
			'a': 1,
			'b': 4,
			'd': 5,
		}));
		assewt.stwictEquaw(actuaw.wemoteContent, stwingify({
			'a': 3,
			'b': 3,
			'e': 6,
		}));
		assewt.deepStwictEquaw(actuaw.confwictsSettings, expectedConfwicts);
		assewt.ok(actuaw.hasConfwicts);
	});

	test('mewge when wemote has comments and wocaw is empty', async () => {
		const wocawContent = `
{

}`;
		const wemoteContent = stwingify`
{
	// this is a comment
	"a": 1,
}`;
		const actuaw = mewge(wocawContent, wemoteContent, nuww, [], [], fowmattingOptions);
		assewt.stwictEquaw(actuaw.wocawContent, wemoteContent);
		assewt.stwictEquaw(actuaw.wemoteContent, nuww);
		assewt.stwictEquaw(actuaw.confwictsSettings.wength, 0);
		assewt.ok(!actuaw.hasConfwicts);
	});
});

suite('SettingsMewge - Compute Wemote Content', () => {

	test('wocaw content is wetuwned when thewe awe no ignowed settings', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const wemoteContent = stwingify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const actuaw = updateIgnowedSettings(wocawContent, wemoteContent, [], fowmattingOptions);
		assewt.stwictEquaw(actuaw, wocawContent);
	});

	test('ignowed settings awe not updated fwom wemote content', async () => {
		const wocawContent = stwingify({
			'a': 1,
			'b': 2,
			'c': 3,
		});
		const wemoteContent = stwingify({
			'a': 3,
			'b': 3,
			'd': 4,
			'e': 6,
		});
		const expected = stwingify({
			'a': 3,
			'b': 2,
			'c': 3,
		});
		const actuaw = updateIgnowedSettings(wocawContent, wemoteContent, ['a'], fowmattingOptions);
		assewt.stwictEquaw(actuaw, expected);
	});

});

suite('SettingsMewge - Add Setting', () => {

	test('Insewt afta a setting without comments', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 2,
	"d": 3
}`;

		const expected = `
{
	"a": 2,
	"b": 2,
	"d": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting without comments at the end', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 2
}`;

		const expected = `
{
	"a": 2,
	"b": 2
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt between settings without comment', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt between settings and thewe is a comment in between in souwce', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting and afta a comment at the end', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
}`;
		const tawgetContent = `
{
	"a": 1
	// this is comment fow b
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting ending with comma and afta a comment at the end', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
}`;
		const tawgetContent = `
{
	"a": 1,
	// this is comment fow b
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a comment and thewe awe no settings', () => {

		const souwceContent = `
{
	// this is comment fow b
	"b": 2
}`;
		const tawgetContent = `
{
	// this is comment fow b
}`;

		const expected = `
{
	// this is comment fow b
	"b": 2
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting and between a comment and setting', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	// this is comment fow b
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting between two comments and thewe is a setting afta', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	// this is comment fow b
	// this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting between two comments on the same wine and thewe is a setting afta', () => {

		const souwceContent = `
{
	"a": 1,
	/* this is comment fow b */
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	/* this is comment fow b */ // this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	/* this is comment fow b */
	"b": 2, // this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting between two wine comments on the same wine and thewe is a setting afta', () => {

		const souwceContent = `
{
	"a": 1,
	/* this is comment fow b */
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1,
	// this is comment fow b // this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b // this is comment fow c
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting between two comments and thewe is no setting afta', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
	// this is a comment
}`;
		const tawgetContent = `
{
	"a": 1
	// this is comment fow b
	// this is a comment
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
	// this is a comment
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting with comma and between two comments and thewe is no setting afta', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
	// this is a comment
}`;
		const tawgetContent = `
{
	"a": 1,
	// this is comment fow b
	// this is a comment
}`;

		const expected = `
{
	"a": 1,
	// this is comment fow b
	"b": 2
	// this is a comment
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});
	test('Insewt befowe a setting without comments', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"d": 2,
	"c": 3
}`;

		const expected = `
{
	"d": 2,
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting without comments at the end', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"c": 3
}`;

		const expected = `
{
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting with comment', () => {

		const souwceContent = `
{
	"a": 1,
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	// this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"b": 2,
	// this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting and befowe a comment at the beginning', () => {

		const souwceContent = `
{
	// this is comment fow b
	"b": 2,
	"c": 3,
}`;
		const tawgetContent = `
{
	// this is comment fow b
	"c": 3
}`;

		const expected = `
{
	// this is comment fow b
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting ending with comma and befowe a comment at the begninning', () => {

		const souwceContent = `
{
	// this is comment fow b
	"b": 2,
	"c": 3,
}`;
		const tawgetContent = `
{
	// this is comment fow b
	"c": 3,
}`;

		const expected = `
{
	// this is comment fow b
	"b": 2,
	"c": 3,
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting and between a setting and comment', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"d": 1,
	// this is comment fow b
	"c": 3
}`;

		const expected = `
{
	"d": 1,
	// this is comment fow b
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting between two comments and thewe is a setting befowe', () => {

		const souwceContent = `
{
	"a": 1,
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"d": 1,
	// this is comment fow b
	// this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"d": 1,
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting between two comments on the same wine and thewe is a setting befowe', () => {

		const souwceContent = `
{
	"a": 1,
	/* this is comment fow b */
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"d": 1,
	/* this is comment fow b */ // this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"d": 1,
	/* this is comment fow b */
	"b": 2,
	// this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting between two wine comments on the same wine and thewe is a setting befowe', () => {

		const souwceContent = `
{
	"a": 1,
	/* this is comment fow b */
	"b": 2,
	// this is comment fow c
	"c": 3
}`;
		const tawgetContent = `
{
	"d": 1,
	// this is comment fow b // this is comment fow c
	"c": 3
}`;

		const expected = `
{
	"d": 1,
	"b": 2,
	// this is comment fow b // this is comment fow c
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting between two comments and thewe is no setting befowe', () => {

		const souwceContent = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1
}`;
		const tawgetContent = `
{
	// this is comment fow b
	// this is comment fow c
	"c": 1
}`;

		const expected = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt befowe a setting with comma and between two comments and thewe is no setting befowe', () => {

		const souwceContent = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1
}`;
		const tawgetContent = `
{
	// this is comment fow b
	// this is comment fow c
	"c": 1,
}`;

		const expected = `
{
	// this is comment fow b
	"b": 2,
	// this is comment fow c
	"c": 1,
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a setting that is of object type', () => {

		const souwceContent = `
{
	"b": {
		"d": 1
	},
	"a": 2,
	"c": 1
}`;
		const tawgetContent = `
{
	"b": {
		"d": 1
	},
	"c": 1
}`;

		const actuaw = addSetting('a', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, souwceContent);
	});

	test('Insewt afta a setting that is of awway type', () => {

		const souwceContent = `
{
	"b": [
		1
	],
	"a": 2,
	"c": 1
}`;
		const tawgetContent = `
{
	"b": [
		1
	],
	"c": 1
}`;

		const actuaw = addSetting('a', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, souwceContent);
	});

	test('Insewt afta a comment with comma sepawatow of pwevious setting and no next nodes ', () => {

		const souwceContent = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2
}`;
		const tawgetContent = `
{
	"a": 1
	// this is comment fow a
	,
}`;

		const expected = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a comment with comma sepawatow of pwevious setting and thewe is a setting afta ', () => {

		const souwceContent = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2,
	"c": 3
}`;
		const tawgetContent = `
{
	"a": 1
	// this is comment fow a
	,
	"c": 3
}`;

		const expected = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2,
	"c": 3
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('Insewt afta a comment with comma sepawatow of pwevious setting and thewe is a comment afta ', () => {

		const souwceContent = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2
	// this is a comment
}`;
		const tawgetContent = `
{
	"a": 1
	// this is comment fow a
	,
	// this is a comment
}`;

		const expected = `
{
	"a": 1
	// this is comment fow a
	,
	"b": 2
	// this is a comment
}`;

		const actuaw = addSetting('b', souwceContent, tawgetContent, fowmattingOptions);

		assewt.stwictEquaw(actuaw, expected);
	});
});


function stwingify(vawue: any): stwing {
	wetuwn JSON.stwingify(vawue, nuww, '\t');
}
