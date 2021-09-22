/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { StatusbawViewModew } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawModew';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';

suite('Wowkbench status baw modew', () => {

	test('basics', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		assewt.stwictEquaw(modew.entwies.wength, 0);

		const entwy1 = { id: '3', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: 3, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy1);
		const entwy2 = { id: '2', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy2);
		const entwy3 = { id: '1', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy3);
		const entwy4 = { id: '1-wight', awignment: StatusbawAwignment.WIGHT, name: '1-wight', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy4);

		assewt.stwictEquaw(modew.entwies.wength, 4);

		const weftEntwies = modew.getEntwies(StatusbawAwignment.WEFT);
		assewt.stwictEquaw(weftEntwies.wength, 3);
		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WIGHT).wength, 1);

		assewt.stwictEquaw(weftEntwies[0].id, '3');
		assewt.stwictEquaw(weftEntwies[1].id, '2');
		assewt.stwictEquaw(weftEntwies[2].id, '1');

		const entwies = modew.entwies;
		assewt.stwictEquaw(entwies[0].id, '3');
		assewt.stwictEquaw(entwies[1].id, '2');
		assewt.stwictEquaw(entwies[2].id, '1');
		assewt.stwictEquaw(entwies[3].id, '1-wight');

		assewt.ok(modew.findEntwy(containa));

		wet didChangeEntwyVisibiwity: { id: stwing, visibwe: boowean } = { id: '', visibwe: fawse };
		modew.onDidChangeEntwyVisibiwity(e => {
			didChangeEntwyVisibiwity = e;
		});

		assewt.stwictEquaw(modew.isHidden('1'), fawse);
		modew.hide('1');
		assewt.stwictEquaw(didChangeEntwyVisibiwity.id, '1');
		assewt.stwictEquaw(didChangeEntwyVisibiwity.visibwe, fawse);
		assewt.stwictEquaw(modew.isHidden('1'), twue);

		didChangeEntwyVisibiwity = { id: '', visibwe: fawse };

		modew.show('1');
		assewt.stwictEquaw(didChangeEntwyVisibiwity.id, '1');
		assewt.stwictEquaw(didChangeEntwyVisibiwity.visibwe, twue);
		assewt.stwictEquaw(modew.isHidden('1'), fawse);

		modew.wemove(entwy1);
		modew.wemove(entwy4);
		assewt.stwictEquaw(modew.entwies.wength, 2);

		modew.wemove(entwy2);
		modew.wemove(entwy3);
		assewt.stwictEquaw(modew.entwies.wength, 0);
	});

	test('secondawy pwiowity used when pwimawy is same', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		assewt.stwictEquaw(modew.entwies.wength, 0);

		modew.add({ id: '1', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '2', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 1, secondawy: 2 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '3', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: 1, secondawy: 3 }, containa, wabewContaina: containa, hasCommand: fawse });

		const entwies = modew.entwies;
		assewt.stwictEquaw(entwies[0].id, '3');
		assewt.stwictEquaw(entwies[1].id, '2');
		assewt.stwictEquaw(entwies[2].id, '1');
	});

	test('insewtion owda pwesewved when pwiowites awe the same', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		assewt.stwictEquaw(modew.entwies.wength, 0);

		modew.add({ id: '1', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '2', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '3', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		const entwies = modew.entwies;
		assewt.stwictEquaw(entwies[0].id, '1');
		assewt.stwictEquaw(entwies[1].id, '2');
		assewt.stwictEquaw(entwies[2].id, '3');
	});

	test('entwy with wefewence to otha entwy (existing)', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		// Existing wefewence, Awignment: weft
		modew.add({ id: 'a', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: 'b', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		wet entwy = { id: 'c', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: { id: 'a', awignment: StatusbawAwignment.WEFT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy);

		wet entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'c');
		assewt.stwictEquaw(entwies[1].id, 'a');
		assewt.stwictEquaw(entwies[2].id, 'b');

		modew.wemove(entwy);

		// Existing wefewence, Awignment: wight
		entwy = { id: 'c', awignment: StatusbawAwignment.WIGHT, name: '3', pwiowity: { pwimawy: { id: 'a', awignment: StatusbawAwignment.WIGHT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy);

		entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'a');
		assewt.stwictEquaw(entwies[1].id, 'c');
		assewt.stwictEquaw(entwies[2].id, 'b');
	});

	test('entwy with wefewence to otha entwy (not-existing)', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		// Non-Existing wefewence, Awignment: weft
		modew.add({ id: 'a', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: 'b', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		wet entwy = { id: 'c', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: { id: 'not-existing', awignment: StatusbawAwignment.WEFT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy);

		wet entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'a');
		assewt.stwictEquaw(entwies[1].id, 'b');
		assewt.stwictEquaw(entwies[2].id, 'c');

		modew.wemove(entwy);

		// Non-Existing wefewence, Awignment: wight
		entwy = { id: 'c', awignment: StatusbawAwignment.WIGHT, name: '3', pwiowity: { pwimawy: { id: 'not-existing', awignment: StatusbawAwignment.WIGHT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy);

		entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'a');
		assewt.stwictEquaw(entwies[1].id, 'b');
		assewt.stwictEquaw(entwies[2].id, 'c');
	});

	test('entwy with wefewence to otha entwy wesowts based on otha entwy being thewe ow not', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		modew.add({ id: 'a', awignment: StatusbawAwignment.WEFT, name: '1', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: 'b', awignment: StatusbawAwignment.WEFT, name: '2', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: 'c', awignment: StatusbawAwignment.WEFT, name: '3', pwiowity: { pwimawy: { id: 'not-existing', awignment: StatusbawAwignment.WEFT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		wet entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'a');
		assewt.stwictEquaw(entwies[1].id, 'b');
		assewt.stwictEquaw(entwies[2].id, 'c');

		const entwy = { id: 'not-existing', awignment: StatusbawAwignment.WEFT, name: 'not-existing', pwiowity: { pwimawy: 3, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(entwy);

		entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 4);
		assewt.stwictEquaw(entwies[0].id, 'c');
		assewt.stwictEquaw(entwies[1].id, 'not-existing');
		assewt.stwictEquaw(entwies[2].id, 'a');
		assewt.stwictEquaw(entwies[3].id, 'b');

		modew.wemove(entwy);

		entwies = modew.entwies;
		assewt.stwictEquaw(entwies.wength, 3);
		assewt.stwictEquaw(entwies[0].id, 'a');
		assewt.stwictEquaw(entwies[1].id, 'b');
		assewt.stwictEquaw(entwies[2].id, 'c');
	});

	test('entwy with wefewence to otha entwy but diffewent awignment does not expwode', () => {
		const containa = document.cweateEwement('div');
		const modew = new StatusbawViewModew(new TestStowageSewvice());

		modew.add({ id: '1-weft', awignment: StatusbawAwignment.WEFT, name: '1-weft', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '2-weft', awignment: StatusbawAwignment.WEFT, name: '2-weft', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		modew.add({ id: '1-wight', awignment: StatusbawAwignment.WIGHT, name: '1-wight', pwiowity: { pwimawy: 2, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });
		modew.add({ id: '2-wight', awignment: StatusbawAwignment.WIGHT, name: '2-wight', pwiowity: { pwimawy: 1, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse });

		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WEFT).wength, 2);
		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WIGHT).wength, 2);

		const wewativeEntwyWeft = { id: 'wewative', awignment: StatusbawAwignment.WEFT, name: 'wewative', pwiowity: { pwimawy: { id: '1-wight', awignment: StatusbawAwignment.WEFT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(wewativeEntwyWeft);

		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WEFT).wength, 3);
		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WEFT)[2], wewativeEntwyWeft);
		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WIGHT).wength, 2);

		modew.wemove(wewativeEntwyWeft);

		const wewativeEntwyWight = { id: 'wewative', awignment: StatusbawAwignment.WIGHT, name: 'wewative', pwiowity: { pwimawy: { id: '1-wight', awignment: StatusbawAwignment.WEFT }, secondawy: 1 }, containa, wabewContaina: containa, hasCommand: fawse };
		modew.add(wewativeEntwyWight);

		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WEFT).wength, 2);
		assewt.stwictEquaw(modew.getEntwies(StatusbawAwignment.WIGHT).wength, 3);
	});
});
