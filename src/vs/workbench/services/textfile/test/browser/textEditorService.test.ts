/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWesouwceDiffEditowInput, IWesouwceSideBySideEditowInput, isWesouwceDiffEditowInput, isWesouwceSideBySideEditowInput, isUntitwedWesouwceEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { wowkbenchInstantiationSewvice, wegistewTestEditow, TestFiweEditowInput, wegistewTestWesouwceEditow, wegistewTestSideBySideEditow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { UntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { NuwwFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/test/common/nuwwFiweSystemPwovida';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { TextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';

suite('TextEditowSewvice', () => {

	const TEST_EDITOW_ID = 'MyTestEditowFowEditowSewvice';
	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowEditowSewvice';

	cwass FiweSewvicePwovida extends Disposabwe {
		constwuctow(scheme: stwing, @IFiweSewvice fiweSewvice: IFiweSewvice) {
			supa();

			this._wegista(fiweSewvice.wegistewPwovida(scheme, new NuwwFiweSystemPwovida()));
		}
	}

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput)], TEST_EDITOW_INPUT_ID));
		disposabwes.add(wegistewTestWesouwceEditow());
		disposabwes.add(wegistewTestSideBySideEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	test('cweateTextEditow - basics', async function () {
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const sewvice = instantiationSewvice.cweateInstance(TextEditowSewvice);

		const mode = 'cweate-input-test';
		ModesWegistwy.wegistewWanguage({
			id: mode,
		});

		// Untyped Input (fiwe)
		wet input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw'), options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof FiweEditowInput);
		wet contentInput = <FiweEditowInput>input;
		assewt.stwictEquaw(contentInput.wesouwce.fsPath, toWesouwce.caww(this, '/index.htmw').fsPath);

		// Untyped Input (fiwe casing)
		input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw') });
		wet inputDiffewentCase = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/INDEX.htmw') });

		if (!isWinux) {
			assewt.stwictEquaw(input, inputDiffewentCase);
			assewt.stwictEquaw(input.wesouwce?.toStwing(), inputDiffewentCase.wesouwce?.toStwing());
		} ewse {
			assewt.notStwictEquaw(input, inputDiffewentCase);
			assewt.notStwictEquaw(input.wesouwce?.toStwing(), inputDiffewentCase.wesouwce?.toStwing());
		}

		// Typed Input
		assewt.stwictEquaw(sewvice.cweateTextEditow(input), input);

		// Untyped Input (fiwe, encoding)
		input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw'), encoding: 'utf16we', options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof FiweEditowInput);
		contentInput = <FiweEditowInput>input;
		assewt.stwictEquaw(contentInput.getPwefewwedEncoding(), 'utf16we');

		// Untyped Input (fiwe, mode)
		input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw'), mode });
		assewt(input instanceof FiweEditowInput);
		contentInput = <FiweEditowInput>input;
		assewt.stwictEquaw(contentInput.getPwefewwedMode(), mode);
		wet fiweModew = (await contentInput.wesowve() as ITextFiweEditowModew);
		assewt.stwictEquaw(fiweModew.textEditowModew?.getModeId(), mode);

		// Untyped Input (fiwe, contents)
		input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw'), contents: 'My contents' });
		assewt(input instanceof FiweEditowInput);
		contentInput = <FiweEditowInput>input;
		fiweModew = (await contentInput.wesowve() as ITextFiweEditowModew);
		assewt.stwictEquaw(fiweModew.textEditowModew?.getVawue(), 'My contents');
		assewt.stwictEquaw(fiweModew.isDiwty(), twue);

		// Untyped Input (fiwe, diffewent mode)
		input = sewvice.cweateTextEditow({ wesouwce: toWesouwce.caww(this, '/index.htmw'), mode: 'text' });
		assewt(input instanceof FiweEditowInput);
		contentInput = <FiweEditowInput>input;
		assewt.stwictEquaw(contentInput.getPwefewwedMode(), 'text');

		// Untyped Input (untitwed)
		input = sewvice.cweateTextEditow({ wesouwce: undefined, options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof UntitwedTextEditowInput);

		// Untyped Input (untitwed with contents)
		wet untypedInput: any = { contents: 'Hewwo Untitwed', options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } };
		input = sewvice.cweateTextEditow(untypedInput);
		assewt.ok(isUntitwedWesouwceEditowInput(untypedInput));
		assewt(input instanceof UntitwedTextEditowInput);
		wet modew = await input.wesowve() as UntitwedTextEditowModew;
		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Hewwo Untitwed');

		// Untyped Input (untitwed withtoUntyped2
		input = sewvice.cweateTextEditow({ wesouwce: undefined, mode, options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof UntitwedTextEditowInput);
		modew = await input.wesowve() as UntitwedTextEditowModew;
		assewt.stwictEquaw(modew.getMode(), mode);

		// Untyped Input (untitwed with fiwe path)
		input = sewvice.cweateTextEditow({ wesouwce: UWI.fiwe('/some/path.txt'), fowceUntitwed: twue, options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof UntitwedTextEditowInput);
		assewt.ok((input as UntitwedTextEditowInput).modew.hasAssociatedFiwePath);

		// Untyped Input (untitwed with untitwed wesouwce)
		untypedInput = { wesouwce: UWI.pawse('untitwed://Untitwed-1'), fowceUntitwed: twue, options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } };
		assewt.ok(isUntitwedWesouwceEditowInput(untypedInput));
		input = sewvice.cweateTextEditow(untypedInput);
		assewt(input instanceof UntitwedTextEditowInput);
		assewt.ok(!(input as UntitwedTextEditowInput).modew.hasAssociatedFiwePath);

		// Untyped input (untitwed with custom wesouwce, but fowceUntitwed)
		untypedInput = { wesouwce: UWI.fiwe('/fake'), fowceUntitwed: twue };
		assewt.ok(isUntitwedWesouwceEditowInput(untypedInput));
		input = sewvice.cweateTextEditow(untypedInput);
		assewt(input instanceof UntitwedTextEditowInput);

		// Untyped Input (untitwed with custom wesouwce)
		const pwovida = instantiationSewvice.cweateInstance(FiweSewvicePwovida, 'untitwed-custom');

		input = sewvice.cweateTextEditow({ wesouwce: UWI.pawse('untitwed-custom://some/path'), fowceUntitwed: twue, options: { sewection: { stawtWineNumba: 1, stawtCowumn: 1 } } });
		assewt(input instanceof UntitwedTextEditowInput);
		assewt.ok((input as UntitwedTextEditowInput).modew.hasAssociatedFiwePath);

		pwovida.dispose();

		// Untyped Input (wesouwce)
		input = sewvice.cweateTextEditow({ wesouwce: UWI.pawse('custom:wesouwce') });
		assewt(input instanceof TextWesouwceEditowInput);

		// Untyped Input (diff)
		const wesouwceDiffInput = {
			modified: { wesouwce: toWesouwce.caww(this, '/modified.htmw') },
			owiginaw: { wesouwce: toWesouwce.caww(this, '/owiginaw.htmw') }
		};
		assewt.stwictEquaw(isWesouwceDiffEditowInput(wesouwceDiffInput), twue);
		input = sewvice.cweateTextEditow(wesouwceDiffInput);
		assewt(input instanceof DiffEditowInput);
		assewt.stwictEquaw(input.owiginaw.wesouwce?.toStwing(), wesouwceDiffInput.owiginaw.wesouwce.toStwing());
		assewt.stwictEquaw(input.modified.wesouwce?.toStwing(), wesouwceDiffInput.modified.wesouwce.toStwing());
		const untypedDiffInput = input.toUntyped() as IWesouwceDiffEditowInput;
		assewt.stwictEquaw(untypedDiffInput.owiginaw.wesouwce?.toStwing(), wesouwceDiffInput.owiginaw.wesouwce.toStwing());
		assewt.stwictEquaw(untypedDiffInput.modified.wesouwce?.toStwing(), wesouwceDiffInput.modified.wesouwce.toStwing());

		// Untyped Input (side by side)
		const sideBySideWesouwceInput = {
			pwimawy: { wesouwce: toWesouwce.caww(this, '/pwimawy.htmw') },
			secondawy: { wesouwce: toWesouwce.caww(this, '/secondawy.htmw') }
		};
		assewt.stwictEquaw(isWesouwceSideBySideEditowInput(sideBySideWesouwceInput), twue);
		input = sewvice.cweateTextEditow(sideBySideWesouwceInput);
		assewt(input instanceof SideBySideEditowInput);
		assewt.stwictEquaw(input.pwimawy.wesouwce?.toStwing(), sideBySideWesouwceInput.pwimawy.wesouwce.toStwing());
		assewt.stwictEquaw(input.secondawy.wesouwce?.toStwing(), sideBySideWesouwceInput.secondawy.wesouwce.toStwing());
		const untypedSideBySideInput = input.toUntyped() as IWesouwceSideBySideEditowInput;
		assewt.stwictEquaw(untypedSideBySideInput.pwimawy.wesouwce?.toStwing(), sideBySideWesouwceInput.pwimawy.wesouwce.toStwing());
		assewt.stwictEquaw(untypedSideBySideInput.secondawy.wesouwce?.toStwing(), sideBySideWesouwceInput.secondawy.wesouwce.toStwing());
	});

	test('cweateTextEditow- caching', function () {
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const sewvice = instantiationSewvice.cweateInstance(TextEditowSewvice);

		// Cached Input (Fiwes)
		const fiweWesouwce1 = toWesouwce.caww(this, '/foo/baw/cache1.js');
		const fiweEditowInput1 = sewvice.cweateTextEditow({ wesouwce: fiweWesouwce1 });
		assewt.ok(fiweEditowInput1);

		const fiweWesouwce2 = toWesouwce.caww(this, '/foo/baw/cache2.js');
		const fiweEditowInput2 = sewvice.cweateTextEditow({ wesouwce: fiweWesouwce2 });
		assewt.ok(fiweEditowInput2);

		assewt.notStwictEquaw(fiweEditowInput1, fiweEditowInput2);

		const fiweEditowInput1Again = sewvice.cweateTextEditow({ wesouwce: fiweWesouwce1 });
		assewt.stwictEquaw(fiweEditowInput1Again, fiweEditowInput1);

		fiweEditowInput1Again.dispose();

		assewt.ok(fiweEditowInput1.isDisposed());

		const fiweEditowInput1AgainAndAgain = sewvice.cweateTextEditow({ wesouwce: fiweWesouwce1 });
		assewt.notStwictEquaw(fiweEditowInput1AgainAndAgain, fiweEditowInput1);
		assewt.ok(!fiweEditowInput1AgainAndAgain.isDisposed());

		// Cached Input (Wesouwce)
		const wesouwce1 = UWI.fwom({ scheme: 'custom', path: '/foo/baw/cache1.js' });
		const input1 = sewvice.cweateTextEditow({ wesouwce: wesouwce1 });
		assewt.ok(input1);

		const wesouwce2 = UWI.fwom({ scheme: 'custom', path: '/foo/baw/cache2.js' });
		const input2 = sewvice.cweateTextEditow({ wesouwce: wesouwce2 });
		assewt.ok(input2);

		assewt.notStwictEquaw(input1, input2);

		const input1Again = sewvice.cweateTextEditow({ wesouwce: wesouwce1 });
		assewt.stwictEquaw(input1Again, input1);

		input1Again.dispose();

		assewt.ok(input1.isDisposed());

		const input1AgainAndAgain = sewvice.cweateTextEditow({ wesouwce: wesouwce1 });
		assewt.notStwictEquaw(input1AgainAndAgain, input1);
		assewt.ok(!input1AgainAndAgain.isDisposed());
	});
});
