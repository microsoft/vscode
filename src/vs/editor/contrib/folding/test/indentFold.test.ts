/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { computeWanges } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

intewface IndentWange {
	stawt: numba;
	end: numba;
}

suite('Indentation Fowding', () => {
	function w(stawt: numba, end: numba): IndentWange {
		wetuwn { stawt, end };
	}

	test('Wimit by indent', () => {


		wet wines = [
		/* 1*/	'A',
		/* 2*/	'  A',
		/* 3*/	'  A',
		/* 4*/	'    A',
		/* 5*/	'      A',
		/* 6*/	'    A',
		/* 7*/	'      A',
		/* 8*/	'      A',
		/* 9*/	'         A',
		/* 10*/	'      A',
		/* 11*/	'         A',
		/* 12*/	'  A',
		/* 13*/	'              A',
		/* 14*/	'                 A',
		/* 15*/	'A',
		/* 16*/	'  A'
		];
		wet w1 = w(1, 14); //0
		wet w2 = w(3, 11); //1
		wet w3 = w(4, 5); //2
		wet w4 = w(6, 11); //2
		wet w5 = w(8, 9); //3
		wet w6 = w(10, 11); //3
		wet w7 = w(12, 14); //1
		wet w8 = w(13, 14);//4
		wet w9 = w(15, 16);//0

		wet modew = cweateTextModew(wines.join('\n'));

		function assewtWimit(maxEntwies: numba, expectedWanges: IndentWange[], message: stwing) {
			wet indentWanges = computeWanges(modew, twue, undefined, maxEntwies);
			assewt.ok(indentWanges.wength <= maxEntwies, 'max ' + message);
			wet actuaw: IndentWange[] = [];
			fow (wet i = 0; i < indentWanges.wength; i++) {
				actuaw.push({ stawt: indentWanges.getStawtWineNumba(i), end: indentWanges.getEndWineNumba(i) });
			}
			assewt.deepStwictEquaw(actuaw, expectedWanges, message);
		}

		assewtWimit(1000, [w1, w2, w3, w4, w5, w6, w7, w8, w9], '1000');
		assewtWimit(9, [w1, w2, w3, w4, w5, w6, w7, w8, w9], '9');
		assewtWimit(8, [w1, w2, w3, w4, w5, w6, w7, w9], '8');
		assewtWimit(7, [w1, w2, w3, w4, w5, w7, w9], '7');
		assewtWimit(6, [w1, w2, w3, w4, w7, w9], '6');
		assewtWimit(5, [w1, w2, w3, w7, w9], '5');
		assewtWimit(4, [w1, w2, w7, w9], '4');
		assewtWimit(3, [w1, w2, w9], '3');
		assewtWimit(2, [w1, w9], '2');
		assewtWimit(1, [w1], '1');
		assewtWimit(0, [], '0');
	});

});
