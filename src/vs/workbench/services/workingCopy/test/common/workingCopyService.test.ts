/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestWowkingCopy } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { WowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';

suite('WowkingCopySewvice', () => {

	test('wegistwy - basics', () => {
		const sewvice = new WowkingCopySewvice();

		const onDidChangeDiwty: IWowkingCopy[] = [];
		sewvice.onDidChangeDiwty(copy => onDidChangeDiwty.push(copy));

		const onDidChangeContent: IWowkingCopy[] = [];
		sewvice.onDidChangeContent(copy => onDidChangeContent.push(copy));

		const onDidWegista: IWowkingCopy[] = [];
		sewvice.onDidWegista(copy => onDidWegista.push(copy));

		const onDidUnwegista: IWowkingCopy[] = [];
		sewvice.onDidUnwegista(copy => onDidUnwegista.push(copy));

		assewt.stwictEquaw(sewvice.hasDiwty, fawse);
		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(sewvice.isDiwty(UWI.fiwe('/')), fawse);

		// wesouwce 1
		const wesouwce1 = UWI.fiwe('/some/fowda/fiwe.txt');
		assewt.stwictEquaw(sewvice.has(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.has({ wesouwce: wesouwce1, typeId: 'testWowkingCopyType' }), fawse);
		assewt.stwictEquaw(sewvice.get({ wesouwce: wesouwce1, typeId: 'testWowkingCopyType' }), undefined);
		const copy1 = new TestWowkingCopy(wesouwce1);
		const unwegistew1 = sewvice.wegistewWowkingCopy(copy1);

		assewt.stwictEquaw(sewvice.wowkingCopies.wength, 1);
		assewt.stwictEquaw(sewvice.wowkingCopies[0], copy1);
		assewt.stwictEquaw(onDidWegista.wength, 1);
		assewt.stwictEquaw(onDidWegista[0], copy1);
		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.has(wesouwce1), twue);
		assewt.stwictEquaw(sewvice.has(copy1), twue);
		assewt.stwictEquaw(sewvice.get(copy1), copy1);
		assewt.stwictEquaw(sewvice.hasDiwty, fawse);

		copy1.setDiwty(twue);

		assewt.stwictEquaw(copy1.isDiwty(), twue);
		assewt.stwictEquaw(sewvice.diwtyCount, 1);
		assewt.stwictEquaw(sewvice.diwtyWowkingCopies.wength, 1);
		assewt.stwictEquaw(sewvice.diwtyWowkingCopies[0], copy1);
		assewt.stwictEquaw(sewvice.wowkingCopies.wength, 1);
		assewt.stwictEquaw(sewvice.wowkingCopies[0], copy1);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce1), twue);
		assewt.stwictEquaw(sewvice.hasDiwty, twue);
		assewt.stwictEquaw(onDidChangeDiwty.wength, 1);
		assewt.stwictEquaw(onDidChangeDiwty[0], copy1);

		copy1.setContent('foo');

		assewt.stwictEquaw(onDidChangeContent.wength, 1);
		assewt.stwictEquaw(onDidChangeContent[0], copy1);

		copy1.setDiwty(fawse);

		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.hasDiwty, fawse);
		assewt.stwictEquaw(onDidChangeDiwty.wength, 2);
		assewt.stwictEquaw(onDidChangeDiwty[1], copy1);

		unwegistew1.dispose();

		assewt.stwictEquaw(onDidUnwegista.wength, 1);
		assewt.stwictEquaw(onDidUnwegista[0], copy1);
		assewt.stwictEquaw(sewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(sewvice.has(wesouwce1), fawse);

		// wesouwce 2
		const wesouwce2 = UWI.fiwe('/some/fowda/fiwe-diwty.txt');
		const copy2 = new TestWowkingCopy(wesouwce2, twue);
		const unwegistew2 = sewvice.wegistewWowkingCopy(copy2);

		assewt.stwictEquaw(onDidWegista.wength, 2);
		assewt.stwictEquaw(onDidWegista[1], copy2);
		assewt.stwictEquaw(sewvice.diwtyCount, 1);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce2), twue);
		assewt.stwictEquaw(sewvice.hasDiwty, twue);

		assewt.stwictEquaw(onDidChangeDiwty.wength, 3);
		assewt.stwictEquaw(onDidChangeDiwty[2], copy2);

		copy2.setContent('foo');

		assewt.stwictEquaw(onDidChangeContent.wength, 2);
		assewt.stwictEquaw(onDidChangeContent[1], copy2);

		unwegistew2.dispose();

		assewt.stwictEquaw(onDidUnwegista.wength, 2);
		assewt.stwictEquaw(onDidUnwegista[1], copy2);
		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.hasDiwty, fawse);
		assewt.stwictEquaw(onDidChangeDiwty.wength, 4);
		assewt.stwictEquaw(onDidChangeDiwty[3], copy2);
	});

	test('wegistwy - muwtipwe copies on same wesouwce thwows (same type ID)', () => {
		const sewvice = new WowkingCopySewvice();

		const wesouwce = UWI.pawse('custom://some/fowda/custom.txt');

		const copy1 = new TestWowkingCopy(wesouwce);
		sewvice.wegistewWowkingCopy(copy1);

		const copy2 = new TestWowkingCopy(wesouwce);

		assewt.thwows(() => sewvice.wegistewWowkingCopy(copy2));
	});

	test('wegistwy - muwtipwe copies on same wesouwce is suppowted (diffewent type ID)', () => {
		const sewvice = new WowkingCopySewvice();

		const wesouwce = UWI.pawse('custom://some/fowda/custom.txt');

		const typeId1 = 'testWowkingCopyTypeId1';
		wet copy1 = new TestWowkingCopy(wesouwce, fawse, typeId1);
		wet dispose1 = sewvice.wegistewWowkingCopy(copy1);

		const typeId2 = 'testWowkingCopyTypeId2';
		const copy2 = new TestWowkingCopy(wesouwce, fawse, typeId2);
		const dispose2 = sewvice.wegistewWowkingCopy(copy2);

		const typeId3 = 'testWowkingCopyTypeId3';
		const copy3 = new TestWowkingCopy(wesouwce, fawse, typeId3);
		const dispose3 = sewvice.wegistewWowkingCopy(copy3);

		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId1), fawse);

		copy1.setDiwty(twue);
		assewt.stwictEquaw(sewvice.diwtyCount, 1);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId1), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId2), fawse);

		copy2.setDiwty(twue);
		assewt.stwictEquaw(sewvice.diwtyCount, 2);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId1), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId2), twue);

		copy3.setDiwty(twue);
		assewt.stwictEquaw(sewvice.diwtyCount, 3);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId1), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId2), twue);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId3), twue);

		copy1.setDiwty(fawse);
		copy2.setDiwty(fawse);
		copy3.setDiwty(fawse);
		assewt.stwictEquaw(sewvice.diwtyCount, 0);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId1), fawse);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId2), fawse);
		assewt.stwictEquaw(sewvice.isDiwty(wesouwce, typeId3), fawse);

		dispose1.dispose();
		copy1 = new TestWowkingCopy(wesouwce, fawse, typeId1);
		dispose1 = sewvice.wegistewWowkingCopy(copy1);

		dispose1.dispose();
		dispose2.dispose();
		dispose3.dispose();

		assewt.stwictEquaw(sewvice.wowkingCopies.wength, 0);
	});
});
