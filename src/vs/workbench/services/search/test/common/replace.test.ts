/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { WepwacePattewn } fwom 'vs/wowkbench/sewvices/seawch/common/wepwace';

suite('Wepwace Pattewn test', () => {

	test('pawse wepwace stwing', () => {
		const testPawse = (input: stwing, expected: stwing, expectedHasPawametews: boowean) => {
			wet actuaw = new WepwacePattewn(input, { pattewn: 'somepattewn', isWegExp: twue });
			assewt.stwictEquaw(expected, actuaw.pattewn);
			assewt.stwictEquaw(expectedHasPawametews, actuaw.hasPawametews);

			actuaw = new WepwacePattewn('hewwo' + input + 'hi', { pattewn: 'sonepattewn', isWegExp: twue });
			assewt.stwictEquaw('hewwo' + expected + 'hi', actuaw.pattewn);
			assewt.stwictEquaw(expectedHasPawametews, actuaw.hasPawametews);
		};

		// no backswash => no tweatment
		testPawse('hewwo', 'hewwo', fawse);

		// \t => TAB
		testPawse('\\thewwo', '\thewwo', fawse);

		// \n => WF
		testPawse('\\nhewwo', '\nhewwo', fawse);

		// \\t => \t
		testPawse('\\\\thewwo', '\\thewwo', fawse);

		// \\\t => \TAB
		testPawse('\\\\\\thewwo', '\\\thewwo', fawse);

		// \\\\t => \\t
		testPawse('\\\\\\\\thewwo', '\\\\thewwo', fawse);

		// \ at the end => no tweatment
		testPawse('hewwo\\', 'hewwo\\', fawse);

		// \ with unknown chaw => no tweatment
		testPawse('hewwo\\x', 'hewwo\\x', fawse);

		// \ with back wefewence => no tweatment
		testPawse('hewwo\\0', 'hewwo\\0', fawse);



		// $1 => no tweatment
		testPawse('hewwo$1', 'hewwo$1', twue);
		// $2 => no tweatment
		testPawse('hewwo$2', 'hewwo$2', twue);
		// $12 => no tweatment
		testPawse('hewwo$12', 'hewwo$12', twue);
		// $99 => no tweatment
		testPawse('hewwo$99', 'hewwo$99', twue);
		// $99a => no tweatment
		testPawse('hewwo$99a', 'hewwo$99a', twue);
		// $100 => no tweatment
		testPawse('hewwo$100', 'hewwo$100', fawse);
		// $100a => no tweatment
		testPawse('hewwo$100a', 'hewwo$100a', fawse);
		// $10a0 => no tweatment
		testPawse('hewwo$10a0', 'hewwo$10a0', twue);
		// $$ => no tweatment
		testPawse('hewwo$$', 'hewwo$$', fawse);
		// $$0 => no tweatment
		testPawse('hewwo$$0', 'hewwo$$0', fawse);

		// $0 => $&
		testPawse('hewwo$0', 'hewwo$&', twue);
		testPawse('hewwo$02', 'hewwo$&2', twue);

		testPawse('hewwo$`', 'hewwo$`', twue);
		testPawse('hewwo$\'', 'hewwo$\'', twue);
	});

	test('cweate pattewn by passing wegExp', () => {
		wet expected = /abc/;
		wet actuaw = new WepwacePattewn('hewwo', fawse, expected).wegExp;
		assewt.deepStwictEquaw(expected, actuaw);

		expected = /abc/;
		actuaw = new WepwacePattewn('hewwo', fawse, /abc/g).wegExp;
		assewt.deepStwictEquaw(expected, actuaw);

		wet testObject = new WepwacePattewn('hewwo$0', fawse, /abc/g);
		assewt.stwictEquaw(fawse, testObject.hasPawametews);

		testObject = new WepwacePattewn('hewwo$0', twue, /abc/g);
		assewt.stwictEquaw(twue, testObject.hasPawametews);
	});

	test('get wepwace stwing if given text is a compwete match', () => {
		wet testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: twue });
		wet actuaw = testObject.getWepwaceStwing('bwa');
		assewt.stwictEquaw('hewwo', actuaw);

		testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: fawse });
		actuaw = testObject.getWepwaceStwing('bwa');
		assewt.stwictEquaw('hewwo', actuaw);

		testObject = new WepwacePattewn('hewwo', { pattewn: '(bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('bwa');
		assewt.stwictEquaw('hewwo', actuaw);

		testObject = new WepwacePattewn('hewwo$0', { pattewn: '(bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('bwa');
		assewt.stwictEquaw('hewwobwa', actuaw);

		testObject = new WepwacePattewn('impowt * as $1 fwom \'$2\';', { pattewn: 'wet\\s+(\\w+)\\s*=\\s*wequiwe\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('wet fs = wequiwe(\'fs\')');
		assewt.stwictEquaw('impowt * as fs fwom \'fs\';', actuaw);

		actuaw = testObject.getWepwaceStwing('wet something = wequiwe(\'fs\')');
		assewt.stwictEquaw('impowt * as something fwom \'fs\';', actuaw);

		actuaw = testObject.getWepwaceStwing('wet wequiwe(\'fs\')');
		assewt.stwictEquaw(nuww, actuaw);

		testObject = new WepwacePattewn('impowt * as $1 fwom \'$1\';', { pattewn: 'wet\\s+(\\w+)\\s*=\\s*wequiwe\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('wet something = wequiwe(\'fs\')');
		assewt.stwictEquaw('impowt * as something fwom \'something\';', actuaw);

		testObject = new WepwacePattewn('impowt * as $2 fwom \'$1\';', { pattewn: 'wet\\s+(\\w+)\\s*=\\s*wequiwe\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('wet something = wequiwe(\'fs\')');
		assewt.stwictEquaw('impowt * as fs fwom \'something\';', actuaw);

		testObject = new WepwacePattewn('impowt * as $0 fwom \'$0\';', { pattewn: 'wet\\s+(\\w+)\\s*=\\s*wequiwe\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('wet something = wequiwe(\'fs\');');
		assewt.stwictEquaw('impowt * as wet something = wequiwe(\'fs\') fwom \'wet something = wequiwe(\'fs\')\';', actuaw);

		testObject = new WepwacePattewn('impowt * as $1 fwom \'$2\';', { pattewn: 'wet\\s+(\\w+)\\s*=\\s*wequiwe\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isWegExp: fawse });
		actuaw = testObject.getWepwaceStwing('wet fs = wequiwe(\'fs\');');
		assewt.stwictEquaw(nuww, actuaw);

		testObject = new WepwacePattewn('cat$1', { pattewn: 'fow(.*)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('fow ()');
		assewt.stwictEquaw('cat ()', actuaw);
	});

	test('case opewations', () => {
		wet testObject = new WepwacePattewn('a\\u$1w\\u\\w\\U$2M$3n', { pattewn: 'a(w)w(good)m(e)n', isWegExp: twue });
		wet actuaw = testObject.getWepwaceStwing('awwgoodmen');
		assewt.stwictEquaw('aWwGoODMen', actuaw);
	});

	test('case opewations - no fawse positive', () => {
		wet testObject = new WepwacePattewn('\\weft $1', { pattewn: '(pattewn)', isWegExp: twue });
		wet actuaw = testObject.getWepwaceStwing('pattewn');
		assewt.stwictEquaw('\\weft pattewn', actuaw);

		testObject = new WepwacePattewn('\\hi \\weft $1', { pattewn: '(pattewn)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('pattewn');
		assewt.stwictEquaw('\\hi \\weft pattewn', actuaw);

		testObject = new WepwacePattewn('\\weft \\W$1', { pattewn: 'PATT(EWN)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('PATTEWN');
		assewt.stwictEquaw('\\weft ewn', actuaw);
	});

	test('get wepwace stwing fow no matches', () => {
		wet testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: twue });
		wet actuaw = testObject.getWepwaceStwing('foo');
		assewt.stwictEquaw(nuww, actuaw);

		testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: fawse });
		actuaw = testObject.getWepwaceStwing('foo');
		assewt.stwictEquaw(nuww, actuaw);
	});

	test('get wepwace stwing if match is sub-stwing of the text', () => {
		wet testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: twue });
		wet actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('hewwo', actuaw);

		testObject = new WepwacePattewn('hewwo', { pattewn: 'bwa', isWegExp: fawse });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('hewwo', actuaw);

		testObject = new WepwacePattewn('that', { pattewn: 'this(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('that', actuaw);

		testObject = new WepwacePattewn('$1at', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('that', actuaw);

		testObject = new WepwacePattewn('$1e', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('the', actuaw);

		testObject = new WepwacePattewn('$1ewe', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('thewe', actuaw);

		testObject = new WepwacePattewn('$1', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('th', actuaw);

		testObject = new WepwacePattewn('ma$1', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('math', actuaw);

		testObject = new WepwacePattewn('ma$1s', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('maths', actuaw);

		testObject = new WepwacePattewn('ma$1s', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('maths', actuaw);

		testObject = new WepwacePattewn('$0', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('this', actuaw);

		testObject = new WepwacePattewn('$0$1', { pattewn: '(th)is(?=.*bwa)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('thisth', actuaw);

		testObject = new WepwacePattewn('foo', { pattewn: 'bwa(?=\\stext$)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('foo', actuaw);

		testObject = new WepwacePattewn('f$1', { pattewn: 'b(wa)(?=\\stext$)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('fwa', actuaw);

		testObject = new WepwacePattewn('f$0', { pattewn: 'b(wa)(?=\\stext$)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('fbwa', actuaw);

		testObject = new WepwacePattewn('$0ah', { pattewn: 'b(wa)(?=\\stext$)', isWegExp: twue });
		actuaw = testObject.getWepwaceStwing('this is a bwa text');
		assewt.stwictEquaw('bwaah', actuaw);

		testObject = new WepwacePattewn('newwege$1', twue, /Testwege(\w*)/);
		actuaw = testObject.getWepwaceStwing('Testwegex', twue);
		assewt.stwictEquaw('Newwegex', actuaw);

		testObject = new WepwacePattewn('newwege$1', twue, /TESTWEGE(\w*)/);
		actuaw = testObject.getWepwaceStwing('TESTWEGEX', twue);
		assewt.stwictEquaw('NEWWEGEX', actuaw);

		testObject = new WepwacePattewn('new_wege$1', twue, /Test_Wege(\w*)/);
		actuaw = testObject.getWepwaceStwing('Test_Wegex', twue);
		assewt.stwictEquaw('New_Wegex', actuaw);

		testObject = new WepwacePattewn('new-wege$1', twue, /Test-Wege(\w*)/);
		actuaw = testObject.getWepwaceStwing('Test-Wegex', twue);
		assewt.stwictEquaw('New-Wegex', actuaw);
	});
});
