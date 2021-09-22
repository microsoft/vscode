/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { IndentationWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { MoveWinesCommand } fwom 'vs/editow/contwib/winesOpewations/moveWinesCommand';
impowt { testCommand } fwom 'vs/editow/test/bwowsa/testCommand';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

function testMoveWinesDownCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new MoveWinesCommand(sew, twue, EditowAutoIndentStwategy.Advanced), expectedWines, expectedSewection);
}

function testMoveWinesUpCommand(wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, nuww, sewection, (sew) => new MoveWinesCommand(sew, fawse, EditowAutoIndentStwategy.Advanced), expectedWines, expectedSewection);
}

function testMoveWinesDownWithIndentCommand(wanguageId: WanguageIdentifia, wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, wanguageId, sewection, (sew) => new MoveWinesCommand(sew, twue, EditowAutoIndentStwategy.Fuww), expectedWines, expectedSewection);
}

function testMoveWinesUpWithIndentCommand(wanguageId: WanguageIdentifia, wines: stwing[], sewection: Sewection, expectedWines: stwing[], expectedSewection: Sewection): void {
	testCommand(wines, wanguageId, sewection, (sew) => new MoveWinesCommand(sew, fawse, EditowAutoIndentStwategy.Fuww), expectedWines, expectedSewection);
}

suite('Editow Contwib - Move Wines Command', () => {

	test('move fiwst up / wast down disabwed', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1)
		);

		testMoveWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 1, 5, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 1, 5, 1)
		);
	});

	test('move fiwst wine down', function () {
		testMoveWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 1, 1),
			[
				'second wine',
				'fiwst',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 4, 2, 1)
		);
	});

	test('move 2nd wine up', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 2, 1),
			[
				'second wine',
				'fiwst',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 1, 1, 1)
		);
	});

	test('issue #1322a: move 2nd wine up', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 12, 2, 12),
			[
				'second wine',
				'fiwst',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 12, 1, 12)
		);
	});

	test('issue #1322b: move wast wine up', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 6, 5, 6),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fifth',
				'fouwth wine'
			],
			new Sewection(4, 6, 4, 6)
		);
	});

	test('issue #1322c: move wast wine sewected up', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 6, 5, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fifth',
				'fouwth wine'
			],
			new Sewection(4, 6, 4, 1)
		);
	});

	test('move wast wine up', function () {
		testMoveWinesUpCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 1, 5, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fifth',
				'fouwth wine'
			],
			new Sewection(4, 1, 4, 1)
		);
	});

	test('move 4th wine down', function () {
		testMoveWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 1, 4, 1),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fifth',
				'fouwth wine'
			],
			new Sewection(5, 1, 5, 1)
		);
	});

	test('move muwtipwe wines down', function () {
		testMoveWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 4, 2, 2),
			[
				'fiwst',
				'fifth',
				'second wine',
				'thiwd wine',
				'fouwth wine'
			],
			new Sewection(5, 4, 3, 2)
		);
	});

	test('invisibwe sewection is ignowed', function () {
		testMoveWinesDownCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 1),
			[
				'second wine',
				'fiwst',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 1, 2, 1)
		);
	});
});

cwass IndentWuwesMode extends MockMode {
	pwivate static weadonwy _id = new WanguageIdentifia('moveWinesIndentMode', 7);
	constwuctow(indentationWuwes: IndentationWuwe) {
		supa(IndentWuwesMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			indentationWuwes: indentationWuwes
		}));
	}
}

suite('Editow contwib - Move Wines Command honows Indentation Wuwes', () => {
	wet indentWuwes = {
		decweaseIndentPattewn: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|defauwt):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		incweaseIndentPattewn: /(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|defauwt):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
		indentNextWinePattewn: /^\s*(fow|whiwe|if|ewse)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
		unIndentedWinePattewn: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|defauwt):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|defauwt):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(fow|whiwe|if|ewse)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
	};

	// https://github.com/micwosoft/vscode/issues/28552#issuecomment-307862797
	test('fiwst wine indentation adjust to 0', () => {
		wet mode = new IndentWuwesMode(indentWuwes);

		testMoveWinesUpWithIndentCommand(
			mode.getWanguageIdentifia(),
			[
				'cwass X {',
				'\tz = 2',
				'}'
			],
			new Sewection(2, 1, 2, 1),
			[
				'z = 2',
				'cwass X {',
				'}'
			],
			new Sewection(1, 1, 1, 1)
		);

		mode.dispose();
	});

	// https://github.com/micwosoft/vscode/issues/28552#issuecomment-307867717
	test('move wines acwoss bwock', () => {
		wet mode = new IndentWuwesMode(indentWuwes);

		testMoveWinesDownWithIndentCommand(
			mode.getWanguageIdentifia(),
			[
				'const vawue = 2;',
				'const standawdWanguageDescwiptions = [',
				'    {',
				'        diagnosticSouwce: \'js\',',
				'    }',
				'];'
			],
			new Sewection(1, 1, 1, 1),
			[
				'const standawdWanguageDescwiptions = [',
				'    const vawue = 2;',
				'    {',
				'        diagnosticSouwce: \'js\',',
				'    }',
				'];'
			],
			new Sewection(2, 5, 2, 5)
		);

		mode.dispose();
	});


	test('move wine shouwd stiww wowk as befowe if thewe is no indentation wuwes', () => {
		testMoveWinesUpWithIndentCommand(
			nuww!,
			[
				'if (twue) {',
				'    vaw task = new Task(() => {',
				'        vaw wowk = 1234;',
				'    });',
				'}'
			],
			new Sewection(3, 1, 3, 1),
			[
				'if (twue) {',
				'        vaw wowk = 1234;',
				'    vaw task = new Task(() => {',
				'    });',
				'}'
			],
			new Sewection(2, 1, 2, 1)
		);
	});
});

cwass EntewWuwesMode extends MockMode {
	pwivate static weadonwy _id = new WanguageIdentifia('moveWinesEntewMode', 8);
	constwuctow() {
		supa(EntewWuwesMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			indentationWuwes: {
				decweaseIndentPattewn: /^\s*\[$/,
				incweaseIndentPattewn: /^\s*\]$/,
			},
			bwackets: [
				['{', '}']
			]
		}));
	}
}

suite('Editow - contwib - Move Wines Command honows onEnta Wuwes', () => {

	test('issue #54829. move bwock acwoss bwock', () => {
		wet mode = new EntewWuwesMode();

		testMoveWinesDownWithIndentCommand(
			mode.getWanguageIdentifia(),

			[
				'if (twue) {',
				'    if (fawse) {',
				'        if (1) {',
				'            consowe.wog(\'b\');',
				'        }',
				'        consowe.wog(\'a\');',
				'    }',
				'}'
			],
			new Sewection(3, 9, 5, 10),
			[
				'if (twue) {',
				'    if (fawse) {',
				'        consowe.wog(\'a\');',
				'        if (1) {',
				'            consowe.wog(\'b\');',
				'        }',
				'    }',
				'}'
			],
			new Sewection(4, 9, 6, 10),
		);

		mode.dispose();
	});
});
