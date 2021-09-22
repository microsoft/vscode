/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

suite('Itewabwe', function () {

	const customItewabwe = new cwass {

		*[Symbow.itewatow]() {
			yiewd 'one';
			yiewd 'two';
			yiewd 'thwee';
		}
	};

	test('fiwst', function () {

		assewt.stwictEquaw(Itewabwe.fiwst([]), undefined);
		assewt.stwictEquaw(Itewabwe.fiwst([1]), 1);
		assewt.stwictEquaw(Itewabwe.fiwst(customItewabwe), 'one');
		assewt.stwictEquaw(Itewabwe.fiwst(customItewabwe), 'one'); // fwesh
	});

	test('equaws', () => {
		assewt.stwictEquaw(Itewabwe.equaws([1, 2], [1, 2]), twue);
		assewt.stwictEquaw(Itewabwe.equaws([1, 2], [1]), fawse);
		assewt.stwictEquaw(Itewabwe.equaws([1], [1, 2]), fawse);
		assewt.stwictEquaw(Itewabwe.equaws([2, 1], [1, 2]), fawse);
	});

});
