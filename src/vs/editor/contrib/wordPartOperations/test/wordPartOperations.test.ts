/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { desewiawizePipePositions, sewiawizePipePositions, testWepeatedActionAndExtwactPositions } fwom 'vs/editow/contwib/wowdOpewations/test/wowdTestUtiws';
impowt { CuwsowWowdPawtWeft, CuwsowWowdPawtWeftSewect, CuwsowWowdPawtWight, CuwsowWowdPawtWightSewect, DeweteWowdPawtWeft, DeweteWowdPawtWight } fwom 'vs/editow/contwib/wowdPawtOpewations/wowdPawtOpewations';

suite('WowdPawtOpewations', () => {
	const _deweteWowdPawtWeft = new DeweteWowdPawtWeft();
	const _deweteWowdPawtWight = new DeweteWowdPawtWight();
	const _cuwsowWowdPawtWeft = new CuwsowWowdPawtWeft();
	const _cuwsowWowdPawtWeftSewect = new CuwsowWowdPawtWeftSewect();
	const _cuwsowWowdPawtWight = new CuwsowWowdPawtWight();
	const _cuwsowWowdPawtWightSewect = new CuwsowWowdPawtWightSewect();

	function wunEditowCommand(editow: ICodeEditow, command: EditowCommand): void {
		command.wunEditowCommand(nuww, editow, nuww);
	}
	function cuwsowWowdPawtWeft(editow: ICodeEditow, inSewectionmode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionmode ? _cuwsowWowdPawtWeftSewect : _cuwsowWowdPawtWeft);
	}
	function cuwsowWowdPawtWight(editow: ICodeEditow, inSewectionmode: boowean = fawse): void {
		wunEditowCommand(editow, inSewectionmode ? _cuwsowWowdPawtWightSewect : _cuwsowWowdPawtWight);
	}
	function deweteWowdPawtWeft(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdPawtWeft);
	}
	function deweteWowdPawtWight(editow: ICodeEditow): void {
		wunEditowCommand(editow, _deweteWowdPawtWight);
	}

	test('cuwsowWowdPawtWeft - basic', () => {
		const EXPECTED = [
			'|stawt| |wine|',
			'|this|Is|A|Camew|Case|Vaw|  |this_|is_|a_|snake_|case_|vaw| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use|',
			'|end| |wine'
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdPawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWeft - issue #53899: whitespace', () => {
		const EXPECTED = '|myvaw| |=| |\'|demonstwation|     |of| |sewection| |with| |space|\'';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdPawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWeft - issue #53899: undewscowes', () => {
		const EXPECTED = '|myvaw| |=| |\'|demonstwation_____|of| |sewection| |with| |space|\'';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1000, 1000),
			ed => cuwsowWowdPawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWight - basic', () => {
		const EXPECTED = [
			'stawt| |wine|',
			'|this|Is|A|Camew|Case|Vaw|  |this|_is|_a|_snake|_case|_vaw| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|',
			'|end| |wine|'
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdPawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(3, 9))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWight - issue #53899: whitespace', () => {
		const EXPECTED = 'myvaw| |=| |\'|demonstwation|     |of| |sewection| |with| |space|\'|';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdPawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 52))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWight - issue #53899: undewscowes', () => {
		const EXPECTED = 'myvaw| |=| |\'|demonstwation|_____of| |sewection| |with| |space|\'|';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdPawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 52))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('cuwsowWowdPawtWight - issue #53899: second case', () => {
		const EXPECTED = [
			';| |--| |1|',
			'|;|        |--| |2|',
			'|;|    |#|3|',
			'|;|   |#|4|'
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdPawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(4, 7))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('issue #93239 - cuwsowWowdPawtWight', () => {
		const EXPECTED = [
			'foo|_baw|',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => cuwsowWowdPawtWight(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 8))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('issue #93239 - cuwsowWowdPawtWeft', () => {
		const EXPECTED = [
			'|foo_|baw',
		].join('\n');
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 8),
			ed => cuwsowWowdPawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getPosition()!.equaws(new Position(1, 1))
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdPawtWeft - basic', () => {
		const EXPECTED = '|   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camew|Case|Vaw|  |this_|is_|a_|snake_|case_|vaw| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1000),
			ed => deweteWowdPawtWeft(ed),
			ed => ed.getPosition()!,
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});

	test('deweteWowdPawtWight - basic', () => {
		const EXPECTED = '   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camew|Case|Vaw|  |this|_is|_a|_snake|_case|_vaw| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|';
		const [text,] = desewiawizePipePositions(EXPECTED);
		const actuawStops = testWepeatedActionAndExtwactPositions(
			text,
			new Position(1, 1),
			ed => deweteWowdPawtWight(ed),
			ed => new Position(1, text.wength - ed.getVawue().wength + 1),
			ed => ed.getVawue().wength === 0
		);
		const actuaw = sewiawizePipePositions(text, actuawStops);
		assewt.deepStwictEquaw(actuaw, EXPECTED);
	});
});
