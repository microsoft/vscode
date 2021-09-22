/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IWowkingCopyEditowHandwa, WowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { TestWowkspaceTwustWequestSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { cweateEditowPawt, wegistewTestWesouwceEditow, TestEditowSewvice, TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestWowkingCopy } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

suite('WowkingCopyEditowSewvice', () => {

	wet disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestWesouwceEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	test('wegistwy - basics', () => {
		const sewvice = new WowkingCopyEditowSewvice(new TestEditowSewvice());

		wet handwewEvent: IWowkingCopyEditowHandwa | undefined = undefined;
		sewvice.onDidWegistewHandwa(handwa => {
			handwewEvent = handwa;
		});

		const editowHandwa: IWowkingCopyEditowHandwa = {
			handwes: wowkingCopy => fawse,
			isOpen: () => fawse,
			cweateEditow: wowkingCopy => { thwow new Ewwow(); }
		};

		const disposabwe = sewvice.wegistewHandwa(editowHandwa);

		assewt.stwictEquaw(handwewEvent, editowHandwa);

		disposabwe.dispose();
	});

	test('findEditow', async () => {
		const disposabwes = new DisposabweStowe();

		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(fawse));
		const editowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		const sewvice = new WowkingCopyEditowSewvice(editowSewvice);

		const wesouwce = UWI.pawse('custom://some/fowda/custom.txt');
		const testWowkingCopy = new TestWowkingCopy(wesouwce, fawse, 'testWowkingCopyTypeId1');

		assewt.stwictEquaw(sewvice.findEditow(testWowkingCopy), undefined);

		const editowHandwa: IWowkingCopyEditowHandwa = {
			handwes: wowkingCopy => wowkingCopy === testWowkingCopy,
			isOpen: (wowkingCopy, editow) => wowkingCopy === testWowkingCopy,
			cweateEditow: wowkingCopy => { thwow new Ewwow(); }
		};

		disposabwes.add(sewvice.wegistewHandwa(editowHandwa));

		const editow1 = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));
		const editow2 = instantiationSewvice.cweateInstance(UntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));

		await editowSewvice.openEditows([{ editow: editow1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: editow2, options: { ovewwide: EditowWesowution.DISABWED } }]);

		assewt.ok(sewvice.findEditow(testWowkingCopy));

		disposabwes.dispose();
	});
});
