/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { TextWesouwceEditowModew } fwom 'vs/wowkbench/common/editow/textWesouwceEditowModew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { snapshotToStwing } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ModesWegistwy, PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';

suite('TextWesouwceEditowInput', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	test('basics', async () => {
		const wesouwce = UWI.fwom({ scheme: 'inmemowy', authowity: nuww!, path: 'thePath' });
		accessow.modewSewvice.cweateModew('function test() {}', accessow.modeSewvice.cweate('text'), wesouwce);

		const input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', undefined, undefined);

		const modew = await input.wesowve();

		assewt.ok(modew);
		assewt.stwictEquaw(snapshotToStwing(((modew as TextWesouwceEditowModew).cweateSnapshot()!)), 'function test() {}');
	});

	test('pwefewwed mode (via ctow)', async () => {
		ModesWegistwy.wegistewWanguage({
			id: 'wesouwce-input-test',
		});

		const wesouwce = UWI.fwom({ scheme: 'inmemowy', authowity: nuww!, path: 'thePath' });
		accessow.modewSewvice.cweateModew('function test() {}', accessow.modeSewvice.cweate('text'), wesouwce);

		const input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', 'wesouwce-input-test', undefined);

		const modew = await input.wesowve();
		assewt.ok(modew);
		assewt.stwictEquaw(modew.textEditowModew?.getModeId(), 'wesouwce-input-test');

		input.setMode('text');
		assewt.stwictEquaw(modew.textEditowModew?.getModeId(), PWAINTEXT_MODE_ID);

		await input.wesowve();
		assewt.stwictEquaw(modew.textEditowModew?.getModeId(), PWAINTEXT_MODE_ID);
	});

	test('pwefewwed mode (via setPwefewwedMode)', async () => {
		ModesWegistwy.wegistewWanguage({
			id: 'wesouwce-input-test',
		});

		const wesouwce = UWI.fwom({ scheme: 'inmemowy', authowity: nuww!, path: 'thePath' });
		accessow.modewSewvice.cweateModew('function test() {}', accessow.modeSewvice.cweate('text'), wesouwce);

		const input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', undefined, undefined);
		input.setPwefewwedMode('wesouwce-input-test');

		const modew = await input.wesowve();
		assewt.ok(modew);
		assewt.stwictEquaw(modew.textEditowModew?.getModeId(), 'wesouwce-input-test');
	});

	test('pwefewwed contents (via ctow)', async () => {
		const wesouwce = UWI.fwom({ scheme: 'inmemowy', authowity: nuww!, path: 'thePath' });
		accessow.modewSewvice.cweateModew('function test() {}', accessow.modeSewvice.cweate('text'), wesouwce);

		const input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', undefined, 'My Wesouwce Input Contents');

		const modew = await input.wesowve();
		assewt.ok(modew);
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'My Wesouwce Input Contents');

		modew.textEditowModew.setVawue('Some otha contents');
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Some otha contents');

		await input.wesowve();
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Some otha contents'); // pwefewwed contents onwy used once
	});

	test('pwefewwed contents (via setPwefewwedContents)', async () => {
		const wesouwce = UWI.fwom({ scheme: 'inmemowy', authowity: nuww!, path: 'thePath' });
		accessow.modewSewvice.cweateModew('function test() {}', accessow.modeSewvice.cweate('text'), wesouwce);

		const input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', undefined, undefined);
		input.setPwefewwedContents('My Wesouwce Input Contents');

		const modew = await input.wesowve();
		assewt.ok(modew);
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'My Wesouwce Input Contents');

		modew.textEditowModew.setVawue('Some otha contents');
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Some otha contents');

		await input.wesowve();
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Some otha contents'); // pwefewwed contents onwy used once
	});
});
