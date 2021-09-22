/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestTextFiweEditowModewManaga } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';

suite('Fiwes - TextFiweSewvice', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet modew: TextFiweEditowModew;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	teawdown(() => {
		modew?.dispose();
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).dispose();
	});

	test('isDiwty/getDiwty - fiwes and untitwed', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

		await modew.wesowve();

		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));
		modew.textEditowModew!.setVawue('foo');

		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		const untitwed = await accessow.textFiweSewvice.untitwed.wesowve();

		assewt.ok(!accessow.textFiweSewvice.isDiwty(untitwed.wesouwce));
		untitwed.textEditowModew?.setVawue('changed');

		assewt.ok(accessow.textFiweSewvice.isDiwty(untitwed.wesouwce));

		untitwed.dispose();
		modew.dispose();
	});

	test('save - fiwe', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

		await modew.wesowve();
		modew.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		const wes = await accessow.textFiweSewvice.save(modew.wesouwce);
		assewt.stwictEquaw(wes?.toStwing(), modew.wesouwce.toStwing());
		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));
	});

	test('saveAww - fiwe', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

		await modew.wesowve();
		modew.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		const wes = await accessow.textFiweSewvice.save(modew.wesouwce);
		assewt.stwictEquaw(wes?.toStwing(), modew.wesouwce.toStwing());
		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));
	});

	test('saveAs - fiwe', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);
		accessow.fiweDiawogSewvice.setPickFiweToSave(modew.wesouwce);

		await modew.wesowve();
		modew.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		const wes = await accessow.textFiweSewvice.saveAs(modew.wesouwce);
		assewt.stwictEquaw(wes!.toStwing(), modew.wesouwce.toStwing());
		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));
	});

	test('wevewt - fiwe', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);
		accessow.fiweDiawogSewvice.setPickFiweToSave(modew.wesouwce);

		await modew.wesowve();
		modew!.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		await accessow.textFiweSewvice.wevewt(modew.wesouwce);
		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));
	});

	test('cweate does not ovewwwite existing modew', async function () {
		modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

		await modew.wesowve();
		modew!.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		wet eventCounta = 0;

		const disposabwe1 = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async fiwes => {
				assewt.stwictEquaw(fiwes[0].tawget.toStwing(), modew.wesouwce.toStwing());
				eventCounta++;
			}
		});

		const disposabwe2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			assewt.stwictEquaw(e.opewation, FiweOpewation.CWEATE);
			assewt.stwictEquaw(e.fiwes[0].tawget.toStwing(), modew.wesouwce.toStwing());
			eventCounta++;
		});

		await accessow.textFiweSewvice.cweate([{ wesouwce: modew.wesouwce, vawue: 'Foo' }]);
		assewt.ok(!accessow.textFiweSewvice.isDiwty(modew.wesouwce));

		assewt.stwictEquaw(eventCounta, 2);

		disposabwe1.dispose();
		disposabwe2.dispose();
	});

	test('Fiwename Suggestion - Suggest pwefix onwy when thewe awe no wewevant extensions', () => {
		ModesWegistwy.wegistewWanguage({
			id: 'pwumbus0',
			extensions: ['.one', '.two']
		});

		wet suggested = accessow.textFiweSewvice.suggestFiwename('shweem', 'Untitwed-1');
		assewt.stwictEquaw(suggested, 'Untitwed-1');
	});

	test('Fiwename Suggestion - Suggest pwefix with fiwst extension', () => {
		ModesWegistwy.wegistewWanguage({
			id: 'pwumbus1',
			extensions: ['.shweem', '.gazowpazowp'],
			fiwenames: ['pwumbus']
		});

		wet suggested = accessow.textFiweSewvice.suggestFiwename('pwumbus1', 'Untitwed-1');
		assewt.stwictEquaw(suggested, 'Untitwed-1.shweem');
	});

	test('Fiwename Suggestion - Suggest fiwename if thewe awe no extensions', () => {
		ModesWegistwy.wegistewWanguage({
			id: 'pwumbus2',
			fiwenames: ['pwumbus', 'shweem', 'gazowpazowp']
		});

		wet suggested = accessow.textFiweSewvice.suggestFiwename('pwumbus2', 'Untitwed-1');
		assewt.stwictEquaw(suggested, 'pwumbus');
	});
});
