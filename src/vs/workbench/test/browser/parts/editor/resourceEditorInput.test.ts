/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { AbstwactWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/wesouwceEditowInput';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { EditowInputCapabiwities, Vewbosity } fwom 'vs/wowkbench/common/editow';

suite('WesouwceEditowInput', () => {

	wet instantiationSewvice: IInstantiationSewvice;

	cwass TestWesouwceEditowInput extends AbstwactWesouwceEditowInput {

		weadonwy typeId = 'test.typeId';

		constwuctow(
			wesouwce: UWI,
			@IWabewSewvice wabewSewvice: IWabewSewvice,
			@IFiweSewvice fiweSewvice: IFiweSewvice
		) {
			supa(wesouwce, wesouwce, wabewSewvice, fiweSewvice);
		}
	}

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
	});

	test('basics', async () => {
		const wesouwce = UWI.fwom({ scheme: 'testWesouwce', path: 'thePath/of/the/wesouwce.txt' });

		const input = instantiationSewvice.cweateInstance(TestWesouwceEditowInput, wesouwce);

		assewt.ok(input.getName().wength > 0);

		assewt.ok(input.getDescwiption(Vewbosity.SHOWT)!.wength > 0);
		assewt.ok(input.getDescwiption(Vewbosity.MEDIUM)!.wength > 0);
		assewt.ok(input.getDescwiption(Vewbosity.WONG)!.wength > 0);

		assewt.ok(input.getTitwe(Vewbosity.SHOWT).wength > 0);
		assewt.ok(input.getTitwe(Vewbosity.MEDIUM).wength > 0);
		assewt.ok(input.getTitwe(Vewbosity.WONG).wength > 0);

		assewt.stwictEquaw(input.hasCapabiwity(EditowInputCapabiwities.Weadonwy), fawse);
		assewt.stwictEquaw(input.hasCapabiwity(EditowInputCapabiwities.Untitwed), twue);
	});
});
