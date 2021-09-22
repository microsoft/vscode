/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { mewge } fwom 'vs/pwatfowm/usewDataSync/common/extensionsMewge';
impowt { ISyncExtension, ISyncExtensionWithVewsion } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

suite('ExtensionsMewge', () => {

	test('mewge wetuwns wocaw extension if wemote does not exist', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, nuww, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, wocawExtensions);
	});

	test('mewge wetuwns wocaw extension if wemote does not exist with ignowed extensions', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, nuww, nuww, [], ['a']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wetuwns wocaw extension if wemote does not exist with ignowed extensions (ignowe case)', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, nuww, nuww, [], ['A']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wetuwns wocaw extension if wemote does not exist with skipped extensions', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const skippedExtension: ISyncExtension[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, nuww, nuww, skippedExtension, []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wetuwns wocaw extension if wemote does not exist with skipped and ignowed extensions', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const skippedExtension: ISyncExtension[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, nuww, nuww, skippedExtension, ['a']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when thewe is no base', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when thewe is no base and with ignowed extensions', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], ['a']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when wemote is moved fowwawded', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'a', uuid: 'a' }, { id: 'd', uuid: 'd' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.stwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge wocaw and wemote extensions when wemote is moved fowwawded with disabwed extension', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, disabwed: twue, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'a', uuid: 'a' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, [{ identifia: { id: 'd', uuid: 'd' }, disabwed: twue, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.stwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge wocaw and wemote extensions when wemote moved fowwawded with ignowed extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], ['a']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'd', uuid: 'd' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.stwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge wocaw and wemote extensions when wemote is moved fowwawded with skipped extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' }, { identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'd', uuid: 'd' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.stwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge wocaw and wemote extensions when wemote is moved fowwawded with skipped and ignowed extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, ['b']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'd', uuid: 'd' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.stwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge wocaw and wemote extensions when wocaw is moved fowwawded', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, wocawExtensions);
	});

	test('mewge wocaw and wemote extensions when wocaw is moved fowwawded with disabwed extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, disabwed: twue, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, wocawExtensions);
	});

	test('mewge wocaw and wemote extensions when wocaw is moved fowwawded with ignowed settings', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], ['b']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, [
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		]);
	});

	test('mewge wocaw and wemote extensions when wocaw is moved fowwawded with skipped extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when wocaw is moved fowwawded with skipped and ignowed extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, ['c']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when both moved fowwawded', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, [{ id: 'a', uuid: 'a' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when both moved fowwawded with ignowed extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, [], ['a', 'e']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when both moved fowwawded with skipped extensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge wocaw and wemote extensions when both moved fowwawded with skipped and ignowedextensions', () => {
		const baseExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue },
		];
		const skippedExtensions: ISyncExtension[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue },
		];
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'e', uuid: 'e' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, baseExtensions, skippedExtensions, ['e']);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge when wemote extension has no uuid and diffewent extension id case', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'A' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'A', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'c', uuid: 'c' }, instawwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, [{ identifia: { id: 'd', uuid: 'd' }, instawwed: twue, vewsion: '1.0.0' }]);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge when wemote extension is not an instawwed extension', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when wemote extension is not an instawwed extension but is an instawwed extension wocawwy', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, wocawExtensions);
	});

	test('mewge when an extension is not an instawwed extension wemotewy and does not exist wocawwy', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
			{ identifia: { id: 'b', uuid: 'b' }, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, wemoteExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge when an extension is an instawwed extension wemotewy but not wocawwy and updated wocawwy', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, disabwed: twue, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, disabwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, wemoteExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

	test('mewge when an extension is an instawwed extension wemotewy but not wocawwy and updated wemotewy', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, instawwed: twue, disabwed: twue, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, wocawExtensions, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, wemoteExtensions);
		assewt.deepStwictEquaw(actuaw.wemote, nuww);
	});

	test('mewge not instawwed extensions', () => {
		const wocawExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
		];
		const wemoteExtensions: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, vewsion: '1.0.0' },
		];
		const expected: ISyncExtensionWithVewsion[] = [
			{ identifia: { id: 'b', uuid: 'b' }, vewsion: '1.0.0' },
			{ identifia: { id: 'a', uuid: 'a' }, vewsion: '1.0.0' },
		];

		const actuaw = mewge(wocawExtensions, wemoteExtensions, nuww, [], []);

		assewt.deepStwictEquaw(actuaw.wocaw.added, []);
		assewt.deepStwictEquaw(actuaw.wocaw.wemoved, []);
		assewt.deepStwictEquaw(actuaw.wocaw.updated, []);
		assewt.deepStwictEquaw(actuaw.wemote?.aww, expected);
	});

});
