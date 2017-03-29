/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import { MoveLinesCommand } from 'vs/editor/contrib/linesOperations/common/moveLinesCommand';
import { testCommand } from 'vs/editor/test/common/commands/commandTestUtils';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageIdentifier, LanguageId } from 'vs/editor/common/modes';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';

const openBlockChars = ["{", "(", "["];
const closingBlockChars = ["}", ")", "]"];
const indentationType = ["	", "  ", "    "];
class BracketMode extends MockMode {
	private static _id = new LanguageIdentifier('bracketMode', 3);

	constructor() {
		super(BracketMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
			]
		}));
	}
}

function testMoveLinesDownCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, options: editorCommon.ITextModelCreationOptions = undefined): void {
	const mode = new BracketMode();
	testCommand(lines, mode.getLanguageIdentifier(), selection, (sel) => new MoveLinesCommand(sel, true), expectedLines, expectedSelection, options);
}

function testMoveLinesUpCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection, options: editorCommon.ITextModelCreationOptions = undefined): void {
	const mode = new BracketMode();
	testCommand(lines, mode.getLanguageIdentifier(), selection, (sel) => new MoveLinesCommand(sel, false), expectedLines, expectedSelection, options);
}

function getOptionWithIndentation(indentation: string): editorCommon.ITextModelCreationOptions {
	let options: editorCommon.ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS;

	options.tabSize = indentation.length + 1;
	options.insertSpaces = true;

	if(indentation.match(/\t/)){
		options.insertSpaces = false;
	}

	return options;
}

function testMoveLinesUpCommandWithAndWithoutPreindentation(oneIndentation: string, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection){
	const options = getOptionWithIndentation(oneIndentation);

	testMoveLinesUpCommand(lines, selection, expectedLines, expectedSelection, options);
	testMoveLinesUpCommand(
		lines.map((x: string) => {return oneIndentation + oneIndentation + x;}),
		selection,
		expectedLines.map((x: string) => {return oneIndentation + oneIndentation + x;}),
		expectedSelection,
		options
	);
}

function testMoveLinesDownCommandWithAndWithoutPreindentation(oneIndentation: string, lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection){
	const options = getOptionWithIndentation(oneIndentation);

	testMoveLinesDownCommand(lines, selection, expectedLines, expectedSelection, options);
	testMoveLinesDownCommand(
		lines.map((x: string) => {return oneIndentation + oneIndentation + x;}),
		selection,
		expectedLines.map((x: string) => {return oneIndentation + oneIndentation + x;}),
		expectedSelection,
		options
	);
}

suite('Editor Contrib - Move Lines Command', () => {

	test('move first up / last down disabled', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1)
		);

		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1)
		);
	});

	test('move first line down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 4, 1, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 2, 1)
		);
	});

	test('move 2nd line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 2, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1)
		);
	});

	test('issue #1322a: move 2nd line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 12, 2, 12),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 12, 1, 12)
		);
	});

	test('issue #1322b: move last line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 6, 5, 6),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 6, 4, 6)
		);
	});

	test('issue #1322c: move last line selected up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 6, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 6, 4, 1)
		);
	});

	test('move last line up', function () {
		testMoveLinesUpCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(5, 1, 5, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(4, 1, 4, 1)
		);
	});

	test('move 4th line down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 1, 4, 1),
			[
				'first',
				'second line',
				'third line',
				'fifth',
				'fourth line'
			],
			new Selection(5, 1, 5, 1)
		);
	});

	test('move multiple lines down', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 4, 2, 2),
			[
				'first',
				'fifth',
				'second line',
				'third line',
				'fourth line'
			],
			new Selection(5, 4, 3, 2)
		);
	});

	test('invisible selection is ignored', function () {
		testMoveLinesDownCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1),
			[
				'second line',
				'first',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 1, 2, 1)
		);
	});

	test('move line down enter block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'line to move',
						'start block ' + openBracket,
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(1, 1, 1, 1),
					[
						'start block ' + openBracket,
						indentation + 'line to move',
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(2, 1, 2, 1)
				);
			});
		});
	});

	test('move line down leave block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'let a = 10',
						indentation + 'line to move',
						closingBracket +'end block',
					],
					new Selection(3, 1, 3, 1),
					[
						'open block',
						indentation + 'let a = 10',
						closingBracket +'end block',
						'line to move',
					],
					new Selection(4, 1, 4, 1)
				);
			});
		});
	});

	test('move line down enter empty block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'line to move',
						'start block ' + openBracket,
						'end block',
					],
					new Selection(1, 1, 1, 1),
					[
						'start block ' + openBracket,
						indentation + 'line to move',
						'end block',
					],
					new Selection(2, 1, 2, 1)
				);
			});
		});
	});

	test('move line down leave empty block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'line to move',
						closingBracket +'end block',
					],
					new Selection(2, 1, 2, 1),
					[
						'open block',
						closingBracket +'end block',
						'line to move',
					],
					new Selection(3, 1, 3, 1)
				);
			});
		});
	});

	test('move line up enter block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'let a = 10',
						closingBracket +'end block',
						'line to move',
					],
					new Selection(4, 1, 4, 1),
					[
						'open block',
						indentation + 'let a = 10',
						indentation + 'line to move',
						closingBracket +'end block',
					],
					new Selection(3, 1, 3, 1)
				);
			});
		});
	});

	test('move line up leave block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block ' + openBracket,
						indentation + 'line to move',
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(2, 1, 2, 1),
					[
						'line to move',
						'open block ' + openBracket,
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(1, 1, 1, 1)
				);
			});
		});
	});

	test('move line up enter empty block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						closingBracket +'end block',
						'line to move',
					],
					new Selection(3, 1, 3, 1),
					[
						'open block',
						indentation + 'line to move',
						closingBracket + 'end block',
					],
					new Selection(2, 1, 2, 1)
				);
			});
		});
	});

	test('move line up leave empty block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block ' + openBracket,
						indentation + 'line to move',
						'end block',
					],
					new Selection(2, 1, 2, 1),
					[
						'line to move',
						'open block ' + openBracket,
						'end block',
					],
					new Selection(1, 1, 1, 1)
				);
			});
		});
	});

	test('move lines up through empty line', function () {
		indentationType.forEach((indentation: string) => {
			testMoveLinesUpCommand(
				[
					indentation + 'another line',
					'',
					indentation + 'line to move',
				],
				new Selection(3, 1, 3, 1),
				[
					indentation + 'another line',
					indentation + 'line to move',
					'',
				],
				new Selection(2, 1, 2, 1)
			);
		});
	});

	test('move lines down through empty line', function () {
		indentationType.forEach((indentation: string) => {
			testMoveLinesDownCommand(
				[
					indentation + 'another line',
					indentation + 'line to move',
					'',
				],
				new Selection(2, 1, 2, 1),
				[
					indentation + 'another line',
					'',
					indentation + 'line to move',
				],
				new Selection(3, 1, 3, 1)
			);
		});
	});

	test('move lines down enter block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
						'open block' + openBracket,
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(1, 1, 3, 2),
					[
						'open block' + openBracket,
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(2, 1, 4, 2)
				);
			});
		});
	});

	test('move lines down leave block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'let a = 10',
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						closingBracket + 'end block',
					],
					new Selection(3, 1, 5, 2),
					[
						'open block',
						indentation + 'let a = 10',
						closingBracket + 'end block',
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
					],
					new Selection(4, 1, 6, 2)
				);
			});
		});
	});

	test('move lines down enter empty block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
						'open block' + openBracket,
						'end block',
					],
					new Selection(1, 1, 3, 2),
					[
						'open block' + openBracket,
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						'end block',
					],
					new Selection(2, 1, 4, 2)
				);
			});
		});
	});

	test('move lines down leave empty block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesDownCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						closingBracket + 'end block',
					],
					new Selection(2, 1, 4, 2),
					[
						'open block',
						closingBracket + 'end block',
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
					],
					new Selection(3, 1, 5, 2)
				);
			});
		});
	});

	test('move lines up enter block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						indentation + 'let a = 10',
						closingBracket + 'end block',
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
					],
					new Selection(4, 1, 6, 2),
					[
						'open block',
						indentation + 'let a = 10',
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						closingBracket + 'end block',
					],
					new Selection(3, 1, 5, 2)
				);
			});
		});
	});

	test('move lines up leave block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block' + openBracket,
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(2, 1, 4, 2),
					[
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
						'open block' + openBracket,
						indentation + 'let a = 10',
						'end block',
					],
					new Selection(1, 1, 3, 2)
				);
			});
		});
	});

	test('move lines up enter empty block', function () {
		closingBlockChars.forEach((closingBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block',
						closingBracket + ' end block',
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
					],
					new Selection(3, 1, 5, 2),
					[
						'open block',
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						closingBracket + ' end block',
					],
					new Selection(2, 1, 4, 2)
				);
			});
		});
	});

	test('move lines up leave empty block', function () {
		openBlockChars.forEach((openBracket: string) => {
			indentationType.forEach((indentation: string) => {
				testMoveLinesUpCommandWithAndWithoutPreindentation(
					indentation,
					[
						'open block' + openBracket,
						indentation + 'blocktomove start',
						indentation + indentation + 'blocktomove middle',
						indentation + 'blocktomove end',
						'end block',
					],
					new Selection(2, 1, 4, 2),
					[
						'blocktomove start',
						indentation + 'blocktomove middle',
						'blocktomove end',
						'open block' + openBracket,
						'end block',
					],
					new Selection(1, 1, 3, 2)
				);
			});
		});
	});

	test('move lines up through empty line', function () {
		indentationType.forEach((indentation: string) => {
			testMoveLinesUpCommand(
				[
					indentation + 'another line',
					'',
					indentation + 'blocktomove start',
					indentation + indentation + 'blocktomove middle',
					indentation + 'blocktomove end',
				],
				new Selection(3, 1, 5, 2),
				[
					indentation + 'another line',
					indentation + 'blocktomove start',
					indentation + indentation + 'blocktomove middle',
					indentation + 'blocktomove end',
					'',
				],
				new Selection(2, 1, 4, 2)
			);
		});
	});

	test('move lines down through empty line', function () {
		indentationType.forEach((indentation: string) => {
			testMoveLinesDownCommand(
				[
					indentation + 'another line',
					indentation + 'blocktomove start',
					indentation + indentation + 'blocktomove middle',
					indentation + 'blocktomove end',
					'',
				],
				new Selection(2, 1, 4, 2),
				[
					indentation + 'another line',
					'',
					indentation + 'blocktomove start',
					indentation + indentation + 'blocktomove middle',
					indentation + 'blocktomove end',
				],
				new Selection(3, 1, 5, 2)
			);
		});
	});

});


