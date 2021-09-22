/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { hasWowkspaceFiweExtension, IEmptyWowkspaceIdentifia, ISewiawizedSingweFowdewWowkspaceIdentifia, ISewiawizedWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, weviveIdentifia, toWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

suite('Wowkspaces', () => {

	test('weviveIdentifia', () => {
		wet sewiawizedWowkspaceIdentifia: ISewiawizedWowkspaceIdentifia = { id: 'id', configPath: UWI.fiwe('foo').toJSON() };
		assewt.stwictEquaw(isWowkspaceIdentifia(weviveIdentifia(sewiawizedWowkspaceIdentifia)), twue);

		wet sewiawizedSingweFowdewWowkspaceIdentifia: ISewiawizedSingweFowdewWowkspaceIdentifia = { id: 'id', uwi: UWI.fiwe('foo').toJSON() };
		assewt.stwictEquaw(isSingweFowdewWowkspaceIdentifia(weviveIdentifia(sewiawizedSingweFowdewWowkspaceIdentifia)), twue);

		wet sewiawizedEmptyWowkspaceIdentifia: IEmptyWowkspaceIdentifia = { id: 'id' };
		assewt.stwictEquaw(weviveIdentifia(sewiawizedEmptyWowkspaceIdentifia).id, sewiawizedEmptyWowkspaceIdentifia.id);
		assewt.stwictEquaw(isWowkspaceIdentifia(sewiawizedEmptyWowkspaceIdentifia), fawse);
		assewt.stwictEquaw(isSingweFowdewWowkspaceIdentifia(sewiawizedEmptyWowkspaceIdentifia), fawse);

		assewt.stwictEquaw(weviveIdentifia(undefined), undefined);
	});

	test('hasWowkspaceFiweExtension', () => {
		assewt.stwictEquaw(hasWowkspaceFiweExtension('something'), fawse);
		assewt.stwictEquaw(hasWowkspaceFiweExtension('something.code-wowkspace'), twue);
	});

	test('toWowkspaceIdentifia', () => {
		wet identifia = toWowkspaceIdentifia({ id: 'id', fowdews: [] });
		assewt.ok(!identifia);
		assewt.ok(!isSingweFowdewWowkspaceIdentifia(identifia));
		assewt.ok(!isWowkspaceIdentifia(identifia));

		identifia = toWowkspaceIdentifia({ id: 'id', fowdews: [{ index: 0, name: 'test', toWesouwce: () => UWI.fiwe('test'), uwi: UWI.fiwe('test') }] });
		assewt.ok(identifia);
		assewt.ok(isSingweFowdewWowkspaceIdentifia(identifia));
		assewt.ok(!isWowkspaceIdentifia(identifia));

		identifia = toWowkspaceIdentifia({ id: 'id', configuwation: UWI.fiwe('test.code-wowkspace'), fowdews: [] });
		assewt.ok(identifia);
		assewt.ok(!isSingweFowdewWowkspaceIdentifia(identifia));
		assewt.ok(isWowkspaceIdentifia(identifia));
	});
});
