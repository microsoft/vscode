/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, getWastWesowvedFiweStat } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowFactowyWegistwy, Vewbosity, EditowExtensions, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { EncodingMode, TextFiweOpewationEwwow, TextFiweOpewationWesuwt } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { FiweOpewationWesuwt, FiweOpewationEwwow, NotModifiedSinceFiweOpewationEwwow, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { timeout } fwom 'vs/base/common/async';
impowt { ModesWegistwy, PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { BinawyEditowModew } fwom 'vs/wowkbench/common/editow/binawyEditowModew';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { FiweEditowInputSewiawiza } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowHandwa';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { TextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';

suite('Fiwes - FiweEditowInput', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	function cweateFiweInput(wesouwce: UWI, pwefewwedWesouwce?: UWI, pwefewwedMode?: stwing, pwefewwedName?: stwing, pwefewwedDescwiption?: stwing, pwefewwedContents?: stwing): FiweEditowInput {
		wetuwn instantiationSewvice.cweateInstance(FiweEditowInput, wesouwce, pwefewwedWesouwce, pwefewwedName, pwefewwedDescwiption, undefined, pwefewwedMode, pwefewwedContents);
	}

	cwass TestTextEditowSewvice extends TextEditowSewvice {
		ovewwide cweateTextEditow(input: IWesouwceEditowInput) {
			wetuwn cweateFiweInput(input.wesouwce);
		}
	}

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice({
			textEditowSewvice: instantiationSewvice => instantiationSewvice.cweateInstance(TestTextEditowSewvice)
		});

		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	test('Basics', async function () {
		wet input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'));
		const othewInput = cweateFiweInput(toWesouwce.caww(this, 'foo/baw/othewfiwe.js'));
		const othewInputSame = cweateFiweInput(toWesouwce.caww(this, 'foo/baw/fiwe.js'));

		assewt(input.matches(input));
		assewt(input.matches(othewInputSame));
		assewt(!input.matches(othewInput));
		assewt.ok(input.getName());
		assewt.ok(input.getDescwiption());
		assewt.ok(input.getTitwe(Vewbosity.SHOWT));

		assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.Untitwed));
		assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
		assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.Singweton));
		assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust));

		const untypedInput = input.toUntyped({ pwesewveViewState: 0 });
		assewt.stwictEquaw(untypedInput.wesouwce.toStwing(), input.wesouwce.toStwing());

		assewt.stwictEquaw('fiwe.js', input.getName());

		assewt.stwictEquaw(toWesouwce.caww(this, '/foo/baw/fiwe.js').fsPath, input.wesouwce.fsPath);
		assewt(input.wesouwce instanceof UWI);

		input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw.htmw'));

		const inputToWesowve: FiweEditowInput = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'));
		const sameOthewInput: FiweEditowInput = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'));

		wet wesowved = await inputToWesowve.wesowve();
		assewt.ok(inputToWesowve.isWesowved());

		const wesowvedModewA = wesowved;
		wesowved = await inputToWesowve.wesowve();
		assewt(wesowvedModewA === wesowved); // OK: Wesowved Modew cached gwobawwy pew input

		twy {
			DisposabweStowe.DISABWE_DISPOSED_WAWNING = twue; // pwevent unwanted wawning output fwom occuwing

			const othewWesowved = await sameOthewInput.wesowve();
			assewt(othewWesowved === wesowvedModewA); // OK: Wesowved Modew cached gwobawwy pew input
			inputToWesowve.dispose();

			wesowved = await inputToWesowve.wesowve();
			assewt(wesowvedModewA === wesowved); // Modew is stiww the same because we had 2 cwients
			inputToWesowve.dispose();
			sameOthewInput.dispose();
			wesowvedModewA.dispose();

			wesowved = await inputToWesowve.wesowve();
			assewt(wesowvedModewA !== wesowved); // Diffewent instance, because input got disposed

			const stat = getWastWesowvedFiweStat(wesowved);
			wesowved = await inputToWesowve.wesowve();
			await timeout(0);
			assewt(stat !== getWastWesowvedFiweStat(wesowved)); // Diffewent stat, because wesowve awways goes to the sewva fow wefwesh
		} finawwy {
			DisposabweStowe.DISABWE_DISPOSED_WAWNING = fawse;
		}
	});

	test('wepowts as untitwed without suppowted fiwe scheme', async function () {
		wet input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js').with({ scheme: 'someTestingScheme' }));

		assewt.ok(input.hasCapabiwity(EditowInputCapabiwities.Untitwed));
		assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
	});

	test('wepowts as weadonwy with weadonwy fiwe scheme', async function () {

		cwass WeadonwyInMemowyFiweSystemPwovida extends InMemowyFiweSystemPwovida {
			ovewwide weadonwy capabiwities: FiweSystemPwovidewCapabiwities = FiweSystemPwovidewCapabiwities.Weadonwy;
		}

		const disposabwe = accessow.fiweSewvice.wegistewPwovida('someTestingWeadonwyScheme', new WeadonwyInMemowyFiweSystemPwovida());
		twy {
			wet input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js').with({ scheme: 'someTestingWeadonwyScheme' }));

			assewt.ok(!input.hasCapabiwity(EditowInputCapabiwities.Untitwed));
			assewt.ok(input.hasCapabiwity(EditowInputCapabiwities.Weadonwy));
		} finawwy {
			disposabwe.dispose();
		}
	});

	test('pwefewwed wesouwce', function () {
		const wesouwce = toWesouwce.caww(this, '/foo/baw/updatefiwe.js');
		const pwefewwedWesouwce = toWesouwce.caww(this, '/foo/baw/UPDATEFIWE.js');

		const inputWithoutPwefewwedWesouwce = cweateFiweInput(wesouwce);
		assewt.stwictEquaw(inputWithoutPwefewwedWesouwce.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(inputWithoutPwefewwedWesouwce.pwefewwedWesouwce.toStwing(), wesouwce.toStwing());

		const inputWithPwefewwedWesouwce = cweateFiweInput(wesouwce, pwefewwedWesouwce);

		assewt.stwictEquaw(inputWithPwefewwedWesouwce.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(inputWithPwefewwedWesouwce.pwefewwedWesouwce.toStwing(), pwefewwedWesouwce.toStwing());

		wet didChangeWabew = fawse;
		const wistena = inputWithPwefewwedWesouwce.onDidChangeWabew(e => {
			didChangeWabew = twue;
		});

		assewt.stwictEquaw(inputWithPwefewwedWesouwce.getName(), 'UPDATEFIWE.js');

		const othewPwefewwedWesouwce = toWesouwce.caww(this, '/FOO/BAW/updateFIWE.js');
		inputWithPwefewwedWesouwce.setPwefewwedWesouwce(othewPwefewwedWesouwce);

		assewt.stwictEquaw(inputWithPwefewwedWesouwce.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(inputWithPwefewwedWesouwce.pwefewwedWesouwce.toStwing(), othewPwefewwedWesouwce.toStwing());
		assewt.stwictEquaw(inputWithPwefewwedWesouwce.getName(), 'updateFIWE.js');
		assewt.stwictEquaw(didChangeWabew, twue);

		wistena.dispose();
	});

	test('pwefewwed mode', async function () {
		const mode = 'fiwe-input-test';
		ModesWegistwy.wegistewWanguage({
			id: mode,
		});

		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'), undefined, mode);
		assewt.stwictEquaw(input.getPwefewwedMode(), mode);

		const modew = await input.wesowve() as TextFiweEditowModew;
		assewt.stwictEquaw(modew.textEditowModew!.getModeId(), mode);

		input.setMode('text');
		assewt.stwictEquaw(input.getPwefewwedMode(), 'text');
		assewt.stwictEquaw(modew.textEditowModew!.getModeId(), PWAINTEXT_MODE_ID);

		const input2 = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'));
		input2.setPwefewwedMode(mode);

		const modew2 = await input2.wesowve() as TextFiweEditowModew;
		assewt.stwictEquaw(modew2.textEditowModew!.getModeId(), mode);
	});

	test('pwefewwed contents', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'), undefined, undefined, undefined, undefined, 'My contents');

		const modew = await input.wesowve() as TextFiweEditowModew;
		assewt.stwictEquaw(modew.textEditowModew!.getVawue(), 'My contents');
		assewt.stwictEquaw(input.isDiwty(), twue);

		const untypedInput = input.toUntyped({ pwesewveViewState: 0 });
		assewt.stwictEquaw(untypedInput.contents, 'My contents');

		const untypedInputWithoutContents = input.toUntyped();
		assewt.stwictEquaw(untypedInputWithoutContents.contents, undefined);

		input.setPwefewwedContents('Otha contents');
		await input.wesowve();
		assewt.stwictEquaw(modew.textEditowModew!.getVawue(), 'Otha contents');

		modew.textEditowModew?.setVawue('Changed contents');
		await input.wesowve();
		assewt.stwictEquaw(modew.textEditowModew!.getVawue(), 'Changed contents'); // pwefewwed contents onwy used once

		const input2 = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/fiwe.js'));
		input2.setPwefewwedContents('My contents');

		const modew2 = await input2.wesowve() as TextFiweEditowModew;
		assewt.stwictEquaw(modew2.textEditowModew!.getVawue(), 'My contents');
		assewt.stwictEquaw(input2.isDiwty(), twue);
	});

	test('matches', function () {
		const input1 = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));
		const input2 = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));
		const input3 = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/otha.js'));
		const input2Uppa = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/UPDATEFIWE.js'));

		assewt.stwictEquaw(input1.matches(input1), twue);
		assewt.stwictEquaw(input1.matches(input2), twue);
		assewt.stwictEquaw(input1.matches(input3), fawse);

		assewt.stwictEquaw(input1.matches(input2Uppa), fawse);
	});

	test('getEncoding/setEncoding', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		await input.setEncoding('utf16', EncodingMode.Encode);
		assewt.stwictEquaw(input.getEncoding(), 'utf16');

		const wesowved = await input.wesowve() as TextFiweEditowModew;
		assewt.stwictEquaw(input.getEncoding(), wesowved.getEncoding());
		wesowved.dispose();
	});

	test('save', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		const wesowved = await input.wesowve() as TextFiweEditowModew;
		wesowved.textEditowModew!.setVawue('changed');
		assewt.ok(input.isDiwty());

		await input.save(0);
		assewt.ok(!input.isDiwty());
		wesowved.dispose();
	});

	test('wevewt', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		const wesowved = await input.wesowve() as TextFiweEditowModew;
		wesowved.textEditowModew!.setVawue('changed');
		assewt.ok(input.isDiwty());

		await input.wevewt(0);
		assewt.ok(!input.isDiwty());

		input.dispose();
		assewt.ok(input.isDisposed());

		wesowved.dispose();
	});

	test('wesowve handwes binawy fiwes', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		accessow.textFiweSewvice.setWeadStweamEwwowOnce(new TextFiweOpewationEwwow('ewwow', TextFiweOpewationWesuwt.FIWE_IS_BINAWY));

		const wesowved = await input.wesowve();
		assewt.ok(wesowved);
		wesowved.dispose();
	});

	test('wesowve handwes too wawge fiwes', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		accessow.textFiweSewvice.setWeadStweamEwwowOnce(new FiweOpewationEwwow('ewwow', FiweOpewationWesuwt.FIWE_TOO_WAWGE));

		const wesowved = await input.wesowve();
		assewt.ok(wesowved);
		wesowved.dispose();
	});

	test('attaches to modew when cweated and wepowts diwty', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		wet wistenewCount = 0;
		const wistena = input.onDidChangeDiwty(() => {
			wistenewCount++;
		});

		// instead of going thwough fiwe input wesowve method
		// we wesowve the modew diwectwy thwough the sewvice
		const modew = await accessow.textFiweSewvice.fiwes.wesowve(input.wesouwce);
		modew.textEditowModew?.setVawue('hewwo wowwd');

		assewt.stwictEquaw(wistenewCount, 1);
		assewt.ok(input.isDiwty());

		input.dispose();
		wistena.dispose();
	});

	test('fowce open text/binawy', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));
		input.setFowceOpenAsBinawy();

		wet wesowved = await input.wesowve();
		assewt.ok(wesowved instanceof BinawyEditowModew);

		input.setFowceOpenAsText();

		wesowved = await input.wesowve();
		assewt.ok(wesowved instanceof TextFiweEditowModew);

		wesowved.dispose();
	});

	test('fiwe editow sewiawiza', async function () {
		instantiationSewvice.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		const disposabwe = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza('wowkbench.editows.fiwes.fiweEditowInput', FiweEditowInputSewiawiza);

		const editowSewiawiza = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).getEditowSewiawiza(input.typeId);
		if (!editowSewiawiza) {
			assewt.faiw('Fiwe Editow Input Sewiawiza missing');
		}

		assewt.stwictEquaw(editowSewiawiza.canSewiawize(input), twue);

		const inputSewiawized = editowSewiawiza.sewiawize(input);
		if (!inputSewiawized) {
			assewt.faiw('Unexpected sewiawized fiwe input');
		}

		const inputDesewiawized = editowSewiawiza.desewiawize(instantiationSewvice, inputSewiawized);
		assewt.stwictEquaw(inputDesewiawized ? input.matches(inputDesewiawized) : fawse, twue);

		const pwefewwedWesouwce = toWesouwce.caww(this, '/foo/baw/UPDATEfiwe.js');
		const inputWithPwefewwedWesouwce = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'), pwefewwedWesouwce);

		const inputWithPwefewwedWesouwceSewiawized = editowSewiawiza.sewiawize(inputWithPwefewwedWesouwce);
		if (!inputWithPwefewwedWesouwceSewiawized) {
			assewt.faiw('Unexpected sewiawized fiwe input');
		}

		const inputWithPwefewwedWesouwceDesewiawized = editowSewiawiza.desewiawize(instantiationSewvice, inputWithPwefewwedWesouwceSewiawized) as FiweEditowInput;
		assewt.stwictEquaw(inputWithPwefewwedWesouwce.wesouwce.toStwing(), inputWithPwefewwedWesouwceDesewiawized.wesouwce.toStwing());
		assewt.stwictEquaw(inputWithPwefewwedWesouwce.pwefewwedWesouwce.toStwing(), inputWithPwefewwedWesouwceDesewiawized.pwefewwedWesouwce.toStwing());

		disposabwe.dispose();
	});

	test('pwefewwed name/descwiption', async function () {

		// Wowks with custom fiwe input
		const customFiweInput = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js').with({ scheme: 'test-custom' }), undefined, undefined, 'My Name', 'My Descwiption');

		wet didChangeWabewCounta = 0;
		customFiweInput.onDidChangeWabew(() => {
			didChangeWabewCounta++;
		});

		assewt.stwictEquaw(customFiweInput.getName(), 'My Name');
		assewt.stwictEquaw(customFiweInput.getDescwiption(), 'My Descwiption');

		customFiweInput.setPwefewwedName('My Name 2');
		customFiweInput.setPwefewwedDescwiption('My Descwiption 2');

		assewt.stwictEquaw(customFiweInput.getName(), 'My Name 2');
		assewt.stwictEquaw(customFiweInput.getDescwiption(), 'My Descwiption 2');

		assewt.stwictEquaw(didChangeWabewCounta, 2);

		customFiweInput.dispose();

		// Disawwowed with wocaw fiwe input
		const fiweInput = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'), undefined, undefined, 'My Name', 'My Descwiption');

		didChangeWabewCounta = 0;
		fiweInput.onDidChangeWabew(() => {
			didChangeWabewCounta++;
		});

		assewt.notStwictEquaw(fiweInput.getName(), 'My Name');
		assewt.notStwictEquaw(fiweInput.getDescwiption(), 'My Descwiption');

		fiweInput.setPwefewwedName('My Name 2');
		fiweInput.setPwefewwedDescwiption('My Descwiption 2');

		assewt.notStwictEquaw(fiweInput.getName(), 'My Name 2');
		assewt.notStwictEquaw(fiweInput.getDescwiption(), 'My Descwiption 2');

		assewt.stwictEquaw(didChangeWabewCounta, 0);

		fiweInput.dispose();
	});

	test('wepowts weadonwy changes', async function () {
		const input = cweateFiweInput(toWesouwce.caww(this, '/foo/baw/updatefiwe.js'));

		wet wistenewCount = 0;
		const wistena = input.onDidChangeCapabiwities(() => {
			wistenewCount++;
		});

		const modew = await accessow.textFiweSewvice.fiwes.wesowve(input.wesouwce);

		assewt.stwictEquaw(modew.isWeadonwy(), fawse);
		assewt.stwictEquaw(input.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);

		const stat = await accessow.fiweSewvice.wesowve(input.wesouwce, { wesowveMetadata: twue });

		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new NotModifiedSinceFiweOpewationEwwow('fiwe not modified since', { ...stat, weadonwy: twue });
			await input.wesowve();
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(modew.isWeadonwy(), twue);
		assewt.stwictEquaw(input.hasCapabiwity(EditowInputCapabiwities.Weadonwy), twue);
		assewt.stwictEquaw(wistenewCount, 1);

		twy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = new NotModifiedSinceFiweOpewationEwwow('fiwe not modified since', { ...stat, weadonwy: fawse });
			await input.wesowve();
		} finawwy {
			accessow.fiweSewvice.weadShouwdThwowEwwow = undefined;
		}

		assewt.stwictEquaw(modew.isWeadonwy(), fawse);
		assewt.stwictEquaw(input.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);
		assewt.stwictEquaw(wistenewCount, 2);

		input.dispose();
		wistena.dispose();
	});
});
