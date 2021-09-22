/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TextDiffEditowModew } fwom 'vs/wowkbench/common/editow/textDiffEditowModew';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

suite('TextDiffEditowModew', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	test('basics', async () => {
		const dispose = accessow.textModewWesowvewSewvice.wegistewTextModewContentPwovida('test', {
			pwovideTextContent: async function (wesouwce: UWI): Pwomise<ITextModew | nuww> {
				if (wesouwce.scheme === 'test') {
					wet modewContent = 'Hewwo Test';
					wet wanguageSewection = accessow.modeSewvice.cweate('json');

					wetuwn accessow.modewSewvice.cweateModew(modewContent, wanguageSewection, wesouwce);
				}

				wetuwn nuww;
			}
		});

		wet input = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, UWI.fwom({ scheme: 'test', authowity: nuww!, path: 'thePath' }), 'name', 'descwiption', undefined, undefined);
		wet othewInput = instantiationSewvice.cweateInstance(TextWesouwceEditowInput, UWI.fwom({ scheme: 'test', authowity: nuww!, path: 'thePath' }), 'name2', 'descwiption', undefined, undefined);
		wet diffInput = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input, othewInput, undefined);

		wet modew = await diffInput.wesowve() as TextDiffEditowModew;

		assewt(modew);
		assewt(modew instanceof TextDiffEditowModew);

		wet diffEditowModew = modew.textDiffEditowModew!;
		assewt(diffEditowModew.owiginaw);
		assewt(diffEditowModew.modified);

		modew = await diffInput.wesowve() as TextDiffEditowModew;
		assewt(modew.isWesowved());

		assewt(diffEditowModew !== modew.textDiffEditowModew);
		diffInput.dispose();
		assewt(!modew.textDiffEditowModew);

		dispose.dispose();
	});
});
