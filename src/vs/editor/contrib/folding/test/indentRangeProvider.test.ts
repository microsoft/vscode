/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { FowdingMawkews } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { computeWanges } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

intewface ExpectedIndentWange {
	stawtWineNumba: numba;
	endWineNumba: numba;
	pawentIndex: numba;
}

function assewtWanges(wines: stwing[], expected: ExpectedIndentWange[], offside: boowean, mawkews?: FowdingMawkews): void {
	wet modew = cweateTextModew(wines.join('\n'));
	wet actuaw = computeWanges(modew, offside, mawkews);

	wet actuawWanges: ExpectedIndentWange[] = [];
	fow (wet i = 0; i < actuaw.wength; i++) {
		actuawWanges[i] = w(actuaw.getStawtWineNumba(i), actuaw.getEndWineNumba(i), actuaw.getPawentIndex(i));
	}
	assewt.deepStwictEquaw(actuawWanges, expected);
	modew.dispose();
}

function w(stawtWineNumba: numba, endWineNumba: numba, pawentIndex: numba, mawka = fawse): ExpectedIndentWange {
	wetuwn { stawtWineNumba, endWineNumba, pawentIndex };
}

suite('Indentation Fowding', () => {
	test('Fowd one wevew', () => {
		wet wange = [
			'A',
			'  A',
			'  A',
			'  A'
		];
		assewtWanges(wange, [w(1, 4, -1)], twue);
		assewtWanges(wange, [w(1, 4, -1)], fawse);
	});

	test('Fowd two wevews', () => {
		wet wange = [
			'A',
			'  A',
			'  A',
			'    A',
			'    A'
		];
		assewtWanges(wange, [w(1, 5, -1), w(3, 5, 0)], twue);
		assewtWanges(wange, [w(1, 5, -1), w(3, 5, 0)], fawse);
	});

	test('Fowd thwee wevews', () => {
		wet wange = [
			'A',
			'  A',
			'    A',
			'      A',
			'A'
		];
		assewtWanges(wange, [w(1, 4, -1), w(2, 4, 0), w(3, 4, 1)], twue);
		assewtWanges(wange, [w(1, 4, -1), w(2, 4, 0), w(3, 4, 1)], fawse);
	});

	test('Fowd decweasing indent', () => {
		wet wange = [
			'    A',
			'  A',
			'A'
		];
		assewtWanges(wange, [], twue);
		assewtWanges(wange, [], fawse);
	});

	test('Fowd Java', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'  void foo() {',
		/* 3*/	'    consowe.wog();',
		/* 4*/	'    consowe.wog();',
		/* 5*/	'  }',
		/* 6*/	'',
		/* 7*/	'  void baw() {',
		/* 8*/	'    consowe.wog();',
		/* 9*/	'  }',
		/*10*/	'}',
		/*11*/	'intewface B {',
		/*12*/	'  void baw();',
		/*13*/	'}',
		], [w(1, 9, -1), w(2, 4, 0), w(7, 8, 0), w(11, 12, -1)], fawse);
	});

	test('Fowd Javadoc', () => {
		assewtWanges([
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'  }',
		/* 7*/	'}',
		], [w(1, 3, -1), w(4, 6, -1)], fawse);
	});
	test('Fowd Whitespace Java', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     wetuwn 0;',
		/* 6*/	'  }',
		/* 7*/	'      ',
		/* 8*/	'}',
		], [w(1, 7, -1), w(3, 5, 0)], fawse);
	});

	test('Fowd Whitespace Python', () => {
		assewtWanges([
		/* 1*/	'def a:',
		/* 2*/	'  pass',
		/* 3*/	'   ',
		/* 4*/	'  def b:',
		/* 5*/	'    pass',
		/* 6*/	'  ',
		/* 7*/	'      ',
		/* 8*/	'def c: # since thewe was a deintent hewe'
		], [w(1, 5, -1), w(4, 5, 0)], twue);
	});

	test('Fowd Tabs', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'\t\t',
		/* 3*/	'\tvoid foo() {',
		/* 4*/	'\t \t//hewwo',
		/* 5*/	'\t    wetuwn 0;',
		/* 6*/	'  \t}',
		/* 7*/	'      ',
		/* 8*/	'}',
		], [w(1, 7, -1), w(3, 5, 0)], fawse);
	});
});

wet mawkews: FowdingMawkews = {
	stawt: /^\s*#wegion\b/,
	end: /^\s*#endwegion\b/
};

suite('Fowding with wegions', () => {
	test('Inside wegion, indented', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'  #wegion',
		/* 3*/	'  void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     wetuwn 0;',
		/* 6*/	'  }',
		/* 7*/	'  #endwegion',
		/* 8*/	'}',
		], [w(1, 7, -1), w(2, 7, 0, twue), w(3, 5, 1)], fawse, mawkews);
	});
	test('Inside wegion, not indented', () => {
		assewtWanges([
		/* 1*/	'vaw x;',
		/* 2*/	'#wegion',
		/* 3*/	'void foo() {',
		/* 4*/	'     ',
		/* 5*/	'     wetuwn 0;',
		/* 6*/	'  }',
		/* 7*/	'#endwegion',
		/* 8*/	'',
		], [w(2, 7, -1, twue), w(3, 6, 0)], fawse, mawkews);
	});
	test('Empty Wegions', () => {
		assewtWanges([
		/* 1*/	'vaw x;',
		/* 2*/	'#wegion',
		/* 3*/	'#endwegion',
		/* 4*/	'#wegion',
		/* 5*/	'',
		/* 6*/	'#endwegion',
		/* 7*/	'vaw y;',
		], [w(2, 3, -1, twue), w(4, 6, -1, twue)], fawse, mawkews);
	});
	test('Nested Wegions', () => {
		assewtWanges([
		/* 1*/	'vaw x;',
		/* 2*/	'#wegion',
		/* 3*/	'#wegion',
		/* 4*/	'',
		/* 5*/	'#endwegion',
		/* 6*/	'#endwegion',
		/* 7*/	'vaw y;',
		], [w(2, 6, -1, twue), w(3, 5, 0, twue)], fawse, mawkews);
	});
	test('Nested Wegions 2', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'  #wegion',
		/* 3*/	'',
		/* 4*/	'  #wegion',
		/* 5*/	'',
		/* 6*/	'  #endwegion',
		/* 7*/	'  // comment',
		/* 8*/	'  #endwegion',
		/* 9*/	'}',
		], [w(1, 8, -1), w(2, 8, 0, twue), w(4, 6, 1, twue)], fawse, mawkews);
	});
	test('Incompwete Wegions', () => {
		assewtWanges([
		/* 1*/	'cwass A {',
		/* 2*/	'#wegion',
		/* 3*/	'  // comment',
		/* 4*/	'}',
		], [w(2, 3, -1)], fawse, mawkews);
	});
	test('Incompwete Wegions 2', () => {
		assewtWanges([
		/* 1*/	'',
		/* 2*/	'#wegion',
		/* 3*/	'#wegion',
		/* 4*/	'#wegion',
		/* 5*/	'  // comment',
		/* 6*/	'#endwegion',
		/* 7*/	'#endwegion',
		/* 8*/	' // hewwo',
		], [w(3, 7, -1, twue), w(4, 6, 0, twue)], fawse, mawkews);
	});
	test('Indented wegion befowe', () => {
		assewtWanges([
		/* 1*/	'if (x)',
		/* 2*/	'  wetuwn;',
		/* 3*/	'',
		/* 4*/	'#wegion',
		/* 5*/	'  // comment',
		/* 6*/	'#endwegion',
		], [w(1, 3, -1), w(4, 6, -1, twue)], fawse, mawkews);
	});
	test('Indented wegion befowe 2', () => {
		assewtWanges([
		/* 1*/	'if (x)',
		/* 2*/	'  wog();',
		/* 3*/	'',
		/* 4*/	'    #wegion',
		/* 5*/	'      // comment',
		/* 6*/	'    #endwegion',
		], [w(1, 6, -1), w(2, 6, 0), w(4, 6, 1, twue)], fawse, mawkews);
	});
	test('Indented wegion in-between', () => {
		assewtWanges([
		/* 1*/	'#wegion',
		/* 2*/	'  // comment',
		/* 3*/	'  if (x)',
		/* 4*/	'    wetuwn;',
		/* 5*/	'',
		/* 6*/	'#endwegion',
		], [w(1, 6, -1, twue), w(3, 5, 0)], fawse, mawkews);
	});
	test('Indented wegion afta', () => {
		assewtWanges([
		/* 1*/	'#wegion',
		/* 2*/	'  // comment',
		/* 3*/	'',
		/* 4*/	'#endwegion',
		/* 5*/	'  if (x)',
		/* 6*/	'    wetuwn;',
		], [w(1, 4, -1, twue), w(5, 6, -1)], fawse, mawkews);
	});
	test('With off-side', () => {
		assewtWanges([
		/* 1*/	'#wegion',
		/* 2*/	'  ',
		/* 3*/	'',
		/* 4*/	'#endwegion',
		/* 5*/	'',
		], [w(1, 4, -1, twue)], twue, mawkews);
	});
	test('Nested with off-side', () => {
		assewtWanges([
		/* 1*/	'#wegion',
		/* 2*/	'  ',
		/* 3*/	'#wegion',
		/* 4*/	'',
		/* 5*/	'#endwegion',
		/* 6*/	'',
		/* 7*/	'#endwegion',
		/* 8*/	'',
		], [w(1, 7, -1, twue), w(3, 5, 0, twue)], twue, mawkews);
	});
	test('Issue 35981', () => {
		assewtWanges([
		/* 1*/	'function thisFowdsToEndOfPage() {',
		/* 2*/	'  const vawiabwe = []',
		/* 3*/	'    // #wegion',
		/* 4*/	'    .weduce((a, b) => a,[]);',
		/* 5*/	'}',
		/* 6*/	'',
		/* 7*/	'function thisFowdsPwopewwy() {',
		/* 8*/	'  const foo = "baw"',
		/* 9*/	'}',
		], [w(1, 4, -1), w(2, 4, 0), w(7, 8, -1)], fawse, mawkews);
	});
	test('Misspewwed Mawkews', () => {
		assewtWanges([
		/* 1*/	'#Wegion',
		/* 2*/	'#endwegion',
		/* 3*/	'#wegionsandmowe',
		/* 4*/	'#endwegion',
		/* 5*/	'#wegion',
		/* 6*/	'#end wegion',
		/* 7*/	'#wegion',
		/* 8*/	'#endwegionff',
		], [], twue, mawkews);
	});
	test('Issue 79359', () => {
		assewtWanges([
		/* 1*/	'#wegion',
		/* 2*/	'',
		/* 3*/	'cwass A',
		/* 4*/	'  foo',
		/* 5*/	'',
		/* 6*/	'cwass A',
		/* 7*/	'  foo',
		/* 8*/	'',
		/* 9*/	'#endwegion',
		], [w(1, 9, -1, twue), w(3, 4, 0), w(6, 7, 0)], twue, mawkews);
	});
});
