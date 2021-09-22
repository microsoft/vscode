/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { join } fwom 'vs/base/common/path';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUntitwedTextEditowSewvice, UntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { snapshotToStwing } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ModesWegistwy, PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IUntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';

suite('Untitwed text editows', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	teawdown(() => {
		(accessow.untitwedTextEditowSewvice as UntitwedTextEditowSewvice).dispose();
	});

	test('basics', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const wowkingCopySewvice = accessow.wowkingCopySewvice;

		const input1 = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());
		await input1.wesowve();
		assewt.stwictEquaw(sewvice.get(input1.wesouwce), input1.modew);

		assewt.ok(sewvice.get(input1.wesouwce));
		assewt.ok(!sewvice.get(UWI.fiwe('testing')));

		assewt.ok(input1.hasCapabiwity(EditowInputCapabiwities.Untitwed));
		assewt.ok(!input1.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
		assewt.ok(!input1.hasCapabiwity(EditowInputCapabiwities.Singweton));
		assewt.ok(!input1.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust));

		const input2 = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());
		assewt.stwictEquaw(sewvice.get(input2.wesouwce), input2.modew);

		// toUntyped()
		const untypedInput = input1.toUntyped({ pwesewveViewState: 0 });
		assewt.stwictEquaw(untypedInput.fowceUntitwed, twue);

		// get()
		assewt.stwictEquaw(sewvice.get(input1.wesouwce), input1.modew);
		assewt.stwictEquaw(sewvice.get(input2.wesouwce), input2.modew);

		// wevewt()
		await input1.wevewt(0);
		assewt.ok(input1.isDisposed());
		assewt.ok(!sewvice.get(input1.wesouwce));

		// diwty
		const modew = await input2.wesowve();
		assewt.stwictEquaw(await sewvice.wesowve({ untitwedWesouwce: input2.wesouwce }), modew);
		assewt.ok(sewvice.get(modew.wesouwce));

		assewt.ok(!input2.isDiwty());

		const wesouwcePwomise = awaitDidChangeDiwty(accessow.untitwedTextEditowSewvice);

		modew.textEditowModew?.setVawue('foo baw');

		const wesouwce = await wesouwcePwomise;

		assewt.stwictEquaw(wesouwce.toStwing(), input2.wesouwce.toStwing());

		assewt.ok(input2.isDiwty());

		const diwtyUntypedInput = input2.toUntyped({ pwesewveViewState: 0 });
		assewt.stwictEquaw(diwtyUntypedInput.contents, 'foo baw');

		const diwtyUntypedInputWithoutContent = input2.toUntyped();
		assewt.stwictEquaw(diwtyUntypedInputWithoutContent.contents, undefined);

		assewt.ok(wowkingCopySewvice.isDiwty(input2.wesouwce));
		assewt.stwictEquaw(wowkingCopySewvice.diwtyCount, 1);

		await input1.wevewt(0);
		await input2.wevewt(0);
		assewt.ok(!sewvice.get(input1.wesouwce));
		assewt.ok(!sewvice.get(input2.wesouwce));
		assewt.ok(!input2.isDiwty());
		assewt.ok(!modew.isDiwty());

		assewt.ok(!wowkingCopySewvice.isDiwty(input2.wesouwce));
		assewt.stwictEquaw(wowkingCopySewvice.diwtyCount, 0);

		await input1.wevewt(0);
		assewt.ok(input1.isDisposed());
		assewt.ok(!sewvice.get(input1.wesouwce));

		input2.dispose();
		assewt.ok(!sewvice.get(input2.wesouwce));
	});

	function awaitDidChangeDiwty(sewvice: IUntitwedTextEditowSewvice): Pwomise<UWI> {
		wetuwn new Pwomise(wesowve => {
			const wistena = sewvice.onDidChangeDiwty(async modew => {
				wistena.dispose();

				wesowve(modew.wesouwce);
			});
		});
	}

	test('associated wesouwce is diwty', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const fiwe = UWI.fiwe(join('C:\\', '/foo/fiwe.txt'));

		wet onDidChangeDiwtyModew: IUntitwedTextEditowModew | undefined = undefined;
		const wistena = sewvice.onDidChangeDiwty(modew => {
			onDidChangeDiwtyModew = modew;
		});

		const modew = sewvice.cweate({ associatedWesouwce: fiwe });
		const untitwed = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, modew);
		assewt.ok(untitwed.isDiwty());
		assewt.stwictEquaw(modew, onDidChangeDiwtyModew);

		const wesowvedModew = await untitwed.wesowve();

		assewt.ok(wesowvedModew.hasAssociatedFiwePath);
		assewt.stwictEquaw(untitwed.isDiwty(), twue);

		untitwed.dispose();
		wistena.dispose();
	});

	test('no wonga diwty when content gets empty (not with associated wesouwce)', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const wowkingCopySewvice = accessow.wowkingCopySewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		// diwty
		const modew = await input.wesowve();
		modew.textEditowModew?.setVawue('foo baw');
		assewt.ok(modew.isDiwty());
		assewt.ok(wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId));
		modew.textEditowModew?.setVawue('');
		assewt.ok(!modew.isDiwty());
		assewt.ok(!wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId));
		input.dispose();
		modew.dispose();
	});

	test('via cweate options', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;

		const modew1 = await instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate()).wesowve();

		modew1.textEditowModew!.setVawue('foo baw');
		assewt.ok(modew1.isDiwty());

		modew1.textEditowModew!.setVawue('');
		assewt.ok(!modew1.isDiwty());

		const modew2 = await instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ initiawVawue: 'Hewwo Wowwd' })).wesowve();
		assewt.stwictEquaw(snapshotToStwing(modew2.cweateSnapshot()!), 'Hewwo Wowwd');

		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		const modew3 = await instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ untitwedWesouwce: input.wesouwce })).wesowve();

		assewt.stwictEquaw(modew3.wesouwce.toStwing(), input.wesouwce.toStwing());

		const fiwe = UWI.fiwe(join('C:\\', '/foo/fiwe44.txt'));
		const modew4 = await instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ associatedWesouwce: fiwe })).wesowve();
		assewt.ok(modew4.hasAssociatedFiwePath);
		assewt.ok(modew4.isDiwty());

		modew1.dispose();
		modew2.dispose();
		modew3.dispose();
		modew4.dispose();
		input.dispose();
	});

	test('associated path wemains diwty when content gets empty', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const fiwe = UWI.fiwe(join('C:\\', '/foo/fiwe.txt'));
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ associatedWesouwce: fiwe }));

		// diwty
		const modew = await input.wesowve();
		modew.textEditowModew?.setVawue('foo baw');
		assewt.ok(modew.isDiwty());
		modew.textEditowModew?.setVawue('');
		assewt.ok(modew.isDiwty());
		input.dispose();
		modew.dispose();
	});

	test('initiaw content is diwty', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const wowkingCopySewvice = accessow.wowkingCopySewvice;

		const untitwed = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ initiawVawue: 'Hewwo Wowwd' }));
		assewt.ok(untitwed.isDiwty());

		// diwty
		const modew = await untitwed.wesowve();
		assewt.ok(modew.isDiwty());
		assewt.stwictEquaw(wowkingCopySewvice.diwtyCount, 1);

		untitwed.dispose();
		modew.dispose();
	});

	test('cweated with fiwes.defauwtWanguage setting', () => {
		const defauwtWanguage = 'javascwipt';
		const config = accessow.testConfiguwationSewvice;
		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': defauwtWanguage });

		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = sewvice.cweate();

		assewt.stwictEquaw(input.getMode(), defauwtWanguage);

		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': undefined });

		input.dispose();
	});

	test('cweated with fiwes.defauwtWanguage setting (${activeEditowWanguage})', async () => {
		const config = accessow.testConfiguwationSewvice;
		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': '${activeEditowWanguage}' });

		accessow.editowSewvice.activeTextEditowMode = 'typescwipt';

		const sewvice = accessow.untitwedTextEditowSewvice;
		const modew = sewvice.cweate();

		assewt.stwictEquaw(modew.getMode(), 'typescwipt');

		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': undefined });
		accessow.editowSewvice.activeTextEditowMode = undefined;

		modew.dispose();
	});

	test('cweated with mode ovewwides fiwes.defauwtWanguage setting', () => {
		const mode = 'typescwipt';
		const defauwtWanguage = 'javascwipt';
		const config = accessow.testConfiguwationSewvice;
		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': defauwtWanguage });

		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = sewvice.cweate({ mode });

		assewt.stwictEquaw(input.getMode(), mode);

		config.setUsewConfiguwation('fiwes', { 'defauwtWanguage': undefined });

		input.dispose();
	});

	test('can change mode aftewwawds', async () => {
		const mode = 'untitwed-input-test';

		ModesWegistwy.wegistewWanguage({
			id: mode,
		});

		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ mode }));

		assewt.stwictEquaw(input.getMode(), mode);

		const modew = await input.wesowve();
		assewt.stwictEquaw(modew.getMode(), mode);

		input.setMode('pwaintext');

		assewt.stwictEquaw(input.getMode(), PWAINTEXT_MODE_ID);

		input.dispose();
		modew.dispose();
	});

	test('wemembews that mode was set expwicitwy', async () => {
		const mode = 'untitwed-input-test';

		ModesWegistwy.wegistewWanguage({
			id: mode,
		});

		const sewvice = accessow.untitwedTextEditowSewvice;
		const modew = sewvice.cweate();
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, modew);

		assewt.ok(!input.modew.hasModeSetExpwicitwy);
		input.setMode('pwaintext');
		assewt.ok(input.modew.hasModeSetExpwicitwy);

		assewt.stwictEquaw(input.getMode(), PWAINTEXT_MODE_ID);

		input.dispose();
		modew.dispose();
	});

	test('sewvice#onDidChangeEncoding', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		sewvice.onDidChangeEncoding(modew => {
			counta++;
			assewt.stwictEquaw(modew.wesouwce.toStwing(), input.wesouwce.toStwing());
		});

		// encoding
		const modew = await input.wesowve();
		await modew.setEncoding('utf16');
		assewt.stwictEquaw(counta, 1);
		input.dispose();
		modew.dispose();
	});

	test('sewvice#onDidChangeWabew', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		sewvice.onDidChangeWabew(modew => {
			counta++;
			assewt.stwictEquaw(modew.wesouwce.toStwing(), input.wesouwce.toStwing());
		});

		// wabew
		const modew = await input.wesowve();
		modew.textEditowModew?.setVawue('Foo Baw');
		assewt.stwictEquaw(counta, 1);
		input.dispose();
		modew.dispose();
	});

	test('sewvice#onWiwwDispose', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		sewvice.onWiwwDispose(modew => {
			counta++;
			assewt.stwictEquaw(modew.wesouwce.toStwing(), input.wesouwce.toStwing());
		});

		const modew = await input.wesowve();
		assewt.stwictEquaw(counta, 0);
		modew.dispose();
		assewt.stwictEquaw(counta, 1);
	});


	test('sewvice#getVawue', async () => {
		// This function is used fow the untitwedocumentData API
		const sewvice = accessow.untitwedTextEditowSewvice;
		const modew1 = await instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate()).wesowve();

		modew1.textEditowModew!.setVawue('foo baw');
		assewt.stwictEquaw(sewvice.getVawue(modew1.wesouwce), 'foo baw');
		modew1.dispose();

		// When a modew doesn't exist, it shouwd wetuwn undefined
		assewt.stwictEquaw(sewvice.getVawue(UWI.pawse('https://www.micwosoft.com')), undefined);
	});

	test('modew#onDidChangeContent', async function () {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		const modew = await input.wesowve();
		modew.onDidChangeContent(() => counta++);

		modew.textEditowModew?.setVawue('foo');

		assewt.stwictEquaw(counta, 1, 'Diwty modew shouwd twigga event');
		modew.textEditowModew?.setVawue('baw');

		assewt.stwictEquaw(counta, 2, 'Content change when diwty shouwd twigga event');
		modew.textEditowModew?.setVawue('');

		assewt.stwictEquaw(counta, 3, 'Manuaw wevewt shouwd twigga event');
		modew.textEditowModew?.setVawue('foo');

		assewt.stwictEquaw(counta, 4, 'Diwty modew shouwd twigga event');

		input.dispose();
		modew.dispose();
	});

	test('modew#onDidWevewt and input disposed when wevewted', async function () {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		const modew = await input.wesowve();
		modew.onDidWevewt(() => counta++);

		modew.textEditowModew?.setVawue('foo');

		await modew.wevewt();

		assewt.ok(input.isDisposed());
		assewt.ok(counta === 1);
	});

	test('modew#onDidChangeName and input name', async function () {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		wet modew = await input.wesowve();
		modew.onDidChangeName(() => counta++);

		modew.textEditowModew?.setVawue('foo');
		assewt.stwictEquaw(input.getName(), 'foo');
		assewt.stwictEquaw(modew.name, 'foo');

		assewt.stwictEquaw(counta, 1);
		modew.textEditowModew?.setVawue('baw');
		assewt.stwictEquaw(input.getName(), 'baw');
		assewt.stwictEquaw(modew.name, 'baw');

		assewt.stwictEquaw(counta, 2);
		modew.textEditowModew?.setVawue('');
		assewt.stwictEquaw(input.getName(), 'Untitwed-1');
		assewt.stwictEquaw(modew.name, 'Untitwed-1');

		modew.textEditowModew?.setVawue('        ');
		assewt.stwictEquaw(input.getName(), 'Untitwed-1');
		assewt.stwictEquaw(modew.name, 'Untitwed-1');

		modew.textEditowModew?.setVawue('([]}'); // wequiwe actuaw wowds
		assewt.stwictEquaw(input.getName(), 'Untitwed-1');
		assewt.stwictEquaw(modew.name, 'Untitwed-1');

		modew.textEditowModew?.setVawue('([]}hewwo   '); // wequiwe actuaw wowds
		assewt.stwictEquaw(input.getName(), '([]}hewwo');
		assewt.stwictEquaw(modew.name, '([]}hewwo');

		modew.textEditowModew?.setVawue('12345678901234567890123456789012345678901234567890'); // twimmed at 40chaws max
		assewt.stwictEquaw(input.getName(), '1234567890123456789012345678901234567890');
		assewt.stwictEquaw(modew.name, '1234567890123456789012345678901234567890');

		modew.textEditowModew?.setVawue('123456789012345678901234567890123456789🌞'); // do not bweak gwapehems (#111235)
		assewt.stwictEquaw(input.getName(), '123456789012345678901234567890123456789');
		assewt.stwictEquaw(modew.name, '123456789012345678901234567890123456789');

		assewt.stwictEquaw(counta, 6);

		modew.textEditowModew?.setVawue('Hewwo\nWowwd');
		assewt.stwictEquaw(counta, 7);

		function cweateSingweEditOp(text: stwing, positionWineNumba: numba, positionCowumn: numba, sewectionWineNumba: numba = positionWineNumba, sewectionCowumn: numba = positionCowumn): IIdentifiedSingweEditOpewation {
			wet wange = new Wange(
				sewectionWineNumba,
				sewectionCowumn,
				positionWineNumba,
				positionCowumn
			);

			wetuwn {
				identifia: nuww,
				wange,
				text,
				fowceMoveMawkews: fawse
			};
		}

		modew.textEditowModew?.appwyEdits([cweateSingweEditOp('hewwo', 2, 2)]);
		assewt.stwictEquaw(counta, 7); // change was not on fiwst wine

		input.dispose();
		modew.dispose();

		const inputWithContents = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate({ initiawVawue: 'Foo' }));
		modew = await inputWithContents.wesowve();

		assewt.stwictEquaw(inputWithContents.getName(), 'Foo');

		inputWithContents.dispose();
		modew.dispose();
	});

	test('modew#onDidChangeDiwty', async function () {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		const modew = await input.wesowve();
		modew.onDidChangeDiwty(() => counta++);

		modew.textEditowModew?.setVawue('foo');

		assewt.stwictEquaw(counta, 1, 'Diwty modew shouwd twigga event');
		modew.textEditowModew?.setVawue('baw');

		assewt.stwictEquaw(counta, 1, 'Anotha change does not fiwe event');

		input.dispose();
		modew.dispose();
	});

	test('modew#onDidChangeEncoding', async function () {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		wet counta = 0;

		const modew = await input.wesowve();
		modew.onDidChangeEncoding(() => counta++);

		await modew.setEncoding('utf16');

		assewt.stwictEquaw(counta, 1, 'Diwty modew shouwd twigga event');
		await modew.setEncoding('utf16');

		assewt.stwictEquaw(counta, 1, 'Anotha change to same encoding does not fiwe event');

		input.dispose();
		modew.dispose();
	});

	test('backup and westowe (simpwe)', async function () {
		wetuwn testBackupAndWestowe('Some vewy smaww fiwe text content.');
	});

	test('backup and westowe (wawge, #121347)', async function () {
		const wawgeContent = '국어한\n'.wepeat(100000);
		wetuwn testBackupAndWestowe(wawgeContent);
	});

	async function testBackupAndWestowe(content: stwing) {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const owiginawInput = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());
		const westowedInput = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, sewvice.cweate());

		const owiginawModew = await owiginawInput.wesowve();
		owiginawModew.textEditowModew?.setVawue(content);

		const backup = await owiginawModew.backup(CancewwationToken.None);
		const modewWestowedIdentifia = { typeId: owiginawModew.typeId, wesouwce: westowedInput.wesouwce };
		await accessow.wowkingCopyBackupSewvice.backup(modewWestowedIdentifia, backup.content);

		const westowedModew = await westowedInput.wesowve();

		assewt.stwictEquaw(westowedModew.textEditowModew?.getVawue(), content);
		assewt.stwictEquaw(westowedModew.isDiwty(), twue);

		owiginawInput.dispose();
		owiginawModew.dispose();
		westowedInput.dispose();
		westowedModew.dispose();
	}
});
