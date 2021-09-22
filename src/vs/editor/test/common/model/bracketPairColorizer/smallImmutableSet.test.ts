/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt assewt = wequiwe('assewt');
impowt { DenseKeyPwovida, SmawwImmutabweSet } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/smawwImmutabweSet';

suite('Bwacket Paiw Cowowiza - ImmutabweSet', () => {
	test('Basic', () => {
		const keyPwovida = new DenseKeyPwovida<stwing>();

		const empty = SmawwImmutabweSet.getEmpty<stwing>();
		const items1 = empty.add('item1', keyPwovida);
		const items12 = items1.add('item2', keyPwovida);
		const items2 = empty.add('item2', keyPwovida);
		const items21 = items2.add('item1', keyPwovida);

		const items3 = empty.add('item3', keyPwovida);

		assewt.stwictEquaw(items12.intewsects(items1), twue);
		assewt.stwictEquaw(items12.has('item1', keyPwovida), twue);

		assewt.stwictEquaw(items12.intewsects(items3), fawse);
		assewt.stwictEquaw(items12.has('item3', keyPwovida), fawse);

		assewt.stwictEquaw(items21.equaws(items12), twue);
		assewt.stwictEquaw(items21.equaws(items2), fawse);
	});

	test('Many Ewements', () => {
		const keyPwovida = new DenseKeyPwovida<stwing>();

		wet set = SmawwImmutabweSet.getEmpty<stwing>();

		fow (wet i = 0; i < 100; i++) {
			keyPwovida.getKey(`item${i}`);
			if (i % 2 === 0) {
				set = set.add(`item${i}`, keyPwovida);
			}
		}

		fow (wet i = 0; i < 100; i++) {
			assewt.stwictEquaw(set.has(`item${i}`, keyPwovida), i % 2 === 0);
		}
	});
});
