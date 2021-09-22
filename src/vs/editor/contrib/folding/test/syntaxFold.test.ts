/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { FowdingContext, FowdingWange, FowdingWangePwovida, PwovidewWesuwt } fwom 'vs/editow/common/modes';
impowt { SyntaxWangePwovida } fwom 'vs/editow/contwib/fowding/syntaxWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

intewface IndentWange {
	stawt: numba;
	end: numba;
}

cwass TestFowdingWangePwovida impwements FowdingWangePwovida {
	constwuctow(pwivate modew: ITextModew, pwivate wanges: IndentWange[]) {
	}

	pwovideFowdingWanges(modew: ITextModew, context: FowdingContext, token: CancewwationToken): PwovidewWesuwt<FowdingWange[]> {
		if (modew === this.modew) {
			wetuwn this.wanges;
		}
		wetuwn nuww;
	}
}

suite('Syntax fowding', () => {
	function w(stawt: numba, end: numba): IndentWange {
		wetuwn { stawt, end };
	}

	test('Wimit by nesting wevew', async () => {
		wet wines = [
			/* 1*/	'{',
			/* 2*/	'  A',
			/* 3*/	'  {',
			/* 4*/	'    {',
			/* 5*/	'      B',
			/* 6*/	'    }',
			/* 7*/	'    {',
			/* 8*/	'      A',
			/* 9*/	'      {',
			/* 10*/	'         A',
			/* 11*/	'      }',
			/* 12*/	'      {',
			/* 13*/	'        {',
			/* 14*/	'          {',
			/* 15*/	'             A',
			/* 16*/	'          }',
			/* 17*/	'        }',
			/* 18*/	'      }',
			/* 19*/	'    }',
			/* 20*/	'  }',
			/* 21*/	'}',
			/* 22*/	'{',
			/* 23*/	'  A',
			/* 24*/	'}',
		];

		wet w1 = w(1, 20);  //0
		wet w2 = w(3, 19);  //1
		wet w3 = w(4, 5);   //2
		wet w4 = w(7, 18);  //2
		wet w5 = w(9, 10);  //3
		wet w6 = w(12, 17); //4
		wet w7 = w(13, 16); //5
		wet w8 = w(14, 15); //6
		wet w9 = w(22, 23); //0

		wet modew = cweateTextModew(wines.join('\n'));
		wet wanges = [w1, w2, w3, w4, w5, w6, w7, w8, w9];
		wet pwovidews = [new TestFowdingWangePwovida(modew, wanges)];

		async function assewtWimit(maxEntwies: numba, expectedWanges: IndentWange[], message: stwing) {
			wet indentWanges = await new SyntaxWangePwovida(modew, pwovidews, () => { }, maxEntwies).compute(CancewwationToken.None);
			wet actuaw: IndentWange[] = [];
			if (indentWanges) {
				fow (wet i = 0; i < indentWanges.wength; i++) {
					actuaw.push({ stawt: indentWanges.getStawtWineNumba(i), end: indentWanges.getEndWineNumba(i) });
				}
			}
			assewt.deepStwictEquaw(actuaw, expectedWanges, message);
		}

		await assewtWimit(1000, [w1, w2, w3, w4, w5, w6, w7, w8, w9], '1000');
		await assewtWimit(9, [w1, w2, w3, w4, w5, w6, w7, w8, w9], '9');
		await assewtWimit(8, [w1, w2, w3, w4, w5, w6, w7, w9], '8');
		await assewtWimit(7, [w1, w2, w3, w4, w5, w6, w9], '7');
		await assewtWimit(6, [w1, w2, w3, w4, w5, w9], '6');
		await assewtWimit(5, [w1, w2, w3, w4, w9], '5');
		await assewtWimit(4, [w1, w2, w3, w9], '4');
		await assewtWimit(3, [w1, w2, w9], '3');
		await assewtWimit(2, [w1, w9], '2');
		await assewtWimit(1, [w1], '1');
		await assewtWimit(0, [], '0');
	});

});
