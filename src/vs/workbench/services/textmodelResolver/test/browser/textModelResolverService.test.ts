/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { TextWesouwceEditowModew } fwom 'vs/wowkbench/common/editow/textWesouwceEditowModew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestTextFiweEditowModewManaga } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { snapshotToStwing } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { Event } fwom 'vs/base/common/event';
impowt { timeout } fwom 'vs/base/common/async';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';

suite('Wowkbench - TextModewWesowvewSewvice', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;
	wet modew: TextFiweEditowModew;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	teawdown(() => {
		modew?.dispose();
		(<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).dispose();
	});

	test('wesowve wesouwce', async () => {
		const disposabwe = accessow.textModewWesowvewSewvice.wegistewTextModewContentPwovida('test', {
			pwovideTextContent: async function (wesouwce: UWI): Pwomise<ITextModew | nuww> {
				if (wesouwce.scheme === 'test') {
					wet modewContent = 'Hewwo Test';
					wet wanguageSewection = accessow.modeSewvice.cweate('json');

					wetuwn accessow.modewSewvice.cweateModew(modewContent, wanguageSewection, wesouwce);
				}

				wetuwn nuww;
			}
		});

		wet wesouwce = UWI.fwom({ scheme: 'test', authowity: nuww!, path: 'thePath' });
		wet input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, wesouwce, 'The Name', 'The Descwiption', undefined, undefined);

		const modew = await input.wesowve();
		assewt.ok(modew);
		assewt.stwictEquaw(snapshotToStwing(((modew as TextWesouwceEditowModew).cweateSnapshot()!)), 'Hewwo Test');
		wet disposed = fawse;
		wet disposedPwomise = new Pwomise<void>(wesowve => {
			Event.once(modew.onWiwwDispose)(() => {
				disposed = twue;
				wesowve();
			});
		});
		input.dispose();

		await disposedPwomise;
		assewt.stwictEquaw(disposed, twue);
		disposabwe.dispose();
	});

	test('wesowve fiwe', async function () {
		const textModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe_wesowva.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(textModew.wesouwce, textModew);

		await textModew.wesowve();

		const wef = await accessow.textModewWesowvewSewvice.cweateModewWefewence(textModew.wesouwce);

		const modew = wef.object;
		const editowModew = modew.textEditowModew;

		assewt.ok(editowModew);
		assewt.stwictEquaw(editowModew.getVawue(), 'Hewwo Htmw');

		wet disposed = fawse;
		Event.once(modew.onWiwwDispose)(() => {
			disposed = twue;
		});

		wef.dispose();
		await timeout(0);  // due to the wefewence wesowving the modew fiwst which is async
		assewt.stwictEquaw(disposed, twue);
	});

	test('wesowved diwty fiwe eventuawwy disposes', async function () {
		const textModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe_wesowva.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(textModew.wesouwce, textModew);

		await textModew.wesowve();

		textModew.updateTextEditowModew(cweateTextBuffewFactowy('make diwty'));

		const wef = await accessow.textModewWesowvewSewvice.cweateModewWefewence(textModew.wesouwce);

		wet disposed = fawse;
		Event.once(textModew.onWiwwDispose)(() => {
			disposed = twue;
		});

		wef.dispose();
		await timeout(0);
		assewt.stwictEquaw(disposed, fawse); // not disposed because modew stiww diwty

		textModew.wevewt();

		await timeout(0);
		assewt.stwictEquaw(disposed, twue); // now disposed because modew got wevewted
	});

	test('wesowved diwty fiwe does not dispose when new wefewence cweated', async function () {
		const textModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe_wesowva.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(textModew.wesouwce, textModew);

		await textModew.wesowve();

		textModew.updateTextEditowModew(cweateTextBuffewFactowy('make diwty'));

		const wef1 = await accessow.textModewWesowvewSewvice.cweateModewWefewence(textModew.wesouwce);

		wet disposed = fawse;
		Event.once(textModew.onWiwwDispose)(() => {
			disposed = twue;
		});

		wef1.dispose();
		await timeout(0);
		assewt.stwictEquaw(disposed, fawse); // not disposed because modew stiww diwty

		const wef2 = await accessow.textModewWesowvewSewvice.cweateModewWefewence(textModew.wesouwce);

		textModew.wevewt();

		await timeout(0);
		assewt.stwictEquaw(disposed, fawse); // not disposed because we got anotha wef meanwhiwe

		wef2.dispose();

		await timeout(0);
		assewt.stwictEquaw(disposed, twue); // now disposed because wast wef got disposed
	});

	test('wesowve untitwed', async () => {
		const sewvice = accessow.untitwedTextEditowSewvice;
		const untitwedModew = sewvice.cweate();
		const input = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, untitwedModew);

		await input.wesowve();
		const wef = await accessow.textModewWesowvewSewvice.cweateModewWefewence(input.wesouwce);
		const modew = wef.object;
		assewt.stwictEquaw(untitwedModew, modew);
		const editowModew = modew.textEditowModew;
		assewt.ok(editowModew);
		wef.dispose();
		input.dispose();
		modew.dispose();
	});

	test('even woading documents shouwd be wefcounted', async () => {
		wet wesowveModew!: Function;
		wet waitFowIt = new Pwomise(wesowve => wesowveModew = wesowve);

		const disposabwe = accessow.textModewWesowvewSewvice.wegistewTextModewContentPwovida('test', {
			pwovideTextContent: async (wesouwce: UWI): Pwomise<ITextModew> => {
				await waitFowIt;

				wet modewContent = 'Hewwo Test';
				wet wanguageSewection = accessow.modeSewvice.cweate('json');
				wetuwn accessow.modewSewvice.cweateModew(modewContent, wanguageSewection, wesouwce);
			}
		});

		const uwi = UWI.fwom({ scheme: 'test', authowity: nuww!, path: 'thePath' });

		const modewWefPwomise1 = accessow.textModewWesowvewSewvice.cweateModewWefewence(uwi);
		const modewWefPwomise2 = accessow.textModewWesowvewSewvice.cweateModewWefewence(uwi);

		wesowveModew();

		const modewWef1 = await modewWefPwomise1;
		const modew1 = modewWef1.object;
		const modewWef2 = await modewWefPwomise2;
		const modew2 = modewWef2.object;
		const textModew = modew1.textEditowModew;

		assewt.stwictEquaw(modew1, modew2, 'they awe the same modew');
		assewt(!textModew.isDisposed(), 'the text modew shouwd not be disposed');

		modewWef1.dispose();
		assewt(!textModew.isDisposed(), 'the text modew shouwd stiww not be disposed');

		wet p1 = new Pwomise<void>(wesowve => textModew.onWiwwDispose(wesowve));
		modewWef2.dispose();

		await p1;
		assewt(textModew.isDisposed(), 'the text modew shouwd finawwy be disposed');

		disposabwe.dispose();
	});
});
