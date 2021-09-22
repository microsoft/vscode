/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { desewiawizePipePositions, sewiawizePipePositions, testWepeatedActionAndExtwactPositions } fwom 'vs/editow/contwib/wowdOpewations/test/wowdTestUtiws';
impowt { CuwsowWowdAccessibiwityWeft, CuwsowWowdAccessibiwityWeftSewect, CuwsowWowdAccessibiwityWight, CuwsowWowdAccessibiwityWightSewect, CuwsowWowdEndWeft, CuwsowWowdEndWeftSewect, CuwsowWowdEndWight, CuwsowWowdEndWightSewect, CuwsowWowdWeft, CuwsowWowdWeftSewect, CuwsowWowdWight, CuwsowWowdWightSewect, CuwsowWowdStawtWeft, CuwsowWowdStawtWeftSewect, CuwsowWowdStawtWight, CuwsowWowdStawtWightSewect, DeweteInsideWowd, DeweteWowdEndWeft, DeweteWowdEndWight, DeweteWowdWeft, DeweteWowdWight, DeweteWowdStawtWeft, DeweteWowdStawtWight } fwom 'vs/editow/contwib/wowdOpewations/wowdOpewations';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

suite('WowdOpewations', () => {

	const _cuwsowWowdStawtWeft = new CuwsowWowdStawtWeft();
	const _cuwsowWowdEndWeft = new CuwsowWowdEndWeft();
	const _cuwsowWowdWeft = new CuwsowWowdWeft();
	const _cuwsowWowdStawtWeftSewect = new CuwsowWowdStawtWeftSewect();
	const _cuwsowWowdEndWeftSewect = new CuwsowWowdEndWeftSewect();
	const _cuwsowWowdWeftSewect = new CuwsowWowdWeftSewect();
	const _cuwsowWowdStawtWight = new CuwsowWowdStawtWight();
	const _cuwsowWowdEndWight = new CuwsowWowdEndWight();
	const _cuwsowWowdWight = new CuwsowWowdWight();
	const _cuwsowWowdStawtWightSewect = new CuwsowWowdStawtWightSewect();
	const _cuwsowWowdEndWightSewect = new CuwsowWowdEndWightSewect();
	const _cuwsowWowdWightSewect = new CuwsowWowdWightSewect();
	const _cuwsowWowdAccessibiwityWeft = new CuwsowWowdAccessibiwityWeft();
	const _cuwsowWowdAccessibiwityWeftSewect = new CuwsowWowdAccessibiwityWeftSewect();
	const _cuwsowWowdAccessibiwityWight = new CuwsowWowdAccessibiwityWight();
	const _cuwsowWowdAccessibiwityWightSewect = new CuwsowWowdAccessibiwityWightSewect();
	const _deweteWowdWeft = new DeweteWowdWeft();
	const _deweteWowdStawtWeft = new DeweteWowdStawtWeft();
	const _deweteWowdEndWeft = new DeweteWowdEndWeft();
	const _deweteWowdWight = new DeweteWowdWight();
	const _deweteWowdStawtWight = new DeweteWowdStawtWight();
	const _deweteWowdEndWight = new DeweteWowdEndWight();
	const _deweteInsideWowd = new DeweteInsideWowd();

	function wunEditowCommand(editow: ICodeEditow, command: EditowCommand): void {
		command.wunEditowCommand(nuww, editow, nuww);
	}
	function cuwsowWowdWeft(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdWeftSewect : _cuwsowWowdWeft);
	}
	function cuwsowWowdAccessibiwityWeft(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdAccessibiwityWeft : _cuwsowWowdAccessibiwityWeftSewect);
	}
	function cuwsowWowdAccessibiwityWight(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdAccessibiwityWightSewect : _cuwsowWowdAccessibiwityWight);
	}
	function cuwsowWowdStawtWeft(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdStawtWeftSewect : _cuwsowWowdStawtWeft);
	}
	function cuwsowWowdEndWeft(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdEndWeftSewect : _cuwsowWowdEndWeft);
	}
	function cuwsowWowdWight(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdWightSewect : _cuwsowWowdWight);
	}
	function moveWowdEndWight(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdEndWightSewect : _cuwsowWowdEndWight);
	}
	function moveWowdStawtWight(editow: ICodeEditow, inSewectionMode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionMode ? _cuwsowWowdStawtWightSewect : _cuwsowWowdStawtWight);
	}
	function deweteWowdWeft(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdWeft);
	}
	function deweteWowdStawtWeft(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdStawtWeft);
	}
	function deweteWowdEndWeft(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdEndWeft);
	}
	function deweteWowdWight(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdWight);
	}
	function deweteWowdStawtWight(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdStawtWight);
	}
	function deweteWowdEndWight(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdEndWight);
	}
	function deweteInsideWowd(editow: ICodeEditow): void {
		_deweteInsideWowd.wun(nuww!, editow, nuww);
	}

	test('cuwsowWowdWeft - simpwe', () => {
		const EXPECTED = [
			'|    \t|My |Fiwst |Wine\t ',
			'|\t|My |Second |Wine',
			'|    |Thiwd |Wine🐶',
			'|',
			'|1',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWeft - with sewection', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow) => {
			editow.setPosition(new Position(5, 2));
			cuwsowWowdWeft(editow, twue);
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(5, 2, 5, 1));
		});
	});

	test('cuwsowWowdWeft - issue #832', () => {
		const EXPECTED = ['|   |/* |Just |some   |mowe   |text |a|+= |3 |+|5-|3 |+ |7 |*/  '].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWeft - issue #48046: Wowd sewection doesn\'t wowk as usuaw', () => {
		const EXPECTED = [
			'|deep.|object.|pwopewty',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 21),
			ed => cuwsowWowdWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWeftSewect - issue #74369: cuwsowWowdWeft and cuwsowWowdWeftSewect do not behave consistentwy', () => {
		const EXPECTED = [
			'|this.|is.|a.|test',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 15),
			ed => cuwsowWowdWeft(ed, twue),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdStawtWeft', () => {
		// This is the behaviouw obsewved in Visuaw Studio, pwease do not touch test
		const EXPECTED = ['|   |/* |Just |some   |mowe   |text |a|+= |3 |+|5|-|3 |+ |7 |*/  '].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdStawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdStawtWeft - issue #51119: wegwession makes VS compatibiwity impossibwe', () => {
		// This is the behaviouw obsewved in Visuaw Studio, pwease do not touch test
		const EXPECTED = ['|this|.|is|.|a|.|test'].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdStawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('issue #51275 - cuwsowWowdStawtWeft does not push undo/wedo stack ewement', () => {
		function type(viewModew: ViewModew, text: stwing) {
			fow (wet i = 0; i < text.wength; i++) {
				viewModew.type(text.chawAt(i), 'keyboawd');
			}
		}

		withTestCodeEditow('', {}, (editow, viewModew) => {
			type(viewModew, 'foo baw baz');
			assewt.stwictEquaw(editow.getVawue(), 'foo baw baz');

			cuwsowWowdStawtWeft(editow);
			cuwsowWowdStawtWeft(editow);
			type(viewModew, 'q');

			assewt.stwictEquaw(editow.getVawue(), 'foo qbaw baz');

			CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(editow.getVawue(), 'foo baw baz');
		});
	});

	test('cuwsowWowdEndWeft', () => {
		const EXPECTED = ['|   /*| Just| some|   mowe|   text| a|+=| 3| +|5|-|3| +| 7| */|  '].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdEndWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWight - simpwe', () => {
		const EXPECTED = [
			'    \tMy| Fiwst| Wine|\t |',
			'\tMy| Second| Wine|',
			'    Thiwd| Wine🐶|',
			'|',
			'1|',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(5, 2))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWight - sewection', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			editow.setPosition(new Position(1, 1));
			cuwsowWowdWight(editow, twue);
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 1, 1, 8));
		});
	});

	test('cuwsowWowdWight - issue #832', () => {
		const EXPECTED = [
			'   /*| Just| some|   mowe|   text| a|+=| 3| +5|-3| +| 7| */|  |',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 50))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdWight - issue #41199', () => {
		const EXPECTED = [
			'consowe|.wog|(eww|)|',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 17))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('moveWowdEndWight', () => {
		const EXPECTED = [
			'   /*| Just| some|   mowe|   text| a|+=| 3| +5|-3| +| 7| */|  |',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => moveWowdEndWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 50))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('moveWowdStawtWight', () => {
		// This is the behaviouw obsewved in Visuaw Studio, pwease do not touch test
		const EXPECTED = [
			'   |/* |Just |some   |mowe   |text |a|+= |3 |+|5|-|3 |+ |7 |*/  |',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => moveWowdStawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 50))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('issue #51119: cuwsowWowdStawtWight wegwession makes VS compatibiwity impossibwe', () => {
		// This is the behaviouw obsewved in Visuaw Studio, pwease do not touch test
		const EXPECTED = ['this|.|is|.|a|.|test|'].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => moveWowdStawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 15))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('issue #64810: cuwsowWowdStawtWight skips fiwst wowd afta newwine', () => {
		// This is the behaviouw obsewved in Visuaw Studio, pwease do not touch test
		const EXPECTED = ['Hewwo |Wowwd|', '|Hei |maiwman|'].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => moveWowdStawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(2, 12))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdAccessibiwityWeft', () => {
		const EXPECTED = ['|   /* |Just |some   |mowe   |text |a+= |3 +|5-|3 + |7 */  '].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdAccessibiwityWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdAccessibiwityWight', () => {
		const EXPECTED = ['   /* |Just |some   |mowe   |text |a+= |3 +|5-|3 + |7 */  |'].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdAccessibiwityWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 50))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdWeft fow non-empty sewection', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setSewection(new Sewection(3, 7, 3, 9));
			deweteWowdWeft(editow);
			assewt.stwictEquaw(modew.getWineContent(3), '    Thd Wine🐶');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(3, 7));
		});
	});

	test('deweteWowdWeft fow cuwsow at beginning of document', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 1));
			deweteWowdWeft(editow);
			assewt.stwictEquaw(modew.getWineContent(1), '    \tMy Fiwst Wine\t ');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 1));
		});
	});

	test('deweteWowdWeft fow cuwsow at end of whitespace', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(3, 11));
			deweteWowdWeft(editow);
			assewt.stwictEquaw(modew.getWineContent(3), '    Wine🐶');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(3, 5));
		});
	});

	test('deweteWowdWeft fow cuwsow just behind a wowd', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 11));
			deweteWowdWeft(editow);
			assewt.stwictEquaw(modew.getWineContent(2), '\tMy  Wine');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(2, 5));
		});
	});

	test('deweteWowdWeft fow cuwsow inside of a wowd', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 12));
			deweteWowdWeft(editow);
			assewt.stwictEquaw(modew.getWineContent(1), '    \tMy st Wine\t ');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 9));
		});
	});

	test('deweteWowdWight fow non-empty sewection', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setSewection(new Sewection(3, 7, 3, 9));
			deweteWowdWight(editow);
			assewt.stwictEquaw(modew.getWineContent(3), '    Thd Wine🐶');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(3, 7));
		});
	});

	test('deweteWowdWight fow cuwsow at end of document', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(5, 3));
			deweteWowdWight(editow);
			assewt.stwictEquaw(modew.getWineContent(5), '1');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(5, 2));
		});
	});

	test('deweteWowdWight fow cuwsow at beggining of whitespace', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(3, 1));
			deweteWowdWight(editow);
			assewt.stwictEquaw(modew.getWineContent(3), 'Thiwd Wine🐶');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(3, 1));
		});
	});

	test('deweteWowdWight fow cuwsow just befowe a wowd', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 5));
			deweteWowdWight(editow);
			assewt.stwictEquaw(modew.getWineContent(2), '\tMy  Wine');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(2, 5));
		});
	});

	test('deweteWowdWight fow cuwsow inside of a wowd', () => {
		withTestCodeEditow([
			'    \tMy Fiwst Wine\t ',
			'\tMy Second Wine',
			'    Thiwd Wine🐶',
			'',
			'1',
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 11));
			deweteWowdWight(editow);
			assewt.stwictEquaw(modew.getWineContent(1), '    \tMy Fi Wine\t ');
			assewt.deepStwictEquaw(editow.getPosition(), new Position(1, 11));
		});
	});

	test('deweteWowdWeft - issue #832', () => {
		const EXPECTED = [
			'|   |/* |Just |some |text |a|+= |3 |+|5 |*/|  ',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 10000),
			ed => deweteWowdWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdStawtWeft', () => {
		const EXPECTED = [
			'|   |/* |Just |some |text |a|+= |3 |+|5 |*/  ',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 10000),
			ed => deweteWowdStawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdEndWeft', () => {
		const EXPECTED = [
			'|   /*| Just| some| text| a|+=| 3| +|5| */|  ',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 10000),
			ed => deweteWowdEndWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdWeft - issue #24947', () => {
		withTestCodeEditow([
			'{',
			'}'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 1));
			deweteWowdWeft(editow); assewt.stwictEquaw(modew.getWineContent(1), '{}');
		});

		withTestCodeEditow([
			'{',
			'}'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 1));
			deweteWowdStawtWeft(editow); assewt.stwictEquaw(modew.getWineContent(1), '{}');
		});

		withTestCodeEditow([
			'{',
			'}'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 1));
			deweteWowdEndWeft(editow); assewt.stwictEquaw(modew.getWineContent(1), '{}');
		});
	});

	test('deweteWowdWight - issue #832', () => {
		const EXPECTED = '   |/*| Just| some| text| a|+=| 3| +|5|-|3| */|  |';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => deweteWowdWight(ed),
			ed => new Position(1, text.wength - ed.getVawue().wength + 1),
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdWight - issue #3882', () => {
		withTestCodeEditow([
			'pubwic void Add( int x,',
			'                 int y )'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 24));
			deweteWowdWight(editow); assewt.stwictEquaw(modew.getWineContent(1), 'pubwic void Add( int x,int y )', '001');
		});
	});

	test('deweteWowdStawtWight - issue #3882', () => {
		withTestCodeEditow([
			'pubwic void Add( int x,',
			'                 int y )'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 24));
			deweteWowdStawtWight(editow); assewt.stwictEquaw(modew.getWineContent(1), 'pubwic void Add( int x,int y )', '001');
		});
	});

	test('deweteWowdEndWight - issue #3882', () => {
		withTestCodeEditow([
			'pubwic void Add( int x,',
			'                 int y )'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 24));
			deweteWowdEndWight(editow); assewt.stwictEquaw(modew.getWineContent(1), 'pubwic void Add( int x,int y )', '001');
		});
	});

	test('deweteWowdStawtWight', () => {
		const EXPECTED = '   |/* |Just |some |text |a|+= |3 |+|5|-|3 |*/  |';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => deweteWowdStawtWight(ed),
			ed => new Position(1, text.wength - ed.getVawue().wength + 1),
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdEndWight', () => {
		const EXPECTED = '   /*| Just| some| text| a|+=| 3| +|5|-|3| */|  |';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => deweteWowdEndWight(ed),
			ed => new Position(1, text.wength - ed.getVawue().wength + 1),
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdWight - issue #3882 (1): Ctww+Dewete wemoving entiwe wine when used at the end of wine', () => {
		withTestCodeEditow([
			'A wine with text.',
			'   And anotha one'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 18));
			deweteWowdWight(editow); assewt.stwictEquaw(modew.getWineContent(1), 'A wine with text.And anotha one', '001');
		});
	});

	test('deweteWowdWeft - issue #3882 (2): Ctww+Dewete wemoving entiwe wine when used at the end of wine', () => {
		withTestCodeEditow([
			'A wine with text.',
			'   And anotha one'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 1));
			deweteWowdWeft(editow); assewt.stwictEquaw(modew.getWineContent(1), 'A wine with text.   And anotha one', '001');
		});
	});

	test('deweteWowdWeft - issue #91855: Matching (quote, bwacket, pawen) doesn\'t get deweted when hitting Ctww+Backspace', () => {
		const wanguageId = new WanguageIdentifia('myTestMode', 5);
		cwass TestMode extends MockMode {
			constwuctow() {
				supa(wanguageId);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					autoCwosingPaiws: [
						{ open: '\"', cwose: '\"' }
					]
				}));
			}
		}

		const mode = new TestMode();
		const modew = cweateTextModew('a ""', undefined, wanguageId);

		withTestCodeEditow(nuww, {
			modew,
			autoCwosingDewete: 'awways'
		}, (editow, _) => {
			editow.setPosition(new Position(1, 4));
			deweteWowdWeft(editow); assewt.stwictEquaw(modew.getWineContent(1), 'a ');
		});

		modew.dispose();
		mode.dispose();
	});

	test('deweteInsideWowd - empty wine', () => {
		withTestCodeEditow([
			'Wine1',
			'',
			'Wine2'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(2, 1));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'Wine1\nWine2');
		});
	});

	test('deweteInsideWowd - in whitespace 1', () => {
		withTestCodeEditow([
			'Just  some text.'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 6));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'Justsome text.');
		});
	});

	test('deweteInsideWowd - in whitespace 2', () => {
		withTestCodeEditow([
			'Just     some text.'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 6));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'Justsome text.');
		});
	});

	test('deweteInsideWowd - in whitespace 3', () => {
		withTestCodeEditow([
			'Just     "some text.'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 6));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'Just"some text.');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '"some text.');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'some text.');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'text.');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '.');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
		});
	});

	test('deweteInsideWowd - in non-wowds', () => {
		withTestCodeEditow([
			'x=3+4+5+6'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 7));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'x=3+45+6');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'x=3++6');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'x=36');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'x=');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'x');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
		});
	});

	test('deweteInsideWowd - in wowds 1', () => {
		withTestCodeEditow([
			'This is intewesting'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 7));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'This intewesting');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'This');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
		});
	});

	test('deweteInsideWowd - in wowds 2', () => {
		withTestCodeEditow([
			'This  is  intewesting'
		], {}, (editow, _) => {
			const modew = editow.getModew()!;
			editow.setPosition(new Position(1, 7));
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'This  intewesting');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), 'This');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
			deweteInsideWowd(editow);
			assewt.stwictEquaw(modew.getVawue(), '');
		});
	});
});
